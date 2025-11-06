# app/services/labels_service.py
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Mapping, Tuple

# --- Public API ---

def build_labels(rows: Iterable[Mapping[str, Any]], *, granularity: str) -> Dict[str, Dict[str, List[float]]]:
    """
    Build labels for each time-bin for ASR and ACD metrics (backend computes).

    Rules:
    - group by time bin (5m / 1h), using bucket center (floor(ts/step)*step + step/2)
    - collect supplier metric values per bin (use 'peer' as supplier key)
    - remove near-duplicates: abs(v1 - v2) <= 0.1 -> one label
    - round to 1 decimal
    - keep 0.0 if present for that bin
    """
    step_ms = _infer_step_ms(granularity)
    # collect raw values per (center_ts, supplier)
    by_ts_supplier_asr: Dict[tuple[int, str], List[float]] = {}
    by_ts_supplier_acd: Dict[tuple[int, str], List[float]] = {}

    for r in rows or []:
        ts_ms = _parse_row_time_ms(r.get("time"))
        if ts_ms is None:
            continue
        # align to bin center
        center = (ts_ms // step_ms) * step_ms + (step_ms // 2)
        # prefer 'peer' as supplier dimension (present in grouped rows)
        name = str(r.get("peer") or "").strip()
        if not name:
            # fallback: try alternative keys if 'peer' absent
            name = str(r.get("supplier") or r.get("Provider") or r.get("provider") or "").strip()
        if not name:
            continue
        asr = _to_num(r.get("ASR"))
        if asr is not None:
            by_ts_supplier_asr.setdefault((center, name), []).append(asr)
        acd = _to_num(r.get("ACD"))
        if acd is not None:
            by_ts_supplier_acd.setdefault((center, name), []).append(acd)

    # average per supplier within bin, then dedupe within bin
    acc_asr: Dict[int, List[float]] = {}
    acc_acd: Dict[int, List[float]] = {}
    for (ts, _name), vals in by_ts_supplier_asr.items():
        if vals:
            acc_asr.setdefault(ts, []).append(sum(vals) / len(vals))
    for (ts, _name), vals in by_ts_supplier_acd.items():
        if vals:
            acc_acd.setdefault(ts, []).append(sum(vals) / len(vals))

    out_asr = {str(k // 1000): _dedupe_and_round(vs) for k, vs in acc_asr.items()}
    out_acd = {str(k // 1000): _dedupe_and_round(vs) for k, vs in acc_acd.items()}

    return {"ASR": _sorted_keys(out_asr), "ACD": _sorted_keys(out_acd)}


# --- Helpers (private) ---

def _infer_step_ms(granularity: str) -> int:
    g = str(granularity or "").lower()
    if g == "5m":
        return 5 * 60_000
    if g == "1h":
        return 60 * 60_000
    # default to 1h
    return 60 * 60_000


def _parse_row_time_ms(raw: Any) -> int | None:
    if isinstance(raw, datetime):
        dt = raw
    elif isinstance(raw, str):
        s = raw.strip().replace("Z", "")
        try:
            dt = datetime.fromisoformat(s.replace(" ", "T"))
        except Exception:
            try:
                dt = datetime.fromisoformat(s)
            except Exception:
                return None
    else:
        try:
            s = str(raw).strip().replace("Z", "")
            dt = datetime.fromisoformat(s)
        except Exception:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return int(dt.timestamp() * 1000)


def _to_num(v: Any) -> float | None:
    try:
        if v is None:
            return None
        n = float(v)
        if n != n:  # NaN
            return None
        return n
    except Exception:
        return None


def _dedupe_and_round(values: List[float]) -> List[float]:
    # sort ascending
    vals = sorted([float(v) for v in values])
    if not vals:
        return []
    # merge clusters where diff <= 0.1
    result: List[float] = []
    cur: List[float] = [vals[0]]
    for v in vals[1:]:
        if abs(v - cur[-1]) <= 0.1:
            cur.append(v)
        else:
            result.append(_round1(_represent(cur)))
            cur = [v]
    result.append(_round1(_represent(cur)))
    # sort again after rounding to be safe
    result.sort()
    return result


def _represent(cluster: List[float]) -> float:
    # choose mean of cluster
    if not cluster:
        return 0.0
    return sum(cluster) / len(cluster)


def _round1(v: float) -> float:
    # one decimal
    return float(f"{v:.1f}")


def _sorted_keys(m: Dict[str, List[float]]) -> Dict[str, List[float]]:
    # stable order by numeric ts key
    return {k: m[k] for k in sorted(m.keys(), key=lambda x: int(x))}

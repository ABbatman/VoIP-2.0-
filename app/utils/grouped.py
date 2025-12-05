# app/utils/grouped.py
# Single-pass aggregation for O(n) complexity

from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List
from app.utils.logger import log_info
from app.utils.formulas import calc_minutes, calc_acd, calc_asr, calc_pdd_weighted, calc_atime_weighted


def _zero_agg() -> Dict[str, int]:
    """Return zeroed aggregation dict."""
    return {"attempt": 0, "uniq": 0, "success": 0, "seconds": 0, "pdd_w": 0, "answer_w": 0}


def calculate_grouped_metrics(rows, reverse=False):
    """
    Single-pass aggregation by (main, peer, destination).
    O(n) time, O(groups) memory.
    """
    main_key = "supplier" if reverse else "customer"
    peer_key = "customer" if reverse else "supplier"

    # Single pass: accumulate sums directly
    peer_agg: Dict[tuple, Dict[str, int]] = defaultdict(_zero_agg)
    main_agg: Dict[tuple, Dict[str, int]] = defaultdict(_zero_agg)

    for row in rows:
        main = row.get(main_key)
        peer = row.get(peer_key)
        dest = row.get("destination")

        attempt = row.get("start_attempt", 0) or 0
        uniq = row.get("start_uniq_attempt", 0) or 0
        success = row.get("start_nuber", 0) or 0
        seconds = row.get("seconds", 0) or 0
        pdd = row.get("pdd", 0) or 0
        answer = row.get("answer_time", 0) or 0

        # Peer-level aggregation
        pk = (main, peer, dest)
        pa = peer_agg[pk]
        pa["attempt"] += attempt
        pa["uniq"] += uniq
        pa["success"] += success
        pa["seconds"] += seconds
        pa["pdd_w"] += pdd * uniq
        pa["answer_w"] += answer * success

        # Main-level aggregation (same values, different key)
        mk = (main, dest)
        ma = main_agg[mk]
        ma["attempt"] += attempt
        ma["uniq"] += uniq
        ma["success"] += success
        ma["seconds"] += seconds
        ma["pdd_w"] += pdd * uniq
        ma["answer_w"] += answer * success

    # Build result lists
    peer_metrics = [
        {
            "main": k[0], "peer": k[1], "destination": k[2],
            "Min": calc_minutes(a["seconds"]),
            "TCall": a["attempt"], "SCall": a["success"],
            "ASR": calc_asr(a["success"], a["attempt"]),
            "ACD": calc_acd(a["seconds"], a["success"]),
            "PDD": calc_pdd_weighted(a["pdd_w"], a["uniq"]),
            "ATime": calc_atime_weighted(a["answer_w"], a["success"]),
        }
        for k, a in peer_agg.items()
    ]

    main_metrics = [
        {
            "main": k[0], "destination": k[1],
            "Min": calc_minutes(a["seconds"]),
            "TCall": a["attempt"], "SCall": a["success"],
            "ASR": calc_asr(a["success"], a["attempt"]),
            "ACD": calc_acd(a["seconds"], a["success"]),
            "PDD": calc_pdd_weighted(a["pdd_w"], a["uniq"]),
            "ATime": calc_atime_weighted(a["answer_w"], a["success"]),
        }
        for k, a in main_agg.items()
    ]

    log_info(f"Grouped metrics: {len(main_metrics)} main, {len(peer_metrics)} peer")
    return {"main_rows": main_metrics, "peer_rows": peer_metrics}

def _parse_datetime(raw_time) -> datetime | None:
    """Parse datetime from various formats (reusable helper)."""
    if isinstance(raw_time, datetime):
        return raw_time
    if isinstance(raw_time, str):
        s = raw_time.replace("Z", "").strip()
        try:
            return datetime.fromisoformat(s)
        except Exception:
            try:
                return datetime.fromisoformat(s.replace(" ", "T"))
            except Exception:
                return None
    try:
        s = str(raw_time).replace("Z", "").strip()
        return datetime.fromisoformat(s)
    except Exception:
        return None


def calculate_hourly_metrics(rows, reverse=False):
    """
    Single-pass hourly aggregation by (main, peer, destination, hour).
    """
    main_key = "supplier" if reverse else "customer"
    peer_key = "customer" if reverse else "supplier"

    agg: Dict[tuple, Dict[str, Any]] = defaultdict(_zero_agg)

    for row in rows:
        main = row.get(main_key)
        peer = row.get(peer_key)
        dest = row.get("destination")
        dt = _parse_datetime(row.get("time"))
        if dt is None:
            continue
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc)

        hour_key = dt.strftime("%Y-%m-%d %H:00")
        k = (main, peer, dest, hour_key)
        a = agg[k]

        a["attempt"] += row.get("start_attempt", 0) or 0
        a["uniq"] += row.get("start_uniq_attempt", 0) or 0
        a["success"] += row.get("start_nuber", 0) or 0
        a["seconds"] += row.get("seconds", 0) or 0
        a["pdd_w"] += row.get("pdd", 0) or 0
        a["answer_w"] += row.get("answer_time", 0) or 0

    return [
        {
            "time": k[3],
            "hour": k[3].split(" ")[1] if " " in k[3] else k[3],
            "main": k[0], "peer": k[1], "destination": k[2],
            "Min": calc_minutes(a["seconds"]),
            "TCall": a["attempt"], "SCall": a["success"],
            "ASR": calc_asr(a["success"], a["attempt"]),
            "ACD": calc_acd(a["seconds"], a["success"]),
            "PDD": calc_pdd_weighted(a["pdd_w"], a["uniq"]),
            "ATime": calc_atime_weighted(a["answer_w"], a["success"]),
        }
        for k, a in agg.items()
    ]

def calculate_5min_metrics(rows, reverse: bool = False):
    """
    Single-pass 5-minute aggregation by (main, peer, destination, 5m window).
    """
    main_key = "supplier" if reverse else "customer"
    peer_key = "customer" if reverse else "supplier"

    # key -> {agg dict + slot}
    agg: Dict[tuple, Dict[str, Any]] = {}

    for row in rows:
        main = row.get(main_key)
        peer = row.get(peer_key)
        dest = row.get("destination")
        dt = _parse_datetime(row.get("time"))
        if dt is None:
            continue
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc)

        # Floor to 5-minute window
        minute_bucket = (dt.minute // 5) * 5
        dt5 = dt.replace(minute=minute_bucket, second=0, microsecond=0)
        key5 = dt5.strftime("%Y-%m-%d %H:%M")
        slot = dt5.strftime("%H:%M")

        k = (main, peer, dest, key5)
        if k not in agg:
            agg[k] = {"attempt": 0, "uniq": 0, "success": 0, "seconds": 0, "pdd_w": 0, "answer_w": 0, "slot": slot}
        a = agg[k]

        a["attempt"] += row.get("start_attempt", 0) or 0
        a["uniq"] += row.get("start_uniq_attempt", 0) or 0
        a["success"] += row.get("start_nuber", 0) or 0
        a["seconds"] += row.get("seconds", 0) or 0
        a["pdd_w"] += row.get("pdd", 0) or 0
        a["answer_w"] += row.get("answer_time", 0) or 0

    return [
        {
            "time": k[3], "slot": a["slot"],
            "main": k[0], "peer": k[1], "destination": k[2],
            "Min": calc_minutes(a["seconds"]),
            "TCall": a["attempt"], "SCall": a["success"],
            "ASR": calc_asr(a["success"], a["attempt"]),
            "ACD": calc_acd(a["seconds"], a["success"]),
            "PDD": calc_pdd_weighted(a["pdd_w"], a["uniq"]),
            "ATime": calc_atime_weighted(a["answer_w"], a["success"]),
        }
        for k, a in agg.items()
    ]
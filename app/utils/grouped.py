# app/utils/grouped.py

from collections import defaultdict
from datetime import datetime, timezone
from app.utils.logger import log_info
from app.utils.formulas import calc_minutes, calc_acd, calc_asr, calc_pdd_weighted, calc_atime_weighted


def calculate_grouped_metrics(rows, reverse=False):
    """
    Groups raw rows by (main, peer, destination) and calculates metrics.
    Uses centralized formulas from app/utils/formulas.py.
    """
    log_info("🔢 Starting grouped metric calculation for peer/main tables...")

    grouped = defaultdict(list)
    main_key = "supplier" if reverse else "customer"
    peer_key = "customer" if reverse else "supplier"

    for row in rows:
        main = row.get(main_key)
        peer = row.get(peer_key)
        dest = row.get("destination")
        key = (main, peer, dest)
        grouped[key].append(row)

    peer_metrics = []
    main_aggregate = defaultdict(list)

    for (main, peer, dest), items in grouped.items():
        sum_attempt = sum(r.get("start_attempt", 0) for r in items)
        sum_uniq_attempt = sum(r.get("start_uniq_attempt", 0) for r in items)
        sum_success = sum(r.get("start_nuber", 0) for r in items)
        sum_seconds = sum(r.get("seconds", 0) for r in items)
        sum_pdd_weighted = sum(r.get("pdd", 0) * r.get("start_uniq_attempt", 0) for r in items)
        sum_answer_weighted = sum(r.get("answer_time", 0) * r.get("start_nuber", 0) for r in items)

        peer_metrics.append({
            "main": main,
            "peer": peer,
            "destination": dest,
            "Min": calc_minutes(sum_seconds),
            "TCall": sum_attempt,
            "SCall": sum_success,
            "ASR": calc_asr(sum_success, sum_attempt),
            "ACD": calc_acd(sum_seconds, sum_success),
            "PDD": calc_pdd_weighted(sum_pdd_weighted, sum_uniq_attempt),
            "ATime": calc_atime_weighted(sum_answer_weighted, sum_success)
        })

        main_aggregate[(main, dest)].append({
            "sum_success": sum_success,
            "sum_attempt": sum_attempt,
            "sum_uniq_attempt": sum_uniq_attempt,
            "sum_seconds": sum_seconds,
            "sum_pdd_weighted": sum_pdd_weighted,
            "sum_answer_weighted": sum_answer_weighted
        })

    main_metrics = []
    for (main, dest), items in main_aggregate.items():
        agg_success = sum(r["sum_success"] for r in items)
        agg_attempt = sum(r["sum_attempt"] for r in items)
        agg_uniq_attempt = sum(r["sum_uniq_attempt"] for r in items)
        agg_seconds = sum(r["sum_seconds"] for r in items)
        agg_pdd_weighted = sum(r["sum_pdd_weighted"] for r in items)
        agg_answer_weighted = sum(r["sum_answer_weighted"] for r in items)

        main_metrics.append({
            "main": main,
            "destination": dest,
            "Min": calc_minutes(agg_seconds),
            "TCall": agg_attempt,
            "SCall": agg_success,
            "ACD": calc_acd(agg_seconds, agg_success),
            "ASR": calc_asr(agg_success, agg_attempt),
            "PDD": calc_pdd_weighted(agg_pdd_weighted, agg_uniq_attempt),
            "ATime": calc_atime_weighted(agg_answer_weighted, agg_success),
        })

    log_info(f"✅ Grouped metrics calculated: {len(main_metrics)} main, {len(peer_metrics)} peer rows")
    return {
        "main_rows": main_metrics,
        "peer_rows": peer_metrics
    }

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
    Groups rows by (main, peer, destination, hour) and calculates hourly metrics.
    Uses centralized formulas from app/utils/formulas.py.
    """
    grouped = defaultdict(list)
    main_key = "supplier" if reverse else "customer"
    peer_key = "customer" if reverse else "supplier"

    for row in rows:
        main = row.get(main_key)
        peer = row.get(peer_key)
        dest = row.get("destination")
        raw_time = row.get("time")
        dt = _parse_datetime(raw_time)

        if dt is None:
            try:
                log_info(f"⏭️ Skipping row with unparsable time: {raw_time}")
            except Exception:
                pass
            continue
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc)
        hour_key = dt.strftime("%Y-%m-%d %H:00")
        full_key = (main, peer, dest, hour_key)
        grouped[full_key].append(row)

    result = []
    for (main, peer, dest, hour), items in grouped.items():
        total_attempt = sum(r.get("start_attempt", 0) for r in items)
        total_uniq = sum(r.get("start_uniq_attempt", 0) for r in items)
        total_success = sum(r.get("start_nuber", 0) for r in items)
        total_seconds = sum(r.get("seconds", 0) for r in items)
        total_pdd = sum(r.get("pdd", 0) for r in items)
        total_answer = sum(r.get("answer_time", 0) for r in items)

        hour_of_day = hour.split(" ")[1] if " " in hour else hour
        result.append({
            "time": hour,
            "hour": hour_of_day,
            "main": main,
            "peer": peer,
            "destination": dest,
            "Min": calc_minutes(total_seconds),
            "TCall": total_attempt,
            "SCall": total_success,
            "ASR": calc_asr(total_success, total_attempt),
            "ACD": calc_acd(total_seconds, total_success),
            "PDD": calc_pdd_weighted(total_pdd, total_uniq),
            "ATime": calc_atime_weighted(total_answer, total_success)
        })

    return result

def calculate_5min_metrics(rows, reverse: bool = False):
    """
    Groups rows by (main, peer, destination, 5-minute window) and calculates metrics.
    Uses centralized formulas from app/utils/formulas.py.
    """
    grouped = defaultdict(list)
    main_key = "supplier" if reverse else "customer"
    peer_key = "customer" if reverse else "supplier"

    for row in rows:
        main = row.get(main_key)
        peer = row.get(peer_key)
        dest = row.get("destination")
        raw_time = row.get("time")
        dt = _parse_datetime(raw_time)

        if dt is None:
            try:
                log_info(f"⏭️ Skipping row with unparsable time: {raw_time}")
            except Exception:
                pass
            continue
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc)
        # Floor to 5-minute window
        minute_bucket = (dt.minute // 5) * 5
        dt5 = dt.replace(minute=minute_bucket, second=0, microsecond=0)
        key5 = dt5.strftime("%Y-%m-%d %H:%M")
        slot = dt5.strftime("%H:%M")
        row_copy = dict(row)
        row_copy["slot"] = slot
        grouped[(main, peer, dest, key5)].append(row_copy)

    result = []
    for (main, peer, dest, t5), items in grouped.items():
        total_attempt = sum(r.get("start_attempt", 0) for r in items)
        total_uniq = sum(r.get("start_uniq_attempt", 0) for r in items)
        total_success = sum(r.get("start_nuber", 0) for r in items)
        total_seconds = sum(r.get("seconds", 0) for r in items)
        total_pdd = sum(r.get("pdd", 0) for r in items)
        total_answer = sum(r.get("answer_time", 0) for r in items)

        result.append({
            "time": t5,
            "slot": items[0].get("slot"),
            "main": main,
            "peer": peer,
            "destination": dest,
            "Min": calc_minutes(total_seconds),
            "TCall": total_attempt,
            "SCall": total_success,
            "ASR": calc_asr(total_success, total_attempt),
            "ACD": calc_acd(total_seconds, total_success),
            "PDD": calc_pdd_weighted(total_pdd, total_uniq),
            "ATime": calc_atime_weighted(total_answer, total_success),
        })

    return result
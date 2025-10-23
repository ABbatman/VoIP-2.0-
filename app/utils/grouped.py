# app/utils/grouped.py

from collections import defaultdict
from datetime import datetime, timezone
from app.utils.logger import log_info

def calculate_grouped_metrics(rows, reverse=False):
    """
    Groups raw rows by (main, peer, destination) and calculates metrics
    with specific formatting rules defined by the user.
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
        # If pdd/answer_time are pre-averaged per row, use weighted sums
        sum_pdd_weighted = sum(r.get("pdd", 0) * r.get("start_uniq_attempt", 0) for r in items)
        # Average answer time over successful calls only (answered calls)
        sum_answer_weighted = sum(r.get("answer_time", 0) * r.get("start_nuber", 0) for r in items)

        # --- METRIC CALCULATIONS ACCORDING TO USER-DEFINED RULES ---
        acd = round(sum_seconds / sum_success / 60, 1) if sum_success else 0.0
        # ASR: successes over attempts, capped at 100%
        asr = min(100.0, round((sum_success / sum_attempt) * 100, 1)) if sum_attempt else 0.0
        
        # PDD хранится в миллисекундах, переводим в секунды
        avg_pdd = round(sum_pdd_weighted / sum_uniq_attempt / 1000, 1) if sum_uniq_attempt else 0.0
        # Answer Time уже в секундах, деление на 1000 не нужно
        avg_answer = round(sum_answer_weighted / sum_success, 1) if sum_success else 0.0

        peer_metrics.append({
            "main": main,
            "peer": peer,
            "destination": dest,
            "Min": round(sum_seconds / 60, 1),
            "TCall": sum_attempt,
            "SCall": sum_success,
            "ASR": asr,
            "ACD": acd,
            "PDD": avg_pdd,
            "ATime": avg_answer
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

        main_acd = round(agg_seconds / agg_success / 60, 1) if agg_success else 0.0
        # Main row ASR follows best practice: successes over attempts, capped at 100%
        main_asr = min(100.0, round((agg_success / agg_attempt) * 100, 1)) if agg_attempt else 0.0
        
        # Weighted averages across aggregated groups
        main_pdd = round(agg_pdd_weighted / agg_uniq_attempt / 1000, 1) if agg_uniq_attempt else 0.0
        # Answer Time уже в секундах, деления на 1000 не требуется
        main_answer = round(agg_answer_weighted / agg_success, 1) if agg_success else 0.0

        main_metrics.append({
            "main": main,
            "destination": dest,
            "Min": round(agg_seconds / 60, 1),
            "TCall": agg_attempt,
            "SCall": agg_success,
            "ACD": main_acd,
            "ASR": main_asr,
            "PDD": main_pdd,
            "ATime": main_answer,
        })

    log_info(f"✅ Grouped metrics calculated: {len(main_metrics)} main, {len(peer_metrics)} peer rows")
    return {
        "main_rows": main_metrics,
        "peer_rows": peer_metrics
    }

def calculate_hourly_metrics(rows, reverse=False):
    """
    Groups rows by (main, peer, destination, hour) and calculates hourly metrics.
    """
    grouped = defaultdict(list)
    main_key = "supplier" if reverse else "customer"
    peer_key = "customer" if reverse else "supplier"

    for row in rows:
        main = row.get(main_key)
        peer = row.get(peer_key)
        dest = row.get("destination")
        # 'time' may come as a Python datetime (from SQLAlchemy) or as ISO string
        raw_time = row.get("time")
        dt: datetime | None = None
        if isinstance(raw_time, datetime):
            dt = raw_time
        elif isinstance(raw_time, str):
            # Tolerate trailing 'Z' and both 'T'/' '
            s = raw_time.replace("Z", "").strip()
            try:
                dt = datetime.fromisoformat(s)
            except Exception:
                # Last resort: try replacing ' ' with 'T'
                try:
                    dt = datetime.fromisoformat(s.replace(" ", "T"))
                except Exception:
                    dt = None
        else:
            # Try to parse stringified representation
            try:
                s = str(raw_time).replace("Z", "").strip()
                dt = datetime.fromisoformat(s)
            except Exception:
                dt = None

        if dt is None:
            # Skip malformed time rows rather than crashing the whole request
            try:
                log_info(f"⏭️ Skipping row with unparsable time: {raw_time}")
            except Exception:
                pass
            continue
        # Normalize to UTC (keep wall-clock grouping consistent)
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

        acd = round(total_seconds / total_success / 60, 1) if total_success else 0.0
        # Hourly ASR: successes over attempts, capped at 100%
        asr = min(100.0, round((total_success / total_attempt) * 100, 1)) if total_attempt else 0.0
        
        # PDD is divided by unique attempts
        avg_pdd = round(total_pdd / total_uniq / 1000, 1) if total_uniq else 0.0
        # ATime averaged over successful (answered) calls; значение уже в секундах
        avg_answer = round(total_answer / total_success, 1) if total_success else 0.0

        # Extract hour-of-day (HH:00) for cross-day hourly comparison
        # "time" holds the full date-hour (YYYY-MM-DD HH:00) for display
        hour_of_day = hour.split(" ")[1] if " " in hour else hour
        result.append({
            "time": hour,
            "hour": hour_of_day,
            "main": main,
            "peer": peer,
            "destination": dest,
            "Min": round(total_seconds / 60, 1),
            "TCall": total_attempt,
            "SCall": total_success,
            "ASR": asr,
            "ACD": acd,
            "PDD": avg_pdd,
            "ATime": avg_answer
        })

    return result

def calculate_5min_metrics(rows, reverse: bool = False):
    """
    Groups rows by (main, peer, destination, 5-minute window) and calculates metrics.
    Input rows may already be at 5-minute granularity; we still aggregate defensively.
    """
    grouped = defaultdict(list)
    main_key = "supplier" if reverse else "customer"
    peer_key = "customer" if reverse else "supplier"

    for row in rows:
        main = row.get(main_key)
        peer = row.get(peer_key)
        dest = row.get("destination")
        raw_time = row.get("time")
        dt: datetime | None = None
        if isinstance(raw_time, datetime):
            dt = raw_time
        elif isinstance(raw_time, str):
            s = raw_time.replace("Z", "").strip()
            try:
                dt = datetime.fromisoformat(s)
            except Exception:
                try:
                    dt = datetime.fromisoformat(s.replace(" ", "T"))
                except Exception:
                    dt = None
        else:
            try:
                s = str(raw_time).replace("Z", "").strip()
                dt = datetime.fromisoformat(s)
            except Exception:
                dt = None

        if dt is None:
            try:
                log_info(f"⏭️ Skipping row with unparsable time: {raw_time}")
            except Exception:
                pass
            continue
        # Normalize to UTC
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc)
        # Floor to 5-minute window
        minute_bucket = (dt.minute // 5) * 5
        dt5 = dt.replace(minute=minute_bucket, second=0, microsecond=0)
        key5 = dt5.strftime("%Y-%m-%d %H:%M")
        slot = dt5.strftime("%H:%M")
        # Attach computed slot to row copy to simplify enrichment later
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

        acd = round(total_seconds / total_success / 60, 1) if total_success else 0.0
        asr = min(100.0, round((total_success / total_attempt) * 100, 1)) if total_attempt else 0.0
        avg_pdd = round(total_pdd / total_uniq / 1000, 1) if total_uniq else 0.0
        avg_answer = round(total_answer / total_success, 1) if total_success else 0.0

        result.append({
            "time": t5,
            "slot": items[0].get("slot"),
            "main": main,
            "peer": peer,
            "destination": dest,
            "Min": round(total_seconds / 60, 1),
            "TCall": total_attempt,
            "SCall": total_success,
            "ASR": asr,
            "ACD": acd,
            "PDD": avg_pdd,
            "ATime": avg_answer,
        })

    return result
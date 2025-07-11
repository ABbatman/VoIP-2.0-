# app/utils/grouped.py

from collections import defaultdict
from app.utils.logger import log_info
from datetime import datetime

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
        sum_pdd = sum(r.get("pdd", 0) for r in items)
        sum_answer = sum(r.get("answer_time", 0) for r in items)

        # --- METRIC CALCULATIONS ACCORDING TO USER-DEFINED RULES ---
        acd = round(sum_seconds / sum_success / 60, 1) if sum_success else 0.0
        asr = round((sum_success / sum_attempt) * 100, 1) if sum_attempt else 0.0
        
        # PDD is divided by unique attempts
        avg_pdd = round(sum_pdd / sum_uniq_attempt / 1000, 1) if sum_uniq_attempt else 0.0
        # ATime is divided by all attempts
        avg_answer = round(sum_answer / sum_attempt, 1) if sum_attempt else 0.0

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
            "sum_pdd": sum_pdd,
            "sum_answer": sum_answer
        })

    main_metrics = []
    for (main, dest), items in main_aggregate.items():
        agg_success = sum(r["sum_success"] for r in items)
        agg_attempt = sum(r["sum_attempt"] for r in items)
        agg_uniq_attempt = sum(r["sum_uniq_attempt"] for r in items)
        agg_seconds = sum(r["sum_seconds"] for r in items)
        agg_pdd = sum(r["sum_pdd"] for r in items)
        agg_answer = sum(r["sum_answer"] for r in items)

        main_acd = round(agg_seconds / agg_success / 60, 1) if agg_success else 0.0
        main_asr = round((agg_success / agg_attempt) * 100, 1) if agg_attempt else 0.0
        
        # PDD is divided by unique attempts
        main_pdd = round(agg_pdd / agg_uniq_attempt / 1000, 1) if agg_uniq_attempt else 0.0
        # ATime is divided by all attempts
        main_answer = round(agg_answer / agg_attempt, 1) if agg_attempt else 0.0

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
        dt = datetime.fromisoformat(row["time"])
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
        asr = round((total_success / total_attempt) * 100, 1) if total_attempt else 0.0
        
        # PDD is divided by unique attempts
        avg_pdd = round(total_pdd / total_uniq / 1000, 1) if total_uniq else 0.0
        # ATime is divided by all attempts
        avg_answer = round(total_answer / total_attempt, 1) if total_attempt else 0.0

        result.append({
            "time": hour,
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
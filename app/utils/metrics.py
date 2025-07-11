# app/utils/metrics.py

from collections import defaultdict
from app.utils.logger import log_info # Use absolute import

# ===== METRICS FOR TOTAL =====
def calculate_metrics(rows):
    log_info("📊 Starting metric calculation...")

    if not rows:
        log_info("📭 No data received for metric calculation.")
        return {
            "Min": 0.0,
            "ACD": 0.0,
            "ASR": 0,
            "Scall": 0,
            "AvPDD": 0.0,
            "ATime": 0.0,
            "SCal": 0,
            "TCall": 0,
            "UCall": 0
        }

    log_info(f"📥 Received {len(rows)} rows for processing")

    total_seconds = 0
    total_pdd = 0
    total_answer_time = 0
    pdd_count = 0
    atime_count = 0
    scal = 0
    tcall = 0
    ucall = 0

    for row in rows:
        seconds = row.get("seconds", 0) or 0
        total_seconds += seconds

        pdd = row.get("pdd")
        if pdd is not None:
            total_pdd += pdd
            pdd_count += 1

        answer_time = row.get("answer_time")
        if answer_time is not None:
            total_answer_time += answer_time
            atime_count += 1

        scal += row.get("start_nuber", 0) or 0
        tcall += row.get("start_attempt", 0) or 0
        ucall += row.get("start_uniq_attempt", 0) or 0

    log_info(f"⏱ Total seconds: {total_seconds}, Total PDD: {total_pdd}, Total Answer Time: {total_answer_time}")
    log_info(f"📈 Counts — PDD: {pdd_count}, ATime: {atime_count}, SCal: {scal}, TCall: {tcall}, UCall: {ucall}")

    # --- Calculations with new formatting ---

    # Convert total seconds to minutes, formatted to one decimal place.
    min_val = round(total_seconds / 60, 1)

    # Calculate ACD in minutes, formatted to one decimal place.
    # The original calculation was already in minutes, we just confirm the rounding.
    acd = round(total_seconds / scal / 60, 1) if scal else 0.0

    # Calculate ASR and round to one decimal place.
    asr = round(scal / tcall * 100, 1) if tcall else 0.0
    scall = asr  # Keep the copy of ASR

    # Calculate average PDD in seconds (divide by 1000), formatted to one decimal place.
    av_pdd = round(total_pdd / pdd_count / 1000, 1) if pdd_count else 0.0

    # Calculate average Answer Time, formatted to one decimal place.
    atime = round(total_answer_time / atime_count, 1) if atime_count else 0.0

    result = {
        "Min": min_val,
        "ACD": acd,
        "ASR": asr,
        "Scall": scall,
        "AvPDD": av_pdd,
        "ATime": atime,
        "SCal": scal,
        "TCall": tcall,
        "UCall": ucall
    }

    log_info(f"✅ Metrics calculated: {result}")
    return result

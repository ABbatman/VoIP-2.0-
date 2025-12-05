# app/utils/metrics.py
# Total metrics calculation using centralized formulas

from app.utils.logger import log_info
from app.utils.formulas import calc_minutes, calc_acd, calc_asr, calc_pdd, calc_atime


def calculate_metrics(rows):
    """
    Calculate total metrics from raw rows.
    Uses centralized formulas from app/utils/formulas.py.
    """
    log_info("Starting metric calculation")

    if not rows:
        log_info("No data for metric calculation")
        return {
            "Min": 0.0,
            "ACD": 0.0,
            "ASR": 0.0,
            "Scall": 0.0,
            "AvPDD": 0.0,
            "ATime": 0.0,
            "SCal": 0,
            "TCall": 0,
            "UCall": 0
        }

    log_info(f"Received {len(rows)} rows for processing")

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

    log_info(f"Totals: seconds={total_seconds}, pdd={total_pdd}, answer_time={total_answer_time}")
    log_info(f"Counts: pdd={pdd_count}, atime={atime_count}, scal={scal}, tcall={tcall}, ucall={ucall}")

    # Use centralized formulas
    asr = calc_asr(scal, tcall)

    result = {
        "Min": calc_minutes(total_seconds),
        "ACD": calc_acd(total_seconds, scal),
        "ASR": asr,
        "Scall": asr,  # legacy alias
        "AvPDD": calc_pdd(total_pdd, pdd_count),
        "ATime": calc_atime(total_answer_time, atime_count),
        "SCal": scal,
        "TCall": tcall,
        "UCall": ucall
    }

    log_info(f"Metrics calculated: {result}")
    return result

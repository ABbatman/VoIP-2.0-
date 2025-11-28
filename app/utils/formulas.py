# app/utils/formulas.py
# Single source of truth for all metric calculations
# Pure functions with no side effects

from typing import Union

Number = Union[int, float]


def calc_minutes(seconds: Number) -> float:
    """Convert seconds to minutes, rounded to 1 decimal."""
    return round(seconds / 60, 1) if seconds else 0.0


def calc_acd(seconds: Number, success_calls: Number) -> float:
    """
    Calculate Average Call Duration in minutes.
    ACD = total_seconds / successful_calls / 60
    """
    if not success_calls:
        return 0.0
    return round(seconds / success_calls / 60, 1)


def calc_asr(success_calls: Number, total_attempts: Number) -> float:
    """
    Calculate Answer Seizure Ratio as percentage.
    ASR = (successful_calls / total_attempts) * 100, capped at 100%
    """
    if not total_attempts:
        return 0.0
    return min(100.0, round((success_calls / total_attempts) * 100, 1))


def calc_pdd(total_pdd_ms: Number, uniq_attempts: Number) -> float:
    """
    Calculate average Post Dial Delay in seconds.
    PDD stored in milliseconds, convert to seconds.
    """
    if not uniq_attempts:
        return 0.0
    return round(total_pdd_ms / uniq_attempts / 1000, 1)


def calc_pdd_weighted(sum_pdd_weighted: Number, total_weight: Number) -> float:
    """
    Calculate weighted average PDD in seconds.
    Used when PDD is pre-weighted by attempts.
    """
    if not total_weight:
        return 0.0
    return round(sum_pdd_weighted / total_weight / 1000, 1)


def calc_atime(total_answer_time: Number, success_calls: Number) -> float:
    """
    Calculate average Answer Time in seconds.
    ATime = total_answer_time / successful_calls
    """
    if not success_calls:
        return 0.0
    return round(total_answer_time / success_calls, 1)


def calc_atime_weighted(sum_answer_weighted: Number, total_weight: Number) -> float:
    """
    Calculate weighted average Answer Time in seconds.
    Used when answer_time is pre-weighted by success calls.
    """
    if not total_weight:
        return 0.0
    return round(sum_answer_weighted / total_weight, 1)


def calc_delta_percent(current: Number, previous: Number) -> float:
    """
    Calculate percentage change between current and previous values.
    Returns 0 if previous is 0, otherwise ((current - previous) / previous) * 100
    """
    if not previous:
        return 100.0 if current > 0 else 0.0
    return round(((current - previous) / previous) * 100, 1)

# tests/unit/test_formulas.py
# Unit tests for metric calculation formulas
# These are CRITICAL - any change to formulas affects business logic

import pytest
from app.utils.formulas import (
    calc_minutes,
    calc_acd,
    calc_asr,
    calc_pdd,
    calc_pdd_weighted,
    calc_atime,
    calc_atime_weighted,
    calc_delta_percent,
)


class TestCalcMinutes:
    """Test seconds to minutes conversion."""

    def test_basic_conversion(self):
        assert calc_minutes(60) == 1.0
        assert calc_minutes(120) == 2.0
        assert calc_minutes(90) == 1.5

    def test_zero_seconds(self):
        assert calc_minutes(0) == 0.0

    def test_none_seconds(self):
        assert calc_minutes(None) == 0.0

    def test_rounding(self):
        # 65 seconds = 1.0833... minutes -> rounds to 1.1
        assert calc_minutes(65) == 1.1
        # 63 seconds = 1.05 minutes -> rounds to 1.0 or 1.1 depending on rounding
        assert calc_minutes(63) == 1.0  # 63/60 = 1.05 -> round(1.05, 1) = 1.0 (banker's rounding)

    def test_large_values(self):
        # 1 hour = 3600 seconds = 60 minutes
        assert calc_minutes(3600) == 60.0
        # 1 day = 86400 seconds = 1440 minutes
        assert calc_minutes(86400) == 1440.0


class TestCalcAcd:
    """Test Average Call Duration calculation."""

    def test_basic_calculation(self):
        # 600 seconds / 10 calls / 60 = 1.0 minute per call
        assert calc_acd(600, 10) == 1.0

    def test_zero_success_calls(self):
        assert calc_acd(600, 0) == 0.0

    def test_none_success_calls(self):
        assert calc_acd(600, None) == 0.0

    def test_zero_seconds(self):
        assert calc_acd(0, 10) == 0.0

    def test_rounding(self):
        # 100 seconds / 3 calls / 60 = 0.555... -> 0.6
        assert calc_acd(100, 3) == 0.6

    def test_realistic_values(self):
        # 5 minute average call: 300s per call with 100 calls = 30000 seconds total
        assert calc_acd(30000, 100) == 5.0


class TestCalcAsr:
    """Test Answer Seizure Ratio calculation."""

    def test_basic_calculation(self):
        # 50 success / 100 attempts = 50%
        assert calc_asr(50, 100) == 50.0

    def test_zero_attempts(self):
        assert calc_asr(50, 0) == 0.0

    def test_none_attempts(self):
        assert calc_asr(50, None) == 0.0

    def test_full_success(self):
        # 100% success rate
        assert calc_asr(100, 100) == 100.0

    def test_capped_at_100(self):
        # More success than attempts (shouldn't happen but test the cap)
        assert calc_asr(150, 100) == 100.0

    def test_zero_success(self):
        assert calc_asr(0, 100) == 0.0

    def test_rounding(self):
        # 33 / 100 = 33.0%
        assert calc_asr(33, 100) == 33.0
        # 1 / 3 = 33.333...% -> 33.3%
        assert calc_asr(1, 3) == 33.3

    def test_realistic_values(self):
        # Typical ASR around 40-60%
        assert calc_asr(450, 1000) == 45.0


class TestCalcPdd:
    """Test Post Dial Delay calculation (milliseconds to seconds)."""

    def test_basic_calculation(self):
        # 5000 ms total / 10 attempts = 500ms = 0.5 seconds
        assert calc_pdd(5000, 10) == 0.5

    def test_zero_attempts(self):
        assert calc_pdd(5000, 0) == 0.0

    def test_zero_pdd(self):
        assert calc_pdd(0, 10) == 0.0

    def test_realistic_values(self):
        # Typical PDD: 2-3 seconds
        # 25000 ms / 10 = 2500 ms = 2.5 seconds
        assert calc_pdd(25000, 10) == 2.5


class TestCalcPddWeighted:
    """Test weighted PDD calculation."""

    def test_basic_calculation(self):
        # sum_pdd_weighted = 10000, total_weight = 10 -> 10000/10/1000 = 1.0
        assert calc_pdd_weighted(10000, 10) == 1.0

    def test_zero_weight(self):
        assert calc_pdd_weighted(10000, 0) == 0.0

    def test_realistic_scenario(self):
        # 3 attempts with PDD 2000ms each: weighted = 3 * 2000 = 6000
        # 6000 / 3 / 1000 = 2.0 seconds
        assert calc_pdd_weighted(6000, 3) == 2.0


class TestCalcAtime:
    """Test Answer Time calculation."""

    def test_basic_calculation(self):
        # 100 seconds total / 10 calls = 10 seconds per call
        assert calc_atime(100, 10) == 10.0

    def test_zero_calls(self):
        assert calc_atime(100, 0) == 0.0

    def test_rounding(self):
        # 100 / 3 = 33.333... -> 33.3
        assert calc_atime(100, 3) == 33.3


class TestCalcAtimeWeighted:
    """Test weighted Answer Time calculation."""

    def test_basic_calculation(self):
        # sum_weighted = 300, weight = 10 -> 30.0
        assert calc_atime_weighted(300, 10) == 30.0

    def test_zero_weight(self):
        assert calc_atime_weighted(300, 0) == 0.0


class TestCalcDeltaPercent:
    """Test percentage change calculation."""

    def test_increase(self):
        # 150 vs 100 = +50%
        assert calc_delta_percent(150, 100) == 50.0

    def test_decrease(self):
        # 50 vs 100 = -50%
        assert calc_delta_percent(50, 100) == -50.0

    def test_no_change(self):
        assert calc_delta_percent(100, 100) == 0.0

    def test_zero_previous(self):
        # If previous is 0 and current > 0, return 100%
        assert calc_delta_percent(50, 0) == 100.0

    def test_both_zero(self):
        assert calc_delta_percent(0, 0) == 0.0

    def test_current_zero_previous_nonzero(self):
        # 0 vs 100 = -100%
        assert calc_delta_percent(0, 100) == -100.0


# Regression tests - snapshot of known good values
class TestRegressionValues:
    """Ensure calculations don't change unexpectedly."""

    def test_known_good_acd(self):
        # These are known good values from production
        assert calc_acd(18000, 100) == 3.0  # 3 min average
        assert calc_acd(7200, 40) == 3.0    # 3 min average

    def test_known_good_asr(self):
        assert calc_asr(423, 1000) == 42.3
        assert calc_asr(876, 1000) == 87.6

    def test_known_good_minutes(self):
        assert calc_minutes(36000) == 600.0  # 10 hours

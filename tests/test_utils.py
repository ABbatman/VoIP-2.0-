# tests/test_utils.py

import pytest
from app.utils.metrics import calculate_metrics
from app.utils.grouped import calculate_grouped_metrics, calculate_hourly_metrics
from datetime import datetime

# --- Test data fixtures ---
# Fixtures provide a fixed baseline of data for tests.
# This makes tests predictable and repeatable.

@pytest.fixture
def sample_rows():
    """ A simple set of rows for basic metric calculation. """
    return [
        {'seconds': 600, 'pdd': 10000, 'answer_time': 500, 'start_nuber': 10, 'start_attempt': 20, 'start_uniq_attempt': 15},
        {'seconds': 300, 'pdd': 5000, 'answer_time': 250, 'start_nuber': 5, 'start_attempt': 10, 'start_uniq_attempt': 8},
    ]

@pytest.fixture
def groupable_rows():
    """ Rows designed for testing grouping logic. """
    return [
        # Group 1: cust1 -> sup1 -> destA
        {'customer': 'cust1', 'supplier': 'sup1', 'destination': 'destA', 'seconds': 600, 'start_nuber': 10, 'start_attempt': 20, 'start_uniq_attempt': 15, 'pdd': 10000, 'answer_time': 500, 'time': '2023-01-01T10:05:00'},
        {'customer': 'cust1', 'supplier': 'sup1', 'destination': 'destA', 'seconds': 600, 'start_nuber': 10, 'start_attempt': 20, 'start_uniq_attempt': 15, 'pdd': 10000, 'answer_time': 500, 'time': '2023-01-01T10:15:00'},
        # Group 2: cust1 -> sup2 -> destA
        {'customer': 'cust1', 'supplier': 'sup2', 'destination': 'destA', 'seconds': 300, 'start_nuber': 2, 'start_attempt': 10, 'start_uniq_attempt': 8, 'pdd': 4000, 'answer_time': 100, 'time': '2023-01-01T11:05:00'},
        # Group 3: cust2 -> sup1 -> destB
        {'customer': 'cust2', 'supplier': 'sup1', 'destination': 'destB', 'seconds': 1200, 'start_nuber': 30, 'start_attempt': 40, 'start_uniq_attempt': 35, 'pdd': 20000, 'answer_time': 1000, 'time': '2023-01-01T10:20:00'},
    ]

# --- Tests for app.utils.metrics.py ---

def test_calculate_metrics_with_data(sample_rows):
    """ Test that calculate_metrics produces correct summary values. """
    result = calculate_metrics(sample_rows)
    assert result['Min'] == 15.0      # (600+300)/60
    assert result['ACD'] == 1.0       # (900 / 15) / 60
    assert result['ASR'] == 50.0      # (15 / 30) * 100
    assert result['SCal'] == 15       # 10 + 5
    assert result['TCall'] == 30      # 20 + 10
    assert result['UCall'] == 23      # 15 + 8
    assert result['AvPDD'] == 7.5     # ((10000 + 5000) / 2) / 1000
    assert result['ATime'] == 375.0   # (500 + 250) / 2

def test_calculate_metrics_empty():
    """ Test that calculate_metrics handles empty input gracefully. """
    result = calculate_metrics([])
    assert result['TCall'] == 0
    assert result['Min'] == 0.0

def test_calculate_metrics_with_zero_division():
    """ Test edge case for zero division. """
    rows = [{'seconds': 600, 'start_nuber': 0, 'start_attempt': 0, 'start_uniq_attempt': 0, 'pdd': 0, 'answer_time': 0}]
    result = calculate_metrics(rows)
    assert result['ACD'] == 0.0
    assert result['ASR'] == 0.0

# --- Tests for app.utils.grouped.py ---

def test_calculate_grouped_metrics_standard(groupable_rows):
    """ Test standard grouping (by customer). """
    result = calculate_grouped_metrics(groupable_rows, reverse=False)
    
    # Check main rows (aggregated by customer)
    assert len(result['main_rows']) == 2
    cust1_main = next(r for r in result['main_rows'] if r['main'] == 'cust1')
    assert cust1_main['TCall'] == 50 # (20+20) + 10
    assert cust1_main['SCall'] == 22 # (10+10) + 2
    assert round(cust1_main['ASR'], 1) == 44.0 # (22 / 50) * 100

    # Check peer rows (granularity: customer -> supplier)
    assert len(result['peer_rows']) == 3
    cust1_sup1_peer = next(r for r in result['peer_rows'] if r['main'] == 'cust1' and r['peer'] == 'sup1')
    assert cust1_sup1_peer['TCall'] == 40 # 20+20
    assert cust1_sup1_peer['SCall'] == 20 # 10+10
    assert round(cust1_sup1_peer['ACD'], 1) == 1.0 # (1200 / 20) / 60

def test_calculate_grouped_metrics_reversed(groupable_rows):
    """ Test reversed grouping (by supplier). """
    result = calculate_grouped_metrics(groupable_rows, reverse=True)

    # Check main rows (aggregated by supplier and destination)
    assert len(result['main_rows']) == 3  # <-- ИСПРАВЛЕНО ЗДЕСЬ
    
    # Let's check a specific group to be sure
    sup1_destA_main = next(r for r in result['main_rows'] if r['main'] == 'sup1' and r['destination'] == 'destA')
    assert sup1_destA_main['TCall'] == 40  # 20+20 from two records
    assert sup1_destA_main['SCall'] == 20  # 10+10
    
    sup1_destB_main = next(r for r in result['main_rows'] if r['main'] == 'sup1' and r['destination'] == 'destB')
    assert sup1_destB_main['TCall'] == 40
    assert sup1_destB_main['SCall'] == 30

def test_calculate_hourly_metrics(groupable_rows):
    """ Test grouping by hour. """
    result = calculate_hourly_metrics(groupable_rows, reverse=False)

    # We expect 3 groups because one group has records in the same hour.
    assert len(result) == 3
    
    # Find the group for cust1 -> sup1 in the 10:00 hour
    hour_10_group = next(r for r in result if r['main'] == 'cust1' and r['time'] == '2023-01-01 10:00')
    assert hour_10_group['TCall'] == 40 # 20+20 from two records at 10:05 and 10:15
    assert hour_10_group['SCall'] == 20 # 10+10

    # Find the group for cust1 -> sup2 in the 11:00 hour
    hour_11_group = next(r for r in result if r['main'] == 'cust1' and r['time'] == '2023-01-01 11:00')
    assert hour_11_group['TCall'] == 10
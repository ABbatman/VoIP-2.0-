# tests/unit/test_grouped.py
# Unit tests for grouped metrics calculation
# CRITICAL: Tests business logic for table aggregation

import pytest
from app.utils.grouped import calculate_grouped_metrics


class TestCalculateGroupedMetrics:
    """Test main grouping and aggregation logic."""

    @pytest.fixture
    def sample_rows(self):
        """Sample raw rows from database."""
        return [
            {
                "customer": "CustomerA",
                "supplier": "SupplierX",
                "destination": "US",
                "start_attempt": 100,
                "start_uniq_attempt": 80,
                "start_nuber": 50,  # success calls
                "seconds": 3000,    # 50 minutes total
                "pdd": 2000,        # 2 seconds PDD (will be weighted)
                "answer_time": 10,  # 10 seconds answer time (will be weighted)
            },
            {
                "customer": "CustomerA",
                "supplier": "SupplierX",
                "destination": "US",
                "start_attempt": 50,
                "start_uniq_attempt": 40,
                "start_nuber": 25,
                "seconds": 1500,
                "pdd": 1500,
                "answer_time": 8,
            },
            {
                "customer": "CustomerA",
                "supplier": "SupplierY",
                "destination": "UK",
                "start_attempt": 200,
                "start_uniq_attempt": 150,
                "start_nuber": 100,
                "seconds": 6000,
                "pdd": 3000,
                "answer_time": 12,
            },
        ]

    def test_returns_dict_with_main_and_peer_rows(self, sample_rows):
        """Result should have main_rows and peer_rows keys."""
        result = calculate_grouped_metrics(sample_rows)
        assert "main_rows" in result
        assert "peer_rows" in result
        assert isinstance(result["main_rows"], list)
        assert isinstance(result["peer_rows"], list)

    def test_peer_rows_grouping(self, sample_rows):
        """Peer rows should be grouped by (main, peer, destination)."""
        result = calculate_grouped_metrics(sample_rows)
        peer_rows = result["peer_rows"]
        
        # Should have 2 distinct peer groups:
        # (CustomerA, SupplierX, US) and (CustomerA, SupplierY, UK)
        assert len(peer_rows) == 2

    def test_main_rows_grouping(self, sample_rows):
        """Main rows should be grouped by (main, destination)."""
        result = calculate_grouped_metrics(sample_rows)
        main_rows = result["main_rows"]
        
        # Should have 2 distinct main groups:
        # (CustomerA, US) and (CustomerA, UK)
        assert len(main_rows) == 2

    def test_peer_row_metrics_calculation(self, sample_rows):
        """Test that peer row metrics are calculated correctly."""
        result = calculate_grouped_metrics(sample_rows)
        peer_rows = result["peer_rows"]
        
        # Find the (CustomerA, SupplierX, US) group
        us_peer = next((r for r in peer_rows if r["destination"] == "US"), None)
        assert us_peer is not None
        
        # Sum of rows for this group:
        # attempts: 100 + 50 = 150
        # success: 50 + 25 = 75
        # seconds: 3000 + 1500 = 4500
        assert us_peer["TCall"] == 150
        assert us_peer["SCall"] == 75
        # Min = 4500 / 60 = 75.0
        assert us_peer["Min"] == 75.0
        # ASR = 75 / 150 * 100 = 50.0%
        assert us_peer["ASR"] == 50.0
        # ACD = 4500 / 75 / 60 = 1.0 minute
        assert us_peer["ACD"] == 1.0

    def test_main_row_aggregation(self, sample_rows):
        """Test that main rows aggregate from peer rows correctly."""
        result = calculate_grouped_metrics(sample_rows)
        main_rows = result["main_rows"]
        
        # Find the (CustomerA, US) group
        us_main = next((r for r in main_rows if r["destination"] == "US"), None)
        assert us_main is not None
        
        # This should aggregate the (CustomerA, SupplierX, US) peer group
        assert us_main["TCall"] == 150
        assert us_main["SCall"] == 75

    def test_reverse_mode(self, sample_rows):
        """In reverse mode, customer and supplier roles are swapped."""
        result = calculate_grouped_metrics(sample_rows, reverse=True)
        peer_rows = result["peer_rows"]
        
        # In reverse mode: main = supplier, peer = customer
        # Check that the structure is correct
        for row in peer_rows:
            assert "main" in row
            assert "peer" in row
            assert "destination" in row

    def test_empty_rows(self):
        """Empty input should return empty lists."""
        result = calculate_grouped_metrics([])
        assert result["main_rows"] == []
        assert result["peer_rows"] == []

    def test_missing_fields_handled(self):
        """Rows with missing fields should be handled gracefully."""
        rows = [
            {
                "customer": "CustomerA",
                "supplier": "SupplierX",
                "destination": "US",
                # Missing numeric fields - should default to 0
            }
        ]
        result = calculate_grouped_metrics(rows)
        assert len(result["peer_rows"]) == 1
        peer_row = result["peer_rows"][0]
        assert peer_row["TCall"] == 0
        assert peer_row["SCall"] == 0
        assert peer_row["Min"] == 0.0

    def test_pdd_weighted_calculation(self, sample_rows):
        """Test that PDD is calculated using weighted average."""
        result = calculate_grouped_metrics(sample_rows)
        peer_rows = result["peer_rows"]
        
        us_peer = next((r for r in peer_rows if r["destination"] == "US"), None)
        assert us_peer is not None
        
        # PDD weighted: (2000 * 80 + 1500 * 40) / (80 + 40) / 1000
        # = (160000 + 60000) / 120 / 1000 = 220000 / 120000 = 1.833... -> 1.8
        expected_pdd = round((2000 * 80 + 1500 * 40) / (80 + 40) / 1000, 1)
        assert us_peer["PDD"] == expected_pdd


class TestRegressionGroupedMetrics:
    """Regression tests with known production-like data."""

    def test_realistic_telecom_data(self):
        """Test with realistic telecom metrics."""
        rows = [
            {
                "customer": "VoIP_Corp",
                "supplier": "Carrier_A",
                "destination": "Mobile_US",
                "start_attempt": 10000,
                "start_uniq_attempt": 8000,
                "start_nuber": 4500,  # 45% ASR
                "seconds": 270000,    # 4500 minutes = 1 min ACD
                "pdd": 2500,
                "answer_time": 15,
            },
            {
                "customer": "VoIP_Corp",
                "supplier": "Carrier_B",
                "destination": "Mobile_US",
                "start_attempt": 5000,
                "start_uniq_attempt": 4000,
                "start_nuber": 2000,  # 40% ASR
                "seconds": 120000,    # 2000 minutes = 1 min ACD
                "pdd": 3000,
                "answer_time": 18,
            },
        ]
        
        result = calculate_grouped_metrics(rows)
        
        # Main aggregate for (VoIP_Corp, Mobile_US)
        main_rows = result["main_rows"]
        assert len(main_rows) == 1
        
        main = main_rows[0]
        # Total: 15000 attempts, 6500 success
        assert main["TCall"] == 15000
        assert main["SCall"] == 6500
        # ASR = 6500/15000 * 100 = 43.3%
        assert main["ASR"] == 43.3
        # Min = 390000 seconds / 60 = 6500 minutes
        assert main["Min"] == 6500.0
        # ACD = 390000 / 6500 / 60 = 1.0
        assert main["ACD"] == 1.0

#!/usr/bin/env python3
"""
Integration test script for VoIP application.
Run after deployment to verify all endpoints are working.

Usage:
    python integration_test.py [base_url]
    
    base_url: Optional, defaults to http://127.0.0.1:8888
    
Examples:
    python integration_test.py
    python integration_test.py http://prod-server.com:8000
"""

import sys
import time
from datetime import datetime, timedelta

try:
    import requests
except ImportError:
    print("ERROR: 'requests' library not installed.")
    print("Install with: pip install requests")
    sys.exit(1)


# Configuration
DEFAULT_BASE_URL = "http://127.0.0.1:8888"
TIMEOUT_SECONDS = 10


def test_endpoint(session: requests.Session, name: str, url: str, expected_status: int = 200) -> bool:
    """Test a single endpoint."""
    try:
        start = time.time()
        response = session.get(url, timeout=TIMEOUT_SECONDS)
        elapsed = (time.time() - start) * 1000
        
        if response.status_code == expected_status:
            print(f"  ✅ {name}: {response.status_code} ({elapsed:.0f}ms)")
            return True
        else:
            print(f"  ❌ {name}: Expected {expected_status}, got {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print(f"  ❌ {name}: Connection refused")
        return False
    except requests.exceptions.Timeout:
        print(f"  ❌ {name}: Timeout after {TIMEOUT_SECONDS}s")
        return False
    except Exception as e:
        print(f"  ❌ {name}: {type(e).__name__}: {e}")
        return False


def run_tests(base_url: str) -> bool:
    """Run all integration tests."""
    print(f"\n{'='*60}")
    print(f"VoIP Integration Test")
    print(f"Base URL: {base_url}")
    print(f"Time: {datetime.now().isoformat()}")
    print(f"{'='*60}\n")
    
    session = requests.Session()
    results = []
    
    # === Health Endpoints ===
    print("Health Endpoints:")
    results.append(test_endpoint(session, "Liveness", f"{base_url}/health/live"))
    results.append(test_endpoint(session, "Readiness", f"{base_url}/health/ready"))
    results.append(test_endpoint(session, "Full Health", f"{base_url}/health"))
    results.append(test_endpoint(session, "Database Health", f"{base_url}/health/db"))
    print()
    
    # === Suggest API ===
    print("Suggest API:")
    results.append(test_endpoint(session, "Suggest Customer", f"{base_url}/api/suggest/customer"))
    results.append(test_endpoint(session, "Suggest Supplier", f"{base_url}/api/suggest/supplier"))
    results.append(test_endpoint(session, "Suggest Destination", f"{base_url}/api/suggest/destination"))
    results.append(test_endpoint(session, "Suggest with Query", f"{base_url}/api/suggest/customer?q=A&limit=5"))
    print()
    
    # === Metrics API ===
    print("Metrics API:")
    now = datetime.utcnow()
    yesterday = now - timedelta(days=1)
    time_from = yesterday.strftime("%Y-%m-%dT00:00:00Z")
    time_to = now.strftime("%Y-%m-%dT23:59:59Z")
    
    metrics_url = f"{base_url}/api/metrics?from={time_from}&to={time_to}"
    results.append(test_endpoint(session, "Metrics Report", metrics_url))
    print()
    
    # === State API ===
    print("State API:")
    # Test POST state
    try:
        start = time.time()
        state_response = session.post(
            f"{base_url}/api/state",
            json={"test": "data", "timestamp": datetime.now().isoformat()},
            timeout=TIMEOUT_SECONDS
        )
        elapsed = (time.time() - start) * 1000
        
        if state_response.status_code == 201:
            state_id = state_response.json().get("id", "")
            print(f"  ✅ Save State: 201 ({elapsed:.0f}ms) - ID: {state_id}")
            results.append(True)
            
            # Test GET state with the returned ID
            results.append(test_endpoint(session, "Load State", f"{base_url}/api/state/{state_id}"))
        else:
            print(f"  ❌ Save State: Expected 201, got {state_response.status_code}")
            results.append(False)
    except Exception as e:
        print(f"  ❌ Save State: {type(e).__name__}: {e}")
        results.append(False)
    print()
    
    # === Static Assets ===
    print("Static Assets:")
    results.append(test_endpoint(session, "Root Page", f"{base_url}/"))
    results.append(test_endpoint(session, "Favicon", f"{base_url}/favicon.ico", expected_status=204))
    print()
    
    # === Jobs API ===
    print("Jobs API:")
    results.append(test_endpoint(session, "Jobs Metrics", f"{base_url}/api/jobs/metrics"))
    print()
    
    # === Summary ===
    passed = sum(results)
    total = len(results)
    
    print(f"{'='*60}")
    print(f"Results: {passed}/{total} passed")
    
    if passed == total:
        print("✅ All tests passed!")
        return True
    else:
        print(f"❌ {total - passed} test(s) failed")
        return False


def main():
    base_url = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_BASE_URL
    
    # Remove trailing slash
    base_url = base_url.rstrip("/")
    
    success = run_tests(base_url)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()

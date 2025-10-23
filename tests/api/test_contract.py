# tests/api/test_contract.py
# Contract tests using Schemathesis against the running Tornado app.
# - Loads OpenAPI spec from app/openapi.yaml
# - Executes generated requests for each operation & validates responses
# - Base URL can be overridden via BASE_URL env var (default: http://127.0.0.1:8888)

import os
import pytest  # type: ignore[import-not-found]

# Guard schemathesis via pytest.importorskip to avoid hard import
st = pytest.importorskip("schemathesis", reason="schemathesis is not installed")

# Load OpenAPI spec from file
SPEC_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "app", "openapi.yaml")
BASE_URL = os.getenv("BASE_URL", "http://127.0.0.1:8888")

schema = st.from_path(SPEC_PATH).configure(base_url=BASE_URL)


@pytest.mark.openapi
@schema.parametrize()
def test_api_contract(case):
    # Will call the API endpoint and validate against the schema
    case.call_and_validate()

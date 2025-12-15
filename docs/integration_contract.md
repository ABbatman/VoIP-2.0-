# Integration Contract

VoIP Metrics API integration documentation for CentOS legacy system deployment.

## Application Overview

| Property | Value |
|----------|-------|
| **Default Port** | `8888` |
| **Base URL** | `http://{HOST}:{PORT}` |
| **API Prefix** | `/api` |

---

## Configuration Parameters

All parameters are read from environment variables or `.env` file.

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DB_URL` | PostgreSQL connection URL | `postgresql://localhost:5432/aggregation` | Yes |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379/0` | No |
| `HOST` | Server bind address | `127.0.0.1` | No |
| `PORT` | Server bind port | `8888` | No |
| `DEBUG` | Enable debug mode | `False` | No |
| `LOG_LEVEL` | Logging level | `INFO` | No |

---

## API Endpoints

### Health Checks

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Full health status with component checks |
| `/health/live` | GET | Liveness probe (always returns 200 if running) |
| `/health/ready` | GET | Readiness probe (checks database) |
| `/health/db` | GET | Detailed database pool statistics |

**Response Example (`/health`)**:
```json
{
  "status": "healthy",
  "timestamp": 1702656000.0,
  "version": "1.0.0",
  "checks": {
    "database": {
      "status": "healthy",
      "latency_ms": 2.5,
      "message": "Pool: 18/20 connections free"
    }
  }
}
```

---

### Suggest API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/suggest/{kind}` | GET | Autocomplete for customer/supplier/destination |

**Parameters**:
- `kind`: `customer` | `supplier` | `destination`
- `q` (query): Prefix filter (optional)
- `limit`: Max results 1-500 (default: 100)

**Request**:
```
GET /api/suggest/customer?q=Tel&limit=10
```

**Response**:
```json
{
  "items": ["Telecom A", "Telecom B", "TeleSystems"]
}
```

---

### Metrics API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/metrics` | GET | Aggregated metrics report |
| `/api/metrics` | POST | Create new metric record |
| `/api/metrics/page` | GET | Paginated metrics list |
| `/api/metrics/{id}` | DELETE | Delete metric by ID |

**GET `/api/metrics` Parameters**:
- `customer`: Filter by customer (optional)
- `supplier`: Filter by supplier (optional)
- `destination`: Filter by destination (optional)
- `from`: Start datetime (required, ISO 8601)
- `to`: End datetime (required, ISO 8601)
- `reverse`: Swap customer/supplier roles (default: false)

**Request**:
```
GET /api/metrics?from=2024-12-15T00:00:00Z&to=2024-12-15T23:59:59Z&customer=Acme
```

**Response**:
```json
{
  "today_metrics": {
    "Min": 1250.5,
    "ACD": 180.2,
    "ASR": 65.5,
    "SCall": 1200,
    "TCall": 1832
  },
  "yesterday_metrics": {...},
  "main_rows": [...],
  "peer_rows": [...],
  "hourly_rows": [...],
  "labels": {...}
}
```

---

### Jobs API (Background Tasks)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/jobs/report` | POST | Enqueue report generation job |
| `/api/jobs/{task_id}` | GET | Get job status |
| `/api/jobs/metrics` | GET | Jobs queue statistics |

**POST `/api/jobs/report` Body**:
```json
{
  "customer": "Acme",
  "supplier": "TelcoB",
  "hours": 24
}
```

**Response**:
```json
{
  "task_id": "abc123-def456"
}
```

---

## Required External Services

| Service | Port | Purpose |
|---------|------|---------|
| PostgreSQL | 5432 | Primary database |
| Redis | 6379 | Caching & job queue |

---

## Deployment Quick Start

```bash
# 1. Setup environment
bash setup_env.sh

# 2. Configure
cp .env.example .env
vim .env  # Edit with production values

# 3. Start (manual)
bash start.sh gunicorn

# 4. Or install as systemd service
sudo cp voip.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now voip
```

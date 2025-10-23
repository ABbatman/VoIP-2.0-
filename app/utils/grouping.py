from app.utils.logger import log_info

def build_where_clause(customer=None, supplier=None, destination=None, time_from=None, time_to=None):

    clauses = []
    params = []

    if customer:
        # Support wildcard patterns: if user includes % or _ use ILIKE
        if "%" in customer or "_" in customer:
            clauses.append("customer ILIKE %s")
        else:
            clauses.append("customer = %s")
        params.append(customer)

    if supplier:
        if "%" in supplier or "_" in supplier:
            clauses.append("supplier ILIKE %s")
        else:
            clauses.append("supplier = %s")
        params.append(supplier)

    if destination:
        if "%" in destination or "_" in destination:
            clauses.append("destination ILIKE %s")
        else:
            clauses.append("destination = %s")
        params.append(destination)

    if time_from and time_to:
        clauses.append("time BETWEEN %s AND %s")
        params.extend([time_from, time_to])

    where_sql = "WHERE " + " AND ".join(clauses) if clauses else ""

    log_info(f"🔍 WHERE clause: {where_sql}")
    log_info(f"📦 Parameters: {params}")

    return where_sql, tuple(params)
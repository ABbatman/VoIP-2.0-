# tests/architecture/test_architecture.py
# Architecture tests enforcing layering rules.
# - domain must not import infrastructure
# - controllers must not contain SQL
# - application depends only on domain, and domain must not depend on application
#
# The tests are resilient: if a package is absent (e.g., no `domain/`),
# they will skip instead of failing. Additionally, we treat Tornado handlers
# in `app/handlers/` as controllers.

import os
import sys
import ast
import pathlib
import re
import pytest  # type: ignore[import-not-found]

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]


def _pkg_path(pkg_name: str) -> pathlib.Path | None:
    p = REPO_ROOT / pkg_name
    return p if p.exists() and p.is_dir() else None


def _iter_py_files(root: pathlib.Path):
    for path in root.rglob("*.py"):
        # skip virtualenv & build outputs
        parts = {"venv", ".venv", "node_modules", "__pycache__"}
        if any(part in parts for part in path.parts):
            continue
        yield path


def _collect_imports(py_path: pathlib.Path) -> set[str]:
    """Return set of imported top-level module names from file."""
    try:
        src = py_path.read_text(encoding="utf-8")
    except Exception:
        return set()
    try:
        tree = ast.parse(src, filename=str(py_path))
    except SyntaxError:
        return set()
    imports: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                top = alias.name.split(".")[0]
                imports.add(top)
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                top = node.module.split(".")[0]
                imports.add(top)
    return imports


def _file_contains_sql(py_path: pathlib.Path) -> bool:
    """Heuristic to detect raw SQL or ORM query construction in controllers."""
    try:
        text = py_path.read_text(encoding="utf-8")
    except Exception:
        return False
    # Raw SQL keywords
    sql_patterns = [
        r"\bSELECT\b",
        r"\bINSERT\b",
        r"\bUPDATE\b",
        r"\bDELETE\b",
        r"\bJOIN\b",
        r"\bFROM\b",
    ]
    if any(re.search(p, text, flags=re.IGNORECASE) for p in sql_patterns):
        return True
    # Direct DB libs in controllers are not allowed
    bad_imports = {"sqlalchemy", "asyncpg", "psycopg2"}
    return any(top in _collect_imports(py_path) for top in bad_imports)


# ---------- Tests ----------

@pytest.mark.architecture
def test_domain_does_not_import_infrastructure():
    domain = _pkg_path("domain")
    if not domain:
        pytest.skip("No domain package in repo; skipping")
    infra = _pkg_path("infrastructure")
    # Even if infra is missing, rule still makes sense (no import should exist)
    for f in _iter_py_files(domain):
        imports = _collect_imports(f)
        assert "infrastructure" not in imports, f"domain must not import infrastructure: {f}"


@pytest.mark.architecture
def test_controllers_do_not_contain_sql():
    controllers_root = _pkg_path("controllers")
    handlers_root = REPO_ROOT / "app" / "handlers"
    if not controllers_root and not handlers_root.exists():
        pytest.skip("No controllers or app/handlers; skipping")

    roots = [p for p in [controllers_root, handlers_root] if p]
    offenders: list[pathlib.Path] = []
    for root in roots:
        for f in _iter_py_files(root):
            if _file_contains_sql(f):
                offenders.append(f)
    assert not offenders, "Controllers must not contain SQL; offending files:\n" + "\n".join(map(str, offenders))


@pytest.mark.architecture
def test_application_only_depends_on_domain_and_domain_not_on_application():
    application = _pkg_path("application")
    domain = _pkg_path("domain")
    if not application and not domain:
        pytest.skip("No application/domain packages; skipping")

    if application:
        for f in _iter_py_files(application):
            imports = _collect_imports(f)
            # Application can import domain, but should avoid importing infrastructure directly
            assert "infrastructure" not in imports, f"application should not import infrastructure directly: {f}"

    if domain:
        for f in _iter_py_files(domain):
            imports = _collect_imports(f)
            assert "application" not in imports, f"domain must not depend on application: {f}"

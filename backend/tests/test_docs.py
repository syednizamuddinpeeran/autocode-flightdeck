"""Guards that docs/*.md keep matching the code, scripts and config they describe."""

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

from flightdeck.main import app

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs"
CHECKED_DOCS = ["installation.md", "usage.md", "architecture.md"]
FACTORY = ROOT / "scripts" / "factory"
MAIN_PY = ROOT / "backend" / "flightdeck" / "main.py"
VITE_CONFIG = ROOT / "frontend" / "vite.config.ts"
VITE_DEFAULT_PORT = "5173"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _doc(name: str) -> str:
    return _read(DOCS / name)


def _all_doc_files() -> list[Path]:
    files = sorted(DOCS.glob("*.md"))
    readme = ROOT / "README.md"
    if readme.exists():
        files.append(readme)
    return files


def _main_constants() -> tuple[str, str]:
    src = _read(MAIN_PY)
    host = re.search(r'^DEFAULT_HOST\s*=\s*"([^"]+)"', src, re.M)
    port = re.search(r"^DEFAULT_PORT\s*=\s*(\d+)", src, re.M)
    assert host and port, "DEFAULT_HOST / DEFAULT_PORT not found in main.py"
    return host.group(1), port.group(1)


def _proxy_target() -> str:
    match = re.search(r'proxy:\s*\{\s*"/api":\s*"([^"]+)"', _read(VITE_CONFIG))
    assert match, "api proxy target not found in vite.config.ts"
    return match.group(1)


def _norm_route(path: str) -> str:
    return re.sub(r"\{[^}]*\}", "{}", path)


def test_ports_and_urls_match_code() -> None:
    host, port = _main_constants()
    proxy = _proxy_target()
    assert proxy.endswith(f":{port}"), "vite proxy port differs from DEFAULT_PORT"
    assert f"{host}:{port}" in _doc("installation.md")
    for name in CHECKED_DOCS:
        text = _doc(name)
        for found_host, found_port in re.findall(r"(localhost|127\.0\.0\.1):(\d+)", text):
            assert found_port in {port, VITE_DEFAULT_PORT}, (
                f"{name}: unexpected URL {found_host}:{found_port}"
            )
    assert proxy in _doc("installation.md")
    assert f"localhost:{port}" in _doc("architecture.md")
    assert f"localhost:{VITE_DEFAULT_PORT}" in _doc("installation.md")


def test_api_routes_exist() -> None:
    routes = {_norm_route(path) for path in app.openapi()["paths"]}
    assert "/api/health" in routes
    for name in CHECKED_DOCS:
        for path in re.findall(r"/api/[A-Za-z0-9_/{}-]*[A-Za-z0-9_}]", _doc(name)):
            assert _norm_route(path) in routes, f"{name}: no route for {path}"


def test_env_vars_exist() -> None:
    assert "FLIGHTDECK_HOST" in _read(MAIN_PY)
    backend_src = "\n".join(_read(p) for p in (ROOT / "backend" / "flightdeck").glob("*.py"))
    assert "FLIGHTDECK_CONFIG" in backend_src
    docs = "\n".join(_doc(n) for n in CHECKED_DOCS)
    for var in set(re.findall(r"\bFLIGHTDECK_[A-Z_]+\b", docs)):
        assert var in backend_src, f"documented env var {var} not in backend code"


def test_commands_come_from_sources() -> None:
    scripts = json.loads(_read(ROOT / "frontend" / "package.json"))["scripts"]
    commands_env = _read(FACTORY / "commands.env")
    setup_cmd = re.search(r'^SETUP_CMD="(.*)"$', commands_env, re.M)
    assert setup_cmd
    installation = _doc("installation.md")

    for name in CHECKED_DOCS:
        for script in re.findall(r"npm run ([a-z][a-z:-]*)", _doc(name)):
            assert script in scripts, f"{name}: npm script {script} missing"
    for cmd in ("uv sync --all-extras", "npm ci"):
        assert cmd in installation
        assert cmd in setup_cmd.group(1)
    for script_name in ("setup.sh", "check.sh"):
        assert f"bash scripts/factory/{script_name}" in installation
        assert (FACTORY / script_name).is_file()
    assert "python -m flightdeck.main" in installation
    assert '__name__ == "__main__"' in _read(MAIN_PY)


def test_script_table_matches_folder() -> None:
    text = _doc("architecture.md")
    section = text.split("## Scripts in `scripts/factory/`", 1)[1]
    documented = set(re.findall(r"^\| `([\w.-]+\.(?:sh|env|txt))`", section, re.M))
    assert documented, "scripts table not found"
    on_disk = {p.name for p in FACTORY.iterdir() if p.suffix in {".sh", ".env", ".txt"}}
    assert documented == on_disk


PERSONAL_PATHS = [
    re.compile(r"/home/([^/\s`'\"]+)"),
    re.compile(r"/Users/([^/\s`'\"]+)"),
    re.compile(r"[A-Za-z]:\\Users\\([^\\\s`'\"]+)"),
]
SECRET_PATTERNS = [
    re.compile(r"ghp_[A-Za-z0-9]{10,}"),
    re.compile(r"github_pat_[A-Za-z0-9_]{10,}"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{10,}"),
    re.compile(r"\bAKIA[0-9A-Z]{12,}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY"),
    re.compile(r"(?i)\b(?:password|token)\s*=\s*[\"']?(?!<)[A-Za-z0-9_\-./+]{6,}"),
]


@pytest.mark.parametrize("path", _all_doc_files(), ids=lambda p: p.name)
def test_no_personal_paths(path: Path) -> None:
    text = _read(path)
    for pattern in PERSONAL_PATHS:
        for name in pattern.findall(text):
            assert name.startswith("<") and name.endswith(">"), (
                f"{path.name}: personal path component {name!r}"
            )


@pytest.mark.parametrize("path", _all_doc_files(), ids=lambda p: p.name)
def test_no_secrets(path: Path) -> None:
    text = _read(path)
    for pattern in SECRET_PATTERNS:
        assert not pattern.search(text), f"{path.name}: matches {pattern.pattern}"


def test_theming_unchanged() -> None:
    git = shutil.which("git")
    if git is None:
        pytest.skip("git not available")
    base = "main"
    ref = subprocess.run(
        [git, "rev-parse", "--verify", "--quiet", base],
        cwd=ROOT,
        capture_output=True,
        check=False,
    )
    if ref.returncode != 0:
        pytest.skip("main ref not available")
    diff = subprocess.run(
        [git, "diff", "--quiet", base, "--", "docs/theming.md"],
        cwd=ROOT,
        capture_output=True,
        check=False,
    )
    assert diff.returncode == 0, "docs/theming.md differs from main"


README = ROOT / "README.md"
README_DOCS = ["installation.md", "usage.md", "architecture.md", "theming.md"]


def _headings(text: str) -> list[str]:
    return [m.lower() for m in re.findall(r"^#{1,6}\s+(.+?)\s*$", text, re.M)]


def test_readme_exists_with_sections() -> None:
    assert README.is_file(), "README.md missing at repo root"
    text = _read(README)
    headings = _headings(text)
    for section in ("overview", "prerequisites", "quick install", "quick start"):
        assert any(section in h for h in headings), f"README has no '{section}' heading"
    lowered = text.lower()
    assert "wsl" in lowered and "linux" in lowered
    assert "windows" in lowered


def test_readme_links_docs() -> None:
    assert README.is_file(), "README.md missing at repo root"
    text = _read(README)
    for name in README_DOCS:
        assert f"docs/{name}" in text, f"README does not link docs/{name}"
        assert (DOCS / name).is_file(), f"docs/{name} does not exist"


def test_readme_local_use_only() -> None:
    assert README.is_file(), "README.md missing at repo root"
    assert "local use only" in _read(README).lower()

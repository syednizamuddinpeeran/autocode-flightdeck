"""GET /api/repos/{repo}/harness: read-only overview of a repo's harness config."""

import json
import re
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

from flightdeck.repos import _cached_scan

router = APIRouter(prefix="/api/repos")

MASKED = "********"
_SECRET_KEY = re.compile(r"KEY|TOKEN|SECRET|PASSWORD", re.IGNORECASE)


def _read(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None


def _front_matter(text: str) -> dict[str, str]:
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}
    data: dict[str, str] = {}
    for line in lines[1:]:
        if line.strip() == "---":
            break
        key, sep, value = line.partition(":")
        if sep and not line.startswith((" ", "\t")):
            data[key.strip()] = value.strip().strip("\"'")
    return data


def _agents(root: Path) -> list[dict[str, Any]]:
    agents: list[dict[str, Any]] = []
    for sub in (".claude/agents", ".github/agents"):
        for file in sorted((root / sub).glob("*.md")):
            text = _read(file)
            if text is None:
                continue
            meta = _front_matter(text)
            tools = [t.strip() for t in meta.get("tools", "").strip("[]").split(",")]
            agents.append(
                {
                    "name": meta.get("name") or file.stem,
                    "description": meta.get("description", ""),
                    "tools": [t.strip("\"' ") for t in tools if t.strip("\"' ")],
                    "source": sub,
                }
            )
    return agents


def _skills(root: Path) -> list[dict[str, str]]:
    skills: list[dict[str, str]] = []
    for sub in (".claude/skills", ".github/skills"):
        for file in sorted((root / sub).glob("*/SKILL.md")):
            text = _read(file)
            if text is None:
                continue
            meta = _front_matter(text)
            skills.append(
                {
                    "name": meta.get("name") or file.parent.name,
                    "description": meta.get("description", ""),
                }
            )
    return skills


def _load_json(path: Path) -> dict[str, Any]:
    text = _read(path)
    if text is None:
        return {}
    try:
        data = json.loads(text)
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


def _hook_entry(event: str, hook: Any) -> dict[str, Any] | None:
    """Normalise one Claude or Copilot hook definition."""
    if not isinstance(hook, dict):
        return None
    args = hook.get("args")
    if isinstance(args, list) and hook.get("command"):
        script = " ".join([str(hook["command"]), *(str(a) for a in args)])
    else:
        script = str(hook.get("command") or hook.get("bash") or hook.get("powershell") or "")
    timeout = hook.get("timeout", hook.get("timeoutSec"))
    return {
        "event": event,
        "script": script,
        "timeout": timeout if isinstance(timeout, int | float) else None,
    }


def _hooks(root: Path) -> list[dict[str, Any]]:
    sources = [_load_json(root / ".claude" / "settings.json")]
    sources += [_load_json(f) for f in sorted((root / ".github" / "hooks").glob("*.json"))]
    result: list[dict[str, Any]] = []
    for data in sources:
        events = data.get("hooks")
        if not isinstance(events, dict):
            continue
        for event, entries in events.items():
            for entry in entries if isinstance(entries, list) else []:
                nested = entry.get("hooks") if isinstance(entry, dict) else None
                for hook in nested if isinstance(nested, list) else [entry]:
                    item = _hook_entry(str(event), hook)
                    if item:
                        result.append(item)
    return result


def _rules(path: Path) -> dict[str, Any]:
    text = _read(path)
    if text is None:
        return {"text": "", "count": 0}
    count = sum(1 for ln in text.splitlines() if ln.strip() and not ln.lstrip().startswith("#"))
    return {"text": text, "count": count}


def _env_pairs(path: Path) -> list[dict[str, str]]:
    text = _read(path)
    pairs: list[dict[str, str]] = []
    for line in (text or "").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, sep, value = line.removeprefix("export ").partition("=")
        key = key.strip()
        if not sep or not key:
            continue
        value = value.strip().strip("\"'")
        pairs.append({"key": key, "value": MASKED if _SECRET_KEY.search(key) else value})
    return pairs


def build_harness(root: Path) -> dict[str, Any]:
    policy = root / ".github" / "hooks" / "policy"
    factory = root / "scripts" / "factory"
    return {
        "agents": _agents(root),
        "skills": _skills(root),
        "hooks": _hooks(root),
        "deny_commands": _rules(policy / "deny-commands.txt"),
        "deny_paths": _rules(policy / "deny-paths.txt"),
        "commands": _env_pairs(factory / "commands.env"),
        "complexity": _env_pairs(factory / "complexity.env"),
    }


@router.get("/{repo}/harness")
def get_harness(repo: str) -> dict[str, Any]:
    for item in _cached_scan()["repos"]:
        if item["id"] == repo:
            return build_harness(Path(item["path"]))
    raise HTTPException(status_code=404, detail="Unknown repo")

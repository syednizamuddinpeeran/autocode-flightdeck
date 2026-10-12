from typing import Any

import pytest
import uvicorn

from flightdeck import main


def test_default_host_is_loopback(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("FLIGHTDECK_HOST", raising=False)
    assert main.get_host() == "127.0.0.1"


def test_run_binds_default_host(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("FLIGHTDECK_HOST", raising=False)
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(uvicorn, "run", lambda app, **kw: calls.append(kw))
    main.run()
    assert calls[0]["host"] == "127.0.0.1"


def test_host_override_via_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FLIGHTDECK_HOST", "0.0.0.0")
    assert main.get_host() == "0.0.0.0"

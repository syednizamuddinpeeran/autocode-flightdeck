import os
from pathlib import Path

import pytest

from flightdeck import paths
from flightdeck.paths import InvalidPathError, translate_windows_path, validate_folder_path


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("C:\\Users\\me\\code", "/mnt/c/Users/me/code"),
        ("C:/Users/me/code", "/mnt/c/Users/me/code"),
        ("c:\\Users\\me\\code", "/mnt/c/Users/me/code"),
        ("D:\\x", "/mnt/d/x"),
    ],
)
def test_translate_backslash_and_slash(raw: str, expected: str) -> None:
    assert translate_windows_path(raw) == expected


def test_translate_leaves_posix_path() -> None:
    assert translate_windows_path("/home/me") == "/home/me"


def test_windows_path_rejected_off_wsl(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(paths, "is_wsl", lambda: False)
    with pytest.raises(InvalidPathError, match="Windows"):
        validate_folder_path("C:\\Users\\me\\code")


def test_missing_path(tmp_path: Path) -> None:
    with pytest.raises(InvalidPathError, match="does not exist"):
        validate_folder_path(str(tmp_path / "nope"))


def test_not_a_directory(tmp_path: Path) -> None:
    f = tmp_path / "f.txt"
    f.write_text("x")
    with pytest.raises(InvalidPathError, match="not a directory"):
        validate_folder_path(str(f))


@pytest.mark.skipif(os.geteuid() == 0, reason="root ignores permissions")
def test_unreadable(tmp_path: Path) -> None:
    d = tmp_path / "locked"
    d.mkdir()
    d.chmod(0)
    try:
        with pytest.raises(InvalidPathError, match="not readable"):
            validate_folder_path(str(d))
    finally:
        d.chmod(0o700)


def test_valid_dir_returned(tmp_path: Path) -> None:
    assert validate_folder_path(str(tmp_path)) == str(tmp_path)


def test_wsl_translated_path_is_validated(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    (tmp_path / "c" / "Users" / "me" / "code").mkdir(parents=True)
    monkeypatch.setattr(paths, "is_wsl", lambda: True)
    monkeypatch.setattr(paths, "WSL_MOUNT_ROOT", str(tmp_path))
    result = validate_folder_path("C:\\Users\\me\\code")
    assert result == str(tmp_path / "c" / "Users" / "me" / "code")

"""Folder path validation and Windows path translation for WSL."""

import os
import re

WSL_MOUNT_ROOT = "/mnt"

_WINDOWS_PATH = re.compile(r"^([A-Za-z]):[\\/]*(.*)$")


class InvalidPathError(Exception):
    """Raised when a folder path cannot be used; the message is the reason."""


def is_wsl() -> bool:
    if os.environ.get("WSL_DISTRO_NAME"):
        return True
    try:
        with open("/proc/version", encoding="utf-8") as f:
            return "microsoft" in f.read().lower()
    except OSError:
        return False


def _is_windows_path(raw: str) -> bool:
    return _WINDOWS_PATH.match(raw) is not None


def translate_windows_path(raw: str) -> str:
    """Map `C:\\x` or `C:/x` to `/mnt/c/x`; other paths are returned unchanged."""
    match = _WINDOWS_PATH.match(raw)
    if match is None:
        return raw
    drive, rest = match.groups()
    rest = rest.replace("\\", "/").strip("/")
    base = f"{WSL_MOUNT_ROOT}/{drive.lower()}"
    return f"{base}/{rest}" if rest else base


def validate_folder_path(raw: str) -> str:
    """Return the usable path (translated on WSL) or raise InvalidPathError."""
    path = raw
    if _is_windows_path(raw):
        if not is_wsl():
            raise InvalidPathError("Windows-style paths are only supported when running on WSL")
        path = translate_windows_path(raw)
    if not os.path.exists(path):
        raise InvalidPathError(f"Path does not exist: {path}")
    if not os.path.isdir(path):
        raise InvalidPathError(f"Path is not a directory: {path}")
    if not os.access(path, os.R_OK | os.X_OK):
        raise InvalidPathError(f"Path is not readable: {path}")
    return path

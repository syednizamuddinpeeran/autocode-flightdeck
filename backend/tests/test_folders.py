from pathlib import Path

import pytest

from flightdeck import folders


@pytest.fixture(autouse=True)
def config_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "cfg" / "config.json"
    monkeypatch.setenv("FLIGHTDECK_CONFIG", str(path))
    return path


def test_store_add_then_list() -> None:
    added = folders.add_folder("/a/b")
    assert added["path"] == "/a/b"
    assert added["id"]
    assert folders.list_folders() == [added]


def test_config_file_created_on_first_add(config_file: Path) -> None:
    assert folders.list_folders() == []
    assert not config_file.exists()
    folders.add_folder("/a/b")
    assert config_file.exists()


@pytest.mark.parametrize("dup", ["/a/b/", "/a/./b", "/a/c/../b"])
def test_store_duplicate_normalised(dup: str) -> None:
    folders.add_folder("/a/b")
    with pytest.raises(folders.DuplicateFolderError):
        folders.add_folder(dup)
    assert len(folders.list_folders()) == 1


def test_store_persists_across_reload() -> None:
    added = folders.add_folder("/a/b")
    assert folders.list_folders() == [added]


def test_default_config_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("FLIGHTDECK_CONFIG")
    monkeypatch.setenv("HOME", str(tmp_path))
    assert folders.config_path() == tmp_path / ".config" / "flightdeck" / "config.json"

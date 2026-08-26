"""First-run bootstrapping: a fresh clone has no watcher/config.json yet, and
a friend who skipped the manual copy step shouldn't hit a crash instead."""

import json

import watcher as w


def test_load_config_creates_missing_config_from_example(tmp_path, monkeypatch):
    example = tmp_path / "config.example.json"
    example.write_text(json.dumps({"companies": [], "filters": {}, "marker": "example"}),
                       encoding="utf-8")
    cfg_path = tmp_path / "config.json"
    monkeypatch.setattr(w, "CONFIG_PATH", cfg_path)
    monkeypatch.setattr(w, "CONFIG_EXAMPLE_PATH", example)
    monkeypatch.setattr(w, "LOG_PATH", tmp_path / "watcher.log")

    assert not cfg_path.exists()
    cfg = w.load_config()

    assert cfg_path.exists()
    assert cfg == {"companies": [], "filters": {}, "marker": "example"}
    assert "created one from config.example.json" in (tmp_path / "watcher.log").read_text(encoding="utf-8")


def test_load_config_never_overwrites_an_existing_config(tmp_path, monkeypatch):
    example = tmp_path / "config.example.json"
    example.write_text(json.dumps({"companies": ["should-not-appear"], "filters": {}}),
                       encoding="utf-8")
    cfg_path = tmp_path / "config.json"
    cfg_path.write_text(json.dumps({"companies": [], "filters": {}, "marker": "mine"}),
                        encoding="utf-8")
    monkeypatch.setattr(w, "CONFIG_PATH", cfg_path)
    monkeypatch.setattr(w, "CONFIG_EXAMPLE_PATH", example)
    monkeypatch.setattr(w, "LOG_PATH", tmp_path / "watcher.log")

    cfg = w.load_config()

    assert cfg["marker"] == "mine"
    assert json.loads(cfg_path.read_text(encoding="utf-8"))["marker"] == "mine"


def test_load_config_still_raises_when_nothing_to_bootstrap_from(tmp_path, monkeypatch):
    # no config.json AND no example to copy from: still a clear error, not a
    # silent empty run
    monkeypatch.setattr(w, "CONFIG_PATH", tmp_path / "config.json")
    monkeypatch.setattr(w, "CONFIG_EXAMPLE_PATH", tmp_path / "config.example.json")
    monkeypatch.setattr(w, "LOG_PATH", tmp_path / "watcher.log")

    import pytest
    with pytest.raises(FileNotFoundError):
        w.load_config()

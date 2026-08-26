"""scripts/setup.py: the friend-facing bootstrap. Tests exercise its pure
logic and file-creation helpers directly; the real pip/npm subprocess calls
are covered by mocking `run` (see check_node/install_python_deps/build_web)
so this suite never shells out or touches the real repo."""

import subprocess
from types import SimpleNamespace

import pytest

from scripts import setup


def test_check_python_accepts_the_minimum_version():
    setup.check_python(version_info=SimpleNamespace(major=3, minor=11))


def test_check_python_accepts_newer():
    setup.check_python(version_info=SimpleNamespace(major=3, minor=12))


def test_check_python_rejects_too_old():
    with pytest.raises(setup.SetupError, match="3.11"):
        setup.check_python(version_info=SimpleNamespace(major=3, minor=9))


def test_parse_node_major_handles_v_prefix_and_trailing_newline():
    assert setup.parse_node_major("v20.11.1\n") == 20


def test_parse_node_major_handles_no_v_prefix():
    assert setup.parse_node_major("22.0.0") == 22


def test_parse_node_major_rejects_garbage():
    with pytest.raises(setup.SetupError, match="Node.js version"):
        setup.parse_node_major("not-a-version")


def test_check_node_accepts_a_recent_version(monkeypatch):
    monkeypatch.setattr(setup.shutil, "which", lambda name: "/usr/bin/node")
    fake_run = lambda *a, **k: subprocess.CompletedProcess(a, 0, stdout="v20.11.1\n")
    setup.check_node(run=fake_run)


def test_check_node_rejects_an_old_version(monkeypatch):
    monkeypatch.setattr(setup.shutil, "which", lambda name: "/usr/bin/node")
    fake_run = lambda *a, **k: subprocess.CompletedProcess(a, 0, stdout="v16.2.0\n")
    with pytest.raises(setup.SetupError, match="Node.js 20"):
        setup.check_node(run=fake_run)


def test_check_node_fails_plainly_when_node_missing(monkeypatch):
    monkeypatch.setattr(setup.shutil, "which", lambda name: None)
    with pytest.raises(setup.SetupError, match="nodejs.org"):
        setup.check_node()


def test_install_python_deps_fails_plainly_on_pip_error(tmp_path):
    (tmp_path / "requirements.txt").write_text("nonexistent-package-xyz\n", encoding="utf-8")

    def fake_run(cmd, check):
        raise subprocess.CalledProcessError(1, cmd)

    with pytest.raises(setup.SetupError, match="pip install failed"):
        setup.install_python_deps(root=tmp_path, run=fake_run)


def test_ensure_file_from_example_creates_when_missing(tmp_path):
    example = tmp_path / "config.example.json"
    example.write_text("{}", encoding="utf-8")
    target = tmp_path / "config.json"

    created = setup.ensure_file_from_example(target, example, "config.json")

    assert created is True
    assert target.read_text(encoding="utf-8") == "{}"


def test_ensure_file_from_example_never_overwrites(tmp_path):
    example = tmp_path / "config.example.json"
    example.write_text('{"a": 1}', encoding="utf-8")
    target = tmp_path / "config.json"
    target.write_text('{"mine": true}', encoding="utf-8")

    created = setup.ensure_file_from_example(target, example, "config.json")

    assert created is False
    assert target.read_text(encoding="utf-8") == '{"mine": true}'


def test_ensure_file_from_example_fails_plainly_when_example_missing(tmp_path):
    with pytest.raises(setup.SetupError, match="missing from the repo"):
        setup.ensure_file_from_example(tmp_path / "config.json", tmp_path / "no-such-example.json",
                                       "config.json")


def test_bootstrap_config_and_env_are_reruns_safe(tmp_path):
    (tmp_path / "watcher").mkdir()
    (tmp_path / "watcher" / "config.example.json").write_text('{"companies": []}', encoding="utf-8")
    (tmp_path / ".env.example").write_text("GEMINI_API_KEY=x\n", encoding="utf-8")

    setup.bootstrap_config(root=tmp_path)
    setup.bootstrap_env(root=tmp_path)
    assert (tmp_path / "watcher" / "config.json").exists()
    assert (tmp_path / ".env").exists()

    # second run must not blow up or clobber anything
    (tmp_path / ".env").write_text("GEMINI_API_KEY=mine\n", encoding="utf-8")
    setup.bootstrap_env(root=tmp_path)
    assert (tmp_path / ".env").read_text(encoding="utf-8") == "GEMINI_API_KEY=mine\n"


def test_build_web_runs_install_then_build(tmp_path, monkeypatch):
    monkeypatch.setattr(setup.shutil, "which", lambda name: "/usr/bin/npm")
    calls = []

    def fake_run(cmd, cwd, check):
        calls.append(cmd)
        return subprocess.CompletedProcess(cmd, 0)

    setup.build_web(root=tmp_path, run=fake_run)
    assert calls[0][-1] == "install"
    assert calls[1][-2:] == ["run", "build"]


def test_build_web_fails_plainly_when_npm_missing(monkeypatch):
    monkeypatch.setattr(setup.shutil, "which", lambda name: None)
    with pytest.raises(setup.SetupError, match="nodejs.org"):
        setup.build_web()

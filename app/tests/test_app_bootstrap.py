import json

from fastapi.testclient import TestClient

from app.app import create_app
from app.settings import EXAMPLE_PATH

CFG = {"app": {}, "companies": [], "filters": {}}


def test_startup_creates_missing_config_from_example(tmp_db, tmp_path):
    # first-ever launch on a fresh clone: no watcher/config.json yet. The
    # lifespan hook should copy the checked-in example in, so the friend's
    # Settings tab and the watcher both have something real to read.
    db_file = tmp_db.execute("PRAGMA database_list").fetchone()[2]
    cfg_path = tmp_path / "config.json"
    assert not cfg_path.exists()

    app = create_app(db_path=db_file, config_path=cfg_path)
    with TestClient(app, base_url="http://127.0.0.1") as client:
        resp = client.get("/api/settings")
        assert resp.status_code == 200

    assert cfg_path.exists()
    assert json.loads(cfg_path.read_text(encoding="utf-8")) == json.loads(
        EXAMPLE_PATH.read_text(encoding="utf-8"))


def test_startup_never_overwrites_an_existing_config(tmp_db, tmp_path):
    db_file = tmp_db.execute("PRAGMA database_list").fetchone()[2]
    cfg_path = tmp_path / "config.json"
    mine = {**CFG, "ntfy_topic": "do-not-clobber-me"}
    cfg_path.write_text(json.dumps(mine), encoding="utf-8")

    app = create_app(db_path=db_file, config_path=cfg_path)
    with TestClient(app, base_url="http://127.0.0.1") as client:
        client.get("/api/settings")

    assert json.loads(cfg_path.read_text(encoding="utf-8"))["ntfy_topic"] == "do-not-clobber-me"


def test_no_lifespan_no_autocreate_for_bare_testclient_use(tmp_db, tmp_path):
    # every other test in this suite constructs TestClient without a `with`
    # block, which never runs FastAPI's lifespan/startup — confirming that
    # here pins down why those tests are safe from touching disk.
    db_file = tmp_db.execute("PRAGMA database_list").fetchone()[2]
    cfg_path = tmp_path / "config.json"
    app = create_app(db_path=db_file, config_path=cfg_path)
    TestClient(app, base_url="http://127.0.0.1").get("/api/settings")
    assert not cfg_path.exists()

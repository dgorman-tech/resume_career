import pytest
from fastapi.testclient import TestClient

from app.app import create_app

CFG = {"app": {"internal_companies": []}, "companies": []}


@pytest.fixture
def client(tmp_db):
    db_file = tmp_db.execute("PRAGMA database_list").fetchone()[2]
    return TestClient(create_app(db_path=db_file, cfg=CFG), base_url="http://127.0.0.1")


def _get(client):
    return client.get("/api/dimensions").json()["data"]


def _put(client, dims):
    return client.put("/api/dimensions", json={"dimensions": dims})


def _rubric_ts(tmp_db):
    row = tmp_db.execute("SELECT rubric_updated_at FROM profile WHERE id=1").fetchone()
    return row["rubric_updated_at"] if row else None


def test_get_returns_seed_and_default_holistic(client):
    data = _get(client)
    assert [d["key"] for d in data["dimensions"]] == ["comp", "player_coach", "cost_center", "flex", "level"]
    assert data["dimensions"][0]["archived"] is False
    assert data["holistic_weight"] == 50


def test_edit_description_bumps_rubric_timestamp(client, tmp_db):
    dims = _get(client)["dimensions"]
    dims[0]["description"] = "totally new meaning"
    assert _put(client, dims).json()["ok"] is True
    assert _rubric_ts(tmp_db) is not None


def test_reorder_only_does_not_bump(client, tmp_db):
    dims = _get(client)["dimensions"]
    for i, d in enumerate(dims):
        d["position"] = len(dims) - i
    assert _put(client, dims).json()["ok"] is True
    assert _rubric_ts(tmp_db) is None
    assert [d["key"] for d in _get(client)["dimensions"]][0] == "level"


def test_add_archive_restore_bump_and_slugify(client, tmp_db):
    dims = _get(client)["dimensions"]
    dims.append({"key": None, "label": "Team Culture!", "description": "low-ego team signals",
                 "position": 6, "archived": False})
    body = _put(client, dims).json()
    assert body["ok"] is True
    added = [d for d in body["data"]["dimensions"] if d["label"] == "Team Culture!"]
    assert added and added[0]["key"] == "team_culture" and added[0]["weight"] == 10
    first_ts = _rubric_ts(tmp_db)
    assert first_ts is not None

    dims = _get(client)["dimensions"]
    next(d for d in dims if d["key"] == "team_culture")["archived"] = True
    assert _put(client, dims).json()["ok"] is True
    assert _rubric_ts(tmp_db) >= first_ts


def test_validation_rejections(client):
    dims = _get(client)["dimensions"]

    # omitting an existing key
    assert _put(client, dims[:-1]).status_code == 400
    # archive everything -> zero active
    all_archived = [{**d, "archived": True} for d in dims]
    assert _put(client, all_archived).status_code == 400
    # duplicate active labels (case-insensitive)
    dupe = [dict(d) for d in dims]
    dupe[1]["label"] = "compensation"
    assert _put(client, dupe).status_code == 400
    # empty description
    blank = [dict(d) for d in dims]
    blank[0]["description"] = "   "
    assert _put(client, blank).status_code == 400
    # nine active dims
    nine = dims + [{"key": None, "label": f"Extra {i}", "description": "d",
                    "position": 10 + i, "archived": False} for i in range(4)]
    assert _put(client, nine).status_code == 400
    # unknown key
    ghost = dims + [{"key": "ghost", "label": "Ghost", "description": "d",
                     "position": 9, "archived": False}]
    assert _put(client, ghost).status_code == 400


def test_put_ignores_weight_field(client):
    dims = _get(client)["dimensions"]
    dims[0]["weight"] = 99
    assert _put(client, dims).json()["ok"] is True
    assert _get(client)["dimensions"][0]["weight"] == 10


def _put_weights(client, body):
    return client.put("/api/dimensions/weights", json=body)


def test_weights_partial_update_never_bumps(client, tmp_db):
    tmp_db.execute("INSERT INTO profile(id, resume_text, rules_text, updated_at) "
                   "VALUES (1,'r','x','2026-08-24T00:00:00Z')")
    tmp_db.commit()
    resp = _put_weights(client, {"weights": {"comp": 40}, "holistic_weight": 20})
    assert resp.json()["ok"] is True
    data = resp.json()["data"]
    assert next(d for d in data["dimensions"] if d["key"] == "comp")["weight"] == 40
    assert next(d for d in data["dimensions"] if d["key"] == "flex")["weight"] == 10
    assert data["holistic_weight"] == 20
    row = tmp_db.execute("SELECT updated_at, rubric_updated_at FROM profile WHERE id=1").fetchone()
    assert row["updated_at"] == "2026-08-24T00:00:00Z" and row["rubric_updated_at"] is None


def test_weights_validation(client, tmp_db):
    assert _put_weights(client, {"weights": {"ghost": 10}}).status_code == 400
    assert _put_weights(client, {"weights": {"comp": 101}}).status_code == 400
    assert _put_weights(client, {"weights": {"comp": -1}}).status_code == 400
    # archived keys rejected
    tmp_db.execute("UPDATE score_dimensions SET archived=1 WHERE key='flex'")
    tmp_db.commit()
    assert _put_weights(client, {"weights": {"flex": 10}}).status_code == 400
    # all-zero result rejected
    zeros = {"weights": {k: 0 for k in ("comp", "player_coach", "cost_center", "level")},
             "holistic_weight": 0}
    assert _put_weights(client, zeros).status_code == 400


def test_weights_persist_without_profile_row(client, tmp_db):
    assert _put_weights(client, {"holistic_weight": 70}).json()["data"]["holistic_weight"] == 70
    # storing holistic on a fresh profile row must not create staleness
    assert tmp_db.execute("SELECT updated_at FROM profile WHERE id=1").fetchone()["updated_at"] is None

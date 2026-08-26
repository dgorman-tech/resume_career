import pytest
from fastapi.testclient import TestClient

from app.app import create_app
from app.settings import detect_company_url


@pytest.fixture
def client(tmp_db):
    db_file = tmp_db.execute("PRAGMA database_list").fetchone()[2]
    app = create_app(db_path=db_file)
    return TestClient(app, base_url="http://127.0.0.1")


# ---------------------------------------------------- the six recognized shapes

def test_detects_ashby():
    r = detect_company_url("https://jobs.ashbyhq.com/openai/9f2a1b3c-46d1-4e2a-9c1a-1234567890ab")
    assert r.recognized is True
    assert r.adapter == "ashby"
    assert r.slug == "openai"
    assert r.suggested_name == "Openai"


def test_detects_lever():
    r = detect_company_url("https://jobs.lever.co/acme-corp/1234abcd-5678-efgh?lever-origin=applied")
    assert r.recognized is True
    assert r.adapter == "lever"
    assert r.slug == "acme-corp"
    assert r.suggested_name == "Acme Corp"


def test_detects_greenhouse_legacy_host():
    r = detect_company_url("https://boards.greenhouse.io/stripe/jobs/4020123")
    assert r.recognized is True
    assert r.adapter == "greenhouse"
    assert r.slug == "stripe"


def test_detects_greenhouse_newer_host():
    r = detect_company_url("https://job-boards.greenhouse.io/stripe/jobs/4020123#application")
    assert r.recognized is True
    assert r.adapter == "greenhouse"
    assert r.slug == "stripe"


def test_detects_workable():
    r = detect_company_url("https://apply.workable.com/foo-inc/j/ABCD1234EF/")
    assert r.recognized is True
    assert r.adapter == "workable"
    assert r.slug == "foo-inc"


def test_detects_workday_with_locale_prefix():
    r = detect_company_url(
        "https://mycompany.wd3.myworkdayjobs.com/en-US/External/job/Dublin-Ireland/"
        "Senior-Software-Engineer_R12345")
    assert r.recognized is True
    assert r.adapter == "workday"
    assert r.tenant == "mycompany"
    assert r.wd == "wd3"
    assert r.site == "External"
    assert r.suggested_name == "Mycompany"


def test_detects_workday_without_locale_prefix():
    # some pasted links (or a bare board root) omit the /en-US/ segment
    r = detect_company_url("https://mycompany.wd3.myworkdayjobs.com/External/job/Dublin-Ireland/Role_R1")
    assert r.recognized is True
    assert r.adapter == "workday"
    assert r.tenant == "mycompany"
    assert r.site == "External"


def test_detects_successfactors_rmk_by_job_path_shape():
    # host-based: no shared domain, so the /job/<slug>/<id>/ shape is the signal
    url = ("https://jobs.examplebank.com/job/Toronto-Senior-Manager-ON-M5H-1H1/601199917/"
          "?feedId=null&utm_source=J2WRSS")
    r = detect_company_url(url)
    assert r.recognized is True
    assert r.adapter == "successfactors_rmk"
    assert r.host == "jobs.examplebank.com"


def test_bare_domain_without_scheme_is_still_detected():
    r = detect_company_url("jobs.ashbyhq.com/openai")
    assert r.recognized is True
    assert r.adapter == "ashby"
    assert r.slug == "openai"


# ------------------------------------------------------------------- negatives

def test_unrelated_url_is_honestly_not_recognized():
    r = detect_company_url("https://www.google.com/search?q=jobs")
    assert r.recognized is False
    assert r.adapter is None
    assert r.message


def test_malformed_string_does_not_raise_and_is_not_recognized():
    for junk in ("not a url at all!!", "   ", "", "\t\n", "://///", "a" * 500):
        r = detect_company_url(junk)
        assert r.recognized is False


def test_non_string_input_does_not_raise():
    for junk in (None, 123, {"url": "x"}, ["https://jobs.lever.co/x"]):
        r = detect_company_url(junk)
        assert r.recognized is False


@pytest.mark.parametrize("host", ["localhost", "127.0.0.1", "192.168.1.5", "10.0.0.5", "169.254.169.254"])
def test_private_and_loopback_hosts_are_never_proposed(host):
    # deliberately shaped like the successfactors_rmk job-path signature, to prove
    # the private-host guard wins even when the path would otherwise match
    r = detect_company_url(f"http://{host}/job/some-role/12345/")
    assert r.recognized is False
    assert r.adapter is None
    assert "private" in r.message or "internal" in r.message


def test_known_host_without_a_slug_is_not_recognized():
    r = detect_company_url("https://jobs.ashbyhq.com/")
    assert r.recognized is False


# --------------------------------------------------------------------- endpoint

def test_endpoint_returns_detection_result(client):
    resp = client.post("/api/companies/detect", json={"url": "https://jobs.lever.co/acme/xyz"})
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["recognized"] is True
    assert data["adapter"] == "lever"
    assert data["slug"] == "acme"


def test_endpoint_is_honest_and_never_errors_on_garbage(client):
    for body in ({}, {"url": None}, {"url": 42}, {"url": "http://localhost/job/x/1/"}):
        resp = client.post("/api/companies/detect", json=body)
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["recognized"] is False

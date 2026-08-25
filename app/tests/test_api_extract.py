import io
import json

import pytest
from fastapi.testclient import TestClient

from app.app import create_app

CFG = {"app": {}, "companies": [], "filters": {}}


@pytest.fixture
def client(tmp_db):
    db_file = tmp_db.execute("PRAGMA database_list").fetchone()[2]
    return TestClient(create_app(db_path=db_file, cfg=CFG), base_url="http://127.0.0.1")


def upload(client, filename, content, mime="application/octet-stream"):
    return client.post("/api/profile/extract",
                       files={"file": (filename, io.BytesIO(content), mime)})


def make_docx(paragraphs):
    from docx import Document
    doc = Document()
    for p in paragraphs:
        doc.add_paragraph(p)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def make_pdf(text):
    stream = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode()
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R "
        b"/Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objs, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + body + b"\nendobj\n"
    xref_pos = len(out)
    out += f"xref\n0 {len(objs) + 1}\n".encode() + b"0000000000 65535 f \n"
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += (b"trailer\n<< /Size " + str(len(objs) + 1).encode() + b" /Root 1 0 R >>\n"
            b"startxref\n" + str(xref_pos).encode() + b"\n%%EOF\n")
    return bytes(out)


def test_extracts_plain_text_file(client):
    resp = upload(client, "resume.txt", "Jordan Avery\nSenior Manager".encode("utf-8"))
    assert resp.json()["ok"] is True
    assert resp.json()["data"]["text"] == "Jordan Avery\nSenior Manager"


def test_extracts_markdown_file(client):
    resp = upload(client, "resume.md", b"# Resume\n- thing one")
    assert "thing one" in resp.json()["data"]["text"]


def test_extracts_docx_paragraphs(client):
    content = make_docx(["Jordan Avery", "Experience: risk analytics"])
    resp = upload(client, "resume.docx", content)
    text = resp.json()["data"]["text"]
    assert "Jordan Avery" in text
    assert "risk analytics" in text


def test_extracts_pdf_text(client):
    resp = upload(client, "resume.pdf", make_pdf("Hello resume PDF"))
    assert "Hello resume PDF" in resp.json()["data"]["text"]


def test_rejects_unsupported_extension(client):
    resp = upload(client, "resume.rtf", b"whatever")
    assert resp.status_code == 400
    assert ".rtf" in resp.json()["error"]


def test_rejects_oversized_upload(client, monkeypatch):
    from app import extract
    monkeypatch.setattr(extract, "MAX_UPLOAD_BYTES", 10)
    resp = upload(client, "resume.txt", b"x" * 11)
    assert resp.status_code == 413


def test_oversized_request_body_is_rejected_before_parsing(client):
    # 12MB exceeds the global body cap; the middleware must refuse it up front
    # (distinct message from the extractor's own per-file cap)
    resp = upload(client, "resume.txt", b"x" * (12 * 1024 * 1024))
    assert resp.status_code == 413
    assert "request too large" in resp.json()["error"]


def test_rejects_docx_that_decompresses_too_large(client, monkeypatch):
    # zip bomb: compressed size passes the upload cap, decompressed size must not
    from app import extract
    monkeypatch.setattr(extract, "MAX_DECOMPRESSED_BYTES", 1000)
    content = make_docx(["x" * 500] * 10)
    resp = upload(client, "resume.docx", content)
    assert resp.status_code == 400
    assert "too large" in resp.json()["error"]


def test_rejects_file_with_no_extractable_text(client):
    resp = upload(client, "resume.pdf", make_pdf(""))
    assert resp.status_code == 400
    assert "no text" in resp.json()["error"].lower()

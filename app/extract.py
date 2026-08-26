"""Resume file extraction: docx/pdf/txt/md upload -> plain text.

Extraction only — the client drops the text into the resume textarea for the
user to review; nothing is saved here.
"""

import io
import zipfile
from pathlib import Path

from fastapi import APIRouter, Request, UploadFile

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_DECOMPRESSED_BYTES = 50 * 1024 * 1024

router = APIRouter()


class ExtractError(ValueError):
    """User-facing extraction failure."""


def _from_docx(content):
    # zip-bomb guard: a small compressed upload can inflate to gigabytes,
    # so check declared member sizes before letting python-docx unpack it
    with zipfile.ZipFile(io.BytesIO(content)) as z:
        total = sum(info.file_size for info in z.infolist())
    if total > MAX_DECOMPRESSED_BYTES:
        raise ExtractError("docx contents too large to extract")
    from docx import Document
    doc = Document(io.BytesIO(content))
    return "\n".join(p.text for p in doc.paragraphs)


def _from_pdf(content):
    from pypdf import PdfReader
    from pypdf.errors import DependencyError, FileNotDecryptedError
    reader = PdfReader(io.BytesIO(content))
    try:
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    except DependencyError as exc:
        # only hit for AES-encrypted PDFs; plain PDFs never touch this path.
        # requirements.txt doesn't pin the optional 'cryptography' package —
        # google-genai already pulls it in transitively — so name the exact
        # fix instead of adding a heavy dependency most uploads never need.
        raise ExtractError(
            "this PDF uses encryption that needs the optional 'cryptography' "
            "package, which isn't installed — run: pip install cryptography") from exc
    except FileNotDecryptedError as exc:
        raise ExtractError(
            "this PDF is password-protected — remove the password (or export "
            "a fresh copy) and re-upload") from exc


def _from_text(content):
    return content.decode("utf-8", errors="replace")


EXTRACTORS = {".docx": _from_docx, ".pdf": _from_pdf, ".txt": _from_text, ".md": _from_text}


@router.post("/api/profile/extract")
def extract_resume(request: Request, file: UploadFile):
    from app.app import err, ok
    ext = Path(file.filename or "").suffix.lower()
    extractor = EXTRACTORS.get(ext)
    if extractor is None:
        supported = ", ".join(sorted(EXTRACTORS))
        return err(f"unsupported file type {ext or '(none)'!r} — use {supported}", 400)
    content = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        return err(f"file too large (max {MAX_UPLOAD_BYTES // (1024 * 1024)} MB)", 413)
    try:
        text = extractor(content).strip()
    except ExtractError as exc:
        return err(str(exc), 400)
    except Exception:
        return err(f"could not read {ext} file — is it a valid {ext[1:]}?", 400)
    if not text:
        return err("no text found in file — try exporting as .txt and pasting instead", 400)
    return ok({"text": text})

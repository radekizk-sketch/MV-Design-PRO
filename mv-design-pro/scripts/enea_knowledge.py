#!/usr/bin/env python3
"""Lokalna baza wiedzy ENEA Operator dla MV-DESIGN PRO.

Pliki PDF i pełny indeks nie są publikowane w repozytorium.
Źródło metadanych: reference_engine/packs/osd_enea/source_catalog.json.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from datetime import date, datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "backend/src/reference_engine/packs/osd_enea/source_catalog.json"
DEFAULT_DIR = Path.home() / ".local/share/mv-design-pro/enea-knowledge"
ALLOWED_HOSTS = {"www.operator.enea.pl", "operator.enea.pl", "www.m.operator.enea.pl", "m.operator.enea.pl"}
MAX_BYTES = 120 * 1024 * 1024


def _allowed(url: str) -> bool:
    p = urlparse(url)
    return p.scheme == "https" and p.hostname in ALLOWED_HOSTS and not p.username and not p.password


class _SafeRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not _allowed(newurl):
            raise ValueError("Przekierowanie poza oficjalną domenę ENEA Operator: " + newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


OPENER = build_opener(_SafeRedirect())


def _download_bytes(url: str) -> bytes:
    if not _allowed(url):
        raise ValueError("Niedozwolony adres źródła: " + url)
    request = Request(url, headers={"User-Agent": "MV-DESIGN-PRO-ENEA-Knowledge/1.0"})
    with OPENER.open(request, timeout=45) as response:
        if not _allowed(response.geturl()):
            raise ValueError("Końcowy adres poza domeną ENEA")
        blob = response.read(MAX_BYTES + 1)
    if len(blob) > MAX_BYTES:
        raise ValueError("Dokument przekroczył limit 120 MiB")
    return blob


class _DownloadLinks(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[tuple[str, str]] = []
        self._href: str | None = None
        self._text: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self._href = dict(attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag == "a":
            if self._href:
                self.links.append((self._href, "".join(self._text).strip()))
            self._href = None
            self._text = []


def official_standard_links(index_url: str) -> list[str]:
    raw = _download_bytes(index_url).decode("utf-8", errors="replace")
    parser = _DownloadLinks()
    parser.feed(raw)
    links = []
    for href, label in parser.links:
        candidate = urljoin(index_url, href)
        if "pobierz" in label.casefold() and _allowed(candidate) and (
            "/media/" in candidate or "/uploads-ev2/" in candidate
        ):
            links.append(candidate)
    return links


def load_catalog(path: Path = CATALOG) -> dict:
    obj = json.loads(path.read_text(encoding="utf-8"))
    if obj.get("schema_version") != 1:
        raise ValueError("Nieobsługiwana wersja schematu katalogu")
    sources = obj["sources"]
    ids = [row["id"] for row in sources]
    if len(ids) != len(set(ids)):
        raise ValueError("Powtórzone identyfikatory źródeł")
    standards = [x for x in sources if x["family"] == "standard"]
    if len(standards) != 25 or {x["download_ordinal"] for x in standards} != set(range(1, 26)):
        raise ValueError("Niepełny spis 25 standardów z urzędowego indeksu")
    for x in sources:
        if not re.fullmatch(r"ENEA-[A-Z0-9-]+", x["id"]):
            raise ValueError("Nieprawidłowy identyfikator")
        for key in ("url", "index_url"):
            if x.get(key) is not None and not _allowed(x[key]):
                raise ValueError("Źródło poza domeną operatora: " + x["id"])
        if x.get("effective_from") and x.get("effective_to"):
            if date.fromisoformat(x["effective_from"]) > date.fromisoformat(x["effective_to"]):
                raise ValueError("Błędny przedział obowiązywania: " + x["id"])
    return obj


def _state_path(directory: Path) -> Path:
    return directory / "manifest.json"


def _load_state(directory: Path) -> dict:
    path = _state_path(directory)
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def _save_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", dir=path.parent, encoding="utf-8", delete=False) as tmp:
        json.dump(value, tmp, ensure_ascii=False, indent=2, sort_keys=True)
        tmp.write("\n")
        filename = tmp.name
    Path(filename).replace(path)


def _save_pdf(path: Path, data: bytes) -> str:
    if not data.startswith(b"%PDF-"):
        raise ValueError("Serwer nie zwrócił pliku PDF")
    digest = hashlib.sha256(data).hexdigest()
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("wb", dir=path.parent, delete=False) as tmp:
        tmp.write(data)
        filename = tmp.name
    Path(filename).replace(path)
    return digest


def pdf_pages(path: Path) -> list[str]:
    if shutil.which("pdftotext"):
        process = subprocess.run(
            ["pdftotext", "-layout", "-enc", "UTF-8", str(path), "-"],
            capture_output=True, text=True, check=False,
        )
        if process.returncode:
            raise RuntimeError("pdftotext: " + process.stderr.strip()[:250])
        text = process.stdout
        pages = [p for p in text.split("\f") if p.strip()]
    else:
        try:
            import fitz
        except ImportError as exc:
            raise RuntimeError("Zainstaluj pdftotext (poppler) lub PyMuPDF") from exc
        with fitz.open(path) as doc:
            pages = [p.get_text(sort=True) for p in doc]
    if not any(page.strip() for page in pages):
        raise RuntimeError("PDF nie ma warstwy tekstowej; wymaga osobnego OCR i kontroli")
    return pages


def connect_db(directory: Path) -> sqlite3.Connection:
    directory.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(directory / "search.sqlite3")
    conn.execute("CREATE TABLE IF NOT EXISTS indexed_files (doc_id TEXT PRIMARY KEY, sha256 TEXT NOT NULL, page_count INTEGER NOT NULL)")
    conn.execute("CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(doc_id UNINDEXED, page_no UNINDEXED, body, tokenize='unicode61 remove_diacritics 2')")
    return conn


def index_document(conn: sqlite3.Connection, doc_id: str, sha256: str, pages: list[str]) -> int:
    old = conn.execute("SELECT sha256 FROM indexed_files WHERE doc_id = ?", (doc_id,)).fetchone()
    if old and old[0] == sha256:
        return 0
    with conn:
        conn.execute("DELETE FROM pages_fts WHERE doc_id = ?", (doc_id,))
        conn.execute("DELETE FROM indexed_files WHERE doc_id = ?", (doc_id,))
        conn.executemany(
            "INSERT INTO pages_fts (doc_id,page_no,body) VALUES (?,?,?)",
            [(doc_id, str(i + 1), page) for i, page in enumerate(pages)],
        )
        conn.execute(
            "INSERT INTO indexed_files (doc_id,sha256,page_count) VALUES (?,?,?)",
            (doc_id, sha256, len(pages)),
        )
    return len(pages)


def search(conn: sqlite3.Connection, query: str, limit: int = 10) -> list[dict]:
    words = re.findall(r"\w+", query, flags=re.UNICODE)
    if not words:
        return []
    expression = " AND ".join('"' + word.replace('"', "") + '"' for word in words[:15])
    rows = conn.execute(
        "SELECT doc_id, page_no, snippet(pages_fts, 2, '[', ']', '…', 22) "
        "FROM pages_fts WHERE pages_fts MATCH ? ORDER BY rank LIMIT ?",
        (expression, min(100, max(1, limit))),
    ).fetchall()
    return [{"document_id": row[0], "pdf_page": int(row[1]), "snippet": row[2]} for row in rows]


def sync(directory: Path, catalog: dict, doc_id: str | None, no_index: bool) -> int:
    state = _load_state(directory)
    sources = catalog["sources"]
    links: list[str] = []
    try:
        links = official_standard_links(catalog["index_standard_url"])
        if len(links) != 25:
            print(f"UWAGA: Oficjalna strona ma {len(links)} linków, katalog oczekuje 25; automatyczne mapowanie wyłączone.", file=sys.stderr)
            links = []
    except (HTTPError, URLError, OSError, ValueError) as exc:
        print(f"UWAGA: Nie sprawdzono strony indeksowej: {exc}", file=sys.stderr)
    selected = [row for row in sources if doc_id is None or row["id"] == doc_id]
    if not selected:
        raise ValueError("Brak dokumentu o podanym identyfikatorze")
    conn = None if no_index else connect_db(directory)
    failed = 0
    for row in selected:
        key = row["id"]
        ordinal = row.get("download_ordinal")
        live = links[ordinal - 1] if ordinal and links else None
        if live and row.get("url") and row["url"] != live:
            print(f"ZMIANA ŹRÓDŁA: {key}. Wymagana kontrola wersji! {live}", file=sys.stderr)
            state.setdefault(key, {})["candidate_url"] = live
            # Nie podstawiamy nowego dokumentu bez kontroli daty i treści.
        url = row.get("url") or live
        if not url:
            print(f"BRAK LINKU: {key}; sprawdź oficjalny indeks", file=sys.stderr)
            failed += 1
            continue
        try:
            content = _download_bytes(url)
            pdf_path = directory / "pdf" / (key + ".pdf")
            sha = _save_pdf(pdf_path, content)
            record = {"sha256": sha, "bytes": len(content), "url": url, "downloaded_at": datetime.now(timezone.utc).isoformat()}
            if conn is not None:
                record["pages_indexed"] = index_document(conn, key, sha, pdf_pages(pdf_path))
            state[key] = record
            print(f"OK {key} sha256={sha[:16]} {len(content)} B")
        except (OSError, HTTPError, URLError, ValueError, RuntimeError) as exc:
            print(f"BŁĄD {key}: {exc}", file=sys.stderr)
            failed += 1
    if conn is not None:
        conn.close()
    _save_json(_state_path(directory), state)
    return 1 if failed else 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Baza wiedzy ENEA Operator — lokalna, wersjonowana")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DIR)
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("catalog", help="Zestawienie oficjalnych dokumentów")
    p_sync = sub.add_parser("sync", help="Pobierz PDF-y i zaindeksuj lokalnie")
    p_sync.add_argument("--id", dest="doc_id")
    p_sync.add_argument("--no-index", action="store_true")
    sub.add_parser("index", help="Zbuduj indeks z wcześniej pobranych PDF-ów")
    p_search = sub.add_parser("search", help="Wyszukiwanie pełnotekstowe wraz ze stroną źródłową")
    p_search.add_argument("query")
    p_search.add_argument("--limit", type=int, default=10)
    sub.add_parser("status", help="Kontrola integralności pobranych plików")
    args = parser.parse_args()
    catalog = load_catalog()
    directory = args.data_dir.expanduser()
    if args.cmd == "catalog":
        for row in catalog["sources"]:
            print(f'{row["id"]}\t{row["effective_from"] or "brak daty"}\t{row["title"]}\t{row.get("url") or "ODNOŚNIK Z INDEKSU"}')
        return 0
    if args.cmd == "sync":
        return sync(directory, catalog, args.doc_id, args.no_index)
    if args.cmd == "index":
        conn = connect_db(directory)
        failures = 0
        for row in catalog["sources"]:
            path = directory / "pdf" / (row["id"] + ".pdf")
            if path.exists():
                try:
                    digest = hashlib.sha256(path.read_bytes()).hexdigest()
                    print(row["id"], index_document(conn, row["id"], digest, pdf_pages(path)))
                except (OSError, RuntimeError) as exc:
                    failures += 1
                    print(f'BŁĄD {row["id"]}: {exc}', file=sys.stderr)
        conn.close()
        return 1 if failures else 0
    if args.cmd == "search":
        conn = connect_db(directory)
        matches = search(conn, args.query, args.limit)
        conn.close()
        by_id = {x["id"]: x for x in catalog["sources"]}
        for item in matches:
            item["title"] = by_id[item["document_id"]]["title"]
            item["source_url"] = by_id[item["document_id"]].get("url") or by_id[item["document_id"]]["index_url"]
        print(json.dumps(matches, ensure_ascii=False, indent=2))
        return 0
    state = _load_state(directory)
    errors = 0
    for row in catalog["sources"]:
        key = row["id"]
        path = directory / "pdf" / (key + ".pdf")
        if key not in state or not path.is_file():
            print(f"BRAK: {key}")
            errors += 1
        elif hashlib.sha256(path.read_bytes()).hexdigest() != state[key]["sha256"]:
            print(f"NIEZGODNY SHA-256: {key}")
            errors += 1
        else:
            print(f"ZGODNY: {key}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())

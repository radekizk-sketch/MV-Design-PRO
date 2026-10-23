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


def _ocr_page(path: Path, page_number: int) -> str:
    """OCR pojedynczej strony bez wcześniejszego tekstu; PDF zostaje lokalnie.

    Wymaga poppler-utils, tesseract-ocr i pakietu tesseract-ocr-pol.
    Przekroczenie czasu albo brak zasobów nie powodują fikcyjnego wyniku.
    """
    if not shutil.which("pdftoppm") or not shutil.which("tesseract"):
        raise RuntimeError("Brak pdftoppm lub tesseract; nie można rozpoznać stron skanowanych")
    with tempfile.TemporaryDirectory(prefix="enea-ocr-") as directory:
        base = Path(directory) / "strona"
        render = subprocess.run(
            ["pdftoppm", "-f", str(page_number), "-l", str(page_number),
             "-singlefile", "-scale-to", "2200", "-png", str(path), str(base)],
            capture_output=True, text=True, check=False, timeout=60,
        )
        if render.returncode:
            raise RuntimeError("Nie udało się wyrenderować strony PDF do OCR: " + render.stderr[:180])
        langs = subprocess.run(
            ["tesseract", "--list-langs"], capture_output=True, text=True,
            check=False, timeout=10,
        ).stdout
        if "pol" not in langs.split():
            raise RuntimeError("Brak języka pol w Tesseract — wymagany pakiet tesseract-ocr-pol")
        recognized = subprocess.run(
            ["tesseract", str(base) + ".png", "stdout", "-l", "pol+eng", "--psm", "3"],
            capture_output=True, text=True, check=False, timeout=90,
        )
        if recognized.returncode:
            raise RuntimeError("Błąd OCR Tesseract: " + recognized.stderr[:180])
        return recognized.stdout.strip()


def pdf_pages(path: Path, *, enable_ocr: bool = True) -> list[str]:
    """Każda pozycja ma TEN SAM numer co strona PDF (bez przesunięć).

    Zeszyt 4 AMI jest skanem; bez rozpoznawania stron jego indeks byłby pusty.
    Strony z samą grafiką mogą pozostać bez tekstu: audyt pokazuje je jawnie.
    """
    if shutil.which("pdftotext"):
        process = subprocess.run(
            ["pdftotext", "-layout", "-enc", "UTF-8", str(path), "-"],
            capture_output=True, text=True, check=False, timeout=90,
        )
        if process.returncode:
            raise RuntimeError("pdftotext: " + process.stderr.strip()[:250])
        pages = process.stdout.split("\f")
        if pages and not pages[-1].strip():
            pages.pop()
    else:
        try:
            import fitz
        except ImportError as exc:
            raise RuntimeError("Zainstaluj poppler-utils lub PyMuPDF") from exc
        with fitz.open(path) as pdf:
            pages = [page.get_text(sort=True) for page in pdf]
    if enable_ocr:
        for i, text in enumerate(pages):
            # Poniżej 25 liter nie ma wiarygodnej warstwy tekstowej.
            # Dotyczy także pojedynczych skanowanych załączników do PDF.
            if len(re.findall(r"[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]", text)) < 25:
                try:
                    recovered = _ocr_page(path, i + 1)
                except (RuntimeError, OSError, subprocess.TimeoutExpired) as exc:
                    raise RuntimeError(f"Nie udało się rozpoznać strony {i + 1}: {exc}") from exc
                if len(recovered.strip()) > len(text.strip()):
                    pages[i] = recovered
    if not any(page.strip() for page in pages):
        raise RuntimeError("PDF nie ma tekstu po ekstrakcji i OCR")
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
            sha_candidate = hashlib.sha256(content).hexdigest()
            previous_sha = state.get(key, {}).get("sha256")
            if previous_sha and previous_sha != sha_candidate:
                candidate_path = directory / "do_weryfikacji" / (key + "-" + sha_candidate[:16] + ".pdf")
                _save_pdf(candidate_path, content)
                raise ValueError(
                    "Zmiana zawartości źródła: zachowano dotychczasowy PDF. "
                    "Nowy plik zapisano do weryfikacji: " + str(candidate_path)
                )
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


def audit_index(directory: Path, catalog: dict) -> dict:
    """Niezależna bramka kompletności pobrania i indeksu 25 standardów + IRiESD.

    Raport nie twierdzi, że OCR odczytał wszystkie wartości techniczne poprawnie.
    """
    state = _load_state(directory)
    db_path = directory / "search.sqlite3"
    indexed: dict[str, tuple[str, int, int, int]] = {}
    if db_path.is_file():
        with connect_db(directory) as conn:
            for row in conn.execute(
                "SELECT i.doc_id, i.sha256, i.page_count,"
                " (SELECT COUNT(*) FROM pages_fts p WHERE p.doc_id=i.doc_id),"
                " (SELECT COUNT(*) FROM pages_fts p WHERE p.doc_id=i.doc_id"
                " AND length(trim(p.body))>=25) FROM indexed_files i"
            ):
                indexed[row[0]] = (row[1], row[2], row[3], row[4])
    documents = []
    for source in catalog["sources"]:
        doc_id = source["id"]
        file = directory / "pdf" / (doc_id + ".pdf")
        manifest_record = state.get(doc_id, {})
        errors: list[str] = []
        if not file.exists():
            errors.append("BRAK_PDF")
            content_sha = None
        else:
            content = file.read_bytes()
            content_sha = hashlib.sha256(content).hexdigest()
            if not content.startswith(b"%PDF-"):
                errors.append("NIE_JEST_PDF")
            if content_sha != manifest_record.get("sha256"):
                errors.append("NIEZGODNA_SUMA_SHA256")
        entry = indexed.get(doc_id)
        if entry is None:
            errors.append("BRAK_INDEKSU")
            pages, indexed_pages, text_pages = 0, 0, 0
        else:
            db_sha, pages, indexed_pages, text_pages = entry
            if not content_sha or db_sha != content_sha:
                errors.append("INDEKS_NIEODPOWIADA_WERSJI_PDF")
            if indexed_pages != pages or pages <= 0:
                errors.append("NIEPELNA_NUMERACJA_STRON")
            if text_pages <= 0:
                errors.append("BRAK_CZYTELNEGO_TEKSTU")
        documents.append({
            "id": doc_id,
            "status": "OK" if not errors else "BLOKADA",
            "errors": errors,
            "page_count": pages,
            "indexed_pages": indexed_pages,
            "pages_with_text": text_pages,
            "sha256": content_sha,
            "source_url": manifest_record.get("url"),
        })
    standards = [x for x in documents if next(
        r["id"] == x["id"] and r["family"] == "standard"
        for r in catalog["sources"]
    )]
    good = sum(x["status"] == "OK" for x in standards)
    report = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "catalog_as_of": catalog["as_of"],
        "standard_count": 25,
        "standards_complete": good,
        "all_documents_count": len(documents),
        "all_documents_complete": sum(x["status"] == "OK" for x in documents),
        "acceptance": "PASS" if good == 25 and all(
            x["status"] == "OK" for x in documents
        ) else "FAIL",
        "note": "PASS oznacza integralność i dostępność tekstu, NIE walidację merytoryczną całego OCR.",
        "documents": documents,
    }
    return report


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
    p_ask = sub.add_parser("ask", help="Pytanie do źródeł ENEA z podstawą i stroną")
    p_ask.add_argument("question")
    p_ask.add_argument("--date", dest="as_of", default=None, help="Stan na RRRR-MM-DD")
    p_ask.add_argument("--limit", type=int, default=5)
    sub.add_parser("audit", help="Audyt wszystkich PDF: sumy, numeracja i pokrycie stron")
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
    if args.cmd == "audit":
        report = audit_index(directory, catalog)
        _save_json(directory / "audit.json", report)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0 if report["acceptance"] == "PASS" else 1
    if args.cmd == "ask":
        import importlib.util
        question_module = ROOT / "backend/src/reference_engine/enea_questions.py"
        spec = importlib.util.spec_from_file_location("enea_questions_local", question_module)
        if spec is None or spec.loader is None:
            raise RuntimeError("Nie można uruchomić silnika pytań.")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        result = module.answer_question(
            args.question, data_dir=directory, as_of=args.as_of, limit=args.limit,
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
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

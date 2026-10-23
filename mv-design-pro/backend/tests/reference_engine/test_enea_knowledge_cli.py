"""Testy offline katalogu ENEA Operator — bez połączenia z siecią i bez kopiowania PDF."""
from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "scripts" / "enea_knowledge.py"
spec = importlib.util.spec_from_file_location("enea_knowledge_cli", SCRIPT)
assert spec and spec.loader
knowledge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(knowledge)


def test_catalog_complete_and_dates():
    catalog = knowledge.load_catalog()
    assert len([x for x in catalog["sources"] if x["family"] == "standard"]) == 25
    assert len([x for x in catalog["sources"] if x["family"] == "iriesd"]) == 2
    old = next(x for x in catalog["sources"] if x["id"] == "ENEA-WN-LINIE-ARCH")
    new = next(x for x in catalog["sources"] if x["id"] == "ENEA-WN-LINIE")
    assert old["effective_to"] == "2026-09-30"
    assert new["effective_from"] == "2026-10-01"
    assert next(x for x in catalog["sources"] if x["id"] == "ENEA-IRIESD-TJ")["effective_from"] == "2026-10-19"


def test_catalog_rejects_duplicate_and_official_host_only(tmp_path):
    catalog = knowledge.load_catalog()
    catalog["sources"][1]["id"] = catalog["sources"][0]["id"]
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps(catalog), encoding="utf-8")
    try:
        knowledge.load_catalog(bad)
        assert False, "Oczekiwano błędu"
    except ValueError:
        pass
    assert not knowledge._allowed("https://attacker.example/standard.pdf")
    assert not knowledge._allowed("http://www.operator.enea.pl/unsafe.pdf")
    assert knowledge._allowed("https://www.operator.enea.pl/media/4774/plik.pdf")


def test_official_link_parser():
    html = '<a href="/media/123/plik.pdf">Pobierz</a><a href="/inne">Menu</a>'
    parser = knowledge._DownloadLinks()
    parser.feed(html)
    assert parser.links == [("/media/123/plik.pdf", "Pobierz"), ("/inne", "Menu")]


def test_pdf_signature_and_sha256(tmp_path):
    dest = tmp_path / "test.pdf"
    try:
        knowledge._save_pdf(dest, b"html-instead-of-pdf")
        assert False, "Oczekiwano odrzucenia HTML"
    except ValueError:
        pass
    digest = knowledge._save_pdf(dest, b"%PDF-1.4\nfixture")
    assert len(digest) == 64
    assert dest.read_bytes().startswith(b"%PDF-")


def test_fts5_source_page_and_idempotence(tmp_path):
    conn = knowledge.connect_db(tmp_path)
    try:
        pages = ["Projektowanie kabla SN.", "Wymagania pola transformatorowego."]
        assert knowledge.index_document(conn, "ENEA-SN-KAB", "hash1", pages) == 2
        assert knowledge.index_document(conn, "ENEA-SN-KAB", "hash1", pages) == 0
        rows = knowledge.search(conn, "kabla", 10)
        assert len(rows) == 1
        assert rows[0]["document_id"] == "ENEA-SN-KAB"
        assert rows[0]["pdf_page"] == 1
        assert knowledge.index_document(conn, "ENEA-SN-KAB", "hash2", ["Nowa wersja."]) == 1
        assert knowledge.search(conn, "kabla") == []
    finally:
        conn.close()


def test_cli_catalog_works_offline():
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "catalog"], capture_output=True,
        text=True, check=False,
    )
    assert result.returncode == 0, result.stderr
    assert "ENEA-SN-KAB" in result.stdout
    assert "ENEA-IRIESD-TJ" in result.stdout



def test_cli_question_with_evidence_works_offline(tmp_path):
    """Pytania powinny działać bez dostępu do Internetu dla zweryfikowanych kart."""
    result = subprocess.run(
        [
            sys.executable, str(SCRIPT), "--data-dir", str(tmp_path),
            "ask", "Czy nowa stacja słupowa z podejściem kablowym jest dopuszczalna?",
            "--date", "2026-10-23",
        ],
        capture_output=True, text=True, check=False,
    )
    assert result.returncode == 0, result.stderr
    response = json.loads(result.stdout)
    assert response["verdict"] == "NIEDOPUSZCZONE"
    assert response["sources"][0]["page_pdf"] == 3
    assert response["sources"][0]["url"].endswith("#page=3")



def test_audit_odmawia_przy_brakujacych_dokumentach(tmp_path):
    """Katalog 25 pozycji nie może zostać uznany za gotowy bez lokalnych PDF."""
    catalog = knowledge.load_catalog()
    report = knowledge.audit_index(tmp_path, catalog)
    assert report["standard_count"] == 25
    assert report["standards_complete"] == 0
    assert report["acceptance"] == "FAIL"
    assert "BRAK_PDF" in report["documents"][0]["errors"]


def test_audit_wymaga_sha_liczby_stron_i_kompletnego_indeksu(tmp_path):
    """Pełna bramka na syntetycznym kompletnym zestawie 25+2 dokumentów."""
    import hashlib

    catalog = knowledge.load_catalog()
    conn = knowledge.connect_db(tmp_path)
    state = {}
    for row in catalog["sources"]:
        doc_id = row["id"]
        data = b"%PDF-1.4\n" + doc_id.encode("ascii")
        path = tmp_path / "pdf" / (doc_id + ".pdf")
        digest = knowledge._save_pdf(path, data)
        knowledge.index_document(conn, doc_id, digest, [
            "Wymagania techniczne standardu ENEA Operator dla sieci elektrycznych SN.",
            "Wymagania telemechaniki i dokumentacji powykonawczej ENEA Operator.",
        ])
        state[doc_id] = {"sha256": digest, "url": row["url"]}
    conn.close()
    knowledge._save_json(tmp_path / "manifest.json", state)
    result = knowledge.audit_index(tmp_path, catalog)
    assert result["acceptance"] == "PASS"
    assert result["standards_complete"] == 25
    assert result["all_documents_complete"] == len(catalog["sources"])
    # Zmiana zawartości pliku bez aktualizacji manifestu musi zablokować odbiór.
    doc = catalog["sources"][0]
    (tmp_path / "pdf" / (doc["id"] + ".pdf")).write_bytes(b"%PDF-1.4\nzmieniono")
    altered = knowledge.audit_index(tmp_path, catalog)
    assert altered["acceptance"] == "FAIL"
    assert "NIEZGODNA_SUMA_SHA256" in altered["documents"][0]["errors"]


def test_pdf_pages_ocr_skany_i_zachowanie_numeracji(tmp_path, monkeypatch):
    """Rozpoznawanie stron skanowanych weryfikujemy bez zależności od sieci."""
    fitz = __import__("pytest").importorskip("fitz")
    pdf = fitz.open()
    pdf.new_page().insert_text((50, 50), "Dokument standardu ENEA — pierwsza strona tekstowa.")
    pdf.new_page()
    path = tmp_path / "fixture.pdf"
    pdf.save(path)
    pdf.close()
    calls = []
    def fake_ocr(filename, page_number):
        calls.append(page_number)
        return "Stacja transformatorowa sredniego napiecia, druga strona OCR."
    monkeypatch.setattr(knowledge, "_ocr_page", fake_ocr)
    pages = knowledge.pdf_pages(path)
    assert len(pages) == 2
    assert "pierwsza strona" in pages[0]
    assert "druga strona OCR" in pages[1]
    assert calls == [2]

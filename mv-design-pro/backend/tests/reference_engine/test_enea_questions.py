"""Pytania o ENEA — rozstrzygnięcie tylko z wymagania o udokumentowanym źródle."""
from __future__ import annotations

import sqlite3
from pathlib import Path

from reference_engine.enea_questions import _roots, answer_question


def test_qa_zweryfikowany_zakaz_nowej_stacji_slupowej_kablowej(tmp_path: Path) -> None:
    odp = answer_question(
        "Czy ENEA dopuszcza nową stację słupową z kablowym podejściem SN?",
        data_dir=tmp_path,
        as_of="2026-10-23",
    )
    assert odp["status"] == "POTWIERDZONE_W_KARCIE"
    assert odp["verdict"] == "NIEDOPUSZCZONE"
    assert odp["rule_id"] == "ENEA-ST3-002-A"
    assert odp["sources"][0]["section"] == "2. Zakres opracowania"
    assert odp["sources"][0]["page_pdf"] == 3
    assert odp["sources"][0]["edition"] == "06.2021-2"
    assert odp["sources"][0]["url"].endswith("#page=3")
    assert odp["indexed_documents"] == 0
    assert odp["requires_review"]  # Dokumenty lokalne wciąż niepełne.


def test_qa_niezalecane_to_nie_jest_bezwzgledny_zakaz(tmp_path: Path) -> None:
    odp = answer_question(
        "Czy można budować nowe stacje słupowe?",
        data_dir=tmp_path,
        as_of="2026-10-23",
    )
    assert odp["verdict"] == "NIEZALECANE"
    assert odp["rule_id"] == "ENEA-ST3-002-B"


def test_qa_kryterium_stacji_kompaktowej(tmp_path: Path) -> None:
    odp = answer_question(
        "Czy stację kompaktową prefabrykowaną ENEA traktuje jako rozwiązanie podstawowe?",
        data_dir=tmp_path,
        as_of="2026-10-23",
    )
    assert odp["verdict"] == "ROZWIAZANIE_PODSTAWOWE"


def test_qa_bez_potwierdzenia_nie_fabrykuje_odpowiedzi(tmp_path: Path) -> None:
    odp = answer_question(
        "Jaka ma być głębokość posadowienia kabla SN w pasie drogowym?",
        data_dir=tmp_path,
        as_of="2026-10-23",
    )
    assert odp["status"] == "BRAK_INDEKSU"
    assert odp["verdict"] is None
    assert odp["sources"] == []
    assert odp["indexed_documents"] == 0
    assert any(src["source_id"] == "ENEA-SN-KAB" for src in odp["suggested_documents"])


def test_qa_data_historyczna_wylacza_regule_z_2024(tmp_path: Path) -> None:
    odp = answer_question(
        "Czy nową stację słupową można wykonać z kablowym podejściem?",
        data_dir=tmp_path,
        as_of="2023-01-01",
    )
    assert odp["status"] == "BRAK_INDEKSU"
    assert odp["rule_id"] is None


def test_qa_indeks_pokazuje_urzadzenie_strone_i_hash_bez_wyroku(tmp_path: Path) -> None:
    conn = sqlite3.connect(tmp_path / "search.sqlite3")
    conn.execute(
        "CREATE TABLE indexed_files (doc_id TEXT PRIMARY KEY, sha256 TEXT, page_count INTEGER)"
    )
    conn.execute(
        "CREATE VIRTUAL TABLE pages_fts USING fts5("
        "doc_id UNINDEXED, page_no UNINDEXED, body, tokenize='unicode61 remove_diacritics 2')"
    )
    conn.execute("INSERT INTO indexed_files VALUES ('ENEA-SN-KAB', 'sha-test', 3)")
    conn.execute(
        "INSERT INTO pages_fts (doc_id,page_no,body) VALUES (?,?,?)",
        (
            "ENEA-SN-KAB", "2",
            "Projektowanie linii kablowych. Minimalna głębokość kabli SN "
            "może zależeć od warunków terenu i kolizji.",
        ),
    )
    conn.commit()
    conn.close()
    odp = answer_question(
        "Jaka minimalna głębokość kabla SN?",
        data_dir=tmp_path,
        as_of="2026-10-23",
    )
    assert odp["status"] == "ZNALEZIONO_FRAGMENTY"
    assert odp["verdict"] is None
    assert odp["sources"][0]["source_id"] == "ENEA-SN-KAB"
    assert odp["sources"][0]["page_pdf"] == 2
    assert odp["sources"][0]["sha256"] == "sha-test"
    assert odp["sources"][0]["needs_manual_interpretation"]
    assert len(odp["sources"][0]["excerpt"]) <= 202


def test_qa_odmiany_polski_jezyk_i_limity(tmp_path: Path) -> None:
    assert "slup" in _roots("słupowej")
    assert "stac" in _roots("stację")
    try:
        answer_question("x", data_dir=tmp_path)
        assert False, "Nieprawidłowe pytanie powinno być odrzucone"
    except ValueError:
        pass


def test_route_odpowiedz_z_jawna_podstawa(app_client, monkeypatch) -> None:
    monkeypatch.delenv("ENEA_KNOWLEDGE_ENABLED", raising=False)
    resp = app_client.get(
        "/api/reference/enea/pytanie",
        params={"pytanie": "Czy nowe stacje słupowe mogą mieć podejście kablowe SN?"},
    )
    assert resp.status_code == 200
    assert resp.json()["verdict"] == "NIEDOPUSZCZONE"
    assert resp.json()["sources"][0]["page_pdf"] == 3


def test_route_422_dla_nieprawidlowej_daty(app_client) -> None:
    resp = app_client.get(
        "/api/reference/enea/pytanie",
        params={"pytanie": "stacja słupowa", "data": "2026-17-91"},
    )
    assert resp.status_code == 422

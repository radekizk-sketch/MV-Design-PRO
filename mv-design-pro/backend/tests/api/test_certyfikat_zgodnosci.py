"""Testy certyfikatu zgodności projektu NC RfG (serwis kompozycji + końcówki).

Certyfikat to czysta kompozycja gotowych werdyktów macierzy NC RfG/PTPiREE
(``NcRfgPtpireeSolver``). Testy pokrywają: certyfikat pozytywny i negatywny,
bramkę braków (lista PL blokuje generację), determinizm bajtowy DOCX, stabilność
odcisku wejścia, etykiety PL w dokumencie, brak kodów projektowych, 404/422,
content-type.
"""

from __future__ import annotations

import re
from io import BytesIO
from pathlib import Path

import pytest
from application.analyses.certyfikat_zgodnosci import (
    CertyfikatBrakiError,
    build_certyfikat_view,
    render_certyfikat_docx,
    render_certyfikat_pdf,
    zbierz_braki,
)
from docx import Document
from fastapi.testclient import TestClient
from network_model.solvers.ncrfg_ptpiree import (
    NcRfgPtpireeModuleInput,
    NcRfgPtpireeRunRequest,
    NcRfgPtpireeSolver,
)
from solver_input.dowod_ncrfg import ocena_dowodowa_biegu

#: Karta S-1 (dowod dynamiczny): klasa B/C/D ma T14/T15/T16/T17 STRUKTURALNIE
#: WYMAGANE (`default_for_modules=["B","C","D"]`), a te zdolnosci sa dzis
#: NOT_SIMULATED/DECLARATION (DYNAMIC_PERFORMANCE) — nieprzydatne dowodowo
#: niezaleznie od werdyktu testu (`ocena_dowodowa_biegu`). Certyfikat wiec
#: NIGDY nie powstanie dla klasy B/C/D, dopoki zdolnosc nie zostanie
#: podniesiona do VALIDATED_SIMULATION (OD-20). Fikstura „pelna" jest wiec
#: klasy A (215 kW / 0,8 kV, jak `_MODULU_KLASY_A` nizej) — jedyna klasa BEZ
#: testow dynamicznych w `default_for_modules` — z certyfikatem PTPiREE
#: (precedens FAB-K: zero testow wymaganych + certyfikat = WNIOSEK
#: klasyfikacji, nie luka), zeby testy DOCX/PDF/determinizmu mialy realna,
#: bogata (wszystkie pola opcjonalne) sciezke pozytywna.
_MODULE_FULL: dict = {
    "der_ref": "pv-1",
    "der_name": "PV 215 kW",
    "der_kind": "PV",
    "operator_id": "enea",
    "p_max_kw": 215,
    "p_min_kw": 10,
    "voltage_kv": 0.8,
    "certificate_status": "ptpiree_verified",
    "has_lvrt_curve": True,
    "has_hvrt_curve": True,
    "has_pf_droop": True,
    "has_qu_curve": True,
    "has_dynamic_model": True,
    "has_scada_communication": True,
    "has_disturbance_recorder": True,
    "active_power_control_enabled": True,
    "droop_percent": 5,
    "dead_band_hz": 0.2,
    "ramp_rate_pct_per_min": 10,
    "cos_phi_min": 0.95,
    "q_range_pct_pn_min": -0.33,
    "q_range_pct_pn_max": 0.33,
    "reactive_current_gain": 2,
    "p_recovery_time_s": 0.8,
    # Karta AB-1a §0 R-6 (2026-09-23): `harmonic_thdu_percent` USUNIETE z fikstury
    # pelnej. Podany THD_U czyni T20 WYMAGANYM (`engine.py::_is_required`), a T20
    # przestal byc dowodem (limit 8 % zaszyty w solverze, THD_U jest wlasnoscia
    # napiecia sieci, nie emisji — `ncrfg_ptpiree.power_quality_declared`
    # DYNAMIC_PERFORMANCE). Z nim sciezka pozytywna certyfikatu bylaby
    # zablokowana bramka dowodowa — to jest osobny, przypiety przypadek
    # (`test_t20_z_podanym_thd_blokuje_certyfikat_nazwanym_brakiem`).
}

#: Karta AB-1a §0 R-6: T05/T10/T12/T13/T20 nie sa juz dowodem (deklaracja
#: zachowania w czasie, tautologia, limit zaszyty). Sciezka pozytywna certyfikatu
#: opiera sie odtad na testach, ktore SA faktem konfiguracyjnym porownanym z
#: wymaganiem (DECLARED_CONFIGURATION + DECLARATION = dowod): tryby mocy biernej
#: T06-T09, PMIN T11, telemechanika T19 — wymuszone programem szczegolowym
#: (`requested_test_ids`), bo klasa A nie ma zadnego testu wymaganego z klasyfikacji.
_TESTY_KONFIGURACYJNE: tuple[str, ...] = ("T06", "T07", "T08", "T09", "T11", "T19")


def _module(**overrides: object) -> dict:
    data = dict(_MODULE_FULL)
    data.update(overrides)
    return data


def _run_result(module: dict, requested: tuple[str, ...] = _TESTY_KONFIGURACYJNE):
    solver = NcRfgPtpireeSolver()
    return solver.run(
        NcRfgPtpireeRunRequest(
            modules=[NcRfgPtpireeModuleInput(**module)], requested_test_ids=list(requested)
        )
    )


def _docx_text(data: bytes) -> str:
    doc = Document(BytesIO(data))
    parts = [p.text for p in doc.paragraphs]
    for table in doc.tables:
        for row in table.rows:
            parts.extend(cell.text for cell in row.cells)
    return "\n".join(parts)


def _pdf_text(data: bytes) -> str:
    """Wyciągnij tekst z operatorów PDF (Tj/TJ) — PDF bez kompresji strony.

    Renderer używa ``pageCompression=0``, więc operandy tekstowe są dostępne
    literalnie; napisy ASCII (etykiety PL bez znaków diakrytycznych) odtwarzają
    się wiernie.
    """
    parts = [m.group(0) for m in re.finditer(rb"\((?:[^()\\]|\\.)*\)\s*Tj", data)]
    parts += [m.group(1) for m in re.finditer(rb"\[(.*?)\]\s*TJ", data, re.DOTALL)]
    return b" ".join(parts).decode("latin-1", "replace")


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    db_path = tmp_path / "certyfikat-api.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{db_path}")
    from api.main import app

    with TestClient(app) as test_client:
        yield test_client


def _payload(module: dict, **extra: object) -> dict:
    body = {
        "run_request": {"modules": [module], "requested_test_ids": list(_TESTY_KONFIGURACYJNE)},
        "nazwa_projektu": "Farma PV Wschód",
        "nazwa_przypadku": "Wariant bazowy",
    }
    body.update(extra)
    return body


# --------------------------------------------------------------------------- #
# Serwis kompozycji
# --------------------------------------------------------------------------- #
def test_certyfikat_pozytywny_werdykt_zgodny() -> None:
    view = build_certyfikat_view(_run_result(_module()), nazwa_projektu="Projekt A")
    assert view["kontrakt"] == "CertyfikatZgodnosciNcRfgV1"
    assert view["werdykt_zbiorczy"]["status"] == "zgodny"
    assert view["werdykt_zbiorczy"]["modulow_niezgodnych"] == 0
    assert view["moduly"][0]["klasa"] == "A"
    assert view["odcisk_wejscia_sha256"]


def test_certyfikat_negatywny_powstaje_z_werdyktem_niezgodnym() -> None:
    # INTENCJA (bez zmian): certyfikat z werdyktem NEGATYWNYM powstaje, gdy dane
    # sa kompletne i dowodowe, tylko niekorzystne — dokument stwierdza stan.
    # Karta AB-1a §0 R-6: dawniej niosl to T12 klasy A bez certyfikatu, ale T12
    # (zaprzestanie generacji w czasie) jest odtad twierdzeniem o ZACHOWANIU i nie
    # jest dowodem — patrz `test_ppm_typu_a_z_sama_deklaracja_t12_nie_jest_raportowalny`.
    # Nosnikiem jest wiec T08 (tryb cos phi, fakt konfiguracyjny): cos phi_min 0,99
    # nie pokrywa wymaganego zakresu -> `fail`, bramka dowodowa przepuszcza.
    view = build_certyfikat_view(
        _run_result(_module(cos_phi_min=0.99)),
        nazwa_projektu="Projekt A",
    )
    assert view["werdykt_zbiorczy"]["status"] == "niezgodny"
    assert view["werdykt_zbiorczy"]["modulow_niezgodnych"] == 1
    assert view["moduly"][0]["status_pl"] == "Niezgodny"
    assert any(t["test_id"] == "T08" and t["werdykt"] == "fail" for t in view["moduly"][0]["testy"])


def test_ppm_typu_a_z_sama_deklaracja_t12_nie_jest_raportowalny() -> None:
    """Pin karty AB-1a §0 R-6 („PPM typu A z sama deklaracja T12 nie jest reportable").

    Klasa A bez certyfikatu PTPiREE: T12 staje sie wymagany. Deklaracja
    zaprzestania generacji NIE dowodzi zachowania w czasie, wiec ocena dowodowa
    modulu jest `not_reportable` z ograniczeniem `T12:DECLARATION`, a certyfikat
    nie powstaje — brak jest NAZWANY (test, zdolnosc, zdanie o braku dowodu).
    """
    run_result = _run_result(
        _module(
            certificate_status="unknown",
            stop_generation_enabled=True,
            ramp_rate_pct_per_min=10,
        ),
        requested=(),
    )
    ocena = ocena_dowodowa_biegu(run_result)
    assert ocena.reporting_status == "not_reportable"
    assert "T12:DECLARATION" in ocena.per_module["pv-1"].evidence_limitations
    braki = zbierz_braki(run_result)
    assert any("test T12" in b and "(zdolność: T12:DECLARATION)" in b for b in braki), braki
    with pytest.raises(CertyfikatBrakiError):
        build_certyfikat_view(run_result, nazwa_projektu="Projekt A")


def test_t20_z_podanym_thd_blokuje_certyfikat_nazwanym_brakiem() -> None:
    """Karta AB-1a §0 R-6: podany THD_U czyni T20 wymaganym, a T20 nie jest dowodem."""
    run_result = _run_result(_module(harmonic_thdu_percent=3))
    braki = zbierz_braki(run_result)
    assert any("test T20" in b and "(zdolność: T20:DECLARATION)" in b for b in braki), braki
    with pytest.raises(CertyfikatBrakiError):
        build_certyfikat_view(run_result, nazwa_projektu="Projekt A")


def test_braki_blokuja_generacje_lista_pl() -> None:
    # Klasa A BEZ certyfikatu PTPiREE i bez funkcji zdalnej komendy P: T12
    # staje się wymagany i pozostaje `no_data` (brak `stop_generation_enabled`).
    run_result = _run_result(_module(certificate_status="unknown"))
    with pytest.raises(CertyfikatBrakiError) as exc:
        build_certyfikat_view(run_result, nazwa_projektu="Projekt A")
    braki = exc.value.braki
    assert braki
    assert any("brak danych do oceny" in b for b in braki)
    assert any("T12" in b for b in braki)


def test_zbierz_braki_pusta_lista_gdy_komplet() -> None:
    assert zbierz_braki(_run_result(_module())) == []


# --------------------------------------------------------------------------- #
# Karta FAB-K: moduł klasy A (zero testów WYMAGANYCH z klasyfikacji — żaden test
# katalogu nie ma klasy A w `default_for_modules`, patrz `engine.py`) — ILOCZYN
# CECH certyfikat × podstawa, nie jeden przykład z karty. Regresja odkryta
# empirycznie (e2e `critical-oze-evidence.spec.ts`, moduł 215 kW/0,8 kV) PO
# naprawie frontu (karta FAB-K R1), który dotąd czytał `ptpiree_certificate_ref`
# z pola nigdy niezapisywanego przez backend — `certificate_status` był więc
# ZAWSZE "unknown" i ta gałąź nigdy się nie uruchamiała: luka była niewidoczna,
# dopóki front nie zaczął poprawnie zgłaszać zweryfikowanego certyfikatu.
# --------------------------------------------------------------------------- #
_MODULU_KLASY_A: dict = {
    "der_ref": "pv-a-1",
    "der_name": "PV 215 kW",
    "der_kind": "PV",
    "operator_id": "enea",
    "p_max_kw": 215,
    "voltage_kv": 0.8,
    "certificate_status": "ptpiree_verified",
}


def test_klasa_a_z_certyfikatem_ptpiree_ma_zero_wymaganych_ale_to_NIE_jest_brak() -> None:
    """Moduł klasy A bez ŻADNEGO testu z klasyfikacji, ALE ze zweryfikowanym
    certyfikatem PTPiREE — certyfikat producenta jest samodzielną podstawą,
    zero testów NC RfG jest tu WNIOSKIEM klasyfikacji, nie luką dowodową."""
    run_result = _run_result(dict(_MODULU_KLASY_A), requested=())
    modul = run_result.modules[0]
    assert modul.module_type == "A"
    assert modul.required_count == 0
    assert zbierz_braki(run_result) == []
    # Certyfikat MUSI faktycznie powstać (nie tylko `zbierz_braki` pusta) —
    # dowód end-to-end przez `build_certyfikat_view`, nie tylko przez samą
    # funkcję bramki (przypadek z karty PRZEGLAD_FALI_2026-08-01: naprawiono
    # jedną funkcję, nie ścieżkę produkcyjną).
    view = build_certyfikat_view(run_result, nazwa_projektu="Projekt A")
    assert view["moduly"][0]["klasa"] == "A"


def test_klasa_a_bez_certyfikatu_wymaga_t12_i_zostaje_brakiem_gdy_niekompletny() -> None:
    """PREDYKAT PAROWY z testem wyżej — TA SAMA klasa A, ALE BEZ certyfikatu:
    `required_count` NIE jest tu 0 (T12 „zaprzestanie generacji" staje się
    WYMAGANY właśnie DLATEGO, że certyfikatu brak — `_is_required` w
    `engine.py`), więc gałąź „required_count == 0" tej karty nigdy się nie
    uruchamia dla tego przypadku z innego powodu niż w teście wyżej. Test
    pilnuje WŁAŚNIE tej pary predykatów: `required_count == 0` i
    `certificate_status == "ptpiree_verified"` idą razem dla klasy A (żaden
    inny test katalogu nie ma klasy A w `default_for_modules`) — nie da się
    skonstruować „klasa A + zero wymaganych + bez certyfikatu" wcale, bo T12
    WYPEŁNIA lukę. Zostaje więc niekompletny (brak danych numerycznych, których
    fikstura celowo nie podaje) — bramka braków nadal blokuje, innym powodem."""
    for status in ("unknown", "none", "expired"):
        run_result = _run_result(dict(_MODULU_KLASY_A, certificate_status=status), requested=())
        modul = run_result.modules[0]
        assert modul.module_type == "A"
        assert modul.required_count >= 1, (
            status,
            "T12 musi stac sie wymagany bez certyfikatu",
        )
        with pytest.raises(CertyfikatBrakiError):
            build_certyfikat_view(run_result, nazwa_projektu="Projekt A")


def test_certyfikowany_modul_z_INNYM_brakiem_nadal_jest_blokowany() -> None:
    """PREDYKAT PAROWY właściwy dla naprawy: certyfikat PTPiREE zwalnia
    WYŁĄCZNIE z braku „required_count == 0" — moduł certyfikowany (`_MODULE_FULL`
    ma `certificate_status="ptpiree_verified"` od zawsze), który MA testy
    wymagane z klasyfikacji (klasa B), ale jeden z nich ma werdykt `no_data`
    (`test_braki_blokuja_generacje_lista_pl` powyżej — TA SAMA fikstura),
    MUSI zostać zablokowany jak każdy inny. Ten test czyni PAROWANIE jawnym
    (asercja na `certificate_status`), zamiast polegać na przypadkowej wartości
    domyślnej fikstury — naprawa nie zdejmuje bramki z certyfikowanych modułów
    w całości, tylko dokładnie z powodu „required_count == 0"."""
    run_result = _run_result(
        _module(
            p_max_kw=2000,
            voltage_kv=15,
            p_recovery_time_s=None,
            reactive_current_gain=None,
        )
    )
    modul = run_result.modules[0]
    assert modul.module_type == "B"
    assert modul.certificate_status == "ptpiree_verified"
    assert modul.required_count > 0
    braki = zbierz_braki(run_result)
    assert braki
    assert not any("brak podstawy do certyfikacji" in b for b in braki)
    assert any("brak danych do oceny" in b for b in braki)
    with pytest.raises(CertyfikatBrakiError):
        build_certyfikat_view(run_result, nazwa_projektu="Projekt A")


def test_docx_determinizm_bajtowy() -> None:
    view = build_certyfikat_view(_run_result(_module()), nazwa_projektu="Projekt A")
    first = render_certyfikat_docx(view)
    second = render_certyfikat_docx(view)
    assert first == second
    assert len(first) > 0


def test_input_hash_stabilny_dla_tego_samego_wejscia() -> None:
    view_a = build_certyfikat_view(_run_result(_module()), nazwa_projektu="Projekt A")
    view_b = build_certyfikat_view(_run_result(_module()), nazwa_projektu="Projekt A")
    assert view_a["odcisk_wejscia_sha256"] == view_b["odcisk_wejscia_sha256"]
    assert view_a == view_b


def test_docx_naglowki_i_etykiety_pl() -> None:
    view = build_certyfikat_view(
        _run_result(_module()),
        nazwa_projektu="Farma PV",
        nazwa_przypadku="Wariant bazowy",
    )
    text = _docx_text(render_certyfikat_docx(view))
    assert "Certyfikat zgodności projektu z wymaganiami NC RfG" in text
    assert "Werdykt zbiorczy" in text
    assert "Farma PV" in text
    assert "Założenia i źródła" in text
    assert "Odcisk SHA-256 wejścia" in text
    assert "spełnia" in text


def test_dokument_bez_kodow_projektowych() -> None:
    view = build_certyfikat_view(_run_result(_module()), nazwa_projektu="Projekt A")
    text = _docx_text(render_certyfikat_docx(view))
    for pattern in (r"\bP\d{2}\b", r"\bE\d{2}\b", r"\bW-\d{3}\b"):
        assert re.search(pattern, text) is None, pattern


# --------------------------------------------------------------------------- #
# Końcówki API
# --------------------------------------------------------------------------- #
def test_endpoint_json_200_zgodny(client: TestClient) -> None:
    response = client.post("/api/oze-analysis/compliance-certificate", json=_payload(_module()))
    assert response.status_code == 200
    payload = response.json()
    assert payload["werdykt_zbiorczy"]["status"] == "zgodny"
    assert payload["identyfikacja"]["projekt"] == "Farma PV Wschód"


def test_endpoint_json_negatywny_200(client: TestClient) -> None:
    # Karta AB-1a §0 R-6: nosnik werdyktu negatywnego = T08 (fakt konfiguracyjny),
    # nie T12 (deklaracja zachowania w czasie — nie jest dowodem; patrz
    # `test_ppm_typu_a_z_sama_deklaracja_t12_nie_jest_raportowalny`).
    response = client.post(
        "/api/oze-analysis/compliance-certificate",
        json=_payload(_module(cos_phi_min=0.99)),
    )
    assert response.status_code == 200
    assert response.json()["werdykt_zbiorczy"]["status"] == "niezgodny"


def test_endpoint_braki_422_z_lista(client: TestClient) -> None:
    response = client.post(
        "/api/oze-analysis/compliance-certificate",
        json=_payload(_module(certificate_status="unknown")),
    )
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert isinstance(detail["braki"], list)
    assert any("brak danych do oceny" in b for b in detail["braki"])


def test_endpoint_nieznany_operator_404(client: TestClient) -> None:
    response = client.post(
        "/api/oze-analysis/compliance-certificate",
        json=_payload(_module(operator_id="nieistniejacy")),
    )
    assert response.status_code == 404
    assert "nie istnieje" in response.json()["detail"]


def test_endpoint_walidacja_422_pusta_nazwa(client: TestClient) -> None:
    response = client.post(
        "/api/oze-analysis/compliance-certificate",
        json=_payload(_module(), nazwa_projektu=""),
    )
    assert response.status_code == 422


def test_endpoint_docx_content_type(client: TestClient) -> None:
    response = client.post(
        "/api/oze-analysis/compliance-certificate.docx", json=_payload(_module())
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    assert "attachment" in response.headers["content-disposition"]
    assert response.content[:2] == b"PK"


def test_endpoint_docx_determinizm(client: TestClient) -> None:
    first = client.post("/api/oze-analysis/compliance-certificate.docx", json=_payload(_module()))
    second = client.post("/api/oze-analysis/compliance-certificate.docx", json=_payload(_module()))
    assert first.status_code == 200
    assert first.content == second.content


def test_endpoint_docx_braki_422(client: TestClient) -> None:
    response = client.post(
        "/api/oze-analysis/compliance-certificate.docx",
        json=_payload(_module(certificate_status="unknown")),
    )
    assert response.status_code == 422
    assert "braki" in response.json()["detail"]


# --------------------------------------------------------------------------- #
# Wariant PDF (D16)
# --------------------------------------------------------------------------- #
def test_pdf_powstaje_naglowek_i_niepusty() -> None:
    view = build_certyfikat_view(_run_result(_module()), nazwa_projektu="Projekt A")
    data = render_certyfikat_pdf(view)
    assert data[:4] == b"%PDF"
    assert len(data) > 0


def test_pdf_determinizm_bajtowy() -> None:
    view = build_certyfikat_view(_run_result(_module()), nazwa_projektu="Projekt A")
    assert render_certyfikat_pdf(view) == render_certyfikat_pdf(view)


def test_pdf_etykiety_pl() -> None:
    view = build_certyfikat_view(
        _run_result(_module()),
        nazwa_projektu="Farma PV",
        nazwa_przypadku="Wariant bazowy",
    )
    text = _pdf_text(render_certyfikat_pdf(view))
    assert "Werdykt zbiorczy" in text
    assert "Operator:" in text
    assert "Status:" in text
    assert "Test" in text


def test_pdf_dokument_bez_kodow_projektowych() -> None:
    view = build_certyfikat_view(_run_result(_module()), nazwa_projektu="Projekt A")
    text = _pdf_text(render_certyfikat_pdf(view))
    for pattern in (r"\bP\d{2}\b", r"\bE\d{2}\b", r"\bW-\d{3}\b"):
        assert re.search(pattern, text) is None, pattern


def test_endpoint_pdf_content_type(client: TestClient) -> None:
    response = client.post("/api/oze-analysis/compliance-certificate.pdf", json=_payload(_module()))
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert "attachment" in response.headers["content-disposition"]
    assert response.content[:4] == b"%PDF"


def test_endpoint_pdf_determinizm(client: TestClient) -> None:
    first = client.post("/api/oze-analysis/compliance-certificate.pdf", json=_payload(_module()))
    second = client.post("/api/oze-analysis/compliance-certificate.pdf", json=_payload(_module()))
    assert first.status_code == 200
    assert first.content == second.content


def test_endpoint_pdf_braki_422(client: TestClient) -> None:
    response = client.post(
        "/api/oze-analysis/compliance-certificate.pdf",
        json=_payload(_module(certificate_status="unknown")),
    )
    assert response.status_code == 422
    assert "braki" in response.json()["detail"]


def test_endpoint_pdf_nieznany_operator_404(client: TestClient) -> None:
    response = client.post(
        "/api/oze-analysis/compliance-certificate.pdf",
        json=_payload(_module(operator_id="nieistniejacy")),
    )
    assert response.status_code == 404

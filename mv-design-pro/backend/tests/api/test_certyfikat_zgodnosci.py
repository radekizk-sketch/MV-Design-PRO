"""Certyfikat zgodności NC RfG — wyłącznie z zatwierdzonego modelu, na rekordach W (karta
AB-1a Pakiet C pkt 10).

Certyfikat powstaje z oceny zgodności zatwierdzonego modelu przypadku
(``zgodnosc_ncrfg_przypadku``) i tylko wtedy, gdy KAŻDE wymaganie stosowalne ma ``SPELNIA``.
Braki to rekordy ``WynikWymagania`` z modułem (422: ``braki`` = ``{der_ref, der_name, rekord}``
+ ``braki_pl`` = ``{der_ref, der_name, zdanie_pl}``).
Dokument: per moduł klasyfikacja z podstawą, technologia, dowód certyfikatu urządzenia i bloki
``werdykt.blok_wymagania`` — bez liczników i bez werdyktu zbiorczego (O-13).

ILOCZYN CECH: model {magazyn samodzielny (wszystko NIE_DOTYCZY), moduł istniejący art. 4,
moduł poniżej progu, moduł A bez certyfikatu, moduł A z certyfikatem z wykazu, moduł B,
źródło pominięte, model bez źródeł} × wyjście {JSON, DOCX, PDF} × wejście HTTP {z przypadkiem,
bez przypadku, ciało z polem biegu „co-jeśli", przypadek bez dokumentu ENM, operator
nieznany}. T13 kontraktu werdyktu: to samo zdanie rekordu W w JSON, DOCX i PDF.

Intencje zachowane z testów sprzed karty: determinizm bajtowy DOCX/PDF i odcisku wejścia,
etykiety PL, brak kodów projektowych, 404/422, typ zawartości, dowód certyfikatu urządzenia
w dokumencie z jawnym stanem zerowym (dawny `test_dowod_certyfikatu_dokumentow.py`).
"""

from __future__ import annotations

import re
from io import BytesIO
from pathlib import Path
from typing import Any

import pymupdf
import pytest
from application.analyses.certyfikat_zgodnosci import (
    CERTYFIKAT_CONTRACT,
    KOMUNIKAT_BEZ_MODULOW,
    KOMUNIKAT_BRAKOW,
    CertyfikatBrakiError,
    build_certyfikat_view,
    render_certyfikat_docx,
    render_certyfikat_pdf,
    zbierz_braki,
)
from application.analyses.sekcja_zgodnosci_ncrfg import BRAK_CERTYFIKATU_PL
from application.ncrfg_compliance import NcRfgCaseComplianceResponse, zgodnosc_ncrfg_przypadku
from docx import Document
from enm.models import EnergyNetworkModel
from fastapi.testclient import TestClient
from werdykt import WynikWymagania, blok_wymagania

from tests import ncrfg_fabryki as f

_KODY_PROJEKTOWE = (r"\bP\d{2}\b", r"\bE\d{2}\b", r"\bW-\d{3}\b", r"\bAB-1")


def _zgodnosc(enm: EnergyNetworkModel) -> NcRfgCaseComplianceResponse:
    return zgodnosc_ncrfg_przypadku(enm, operator_id=f.OPERATOR, case_id="przypadek-1")


def _model_magazynu() -> EnergyNetworkModel:
    return f.model(f.generator("bess-1", p_mw=2.0, gen_type="bess"))


def _model_istniejacy() -> EnergyNetworkModel:
    return f.model(f.generator("pv-ist", p_mw=2.0, modul_istniejacy=True))


def _model_ponizej_progu() -> EnergyNetworkModel:
    return f.model(f.generator("pv-mikro", p_mw=0.0005), napiecie_kv=0.4)


def _model_a(tabliczka: dict[str, Any] | None = None) -> EnergyNetworkModel:
    return f.model(f.generator("pv-a", p_mw=0.05, materialized_params=tabliczka), napiecie_kv=0.4)


def _view(enm: EnergyNetworkModel) -> dict[str, Any]:
    return build_certyfikat_view(
        _zgodnosc(enm), nazwa_projektu="Farma PV Wschód", nazwa_przypadku="Wariant bazowy"
    )


def _docx_text(data: bytes) -> str:
    return "\n".join(p.text for p in Document(BytesIO(data)).paragraphs)


def _pdf_text(data: bytes) -> str:
    with pymupdf.open(stream=data, filetype="pdf") as dokument:
        return "\n".join(strona.get_text() for strona in dokument)


def _splaszcz(tekst: str) -> str:
    return re.sub(r"\s+", " ", tekst)


# --------------------------------------------------------------------------- #
# Serwis: ścieżka pozytywna (wszystkie wymagania stosowalne SPELNIA albo żadne)
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "budowa", [_model_magazynu, _model_istniejacy, _model_ponizej_progu], ids=lambda b: b.__name__
)
def test_certyfikat_powstaje_gdy_brak_wymagan_stosowalnych_bez_spelnia(budowa: Any) -> None:
    zgodnosc = _zgodnosc(budowa())
    assert zbierz_braki(zgodnosc) == []
    view = build_certyfikat_view(zgodnosc, nazwa_projektu="Projekt")
    assert view["kontrakt"] == CERTYFIKAT_CONTRACT == "CertyfikatZgodnosciNcRfgV2"
    assert "werdykt_zbiorczy" not in view and "podstawa_dowodowa" not in view
    [modul] = view["moduly"]
    assert zgodnosc.bieg is not None
    wynik = zgodnosc.bieg.modules[0]
    assert modul["klasyfikacja"] == wynik.klasyfikacja.model_dump(mode="json")
    assert modul["technologia"] == wynik.technologia
    assert modul["zrodlo_danych"] == "ZATWIERDZONY_MODEL"
    etykiety = [w["etykieta_pl"] for w in modul["wiersze"]]
    assert etykiety[:4] == ["Moduł", "Klasyfikacja modułu", "Podstawa klasyfikacji", "Technologia"]
    # Jawny stan zerowy dowodu certyfikatu (tabliczka bez rekordu wykazu).
    assert modul["dowod_certyfikatu"] is None
    assert {"etykieta_pl": "Dowód certyfikatu urządzenia", "tresc_pl": BRAK_CERTYFIKATU_PL} in (
        modul["wiersze"]
    )
    ocena = zgodnosc.bieg.ocena_wymagan[0]
    assert [w["rekord"]["wymaganie_id"] for w in modul["wymagania"]] == [
        r.wymaganie_id for r in ocena.wymagania
    ]
    for pozycja, rekord in zip(modul["wymagania"], ocena.wymagania, strict=True):
        assert pozycja["rekord"] == rekord.model_dump(mode="json")
        assert pozycja["blok"] == [p.model_dump(mode="json") for p in blok_wymagania(rekord)]
        assert rekord.status_maszynowy == "NIE_DOTYCZY"


def test_widok_niesie_identyfikacje_i_procedure_z_profilu() -> None:
    view = _view(_model_magazynu())
    identyfikacja = view["identyfikacja"]
    assert identyfikacja["projekt"] == "Farma PV Wschód"
    assert identyfikacja["case_id"] == "przypadek-1"
    assert identyfikacja["operator_id"] == f.OPERATOR
    assert identyfikacja["procedura"]["tytul"].startswith("PTPiREE")
    assert view["odcisk_wejscia_sha256"] and view["odcisk_wyniku_sha256"]


# --------------------------------------------------------------------------- #
# Serwis: bramka braków — rekordy W
# --------------------------------------------------------------------------- #


def _braki(enm: EnergyNetworkModel) -> CertyfikatBrakiError:
    with pytest.raises(CertyfikatBrakiError) as blad:
        _view(enm)
    return blad.value


def test_modul_a_bez_certyfikatu_braki_to_rekordy_w() -> None:
    """Sonda (1): 13.1a, 13.1b, 13.3, 13.4, 13.7 ``BRAK_DOWODU`` („brak metody"), LFSM-O
    niewydany — braki są rekordami W z wyjaśnieniem."""
    blad = _braki(_model_a())
    assert all(isinstance(b.rekord, WynikWymagania) for b in blad.braki)
    statusy = {b.rekord.wymaganie_id: b.rekord.status_maszynowy for b in blad.braki}
    for wymaganie_id in ("RFG_13_1A", "RFG_13_1B", "RFG_13_3", "RFG_13_4", "RFG_13_7"):
        assert statusy[wymaganie_id] == "BRAK_DOWODU"
    detail = blad.detail()
    assert detail["komunikat"] == KOMUNIKAT_BRAKOW
    # Odbiór Pakietu C (plan AB O-50 pkt 7): każda pozycja braku niesie moduł.
    assert detail["braki_pl"] == [
        {"der_ref": b.der_ref, "der_name": b.der_name, "zdanie_pl": b.rekord.wyjasnienie.zdanie_pl}
        for b in blad.braki
    ]
    assert [
        (b["der_ref"], b["der_name"], b["rekord"]["wymaganie_id"]) for b in detail["braki"]
    ] == [(b.der_ref, b.der_name, b.rekord.wymaganie_id) for b in blad.braki]
    assert {b["der_ref"] for b in detail["braki"]} == {g.ref_id for g in _model_a().generators}
    assert detail["pominiete"] == [] and detail["pominiete_pl"] == []


def test_modul_a_z_certyfikatem_z_wykazu_nadal_brak_dowodu_z_regula_wipwc() -> None:
    """Sonda (2): certyfikat dopasowany przez serwer + reguła pokrycia WiPWC NIEUSTALONE →
    ``BRAK_DOWODU`` z powodem nazywającym regułę; certyfikat nie powstaje."""
    blad = _braki(_model_a(f.tabliczka(f.rekord_wykazu("A,B"))))
    certyfikatowe = [b.rekord for b in blad.braki if b.rekord.sposob_wykazania == "CERTYFIKAT"]
    assert certyfikatowe
    for rekord in certyfikatowe:
        assert rekord.status_maszynowy != "SPELNIA"
        assert any("WiPWC" in p for p in rekord.powody_niepelnosci)


def test_modul_b_braki_wymagan_dynamicznych() -> None:
    """Sonda (3): moduł B — 14(3), 20(2)(b), 20(3) ``NIE_OCENIONO`` z brakiem biegu dynamiki."""
    blad = _braki(f.model(f.generator("pv-b", p_mw=2.0)))
    statusy = {b.rekord.wymaganie_id: b.rekord for b in blad.braki}
    for wymaganie_id in ("RFG_14_3", "RFG_20_2B", "RFG_20_3"):
        rekord = statusy[wymaganie_id]
        assert rekord.status_maszynowy == "NIE_OCENIONO"
        assert any("bieg dynamiki" in b for b in rekord.wyjasnienie.czego_brakuje)


def test_zrodlo_pominiete_blokuje_certyfikat() -> None:
    enm = f.model(f.generator("bess-1", p_mw=2.0, gen_type="bess"), f.generator("pv-0", p_mw=0.0))
    blad = _braki(enm)
    assert blad.braki == []
    assert [p.der_ref for p in blad.pominiete] == ["pv-0"]
    assert blad.detail()["komunikat"] == KOMUNIKAT_BRAKOW
    assert "pv-0" in blad.detail()["pominiete_pl"][0]


def test_model_bez_zrodel_nie_ma_czego_certyfikowac() -> None:
    blad = _braki(f.model())
    assert (blad.braki, blad.pominiete) == ([], [])
    assert blad.detail()["komunikat"] == KOMUNIKAT_BEZ_MODULOW


# --------------------------------------------------------------------------- #
# Render: T13 (to samo zdanie w JSON, DOCX, PDF), determinizm, etykiety, kody
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize("budowa", [_model_magazynu, _model_istniejacy], ids=lambda b: b.__name__)
def test_t13_to_samo_zdanie_rekordu_w_json_docx_i_pdf(budowa: Any) -> None:
    view = _view(budowa())
    docx = _splaszcz(_docx_text(render_certyfikat_docx(view)))
    pdf = _splaszcz(_pdf_text(render_certyfikat_pdf(view)))
    zdania = [
        pozycja["tresc_pl"]
        for wymaganie in view["moduly"][0]["wymagania"]
        for pozycja in wymaganie["blok"]
        if pozycja["etykieta_pl"] == "Wyjaśnienie"
    ]
    assert zdania
    for wymaganie in view["moduly"][0]["wymagania"]:
        assert wymaganie["rekord"]["wyjasnienie"]["zdanie_pl"] in zdania
    for zdanie in zdania:
        assert f"Wyjaśnienie: {_splaszcz(zdanie)}" in docx
        assert _splaszcz(zdanie) in pdf


def test_docx_i_pdf_deterministyczne_bajtowo() -> None:
    assert render_certyfikat_docx(_view(_model_magazynu())) == render_certyfikat_docx(
        _view(_model_magazynu())
    )
    assert render_certyfikat_pdf(_view(_model_magazynu())) == render_certyfikat_pdf(
        _view(_model_magazynu())
    )
    assert _view(_model_magazynu()) == _view(_model_magazynu())


def test_docx_i_pdf_etykiety_pl_bez_licznikow_i_kodow() -> None:
    view = _view(_model_istniejacy())
    for tekst in (
        _docx_text(render_certyfikat_docx(view)),
        _pdf_text(render_certyfikat_pdf(view)),
    ):
        splaszczony = _splaszcz(tekst)
        for fraza in (
            "Certyfikat zgodności projektu z wymaganiami NC RfG",
            "Farma PV Wschód",
            "Moduł wytwarzania energii: Źródło pv-ist",
            "Klasyfikacja modułu:",
            "Podstawa klasyfikacji:",
            "Sposób wykazania:",
            "Założenia i źródła",
            "Odcisk SHA-256 wejścia",
        ):
            assert fraza in splaszczony, fraza
        for zakazane in ("Werdykt zbiorczy", "zgodnych:", "niezgodnych:", "Moduły: "):
            assert zakazane not in splaszczony
        for wzorzec in _KODY_PROJEKTOWE:
            assert re.search(wzorzec, tekst) is None, wzorzec


# --------------------------------------------------------------------------- #
# Końcówki API
# --------------------------------------------------------------------------- #


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{tmp_path / 'certyfikat-api.db'}")
    from api.main import app
    from enm.store import reset_enm_store

    reset_enm_store()
    with TestClient(app) as test_client:
        yield test_client
    reset_enm_store()


def _przypadek(client: TestClient, enm: EnergyNetworkModel | None) -> str:
    """REALNY projekt + przypadek; model zapisany pod kluczem projektu (CV-1-W)."""
    from application.twin_key import klucz_twin_dla_przypadku
    from enm.store import set_enm

    projekt = client.post("/api/projects", json={"name": "Certyfikat NC RfG — test"})
    assert projekt.status_code == 201, projekt.text
    przypadek = client.post(
        "/api/study-cases", json={"project_id": projekt.json()["id"], "name": "Wariant bazowy"}
    )
    assert przypadek.status_code == 201, przypadek.text
    case_id = str(przypadek.json()["id"])
    if enm is not None:
        set_enm(klucz_twin_dla_przypadku(case_id, client.app.state.uow_factory), enm)
    return case_id


_CIALO = {
    "nazwa_projektu": "Farma PV Wschód",
    "nazwa_przypadku": "Wariant bazowy",
    "operator_id": f.OPERATOR,
}
_SCIEZKI = (
    "/api/oze-analysis/compliance-certificate",
    "/api/oze-analysis/compliance-certificate.docx",
    "/api/oze-analysis/compliance-certificate.pdf",
)


@pytest.mark.parametrize("sciezka", _SCIEZKI)
def test_endpoint_bez_przypadku_to_422(client: TestClient, sciezka: str) -> None:
    """Sonda (7): certyfikat bez ``case_id`` → 422 (parametr wymagany)."""
    assert client.post(sciezka, json=_CIALO).status_code == 422


@pytest.mark.parametrize("sciezka", _SCIEZKI)
def test_endpoint_cialo_z_biegiem_co_jesli_to_422(client: TestClient, sciezka: str) -> None:
    case_id = _przypadek(client, _model_magazynu())
    cialo = {**_CIALO, "run_request": {"modules": [f.KOMPLET]}}
    assert client.post(sciezka, params={"case_id": case_id}, json=cialo).status_code == 422


def test_endpoint_przypadek_bez_modelu_i_nieznany_operator_to_404(client: TestClient) -> None:
    bez_modelu = _przypadek(client, None)
    odpowiedz = client.post(_SCIEZKI[0], params={"case_id": bez_modelu}, json=_CIALO)
    assert odpowiedz.status_code == 404
    assert "nie ma dokumentu ENM" in odpowiedz.json()["detail"]
    case_id = _przypadek(client, _model_magazynu())
    odpowiedz = client.post(
        _SCIEZKI[0], params={"case_id": case_id}, json={**_CIALO, "operator_id": "nieistnieje"}
    )
    assert odpowiedz.status_code == 404
    assert "nieistnieje" in odpowiedz.json()["detail"]


def test_endpoint_json_z_modelu(client: TestClient) -> None:
    case_id = _przypadek(client, _model_magazynu())
    odpowiedz = client.post(_SCIEZKI[0], params={"case_id": case_id}, json=_CIALO)
    assert odpowiedz.status_code == 200, odpowiedz.text
    cialo = odpowiedz.json()
    assert cialo["identyfikacja"]["case_id"] == case_id
    assert cialo["moduly"][0]["der_ref"] == "bess-1"
    assert cialo["moduly"][0]["technologia"] == "MAGAZYN"


@pytest.mark.parametrize(
    "sciezka, typ",
    [
        (_SCIEZKI[1], "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        (_SCIEZKI[2], "application/pdf"),
    ],
)
def test_endpoint_pliki_typ_i_determinizm(client: TestClient, sciezka: str, typ: str) -> None:
    case_id = _przypadek(client, _model_magazynu())
    pierwszy = client.post(sciezka, params={"case_id": case_id}, json=_CIALO)
    drugi = client.post(sciezka, params={"case_id": case_id}, json=_CIALO)
    assert pierwszy.status_code == 200, pierwszy.text
    assert pierwszy.headers["content-type"] == typ
    assert pierwszy.content == drugi.content


@pytest.mark.parametrize("sciezka", _SCIEZKI)
def test_endpoint_braki_422_z_rekordami_i_zdaniami(client: TestClient, sciezka: str) -> None:
    case_id = _przypadek(client, _model_a())
    odpowiedz = client.post(sciezka, params={"case_id": case_id}, json=_CIALO)
    assert odpowiedz.status_code == 422, odpowiedz.text
    detail = odpowiedz.json()["detail"]
    assert detail["komunikat"] == KOMUNIKAT_BRAKOW
    assert detail["braki"] and len(detail["braki"]) == len(detail["braki_pl"])
    for brak, brak_pl in zip(detail["braki"], detail["braki_pl"], strict=True):
        assert set(brak) == {"der_ref", "der_name", "rekord"}
        assert set(brak_pl) == {"der_ref", "der_name", "zdanie_pl"}
        assert (brak["der_ref"], brak["der_name"]) == (brak_pl["der_ref"], brak_pl["der_name"])
        assert brak["rekord"]["wyjasnienie"]["zdanie_pl"] == brak_pl["zdanie_pl"]
        WynikWymagania.model_validate(brak["rekord"])


def test_endpoint_walidacja_422_pusta_nazwa(client: TestClient) -> None:
    case_id = _przypadek(client, _model_magazynu())
    odpowiedz = client.post(
        _SCIEZKI[0], params={"case_id": case_id}, json={**_CIALO, "nazwa_projektu": ""}
    )
    assert odpowiedz.status_code == 422

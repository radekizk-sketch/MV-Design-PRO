"""Brama dostępności eksportu wywodu `/api/analysis-runs/{run}/export/proof/dostepnosc`.

PO CO. Panel dolny powłoki (zakładka „Dowody") i generator dokumentacji pokazują
polecenia eksportu wywodu (JSON, LaTeX, PDF) wyłącznie wtedy, gdy serwer naprawdę je
obsłuży dla TEGO biegu; polecenie niedostępne jest nieaktywne z przyczyną. Dawny
predykat frontu (obecność skrótu śladu) liczył się z INNEJ funkcji niż eksport
(`build_run_trace_payload` kontra `build_analysis_run_trace_export_payload`), więc
dla części biegów „dostępny" kończył się odmową 422.

Pokrycie jako ILOCZYN CECH: rodzaj biegu (3F / 1F / rozpływ / stan fazowy / bieg
niewykonany) × format (json / latex / pdf) × biblioteka składu PDF (jest / brak).
Na każdym punkcie iloczynu brama musi zgadzać się z samym eksportem: `dostepny`
⇔ eksport 200, a powód braku = treść odmowy eksportu (predykaty parami).
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from api import analysis_run_exports
from api.main import app
from fastapi.testclient import TestClient

from tests.api.test_pakiet_dowodowy_biegu import (
    _nowy_przypadek,
    _reset_backend_state,
    _seed_enm,
    _wykonaj_bieg,
)


@pytest.fixture()
def client() -> TestClient:
    _reset_backend_state()
    with TestClient(app) as test_client:
        yield test_client


FORMATY = ("json", "latex", "pdf")


def _bieg(client: TestClient, rodzaj: str) -> str:
    klucz, case_id = _nowy_przypadek(client)
    _seed_enm(klucz)
    if rodzaj == "NIEWYKONANY":
        create = client.post(
            f"/api/execution/study-cases/{case_id}/runs",
            json={"analysis_type": "SC_3F", "solver_input": {}},
        )
        assert create.status_code == 201, create.text
        return str(create.json()["id"])
    return _wykonaj_bieg(client, case_id, rodzaj)


def _sprawdz_pare(client: TestClient, run_id: str) -> dict[str, dict]:
    odpowiedz = client.get(f"/api/analysis-runs/{run_id}/export/proof/dostepnosc")
    assert odpowiedz.status_code == 200, odpowiedz.text
    dane = odpowiedz.json()
    assert dane["run_id"] == run_id
    assert [f["format"] for f in dane["formaty"]] == list(FORMATY)
    wg_formatu = {f["format"]: f for f in dane["formaty"]}
    for format_eksportu, opis in wg_formatu.items():
        eksport = client.get(f"/api/analysis-runs/{run_id}/export/proof/{format_eksportu}")
        if opis["dostepny"]:
            assert opis["powod_pl"] is None
            assert eksport.status_code == 200, (format_eksportu, eksport.text)
        else:
            assert opis["powod_pl"], "brak eksportu bez powodu = werdykt bez wyjaśnienia"
            assert eksport.status_code in (422, 503), (format_eksportu, eksport.status_code)
            assert eksport.json()["detail"] == opis["powod_pl"]
    return wg_formatu


@pytest.mark.parametrize("rodzaj", ["SC_3F", "SC_1F", "LOAD_FLOW", "PHASE_STATE_SN", "NIEWYKONANY"])
def test_brama_zgodna_z_eksportem_dla_kazdego_rodzaju_i_formatu(
    client: TestClient, rodzaj: str
) -> None:
    wg_formatu = _sprawdz_pare(client, _bieg(client, rodzaj))
    if rodzaj == "NIEWYKONANY":
        # Bieg bez wyniku nie ma śladu — żaden format nie może być obiecany.
        assert not any(opis["dostepny"] for opis in wg_formatu.values())
    if rodzaj == "SC_3F":
        # Zwarcie trójfazowe niesie ślad WHITE BOX — komplet formatów.
        assert all(opis["dostepny"] for opis in wg_formatu.values())


@pytest.mark.parametrize("rodzaj", ["SC_3F", "NIEWYKONANY"])
def test_brak_biblioteki_pdf_odbiera_tylko_pdf_z_tym_samym_powodem(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, rodzaj: str
) -> None:
    run_id = _bieg(client, rodzaj)
    przed = _sprawdz_pare(client, run_id)
    monkeypatch.setattr(analysis_run_exports.importlib.util, "find_spec", lambda _nazwa: None)
    po = _sprawdz_pare(client, run_id)
    assert po["json"] == przed["json"]
    assert po["latex"] == przed["latex"]
    assert po["pdf"]["dostepny"] is False
    if przed["pdf"]["dostepny"]:
        # Dane są, brakuje składu PDF — powód mówi o bibliotece, nie o danych.
        assert "reportlab" in po["pdf"]["powod_pl"]
    else:
        # Brak danych ma pierwszeństwo: przyczyna pierwotna, nie wtórna.
        assert po["pdf"]["powod_pl"] == przed["pdf"]["powod_pl"]


def test_brama_deterministyczna(client: TestClient) -> None:
    run_id = _bieg(client, "SC_3F")
    adres = f"/api/analysis-runs/{run_id}/export/proof/dostepnosc"
    assert client.get(adres).json() == client.get(adres).json()


def test_nieznany_bieg_404(client: TestClient) -> None:
    odpowiedz = client.get(f"/api/analysis-runs/{uuid4()}/export/proof/dostepnosc")
    assert odpowiedz.status_code == 404

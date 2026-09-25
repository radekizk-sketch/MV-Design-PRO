"""Trasy API bez połykania i przebierania wyjątków (karta #151).

Iloczyn cech: {trasa: sonda zdrowia, diagnostyka przypadku, cztery trasy wzorca
referencyjnego, lista fikstur wzorca} × {odmowa nazwana tej ścieżki, obcy wyjątek}.
Obcy wyjątek NIE może stać się 4xx ani cichą degradacją — trafia do globalnego
handlera (`api/exception_handlers.py`): 500 „Wewnętrzny błąd serwera" + pełny ślad.
"""

from __future__ import annotations

import logging
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient
from network_model.brak_zasobu import BrakZasobuError
from sqlalchemy import exc as sa_exc


def _surowy_klient() -> TestClient:
    from api.main import app

    return TestClient(app, raise_server_exceptions=False)


# ---------------------------------------------------------------------------
# Sonda zdrowia
# ---------------------------------------------------------------------------


class _Silnik:
    def __init__(self, blad: Exception) -> None:
        self._blad = blad

    def connect(self) -> Any:
        raise self._blad


def _zadanie(silnik: Any) -> Any:
    return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(engine=silnik)))


@pytest.mark.parametrize(
    "blad",
    [
        sa_exc.OperationalError("SELECT 1", {}, Exception("connection refused")),
        sa_exc.InterfaceError("SELECT 1", {}, Exception("connection closed")),
        sa_exc.TimeoutError("QueuePool limit reached"),
    ],
)
def test_sonda_zdrowia_brak_polaczenia_z_baza_to_degraded(
    blad: Exception, caplog: pytest.LogCaptureFixture
) -> None:
    from api.health import health_check

    with caplog.at_level(logging.WARNING, logger="mv_design_pro.api.health"):
        wynik = health_check(_zadanie(_Silnik(blad)))  # type: ignore[arg-type]
    assert wynik["db_ok"] is False
    assert wynik["status"] == "degraded"
    assert "baza niedostępna" in caplog.text


@pytest.mark.parametrize("blad", [AttributeError("błąd programu"), KeyError("x"), TypeError("y")])
def test_sonda_zdrowia_blad_programu_wybucha(blad: Exception) -> None:
    from api.health import health_check

    with pytest.raises(type(blad)):
        health_check(_zadanie(_Silnik(blad)))  # type: ignore[arg-type]


def test_sonda_zdrowia_przez_trase_blad_programu_to_500(monkeypatch: pytest.MonkeyPatch) -> None:
    from api.main import app

    monkeypatch.setattr(
        app.state, "engine", _Silnik(AttributeError("błąd programu")), raising=False
    )
    odpowiedz = _surowy_klient().get("/api/health")
    assert odpowiedz.status_code == 500
    assert odpowiedz.json()["error_type"] == "AttributeError"


def test_sonda_zdrowia_przez_trase_brak_bazy_to_200_degraded(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from api.main import app

    blad = sa_exc.OperationalError("SELECT 1", {}, Exception("connection refused"))
    monkeypatch.setattr(app.state, "engine", _Silnik(blad), raising=False)
    odpowiedz = _surowy_klient().get("/api/health")
    assert odpowiedz.status_code == 200
    assert odpowiedz.json()["db_ok"] is False


# ---------------------------------------------------------------------------
# Diagnostyka przypadku — awaria odczytu modelu to NIE „brak modelu" (404)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("typ", [OSError, ValueError, AttributeError])
def test_diagnostyka_awaria_odczytu_modelu_nie_jest_404(
    typ: type[Exception], monkeypatch: pytest.MonkeyPatch
) -> None:
    """Dawny `except Exception` → 404 „Nie znaleziono modelu" przebierał uszkodzony plik
    migawki i błąd programu za brak zasobu. `get_enm` nie odmawia (brak = model domyślny)."""
    import api.diagnostics as diagnostyka
    from fastapi import HTTPException

    def _zepsuty(klucz: str) -> Any:
        raise typ("awaria odczytu")

    monkeypatch.setattr(diagnostyka, "get_enm", _zepsuty)
    with pytest.raises(typ) as info:
        diagnostyka._get_graph_for_case("projekt:dowolny")
    assert not isinstance(info.value, HTTPException)


# ---------------------------------------------------------------------------
# Wzorzec referencyjny — cztery trasy × {404, 400, obcy → 500 globalny}
# ---------------------------------------------------------------------------

TRASY_WZORCA = (
    (
        "post",
        "/api/reference-patterns/run",
        {"pattern_id": "RP-LINE-I2-THERMAL-SPZ", "fixture_file": "case_A_zgodne.json"},
    ),
    ("get", "/api/reference-patterns/fixtures/case_A_zgodne.json", None),
    ("get", "/api/reference-patterns/fixtures/case_A_zgodne.json/export/pdf", None),
    ("get", "/api/reference-patterns/fixtures/case_A_zgodne.json/export/docx", None),
)


def _wolaj(klient: TestClient, metoda: str, sciezka: str, cialo: Any) -> Any:
    if metoda == "post":
        return klient.post(sciezka, json=cialo)
    return klient.get(sciezka)


@pytest.mark.parametrize(("metoda", "sciezka", "cialo"), TRASY_WZORCA)
@pytest.mark.parametrize(
    ("typ", "kod_http"),
    [
        (FileNotFoundError, 404),
        (ValueError, 400),
        (BrakZasobuError, 404),
        (AttributeError, 500),
        (KeyError, 500),
    ],
)
def test_trasy_wzorca_odmowa_nazwana_a_blad_programu(
    metoda: str,
    sciezka: str,
    cialo: Any,
    typ: type[Exception],
    kod_http: int,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import api.reference_patterns as wzorce

    def _zepsuty(**kwargs: Any) -> Any:
        raise typ("wstrzyknięty wyjątek")

    monkeypatch.setattr(wzorce, "run_pattern_a", _zepsuty)
    odpowiedz = _wolaj(_surowy_klient(), metoda, sciezka, cialo)
    assert odpowiedz.status_code == kod_http, odpowiedz.text
    if kod_http == 500:
        # Globalny handler, nie HTTPException z treścią wyjątku (ta nie trafia do logu).
        assert odpowiedz.json()["detail"] == "Wewnętrzny błąd serwera"
        assert odpowiedz.json()["error_type"] == typ.__name__


def test_uszkodzona_fikstura_wzorca_nie_znika_z_listy_po_cichu(
    tmp_path: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Fikstury są częścią produktu: niepoprawny JSON to defekt wydania, nie powód do
    cichego pominięcia pozycji (dawne `except (JSONDecodeError, OSError): continue`).

    UWAGA (stan zmierzony, meldunek karty #151): przez trasę HTTP `JSONDecodeError` jest
    `ValueError`, więc globalny handler `ValueError` → 422 zamienia go w odpowiedź
    „błąd danych". Ten handler jest członkiem klasy zostawionym do decyzji architekta —
    test przypina więc zachowanie USŁUGI (wyjątek, nie pominięcie)."""
    import json

    import api.reference_patterns as wzorce

    (tmp_path / "a_dobra.json").write_text('{"_description": "ok"}', encoding="utf-8")
    (tmp_path / "b_zla.json").write_text("{nie-json", encoding="utf-8")
    monkeypatch.setattr(wzorce, "get_pattern_a_fixtures_dir", lambda: tmp_path)
    with pytest.raises(json.JSONDecodeError):
        wzorce.list_pattern_a_fixtures()


# ---------------------------------------------------------------------------
# Globalny handler — ostatnia linia: 500 + pełny ślad w dzienniku
# ---------------------------------------------------------------------------


def test_globalny_handler_loguje_pelny_slad_i_zwraca_500(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    import api.reference_patterns as wzorce

    def _zepsuty(**kwargs: Any) -> Any:
        raise AttributeError("głęboki błąd programu")

    monkeypatch.setattr(wzorce, "run_pattern_a", _zepsuty)
    with caplog.at_level(logging.ERROR, logger="mv_design_pro"):
        odpowiedz = _surowy_klient().get("/api/reference-patterns/fixtures/case_A_zgodne.json")
    assert odpowiedz.status_code == 500
    assert "Traceback" in caplog.text
    assert "głęboki błąd programu" in caplog.text
    assert "głęboki błąd programu" not in odpowiedz.text


# ---------------------------------------------------------------------------
# 404 wyłącznie z nazwanej odmowy `BrakZasobuError`; zwykły `KeyError` = 500
# ---------------------------------------------------------------------------


def test_nieznana_zdolnosc_solvera_to_404_z_nazwanej_odmowy() -> None:
    odpowiedz = _surowy_klient().get("/api/solver-capabilities/zdolnosc-ktorej-nie-ma")
    assert odpowiedz.status_code == 404


def test_blad_programu_keyerror_w_trasie_zdolnosci_to_500_nie_404(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import api.solver_capabilities as trasa

    def _zepsuty(zdolnosc: str) -> Any:
        return SimpleNamespace(to_dict=lambda: {}["brak-klucza"])

    monkeypatch.setattr(trasa, "get_solver_capability", _zepsuty)
    odpowiedz = _surowy_klient().get("/api/solver-capabilities/cokolwiek")
    assert odpowiedz.status_code == 500
    assert odpowiedz.json()["error_type"] == "KeyError"


@pytest.mark.parametrize(("typ", "kod_http"), [(ValueError, 422), (KeyError, 500)])
def test_wklady_zwarciowe_odmowa_422_a_keyerror_programu_500(
    typ: type[Exception], kod_http: int, monkeypatch: pytest.MonkeyPatch
) -> None:
    import network_model.solvers.machine_sc_iec60909 as maszyny

    from tests.api.test_proof_pack_api import _enm_z_maszyna

    def _zepsuty(*args: Any, **kwargs: Any) -> Any:
        raise typ("wstrzyknięty wyjątek")

    monkeypatch.setattr(maszyny, "compute_machine_contributions", _zepsuty)
    odpowiedz = _surowy_klient().post(
        "/api/proof/sc3f/contributions",
        json={"snapshot": _enm_z_maszyna().model_dump(mode="json"), "fault_node_id": "bus_oze"},
    )
    assert odpowiedz.status_code == kod_http, odpowiedz.text

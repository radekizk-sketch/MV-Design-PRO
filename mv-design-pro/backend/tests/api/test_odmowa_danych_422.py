"""422 wyłącznie z nazwanej odmowy danych; obcy wyjątek to 500 z pełnym śladem (karta
ODMOWA-DANYCH-422).

PO CO. Globalny handler API zamieniał KAŻDY `ValueError` na 422 z treścią wyjątku, a trasy
łapały `ValueError` wokół głębokich wywołań usług. Błąd programu (uszkodzona fikstura, zły
indeks, niezmiennik kontraktu, `JSONDecodeError` pliku produktu) docierał więc do projektanta
jako „błąd danych", a do dziennika jako ostrzeżenie bez śladu. Odtąd 422 daje wyłącznie
`network_model.odmowa_danych.OdmowaDanychError` (i jej podklasy — nazwane odmowy modułów).

Iloczyn cech (KLASA NIE INSTANCJA):

* rodzaj wyjątku: {odmowa danych, podklasa odmowy danych, obcy `ValueError`, podklasy
  `ValueError` z bibliotek (`JSONDecodeError`, `ValidationError`, `UnicodeDecodeError`,
  `LinAlgError`), obcy inny wyjątek (`KeyError`, `TypeError`)};
* warstwa: {trasa bez własnej reakcji (globalny handler), trasa z własną reakcją 422,
  warstwa usługi wołana bezpośrednio, bieg analizy (persystowany, przez trasę), operacja
  domenowa (przez trasę `domain-ops`), granica rdzenia B-01}.

Wyrocznia: 422 z komunikatem PL odmowy wyłącznie dla nazwanego typu (ostrzeżenie w
dzienniku bez śladu); 500 „Wewnętrzny błąd serwera" z pełnym śladem w dzienniku (ERROR,
`Traceback` + treść wyjątku) dla reszty — treść wyjątku NIE trafia do odpowiedzi. Bieg
analizy: odmowa danych i obcy `ValueError` to status FAILED z komunikatem (krotka
`ODMOWY_OBLICZENIA_BIEGU` świadomie łapie `ValueError` — rdzenie B-01), obcy `KeyError`
wybucha 500.
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

import numpy as np
import pytest
from api.exception_handlers import register_exception_handlers
from application.proof_engine.pakiet_biegu import PakietBieguError
from fastapi import FastAPI
from fastapi.testclient import TestClient
from network_model.odmowa_danych import OdmowaDanychError, odmowa_rdzenia_b01
from pydantic import BaseModel

KOMUNIKAT = "Szyna „SN-1” nie istnieje w modelu — wskaż szynę z listy."


class _Model(BaseModel):
    liczba: int


def _validation_error() -> Exception:
    try:
        _Model.model_validate({"liczba": "nie-liczba"})
    except Exception as exc:  # noqa: BLE001 — budowa próbki wyjątku biblioteki
        return exc
    raise AssertionError("pydantic nie odrzucił danych")


def _json_decode_error() -> Exception:
    try:
        json.loads("{nie-json")
    except json.JSONDecodeError as exc:
        return exc
    raise AssertionError("json nie odrzucił danych")


def _unicode_decode_error() -> Exception:
    try:
        b"\xff\xfe\xfa".decode("utf-8")
    except UnicodeDecodeError as exc:
        return exc
    raise AssertionError("dekoder nie odrzucił danych")


#: (nazwa, fabryka wyjątku, oczekiwany kod) — iloczyn rodzaju wyjątku.
RODZAJE: tuple[tuple[str, Any, int], ...] = (
    ("odmowa_danych", lambda: OdmowaDanychError(KOMUNIKAT), 422),
    ("podklasa_odmowy", lambda: PakietBieguError(KOMUNIKAT), 422),
    ("obcy_valueerror", lambda: ValueError("zły indeks tablicy wyników"), 500),
    ("json_decode_error", _json_decode_error, 500),
    ("validation_error", _validation_error, 500),
    ("unicode_decode_error", _unicode_decode_error, 500),
    ("lin_alg_error", lambda: np.linalg.LinAlgError("Singular matrix"), 500),
    ("key_error", lambda: KeyError("brak-klucza"), 500),
    ("type_error", lambda: TypeError("zły typ argumentu"), 500),
)
IDS = [r[0] for r in RODZAJE]


def _sprawdz_wyrocznie(
    odpowiedz: Any, wyjatek: Exception, kod: int, caplog: pytest.LogCaptureFixture
) -> None:
    assert odpowiedz.status_code == kod, odpowiedz.text
    cialo = odpowiedz.json()
    if kod == 422:
        assert cialo["detail"] == KOMUNIKAT
        assert "Traceback" not in caplog.text
    else:
        assert cialo["detail"] == "Wewnętrzny błąd serwera"
        assert cialo["error_type"] == type(wyjatek).__name__
        assert "Traceback" in caplog.text
        assert str(wyjatek) in caplog.text
        assert str(wyjatek) not in odpowiedz.text


# ---------------------------------------------------------------------------
# Warstwa: trasa bez własnej reakcji — globalny handler
# ---------------------------------------------------------------------------


def _aplikacja_z_trasa(wyjatek: Exception) -> TestClient:
    app = FastAPI()
    register_exception_handlers(app)

    @app.get("/sonda")
    def _sonda() -> None:
        raise wyjatek

    return TestClient(app, raise_server_exceptions=False)


@pytest.mark.parametrize(("nazwa", "fabryka", "kod"), RODZAJE, ids=IDS)
def test_globalny_handler_422_wylacznie_dla_odmowy_danych(
    nazwa: str, fabryka: Any, kod: int, caplog: pytest.LogCaptureFixture
) -> None:
    wyjatek = fabryka()
    with caplog.at_level(logging.WARNING, logger="mv_design_pro"):
        odpowiedz = _aplikacja_z_trasa(wyjatek).get("/sonda")
    _sprawdz_wyrocznie(odpowiedz, wyjatek, kod, caplog)


def test_globalny_handler_nie_rejestruje_valueerror() -> None:
    """Deklaracja z docstringu handlera przypięta testem: rejestr handlerów nie ma
    `ValueError`, ma `OdmowaDanychError` (i `Exception` jako ostatnią linię)."""
    app = FastAPI()
    register_exception_handlers(app)
    assert ValueError not in app.exception_handlers
    assert OdmowaDanychError in app.exception_handlers
    assert Exception in app.exception_handlers


# ---------------------------------------------------------------------------
# Warstwa: trasa z własną reakcją 422 (realna trasa produktu, wstrzyknięta usługa)
# ---------------------------------------------------------------------------


def _surowy_klient() -> TestClient:
    from api.main import app

    return TestClient(app, raise_server_exceptions=False)


@pytest.mark.parametrize(("nazwa", "fabryka", "kod"), RODZAJE, ids=IDS)
def test_trasa_z_reakcja_422_lapie_wylacznie_odmowe(
    nazwa: str,
    fabryka: Any,
    kod: int,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    import api.quality_analysis_runs as trasa

    wyjatek = fabryka()

    def _usluga(run: Any) -> Any:
        raise wyjatek

    monkeypatch.setattr(trasa, "_require_run", lambda run_id: object())
    monkeypatch.setattr(trasa, "build_energy_validation_view", _usluga)
    with caplog.at_level(logging.WARNING, logger="mv_design_pro"):
        odpowiedz = _surowy_klient().get(
            "/api/quality/energy-validation", params={"run_id": str(uuid.uuid4())}
        )
    _sprawdz_wyrocznie(odpowiedz, wyjatek, kod, caplog)


# ---------------------------------------------------------------------------
# Warstwa: usługa wołana bezpośrednio — odmowa ma TYP, nie tylko komunikat
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("csv", "komunikat"),
    [
        ("", "Plik CSV jest pusty."),
        ("element_ref;wielkosc;wartosc;jednostka;zacisk\nb1;U;abc;kV;", "nie jest liczbą"),
    ],
)
def test_usluga_zglasza_odmowe_danych_nazwanym_typem(csv: str, komunikat: str) -> None:
    from application.analyses.zgodnosc_powykonawcza import parse_measurements_csv

    with pytest.raises(OdmowaDanychError) as info:
        parse_measurements_csv(csv)
    assert komunikat in str(info.value)


def test_usluga_odmowa_przez_trase_to_422_z_tym_samym_komunikatem() -> None:
    """Realna ścieżka projektanta (bez wstrzyknięcia): zły plik pomiarów → 422 z komunikatem
    usługi, słowo w słowo."""
    from application.analyses.zgodnosc_powykonawcza import parse_measurements_csv

    csv = "element_ref;wielkosc;wartosc;jednostka;zacisk\nb1;U;abc;kV;"
    with pytest.raises(OdmowaDanychError) as info:
        parse_measurements_csv(csv)
    import api.quality_analysis_runs as trasa

    klient = _surowy_klient()
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(trasa, "_require_run", lambda run_id: object())
        odpowiedz = klient.post(
            "/api/quality/as-built-compliance",
            json={"run_id": str(uuid.uuid4()), "csv": csv},
        )
    assert odpowiedz.status_code == 422, odpowiedz.text
    assert odpowiedz.json()["detail"] == str(info.value)


# ---------------------------------------------------------------------------
# Warstwa: bieg analizy (persystowany, przez trasę wykonania)
# ---------------------------------------------------------------------------


@pytest.fixture()
def _czyste_biegi() -> Any:
    from enm.canonical_analysis import reset_canonical_runs
    from enm.store import reset_enm_store

    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


@pytest.mark.parametrize(
    ("fabryka", "kod", "status_biegu"),
    [
        (lambda: OdmowaDanychError(KOMUNIKAT), 200, "FAILED"),
        # Decyzja karty: bieg łapie `ValueError` (rdzenie B-01 zgłaszają nim odmowy) —
        # status FAILED z komunikatem, nie 422 i nie 500.
        (lambda: ValueError(KOMUNIKAT), 200, "FAILED"),
        (lambda: KeyError("brak-klucza"), 500, "FAILED"),
    ],
    ids=["odmowa_danych", "obcy_valueerror", "key_error"],
)
def test_bieg_analizy_przez_trase(
    fabryka: Any,
    kod: int,
    status_biegu: str,
    monkeypatch: pytest.MonkeyPatch,
    _czyste_biegi: Any,
) -> None:
    from enm import canonical_analysis
    from enm.canonical_analysis import create_run, get_run
    from enm.store import set_enm

    from tests.cgmes.golden_enm import build_golden_enm

    case_id = str(uuid.uuid4())
    set_enm(case_id, build_golden_enm())
    run = create_run(case_id=case_id, klucz_twin=case_id, analysis_type="PF")

    def _wykonaj(*args: Any, **kwargs: Any) -> None:
        raise fabryka()

    monkeypatch.setattr(canonical_analysis, "_wykonaj_analize_biegu", _wykonaj)
    odpowiedz = _surowy_klient().post(f"/api/execution/runs/{run.id}/execute")
    assert odpowiedz.status_code == kod, odpowiedz.text
    zapisany = get_run(run.id)
    assert zapisany is not None and zapisany.status == status_biegu
    if kod == 200:
        assert odpowiedz.json()["status"] == "FAILED"
        assert zapisany.error_message == KOMUNIKAT


def test_bieg_nieistniejacy_to_404_z_komunikatem_odmowy(_czyste_biegi: Any) -> None:
    identyfikator = uuid.uuid4()
    odpowiedz = _surowy_klient().post(f"/api/execution/runs/{identyfikator}/execute")
    assert odpowiedz.status_code == 404
    assert odpowiedz.json()["detail"] == f"Run {identyfikator} not found"


# ---------------------------------------------------------------------------
# Warstwa: operacja domenowa (przez trasę `domain-ops`)
# ---------------------------------------------------------------------------


@pytest.fixture()
def _klient_przypadku(tmp_path: Any, monkeypatch: pytest.MonkeyPatch, uow_factory: Any) -> Any:
    from api.dependencies import get_uow_factory
    from api.main import app
    from enm.dziennik_zmian import wyczysc_dziennik
    from enm.store import reset_enm_store

    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path))
    reset_enm_store()
    wyczysc_dziennik()
    app.dependency_overrides[get_uow_factory] = lambda: uow_factory
    app.state.uow_factory = uow_factory
    klient = TestClient(app, raise_server_exceptions=False)
    projekt = klient.post("/api/projects", json={"name": "Odmowa danych — test"})
    assert projekt.status_code == 201, projekt.text
    przypadek = klient.post(
        "/api/study-cases", json={"project_id": projekt.json()["id"], "name": "Przypadek"}
    )
    assert przypadek.status_code == 201, przypadek.text
    yield klient, str(przypadek.json()["id"])
    app.dependency_overrides.pop(get_uow_factory, None)
    app.state.uow_factory = None
    reset_enm_store()
    wyczysc_dziennik()


@pytest.mark.parametrize(("nazwa", "fabryka", "kod"), RODZAJE, ids=IDS)
def test_operacja_domenowa_przez_trase(
    nazwa: str,
    fabryka: Any,
    kod: int,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    _klient_przypadku: Any,
) -> None:
    import enm.domain_operations as operacje

    klient, case_id = _klient_przypadku
    wyjatek = fabryka()

    def _operacja(*args: Any, **kwargs: Any) -> Any:
        raise wyjatek

    monkeypatch.setattr(operacje, "execute_domain_operation", _operacja)
    with caplog.at_level(logging.WARNING, logger="mv_design_pro"):
        odpowiedz = klient.post(
            f"/api/cases/{case_id}/enm/domain-ops",
            json={"operation": {"name": "add_grid_source_sn", "payload": {}}},
        )
    _sprawdz_wyrocznie(odpowiedz, wyjatek, kod, caplog)


# ---------------------------------------------------------------------------
# Granica rdzenia B-01
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("wyjatek", "tlumaczony"),
    [
        (ValueError(KOMUNIKAT), True),
        (np.linalg.LinAlgError(KOMUNIKAT), True),
        (KeyError(KOMUNIKAT), False),
        (TypeError(KOMUNIKAT), False),
        (ZeroDivisionError(KOMUNIKAT), False),
    ],
    ids=["valueerror", "lin_alg_error", "key_error", "type_error", "zero_division"],
)
def test_granica_b01_tlumaczy_wylacznie_valueerror(
    wyjatek: Exception, tlumaczony: bool
) -> None:
    with pytest.raises(Exception) as info:
        with odmowa_rdzenia_b01():
            raise wyjatek
    if tlumaczony:
        assert type(info.value) is OdmowaDanychError
        assert str(info.value) == KOMUNIKAT
        assert info.value.__cause__ is wyjatek
    else:
        assert info.value is wyjatek


def test_granica_b01_przepuszcza_odmowe_bez_zmiany() -> None:
    odmowa = PakietBieguError(KOMUNIKAT)
    with pytest.raises(PakietBieguError) as info:
        with odmowa_rdzenia_b01():
            raise odmowa
    assert info.value is odmowa


def test_odmowa_rdzenia_b01_przez_realna_trase_klasyfikacji_modulu() -> None:
    """Rdzeń B-01 (klasyfikacja NC RfG) odmawia mocy nieskończonej gołym `ValueError`;
    trasa oddaje 422 z komunikatem rdzenia słowo w słowo."""
    odpowiedz = _surowy_klient().get(
        "/api/ncrfg-tests/modul", params={"p_max_kw": "inf", "napiecie_kv": 15.0}
    )
    assert odpowiedz.status_code == 422, odpowiedz.text
    assert odpowiedz.json()["detail"] == (
        "Klasyfikacja modułu: p_max_kw = inf — wymagana liczba skończona ≥ 0."
    )

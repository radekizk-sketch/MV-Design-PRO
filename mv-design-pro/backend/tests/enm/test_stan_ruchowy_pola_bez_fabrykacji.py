"""Stan ruchowy pola (telemetria łącznika) bez fabrykacji — karta #135.

Narzędzie projektowe nie ma telemetrii. Stan ruchowy aparatu (tryb sterowania, uzbrojenie
napędu do zamknięcia/otwarcia, komunikacja, polecenie w toku) pochodzi WYŁĄCZNIE ze źródła
runtime zapisanego w modelu (`Bay.runtime_state.primary_device_states` / `pending_command`,
albo rekord `switch_state` aparatu pierwotnego na migawce). Bez źródła pole ma wartość `None`
(„brak telemetrii"), nigdy „zdalne / uzbrojony / komunikacja OK". Stan łącznika w modelu
(`actual_state`) jest projektowy i zostaje. Blokada (`interlock_blocked`) NIE jest telemetrią —
liczy ją reguła modelu `enm.interlock_rules` (uziemnik ↔ łącznik toru głównego).

Iloczyn cech: {źródło runtime obecne z każdą wartością, brak źródła} × {blokada z reguł tak,
nie, nieustalona} × {konsument: model odczytu pola (funkcja), końcówka API `field-view`}.
"""

from __future__ import annotations

import itertools
from typing import Any
from uuid import uuid4

import pytest
from api.enm import get_enm_field_view
from application.field_read_model import build_field_read_model
from application.twin_key import klucz_twin_dla_przypadku
from domain.models import Project
from domain.study_case import StudyCase
from enm.canonical_analysis import reset_canonical_runs
from enm.interlock_rules import blokady_zamkniecia
from enm.models import (
    BayCommandExecutionState,
    BayPrimaryDevice,
    BayRuntimeState,
    BaySwitchState,
    EnergyNetworkModel,
)
from enm.store import reset_enm_store, set_enm

from tests.enm.test_enm_field_view_api import _enm_with_bay

_POLA_TELEMETRII = ("control_mode", "armed_for_close", "armed_for_open", "communication_ok")


@pytest.fixture(autouse=True)
def _czysty_stan() -> Any:
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _pole(dane: dict[str, Any]) -> dict[str, Any]:
    widok = build_field_read_model(f"case-{uuid4()}", EnergyNetworkModel.model_validate(dane))
    assert len(widok["fields"]) == 1
    return widok["fields"][0]["canonical_model"]


def _aparat(model: dict[str, Any], ref: str) -> dict[str, Any]:
    return next(d for d in model["base_model"]["primary_devices"] if d["device_ref"] == ref)


def test_bez_zrodla_runtime_stan_ruchowy_jest_nieznany_a_stan_lacznika_z_modelu() -> None:
    model = _pole(_enm_with_bay())
    stan = _aparat(model, "cb_in_1")["switch_state"]
    assert stan["actual_state"] == "zamkniety"  # stan łącznika w modelu (projektowy)
    for pole in _POLA_TELEMETRII:
        assert stan[pole] is None, f"{pole} wymyślone bez źródła: {stan[pole]!r}"
    assert stan["commanded_state"] is None
    # Brak telemetrii pola = brak rekordu runtime (żadnego „degraded/offline", znacznika czasu
    # ani dostępności sterowania wymyślonych z samej obecności zabezpieczenia w modelu).
    assert model["runtime_state"] is None
    # Blokada tylko z reguł modelu — brak uziemnika w polu, więc reguła nic nie blokuje.
    assert stan["interlock_blocked"] is False
    assert model["base_model"]["interlocks"]["entries"] == []


_TRYBY = ("zdalne", "miejscowe", None)
_KOMUNIKACJA = (True, False, None)
_STANY = ("zamkniety", "otwarty", "awaria")


@pytest.mark.parametrize(
    "tryb, komunikacja, stan_aparatu",
    list(itertools.product(_TRYBY, _KOMUNIKACJA, _STANY)),
)
def test_zrodlo_runtime_przechodzi_do_rekordu_bez_zmian(
    tryb: str | None, komunikacja: bool | None, stan_aparatu: str
) -> None:
    dane = _enm_with_bay()
    zrodlo = BayRuntimeState(
        secondary_communication_status="ok",
        control_availability="dostepne",
        measurement_availability="dostepne",
        primary_device_states={
            "cb_in_1": BaySwitchState(
                actual_state=stan_aparatu,
                control_mode=tryb,
                armed_for_close=komunikacja,
                armed_for_open=None,
                communication_ok=komunikacja,
            )
        },
    )
    dane["bays"][0]["runtime_state"] = zrodlo.model_dump(mode="json")
    model = _pole(dane)
    stan = _aparat(model, "cb_in_1")["switch_state"]
    assert stan["actual_state"] == stan_aparatu
    assert stan["control_mode"] == tryb
    assert stan["communication_ok"] is komunikacja
    assert stan["armed_for_close"] is komunikacja
    assert stan["armed_for_open"] is None
    runtime = model["runtime_state"]
    assert runtime["secondary_communication_status"] == "ok"
    assert runtime["control_availability"] == "dostepne"
    assert runtime["primary_device_states"]["cb_in_1"] == stan


@pytest.mark.parametrize(
    "polecenie, stan_polecenia, oczekiwane",
    [
        ("otworz", "oczekuje", "otworz"),
        ("zamknij", "przyjete", "zamknij"),
        ("otworz", "wykonane", None),
        ("otworz", "odrzucone", None),
        ("kas", "oczekuje", None),
    ],
)
def test_polecenie_w_toku_tylko_z_pending_command(
    polecenie: str, stan_polecenia: str, oczekiwane: str | None
) -> None:
    dane = _enm_with_bay()
    dane["bays"][0]["runtime_state"] = BayRuntimeState(
        pending_command=BayCommandExecutionState(
            command_ref="cmd-1",
            target_device_ref="cb_in_1",
            command=polecenie,
            state=stan_polecenia,
            created_at="2026-09-23T10:00:00Z",
        )
    ).model_dump(mode="json")
    stan = _aparat(_pole(dane), "cb_in_1")["switch_state"]
    assert stan["commanded_state"] == oczekiwane
    # Polecenie nie jest telemetrią aparatu — reszta stanu ruchowego dalej nieznana.
    for pole in _POLA_TELEMETRII:
        assert stan[pole] is None


def _pole_z_uziemnikiem(stan_cb: str | None, stan_es: str | None) -> dict[str, Any]:
    dane = _enm_with_bay()

    def aparat(ref: str, kind: str, stan: str | None) -> dict[str, Any]:
        return BayPrimaryDevice(
            device_ref=ref,
            symbol_ref=f"symbol:{kind.lower()}",
            kind=kind,
            placement="MIDSTREAM" if kind != "ES" else "GROUND_BRANCH",
            is_controllable=True,
            switch_state=None if stan is None else BaySwitchState(actual_state=stan),
        ).model_dump(mode="json")

    dane["bays"][0]["primary_devices"] = [
        aparat("q0", "CB", stan_cb),
        aparat("q8", "ES", stan_es),
    ]
    return _pole(dane)


@pytest.mark.parametrize(
    "stan_cb, stan_es, blokada_cb, blokada_es",
    [
        ("otwarty", "zamkniety", True, False),
        ("zamkniety", "otwarty", False, True),
        ("otwarty", "otwarty", False, False),
        ("zamkniety", "zamkniety", True, True),
        ("otwarty", None, None, None),
    ],
)
def test_blokada_wylacznie_z_regul_modelu(
    stan_cb: str | None,
    stan_es: str | None,
    blokada_cb: bool | None,
    blokada_es: bool | None,
) -> None:
    model = _pole_z_uziemnikiem(stan_cb, stan_es)
    cb = _aparat(model, "q0")["switch_state"]
    es = _aparat(model, "q8")["switch_state"]
    assert cb["interlock_blocked"] is blokada_cb
    if stan_es is None:
        assert es is None  # aparat bez rekordu i bez stanu w modelu — brak stanu, nie domysł
    else:
        assert es["interlock_blocked"] is blokada_es
    for rekord in (cb, es):
        if rekord is not None:
            for pole in _POLA_TELEMETRII:
                assert rekord[pole] is None
    zablokowane = sorted(
        ref for ref, blokada in (("q0", blokada_cb), ("q8", blokada_es)) if blokada is True
    )
    wpisy = model["base_model"]["interlocks"]["entries"]
    if zablokowane:
        assert [w["code"] for w in wpisy] == ["BLOKADA_UZIEMNIK_TOR_GLOWNY"]
        assert wpisy[0]["blocking_device_refs"] == zablokowane
        assert wpisy[0]["active"] is True
    else:
        assert wpisy == []


def test_predykat_blokady_jest_jeden_dla_modelu_odczytu_i_walidatora() -> None:
    """Predykaty parami: reguła blokady zamknięcia i reguła naruszenia (W034) używają tego
    samego zbioru łączników toru głównego i tego samego pojęcia „zamknięty"."""
    wynik = blokady_zamkniecia(
        [("es", "ES", "zamkniety"), ("cb", "CB", "otwarty"), ("ds", "DS", None)]
    )
    assert wynik == {"es": None, "cb": True, "ds": True}
    wynik = blokady_zamkniecia([("es", "ES", None), ("cb", "CB", "otwarty")])
    assert wynik == {"es": False, "cb": None}
    assert blokady_zamkniecia([("ct", "CT", None)]) == {}


def test_koncowka_api_field_view_nie_wymysla_telemetrii(uow_factory: Any) -> None:
    project_id, case_id = uuid4(), uuid4()
    with uow_factory() as uow:
        uow.projects.add(Project(id=project_id, name="Telemetria"), commit=False)
        uow.cases.add_study_case(
            StudyCase(id=case_id, project_id=project_id, name="Przypadek"), commit=False
        )
        uow.commit()
    klucz = klucz_twin_dla_przypadku(str(case_id), uow_factory)
    set_enm(klucz, EnergyNetworkModel.model_validate(_enm_with_bay()))
    widok = get_enm_field_view(str(case_id), klucz)
    model = widok["fields"][0]["canonical_model"]
    stan = _aparat(model, "cb_in_1")["switch_state"]
    assert stan["communication_ok"] is None
    assert stan["control_mode"] is None
    assert model["runtime_state"] is None

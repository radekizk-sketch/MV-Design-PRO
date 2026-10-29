"""Położenie łącznika pola bez własnej gałęzi — operacja `set_bay_apparatus_position`
(rozszerzenie 5 karty UX-04/POLE-LINIOWE-WZORZEC, referencja HMI właściciela 2026-10-29: stan
jednoznaczny na schemacie, położenie „uziemiony" łącznika trójpołożeniowego osiągalne).

Ścieżka użytkownika: GPZ z operacji `add_grid_source_sn`, wykonanie pola przez
`set_bay_equipment` (szablon Z.10 z wyłącznikiem stałym, Z.11.1 z łącznikiem
trójpołożeniowym), położenie przez dyspozytor operacji (`execute_domain_operation`), jak woła
je menu aparatu na kanwie.

Iloczyn cech: rodzaj aparatu {odłącznik, uziemnik, łącznik trójpołożeniowy w torze, łącznik
trójpołożeniowy odgałęzienia przekładnika, wyłącznik z gałęzią, przekładnik, wskaźnik napięcia,
głowica} × położenie wyjściowe {brak rekordu, zamknięty, otwarty, uziemiony} × położenie
docelowe {zamknięty, otwarty, uziemiony} × aparat przeciwny blokady {zamknięty, otwarty}.
Wyrocznia (`_oczekiwane`) jest tabelą reguł z kontraktu operacji, nie kodem operacji.
"""

from __future__ import annotations

import copy
import functools
import itertools
import json
from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel
from enm.validator import ENMValidator

from tests.reference_networks.scena_geometrii_stacji import (
    zbuduj_gpz_pole_liniowe_z10,
    zbuduj_gpz_pole_liniowe_z11,
)

OP = "set_bay_apparatus_position"
POLOZENIA = ("zamkniety", "otwarty", "uziemiony")


@functools.cache
def _z10_json() -> str:
    return json.dumps(zbuduj_gpz_pole_liniowe_z10(1))


@functools.cache
def _z11_json() -> str:
    return json.dumps(zbuduj_gpz_pole_liniowe_z11())


def _z10() -> dict[str, Any]:
    return json.loads(_z10_json())


def _z11() -> dict[str, Any]:
    return json.loads(_z11_json())


def _pole(enm: dict[str, Any], przedrostek: str) -> dict[str, Any]:
    """Pierwsze pole liniowe GPZ sekcji o identyfikatorze kończącym się ``przedrostek``."""
    return sorted(
        (
            b
            for b in enm["bays"]
            if "gpz_line_field" in (b.get("tags") or []) and przedrostek in b["ref_id"]
        ),
        key=lambda b: b["ref_id"],
    )[0]


def _aparat(enm: dict[str, Any], bay_ref: str, oznaczenie: str) -> dict[str, Any]:
    bay = next(b for b in enm["bays"] if b["ref_id"] == bay_ref)
    return next(d for d in bay["primary_devices"] if d.get("designation") == oznaczenie)


def _wywolaj(enm: dict[str, Any], bay_ref: str, device_ref: Any, stan: Any) -> dict[str, Any]:
    return execute_domain_operation(
        enm_dict=enm,
        op_name=OP,
        payload={"bay_ref": bay_ref, "device_ref": device_ref, "actual_state": stan},
    )


def _ok(odpowiedz: dict[str, Any]) -> dict[str, Any]:
    assert not odpowiedz.get("error"), (odpowiedz.get("error_code"), odpowiedz.get("error"))
    return odpowiedz["snapshot"]


def _gałąź(enm: dict[str, Any], ref: str) -> dict[str, Any]:
    return next(g for g in enm["branches"] if g["ref_id"] == ref)


def _ustaw_galaz(enm: dict[str, Any], ref: str, otwarta: bool) -> dict[str, Any]:
    if (_gałąź(enm, ref)["status"] == "open") == otwarta:
        return enm
    nazwa = "open_switch" if otwarta else "close_switch"
    return _ok(execute_domain_operation(enm_dict=enm, op_name=nazwa, payload={"switch_ref": ref}))


def _stan(enm: dict[str, Any], bay_ref: str, oznaczenie: str) -> str | None:
    rekord = _aparat(enm, bay_ref, oznaczenie).get("switch_state")
    return rekord["actual_state"] if rekord else None


def _oczekiwane(rodzaj: str, wyjscie: str | None, cel: str, przeciwny_zamkniety: bool) -> str:
    """Tabela reguł kontraktu (KONTRAKT_OPERACJI_ENM_OP §3.7d) — wynik albo kod odmowy."""
    if cel == "uziemiony" and rodzaj != "THREE_POSITION_SWITCH":
        return "bay_apparatus_position.earthed_not_allowed"
    if wyjscie == cel:
        return "bay_apparatus_position.unchanged"
    if rodzaj == "THREE_POSITION_SWITCH" and {wyjscie, cel} == {"zamkniety", "uziemiony"}:
        return "bay_apparatus_position.three_position_sequence"
    if cel == "zamkniety" and rodzaj in {"ES", "DS"} and przeciwny_zamkniety:
        return "bay_apparatus_position.interlock"
    return "OK"


def _sprawdz(
    enm: dict[str, Any], bay_ref: str, oznaczenie: str, cel: str, oczekiwane: str
) -> dict[str, Any]:
    device_ref = _aparat(enm, bay_ref, oznaczenie)["device_ref"]
    przed = copy.deepcopy(enm)
    odpowiedz = _wywolaj(enm, bay_ref, device_ref, cel)
    if oczekiwane != "OK":
        assert odpowiedz.get("error_code") == oczekiwane, odpowiedz.get("error")
        assert odpowiedz.get("snapshot") in (None, przed)
        assert enm == przed  # wejście nietknięte
        return enm
    nowy = _ok(odpowiedz)
    assert _stan(nowy, bay_ref, oznaczenie) == cel
    # Zmienia się wyłącznie rekord położenia tego aparatu — fizyka (gałęzie, szyny, źródła)
    # i reszta pola bez zmian.
    for klucz in set(przed) - {"bays", "header"}:
        assert nowy[klucz] == przed[klucz], klucz
    bay_przed = next(b for b in przed["bays"] if b["ref_id"] == bay_ref)
    bay_po = next(b for b in nowy["bays"] if b["ref_id"] == bay_ref)
    for a, b in zip(bay_przed["primary_devices"], bay_po["primary_devices"], strict=True):
        if a["device_ref"] != device_ref:
            assert a == b
        else:
            assert {k: v for k, v in a.items() if k != "switch_state"} == {
                k: v for k, v in b.items() if k != "switch_state"
            }
    assert [b for b in przed["bays"] if b["ref_id"] != bay_ref] == [
        b for b in nowy["bays"] if b["ref_id"] != bay_ref
    ]
    assert odpowiedz["changes"]["updated_element_ids"] == [bay_ref]
    assert [z["event_type"] for z in odpowiedz["domain_events"]] == ["BAY_APPARATUS_POSITION_SET"]
    return nowy


def _do_stanu(enm: dict[str, Any], bay_ref: str, oznaczenie: str, stan: str | None):
    """Położenie wyjściowe nadane TĄ SAMĄ operacją (z braku rekordu każde jest osiągalne)."""
    if stan is None:
        assert _stan(enm, bay_ref, oznaczenie) is None
        return enm
    device_ref = _aparat(enm, bay_ref, oznaczenie)["device_ref"]
    return _ok(_wywolaj(enm, bay_ref, device_ref, stan))


# --- łącznik trójpołożeniowy (Z.11.1): w torze Q1 i w odgałęzieniu przekładnika Q5 -----------


@pytest.mark.parametrize("oznaczenie", ["Q1", "Q5"])
@pytest.mark.parametrize("wyjscie,cel", list(itertools.product([None, *POLOZENIA], POLOZENIA)))
def test_lacznik_trojpolozeniowy(oznaczenie: str, wyjscie: str | None, cel: str) -> None:
    enm = _z11()
    bay_ref = _pole(enm, "/001/")["ref_id"]
    assert _aparat(enm, bay_ref, oznaczenie)["kind"] == "THREE_POSITION_SWITCH"
    enm = _do_stanu(enm, bay_ref, oznaczenie, wyjscie)
    _sprawdz(
        enm, bay_ref, oznaczenie, cel, _oczekiwane("THREE_POSITION_SWITCH", wyjscie, cel, False)
    )


def test_droga_do_uziemienia_przez_otwarty() -> None:
    """Zamknięty → otwarty → uziemiony → otwarty → zamknięty: każdy krok jest dozwolony."""
    enm = _z11()
    bay_ref = _pole(enm, "/001/")["ref_id"]
    for cel in ("zamkniety", "otwarty", "uziemiony", "otwarty", "zamkniety"):
        enm = _sprawdz(enm, bay_ref, "Q1", cel, "OK")


# --- odłącznik szynowy i uziemnik (Z.10, wyłącznik stały) × blokada ---------------------------


STANY_WYJSCIA = [None, "zamkniety", "otwarty"]


@pytest.mark.parametrize("q8", STANY_WYJSCIA)
@pytest.mark.parametrize("wyjscie,cel", list(itertools.product(STANY_WYJSCIA, POLOZENIA)))
def test_odlacznik_szynowy(q8: str | None, wyjscie: str | None, cel: str) -> None:
    """Odłącznik szynowy Q1 × uziemnik Q8 (aparat przeciwny blokady)."""
    enm = _z10()
    bay_ref = _pole(enm, "/001/")["ref_id"]
    if q8 == "zamkniety":
        # Uziemnik zamyka się wyłącznie przy otwartym wyłączniku pola.
        enm = _ustaw_galaz(enm, _aparat(enm, bay_ref, "Q0")["linked_ref"], otwarta=True)
    enm = _do_stanu(enm, bay_ref, "Q8", q8)
    if q8 == "zamkniety" and wyjscie == "zamkniety":
        # Stan wyjściowy nieosiągalny: zamknięcie Q1 przy zamkniętym Q8 jest odmową.
        _sprawdz(enm, bay_ref, "Q1", "zamkniety", "bay_apparatus_position.interlock")
        return
    enm = _do_stanu(enm, bay_ref, "Q1", wyjscie)
    _sprawdz(enm, bay_ref, "Q1", cel, _oczekiwane("DS", wyjscie, cel, q8 == "zamkniety"))


@pytest.mark.parametrize("q0_zamkniety", [True, False])
@pytest.mark.parametrize("q1", STANY_WYJSCIA)
@pytest.mark.parametrize("wyjscie,cel", list(itertools.product(STANY_WYJSCIA, POLOZENIA)))
def test_uziemnik(q0_zamkniety: bool, q1: str | None, wyjscie: str | None, cel: str) -> None:
    """Uziemnik Q8 × aparaty przeciwne blokady: wyłącznik Q0 (gałąź) i odłącznik Q1."""
    enm = _z10()
    bay_ref = _pole(enm, "/001/")["ref_id"]
    galaz_q0 = _aparat(enm, bay_ref, "Q0")["linked_ref"]
    enm = _ustaw_galaz(enm, galaz_q0, otwarta=True)
    enm = _do_stanu(enm, bay_ref, "Q1", q1)
    if q1 == "zamkniety" and wyjscie == "zamkniety":
        _sprawdz(enm, bay_ref, "Q8", "zamkniety", "bay_apparatus_position.interlock")
        return
    enm = _do_stanu(enm, bay_ref, "Q8", wyjscie)
    q0_efektywnie = q0_zamkniety and wyjscie != "zamkniety"
    enm = _ustaw_galaz(enm, galaz_q0, otwarta=not q0_efektywnie)
    przeciwny = q0_efektywnie or q1 == "zamkniety"
    _sprawdz(enm, bay_ref, "Q8", cel, _oczekiwane("ES", wyjscie, cel, przeciwny))


def test_blokada_niesie_aparat_przeciwny_i_podstawe() -> None:
    enm = _z10()
    bay_ref = _pole(enm, "/001/")["ref_id"]
    odpowiedz = _wywolaj(enm, bay_ref, _aparat(enm, bay_ref, "Q8")["device_ref"], "zamkniety")
    assert odpowiedz["error_code"] == "bay_apparatus_position.interlock"
    assert "Q0" in odpowiedz["error"] and "IEC 62271-200 §5.11" in odpowiedz["error"]


def test_walidator_bez_naruszenia_blokady_po_kazdym_kroku() -> None:
    """Operacja nie wytwarza stanu, który walidator modelu zgłasza jako naruszenie blokady."""
    enm = _z10()
    bay_ref = _pole(enm, "/001/")["ref_id"]
    q0 = _aparat(enm, bay_ref, "Q0")
    enm = _ustaw_galaz(enm, q0["linked_ref"], otwarta=True)
    for oznaczenie, cel in (
        ("Q1", "otwarty"),
        ("Q8", "zamkniety"),
        ("Q8", "otwarty"),
        ("Q1", "zamkniety"),
    ):
        enm = _sprawdz(enm, bay_ref, oznaczenie, cel, "OK")
        kody = {
            i.code for i in ENMValidator().validate(EnergyNetworkModel.model_validate(enm)).issues
        }
        assert not any("interlock" in k.lower() or k == "W050" for k in kody), kody


# --- aparaty, na których operacja odmawia --------------------------------------------------


@pytest.mark.parametrize("cel", POLOZENIA)
def test_wylacznik_z_galezia_odsyla_do_operacji_galezi(cel: str) -> None:
    for enm in (_z10(), _z11()):
        bay_ref = _pole(enm, "/001/")["ref_id"]
        _sprawdz(enm, bay_ref, "Q0", cel, "bay_apparatus_position.linked_to_branch")


@pytest.mark.parametrize("oznaczenie", ["T1", "T2", "T3", "PF0", "PF1", "GK", "GK1"])
@pytest.mark.parametrize("cel", ["zamkniety", "otwarty"])
def test_aparat_nie_lacznik(oznaczenie: str, cel: str) -> None:
    enm = _z11()
    bay_ref = _pole(enm, "/001/")["ref_id"]
    _sprawdz(enm, bay_ref, oznaczenie, cel, "bay_apparatus_position.not_a_switch")


@pytest.mark.parametrize(
    "bay,device,stan,kod",
    [
        (None, "x", "otwarty", "bay_apparatus_position.target_missing"),
        ("POLE", None, "otwarty", "bay_apparatus_position.target_missing"),
        ("POLE", "  ", "otwarty", "bay_apparatus_position.target_missing"),
        ("POLE", "Q1", None, "bay_apparatus_position.state_invalid"),
        ("POLE", "Q1", "bledny", "bay_apparatus_position.state_invalid"),
        ("POLE", "Q1", "nieznany", "bay_apparatus_position.state_invalid"),
        ("POLE", "Q1", "zamkniety_rozbrojony", "bay_apparatus_position.state_invalid"),
        ("brak/pola", "Q1", "otwarty", "bay_apparatus_position.bay_not_found"),
        ("POLE", "brak::dev::9", "otwarty", "bay_apparatus_position.device_not_found"),
    ],
)
def test_odmowy_danych_wejscia(bay: Any, device: Any, stan: Any, kod: str) -> None:
    enm = _z11()
    bay_ref = _pole(enm, "/001/")["ref_id"]
    if bay == "POLE":
        bay = bay_ref
    if device == "Q1":
        device = _aparat(enm, bay_ref, "Q1")["device_ref"]
    przed = copy.deepcopy(enm)
    odpowiedz = _wywolaj(enm, bay, device, stan)
    assert odpowiedz["error_code"] == kod
    assert enm == przed


def test_aparat_innego_pola_nie_jest_aparatem_tego_pola() -> None:
    enm = _z11()
    pierwsze = _pole(enm, "/001/")["ref_id"]
    drugie = next(
        b["ref_id"]
        for b in enm["bays"]
        if "gpz_line_field" in (b.get("tags") or []) and b["ref_id"] != pierwsze
    )
    odpowiedz = _wywolaj(enm, drugie, _aparat(enm, pierwsze, "Q1")["device_ref"], "otwarty")
    assert odpowiedz["error_code"] == "bay_apparatus_position.device_not_found"


def test_determinizm() -> None:
    enm = _z11()
    bay_ref = _pole(enm, "/001/")["ref_id"]
    device_ref = _aparat(enm, bay_ref, "Q1")["device_ref"]
    a = _wywolaj(copy.deepcopy(enm), bay_ref, device_ref, "uziemiony")
    b = _wywolaj(copy.deepcopy(enm), bay_ref, device_ref, "uziemiony")
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)

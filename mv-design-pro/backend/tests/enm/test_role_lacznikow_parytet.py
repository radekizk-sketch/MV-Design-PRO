"""Rola łącznika: punkt podziału sieci a łącznik szyn stacji — backend × lustro TS.

Po co (karta GPZ-H5, wpis 7 koordynacji wątków 2026-10-22, pkt 1): dawny kanon W5-C uznawał
za punkt podziału KAŻDY łącznik z ``normal_state == "open"``, także łącznik szyn 110 kV
i SN układu H5. Normalnie otwarty ŁS-110 albo ŁS-SN stawał się „punktem podziału”: znacznik
NO w ramce GPZ, walidator I005 i tor zasilania traktowały go jak punkt magistrali. Rolę
wyprowadza JEDNA funkcja (``enm.topology.role_lacznikow``) i jej lustro
(``frontend/src/ui/shared/stanLacznika.ts::roleLacznikow``); punkty podziału czytają rolę.

Iloczyn cech: rodzaj łącznika {łącznik szyn 110 kV GPZ (ŁS-110), łącznik szyn SN GPZ (ŁS-SN),
łącznik sekcyjny magistrali, sprzęgło stacji SN w magistrali (stacja sekcyjna), sprzęgło
sekcji rozdzielnicy nN, łącznik pola transformatorowego (rezerwa jawna)} × pozycja normalna
{open, closed} × strona {backend (ten plik), TS (``roleLacznikowParytet.test.ts``)}. Wspólna
tablica: ``backend/schemas/role_lacznikow_parytet_v1.json`` (migawki przycięte do pól, które
czyta reguła, i oczekiwane role, punkty podziału, kandydaci). Każda pozycja normalna powstaje
ścieżką użytkownika (pole wejścia operacji tworzenia GPZ albo ``set_normal_open_point``),
z jednym wyjątkiem nazwanym przy przypadku.

Doprecyzowanie reguły architekta z pomiaru (``tests/enm/test_role_lacznikow_parytet.py::
test_pierscien_rozciety_w_stacji_sekcyjnej_ma_punkt_podzialu``): sprzęgło stacji SN
w magistrali leży w torze prądowym magistrali (pole zasilające na sekcji A, odpływowe na B),
więc normalnie otwarte jest punktem podziału pierścienia; łącznikiem szyn SN jest tylko
łącznik sekcji SN stacji zasilającej GPZ.

Regeneracja tablicy po zmianie reguły:
``PYTHONPATH=src:. python -m tests.enm.test_role_lacznikow_parytet``.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import pytest
from enm.models import EnergyNetworkModel
from enm.stan_normalny import TYPY_LACZNIKOW_ZE_STANEM_NORMALNYM
from enm.topology import (
    ROLA_LACZNIK_POLA_TRANSFORMATOROWEGO,
    ROLA_LACZNIK_SZYN_NN,
    ROLA_LACZNIK_SZYN_SN,
    ROLA_LACZNIK_SZYN_WN,
    ROLA_PUNKT_PODZIALU,
    punkty_podzialu,
    role_lacznikow,
)
from enm.validator import ENMValidator

from tests.enm.siec_lacznikowa import (
    KABEL,
    _gpz,
    _kable,
    _odcinki,
    _pusty,
    pierscien_z_nop,
    promieniowa,
    wykonaj,
)
from tests.reference_networks.gpz_h5 import refy, zbuduj_h5

TABLICA = Path(__file__).resolve().parents[2] / "schemas" / "role_lacznikow_parytet_v1.json"

APARAT_POLA_SN = "sw-cb-abb-vd4-17kv-630a"
TRAFO_SN_NN = "tr-sn-nn-15-04-630kva-dyn11"
APARAT_NN = "cb_nn_630a"


def _przytnij(enm: dict[str, Any]) -> dict[str, Any]:
    """Migawka przycięta do pól czytanych przez regułę roli (te same po obu stronach)."""

    def sekcje(stacja: dict[str, Any], klucz: str) -> list[dict[str, Any]]:
        return [{"bus_ref": s.get("bus_ref")} for s in stacja.get(klucz) or []]

    galezie = []
    for g in sorted(enm.get("branches", []), key=lambda g: g["ref_id"]):
        rekord = {
            "id": g["ref_id"],
            "ref_id": g["ref_id"],
            "type": g["type"],
            "from_bus_ref": g.get("from_bus_ref"),
            "to_bus_ref": g.get("to_bus_ref"),
            "status": g.get("status"),
        }
        if g.get("normal_state") is not None:
            rekord["normal_state"] = g["normal_state"]
        galezie.append(rekord)
    return {
        "buses": [
            {"ref_id": b["ref_id"], "voltage_kv": b.get("voltage_kv")}
            for b in sorted(enm.get("buses", []), key=lambda b: b["ref_id"])
        ],
        "branches": galezie,
        "substations": [
            {
                "ref_id": s["ref_id"],
                "station_type": s.get("station_type"),
                "bus_refs": list(s.get("bus_refs") or []),
                "transformer_refs": list(s.get("transformer_refs") or []),
                "gpz_hv_sections": sekcje(s, "gpz_hv_sections"),
                "gpz_sections": sekcje(s, "gpz_sections"),
                "nn_sections": sekcje(s, "nn_sections"),
            }
            for s in sorted(enm.get("substations", []), key=lambda s: s["ref_id"])
        ],
        "transformers": [
            {
                "ref_id": t["ref_id"],
                "hv_bus_ref": t.get("hv_bus_ref"),
                "lv_bus_ref": t.get("lv_bus_ref"),
            }
            for t in sorted(enm.get("transformers", []), key=lambda t: t["ref_id"])
        ],
    }


def _galaz(enm: dict[str, Any], ref: str) -> dict[str, Any]:
    return next(g for g in enm["branches"] if g["ref_id"] == ref)


def _nop(enm: dict[str, Any], ref: str) -> dict[str, Any]:
    return wykonaj(enm, "set_normal_open_point", {"switch_ref": ref})


def _h5(stan_ls110: str, reserve_mode: str = "hidden") -> dict[str, Any]:
    from tests.reference_networks.gpz_h5 import _operacja, ladunek_h5, pusty_model

    ladunek = ladunek_h5(hv_coupler_state=stan_ls110, reserve_mode=reserve_mode)
    if stan_ls110 == "closed":
        # Pole wejścia operacji: zamknięty ŁS-110 wymaga uzasadnienia (bez niego odmowa).
        ladunek["hv_coupler"]["justification"] = "Przypadek parytetu ról łączników (test)."
    return _operacja(pusty_model(), "add_grid_source_sn", ladunek)


def _wylacznik_rezerwy(enm: dict[str, Any]) -> str:
    (stacja,) = (s for s in enm["substations"] if s.get("gpz_hv_sections"))
    rezerwowy = next(
        t for t in enm["transformers"] if t["ref_id"] == stacja["gpz_reserve_transformer_ref"]
    )
    szyny_sn = {s["bus_ref"] for s in stacja["gpz_sections"]}
    (ref,) = (
        g["ref_id"]
        for g in enm["branches"]
        if g["type"] in TYPY_LACZNIKOW_ZE_STANEM_NORMALNYM
        and rezerwowy["lv_bus_ref"] in (g["from_bus_ref"], g["to_bus_ref"])
        and {g["from_bus_ref"], g["to_bus_ref"]} & szyny_sn
    )
    return ref


def _stacja_sekcyjna_w_pierscieniu() -> tuple[dict[str, Any], str]:
    enm = _odcinki(_gpz(), [200, 250, 300])
    kable = _kable(enm)
    szyna_gpz, koniec = kable[0]["from_bus_ref"], kable[-1]["to_bus_ref"]
    enm = wykonaj(
        enm,
        "insert_station_on_segment_sn",
        {
            "segment_ref": kable[1]["ref_id"],
            "field_apparatus_catalog_ref": APARAT_POLA_SN,
            "station_type": "D",
            "insert_at": {"value": 0.5},
            "station": {"sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4},
            "sn_fields": ["IN", "OUT", "COUPLER"],
            "transformer": {"create": True, "transformer_catalog_ref": TRAFO_SN_NN},
        },
    )
    enm = wykonaj(
        enm,
        "connect_secondary_ring_sn",
        {
            "from_bus_ref": szyna_gpz,
            "to_bus_ref": koniec,
            "segment": {"rodzaj": "KABEL", "dlugosc_m": 400, "catalog_ref": KABEL},
        },
    )
    (sprzeglo,) = (g["ref_id"] for g in enm["branches"] if g["type"] == "bus_coupler")
    return enm, sprzeglo


def _rozdzielnica_nn() -> tuple[dict[str, Any], str]:
    enm = wykonaj(_pusty(), "add_nn_distribution_board", {"voltage_kv": 0.4, "name": "RGnN-1"})
    (stacja,) = enm["substations"]
    enm = wykonaj(
        enm, "add_nn_section_coupler", {"station_ref": stacja["ref_id"], "catalog_ref": APARAT_NN}
    )
    (sprzeglo,) = (g["ref_id"] for g in enm["branches"] if g["type"] == "bus_coupler")
    return enm, sprzeglo


def przypadki() -> list[dict[str, Any]]:
    """Iloczyn {rodzaj łącznika} × {pozycja normalna} — migawki ze ścieżki użytkownika
    (pozycja niezadeklarowana — ``None`` — tam, gdzie zapisuje ją operacja tworząca)."""
    wynik: list[dict[str, Any]] = []

    def dodaj(nazwa: str, rodzaj: str, stan: str | None, enm: dict[str, Any], ref: str) -> None:
        assert _galaz(enm, ref).get("normal_state") == stan, (nazwa, _galaz(enm, ref))
        wynik.append({"nazwa": nazwa, "rodzaj": rodzaj, "stan": stan, "enm": enm, "lacznik": ref})

    # ŁS-110: pole wejścia `hv_coupler.normal_state` operacji tworzenia GPZ.
    for stan in ("open", "closed"):
        enm = _h5(stan)
        dodaj(f"ls110_{stan}", "LS_110", stan, enm, refy(enm).lacznik_wn)
    # ŁS-SN: stan wynika z wybranego sposobu rezerwowania (ENEA §26.10.5) — rezerwa ukryta:
    # otwarty, rezerwa jawna: zamknięty (pole wejścia `reserve_mode`).
    for stan, tryb in (("open", "hidden"), ("closed", "explicit")):
        enm = _h5("open", reserve_mode=tryb)
        dodaj(f"lssn_{stan}", "LS_SN", stan, enm, refy(enm).lacznik_sn)
    # Łącznik pola transformatorowego rezerwy jawnej: operacja zapisuje go normalnie otwartym
    # (transformator rezerwowy odstawiony). Pozycja „zamknięty” nie ma operacji domenowej
    # (zmiana sposobu rezerwowania to nowa stacja), więc wariant zamknięty jest tą samą
    # migawką z pozycją zmienioną w kopii — reguła roli nie czyta pozycji tego łącznika,
    # co przypadek przypina.
    jawna = _h5("open", reserve_mode="explicit")
    wylacznik = _wylacznik_rezerwy(jawna)
    dodaj("pole_tr_open", "POLE_TR", "open", jawna, wylacznik)
    zamknieta = copy.deepcopy(jawna)
    _galaz(zamknieta, wylacznik).update(normal_state="closed", status="closed")
    dodaj("pole_tr_closed", "POLE_TR", "closed", zamknieta, wylacznik)
    # Łącznik sekcyjny magistrali: operacja wstawienia zapisuje go BEZ pozycji normalnej
    # (niezadeklarowana); `set_normal_open_point` w pierścieniu otwiera wskazany łącznik
    # i zamyka poprzedni punkt podziału — jedna migawka daje oba stany.
    siec = promieniowa()
    dodaj("magistrala_brak", "MAGISTRALA", None, siec.enm, siec.cel)
    pierscien = pierscien_z_nop()
    assert pierscien.poprzedni_nop is not None
    po = _nop(pierscien.enm, pierscien.cel)
    dodaj("magistrala_open", "MAGISTRALA", "open", po, pierscien.cel)
    dodaj("magistrala_closed", "MAGISTRALA", "closed", po, pierscien.poprzedni_nop)
    # Sprzęgło stacji sekcyjnej w pierścieniu: zapis operacji (brak pozycji), punkt podziału
    # na sprzęgle, potem przeniesienie punktu na inny łącznik pierścienia (sprzęgło zamknięte).
    enm, sprzeglo = _stacja_sekcyjna_w_pierscieniu()
    dodaj("stacja_sekcyjna_brak", "STACJA_SEKCYJNA", None, enm, sprzeglo)
    otwarte = _nop(enm, sprzeglo)
    dodaj("stacja_sekcyjna_open", "STACJA_SEKCYJNA", "open", otwarte, sprzeglo)
    zamkniete = _nop(otwarte, _inny_punkt(otwarte, sprzeglo))
    dodaj("stacja_sekcyjna_closed", "STACJA_SEKCYJNA", "closed", zamkniete, sprzeglo)
    # Sprzęgło sekcji rozdzielnicy nN: zapis operacji (brak pozycji) i `set_normal_open_point`.
    # Rozdzielnica bez pierścienia nie ma operacji, która zapisze „zamknięty” — wariant
    # zamknięty jest kopią z pozycją jawną (reguła roli nie czyta pozycji łącznika szyn).
    enm, sprzeglo = _rozdzielnica_nn()
    dodaj("nn_brak", "SPRZEGLO_NN", None, enm, sprzeglo)
    dodaj("nn_open", "SPRZEGLO_NN", "open", _nop(enm, sprzeglo), sprzeglo)
    zamkniete = copy.deepcopy(enm)
    _galaz(zamkniete, sprzeglo)["normal_state"] = "closed"
    dodaj("nn_closed", "SPRZEGLO_NN", "closed", zamkniete, sprzeglo)
    return wynik


def _inny_punkt(enm: dict[str, Any], sprzeglo: str) -> str:
    """Łącznik pierścienia (inny niż sprzęgło), na który przenosi się punkt podziału."""
    kandydaci = sorted(
        g["ref_id"]
        for g in enm["branches"]
        if g["type"] in TYPY_LACZNIKOW_ZE_STANEM_NORMALNYM
        and g["ref_id"] != sprzeglo
        and g["ref_id"] not in role_lacznikow(enm)
    )
    assert kandydaci, "pierścień bez innego łącznika"
    return kandydaci[0]


def _oczekiwane(enm: dict[str, Any]) -> dict[str, Any]:
    role = dict(role_lacznikow(enm))
    kandydaci = sorted(
        g["ref_id"]
        for g in enm["branches"]
        if g["type"] in TYPY_LACZNIKOW_ZE_STANEM_NORMALNYM and g["ref_id"] not in role
    )
    return {
        "role": dict(sorted(role.items())),
        "punkty_podzialu": list(punkty_podzialu(enm)),
        "kandydaci": kandydaci,
    }


def tablica() -> dict[str, Any]:
    return {
        "wersja": 1,
        "opis": (
            "Rola łącznika (enm.topology.role_lacznikow) — tablica parytetu backend × front "
            "(ui/shared/stanLacznika.ts::roleLacznikow). Generator: "
            "tests/enm/test_role_lacznikow_parytet.py."
        ),
        "przypadki": [
            {
                "nazwa": p["nazwa"],
                "rodzaj": p["rodzaj"],
                "stan": p["stan"],
                "lacznik": p["lacznik"],
                "migawka": _przytnij(p["enm"]),
                **_oczekiwane(p["enm"]),
            }
            for p in przypadki()
        ],
    }


def _tresc() -> str:
    return json.dumps(tablica(), ensure_ascii=False, indent=2, sort_keys=False) + "\n"


@pytest.fixture(scope="module")
def zbior() -> list[dict[str, Any]]:
    return przypadki()


#: Oczekiwana rola łącznika przypadku — z iloczynu cech, nie z funkcji pod testem.
ROLA_RODZAJU: dict[tuple[str, str | None], str | None] = {
    ("LS_110", "open"): ROLA_LACZNIK_SZYN_WN,
    ("LS_110", "closed"): ROLA_LACZNIK_SZYN_WN,
    ("LS_SN", "open"): ROLA_LACZNIK_SZYN_SN,
    ("LS_SN", "closed"): ROLA_LACZNIK_SZYN_SN,
    ("POLE_TR", "open"): ROLA_LACZNIK_POLA_TRANSFORMATOROWEGO,
    ("POLE_TR", "closed"): ROLA_LACZNIK_POLA_TRANSFORMATOROWEGO,
    ("MAGISTRALA", "open"): ROLA_PUNKT_PODZIALU,
    ("MAGISTRALA", "closed"): None,
    ("MAGISTRALA", None): None,
    ("STACJA_SEKCYJNA", "open"): ROLA_PUNKT_PODZIALU,
    ("STACJA_SEKCYJNA", "closed"): None,
    ("STACJA_SEKCYJNA", None): None,
    ("SPRZEGLO_NN", "open"): ROLA_LACZNIK_SZYN_NN,
    ("SPRZEGLO_NN", "closed"): ROLA_LACZNIK_SZYN_NN,
    ("SPRZEGLO_NN", None): ROLA_LACZNIK_SZYN_NN,
}

#: Brzmienie I001 przy normalnie otwartym łączniku — po roli.
I001_RODZAJU: dict[str, str] = {
    "LS_110": "jest łącznikiem szyn 110 kV normalnie otwartym",
    "LS_SN": "jest łącznikiem szyn SN normalnie otwartym",
    "POLE_TR": "jest łącznikiem pola transformatorowego normalnie otwartym",
    "MAGISTRALA": "jest punktem normalnie otwartym — dzieli sieć",
    "STACJA_SEKCYJNA": "jest punktem normalnie otwartym — dzieli sieć",
    "SPRZEGLO_NN": "jest łącznikiem szyn nN normalnie otwartym",
}


def test_iloczyn_cech_kompletny(zbior: list[dict[str, Any]]) -> None:
    assert {(p["rodzaj"], p["stan"]) for p in zbior} == set(ROLA_RODZAJU)


@pytest.mark.parametrize(("rodzaj", "stan"), sorted(ROLA_RODZAJU, key=str))
def test_rola_i_punkt_podzialu(zbior: list[dict[str, Any]], rodzaj: str, stan: str | None) -> None:
    (p,) = (p for p in zbior if (p["rodzaj"], p["stan"]) == (rodzaj, stan))
    enm, ref = p["enm"], p["lacznik"]
    oczekiwana = ROLA_RODZAJU[(rodzaj, stan)]
    assert role_lacznikow(enm).get(ref) == oczekiwana
    jest_punktem = oczekiwana == ROLA_PUNKT_PODZIALU
    assert (ref in punkty_podzialu(enm)) is jest_punktem
    # Rola z migawki przyciętej = rola z pełnej (reguła czyta wyłącznie pola tablicy).
    assert role_lacznikow(_przytnij(enm)) == role_lacznikow(enm)
    # I001: łącznik normalnie otwarty nazwany wg roli; I005 (pierścień bez punktu podziału)
    # nigdy nie wskazuje łącznika szyn jako brakującego punktu.
    raport = ENMValidator().validate(EnergyNetworkModel.model_validate(enm))
    i001 = [i.message_pl for i in raport.issues if i.code == "I001" and ref in i.element_refs]
    otwarty = _galaz(enm, ref).get("status") == "open"
    if stan == "open":
        assert otwarty and len(i001) == 1 and I001_RODZAJU[rodzaj] in i001[0], i001
    else:
        assert (len(i001) == 1) is otwarty, i001


def test_pierscien_rozciety_w_stacji_sekcyjnej_ma_punkt_podzialu(
    zbior: list[dict[str, Any]],
) -> None:
    """Doprecyzowanie reguły z pomiaru: sprzęgło stacji SN w magistrali normalnie otwarte
    rozcina pierścień — I005 („pierścień bez punktu podziału”) nie może się pojawić. Przy
    regule „każdy łącznik między szynami tej samej stacji to łącznik szyn” sprzęgło dostawało
    rolę ŁS-SN i I005 meldował pierścień rozcięty w stacji sekcyjnej jako nierozcięty."""
    (p,) = (p for p in zbior if p["nazwa"] == "stacja_sekcyjna_open")
    raport = ENMValidator().validate(EnergyNetworkModel.model_validate(p["enm"]))
    assert [i for i in raport.issues if i.code == "I005"] == []
    assert punkty_podzialu(p["enm"]) == (p["lacznik"],)


def test_lacznik_szyn_gpz_normalnie_otwarty_nie_jest_punktem_podzialu(
    zbior: list[dict[str, Any]],
) -> None:
    """Układ H5 z ŁS-110 i ŁS-SN normalnie otwartymi: zero punktów podziału sieci."""
    (p,) = (p for p in zbior if p["nazwa"] == "lssn_open")
    r = refy(p["enm"])
    assert _galaz(p["enm"], r.lacznik_wn)["normal_state"] == "open"
    assert _galaz(p["enm"], r.lacznik_sn)["normal_state"] == "open"
    assert punkty_podzialu(p["enm"]) == ()


def test_tablica_parytetu_aktualna_i_deterministyczna() -> None:
    """Tablica wspólna z frontem = wynik reguły dziś; dwa przebiegi — ta sama treść."""
    tresc = _tresc()
    assert tresc == _tresc()
    assert TABLICA.read_text(encoding="utf-8") == tresc, (
        "Tablica parytetu ról łączników nieaktualna — regeneruj: "
        "PYTHONPATH=src:. python -m tests.enm.test_role_lacznikow_parytet"
    )


def test_zbudowany_model_h5_z_odbiorami_ma_te_same_role() -> None:
    """Odbiory na sekcjach SN nie zmieniają ról (reguła nie czyta odbiorów)."""
    pelny = zbuduj_h5()
    goly = _h5("open")
    assert role_lacznikow(pelny) == role_lacznikow(goly)


if __name__ == "__main__":
    TABLICA.write_text(_tresc(), encoding="utf-8")
    print(f"zapisano {TABLICA}")

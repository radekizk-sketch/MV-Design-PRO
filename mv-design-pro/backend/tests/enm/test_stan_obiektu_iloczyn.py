"""Stan obiektu (istniejący / projektowany) × zakaz gazów fluorowanych — iloczyn cech.

PO CO. Korekta właściciela 2026-10-28 do karty UX-04/POLE-LINIOWE-WZORZEC: gaz fluorowany
(SF₆) jest dopuszczony WYŁĄCZNIE w obiekcie istniejącym (rozporządzenie (UE) 2024/573, art. 13
ust. 9 — zakaz wprowadzania do użytku; ust. 10 przeniesienie i ust. 7 serwis dotyczą aparatów
istniejących). Każdy obiekt utworzony operacją projektową jest ``PROJEKTOWANY``; ``ISTNIEJACY``
nadaje wyłącznie jawna operacja `set_object_state` albo import istniejącej sieci.

CECHY ILOCZYNU (reguła KLASA, NIE INSTANCJA):

* stan obiektu ∈ {ISTNIEJACY, PROJEKTOWANY, nieustalony (rekord sprzed atrybutu)};
* medium pozycji ∈ {z gazem fluorowanym, bez gazu};
* operacja ∈ {utworzenie (pole z katalogu rozdzielnic, pole z deklaracji, stacja, GPZ, łącznik
  sekcyjny), dobudowa pola do rozdzielnicy istniejącej, wymiana aparatu (wyposażenie pola,
  pozycja katalogu łącznika), przypisanie rodziny, oznaczenie stanu, import arkusza, krok
  kreatora sieci} × tryb {zapis, próba};
* nośnik (typ) ∈ {RODZINA pola, APARAT wyposażenia, APARAT GŁÓWNY pola, ŁĄCZNIK pola, ŁĄCZNIK
  poza polem}.

Iniekcje (meldunek karty): strażnik operacji przepuszczający obiekt projektowany z SF₆ →
czerwone testy utworzenia, wymiany i oznaczenia; pisarz gałęzi łączeniowej bez stanu →
czerwony test „każdy obiekt utworzony operacją ma stan".
"""

from __future__ import annotations

import copy
import hashlib
import json
from collections.abc import Callable
from typing import Any

import pytest
from application.network_wizard.step_controller import apply_step
from application.xlsx_import.importer import XlsxNetworkImporter
from application.xlsx_import.service import graf_z_arkusza
from enm.domain_operations import execute_domain_operation
from enm.gaz_fluorowany_pola import (
    RODZAJE_GALEZI_LACZENIOWYCH,
    naruszenia_gazu_fluorowanego,
    stan_obiektu_lacznika,
)
from enm.hash import hash_migawki_enm
from enm.katalog_projektu import kontekst_katalogu
from enm.kompilator_grafu import kompiluj_graf
from enm.models import EnergyNetworkModel
from enm.validator import ENMValidator
from network_model.catalog.gazy_fluorowane import (
    AKCJA_NAPRAWCZA_GAZU_FLUOROWANEGO_PL,
    KOD_ODMOWY_GAZU_FLUOROWANEGO,
    STANY_OBIEKTU,
)

from tests.enm.siec_lacznikowa import _gpz, _kable, _odcinki, _pusty, galaz, promieniowa, wykonaj
from tests.enm.test_wyposazenie_pola import _pole, _siec_z_polami
from tests.utils.arkusz_xlsx import (
    NAGLOWEK_LINII_TABLICZKA,
    NAGLOWEK_SZYN,
    NAGLOWEK_TRAFO_TABLICZKA,
    NAGLOWEK_ZRODEL,
    wiersz_linii_tabliczka,
    wiersz_trafo_tabliczka,
    zbuduj_skoroszyt,
)

WYLACZNIK_SF6 = "sw-cb-zpue-rotoblok-24kv-630a"
WYLACZNIK_PROZNIOWY = "sw-cb-abb-vd4-17kv-630a"
#: Inna pozycja próżniowa — wymiana pozycji łącznika pola (ta sama pozycja nie jest wymianą).
WYLACZNIK_PROZNIOWY_ZAMIENNY = "sw-cb-abb-vd4-24kv-630a"
ROZLACZNIK_SF6 = "sw-ls-zpue-nal-24kv-630a"
ROZLACZNIK_PROZNIOWY = "sw-ls-ogolny-prozniowy-24kv-630a"
POLE_RODZINY_SF6 = "ZPUE_WLOSZCZOWA__ROTOBLOK__TRANSFORMER"
POLE_RODZINY_BEZ_GAZU = "ZPUE_WLOSZCZOWA__ROTOBLOK_AIR__TRANSFORMER"
RODZINA_GPZ_SF6 = "ZPUE_WLOSZCZOWA__ROTOBLOK"
RODZINA_GPZ_BEZ_GAZU = "TYP_OGOLNY_OSD__GPZ_AIS"
TRAFO = "tr-sn-nn-15-04-630kva-dyn11"

MEDIA = ("SF6", "BEZ_GAZU")


@pytest.fixture(scope="module")
def siec() -> tuple[dict[str, Any], dict[str, str], str]:
    return _siec_z_polami()


def _stacja(enm: dict[str, Any]) -> dict[str, Any]:
    return next(s for s in enm["substations"] if s.get("station_type") != "gpz")


def _odmowa_gazu(enm: dict[str, Any], operacja: str, ladunek: dict[str, Any]) -> dict[str, Any]:
    """Odmowa z kodem zakazu, podstawą i akcją naprawczą; model wejściowy nietknięty."""
    wejscie = copy.deepcopy(enm)
    wynik = execute_domain_operation(enm, operacja, ladunek)
    assert wynik.get("error_code") == KOD_ODMOWY_GAZU_FLUOROWANEGO, (
        operacja,
        wynik.get("error_code"),
        wynik.get("error"),
    )
    assert not wynik.get("snapshot")
    assert enm == wejscie, "odmowa zmieniła model wejściowy"
    tresc = str(wynik["error"])
    assert "2024/573" in tresc and "art. 13 ust. 9" in tresc
    assert AKCJA_NAPRAWCZA_GAZU_FLUOROWANEGO_PL in tresc
    akcje = wynik.get("fix_actions") or []
    assert akcje and all(a["message_pl"] == AKCJA_NAPRAWCZA_GAZU_FLUOROWANEGO_PL for a in akcje)
    return wynik


def _nowe_rekordy(przed: dict[str, Any], po: dict[str, Any], kolekcja: str) -> list[dict[str, Any]]:
    refy = {r["ref_id"] for r in przed.get(kolekcja) or []}
    return [r for r in po.get(kolekcja) or [] if r["ref_id"] not in refy]


def obiekty_bez_stanu(enm: dict[str, Any]) -> list[str]:
    """Pola, aparaty pól i gałęzie łączeniowe bez nadanego stanu obiektu."""
    braki: list[str] = []
    for pole in enm.get("bays") or []:
        if pole.get("stan_obiektu") not in STANY_OBIEKTU:
            braki.append(f"pole {pole['ref_id']}")
        for aparat in pole.get("primary_devices") or []:
            if aparat.get("stan_obiektu") not in STANY_OBIEKTU:
                braki.append(f"aparat {aparat.get('device_ref')}")
    for galaz_ in enm.get("branches") or []:
        if (
            galaz_.get("type") in RODZAJE_GALEZI_LACZENIOWYCH
            and galaz_.get("stan_obiektu") not in STANY_OBIEKTU
        ):
            braki.append(f"łącznik {galaz_['ref_id']}")
    return braki


def _wszystko_projektowane(przed: dict[str, Any], po: dict[str, Any]) -> None:
    nowe_pola = _nowe_rekordy(przed, po, "bays")
    nowe_galezie = [
        g for g in _nowe_rekordy(przed, po, "branches") if g["type"] in RODZAJE_GALEZI_LACZENIOWYCH
    ]
    assert nowe_pola or nowe_galezie, "operacja nie utworzyła obiektu"
    for pole in nowe_pola:
        assert pole["stan_obiektu"] == "PROJEKTOWANY", pole["ref_id"]
        for aparat in pole.get("primary_devices") or []:
            assert aparat["stan_obiektu"] == "PROJEKTOWANY", aparat["device_ref"]
    for galaz_ in nowe_galezie:
        assert galaz_["stan_obiektu"] == "PROJEKTOWANY", galaz_["ref_id"]


# ---------------------------------------------------------------------------
# 1. Utworzenie — operacja tworząca × medium × tryb
# ---------------------------------------------------------------------------


def _pole_z_rodziny(enm: dict[str, Any], medium: str) -> tuple[str, dict[str, Any]]:
    stacja = _stacja(enm)
    return "add_sn_bay", {
        "bus_ref": stacja["bus_refs"][0],
        "station_ref": stacja["ref_id"],
        "complete_bay_template_ref": POLE_RODZINY_SF6 if medium == "SF6" else POLE_RODZINY_BEZ_GAZU,
        "catalog_ref": WYLACZNIK_PROZNIOWY,
    }


def _pole_z_deklaracji(enm: dict[str, Any], medium: str) -> tuple[str, dict[str, Any]]:
    stacja = _stacja(enm)
    return "add_sn_bay", {
        "bus_ref": stacja["bus_refs"][0],
        "station_ref": stacja["ref_id"],
        "bay_role": "LINIA_OUT",
        "apparatus_kind": "BREAKER",
        "catalog_ref": WYLACZNIK_SF6 if medium == "SF6" else WYLACZNIK_PROZNIOWY,
    }


UTWORZENIA_W_STACJI: dict[str, Callable[[dict[str, Any], str], tuple[str, dict[str, Any]]]] = {
    "pole_z_rodziny": _pole_z_rodziny,
    "pole_z_deklaracji": _pole_z_deklaracji,
}


@pytest.mark.parametrize("proba", [False, True], ids=["zapis", "proba"])
@pytest.mark.parametrize("medium", MEDIA)
@pytest.mark.parametrize("droga", sorted(UTWORZENIA_W_STACJI))
def test_utworzenie_pola_iloczyn(siec: Any, droga: str, medium: str, proba: bool) -> None:
    enm = siec[0]
    operacja, ladunek = UTWORZENIA_W_STACJI[droga](enm, medium)
    if proba:
        ladunek["dry_run"] = True
    if medium == "SF6":
        # Próba i zapis — jeden werdykt jednej operacji (`_wynik_zapisu_proby`).
        _odmowa_gazu(enm, operacja, ladunek)
        return
    wynik = execute_domain_operation(enm, operacja, ladunek)
    assert not wynik.get("error"), wynik.get("error")
    if proba:
        assert not wynik.get("snapshot")
        return
    _wszystko_projektowane(enm, wynik["snapshot"])


@pytest.mark.parametrize("medium", MEDIA)
def test_utworzenie_stacji_wcietej(medium: str) -> None:
    enm = _odcinki(_gpz(), [200, 300])
    ladunek = {
        "segment_ref": _kable(enm)[-1]["ref_id"],
        "field_apparatus_catalog_ref": WYLACZNIK_SF6 if medium == "SF6" else WYLACZNIK_PROZNIOWY,
        "station_type": "B",
        "insert_at": {"value": 0.5},
        "station": {"sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4},
        "sn_fields": ["IN", "OUT"],
        "transformer": {"create": True, "transformer_catalog_ref": TRAFO},
    }
    if medium == "SF6":
        _odmowa_gazu(enm, "insert_station_on_segment_sn", ladunek)
        return
    _wszystko_projektowane(enm, wykonaj(enm, "insert_station_on_segment_sn", ladunek))


@pytest.mark.parametrize("medium", MEDIA)
def test_przypisanie_rodziny_gpz(medium: str) -> None:
    ladunek = {
        "voltage_kv": 15.0,
        "source_name": "GPZ",
        "sk3_mva": 300.0,
        "rx_ratio": 0.1,
        "catalog_ref": "src-gpz-15kv-300mva-rx010",
        "switchgear_family_ref": RODZINA_GPZ_SF6 if medium == "SF6" else RODZINA_GPZ_BEZ_GAZU,
    }
    if medium == "SF6":
        _odmowa_gazu(_pusty(), "add_grid_source_sn", ladunek)
        return
    po = wykonaj(_pusty(), "add_grid_source_sn", ladunek)
    _wszystko_projektowane(_pusty(), po)
    assert {b.get("switchgear_family_ref") for b in po["bays"]} == {RODZINA_GPZ_BEZ_GAZU}


@pytest.mark.parametrize("medium", MEDIA)
def test_utworzenie_lacznika_sekcyjnego(medium: str) -> None:
    enm = promieniowa().enm
    ladunek = {
        "segment_id": _kable(enm)[-1]["ref_id"],
        "insert_at": {"mode": "RATIO", "value": 0.5},
        "catalog_ref": ROZLACZNIK_SF6 if medium == "SF6" else ROZLACZNIK_PROZNIOWY,
    }
    if medium == "SF6":
        _odmowa_gazu(enm, "insert_section_switch_sn", ladunek)
        return
    _wszystko_projektowane(enm, wykonaj(enm, "insert_section_switch_sn", ladunek))


# ---------------------------------------------------------------------------
# 2. Oznaczenie stanu — pole z aparatami i łącznikami jako jeden obiekt
# ---------------------------------------------------------------------------


def _oznacz_pole(enm: dict[str, Any], bay_ref: str, stan: str) -> dict[str, Any]:
    wynik = execute_domain_operation(
        enm, "set_object_state", {"bay_ref": bay_ref, "stan_obiektu": stan}
    )
    assert not wynik.get("error"), wynik.get("error")
    assert [z["event_type"] for z in wynik["domain_events"]] == ["OBJECT_STATE_SET"]
    return wynik["snapshot"]


@pytest.mark.parametrize("rola", ["IN", "OUT", "TR", "FEEDER", "COUPLER", "MEASUREMENT", "OZE"])
def test_oznaczenie_pola_obejmuje_aparaty_i_laczniki(siec: Any, rola: str) -> None:
    enm, pola, _ = siec
    po = _oznacz_pole(enm, pola[rola], "ISTNIEJACY")
    pole = _pole(po, pola[rola])
    assert pole["stan_obiektu"] == "ISTNIEJACY"
    assert all(a["stan_obiektu"] == "ISTNIEJACY" for a in pole.get("primary_devices") or [])
    laczniki = _laczniki_pola(po, pola[rola])
    for galaz_ in laczniki:
        assert galaz_["stan_obiektu"] == "ISTNIEJACY", galaz_["ref_id"]
        assert stan_obiektu_lacznika(po, galaz_) == "ISTNIEJACY"
    # Inne pola bez zmian — oznaczenie dotyczy jednego obiektu.
    for inna, ref in pola.items():
        if inna != rola:
            assert _pole(po, ref)["stan_obiektu"] == "PROJEKTOWANY"


def _laczniki_pola(enm: dict[str, Any], bay_ref: str) -> list[dict[str, Any]]:
    """Gałęzie łączeniowe z `equipment_refs` pola (lista niesie też transformator)."""
    refy = set(_pole(enm, bay_ref).get("equipment_refs") or [])
    return [
        g
        for g in enm["branches"]
        if g["ref_id"] in refy and g["type"] in RODZAJE_GALEZI_LACZENIOWYCH
    ]


def _lacznik_pola(enm: dict[str, Any], bay_ref: str) -> str:
    return str(_laczniki_pola(enm, bay_ref)[0]["ref_id"])


@pytest.fixture(scope="module")
def pole_istniejace(siec: Any) -> tuple[dict[str, Any], str]:
    enm, pola, _ = siec
    return _oznacz_pole(enm, pola["OUT"], "ISTNIEJACY"), pola["OUT"]


# ---------------------------------------------------------------------------
# 3. Wymiana aparatu w polu istniejącym — droga × stan jawny × medium
# ---------------------------------------------------------------------------


def _wymiana_wyposazenia(
    enm: dict[str, Any], bay_ref: str, catalog_ref: str, stan: str | None
) -> tuple[str, dict[str, Any]]:
    aparat: dict[str, Any] = {"kind": "CB", "placement": "MIDSTREAM", "catalog_ref": catalog_ref}
    if stan is not None:
        aparat["stan_obiektu"] = stan
    return "set_bay_equipment", {"bay_ref": bay_ref, "mode": "katalog", "devices": [aparat]}


def _wymiana_pozycji_lacznika(
    enm: dict[str, Any], bay_ref: str, catalog_ref: str, stan: str | None
) -> tuple[str, dict[str, Any]]:
    ladunek: dict[str, Any] = {
        "element_ref": _lacznik_pola(enm, bay_ref),
        "catalog_ref": catalog_ref,
    }
    if stan is not None:
        ladunek["stan_obiektu"] = stan
    return "assign_catalog_to_element", ladunek


WYMIANY = {"wyposazenie_pola": _wymiana_wyposazenia, "pozycja_lacznika": _wymiana_pozycji_lacznika}


@pytest.mark.parametrize("stan_jawny", [None, "ISTNIEJACY", "PROJEKTOWANY"])
@pytest.mark.parametrize("medium", MEDIA)
@pytest.mark.parametrize("droga", sorted(WYMIANY))
def test_wymiana_aparatu_w_polu_istniejacym(
    pole_istniejace: Any, droga: str, medium: str, stan_jawny: str | None
) -> None:
    enm, bay_ref = pole_istniejace
    catalog_ref = WYLACZNIK_SF6 if medium == "SF6" else WYLACZNIK_PROZNIOWY_ZAMIENNY
    operacja, ladunek = WYMIANY[droga](enm, bay_ref, catalog_ref, stan_jawny)
    # Wymiana = NOWA instancja (projektowana), chyba że projektant jawnie inwentaryzuje
    # aparat zastany w polu istniejącym (stan podany przy wskazaniu pozycji).
    oczekiwany = stan_jawny or "PROJEKTOWANY"
    if medium == "SF6" and oczekiwany != "ISTNIEJACY":
        _odmowa_gazu(enm, operacja, ladunek)
        return
    po = wykonaj(enm, operacja, ladunek)
    assert _pole(po, bay_ref)["stan_obiektu"] == "ISTNIEJACY", "pole zostaje istniejące"
    if droga == "wyposazenie_pola":
        [aparat] = _pole(po, bay_ref)["primary_devices"]
        assert aparat["stan_obiektu"] == oczekiwany
    else:
        galaz_ = galaz(po, ladunek["element_ref"])
        assert galaz_["catalog_ref"] == catalog_ref
        assert stan_obiektu_lacznika(po, galaz_) == oczekiwany
    assert not [n for n in naruszenia_gazu_fluorowanego(po) if n.bay_ref == bay_ref]


def test_ta_sama_pozycja_lacznika_zachowuje_stan(pole_istniejace: Any) -> None:
    enm, bay_ref = pole_istniejace
    ref = _lacznik_pola(enm, bay_ref)
    pozycja = galaz(enm, ref)["catalog_ref"]
    po = wykonaj(enm, "assign_catalog_to_element", {"element_ref": ref, "catalog_ref": pozycja})
    assert galaz(po, ref)["stan_obiektu"] == "ISTNIEJACY"


@pytest.mark.parametrize(
    ("ladunek", "kod"),
    [
        ({"stan_obiektu": "ZASTANY"}, "catalog.object_state_invalid"),
        ({"stan_obiektu": "ISTNIEJACY", "_cel": "kabel"}, "catalog.object_state_not_applicable"),
    ],
)
def test_stan_przy_przypisaniu_katalogu_odmowy(
    pole_istniejace: Any, ladunek: dict[str, Any], kod: str
) -> None:
    enm, bay_ref = pole_istniejace
    ladunek = dict(ladunek)
    if ladunek.pop("_cel", None) == "kabel":
        kabel = _kable(enm)[0]
        cel = {"element_ref": kabel["ref_id"], "catalog_ref": kabel["catalog_ref"]}
    else:
        cel = {"element_ref": _lacznik_pola(enm, bay_ref), "catalog_ref": WYLACZNIK_PROZNIOWY}
    wejscie = copy.deepcopy(enm)
    wynik = execute_domain_operation(enm, "assign_catalog_to_element", {**cel, **ladunek})
    assert wynik.get("error_code") == kod, (wynik.get("error_code"), wynik.get("error"))
    assert enm == wejscie


# ---------------------------------------------------------------------------
# 4. Oznaczenie „projektowany" obiektu z SF₆ — odmowa; oznaczenie „istniejący" — zwalnia
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def pole_istniejace_z_sf6(pole_istniejace: Any) -> tuple[dict[str, Any], str]:
    enm, bay_ref = pole_istniejace
    operacja, ladunek = _wymiana_wyposazenia(enm, bay_ref, WYLACZNIK_SF6, "ISTNIEJACY")
    return wykonaj(enm, operacja, ladunek), bay_ref


def test_oznaczenie_projektowany_pola_z_sf6_odmawia(pole_istniejace_z_sf6: Any) -> None:
    enm, bay_ref = pole_istniejace_z_sf6
    _odmowa_gazu(enm, "set_object_state", {"bay_ref": bay_ref, "stan_obiektu": "PROJEKTOWANY"})
    [aparat] = _pole(enm, bay_ref)["primary_devices"]
    _odmowa_gazu(
        enm,
        "set_object_state",
        {"bay_ref": bay_ref, "device_ref": aparat["device_ref"], "stan_obiektu": "PROJEKTOWANY"},
    )


def test_oznaczenie_aparatu_obejmuje_jego_lacznik(siec: Any) -> None:
    """Aparat wskazujący łącznik pola (`linked_ref`) i ten łącznik to jeden fizyczny aparat."""
    enm, pola, _ = siec
    bay_ref = pola["IN"]
    lacznik = _lacznik_pola(enm, bay_ref)
    enm = wykonaj(
        enm,
        "set_bay_equipment",
        {
            "bay_ref": bay_ref,
            "mode": "katalog",
            "devices": [
                {
                    "kind": "CB",
                    "placement": "MIDSTREAM",
                    "catalog_ref": galaz(enm, lacznik)["catalog_ref"],
                    "linked_ref": lacznik,
                }
            ],
        },
    )
    [aparat] = _pole(enm, bay_ref)["primary_devices"]
    po = wykonaj(
        enm,
        "set_object_state",
        {"bay_ref": bay_ref, "device_ref": aparat["device_ref"], "stan_obiektu": "ISTNIEJACY"},
    )
    assert _pole(po, bay_ref)["stan_obiektu"] == "PROJEKTOWANY"
    assert _pole(po, bay_ref)["primary_devices"][0]["stan_obiektu"] == "ISTNIEJACY"
    assert galaz(po, lacznik)["stan_obiektu"] == "ISTNIEJACY"
    # Łącznik opisany aparatem pola — stan ustawia się na karcie pola, nie na gałęzi.
    wynik = execute_domain_operation(
        po, "set_object_state", {"switch_ref": lacznik, "stan_obiektu": "PROJEKTOWANY"}
    )
    assert wynik.get("error_code") == "object_state.switch_has_bay_device"


# ---------------------------------------------------------------------------
# 5. Łącznik poza polem — utworzenie, oznaczenie, wymiana × stan jawny
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def lacznik_sekcyjny() -> tuple[dict[str, Any], str]:
    siec_ = promieniowa()
    return siec_.enm, siec_.cel


def test_lacznik_sekcyjny_iloczyn_stanu(lacznik_sekcyjny: Any) -> None:
    enm, ref = lacznik_sekcyjny
    assert galaz(enm, ref)["stan_obiektu"] == "PROJEKTOWANY"
    sf6 = {"element_ref": ref, "catalog_ref": ROZLACZNIK_SF6}
    _odmowa_gazu(enm, "assign_catalog_to_element", sf6)
    istniejacy = wykonaj(enm, "set_object_state", {"switch_ref": ref, "stan_obiektu": "ISTNIEJACY"})
    assert galaz(istniejacy, ref)["stan_obiektu"] == "ISTNIEJACY"
    # Wymiana pozycji w łączniku istniejącym = nowa instancja (projektowana) → odmowa.
    _odmowa_gazu(istniejacy, "assign_catalog_to_element", sf6)
    inwentarz = wykonaj(
        istniejacy, "assign_catalog_to_element", {**sf6, "stan_obiektu": "ISTNIEJACY"}
    )
    assert galaz(inwentarz, ref)["stan_obiektu"] == "ISTNIEJACY"
    _odmowa_gazu(inwentarz, "set_object_state", {"switch_ref": ref, "stan_obiektu": "PROJEKTOWANY"})
    # Powrót do pozycji bez gazu — wymiana, łącznik projektowany.
    bez_gazu = wykonaj(
        inwentarz,
        "assign_catalog_to_element",
        {"element_ref": ref, "catalog_ref": ROZLACZNIK_PROZNIOWY},
    )
    assert galaz(bez_gazu, ref)["stan_obiektu"] == "PROJEKTOWANY"


# ---------------------------------------------------------------------------
# 6. Dobudowa pola do rozdzielnicy istniejącej
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("medium", MEDIA)
def test_dobudowa_pola_do_rozdzielnicy_istniejacej(siec: Any, medium: str) -> None:
    enm, pola, _ = siec
    for ref in pola.values():
        enm = _oznacz_pole(enm, ref, "ISTNIEJACY")
    operacja, ladunek = _pole_z_rodziny(enm, medium)
    if medium == "SF6":
        # Pole dobudowane do rozdzielnicy istniejącej jest projektowane — bez SF₆.
        _odmowa_gazu(enm, operacja, ladunek)
        return
    po = wykonaj(enm, operacja, ladunek)
    _wszystko_projektowane(enm, po)
    assert all(_pole(po, ref)["stan_obiektu"] == "ISTNIEJACY" for ref in pola.values())


# ---------------------------------------------------------------------------
# 7. Odmowy operacji stanu — każdy kod
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("ladunek", "kod"),
    [
        ({"stan_obiektu": "ISTNIEJACY"}, "object_state.bay_ref_missing"),
        (
            {"bay_ref": "<pole>", "switch_ref": "<lacznik>", "stan_obiektu": "ISTNIEJACY"},
            "object_state.target_ambiguous",
        ),
        ({"bay_ref": "<pole>", "stan_obiektu": "ZASTANY"}, "object_state.state_invalid"),
        ({"bay_ref": "<pole>"}, "object_state.state_invalid"),
        ({"bay_ref": "brak", "stan_obiektu": "ISTNIEJACY"}, "object_state.bay_not_found"),
        (
            {"bay_ref": "<pole>", "device_ref": " ", "stan_obiektu": "ISTNIEJACY"},
            "object_state.device_ref_invalid",
        ),
        (
            {"bay_ref": "<pole>", "device_ref": "brak", "stan_obiektu": "ISTNIEJACY"},
            "object_state.device_not_found",
        ),
        ({"switch_ref": "brak", "stan_obiektu": "ISTNIEJACY"}, "object_state.switch_not_found"),
        ({"switch_ref": "<kabel>", "stan_obiektu": "ISTNIEJACY"}, "object_state.switch_not_found"),
    ],
)
def test_odmowy_operacji_stanu(siec: Any, ladunek: dict[str, Any], kod: str) -> None:
    enm, pola, _ = siec
    podstawienia = {
        "<pole>": pola["OUT"],
        "<lacznik>": _lacznik_pola(enm, pola["OUT"]),
        "<kabel>": _kable(enm)[0]["ref_id"],
    }
    ladunek = {k: podstawienia.get(v, v) if isinstance(v, str) else v for k, v in ladunek.items()}
    wejscie = copy.deepcopy(enm)
    wynik = execute_domain_operation(enm, "set_object_state", ladunek)
    assert wynik.get("error_code") == kod, (wynik.get("error_code"), wynik.get("error"))
    assert not wynik.get("snapshot")
    assert enm == wejscie
    # Komunikat bez identyfikatorów i kodów (zdanie dla projektanta).
    assert kod not in str(wynik["error"])


# ---------------------------------------------------------------------------
# 8. Walidator modelu W045 — nośnik × stan (rekordy spoza operacji: zapis zastany)
# ---------------------------------------------------------------------------


def _w045(enm: dict[str, Any]) -> list[Any]:
    model = EnergyNetworkModel.model_validate(enm)
    with kontekst_katalogu(model):
        wynik = ENMValidator().validate(model)
    return [i for i in wynik.issues if i.code == "W045"]


def _z_nosnikiem(enm: dict[str, Any], nosnik: str, stan: str | None) -> tuple[dict[str, Any], str]:
    """Model z nośnikiem SF₆ o zadanym stanie, wpisanym WPROST w rekord (droga spoza operacji:
    archiwum, migracja) — walidator ma go zobaczyć niezależnie od strażnika operacji."""
    enm = copy.deepcopy(enm)
    pole = next(b for b in enm["bays"] if b["bay_role"] == "OUT")
    if nosnik == "RODZINA":
        pole["switchgear_family_ref"] = RODZINA_GPZ_SF6
        pole["stan_obiektu"] = stan
        return enm, pole["ref_id"]
    if nosnik == "APARAT":
        # Aparat z SF₆ zinwentaryzowany operacją (pełny rekord aparatu), potem stan wpisany
        # wprost — jak w zapisie spoza operacji.
        operacja, ladunek = _wymiana_wyposazenia(enm, pole["ref_id"], WYLACZNIK_SF6, "ISTNIEJACY")
        enm = wykonaj(_oznacz_pole(enm, pole["ref_id"], "ISTNIEJACY"), operacja, ladunek)
        pole = next(b for b in enm["bays"] if b["bay_role"] == "OUT")
        pole["primary_devices"][0]["stan_obiektu"] = stan
        return enm, pole["ref_id"]
    if nosnik == "APARAT_GLOWNY":
        pole["apparatus_catalog_ref"] = WYLACZNIK_SF6
        pole["stan_obiektu"] = stan
        return enm, pole["ref_id"]
    if nosnik == "LACZNIK_POLA":
        ref = _lacznik_pola(enm, pole["ref_id"])
        galaz(enm, ref)["catalog_ref"] = WYLACZNIK_SF6
        galaz(enm, ref)["stan_obiektu"] = stan
        pole["stan_obiektu"] = stan
        return enm, pole["ref_id"]
    raise AssertionError(nosnik)


NOSNIKI_POLA = ("RODZINA", "APARAT", "APARAT_GLOWNY", "LACZNIK_POLA")


@pytest.mark.parametrize("stan", ["ISTNIEJACY", "PROJEKTOWANY", None])
@pytest.mark.parametrize("nosnik", NOSNIKI_POLA)
def test_walidator_w045_nosnik_x_stan(siec: Any, nosnik: str, stan: str | None) -> None:
    enm, bay_ref = _z_nosnikiem(siec[0], nosnik, stan)
    kwestie = _w045(enm)
    if stan == "ISTNIEJACY":
        assert not kwestie
        return
    assert len(kwestie) == 1, [k.message_pl for k in kwestie]
    [kwestia] = kwestie
    assert kwestia.element_refs == [bay_ref]
    assert AKCJA_NAPRAWCZA_GAZU_FLUOROWANEGO_PL in kwestia.suggested_fix
    assert "2024/573" in kwestia.message_pl


@pytest.mark.parametrize("nosnik", ["RODZINA", "APARAT", "APARAT_GLOWNY"])
def test_walidator_w045_model_bez_lacznikow_z_katalogiem(siec: Any, nosnik: str) -> None:
    """Walidator zawęża pola do tych z wyrobem, gdy żaden łącznik nie ma pozycji katalogu —
    zawężenie musi przepuścić KAŻDY nośnik pola (rodzina, aparat, aparat główny)."""
    enm, bay_ref = _z_nosnikiem(siec[0], nosnik, "PROJEKTOWANY")
    for galaz_ in enm["branches"]:
        if galaz_["type"] in RODZAJE_GALEZI_LACZENIOWYCH:
            galaz_["catalog_ref"] = None
            galaz_["catalog_binding"] = None
    assert [k.element_refs for k in _w045(enm)] == [[bay_ref]]


@pytest.mark.parametrize("stan", ["ISTNIEJACY", "PROJEKTOWANY", None])
def test_walidator_w045_lacznik_poza_polem(lacznik_sekcyjny: Any, stan: str | None) -> None:
    enm, ref = lacznik_sekcyjny
    enm = copy.deepcopy(enm)
    galaz(enm, ref)["catalog_ref"] = ROZLACZNIK_SF6
    galaz(enm, ref)["stan_obiektu"] = stan
    kwestie = _w045(enm)
    if stan == "ISTNIEJACY":
        assert not kwestie
        return
    assert [k.element_refs for k in kwestie] == [[ref]]


def test_zrodla_stanu_lacznika_niezgodne_to_nie_istniejacy(siec: Any) -> None:
    """Aparat pola istniejący, gałąź projektowana (droga zapisu spoza operacji) — łącznik nie
    jest istniejący: brak zgody źródeł nie zwalnia z zakazu."""
    enm, pola, _ = siec
    enm = copy.deepcopy(enm)
    pole = _pole(enm, pola["OUT"])
    ref = _lacznik_pola(enm, pola["OUT"])
    pole["primary_devices"] = [
        {
            "device_ref": "d",
            "kind": "CB",
            "placement": "MIDSTREAM",
            "catalog_ref": WYLACZNIK_PROZNIOWY,
            "linked_ref": ref,
            "stan_obiektu": "ISTNIEJACY",
        }
    ]
    galaz(enm, ref)["stan_obiektu"] = "PROJEKTOWANY"
    galaz(enm, ref)["catalog_ref"] = WYLACZNIK_SF6
    assert stan_obiektu_lacznika(enm, galaz(enm, ref)) == "PROJEKTOWANY"
    assert [n.nosnik for n in naruszenia_gazu_fluorowanego(enm)] == ["LACZNIK"]
    galaz(enm, ref)["stan_obiektu"] = None
    assert stan_obiektu_lacznika(enm, galaz(enm, ref)) == "ISTNIEJACY"


# ---------------------------------------------------------------------------
# 9. Każdy obiekt utworzony operacją ma stan (pisarze × sieci referencyjne)
# ---------------------------------------------------------------------------


def test_detektor_braku_stanu_lapie_kazdy_rodzaj_obiektu() -> None:
    enm = {
        "bays": [
            {"ref_id": "p", "stan_obiektu": None, "primary_devices": [{"device_ref": "a"}]},
        ],
        "branches": [{"ref_id": "s", "type": "switch"}, {"ref_id": "k", "type": "cable"}],
    }
    assert obiekty_bez_stanu(enm) == ["pole p", "aparat a", "łącznik s"]


def test_kazdy_obiekt_lancucha_operacji_ma_stan() -> None:
    """Łańcuch przykładów kontraktu operacji (każda operacja rejestru przez końcówkę
    `domain-ops`) — każde pole, aparat pola i łącznik w każdej migawce ma nadany stan."""
    from tests.ci.dokument_operacji_enm import wykonaj_lancuch

    sprawdzone = 0
    for wynik in wykonaj_lancuch():
        migawka = wynik.odpowiedz.get("snapshot")
        if not isinstance(migawka, dict):
            continue
        assert not obiekty_bez_stanu(migawka), (wynik.krok.operacja, obiekty_bez_stanu(migawka))
        sprawdzone += 1
    assert sprawdzone > 40, sprawdzone


def test_kazdy_obiekt_sieci_referencyjnych_ma_stan() -> None:
    from tests.reference_networks.builders import build_all_golden_networks

    sieci = build_all_golden_networks()
    assert sieci
    for siec_ in sieci:
        assert not obiekty_bez_stanu(siec_["enm"]), (
            siec_.get("name"),
            obiekty_bez_stanu(siec_["enm"]),
        )
        assert all(
            s == "PROJEKTOWANY"
            for s in (
                *(b["stan_obiektu"] for b in siec_["enm"]["bays"]),
                *(
                    g["stan_obiektu"]
                    for g in siec_["enm"]["branches"]
                    if g["type"] in RODZAJE_GALEZI_LACZENIOWYCH
                ),
            )
        )


# ---------------------------------------------------------------------------
# 10. Kreator sieci — druga droga zapisu gałęzi
# ---------------------------------------------------------------------------


def _krok_k4(enm: dict[str, Any], dane: dict[str, Any]) -> Any:
    return apply_step(copy.deepcopy(enm), "K4", dane)


def _lacznik_kreatora(lacznik_sekcyjny: Any, **pola: Any) -> dict[str, Any]:
    enm, ref = lacznik_sekcyjny
    wzorzec = copy.deepcopy(galaz(enm, ref))
    wzorzec.pop("stan_obiektu", None)
    return {**wzorzec, "ref_id": "kreator/lacznik", "name": "Łącznik z kreatora", **pola}


@pytest.mark.parametrize("medium", MEDIA)
def test_kreator_dodanie_lacznika(lacznik_sekcyjny: Any, medium: str) -> None:
    enm = lacznik_sekcyjny[0]
    nowy = _lacznik_kreatora(
        lacznik_sekcyjny, catalog_ref=ROZLACZNIK_SF6 if medium == "SF6" else ROZLACZNIK_PROZNIOWY
    )
    wynik = _krok_k4(enm, {"add_branches": [nowy]})
    kody = [i.code for i in wynik.postcondition_issues]
    if medium == "SF6":
        assert not wynik.success and KOD_ODMOWY_GAZU_FLUOROWANEGO in kody
        return
    assert KOD_ODMOWY_GAZU_FLUOROWANEGO not in kody
    assert galaz(wynik.enm, "kreator/lacznik")["stan_obiektu"] == "PROJEKTOWANY"


@pytest.mark.parametrize("klucz", ["add_branches", "update_branches"])
def test_kreator_nie_nadaje_stanu(lacznik_sekcyjny: Any, klucz: str) -> None:
    enm, ref = lacznik_sekcyjny
    rekord = (
        _lacznik_kreatora(lacznik_sekcyjny, stan_obiektu="ISTNIEJACY")
        if klucz == "add_branches"
        else {"ref_id": ref, "stan_obiektu": "ISTNIEJACY"}
    )
    wynik = _krok_k4(enm, {klucz: [rekord]})
    assert not wynik.success
    assert "WIZARD_OBJECT_STATE_READONLY" in [i.code for i in wynik.postcondition_issues]
    assert wynik.enm == enm


@pytest.mark.parametrize("medium", MEDIA)
def test_kreator_wymiana_pozycji_lacznika_istniejacego(lacznik_sekcyjny: Any, medium: str) -> None:
    enm, ref = lacznik_sekcyjny
    enm = wykonaj(enm, "set_object_state", {"switch_ref": ref, "stan_obiektu": "ISTNIEJACY"})
    catalog_ref = ROZLACZNIK_SF6 if medium == "SF6" else ROZLACZNIK_PROZNIOWY
    wynik = _krok_k4(enm, {"update_branches": [{"ref_id": ref, "catalog_ref": catalog_ref}]})
    kody = [i.code for i in wynik.postcondition_issues]
    if medium == "SF6":
        assert not wynik.success and KOD_ODMOWY_GAZU_FLUOROWANEGO in kody
        return
    # Pozycja bez zmian (już próżniowa) — stan bez zmian; inna pozycja — wymiana.
    assert galaz(wynik.enm, ref)["stan_obiektu"] == "ISTNIEJACY"


# ---------------------------------------------------------------------------
# 11. Import arkusza — kolumna stanu szyny
# ---------------------------------------------------------------------------


def _arkusz_ze_stanem(stan: str | None) -> bytes:
    return zbuduj_skoroszyt(
        [
            (
                "Szyny",
                [
                    [*NAGLOWEK_SZYN, "stan"],
                    ["B1", "GPZ 15 kV", 15.0, stan],
                    ["B2", "Stacja 1", 15.0, None],
                    ["B3", "Stacja 1 nN", 0.4, None],
                ],
            ),
            ("Linie", [NAGLOWEK_LINII_TABLICZKA, wiersz_linii_tabliczka("L1", "B1", "B2", 5.0)]),
            ("Trafo", [NAGLOWEK_TRAFO_TABLICZKA, wiersz_trafo_tabliczka("T1", "B2", "B3")]),
            ("Źródła", [NAGLOWEK_ZRODEL, ["Z1", "B1", "system", 500.0, 0.1]]),
        ]
    )


def _import(stan: str | None) -> dict[str, Any]:
    wynik = XlsxNetworkImporter().import_from_bytes(_arkusz_ze_stanem(stan), "siec.xlsx")
    assert wynik.siec is not None, wynik.errors
    kompilacja = kompiluj_graf(graf_z_arkusza(wynik.siec, "Import"))
    return kompilacja.enm


@pytest.mark.parametrize(
    ("komorka", "oczekiwany"),
    [("istniejący", "ISTNIEJACY"), ("ISTNIEJACY", "ISTNIEJACY"), (None, "PROJEKTOWANY")],
)
def test_import_arkusza_nadaje_stan_pol_szyny(komorka: str | None, oczekiwany: str) -> None:
    enm = _import(komorka)
    # Szyna GPZ z kolumną stanu — arkusz bez stacji nie buduje pól na szynach odbiorczych.
    szyna_stacji = next(b["ref_id"] for b in enm["buses"] if b.get("name") == "GPZ 15 kV")
    pola_szyny = [p for p in enm["bays"] if p.get("bus_ref") == szyna_stacji]
    assert pola_szyny
    for pole in pola_szyny:
        assert pole["stan_obiektu"] == oczekiwany
        assert all(a["stan_obiektu"] == oczekiwany for a in pole.get("primary_devices") or [])
        for galaz_ in _laczniki_pola(enm, pole["ref_id"]):
            assert stan_obiektu_lacznika(enm, galaz_) == oczekiwany
    # Pola pozostałych szyn — projektowane (stan nadany jawnie tylko szynie z kolumną).
    assert all(
        p["stan_obiektu"] == "PROJEKTOWANY" for p in enm["bays"] if p.get("bus_ref") != szyna_stacji
    )
    assert not obiekty_bez_stanu(enm)


def test_import_arkusza_stan_spoza_slownika_jest_bledem_wiersza() -> None:
    wynik = XlsxNetworkImporter().import_from_bytes(_arkusz_ze_stanem("zastany"), "siec.xlsx")
    assert any(b.kolumna == "stan" and b.arkusz == "Szyny" for b in wynik.bledy), wynik.errors


# ---------------------------------------------------------------------------
# 12. Odcisk i determinizm
# ---------------------------------------------------------------------------


def test_stan_lacznika_w_odcisku_tylko_gdy_nadany(lacznik_sekcyjny: Any) -> None:
    enm, ref = lacznik_sekcyjny
    bez_klucza = copy.deepcopy(enm)
    galaz(bez_klucza, ref).pop("stan_obiektu")
    nieustalony = copy.deepcopy(bez_klucza)
    galaz(nieustalony, ref)["stan_obiektu"] = None
    istniejacy = copy.deepcopy(bez_klucza)
    galaz(istniejacy, ref)["stan_obiektu"] = "ISTNIEJACY"
    assert hash_migawki_enm(bez_klucza) == hash_migawki_enm(nieustalony)
    odciski = {hash_migawki_enm(e) for e in (bez_klucza, enm, istniejacy)}
    assert len(odciski) == 3


def test_determinizm_operacji_stanu(siec: Any) -> None:
    enm, pola, _ = siec

    def odcisk() -> str:
        po = _oznacz_pole(enm, pola["OUT"], "ISTNIEJACY")
        return hashlib.sha256(json.dumps(po, sort_keys=True).encode()).hexdigest()

    assert odcisk() == odcisk()

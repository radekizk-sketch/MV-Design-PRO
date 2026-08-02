"""Znacznik pochodzenia katalogowego mówi, SKĄD wzięto dane (V12K-316, dług 4).

DEFEKT ZASTANY. `add_converter_source` zapisywało do migawki `catalog_namespace`
Z PAYLOADU (kreator OZE wysyła „CONVERTER"), a tabliczkę materializowało
z przestrzeni wynikającej z TECHNOLOGII (`ZRODLO_NN_PV`, `ZRODLO_NN_BESS`).
Migawka deklarowała więc kategorię katalogu, z której nie pochodziła ANI JEDNA
liczba tabliczki. Liczby pilnowała brama katalogowa (karta G), sam ślad
audytowy — nikt. Konsekwencje sięgały poza model: kontekst katalogowy przebiegu
(`application/analysis_run/catalog_context.py`) buduje z tego pola etykietę
`source_catalog_label` („CONVERTER:conv-pv-nn-0p5mw-0p4kv@2024.1"), którą
raporty analizy pokazują projektantowi jako pochodzenie danych.

KLASA, NIE INSTANCJA. Ten sam mechanizm („znacznik z żądania, wartość
z materializacji") siedział w całym module `domain_operations_v2`:

* `add_ct` / `add_vt` / `add_relay` / `add_nn_load` / `add_sn_bay` — przestrzeń
  z payloadu wybierała AKCESOR katalogu i była zapisywana do migawki, więc
  żądanie mogło skierować wyszukiwanie do cudzej kategorii;
* `add_shunt_compensator_sn` / `add_surge_arrester_sn` — materializacja pytała
  katalog WPROST (`get_shunt_capacitor_type`, `get_surge_arrester_type`), a do
  migawki szła kategoria z żądania: znacznik mógł wskazywać dowolną przestrzeń;
* aparat pola źródłowego (SN i nN) — ISTNIENIE sprawdzane w przestrzeni z
  żądania, a migawka zapisywała `APARAT_SN` na sztywno (rozjazd w drugą stronę);
* transformator blokowy DER i kabel przyłączeniowy DER — wiązanie z żądania
  wybierało kategorię, więc do gałęzi `type: cable` dało się zmaterializować
  typ linii napowietrznej.

KANON PO NAPRAWIE: przestrzeń katalogu wynika z RODZAJU elementu, który
operacja tworzy. Ta sama wartość wybiera pozycję w katalogu i trafia do migawki
jako znacznik pochodzenia; deklaracja payloadu nie ma wpływu na żadną z tych
dwóch rzeczy. Element bez pozycji katalogowej NIE deklaruje kategorii.

Pilnowane własności:
(a) BRAMA — payload deklaruje kategorię X, materializacja znajduje pozycję w Y,
    migawka niesie Y i tabliczkę z Y (iloczyn cech: technologia × wariant
    przyłączenia × treść deklaracji);
(b) KLASA — każda funkcja modułu zapisująca znacznik ma pokrycie behawioralne
    albo jawne uzasadnienie (skan AST pilnuje kompletności listy);
(c) STRUKTURA — żadne wyrażenie zapisujące znacznik nie czyta payloadu
    (skan AST: dopuszczone są wyłącznie stałe przestrzeni i nazwy, które w tej
    samej funkcji pojechały do materializacji);
(d) UCZCIWY STAN ZEROWY — element bez pozycji katalogowej nie niesie kategorii.
"""

from __future__ import annotations

import ast
import copy
import inspect
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest

# KOLEJNOŚĆ IMPORTU JEST ISTOTNA: `domain_operations_v2` domyka cykl z
# `domain_operations` (v1 wciąga handlery V2 na końcu pliku), więc moduł V2
# zaimportowany PIERWSZY przewraca się na częściowo zainicjowanym module V1.
from enm.domain_operations import execute_domain_operation
from enm.domain_operations_v2 import (
    _PRZESTRZEN_ZRODLA_PRZEKSZTALTNIKOWEGO,
    _normalize_source_technology,
)
from network_model.catalog.types import CatalogNamespace

from tests.enm.test_brama_katalogowa_operacji_v2 import (
    REF_APARAT_NN,
    REF_APARAT_SN,
    REF_BESS,
    REF_CT,
    REF_FW,
    REF_KABEL_DER,
    REF_KOMPENSATOR,
    REF_ODBIOR,
    REF_OGRANICZNIK,
    REF_PRZEKAZNIK,
    REF_PV,
    REF_TRAFO_BLOKOWY,
    REF_VT,
    _payload_ct,
    _payload_konwerter_der_sn,
    _payload_zrodla,
    _pole_nn_ref,
    _pole_sn_ref,
    _siec_ze_stacja,
    _stacja_ref,
    _szyna_sn_ref,
    _wykonaj,
)

#: Kategoria CELOWO CUDZA wobec każdego badanego rodzaju elementu. Istnieje
#: w katalogu (jest w `CatalogNamespace`), więc odrzucenie nie może wziąć się
#: z „nieznanej kategorii" — musi wziąć się z tego, że payload nią nie rządzi.
OBCA_KATEGORIA = "LINIA_SN"

PRZESTRZENIE_KATALOGU = {czlon.value for czlon in CatalogNamespace}


def _wiazanie(catalog_ref: str, namespace: str = OBCA_KATEGORIA) -> dict[str, Any]:
    """Wiązanie wskazujące POPRAWNĄ pozycję pod CUDZĄ kategorią."""
    return {
        "catalog_namespace": namespace,
        "catalog_item_id": catalog_ref,
        "catalog_item_version": "2024.1",
        "materialize": True,
    }


# ---------------------------------------------------------------------------
# Payloady: poprawna pozycja katalogowa + CUDZA kategoria w deklaracji
# ---------------------------------------------------------------------------


def _payload_ct_obca(snapshot: dict[str, Any]) -> dict[str, Any]:
    return {
        "field_ref": _pole_sn_ref(snapshot),
        "catalog_binding": _wiazanie(REF_CT),
        "ratio_primary_a": 400.0,
        "ratio_secondary_a": 5.0,
    }


def _payload_vt_obca(snapshot: dict[str, Any]) -> dict[str, Any]:
    return {
        "field_ref": _pole_sn_ref(snapshot),
        "catalog_binding": _wiazanie(REF_VT),
        "ratio_primary_v": 15000.0,
        "ratio_secondary_v": 100.0,
    }


def _payload_relay_obca(snapshot: dict[str, Any]) -> dict[str, Any]:
    return {
        "field_ref": _pole_sn_ref(snapshot),
        "catalog_binding": _wiazanie(REF_PRZEKAZNIK),
        "relay_type": "NADPRADOWY",
    }


def _payload_sn_bay_obca(snapshot: dict[str, Any]) -> dict[str, Any]:
    return {
        "station_ref": _stacja_ref(snapshot),
        "bus_ref": _szyna_sn_ref(snapshot),
        "bay_role": "LINIA_OUT",
        "apparatus_kind": "BREAKER",
        "catalog_binding": _wiazanie(REF_APARAT_SN),
    }


def _payload_nn_load_obca(snapshot: dict[str, Any]) -> dict[str, Any]:
    return {
        "feeder_ref": _pole_nn_ref(snapshot),
        "active_power_kw": 30.0,
        "catalog_binding": _wiazanie(REF_ODBIOR),
    }


def _payload_konwerter_obca(snapshot: dict[str, Any]) -> dict[str, Any]:
    """Magazyn nN + pole źródłowe nN — obie kategorie zadeklarowane cudze."""
    return _payload_zrodla(
        snapshot,
        catalog_ref=REF_BESS,
        catalog_binding=_wiazanie(REF_BESS),
        placement="NEW_FIELD",
        source_field={
            "source_field_kind": "BESS",
            "field_name": "Pole magazynu nN",
            "catalog_binding": _wiazanie(REF_APARAT_NN),
        },
    )


def _payload_der_sn_obca(snapshot: dict[str, Any]) -> dict[str, Any]:
    """Tor DER-SN: cudza kategoria w falowniku, TR blokowym, kablu i aparacie pola."""
    payload = copy.deepcopy(_payload_konwerter_der_sn(snapshot))
    payload["catalog_binding"] = _wiazanie(REF_PV)
    topologia = payload["der_topology"]
    topologia["block_transformer"]["catalog_binding"] = _wiazanie(REF_TRAFO_BLOKOWY)
    konfiguracja = topologia["mv_field_configuration"]
    konfiguracja["apparatus_catalog_binding"] = _wiazanie(REF_APARAT_SN)
    konfiguracja["cable_catalog_binding"] = _wiazanie(REF_KABEL_DER)
    return payload


def _payload_kompensator_obca(snapshot: dict[str, Any]) -> dict[str, Any]:
    return {
        "station_ref": _stacja_ref(snapshot),
        "bus_ref": _szyna_sn_ref(snapshot),
        "catalog_binding": _wiazanie(REF_KOMPENSATOR),
    }


def _payload_ogranicznik_obca(snapshot: dict[str, Any]) -> dict[str, Any]:
    return {
        "station_ref": _stacja_ref(snapshot),
        "field_ref": _pole_sn_ref(snapshot),
        "catalog_binding": _wiazanie(REF_OGRANICZNIK),
    }


# ---------------------------------------------------------------------------
# Odczyt znaczników z migawki
# ---------------------------------------------------------------------------


def _jedyny(kolekcja: list[dict[str, Any]], opis: str) -> dict[str, Any]:
    assert len(kolekcja) == 1, f"Oczekiwano jednego elementu ({opis}), jest {len(kolekcja)}"
    return kolekcja[0]


def _po_tagu(snapshot: dict[str, Any], kolekcja: str, tag: str) -> dict[str, Any]:
    return _jedyny(
        [
            element
            for element in snapshot.get(kolekcja) or []
            if isinstance(element, dict) and tag in (element.get("tags") or [])
        ],
        f"{kolekcja}/{tag}",
    )


def _znacznik(element: dict[str, Any]) -> str | None:
    wartosc = element.get("catalog_namespace")
    return wartosc if isinstance(wartosc, str) else None


def _znaczniki_pomiaru(typ: str) -> Callable[[dict[str, Any]], dict[str, str | None]]:
    def _odczyt(snapshot: dict[str, Any]) -> dict[str, str | None]:
        pomiar = _jedyny(
            [m for m in snapshot.get("measurements") or [] if m.get("measurement_type") == typ],
            f"measurement/{typ}",
        )
        return {
            "element": _znacznik(pomiar),
            "meta.catalog_binding": (pomiar.get("meta") or {})
            .get("catalog_binding", {})
            .get("catalog_namespace"),
        }

    return _odczyt


def _znaczniki_zabezpieczenia(snapshot: dict[str, Any]) -> dict[str, str | None]:
    przypisanie = _jedyny(snapshot.get("protection_assignments") or [], "protection_assignment")
    return {
        "element": _znacznik(przypisanie),
        "meta.catalog_binding": (przypisanie.get("meta") or {})
        .get("catalog_binding", {})
        .get("catalog_namespace"),
    }


def _znaczniki_aparatu_pola_sn(snapshot: dict[str, Any]) -> dict[str, str | None]:
    aparat = _po_tagu(snapshot, "branches", "gpz_field_device")
    return {
        "element": _znacznik(aparat),
        "meta.catalog_binding": (aparat.get("meta") or {})
        .get("catalog_binding", {})
        .get("catalog_namespace"),
    }


def _znaczniki_odbioru(snapshot: dict[str, Any]) -> dict[str, str | None]:
    odbior = _jedyny(snapshot.get("loads") or [], "load")
    return {
        "element": _znacznik(odbior),
        "meta.catalog_binding": (odbior.get("meta") or {})
        .get("catalog_binding", {})
        .get("catalog_namespace"),
    }


def _pole_nn_zrodlowe(snapshot: dict[str, Any]) -> dict[str, Any]:
    for stacja in snapshot.get("substations") or []:
        for spec in (stacja.get("meta") or {}).get("nn_field_specs") or []:
            if "nn_source_field" in (spec.get("tags") or []):
                return spec
    raise AssertionError("Brak pola źródłowego nN w migawce")


def _znaczniki_konwertera(snapshot: dict[str, Any]) -> dict[str, str | None]:
    generator = _jedyny(snapshot.get("generators") or [], "generator")
    pole = _pole_nn_zrodlowe(snapshot)
    return {
        "generator": _znacznik(generator),
        "pole_nn.catalog_binding": ((pole.get("meta") or {}).get("catalog_binding") or {}).get(
            "catalog_namespace"
        ),
    }


def _znaczniki_der_sn(snapshot: dict[str, Any]) -> dict[str, str | None]:
    generator = _jedyny(snapshot.get("generators") or [], "generator")
    transformator = _po_tagu(snapshot, "transformers", "der_block_transformer")
    kabel = _po_tagu(snapshot, "branches", "der_mv_cable")
    aparat = _po_tagu(snapshot, "branches", "der_source_field_device")
    return {
        "generator": _znacznik(generator),
        "transformator_blokowy": _znacznik(transformator),
        "kabel_sn": _znacznik(kabel),
        "aparat_pola_sn": _znacznik(aparat),
        "aparat_pola_sn.meta.catalog_binding": (
            (aparat.get("meta") or {}).get("catalog_binding")
        ).get("catalog_namespace"),
    }


def _znaczniki_kompensatora(snapshot: dict[str, Any]) -> dict[str, str | None]:
    kompensator = _jedyny(snapshot.get("shunt_capacitors") or [], "shunt_capacitor")
    return {
        "element": _znacznik(kompensator),
        "meta.catalog_binding": (kompensator.get("meta") or {})
        .get("catalog_binding", {})
        .get("catalog_namespace"),
    }


def _znaczniki_ogranicznika(snapshot: dict[str, Any]) -> dict[str, str | None]:
    for stacja in snapshot.get("substations") or []:
        for spec in (stacja.get("meta") or {}).get("field_specs") or []:
            for ogranicznik in spec.get("surge_arresters") or []:
                return {"element": ogranicznik.get("catalog_namespace")}
    raise AssertionError("Brak ogranicznika przepięć w migawce")


# ---------------------------------------------------------------------------
# INWENTARZ ZNACZNIKÓW POCHODZENIA (reguła KLASA, NIE INSTANCJA)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ZnacznikPochodzenia:
    """Operacja zapisująca znacznik pochodzenia + dowód, że payload nim nie rządzi."""

    #: Identyfikator przypadku (jedna operacja może mieć dwa tory przyłączenia).
    etykieta: str
    #: Nazwa operacji domenowej do wywołania.
    operacja: str
    #: Funkcje modułu, które w tej operacji zapisują `catalog_namespace`.
    funkcje_zapisujace: tuple[str, ...]
    #: (migawka) → payload z POPRAWNĄ pozycją pod CUDZĄ kategorią.
    zbuduj: Callable[[dict[str, Any]], dict[str, Any]]
    #: (migawka po operacji) → {opis miejsca: zapisana przestrzeń}.
    odczytaj: Callable[[dict[str, Any]], dict[str, str | None]]
    #: Przestrzenie, w których materializacja NAPRAWDĘ szukała pozycji.
    oczekiwane: dict[str, str]
    #: Czy operacja wymaga wcześniejszego CT w polu (dobór zabezpieczenia).
    wymaga_ct: bool = False


ZNACZNIKI: tuple[ZnacznikPochodzenia, ...] = (
    ZnacznikPochodzenia(
        "add_ct",
        "add_ct",
        ("add_ct",),
        _payload_ct_obca,
        _znaczniki_pomiaru("CT"),
        {"element": "CT", "meta.catalog_binding": "CT"},
    ),
    ZnacznikPochodzenia(
        "add_vt",
        "add_vt",
        ("add_vt",),
        _payload_vt_obca,
        _znaczniki_pomiaru("VT"),
        {"element": "VT", "meta.catalog_binding": "VT"},
    ),
    ZnacznikPochodzenia(
        "add_relay",
        "add_relay",
        ("add_relay", "_relay_catalog_binding"),
        _payload_relay_obca,
        _znaczniki_zabezpieczenia,
        {"element": "ZABEZPIECZENIE", "meta.catalog_binding": "ZABEZPIECZENIE"},
        wymaga_ct=True,
    ),
    ZnacznikPochodzenia(
        "add_sn_bay",
        "add_sn_bay",
        ("add_sn_bay",),
        _payload_sn_bay_obca,
        _znaczniki_aparatu_pola_sn,
        {"element": "APARAT_SN", "meta.catalog_binding": "APARAT_SN"},
    ),
    ZnacznikPochodzenia(
        "add_nn_load",
        "add_nn_load",
        ("add_nn_load",),
        _payload_nn_load_obca,
        _znaczniki_odbioru,
        {"element": "OBCIAZENIE", "meta.catalog_binding": "OBCIAZENIE"},
    ),
    ZnacznikPochodzenia(
        "add_converter_source|nn_side",
        "add_converter_source",
        ("add_converter_source",),
        _payload_konwerter_obca,
        _znaczniki_konwertera,
        {"generator": "ZRODLO_NN_BESS", "pole_nn.catalog_binding": "APARAT_NN"},
    ),
    ZnacznikPochodzenia(
        "add_converter_source|der_sn",
        "add_converter_source",
        (
            "_add_converter_source_der_sn",
            "_materialize_der_block_transformer",
            "_materialize_der_mv_cable",
        ),
        _payload_der_sn_obca,
        _znaczniki_der_sn,
        {
            "generator": "ZRODLO_NN_PV",
            "transformator_blokowy": "TRAFO_SN_NN",
            "kabel_sn": "KABEL_SN",
            "aparat_pola_sn": "APARAT_SN",
            "aparat_pola_sn.meta.catalog_binding": "APARAT_SN",
        },
    ),
    ZnacznikPochodzenia(
        "add_shunt_compensator_sn",
        "add_shunt_compensator_sn",
        ("add_shunt_compensator_sn",),
        _payload_kompensator_obca,
        _znaczniki_kompensatora,
        {"element": "KOMPENSATOR_SN", "meta.catalog_binding": "KOMPENSATOR_SN"},
    ),
    ZnacznikPochodzenia(
        "add_surge_arrester_sn",
        "add_surge_arrester_sn",
        ("add_surge_arrester_sn",),
        _payload_ogranicznik_obca,
        _znaczniki_ogranicznika,
        {"element": "OGRANICZNIK_SN"},
    ),
)

#: Funkcje modułu, które zapisują `catalog_namespace`, ale NIE tworzą elementu:
#: są wspólnym normalizatorem wołanym przez operacje z inwentarza. Pokrycie mają
#: pośrednie (każdy przypadek wyżej przechodzi przez nie), a bezpośredniego nie
#: da się zbudować — nie ma operacji, którą dałoby się wywołać „samym helperem".
POMOCNICZE_BEZ_WLASNEJ_OPERACJI: dict[str, str] = {
    "_catalog_binding_from_payload": (
        "normalizator wiązania payloadu — sprowadza kategorię do przestrzeni rodzaju "
        "elementu dla WSZYSTKICH operacji atomowych"
    ),
    "_wiazanie_w_przestrzeni": (
        "ta sama normalizacja dla wiązań przekazywanych dalej (aparat pola, TR blokowy, "
        "kabel DER), gdzie payload nie przechodzi przez _catalog_binding_from_payload"
    ),
    "_materialize_nn_source_params": (
        "buduje CatalogBinding materializacji źródła nN z przestrzeni podanej przez "
        "wołającego — kategoria wchodzi parametrem, nie z payloadu"
    ),
}


def _migawka_dla(przypadek: ZnacznikPochodzenia) -> dict[str, Any]:
    snapshot = _siec_ze_stacja()
    if przypadek.wymaga_ct:
        snapshot = _wykonaj(snapshot, "add_ct", _payload_ct(snapshot))
    return snapshot


PRZYPADKI = [pytest.param(p, id=p.etykieta) for p in ZNACZNIKI]


# ---------------------------------------------------------------------------
# (a) BRAMA — kategoria z żądania nie trafia do migawki
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("przypadek", PRZYPADKI)
def test_kategoria_z_zadania_nie_trafia_do_migawki(przypadek: ZnacznikPochodzenia) -> None:
    """Payload deklaruje kategorię X, materializacja znajduje pozycję w Y ⇒ migawka niesie Y."""
    snapshot = _migawka_dla(przypadek)

    wynik = execute_domain_operation(snapshot, przypadek.operacja, przypadek.zbuduj(snapshot))
    assert not wynik.get("error"), (
        f"{przypadek.etykieta}: {wynik.get('error')} ({wynik.get('error_code')}). "
        "Kategoria z żądania nie może sterować wyszukiwaniem pozycji."
    )

    zapisane = przypadek.odczytaj(wynik["snapshot"])
    assert zapisane == przypadek.oczekiwane, (
        f"{przypadek.etykieta}: migawka niesie kategorię z żądania "
        f"('{OBCA_KATEGORIA}') zamiast przestrzeni, w której materializacja "
        "znalazła pozycję"
    )


@pytest.mark.parametrize("przypadek", PRZYPADKI)
def test_znacznik_jest_realna_kategoria_katalogu(przypadek: ZnacznikPochodzenia) -> None:
    """Każdy zapisany znacznik jest członem `CatalogNamespace` (zero fabrykacji nazw)."""
    for miejsce, przestrzen in przypadek.oczekiwane.items():
        assert przestrzen in PRZESTRZENIE_KATALOGU, f"{przypadek.etykieta}/{miejsce}"


def _bez_deklaracji_kategorii(wartosc: Any) -> Any:
    """Ten sam payload BEZ zadeklarowanej kategorii (rekurencyjnie, w całej strukturze)."""
    if isinstance(wartosc, dict):
        return {
            klucz: _bez_deklaracji_kategorii(podwartosc)
            for klucz, podwartosc in wartosc.items()
            if not (klucz == "catalog_namespace" and podwartosc == OBCA_KATEGORIA)
        }
    if isinstance(wartosc, list):
        return [_bez_deklaracji_kategorii(element) for element in wartosc]
    return wartosc


@pytest.mark.parametrize("przypadek", PRZYPADKI)
def test_deklaracja_kategorii_nie_zmienia_modelu(przypadek: ZnacznikPochodzenia) -> None:
    """Mocniejsza wersja bramy: kategoria z żądania nie zmienia w migawce NICZEGO.

    Sam znacznik to za mało — kategoria z payloadu potrafiła wpłynąć na model
    bocznymi drogami (wiązanie zapisane w meta pola, materializacja prądu
    znamionowego aparatu do kaskady prądowej). Porównanie CAŁYCH migawek łapie
    każdą taką drogę naraz, także tę, której nikt nie przewidział.
    """
    snapshot = _migawka_dla(przypadek)
    payload = przypadek.zbuduj(snapshot)

    z_obca = execute_domain_operation(snapshot, przypadek.operacja, payload)
    bez_deklaracji = execute_domain_operation(
        snapshot, przypadek.operacja, _bez_deklaracji_kategorii(payload)
    )

    assert not z_obca.get("error"), f"{przypadek.etykieta}: {z_obca.get('error')}"
    assert not bez_deklaracji.get("error"), f"{przypadek.etykieta}: {bez_deklaracji.get('error')}"
    assert z_obca["snapshot"] == bez_deklaracji["snapshot"], (
        f"{przypadek.etykieta}: kategoria zadeklarowana w żądaniu zmienia model "
        "(znacznik nie jest jedyną drogą, którą deklaracja wchodzi do migawki)"
    )
    assert z_obca["readiness"] == bez_deklaracji["readiness"], (
        f"{przypadek.etykieta}: kategoria z żądania zmienia werdykt gotowości "
        "(np. ogniwo kaskady prądowej znika po cichu)"
    )


# ---------------------------------------------------------------------------
# (a2) ILOCZYN CECH: technologia × wariant przyłączenia × treść deklaracji
# ---------------------------------------------------------------------------


#: Technologia → (pozycja katalogowa, przestrzeń materializacji, pole tabliczki,
#: wartość tego pola W TEJ przestrzeni). Ostatnia para jest istotna: dowodzi, że
#: znacznik i tabliczka pochodzą z TEJ SAMEJ pozycji katalogu, a nie że akurat
#: zgadza się nazwa kategorii.
TECHNOLOGIE: tuple[tuple[str, str, str, str, float], ...] = (
    ("PV", REF_PV, "ZRODLO_NN_PV", "sn_mva", 0.55),
    ("BESS", REF_BESS, "ZRODLO_NN_BESS", "sn_mva", 2.2),
    ("FW", REF_FW, "CONVERTER", "sn_mva", 2.2),
)

#: Trzy sposoby, na jakie kreator może (nie) zadeklarować kategorii. Żaden nie
#: może zmienić tego, co trafi do migawki.
DEKLARACJE: tuple[tuple[str, str | None], ...] = (
    ("obca", OBCA_KATEGORIA),
    ("kreator_oze", "CONVERTER"),
    ("brak", None),
)


@pytest.mark.parametrize(
    ("technologia", "pozycja", "przestrzen", "pole", "wartosc"),
    [pytest.param(*wiersz, id=wiersz[0]) for wiersz in TECHNOLOGIE],
)
@pytest.mark.parametrize(
    ("opis_deklaracji", "deklarowana"),
    [pytest.param(*wiersz, id=wiersz[0]) for wiersz in DEKLARACJE],
)
def test_znacznik_i_tabliczka_z_tej_samej_pozycji(
    technologia: str,
    pozycja: str,
    przestrzen: str,
    pole: str,
    wartosc: float,
    opis_deklaracji: str,
    deklarowana: str | None,
) -> None:
    """Znacznik pochodzenia == przestrzeń, z której przyszła tabliczka — dla KAŻDEJ technologii."""
    snapshot = _siec_ze_stacja()
    nadpisania: dict[str, Any] = {}
    if deklarowana is not None:
        nadpisania["catalog_binding"] = _wiazanie(pozycja, deklarowana)

    wynik = execute_domain_operation(
        snapshot,
        "add_converter_source",
        _payload_zrodla(snapshot, catalog_ref=pozycja, technologia=technologia, **nadpisania),
    )
    assert not wynik.get("error"), f"{technologia}/{opis_deklaracji}: {wynik.get('error')}"

    generator = _jedyny(wynik["snapshot"]["generators"], "generator")
    assert generator["catalog_namespace"] == przestrzen, (
        f"{technologia}/{opis_deklaracji}: znacznik pochodzenia deklaruje "
        f"'{generator['catalog_namespace']}', a tabliczka przyszła z '{przestrzen}'"
    )
    tabliczka = generator["materialized_params"]
    assert tabliczka["catalog_item_id"] == pozycja
    assert tabliczka[pole] == pytest.approx(wartosc), (
        f"{technologia}/{opis_deklaracji}: tabliczka nie pochodzi z pozycji "
        f"'{pozycja}' w przestrzeni '{przestrzen}'"
    )


def test_deklaracja_kategorii_nie_zmienia_niczego_w_modelu() -> None:
    """Tor DER-SN: payload z cudzą kategorią daje BIT W BIT ten sam model.

    Nie wystarczy, że znacznik jest właściwy — deklaracja nie może zmieniać
    NICZEGO. Ogniwo, które to łamało: prąd znamionowy aparatu pola
    (`_resolve_apparatus_rated_current_a`) czytał katalog w kategorii z żądania,
    więc przy cudzej deklaracji pozycji nie znajdował i kaskada prądowa
    (In pola) znikała CICHO — operacja kończyła się sukcesem, a ostrzeżenia
    liczyły się z niepełnego łańcucha. Docstring obiecywał coś odwrotnego,
    więc obietnica dostaje tu przypięty test.
    """
    snapshot = _siec_ze_stacja()

    kanoniczny = execute_domain_operation(
        snapshot, "add_converter_source", _payload_konwerter_der_sn(snapshot)
    )
    z_obca = execute_domain_operation(
        snapshot, "add_converter_source", _payload_der_sn_obca(snapshot)
    )

    assert not kanoniczny.get("error"), kanoniczny.get("error")
    assert not z_obca.get("error"), z_obca.get("error")
    assert z_obca["snapshot"] == kanoniczny["snapshot"]
    assert z_obca["readiness"] == kanoniczny["readiness"]


def test_tor_der_sn_niesie_te_sama_przestrzen_co_tor_nn() -> None:
    """Ten sam falownik PV, dwa warianty przyłączenia — jeden znacznik pochodzenia."""
    snapshot = _siec_ze_stacja()

    nn = execute_domain_operation(
        snapshot,
        "add_converter_source",
        _payload_zrodla(
            snapshot,
            catalog_ref=REF_PV,
            technologia="PV",
            catalog_binding=_wiazanie(REF_PV),
        ),
    )
    assert not nn.get("error"), nn.get("error")

    sn = execute_domain_operation(snapshot, "add_converter_source", _payload_der_sn_obca(snapshot))
    assert not sn.get("error"), sn.get("error")

    znacznik_nn = _jedyny(nn["snapshot"]["generators"], "generator")["catalog_namespace"]
    znacznik_sn = _jedyny(sn["snapshot"]["generators"], "generator")["catalog_namespace"]
    assert znacznik_nn == znacznik_sn == "ZRODLO_NN_PV"


# ---------------------------------------------------------------------------
# (d) UCZCIWY STAN ZEROWY — brak pozycji katalogowej = brak kategorii
# ---------------------------------------------------------------------------


def test_odbior_ekspercki_nie_deklaruje_kategorii_katalogu() -> None:
    """Odbiór bez pozycji katalogowej nie może nieść `catalog_namespace`.

    Kontekst katalogowy przebiegu wciąga element do zestawienia, gdy ma
    JAKIKOLWIEK znacznik pochodzenia — odbiór ekspercki trafiał tam z etykietą
    „OBCIAZENIE" bez pozycji, czyli z kategorią, z której nic nie pochodziło.
    """
    snapshot = _siec_ze_stacja()
    wynik = execute_domain_operation(
        snapshot,
        "add_nn_load",
        {"feeder_ref": _pole_nn_ref(snapshot), "active_power_kw": 12.0},
    )

    assert not wynik.get("error"), wynik.get("error")
    odbior = _jedyny(wynik["snapshot"]["loads"], "load")
    assert odbior.get("catalog_ref") is None
    assert odbior.get("source_mode") == "EKSPERCKI_RECZNY"
    assert odbior.get("catalog_namespace") is None


def test_pole_sn_bez_aparatu_nie_deklaruje_pochodzenia_katalogowego() -> None:
    """Pole SN czekające na wskazanie aparatu (`requires_catalog_binding`).

    Gałąź aparatu deklarowała `source_mode: KATALOG` i kategorię APARAT_SN, choć
    żadna pozycja katalogu za nią nie stała — ten sam element w torze DER-SN
    zapisywał w tej sytuacji `None` (niespójność w obrębie jednego modułu).
    """
    snapshot = _siec_ze_stacja()
    wynik = execute_domain_operation(
        snapshot,
        "add_sn_bay",
        {
            "station_ref": _stacja_ref(snapshot),
            "bus_ref": _szyna_sn_ref(snapshot),
            "bay_role": "LINIA_OUT",
            "apparatus_kind": "BREAKER",
        },
    )

    assert not wynik.get("error"), wynik.get("error")
    aparat = _po_tagu(wynik["snapshot"], "branches", "requires_catalog_binding")
    assert aparat.get("catalog_ref") is None
    assert aparat.get("catalog_namespace") is None
    assert aparat.get("source_mode") is None


# ---------------------------------------------------------------------------
# (b) KLASA — skan modułu: żadne miejsce zapisu znacznika nie omija inwentarza
# ---------------------------------------------------------------------------


def _drzewo_modulu() -> ast.Module:
    zrodlo = Path(inspect.getfile(_normalize_source_technology)).read_text(encoding="utf-8")
    return ast.parse(zrodlo)


def _wyrazenia_znacznika(funkcja: ast.FunctionDef) -> list[ast.expr]:
    """Wszystkie wyrażenia, których wartość ląduje w polu `catalog_namespace`.

    Trzy kanały zapisu: klucz słownika (`{"catalog_namespace": ...}`), przypisanie
    do indeksu (`element["catalog_namespace"] = ...`) i argument nazwany
    (`CatalogBinding(catalog_namespace=...)`). Pominięcie któregokolwiek zostawia
    kanał, którym znacznik wróciłby z payloadu.
    """
    wyrazenia: list[ast.expr] = []
    for wezel in ast.walk(funkcja):
        if isinstance(wezel, ast.Dict):
            for klucz, wartosc in zip(wezel.keys, wezel.values, strict=True):
                if isinstance(klucz, ast.Constant) and klucz.value == "catalog_namespace":
                    wyrazenia.append(wartosc)
        elif isinstance(wezel, ast.Assign):
            for cel in wezel.targets:
                if (
                    isinstance(cel, ast.Subscript)
                    and isinstance(cel.slice, ast.Constant)
                    and cel.slice.value == "catalog_namespace"
                ):
                    wyrazenia.append(wezel.value)
        elif isinstance(wezel, ast.Call):
            for argument in wezel.keywords:
                if argument.arg == "catalog_namespace":
                    wyrazenia.append(argument.value)
    return wyrazenia


def _funkcje_zapisujace_znacznik() -> dict[str, list[ast.expr]]:
    znalezione: dict[str, list[ast.expr]] = {}
    for wezel in ast.walk(_drzewo_modulu()):
        if not isinstance(wezel, ast.FunctionDef):
            continue
        wyrazenia = _wyrazenia_znacznika(wezel)
        if wyrazenia:
            znalezione[wezel.name] = wyrazenia
    return znalezione


def test_kazda_funkcja_zapisujaca_znacznik_ma_pokrycie() -> None:
    """Skan klasy: nowe miejsce zapisu znacznika zapala test, zanim trafi do modelu."""
    z_modulu = set(_funkcje_zapisujace_znacznik())
    z_inwentarza = {nazwa for p in ZNACZNIKI for nazwa in p.funkcje_zapisujace}
    pokryte = z_inwentarza | set(POMOCNICZE_BEZ_WLASNEJ_OPERACJI)

    assert len(z_modulu) > 10, "Skan stracił kotwicę — moduł nie ma miejsc zapisu znacznika"
    assert z_modulu <= pokryte, (
        "Funkcja zapisuje znacznik pochodzenia bez pokrycia w inwentarzu: "
        f"{sorted(z_modulu - pokryte)}"
    )
    assert pokryte <= z_modulu, (
        "Inwentarz wymienia funkcje, które znacznika już nie zapisują: "
        f"{sorted(pokryte - z_modulu)}"
    )


def test_pomocnicze_bez_operacji_maja_uzasadnienie_merytoryczne() -> None:
    """Miejsce świadomie bez własnego przypadku wymaga uzasadnienia, nie milczenia."""
    for nazwa, uzasadnienie in POMOCNICZE_BEZ_WLASNEJ_OPERACJI.items():
        assert len(uzasadnienie) > 60, f"{nazwa}: uzasadnienie zdawkowe"


# ---------------------------------------------------------------------------
# (c) STRUKTURA — wyrażenie zapisujące znacznik nie czyta payloadu
# ---------------------------------------------------------------------------


#: Jedyne dopuszczone źródło znacznika inne niż stała: mapa technologia →
#: przestrzeń, z której korzysta TA SAMA materializacja.
MAPA_PRZESTRZENI = "_PRZESTRZEN_ZRODLA_PRZEKSZTALTNIKOWEGO"


def _stale_przestrzeni_modulu() -> dict[str, str]:
    """Stałe modułu o wartości będącej realną kategorią katalogu."""
    stale: dict[str, str] = {}
    for wezel in _drzewo_modulu().body:
        if not isinstance(wezel, ast.Assign) or not isinstance(wezel.value, ast.Constant):
            continue
        if wezel.value.value in PRZESTRZENIE_KATALOGU:
            for cel in wezel.targets:
                if isinstance(cel, ast.Name):
                    stale[cel.id] = str(wezel.value.value)
    return stale


def _zrodla_nazwy(funkcja: ast.FunctionDef, nazwa: str) -> list[ast.expr | None]:
    """Wszystkie wartości, jakie nazwa może przyjąć w tej funkcji.

    ``None`` oznacza parametr funkcji (przestrzeń podana przez wołającego).
    """
    zrodla: list[ast.expr | None] = []
    argumenty = funkcja.args
    wszystkie_parametry = [*argumenty.posonlyargs, *argumenty.args, *argumenty.kwonlyargs]
    if any(parametr.arg == nazwa for parametr in wszystkie_parametry):
        zrodla.append(None)
    for wezel in ast.walk(funkcja):
        if isinstance(wezel, ast.Assign):
            for cel in wezel.targets:
                if isinstance(cel, ast.Name) and cel.id == nazwa:
                    zrodla.append(wezel.value)
    return zrodla


def _opis(wyrazenie: ast.expr) -> str:
    return ast.dump(wyrazenie)[:160]


def _sprawdz_wyrazenie(
    funkcja: ast.FunctionDef,
    wyrazenie: ast.expr,
    stale_modulu: dict[str, str],
) -> None:
    """Wyrażenie znacznika: stała przestrzeni, ``None``, nazwa albo wybór z nich."""
    if isinstance(wyrazenie, ast.Constant):
        assert wyrazenie.value is None or wyrazenie.value in PRZESTRZENIE_KATALOGU, (
            f"{funkcja.name}: znacznik pochodzenia ustawiony na wartość spoza "
            f"`CatalogNamespace`: {wyrazenie.value!r}"
        )
        return
    if isinstance(wyrazenie, ast.IfExp):
        _sprawdz_wyrazenie(funkcja, wyrazenie.body, stale_modulu)
        _sprawdz_wyrazenie(funkcja, wyrazenie.orelse, stale_modulu)
        return
    assert isinstance(wyrazenie, ast.Name), (
        f"{funkcja.name}: znacznik pochodzenia wyliczany wyrażeniem, które może "
        f"czytać payload: {_opis(wyrazenie)}"
    )
    if wyrazenie.id in stale_modulu:
        return
    zrodla = _zrodla_nazwy(funkcja, wyrazenie.id)
    assert zrodla, (
        f"{funkcja.name}: znacznik z nazwy '{wyrazenie.id}' o nierozpoznanym "
        "źródle (ani parametr, ani przypisanie w tej funkcji)"
    )
    for zrodlo in zrodla:
        if zrodlo is None:
            continue  # parametr — przestrzeń podana przez wołającego
        if (
            isinstance(zrodlo, ast.Subscript)
            and isinstance(zrodlo.value, ast.Name)
            and zrodlo.value.id == MAPA_PRZESTRZENI
        ):
            continue
        try:
            # Przypisanie ze stałej albo z innej nazwy o dopuszczonym źródle
            # (np. `catalog_namespace = _PRZESTRZEN_APARATU_POLA_SN`).
            _sprawdz_wyrazenie(funkcja, zrodlo, stale_modulu)
        except AssertionError as blad:
            raise AssertionError(
                f"{funkcja.name}: nazwa '{wyrazenie.id}' użyta jako znacznik pochodzenia "
                f"bierze wartość z wyrażenia spoza kanonu: {_opis(zrodlo)}"
            ) from blad


def test_znacznik_nie_powstaje_z_payloadu() -> None:
    """Skan struktury: znacznik to stała przestrzeni albo nazwa, która sterowała materializacją.

    To ta połowa dowodu, której nie da się zrobić przykładem: test behawioralny
    bada payloady, które ktoś przewidział, a ten zapala się na SAMĄ MOŻLIWOŚĆ
    wyliczenia znacznika z żądania (`_catalog_namespace(binding, ...)`,
    `payload.get(...)`, `binding["catalog_namespace"]`).
    """
    stale_modulu = _stale_przestrzeni_modulu()
    assert stale_modulu, "Skan stracił kotwicę — moduł nie ma stałych przestrzeni katalogu"

    zbadane = 0
    for wezel in ast.walk(_drzewo_modulu()):
        if not isinstance(wezel, ast.FunctionDef):
            continue
        for wyrazenie in _wyrazenia_znacznika(wezel):
            _sprawdz_wyrazenie(wezel, wyrazenie, stale_modulu)
            zbadane += 1
    assert zbadane > 15, f"Skan stracił kotwicę — zbadano tylko {zbadane} miejsc zapisu"


def test_mapa_przestrzeni_jest_jedynym_zrodlem_technologii() -> None:
    """Predykat wejścia (dopuszczone technologie) i wyjścia (przestrzeń) z jednego źródła.

    Dwa niezależne zbiory „dziś zgodne" to defekt czekający na daną brzegową:
    technologia przyjęta przez `_normalize_source_technology`, a nieobecna
    w mapie, wywróciłaby handler; obecna w mapie, a nieprzyjęta — dałaby martwą
    gałąź katalogu.
    """
    mapa = _PRZESTRZEN_ZRODLA_PRZEKSZTALTNIKOWEGO
    assert set(mapa) == {"PV", "BESS", "FW"}
    assert set(mapa.values()) <= PRZESTRZENIE_KATALOGU

    for technologia in mapa:
        assert (
            _normalize_source_technology({"source_technology": technologia.lower()}) == technologia
        )
    assert _normalize_source_technology({"source_technology": "WIATR"}) is None

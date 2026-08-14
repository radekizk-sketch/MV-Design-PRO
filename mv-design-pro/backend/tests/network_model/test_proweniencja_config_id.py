"""Identyfikator konfiguracji pola (`config_id`) NIE FABRYKUJE pochodzenia.

Karta K-L PROWENIENCJA-CONFIG-ID — dług z odbioru K-K. Do tej karty
`config_ref_for_template` doklejała prefiks `kanoniczny:` KAŻDEJ referencji, więc
pole wybrane z katalogu producenta dostawało identyfikator
`kanoniczny:ZPUE_WLOSZCZOWA__RELF__LINE_OUT` — twierdzący, że konfiguracja
pochodzi z kanonu, choć pochodziła z rodziny rozdzielnicy konkretnego wytwórcy.
Wartość jest kluczem nieprzezroczystym (frontend jej nie parsuje — pin niżej),
więc dług nie miał skutku funkcjonalnego; miał skutek dowodowy: pochodzenie
konfiguracji było zmyślone w danych, które lądują w migawce ENM i w meta sceny
SLD, a więc i w materiale dowodowym projektu.

ILOCZYN CECH (reguła KLASA, NIE INSTANCJA §2) — testy poniżej pokrywają:
{katalogowe pole rodziny (85 pól × 17 rodzin × 5 producentów)}
× {kanoniczny szablon pola (10)}
× {kanoniczny fallback `CANONICAL_FALLBACK__*` (10)}
× {referencja nieznana katalogowi}
× {wywołanie jednostkowe · realna ścieżka użytkownika: pole GPZ i pole stacji
   wciętej w odcinek},
a nie tylko przykład wymieniony w karcie (RELF LINE_OUT).

PREDYKATY PARAMI (§3). O nomenklaturze referencji rozstrzyga KATALOG, i to tym
samym zapytaniem w obu miejscach: `config_ref_for_template` pyta rejestr pól
rodzin o producenta, a resolver aparatów pola (`enm.pole_katalogowe`
`pole_katalogowe`) o ten sam rejestr pyta, wybierając ścieżkę materializacji.
`test_prefiks_i_sciezka_materializacji_z_jednego_zrodla` pilnuje tej pary:
gdyby ktoś dorobił drugi, niezależny warunek („referencja z podkreśleniami to
producent"), identyfikator zacząłby kłamać na pierwszej danej brzegowej —
dokładnie tak, jak kłamał przed tą kartą.

BRAK ZGŁOSZONY PRZEZ TĘ KARTĘ, DOMKNIĘTY W K-M (2026-08-14).
`append_station_on_endpoint` (stacja dokładana na KOŃCU ciągu) składa
`field_spec` RĘCZNIE, z pominięciem wspólnego buildera `_build_field_spec`, więc
NIE zapisywał klucza `config_id` w ogóle — pole niosło referencję szablonu
i komplet aparatów, ale bez tożsamości konfiguracji (pomiar: 11. miejsce klasy
z odbioru K-K). Brak leżał w `enm/domain_operations.py`, pliku, który TA karta
miała wyłącznie do odczytu, więc został zgłoszony zamiast naprawiony tutaj;
domknęła go równoległa karta K-M tym samym producentem identyfikatora
(`config_ref_for_template`), bez drugiej reguły nazewnictwa. Lista
`TORY_Z_CONFIG_ID` niżej wymienia od tego momentu TRZY tory i testy realnej
ścieżki obejmują tor końca ciągu bez żadnej innej zmiany — dokładnie tak, jak
zapowiadał punkt wpięcia. Testu utrwalającego ówczesny brak świadomie NIE BYŁO:
przypięcie defektu jako oczekiwania jest gorsze niż defekt.
"""

from __future__ import annotations

from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from enm.pole_katalogowe import pole_katalogowe
from network_model.catalog.bay_templates import (
    BAY_TEMPLATE_REGISTRY,
    config_ref_for_mv_source,
    config_ref_for_template,
)
from network_model.catalog.switchgear import (
    CANONICAL_FALLBACK_REGISTRY,
    list_switchgear_solution_templates_for_manufacturer,
)
from reference_engine.field_configuration_catalog import enumerate_field_configurations

CATALOG_ZRODLO_SN = "src-gpz-15kv-250mva-rx010"
CATALOG_APARAT_SN = "sw-cb-abb-vd4-17kv-630a"
CATALOG_TRAFO = "tr-sn-nn-15-04-630kva-dyn11"

#: Rodzina MODULARNA (rozdzielnica pierwotna) — jedyny tor dopuszczony dla pól
#: GPZ/stacyjnych budowanych pojedynczą celką (rozstrzygnięcie architekta K-K).
RODZINA_MODULARNA = "ZPUE_WLOSZCZOWA__RELF"
POLE_RODZINY = "ZPUE_WLOSZCZOWA__RELF__LINE_OUT"
#: Kanoniczny szablon pola — druga nomenklatura tej samej referencji.
POLE_KANONICZNE = "bay_template_line_out"
#: Referencja, której katalog nie zna w ŻADNEJ nomenklaturze.
POLE_NIEZNANE = "tpl-line-out"


def _pola_rodzin() -> list[Any]:
    """Wszystkie katalogowe pola rodzin oferowanych (klasa, nie przykład)."""
    return list_switchgear_solution_templates_for_manufacturer(None)


def _wszystkie_referencje() -> list[str]:
    """Pełna dziedzina wejścia funkcji: obie nomenklatury + fallback + nieznana."""
    referencje = [szablon.template_ref for szablon in _pola_rodzin()]
    referencje.extend(BAY_TEMPLATE_REGISTRY)
    referencje.extend(CANONICAL_FALLBACK_REGISTRY)
    referencje.append(POLE_NIEZNANE)
    return referencje


# ---------------------------------------------------------------------------
# Cecha 1: katalogowe pole rodziny → pochodzenie producenta, NIGDY „kanoniczny:"
# ---------------------------------------------------------------------------


def test_kazde_katalogowe_pole_rodziny_niesie_pochodzenie_producenta() -> None:
    """PIN KARTY po CAŁEJ klasie: żadne z pól rodzin nie dostaje `kanoniczny:`.

    Człon producenta pochodzi z DANEJ katalogowej (`manufacturer_ref` rodziny),
    nie z parsowania nazwy referencji — dlatego oczekiwanie budujemy z katalogu.
    """
    pola = _pola_rodzin()
    assert pola, "katalog rodzin nie oferuje ani jednego pola — test bez przedmiotu"
    for szablon in pola:
        config_ref = config_ref_for_template(szablon.template_ref)
        assert config_ref == (
            f"producent:{szablon.manufacturer_ref}:{szablon.template_ref}"
        ), szablon.template_ref
        assert not config_ref.startswith("kanoniczny:"), szablon.template_ref


def test_pola_rodzin_pokrywaja_wszystkich_producentow_i_rodziny() -> None:
    """Zapadka zakresu klasy: gdyby rejestr pól rodzin skurczył się do jednej
    rodziny, test wyżej przechodziłby na próbce zamiast na klasie."""
    pola = _pola_rodzin()
    producenci = {szablon.manufacturer_ref for szablon in pola}
    rodziny = {szablon.switchgear_family_ref for szablon in pola}
    assert len(producenci) >= 4, sorted(str(p) for p in producenci)
    assert len(rodziny) >= 10, sorted(str(r) for r in rodziny)
    assert all(szablon.manufacturer_ref for szablon in pola)


# ---------------------------------------------------------------------------
# Cecha 2: nomenklatura kanoniczna (szablon, fallback, referencja nieznana)
# ---------------------------------------------------------------------------


def test_kazdy_kanoniczny_szablon_zostaje_kanoniczny() -> None:
    """Referencje kanoniczne bez zmiany zachowania — bajtowo jak przed kartą."""
    assert BAY_TEMPLATE_REGISTRY
    for template_id in BAY_TEMPLATE_REGISTRY:
        config_ref = config_ref_for_template(template_id)
        assert config_ref == f"kanoniczny:{template_id}"
        assert not config_ref.startswith("producent:")


def test_kanoniczny_fallback_i_referencja_nieznana_ida_torem_kanonicznym() -> None:
    """Fallback ogólny (`CANONICAL_FALLBACK__*`) NIE pochodzi od producenta —
    ma `manufacturer_ref=None` z definicji, więc twierdzenie o producencie
    byłoby tu tą samą fabrykacją. Referencja nieznana katalogowi idzie tą samą,
    kanoniczną ścieżką co w resolverze aparatów pola."""
    assert CANONICAL_FALLBACK_REGISTRY
    for template_ref, szablon in CANONICAL_FALLBACK_REGISTRY.items():
        assert szablon.manufacturer_ref is None, template_ref
        assert config_ref_for_template(template_ref) == f"kanoniczny:{template_ref}"
    assert config_ref_for_template(POLE_NIEZNANE) == f"kanoniczny:{POLE_NIEZNANE}"


def test_pole_zrodlowe_sn_pozostaje_kanoniczne() -> None:
    """Uczciwość w obrębie modułu (§5): druga funkcja identyfikatora w tym samym
    pliku dotyczy konfiguracji WYPROWADZONEJ Z KANONU (W2b), nie z katalogu
    producenta — jej prefiks jest prawdziwy i zostaje bez zmian."""
    assert config_ref_for_mv_source("CB") == "kanoniczny:mv_source_cb"
    assert config_ref_for_mv_source("LBS") == "kanoniczny:mv_source_lbs"


# ---------------------------------------------------------------------------
# Cecha 3: predykaty parami + rozłączność przestrzeni nazw + determinizm
# ---------------------------------------------------------------------------


def test_prefiks_i_sciezka_materializacji_z_jednego_zrodla() -> None:
    """PREDYKATY PARAMI: prefiks `producent:` pojawia się DOKŁADNIE wtedy, gdy
    resolver aparatów pola uzna referencję za katalogowe pole rodziny. Dwa
    niezależne warunki rozjechałyby się na pierwszej danej brzegowej."""
    for referencja in _wszystkie_referencje():
        katalogowe = pole_katalogowe(referencja) is not None
        producenckie = config_ref_for_template(referencja).startswith("producent:")
        assert katalogowe == producenckie, referencja


def test_przestrzenie_nazw_obu_nomenklatur_sa_rozlaczne() -> None:
    """Żadna referencja rodziny nie jest jednocześnie kanonicznym szablonem —
    inaczej ta sama referencja miałaby dwa różne, sprzeczne pochodzenia."""
    rodziny = {szablon.template_ref for szablon in _pola_rodzin()}
    assert not (rodziny & set(BAY_TEMPLATE_REGISTRY))
    assert not (rodziny & set(CANONICAL_FALLBACK_REGISTRY))


def test_identyfikator_pola_rodziny_nie_koliduje_z_mostem_celek_producenckich() -> None:
    """Most celek producenckich (`reference_engine`) używa tego samego prefiksu
    z INNYM drugim członem (ref pakietu referencyjnego zamiast producenta).
    Zbiory identyfikatorów muszą pozostać rozłączne, bo `config_id` jest
    tożsamością konfiguracji, a nie etykietą."""
    katalog = enumerate_field_configurations()
    mostek = {wpis["config_ref"] for wpis in katalog["producer"]}
    pola_rodzin = {config_ref_for_template(s.template_ref) for s in _pola_rodzin()}
    assert mostek
    assert pola_rodzin
    assert not (mostek & pola_rodzin)


def test_identyfikator_jest_deterministyczny_i_stabilny() -> None:
    """Determinism Rule: ta sama referencja ⇒ ta sama wartość, także przy
    powtórnym wywołaniu (rejestr pól rodzin jest budowany leniwie i raz)."""
    for referencja in _wszystkie_referencje():
        assert config_ref_for_template(referencja) == config_ref_for_template(referencja)
    # Pin wartości nazwanej w karcie — zmiana nomenklatury ma być decyzją,
    # a nie skutkiem ubocznym refaktoru.
    assert (
        config_ref_for_template(POLE_RODZINY)
        == "producent:ZPUE_WLOSZCZOWA:ZPUE_WLOSZCZOWA__RELF__LINE_OUT"
    )
    assert config_ref_for_template(POLE_KANONICZNE) == "kanoniczny:bay_template_line_out"


# ---------------------------------------------------------------------------
# Cecha 4: REALNA ŚCIEŻKA UŻYTKOWNIKA — pole zapisane do migawki ENM
# ---------------------------------------------------------------------------


def _empty_enm() -> dict[str, Any]:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="proweniencja-config-id", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    )
    return enm.model_dump(mode="json")


def _enm_z_odcinkiem() -> dict[str, Any]:
    return {
        "header": {"name": "proweniencja-config-id"},
        "buses": [
            {"ref_id": "bus-a", "name": "A", "voltage_kv": 15.0},
            {"ref_id": "bus-b", "name": "B", "voltage_kv": 15.0},
        ],
        "branches": [
            {
                "ref_id": "seg-1",
                "name": "Odcinek",
                "type": "cable",
                "from_bus_ref": "bus-a",
                "to_bus_ref": "bus-b",
                "length_km": 1.0,
                "r_ohm": 0.2,
                "x_ohm": 0.1,
            }
        ],
        "transformers": [],
        "substations": [],
        "corridors": [],
    }


def _uruchom(tor: str, pole_ref: str, rodzina_ref: str | None) -> dict[str, Any]:
    """Realna ścieżka: operacja domenowa przez DYSPOZYTOR, tak jak woła ją API."""
    if tor == "gpz":
        payload: dict[str, Any] = {
            "source_name": "GPZ Proweniencja",
            "voltage_kv": 15.0,
            "catalog_ref": CATALOG_ZRODLO_SN,
            "sections_count": 1,
            "gpz_sections": [
                {
                    "order": 0,
                    "name": "Sekcja A",
                    "bays": [
                        {
                            "name": "Pole odplywowe 1",
                            "bay_role": "LINIA_ODG",
                            "bay_template_ref": pole_ref,
                        }
                    ],
                }
            ],
            "grounding": {"type": "resistor_grounded", "r_ohm": 12.0},
        }
        if rodzina_ref:
            payload["switchgear_family_ref"] = rodzina_ref
        return execute_domain_operation(_empty_enm(), "add_grid_source_sn", payload)
    if tor == "wciecie":
        pole: dict[str, Any] = {"field_role": "LINIA_OUT", "bay_template_ref": pole_ref}
        if rodzina_ref:
            pole["switchgear_family_ref"] = rodzina_ref
        return execute_domain_operation(
            _enm_z_odcinkiem(),
            "insert_station_on_segment_sn",
            {
                "segment_id": "seg-1",
                "station_type": "B",
                "insert_at": {"value": 0.5},
                "station": {"sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4},
                "sn_fields": [pole],
                "field_apparatus_catalog_ref": CATALOG_APARAT_SN,
                "transformer": {"create": True, "transformer_catalog_ref": CATALOG_TRAFO},
            },
        )
    if tor == "koniec_ciagu":
        # Trzeci tor: stacja dokładana na KOŃCU ciągu. Składa `field_spec`
        # RĘCZNIE (z pominięciem `_build_field_spec`), więc to on gubił
        # `config_id` — tożsamość konfiguracji musi tu wyjść ta sama, co
        # w torze wspólnego buildera dla tego samego wskazania katalogowego.
        pole_konca: dict[str, Any] = {"field_role": "LINIA_OUT", "bay_template_ref": pole_ref}
        if rodzina_ref:
            pole_konca["switchgear_family_ref"] = rodzina_ref
        return execute_domain_operation(
            _enm_z_odcinkiem(),
            "append_station_on_endpoint",
            {
                "endpoint_bus_ref": "bus-b",
                "station": {
                    "name": "Stacja konca ciagu",
                    "station_type": "terminal",
                    "sn_voltage_kv": 15.0,
                    "nn_voltage_kv": 0.4,
                },
                "sn_fields": [pole_konca],
                "field_apparatus_catalog_ref": CATALOG_APARAT_SN,
                "transformer": {"create": True, "transformer_catalog_ref": CATALOG_TRAFO},
            },
        )
    raise AssertionError(f"Nieznany tor budowy pola: {tor}")


def _specs_z_referencja(odpowiedz: dict[str, Any], pole_ref: str) -> list[dict[str, Any]]:
    snapshot = odpowiedz.get("snapshot") or {}
    znalezione: list[dict[str, Any]] = []
    for stacja in snapshot.get("substations", []):
        meta = stacja.get("meta") or {}
        for klucz in ("field_specs", "nn_field_specs"):
            for spec in meta.get(klucz, []):
                if isinstance(spec, dict) and spec.get("bay_template_ref") == pole_ref:
                    znalezione.append(spec)
    return znalezione


#: Tory budowy pola, w których referencja katalogowa jest osiągalna z payloadu
#: użytkownika I które zapisują `config_id` (inwentarz z odbioru K-K).
#: `koniec_ciagu` dołożony po domknięciu braku w `append_station_on_endpoint`
#: (karta K-M) — trzeci tor przechodzi te same testy realnej ścieżki, bez
#: żadnej innej zmiany, dokładnie jak zapowiadał punkt wpięcia K-L.
TORY_Z_CONFIG_ID = ["gpz", "wciecie", "koniec_ciagu"]


@pytest.mark.parametrize("tor", TORY_Z_CONFIG_ID)
def test_pole_z_katalogu_rodziny_zapisuje_pochodzenie_producenta_do_migawki(tor: str) -> None:
    """Dowód na realnej ścieżce: to, co ląduje w migawce ENM (i dalej w meta
    sceny SLD), niesie producenta, a nie zmyślony kanon."""
    odpowiedz = _uruchom(tor, POLE_RODZINY, RODZINA_MODULARNA)
    assert odpowiedz.get("error") in (None, ""), odpowiedz

    specs = _specs_z_referencja(odpowiedz, POLE_RODZINY)
    assert specs, f"tor {tor}: zadne pole nie niesie referencji {POLE_RODZINY}"
    for spec in specs:
        assert spec["config_id"] == "producent:ZPUE_WLOSZCZOWA:ZPUE_WLOSZCZOWA__RELF__LINE_OUT"
        # Tożsamość konfiguracji i wyposażenie pochodzą z tego samego wyboru
        # katalogowego — pole z producenckim `config_id` bez aparatów byłoby
        # identyfikatorem bez przedmiotu.
        assert spec.get("primary_devices")


@pytest.mark.parametrize("tor", TORY_Z_CONFIG_ID)
def test_pole_z_kanonicznego_szablonu_zapisuje_pochodzenie_kanoniczne(tor: str) -> None:
    """Druga nomenklatura na tej samej ścieżce — zachowanie bez zmian."""
    odpowiedz = _uruchom(tor, POLE_KANONICZNE, None)
    assert odpowiedz.get("error") in (None, ""), odpowiedz

    specs = _specs_z_referencja(odpowiedz, POLE_KANONICZNE)
    assert specs, f"tor {tor}: zadne pole nie niesie referencji {POLE_KANONICZNE}"
    for spec in specs:
        assert spec["config_id"] == "kanoniczny:bay_template_line_out"


@pytest.mark.parametrize("tor", TORY_Z_CONFIG_ID)
@pytest.mark.parametrize("pole_ref", [POLE_RODZINY, POLE_KANONICZNE])
def test_prefiks_w_migawce_zgadza_sie_z_katalogiem(tor: str, pole_ref: str) -> None:
    """Iloczyn cech {tor budowy pola} × {nomenklatura referencji}: prefiks
    zapisany do migawki wynika z katalogu, nie z toru, którym pole powstało."""
    rodzina = RODZINA_MODULARNA if pole_ref == POLE_RODZINY else None
    odpowiedz = _uruchom(tor, pole_ref, rodzina)
    assert odpowiedz.get("error") in (None, ""), odpowiedz

    specs = _specs_z_referencja(odpowiedz, pole_ref)
    assert specs
    katalogowe = pole_katalogowe(pole_ref) is not None
    for spec in specs:
        assert spec["config_id"].startswith("producent:") == katalogowe
        assert spec["config_id"] == config_ref_for_template(pole_ref)

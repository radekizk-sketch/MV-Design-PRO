"""Generator dokumentu ``docs/domain/ENM_OP_CONTRACTS_CANONICAL_FULL.md`` z rejestru operacji.

DLACZEGO (karta V12K-352, pomiar 2026-10-22). Dokument kontraktów operacji domenowych był
pisany ręcznie i rozjechał się z kodem w każdej sekcji: z 50 operacji rejestru opisywał
kilkanaście (część dwukrotnie), wymieniał operacje skasowane (``set_case_*``,
``run_short_circuit``, ``update_relay_settings``…) i operacje, które nigdy nie istniały
(``update_nn_bus_sections``, ``update_nn_coupler_state``), a wszystkie przykłady ładunków
miały pola, których żaden handler nie czyta (``from_bus_id``, ``cable_type_ref``,
``station_id``…). Wskazywał też nieistniejący moduł Pydantic i fikcyjny enum zdarzeń.

JEDNA PRAWDA: dokument jest WIDOKIEM rejestru. Bloki między znacznikami
``<!-- GENEROWANE:<blok>:POCZATEK -->`` / ``…:KONIEC -->`` powstają tutaj:

* ``rejestr-operacji`` — tabela każdej operacji ``CANONICAL_OPERATIONS`` (pola wymagane z
  kluczami zastępczymi, opcjonalne, handler), pogrupowana kategoriami rejestru;
* ``ksztalty-ladunku`` — klucze obiektów zagnieżdżonych ładunku (``KSZTALTY_ZAGNIEZDZONE``);
* ``ciagi-liniowe`` — skutki operacji w ciągach liniowych ``line_runs`` (``CIAGI_LINIOWE``);
* ``operacje-usuniete`` — operacje skasowane albo fikcyjne z powodem (żadna nie wraca do
  rejestru niezauważona);
* ``przyklady-operacji`` — łańcuch WYKONANY przez produkcyjną końcówkę
  ``POST /api/cases/{case_id}/enm/domain-ops`` (API w procesie, ``TestClient``) na pustym
  modelu: KAŻDA operacja rejestru ma przykład, a skutek (liczba utworzonych/zmienionych
  elementów, zdarzenia, wskazanie zaznaczenia albo kod odmowy) pochodzi z odpowiedzi;
* ``zdarzenia-domenowe`` — rejestr ``DOMAIN_EVENT_TYPES``.

Test ``tests/ci/test_dokument_kontraktow_operacji.py`` porównuje dokument bajtowo z tym
generatorem. Regeneracja (z katalogu ``backend``):
    PYTHONPATH=src:. python -m tests.ci.dokument_operacji_enm --write
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import sys
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from domain.canonical_operations import (
    CANONICAL_OPERATIONS,
    CIAGI_LINIOWE,
    KSZTALTY_ZAGNIEZDZONE,
    REQUIRED_FIELD_ALIASES,
    KsztaltObiektu,
    OperationCategory,
    OperationSpec,
)

BACKEND = Path(__file__).resolve().parents[2]
DOKUMENT = BACKEND.parent / "docs" / "domain" / "ENM_OP_CONTRACTS_CANONICAL_FULL.md"
KOMENDA_REGENERACJI = (
    "cd mv-design-pro/backend && PYTHONPATH=src:. python -m tests.ci.dokument_operacji_enm --write"
)

TYTUL_KATEGORII: dict[OperationCategory, str] = {
    OperationCategory.SN_NETWORK: "Sieć SN",
    OperationCategory.STATION_NN: "Stacja SN/nN i strona nN stacji",
    OperationCategory.OZE_NN: "Źródła, wytwórcy i wiązania katalogowe",
    OperationCategory.PROTECTION: "Przekładniki i zabezpieczenia",
    OperationCategory.UNIVERSAL: "Operacje uniwersalne",
    OperationCategory.NN_NETWORK: "Topologia sieci nN",
}

#: Operacje, których sukcesu nie da się pokazać w łańcuchu budowy operacjami — przykład jest
#: odmową nazwaną, a sukces przypina wskazany test na modelu archiwalnym. Test dokumentu
#: sprawdza, że każda pozostała operacja ma przykład zakończony sukcesem i że wskazany test
#: istnieje.
PRZYKLAD_WYLACZNIE_ODMOWA: dict[str, tuple[str, str]] = {
    "przepnij_element_na_pole": (
        "Akcja naprawcza ostrzeżenia W042 dla modelu archiwalnego (sprzed toru pól albo "
        "wczytanego z archiwum): operacje budowy stawiają odcinki i transformatory od razu na "
        "zaciskach pól, więc łańcuch operacji nie wytworzy elementu omijającego pole.",
        "tests/enm/test_pola_w_torze.py::"
        "test_akcja_naprawcza_przepina_kazdy_element_i_zeruje_w042",
    ),
}

#: Operacje, których NIE MA w rejestrze, a które dokumenty wymieniały — z powodem. Test
#: przypina, że żadna z nich nie wróciła do rejestru (powrót = świadoma decyzja, wpis tu
#: znika razem z nią).
OPERACJE_USUNIETE: dict[str, str] = {
    "create_study_case": (
        "CV-3.2 (58e520ce): zapis `study_cases[]` do dokumentu ENM, którego model nie ma — "
        "przypadek obliczeniowy żyje w `api/study_cases.py` i `domain/study_case.py`"
    ),
    "set_case_switch_state": (
        "CV-3.2 (58e520ce): stan roboczy łączników to `enm/scenariusze.py::OperatingScenario`"
    ),
    "set_case_normal_state": (
        "CV-3.2 (58e520ce): stan roboczy to `enm/scenariusze.py::OperatingScenario`"
    ),
    "set_case_source_mode": (
        "CV-3.2 (58e520ce): tryb źródła w scenariuszu to `enm/scenariusze.py::OperatingScenario`"
    ),
    "set_case_time_profile": "CV-3.2 (58e520ce): zapis w próżnię, 0 konsumentów",
    "run_short_circuit": (
        "CV-3.2 (58e520ce): bieg obliczeń to `enm/canonical_analysis.py::create_run/execute_run`"
    ),
    "run_power_flow": (
        "CV-3.2 (58e520ce): bieg obliczeń to `enm/canonical_analysis.py::create_run/execute_run`"
    ),
    "run_time_series_power_flow": "CV-3.2 (58e520ce): zapis w próżnię, 0 konsumentów",
    "compare_study_cases": (
        "CV-3.2 (58e520ce): porównanie przypadków to warstwa przypadków (`api/study_cases.py`)"
    ),
    "update_relay_settings": (
        "BIEG-ZABEZPIECZEN-Z-MODELU (2026-09-30): zaślepka z odmową — następca "
        "`update_protection_settings`"
    ),
    "link_relay_to_field": (
        "BIEG-ZABEZPIECZEN-Z-MODELU (2026-09-30): przekaźnik wiąże z polem `add_relay` "
        "(`field_ref`)"
    ),
    "validate_selectivity": (
        "BIEG-ZABEZPIECZEN-Z-MODELU (2026-09-30): selektywność z kolejności listy — liczy ją "
        "koordynacja zabezpieczeń na nastawach z modelu"
    ),
    "calculate_tcc_curve": "W3-A (2026-09): krzywe TCC niesie wynik koordynacji zabezpieczeń",
    "add_sn_bay_from_catalog": (
        "MENU-KANON (2026-10-22): dubel `add_sn_bay` (tryb próby `dry_run` przeniesiony)"
    ),
    "remove_nn_element": "MENU-KANON (2026-10-22): dubel `delete_element`",
    "rename_element": "MENU-KANON (2026-10-22): dubel `update_element_parameters` (pole `name`)",
    "set_label": "MENU-KANON (2026-10-22): dubel `update_element_parameters` (pole `label`)",
    "set_dynamic_profile": (
        "MENU-KANON (2026-10-22): zapis bez konsumenta — model dynamiczny wytwórcy wiąże "
        "`set_der_catalog_bindings` (`dynamic_model_ref`), odbioru `set_load_dynamic_binding`"
    ),
    "update_nn_bus_sections": (
        "nigdy nie istniała w kodzie (fikcja dokumentu) — sekcje nN buduje "
        "`add_nn_section_coupler`"
    ),
    "update_nn_coupler_state": (
        "nigdy nie istniała w kodzie (fikcja dokumentu) — stan łącznika zmieniają "
        "`open_switch` / `close_switch`"
    ),
}


# ---------------------------------------------------------------------------
# Bloki generowane
# ---------------------------------------------------------------------------


def _znacznik(blok: str, koniec: bool) -> str:
    return f"<!-- GENEROWANE:{blok}:{'KONIEC' if koniec else 'POCZATEK'} -->"


def _kod(nazwy: list[str]) -> str:
    return ", ".join(f"`{n}`" for n in nazwy) if nazwy else "—"


def _wymagane(op: str, spec: OperationSpec) -> str:
    zastepcze = REQUIRED_FIELD_ALIASES.get(op, {})
    czesci = []
    for pole in spec.required_fields:
        if pole in zastepcze:
            czesci.append(f"`{pole}` (albo {_kod(list(zastepcze[pole]))})")
        else:
            czesci.append(f"`{pole}`")
    return ", ".join(czesci) if czesci else "—"


def lokalizacje_handlerow() -> dict[str, str]:
    """Operacja → ``enm/<moduł>.py::<funkcja>`` handlera ze słowników dispatchera."""
    from enm.domain_operations import _HANDLERS
    from enm.domain_operations_v2 import ALL_V2_HANDLERS

    wynik: dict[str, str] = {}
    for op, funkcja in {**_HANDLERS, **ALL_V2_HANDLERS}.items():
        modul = funkcja.__module__.removeprefix("enm.").replace(".", "/")
        wynik[op] = f"enm/{modul}.py::{funkcja.__name__}"
    return wynik


def render_rejestru(lokalizacje: dict[str, str]) -> str:
    """Tabela operacji per kategoria (kolejność kategorii z ``OperationCategory``)."""
    linie: list[str] = [
        f"Rejestr liczy **{len(CANONICAL_OPERATIONS)}** operacji. Pole w nawiasie „albo” to klucz "
        "zastępczy (`REQUIRED_FIELD_ALIASES`): handler przyjmuje pole wymagane ALBO ten klucz. "
        "Nazwa z `{…}` to rodzina kluczy numerowanych. Kolumna „Tworzy” = "
        "`OperationSpec.creates_elements`.",
        "",
    ]
    for kategoria in OperationCategory:
        operacje = sorted(op for op, s in CANONICAL_OPERATIONS.items() if s.category is kategoria)
        if not operacje:
            continue
        linie += [
            f"### {TYTUL_KATEGORII[kategoria]} (`{kategoria.value}`, {len(operacje)})",
            "",
            "| Operacja | Opis | Pola wymagane | Pola opcjonalne | Tworzy | Handler |",
            "|---|---|---|---|---|---|",
        ]
        for op in operacje:
            spec = CANONICAL_OPERATIONS[op]
            linie.append(
                f"| `{op}` | {spec.description_pl} | {_wymagane(op, spec)} | "
                f"{_kod(sorted(spec.optional_fields))} | "
                f"{'tak' if spec.creates_elements else 'nie'} | `{lokalizacje[op]}` |"
            )
        linie.append("")
    return "\n".join(linie).rstrip("\n")


def _wiersze_ksztaltu(op: str, sciezka: str, ksztalt: KsztaltObiektu) -> list[str]:
    linie = [f"| `{op}` | `{sciezka}` | {_kod(sorted(ksztalt.pola))} |"]
    for klucz in sorted(ksztalt.zagniezdzone):
        linie += _wiersze_ksztaltu(op, f"{sciezka}.{klucz}", ksztalt.zagniezdzone[klucz])
    return linie


def render_ksztaltow() -> str:
    """Klucze obiektów zagnieżdżonych ładunku (``KSZTALTY_ZAGNIEZDZONE``) per operacja."""
    linie = [
        f"Obiekty zagnieżdżone ładunku mają kształt w **{len(KSZTALTY_ZAGNIEZDZONE)}** "
        "operacjach (`KSZTALTY_ZAGNIEZDZONE`). Kształt obowiązuje obiekt pod kluczem i KAŻDY "
        "element listy obiektów pod tym kluczem; klucz spoza kształtu melduje dyspozytor "
        "(`klucze_spoza_kontraktu`, ścieżka `station.x`, `sn_fields[0].x`), a test go odrzuca. "
        "Obiekt bez wiersza (np. `manual_params`) czyta handler kluczami wyliczanymi w biegu — "
        "lista z przyczyną: `backend/tests/ci/test_spec_operacji_rowna_odczytom_handlera.py`.",
        "",
        "| Operacja | Obiekt | Klucze |",
        "|---|---|---|",
    ]
    for op in sorted(KSZTALTY_ZAGNIEZDZONE):
        for klucz in sorted(KSZTALTY_ZAGNIEZDZONE[op]):
            linie += _wiersze_ksztaltu(op, klucz, KSZTALTY_ZAGNIEZDZONE[op][klucz])
    return "\n".join(linie)


def render_ciagow() -> str:
    """Skutki operacji w ciągach liniowych ``line_runs`` (``CIAGI_LINIOWE``)."""
    linie = [
        "Ciąg liniowy (`line_runs`, `enm/models.py::LineRun`) to magistrala albo odgałęzienie "
        "jako uporządkowana lista odcinków kabla/linii (`segments`: `segment_ref`, `order`) "
        "z początkiem w polu (`starting_bay_ref`, `starting_port_ref`); id ciągu = `ref_id` "
        "magistrali (`corridors`), `run_kind` ∈ `main_trunk`, `branch`, `ring`, `loop`, "
        "odgałęzienie wskazuje ciąg macierzysty (`parent_run_ref`). Każdy odcinek ciągu istnieje "
        "w `branches`, każda stacja listy `stations` — w `substations`. Operacje nie prowadzą "
        "listy `stations`: stacje ciągu wyprowadza się z końcówek odcinków (SLD "
        "`inferStationRefsForSegments`); lista z zapisu zastanego traci stację usuniętą. "
        f"Ciągi zmienia **{len(CIAGI_LINIOWE)}** operacji (`CIAGI_LINIOWE`, zbiór równy "
        "operacjom, których handler zapisuje ciągi — "
        "`backend/tests/ci/test_ciagi_liniowe_operacji.py`); pozostałe operacje ciągów nie "
        "zmieniają.",
        "",
        "| Operacja | Klucz ciągu | Skutek w `line_runs` |",
        "|---|---|---|",
    ]
    for op in sorted(CIAGI_LINIOWE):
        skutek = CIAGI_LINIOWE[op]
        klucz = f"`{skutek.klucz_ladunku}`" if skutek.klucz_ladunku else "—"
        linie.append(f"| `{op}` | {klucz} | {skutek.opis_pl} |")
    return "\n".join(linie)


def render_usunietych() -> str:
    linie = ["| Operacja | Powód |", "|---|---|"]
    linie += [f"| `{op}` | {powod} |" for op, powod in sorted(OPERACJE_USUNIETE.items())]
    return "\n".join(linie)


def render_zdarzen() -> str:
    from enm.domain_ops_models import DOMAIN_EVENT_TYPES

    linie = [
        f"Rejestr `DOMAIN_EVENT_TYPES` liczy **{len(DOMAIN_EVENT_TYPES)}** typów:",
        "",
    ]
    linie += [f"- `{typ}`" for typ in DOMAIN_EVENT_TYPES]
    return "\n".join(linie)


# ---------------------------------------------------------------------------
# Łańcuch przykładów wykonywany przez API
# ---------------------------------------------------------------------------

WERSJA_KATALOGU = "2024.1"
# Źródło SN z katalogu (równoważnik na szynach SN GPZ, bez transformatorów 110/SN w modelu)
# — wiązanie dla testów budujących sieć bez modelu strony 110 kV.
ZRODLO_GPZ = "src-gpz-15kv-300mva-rx010"
# Transformator 110/15 kV przykładu `add_grid_source_sn` (równoważnik po stronie 110 kV).
TRANSFORMATOR_WN_SN = "tr-wn-sn-110-15-25mva-yd11"
KABEL_SN = "cable-tfk-yakxs-3x120"
APARAT_SN = "sw-cb-abb-vd4-17kv-630a"
ROZLACZNIK_SN = "sw-ls-ogolny-prozniowy-24kv-630a"
TRANSFORMATOR_630 = "tr-sn-nn-15-04-630kva-dyn11"
ZKSN = "ZKSN-2P-630A"
SLUP_ODGALEZNY = "SLUP-ODG-12"
APARAT_NN = "cb_nn_630a"
KABEL_NN = "kab_nn_4x120_al"
FALOWNIK_PV = "conv-pv-nn-0p5mw-0p4kv"
PRZEKLADNIK_CT = "ct_400_5_5p20_15va_abb"
PRZEKLADNIK_VT = "vt_15kv_100v_3p_abb"
PRZEKAZNIK = "REF-OC-100"
KOMPENSATOR = "KOMP_SN_1V2_15KV"
OGRANICZNIK = "arrester-abb-polim-d-24kv-10ka"
ODBIOR_NN = "load_mieszk_15kw"
RCD_NN = "rcd_nn_a_40a_30ma"


def _wiazanie(przestrzen: str, pozycja: str) -> dict[str, str]:
    return {
        "catalog_namespace": przestrzen,
        "catalog_item_id": pozycja,
        "catalog_item_version": WERSJA_KATALOGU,
    }


@dataclass
class Kontekst:
    """Bieżąca migawka + odpowiedzi poprzednich kroków (po etykiecie)."""

    enm: dict[str, Any]
    odpowiedzi: dict[str, dict[str, Any]]

    def utworzone(self, etykieta: str) -> list[str]:
        return list(self.odpowiedzi[etykieta]["changes"]["created_element_ids"])

    def wskazany(self, etykieta: str) -> str:
        return str(self.odpowiedzi[etykieta]["selection_hint"]["element_id"])

    def galaz(self, warunek: Callable[[dict[str, Any]], bool]) -> dict[str, Any]:
        return next(g for g in self.enm["branches"] if warunek(g))

    def kable_sn(self) -> list[dict[str, Any]]:
        return [g for g in self.enm["branches"] if g.get("type") == "cable"]

    def stacja(self, warunek: Callable[[dict[str, Any]], bool]) -> dict[str, Any]:
        return next(s for s in self.enm["substations"] if warunek(s))


@dataclass(frozen=True)
class Krok:
    etykieta: str
    operacja: str
    cel_pl: str
    ladunek: Callable[[Kontekst], dict[str, Any]]
    #: Kod odmowy oczekiwany od operacji (przykład odmowy nazwanej) — ``None`` = sukces.
    odmowa: str | None = None


def _gpz(_: Kontekst) -> dict[str, Any]:
    # Granica zasilania SN (karta GPZ-MODEL): transformator 110/15 kV jest elementem modelu
    # wyłącznie przy równoważniku sieci po stronie 110 kV; równoważnik na szynach SN z danymi
    # transformatora jest odmową `source.transformer_requires_hv_equivalent`.
    return {
        "voltage_kv": 15.0,
        "source_name": "GPZ Północ",
        "manual_equivalent": {
            "short_circuit_input_side": "HV_110",
            "hv_voltage_kv": 110.0,
            "sk3_hv_mva": 3000.0,
            "rx_ratio": 0.1,
        },
        "transformer_count": 1,
        "transformer_catalog_ref": TRANSFORMATOR_WN_SN,
    }


def _odcinek(dlugosc_m: float, nazwa: str) -> Callable[[Kontekst], dict[str, Any]]:
    return lambda _k: {
        "segment": {
            "rodzaj": "KABEL",
            "dlugosc_m": dlugosc_m,
            "name": nazwa,
            "catalog_binding": _wiazanie("KABEL_SN", KABEL_SN),
        }
    }


def _segment_o_nazwie(k: Kontekst, nazwa: str) -> str:
    return str(k.galaz(lambda g: g.get("name") == nazwa)["ref_id"])


def _aparat_pola(k: Kontekst, bay_ref: str, oznaczenie: str) -> dict[str, Any]:
    pole = next(b for b in k.enm["bays"] if b["ref_id"] == bay_ref)
    return next(a for a in pole["primary_devices"] if a.get("designation") == oznaczenie)


def _stacja_b(k: Kontekst) -> dict[str, Any]:
    return k.stacja(lambda s: s.get("name") == "Stacja S01")


def _szyna_sn_stacji(k: Kontekst) -> str:
    return next(r for r in _stacja_b(k)["bus_refs"] if not r.endswith("/nn_bus"))


def _szyna_nn_stacji(k: Kontekst) -> str:
    return next(r for r in _stacja_b(k)["bus_refs"] if r.endswith("/nn_bus"))


def _pole_stacji(k: Kontekst, rola: str) -> str:
    stacja = _stacja_b(k)["ref_id"]
    return next(
        b["ref_id"]
        for b in k.enm["bays"]
        if b.get("substation_ref") == stacja and b.get("bay_role") == rola
    )


def _szyna_wn_gpz(k: Kontekst) -> str:
    return next(r for r in k.utworzone("gpz") if r.endswith("/bus_wn"))


def _rozdzielnica(k: Kontekst) -> dict[str, Any]:
    return k.stacja(lambda s: s.get("name") == "RGnN-1")


def _aparat_odplywu_nn(k: Kontekst, pole_ref: str) -> str:
    """Aparat odpływu nN promowany do modelu z pola rozdzielnicy (``meta.nn_field_migrowany_z``)."""
    return str(
        k.galaz(lambda g: (g.get("meta") or {}).get("nn_field_migrowany_z") == pole_ref)["ref_id"]
    )


def _zacisk_odplywu_nn(k: Kontekst, pole_ref: str) -> str:
    return str(
        k.galaz(lambda g: (g.get("meta") or {}).get("nn_field_migrowany_z") == pole_ref)[
            "to_bus_ref"
        ]
    )


def _zrodlo_o_nazwie(k: Kontekst, nazwa: str) -> str:
    return next(g["ref_id"] for g in k.enm["generators"] if g.get("name") == nazwa)


def _odbior_o_nazwie(k: Kontekst, nazwa: str) -> str:
    return next(o["ref_id"] for o in k.enm["loads"] if o.get("name") == nazwa)


def _karta_widmowa() -> dict[str, Any]:
    from tests.dziedziny import fabryki

    return fabryki.karta(
        id="karta-widmowa-pv-1",
        urzadzenie_ref=FALOWNIK_PV,
        verification_status="NIEWERYFIKOWANY",
        catalog_status="PROJEKTOWY_V1",
    ).model_dump(mode="json")


NASTAWY_ZABEZPIECZENIA: list[dict[str, Any]] = [
    {
        "function_type": "overcurrent_51",
        "threshold_a": 2.0,
        "threshold_unit": "A_WTORNY",
        "curve_type": "IEC_SI",
        "time_multiplier": 0.3,
    },
    {
        "function_type": "overcurrent_50",
        "threshold_a": 20.0,
        "threshold_unit": "A_WTORNY",
        "curve_type": "DT",
        "time_delay_s": 0.4,
    },
]


KROKI: tuple[Krok, ...] = (
    # --- Sieć SN: GPZ, magistrala, stacje, punkty ciągu ------------------------------------
    Krok(
        "gpz",
        "add_grid_source_sn",
        "GPZ 110/15 kV: równoważnik sieci 110 kV i transformator 110/15 kV z katalogu",
        _gpz,
    ),
    Krok(
        "o1", "continue_trunk_segment_sn", "pierwszy odcinek magistrali", _odcinek(350, "Odcinek 1")
    ),
    Krok("o2", "continue_trunk_segment_sn", "drugi odcinek", _odcinek(420, "Odcinek 2")),
    Krok("o3", "continue_trunk_segment_sn", "trzeci odcinek", _odcinek(300, "Odcinek 3")),
    Krok("o4", "continue_trunk_segment_sn", "czwarty odcinek", _odcinek(280, "Odcinek 4")),
    Krok(
        "stacja",
        "insert_station_on_segment_sn",
        "stacja przelotowa typu B w połowie drugiego odcinka",
        lambda k: {
            "segment_id": _segment_o_nazwie(k, "Odcinek 2"),
            "insert_at": {"mode": "RATIO", "value": 0.5},
            "field_apparatus_catalog_ref": APARAT_SN,
            "station": {
                "station_type": "B",
                "station_name": "Stacja S01",
                "sn_voltage_kv": 15.0,
                "nn_voltage_kv": 0.4,
            },
            "nn_earthing": {"lv_system": "TN-C-S"},
            "sn_fields": [
                {"field_role": "LINIA_IN"},
                {"field_role": "LINIA_OUT"},
                {"field_role": "MEASUREMENT"},
                {"field_role": "TRANSFORMATOROWE"},
            ],
            "transformer": {"create": True, "transformer_catalog_ref": TRANSFORMATOR_630},
            "nn_block": {"outgoing_feeders_nn_count": 2},
        },
    ),
    Krok(
        "lacznik",
        "insert_section_switch_sn",
        "rozłącznik sekcyjny w połowie trzeciego odcinka",
        lambda k: {
            "segment_id": _segment_o_nazwie(k, "Odcinek 3"),
            "insert_at": {"mode": "RATIO", "value": 0.5},
            "switch_type": "ROZLACZNIK",
            "switch_name": "Rozłącznik R1",
            "catalog_binding": _wiazanie("APARAT_SN", ROZLACZNIK_SN),
        },
    ),
    Krok(
        "zksn",
        "insert_zksn_on_segment_sn",
        "złącze kablowe SN (ZKSN) w połowie czwartego odcinka",
        lambda k: {
            "segment_id": _segment_o_nazwie(k, "Odcinek 4"),
            "insert_at": {"mode": "RATIO", "value": 0.5},
            "catalog_binding": _wiazanie("mv_branch_points", ZKSN),
            "switch_state": "closed",
            "name": "ZKSN-1",
        },
    ),
    Krok(
        "odgalezienie",
        "start_branch_segment_sn",
        "odgałęzienie napowietrzne od węzła za pierwszym odcinkiem",
        lambda k: {
            "from_bus_ref": k.galaz(lambda g: g.get("name") == "Odcinek 1")["to_bus_ref"],
            "segment": {
                "rodzaj": "LINIA_NAPOWIETRZNA",
                "dlugosc_m": 900,
                "name": "Odgałęzienie 1",
                "catalog_binding": _wiazanie("LINIA_SN", "line-base-al-st-70"),
            },
        },
    ),
    Krok(
        "slup",
        "insert_branch_pole_on_segment_sn",
        "słup rozgałęźny w połowie odgałęzienia",
        lambda k: {
            "segment_id": _segment_o_nazwie(k, "Odgałęzienie 1"),
            "insert_at": {"mode": "RATIO", "value": 0.5},
            "catalog_binding": _wiazanie("mv_branch_points", SLUP_ODGALEZNY),
            "switch_state": "closed",
            "name": "Słup S-1",
        },
    ),
    Krok(
        "stacja_koncowa",
        "append_station_on_endpoint",
        "stacja końcowa na otwartym końcu odgałęzienia",
        lambda k: {
            "endpoint_bus_ref": k.utworzone("odgalezienie")[0],
            "field_apparatus_catalog_ref": APARAT_SN,
            "station": {
                "station_type": "A",
                "name": "Stacja S02",
                "nn_voltage_kv": 0.4,
            },
            "nn_earthing": {"lv_system": "TN-C-S"},
            "transformer": {"create": True, "transformer_catalog_ref": TRANSFORMATOR_630},
        },
    ),
    Krok(
        "pierscien",
        "connect_secondary_ring_sn",
        "zamknięcie pierścienia od szyny GPZ do końca magistrali",
        lambda k: {
            "from_bus_ref": k.galaz(lambda g: g.get("name") == "Odcinek 1")["from_bus_ref"],
            "to_bus_ref": k.utworzone("o4")[0],
            "ring_name": "Pierścień P1",
            "segment": {
                "rodzaj": "KABEL",
                "dlugosc_m": 1500,
                "catalog_binding": _wiazanie("KABEL_SN", KABEL_SN),
            },
        },
    ),
    Krok(
        "nop",
        "set_normal_open_point",
        "rozłącznik R1 punktem normalnie otwartym pierścienia",
        lambda k: {"switch_ref": k.wskazany("lacznik")},
    ),
    Krok(
        "zamknij",
        "close_switch",
        "zamknięcie rozłącznika R1 (stan łączeniowy)",
        lambda k: {"switch_ref": k.wskazany("lacznik")},
    ),
    Krok(
        "otworz",
        "open_switch",
        "ponowne otwarcie rozłącznika R1",
        lambda k: {"switch_ref": k.wskazany("lacznik")},
    ),
    Krok(
        "przepnij",
        "przepnij_element_na_pole",
        "akcja naprawcza modelu archiwalnego — odcinek zbudowany operacją już leży na polu",
        lambda k: {"element_ref": _segment_o_nazwie(k, "Odcinek 1")},
        odmowa="tor.element_not_bypassing_field",
    ),
    # --- GPZ: sekcje szyn -----------------------------------------------------------------
    Krok(
        "sekcja_gpz",
        "add_gpz_section",
        "sekcja szyn WN GPZ na szynie 110 kV",
        lambda k: {
            "substation_ref": k.wskazany("gpz"),
            "side": "hv",
            "section_id": "WN-1",
            "bus_ref": _szyna_wn_gpz(k),
            "name": "Sekcja WN 1",
        },
    ),
    Krok(
        "sekcja_gpz_zmiana",
        "update_gpz_section",
        "zmiana nazwy sekcji WN",
        lambda k: {
            "substation_ref": k.wskazany("gpz"),
            "side": "hv",
            "section_id": "WN-1",
            "updates": {"name": "Sekcja WN 1 (główna)"},
        },
    ),
    Krok(
        "sekcja_gpz_usun",
        "delete_gpz_section",
        "usunięcie sekcji WN",
        lambda k: {"substation_ref": k.wskazany("gpz"), "side": "hv", "section_id": "WN-1"},
    ),
    # --- Pola SN i elementy przyłączane do szyn SN ------------------------------------------
    Krok(
        "pole_sn",
        "add_sn_bay",
        "dodatkowe pole liniowe w rozdzielnicy SN stacji S01",
        lambda k: {
            "station_ref": _stacja_b(k)["ref_id"],
            "bus_ref": _szyna_sn_stacji(k),
            "bay_role": "OUT",
            "field_name": "Pole liniowe L3",
            "catalog_ref": APARAT_SN,
        },
    ),
    Krok(
        "wyposazenie",
        "set_bay_equipment",
        "wyposażenie nowego pola z szablonu pola liniowego",
        lambda k: {
            "bay_ref": k.wskazany("pole_sn"),
            "mode": "szablon",
            "bay_template_ref": "bay_template_line_out",
        },
    ),
    Krok(
        "polozenie_lacznika",
        "set_bay_apparatus_position",
        "otwarcie odłącznika liniowego Q9 nowego pola (łącznik pola bez własnej gałęzi)",
        lambda k: {
            "bay_ref": k.wskazany("pole_sn"),
            "device_ref": _aparat_pola(k, k.wskazany("pole_sn"), "Q9")["device_ref"],
            "actual_state": "otwarty",
        },
    ),
    Krok(
        "stan_pola",
        "set_object_state",
        "oznaczenie pola L3 jako istniejącego w sieci (pole zastane, aparaty razem z polem)",
        lambda k: {
            "bay_ref": k.wskazany("pole_sn"),
            "stan_obiektu": "ISTNIEJACY",
        },
    ),
    Krok(
        "odbior_sn",
        "add_load_sn",
        "odbiór SN na węźle za pierwszym odcinkiem",
        lambda k: {
            "bus_ref": k.utworzone("o1")[0],
            "p_mw": 0.4,
            "q_mvar": 0.1,
            "load_name": "Odbiór SN 1",
        },
    ),
    Krok(
        "generator_sn",
        "add_generator_sn",
        "generator synchroniczny SN z tabliczką podaną ręcznie (katalog bez typu maszyny)",
        lambda k: {
            "bus_ref": k.utworzone("o3")[0],
            "p_mw": 1.0,
            "name": "Generator G1",
            "manual_params": {
                "rated_mva": 1.25,
                "rated_kv": 15.0,
                "q_min_mvar": -0.6,
                "q_max_mvar": 0.75,
            },
        },
    ),
    Krok(
        "kompensator",
        "add_shunt_compensator_sn",
        "bateria kondensatorów SN z katalogu",
        lambda k: {
            "bus_ref": k.utworzone("o3")[0],
            "name": "Bateria K1",
            "catalog_binding": _wiazanie("KOMPENSATOR_SN", KOMPENSATOR),
        },
    ),
    Krok(
        "ogranicznik",
        "add_surge_arrester_sn",
        "ogranicznik przepięć w polu liniowym stacji S01",
        lambda k: {
            "station_ref": _stacja_b(k)["ref_id"],
            "field_ref": _pole_stacji(k, "IN"),
            "catalog_binding": _wiazanie("OGRANICZNIK_SN", OGRANICZNIK),
        },
    ),
    # --- Strona nN stacji -------------------------------------------------------------------
    Krok(
        "pole_nn",
        "add_nn_outgoing_field",
        "pole odpływowe nN w stacji S01",
        lambda k: {
            "station_ref": _stacja_b(k)["ref_id"],
            "bus_nn_ref": _szyna_nn_stacji(k),
            "field_name": "Odpływ nN 3",
        },
    ),
    Krok(
        "odbior_nn",
        "add_nn_load",
        "odbiór nN z katalogu na nowym odpływie",
        lambda k: {
            "bus_nn_ref": _szyna_nn_stacji(k),
            "feeder_ref": k.wskazany("pole_nn"),
            "catalog_binding": _wiazanie("OBCIAZENIE", ODBIOR_NN),
            "cos_phi": 0.95,
            "load_name": "Odbiór nN 1",
        },
    ),
    Krok(
        "rcd_nn",
        "add_nn_rcd",
        "wyłącznik różnicowoprądowy przed zaciskami instalacji odbioru nN 1",
        lambda k: {
            "load_ref": next(o["ref_id"] for o in k.enm["loads"] if o.get("name") == "Odbiór nN 1"),
            "catalog_binding": _wiazanie("APARAT_NN_RCD", RCD_NN),
            "name": "RCD odbioru nN 1",
        },
    ),
    Krok(
        "pv",
        "add_converter_source",
        "źródło PV na szynie nN stacji S01",
        lambda k: {
            "source_technology": "PV",
            "connection_variant": "nn_side",
            "station_ref": _stacja_b(k)["ref_id"],
            "bus_nn_ref": _szyna_nn_stacji(k),
            "catalog_binding": _wiazanie("ZRODLO_NN_PV", FALOWNIK_PV),
            "power_setpoint_mw": 0.02,
            "source_name": "PV S01",
        },
    ),
    Krok(
        "agregat",
        "add_genset_nn",
        "agregat prądotwórczy w nowym polu źródłowym nN",
        lambda k: {
            "bus_nn_ref": _szyna_nn_stacji(k),
            "station_ref": _stacja_b(k)["ref_id"],
            "placement": "NEW_FIELD",
            "source_field": {"source_field_kind": "AGREGAT", "field_name": "Pole agregatu"},
            "genset_spec": {
                "rated_power_kw": 400.0,
                "rated_voltage_kv": 0.4,
                "power_factor": 0.8,
                "operation_mode": "PRACA_AWARYJNA",
                "fuel_type": "DIESEL",
            },
        },
    ),
    Krok(
        "ups",
        "add_ups_nn",
        "UPS wprost na szynie nN",
        lambda k: {
            "bus_nn_ref": _szyna_nn_stacji(k),
            "ups_spec": {
                "rated_power_kw": 120.0,
                "backup_time_min": 15.0,
                "operation_mode": "ONLINE",
                "battery_type": "VRLA",
            },
        },
    ),
    Krok(
        "tryb",
        "set_source_operating_mode",
        "tryb pracy agregatu",
        lambda k: {"source_ref": k.wskazany("agregat"), "mode": "gotowosc"},
    ),
    Krok(
        "karta",
        "dodaj_karte_widmowa_projektu",
        "karta widmowa projektu typu falownika PV",
        lambda _k: {"karta": _karta_widmowa()},
    ),
    Krok(
        "wiazania_der",
        "set_der_catalog_bindings",
        "wiązanie źródła PV z kartą widmową projektu",
        lambda k: {
            "generator_ref": _zrodlo_o_nazwie(k, "PV S01"),
            "karty_widmowe_ref": ["karta-widmowa-pv-1"],
        },
    ),
    Krok(
        "dynamika_odbioru",
        "set_load_dynamic_binding",
        "profil modelu dynamicznego odbioru SN",
        lambda k: {
            "load_ref": _odbior_o_nazwie(k, "Odbiór SN 1"),
            "dynamic_model_ref": "load_dyn_zagregowany_sn",
        },
    ),
    # --- Przekładniki i zabezpieczenia ------------------------------------------------------
    Krok(
        "ct",
        "add_ct",
        "przekładnik prądowy w polu liniowym stacji S01",
        lambda k: {
            "field_ref": _pole_stacji(k, "IN"),
            "catalog_binding": _wiazanie("CT", PRZEKLADNIK_CT),
            "ratio_primary_a": 400.0,
            "ratio_secondary_a": 5.0,
        },
    ),
    Krok(
        "vt",
        "add_vt",
        "przekładnik napięciowy w polu pomiarowym stacji S01",
        lambda k: {
            "field_ref": _pole_stacji(k, "MEASUREMENT"),
            "catalog_binding": _wiazanie("VT", PRZEKLADNIK_VT),
            "ratio_primary_v": 15000.0,
            "ratio_secondary_v": 100.0,
        },
    ),
    Krok(
        "obwod_wtorny",
        "set_measurement_secondary_circuit",
        "obwód wtórny przekładnika prądowego",
        lambda k: {
            "measurement_ref": k.wskazany("ct"),
            "obwod_wtorny": {"dlugosc_przewodu_m": 25.0, "przekroj_przewodu_mm2": 2.5},
        },
    ),
    Krok(
        "przekaznik",
        "add_relay",
        "zabezpieczenie nadprądowe pola liniowego z nastawami",
        lambda k: {
            "field_ref": _pole_stacji(k, "IN"),
            "ct_ref": k.wskazany("ct"),
            "catalog_ref": PRZEKAZNIK,
            "settings": NASTAWY_ZABEZPIECZENIA,
        },
    ),
    Krok(
        "nastawy",
        "update_protection_settings",
        "zmiana nastaw (zwłoka członu zwarciowego 0,3 s)",
        lambda k: {
            "protection_ref": k.wskazany("przekaznik"),
            "settings": [
                NASTAWY_ZABEZPIECZENIA[0],
                {**NASTAWY_ZABEZPIECZENIA[1], "time_delay_s": 0.3},
            ],
        },
    ),
    # --- Topologia sieci nN -----------------------------------------------------------------
    Krok(
        "rozdzielnica",
        "add_nn_distribution_board",
        "rozdzielnica nN wolnostojąca",
        lambda _k: {"voltage_kv": 0.4, "name": "RGnN-1"},
    ),
    Krok(
        "trafo",
        "add_transformer_sn_nn",
        "transformator SN/nN zasilający rozdzielnicę RGnN-1 z węzła za trzecim odcinkiem",
        lambda k: {
            "hv_bus_ref": k.utworzone("o3")[0],
            "lv_bus_ref": _rozdzielnica(k)["bus_refs"][0],
            "transformer_catalog_ref": TRANSFORMATOR_630,
        },
    ),
    Krok(
        "odplyw_nn",
        "add_nn_outgoing_field",
        "odpływ F1 rozdzielnicy RGnN-1 (aparat odpływu i zacisk odpływu)",
        lambda k: {
            "station_ref": _rozdzielnica(k)["ref_id"],
            "bus_nn_ref": _rozdzielnica(k)["bus_refs"][0],
            "field_name": "Odpływ F1",
            "catalog_ref": APARAT_NN,
        },
    ),
    Krok(
        "kabel_nn",
        "add_nn_cable_segment",
        "kabel nN z zacisku odpływu F1",
        lambda k: {
            "from_bus_ref": _zacisk_odplywu_nn(k, k.wskazany("odplyw_nn")),
            "length_m": 80.0,
            "catalog_ref": KABEL_NN,
            "name": "Kabel nN K1",
        },
    ),
    Krok(
        "podrozdzielnica",
        "add_nn_distribution_board",
        "podrozdzielnica RGnN-2",
        lambda _k: {"voltage_kv": 0.4, "name": "RGnN-2"},
    ),
    Krok(
        "bezpiecznik_nn",
        "add_nn_switch_device",
        "bezpiecznik między końcem kabla K1 a szyną podrozdzielnicy RGnN-2",
        lambda k: {
            "from_bus_ref": k.galaz(lambda g: g.get("name") == "Kabel nN K1")["to_bus_ref"],
            "to_bus_ref": k.stacja(lambda s: s.get("name") == "RGnN-2")["bus_refs"][0],
            "device_class": "fuse",
            "catalog_ref": APARAT_NN,
            "name": "Bezpiecznik złącza Z1",
        },
    ),
    Krok(
        "sprzeglo_nn",
        "add_nn_section_coupler",
        "druga sekcja szyn rozdzielnicy RGnN-1 ze sprzęgłem",
        lambda k: {"station_ref": _rozdzielnica(k)["ref_id"], "catalog_ref": APARAT_NN},
    ),
    Krok(
        "podzial_nn",
        "split_nn_segment",
        "podział kabla K1 w 30 m",
        lambda k: {
            "segment_ref": k.galaz(lambda g: g.get("name") == "Kabel nN K1")["ref_id"],
            "split_at_m": 30.0,
        },
    ),
    Krok(
        "ulozenie_nn",
        "set_nn_cable_laying_conditions",
        "warunki ułożenia pierwszej połówki kabla",
        lambda k: {
            "segment_ref": k.galaz(lambda g: g.get("name") == "Kabel nN K1 (A)")["ref_id"],
            "cable_laying_conditions": {
                "environment": "grunt",
                "insulation": "XLPE",
                "ambient_temperature_c": 20.0,
                "circuit_count": 2,
                "soil_thermal_resistivity_km_w": 1.5,
            },
        },
    ),
    Krok(
        "scalenie_nn",
        "merge_nn_segments",
        "scalenie połówek kabla",
        lambda k: {
            "segment_a_ref": k.galaz(lambda g: g.get("name") == "Kabel nN K1 (A)")["ref_id"],
            "segment_b_ref": k.galaz(lambda g: g.get("name") == "Kabel nN K1 (B)")["ref_id"],
        },
    ),
    Krok(
        "kopia_nn",
        "copy_nn_feeder",
        "kopia odpływu F1 z kablem i bezpiecznikiem",
        lambda k: {
            "feeder_apparatus_ref": _aparat_odplywu_nn(k, k.wskazany("odplyw_nn")),
            "name": "Odpływ F2",
        },
    ),
    # --- Operacje uniwersalne ----------------------------------------------------------------
    Krok(
        "katalog",
        "assign_catalog_to_element",
        "zmiana pozycji katalogu kabla pierwszego odcinka",
        lambda k: {
            "element_ref": _segment_o_nazwie(k, "Odcinek 1"),
            "catalog_binding": _wiazanie("KABEL_SN", "cable-base-xlpe-al-3c-240"),
        },
    ),
    Krok(
        "parametry",
        "update_element_parameters",
        "zmiana nazwy i mocy odbioru SN",
        lambda k: {
            "element_ref": _odbior_o_nazwie(k, "Odbiór SN 1"),
            "parameters": {"name": "Odbiór przemysłowy", "p_mw": 0.5},
        },
    ),
    Krok(
        "warunki",
        "set_connection_conditions",
        "warunki przyłączenia z dokumentu OSD",
        lambda _k: {
            "moc_przylaczeniowa_mw": 2.0,
            "wymagany_cos_phi": 0.95,
            "tryb_pracy": "praca równoległa z siecią",
        },
    ),
    Krok("odswiez", "refresh_snapshot", "odświeżenie migawki bez zmiany modelu", lambda _k: {}),
    Krok(
        "usun",
        "delete_element",
        "usunięcie baterii kondensatorów",
        lambda k: {"element_ref": k.utworzone("kompensator")[0]},
    ),
)


@dataclass(frozen=True)
class WynikKroku:
    krok: Krok
    ladunek: dict[str, Any]
    status_http: int
    odpowiedz: dict[str, Any]


def wykonaj_lancuch(kroki: tuple[Krok, ...] = KROKI) -> list[WynikKroku]:
    """Łańcuch przykładów przez produkcyjną końcówkę ``domain-ops`` (API w procesie)."""
    from api.main import app
    from fastapi.testclient import TestClient

    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("mv_design_pro").setLevel(logging.WARNING)
    wyniki: list[WynikKroku] = []
    with TestClient(app) as klient:
        projekt = klient.post(
            "/api/projects",
            json={
                "name": "Przykłady kontraktu operacji",
                "description": "",
                "mode": "TO-BE",
                "voltage_level_kv": 15.0,
                "frequency_hz": 50.0,
            },
        ).json()
        przypadek = klient.post(
            "/api/study-cases",
            json={
                "project_id": projekt["id"],
                "name": "Przykłady",
                "description": "",
                "config": {},
                "set_active": True,
            },
        ).json()
        kontekst = Kontekst(
            enm=klient.get(f"/api/cases/{przypadek['id']}/enm").json(), odpowiedzi={}
        )
        for numer, krok in enumerate(kroki, start=1):
            ladunek = krok.ladunek(kontekst)
            odpowiedz = klient.post(
                f"/api/cases/{przypadek['id']}/enm/domain-ops",
                json={
                    "project_id": projekt["id"],
                    # Kontrola współbieżności na skrócie bieżącej migawki — ta sama droga co
                    # frontend (409 przy rozjeździe).
                    "snapshot_base_hash": kontekst.enm["header"]["hash_sha256"],
                    "operation": {
                        "name": krok.operacja,
                        "idempotency_key": f"przyklad-{numer:02d}",
                        "payload": ladunek,
                    },
                },
            )
            tresc = odpowiedz.json()
            wyniki.append(WynikKroku(krok, ladunek, odpowiedz.status_code, tresc))
            kontekst.odpowiedzi[krok.etykieta] = tresc
            kontekst.enm = klient.get(f"/api/cases/{przypadek['id']}/enm").json()
    return wyniki


ZASTEPCZY_SKROT_MIGAWKI = "<header.hash_sha256 migawki bazowej>"
ZASTEPCZY_PROJEKT = "<id projektu>"


def _koperta(numer: int, krok: Krok, ladunek: dict[str, Any]) -> str:
    koperta = {
        "project_id": ZASTEPCZY_PROJEKT,
        "snapshot_base_hash": ZASTEPCZY_SKROT_MIGAWKI,
        "operation": {
            "name": krok.operacja,
            "idempotency_key": f"przyklad-{numer:02d}",
            "payload": ladunek,
        },
    }
    return json.dumps(koperta, ensure_ascii=False, indent=2)


def _skutek(wynik: WynikKroku) -> str:
    tresc = wynik.odpowiedz
    if wynik.krok.odmowa is not None:
        return (
            f"Odpowiedź: HTTP {wynik.status_http}, odmowa nazwana `{tresc.get('error_code')}` — "
            f"„{tresc.get('error')}” Model bez zmian."
        )
    zmiany = tresc.get("changes") or {}
    zdarzenia = Counter(str(z["event_type"]) for z in tresc.get("domain_events") or [])
    opis_zdarzen = (
        ", ".join(
            f"`{typ}`" + (f" ×{liczba}" if liczba > 1 else "")
            for typ, liczba in sorted(zdarzenia.items())
        )
        or "brak"
    )
    wskazanie = (tresc.get("selection_hint") or {}).get("element_id")
    return (
        f"Odpowiedź: HTTP {wynik.status_http}; elementy utworzone "
        f"{len(zmiany.get('created_element_ids') or [])}, zmienione "
        f"{len(zmiany.get('updated_element_ids') or [])}, usunięte "
        f"{len(zmiany.get('deleted_element_ids') or [])}; zdarzenia: {opis_zdarzen}; "
        f"zaznaczenie: {f'`{wskazanie}`' if wskazanie else 'brak'}."
    )


class BladLancucha(AssertionError):
    """Krok łańcucha przykładów skończył się inaczej, niż deklaruje."""


def sprawdz_wynik(wynik: WynikKroku) -> None:
    tresc = wynik.odpowiedz
    kod = tresc.get("error_code") if isinstance(tresc, dict) else None
    if wynik.krok.odmowa is None and (wynik.status_http != 200 or tresc.get("error")):
        raise BladLancucha(
            f"przykład {wynik.krok.etykieta} ({wynik.krok.operacja}) odrzucony: "
            f"HTTP {wynik.status_http} {kod} {str(tresc)[:300]}"
        )
    if wynik.krok.odmowa is not None and kod != wynik.krok.odmowa:
        raise BladLancucha(
            f"przykład odmowy {wynik.krok.etykieta}: oczekiwany kod {wynik.krok.odmowa}, "
            f"jest {kod}"
        )


def render_przykladow(wyniki: list[WynikKroku]) -> str:
    linie: list[str] = []
    for numer, wynik in enumerate(wyniki, start=1):
        sprawdz_wynik(wynik)
        linie += [
            f"#### {numer}. `{wynik.krok.operacja}` — {wynik.krok.cel_pl}",
            "",
            "```json",
            _koperta(numer, wynik.krok, wynik.ladunek),
            "```",
            "",
            _skutek(wynik),
            "",
        ]
    return "\n".join(linie).rstrip("\n")


def bloki(wyniki: list[WynikKroku] | None = None) -> dict[str, str]:
    """Treść każdego bloku generowanego (bez znaczników)."""
    return {
        "rejestr-operacji": render_rejestru(lokalizacje_handlerow()),
        "ksztalty-ladunku": render_ksztaltow(),
        "ciagi-liniowe": render_ciagow(),
        "operacje-usuniete": render_usunietych(),
        "przyklady-operacji": render_przykladow(
            wyniki if wyniki is not None else wykonaj_lancuch()
        ),
        "zdarzenia-domenowe": render_zdarzen(),
    }


_WZORZEC_BLOKU = re.compile(
    r"(<!-- GENEROWANE:(?P<nazwa>[a-z-]+):POCZATEK -->\n)(?P<tresc>.*?)"
    r"(<!-- GENEROWANE:(?P=nazwa):KONIEC -->)",
    re.DOTALL,
)


def bloki_dokumentu(tresc: str) -> dict[str, str]:
    """Bloki generowane obecne w dokumencie (nazwa → treść)."""
    return {
        m.group("nazwa"): m.group("tresc").removesuffix("\n")
        for m in _WZORZEC_BLOKU.finditer(tresc)
    }


def wstaw_bloki(tresc: str, nowe: dict[str, str]) -> str:
    obecne = bloki_dokumentu(tresc)
    if set(obecne) != set(nowe):
        raise ValueError(
            f"dokument ma bloki {sorted(obecne)}, generator zna {sorted(nowe)} — popraw znaczniki"
        )
    return _WZORZEC_BLOKU.sub(
        lambda m: m.group(1) + nowe[m.group("nazwa")] + "\n" + m.group(4), tresc
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="zapisz dokument")
    args = parser.parse_args(argv)
    tresc = DOKUMENT.read_text(encoding="utf-8")
    nowa = wstaw_bloki(tresc, bloki())
    if args.write:
        DOKUMENT.write_text(nowa, encoding="utf-8")
        print(f"[zapisano] {DOKUMENT}")
        return 0
    if nowa != tresc:
        print(f"[rozjazd] {DOKUMENT} — {KOMENDA_REGENERACJI}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

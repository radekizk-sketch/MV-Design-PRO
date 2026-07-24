"""W1c (RECENZJA_MACIERZ_WYPOSAZENIA_2026-07 uwagi 1/2/3/9/10/15/16/17/18) —
KATALOG KONFIGURACJI PÓL jako źródło macierzy generatywnej.

Macierz wyposażenia pól L2 jest TESTEM REFERENCYJNYM SILNIKA (uwaga 16)
generowanym Z KATALOGU konfiguracji — nie z ręcznej listy przykładów (uwaga 17).
Źródłem przypadków jest ENUMERACJA realnych szablonów:

1. **kanoniczne** — `bay_templates.enumerate_canonical_configurations()`
   (10 szablonów `BAY_TEMPLATE_REGISTRY` + 2 warianty pola źródłowego SN, W2b),
2. **producenckie** — most `cell_configurations` → `primary_devices` dla packów
   producenckich, które niosą konfiguracje celek (ABB SafeRing, ABB UniGear,
   Schneider SM6, Siemens 8DJH). Pack producencki BEZ `cell_configurations` =
   jawny wpis rejestru braków (zero fabrykacji: nie wymyślamy celek).

Ta warstwa (reference_engine) MOŻE zależeć od katalogu producentów i od
`bay_templates` (kierunek zależności reference_engine → catalog, jak w
`compliance.py`). Most producencki porządkuje NIEUPORZĄDKOWANY zbiór aparatów
celki wg kanonicznego toru głównego (superset kolejności profili pól,
`registry.FIELD_PROFILE_REGISTRY`) i klasyfikuje aparaty boczne (ES/VT/SA)
funkcjonalnie na odgałęzienia (§18.1) — deterministycznie, bez heurystyk fizyki.
"""

from __future__ import annotations

from typing import Any

from network_model.catalog.bay_templates import (
    FIELD_TYPES_WITHOUT_TEMPLATE,
    enumerate_canonical_configurations,
)

from .registry import list_reference_packs

# Kanoniczny TOR GŁÓWNY (od szyny w dół) — superset kolejności profili pól
# (`registry.FIELD_PROFILE_REGISTRY`, `rmu_transformer.canonical_order`). DS
# występuje dwukrotnie: pozycja 0 = odłącznik SZYNOWY (UPSTREAM), pozycja 5 =
# odłącznik LINIOWY (DOWNSTREAM). Most producencki wstawia aparaty celki w
# TE sloty w kolejności kanonicznej — zero dopasowania pod przykłady (uwaga 17).
_MAIN_PATH_ORDER: tuple[str, ...] = (
    "DS",
    "LOAD_SWITCH",
    "CB",
    "FUSE",
    "CT",
    "DS",
    "CABLE_HEAD",
    "TRANSFORMER_DEVICE",
)

# Placement per slot toru głównego (indeks w `_MAIN_PATH_ORDER`). Lustro
# placement szablonów kanonicznych (`bay_templates`): odłącznik szynowy UPSTREAM,
# łączniki/CT MIDSTREAM, odłącznik liniowy/głowica/transformator DOWNSTREAM.
_MAIN_PATH_PLACEMENT: tuple[str, ...] = (
    "UPSTREAM",  # DS szynowy
    "MIDSTREAM",  # LOAD_SWITCH
    "MIDSTREAM",  # CB
    "MIDSTREAM",  # FUSE
    "MIDSTREAM",  # CT
    "DOWNSTREAM",  # DS liniowy
    "DOWNSTREAM",  # CABLE_HEAD
    "DOWNSTREAM",  # TRANSFORMER_DEVICE
)

# Aparaty BOCZNE (§18.1) — nigdy w osi toru głównego. ES/SA → odgałęzienie DO
# ZIEMI (GROUND_BRANCH, uwaga 6); VT → tor pomiarowy poza osią (OFF_PATH).
_LATERAL_PLACEMENT: dict[str, str] = {
    "ES": "GROUND_BRANCH",
    "SURGE_ARRESTER": "GROUND_BRANCH",
    "VT": "OFF_PATH",
}

# Deterministyczna kolejność wypisu aparatów bocznych (stabilny render/hash).
_LATERAL_ORDER: tuple[str, ...] = ("ES", "VT", "SURGE_ARRESTER")

_SWITCHABLE_KINDS = frozenset({"CB", "LOAD_SWITCH", "DS"})

# Kanoniczne oznaczenia Q per typ aparatu (lustro `bay_templates`) — deterministyczne,
# bez losowości. Drugi DS (liniowy) dostaje Q2 (patrz `_designation`).
_DESIGNATION_BY_KIND: dict[str, str] = {
    "DS": "Q1",
    "LOAD_SWITCH": "Q0",
    "CB": "Q0",
    "FUSE": "F1",
    "CT": "T1",
    "VT": "T2",
    "ES": "QE1",
    "SURGE_ARRESTER": "Z1",
    "CABLE_HEAD": "GK",
    "TRANSFORMER_DEVICE": "TR",
}


def _designation(kind: str, *, ds_slot: int) -> str:
    """Oznaczenie Q aparatu; drugi DS (slot liniowy) → Q2, pierwszy → Q1."""
    if kind == "DS" and ds_slot >= 1:
        return "Q2"
    return _DESIGNATION_BY_KIND.get(kind, kind)


def _producer_group(all_kinds: set[str]) -> str:
    """Grupa funkcjonalna (uwaga 15) celki producenckiej WYWIEDZIONA z sygnatury
    aparatury — katalogi producentów NIE deklarują `bay_kind` celki
    (`ReferenceCellConfiguration.bay_kind is None`), więc grupę wyprowadzamy z
    obecności glifów (transparentnie, zero fabrykacji roli). Zapisywane w
    rejestrze braków jako „grupa wywiedziona z sygnatury"."""
    if "TRANSFORMER_DEVICE" in all_kinds:
        return "transformatorowe"
    if "CABLE_HEAD" in all_kinds or ({"CB", "LOAD_SWITCH"} & all_kinds):
        return "liniowe"
    if {"CT", "VT"} & all_kinds:
        return "pomiarowe"
    return "specjalne"


def producer_cell_primary_devices(
    apparatus_kinds: list[str], *, config_ref: str
) -> list[dict[str, Any]]:
    """Most producencki: NIEUPORZĄDKOWANY zbiór aparatów celki (`cell.apparatus`)
    → uporządkowana lista aparatów pierwotnych pola (`primary_devices`, spec §12.1).

    Tor główny w kolejności kanonicznej (`_MAIN_PATH_ORDER`), aparaty boczne
    (ES/VT/SA) doklejone jako odgałęzienia (§18.1). `device_ref` deterministyczny
    (`config_ref` + pozycja) — ten sam wynik dla tej samej celki, zero seedu.
    """
    remaining: list[str] = list(apparatus_kinds)
    plan: list[tuple[str, str, str]] = []  # (kind, placement, designation)

    ds_slot = 0
    for slot_index, slot_kind in enumerate(_MAIN_PATH_ORDER):
        if slot_kind in remaining:
            remaining.remove(slot_kind)
            designation = _designation(slot_kind, ds_slot=ds_slot if slot_kind == "DS" else 0)
            if slot_kind == "DS":
                ds_slot += 1
            plan.append((slot_kind, _MAIN_PATH_PLACEMENT[slot_index], designation))

    for lateral_kind in _LATERAL_ORDER:
        while lateral_kind in remaining:
            remaining.remove(lateral_kind)
            plan.append(
                (lateral_kind, _LATERAL_PLACEMENT[lateral_kind], _DESIGNATION_BY_KIND[lateral_kind])
            )

    devices: list[dict[str, Any]] = []
    for position, (kind, placement, designation) in enumerate(plan):
        entry: dict[str, Any] = {
            "device_ref": f"{config_ref}::dev::{position}",
            "symbol_ref": f"symbol:{kind.lower()}",
            "kind": kind,
            "placement": placement,
            "is_controllable": kind in _SWITCHABLE_KINDS,
            "render_variant": "kanoniczny",
            "designation": designation,
        }
        if kind == "ES":
            entry["earthing_role"] = "field_earth"
        elif kind == "SURGE_ARRESTER":
            entry["earthing_role"] = "surge_ground"
        devices.append(entry)
    return devices


def _has_main_path(devices: list[dict[str, Any]]) -> bool:
    """Czy konfiguracja ma choć jeden aparat TORU GŁÓWNEGO (nie tylko boczne)?
    Celka złożona wyłącznie z ES/VT (np. moduł uziemnika szyn) NIE jest polem
    renderowalnym jako stos — nie da się z niej zbudować toru (buildBayStack
    rzuciłby „pusty stos aparatów"). Rejestrowana jako nie-renderowalna."""
    lateral = set(_LATERAL_PLACEMENT)
    return any(d["kind"] not in lateral for d in devices)


def enumerate_producer_configurations() -> tuple[list[dict[str, Any]], list[str], list[str]]:
    """Most producencki dla WSZYSTKICH packów z `cell_configurations`.

    Zwraca `(configurations, packs_without_cells, cells_without_main_path)`:
    - `configurations` — przypadki producenckie (renderowalne + nie), posortowane
      po `config_ref`,
    - `packs_without_cells` — packi PRODUCENCKIE bez `cell_configurations`
      (jawny rejestr braków — zero fabrykacji),
    - `cells_without_main_path` — celki bez toru głównego (nie-renderowalne).
    """
    configurations: list[dict[str, Any]] = []
    packs_without_cells: list[str] = []
    cells_without_main_path: list[str] = []

    for pack in list_reference_packs():
        if pack.kind != "manufacturer":
            continue
        if not pack.cell_configurations:
            packs_without_cells.append(pack.pack_id)
            continue
        for cell in pack.cell_configurations:
            config_ref = f"producent:{pack.pack_id}:{cell.cell_code}"
            kinds = [a.kind for a in cell.apparatus]
            devices = producer_cell_primary_devices(kinds, config_ref=config_ref)
            renderable = _has_main_path(devices)
            if not renderable:
                cells_without_main_path.append(config_ref)
            configurations.append(
                {
                    "config_ref": config_ref,
                    "source": "producencki",
                    "group": _producer_group(set(kinds)),
                    "group_derivation": "sygnatura_aparatury",
                    "bay_role": None,
                    "field_role": None,
                    "pack_id": pack.pack_id,
                    "cell_code": cell.cell_code,
                    "name": f"{pack.name_pl} — celka {cell.cell_code} ({cell.name_pl})",
                    "primary_devices": devices,
                    "renderable": renderable,
                }
            )

    return (
        sorted(configurations, key=lambda c: str(c["config_ref"])),
        sorted(packs_without_cells),
        sorted(cells_without_main_path),
    )


def enumerate_field_configurations() -> dict[str, Any]:
    """PEŁNY katalog konfiguracji pól — źródło macierzy generatywnej W1c.

    Deterministyczny (te same dane katalogu ⇒ identyczny wynik). Kanoniczne
    konfiguracje mają `renderable=True` (każdy szablon tworzy renderowalne pole);
    producenckie mogą być nie-renderowalne (celki bez toru głównego). Rejestr
    braków (`gaps`) jest JAWNY: packi bez celek, typy pól bez szablonu, celki bez
    toru głównego — zgodnie z zasadą „zero fabrykacji" (uwagi 9/16).
    """
    canonical = [{**entry, "renderable": True} for entry in enumerate_canonical_configurations()]
    producer, packs_without_cells, cells_without_main_path = enumerate_producer_configurations()

    return {
        "canonical": canonical,
        "producer": producer,
        "gaps": {
            "manufacturer_packs_without_cell_configurations": packs_without_cells,
            "field_types_without_template": list(FIELD_TYPES_WITHOUT_TEMPLATE),
            "producer_cells_without_main_path": cells_without_main_path,
        },
    }

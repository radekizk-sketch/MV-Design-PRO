"""
Deterministic SHA-256 hashing for EnergyNetworkModel.

Canonical JSON: sorted keys, no whitespace, exclude mutable header fields.

V12S-010 — Chain hashy:
  semantic_hash      — topologia + role + pasma napieciowe + catalog_ref
  input_hash         — wejscia obliczeniowe (R, X, B, Z0, Z2, dlugosci, ratingi,
                       sk3_mva, rx_ratio, vector_group, uk_percent)
  switching_snapshot_hash — TYLKO stany lacznikow (status open/closed)
  case_hash          — parametry przypadku obliczeniowego (analysis kind, scenario)
  variant_hash       — delty wariantu jako overlay (NIE oddzielny model)

Stary compute_enm_hash zostaje jako alias compute_input_hash dla wstecznej
kompatybilnosci (jednorazowy alias, deprecation w docstring, BEZ runtime warning,
zeby zachowac determinizm).

Kazda funkcja konsumuje TYLKO swoja krotke pol modelu — hashe sa ortogonalne.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from .models import EnergyNetworkModel

# ---------------------------------------------------------------------------
# Helper canonical dump
# ---------------------------------------------------------------------------

_ELEMENT_KEYS = (
    "buses",
    "branches",
    "transformers",
    "sources",
    "loads",
    "generators",
    "shunt_capacitors",
    "substations",
    "bays",
    "junctions",
    "corridors",
    "branch_points",
    "measurements",
    "protection_assignments",
)


def _strip_uuids(payload: dict[str, Any]) -> dict[str, Any]:
    """Usun losowe pola 'id' (UUID) z list elementow — ref_id jest tozsamoscia."""
    for key in _ELEMENT_KEYS:
        if key in payload and isinstance(payload[key], list):
            for item in payload[key]:
                if isinstance(item, dict):
                    item.pop("id", None)
    return payload


def _canonical_sha256(payload: dict[str, Any]) -> str:
    """Determinizm SHA-256 nad kanonicznym JSON (sorted keys, no whitespace)."""
    canonical = json.dumps(
        payload,
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _strip_keys(payload: dict[str, Any], keys: tuple[str, ...]) -> None:
    """Usun klucze rekurencyjnie z elementow listy 'value'."""
    for k in keys:
        payload.pop(k, None)


# ---------------------------------------------------------------------------
# Field projections per hash
# ---------------------------------------------------------------------------

# semantic_hash: topologia, role, pasma napieciowe, catalog_ref
# Excluded: parametry obliczeniowe (R/X/B/Z0/Z2), dlugosci, ratingi, switching state
_SEMANTIC_INCLUDE_BUS = ("ref_id", "name", "voltage_kv", "zone", "grounding")
_SEMANTIC_INCLUDE_BRANCH = (
    "ref_id",
    "name",
    "type",
    "from_bus_ref",
    "to_bus_ref",
    "catalog_ref",
    "catalog_namespace",
)
_SEMANTIC_INCLUDE_TRANSFORMER = (
    "ref_id",
    "name",
    "hv_bus_ref",
    "lv_bus_ref",
    "catalog_ref",
    "catalog_namespace",
    "vector_group",
)
_SEMANTIC_INCLUDE_SOURCE = (
    "ref_id",
    "name",
    "bus_ref",
    "model",
    "catalog_ref",
    "catalog_namespace",
    "gpz_section_id",
)
_SEMANTIC_INCLUDE_GENERATOR = (
    "ref_id",
    "name",
    "bus_ref",
    "gen_type",
    "connection_variant",
    "blocking_transformer_ref",
    "station_ref",
    "catalog_ref",
)
_SEMANTIC_INCLUDE_LOAD = ("ref_id", "name", "bus_ref", "model", "catalog_ref")
_SEMANTIC_INCLUDE_SHUNT_CAPACITOR = (
    "ref_id",
    "name",
    "bus_ref",
    "catalog_ref",
    "catalog_namespace",
)
_SEMANTIC_INCLUDE_BAY = (
    "ref_id",
    "name",
    "bay_role",
    "substation_ref",
    "bus_ref",
    "gpz_section_id",
)
_SEMANTIC_INCLUDE_SUBSTATION = (
    "ref_id",
    "name",
    "station_type",
    "bus_refs",
    "transformer_refs",
    "entry_point_ref",
    # P0.1 nN (karta P0.1 pkt 7): sekcje rozdzielnicy nN sa TOPOLOGIA (ktora szyna
    # nalezy do ktorej sekcji, sprzeglo) — pominiecie byloby cicha dziura w
    # inwalidacji semantycznej (zmiana sekcjonowania RGnN nie zmieniłaby
    # semantic_hash mimo zmiany struktury sieci).
    "nn_sections",
)


def _project(item: dict[str, Any], include: tuple[str, ...]) -> dict[str, Any]:
    return {k: item[k] for k in include if k in item}


def _semantic_payload(enm: EnergyNetworkModel) -> dict[str, Any]:
    raw = enm.model_dump(mode="json", exclude={"header"})
    return {
        "buses": [_project(b, _SEMANTIC_INCLUDE_BUS) for b in raw.get("buses", [])],
        "branches": [_project(b, _SEMANTIC_INCLUDE_BRANCH) for b in raw.get("branches", [])],
        "transformers": [
            _project(t, _SEMANTIC_INCLUDE_TRANSFORMER) for t in raw.get("transformers", [])
        ],
        "sources": [_project(s, _SEMANTIC_INCLUDE_SOURCE) for s in raw.get("sources", [])],
        "generators": [_project(g, _SEMANTIC_INCLUDE_GENERATOR) for g in raw.get("generators", [])],
        "loads": [_project(ld, _SEMANTIC_INCLUDE_LOAD) for ld in raw.get("loads", [])],
        "shunt_capacitors": [
            _project(sc, _SEMANTIC_INCLUDE_SHUNT_CAPACITOR)
            for sc in raw.get("shunt_capacitors", [])
        ],
        "bays": [_project(b, _SEMANTIC_INCLUDE_BAY) for b in raw.get("bays", [])],
        "substations": [
            _project(s, _SEMANTIC_INCLUDE_SUBSTATION) for s in raw.get("substations", [])
        ],
    }


def _input_payload(enm: EnergyNetworkModel) -> dict[str, Any]:
    """Pelny model bez header.{updated_at, created_at, hash_sha256, *_hash}
    i bez UUID, BEZ pol switching state (status branch).
    """
    data = enm.model_dump(
        mode="json",
        exclude={
            "header": {
                "updated_at",
                "created_at",
                "hash_sha256",
                "semantic_hash",
                "input_hash",
                "case_hash",
                "variant_hash",
                "switching_snapshot_hash",
            }
        },
    )
    _strip_uuids(data)
    # Switching state nie powinno wplywac na input_hash (V12S-010 ortogonalnosc).
    for branch in data.get("branches", []):
        if isinstance(branch, dict):
            branch.pop("status", None)
    return data


def _switching_snapshot_payload(enm: EnergyNetworkModel) -> dict[str, Any]:
    """TYLKO stany lacznikow — galezie z polem 'status' (open/closed)."""
    raw = enm.model_dump(mode="json", exclude={"header"})
    return {
        "branches": [
            {"ref_id": b.get("ref_id"), "status": b.get("status")}
            for b in raw.get("branches", [])
            if "status" in b
        ],
    }


# ---------------------------------------------------------------------------
# Public hash API
# ---------------------------------------------------------------------------


def compute_semantic_hash(enm: EnergyNetworkModel) -> str:
    """V12S-010: hash topologii + rol + pasm napieciowych + catalog_ref.

    Niewrazliwy na: zmiany dlugosci, R/X/B/Z0/Z2, ratingi, sk3_mva, switching state.
    """
    return _canonical_sha256(_semantic_payload(enm))


def compute_input_hash(enm: EnergyNetworkModel) -> str:
    """V12S-010: hash pelnych wejsc obliczeniowych BEZ switching state.

    Wrazliwy na: parametry (R, X, B, Z0, Z2, dlugosci, ratingi, sk3_mva, rx_ratio,
    uk_percent, vector_group). Niewrazliwy na: stany lacznikow.

    Backward-compat: zachowuje semantyke poprzedniego compute_enm_hash poza
    wykluczeniem switching state (zmiana intencjonalna pod V12S-010).
    """
    return _canonical_sha256(_input_payload(enm))


def compute_switching_snapshot_hash(enm: EnergyNetworkModel) -> str:
    """V12S-010: hash TYLKO stanow lacznikow (status open/closed na galeziach)."""
    return _canonical_sha256(_switching_snapshot_payload(enm))


def compute_case_hash(case_payload: dict[str, Any]) -> str:
    """V12S-010: hash parametrow przypadku obliczeniowego.

    case_payload zawiera np. analysis_type, scenario_ref, normy, fault_location
    — wszystko poza ENM samym w sobie.
    """
    return _canonical_sha256(case_payload)


def compute_variant_hash(variant_payload: dict[str, Any]) -> str:
    """V12S-010: hash delty wariantu (overlay).

    Wariant to tylko delta nakladana na model — NIE oddzielny model
    (V12S-010 mityguje ryzyko Single Model rule).
    """
    return _canonical_sha256(variant_payload)


#: Pola naglowka wykluczane z hasha modelu — JEDNA lista dla `compute_enm_hash`
#: (hash z obiektu) i `hash_migawki_enm` (hash ze slownika `model_dump`): oba
#: odciski musza byc rowne co do bitu dla tej samej tresci (przypiete testem
#: `tests/enm/test_scenariusze.py::test_hash_migawki_rowny_hashowi_modelu`).
_POLA_NAGLOWKA_POZA_HASHEM = (
    "updated_at",
    "created_at",
    "hash_sha256",
    # Warunki przyłączenia OSD (dane WEJŚCIOWE dokumentu, czytane w warstwie
    # interpretacji — nie przez solver). Wykluczone jak pozostałe pola zmienne
    # nagłówka: deklaracja pola w ENMHeader (naprawa defektu utrwalania, karta
    # POMIAR-RODZAJ) nie może przestawić odcisków istniejących modeli.
    "connection_conditions",
)


def hash_migawki_enm(snapshot: dict[str, Any]) -> str:
    """Hash modelu policzony ze SLOWNIKA migawki (`EnergyNetworkModel.model_dump(mode="json")`).

    Ta sama regula co `compute_enm_hash` (te same wykluczenia naglowka, te same
    usuniete UUID elementow, ten sam kanoniczny JSON), ale bez odtwarzania obiektu
    modelu — dla migawek efektywnych scenariuszy (CV-3.1, `enm/scenariusze.py`),
    ktore powstaja jako slowniki z narzuconymi nadpisaniami i sa hashowane
    setki razy (sondy zdolnosci przylaczeniowej). Rownosc z `compute_enm_hash`
    dla migawki bez nadpisan jest przypieta testem; migawka przekazana przez
    wolajacego NIE jest modyfikowana (praca na glebokiej kopii).
    """
    data = _kopia_pod_hash(snapshot)
    _strip_uuids(data)
    return _canonical_sha256(data)


def _kopia_pod_hash(snapshot: dict[str, Any]) -> dict[str, Any]:
    """Kopia migawki dokladnie tak gleboka, jak siegaja mutacje hashowania:
    naglowek bez pol zmiennych, elementy list skopiowane plytko (z nich znika
    wylacznie `id`). Zadna struktura wolajacego nie jest dotykana."""
    data: dict[str, Any] = {}
    for klucz, wartosc in snapshot.items():
        if klucz == "header" and isinstance(wartosc, dict):
            data[klucz] = {k: v for k, v in wartosc.items() if k not in _POLA_NAGLOWKA_POZA_HASHEM}
        elif klucz in _ELEMENT_KEYS and isinstance(wartosc, list):
            data[klucz] = [dict(item) if isinstance(item, dict) else item for item in wartosc]
        else:
            data[klucz] = wartosc
    return data


def compute_enm_hash(enm: EnergyNetworkModel) -> str:
    """DEPRECATED w docstring (BEZ runtime warning — determinizm zachowany).

    Zachowuje DOKLADNIE oryginalna semantyke sprzed V12S-010 (switching state
    wlaczone w hash) dla wstecznej kompatybilnosci z istniejacymi stored hashes.

    Nowy kod powinien uzywac jednej z funkcji ortogonalnych:

      compute_semantic_hash           — topologia + role + pasma + catalog_ref
      compute_input_hash              — wejscia obliczeniowe BEZ switching
      compute_switching_snapshot_hash — TYLKO stany lacznikow
      compute_case_hash               — parametry przypadku
      compute_variant_hash            — delty wariantu
    """
    data = enm.model_dump(mode="json", exclude={"header": set(_POLA_NAGLOWKA_POZA_HASHEM)})
    _strip_uuids(data)
    return _canonical_sha256(data)

"""D4 (RECENZJA_DER_SN_DOBORY_2026-07): ekstrakcja ZMATERIALIZOWANEGO toru DER-SN
z dokumentu ENM — wspólne źródło prawdy dla raportu zgodności (wymaganie 13) oraz
listy materiałowej / BOM (domyka jawny dług BOM z V12K-094/096).

Źródłem prawdy jest MODEL DOMENOWY (snapshot ENM), NIE payload kreatora ani UI:
generator (falownik) niesie w ``meta`` referencje wszystkich ogniw toru
zmaterializowanego przez ``_add_converter_source_der_sn`` (szyna nN producenta →
TR blokowy → kabel SN → pole źródłowe SN → szyna SN stacji). Ten moduł czyta te
referencje i składa uporządkowany, deterministyczny widok toru.

ZERO fizyki: wyłącznie odczyt zmaterializowanych elementów i danych tabliczkowych.
Warstwa aplikacyjna (interpretacja), nie solver.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


def _as_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


@dataclass(frozen=True)
class DerSnTrack:
    """Zmaterializowany tor DER-SN złożony z REALNYCH elementów ENM.

    Każde pole to słownik elementu ze snapshotu ENM (albo ``None``, gdy ogniwo nie
    zostało odnalezione — uczciwy brak, nie fabrykacja). ``field_spec`` pochodzi z
    ``meta.field_specs`` stacji; ``apparatus`` to gałąź aparatu głównego pola SN.
    """

    generator: dict[str, Any]
    producer_bus: dict[str, Any] | None
    block_hv_bus: dict[str, Any] | None
    block_transformer: dict[str, Any] | None
    mv_cable: dict[str, Any] | None
    field_spec: dict[str, Any] | None
    apparatus: dict[str, Any] | None
    mv_bus: dict[str, Any] | None

    @property
    def source_ref(self) -> str:
        return str(self.generator.get("ref_id") or "")

    @property
    def source_name(self) -> str:
        return str(self.generator.get("name") or self.source_ref)


def _index_by_ref(items: list[Any]) -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    for item in items:
        if isinstance(item, dict):
            ref = item.get("ref_id")
            if isinstance(ref, str):
                index[ref] = item
    return index


def is_der_sn_generator(generator: dict[str, Any]) -> bool:
    """Czy generator to zmaterializowany falownik toru DER-SN (ma dedykowane pole SN)."""
    meta = generator.get("meta")
    if not isinstance(meta, dict):
        return False
    return bool(meta.get("der_mv_field_ref")) and bool(meta.get("block_transformer_ref"))


def list_der_sn_generators(enm: dict[str, Any]) -> list[dict[str, Any]]:
    """Wszystkie falowniki toru DER-SN w modelu (posortowane deterministycznie po ref_id)."""
    generators = enm.get("generators")
    if not isinstance(generators, list):
        return []
    matched = [g for g in generators if isinstance(g, dict) and is_der_sn_generator(g)]
    return sorted(matched, key=lambda g: str(g.get("ref_id") or ""))


def resolve_generator(enm: dict[str, Any], generator_ref: str | None) -> dict[str, Any] | None:
    """Rozwiąż falownik toru: po ``generator_ref`` albo ostatni zmaterializowany tor DER-SN.

    Bez ``generator_ref`` wybieramy DETERMINISTYCZNIE ostatni (po ref_id) tor DER-SN —
    najczęściej właśnie dodany w kreatorze. Zwraca ``None``, gdy brak toru DER-SN.
    """
    generators = enm.get("generators")
    if not isinstance(generators, list):
        return None
    if generator_ref:
        for generator in generators:
            if isinstance(generator, dict) and generator.get("ref_id") == generator_ref:
                return generator if is_der_sn_generator(generator) else None
        return None
    der_generators = list_der_sn_generators(enm)
    return der_generators[-1] if der_generators else None


def _field_spec_for(enm: dict[str, Any], field_ref: str | None) -> dict[str, Any] | None:
    if not field_ref:
        return None
    for station in enm.get("substations") or []:
        if not isinstance(station, dict):
            continue
        meta = station.get("meta")
        if not isinstance(meta, dict):
            continue
        for spec in meta.get("field_specs") or []:
            if isinstance(spec, dict) and spec.get("field_ref") == field_ref:
                return spec
    return None


def _apparatus_for(
    branch_index: dict[str, dict[str, Any]], field_ref: str | None
) -> dict[str, Any] | None:
    if not field_ref:
        return None
    candidates = [
        branch
        for branch in branch_index.values()
        if isinstance(branch.get("meta"), dict)
        and branch["meta"].get("field_ref") == field_ref
        and "der_source_field_device" in (branch.get("tags") or [])
    ]
    if not candidates:
        return None
    return sorted(candidates, key=lambda b: str(b.get("ref_id") or ""))[0]


def extract_der_sn_track(
    enm: dict[str, Any], generator_ref: str | None = None
) -> DerSnTrack | None:
    """Zbuduj widok toru DER-SN z referencji zapisanych w ``meta`` falownika.

    Zwraca ``None``, gdy w modelu nie ma toru DER-SN (uczciwy brak). Ogniwa
    nieodnalezione po referencji zostają ``None`` (raport/BOM oznajmiają to jawnie).
    """
    generator = resolve_generator(enm, generator_ref)
    if generator is None:
        return None
    meta = generator.get("meta") if isinstance(generator.get("meta"), dict) else {}

    bus_index = _index_by_ref(enm.get("buses") or [])
    tr_index = _index_by_ref(enm.get("transformers") or [])
    branch_index = _index_by_ref(enm.get("branches") or [])

    field_ref = meta.get("der_mv_field_ref")
    field_spec = _field_spec_for(enm, field_ref if isinstance(field_ref, str) else None)

    return DerSnTrack(
        generator=generator,
        producer_bus=bus_index.get(str(meta.get("der_producer_bus_ref") or "")),
        block_hv_bus=bus_index.get(str(meta.get("der_block_hv_bus_ref") or "")),
        block_transformer=tr_index.get(str(meta.get("block_transformer_ref") or "")),
        mv_cable=branch_index.get(str(meta.get("der_mv_cable_ref") or "")),
        field_spec=field_spec,
        apparatus=_apparatus_for(branch_index, field_ref if isinstance(field_ref, str) else None),
        mv_bus=bus_index.get(str(meta.get("der_mv_bus_ref") or "")),
    )


def transformer_current_a(track: DerSnTrack) -> float | None:
    """Prąd znamionowy TR blokowego (strona SN) z tabliczki: I = S / (√3·U)."""
    from enm.der_sn_validation import rated_current_a

    if track.block_transformer is None:
        return None
    sn_mva = _as_float(track.block_transformer.get("sn_mva")) or 0.0
    primary_kv = _as_float(track.block_transformer.get("uhv_kv"))
    if primary_kv is None and track.block_hv_bus is not None:
        primary_kv = _as_float(track.block_hv_bus.get("voltage_kv"))
    if primary_kv is None:
        return None
    return rated_current_a(sn_mva, primary_kv)


def sum_apparent_power_mva(track: DerSnTrack) -> float:
    """ΣS falowników toru z ΣP i cosφ znamionowego (D1 ``converter_apparent_power_mva``)."""
    from enm.der_sn_validation import converter_apparent_power_mva

    p_mw = _as_float(track.generator.get("p_mw")) or 0.0
    materialized = (
        track.generator.get("materialized_params")
        if isinstance(track.generator.get("materialized_params"), dict)
        else {}
    )
    cos_phi = _as_float(materialized.get("cosphi"))
    return converter_apparent_power_mva(p_mw, cos_phi)

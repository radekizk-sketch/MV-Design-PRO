"""D4 (RECENZJA_DER_SN_DOBORY_2026-07, BOM): lista materiałowa toru DER-SN.

Domyka jawny dług BOM (V12K-094/096: „BOM/zestawienie materialowe POZA zakresem —
brak generatora"). Generator listy działa WYŁĄCZNIE na ZMATERIALIZOWANYCH elementach
toru DER-SN ze snapshotu ENM (szyna nN producenta, TR blokowy z typem katalogowym i
grupą, kabel SN z typem/przekrojem/długością, pole źródłowe SN z aparatem, falowniki).
Źródło prawdy = model domenowy, NIE payload kreatora ani UI.

Determinizm: pozycje sortowane po (kolejność kategorii, catalog_ref/ref); numer
porządkowy nadany po sortowaniu. Zero timestampów w treści (metadane dokumentu
niesie magazyn F-E8.3). ZERO fizyki — wyłącznie dane tabliczkowe/katalogowe.
"""

from __future__ import annotations

from typing import Any

from application.analyses.der_sn_track import (
    DerSnTrack,
    extract_der_sn_track,
)

# Deterministyczna kolejność kategorii pozycji (tor od strony sieci do falownika).
_CATEGORY_ORDER: dict[str, int] = {
    "transformator_blokowy": 0,
    "kabel_sn": 1,
    "pole_zrodlowe_sn": 2,
    "szyna_nn_producenta": 3,
    "falownik": 4,
}


def _as_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _round(value: float | None, digits: int = 3) -> float | None:
    return None if value is None else round(value, digits)


def _clean(params: dict[str, Any]) -> dict[str, Any]:
    """Usuń klucze ``None`` (kontrakt addytywny, exclude_none)."""
    return {k: v for k, v in params.items() if v is not None}


def _transformer_position(track: DerSnTrack) -> dict[str, Any] | None:
    tr = track.block_transformer
    if tr is None:
        return None
    return {
        "kategoria": "transformator_blokowy",
        "element": "Transformator blokowy DER",
        "catalog_ref": tr.get("catalog_ref"),
        "ref_id": tr.get("ref_id"),
        "parametry": _clean(
            {
                "sn_mva": _round(_as_float(tr.get("sn_mva"))),
                "uhv_kv": _round(_as_float(tr.get("uhv_kv"))),
                "ulv_kv": _round(_as_float(tr.get("ulv_kv"))),
                "uk_percent": _round(_as_float(tr.get("uk_percent"))),
                "grupa_polaczen": tr.get("vector_group"),
            }
        ),
        "ilosc": 1,
        "jednostka": "szt.",
    }


def _cable_position(track: DerSnTrack) -> dict[str, Any] | None:
    cable = track.mv_cable
    if cable is None:
        return None
    rating = cable.get("rating") if isinstance(cable.get("rating"), dict) else {}
    length_km = _as_float(cable.get("length_km"))
    return {
        "kategoria": "kabel_sn",
        "element": "Kabel SN przyłączeniowy",
        "catalog_ref": cable.get("catalog_ref"),
        "ref_id": cable.get("ref_id"),
        "parametry": _clean(
            {
                "przekroj_mm2": _round(_as_float(cable.get("cross_section_mm2")), 1),
                "obciazalnosc_a": _round(_as_float(rating.get("in_a")), 1),
                "dlugosc_km": _round(length_km),
            }
        ),
        "dlugosc_km": _round(length_km),
        "ilosc": _round(length_km),
        "jednostka": "km",
    }


def _apparatus_position(track: DerSnTrack) -> dict[str, Any] | None:
    apparatus = track.apparatus
    if apparatus is None:
        return None
    meta = apparatus.get("meta") if isinstance(apparatus.get("meta"), dict) else {}
    return {
        "kategoria": "pole_zrodlowe_sn",
        "element": "Aparat główny pola źródłowego SN",
        "catalog_ref": apparatus.get("catalog_ref"),
        "ref_id": apparatus.get("ref_id"),
        "parametry": _clean(
            {
                "rodzaj_aparatu": meta.get("apparatus_kind"),
                "typ_galezi": apparatus.get("type"),
            }
        ),
        "ilosc": 1,
        "jednostka": "szt.",
    }


def _producer_bus_position(track: DerSnTrack) -> dict[str, Any] | None:
    bus = track.producer_bus
    if bus is None:
        return None
    return {
        "kategoria": "szyna_nn_producenta",
        "element": "Szyna nN producenta",
        "catalog_ref": None,
        "ref_id": bus.get("ref_id"),
        "parametry": _clean({"napiecie_kv": _round(_as_float(bus.get("voltage_kv")))}),
        "ilosc": 1,
        "jednostka": "szt.",
    }


def _inverter_position(track: DerSnTrack) -> dict[str, Any]:
    gen = track.generator
    materialized = (
        gen.get("materialized_params") if isinstance(gen.get("materialized_params"), dict) else {}
    )
    quantity = gen.get("quantity") or gen.get("n_parallel") or 1
    try:
        quantity_int = max(1, int(quantity))
    except (TypeError, ValueError):
        quantity_int = 1
    return {
        "kategoria": "falownik",
        "element": "Falownik / moduł wytwórczy",
        "catalog_ref": gen.get("catalog_ref"),
        "ref_id": gen.get("ref_id"),
        "parametry": _clean(
            {
                "typ": gen.get("gen_type"),
                "un_kv": _round(_as_float(materialized.get("un_kv"))),
                "sn_mva": _round(_as_float(materialized.get("sn_mva"))),
                "pmax_mw": _round(_as_float(materialized.get("pmax_mw"))),
            }
        ),
        "ilosc": quantity_int,
        "jednostka": "szt.",
    }


def build_bom_from_track(track: DerSnTrack) -> dict[str, Any]:
    """Zbuduj deterministyczną listę materiałową z gotowego widoku toru."""
    # Kategoria ogniwa MUSI być znana zanim zapytamy budowniczego — brakujące ogniwo
    # zwraca ``None`` i wtedy nie ma z czego odczytać nazwy kategorii. Wcześniej
    # `braki_ogniw` liczono jako ``p["kategoria"] for p in raw if p is None``, co przy
    # KAŻDYM niekompletnym torze wywracało generator na `TypeError` (`None` nie jest
    # indeksowalny) i sprawiało, że pole `braki_ogniw` nigdy nie działało. Testy tego
    # nie łapały, bo ćwiczyły wyłącznie tor kompletny.
    raw: list[tuple[str, dict[str, Any] | None]] = [
        ("transformator_blokowy", _transformer_position(track)),
        ("kabel_sn", _cable_position(track)),
        ("pole_zrodlowe_sn", _apparatus_position(track)),
        ("szyna_nn_producenta", _producer_bus_position(track)),
        ("falownik", _inverter_position(track)),
    ]
    positions = [position for _kategoria, position in raw if position is not None]
    positions.sort(
        key=lambda p: (
            _CATEGORY_ORDER.get(str(p["kategoria"]), 99),
            str(p.get("catalog_ref") or ""),
            str(p.get("ref_id") or ""),
        )
    )
    for index, position in enumerate(positions, start=1):
        position["lp"] = index

    braki = [kategoria for kategoria, position in raw if position is None]
    return {
        "wersja": "1.0",
        "source_ref": track.source_ref,
        "source_name": track.source_name,
        "pozycje": positions,
        "count": len(positions),
        "braki_ogniw": braki,
    }


def build_bom_view(enm: dict[str, Any], generator_ref: str | None = None) -> dict[str, Any] | None:
    """Zbuduj listę materiałową toru DER-SN z modelu. ``None`` gdy brak toru DER-SN."""
    track = extract_der_sn_track(enm, generator_ref)
    if track is None:
        return None
    return build_bom_from_track(track)

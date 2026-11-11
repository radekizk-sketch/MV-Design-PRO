"""Kaskadowy dobór toru DER po stronie SN: transformator blokowy → kabel SN → aparat pola SN.

JEDNA orkiestracja doboru dla trzech konsumentów:

* podgląd kreatora źródła OZE (`POST /api/solver/der-selection-preview`,
  `api/grid_source_preview.py`),
* sekcja odstępstw dokumentu zgodności toru DER-SN (`api/der_sn_documents.py`),
* szablony stacji z jednostkami przyłączonymi po stronie SN
  (`application/station_templates/apply.py`): każda jednostka dostaje WŁASNY, jawny
  transformator blokowy nN/SN z katalogu na ścieżce mocy (rozstrzygnięcie architekta
  2026-10-15 — transformator blokowy nie może być ukryty w pozycji katalogowej 15 kV ani
  być transformatorem stacji, przez który moc źródła nie płynie).

Przed tym modułem kandydaci katalogu i kolejność kroków kaskady żyły w module API podglądu,
a dokument DER-SN dobierał transformator z domyślnymi tolerancjami silnika zamiast stałych
D1 (`enm.der_sn_validation`) — dwa niezależne warunki, które dziś dają tę samą liczbę.

Warstwa aplikacyjna: ZERO fizyki. Progi i porównania liczy silnik doboru
(`network_model.solvers.der_selection_preview`), prąd znamionowy TR — `enm.der_sn_validation.
rated_current_a`, spadek napięcia — przelicznik kabla wołany przez silnik.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from domain.generator_validation import BEZ_REDUKCJI
from enm.der_sn_validation import rated_current_a
from enm.nazwy_elementow import nazwa_pozycji_katalogu
from network_model.catalog.mv_cable_line_catalog import get_all_cable_types
from network_model.catalog.mv_switch_catalog import get_all_switch_equipment_types
from network_model.catalog.mv_transformer_catalog import get_sn_nn_transformer_types
from network_model.odmowa_danych import OdmowaDanychError
from network_model.pochodne import kv_na_v
from network_model.pochodne.pasma_napieciowe import pasmo_napieciowe
from network_model.solvers.cable_ampacity_derating import wspolczynniki_z_opisu
from network_model.solvers.der_selection_preview import (
    BlockTransformerCandidate,
    BlockTransformerSelectionInput,
    BlockTransformerSelectionResult,
    CableCandidate,
    CableSelectionInput,
    CableSelectionResult,
    FieldApparatusCandidate,
    FieldApparatusSelectionInput,
    FieldApparatusSelectionResult,
    propose_block_transformer,
    propose_mv_cable,
    propose_mv_field_apparatus,
)

#: Dopuszczalny spadek napięcia kabla toru [%] przyjmowany, gdy wołający go nie podaje —
#: ta sama wartość jest domyślną żądania podglądu kreatora.
MAKS_SPADEK_NAPIECIA_KABLA_PCT = 2.0
#: Charakter mocy biernej falownika w doborze kabla, gdy wołający go nie podaje (pobór Q).
CHARAKTER_MOCY_BIERNEJ_DOMYSLNY = "inductive"


class NosnikCosPhi(Protocol):
    """Nośnik jawnego cosφ falownika (żądanie podglądu, jawne wejścia kontroli mocy)."""

    @property
    def cos_phi(self) -> float | None: ...


def cos_phi_doboru_kabla(zrodlo: NosnikCosPhi) -> float:
    """cosφ prądu toru w doborze kabla (ΔU): jawny cosφ falownika, a bez niego 1,0
    (sama moc czynna — człon bierny ΔU znika).

    JEDNA reguła dla podglądu kreatora (żądanie podglądu), sprawdzenia odstępstw dokumentu
    DER-SN (jawne wejścia zapisane przez tor tworzenia) i szablonów stacji. Podstawienie
    1,0 za brak cosφ jest długiem nazwanym w `solver_input_substitute_guard` (jeden wpis
    dla tej funkcji); funkcja przyjmuje nośnik z polem `cos_phi`, żeby forma podstawienia
    pozostała widoczna dla skanera strażnika."""
    return zrodlo.cos_phi if zrodlo.cos_phi is not None else 1.0


def kandydaci_transformatorow_blokowych() -> tuple[BlockTransformerCandidate, ...]:
    """Transformatory SN/nN katalogu z mocą i napięciami (kandydaci doboru TR blokowego)."""
    candidates: list[BlockTransformerCandidate] = []
    for record in get_sn_nn_transformer_types():
        params = record.get("params") or {}
        sn_mva = params.get("rated_power_mva")
        primary_kv = params.get("voltage_hv_kv")
        secondary_kv = params.get("voltage_lv_kv")
        if sn_mva is None or primary_kv is None or secondary_kv is None:
            continue
        candidates.append(
            BlockTransformerCandidate(
                catalog_ref=str(record["id"]),
                name=nazwa_pozycji_katalogu(record),
                sn_mva=float(sn_mva),
                primary_kv=float(primary_kv),
                secondary_kv=float(secondary_kv),
                uk_percent=(
                    float(params["uk_percent"]) if params.get("uk_percent") is not None else None
                ),
                vector_group=params.get("vector_group"),
            )
        )
    return tuple(candidates)


def _opcjonalna_liczba(value: Any) -> float | None:
    """Liczba katalogowa albo None — brak danej nie może stać się zerem."""
    return float(value) if value is not None else None


def kandydaci_kabli_sn() -> tuple[CableCandidate, ...]:
    """Kable katalogu z kompletem danych doboru (przekrój, obciążalność, impedancja)."""
    candidates: list[CableCandidate] = []
    for record in get_all_cable_types():
        params = record.get("params") or {}
        cross = params.get("cross_section_mm2")
        ampacity = params.get("rated_current_a")
        r_km = params.get("r_ohm_per_km")
        x_km = params.get("x_ohm_per_km")
        # Katalog-first: pomijamy rekordy niekompletne (brak obciążalności/impedancji).
        if cross is None or ampacity is None or r_km is None or x_km is None:
            continue
        candidates.append(
            CableCandidate(
                catalog_ref=str(record["id"]),
                name=nazwa_pozycji_katalogu(record),
                cross_section_mm2=float(cross),
                rated_current_a=float(ampacity),
                r_ohm_per_km=float(r_km),
                x_ohm_per_km=float(x_km),
                voltage_rating_kv=(
                    float(params["voltage_rating_kv"])
                    if params.get("voltage_rating_kv") is not None
                    else None
                ),
                # V12K-224: dane cieplne kandydata. Bez nich kryterium wytrzymałości
                # zwarciowej żyły (IEC 60949) było w doborze kabla ZAKODOWANE, ale
                # nigdy nie odpalało — żaden z 63 typów nie miał czym być sprawdzony,
                # a odrzucenie „wytrzymalosc_zwarciowa_niewystarczajaca" było martwe.
                ith_1s_a=_opcjonalna_liczba(params.get("ith_1s_a")),
                jth_1s_a_per_mm2=_opcjonalna_liczba(params.get("jth_1s_a_per_mm2")),
                conductor_material=(
                    str(params["conductor_material"])
                    if params.get("conductor_material") is not None
                    else None
                ),
                insulation=(
                    str(params["insulation_type"])
                    if params.get("insulation_type") is not None
                    else None
                ),
                temp_operating_c=_opcjonalna_liczba(params.get("max_temperature_c")),
                temp_short_circuit_c=_opcjonalna_liczba(params.get("short_circuit_temperature_c")),
            )
        )
    return tuple(candidates)


def kandydaci_aparatow_pola_sn() -> tuple[FieldApparatusCandidate, ...]:
    """Aparatura SN katalogu z rodzajem, napięciem i prądem znamionowym.

    Pozycje spoza pasma SN (łączniki topologii zasilania 110 kV, U_m 123 kV) nie są
    kandydatami aparatu pola SN: napięciowo „wystarczają”, ale aparat WN w polu SN nie
    jest propozycją doboru, tylko pomyłką klasy napięcia. ``ik_ka = None`` to brak danej
    z karty i tak przechodzi do propozycji (nigdy 0.0 — bramka KAT-T-050).
    """
    candidates: list[FieldApparatusCandidate] = []
    for record in get_all_switch_equipment_types():
        params = record.get("params") or {}
        kind = params.get("equipment_kind")
        un_kv = params.get("un_kv")
        in_a = params.get("in_a")
        if kind is None or un_kv is None or in_a is None:
            continue
        if pasmo_napieciowe(float(un_kv)) != "SN":
            continue
        candidates.append(
            FieldApparatusCandidate(
                catalog_ref=str(record["id"]),
                name=nazwa_pozycji_katalogu(record),
                equipment_kind=str(kind),
                un_kv=float(un_kv),
                in_a=float(in_a),
                ik_ka=(float(params["ik_ka"]) if params.get("ik_ka") is not None else None),
            )
        )
    return tuple(candidates)


def dobierz_transformator_blokowy(
    *,
    moc_pozorna_mva: float,
    napiecie_sn_kv: float,
    napiecie_falownika_kv: float,
    wspolczynnik_jednoczesnosci: float = BEZ_REDUKCJI,
    przeciazalnosc_pu: float = BEZ_REDUKCJI,
    rezerwa_pu: float = 0.0,
) -> BlockTransformerSelectionResult:
    """Dobór TR blokowego z katalogu (równość napięć znamionowych D1) — jedna funkcja dla
    kaskady i dla odstępstw dokumentu DER-SN. `OdmowaDanychError` — wejście poza dziedziną."""
    return propose_block_transformer(
        BlockTransformerSelectionInput(
            sum_apparent_power_mva=moc_pozorna_mva,
            primary_voltage_kv=napiecie_sn_kv,
            secondary_voltage_kv=napiecie_falownika_kv,
            candidates=kandydaci_transformatorow_blokowych(),
            simultaneity_factor=wspolczynnik_jednoczesnosci,
            reserve_pu=rezerwa_pu,
            loadability_pu=przeciazalnosc_pu,
        )
    )


@dataclass(frozen=True)
class OpisUlozeniaKabla:
    """Warunki UŁOŻENIA kabla toru (V12K-207, F-K7): nazwa zestawu albo współczynniki
    własne z opisem. Brak opisu = warunki katalogowe (nazwane w wyniku doboru)."""

    set_name: str | None = None
    f_grunt: float | None = None
    f_wiazka: float | None = None
    f_grupa: float | None = None
    opis_pl: str | None = None


@dataclass(frozen=True)
class WynikDoboruToruDerSn:
    """Wynik kaskady — WHITE BOX każdego kroku (próg, odrzuceni kandydaci z powodem).
    `kabel` i `aparat_pola` są `None`, gdy nie ma propozycji transformatora (kaskada kabla
    i pola zależy od prądu SN zaproponowanego TR)."""

    moc_pozorna_mva: float
    transformator: BlockTransformerSelectionResult
    prad_transformatora_a: float | None
    kabel: CableSelectionResult | None
    aparat_pola: FieldApparatusSelectionResult | None


def dobierz_tor_der_sn(
    *,
    moc_pozorna_mva: float,
    napiecie_sn_kv: float,
    napiecie_falownika_kv: float,
    dlugosc_kabla_km: float,
    nosnik_cos_phi: NosnikCosPhi,
    wspolczynnik_jednoczesnosci: float = BEZ_REDUKCJI,
    przeciazalnosc_pu: float = BEZ_REDUKCJI,
    rezerwa_transformatora_pu: float = 0.0,
    rezerwa_kabla_pu: float = 0.0,
    rezerwa_pola_pu: float = 0.0,
    maks_spadek_napiecia_pct: float = MAKS_SPADEK_NAPIECIA_KABLA_PCT,
    charakter_mocy_biernej: str = CHARAKTER_MOCY_BIERNEJ_DOMYSLNY,
    ulozenie: OpisUlozeniaKabla | None = None,
) -> WynikDoboruToruDerSn:
    """Kaskada: TR blokowy (S_wym = `moc_pozorna_mva`) → prąd SN zaproponowanego TR →
    kabel SN (obciążalność i ΔU) oraz aparat główny pola SN.

    `moc_pozorna_mva` liczy wołający regułą kontroli mocy O-53 (`domain.generator_validation`)
    — kreator: człon nastawy ΣP/cosφ, szablon: pełna reguła max(S_n,jedn·n, |P|/cosφ) z karty.
    `OdmowaDanychError` — wejście poza dziedziną (także nieznany zestaw warunków ułożenia)."""
    transformator = dobierz_transformator_blokowy(
        moc_pozorna_mva=moc_pozorna_mva,
        napiecie_sn_kv=napiecie_sn_kv,
        napiecie_falownika_kv=napiecie_falownika_kv,
        wspolczynnik_jednoczesnosci=wspolczynnik_jednoczesnosci,
        przeciazalnosc_pu=przeciazalnosc_pu,
        rezerwa_pu=rezerwa_transformatora_pu,
    )
    if transformator.proposal is None:
        return WynikDoboruToruDerSn(moc_pozorna_mva, transformator, None, None, None)

    prad_a = rated_current_a(transformator.proposal.sn_mva, napiecie_sn_kv)
    if prad_a is None:
        raise OdmowaDanychError("Nie można wyznaczyć prądu znamionowego TR (moc/napięcie).")

    # F-K7: nazwa zestawu / współczynniki własne → współczynniki. Nieznany zestaw i brak
    # opisu warunków własnych kończą się odmową (fail-closed), nie cichym przyjęciem
    # warunków katalogowych.
    wspolczynniki = wspolczynniki_z_opisu(
        ulozenie.set_name if ulozenie is not None else None,
        f_grunt=ulozenie.f_grunt if ulozenie is not None else None,
        f_wiazka=ulozenie.f_wiazka if ulozenie is not None else None,
        f_grupa=ulozenie.f_grupa if ulozenie is not None else None,
        opis_pl=ulozenie.opis_pl if ulozenie is not None else None,
    )
    kabel = propose_mv_cable(
        CableSelectionInput(
            transformer_current_a=prad_a,
            length_km=dlugosc_kabla_km,
            line_voltage_v=kv_na_v(napiecie_sn_kv),
            cos_phi=cos_phi_doboru_kabla(nosnik_cos_phi),
            candidates=kandydaci_kabli_sn(),
            reserve_pu=rezerwa_kabla_pu,
            max_delta_u_pct=maks_spadek_napiecia_pct,
            reactive_character=charakter_mocy_biernej,
            derating=wspolczynniki,
        )
    )
    aparat = propose_mv_field_apparatus(
        FieldApparatusSelectionInput(
            transformer_current_a=prad_a,
            system_voltage_kv=napiecie_sn_kv,
            candidates=kandydaci_aparatow_pola_sn(),
            reserve_pu=rezerwa_pola_pu,
        )
    )
    return WynikDoboruToruDerSn(moc_pozorna_mva, transformator, prad_a, kabel, aparat)

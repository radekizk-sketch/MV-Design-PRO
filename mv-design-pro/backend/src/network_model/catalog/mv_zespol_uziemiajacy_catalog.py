"""Katalog referencyjny elementów zespołu uziemiającego SN (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA).

Trzy przestrzenie katalogu — po jednej na element fizyczny zespołu (Catalog Binding Rule):

* ``TRANSFORMATOR_UZIEMIAJACY`` — transformator uziemiający ZNyn11 z uzwojeniem potrzeb
  własnych 400 V (ENEA Zeszyt 1 §16, s. 29–30: „układ połączeń ZNyn 11 … ±5 %”, „ONAN”,
  „napięcie znamionowe uzwojenia dolnego – 400 V”, „moc uzwojenia potrzeb własnych … nie
  mniejsza niż 100 kVA”);
* ``DLAWIK_GASZACY`` — dławik gaszący z płynną regulacją 10–100 % (§16 s. 31) dobrany na
  zakres minimum 40–400 A (§16 s. 29);
* ``REZYSTOR_UZIEMIAJACY`` — rezystor punktu neutralnego sieci kablowej (§16 s. 29).

POZYCJE TYPOWE, NIE DANE PRODUCENTA (zasada nr 4): każda pozycja niesie mapę
``wartosci_robocze`` (pole → podstawa) — materializacja przenosi ją do elementu, a ocena
oparta na takiej wartości ma jakość ``ESTIMATED`` i kompletność dowodu ``NIEPELNY``.
Wartości wynikające wprost z §16 (zakres 40–400 A, regulacja płynna, grupa ZNyn11, 400 V,
PW ≥ 100 kVA) są podane z podstawą; wartości, których §16 nie podaje (impedancja zerowa
uzwojenia zygzak, moc PW ponad minimum, prąd znamionowy i czas rezystora), są jawnymi
założeniami inżynierskimi do potwierdzenia kartą producenta.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any, TypeVar

from network_model.catalog.wartosci_robocze import KLUCZ_WARTOSCI_ROBOCZYCH_KATALOGU
from network_model.pochodne import rezystancja_z_pradu_ohm

from .types import (
    ArcSuppressionCoilType,
    CatalogStatus,
    CatalogVerificationStatus,
    EarthingTransformerType,
    NeutralEarthingResistorType,
)

_ZRODLO = "Pozycja typowa wg ENEA Zeszyt 1 §16 (02.2023) — dane robocze"

_PODSTAWA_GRUPY = "ENEA Zeszyt 1 §16 s. 30: układ połączeń ZNyn 11"
_PODSTAWA_PW = (
    "ENEA Zeszyt 1 §16 s. 30: uzwojenie dolne 400 V, moc potrzeb własnych ≥ 100 kVA; "
    "przyjęto 160 kVA (najbliższa moc znormalizowana powyżej minimum) — założenie robocze"
)
_PODSTAWA_Z0_TU = (
    "założenie inżynierskie: impedancja zerowa uzwojenia zygzak ZN na fazę rzędu kilku Ω "
    "przy U_n SN (§16 jej nie podaje) — do potwierdzenia kartą producenta"
)
_PODSTAWA_SN_TU = (
    "założenie robocze: moc znamionowa uzwojenia SN dobrana do prądu punktu neutralnego "
    "400 A przy U_n/√3 w pracy dorywczej (§16 s. 30: „moc uzwojenia kompensującego "
    "dostosowana do wartości maksymalnej prądu dławika”)"
)
_PODSTAWA_ZAKRESU_DLAWIKA = (
    "ENEA Zeszyt 1 §16 s. 29: parametry dławika minimum 40–400 A; s. 31: płynna regulacja "
    "prądu kompensacyjnego 10–100 %"
)
_PODSTAWA_WTORNE = "ENEA Zeszyt 1 §16 s. 31: uzwojenie dodatkowe (wtórne) 500 V, ≥ 500 A przez 60 s"
_PODSTAWA_PRADU_REZYSTORA = (
    "założenie robocze: prąd znamionowy rezystora sieci kablowej (§16 s. 29 nie podaje "
    "wartości) — do potwierdzenia analizą przepięć i działania zabezpieczeń ziemnozwarciowych"
)
_PODSTAWA_R = "R = U_n/(√3·I_n) — rezystancja wyznaczona z prądu znamionowego przy pełnym U_f"
_PODSTAWA_CZASU = (
    "założenie robocze: dopuszczalny czas przepływu prądu znamionowego 10 s — do "
    "potwierdzenia kartą producenta"
)


def _metadane() -> dict[str, str]:
    return {
        "manufacturer": None,  # type: ignore[dict-item]
        "verification_status": CatalogVerificationStatus.REFERENCYJNY.value,
        "source_reference": _ZRODLO,
        "catalog_status": CatalogStatus.REFERENCYJNY_V1.value,
    }


def _transformator(u_n_kv: float, r0_ohm: float, x0_ohm: float) -> dict:
    napiecie = f"{u_n_kv:g}"
    return {
        "id": f"TU_ZNYN11_{napiecie}KV_PW160",
        "name": f"Transformator uziemiający ZNyn11 {napiecie} kV, potrzeby własne 160 kVA 0,4 kV",
        "params": {
            "u_n_kv": u_n_kv,
            "s_n_kva": 4000.0,
            "grupa_polaczen": "ZNyn11",
            "r0_ohm": r0_ohm,
            "x0_ohm": x0_ohm,
            "s_pw_kva": 160.0,
            "u_pw_kv": 0.4,
            KLUCZ_WARTOSCI_ROBOCZYCH_KATALOGU: {
                "grupa_polaczen": _PODSTAWA_GRUPY,
                "r0_ohm": _PODSTAWA_Z0_TU,
                "s_n_kva": _PODSTAWA_SN_TU,
                "s_pw_kva": _PODSTAWA_PW,
                "u_pw_kv": "ENEA Zeszyt 1 §16 s. 30: napięcie znamionowe uzwojenia dolnego – 400 V",
                "x0_ohm": _PODSTAWA_Z0_TU,
            },
            **_metadane(),
        },
    }


def _dlawik(
    u_n_kv: float,
    i_min_a: float,
    i_max_a: float,
    *,
    regulacja: str,
    liczba_zaczepow: int | None,
) -> dict:
    napiecie = f"{u_n_kv:g}"
    rodzaj = "płynna" if regulacja == "ciagla" else f"{liczba_zaczepow} zaczepów"
    znacznik = "CIAGLY" if regulacja == "ciagla" else f"Z{liczba_zaczepow}"
    robocze = {
        "i_max_a": _PODSTAWA_ZAKRESU_DLAWIKA,
        "i_min_a": _PODSTAWA_ZAKRESU_DLAWIKA,
        "regulacja": _PODSTAWA_ZAKRESU_DLAWIKA,
        "u_wtorne_v": _PODSTAWA_WTORNE,
    }
    if liczba_zaczepow is not None:
        robocze["liczba_zaczepow"] = (
            "założenie robocze: dławik zaczepowy (regulacja skokowa) — §16 s. 31 wymaga "
            "regulacji płynnej; pozycja dla sieci istniejących"
        )
    return {
        "id": f"DL_{int(i_min_a)}_{int(i_max_a)}A_{napiecie}KV_{znacznik}",
        "name": (
            f"Dławik gaszący {napiecie} kV, {int(i_min_a)}–{int(i_max_a)} A, regulacja {rodzaj}"
        ),
        "params": {
            "u_n_kv": u_n_kv,
            "i_min_a": i_min_a,
            "i_max_a": i_max_a,
            "regulacja": regulacja,
            "liczba_zaczepow": liczba_zaczepow,
            "u_wtorne_v": 500.0,
            KLUCZ_WARTOSCI_ROBOCZYCH_KATALOGU: robocze,
            **_metadane(),
        },
    }


def _rezystor(u_n_kv: float, i_n_a: float) -> dict:
    napiecie = f"{u_n_kv:g}"
    r_ohm = round(rezystancja_z_pradu_ohm(u_n_kv, i_n_a), 2)
    return {
        "id": f"REZ_{int(i_n_a)}A_{napiecie}KV",
        "name": f"Rezystor uziemiający {napiecie} kV, {int(i_n_a)} A, {r_ohm:g} Ω, 10 s",
        "params": {
            "u_n_kv": u_n_kv,
            "r_ohm": r_ohm,
            "i_n_a": i_n_a,
            "t_s": 10.0,
            KLUCZ_WARTOSCI_ROBOCZYCH_KATALOGU: {
                "i_n_a": _PODSTAWA_PRADU_REZYSTORA,
                "r_ohm": _PODSTAWA_R,
                "t_s": _PODSTAWA_CZASU,
            },
            **_metadane(),
        },
    }


def get_all_earthing_transformer_records() -> list[dict]:
    """Pozycje typowe transformatorów uziemiających (deterministyczne)."""
    return [_transformator(15.0, 1.5, 6.0), _transformator(20.0, 2.0, 8.0)]


def get_all_arc_suppression_coil_records() -> list[dict]:
    """Pozycje typowe dławików gaszących (deterministyczne)."""
    return [
        _dlawik(15.0, 40.0, 400.0, regulacja="ciagla", liczba_zaczepow=None),
        _dlawik(20.0, 40.0, 400.0, regulacja="ciagla", liczba_zaczepow=None),
        _dlawik(15.0, 50.0, 250.0, regulacja="zaczepy", liczba_zaczepow=5),
    ]


def get_all_neutral_earthing_resistor_records() -> list[dict]:
    """Pozycje typowe rezystorów uziemiających (deterministyczne)."""
    return [
        _rezystor(15.0, 200.0),
        _rezystor(15.0, 500.0),
        _rezystor(20.0, 200.0),
        _rezystor(20.0, 500.0),
    ]


T = TypeVar("T")


def _typy(rekordy: list[dict], zbuduj: Callable[[dict[str, Any]], T]) -> list[T]:
    wynik: list[T] = []
    for rekord in rekordy:
        dane = {"id": rekord["id"], "name": rekord["name"]}
        dane.update(rekord["params"])
        wynik.append(zbuduj(dane))
    return wynik


def get_all_earthing_transformer_types() -> list[EarthingTransformerType]:
    return _typy(get_all_earthing_transformer_records(), EarthingTransformerType.from_dict)


def get_all_arc_suppression_coil_types() -> list[ArcSuppressionCoilType]:
    return _typy(get_all_arc_suppression_coil_records(), ArcSuppressionCoilType.from_dict)


def get_all_neutral_earthing_resistor_types() -> list[NeutralEarthingResistorType]:
    return _typy(get_all_neutral_earthing_resistor_records(), NeutralEarthingResistorType.from_dict)

"""Katalog referencyjny elementów punktu neutralnego zespołu uziemiającego SN (karta
UX-04/POLE-ZU-SKLADOWA-ZEROWA; karta ZU-JEDEN-NOSNIK).

Dwie przestrzenie katalogu — po jednej na element fizyczny punktu neutralnego (Catalog
Binding Rule). Transformator uziemiający ZNyn11 jest transformatorem SN/nN — jego pozycje żyją
w katalogu transformatorów (``mv_transformer_catalog.TRANSFORMATORY_UZIEMIAJACE_ZNYN11``,
przestrzeń ``TRAFO_SN_NN``), nie tutaj:

* ``DLAWIK_GASZACY`` — dławik gaszący z płynną regulacją 10–100 % (§16 s. 31) dobrany na
  zakres minimum 40–400 A (§16 s. 29);
* ``REZYSTOR_UZIEMIAJACY`` — rezystor punktu neutralnego sieci kablowej (§16 s. 29).

POZYCJE TYPOWE, NIE DANE PRODUCENTA (zasada nr 4): każda pozycja niesie mapę
``wartosci_robocze`` (pole → podstawa) — materializacja przenosi ją do elementu, a ocena
oparta na takiej wartości ma jakość ``ESTIMATED`` i kompletność dowodu ``NIEPELNY``.
Wartości wynikające wprost z §16 (zakres 40–400 A, regulacja płynna) są podane z podstawą;
wartości, których §16 nie podaje (prąd znamionowy i czas rezystora), są jawnymi założeniami
inżynierskimi do potwierdzenia kartą producenta.
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
    NeutralEarthingResistorType,
)

_ZRODLO = "Pozycja typowa wg ENEA Zeszyt 1 §16 (02.2023) — dane robocze"

_PODSTAWA_ZAKRESU_DLAWIKA = (
    "ENEA Zeszyt 1 §16 s. 29: parametry dławika minimum 40–400 A; s. 31: płynna regulacja "
    "prądu kompensacyjnego 10–100 %"
)
_PODSTAWA_WTORNE = "ENEA Zeszyt 1 §16 s. 31: uzwojenie dodatkowe (wtórne) 500 V, ≥ 500 A przez 60 s"
_PODSTAWA_PRADU_REZYSTORA = (
    "założenie robocze: prąd znamionowy rezystora sieci kablowej (§16 s. 29 nie podaje "
    "wartości) — do potwierdzenia analizą przepięć i działania zabezpieczeń ziemnozwarciowych"
)
_PODSTAWA_R = (
    "rezystancja wyznaczona z napięcia fazowego i prądu znamionowego przy pełnym napięciu "
    "fazowym"
)
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


def get_all_arc_suppression_coil_types() -> list[ArcSuppressionCoilType]:
    return _typy(get_all_arc_suppression_coil_records(), ArcSuppressionCoilType.from_dict)


def get_all_neutral_earthing_resistor_types() -> list[NeutralEarthingResistorType]:
    return _typy(get_all_neutral_earthing_resistor_records(), NeutralEarthingResistorType.from_dict)

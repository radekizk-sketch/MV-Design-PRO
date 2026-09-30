"""Słowniki uziemienia — JEDNO miejsce dla literałów, które dzielą model ENM,
katalog i prezentację (karta W5-A, `docs/plan/KARTA_W5_MODEL_FAZOWY_I_UZIEMIENIE_2026-09.md` §1 p. 1–4).

DLACZEGO TU, A NIE W ``enm/models.py``. Katalog (``network_model/catalog/
audit2_catalogs.py::MvNeutralGroundingItem``) leży POD warstwą ENM w grafie
importów (``enm`` importuje ``network_model.catalog``, nigdy odwrotnie), więc
typ współdzielony przez obie warstwy musi mieszkać w liściu widocznym dla
obu. Przed tą kartą ten sam zbiór czterech literałów żył w PIĘCIU słownikach
(``GroundingConfig.type``, ``BayEarthFaultPath`` po polsku, ``audit2.GroundingType``,
etykieta ``earthing_system`` katalogu źródeł, typ uziemienia frontu) —
każdy z osobna poprawny, razem: pięć predykatów jednego faktu.

Moduł importuje wyłącznie ``typing`` — jest liściem grafu importów i może być
importowany z każdej warstwy na poziomie modułu.
"""

from __future__ import annotations

from typing import Literal, get_args

#: Sposób pracy punktu neutralnego (``GroundingConfig.type``): jedyny słownik
#: wartości w systemie. Etykiety polskie dla prezentacji — obok, żeby żaden
#: konsument nie budował własnej tablicy tłumaczeń.
TypPunktuNeutralnego = Literal[
    "isolated", "petersen_coil", "directly_grounded", "resistor_grounded"
]

TYPY_PUNKTU_NEUTRALNEGO: tuple[str, ...] = get_args(TypPunktuNeutralnego)

ETYKIETA_PL_PUNKTU_NEUTRALNEGO: dict[str, str] = {
    "isolated": "izolowany",
    "petersen_coil": "kompensowany (cewka Petersena)",
    "resistor_grounded": "uziemiony przez rezystor",
    "directly_grounded": "bezpośrednio uziemiony",
}

#: Sieci o MAŁYM prądzie doziemnym (prąd pojemnościowy/resztkowy): kryterium
#: nadprądowe bez kierunkowości bywa w nich nieskuteczne (dobór 67N), a
#: przekładnik napięciowy faza–ziemia wymaga F_v = 1,9 (IEC 61869-3 tab. 2).
#: Uziemienie przez rezystor należy tu ŚWIADOMIE po stronie 1,9 (V12K-256):
#: sieć uziemiona rezystorem NIE jest siecią skutecznie uziemioną.
UZIEMIENIA_MALOPRADOWE: frozenset[str] = frozenset({"isolated", "petersen_coil"})
UZIEMIENIA_WYMAGAJACE_FV_19: frozenset[str] = frozenset(
    {"isolated", "petersen_coil", "resistor_grounded"}
)

#: Układ uziemienia ekranu kabla SN (``Cable.screen_bonding`` i ``CableType.
#: z0_reference_bonding``): jednostronne / dwustronne / krzyżowe (cross-bonding).
UziemienieEkranuKabla = Literal["single_end", "both_ends", "cross_bonded"]

UZIEMIENIA_EKRANU_KABLA: tuple[str, ...] = get_args(UziemienieEkranuKabla)

ETYKIETA_PL_UZIEMIENIA_EKRANU: dict[str, str] = {
    "single_end": "jednostronne",
    "both_ends": "dwustronne",
    "cross_bonded": "krzyżowe (cross-bonding)",
}

#: Rola uziemnika pola (``BayPrimaryDevice.earthing_role``, kind="ES" albo gałąź
#: uziemiająca ogranicznika): uziemnik pola / uziemienie ekranów kabla / konstrukcji /
#: punktu neutralnego / gałąź ogranicznika. Pisarz: kreator pola (`add_sn_bay`,
#: payload `earthing_role`) — do karty W5-A jedynym źródłem był szablon (`field_earth`).
RolaUziemnika = Literal["field_earth", "cable_screen", "structure", "neutral_point", "surge_ground"]

ROLE_UZIEMNIKA: tuple[str, ...] = get_args(RolaUziemnika)

ETYKIETA_PL_ROLI_UZIEMNIKA: dict[str, str] = {
    "field_earth": "uziemnik pola",
    "cable_screen": "uziemienie ekranów kabla",
    "structure": "uziemienie konstrukcji",
    "neutral_point": "uziemienie punktu neutralnego",
    "surge_ground": "gałąź uziemiająca ogranicznika",
}


def etykieta_punktu_neutralnego_pl(typ: str | None) -> str:
    """Etykieta PL typu punktu neutralnego; ``None`` = „nieokreślony w modelu"."""
    if typ is None:
        return "punkt neutralny nieokreślony w modelu"
    return ETYKIETA_PL_PUNKTU_NEUTRALNEGO.get(typ, typ)

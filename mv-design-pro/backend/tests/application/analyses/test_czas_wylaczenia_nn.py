"""Czas wyłączenia zwarcia obwodu nN — iloczyn cech (karta EDYTOR-DELT-SCENARIUSZA-ZABEZPIECZEN, 6a).

Cechy: aparat {bezpiecznik gG z charakterystyką, wyłącznik MCB z charakterystyką, wyłącznik MCCB
z charakterystyką, MCB z prądem w paśmie nieokreślonym, bez typu katalogowego} × układ {TN, TT}
× obwód {odbiorczy ≤ 32 A, rozdzielczy} × nadpisanie projektanta {brak, jest}. Aparat realny:
gałąź modelu z materializacją katalogową rozwiązana tym samym resolwerem co arkusz i dowód.
"""

from __future__ import annotations

import itertools
from typing import Any

import pytest
from application.analyses.czas_wylaczenia_nn import czas_wylaczenia_obwodu_nn
from application.proof_engine.lv_circuit_verification_binding import resolve_urzadzenie_ochronne
from application.proof_engine.packs.lv_circuit_verification import UrzadzenieOchronneNn
from enm.models import FuseBranch, SwitchBranch
from werdykt.proweniencja import FieldQuality

U0_V = 400.0 / 3**0.5
IK_A = 3000.0

APARATY = ("gg", "mcb", "mccb", "mcb_pasmo", "bez_typu")
UKLADY = ("TN-C-S", "TT")
OBWODY = ("odbiorczy", "rozdzielczy")
NADPISANIE = (None, 0.35)

# Wartości robocze PN-HD 60364-4-41 (U0 230 V): tablica 41.1 TN 0,4 s / TT 0,2 s, obwód
# rozdzielczy TN 5 s (§411.3.2.3) / TT 1 s (§411.3.2.4).
ROBOCZE = {
    ("TN-C-S", "odbiorczy"): 0.4,
    ("TT", "odbiorczy"): 0.2,
    ("TN-C-S", "rozdzielczy"): 5.0,
    ("TT", "rozdzielczy"): 1.0,
}


def _aparat(rodzaj: str, obwod: str, nadpisanie: float | None) -> tuple[Any, Any, float]:
    in_a = 25.0 if obwod == "odbiorczy" else 100.0
    ik_a = IK_A
    if rodzaj == "gg":
        galaz: Any = FuseBranch(
            ref_id="ap",
            name="Bezpiecznik",
            from_bus_ref="a",
            to_bus_ref="b",
            catalog_namespace="WKLADKA_NN",
            materialized_params={"in_a": in_a},
            czas_wylaczenia_zwarcia_s=nadpisanie,
        )
    elif rodzaj in ("mcb", "mcb_pasmo", "bez_typu"):
        galaz = SwitchBranch(
            ref_id="ap",
            name="Wyłącznik",
            type="breaker",
            from_bus_ref="a",
            to_bus_ref="b",
            catalog_namespace="APARAT_NN_MCB" if rodzaj != "bez_typu" else None,
            materialized_params=(
                {"in_a": in_a, "curve_class": "C", "icn_ka": 10.0} if rodzaj != "bez_typu" else {}
            ),
            czas_wylaczenia_zwarcia_s=nadpisanie,
        )
        if rodzaj == "mcb_pasmo":
            ik_a = 7.0 * in_a  # wewnątrz pasma C (5–10×In): norma nie gwarantuje zadziałania
    else:
        galaz = SwitchBranch(
            ref_id="ap",
            name="Wyłącznik MCCB",
            type="breaker",
            from_bus_ref="a",
            to_bus_ref="b",
            czas_wylaczenia_zwarcia_s=nadpisanie,
        )
    if rodzaj == "mccb":
        urzadzenie: UrzadzenieOchronneNn | None = UrzadzenieOchronneNn(
            kind="MCCB",
            id="ap",
            nazwa="Wyłącznik MCCB",
            in_a=in_a,
            ir_a=in_a,
            isd_a=6 * in_a,
            ii_a=12 * in_a,
            tr_s=10.0,
            tsd_s=0.2,
        )
        ik_a = 8 * in_a  # stopień krótkozwłoczny → tsd
    else:
        urzadzenie = resolve_urzadzenie_ochronne(galaz)[0]
    return galaz, urzadzenie, ik_a


@pytest.mark.parametrize(
    ("rodzaj", "uklad", "obwod", "nadpisanie"),
    list(itertools.product(APARATY, UKLADY, OBWODY, NADPISANIE)),
)
def test_iloczyn_cech_czasu_wylaczenia(
    rodzaj: str, uklad: str, obwod: str, nadpisanie: float | None
) -> None:
    galaz, urzadzenie, ik_a = _aparat(rodzaj, obwod, nadpisanie)
    czas = czas_wylaczenia_obwodu_nn(
        aparat=galaz, urzadzenie=urzadzenie, ik_a=ik_a, uklad=uklad, u0_v=U0_V, miejsce_pl="obwód"
    )
    if nadpisanie is not None:
        assert (czas.zrodlo, czas.czas_s, czas.kompletnosc_dowodu) == (
            "projektant",
            nadpisanie,
            "PELNY",
        )
        assert czas.dane_przyjete == ()
        return
    if rodzaj == "mcb":
        assert (czas.zrodlo, czas.czas_s) == ("charakterystyka_aparatu", 0.1)
        assert czas.kompletnosc_dowodu == "PELNY"
        assert czas.slad_charakterystyki["step"] == "MCB_MAGNETIC"
        return
    if rodzaj == "mccb":
        assert (czas.zrodlo, czas.czas_s) == ("charakterystyka_aparatu", 0.2)
        assert czas.slad_charakterystyki["stopien"] == "krotkozwloczny"
        return
    # gG (bramki umowne bez czasu zwarciowego), MCB w paśmie nieokreślonym, aparat bez typu:
    # wartość robocza normy, dana przyjęta ESTIMATED, kompletność NIEPEŁNY.
    oczekiwany_obwod = "rozdzielczy" if rodzaj == "bez_typu" else obwod
    assert czas.zrodlo == "wartosc_robocza"
    assert czas.czas_s == ROBOCZE[(uklad, oczekiwany_obwod)]
    assert czas.kompletnosc_dowodu == "NIEPELNY"
    (dana,) = czas.dane_przyjete
    assert dana.jakosc == FieldQuality.ESTIMATED
    assert dana.wartosc is not None and dana.wartosc.jednostka == "s"
    assert "PN-HD 60364-4-41" in dana.powod_pl
    assert ("tablica 41.1" in dana.powod_pl) == (oczekiwany_obwod == "odbiorczy")
    assert "Charakterystyka nie dała czasu" in czas.wyjasnienie_pl


def test_bez_pradu_zwarciowego_charakterystyka_nie_jest_pytana() -> None:
    galaz, urzadzenie, _ = _aparat("mcb", "odbiorczy", None)
    czas = czas_wylaczenia_obwodu_nn(
        aparat=galaz, urzadzenie=urzadzenie, ik_a=None, uklad="TN-S", u0_v=U0_V, miejsce_pl="o"
    )
    assert (czas.zrodlo, czas.czas_s) == ("wartosc_robocza", 0.4)
    assert "brak prądu zwarciowego" in czas.wyjasnienie_pl


@pytest.mark.parametrize(("uklad", "oczekiwany"), [("IT", 0.4), (None, 5.0)])
def test_uklad_it_i_nieznany_biora_czasy_zachowawcze(uklad: str | None, oczekiwany: float) -> None:
    galaz, urzadzenie, _ = _aparat("gg", "odbiorczy", None)
    czas = czas_wylaczenia_obwodu_nn(
        aparat=galaz, urzadzenie=urzadzenie, ik_a=IK_A, uklad=uklad, u0_v=U0_V, miejsce_pl="o"
    )
    assert czas.czas_s == oczekiwany


def test_pasmo_32_63_a_dla_i2t_jest_obwodem_odbiorczym_jak_dla_swz() -> None:
    # Pakiet 9: JEDNA klasyfikacja obwodu dla I²t i SWZ — aparat ≤ 63 A to obwód odbiorczy
    # (wartość robocza, PN-HD 60364-4-41:2017 §411.3.2.2); dawniej I²t brał tu obwód
    # rozdzielczy (5 s), a SWZ odbiorczy — ten sam obwód miał dwa rodzaje.
    galaz = FuseBranch(
        ref_id="ap",
        name="Bezpiecznik",
        from_bus_ref="a",
        to_bus_ref="b",
        catalog_namespace="WKLADKA_NN",
        materialized_params={"in_a": 40.0},
    )
    czas = czas_wylaczenia_obwodu_nn(
        aparat=galaz,
        urzadzenie=resolve_urzadzenie_ochronne(galaz)[0],
        ik_a=IK_A,
        uklad="TN-S",
        u0_v=U0_V,
        miejsce_pl="o",
    )
    assert czas.czas_s == 0.4
    assert czas.zrodlo == "wartosc_robocza"
    assert "obwód odbiorczy — wartość robocza: aparat 40 A ≤ 63 A" in czas.wyjasnienie_pl

"""Rodzaj obwodu nN — JEDNA klasyfikacja dla I²t i dla werdyktu SWZ (karta EDYTOR-DELT-
SCENARIUSZA-ZABEZPIECZEN, pakiet 9).

Dawniej czas wyłączenia dla I²t (``czas_wylaczenia_nn``) brał próg 32 A, a werdykt SWZ
(``swz.werdykt``) — 63 A: obwód z aparatem 32–63 A był naraz rozdzielczym (I²t, 5 s)
i odbiorczym (SWZ, 0,4 s). Teraz oba czytają ``rozstrzygnij_rodzaj_obwodu_nn``: wartość
projektanta na aparacie (``rodzaj_obwodu_nn``) > aparat ≤ 63 A — obwód odbiorczy (wartość
robocza ESTIMATED, PN-HD 60364-4-41:2017 §411.3.2.2) > aparat > 63 A — obwód rozdzielczy.

Iloczyn cech: prąd znamionowy aparatu {16, 32, 50, 63, 80} A × wartość projektanta {brak,
odbiorczy, rozdzielczy} × ocena {I²t, SWZ}. Każdy przypadek sprawdza rodzaj, czas tablicy
(TN, U0 = 230 V: odbiorczy 0,4 s z tablicy 41.1, rozdzielczy 5 s z §411.3.2.3) i daną
przyjętą — obecną wyłącznie przy wartości roboczej.
"""

from __future__ import annotations

import itertools

import pytest
from application.analyses.czas_wylaczenia_nn import czas_wylaczenia_obwodu_nn
from application.analyses.swz.werdykt import AparatZabezpieczajacy, ocen_swz
from application.proof_engine.lv_circuit_verification_binding import (
    resolve_urzadzenie_ochronne,
)
from enm.models import FuseBranch

PRADY_A = (16.0, 32.0, 50.0, 63.0, 80.0)
PROJEKTANT = (None, "odbiorczy", "rozdzielczy")
OCENY = ("i2t", "swz")
U0_V = 230.0
CZAS_TABLICY_S = {"odbiorczy": 0.4, "rozdzielczy": 5.0}


def _oczekiwany(in_a: float, projektant: str | None) -> tuple[str, bool]:
    """(rodzaj, czy wartość robocza) — rachunek niezależny od implementacji: reguła karty."""
    if projektant is not None:
        return projektant, False
    return ("odbiorczy", True) if in_a <= 63.0 else ("rozdzielczy", False)


@pytest.mark.parametrize(
    ("in_a", "projektant", "ocena"), list(itertools.product(PRADY_A, PROJEKTANT, OCENY))
)
def test_jedna_klasyfikacja_obwodu_dla_i2t_i_swz(
    in_a: float, projektant: str | None, ocena: str
) -> None:
    rodzaj, robocza = _oczekiwany(in_a, projektant)
    if ocena == "i2t":
        galaz = FuseBranch(
            ref_id="ap",
            name="Bezpiecznik obwodu",
            from_bus_ref="a",
            to_bus_ref="b",
            catalog_namespace="WKLADKA_NN",
            materialized_params={"in_a": in_a},
            rodzaj_obwodu_nn=projektant,
        )
        urzadzenie = resolve_urzadzenie_ochronne(galaz)[0]
        assert urzadzenie is not None and urzadzenie.in_a == in_a
        # Wkładka gG nie daje czasu zwarciowego z bramek umownych — czas z wartości roboczej
        # normy dla rodzaju obwodu (ta ścieżka czyta klasyfikację).
        czas = czas_wylaczenia_obwodu_nn(
            aparat=galaz,
            urzadzenie=urzadzenie,
            ik_a=3000.0,
            uklad="TN-S",
            u0_v=U0_V,
            miejsce_pl="o",
        )
        assert czas.zrodlo == "wartosc_robocza"
        assert czas.czas_s == CZAS_TABLICY_S[rodzaj]
        assert f"obwód {rodzaj}" in czas.wyjasnienie_pl
        if projektant is not None:
            assert "wartość projektanta na aparacie obwodu" in czas.wyjasnienie_pl
        return
    wynik = ocen_swz(
        ik1_min_a=2000.0,
        u0_v=U0_V,
        aparat=AparatZabezpieczajacy(typ="MCB", in_a=in_a, klasa_mcb="B"),
        rodzaj_obwodu=projektant,
        miejsce_pl="obwód o",
    )
    assert wynik.rodzaj_obwodu == rodzaj
    assert wynik.t_wymagany_s == CZAS_TABLICY_S[rodzaj]
    dane_rodzaju = [d for d in wynik.dane_przyjete if d.nazwa_pl.startswith("rodzaj obwodu")]
    assert len(dane_rodzaju) == (1 if robocza else 0)
    if robocza:
        assert dane_rodzaju[0].jakosc == "ESTIMATED"
        assert "§411.3.2.2" in dane_rodzaju[0].powod_pl
        assert wynik.to_dict()["status_danych"] == "UNVALIDATED_INPUT"

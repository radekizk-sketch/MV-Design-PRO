"""Stabilność SSCI: werdykt „stabilny / ryzyko / niestabilny" zdjęty do czasu poprawnego Z_grid.

Kryterium impedancyjne porównuje Z_grid(f) z Z_conv(f). Audyt 2026-09-23 zmierzył, że Z_grid
liczone jest na tej samej macierzy admitancyjnej co tor harmoniczny — BEZ przekładni
transformatora — i dla przekształtnika na szynie 0,4 kV wychodzi około 1400 razy za duże
(21,15 Ω zamiast około 0,0158 Ω przy 47,7 Hz). Wzmocnienie pętli L = Z_grid/Z_conv i każdy
wniosek z niego są więc niewiarygodne. Wskaźnik fizyczny strefy ujemnej rezystancji Z_conv
(zależy wyłącznie od modelu przekształtnika) zostaje razem z wartością Re_min i częstotliwością.
"""

from __future__ import annotations

from typing import Any

import pytest
from analysis.ssci_stability import SsciStabilityBuilder
from api.v126_academic import get_v126_ssci_stability
from solver_input.v126_contracts import V126AnalysisType

from tests.uczciwosc.pomocnicze import (
    bieg_sceny_akademickiej,
    braki_tekstem,
    sprawdz_ocene_niewykonana,
)

_DAWNE_WERDYKTY = ("stabilny", "ryzyko SSCI", "niestabilny")


def _sprawdz_powod(ocena: dict[str, Any]) -> None:
    rekord = sprawdz_ocene_niewykonana(ocena)
    assert rekord.dowod.status_modelu == "UNVALIDATED_MODEL"
    braki = braki_tekstem(ocena)
    assert "przekładni" in braki and "1400" in braki
    assert "wyroczni" in braki


def test_widok_ssci_na_realnym_biegu_nie_niesie_werdyktu_stabilnosci() -> None:
    bieg, _ = bieg_sceny_akademickiej(V126AnalysisType.SSCI_IMPEDANCE)
    widok = get_v126_ssci_stability(bieg.id)
    werdykt = widok["verdict"]

    assert werdykt["verdict"] == "nie oceniono"
    assert werdykt["verdict"] not in _DAWNE_WERDYKTY
    assert werdykt["is_risk"] is None
    _sprawdz_powod(werdykt["ocena"])
    _sprawdz_powod(widok["ocena"])
    assert werdykt["why_pl"] == werdykt["ocena"]["wyjasnienie"]["zdanie_pl"]
    assert widok["sekcja_audytowa_pl"].endswith("nie jest wynikiem inżynierskim")
    for krok in werdykt["white_box"]:
        for werdykt_dawny in _DAWNE_WERDYKTY:
            assert werdykt_dawny not in krok["result_pl"], krok
    # Wskaźnik fizyczny Z_conv zostaje z wartością Re_min i częstotliwością.
    assert isinstance(werdykt["negative_resistance_present"], bool)
    assert "negative_resistance_re_min_ohm" in werdykt
    assert "negative_resistance_f_hz" in werdykt


def _l_rows(mag: float, faza: float) -> list[dict[str, float]]:
    return [
        {"f_hz": f, "mag": mag, "phase_deg": faza, "re": 0.0, "im": 0.0}
        for f in (10.0, 20.0, 40.0, 60.0)
    ]


@pytest.mark.parametrize(
    ("mag", "faza"),
    [
        (0.2, 10.0),  # dawniej „stabilny" (brak przecięcia modułów)
        (1.5, 150.0),  # dawniej „ryzyko SSCI" (przecięcie, margines dodatni)
        (1.5, 179.9),  # dawniej „niestabilny" (margines ~0 przy |L| ≥ 1)
    ],
)
def test_zaden_przebieg_L_nie_daje_werdyktu(mag: float, faza: float) -> None:
    widok = (
        SsciStabilityBuilder()
        .build(
            {
                "converter_ref": "conv-1",
                "bus_ref": "bus-nn",
                "minor_loop_gain": _l_rows(mag, faza),
                "z_conv_negative_resistance": {
                    "present": True,
                    "re_min_ohm": -0.4,
                    "f_at_re_min_hz": 22.0,
                },
            },
            converter=None,
            context=None,
        )
        .to_dict()
    )
    werdykt = widok["verdict"]
    assert werdykt["verdict"] == "nie oceniono"
    assert werdykt["is_risk"] is None
    _sprawdz_powod(werdykt["ocena"])
    assert werdykt["negative_resistance_present"] is True
    assert werdykt["negative_resistance_re_min_ohm"] == -0.4
    assert werdykt["negative_resistance_f_hz"] == 22.0


def test_brak_danych_solvera_to_nadal_ocena_niewykonana_z_brakami() -> None:
    widok = (
        SsciStabilityBuilder()
        .build(
            {"status": "dane niekompletne", "missing_fields": ["pll_bandwidth_hz"]},
            converter=None,
            context=None,
        )
        .to_dict()
    )
    werdykt = widok["verdict"]
    assert werdykt["verdict"] == "nie oceniono"
    sprawdz_ocene_niewykonana(werdykt["ocena"])
    assert werdykt["missing_data"]

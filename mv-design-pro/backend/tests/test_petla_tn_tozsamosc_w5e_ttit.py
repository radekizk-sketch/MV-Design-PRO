"""Tożsamość liczb pętli TN przed/po karcie W5-E-TTIT (OD-25, O-68: goldeny TN bit w bit).

Fikstura `tests/fixtures/petla_tn_tozsamosc_w5e_ttit.json` została zapisana na drzewie SPRZED
wydzielenia jądra pętli (`zsumuj_skladowe_petli` / `prad_z_petli`) i dyspozycji TT/IT —
`to_dict()` i SHA-256 wyniku dla iloczynu cech {TN-S, TN-C-S, TN-C} × {sieć zasilająca
obecna / brak} × {trasa zerowa / typowa / długa}. Test dowodzi, że refaktor nie zmienił ANI
JEDNEGO bitu wyniku ani śladu WHITE BOX układu TN.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest
from network_model.solvers.fault_loop_iec60364 import (
    FaultLoopInput,
    LoopImpedanceComponent,
    NetworkType,
    ProtectionArrangement,
    compute_fault_loop,
)

FIKSTURA = Path(__file__).parent / "fixtures" / "petla_tn_tozsamosc_w5e_ttit.json"


def _wejscie_z_to_dict(d: dict) -> FaultLoopInput:
    skladowe = d["components"]
    upstream = (
        LoopImpedanceComponent(
            label=skladowe[3]["label"], r_ohm=skladowe[3]["r_ohm"], x_ohm=skladowe[3]["x_ohm"]
        )
        if len(skladowe) == 4
        else None
    )
    return FaultLoopInput(
        fault_node_id=d["fault_node_id"],
        u_nom_v=d["u_nom_v"],
        phase_conductor=LoopImpedanceComponent(
            label=skladowe[0]["label"], r_ohm=skladowe[0]["r_ohm"], x_ohm=skladowe[0]["x_ohm"]
        ),
        return_conductor=LoopImpedanceComponent(
            label=skladowe[1]["label"], r_ohm=skladowe[1]["r_ohm"], x_ohm=skladowe[1]["x_ohm"]
        ),
        transformer_impedance=LoopImpedanceComponent(
            label=skladowe[2]["label"], r_ohm=skladowe[2]["r_ohm"], x_ohm=skladowe[2]["x_ohm"]
        ),
        upstream_impedance=upstream,
        network_type=NetworkType(d["network_type"]),
        protection_arrangement=ProtectionArrangement(d["protection_arrangement"]),
    )


def _przypadki() -> list[dict]:
    return json.loads(FIKSTURA.read_text(encoding="utf-8"))["przypadki"]


@pytest.mark.parametrize("przypadek", _przypadki(), ids=lambda p: p["fault_node_id"])
def test_wynik_tn_bit_w_bit_jak_przed_karta(przypadek: dict) -> None:
    wynik = compute_fault_loop(_wejscie_z_to_dict(przypadek["to_dict"])).to_dict()
    assert wynik == przypadek["to_dict"]
    tekst = json.dumps(wynik, sort_keys=True, ensure_ascii=False)
    assert hashlib.sha256(tekst.encode("utf-8")).hexdigest() == przypadek["sha256"]
    # Kontrakt wyniku TN bez klucza `tt_it` — pole addytywne nie zmienia słownika TN.
    assert "tt_it" not in wynik


def test_fikstura_pokrywa_iloczyn_cech() -> None:
    przypadki = _przypadki()
    uklady = {p["to_dict"]["network_type"] for p in przypadki}
    assert uklady == {"TN-S", "TN-C-S", "TN-C"}
    liczby_skladowych = {len(p["to_dict"]["components"]) for p in przypadki}
    assert liczby_skladowych == {3, 4}
    assert len(przypadki) == 18

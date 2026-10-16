"""Tożsamość liczb pętli TN przed/po karcie W5-E-TTIT (OD-25, O-68: goldeny TN bit w bit).

Fikstura `tests/fixtures/petla_tn_tozsamosc_w5e_ttit.json` została zapisana na drzewie SPRZED
wydzielenia jądra pętli (`zsumuj_skladowe_petli` / `prad_z_petli`) i dyspozycji TT/IT —
`to_dict()` i SHA-256 wyniku dla iloczynu cech {TN-S, TN-C-S, TN-C} × {sieć zasilająca
obecna / brak} × {trasa zerowa / typowa / długa}. Test dowodzi, że refaktor nie zmienił ANI
JEDNEGO bitu wyniku ani śladu WHITE BOX układu TN.

Partia integracji 11 (scalenie karty WSPOLCZYNNIK-C-JEDEN-NOSNIK): c pętli pochodzi z tabeli 1
IEC 60909-0 dla ZADEKLAROWANEJ tolerancji sieci nN. Fikstura (dowód „przed”) zostaje bez
zmian; wejście deklaruje +6 % — wiersz, który moduł pętli przyjmował dawniej po cichu — i
wtedy każda liczba i każdy krok śladu muszą być bit w bit takie jak w fikstura. Jedyna różnica
to pola ADDYTYWNE karty C (``c_min``, ``c_max``, ``c_zrodlo_min``, ``c_zrodlo_max`` wyniku
i podstawa c w kroku ``compute_ik``), sprawdzane osobno.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest
from network_model.core.voltage_factor import c_for_node, zrodlo_c_z_tabeli
from network_model.solvers.fault_loop_iec60364 import (
    FaultLoopInput,
    LoopImpedanceComponent,
    NetworkType,
    ProtectionArrangement,
    compute_fault_loop,
)

FIKSTURA = Path(__file__).parent / "fixtures" / "petla_tn_tozsamosc_w5e_ttit.json"
#: Tolerancja sieci nN, której wiersz tabeli 1 (c 1,05/0,95) moduł pętli brał przed kartą C.
TOLERANCJA_FIKSTURY = "PLUS_6"
#: Pola addytywne karty WSPOLCZYNNIK-C-JEDEN-NOSNIK w wyniku pętli.
POLA_C_WYNIKU = ("c_min", "c_max", "c_zrodlo_min", "c_zrodlo_max")
POLA_C_KROKU = ("c_zrodlo_min", "c_zrodlo_max")


def _bez_pol_addytywnych_c(wynik: dict) -> dict:
    kopia = {k: v for k, v in wynik.items() if k not in POLA_C_WYNIKU}
    kopia["white_box_trace"] = [
        (
            {k: v for k, v in krok.items() if k not in POLA_C_KROKU}
            if krok.get("step") == "compute_ik"
            else krok
        )
        for krok in wynik["white_box_trace"]
    ]
    return kopia


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
        tolerancja_nn=TOLERANCJA_FIKSTURY,
    )


def _przypadki() -> list[dict]:
    return json.loads(FIKSTURA.read_text(encoding="utf-8"))["przypadki"]


@pytest.mark.parametrize("przypadek", _przypadki(), ids=lambda p: p["fault_node_id"])
def test_wynik_tn_bit_w_bit_jak_przed_karta(przypadek: dict) -> None:
    pelny = compute_fault_loop(_wejscie_z_to_dict(przypadek["to_dict"])).to_dict()
    wynik = _bez_pol_addytywnych_c(pelny)
    assert wynik == przypadek["to_dict"]
    tekst = json.dumps(wynik, sort_keys=True, ensure_ascii=False)
    assert hashlib.sha256(tekst.encode("utf-8")).hexdigest() == przypadek["sha256"]
    # Kontrakt wyniku TN bez klucza `tt_it` — pole addytywne nie zmienia słownika TN.
    assert "tt_it" not in wynik
    # Pola addytywne karty C: c z jedynego źródła i jego podstawa, zgodne z krokiem śladu.
    u_kv = pelny["u_nom_v"] / 1000.0
    for scenariusz, klucz in (("MIN", "min"), ("MAX", "max")):
        c = c_for_node(u_kv, scenariusz, tolerancja_nn=TOLERANCJA_FIKSTURY)
        assert pelny[f"c_{klucz}"] == c
        assert pelny[f"c_zrodlo_{klucz}"] == zrodlo_c_z_tabeli(
            u_kv, scenariusz, tolerancja_nn=TOLERANCJA_FIKSTURY
        )
    krok = next(k for k in pelny["white_box_trace"] if k["step"] == "compute_ik")
    assert (krok["c_min"], krok["c_max"]) == (pelny["c_min"], pelny["c_max"])
    assert krok["c_zrodlo_min"] == pelny["c_zrodlo_min"]


def test_fikstura_pokrywa_iloczyn_cech() -> None:
    przypadki = _przypadki()
    uklady = {p["to_dict"]["network_type"] for p in przypadki}
    assert uklady == {"TN-S", "TN-C-S", "TN-C"}
    liczby_skladowych = {len(p["to_dict"]["components"]) for p in przypadki}
    assert liczby_skladowych == {3, 4}
    assert len(przypadki) == 18

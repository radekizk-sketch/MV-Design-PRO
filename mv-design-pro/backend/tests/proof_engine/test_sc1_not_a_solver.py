"""
SC1 NOT-A-SOLVER — proof engine nie liczy fizyki (V12K-118).

Naprawa u źródła: ``generate_sc1_proof`` dawniej liczył w warstwie proof engine
Z_ekw, prądy składowe/fazowe, I″k, κ, i_p, I_th (naruszenie NOT-A-SOLVER).
Po naprawie wielkości liczy WYŁĄCZNIE solver
``network_model/solvers/short_circuit_asymmetrical_quantities``, a generator
dowodu jest czystym formatterem (wzór → podstawienie → wynik).

Dowód niezmienności liczb: goldeny bajt-w-bajt
``tests/golden/sc_asymmetrical/**`` (test_sc_asymmetrical_golden.py) —
NIETKNIĘTE przy tej naprawie.
"""

from __future__ import annotations

import inspect
import math
from datetime import datetime

import pytest
from application.proof_engine import proof_generator as proof_generator_module
from application.proof_engine.proof_generator import ProofGenerator, SC1Input
from network_model.solvers.short_circuit_asymmetrical_quantities import (
    compute_sc1_asymmetrical_quantities,
)


def _input_bez_wielkosci() -> SC1Input:
    return SC1Input(
        project_name="Test Project",
        case_name="NOT-A-SOLVER",
        fault_node_id="B1",
        fault_type="ONE_PHASE_TO_GROUND",
        run_timestamp=datetime(2026, 7, 22, 10, 0, 0),
        solver_version="1.0.0-test",
        u_n_kv=15.0,
        c_factor=1.10,
        u_prefault_kv=8.660,
        z1_ohm=complex(0.5, 1.2),
        z2_ohm=complex(0.6, 1.1),
        z0_ohm=complex(0.8, 2.4),
        a_operator=complex(-0.5, math.sqrt(3) / 2),
    )


def test_proof_generator_bez_metod_fizyki_sc1():
    """ProofGenerator nie ma już żadnej metody obliczeniowej _compute_sc1*."""
    metody_fizyki = [name for name in dir(ProofGenerator) if name.startswith("_compute_sc1")]
    assert (
        metody_fizyki == []
    ), f"Proof engine nie może liczyć fizyki SC1 (NOT-A-SOLVER); znaleziono: {metody_fizyki}"


def test_proof_generator_nie_wola_solvera_sc1():
    """Generator dowodu nie WYWOŁUJE funkcji obliczeniowej solvera SC1.

    Wielkości przekazuje wywołujący (pack) — generator tylko formatuje.
    """
    source = inspect.getsource(proof_generator_module)
    assert "compute_sc1_asymmetrical_quantities(" not in source


def test_wielkosci_sc1_licza_sie_w_warstwie_solverow():
    """Funkcja obliczeniowa SC1 żyje w network_model/solvers (jedyna warstwa fizyki)."""
    assert compute_sc1_asymmetrical_quantities.__module__ == (
        "network_model.solvers.short_circuit_asymmetrical_quantities"
    )


def test_generate_sc1_proof_wymaga_wielkosci_solvera():
    """SC1Input bez quantities → ValueError (proof engine nie liczy fizyki)."""
    with pytest.raises(ValueError, match="nie liczy fizyki"):
        ProofGenerator.generate_sc1_proof(_input_bez_wielkosci())


def test_generate_sc1_proof_odrzuca_niezgodny_typ_zwarcia():
    """Quantities policzone dla innego typu zwarcia niż dowód → ValueError."""
    data = _input_bez_wielkosci()
    data.quantities = compute_sc1_asymmetrical_quantities(
        fault_type="TWO_PHASE",
        u_n_kv=data.u_n_kv,
        c_factor=data.c_factor,
        u_prefault_kv=data.u_prefault_kv,
        z1_ohm=data.z1_ohm,
        z2_ohm=data.z2_ohm,
        z0_ohm=data.z0_ohm,
        a_operator=data.a_operator,
        m_factor=data.m_factor,
        n_factor=data.n_factor,
    )
    with pytest.raises(ValueError, match="policzone dla typu"):
        ProofGenerator.generate_sc1_proof(data)

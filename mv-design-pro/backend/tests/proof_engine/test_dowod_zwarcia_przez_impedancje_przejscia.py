"""Dowód zwarcia przez impedancję przejścia Z_f (karta OD-14, partia integracji 10).

INTENCJA. Wynik biegu z Z_f i jego dowód muszą opisywać TEN SAM prąd: dowód nie może pokazać
I_k'' = c·U_n/(√3·|Z_th|), gdy solver policzył I_k'' z pętli Z_th + Z_f. Iloczyn cech:

  * SC3F: Z_f {brak, 0, R_f, jX_f, R_f + jX_f} × kroki dowodu (kolejność wariantu z Z_f,
    współczynnik c wyłącznie w kroku I_k'', liczby kroków = liczby wyniku solvera, ostrzeżenie
    i tytuł „poza zakresem IEC 60909"); Z_f = 0 daje dowód bajt w bajt jak brak Z_f;
  * SC1: rodzaj {1F-Z, 2F, 2F-Z} × Z_f {brak, 0, R_f, R_f + jX_f} — ta sama para cech;
  * spójność wejścia dowodu: para (Z_f, Z_k) w SC3FInput, Z_f wielkości SC1 = Z_f dowodu;
  * reguła danych Z_f w wielkościach SC1 (ta sama co w rdzeniu) — odmowa nazwana z kodem.
"""

from __future__ import annotations

import dataclasses
import math
from datetime import datetime
from uuid import UUID

import pytest
from application.proof_engine.equation_registry import EquationRegistry
from application.proof_engine.proof_generator import (
    TYTUL_DOWODU_SC1_IMPEDANCJA,
    TYTUL_DOWODU_SC3F_IMPEDANCJA,
    ProofGenerator,
    SC1Input,
    SC3FInput,
)
from network_model.core.branch import BranchType, LineBranch
from network_model.core.graph import NetworkGraph
from network_model.core.grid_source import GridShortCircuitSource
from network_model.core.impedancja_przejscia import (
    KOD_IMPEDANCJA_NIESKONCZONA,
    KOD_IMPEDANCJA_POJEMNOSCIOWA,
    KOD_REZYSTANCJA_UJEMNA,
)
from network_model.core.node import Node, NodeType
from network_model.odmowa_danych import OdmowaNazwana
from network_model.solvers.short_circuit_asymmetrical_quantities import (
    compute_sc1_asymmetrical_quantities,
)
from network_model.solvers.short_circuit_iec60909 import ShortCircuitIEC60909Solver

UN_KV = 15.0
C = 1.1
SK_MVA = 250.0
RX_Q = 0.1
_ZQ_ABS = C * UN_KV**2 / SK_MVA
_XQ = _ZQ_ABS / math.sqrt(1.0 + RX_Q**2)
Z_Q = complex(RX_Q * _XQ, _XQ)
WEZEL = "koniec-linii"
ARTEFAKT = UUID("00000000-0000-0000-0000-0000000000a1")
CZAS = datetime(2026, 10, 16, 12, 0, 0)

#: Z_f istotne (≠ 0) — wariant dowodu „przez impedancję przejścia".
ZF_ISTOTNE = {
    "rezystancja": complex(2.0, 0.0),
    "reaktancja": complex(0.0, 1.5),
    "zespolona": complex(2.0, 1.5),
}


def _siec() -> NetworkGraph:
    graf = NetworkGraph()
    graf.add_node(
        Node(
            id="zasilanie",
            name="Zasilanie",
            node_type=NodeType.SLACK,
            voltage_level=UN_KV,
            active_power=0.0,
            reactive_power=0.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    graf.add_node(
        Node(
            id=WEZEL,
            name="Koniec linii",
            node_type=NodeType.PQ,
            voltage_level=UN_KV,
            active_power=0.0,
            reactive_power=0.0,
        )
    )
    graf.add_branch(
        LineBranch(
            id="linia",
            name="Linia",
            branch_type=BranchType.LINE,
            from_node_id="zasilanie",
            to_node_id=WEZEL,
            r_ohm_per_km=0.206,
            x_ohm_per_km=0.35,
            b_us_per_km=0.0,
            length_km=5.0,
            rated_current_a=0.0,
        )
    )
    graf.add_grid_sc_source(
        GridShortCircuitSource(id="siec", name="Sieć", node_id="zasilanie", z_ohm=Z_Q)
    )
    return graf


def _wejscie_sc3f(z_f: complex | None) -> SC3FInput:
    argumenty: dict[str, object] = {
        "graph": _siec(),
        "fault_node_id": WEZEL,
        "c_factor": C,
        "tk_s": 1.0,
    }
    if z_f is not None:
        argumenty["z_f_ohm"] = z_f
    wynik = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(**argumenty)
    wejscie = SC3FInput.from_short_circuit_result(wynik)
    # Znacznik czasu z `from_short_circuit_result` to chwila wywołania — przypięty, żeby
    # porównanie dwóch dowodów dotyczyło treści, nie zegara.
    return dataclasses.replace(wejscie, run_timestamp=CZAS)


def _dowod_sc3f(z_f: complex | None):
    return ProofGenerator.generate_sc3f_proof(_wejscie_sc3f(z_f), artifact_id=ARTEFAKT)


def _tresc(dowod) -> dict:
    """Treść dowodu bez pól tożsamości dokumentu (identyfikator i chwila utworzenia)."""
    tresc = dowod.to_dict()
    for pole in ("document_id", "created_at"):
        tresc.pop(pole, None)
    return tresc


# ---------------------------------------------------------------------------
# SC3F
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("etykieta", sorted(ZF_ISTOTNE))
def test_dowod_sc3f_przez_zf_ma_kroki_petli_i_prad_wyniku(etykieta: str) -> None:
    z_f = ZF_ISTOTNE[etykieta]
    wejscie = _wejscie_sc3f(z_f)
    dowod = ProofGenerator.generate_sc3f_proof(wejscie, artifact_id=ARTEFAKT)
    rownania = [krok.equation.equation_id for krok in dowod.steps]
    assert rownania == EquationRegistry.get_sc3f_proof_step_order(impedancja_przejscia=True)
    assert "EQ_SC3F_004" not in rownania and "EQ_SC3F_005" not in rownania
    # Liczby dowodu = liczby wyniku solvera (dowód formatuje, nie liczy).
    wyniki = dowod.summary.key_results
    assert wyniki["ikss_ka"].value == pytest.approx(wejscie.ikss_ka, rel=1e-12)
    assert wyniki["z_f_ohm"].value == z_f
    assert wyniki["z_petli_ohm"].value == wejscie.z_petli_ohm
    assert wejscie.z_petli_ohm == pytest.approx(wejscie.z_thevenin_ohm + z_f, rel=1e-12)
    # I_k'' z pętli: c·U_n/(√3·|Z_k|).
    assert wejscie.ikss_ka == pytest.approx(
        C * UN_KV / (math.sqrt(3.0) * abs(wejscie.z_petli_ohm)), rel=1e-9
    )
    assert any("poza zakresem IEC 60909" in w for w in dowod.summary.warnings)
    assert dowod.title_pl == TYTUL_DOWODU_SC3F_IMPEDANCJA


@pytest.mark.parametrize("etykieta", sorted(ZF_ISTOTNE))
def test_dowod_sc3f_przez_zf_wspolczynnik_c_wylacznie_w_kroku_pradu(etykieta: str) -> None:
    """Anti-double-counting w wariancie z Z_f: c wchodzi WYŁĄCZNIE do kroku I_k'' pętli."""
    dowod = _dowod_sc3f(ZF_ISTOTNE[etykieta])
    kroki_z_c = [
        krok.equation.equation_id
        for krok in dowod.steps
        if any(wartosc.symbol == "c" for wartosc in krok.input_values)
    ]
    assert kroki_z_c == ["EQ_SC3F_017"]


def test_dowod_sc3f_bez_zf_ma_kroki_metaliczne_bez_sladu_zf() -> None:
    dowod = _dowod_sc3f(None)
    rownania = [krok.equation.equation_id for krok in dowod.steps]
    assert rownania == EquationRegistry.get_sc3f_proof_step_order()
    assert "z_f_ohm" not in dowod.summary.key_results
    assert "z_petli_ohm" not in dowod.summary.key_results
    assert not any("IEC 60909" in w and "poza zakresem" in w for w in dowod.summary.warnings)
    assert dowod.title_pl != TYTUL_DOWODU_SC3F_IMPEDANCJA


@pytest.mark.parametrize("zero", [0j, complex(-0.0, 0.0), complex(0.0, -0.0)])
def test_dowod_sc3f_zerowa_zf_bajt_w_bajt_jak_metaliczny(zero: complex) -> None:
    """Kontrakt §1: Z_f = 0 (także zera ze znakiem) ≡ zwarcie metaliczne — dowód identyczny."""
    assert _tresc(_dowod_sc3f(zero)) == _tresc(_dowod_sc3f(None))


@pytest.mark.parametrize("etykieta", sorted(ZF_ISTOTNE))
def test_dowod_sc3f_przez_zf_deterministyczny(etykieta: str) -> None:
    z_f = ZF_ISTOTNE[etykieta]
    assert _tresc(_dowod_sc3f(z_f)) == _tresc(_dowod_sc3f(z_f))


@pytest.mark.parametrize(
    "para",
    [{"z_f_ohm": complex(2.0, 0.0)}, {"z_petli_ohm": complex(3.0, 2.7)}],
    ids=["zf_bez_petli", "petla_bez_zf"],
)
def test_wejscie_sc3f_para_zf_i_petli_tylko_razem(para: dict[str, complex]) -> None:
    wejscie = _wejscie_sc3f(None)
    with pytest.raises(ValueError, match="wyłącznie razem"):
        dataclasses.replace(wejscie, **para)


# ---------------------------------------------------------------------------
# SC1 (1F-Z, 2F, 2F-Z)
# ---------------------------------------------------------------------------

A_OPERATOR = complex(-0.5, math.sqrt(3.0) / 2.0)
Z1 = complex(1.1285, 2.7351)
Z2 = Z1
Z0 = 3.0 * Z1
U_PREFAULT_KV = C * UN_KV / math.sqrt(3.0)
RODZAJE_SC1 = ["SC1FZ", "SC2F", "SC2FZ"]


def _wielkosci(rodzaj: str, z_f: complex | None):
    return compute_sc1_asymmetrical_quantities(
        fault_type=rodzaj,
        u_n_kv=UN_KV,
        c_factor=C,
        u_prefault_kv=U_PREFAULT_KV,
        z1_ohm=Z1,
        z2_ohm=Z2,
        z0_ohm=Z0,
        a_operator=A_OPERATOR,
        z_f_ohm=z_f,
    )


def _wejscie_sc1(rodzaj: str, z_f: complex | None, *, z_f_dowodu: object = "jak_wielkosci"):
    wielkosci = _wielkosci(rodzaj, z_f)
    return SC1Input(
        project_name="Projekt",
        case_name="Przypadek",
        fault_node_id=WEZEL,
        fault_type=rodzaj,
        run_timestamp=CZAS,
        solver_version="test",
        u_n_kv=UN_KV,
        c_factor=C,
        u_prefault_kv=U_PREFAULT_KV,
        z1_ohm=Z1,
        z2_ohm=Z2,
        z0_ohm=Z0,
        a_operator=A_OPERATOR,
        quantities=wielkosci,
        z_f_ohm=(wielkosci.z_f_ohm if z_f_dowodu == "jak_wielkosci" else z_f_dowodu),
    )


def _petla_sc1(rodzaj: str, z_f: complex) -> complex:
    if rodzaj == "SC2F":
        return Z1 + Z2 + z_f
    if rodzaj == "SC1FZ":
        return Z1 + Z2 + Z0 + 3.0 * z_f
    return Z1 + Z2 * (Z0 + 3.0 * z_f) / (Z2 + Z0 + 3.0 * z_f)


@pytest.mark.parametrize("rodzaj", RODZAJE_SC1)
@pytest.mark.parametrize("etykieta", ["rezystancja", "zespolona"])
def test_dowod_sc1_przez_zf_kroki_petli_i_prad_wielkosci(rodzaj: str, etykieta: str) -> None:
    z_f = ZF_ISTOTNE[etykieta]
    wejscie = _wejscie_sc1(rodzaj, z_f)
    dowod = ProofGenerator.generate_sc1_proof(wejscie, artifact_id=ARTEFAKT)
    rownania = [krok.equation.equation_id for krok in dowod.steps]
    assert rownania == EquationRegistry.get_sc1_step_order(rodzaj, impedancja_przejscia=True)
    assert rownania != EquationRegistry.get_sc1_step_order(rodzaj)
    wielkosci = wejscie.quantities
    assert wielkosci is not None
    assert wielkosci.z_equiv_ohm == pytest.approx(_petla_sc1(rodzaj, z_f), rel=1e-12)
    assert dowod.summary.key_results["ikss_ka"].value == pytest.approx(wielkosci.ikss_ka, rel=1e-12)
    assert dowod.summary.key_results["z_f_ohm"].value == z_f
    assert any("poza zakresem IEC 60909" in w for w in dowod.summary.warnings)
    assert dowod.title_pl == TYTUL_DOWODU_SC1_IMPEDANCJA
    assert dowod.summary.unit_check_passed


@pytest.mark.parametrize("rodzaj", RODZAJE_SC1)
@pytest.mark.parametrize("zero", [0j, complex(-0.0, 0.0), complex(0.0, -0.0)])
def test_dowod_sc1_zerowa_zf_bajt_w_bajt_jak_metaliczny(rodzaj: str, zero: complex) -> None:
    assert _wielkosci(rodzaj, zero).z_f_ohm is None
    assert _wielkosci(rodzaj, zero) == _wielkosci(rodzaj, None)
    zerowy = ProofGenerator.generate_sc1_proof(_wejscie_sc1(rodzaj, zero), artifact_id=ARTEFAKT)
    metaliczny = ProofGenerator.generate_sc1_proof(_wejscie_sc1(rodzaj, None), artifact_id=ARTEFAKT)
    assert _tresc(zerowy) == _tresc(metaliczny)
    assert [k.equation.equation_id for k in metaliczny.steps] == (
        EquationRegistry.get_sc1_step_order(rodzaj)
    )


@pytest.mark.parametrize("rodzaj", RODZAJE_SC1)
@pytest.mark.parametrize(
    ("z_f_wielkosci", "z_f_dowodu"),
    [(complex(2.0, 0.0), None), (None, complex(2.0, 0.0)), (complex(2.0, 0.0), complex(1.0, 0.0))],
    ids=["wielkosci_z_zf_dowod_bez", "wielkosci_bez_dowod_z_zf", "rozne_zf"],
)
def test_dowod_sc1_odmawia_wielkosci_innej_zf(
    rodzaj: str, z_f_wielkosci: complex | None, z_f_dowodu: complex | None
) -> None:
    """Jedna prawda Z_f: dowód nie formatuje wielkości policzonych dla innej Z_f."""
    wejscie = _wejscie_sc1(rodzaj, z_f_wielkosci, z_f_dowodu=z_f_dowodu)
    with pytest.raises(ValueError, match="innej impedancji przejścia"):
        ProofGenerator.generate_sc1_proof(wejscie, artifact_id=ARTEFAKT)


@pytest.mark.parametrize("rodzaj", RODZAJE_SC1)
@pytest.mark.parametrize(
    ("z_f", "kod"),
    [
        (complex(1.0, -0.5), KOD_IMPEDANCJA_POJEMNOSCIOWA),
        (complex(-0.1, 0.5), KOD_REZYSTANCJA_UJEMNA),
        (complex(float("nan"), 0.0), KOD_IMPEDANCJA_NIESKONCZONA),
        (complex(0.0, float("inf")), KOD_IMPEDANCJA_NIESKONCZONA),
    ],
    ids=["x_ujemna", "r_ujemna", "nan", "inf"],
)
def test_wielkosci_sc1_niedopuszczalna_zf_to_odmowa_nazwana(
    rodzaj: str, z_f: complex, kod: str
) -> None:
    with pytest.raises(OdmowaNazwana) as odmowa:
        _wielkosci(rodzaj, z_f)
    assert odmowa.value.kod == kod

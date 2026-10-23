"""Karta MU-INTERPOLACJA — dowód SC3F pokazuje wyznaczenie μ i q ze śladu solvera.

Krok μ (EQ_SC3F_011) i krok q (EQ_SC3F_012) niosą w LaTeX oba węzły krzywych normy, obie
wartości węzłowe, wagę interpolacji i wynik. Liczy JEDNA funkcja solvera
(`machine_sc_iec60909.slad_mu` / `slad_q`); dowód tylko czyta jej ślad — test podmienia ślad
na fabrykat i sprawdza, że dowód pokazuje fabrykat (gdyby dowód liczył krzywe sam, pokazałby
własne liczby).
"""

from __future__ import annotations

from dataclasses import replace

import pytest
from application.proof_engine.proof_generator import ProofGenerator, SC3FInput
from network_model.solvers.machine_sc_iec60909 import (
    REGULA_INTERPOLACJA,
    SladKrzywejZaniku,
    WezelKrzywejZaniku,
    compute_machine_contributions,
)

from tests.network_model.solvers.test_machine_sc_iec60909 import (
    _async,
    _slack_line_bus,
    _sync,
)
from tests.proof_engine.test_proof_engine import sc3f_test_input  # noqa: F401 — fikstura


def _wynik_maszyn(t_min_s: float):
    g = _slack_line_bus()
    g.add_synchronous_machine_source(_sync())
    g.add_asynchronous_machine_source(_async())
    return compute_machine_contributions(g, "B", c_factor=1.1, t_min_s=t_min_s)


def _kroki(dane: SC3FInput, rownanie: str) -> list:
    dowod = ProofGenerator.generate_sc3f_proof(dane)
    return [k for k in dowod.steps if k.equation.equation_id == rownanie]


def test_krok_mu_i_q_w_wezle_jedna_krzywa(sc3f_test_input: SC3FInput) -> None:  # noqa: F811
    wynik = _wynik_maszyn(0.10)
    dane = replace(sc3f_test_input, fault_node_id="B", machine_result=wynik)
    kroki_mu = _kroki(dane, "EQ_SC3F_011")
    (krok_q,) = _kroki(dane, "EQ_SC3F_012")
    assert len(kroki_mu) == 2
    for krok, wklad in zip(kroki_mu, wynik.contributions, strict=True):
        assert krok.substitution_latex.startswith(r"\mu = 0.62 + 0.72 \cdot e^{-0.32 \cdot")
        assert r"\frac" not in krok.substitution_latex
        assert krok.result.value == wklad.mu
        t_min = next(v for v in krok.input_values if v.symbol == "t_{min}")
        assert t_min.value == 0.10 and t_min.unit == "s"
    assert krok_q.substitution_latex.startswith(r"q = 0.57 + 0.12 \cdot \ln(")


@pytest.mark.parametrize(("t_min_s", "t_1", "t_2"), [(0.2, "0.10", "0.25"), (0.03, "0.02", "0.05")])
def test_krok_mu_i_q_pomiedzy_wezlami_niesie_oba_wezly_wage_i_wynik(
    sc3f_test_input: SC3FInput, t_min_s: float, t_1: str, t_2: str  # noqa: F811
) -> None:
    wynik = _wynik_maszyn(t_min_s)
    dane = replace(sc3f_test_input, fault_node_id="B", machine_result=wynik)
    kroki_mu = _kroki(dane, "EQ_SC3F_011")
    (krok_q,) = _kroki(dane, "EQ_SC3F_012")
    for krok, wklad in zip(kroki_mu, wynik.contributions, strict=True):
        slad = wklad.slad_mu
        assert slad.regula == REGULA_INTERPOLACJA
        assert slad.wezel_dolny is not None and slad.wezel_gorny is not None
        tekst = krok.substitution_latex
        assert rf"\mu_{{{t_1}}} = " in tekst and rf"\mu_{{{t_2}}} = " in tekst
        assert f"{slad.wezel_dolny.wartosc:.4f}" in tekst
        assert f"{slad.wezel_gorny.wartosc:.4f}" in tekst
        assert f"{slad.waga:.4f}" in tekst
        # Karta PODSTAWA-Q: podstawa interpolacji μ — zezwolenie pkt 9.1.1 (jedna tablica solvera).
        assert tekst.endswith(
            r"\quad (\text{interpolacja liniowa między krzywymi dopuszczona przez "
            r"IEC 60909-0:2016 pkt 9.1.1})"
        )
        assert f"= {wklad.mu:.4f}" in tekst
        assert krok.result.value == wklad.mu
    asynchroniczny = wynik.contributions[1]
    assert asynchroniczny.slad_q is not None
    assert rf"q_{{{t_1}}} = " in krok_q.substitution_latex
    assert f"{asynchroniczny.slad_q.waga:.4f}" in krok_q.substitution_latex
    # Interpolacja q — interpretacja inżynierska, nie zapis normy (pkt 9.1.2 jej nie przewiduje).
    assert krok_q.substitution_latex.endswith(
        r"\quad (\text{interpolacja liniowa po czasie zwłoki: interpretacja inżynierska, "
        r"IEC 60909-0:2016 pkt 9.1.2 jej nie przewiduje})"
    )
    assert krok_q.result.value == asynchroniczny.q


def test_dowod_czyta_slad_nie_liczy_krzywych(sc3f_test_input: SC3FInput) -> None:  # noqa: F811
    """Fabrykat śladu (liczby niemożliwe do uzyskania z krzywych) trafia do dowodu 1:1."""
    wynik = _wynik_maszyn(0.2)
    fabrykat = SladKrzywejZaniku(
        wielkosc="mu",
        t_min_s=0.2,
        argument=4.321,
        regula=REGULA_INTERPOLACJA,
        wezel_dolny=WezelKrzywejZaniku(0.10, (0.11, 0.22, 0.33), 0.5555, 0.5555),
        wezel_gorny=WezelKrzywejZaniku(0.25, (0.44, 0.55, 0.66), 0.4444, 0.4444),
        waga=0.1234,
        wynik=0.5418,
    )
    podmieniony = replace(wynik.contributions[0], slad_mu=fabrykat, mu=0.5418)
    wynik = replace(wynik, contributions=[podmieniony, *wynik.contributions[1:]])
    dane = replace(sc3f_test_input, fault_node_id="B", machine_result=wynik)
    krok = _kroki(dane, "EQ_SC3F_011")[0]
    for liczba in ("0.11 + 0.22", "4.321", "0.5555", "0.4444", "0.1234", "0.5418"):
        assert liczba in krok.substitution_latex


def test_kroki_maszyn_przechodza_kontrole_jednostek(
    sc3f_test_input: SC3FInput,  # noqa: F811
) -> None:
    dane = replace(sc3f_test_input, fault_node_id="B", machine_result=_wynik_maszyn(0.2))
    dowod = ProofGenerator.generate_sc3f_proof(dane)
    for krok in dowod.steps:
        assert krok.unit_check.passed, krok.equation.equation_id

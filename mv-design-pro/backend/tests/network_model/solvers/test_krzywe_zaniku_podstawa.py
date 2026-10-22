"""Karta PODSTAWA-Q — podstawa reguły krzywych zaniku μ i q per wielkość i per reguła.

PO CO. Właściciel zweryfikował brzmienie IEC 60909-0:2016 (s. 53–55): pkt 9.1.1 (μ, wzór (67),
rys. 13) dopuszcza wprost interpolację liniową między krzywymi („For other values of minimum
time delay, linear interpolation between curves is acceptable."), a pkt 9.1.2 (q, wzór (69),
rys. 14) tego zezwolenia NIE powtarza. Interpolacja q po t_min jest więc interpretacją
inżynierską, a repo przypisywało normie oba przypadki jednakowo (wspólny napis „rozdz. 9"
i krok „interpolacja … dopuszczona przez normę" także dla q). Liczby się nie zmieniają —
zmienia się deklaracja podstawy w śladzie, wywodzie, dowodzie SC3F i rejestrze równań.

ILOCZYN CECH: {μ, q} × {WEZEL, PONIZEJ_ZAKRESU, POWYZEJ_ZAKRESU, INTERPOLACJA, BEZ_ZANIKU} ×
{status podstawy w śladzie, tekst kroku wywodu, podstawienie kroku dowodu SC3F, odwołanie normy
z numerem punktu}. Wyrocznia statusów jest zapisana w tym pliku niezależnie od tablicy solvera.
Do tego realny tor (`compute_machine_contributions` → dowód SC3F) dla maszyny synchronicznej
i asynchronicznej oraz rejestr równań EQ_SC3F_011 / EQ_SC3F_012.
"""

from __future__ import annotations

import re
from dataclasses import replace

import pytest
from application.proof_engine.equation_registry import EQ_SC3F_011, EQ_SC3F_012
from application.proof_engine.proof_generator import ProofGenerator, SC3FInput
from network_model.solvers.machine_sc_iec60909 import (
    PODSTAWY_REGUL_KRZYWYCH,
    REGULA_BEZ_ZANIKU,
    REGULA_INTERPOLACJA,
    REGULA_PONIZEJ_ZAKRESU,
    REGULA_POWYZEJ_ZAKRESU,
    REGULA_WEZEL,
    UWAGA_WYDANIA_NORMY_KRZYWYCH,
    SladKrzywejZaniku,
    compute_machine_contributions,
    kroki_krzywej_zaniku,
    slad_mu,
    slad_q,
)

from tests.network_model.solvers.test_machine_sc_iec60909 import (
    _async,
    _slack_line_bus,
    _sync,
)
from tests.proof_engine.test_proof_engine import sc3f_test_input  # noqa: F401 — fikstura

REGULY = (
    REGULA_WEZEL,
    REGULA_PONIZEJ_ZAKRESU,
    REGULA_POWYZEJ_ZAKRESU,
    REGULA_INTERPOLACJA,
    REGULA_BEZ_ZANIKU,
)

#: Punkt normy per wielkość (IEC 60909-0:2016) — wyrocznia testu, nie tablica solvera.
PUNKT = {"mu": "pkt 9.1.1", "q": "pkt 9.1.2"}
NORMA = {
    "mu": "IEC 60909-0:2016 pkt 9.1.1, wzór (67), rys. 13",
    "q": "IEC 60909-0:2016 pkt 9.1.2, wzór (69), rys. 14",
}

#: Wyrocznia statusu podstawy (wielkość, reguła): zapis normy albo założenie inżynierskie.
#: μ: węzeł, ≥ 0,25 s, interpolacja (pkt 9.1.1 zezwala wprost), μ = 1 dla I″k/I_r ≤ 2 — norma.
#: q: węzeł i ≥ 0,25 s — norma; interpolacja (pkt 9.1.2 jej nie przewiduje) i m ≤ 0 (wzór (69)
#: nieokreślony) — założenie. Obie wielkości: t_min < 0,02 s → krzywa 0,02 s — założenie (norma
#: krzywych poniżej 0,02 s nie podaje).
STATUS_OCZEKIWANY = {
    ("mu", REGULA_WEZEL): "NORMA",
    ("mu", REGULA_POWYZEJ_ZAKRESU): "NORMA",
    ("mu", REGULA_INTERPOLACJA): "NORMA",
    ("mu", REGULA_BEZ_ZANIKU): "NORMA",
    ("mu", REGULA_PONIZEJ_ZAKRESU): "ZALOZENIE_INZYNIERSKIE",
    ("q", REGULA_WEZEL): "NORMA",
    ("q", REGULA_POWYZEJ_ZAKRESU): "NORMA",
    ("q", REGULA_INTERPOLACJA): "ZALOZENIE_INZYNIERSKIE",
    ("q", REGULA_BEZ_ZANIKU): "ZALOZENIE_INZYNIERSKIE",
    ("q", REGULA_PONIZEJ_ZAKRESU): "ZALOZENIE_INZYNIERSKIE",
}

#: Słowa, którymi tekst przypisałby normie zezwolenie („dopuszczona", „zezwala", „zezwolenie").
ZEZWOLENIE = re.compile(r"dopuszcz|zezw", re.IGNORECASE)
CYTAT_9_1_1 = (
    "For other values of minimum time delay, linear interpolation between curves is acceptable."
)

#: (t_min, argument) dający każdą regułę: μ — krotność I″k/I_r, q — m [MW na parę biegunów].
WEJSCIE = {
    ("mu", REGULA_WEZEL): (0.10, 7.25),
    ("mu", REGULA_PONIZEJ_ZAKRESU): (0.01, 7.25),
    ("mu", REGULA_POWYZEJ_ZAKRESU): (0.40, 7.25),
    ("mu", REGULA_INTERPOLACJA): (0.20, 7.25),
    ("mu", REGULA_BEZ_ZANIKU): (0.20, 1.5),
    ("q", REGULA_WEZEL): (0.10, 0.5),
    ("q", REGULA_PONIZEJ_ZAKRESU): (0.01, 0.5),
    ("q", REGULA_POWYZEJ_ZAKRESU): (0.40, 0.5),
    ("q", REGULA_INTERPOLACJA): (0.20, 0.5),
    ("q", REGULA_BEZ_ZANIKU): (0.20, 0.0),
}


def _slad(wielkosc: str, regula: str) -> SladKrzywejZaniku:
    t_min_s, argument = WEJSCIE[(wielkosc, regula)]
    slad = (slad_mu if wielkosc == "mu" else slad_q)(argument, t_min_s)
    assert slad.wielkosc == wielkosc and slad.regula == regula
    return slad


def _teksty(slad: SladKrzywejZaniku) -> tuple[dict, str, str]:
    """(ślad to_dict, tekst kroków wywodu, podstawienie kroku dowodu SC3F)."""
    wywod = " ".join(k["tekst"] for k in kroki_krzywej_zaniku(slad))
    return slad.to_dict(), wywod, ProofGenerator._podstawienie_krzywej_zaniku(slad)


def test_tablica_podstaw_jest_zamknieta_na_iloczynie_wielkosc_x_regula() -> None:
    """Każda para (wielkość, reguła) ma dokładnie jeden wpis — i żaden inny (lista zamknięta)."""
    assert set(PODSTAWY_REGUL_KRZYWYCH) == {(w, r) for w in ("mu", "q") for r in REGULY}
    assert set(PODSTAWY_REGUL_KRZYWYCH) == set(STATUS_OCZEKIWANY)


@pytest.mark.parametrize("regula", REGULY)
@pytest.mark.parametrize("wielkosc", ["mu", "q"])
def test_podstawa_iloczyn_wielkosc_x_regula_x_miejsce(wielkosc: str, regula: str) -> None:
    slad = _slad(wielkosc, regula)
    zapis, wywod, dowod = _teksty(slad)
    status = STATUS_OCZEKIWANY[(wielkosc, regula)]
    inna = "q" if wielkosc == "mu" else "mu"
    # Status podstawy w śladzie — wyprowadzony z reguły, nie przechowywany osobno.
    assert zapis["podstawa_reguly"] == status
    assert slad.podstawa.rodzaj_zrodla == status
    # Odwołanie normy z numerem punktu — per wielkość, nigdy punkt drugiej wielkości.
    assert zapis["norma"] == NORMA[wielkosc]
    for tekst in (zapis["podstawa_reguly_pl"], wywod, dowod):
        assert PUNKT[wielkosc] in tekst, tekst
        assert PUNKT[inna] not in tekst, tekst
        assert "rozdz. 9" not in tekst, tekst
    # Założenie nazywa się po imieniu w każdym miejscu; zapis normy — nigdy „interpretacją".
    for tekst in (zapis["podstawa_reguly_pl"], wywod, dowod):
        if status == "ZALOZENIE_INZYNIERSKIE":
            assert "interpretacja inżynierska" in tekst, tekst
        else:
            assert "interpretacja inżynierska" not in tekst, tekst


@pytest.mark.parametrize("regula", REGULY)
def test_q_nigdy_nie_przypisuje_normie_zezwolenia(regula: str) -> None:
    """Żaden tekst podstawy q (ślad, wywód, dowód) nie mówi „dopuszczona"/„zezwala" o normie."""
    zapis, wywod, dowod = _teksty(_slad("q", regula))
    for tekst in (zapis["podstawa_reguly_pl"], wywod, dowod):
        assert not ZEZWOLENIE.search(tekst), tekst


def test_interpolacja_q_mowi_wprost_ze_pkt_9_1_2_jej_nie_przewiduje() -> None:
    zapis, wywod, dowod = _teksty(_slad("q", REGULA_INTERPOLACJA))
    for tekst in (zapis["podstawa_reguly_pl"], wywod, dowod):
        assert "pkt 9.1.2" in tekst and "nie przewiduje" in tekst, tekst
    assert "q ≤ 1" in zapis["podstawa_reguly_pl"]
    assert "po t_min" in zapis["podstawa_reguly_pl"]


def test_interpolacja_mu_cytuje_zezwolenie_pkt_9_1_1() -> None:
    zapis, wywod, dowod = _teksty(_slad("mu", REGULA_INTERPOLACJA))
    for tekst in (zapis["podstawa_reguly_pl"], wywod):
        assert "pkt 9.1.1" in tekst and CYTAT_9_1_1 in tekst, tekst
    # Dowód (LaTeX \text{}) niesie zezwolenie z punktem normy, bez cudzysłowu cytatu.
    assert "dopuszczona przez IEC 60909-0:2016 pkt 9.1.1" in dowod


@pytest.mark.parametrize("wielkosc", ["mu", "q"])
def test_skrot_podstawy_bez_znakow_specjalnych_latex(wielkosc: str) -> None:
    """Skrót podstawy wchodzi do `\\text{}` dowodu SC3F — bez znaków, które łamią LaTeX."""
    for regula in REGULY:
        skrot = PODSTAWY_REGUL_KRZYWYCH[(wielkosc, regula)].skrot_pl
        assert not set(skrot) & set("_%&#$^~\\{}≤≥"), skrot


def test_rejestr_rownan_rozroznia_podstawe_mu_i_q() -> None:
    assert EQ_SC3F_011.standard_ref.startswith(NORMA["mu"])
    assert "dopuszczona przez IEC 60909-0:2016 pkt 9.1.1" in EQ_SC3F_011.standard_ref
    assert CYTAT_9_1_1 in EQ_SC3F_011.notes
    assert EQ_SC3F_012.standard_ref.startswith(NORMA["q"])
    for tekst in (EQ_SC3F_012.standard_ref, EQ_SC3F_012.notes):
        assert "interpretacja inżynierska" in tekst and "pkt 9.1.2" in tekst, tekst
        assert not ZEZWOLENIE.search(tekst), tekst
    for rownanie in (EQ_SC3F_011, EQ_SC3F_012):
        assert "rozdz. 9" not in rownanie.standard_ref
        assert UWAGA_WYDANIA_NORMY_KRZYWYCH in rownanie.notes
    assert "IEC 60909-0:2026 (wyd. 3.0) zastępuje 2016" in UWAGA_WYDANIA_NORMY_KRZYWYCH
    assert "niezweryfikowane" in UWAGA_WYDANIA_NORMY_KRZYWYCH


def _wynik_maszyn(t_min_s: float):
    g = _slack_line_bus()
    g.add_synchronous_machine_source(_sync())
    g.add_asynchronous_machine_source(_async())
    return compute_machine_contributions(g, "B", c_factor=1.1, t_min_s=t_min_s)


@pytest.mark.parametrize(
    ("t_min_s", "regula", "status_q"),
    [
        (0.10, REGULA_WEZEL, "NORMA"),
        (0.20, REGULA_INTERPOLACJA, "ZALOZENIE_INZYNIERSKIE"),
        (0.01, REGULA_PONIZEJ_ZAKRESU, "ZALOZENIE_INZYNIERSKIE"),
        (0.40, REGULA_POWYZEJ_ZAKRESU, "NORMA"),
    ],
)
def test_realny_tor_wklady_i_dowod_sc3f_niosa_podstawe(
    sc3f_test_input: SC3FInput,  # noqa: F811
    t_min_s: float,
    regula: str,
    status_q: str,
) -> None:
    """Realny tor: wkład maszyny synchronicznej i asynchronicznej (Z-bus) → serializacja
    wkładu (API wkładów) → dowód SC3F. Maszyna synchroniczna nie ma śladu q (q = 1)."""
    wynik = _wynik_maszyn(t_min_s)
    synchroniczna, asynchroniczna = wynik.contributions
    assert synchroniczna.slad_q is None and synchroniczna.to_dict()["slad_q"] is None
    for wklad in (synchroniczna, asynchroniczna):
        zapis_mu = wklad.to_dict()["slad_mu"]
        assert zapis_mu["regula"] == regula
        assert zapis_mu["podstawa_reguly"] == STATUS_OCZEKIWANY[("mu", regula)]
        assert zapis_mu["norma"] == NORMA["mu"]
    zapis_q = asynchroniczna.to_dict()["slad_q"]
    assert zapis_q["regula"] == regula and zapis_q["podstawa_reguly"] == status_q
    assert zapis_q["norma"] == NORMA["q"]
    teksty_q = [k["tekst"] for k in asynchroniczna.wywod if k["tekst"].startswith("Współczynnik q")]
    assert teksty_q and all(PUNKT["q"] in t and PUNKT["mu"] not in t for t in teksty_q)
    assert not any(ZEZWOLENIE.search(t) for t in teksty_q)

    dane = replace(sc3f_test_input, fault_node_id="B", machine_result=wynik)
    dowod = ProofGenerator.generate_sc3f_proof(dane)
    (krok_q,) = (k for k in dowod.steps if k.equation.equation_id == "EQ_SC3F_012")
    kroki_mu = [k for k in dowod.steps if k.equation.equation_id == "EQ_SC3F_011"]
    assert len(kroki_mu) == 2
    assert PUNKT["q"] in krok_q.substitution_latex
    assert not ZEZWOLENIE.search(krok_q.substitution_latex)
    assert ("interpretacja inżynierska" in krok_q.substitution_latex) == (
        status_q == "ZALOZENIE_INZYNIERSKIE"
    )
    for krok in kroki_mu:
        assert PUNKT["mu"] in krok.substitution_latex
    # Liczby kroku = liczby śladu (karta nie zmienia żadnej wartości).
    assert krok_q.result.value == asynchroniczna.q == asynchroniczna.slad_q.wynik

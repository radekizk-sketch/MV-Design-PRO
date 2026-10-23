"""Tekst śladu bilansu wkładów źródeł nie niesie szumu maszyny (CI partii zwarć, 2026-10-22).

Defekt: krok ``wklady_zrodel_bilans`` wypisywał w ``substitution`` surowe fazory i resztę —
część urojona sumy wkładów, prąd członów poprzecznych i reszta bilansu wychodziły rzędu
1e-13 A, ze znakiem i cyframi zależnymi od kolejności sumowania BLAS. Fikstura harnessu
zapisana na jednej maszynie różniła się od odpowiedzi runnera CI samym tekstem kroku.

Reguła (jedna, opisana w notatce kroku): część fazora o module poniżej
`PROG_WKLADU_POMIJALNEGO_A` wypisana jako 0 (ten sam predykat co klasyfikacja wkładu,
`jest_wkladem_pominietym`); reszta bilansu domkniętego wypisana względem dopuszczalnej,
reszta ponad dopuszczalną — wartością (uczciwość: niedomknięty bilans jest widoczny liczbą).
Pola liczbowe kroku niosą wartości pełne.

ILOCZYN CECH: prąd I_k''(Th) {duży — tolerancja względna, mały — tolerancja = próg 1e-6 A}
× reszta {dokładnie 0, 1e-13 A, dopuszczalna + 1e-7 A} × szum części fazora {0, +1e-13,
-1e-13} × miejsce szumu {suma wkładów, człony poprzeczne, suma bilansu}; plus bieg solvera na
pełnym iloczynie układów H5 (para predykatów: tekst ↔ pole ``bilans_domkniety`` wyniku).

WSTRZYKNIĘCIA (meldunek): `prad_do_tekstu_sladu` zwracający wartość surową czerwieni
`test_tekst_bilansu_nie_zalezy_od_szumu_ponizej_progu` i `test_prad_do_tekstu_*`; tekst
z ``reszta_a <= tolerancja_a`` liczonym osobno zamiast przekazanego predykatu czerwieni
`test_tekst_bilansu_idzie_za_przekazanym_predykatem`.
"""

from __future__ import annotations

import itertools
import re

import pytest
from network_model.solvers.short_circuit_contributions import (
    NAZWA_WKLADU_POMINIETEGO,
    PROG_WKLADU_POMIJALNEGO_A,
    fazor_do_tekstu_sladu,
    jest_wkladem_pominietym,
    prad_do_tekstu_sladu,
    tolerancja_bilansu_a,
)
from network_model.solvers.short_circuit_iec60909 import ShortCircuitIEC60909Solver

from tests.network_model.solvers.test_wklad_zrodla import (
    SCENARIUSZE,
    UKLADY,
    Z_L,
    Z_Q1,
    _iloczyn,
    _krok,
    _licz,
    _siec_dwuwezlowa,
    _z_q2_dla_wkladu,
)
from tests.utils.siec_h5_wkladow_zrodel import siec_h5

#: Wartości prądu do reguły tekstu — po obu stronach progu i na nim.
PRADY = (
    0.0,
    -0.0,
    1e-13,
    -1e-13,
    PROG_WKLADU_POMIJALNEGO_A * (1.0 - 1e-9),
    -PROG_WKLADU_POMIJALNEGO_A * (1.0 - 1e-9),
    PROG_WKLADU_POMIJALNEGO_A,
    -PROG_WKLADU_POMIJALNEGO_A,
    PROG_WKLADU_POMIJALNEGO_A * (1.0 + 1e-7),
    8953.14,
    -8953.14,
)
#: I_k''(Th): duży (tolerancja względna 1e-9·I) i mały (tolerancja = próg 1e-6 A).
PRADY_THEVENINA = (8953.14, 100.0)
SZUMY = (0.0, 1e-13, -1e-13)
_LICZBA = re.compile(r"[+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?")


@pytest.mark.parametrize("prad", PRADY)
def test_prad_do_tekstu_jeden_predykat_z_klasyfikacja_wkladu(prad: float) -> None:
    """Para predykatów: tekst pokazuje 0 DOKŁADNIE dla wkładów pomijalnych."""
    tekst = prad_do_tekstu_sladu(prad)
    if jest_wkladem_pominietym(prad):
        assert tekst == 0.0 and str(tekst) == "0.0"  # bez „-0.0"
    else:
        assert tekst == prad


@pytest.mark.parametrize(("re_", "im_"), list(itertools.product(PRADY, PRADY)))
def test_fazor_do_tekstu_czesci_niezalezne(re_: float, im_: float) -> None:
    wynik = fazor_do_tekstu_sladu(complex(re_, im_))
    assert wynik.real == prad_do_tekstu_sladu(re_)
    assert wynik.imag == prad_do_tekstu_sladu(im_)


def _tekst(
    ik: float, reszta: float, suma: complex, czlony: complex, razem: complex
) -> tuple[bool, str, str]:
    tolerancja = tolerancja_bilansu_a(ik)
    domkniety = reszta <= tolerancja
    tekst, latex = ShortCircuitIEC60909Solver._tekst_bilansu_wkladow(
        suma_fazorowa=suma,
        prad_czlonow=czlony,
        suma_bilansu=razem,
        ik_thevenin_a=ik,
        reszta_a=reszta,
        tolerancja_a=tolerancja,
        bilans_domkniety=domkniety,
    )
    return domkniety, tekst, latex


def _iloczyn_tekstu() -> list[tuple[float, str, float, float, int]]:
    przypadki = []
    for ik in PRADY_THEVENINA:
        for nazwa in ("zero", "1e-13", "ponad"):
            for re_szum, im_szum in itertools.product(SZUMY, SZUMY):
                for miejsce in range(3):
                    przypadki.append((ik, nazwa, re_szum, im_szum, miejsce))
    return przypadki


@pytest.mark.parametrize(("ik", "reszta_nazwa", "re_szum", "im_szum", "miejsce"), _iloczyn_tekstu())
def test_tekst_bilansu_nie_zalezy_od_szumu_ponizej_progu(
    ik: float, reszta_nazwa: str, re_szum: float, im_szum: float, miejsce: int
) -> None:
    tolerancja = tolerancja_bilansu_a(ik)
    reszta = {"zero": 0.0, "1e-13": 1e-13, "ponad": tolerancja + 1e-7}[reszta_nazwa]
    czyste = [complex(ik, 0.0), 0j, complex(ik, 0.0)]
    zaszumione = list(czyste)
    zaszumione[miejsce] = zaszumione[miejsce] + complex(re_szum, im_szum)

    domkniety, tekst_czysty, latex_czysty = _tekst(ik, reszta, *czyste)
    _, tekst, latex = _tekst(ik, reszta, *zaszumione)

    # Deterministyczny: szum poniżej progu nie zmienia ani jednego znaku tekstu.
    assert (tekst, latex) == (tekst_czysty, latex_czysty)
    # Żadna liczba tekstu nie leży w (0, próg) — szum nie przecieka do podstawienia.
    for liczba in _LICZBA.findall(tekst + " " + latex):
        wartosc = abs(float(liczba))
        assert wartosc == 0.0 or wartosc >= PROG_WKLADU_POMIJALNEGO_A, (liczba, tekst)
    fmt = ShortCircuitIEC60909Solver._format_float
    if domkniety:
        assert f"reszta ≤ dopuszczalnej {fmt(tolerancja)} A." in tekst
        assert f"\\left| \\Delta \\right| \\le {fmt(tolerancja)}" in latex
    else:
        # Uczciwość: reszta ponad dopuszczalną widoczna LICZBĄ w obu postaciach tekstu.
        assert reszta_nazwa == "ponad"
        assert f"reszta {fmt(reszta)} A > dopuszczalna {fmt(tolerancja)} A." in tekst
        assert f"\\left| \\Delta \\right| = {fmt(reszta)}" in latex


@pytest.mark.parametrize("domkniety", [True, False])
def test_tekst_bilansu_idzie_za_przekazanym_predykatem(domkniety: bool) -> None:
    """Tekst NIE liczy własnego warunku: o postaci decyduje predykat przekazany z miejsca,
    które ustawia pole wyniku ``bilans_domkniety`` (jedno źródło prawdy)."""
    tekst, _ = ShortCircuitIEC60909Solver._tekst_bilansu_wkladow(
        suma_fazorowa=complex(100.0, 0.0),
        prad_czlonow=0j,
        suma_bilansu=complex(100.0, 0.0),
        ik_thevenin_a=100.0,
        reszta_a=0.0,
        tolerancja_a=1e-6,
        bilans_domkniety=domkniety,
    )
    assert ("reszta ≤ dopuszczalnej" in tekst) is domkniety
    assert ("> dopuszczalna" in tekst) is not domkniety


@pytest.mark.parametrize(("uklad", "rodzaj", "scenariusz", "punkt"), list(_iloczyn()))
def test_bieg_solvera_tekst_zgodny_z_polem_wyniku(
    uklad: str, rodzaj: str, scenariusz: str, punkt: str
) -> None:
    skala, c = SCENARIUSZE[scenariusz]
    wynik = _licz(siec_h5(skala_zq=skala, **UKLADY[uklad]), rodzaj, punkt, c)
    krok = _krok(wynik, "wklady_zrodel_bilans")
    pole = krok["result"]
    assert pole["bilans_domkniety"] is (pole["reszta_a"] <= pole["tolerancja_a"])
    assert ("reszta ≤ dopuszczalnej" in krok["substitution"]) is pole["bilans_domkniety"]
    # Pola liczbowe pełne: reszta w wyniku jest surowa (nie zaokrąglona do tekstu).
    assert isinstance(pole["reszta_a"], float)
    for liczba in _LICZBA.findall(krok["substitution"]):
        wartosc = abs(float(liczba))
        assert wartosc == 0.0 or wartosc >= PROG_WKLADU_POMIJALNEGO_A, krok["substitution"]


@pytest.mark.parametrize("cel_a", [2.0e-6, 1.2e-6, 5.0e-7, 1.0e-8])
def test_tekst_wkladu_zrodla_ta_sama_regula_progu(cel_a: float) -> None:
    """Krok wkładu źródła: wynik w tekście = 0 A DOKŁADNIE dla wkładu pomijalnego (notatka
    kroku nazywa przyczynę), wartość — dla wkładu ponad progiem; pole ``i_a`` pełne."""
    wynik = _licz(_siec_dwuwezlowa(Z_Q1, _z_q2_dla_wkladu(cel_a), Z_L), "3F", "A", 1.1)
    krok = _krok(wynik, "wklad_zrodla_Q2")
    surowy = krok["result"]["i_a"]
    fmt = ShortCircuitIEC60909Solver._format_float
    oczekiwany = "0" if jest_wkladem_pominietym(surowy) else fmt(surowy)
    assert krok["substitution"].endswith(f"= {oczekiwany} A")
    assert krok["substitution_latex"].endswith(f"= {oczekiwany}\\,\\mathrm{{A}}")
    assert surowy > 0.0
    if jest_wkladem_pominietym(surowy):
        assert krok["notes"] == NAZWA_WKLADU_POMINIETEGO

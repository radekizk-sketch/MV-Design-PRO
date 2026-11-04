"""I_th przy czasie wyłączenia POLA (``solvers.wytrzymalosc_cieplna_pola``).

Kryterium cieplne aparatury pola porównywało I_th policzony dla T_k biegu (1 s, m ≈ 0,017 przy
κ = 1,557) z limitem przeliczonym na T_k pola (np. 0,36 s) — werdykt optymistyczny. I_th pola =
I″k·√(m(T_k,pola) + n), m i n z funkcji rdzenia ``_thermal_mn_factors``.

Prąd cieplny BIEGU pochodzi z PRAWDZIWEJ funkcji rdzenia (``compute_post_fault_quantities``,
impedancja dobrana tak, by κ rdzenia ≈ wartość iloczynu) i z tego samego przeliczenia A → kA co
wiersz wyniku biegu — wyrocznia nie powtarza formuły rdzenia.

Iloczyn: T_k pola {0,1; 0,36; 1,0; nieustalony} × κ {1,2; 1,557; 1,8}.
"""

from __future__ import annotations

import math

import pytest
from network_model.pochodne.jednostki import a_na_ka
from network_model.solvers.short_circuit_core import compute_post_fault_quantities
from network_model.solvers.wytrzymalosc_cieplna_pola import prad_cieplny_pola

TK_BIEGU_S = 1.0
IKSS_A = 9090.0


def _wiersz_biegu(kappa_cel: float) -> dict[str, float]:
    """Wiersz biegu jak w wyniku: rdzeń liczy κ, I_th z R/X pętli i T_k biegu."""
    rx = -math.log((kappa_cel - 1.02) / 0.98) / 3.0
    post = compute_post_fault_quantities(
        ikss=IKSS_A, un_v=15000.0, z_equiv=complex(rx, 1.0), tk_s=TK_BIEGU_S
    )
    return {
        "ikss_ka": a_na_ka(IKSS_A),
        "ith_ka": a_na_ka(post.ith_a),
        "kappa": float(post.kappa),
        "tk_s": TK_BIEGU_S,
        "m_biegu": post.m_factor,
    }


@pytest.mark.parametrize("kappa", [1.2, 1.557, 1.8])
@pytest.mark.parametrize("tk_pola", [0.1, 0.36, 1.0, None])
def test_ith_pola_iloczyn_czasu_pola_i_kappa(kappa: float, tk_pola: float | None) -> None:
    w = _wiersz_biegu(kappa)
    wynik = prad_cieplny_pola(
        ikss_ka=w["ikss_ka"],
        kappa=w["kappa"],
        ith_biegu_ka=w["ith_ka"],
        tk_biegu_s=w["tk_s"],
        tk_pola_s=tk_pola,
        powod_braku_czasu_pl="Pole nie ma czynnego sterownika zabezpieczeń.",
    )
    slad = wynik.to_dict()
    if tk_pola is None:
        # Czas nieustalony: „—" z powodem, nigdy I_th biegu w zastępstwie.
        assert wynik.ith_ka is None
        assert wynik.powod_pl == "Pole nie ma czynnego sterownika zabezpieczeń."
        assert slad["ith_ka"] is None and "podstawienie_latex" not in slad
        return
    assert wynik.ith_ka is not None and wynik.m is not None and wynik.n == 1.0
    # Wzór normy: I_th = I″k·√(m(T_k pola) + n) (zapis ilorazowy tożsamy do zaokrąglenia).
    assert wynik.ith_ka == pytest.approx(w["ikss_ka"] * math.sqrt(wynik.m + wynik.n), rel=1e-12)
    assert wynik.m_biegu == w["m_biegu"]
    if tk_pola == TK_BIEGU_S:
        # Determinizm / wyniki złote: T_k pola = T_k biegu → BIT W BIT I_th biegu.
        assert wynik.ith_ka == w["ith_ka"]
    else:
        # Krótszy czas → większa składowa nieokresowa m → I_th pola > I_th biegu.
        assert wynik.ith_ka > w["ith_ka"]
        assert wynik.m > w["m_biegu"]
    # Ślad WHITE BOX: κ, T_k pola, m, n, I_th z jednostkami i zapisem LaTeX.
    assert slad["kappa"] == w["kappa"] and slad["tk_pola_s"] == tk_pola
    assert slad["jednostki"]["ith_ka"] == "kA" and slad["jednostki"]["tk_pola_s"] == "s"
    assert slad["wzor_latex"] == r"I_{th} = I''_{k}\sqrt{m + n}"
    assert r"\sqrt{" in slad["podstawienie_latex"]


def test_sonda_pola_036_s_kappa_1557() -> None:
    """Sonda przed/po z decyzji architekta: Ik″ ≈ 9,09 kA, κ = 1,557, T_k pola = 0,36 s —
    przed: I_th biegu 9,17 kA (T_k = 1 s), po: ≈ 9,30 kA."""
    w = _wiersz_biegu(1.557)
    assert w["ith_ka"] == pytest.approx(9.167, abs=0.001)
    wynik = prad_cieplny_pola(
        ikss_ka=w["ikss_ka"],
        kappa=w["kappa"],
        ith_biegu_ka=w["ith_ka"],
        tk_biegu_s=TK_BIEGU_S,
        tk_pola_s=0.36,
    )
    assert wynik.m == pytest.approx(0.04747, abs=1e-4)
    assert wynik.ith_ka == pytest.approx(9.303, abs=0.001)


@pytest.mark.parametrize(
    ("brak", "fragment"),
    [
        ({"kappa": None}, "współczynnika κ"),
        ({"tk_biegu_s": None}, "czasu cieplnego biegu"),
        ({"ith_biegu_ka": None}, "prądu zwarciowego"),
        ({"ikss_ka": None}, "prądu zwarciowego"),
    ],
)
def test_brak_danej_wiersza_biegu_daje_brak_z_powodem(brak: dict[str, None], fragment: str) -> None:
    w = _wiersz_biegu(1.557)
    dane = {
        "ikss_ka": w["ikss_ka"],
        "kappa": w["kappa"],
        "ith_biegu_ka": w["ith_ka"],
        "tk_biegu_s": TK_BIEGU_S,
        "tk_pola_s": 0.36,
    }
    wynik = prad_cieplny_pola(**{**dane, **brak})
    assert wynik.ith_ka is None
    assert fragment in (wynik.powod_pl or "")

"""Karta MU-INTERPOLACJA — współczynniki μ i q dla t_min pomiędzy węzłami krzywych normy.

PO CO. t_b punktu zwarcia przychodzi z pól lokalnych (zwłoka zabezpieczenia + czas własny
wyłącznika), więc w praktyce leży między węzłami krzywych μ (IEC 60909-0:2016 pkt 9.1.1)
i q (pkt 9.1.2) (t_min = 0,02 / 0,05 / 0,10 / ≥ 0,25 s). Dawny wybór węzła najbliższego (progi
0,035 / 0,075 / 0,175 s) dawał dla t_b ∈ (0,175; 0,25) krzywą 0,25 s — μ i I_b mniejsze niż
z interpolacji (dla μ dopuszczonej przez pkt 9.1.1; dla q — interpretacja inżynierska, karta
PODSTAWA-Q, `test_krzywe_zaniku_podstawa.py`), czyli wynik niezachowawczy dla doboru aparatury.

ILOCZYN CECH: {μ, q} × {t_min w węźle, między węzłami, poniżej 0,02 s, powyżej 0,25 s} ×
{maszyna synchroniczna, asynchroniczna} — przez realny tor `compute_machine_contributions`
(prądy częściowe z macierzy impedancji węzłowych, krotność na zaciskach). Wyrocznia: krzywe
przepisane z normy w tym pliku, niezależnie od tablicy solvera. Do tego monotoniczność μ(t_min)
i q(t_min), ciągłość w węzłach (dawna reguła miała skoki w połowie przedziałów), sonda ręczna
t = 0,2 s przy I″k/I_r = 7,25, dowód SC3F czytający ślad (bez drugiej implementacji) i korpus
golden: w węzłach i poza zakresem wynik bit w bit jak wartość krzywej węzła.
"""

from __future__ import annotations

import math

import pytest
from network_model.solvers.machine_sc_iec60909 import (
    REGULA_BEZ_ZANIKU,
    REGULA_INTERPOLACJA,
    REGULA_PONIZEJ_ZAKRESU,
    REGULA_POWYZEJ_ZAKRESU,
    REGULA_WEZEL,
    compute_machine_contributions,
    kroki_krzywej_zaniku,
    mu_factor,
    q_factor,
    slad_mu,
    slad_q,
)

from tests.network_model.solvers.test_machine_sc_iec60909 import (
    _async,
    _slack_line_bus,
    _sync,
)

#: Krzywe normy (IEC 60909-0:2016 wzór (67) i (69)) — wyrocznia przepisana z normy, nie z solvera.
MU_NORMY: dict[float, tuple[float, float, float]] = {
    0.02: (0.84, 0.26, 0.26),
    0.05: (0.71, 0.51, 0.30),
    0.10: (0.62, 0.72, 0.32),
    0.25: (0.56, 0.94, 0.38),
}
Q_NORMY: dict[float, tuple[float, float]] = {
    0.02: (1.03, 0.12),
    0.05: (0.79, 0.12),
    0.10: (0.57, 0.12),
    0.25: (0.26, 0.10),
}
WEZLY = (0.02, 0.05, 0.10, 0.25)


def mu_wezla(t_wezla: float, krotnosc: float) -> float:
    a, b, c = MU_NORMY[t_wezla]
    return min(1.0, max(0.0, a + b * math.exp(-c * krotnosc)))


def q_wezla(t_wezla: float, m_mw: float) -> float:
    a, b = Q_NORMY[t_wezla]
    return min(1.0, max(0.0, a + b * math.log(m_mw)))


def oczekiwane(funkcja_wezla, t_min_s: float, argument: float) -> tuple[str, float, float, float]:
    """(reguła, t₁, t₂, wartość) — reguła normy zapisana w teście niezależnie od solvera."""
    if t_min_s < WEZLY[0]:
        return REGULA_PONIZEJ_ZAKRESU, WEZLY[0], WEZLY[0], funkcja_wezla(WEZLY[0], argument)
    if t_min_s > WEZLY[-1]:
        return REGULA_POWYZEJ_ZAKRESU, WEZLY[-1], WEZLY[-1], funkcja_wezla(WEZLY[-1], argument)
    if t_min_s in WEZLY:
        return REGULA_WEZEL, t_min_s, t_min_s, funkcja_wezla(t_min_s, argument)
    t_1 = max(t for t in WEZLY if t < t_min_s)
    t_2 = min(t for t in WEZLY if t > t_min_s)
    x_1, x_2 = funkcja_wezla(t_1, argument), funkcja_wezla(t_2, argument)
    return REGULA_INTERPOLACJA, t_1, t_2, x_1 + (t_min_s - t_1) / (t_2 - t_1) * (x_2 - x_1)


#: t_min iloczynu: węzły, między węzłami (w tym okolice dawnych progów połówkowych),
#: poniżej 0,02 s, powyżej 0,25 s.
T_MIN_ILOCZYNU = (
    0.02,
    0.05,
    0.10,
    0.25,
    0.03,
    0.035,
    0.07,
    0.12,
    0.175,
    0.2,
    0.24,
    0.005,
    0.015,
    0.3,
    1.0,
)


def _wklad(maszyna: str, t_min_s: float):
    g = _slack_line_bus()
    if maszyna == "synchroniczna":
        g.add_synchronous_machine_source(_sync())
    else:
        g.add_asynchronous_machine_source(_async())
    (wklad,) = compute_machine_contributions(g, "B", c_factor=1.1, t_min_s=t_min_s).contributions
    return wklad


@pytest.mark.parametrize("t_min_s", T_MIN_ILOCZYNU)
@pytest.mark.parametrize("maszyna", ["synchroniczna", "asynchroniczna"])
def test_mu_iloczyn_t_min_i_rodzaju_maszyny(maszyna: str, t_min_s: float) -> None:
    wklad = _wklad(maszyna, t_min_s)
    krotnosc = wklad.ratio_ik_ir
    assert krotnosc > 2.3  # krzywe μ aktywne (poza strefą przecięć krzywych normy przy 2)
    regula, t_1, t_2, mu = oczekiwane(mu_wezla, t_min_s, krotnosc)
    slad = wklad.slad_mu
    assert slad.wielkosc == "mu" and slad.regula == regula
    assert slad.wezel_dolny is not None and slad.wezel_gorny is not None
    assert (slad.wezel_dolny.t_min_s, slad.wezel_gorny.t_min_s) == (t_1, t_2)
    assert slad.wezel_dolny.wartosc == mu_wezla(t_1, krotnosc)
    assert slad.wezel_gorny.wartosc == mu_wezla(t_2, krotnosc)
    if regula == REGULA_INTERPOLACJA:
        assert slad.waga == pytest.approx((t_min_s - t_1) / (t_2 - t_1), rel=1e-12)
        assert 0.0 < slad.waga < 1.0
        assert wklad.mu == pytest.approx(mu, rel=1e-12)
    else:
        # Węzeł i zakres: wartość krzywej węzła BIT W BIT (żadnej arytmetyki interpolacji).
        assert slad.waga == 0.0
        assert wklad.mu == mu
    assert wklad.mu == slad.wynik
    assert wklad.ib_a == wklad.mu * wklad.q * wklad.ikss_partial_a


@pytest.mark.parametrize("t_min_s", T_MIN_ILOCZYNU)
@pytest.mark.parametrize("maszyna", ["synchroniczna", "asynchroniczna"])
def test_q_iloczyn_t_min_i_rodzaju_maszyny(maszyna: str, t_min_s: float) -> None:
    wklad = _wklad(maszyna, t_min_s)
    if maszyna == "synchroniczna":
        # Maszyna synchroniczna nie ma krzywej q: q = 1 przy każdym t_min, ślad q pusty.
        assert wklad.q == 1.0 and wklad.slad_q is None
        return
    m_mw = wklad.p_per_pole_mw
    assert m_mw == 1.0  # 2 MW, 2 pary biegunów — ln m = 0, q węzła = a (z przycięciem)
    regula, t_1, t_2, q = oczekiwane(q_wezla, t_min_s, m_mw)
    slad = wklad.slad_q
    assert slad is not None and slad.wielkosc == "q" and slad.regula == regula
    assert slad.wezel_dolny is not None and slad.wezel_gorny is not None
    assert (slad.wezel_dolny.t_min_s, slad.wezel_gorny.t_min_s) == (t_1, t_2)
    if regula == REGULA_INTERPOLACJA:
        assert slad.waga == pytest.approx((t_min_s - t_1) / (t_2 - t_1), rel=1e-12)
        assert wklad.q == pytest.approx(q, rel=1e-12)
    else:
        assert slad.waga == 0.0 and wklad.q == q
    assert wklad.q == slad.wynik


def test_q_przyciecie_wezla_przed_interpolacja() -> None:
    """Interpoluje się wartości krzywych PRZYCIĘTE do [0; 1] (krzywe rysunku normy): węzeł
    0,02 s daje q = 1,03 + 0,12·ln 1 = 1,03 → 1; przy t = 0,03 s q = 1 + ⅓·(0,79 − 1)."""
    slad = slad_q(1.0, 0.03)
    assert slad.wezel_dolny is not None and slad.wezel_dolny.wartosc_surowa == pytest.approx(1.03)
    assert slad.wezel_dolny.wartosc == 1.0
    assert slad.wynik == pytest.approx(1.0 + (1.0 / 3.0) * (0.79 - 1.0), rel=1e-12)


@pytest.mark.parametrize("t_min_s", T_MIN_ILOCZYNU)
def test_bez_zaniku_przy_kazdym_t_min(t_min_s: float) -> None:
    """Krotność ≤ 2 → μ = 1 przy każdym t_min (zwarcie odległe od generatora); m ≤ 0 → q = 1."""
    for slad in (slad_mu(2.0, t_min_s), slad_mu(0.5, t_min_s), slad_q(0.0, t_min_s)):
        assert slad.regula == REGULA_BEZ_ZANIKU
        assert slad.wynik == 1.0 and slad.wezel_dolny is None and slad.wezel_gorny is None


#: Siatka t_min do monotoniczności i ciągłości (0,005 … 0,5 s co 0,001 s).
SIATKA_T = tuple(round(0.005 + 0.001 * i, 3) for i in range(496))


@pytest.mark.parametrize("krotnosc", [2.3, 3.0, 5.0, 7.25, 10.0, 20.0, 50.0])
def test_mu_nierosnace_w_t_min_przy_stalej_krotnosci(krotnosc: float) -> None:
    wartosci = [mu_factor(krotnosc, t) for t in SIATKA_T]
    assert all(b <= a for a, b in zip(wartosci, wartosci[1:], strict=False))


@pytest.mark.parametrize("krotnosc", [2.05, 2.1, 2.2])
def test_mu_w_strefie_przeciecia_krzywych_normy_lezy_miedzy_wezlami(krotnosc: float) -> None:
    """Dla krotności tuż powyżej 2 krzywe normy się przecinają (μ₀,₁₀ > μ₀,₀₅ po przycięciu),
    więc μ(t_min) nie jest tam monotoniczne — fakt normy, nie interpolacji. Interpolacja
    trzyma się wtedy przedziału między wartościami sąsiednich węzłów."""
    assert mu_wezla(0.10, krotnosc) > mu_wezla(0.05, krotnosc)
    for t in SIATKA_T:
        slad = slad_mu(krotnosc, t)
        assert slad.wezel_dolny is not None and slad.wezel_gorny is not None
        lo = min(slad.wezel_dolny.wartosc, slad.wezel_gorny.wartosc)
        hi = max(slad.wezel_dolny.wartosc, slad.wezel_gorny.wartosc)
        assert lo - 1e-15 <= slad.wynik <= hi + 1e-15


@pytest.mark.parametrize("m_mw", [0.05, 0.5, 1.0, 5.0])
def test_q_nierosnace_w_t_min_przy_stalej_mocy_na_pare_biegunow(m_mw: float) -> None:
    wartosci = [q_factor(m_mw, t) for t in SIATKA_T]
    assert all(b <= a for a, b in zip(wartosci, wartosci[1:], strict=False))


@pytest.mark.parametrize("t_wezla", WEZLY)
def test_ciaglosc_w_wezlach(t_wezla: float) -> None:
    """Brak skoku przy węźle (dawna reguła skakała w połowie przedziałów 0,035/0,075/0,175 s)."""
    for krotnosc in (3.0, 7.25):
        w_wezle = mu_factor(krotnosc, t_wezla)
        for t in (t_wezla - 1e-9, t_wezla + 1e-9):
            assert abs(mu_factor(krotnosc, t) - w_wezle) < 1e-6
    for t_progu in (0.035, 0.075, 0.175):
        assert abs(mu_factor(7.25, t_progu + 1e-9) - mu_factor(7.25, t_progu - 1e-9)) < 1e-6


def test_sonda_reczna_t_0_2_s_krotnosc_7_25() -> None:
    """Sonda ręczna: μ₀,₁₀ = 0,62 + 0,72·e^(−0,32·7,25) = 0,690757; μ₀,₂₅ = 0,56 + 0,94·e^(−0,38·7,25)
    = 0,619792; waga = (0,2 − 0,1)/(0,25 − 0,1) = 2/3; μ = 0,690757 + ⅔·(0,619792 − 0,690757)
    = 0,643447 — o 3,8 % więcej niż dawna krzywa 0,25 s (0,619792)."""
    mu_10 = 0.62 + 0.72 * math.exp(-0.32 * 7.25)
    mu_25 = 0.56 + 0.94 * math.exp(-0.38 * 7.25)
    slad = slad_mu(7.25, 0.2)
    assert slad.regula == REGULA_INTERPOLACJA
    assert slad.waga == pytest.approx(2.0 / 3.0, rel=1e-12)
    assert slad.wynik == pytest.approx(mu_10 + (2.0 / 3.0) * (mu_25 - mu_10), rel=1e-12)
    assert slad.wynik == pytest.approx(0.643447, abs=5e-7)
    assert mu_10 == pytest.approx(0.690757, abs=5e-7) and mu_25 == pytest.approx(0.619792, abs=5e-7)
    assert slad.wynik > mu_factor(7.25, 0.25)


def test_wagi_interpolacji_nie_sa_zamienione() -> None:
    """Iniekcja „zamień wagi" (t₂ − t)/(t₂ − t₁) daje przy t = 0,07 s wartość bliżej węzła
    0,10 s; poprawna waga 0,4 trzyma wynik bliżej węzła 0,05 s."""
    slad = slad_mu(7.25, 0.07)
    assert slad.waga == pytest.approx(0.4, rel=1e-12)
    blizej_dolnego = abs(slad.wynik - mu_wezla(0.05, 7.25)) < abs(slad.wynik - mu_wezla(0.10, 7.25))
    assert blizej_dolnego


@pytest.mark.parametrize("zly", [0.0, -0.1, float("nan"), float("inf")], ids=repr)
def test_t_min_niefizyczny_to_odmowa_nie_krzywa(zly: float) -> None:
    """Dawne `_krzywa` dawało dla NaN cicho krzywą 0,25 s; teraz niefizyczne t_min = błąd."""
    with pytest.raises(ValueError, match="Minimalny czas zwłoki t_min"):
        slad_mu(7.25, zly)
    with pytest.raises(ValueError, match="Minimalny czas zwłoki t_min"):
        slad_q(1.0, zly)


def test_deterministyczny_slad_i_serializacja() -> None:
    a, b = _wklad("asynchroniczna", 0.2), _wklad("asynchroniczna", 0.2)
    assert a.to_dict() == b.to_dict()
    slad = a.to_dict()["slad_mu"]
    assert slad["regula"] == REGULA_INTERPOLACJA
    assert slad["norma"] == "IEC 60909-0:2016 pkt 9.1.1, wzór (67), rys. 13"
    assert a.to_dict()["slad_q"]["norma"] == "IEC 60909-0:2016 pkt 9.1.2, wzór (69), rys. 14"
    assert slad["wezel_dolny"]["t_min_s"] == 0.10 and slad["wezel_gorny"]["t_min_s"] == 0.25
    assert slad["wynik"] == a.mu
    assert a.to_dict()["slad_q"]["wynik"] == a.q
    assert _wklad("synchroniczna", 0.2).to_dict()["slad_q"] is None


def test_wywod_interpolacji_niesie_oba_wezly_wage_i_wynik() -> None:
    """Ślad White Box kroku μ i q: oba węzły, obie wartości węzłowe, waga i wynik."""
    wklad = _wklad("asynchroniczna", 0.2)
    latexy = " ".join(k["latex"] for k in wklad.wywod if k["latex"])
    teksty = " ".join(k["tekst"] for k in wklad.wywod)
    assert wklad.slad_mu.wezel_dolny is not None and wklad.slad_mu.wezel_gorny is not None
    assert r"\mu_{0.10} = 0.62 + 0.72\,e^{-0.32\,I''_k/I_r}" in latexy
    assert r"\mu_{0.25} = 0.56 + 0.94\,e^{-0.38\,I''_k/I_r}" in latexy
    assert rf"{wklad.slad_mu.waga:.4f}" in latexy
    assert rf"= {wklad.mu:.3f}" in latexy
    assert r"q_{0.10} = 0.57 + 0.12\,\ln m" in latexy
    assert r"q_{0.25} = 0.26 + 0.10\,\ln m" in latexy
    assert "interpolacja liniowa między krzywymi μ dopuszczona jawnie" in teksty
    assert "pkt 9.1.2 nie przewiduje interpolacji między krzywymi q" in teksty
    assert "IEC 60909-0:2016 pkt 9.1.1, wzór (67), rys. 13" in teksty


def test_wywod_poza_zakresem_nazywa_krzywa_brzegowa() -> None:
    ponizej = kroki_krzywej_zaniku(slad_mu(7.25, 0.01))
    powyzej = kroki_krzywej_zaniku(slad_mu(7.25, 0.4))
    assert len(ponizej) == len(powyzej) == 1
    assert "poniżej najkrótszej krzywej normy — krzywa t_min = 0,02 s" in ponizej[0]["tekst"]
    assert "krzywa normy dla t_min ≥ 0,25 s" in powyzej[0]["tekst"]


# ── Korpus golden: w węzłach i poza zakresem bit w bit, pomiędzy węzłami interpolacja ────
#: Wpisy rejestru wzorcowego z maszynami wirującymi — pomiar karty (2026-10-21) na WSZYSTKICH
#: wpisach `REJESTR`: maszyny mają wyłącznie G04, G05, G07, G13, G16 i B-BENCH (11 sieci, same
#: maszyny synchroniczne; asynchroniczne pokrywa iloczyn wyżej). Lista jawna, bo budowa całego
#: rejestru kosztuje ~24 s, z czego 21,7 s to G00 bez maszyn.
WPISY_KORPUSU = ("G04", "G05", "G07", "G13", "G16", "B-BENCH")
#: Bieg realnym torem przy t_b pomiędzy węzłami (0,2 s) i w węźle (0,25 s); pozostałe t_b
#: korpusu sprawdzane na krotnościach z tego biegu tą samą funkcją `slad_mu`, której woła tor.
T_BIEGU = (0.2, 0.25)
T_KORPUSU = (0.005, 0.01, 0.02, 0.03, 0.035, 0.05, 0.07, 0.10, 0.12, 0.175, 0.24, 0.25, 0.36, 1.0)


def _korpus():
    from enm.mapping import map_enm_to_network_graph
    from enm.models import EnergyNetworkModel

    from tests.golden.registry import zbuduj_wszystkie

    for wpis in WPISY_KORPUSU:
        for indeks, siec in enumerate(zbuduj_wszystkie(wpis)):
            enm = (
                siec
                if isinstance(siec, EnergyNetworkModel)
                else EnergyNetworkModel.model_validate(siec)
            )
            graf = map_enm_to_network_graph(enm)
            if graf.get_synchronous_machine_sources() or graf.get_asynchronous_machine_sources():
                yield f"{wpis}#{indeks}", graf


def test_korpus_golden_wezly_bit_w_bit_a_pomiedzy_interpolacja() -> None:
    """Na każdej sieci korpusu golden z maszynami, w każdym węźle zwarcia: t_b w węźle normy
    albo poza zakresem → μ, q = wartość krzywej węzła bit w bit (dawny wybór krzywej dawał to
    samo); t_b pomiędzy węzłami → interpolacja liniowa wartości krzywych sąsiednich węzłów.
    Pomiar różnic I_b i μ względem dawnej reguły węzła najbliższego — meldunek karty."""
    sieci = 0
    wiersze_wezlowe = 0
    wiersze_interpolowane = 0
    for _nazwa, graf in _korpus():
        sieci += 1
        for wezel in sorted(graf.nodes):
            krotnosci: set[float] = set()
            for t_biegu in T_BIEGU:
                wynik = compute_machine_contributions(graf, wezel, c_factor=1.1, t_min_s=t_biegu)
                for wklad in wynik.contributions:
                    krotnosci.add(wklad.ratio_ik_ir)
                    regula, _t_1, _t_2, mu = oczekiwane(mu_wezla, t_biegu, wklad.ratio_ik_ir)
                    if wklad.ratio_ik_ir <= 2.0:
                        assert wklad.mu == 1.0
                    elif regula == REGULA_INTERPOLACJA:
                        assert wklad.mu == pytest.approx(mu, rel=1e-12)
                    else:
                        assert wklad.mu == mu
                        assert wklad.ib_a == mu * wklad.q * wklad.ikss_partial_a
            for krotnosc in sorted(krotnosci):
                for t_min_s in T_KORPUSU:
                    wartosc = mu_factor(krotnosc, t_min_s)
                    if krotnosc <= 2.0:
                        assert wartosc == 1.0
                        continue
                    regula, _t_1, _t_2, mu = oczekiwane(mu_wezla, t_min_s, krotnosc)
                    if regula == REGULA_INTERPOLACJA:
                        wiersze_interpolowane += 1
                        assert wartosc == pytest.approx(mu, rel=1e-12)
                    else:
                        wiersze_wezlowe += 1
                        assert wartosc == mu
    assert sieci == 11
    assert wiersze_wezlowe > 0 and wiersze_interpolowane > 0

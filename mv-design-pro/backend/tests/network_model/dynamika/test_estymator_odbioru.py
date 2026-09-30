"""Odbiór czuły częstotliwościowo w biegu rdzenia: estymator kątowy, tożsamości, odmowy.

ILOCZYN CECH (CLAUDE.md, KLASA NIE INSTANCJA pkt 2), karta modeli odbiorów P3:

    układ {SMIB, wyspa, obszar beznapięciowy z ponownym zasileniem, odłączenie odbioru}
  x czułość {k_pf, k_qf, obie}
  x zdarzenie {skok obciążenia, zwarcie z przejściem przez U_min}
  x integrator {trapez, RK4} x krok {stały, adaptacyjny}.

W KAŻDEJ próbce każdego biegu sprawdzane są TOŻSAMOŚCI z kanałów wyniku (wyrocznia bez
importu funkcji rdzenia — wzory zapisane od nowa):

* estymator: `f_odb = f_n (1 + wrap(theta - x) / (w_n T_f))`, `theta` z `kat_deg@` szyny,
  `x` z `kat_pomiaru_rad@` odbioru; `V = 0` — `f_odb = f_n`;
* moc: `P = P0' F_P(f_odb) w(|V|)`, `Q = Q0' F_Q(f_odb) w(|V|)`, `w = 1` nad `U_min`,
  `(|V|/U_min)^2` pod (odbiór stałej mocy), `F = 1 + k (f - f0)/f0` w OBU gałęziach;
* tryb: 0 nad `U_min`, 1 pod, 2 odłączony (bez częstotliwości i poboru), 3 odcięty;
* ponowne zasilenie szyny odbioru: w próbce `P` chwili zasilenia `f_odb = f_n` DOKŁADNIE i
  stan estymatora = faza napięcia po zasileniu (przypisanie w zdarzeniu wykonanym).
"""

from __future__ import annotations

import cmath
import dataclasses
import itertools
import math
from typing import Any

import numpy as np
import pytest
from network_model.solvers.dynamika import (
    GalazDynamiki,
    HarmonogramDynamiki,
    OdbiorDynamiki,
    OdmowaDynamiki,
    PunktPracy,
    SilnikDynamiki,
    SkokObciazenia,
    WejscieDynamiki,
    WezelDynamiki,
    ZmianaGalezi,
    ZmianaOdbioru,
    ZwarcieWezla,
)
from network_model.solvers.dynamika.kontrakty import (
    KOD_ZAKRES_WAZNOSCI_PRZEKROCZONY,
    CharakterystykaOdbioru,
)
from network_model.solvers.dynamika.odbiory import model_odbioru
from network_model.solvers.dynamika.urzadzenia import zbuduj_maszyne_klasyczna

from tests.network_model.dynamika import uklady
from tests.network_model.dynamika.test_obszary_beznapieciowe import _uklad

F_N = uklady.F_BAZOWA_HZ
W_N = 2.0 * math.pi * F_N
U_MIN = 0.7
T_F = 0.05

#: Czułości — (k_pf, k_qf).
CZULOSCI: dict[str, tuple[float, float]] = {
    "k_pf": (2.0, 0.0),
    "k_qf": (0.0, 1.5),
    "obie": (2.0, 1.5),
}


def _charakterystyka(k_pf: float, k_qf: float, *, t_f: float = T_F) -> CharakterystykaOdbioru:
    return CharakterystykaOdbioru(
        a_p=0.0,
        b_p=0.0,
        c_p=1.0,
        a_q=0.0,
        b_q=0.0,
        c_q=1.0,
        v0_pu=None,
        k_pf=k_pf,
        k_qf=k_qf,
        f0_hz=F_N,
        u_min_pu=U_MIN,
        t_pomiaru_czestotliwosci_s=t_f,
    )


# ---------------------------------------------------------------------------
# Układy
# ---------------------------------------------------------------------------

#: Wyspa samoregulacji (układ S4 karty): maszyna klasyczna — linia — odbiór stałej mocy.
_H, _XD, _XL, _E, _P0 = 3.5, 0.3, 0.3, 1.05, 0.5


def _wyspa(charakterystyka: CharakterystykaOdbioru) -> dict[str, Any]:
    x = _XD + _XL
    psi = 0.5 * math.asin(2.0 * x * _P0 / _E**2)
    v_b = complex(_E * math.cos(psi), 0.0)
    prad = complex(_P0, 0.0).conjugate() / v_b.conjugate()
    v_g = v_b + 1j * _XL * prad
    maszyna = zbuduj_maszyne_klasyczna(
        ident="G",
        wezel="GEN",
        s_n_mva=uklady.S_BAZOWA_MVA,
        h_s=_H,
        d_pu=0.0,
        x_prim_pu=_XD,
        ra_pu=0.0,
        s_bazowa_mva=uklady.S_BAZOWA_MVA,
        f_bazowa_hz=F_N,
    )
    return {
        "wezly": (WezelDynamiki("GEN", uklady.U_N_KV), WezelDynamiki("B", uklady.U_N_KV)),
        "galezie": (
            GalazDynamiki("LB", "GEN", "B", 1 / complex(0, _XL), 0.0, 1 + 0j, True, "linia"),
        ),
        "odsprzegi": (),
        "odbiory": (OdbiorDynamiki("ODB_B", "B", _P0, 0.0, charakterystyka),),
        "urzadzenia": (maszyna,),
        "punkt": PunktPracy({"GEN": v_g, "B": v_b}, {"G": v_g * prad.conjugate()}),
    }


def _smib_z_szyna_odbioru(charakterystyka: CharakterystykaOdbioru) -> dict[str, Any]:
    """SMIB z węzłem B odbioru za linią (fikstura obszarów beznapięciowych) — odbiór czuły.

    Punkt pracy zostaje ważny: odbiór stałej mocy przy f = f_n ma F = 1 (moc bazowa)."""
    uklad = _uklad(odbior=True, urzadzenie=False, odsprzeg=False, b_linii=0.0)
    (odbior,) = uklad["odbiory"]
    return {**uklad, "odbiory": (dataclasses.replace(odbior, charakterystyka=charakterystyka),)}


T_ZDARZENIA = 0.05
T_ZASILENIA = 0.12
T_DRUGIEGO = 0.15
T_USUNIECIA = 0.2
HORYZONT = 0.26


def _zdarzenie_zaklocenia(rodzaj: str, t_s: float, *, wyspa: bool) -> tuple[Any, ...]:
    """Skok obciążenia (+10 % mocy) albo zwarcie z przejściem przez U_min, usunięte samoczynnie."""
    if rodzaj == "skok":
        return (SkokObciazenia(t_s, "ODB_B", 0.1 * (_P0 if wyspa else 0.1), 0.0),)
    x_f = 0.15 if wyspa else 0.02  # głębokość dobrana tak, by |V_B| < U_min (sprawdzane niżej)
    return (
        ZwarcieWezla(
            t_s=t_s,
            wezel="B",
            typ="3F",
            r_f_ohm=0.0,
            x_f_ohm=x_f * uklady.U_N_KV**2 / uklady.S_BAZOWA_MVA,
            t_usuniecia_s=t_s + 0.03,
            sposob_usuniecia="samoczynne",
        ),
    )


def _scenariusz(uklad_rodzaj: str, zaklocenie: str) -> tuple[Any, ...]:
    wyspa = uklad_rodzaj == "wyspa"
    if uklad_rodzaj in ("smib", "wyspa"):
        return _zdarzenie_zaklocenia(zaklocenie, T_ZDARZENIA, wyspa=wyspa)
    if uklad_rodzaj == "obszar":
        return (
            ZmianaGalezi(T_ZDARZENIA, "LB", False),
            ZmianaGalezi(T_ZASILENIA, "LB", True),
            *_zdarzenie_zaklocenia(zaklocenie, T_DRUGIEGO, wyspa=False),
        )
    return (
        ZmianaOdbioru(T_ZDARZENIA, "ODB_B", False),
        ZmianaOdbioru(T_ZASILENIA, "ODB_B", True),
        *_zdarzenie_zaklocenia(zaklocenie, T_DRUGIEGO, wyspa=False),
    )


def _bieg(uklad: dict[str, Any], zdarzenia: tuple[Any, ...], integrator: str, adapt: bool):
    dt = 0.001 if integrator == "rk4_jawny" else 0.002
    nastawy = uklady.nastawy(
        dt_s=dt,
        horyzont_s=HORYZONT,
        krok_wyjscia_s=0.01,
        integrator=integrator,
        dt_min_s=dt / 8.0 if adapt else None,
        dt_max_s=dt * 2.0 if adapt else None,
    )
    return SilnikDynamiki(
        WejscieDynamiki(
            wezly=uklad["wezly"],
            galezie=uklad["galezie"],
            odsprzegi=uklad["odsprzegi"],
            odbiory=uklad["odbiory"],
            urzadzenia=uklad["urzadzenia"],
            punkt_pracy=uklad["punkt"],
            harmonogram=HarmonogramDynamiki(zdarzenia),
            nastawy=nastawy,
            s_bazowa_mva=uklady.S_BAZOWA_MVA,
            f_bazowa_hz=F_N,
        )
    ).uruchom()


# ---------------------------------------------------------------------------
# Wyrocznia (bez importu wzorów rdzenia)
# ---------------------------------------------------------------------------


def _wrap(kat: float) -> float:
    """Kąt w (-pi, pi]."""
    return cmath.phase(cmath.exp(1j * kat))


def _f_odb_wyroczni(u: float, kat_deg: float | None, x: float) -> float:
    if u == 0.0 or kat_deg is None:
        return F_N
    return F_N * (1.0 + _wrap(math.radians(kat_deg) - x) / (W_N * T_F))


def _moc_wyroczni(p0: float, q0: float, k_pf: float, k_qf: float, u: float, f: float) -> complex:
    fp = 1.0 + k_pf * (f - F_N) / F_N
    fq = 1.0 + k_qf * (f - F_N) / F_N
    w = 1.0 if u >= U_MIN else (u / U_MIN) ** 2
    return complex(p0 * fp * w, q0 * fq * w)


UKLADY = ("smib", "wyspa", "obszar", "odlaczenie")
ILOCZYN = list(
    itertools.product(
        UKLADY,
        sorted(CZULOSCI),
        ("skok", "zwarcie"),
        ("trapez_niejawny", "rk4_jawny"),
        (False, True),
    )
)


@pytest.mark.parametrize(
    ("uklad_rodzaj", "czulosc", "zaklocenie", "integrator", "adapt"),
    ILOCZYN,
    ids=[f"{a}-{b}-{c}-{d[:4]}-{'ad' if e else 'st'}" for a, b, c, d, e in ILOCZYN],
)
def test_tozsamosci_estymatora_i_poboru_iloczyn_cech(
    uklad_rodzaj: str, czulosc: str, zaklocenie: str, integrator: str, adapt: bool
) -> None:
    k_pf, k_qf = CZULOSCI[czulosc]
    charakterystyka = _charakterystyka(k_pf, k_qf)
    uklad = (
        _wyspa(charakterystyka)
        if uklad_rodzaj == "wyspa"
        else _smib_z_szyna_odbioru(charakterystyka)
    )
    (odbior,) = uklad["odbiory"]
    zdarzenia = _scenariusz(uklad_rodzaj, zaklocenie)
    wynik = _bieg(uklad, zdarzenia, integrator, adapt)

    czas, strony = wynik.os_czasu_s, wynik.strona_probki
    u = wynik.probki["u_pu@B"]
    kat = wynik.probki["kat_deg@B"]
    x = wynik.probki["kat_pomiaru_rad@ODB_B"]
    f_odb = wynik.probki["f_odbioru_hz@ODB_B"]
    p = wynik.probki["p_pobor_pu@ODB_B"]
    q = wynik.probki["q_pobor_pu@ODB_B"]
    tryb = wynik.probki["tryb_odbioru@ODB_B"]
    t_skoku = next((z.t_s for z in zdarzenia if isinstance(z, SkokObciazenia)), None)
    dp = next((z.delta_p_pu for z in zdarzenia if isinstance(z, SkokObciazenia)), 0.0)
    ponownie_zasilone = uklad_rodzaj == "obszar"
    minimum_u = math.inf
    for i, t in enumerate(czas):
        po_skoku = t_skoku is not None and (t > t_skoku or (t == t_skoku and strony[i] == "P"))
        p0 = odbior.p_pu + (dp if po_skoku else 0.0)
        if tryb[i] in (2.0, 3.0):
            assert f_odb[i] is None and p[i] == 0.0 and q[i] == 0.0, (t, strony[i])
            continue
        assert f_odb[i] is not None
        minimum_u = min(minimum_u, u[i])
        if ponownie_zasilone and t == T_ZASILENIA and strony[i] == "P":
            # M47: estymator zaczyna od nowa — f_n dokładnie, stan = faza napięcia po zasileniu.
            assert f_odb[i] == F_N
            assert x[i] == pytest.approx(math.radians(kat[i]), abs=1e-12)
        else:
            assert f_odb[i] == pytest.approx(_f_odb_wyroczni(u[i], kat[i], x[i]), abs=1e-9), t
        moc = _moc_wyroczni(p0, odbior.q_pu, k_pf, k_qf, u[i], f_odb[i])
        assert p[i] == pytest.approx(moc.real, abs=1e-12) and q[i] == pytest.approx(
            moc.imag, abs=1e-12
        )
        assert tryb[i] == (1.0 if u[i] < U_MIN else 0.0)
    if zaklocenie == "zwarcie":
        assert minimum_u < U_MIN, "zwarcie fikstury nie sprowadziło napięcia poniżej U_min"
    kody = {z.kod for z in wynik.zalozenia}
    assert "estymator_czestotliwosci_odbiorow" in kody
    if ponownie_zasilone:
        assert "reinicjalizacja_estymatora_odbioru" in kody
        (zasilenie,) = (z for z in wynik.zdarzenia_wykonane if z.t_wykonany_s == T_ZASILENIA)
        assert [pr.adres for pr in zasilenie.przypisania] == ["ODB_B.kat_pomiaru_rad"]
    else:
        assert "reinicjalizacja_estymatora_odbioru" not in kody
    kanaly = {k.klucz: k for k in wynik.kanaly}
    assert kanaly["kat_pomiaru_rad@ODB_B"].przestrzen == "odbior"
    assert kanaly["f_odbioru_hz@ODB_B"].przestrzen == "obserwabla"


def test_estymator_jest_inercja_pierwszego_rzedu_czestotliwosci_szyny() -> None:
    """Tożsamość `T_f dDw_hat/dt = Dw_szyny - Dw_hat` między zdarzeniami (docstring `odbiory.py`).

    `Dw_szyny` z obserwabli `f_hz@` szyny (niezależna droga — pochodna napięć z algebry),
    `dDw_hat/dt` z różnicy centralnej kanału `f_odbioru_hz@` przy zapisie co krok.
    """
    uklad = _wyspa(_charakterystyka(2.0, 0.0))
    nastawy = uklady.nastawy(dt_s=0.001, horyzont_s=1.0, krok_wyjscia_s=0.001)
    wynik = SilnikDynamiki(
        WejscieDynamiki(
            wezly=uklad["wezly"],
            galezie=uklad["galezie"],
            odsprzegi=(),
            odbiory=uklad["odbiory"],
            urzadzenia=uklad["urzadzenia"],
            punkt_pracy=uklad["punkt"],
            harmonogram=HarmonogramDynamiki((SkokObciazenia(0.1, "ODB_B", 0.02, 0.0),)),
            nastawy=nastawy,
            s_bazowa_mva=uklady.S_BAZOWA_MVA,
            f_bazowa_hz=F_N,
        )
    ).uruchom()
    t = np.array(wynik.os_czasu_s)
    ciagle = [i for i, s in enumerate(wynik.strona_probki) if s == "C" and 0.2 < t[i] < 0.95]
    dw_hat = np.array([v / F_N - 1.0 for v in wynik.probki["f_odbioru_hz@ODB_B"]], dtype=float)
    dw_szyny = np.array([np.nan if v is None else v / F_N - 1.0 for v in wynik.probki["f_hz@B"]])
    reszty = []
    skala = 0.0
    for i in ciagle:
        pochodna = (dw_hat[i + 1] - dw_hat[i - 1]) / (t[i + 1] - t[i - 1])
        skala = max(skala, abs(pochodna))
        reszty.append(T_F * pochodna - (dw_szyny[i] - dw_hat[i]))
    assert skala > 1e-4, "fikstura bez dynamiki częstotliwości"
    assert max(abs(r) for r in reszty) <= 1e-3 * T_F * skala


def test_wiele_obrotow_kata_szyny_bez_poslizgu_estymatora() -> None:
    """Przejście ABSOLUTNEGO kąta szyny przez ±pi (wyspa z odchyłką częstotliwości, wiele
    obrotów) nie jest poślizgiem: estymator śledzi fazę, `|theta - x|` pozostaje małe."""
    uklad = _wyspa(_charakterystyka(2.0, 0.0))
    wynik = SilnikDynamiki(
        WejscieDynamiki(
            wezly=uklad["wezly"],
            galezie=uklad["galezie"],
            odsprzegi=(),
            odbiory=uklad["odbiory"],
            urzadzenia=uklad["urzadzenia"],
            punkt_pracy=uklad["punkt"],
            harmonogram=HarmonogramDynamiki((SkokObciazenia(0.1, "ODB_B", 0.05, 0.0),)),
            nastawy=uklady.nastawy(dt_s=0.01, horyzont_s=30.0, krok_wyjscia_s=0.05),
            s_bazowa_mva=uklady.S_BAZOWA_MVA,
            f_bazowa_hz=F_N,
        )
    ).uruchom()
    x = np.array(wynik.probki["kat_pomiaru_rad@ODB_B"], dtype=float)
    assert abs(x[-1] - x[0]) > 4 * 2 * math.pi, "fikstura nie obróciła kąta cztery razy"
    kat = np.unwrap(np.radians(np.array(wynik.probki["kat_deg@B"], dtype=float)))
    # Opóźnienie estymatora w stanie ustalonym: e = w_n T_f Dw_inf, Dw_inf = (P_m/P0' - 1)/k
    # = (0,5/0,55 - 1)/2 — ok. 0,71 rad; różnica fazy ciągła i daleko od ±pi (bez poślizgu).
    dw_inf = (_P0 / (_P0 + 0.05) - 1.0) / 2.0
    assert np.max(np.abs(kat - x)) < math.pi / 2
    assert (kat - x)[-1] == pytest.approx(W_N * T_F * dw_inf, rel=2e-2)


def test_poslizg_estymatora_jest_odmowa_nazwana() -> None:
    """Stała pomiaru dłuższa niż okres dudnień: różnica fazy przechodzi przez ±pi — odmowa
    `zakres_waznosci_przekroczony` z adresem stanu estymatora (nie cichy skok 2 pi)."""
    uklad = _wyspa(_charakterystyka(2.0, 0.0, t_f=50.0))
    with pytest.raises(OdmowaDynamiki) as blad:
        SilnikDynamiki(
            WejscieDynamiki(
                wezly=uklad["wezly"],
                galezie=uklad["galezie"],
                odsprzegi=(),
                odbiory=uklad["odbiory"],
                urzadzenia=uklad["urzadzenia"],
                punkt_pracy=uklad["punkt"],
                harmonogram=HarmonogramDynamiki((SkokObciazenia(0.1, "ODB_B", 0.05, 0.0),)),
                nastawy=uklady.nastawy(dt_s=0.01, horyzont_s=60.0, krok_wyjscia_s=0.5),
                s_bazowa_mva=uklady.S_BAZOWA_MVA,
                f_bazowa_hz=F_N,
            )
        ).uruchom()
    assert blad.value.kod == KOD_ZAKRES_WAZNOSCI_PRZEKROCZONY
    assert blad.value.szczegoly["adresy"] == ("ODB_B.kat_pomiaru_rad",)


def test_czynnik_czestotliwosci_niedodatni_jest_odmowa_nazwana() -> None:
    """Skok fazy przy zwarciu z małym `T_f` i dużym `k`: `F <= 0` — odmowa z adresem
    `<odbiór>.czynnik_czestotliwosci_P` i wartością (R6 karty), nie ujemny pobór."""
    uklad = _smib_z_szyna_odbioru(_charakterystyka(40.0, 0.0, t_f=0.002))
    with pytest.raises(OdmowaDynamiki) as blad:
        _bieg(
            uklad,
            _zdarzenie_zaklocenia("zwarcie", T_ZDARZENIA, wyspa=False),
            "trapez_niejawny",
            False,
        )
    assert blad.value.kod == KOD_ZAKRES_WAZNOSCI_PRZEKROCZONY
    (adres,) = blad.value.szczegoly["adresy"]
    assert adres == "ODB_B.czynnik_czestotliwosci_P"
    assert blad.value.szczegoly["wartosci"][0] <= 0.0


# ---------------------------------------------------------------------------
# Jakobiany modelu odbioru wobec różnicy centralnej
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("czulosc", sorted(CZULOSCI))
@pytest.mark.parametrize("modul", [1.02, 0.5])
@pytest.mark.parametrize("kat", [0.3, math.pi - 1e-3, -math.pi + 1e-3])
@pytest.mark.parametrize("przesuniecie_stanu", [0.0, 0.2])
def test_jakobiany_modelu_odbioru_wobec_roznicy_centralnej(
    czulosc: str, modul: float, kat: float, przesuniecie_stanu: float
) -> None:
    """∂I/∂V, ∂I/∂x, ∂f/∂x, ∂f/∂V w gałęzi charakterystyki i impedancyjnej, także przy
    kącie napięcia tuż przy ±pi (zawinięcie `arg`) — wobec różnicy centralnej prądu i pochodnej."""
    k_pf, k_qf = CZULOSCI[czulosc]
    model = model_odbioru(
        OdbiorDynamiki("O", "B", 0.3, 0.1, _charakterystyka(k_pf, k_qf)),
        F_N,
        tryb_poza_obwodem=None,
        estymator_wyzerowany=False,
    )
    napiecie = cmath.rect(modul, kat)
    stan = np.array([kat - przesuniecie_stanu])
    krok = 1e-7

    def prad(v: complex, s: np.ndarray) -> np.ndarray:
        wartosc = model.prad_pu(s, v)
        return np.array([wartosc.real, wartosc.imag])

    jv = model.jakobian_prad_napiecie(stan, napiecie)
    for os_ in (0, 1):
        delta = complex(krok, 0.0) if os_ == 0 else complex(0.0, krok)
        numeryczny = (prad(napiecie + delta, stan) - prad(napiecie - delta, stan)) / (2 * krok)
        assert np.allclose(jv[:, os_], numeryczny, rtol=1e-6, atol=1e-7)
    jx = model.jakobian_prad_stan(stan, napiecie)
    numeryczny_x = (prad(napiecie, stan + krok) - prad(napiecie, stan - krok)) / (2 * krok)
    assert np.allclose(jx[:, 0], numeryczny_x, rtol=1e-6, atol=1e-7)
    fx = model.jakobian_stan_stan(stan, napiecie)
    fv = model.jakobian_stan_napiecie(stan, napiecie)
    numeryczny_fx = (
        model.pochodne(stan + krok, napiecie) - model.pochodne(stan - krok, napiecie)
    ) / (2 * krok)
    assert np.allclose(fx[:, 0], numeryczny_fx, rtol=1e-6, atol=1e-6)
    for os_ in (0, 1):
        delta = complex(krok, 0.0) if os_ == 0 else complex(0.0, krok)
        numeryczny_fv = (
            model.pochodne(stan, napiecie + delta) - model.pochodne(stan, napiecie - delta)
        ) / (2 * krok)
        assert np.allclose(fv[:, os_], numeryczny_fv, rtol=1e-6, atol=1e-6)


def test_odbior_odlaczony_i_zerowe_napiecie_nie_wnosza_pradu_ani_czestotliwosci() -> None:
    """Tryb poza obwodem: prąd 0, jakobiany 0, częstotliwość niedostępna; `V = 0` — `e := 0`."""
    ch = _charakterystyka(2.0, 1.5)
    odbior = OdbiorDynamiki("O", "B", 0.3, 0.1, ch)
    odlaczony = model_odbioru(odbior, F_N, tryb_poza_obwodem=2.0, estymator_wyzerowany=False)
    stan = np.array([0.4])
    assert odlaczony.prad_pu(stan, complex(1.0, 0.1)) == 0j
    assert not np.any(odlaczony.jakobian_prad_napiecie(stan, complex(1.0, 0.1)))
    assert not np.any(odlaczony.jakobian_prad_stan(stan, complex(1.0, 0.1)))
    assert odlaczony.czestotliwosc_widziana_hz(stan, complex(1.0, 0.1)) is None
    zasilany = model_odbioru(odbior, F_N, tryb_poza_obwodem=None, estymator_wyzerowany=False)
    assert zasilany.czestotliwosc_widziana_hz(stan, 0j) == F_N
    assert zasilany.pochodne(stan, 0j)[0] == 0.0
    assert zasilany.prad_pu(stan, 0j) == 0j

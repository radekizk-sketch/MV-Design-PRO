"""WYROCZNIA NIEZALEZNA dla SMIB z maszyna klasyczna (R10 par. 17).

ZERO importow z `network_model.solvers.dynamika`. Wlasna algebra sieci, wlasny
integrator (`scipy.integrate.solve_ivp`), wlasna postac zamknieta i WLASNY
algorytm czasu krytycznego. Sluzy do FALSYFIKACJI produktu, wiec nie moze dzielic
z nim ani jednej linii kodu — inaczej potwierdzalaby go jego wlasnym kodem.

UKLAD (parametry wpisane JAWNIE po obu stronach, nigdy importowane z produktu):
    wezly: GEN (0), SYS (1);  galaz GEN-SYS o reaktancji X_L
    maszyna klasyczna w GEN: E' za jX'd (+ Ra)
    szyna sztywna w SYS:     E_s za jX_s (+ R_s)

ALGEBRA. Przy braku odbioru o stalej mocy uklad `Y V = I(x, V)` jest LINIOWY:

    I_k = (E_k - V_k) y_k   =>   (Y + diag(y_k)) V = sum_k E_k y_k e_k

wiec rozwiazuje sie go JEDNYM rozkladem 2x2, bez Newtona. To jest inna droga
numeryczna niz w produkcie (Newton rzadki + globalizacja Armijo) — i o to chodzi.

POSTAC ZAMKNIETA (tylko dla Ra = R_s = 0):

    P_e = |E'| |E_s| sin(delta - delta_s) / (X'd + X_L + X_s)
"""

from __future__ import annotations

import cmath
import math
from dataclasses import dataclass

import numpy as np
from scipy.integrate import solve_ivp
from scipy.optimize import brentq


@dataclass(frozen=True)
class UkladSMIB:
    """Parametry ukladu odniesienia. Wartosci domyslne = wzorzec bazowy W6-F."""

    h_s: float = 3.5
    d_pu: float = 0.0
    x_prim_pu: float = 0.3
    ra_pu: float = 0.0
    x_linii_pu: float = 0.3
    x_systemu_pu: float = 0.05
    r_systemu_pu: float = 0.0
    u_gen_pu: float = 1.05
    p_gen_pu: float = 0.8
    f_bazowa_hz: float = 50.0

    @property
    def omega_b(self) -> float:
        return 2.0 * math.pi * self.f_bazowa_hz

    @property
    def y_maszyny(self) -> complex:
        return 1.0 / complex(self.ra_pu, self.x_prim_pu)

    @property
    def y_systemu(self) -> complex:
        return 1.0 / complex(self.r_systemu_pu, self.x_systemu_pu)

    @property
    def y_linii(self) -> complex:
        return 1.0 / complex(0.0, self.x_linii_pu)

    # ---------------------------------------------------------------- punkt pracy
    def punkt_pracy(self) -> dict[str, complex | float]:
        """Rozwiazanie DOKLADNE punktu pracy (ta sama definicja, co uklad odniesienia)."""
        kat = math.asin(self.p_gen_pu * self.x_linii_pu / self.u_gen_pu)
        v_gen = self.u_gen_pu * cmath.exp(1j * kat)
        v_sys = complex(1.0, 0.0)
        i_linii = (v_gen - v_sys) * self.y_linii
        e_masz = v_gen + complex(self.ra_pu, self.x_prim_pu) * i_linii
        e_sys = v_sys + complex(self.r_systemu_pu, self.x_systemu_pu) * (-i_linii)
        p_e0 = (e_masz * i_linii.conjugate()).real
        return {
            "v_gen": v_gen,
            "v_sys": v_sys,
            "i_linii": i_linii,
            "e_masz": e_masz,
            "e_sys": e_sys,
            "delta0": cmath.phase(e_masz),
            "sem_modul": abs(e_masz),
            "p_m": p_e0,
        }

    # ---------------------------------------------------------------- algebra sieci
    def macierz(self, bocznik_gen: complex = 0j, x_linii_pu: float | None = None) -> np.ndarray:
        """Macierz ukladu `(Y + diag(y_k))` dla zadanego stanu topologii."""
        y_l = 1.0 / complex(0.0, self.x_linii_pu if x_linii_pu is None else x_linii_pu)
        y_bus = np.array([[y_l, -y_l], [-y_l, y_l]], dtype=complex)
        return y_bus + np.diag([self.y_maszyny + bocznik_gen, self.y_systemu])

    def napiecia(
        self,
        e_masz: complex,
        e_sys: complex,
        bocznik_gen: complex = 0j,
        x_linii_pu: float | None = None,
    ) -> np.ndarray:
        """Rozwiazanie ALGEBRY: jeden rozklad 2x2, bez iteracji."""
        prawa = np.array([e_masz * self.y_maszyny, e_sys * self.y_systemu], dtype=complex)
        return np.linalg.solve(self.macierz(bocznik_gen, x_linii_pu), prawa)

    def moc_elektryczna(
        self,
        delta: float,
        sem_modul: float,
        e_sys: complex,
        bocznik_gen: complex = 0j,
        x_linii_pu: float | None = None,
    ) -> float:
        e_masz = sem_modul * cmath.exp(1j * delta)
        napiecia = self.napiecia(e_masz, e_sys, bocznik_gen, x_linii_pu)
        prad = (e_masz - napiecia[0]) * self.y_maszyny
        return float((e_masz * prad.conjugate()).real)

    def moc_elektryczna_zamknieta(self, delta: float, sem_modul: float, e_sys: complex) -> float:
        """Postac ZAMKNIETA — wazna wylacznie dla ukladu bezstratnego."""
        if self.ra_pu != 0.0 or self.r_systemu_pu != 0.0:
            raise ValueError("Postac zamknieta obowiazuje tylko dla Ra = R_s = 0")
        x_total = self.x_prim_pu + self.x_linii_pu + self.x_systemu_pu
        return sem_modul * abs(e_sys) * math.sin(delta - cmath.phase(e_sys)) / x_total

    # ---------------------------------------------------------------- malosygnalowa
    def wspolczynnik_synchronizujacy(self, delta: float, sem_modul: float, e_sys: complex) -> float:
        """`K_s = dP_e/ddelta` w postaci ZAMKNIETEJ (uklad bezstratny)."""
        x_total = self.x_prim_pu + self.x_linii_pu + self.x_systemu_pu
        return sem_modul * abs(e_sys) * math.cos(delta - cmath.phase(e_sys)) / x_total

    def mod_analityczny(self) -> dict[str, float | complex]:
        """Mod elektromechaniczny z linearyzacji rownania wahan wokol punktu pracy."""
        pp = self.punkt_pracy()
        k_s = self.wspolczynnik_synchronizujacy(
            float(pp["delta0"]), float(pp["sem_modul"]), complex(pp["e_sys"])
        )
        omega_n = math.sqrt(self.omega_b * k_s / (2.0 * self.h_s))
        zeta = self.d_pu / (4.0 * self.h_s * omega_n)
        omega_d = omega_n * math.sqrt(max(0.0, 1.0 - zeta * zeta))
        return {
            "k_s": k_s,
            "omega_n_rad_s": omega_n,
            "f_n_hz": omega_n / (2.0 * math.pi),
            "zeta": zeta,
            "omega_d_rad_s": omega_d,
            "f_d_hz": omega_d / (2.0 * math.pi),
            "lambda": complex(-zeta * omega_n, omega_d),
            "okres_s": 2.0 * math.pi / omega_d if omega_d > 0 else math.inf,
        }

    # ---------------------------------------------------------------- calkowanie
    def calkuj(
        self,
        *,
        horyzont_s: float,
        p_m: float | None = None,
        czasy_wyjscia: np.ndarray | None = None,
        rtol: float = 1e-12,
        atol: float = 1e-14,
        metoda: str = "DOP853",
        skok_p_m: tuple[float, float] | None = None,
        okno_zaklocenia: tuple[float, float, complex] | None = None,
        okno_linii: tuple[float, float, float] | None = None,
    ) -> dict[str, np.ndarray]:
        """Trajektoria `(delta, omega)` wlasnym integratorem o zmiennym kroku.

        Zdarzenie (skok mocy, zwarcie, zmiana reaktancji) obsluzone przez PODZIAL
        calkowania na odcinki — nigdy przez zgadywanie kroku ani przez wygladzanie
        nieciaglosci. `metoda` przyjmuje kazda metode `solve_ivp`; drugi
        niezalezny integrator (`Radau`) sluzy do sprawdzenia samego siebie.
        """
        pp = self.punkt_pracy()
        e_sys = complex(pp["e_sys"])
        sem = float(pp["sem_modul"])
        p_m0 = float(pp["p_m"]) if p_m is None else p_m

        def prawa_strona(
            _t: float,
            stan: np.ndarray,
            moc_mech: float,
            bocznik: complex = 0j,
            x_l: float | None = None,
        ) -> list[float]:
            delta, omega = float(stan[0]), float(stan[1])
            p_e = self.moc_elektryczna(delta, sem, e_sys, bocznik, x_l)
            return [
                self.omega_b * (omega - 1.0),
                (moc_mech - p_e - self.d_pu * (omega - 1.0)) / (2.0 * self.h_s),
            ]

        if okno_zaklocenia is not None or okno_linii is not None:
            if okno_zaklocenia is not None:
                t_a, t_b, boc = okno_zaklocenia
                x_awarii: float | None = None
            else:
                t_a, t_b, x_awarii = okno_linii  # type: ignore[misc]
                boc = 0j
            assert czasy_wyjscia is not None, "okno zaklocenia wymaga jawnej osi czasu"
            odcinki = [
                (0.0, t_a, 0j, None),
                (t_a, t_b, boc, x_awarii),
                (t_b, horyzont_s, 0j, None),
            ]
            stan = [float(pp["delta0"]), 1.0]
            czasy, deltas, omegi = [], [], []
            for t0, t1, b_okna, x_okna in odcinki:
                if t1 <= t0:
                    continue
                maska = (czasy_wyjscia > t0) & (czasy_wyjscia <= t1)
                if t0 == 0.0:
                    maska |= czasy_wyjscia == 0.0
                punkty = czasy_wyjscia[maska]
                r = solve_ivp(
                    prawa_strona,
                    (t0, t1),
                    stan,
                    t_eval=punkty,
                    method=metoda,
                    rtol=rtol,
                    atol=atol,
                    args=(p_m0, b_okna, x_okna),
                    dense_output=True,
                )
                assert r.success, r.message
                if punkty.size:
                    czasy.append(r.t)
                    deltas.append(r.y[0])
                    omegi.append(r.y[1])
                stan = list(r.sol(t1))
            return {
                "t": np.concatenate(czasy),
                "delta": np.concatenate(deltas),
                "omega": np.concatenate(omegi),
            }

        if czasy_wyjscia is None:
            czasy_wyjscia = np.linspace(0.0, horyzont_s, 1001)

        if skok_p_m is None:
            rozwiazanie = solve_ivp(
                prawa_strona,
                (0.0, horyzont_s),
                [float(pp["delta0"]), 1.0],
                t_eval=czasy_wyjscia,
                method=metoda,
                rtol=rtol,
                atol=atol,
                args=(p_m0,),
            )
            assert rozwiazanie.success, rozwiazanie.message
            return {"t": rozwiazanie.t, "delta": rozwiazanie.y[0], "omega": rozwiazanie.y[1]}

        t_skoku, delta_p = skok_p_m
        przed = czasy_wyjscia[czasy_wyjscia <= t_skoku]
        po = czasy_wyjscia[czasy_wyjscia > t_skoku]
        r1 = solve_ivp(
            prawa_strona,
            (0.0, t_skoku),
            [float(pp["delta0"]), 1.0],
            t_eval=przed,
            method=metoda,
            rtol=rtol,
            atol=atol,
            args=(p_m0,),
        )
        assert r1.success, r1.message
        r2 = solve_ivp(
            prawa_strona,
            (t_skoku, horyzont_s),
            list(r1.y[:, -1]),
            t_eval=po,
            method=metoda,
            rtol=rtol,
            atol=atol,
            args=(p_m0 + delta_p,),
        )
        assert r2.success, r2.message
        return {
            "t": np.concatenate((r1.t, r2.t)),
            "delta": np.concatenate((r1.y[0], r2.y[0])),
            "omega": np.concatenate((r1.y[1], r2.y[1])),
        }

    # ---------------------------------------------------- czas krytyczny (R10 par. 17)
    def kat_rownowagi_niestabilnej(self) -> float:
        """`delta_u` = drugie rozwiazanie `P_e(delta) = P_m` w postaci zamknietej.

        Dla ukladu bezstratnego `P_e = P_max sin(delta - delta_s)`, wiec
        `delta_u = delta_s + pi - asin(P_m / P_max)`. To jest granica obszaru, z
        ktorego maszyna jeszcze wraca — przekroczenie jej przy dodatniej predkosci
        oznacza utrate synchronizmu.
        """
        pp = self.punkt_pracy()
        sem, e_sys = float(pp["sem_modul"]), complex(pp["e_sys"])
        x_total = self.x_prim_pu + self.x_linii_pu + self.x_systemu_pu
        p_max = sem * abs(e_sys) / x_total
        delta_s = cmath.phase(e_sys)
        return delta_s + math.pi - math.asin(float(pp["p_m"]) / p_max)

    def reaktancja_linii_przy_zwarciu(self, x_f_pu: float) -> float:
        """Zastepcza reaktancja LINII odwzorowujaca zwarcie przez `X_f` w wezle GEN.

        Zwarcie w wezle generatora przez reaktancje `X_f` sprowadza sie
        przeksztalceniem gwiazda-trojkat do zastepczej reaktancji przesylu

            X_zast = X1 + X2 + X1*X2 / X_f ,   X1 = X'd ,  X2 = X_L + X_s

        (uklad pozostaje bezstratny, wiec charakterystyka mocy ma nadal postac
        `P_max sin(delta - delta_s)` — tylko z mniejszym `P_max`). Zwracamy te
        wartosc W POSTACI REAKTANCJI LINII, zeby reszta wyroczni mogla uzywac
        jednego i tego samego toru `moc_elektryczna(..., x_linii_pu=...)`.
        """
        x1 = self.x_prim_pu
        x2 = self.x_linii_pu + self.x_systemu_pu
        x_zastepcza = x1 + x2 + x1 * x2 / x_f_pu
        return x_zastepcza - self.x_prim_pu - self.x_systemu_pu

    def czas_krytyczny_rownych_pol(self, *, x_linii_zwarcia_pu: float) -> dict[str, float]:
        """`t_CCT` z KRYTERIUM ROWNYCH POL — postac calkowa, bez calkowania w czasie.

        Zwarcie modelowane jako podniesienie reaktancji linii do
        `x_linii_zwarcia_pu` (charakterystyka mocy w czasie zwarcia jest wtedy
        `P_max_z sin(delta - delta_s)` z mniejszym `P_max_z`). Kat krytyczny
        `delta_c` wychodzi z rownosci pol przyspieszajacego i hamujacego:

            A1(delta_c) = INT_{d0}^{dc} (P_m - P_e^zwarcie) d(delta)
            A2(delta_c) = INT_{dc}^{du} (P_e^zdrowa - P_m) d(delta)

        a czas z calkowania rownania wahan w czasie zwarcia (tam `P_e` jest
        funkcja samego kata, wiec `t` liczy sie kwadratura, nie krokami):

            t = INT_{d0}^{dc} d(delta) / sqrt( (omega_0/H) * A1(delta) )

        Ta droga jest CALKOWICIE inna niz w produkcie (bisekcja po biegach
        czasowych), wiec zgodnosc wynikow nie moze byc artefaktem wspolnego kodu.
        """
        pp = self.punkt_pracy()
        sem, e_sys = float(pp["sem_modul"]), complex(pp["e_sys"])
        p_m = float(pp["p_m"])
        delta_s = cmath.phase(e_sys)
        delta_0 = float(pp["delta0"])
        delta_u = self.kat_rownowagi_niestabilnej()

        x_zdrowa = self.x_prim_pu + self.x_linii_pu + self.x_systemu_pu
        x_zwarcie = self.x_prim_pu + x_linii_zwarcia_pu + self.x_systemu_pu
        p_max_zdrowa = sem * abs(e_sys) / x_zdrowa
        p_max_zwarcie = sem * abs(e_sys) / x_zwarcie

        def pole_przyspieszajace(delta_c: float) -> float:
            return p_m * (delta_c - delta_0) + p_max_zwarcie * (
                math.cos(delta_c - delta_s) - math.cos(delta_0 - delta_s)
            )

        def pole_hamujace(delta_c: float) -> float:
            return -p_max_zdrowa * (
                math.cos(delta_u - delta_s) - math.cos(delta_c - delta_s)
            ) - p_m * (delta_u - delta_c)

        delta_c = brentq(
            lambda d: pole_przyspieszajace(d) - pole_hamujace(d),
            delta_0 + 1e-12,
            delta_u - 1e-12,
            xtol=1e-14,
            rtol=8.9e-16,
        )

        # Kwadratura czasu. Z `d(delta)/dt = v`, `dv/dt = omega_0 (P_m - P_e)/(2H)`
        # wychodzi `v^2/2 = (omega_0/(2H)) A1(delta)`, czyli
        # `v = sqrt( (omega_0/H) A1(delta) )` — MIANOWNIK JEST `H`, NIE `2H`.
        # (Pierwsza wersja tej kwadratury miala tu `2H` i dawala czas zawyzony
        # DOKLADNIE sqrt(2) razy: 0,5618 s zamiast 0,3973 s. Wykryla to druga,
        # niezalezna droga — bisekcja po trajektoriach; po to sa dwie drogi.)
        # Podcalkowa ma osobliwosc calkowalna 1/sqrt w delta_0, wiec podstawiamy
        # delta = delta_0 + s^2 (s od 0), co ja usuwa DOKLADNIE.
        wspolczynnik = self.omega_b / self.h_s

        def podcalkowa(s: float) -> float:
            delta = delta_0 + s * s
            pole = pole_przyspieszajace(delta)
            return 2.0 * s / math.sqrt(wspolczynnik * pole) if pole > 0.0 else 0.0

        from scipy.integrate import quad

        czas, blad = quad(
            podcalkowa, 0.0, math.sqrt(delta_c - delta_0), epsabs=1e-14, epsrel=1e-13, limit=400
        )
        return {
            "delta_0_rad": delta_0,
            "delta_u_rad": delta_u,
            "delta_c_rad": delta_c,
            "pole_przyspieszajace": pole_przyspieszajace(delta_c),
            "pole_hamujace": pole_hamujace(delta_c),
            "niedomkniecie_pol": pole_przyspieszajace(delta_c) - pole_hamujace(delta_c),
            "t_cct_s": czas,
            "blad_kwadratury_s": blad,
        }

    def czas_krytyczny_calkowaniem(
        self,
        *,
        x_linii_zwarcia_pu: float,
        horyzont_s: float,
        metoda: str = "DOP853",
        tolerancja_bisekcji_s: float = 1e-9,
        definicja_utraty: str = "przekroczenie_delta_u",
    ) -> dict[str, float]:
        """`t_CCT` z BISEKCJI po trajektoriach wlasnego integratora.

        Druga, niezalezna droga do tej samej liczby — sprawdza kryterium rownych
        pol na wlasnym gruncie (kwadratura po kacie kontra calkowanie po czasie).

        DEFINICJA UTRATY SYNCHRONIZMU jest PARAMETREM, nie zaszyta stala, bo
        pytanie „czy `t_CCT` zalezy od tego, jak nazwiesz utrate" jest samodzielnym
        pytaniem walidacyjnym (R10 par. 18):

        * `przekroczenie_delta_u` — kat przekracza `delta_u` przy `omega > 1`.
          To jest definicja fizyczna: za `delta_u` w sieci pozwarciowej `P_e < P_m`,
          wiec maszyna przyspiesza juz bez powrotu.
        * `rozbieganie_kata` — kat przekracza `delta_u + 2*pi`, czyli maszyna
          wykonala pelny obrot wzgledem sieci. Kryterium PoZNIEJSZE i slabsze;
          jesli `t_CCT` wychodzi z niego taki sam, to znaczy, ze granica nie jest
          artefaktem progu klasyfikacji.

        Uwaga metodyczna: kat moze przekroczyc `delta_u` JUZ W CZASIE ZWARCIA.
        Wtedy w oknie pozwarciowym nie ma „przejscia przez zero" i detektor
        zdarzeniowy milczy — dlatego stan poczatkowy okna pozwarciowego jest
        sprawdzany OSOBNO. Bez tego bisekcja nie znajdowala gornego konca
        przedzialu i konczyla sie falszywym „uklad nie traci synchronizmu".
        """
        delta_u = self.kat_rownowagi_niestabilnej()
        prog = delta_u if definicja_utraty == "przekroczenie_delta_u" else delta_u + 2.0 * math.pi
        if definicja_utraty not in ("przekroczenie_delta_u", "rozbieganie_kata"):
            raise ValueError(f"Nieznana definicja utraty synchronizmu: {definicja_utraty!r}")
        pp = self.punkt_pracy()
        e_sys = complex(pp["e_sys"])
        sem = float(pp["sem_modul"])
        p_m = float(pp["p_m"])

        def prawa(_t: float, stan: np.ndarray, x_l: float | None) -> list[float]:
            p_e = self.moc_elektryczna(float(stan[0]), sem, e_sys, 0j, x_l)
            return [
                self.omega_b * (float(stan[1]) - 1.0),
                (p_m - p_e - self.d_pu * (float(stan[1]) - 1.0)) / (2.0 * self.h_s),
            ]

        def stracil(t_usuniecia: float) -> bool:
            r1 = solve_ivp(
                prawa,
                (0.0, t_usuniecia),
                [float(pp["delta0"]), 1.0],
                method=metoda,
                rtol=1e-12,
                atol=1e-14,
                args=(x_linii_zwarcia_pu,),
                dense_output=True,
            )
            assert r1.success, r1.message
            stan_po = list(r1.y[:, -1])
            if stan_po[0] > prog and stan_po[1] > 1.0:
                return True

            def przekroczenie(_t: float, stan: np.ndarray, _x: float | None) -> float:
                return float(stan[0]) - prog

            przekroczenie.terminal = True  # type: ignore[attr-defined]
            przekroczenie.direction = 1.0  # type: ignore[attr-defined]
            r2 = solve_ivp(
                prawa,
                (t_usuniecia, horyzont_s),
                stan_po,
                method=metoda,
                rtol=1e-12,
                atol=1e-14,
                args=(None,),
                events=przekroczenie,
            )
            assert r2.success, r2.message
            return bool(r2.t_events[0].size)

        dolny, gorny = 0.0, 0.05
        while not stracil(gorny):
            gorny *= 2.0
            if gorny > horyzont_s:
                raise AssertionError("Uklad nie traci synchronizmu w badanym oknie")
        kroki = 0
        while gorny - dolny > tolerancja_bisekcji_s:
            srodek = 0.5 * (dolny + gorny)
            if stracil(srodek):
                gorny = srodek
            else:
                dolny = srodek
            kroki += 1
        return {
            "t_cct_s": 0.5 * (dolny + gorny),
            "polowienia": float(kroki),
            "delta_u_rad": delta_u,
            "prog_klasyfikacji_rad": prog,
            "rozdzielczosc_s": gorny - dolny,
        }


__all__ = ["UkladSMIB"]

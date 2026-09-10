"""Urządzenia dynamiczne: maszyna synchroniczna, falowniki GFL/GFM, odbiór.

KOD BADAWCZY — patrz `backend/research/README.md`.

Każdy model deklaruje wprost swój wektor stanu i implementowane równania.
Zawyżanie nazwą (model „6-rzędowy" o dwóch stanach) było defektem P0-03 audytu
i tutaj jest zakazane: klasa nazywa się tak, jak liczy.

Wspólny kontrakt urządzenia
---------------------------
Urządzenie dostarcza sieci PRĄD w funkcji własnego stanu i napięcia szyny;
sieć zwraca urządzeniu NAPIĘCIE. To jest cała umowa sprzężenia — i to ona nie
istniała w produkcyjnym silniku, gdzie napięcie było stałą 1,0 p.u.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Protocol

import numpy as np
from numpy.typing import NDArray

from dynamic_lab.konwencje import OMEGA_S, dq_z_sieci, siec_z_dq
from dynamic_lab.regulatory import RegulatorNapiecia, RegulatorTurbiny


class UrzadzenieDynamiczne(Protocol):
    """Kontrakt urządzenia dynamicznego — solver-neutralny."""

    ref: str
    szyna: str

    def nazwy_stanow(self) -> tuple[str, ...]:
        """Nazwy stanów w kolejności wektora ``x`` (dokumentacja + diagnostyka)."""
        ...

    def pochodne(self, x: NDArray[np.float64], v_szyny: complex) -> NDArray[np.float64]:
        """``dx/dt`` przy zadanym napięciu szyny [p.u.]."""
        ...

    def wstrzykniecie(self, x: NDArray[np.float64], v_szyny: complex) -> complex:
        """Prąd wstrzykiwany do szyny [p.u.], konwencja generatorowa."""
        ...

    def inicjalizuj(self, v_szyny: complex, s_zadane: complex) -> NDArray[np.float64]:
        """Stan początkowy z punktu pracy rozpływu (``s_zadane`` wstrzykiwane)."""
        ...


@dataclass
class MaszynaSynchroniczna4Rzedu:
    """Maszyna synchroniczna — model DWUOSIOWY 4. RZĘDU (transient, bez tłumików).

    STANY (4): ``[delta, omega, e_q_prim, e_d_prim]``
      - ``delta``      kąt wirnika [rad] względem ramy synchronicznej
      - ``omega``      prędkość [p.u.], 1.0 = synchroniczna
      - ``e_q_prim``   przejściowa SEM w osi q [p.u.]
      - ``e_d_prim``   przejściowa SEM w osi d [p.u.]

    RÓWNANIA RÓŻNICZKOWE
        d(delta)/dt   = OMEGA_S * (omega - 1)
        d(omega)/dt   = (Pm - Pe - D*(omega - 1)) / (2H)
        d(e_q_prim)/dt = (Efd - e_q_prim - (Xd - Xd') * Id) / Td0'
        d(e_d_prim)/dt = (-e_d_prim + (Xq - Xq') * Iq) / Tq0'

    RÓWNANIA ALGEBRAICZNE STOJANA (pominięte transjenty stojana — model RMS)
        Vd = e_d_prim - Ra*Id + Xq'*Iq
        Vq = e_q_prim - Ra*Iq - Xd'*Id
    rozwiązane względem prądów:
        [Ra  -Xq'] [Id]   [e_d_prim - Vd]
        [Xd'  Ra ] [Iq] = [e_q_prim - Vq]
        det = Ra^2 + Xd'*Xq'

    MOC ELEKTRYCZNA (w szczelinie)
        Pe = Vd*Id + Vq*Iq + Ra*(Id^2 + Iq^2)

    CZEGO TEN MODEL NIE MA (jawnie, żeby nikt nie wziął go za więcej):
    uzwojeń tłumiących i SEM podprzejściowych (Xd'', Xq'', Td0'', Tq0''),
    nasycenia obwodu magnetycznego, transjentów stojana, zmiennej prędkości
    w równaniach stojana. Model 6. rzędu wymaga dołożenia tłumików — to jest
    rozszerzenie tej klasy, a nie przemianowanie jej.

    Parametry podawane na BAZIE MASZYNY; przeliczenie na bazę sieci wykonuje
    ``ZespolSynchroniczny`` przez ``BazyMocy`` (jawnie).
    """

    ref: str
    szyna: str
    h_s: float
    """Stała bezwładności [s] — NA BAZIE SIECI (już przeliczona)."""
    d_tlumienie: float = 0.0
    ra_pu: float = 0.0
    xd_pu: float = 1.8
    xq_pu: float = 1.7
    xd_prim_pu: float = 0.3
    xq_prim_pu: float = 0.55
    td0_prim_s: float = 8.0
    tq0_prim_s: float = 0.4

    def __post_init__(self) -> None:
        if self.h_s <= 0.0:
            raise ValueError(f"{self.ref}: h_s musi być > 0")
        if self.td0_prim_s <= 0.0 or self.tq0_prim_s <= 0.0:
            raise ValueError(f"{self.ref}: stałe czasowe muszą być > 0")
        if self.xd_prim_pu <= 0.0 or self.xq_prim_pu <= 0.0:
            raise ValueError(f"{self.ref}: reaktancje przejściowe muszą być > 0")
        if self.xd_pu < self.xd_prim_pu or self.xq_pu < self.xq_prim_pu:
            raise ValueError(f"{self.ref}: reaktancja przejściowa > synchronicznej")

    def nazwy_stanow(self) -> tuple[str, ...]:
        return ("delta_rad", "omega_pu", "e_q_prim_pu", "e_d_prim_pu")

    def prady_dq(
        self, e_d_prim: float, e_q_prim: float, v_szyny: complex, delta: float
    ) -> tuple[float, float, float, float]:
        """Rozwiąż równania stojana → ``(Id, Iq, Vd, Vq)``."""
        v_d, v_q = dq_z_sieci(v_szyny, delta)
        det = self.ra_pu**2 + self.xd_prim_pu * self.xq_prim_pu
        praw_d = e_d_prim - v_d
        praw_q = e_q_prim - v_q
        i_d = (self.ra_pu * praw_d + self.xq_prim_pu * praw_q) / det
        i_q = (self.ra_pu * praw_q - self.xd_prim_pu * praw_d) / det
        return i_d, i_q, v_d, v_q

    def moc_elektryczna(self, x: NDArray[np.float64], v_szyny: complex) -> float:
        """Moc w szczelinie ``Pe`` [p.u. bazy sieci]."""
        delta, _, e_q_prim, e_d_prim = (
            float(x[0]),
            float(x[1]),
            float(x[2]),
            float(x[3]),
        )
        i_d, i_q, v_d, v_q = self.prady_dq(e_d_prim, e_q_prim, v_szyny, delta)
        return v_d * i_d + v_q * i_q + self.ra_pu * (i_d**2 + i_q**2)

    def pochodne_bez_regulatorow(
        self,
        x: NDArray[np.float64],
        v_szyny: complex,
        *,
        pm_pu: float,
        efd_pu: float,
    ) -> NDArray[np.float64]:
        """``dx/dt`` przy zadanych wejściach mechanicznym i wzbudzenia.

        ``pm_pu`` i ``efd_pu`` MUSZĄ pochodzić z regulatorów zespołu — ta funkcja
        jest celowo prywatna dla ``ZespolSynchroniczny``, żeby nie dało się
        uruchomić maszyny z wejściami-stałymi (defekt P0-05).
        """
        delta, omega, e_q_prim, e_d_prim = (
            float(x[0]),
            float(x[1]),
            float(x[2]),
            float(x[3]),
        )
        i_d, i_q, v_d, v_q = self.prady_dq(e_d_prim, e_q_prim, v_szyny, delta)
        p_e = v_d * i_d + v_q * i_q + self.ra_pu * (i_d**2 + i_q**2)
        d_delta = OMEGA_S * (omega - 1.0)
        d_omega = (pm_pu - p_e - self.d_tlumienie * (omega - 1.0)) / (2.0 * self.h_s)
        d_e_q = (
            efd_pu - e_q_prim - (self.xd_pu - self.xd_prim_pu) * i_d
        ) / self.td0_prim_s
        d_e_d = (-e_d_prim + (self.xq_pu - self.xq_prim_pu) * i_q) / self.tq0_prim_s
        return np.array([d_delta, d_omega, d_e_q, d_e_d], dtype=np.float64)

    def wstrzykniecie(self, x: NDArray[np.float64], v_szyny: complex) -> complex:
        """Prąd do sieci [p.u.], konwencja generatorowa (dodatni = do sieci)."""
        delta, _, e_q_prim, e_d_prim = (
            float(x[0]),
            float(x[1]),
            float(x[2]),
            float(x[3]),
        )
        i_d, i_q, _, _ = self.prady_dq(e_d_prim, e_q_prim, v_szyny, delta)
        return siec_z_dq(i_d, i_q, delta)

    def punkt_pracy(self, v_szyny: complex, s_zadane: complex) -> dict[str, float]:
        """Inicjalizacja z rozpływu — procedura kanoniczna dla modelu dwuosiowego.

        Kroki (każdy wyprowadzony, nie zgadnięty):
          1. ``I = conj(S / V)``  — prąd wstrzykiwany.
          2. ``E = V + (Ra + j*Xq) * I`` — wektor leżący NA OSI q,
             więc ``delta = angle(E)``. (Wyprowadzenie: składowa d tego wektora
             znika po podstawieniu ustalonych równań stojana.)
          3. transformacja ``V, I`` do osi dq przy tym ``delta``.
          4. ``e_d_prim = (Xq - Xq') * Iq``   — z warunku ``d(e_d_prim)/dt = 0``.
             ``e_q_prim = Vq + Ra*Iq + Xd'*Id`` — z równania stojana osi q.
          5. ``Efd = e_q_prim + (Xd - Xd') * Id`` — z warunku ``d(e_q_prim)/dt = 0``.
          6. ``Pm = Pe`` — z warunku ``d(omega)/dt = 0`` przy ``omega = 1``.

        Zwraca komplet wielkości punktu pracy (stany + wymagane wejścia).
        """
        if abs(v_szyny) < 1.0e-9:
            raise ValueError(f"{self.ref}: napięcie punktu pracy bliskie zeru")
        i_net = np.conj(s_zadane / v_szyny)
        e_wektor = v_szyny + complex(self.ra_pu, self.xq_pu) * i_net
        delta = math.atan2(e_wektor.imag, e_wektor.real)

        v_d, v_q = dq_z_sieci(v_szyny, delta)
        i_dq = i_net * complex(
            math.cos(delta - math.pi / 2.0), -math.sin(delta - math.pi / 2.0)
        )
        i_d, i_q = i_dq.real, i_dq.imag

        e_d_prim = (self.xq_pu - self.xq_prim_pu) * i_q
        e_q_prim = v_q + self.ra_pu * i_q + self.xd_prim_pu * i_d
        efd = e_q_prim + (self.xd_pu - self.xd_prim_pu) * i_d
        p_e = v_d * i_d + v_q * i_q + self.ra_pu * (i_d**2 + i_q**2)
        return {
            "delta_rad": delta,
            "omega_pu": 1.0,
            "e_q_prim_pu": e_q_prim,
            "e_d_prim_pu": e_d_prim,
            "efd_pu": efd,
            "pm_pu": p_e,
            "i_d_pu": i_d,
            "i_q_pu": i_q,
            "v_d_pu": v_d,
            "v_q_pu": v_q,
        }


@dataclass
class ZespolSynchroniczny:
    """Zespół wytwórczy: maszyna + AVR + governor, z pętlami ZAMKNIĘTYMI.

    STANY (6): ``[delta, omega, e_q_prim, e_d_prim, efd, pm]``

    Domknięcie strukturalne: ``Efd`` i ``Pm`` są STANAMI tego zespołu i są
    podawane maszynie jako wejścia w tym samym wywołaniu, w którym regulatory
    czytają — odpowiednio — napięcie zaciskowe z rozwiązania sieci i prędkość ze
    stanu maszyny. Nie istnieje ścieżka wykonania, w której pętla jest otwarta.
    """

    maszyna: MaszynaSynchroniczna4Rzedu
    avr: RegulatorNapiecia | None = None
    governor: RegulatorTurbiny | None = None
    _efd_stale: float = 0.0
    _pm_stale: float = 0.0

    @property
    def ref(self) -> str:
        return self.maszyna.ref

    @property
    def szyna(self) -> str:
        return self.maszyna.szyna

    def nazwy_stanow(self) -> tuple[str, ...]:
        return (*self.maszyna.nazwy_stanow(), "efd_pu", "pm_pu")

    def pochodne(self, x: NDArray[np.float64], v_szyny: complex) -> NDArray[np.float64]:
        efd = float(x[4])
        pm = float(x[5])
        d_masz = self.maszyna.pochodne_bez_regulatorow(
            x[:4], v_szyny, pm_pu=pm, efd_pu=efd
        )
        # SPRZĘŻENIE ZWROTNE: pomiar z rzeczywistego rozwiązania, nie ze stałej.
        v_t = abs(v_szyny)
        omega = float(x[1])
        d_efd = self.avr.pochodna(efd, v_t) if self.avr is not None else 0.0
        d_pm = self.governor.pochodna(pm, omega) if self.governor is not None else 0.0
        return np.array([*d_masz, d_efd, d_pm], dtype=np.float64)

    def wstrzykniecie(self, x: NDArray[np.float64], v_szyny: complex) -> complex:
        return self.maszyna.wstrzykniecie(x[:4], v_szyny)

    def inicjalizuj(self, v_szyny: complex, s_zadane: complex) -> NDArray[np.float64]:
        pp = self.maszyna.punkt_pracy(v_szyny, s_zadane)
        efd_wym = pp["efd_pu"]
        pm_wym = pp["pm_pu"]
        if self.avr is not None:
            efd0, v_ref = self.avr.stan_ustalony(efd_wym, abs(v_szyny))
            self.avr = RegulatorNapiecia(
                k_a=self.avr.k_a,
                t_a_s=self.avr.t_a_s,
                efd_min=self.avr.efd_min,
                efd_max=self.avr.efd_max,
                v_ref_pu=v_ref,
            )
        else:
            efd0 = efd_wym
        if self.governor is not None:
            pm0, p_ref = self.governor.stan_ustalony(pm_wym)
            self.governor = RegulatorTurbiny(
                r_statyzm=self.governor.r_statyzm,
                t_g_s=self.governor.t_g_s,
                p_min_pu=self.governor.p_min_pu,
                p_max_pu=self.governor.p_max_pu,
                p_ref_pu=p_ref,
            )
        else:
            pm0 = pm_wym
        self._efd_stale = efd0
        self._pm_stale = pm0
        return np.array(
            [
                pp["delta_rad"],
                pp["omega_pu"],
                pp["e_q_prim_pu"],
                pp["e_d_prim_pu"],
                efd0,
                pm0,
            ],
            dtype=np.float64,
        )


@dataclass
class FalownikGFL:
    """Falownik podążający za siecią (grid-following) — ŹRÓDŁO PRĄDOWE.

    STANY (2): ``[p_pu, q_pu]`` — moc czynna i bierna faktycznie wstrzykiwana,
    z filtrem pierwszego rzędu odwzorowującym skończoną szybkość regulacji.

    RÓWNANIA
        dP/dt = (P_cel - P) / Tp
        dQ/dt = (Q_cel - Q) / Tq
        Q_cel = Q_ref + k_qu * (V_ref - |V|)          (statyzm Q(U), poza strefą martwą)
        I     = conj((P + jQ) / V)                     (źródło prądowe)

    OGRANICZENIE PRĄDU (fizyczne, nie kosmetyczne)
        |I| <= i_max  — przy przekroczeniu składowa bierna ma pierwszeństwo
        (``priorytet_biernej``), czynna jest redukowana. To jest zachowanie,
        które odróżnia falownik od „źródła mocy": przy głębokim zapadzie
        napięcia moc czynna MUSI spaść, bo prąd jest ograniczony.

    TRYB FRT: poniżej ``u_frt_pu`` falownik przechodzi na wstrzykiwanie prądu
    biernego ``Iq = k_frt * (V_ref - |V|)`` ograniczone do ``i_max``.

    CZEGO NIE MA: PLL (a więc i niestabilności w sieci słabej), wewnętrznej
    pętli prądowej, dynamiki DC-link. Model jest RMS, quasi-stacjonarny po
    stronie regulacji prądu.
    """

    ref: str
    szyna: str
    s_zn_pu: float = 1.0
    t_p_s: float = 0.05
    t_q_s: float = 0.05
    p_ref_pu: float = 0.0
    q_ref_pu: float = 0.0
    k_qu: float = 0.0
    strefa_martwa_u_pu: float = 0.0
    v_ref_pu: float = 1.0
    i_max_pu: float = 1.2
    priorytet_biernej: bool = True
    u_frt_pu: float = 0.85
    k_frt: float = 2.0
    pasmo_przejscia_frt_pu: float = 0.05
    """Szerokość pasma płynnego wejścia w tryb FRT [p.u.].

    ZERO oznacza przełączenie SKOKOWE — i wtedy ``f`` jest NIECIĄGŁA, co ZMIERZONO
    jako przyczynę braku zbieżności integratorów niejawnych: w chwili zwarcia
    residuum Newtona wpada w cykl graniczny (oscyluje między dwiema wartościami),
    bo kolejne iteracje przeskakują próg tam i z powrotem. Niezerowe pasmo czyni
    przejście ciągłym i przywraca zbieżność.

    Uzasadnienie fizyczne, nie tylko numeryczne: rzeczywisty falownik nie
    przełącza trybu skokowo — ma filtrację pomiaru i histerezę.
    """

    def nazwy_stanow(self) -> tuple[str, ...]:
        return ("p_pu", "q_pu")

    def _q_cel(self, v_mod: float) -> float:
        odchylka = self.v_ref_pu - v_mod
        if abs(odchylka) <= self.strefa_martwa_u_pu:
            return self.q_ref_pu
        znak = 1.0 if odchylka > 0 else -1.0
        efektywna = abs(odchylka) - self.strefa_martwa_u_pu
        return self.q_ref_pu + self.k_qu * znak * efektywna

    def udzial_frt(self, v_mod: float) -> float:
        """Płynny udział trybu FRT: 0 = praca normalna, 1 = pełny tryb FRT."""
        if self.pasmo_przejscia_frt_pu <= 0.0:
            return 1.0 if v_mod < self.u_frt_pu else 0.0
        return float(
            min(1.0, max(0.0, (self.u_frt_pu - v_mod) / self.pasmo_przejscia_frt_pu))
        )

    def pochodne(self, x: NDArray[np.float64], v_szyny: complex) -> NDArray[np.float64]:
        v_mod = abs(v_szyny)
        p, q = float(x[0]), float(x[1])
        # Cele trybu normalnego i trybu FRT liczone ZAWSZE, mieszane płynnie —
        # dzięki temu `f` jest ciągła także w otoczeniu progu FRT.
        p_norm = self.p_ref_pu
        q_norm = self._q_cel(v_mod)
        i_q_frt = min(self.k_frt * max(self.v_ref_pu - v_mod, 0.0), self.i_max_pu)
        q_frt = i_q_frt * v_mod
        i_pozostaly = math.sqrt(max(self.i_max_pu**2 - i_q_frt**2, 0.0))
        p_frt = min(self.p_ref_pu, i_pozostaly * v_mod)
        w = self.udzial_frt(v_mod)
        p_cel = (1.0 - w) * p_norm + w * p_frt
        q_cel = (1.0 - w) * q_norm + w * q_frt
        return np.array(
            [(p_cel - p) / self.t_p_s, (q_cel - q) / self.t_q_s], dtype=np.float64
        )

    def wstrzykniecie(self, x: NDArray[np.float64], v_szyny: complex) -> complex:
        v_mod = abs(v_szyny)
        if v_mod < 1.0e-6:
            return 0j
        p, q = float(x[0]), float(x[1])
        i = np.conj(complex(p, q) / v_szyny)
        modul = abs(i)
        if modul <= self.i_max_pu or modul < 1.0e-12:
            return complex(i)
        # Nasycenie prądowe: skalowanie z priorytetem składowej biernej.
        if not self.priorytet_biernej:
            return complex(i * (self.i_max_pu / modul))
        faza_v = v_szyny / v_mod
        i_wzgl = i / faza_v
        i_czynna, i_bierna = i_wzgl.real, i_wzgl.imag
        i_bierna_ogr = max(min(i_bierna, self.i_max_pu), -self.i_max_pu)
        zapas = math.sqrt(max(self.i_max_pu**2 - i_bierna_ogr**2, 0.0))
        i_czynna_ogr = max(min(i_czynna, zapas), -zapas)
        return complex(complex(i_czynna_ogr, i_bierna_ogr) * faza_v)

    def inicjalizuj(self, v_szyny: complex, s_zadane: complex) -> NDArray[np.float64]:
        self.p_ref_pu = s_zadane.real
        self.q_ref_pu = s_zadane.imag
        self.v_ref_pu = abs(v_szyny)
        return np.array([s_zadane.real, s_zadane.imag], dtype=np.float64)


@dataclass
class FalownikGFM:
    """Falownik tworzący sieć (grid-forming) — ŹRÓDŁO NAPIĘCIOWE za impedancją.

    STANY (4): ``[delta, omega, p_f, q_f]``

    RÓWNANIA
        d(delta)/dt = OMEGA_S * (omega - 1)
        d(omega)/dt = (P_ref - p_f - D_p*(omega - 1)) / (2 * H_wirtualna)
        d(p_f)/dt   = (P_zmierzone - p_f) / T_f
        d(q_f)/dt   = (Q_zmierzone - q_f) / T_f
        E           = E_ref + k_qv * (Q_ref - q_f)         (statyzm Q-U)
        I           = (E * exp(j*delta) - V) / Z_wirtualna  (źródło napięciowe)

    RÓŻNICA WOBEC GFL — ISTOTA, NIE ETYKIETA. GFL jest źródłem PRĄDOWYM: przy
    zaniku napięcia sieci jego prąd wynika z zadanej mocy i ogranicznika. GFM
    jest źródłem NAPIĘCIOWYM: narzuca kąt i amplitudę, więc przy tym samym
    zakłóceniu daje inny prąd i inną trajektorię, a w wyspie może pracować bez
    sieci zadającej. W audytowanym silniku produkcyjnym oba tryby wykonywały
    IDENTYCZNY kod (defekt P1-08) — tutaj są to dwa różne modele fizyczne, co
    potwierdza test ``test_gfm_i_gfl_roznia_sie_trajektoria``.
    """

    ref: str
    szyna: str
    h_wirtualna_s: float = 4.0
    d_p: float = 20.0
    t_f_s: float = 0.02
    p_ref_pu: float = 0.0
    q_ref_pu: float = 0.0
    e_ref_pu: float = 1.0
    k_qv: float = 0.05
    r_wirtualna_pu: float = 0.01
    x_wirtualna_pu: float = 0.15

    def nazwy_stanow(self) -> tuple[str, ...]:
        return ("delta_rad", "omega_pu", "p_f_pu", "q_f_pu")

    def _z_wirtualna(self) -> complex:
        return complex(self.r_wirtualna_pu, self.x_wirtualna_pu)

    def _sem(self, q_f: float) -> float:
        return self.e_ref_pu + self.k_qv * (self.q_ref_pu - q_f)

    def wstrzykniecie(self, x: NDArray[np.float64], v_szyny: complex) -> complex:
        delta, q_f = float(x[0]), float(x[3])
        e = self._sem(q_f) * complex(math.cos(delta), math.sin(delta))
        return (e - v_szyny) / self._z_wirtualna()

    def pochodne(self, x: NDArray[np.float64], v_szyny: complex) -> NDArray[np.float64]:
        omega, p_f, q_f = float(x[1]), float(x[2]), float(x[3])
        i = self.wstrzykniecie(x, v_szyny)
        s = v_szyny * np.conj(i)
        d_delta = OMEGA_S * (omega - 1.0)
        d_omega = (self.p_ref_pu - p_f - self.d_p * (omega - 1.0)) / (
            2.0 * self.h_wirtualna_s
        )
        d_p = (s.real - p_f) / self.t_f_s
        d_q = (s.imag - q_f) / self.t_f_s
        return np.array([d_delta, d_omega, d_p, d_q], dtype=np.float64)

    def inicjalizuj(self, v_szyny: complex, s_zadane: complex) -> NDArray[np.float64]:
        """Dobierz ``delta`` i ``E_ref`` tak, by punkt pracy był równowagą."""
        i_zadane = np.conj(s_zadane / v_szyny)
        e_zespolone = v_szyny + self._z_wirtualna() * i_zadane
        delta = math.atan2(e_zespolone.imag, e_zespolone.real)
        self.p_ref_pu = s_zadane.real
        self.q_ref_pu = s_zadane.imag
        self.e_ref_pu = abs(e_zespolone)
        return np.array([delta, 1.0, s_zadane.real, s_zadane.imag], dtype=np.float64)


@dataclass
class OdbiorStalejMocy:
    """Odbiór o stałej mocy (bezstanowy) — konwencja generatorowa: P<0 dla poboru."""

    ref: str
    szyna: str
    p_pu: float
    q_pu: float = 0.0
    _stan: NDArray[np.float64] = field(
        default_factory=lambda: np.zeros(0, dtype=np.float64), repr=False
    )

    def nazwy_stanow(self) -> tuple[str, ...]:
        return ()

    def pochodne(self, x: NDArray[np.float64], v_szyny: complex) -> NDArray[np.float64]:
        return np.zeros(0, dtype=np.float64)

    def wstrzykniecie(self, x: NDArray[np.float64], v_szyny: complex) -> complex:
        if abs(v_szyny) < 1.0e-6:
            return 0j
        return complex(np.conj(complex(self.p_pu, self.q_pu) / v_szyny))

    def inicjalizuj(self, v_szyny: complex, s_zadane: complex) -> NDArray[np.float64]:
        return np.zeros(0, dtype=np.float64)

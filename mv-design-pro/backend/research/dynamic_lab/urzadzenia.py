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
from dataclasses import dataclass
from typing import Protocol

import numpy as np
from numpy.typing import NDArray

from dynamic_lab.konwencje import OMEGA_S, dq_z_sieci, siec_z_dq
from dynamic_lab.regulatory import RegulatorNapiecia, RegulatorTurbiny
from dynamic_lab.tozsamosc import pole_artefakt, pole_opisowe


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

    def jednostki_stanow(self) -> tuple[str, ...]:
        """Jednostki DEKLAROWANE PRZEZ MODEL — kąt w radianach, reszta w p.u."""
        return ("rad", "p.u.", "p.u.", "p.u.")

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
        d_e_q = (efd_pu - e_q_prim - (self.xd_pu - self.xd_prim_pu) * i_d) / self.td0_prim_s
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
        i_dq = i_net * complex(math.cos(delta - math.pi / 2.0), -math.sin(delta - math.pi / 2.0))
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
    _efd_stale: float = pole_artefakt(
        default=0.0,
        powod=(
            "wartość wyliczona przez `inicjalizuj` z punktu pracy, nie nastawa modelu "
            "— punkt pracy jest osobną osią tożsamości (TozsamoscScenariusza)"
        ),
    )
    _pm_stale: float = pole_artefakt(
        default=0.0,
        powod=(
            "wartość wyliczona przez `inicjalizuj` z punktu pracy, nie nastawa modelu "
            "— punkt pracy jest osobną osią tożsamości (TozsamoscScenariusza)"
        ),
    )

    @property
    def ref(self) -> str:
        return self.maszyna.ref

    @property
    def szyna(self) -> str:
        return self.maszyna.szyna

    def nazwy_stanow(self) -> tuple[str, ...]:
        return (*self.maszyna.nazwy_stanow(), "efd_pu", "pm_pu")

    def jednostki_stanow(self) -> tuple[str, ...]:
        """Jednostki maszyny + regulatorów; składane z deklaracji maszyny."""
        return (*self.maszyna.jednostki_stanow(), "p.u.", "p.u.")

    def pochodne(self, x: NDArray[np.float64], v_szyny: complex) -> NDArray[np.float64]:
        efd = float(x[4])
        pm = float(x[5])
        d_masz = self.maszyna.pochodne_bez_regulatorow(x[:4], v_szyny, pm_pu=pm, efd_pu=efd)
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

    def jednostki_stanow(self) -> tuple[str, ...]:
        return ("p.u.", "p.u.")

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
        return float(min(1.0, max(0.0, (self.u_frt_pu - v_mod) / self.pasmo_przejscia_frt_pu)))

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
        return np.array([(p_cel - p) / self.t_p_s, (q_cel - q) / self.t_q_s], dtype=np.float64)

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


class PunktPracyPozaOgranicznikiemError(RuntimeError):
    """Punkt pracy z rozpływu wymaga prądu większego, niż dopuszcza ogranicznik.

    PO CO. ``SilnikRMS.rozplyw_ustalony`` liczy napięcia PRZY ZAŁOŻENIU, że
    falownik wstrzykuje zadaną moc. Gdyby ogranicznik był aktywny już w punkcie
    pracy, urządzenie wystawiłoby prąd inny niż ten, z którego policzono napięcia:
    start byłby wewnętrznie sprzeczny, a niezerowe ``d(p_f)/dt`` zamieniłoby cały
    przebieg w artefakt rozruchu. Cicha korekta zadania do wartości wykonalnej
    wygląda uprzejmie i jest gorsza — model ODMAWIA startu i podaje, o ile
    przekroczono limit.
    """


class OgranicznikPraduGFM(Protocol):
    """Kontrakt EKSPERYMENTALNEJ strategii ograniczenia prądu falownika GFM.

    PO CO ISTNIEJE. Falownik tworzący sieć jest modelowany jako źródło NAPIĘCIOWE
    za impedancją, więc jego prąd zwarciowy wynika wyłącznie z ``(E − V)/Z_w`` i
    nie zna granicy termicznej zaworów. Zmierzone na sieci DER–MID–SYS (zwarcie
    ``x_f = 0,05`` p.u. na szynie MID, ``P = 0,6`` p.u., RK4, krok 2 ms):
    ``I_max = 2,4425`` p.u. — około dwukrotności wartości osiągalnej dla
    rzeczywistego przekształtnika (typowo 1,1–1,5 p.u.). Dopóki GFM nie ma
    ogranicznika, a GFL ma, porównanie „GFL vs GFM podczas FRT" porównuje
    urządzenie z limitem z urządzeniem bez limitu — czyli nie porównuje strategii.

    GRANICA TEGO KONTRAKTU — nazwana wprost. Strategie za nim są KANDYDATAMI do
    decyzji architektonicznej, nie kanonem: nie są zwalidowane wobec pomiaru na
    sprzęcie ani wobec narzędzia zewnętrznego. Poziom dowodu to własności
    metamorficzne i wyprowadzone kresy (oś W: W1 i W2 dla samego ogranicznika),
    nigdy „tak zachowuje się falownik X producenta Y".

    Ogranicznik dostaje WSZYSTKO, czego może potrzebować (prąd nieograniczony,
    SEM, napięcie szyny, impedancję wirtualną) i zwraca prąd wstrzykiwany. Nie
    ma dostępu do stanu ani do czasu — jest funkcją CZYSTĄ, bo tylko wtedy
    ``pochodne`` pozostają funkcją stanu, a jakobian numeryczny ma sens.
    """

    nazwa: str
    i_max_pu: float

    def prad_ograniczony(
        self,
        *,
        i_bez_ograniczenia: complex,
        sem: complex,
        v_szyny: complex,
        z_wirtualna: complex,
    ) -> complex:
        """Prąd po zadziałaniu strategii [p.u.], konwencja generatorowa."""
        ...

    def kres_pradu_pu(self, z_wirtualna: complex) -> float:
        """Kres górny modułu prądu, jakiego strategia NIGDY nie przekracza.

        Mocne twierdzenie — musi być wyprowadzone i przypięte testem, nie
        zadeklarowane. Dla strategii o limicie miękkim kres jest większy niż
        ``i_max_pu`` i to jest uczciwa informacja o wadzie strategii.
        """
        ...


@dataclass(frozen=True)
class KandydatOgraniczeniaImpedancjaWirtualna:
    """KANDYDAT (eksperyment, nie kanon): ograniczenie przez WZROST impedancji wirtualnej.

    MECHANIZM. Gdy prąd nieograniczony ``I_0 = (E − V)/Z_w`` przekracza ``i_max``,
    do impedancji wirtualnej dokładana jest składowa ``ΔZ`` skierowana WZDŁUŻ
    ``Z_w`` (ten sam stosunek X/R), proporcjonalna do przekroczenia::

        ΔZ = k · (|I_0| − i_max) · Z_w / |Z_w|,        k = ``k_impedancji_pu``
        I  = (E − V) / (Z_w + ΔZ) = I_0 / (1 + a·(|I_0| − i_max)),   a = k / |Z_w|

    Współliniowość ``ΔZ`` z ``Z_w`` jest wyborem, nie przypadkiem: moduł prądu
    maleje BEZ obrotu fazy, więc prąd pozostaje prądem źródła napięciowego za
    większą impedancją, a nie zadaniem prądowym. To odróżnia tę strategię od
    nasycenia zadania — ALE NIE ZNACZY, że sztywność napięciowa zostaje
    zachowana: zmierzona ``|dU/dP|`` na zaciskach rośnie przy aktywnym
    ograniczniku z 0,0253 do 0,0571 p.u./p.u. (``k = 0,10``, zwarcie
    ``x_f = 0,05``), a przy ``k = 0,20`` i ``x_f = 0,01`` sięga 1,081 — czyli
    GORZEJ niż nasycenie zadania (0,168) w tym samym punkcie. Zaleta tej
    strategii jest strukturalna, nie liczbowa, i tylko tak wolno ją nazywać.

    KRES GÓRNY — WYPROWADZONY, NIE ZAŁOŻONY. Dla ``y = |I_0| ≥ i_max``
    ``g(y) = y / (1 + a·(y − i_max))``, więc::

        g'(y) = (1 − a·i_max) / (1 + a·(y − i_max))²

    Znak zależy wyłącznie od iloczynu ``a·i_max``:

      - ``k ≥ |Z_w| / i_max`` → ``g`` nierosnąca → ``|I| ≤ i_max`` (limit TWARDY),
      - ``k < |Z_w| / i_max`` → ``g`` rosnąca do asymptoty ``|Z_w| / k`` (limit
        MIĘKKI: prąd trwale przekracza ``i_max``, tym bardziej im mniejsze ``k``).

    Zwraca to ``kres_pradu_pu``; pinuje
    ``test_kres_gorny_impedancji_wirtualnej_zgadza_sie_z_wyprowadzeniem``.

    WADY (opis wady jest wymogiem, nie uprzejmością):

    1. **Limit bywa miękki.** Przy ``k`` mniejszym od ``|Z_w|/i_max`` strategia nie
       gwarantuje ``i_max`` — dociska prąd asymptotycznie. Dobór ``k`` jest
       decyzją, którą trzeba podjąć jawnie; dlatego ``k_impedancji_pu`` NIE MA
       wartości domyślnej.
    2. **Osłabia sztywność napięciową — i to mocno.** Większa impedancja
       wyjściowa to większy spadek napięcia przy tej samej zmianie obciążenia.
       Zmierzone ``|dU/dP|`` [p.u./p.u.] na zaciskach DER: bez zwarcia 0,0201 dla
       KAŻDEJ strategii (ogranicznik nieaktywny nie zmienia nic), przy
       ``x_f = 0,05`` 0,0253 (bez ogranicznika) → 0,0571 (``k = 0,10``) → 0,0780
       (``k = 0,20``), przy ``x_f = 0,01`` 0,0310 → 0,2016 → 1,081. Pinuje
       ``test_ogranicznik_oslabia_sztywnosc_a_ranking_zalezy_od_glebokosci``.
    3. **Ma załamanie w progu.** ``|I|`` jest ciągłe (różnica ``f`` po obu stronach
       progu maleje LINIOWO z otoczeniem — zmierzone 10,0× na dekadę ``eps``, czyli
       to nachylenie, nie skok), ale pochodna
       jednostronna skacze: zmierzony skok ``d(f)/d(delta)`` na progu wynosi 0,009
       bez ogranicznika, 97,8 przy ``k = 0,10`` i 195,6 przy ``k = 0,20`` (skala
       liniowa w ``k``). Jakobian jest w tym punkcie nieciągły — pinuje
       ``test_ograniczenie_pradu_jest_ciagle_ale_nie_rozniczkowalne``.
    4. **Przy dużym wzmocnieniu WYCOFUJE prąd, zamiast go ograniczać.** Skoro dla
       ``a·i_max > 1`` funkcja ``g`` MALEJE, głębsze zwarcie daje MNIEJSZY prąd:
       zmierzone w środku zwarcia ``x_f = 0,05`` to 0,853 p.u. przy ``k = 0,20``
       (limit 1,2 p.u.), a przy ``k = 1,0`` prąd w zwarciu spada PONIŻEJ
       przedzwarciowego. Realny przekształtnik z ogranicznikiem oddaje prąd do
       wysokości limitu, a nie mniej — duże ``k`` modeluje więc odmowę wsparcia,
       której urządzenie by nie zrobiło. Pinuje
       ``test_wysokie_wzmocnienie_impedancji_wycofuje_prad_zamiast_go_ograniczac``.
    5. **Skraca odporność na długie zwarcie.** Zmierzone przy ``x_f = 0,01``
       (okno 2 s): zwarcie 0,15 s przechodzą wszystkie warianty, ale zwarcie 0,5 s
       kończy się poślizgiem kąta o 503,6° (``k = 0,10``) i 572,7° (``k = 0,20``),
       podczas gdy model BEZ ogranicznika wychyla się tylko o 53,6° i synchronizm
       zachowuje. Mechanizm jest fizyczny: ogranicznik odbiera moc czynną oddawaną
       w zwarciu, więc falownik przyspiesza. Pinuje
       ``test_ogranicznik_skraca_najdluzsze_zwarcie_z_synchronizmem``.
    """

    i_max_pu: float
    """Granica prądowa przekształtnika [p.u.]. BEZ wartości domyślnej: to jest
    wielkość, która rozstrzyga każdy pomiar tego modułu — domyślna byłaby
    zgadywaniem karty katalogowej."""
    k_impedancji_pu: float
    """Wzmocnienie pętli impedancji wirtualnej [p.u. impedancji na p.u. nadmiaru
    prądu]. BEZ wartości domyślnej, bo to ONO rozstrzyga, czy limit jest twardy,
    czy miękki (patrz kres górny wyżej)."""
    nazwa: str = pole_opisowe(
        default="impedancja_wirtualna",
        powod=(
            "etykieta strategii dla człowieka — tożsamość strategii niesie jej KLASA, "
            "która wchodzi do postaci kanonicznej"
        ),
    )

    def __post_init__(self) -> None:
        if self.i_max_pu <= 0.0:
            raise ValueError("i_max_pu musi być > 0")
        if self.k_impedancji_pu <= 0.0:
            raise ValueError(
                "k_impedancji_pu musi być > 0 — zerowe wzmocnienie to ogranicznik, "
                "który niczego nie ogranicza, czyli zaślepka udająca funkcję."
            )

    def prad_ograniczony(
        self,
        *,
        i_bez_ograniczenia: complex,
        sem: complex,
        v_szyny: complex,
        z_wirtualna: complex,
    ) -> complex:
        modul = abs(i_bez_ograniczenia)
        nadmiar = modul - self.i_max_pu
        if nadmiar <= 0.0:
            return i_bez_ograniczenia
        z_modul = abs(z_wirtualna)
        if z_modul < 1.0e-12:
            raise ValueError(
                "Impedancja wirtualna bliska zeru — strategia impedancyjna nie ma "
                "czego zwiększać; użyj nasycenia zadania albo nadaj Z_w wartość."
            )
        return i_bez_ograniczenia / (1.0 + self.k_impedancji_pu * nadmiar / z_modul)

    def kres_pradu_pu(self, z_wirtualna: complex) -> float:
        """Kres górny ``|I|``: ``i_max`` dla limitu twardego, ``|Z_w|/k`` dla miękkiego."""
        z_modul = abs(z_wirtualna)
        if z_modul < 1.0e-12:
            raise ValueError("Impedancja wirtualna bliska zeru — kres nieokreślony")
        a = self.k_impedancji_pu / z_modul
        if a * self.i_max_pu >= 1.0:
            return self.i_max_pu
        return 1.0 / a


@dataclass(frozen=True)
class KandydatOgraniczeniaNasycenieZadania:
    """KANDYDAT (eksperyment, nie kanon): NASYCENIE ZADANIA PRĄDU na okręgu ``i_max``.

    MECHANIZM. Prąd nieograniczony jest rzutowany na okrąg ``|I| = i_max`` w
    układzie związanym z FAZĄ NAPIĘCIA szyny: składowa bierna (prostopadła do
    napięcia) ma pierwszeństwo, składowa czynna dostaje zapas ``√(i_max² − i_b²)``.
    Limit jest TWARDY dla każdej pary ``(E, V)`` — ``kres_pradu_pu`` zwraca
    ``i_max`` bez zastrzeżeń.

    WADY (to jest strategia z twardym limitem, nie strategia lepsza):

    1. **Zmiana charakteru źródła.** W nasyceniu prąd jest zadany co do modułu i
       fazy względem napięcia, więc przestaje zależeć od ``E`` i od modułu ``V``:
       falownik przestaje być źródłem napięciowym i staje się źródłem PRĄDOWYM,
       tracąc zdolność tworzenia napięcia — czyli tę własność, dla której GFM się
       wybiera. Zmierzona sztywność ``|dU/dP|`` przy zwarciu ``x_f = 0,05`` rośnie
       z 0,0253 do 0,0971 p.u./p.u. (3,8×); pinuje
       ``test_ogranicznik_oslabia_sztywnosc_a_ranking_zalezy_od_glebokosci``.
    2. **Najtwardsze załamanie z badanych.** Zmierzony skok pochodnej jednostronnej
       ``d(f)/d(delta)`` na progu wynosi 247,9 wobec 97,8–195,6 dla strategii
       impedancyjnej (i 0,009 bez ogranicznika). Sama ``f`` pozostaje ciągła —
       pinuje ``test_ograniczenie_pradu_jest_ciagle_ale_nie_rozniczkowalne``.
    3. **Zerwane sprzężenie zwrotne kąta — zmierzone, nie postulowane.** Przy
       priorytecie składowej biernej głęboki zapad zabiera CAŁY prąd na składową
       bierną, więc moc czynna spada do zera: zmierzone ``P = 0,0000`` p.u. w
       środku zwarcia ``x_f = 0,05`` (dla porównania 0,171 p.u. przy strategii
       impedancyjnej ``k = 0,10``). Falownik przyspiesza wtedy pełnym
       ``P_ref/2H``: przy zwarciu 0,5 s i ``x_f = 0,01`` bieg się rozjeżdża,
       podczas gdy model bez ogranicznika wychyla kąt tylko o 53,6°. Pinują
       ``test_prad_i_moc_w_srodku_zwarcia_roznia_strategie`` i
       ``test_ogranicznik_skraca_najdluzsze_zwarcie_z_synchronizmem``.
    4. **Łamie algebrę sieci przy zwarciu bliskim metalicznemu.** Źródło prądowe
       wpięte w niemal zerową impedancję zwarcia zostawia napięcie szyny bez
       dobrze uwarunkowanego rozwiązania: Newton sieci przestaje zbiegać poniżej
       ``x_f ≈ 0,00456`` p.u. (bisekcja w teście zawęża próg dla ``i_max = 1,2``
       do przedziału (0,004559; 0,004565) p.u. i pinuje bracket (0,004; 0,005)).
       Próg rośnie z limitem prądowym: przy ``i_max = 0,9`` model zbiega jeszcze
       dla ``x_f = 0,003``, a przy ``i_max = 1,5`` nie zbiega już dla ``x_f = 0,01``.
       Strategia impedancyjna i
       model BEZ ogranicznika liczą się do zwarcia metalicznego ``x_f = 0``
       włącznie. Pinuje
       ``test_zwarcie_bliskie_metalicznemu_lamie_nasycenie_a_nie_impedancje``.
    5. **Utrata synchronizmu objawia się jako AWARIA SOLVERA, nie jako przebieg.**
       Dla zwarcia 0,5 s przy ``x_f = 0,01`` bieg kończy się
       ``BrakZbieznosciSieciError`` w fazie całkowania w ``t = 0,812`` s, czyli
       jeszcze w czasie trwania zwarcia. Model nie mówi „straciłem synchronizm",
       tylko przestaje się liczyć — inżynier dostaje brak wyniku zamiast przebiegu
       poślizgu. To jest granica tej strategii, nie jej cecha; pinuje
       ``test_ogranicznik_skraca_najdluzsze_zwarcie_z_synchronizmem``.

    TA SAMA FIZYKA W TRZECH MIEJSCACH — świadomie i pinowane. Rzut na okrąg z
    priorytetem składowej biernej jest już zaimplementowany w
    ``FalownikGFL.wstrzykniecie`` oraz w ``urzadzenia_oze._ogranicz_prad``. Ta
    klasa jest trzecią kopią tej samej fizyki i **jest to dług** — nazwany, nie
    ukryty. Trzy kopie muszą dawać identyczny wynik dla identycznych danych;
    pinuje to ``test_nasycenie_zadania_zgadza_sie_z_ogranicznikami_gfl_i_oze``
    (ta sama metoda, którą laboratorium przypięło już parę GFL ↔ OZE).
    """

    i_max_pu: float
    """Granica prądowa przekształtnika [p.u.]. BEZ wartości domyślnej — patrz
    uzasadnienie w strategii impedancyjnej."""
    priorytet_biernej: bool = True
    """Która składowa ustępuje przy nasyceniu. ``True`` = pierwszeństwo biernej
    (wsparcie napięcia w czasie zapadu, zgodnie z wymaganiami FRT)."""
    prog_napiecia_pu: float = 1.0e-9
    """Poniżej tego napięcia faza jest nieokreślona i rozkład na składowe nie ma
    odniesienia — wtedy skalowany jest cały wektor prądu.

    Wartość domyślna jest równa ``urzadzenia_oze.PROG_NAPIECIA_PU`` CELOWO, żeby
    trzecia kopia tej fizyki nie zaczęła się różnić właśnie w przypadku brzegowym.
    ``FalownikGFL`` nie ma odpowiednika tej gałęzi w ogóle — poniżej 1e-6 p.u.
    zwraca zerowy prąd, zanim dojdzie do ograniczania. Przypięta równość trzech
    kopii dotyczy więc napięć powyżej 1e-6 p.u. i tylko tyle wolno o niej mówić."""
    nazwa: str = pole_opisowe(
        default="nasycenie_zadania_pradu",
        powod=(
            "etykieta strategii dla człowieka — tożsamość strategii niesie jej KLASA, "
            "która wchodzi do postaci kanonicznej"
        ),
    )

    def __post_init__(self) -> None:
        if self.i_max_pu <= 0.0:
            raise ValueError("i_max_pu musi być > 0")

    def prad_ograniczony(
        self,
        *,
        i_bez_ograniczenia: complex,
        sem: complex,
        v_szyny: complex,
        z_wirtualna: complex,
    ) -> complex:
        modul = abs(i_bez_ograniczenia)
        if modul <= self.i_max_pu or modul < 1.0e-12:
            return i_bez_ograniczenia
        v_modul = abs(v_szyny)
        if v_modul < self.prog_napiecia_pu:
            return i_bez_ograniczenia * (self.i_max_pu / modul)
        faza = v_szyny / v_modul
        wzgledny = i_bez_ograniczenia / faza
        if self.priorytet_biernej:
            i_bierny = max(min(wzgledny.imag, self.i_max_pu), -self.i_max_pu)
            zapas = math.sqrt(max(self.i_max_pu**2 - i_bierny**2, 0.0))
            i_czynny = max(min(wzgledny.real, zapas), -zapas)
        else:
            i_czynny = max(min(wzgledny.real, self.i_max_pu), -self.i_max_pu)
            zapas = math.sqrt(max(self.i_max_pu**2 - i_czynny**2, 0.0))
            i_bierny = max(min(wzgledny.imag, zapas), -zapas)
        return complex(complex(i_czynny, i_bierny) * faza)

    def kres_pradu_pu(self, z_wirtualna: complex) -> float:
        """Limit twardy: rzut na okrąg nie może dać modułu większego niż ``i_max``."""
        return self.i_max_pu


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
        I_0         = (E * exp(j*delta) - V) / Z_wirtualna  (źródło napięciowe)
        I           = ogranicznik(I_0)  albo  I_0, gdy ogranicznika NIE MA

    RÓŻNICA WOBEC GFL — ISTOTA, NIE ETYKIETA. GFL jest źródłem PRĄDOWYM: przy
    zaniku napięcia sieci jego prąd wynika z zadanej mocy i ogranicznika. GFM
    jest źródłem NAPIĘCIOWYM: narzuca kąt i amplitudę, więc przy tym samym
    zakłóceniu daje inny prąd i inną trajektorię, a w wyspie może pracować bez
    sieci zadającej. W audytowanym silniku produkcyjnym oba tryby wykonywały
    IDENTYCZNY kod (defekt P1-08) — tutaj są to dwa różne modele fizyczne, co
    potwierdza test ``test_gfm_i_gfl_roznia_sie_trajektoria``.

    OGRANICZNIK PRĄDU — DOMYŚLNIE WYŁĄCZONY I TO JEST DECYZJA
    ---------------------------------------------------------
    ``ogranicznik = None`` znaczy: model liczy prąd źródła napięciowego bez
    granicy zaworów, czyli tak jak przed dołożeniem tej zdolności. Zmierzone na
    sieci DER–MID–SYS (zwarcie ``x_f = 0,05`` p.u. na MID): ``I_max = 2,4425``
    p.u., wartość NIEFIZYCZNA dla rzeczywistego przekształtnika (typowo
    1,1–1,5 p.u.). Domyślne wyłączenie jest świadome: dzięki temu dołożenie
    ogranicznika nie zmienia ANI JEDNEGO wcześniejszego pomiaru laboratorium, a
    stan „przed" pozostaje odtwarzalny i porównywalny ze stanem „po".
    Konsekwencja: **domyślny ``FalownikGFM`` nadal nie jest modelem realnego
    przekształtnika** i nie wolno go tak przedstawiać.

    Włączenie: ``FalownikGFM(..., ogranicznik=Kandydat...(i_max_pu=1.2, ...))``.
    Obie strategie są KANDYDATAMI (patrz ich docstringi — każda z jawną, ZMIERZONĄ
    wadą); wybór między nimi jest decyzją architektoniczną, a produktem
    laboratorium jest porównanie liczbowe, nie rekomendacja. Zmierzone na
    scenariuszu odniesienia (DER–MID–SYS, ``P = 0,6`` p.u., zwarcie
    ``x_f = 0,05`` p.u. na MID przez 0,15 s, RK4, krok 2 ms, okno 1,0 s)::

        wariant                  I_max    I(0,60 s)  U_min DER  |dU/dP| w zwarciu
        bez ogranicznika         2,4425    2,2120     0,6287     0,0253
        impedancja k = 0,10      1,3801    1,3730     0,5133     0,0571
        impedancja k = 0,20      1,1928    0,8530     0,4430     0,0780
        nasycenie zadania        1,2000    1,2000     0,4897     0,0971

    Żadna strategia nie wygrywa wszędzie: nasycenie daje limit twardy i pełny prąd
    wsparcia, ale najtwardszą nieciągłość, najkrótszą odporność na długie zwarcie
    i brak rozwiązania przy zwarciu bliskim metalicznemu; impedancja wirtualna
    liczy się zawsze i jest gładsza, ale albo przepuszcza prąd ponad limit (małe
    ``k``), albo wycofuje wsparcie poniżej limitu (duże ``k``). Komplet pomiarów
    i sposób ich odtworzenia: ``tests/research/test_gfm_ogranicznik.py``.

    CZEGO TEN MODEL NIE MA — także z ogranicznikiem. Wewnętrznej pętli prądowej i
    jej dynamiki (ograniczenie działa natychmiast, quasi-stacjonarnie), zjawiska
    anti-windup pętli napięciowej, blokady falownika przy przekroczeniu limitu,
    przełączania na tryb podążania za siecią, dynamiki DC-link, ograniczenia
    energii z magazynu, ani asymetrii — laboratorium liczy wyłącznie w składowej
    zgodnej.
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
    ogranicznik: OgranicznikPraduGFM | None = None
    """EKSPERYMENTALNA strategia ograniczenia prądu albo ``None`` (brak granicy)."""
    tozsamosc_ogranicznika: str = pole_artefakt(
        init=False,
        default="brak",
        powod=(
            "pole WYPROWADZONE z obiektu `ogranicznik`, który sam wchodzi do postaci "
            "kanonicznej rekurencyjnie — liczenie go dwa razy niczego nie rozróżnia"
        ),
    )
    """Skalarny opis ogranicznika WYPROWADZONY z obiektu strategii w
    ``__post_init__``.

    PO CO. ``SilnikRMS._tozsamosci`` bierze do odcisku parametrów wyłącznie pola
    skalarne (``int|float|str|bool``), więc tam obiekt ``ogranicznik`` sam z siebie
    do odcisku NIE WCHODZI — dwa biegi z różnymi strategiami miałyby ten sam odcisk
    i porównanie ich straciłoby wartość dowodową (to jest ta sama klasa defektu, co
    „ten sam model policzył co innego, bo zmieniono parametr”). Pole jest
    WYPROWADZONE, nie wpisywane ręcznie, a strategie są niemutowalne
    (``frozen=True``), więc nie może się rozjechać z rzeczywistością.
    Pinuje ``test_tozsamosc_modelu_rozroznia_strategie_ogranicznika``.

    ZAKRES WAŻNOŚCI TEGO OBEJŚCIA. Dotyczy WYŁĄCZNIE odcisku liczonego w
    ``silnik.py``. Tożsamość dowodowa (``tozsamosc.postac_kanoniczna``) schodzi w
    obiekt ``ogranicznik`` rekurencyjnie, więc tam ten skrót jest zbędny i jest
    zadeklarowany jako artefakt — inaczej ta sama informacja wchodziłaby do odcisku
    dwa razy, raz w postaci pełnej, raz w postaci sklejonego łańcucha.
    """

    def __post_init__(self) -> None:
        if self.ogranicznik is None:
            self.tozsamosc_ogranicznika = "brak"
            return
        self.tozsamosc_ogranicznika = (
            f"{self.ogranicznik.nazwa}"
            f"|i_max_pu={self.ogranicznik.i_max_pu!r}"
            f"|kres_pu={self.ogranicznik.kres_pradu_pu(self._z_wirtualna())!r}"
        )

    def nazwy_stanow(self) -> tuple[str, ...]:
        return ("delta_rad", "omega_pu", "p_f_pu", "q_f_pu")

    def jednostki_stanow(self) -> tuple[str, ...]:
        """Kąt wirtualny w radianach; prędkość i moce filtrowane w p.u."""
        return ("rad", "p.u.", "p.u.", "p.u.")

    def _z_wirtualna(self) -> complex:
        return complex(self.r_wirtualna_pu, self.x_wirtualna_pu)

    def _sem(self, q_f: float) -> float:
        return self.e_ref_pu + self.k_qv * (self.q_ref_pu - q_f)

    def sem_zespolona(self, x: NDArray[np.float64]) -> complex:
        """SEM za impedancją wirtualną ``E·exp(j·delta)`` [p.u.] — wielkość mierzalna."""
        delta, q_f = float(x[0]), float(x[3])
        return self._sem(q_f) * complex(math.cos(delta), math.sin(delta))

    def prad_bez_ogranicznika(self, x: NDArray[np.float64], v_szyny: complex) -> complex:
        """Prąd czystego źródła napięciowego ``(E − V)/Z_w`` — PRZED ogranicznikiem.

        Istnieje, żeby dało się zmierzyć, ILE ogranicznik odjął, i żeby test
        progu nie musiał odtwarzać równania modelu u siebie (odtworzenie równania
        w teście sprawdza kopię, nie model).
        """
        return (self.sem_zespolona(x) - v_szyny) / self._z_wirtualna()

    def ogranicznik_aktywny(self, x: NDArray[np.float64], v_szyny: complex) -> bool:
        """Czy w tym punkcie strategia realnie ingeruje w prąd."""
        if self.ogranicznik is None:
            return False
        return abs(self.prad_bez_ogranicznika(x, v_szyny)) > self.ogranicznik.i_max_pu

    def wstrzykniecie(self, x: NDArray[np.float64], v_szyny: complex) -> complex:
        i_0 = self.prad_bez_ogranicznika(x, v_szyny)
        if self.ogranicznik is None:
            return i_0
        return self.ogranicznik.prad_ograniczony(
            i_bez_ograniczenia=i_0,
            sem=self.sem_zespolona(x),
            v_szyny=v_szyny,
            z_wirtualna=self._z_wirtualna(),
        )

    def pochodne(self, x: NDArray[np.float64], v_szyny: complex) -> NDArray[np.float64]:
        omega, p_f, q_f = float(x[1]), float(x[2]), float(x[3])
        i = self.wstrzykniecie(x, v_szyny)
        s = v_szyny * np.conj(i)
        d_delta = OMEGA_S * (omega - 1.0)
        d_omega = (self.p_ref_pu - p_f - self.d_p * (omega - 1.0)) / (2.0 * self.h_wirtualna_s)
        d_p = (s.real - p_f) / self.t_f_s
        d_q = (s.imag - q_f) / self.t_f_s
        return np.array([d_delta, d_omega, d_p, d_q], dtype=np.float64)

    def inicjalizuj(self, v_szyny: complex, s_zadane: complex) -> NDArray[np.float64]:
        """Dobierz ``delta`` i ``E_ref`` tak, by punkt pracy był równowagą.

        Z ogranicznikiem dochodzi warunek WYKONALNOŚCI: prąd punktu pracy musi
        mieścić się pod progiem strategii. Inaczej urządzenie wystawiłoby prąd
        inny niż ten, z którego rozpływ policzył napięcia — patrz
        ``PunktPracyPozaOgranicznikiemError``.
        """
        i_zadane = np.conj(s_zadane / v_szyny)
        if self.ogranicznik is not None and abs(i_zadane) > self.ogranicznik.i_max_pu:
            raise PunktPracyPozaOgranicznikiemError(
                f"{self.ref}: punkt pracy wymaga |I| = {abs(i_zadane):.4f} p.u., a "
                f"ogranicznik „{self.ogranicznik.nazwa}” dopuszcza "
                f"{self.ogranicznik.i_max_pu:.4f} p.u. Rozpływ policzył napięcia dla "
                f"mocy, której to urządzenie nie wystawi — start byłby niespójny."
            )
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
    _stan: NDArray[np.float64] = pole_artefakt(
        default_factory=lambda: np.zeros(0, dtype=np.float64),
        repr=False,
        powod="wektor stanu chwilowego (model bezstanowy — stan pusty), nie parametr",
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

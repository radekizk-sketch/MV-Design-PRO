"""Błąd TRAJEKTORII punkt po punkcie wobec ANDES — domknięcie luki z §5.2.

CO TO ZAMYKA. Pakiet decyzyjny `docs/plan/PAKIET_DECYZYJNY_DYNAMIKA_D01_D13_2026-09.md`
w §5.2 wymienia siedem metryk zgodności z ANDES i przy ostatniej pisze wprost:

    | Błąd trajektorii (punkt po punkcie) | — | **NIE ZMIERZONY** |

z uzasadnieniem: „porównywane są wielkości SKALARNE wyprowadzone z trajektorii, a
nie trajektoria z trajektorią. Porównanie punkt-po-punkcie wymagałoby
wyeksportowania przebiegu z ANDES na wspólnej siatce i nie zostało zrobione."

Ten moduł to robi. Różnica względem istniejących porównań jest zasadnicza:

  * `wzorzec_zewnetrzny.py` i `wzorzec_genrou.py` uruchamiają w ANDES ``PFlow`` i
    ``EIG`` — czyli punkt pracy i WIDMO. Trajektoria nie powstaje w ogóle.
  * Tutaj uruchamiamy ``TDS`` (symulację czasową) po OBU stronach, na tym samym
    zaburzeniu, i porównujemy przebieg z przebiegiem.

Widmo dowodzi, że zgadzają się RÓWNANIA ZLINEARYZOWANE wokół punktu pracy.
Trajektoria po zdarzeniu topologicznym dowodzi dodatkowo, że zgadza się
CAŁKOWANIE, obsługa ZDARZENIA i zachowanie DUŻOSYGNAŁOWE — czyli trzy rzeczy,
których widmo nie dotyka.

ZABURZENIE: WYŁĄCZENIE JEDNEGO Z DWÓCH TORÓW RÓWNOLEGŁYCH. Wybór jest celowy:
  * maszyna zostaje przyłączona (inaczej badalibyśmy utratę synchronizmu, nie
    zgodność modeli),
  * zmiana jest SKOKOWA i czysto topologiczna — bez zwarcia, więc bez różnic w
    modelu bocznika zwarciowego, których ANDES i laboratorium nie muszą dzielić,
  * amplituda wychodzi duża (kilkanaście stopni), czyli poza zakresem, w którym
    wystarczyłaby zgodność małosygnałowa.

Ten przypadek jest zarazem pierwszym w laboratorium, który W OGÓLE wymaga dwóch
gałęzi równoległych — i przy jego budowie wyszedł defekt zamknięty w tej samej
zmianie: wyłączenie „gałęzi GEN–SYS" wyłączało OBA tory naraz.

GRANICE TEGO DOWODU — nazwane, żeby nikt nie rozszerzył wniosku:
  * model: maszyna KLASYCZNA (GENCLS po stronie ANDES), bez regulatorów;
  * zdarzenie: wyłączenie gałęzi; zwarcia NIE obejmuje;
  * wielkości: kąt wirnika i prędkość; napięcia i moce NIE są tu porównywane;
  * zgodność liczbowa zależy od kroku obu narzędzi — dlatego raport podaje kroki.
"""

from __future__ import annotations

import contextlib
import io
import math
from dataclasses import dataclass
from typing import Any

import numpy as np
from numpy.typing import NDArray

from dynamic_lab.benchmarki import maszyna_klasyczna
from dynamic_lab.siec import Galaz, TopologiaSieci
from dynamic_lab.silnik import ModelDynamiczny, SilnikRMS
from dynamic_lab.urzadzenia import ZespolSynchroniczny
from dynamic_lab.wzorzec_zewnetrzny import (
    F_BAZOWA_HZ,
    BrakWzorcaError,
    czy_wzorzec_dostepny,
    wersja_wzorca,
)
from dynamic_lab.zdarzenia import HarmonogramZdarzen, WylaczenieGalezi

#: Tożsamość toru wyłączanego w scenariuszu — ta sama po obu stronach.
IDENT_TORU_WYLACZANEGO = "TOR_B"
IDENT_TORU_POZOSTAJACEGO = "TOR_A"


@dataclass(frozen=True)
class PrzypadekTrajektorii:
    """Wspólna specyfikacja przypadku dla OBU narzędzi.

    Dwa tory po ``x_toru_pu``; po wyłączeniu jednego reaktancja korytarza się
    podwaja, co daje skokową zmianę mocy synchronizującej i wyraźne kołysanie.
    """

    xd_prim_pu: float = 0.30
    h_s: float = 4.0
    d_tlumienie: float = 0.0
    x_toru_pu: float = 0.30
    p_gen_pu: float = 0.50
    v_gen_pu: float = 1.00
    v_sys_pu: float = 1.00
    s_bazowa_mva: float = 100.0
    u_znamionowe_kv: float = 110.0
    czas_wylaczenia_s: float = 1.0
    czas_koncowy_s: float = 4.0

    def __post_init__(self) -> None:
        if not 0.0 < self.czas_wylaczenia_s < self.czas_koncowy_s:
            raise ValueError(
                "Chwila wyłączenia musi leżeć wewnątrz horyzontu symulacji — inaczej "
                "porównywalibyśmy przebiegi bez zaburzenia."
            )

    @property
    def x_korytarza_przed_pu(self) -> float:
        """Dwa tory równolegle."""
        return self.x_toru_pu / 2.0

    @property
    def x_korytarza_po_pu(self) -> float:
        return self.x_toru_pu


@dataclass(frozen=True)
class Przebieg:
    """Przebieg jednej wielkości na własnej siatce czasu."""

    czas_s: NDArray[np.float64]
    wartosci: NDArray[np.float64]
    jednostka: str

    def na_siatce(self, siatka_s: NDArray[np.float64]) -> NDArray[np.float64]:
        """Interpolacja liniowa na WSPÓLNĄ siatkę.

        Interpolacja jest liniowa świadomie: wyższy rząd wygładzałby przebieg i
        mógłby ukryć różnicę tuż po zdarzeniu, czyli dokładnie tam, gdzie
        porównanie jest najbardziej interesujące.
        """
        return np.interp(siatka_s, self.czas_s, self.wartosci)


@dataclass(frozen=True)
class BladKanalu:
    """Błąd punkt-po-punkcie jednej wielkości."""

    nazwa: str
    jednostka: str
    maks_blad_bezwzgledny: float
    sredni_blad_bezwzgledny: float
    rms_bledu: float
    zakres_odniesienia: float
    maks_blad_wzgledny_zakresu: float
    chwila_maks_bledu_s: float

    def to_dict(self) -> dict[str, float | str]:
        return {
            "nazwa": self.nazwa,
            "jednostka": self.jednostka,
            "maks_blad_bezwzgledny": self.maks_blad_bezwzgledny,
            "sredni_blad_bezwzgledny": self.sredni_blad_bezwzgledny,
            "rms_bledu": self.rms_bledu,
            "zakres_odniesienia": self.zakres_odniesienia,
            "maks_blad_wzgledny_zakresu": self.maks_blad_wzgledny_zakresu,
            "chwila_maks_bledu_s": self.chwila_maks_bledu_s,
        }


@dataclass(frozen=True)
class PorownanieTrajektorii:
    """Wynik porównania przebieg-z-przebiegiem, z jawnym zakresem ważności."""

    przypadek: PrzypadekTrajektorii
    wersja_wzorca: str
    krok_wzorca_s: float
    krok_laboratorium_s: float
    liczba_punktow_wspolnych: int
    bledy: tuple[BladKanalu, ...]
    delta0_wzorzec_rad: float
    delta0_laboratorium_rad: float

    @property
    def blad_punktu_pracy_rad(self) -> float:
        """Różnica kątów POCZĄTKOWYCH — osobno od błędu trajektorii.

        Rozdzielenie jest istotne: przesunięty punkt startowy daje stałe
        przesunięcie całej trajektorii, które nie jest błędem całkowania. Gdyby
        obie wielkości siedziały w jednej liczbie, nie dałoby się powiedzieć,
        która warstwa się rozjeżdża.
        """
        return abs(self.delta0_wzorzec_rad - self.delta0_laboratorium_rad)

    def blad(self, nazwa: str) -> BladKanalu:
        for b in self.bledy:
            if b.nazwa == nazwa:
                return b
        raise KeyError(f"Brak kanału „{nazwa}”. Dostępne: {[b.nazwa for b in self.bledy]}")

    def to_dict(self) -> dict[str, Any]:
        return {
            "wersja_wzorca": self.wersja_wzorca,
            "krok_wzorca_s": self.krok_wzorca_s,
            "krok_laboratorium_s": self.krok_laboratorium_s,
            "liczba_punktow_wspolnych": self.liczba_punktow_wspolnych,
            "blad_punktu_pracy_rad": self.blad_punktu_pracy_rad,
            "czas_wylaczenia_s": self.przypadek.czas_wylaczenia_s,
            "x_korytarza_przed_pu": self.przypadek.x_korytarza_przed_pu,
            "x_korytarza_po_pu": self.przypadek.x_korytarza_po_pu,
            "kanaly": [b.to_dict() for b in self.bledy],
        }


# ---------------------------------------------------------------------------
# Wzorzec: ANDES, symulacja CZASOWA
# ---------------------------------------------------------------------------


def _zbuduj_andes(przypadek: PrzypadekTrajektorii, *, krok_s: float) -> Any:
    """SMIB o DWÓCH torach z wyłączeniem jednego — model GENCLS."""
    import andes

    ss = andes.System()
    ss.add(
        "Bus", {"idx": 1, "Vn": przypadek.u_znamionowe_kv, "v0": przypadek.v_gen_pu, "name": "GEN"}
    )
    ss.add(
        "Bus",
        {
            "idx": 2,
            "Vn": przypadek.u_znamionowe_kv,
            "v0": przypadek.v_sys_pu,
            "a0": 0.0,
            "name": "SYS",
        },
    )
    for idx in (1, 2):
        ss.add(
            "Line",
            {
                "idx": idx,
                "bus1": 1,
                "bus2": 2,
                "r": 0.0,
                "x": przypadek.x_toru_pu,
                "b": 0.0,
                "fn": F_BAZOWA_HZ,
                "Sn": przypadek.s_bazowa_mva,
            },
        )
    ss.add(
        "PV",
        {
            "idx": 1,
            "bus": 1,
            "p0": przypadek.p_gen_pu,
            "v0": przypadek.v_gen_pu,
            "Sn": przypadek.s_bazowa_mva,
            "qmax": 99.0,
            "qmin": -99.0,
        },
    )
    ss.add(
        "Slack",
        {
            "idx": 2,
            "bus": 2,
            "v0": przypadek.v_sys_pu,
            "a0": 0.0,
            "Sn": przypadek.s_bazowa_mva,
            "qmax": 99.0,
            "qmin": -99.0,
        },
    )
    ss.add(
        "GENCLS",
        {
            "idx": 1,
            "bus": 1,
            "gen": 1,
            "Sn": przypadek.s_bazowa_mva,
            "fn": F_BAZOWA_HZ,
            "xd1": przypadek.xd_prim_pu,
            "ra": 0.0,
            # ANDES parametryzuje bezwładność przez M = 2H.
            "M": 2.0 * przypadek.h_s,
            "D": przypadek.d_tlumienie,
        },
    )
    # Wyłączenie DRUGIEGO toru — odpowiednik `IDENT_TORU_WYLACZANEGO`.
    ss.add("Toggle", {"model": "Line", "dev": 2, "t": przypadek.czas_wylaczenia_s})

    cisza = io.StringIO()
    with contextlib.redirect_stdout(cisza), contextlib.redirect_stderr(cisza):
        ss.setup()
        if not ss.PFlow.run():
            raise BrakWzorcaError("ANDES: rozpływ mocy nie zbiegł — brak punktu odniesienia")
        ss.TDS.config.tf = przypadek.czas_koncowy_s
        ss.TDS.config.tstep = krok_s
        ss.TDS.init()
        if not ss.TDS.run():
            raise BrakWzorcaError("ANDES: symulacja czasowa nie powiodła się")
    return ss


def przebiegi_wzorca(
    przypadek: PrzypadekTrajektorii, *, krok_s: float
) -> tuple[dict[str, Przebieg], float]:
    """Przebiegi kąta i prędkości z ANDES. Zwraca też ``delta₀``."""
    ss = _zbuduj_andes(przypadek, krok_s=krok_s)
    czas = np.asarray(ss.dae.ts.t, dtype=np.float64)
    stany = np.asarray(ss.dae.ts.x, dtype=np.float64)
    delta = stany[:, ss.GENCLS.delta.a[0]]
    omega = stany[:, ss.GENCLS.omega.a[0]]
    return (
        {
            "delta_rad": Przebieg(czas_s=czas, wartosci=delta, jednostka="rad"),
            "omega_pu": Przebieg(czas_s=czas, wartosci=omega, jednostka="p.u."),
        },
        float(delta[0]),
    )


# ---------------------------------------------------------------------------
# Laboratorium
# ---------------------------------------------------------------------------


def _model_laboratorium(przypadek: PrzypadekTrajektorii) -> ModelDynamiczny:
    topo = TopologiaSieci(
        szyny=("GEN", "SYS"),
        galezie=[
            Galaz(
                "GEN",
                "SYS",
                r_pu=0.0,
                x_pu=przypadek.x_toru_pu,
                ident=IDENT_TORU_POZOSTAJACEGO,
            ),
            Galaz(
                "GEN",
                "SYS",
                r_pu=0.0,
                x_pu=przypadek.x_toru_pu,
                ident=IDENT_TORU_WYLACZANEGO,
            ),
        ],
        szyny_sztywne={"SYS": complex(przypadek.v_sys_pu, 0.0)},
    )
    zespol = ZespolSynchroniczny(
        maszyna=maszyna_klasyczna(
            x_pu=przypadek.xd_prim_pu,
            h_s=przypadek.h_s,
            d_tlumienie=przypadek.d_tlumienie,
        ),
        avr=None,
        governor=None,
    )
    return ModelDynamiczny(topologia=topo, urzadzenia=[zespol], s_bazowa_mva=przypadek.s_bazowa_mva)


def przebiegi_laboratorium(
    przypadek: PrzypadekTrajektorii,
    *,
    q_gen_pu: float,
    krok_s: float,
    integrator: str = "rk4",
) -> tuple[dict[str, Przebieg], float]:
    """Ten sam przypadek i to samo zdarzenie policzone laboratorium.

    ``q_gen_pu`` pochodzi z rozwiązania wzorca — laboratorium nie ma węzła PV,
    więc musi ODTWORZYĆ punkt pracy wzorca z mocy zespolonej. Ta kolejność jest
    celowa: punkt pracy ustala wzorzec, więc zgodność napięcia nie jest
    tautologią.
    """
    model = _model_laboratorium(przypadek)
    silnik = SilnikRMS(model, integrator=integrator, krok_s=krok_s)
    x0 = silnik.inicjalizuj({"G1": complex(przypadek.p_gen_pu, q_gen_pu)})
    harmonogram = HarmonogramZdarzen(
        [
            WylaczenieGalezi(
                czas_s=przypadek.czas_wylaczenia_s,
                ident=IDENT_TORU_WYLACZANEGO,
                opis="wyłączenie jednego z dwóch torów",
            )
        ]
    )
    wynik = silnik.symuluj(x0, czas_koncowy_s=przypadek.czas_koncowy_s, harmonogram=harmonogram)
    czas = np.asarray(wynik.czas_s, dtype=np.float64)
    delta = np.asarray(wynik.sygnal("delta_rad", "G1").wartosci, dtype=np.float64)
    omega = np.asarray(wynik.sygnal("omega_pu", "G1").wartosci, dtype=np.float64)
    return (
        {
            "delta_rad": Przebieg(czas_s=czas, wartosci=delta, jednostka="rad"),
            "omega_pu": Przebieg(czas_s=czas, wartosci=omega, jednostka="p.u."),
        },
        float(delta[0]),
    )


# ---------------------------------------------------------------------------
# Porównanie
# ---------------------------------------------------------------------------


def _blad_kanalu(
    nazwa: str,
    wzorzec: Przebieg,
    laboratorium: Przebieg,
    siatka_s: NDArray[np.float64],
) -> BladKanalu:
    a = wzorzec.na_siatce(siatka_s)
    b = laboratorium.na_siatce(siatka_s)
    roznica = np.abs(a - b)
    zakres = float(np.max(a) - np.min(a))
    indeks_maks = int(np.argmax(roznica))
    return BladKanalu(
        nazwa=nazwa,
        jednostka=wzorzec.jednostka,
        maks_blad_bezwzgledny=float(np.max(roznica)),
        sredni_blad_bezwzgledny=float(np.mean(roznica)),
        rms_bledu=float(np.sqrt(np.mean(roznica**2))),
        zakres_odniesienia=zakres,
        # Odniesienie do ZAKRESU przebiegu, nie do wartości chwilowej: prędkość
        # oscyluje wokół jedności, więc błąd względny liczony punktowo byłby
        # sztucznie mały, a kąt przechodzi blisko zera — tam byłby sztucznie duży.
        maks_blad_wzgledny_zakresu=(
            float(np.max(roznica) / zakres) if zakres > 0.0 else float("inf")
        ),
        chwila_maks_bledu_s=float(siatka_s[indeks_maks]),
    )


def porownaj_trajektorie(
    przypadek: PrzypadekTrajektorii | None = None,
    *,
    krok_wzorca_s: float = 0.001,
    krok_laboratorium_s: float = 0.001,
    integrator: str = "rk4",
    punktow_siatki: int = 2000,
) -> PorownanieTrajektorii:
    """Porównaj przebieg z przebiegiem na wspólnej siatce czasu.

    Siatka wspólna jest RÓWNOMIERNA i zawarta w części wspólnej obu przebiegów —
    ekstrapolacja poza zakres któregokolwiek narzędzia dawałaby błąd metody
    interpolacji, nie błąd modelu.
    """
    if not czy_wzorzec_dostepny():
        raise BrakWzorcaError(
            "ANDES nie jest zainstalowany — porównanie trajektorii NIE zostało wykonane. "
            "To jest brak dowodu, nie jego posiadanie."
        )
    przypadek = przypadek or PrzypadekTrajektorii()

    wzorzec, delta0_wzorzec = przebiegi_wzorca(przypadek, krok_s=krok_wzorca_s)
    ss_q = _moc_bierna_wzorca(przypadek, krok_s=krok_wzorca_s)
    lab, delta0_lab = przebiegi_laboratorium(
        przypadek, q_gen_pu=ss_q, krok_s=krok_laboratorium_s, integrator=integrator
    )

    poczatek = max(wzorzec["delta_rad"].czas_s[0], lab["delta_rad"].czas_s[0])
    koniec = min(wzorzec["delta_rad"].czas_s[-1], lab["delta_rad"].czas_s[-1])
    if not koniec > poczatek:
        raise BrakWzorcaError("Przebiegi nie mają wspólnego zakresu czasu.")
    siatka = np.linspace(poczatek, koniec, punktow_siatki)

    bledy = tuple(
        _blad_kanalu(nazwa, wzorzec[nazwa], lab[nazwa], siatka)
        for nazwa in ("delta_rad", "omega_pu")
    )
    return PorownanieTrajektorii(
        przypadek=przypadek,
        wersja_wzorca=wersja_wzorca(),
        krok_wzorca_s=krok_wzorca_s,
        krok_laboratorium_s=krok_laboratorium_s,
        liczba_punktow_wspolnych=punktow_siatki,
        bledy=bledy,
        delta0_wzorzec_rad=delta0_wzorzec,
        delta0_laboratorium_rad=delta0_lab,
    )


def _moc_bierna_wzorca(przypadek: PrzypadekTrajektorii, *, krok_s: float) -> float:
    """Moc bierna generatora w punkcie pracy WZORCA.

    Liczona ze wzoru sieciowego na rozwiązaniu rozpływu ANDES, a nie zgadywana:
    laboratorium musi odtworzyć TEN punkt pracy, żeby porównanie trajektorii
    zaczynało się z tego samego miejsca.
    """
    import andes  # noqa: F401 - dostępność sprawdzona wyżej

    ss = _zbuduj_andes_tylko_rozplyw(przypadek)
    v_gen = float(ss.Bus.v.v[0])
    a_gen = float(ss.Bus.a.v[0])
    v_sys = float(ss.Bus.v.v[1])
    a_sys = float(ss.Bus.a.v[1])
    x = przypadek.x_korytarza_przed_pu
    # Q wpływająca z szyny GEN do korytarza: (V1² − V1·V2·cos(δ12)) / X
    return (v_gen**2 - v_gen * v_sys * math.cos(a_gen - a_sys)) / x


def _zbuduj_andes_tylko_rozplyw(przypadek: PrzypadekTrajektorii) -> Any:
    """Sam rozpływ — bez symulacji czasowej, do odczytu punktu pracy."""
    import andes

    ss = andes.System()
    ss.add(
        "Bus", {"idx": 1, "Vn": przypadek.u_znamionowe_kv, "v0": przypadek.v_gen_pu, "name": "GEN"}
    )
    ss.add(
        "Bus",
        {
            "idx": 2,
            "Vn": przypadek.u_znamionowe_kv,
            "v0": przypadek.v_sys_pu,
            "a0": 0.0,
            "name": "SYS",
        },
    )
    for idx in (1, 2):
        ss.add(
            "Line",
            {
                "idx": idx,
                "bus1": 1,
                "bus2": 2,
                "r": 0.0,
                "x": przypadek.x_toru_pu,
                "b": 0.0,
                "fn": F_BAZOWA_HZ,
                "Sn": przypadek.s_bazowa_mva,
            },
        )
    ss.add(
        "PV",
        {
            "idx": 1,
            "bus": 1,
            "p0": przypadek.p_gen_pu,
            "v0": przypadek.v_gen_pu,
            "Sn": przypadek.s_bazowa_mva,
            "qmax": 99.0,
            "qmin": -99.0,
        },
    )
    ss.add(
        "Slack",
        {
            "idx": 2,
            "bus": 2,
            "v0": przypadek.v_sys_pu,
            "a0": 0.0,
            "Sn": przypadek.s_bazowa_mva,
            "qmax": 99.0,
            "qmin": -99.0,
        },
    )
    cisza = io.StringIO()
    with contextlib.redirect_stdout(cisza), contextlib.redirect_stderr(cisza):
        ss.setup()
        if not ss.PFlow.run():
            raise BrakWzorcaError("ANDES: rozpływ mocy nie zbiegł.")
    return ss

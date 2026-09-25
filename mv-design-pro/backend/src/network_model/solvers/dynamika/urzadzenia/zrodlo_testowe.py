"""Zrodlo testowe stanowiska badawczego — SEM o zadanym profilu U/f/faza (D-14).

PO CO. Badanie zgodnosci modulu wytworczego (wymogi przylaczenia: odpornosc na zapady,
skoki fazy, rampy czestotliwosci) wymaga sieci, ktora ZADAJE przebieg napiecia,
czestotliwosci i fazy w punkcie przylaczenia (w mandacie: `ComplianceStimulus`). Szyna
sztywna tego nie potrafi — jej SEM jest stala z punktu pracy (`szyna_sztywna.py`), wiec
„narzucona odchylka czestotliwosci szyny sztywnej" nigdy nie byla wykonalna. Zrodlo
testowe jest OSOBNYM urzadzeniem: typowo rozdzielonym od zaklocen fizycznych sieci
(zwarc, laczen) — bieg ze zrodlem testowym jest biegiem trybu `stanowisko`.

STANY (sufiks nazwy niesie jednostke):

* `sem_modul_pu` — amplituda SEM `m`, `dm/dt = sem_modul_tempo_pu_na_s`,
* `sem_modul_tempo_pu_na_s` — tempo amplitudy, pochodna zero,
* `sem_kat_rad` — kat `theta` calkowany z odchylki pulsacji: `dtheta/dt = omega_0 * dw`,
* `sem_przesuniecie_fazy_rad` — przesuniecie fazy `phi` zadawane skokami, pochodna zero,
* `odchylka_pulsacji_pu` — `dw = (f - f_b)/f_b`, `d(dw)/dt = odchylka_pulsacji_tempo_pu_na_s`,
* `odchylka_pulsacji_tempo_pu_na_s` — tempo odchylki, pochodna zero.

SEM: `E = m * exp(j (theta + phi))`. Przesuniecie fazy jest OSOBNYM stanem (a nie skokiem
`theta`), bo skok fazy jest przyrostem wzglednym, a przypisanie stanu — wartoscia
bezwzgledna: `theta` w chwili skoku zalezy od calego wczesniejszego profilu
czestotliwosci, a skumulowana suma skokow fazy `phi` jest znana z samego profilu.

DOKLADNOSC. Rownania sa LINIOWE w stanach, a zadane przebiegi sa wielomianami czasu
stopnia co najwyzej drugiego (amplituda odcinkami liniowa, kat odcinkami kwadratowy):
trapez niejawny i RK4 calkuja je BEZ bledu dyskretyzacji. Rampa jest parą przypisan —
tempo na poczatku, tempo zero na koncu — bez „dociagania" wartosci koncowej: amplituda na
koncu rampy jest calka, a nie przypisaniem (pomiar dokladnosci ma tresc).

IMPEDANCJA. `impedancja_pu` rozna od `None` — SEM za impedancja zastepcza sieci (ta
sama Z_Q, ktora zrodlo podaje zwarciom), sprzezenie Nortona (`pradowe`), prad
`I = (E - V) / Z`. `None` — zrodlo IDEALNE: sprzezenie `napieciowe`, wezel dostaje wiersz
ograniczenia `V = E(x)`, a prad zrodla wyprowadza bilans wezla
(`siec.prad_wezla_ograniczonego`). Profil opisuje zawsze SEM (dla zrodla idealnego SEM
jest napieciem punktu przylaczenia).

AMPLITUDA JEST NIEUJEMNA. `sem_modul_pu` ma ogranicznik `[0, +inf)`: amplituda fazora nie
ma znaku, wiec rampa w dol konczy sie na amplitudzie zerowej (zrodlo oddaje napiecie
zerowe), a nie na „amplitudzie ujemnej", ktora bylaby fazorem przeciwnym. Skok amplitudy
na wartosc ujemna jest odmowa rozwiniecia profilu.

Profil stanowiska rozwija sie na przypisania stanow (`rozwin_profil`) w DOKLADNYCH
chwilach segmentow — rdzen wykonuje je mechanizmem przypisania stanu (karta AB-1b.1
par. 0 pkt 9, 11), ta sama droga co kazde inne przypisanie.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import ClassVar

import numpy as np

from ..kontrakty import (
    KOD_ZDARZENIE_SPRZECZNE,
    WIELKOSCI_NASTAW,
    NastawaRegulacji,
    OdmowaDynamiki,
    PrzypisanieStanu,
    SprzezenieUrzadzenia,
)
from .bazowe import (
    admitancja_wewnetrzna,
    blok_mnozenia_zespolonego,
    jakobian_prad_napiecie_zrodla,
    prad_zrodla_napieciowego,
)

#: Nazwy stanow zrodla testowego — kolejnosc jest czescia kontraktu.
STAN_MODULU = "sem_modul_pu"
STAN_TEMPA_MODULU = "sem_modul_tempo_pu_na_s"
STAN_KATA = "sem_kat_rad"
STAN_PRZESUNIECIA_FAZY = "sem_przesuniecie_fazy_rad"
STAN_ODCHYLKI_PULSACJI = "odchylka_pulsacji_pu"
STAN_TEMPA_ODCHYLKI = "odchylka_pulsacji_tempo_pu_na_s"
NAZWY_STANOW_ZRODLA_TESTOWEGO: tuple[str, ...] = (
    STAN_MODULU,
    STAN_TEMPA_MODULU,
    STAN_KATA,
    STAN_PRZESUNIECIA_FAZY,
    STAN_ODCHYLKI_PULSACJI,
    STAN_TEMPA_ODCHYLKI,
)
_M, _TM, _TH, _PHI, _DW, _TW = range(6)

#: Stany profilu — przypisywalne; kat `theta` NIE (jest calka odchylki pulsacji, a skok
#: fazy idzie przez `sem_przesuniecie_fazy_rad`).
STANY_PROFILU: tuple[str, ...] = (
    STAN_MODULU,
    STAN_TEMPA_MODULU,
    STAN_PRZESUNIECIA_FAZY,
    STAN_ODCHYLKI_PULSACJI,
    STAN_TEMPA_ODCHYLKI,
)


@dataclass(frozen=True)
class ZrodloTestowe:
    """SEM o profilu U/f/faza za impedancja (albo idealna) — parametry w bazie ukladu."""

    ident: str
    wezel: str
    #: Impedancja zrodla [pu bazy ukladu]; `None` = zrodlo idealne (wiersz ograniczenia).
    impedancja_pu: complex | None
    f_bazowa_hz: float

    POLA_POZA_ODCISKIEM: ClassVar[tuple[tuple[str, str], ...]] = ()

    @property
    def sprzezenie(self) -> SprzezenieUrzadzenia:
        """Norton za impedancja (`pradowe`) albo zrodlo idealne (`napieciowe`)."""
        return "napieciowe" if self.impedancja_pu is None else "pradowe"

    @property
    def nazwy_stanow(self) -> tuple[str, ...]:
        return NAZWY_STANOW_ZRODLA_TESTOWEGO

    @property
    def granice_stanow(self) -> tuple[tuple[float, float] | None, ...]:
        """Amplituda nieujemna (ogranicznik `[0, +inf)`); pozostale stany wolne."""
        return ((0.0, math.inf), None, None, None, None, None)

    @property
    def zakresy_waznosci(self) -> tuple[tuple[float, float] | None, ...]:
        """Rownania zrodla testowego sa wazne dla kazdej wartosci stanow (brak zasobu)."""
        return (None, None, None, None, None, None)

    @property
    def stany_bez_rownowagi(self) -> tuple[str, ...]:
        """W t = 0 tempa i odchylka sa zerowe — kazdy stan jest rownowaga."""
        return ()

    @property
    def stany_przypisywalne(self) -> tuple[str, ...]:
        """Stany profilu: amplituda, jej tempo, przesuniecie fazy, odchylka i jej tempo."""
        return STANY_PROFILU

    @property
    def nastawy_regulacji(self) -> tuple[NastawaRegulacji, ...]:
        """Zrodlo testowe nie ma regulatora — profil zadaje stanowisko, nie komenda."""
        return tuple(
            NastawaRegulacji(
                wielkosc=wielkosc,
                stan=None,
                powod_pl="źródło testowe stanowiska nie ma regulatora — przebieg napięcia, "
                "częstotliwości i fazy zadaje profil stanowiska badawczego, a komenda "
                "regulacji dotyczy badanego urządzenia",
                zakres=None,
                mnoznik=1.0,
            )
            for wielkosc in WIELKOSCI_NASTAW
        )

    @property
    def agregat_jednostek(self) -> bool:
        """Zrodlo testowe odwzorowuje siec stanowiska, nie elektrownie z jednostek."""
        return False

    @property
    def omega_bazowa_rad_s(self) -> float:
        """Pulsacja bazowa `omega_0 = 2 pi f_b` [rad/s]."""
        return 2.0 * math.pi * self.f_bazowa_hz

    def parametry_tozsamosci(self) -> dict[str, object]:
        return {
            "ident": self.ident,
            "wezel": self.wezel,
            "impedancja_pu": self.impedancja_pu,
            "f_bazowa_hz": self.f_bazowa_hz,
        }

    def _admitancja(self) -> complex:
        if self.impedancja_pu is None:  # pragma: no cover — strzezone `sprzezenie`
            raise AssertionError("źródło idealne: prąd wyprowadza bilans węzła")
        return admitancja_wewnetrzna(self.impedancja_pu.real, self.impedancja_pu.imag)

    def sem(self, stan: np.ndarray) -> complex:
        """`E = m exp(j (theta + phi))`."""
        kat = float(stan[_TH]) + float(stan[_PHI])
        modul = float(stan[_M])
        return complex(modul * math.cos(kat), modul * math.sin(kat))

    def stan_poczatkowy(self, napiecie_pu: complex, moc_pu: complex) -> np.ndarray:
        """SEM z punktu pracy: `E0 = V + Z conj(S)/conj(V)` (Norton) albo `E0 = V` (idealne)."""
        if self.impedancja_pu is None:
            sem = napiecie_pu
        else:
            prad = moc_pu.conjugate() / napiecie_pu.conjugate()
            sem = napiecie_pu + self.impedancja_pu * prad
        return np.array([abs(sem), 0.0, math.atan2(sem.imag, sem.real), 0.0, 0.0, 0.0])

    def pochodne(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        del napiecie_pu
        pochodne = np.zeros(6, dtype=float)
        pochodne[_M] = float(stan[_TM])
        pochodne[_TH] = self.omega_bazowa_rad_s * float(stan[_DW])
        pochodne[_DW] = float(stan[_TW])
        return pochodne

    def jakobian_stan_stan(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        del stan, napiecie_pu
        jakobian = np.zeros((6, 6), dtype=float)
        jakobian[_M, _TM] = 1.0
        jakobian[_TH, _DW] = self.omega_bazowa_rad_s
        jakobian[_DW, _TW] = 1.0
        return jakobian

    def jakobian_stan_napiecie(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        del stan, napiecie_pu
        return np.zeros((6, 2), dtype=float)

    def napiecie_bez_obciazenia(self, stan: np.ndarray) -> complex:
        """Napiecie jalowe zrodla to jego SEM (przy zerowym pradzie spadek na Z znika)."""
        return self.sem(stan)

    def jakobian_napiecia_bez_obciazenia(self, stan: np.ndarray) -> np.ndarray:
        """∂(Re E, Im E)/∂x: `dE/dm = exp(j psi)`, `dE/dtheta = dE/dphi = j E`."""
        kat = float(stan[_TH]) + float(stan[_PHI])
        modul = float(stan[_M])
        cos_kat, sin_kat = math.cos(kat), math.sin(kat)
        jakobian = np.zeros((2, 6), dtype=float)
        jakobian[0, _M] = cos_kat
        jakobian[1, _M] = sin_kat
        for pozycja in (_TH, _PHI):
            jakobian[0, pozycja] = -modul * sin_kat
            jakobian[1, pozycja] = modul * cos_kat
        return jakobian

    def prad_pu(self, stan: np.ndarray, napiecie_pu: complex) -> complex:
        return prad_zrodla_napieciowego(self.sem(stan), napiecie_pu, self._admitancja())

    def jakobian_prad_napiecie(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        del stan, napiecie_pu
        return jakobian_prad_napiecie_zrodla(self._admitancja())

    def jakobian_prad_stan(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        """`I = (E - V) y` => `dI/dx = y dE/dx` (blok mnozenia przez `y`)."""
        del napiecie_pu
        return blok_mnozenia_zespolonego(
            self._admitancja()
        ) @ self.jakobian_napiecia_bez_obciazenia(stan)


def zbuduj_zrodlo_testowe(
    *, ident: str, wezel: str, impedancja_pu: complex | None, f_bazowa_hz: float
) -> ZrodloTestowe:
    """Zrodlo testowe z impedancja JUZ w bazie ukladu (`None` = zrodlo idealne)."""
    if impedancja_pu is not None:
        admitancja_wewnetrzna(impedancja_pu.real, impedancja_pu.imag)  # zero = odmowa nazwana
    return ZrodloTestowe(
        ident=ident, wezel=wezel, impedancja_pu=impedancja_pu, f_bazowa_hz=f_bazowa_hz
    )


# ---------------------------------------------------------------------------
# Profil stanowiska — segmenty i rozwiniecie na przypisania stanow
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class SkokNapiecia:
    """Amplituda SEM przyjmuje w `t_s` wartosc `u_pu` (skok bezwzgledny)."""

    t_s: float
    u_pu: float


@dataclass(frozen=True)
class RampaNapiecia:
    """Amplituda SEM zmienia sie od `t_s` przez `czas_trwania_s` z tempem `tempo_pu_na_s`."""

    t_s: float
    tempo_pu_na_s: float
    czas_trwania_s: float


@dataclass(frozen=True)
class SkokCzestotliwosci:
    """Czestotliwosc SEM przyjmuje w `t_s` wartosc `f_b + odchylka_hz` (skok bezwzgledny)."""

    t_s: float
    odchylka_hz: float


@dataclass(frozen=True)
class RampaCzestotliwosci:
    """Czestotliwosc SEM zmienia sie od `t_s` przez `czas_trwania_s` z tempem `tempo_hz_na_s`."""

    t_s: float
    tempo_hz_na_s: float
    czas_trwania_s: float


@dataclass(frozen=True)
class SkokFazy:
    """Faza SEM przeskakuje w `t_s` o `kat_deg` (przyrost wzgledem fazy sprzed skoku)."""

    t_s: float
    kat_deg: float


SegmentProfilu = SkokNapiecia | RampaNapiecia | SkokCzestotliwosci | RampaCzestotliwosci | SkokFazy


def _odmowa_profilu(komunikat: str, **szczegoly: object) -> OdmowaDynamiki:
    return OdmowaDynamiki(
        KOD_ZDARZENIE_SPRZECZNE, f"Profil źródła testowego: {komunikat}", **szczegoly
    )


def _sprawdz_liczby(segment: SegmentProfilu) -> None:
    for nazwa, wartosc in vars(segment).items():
        if not math.isfinite(wartosc):
            raise _odmowa_profilu(
                f"pole {nazwa}={wartosc!r} segmentu {type(segment).__name__} nie jest liczbą "
                "skończoną",
                segment=type(segment).__name__,
                pole=nazwa,
            )
    if segment.t_s < 0.0:
        raise _odmowa_profilu(
            f"segment {type(segment).__name__} zaczyna się przed t = 0 (t_s={segment.t_s})",
            segment=type(segment).__name__,
            t_s=segment.t_s,
        )
    if isinstance(segment, RampaNapiecia | RampaCzestotliwosci) and not segment.czas_trwania_s > 0:
        raise _odmowa_profilu(
            f"rampa w t={segment.t_s} s ma czas trwania {segment.czas_trwania_s} s — rampa "
            "trwa dodatnio dlugo (skok zadaje segment skoku)",
            segment=type(segment).__name__,
            t_s=segment.t_s,
        )
    if isinstance(segment, SkokNapiecia) and segment.u_pu < 0.0:
        raise _odmowa_profilu(
            f"skok napięcia w t={segment.t_s} s na amplitude {segment.u_pu} pu — amplituda "
            "fazora nie ma znaku",
            segment="SkokNapiecia",
            t_s=segment.t_s,
        )


def sprawdz_profil(profil: tuple[SegmentProfilu, ...]) -> None:
    """Spojnosc profilu: liczby skonczone, rampy dodatnio dlugie, amplitudy nieujemne i
    BRAK NAKLADANIA segmentow tej samej wielkosci.

    Nakladanie (wielkosc = amplituda albo czestotliwosc): dwa skoki w tej samej chwili,
    skok SCISLE wewnatrz rampy (poczatek i koniec rampy sa dozwolone — skok w chwili
    poczatku rampy ustala wartosc, od ktorej rampa rusza) albo dwie rampy o przecinajacych
    sie przedzialach polotwartych `[t, t + T)`. Kazdy taki profil ma dwie rozne tresci
    („ktory segment wygrywa"), wiec jest odmowa, nie rozstrzygniecie po kolejnosci zapisu.
    Skoki fazy sa przyrostami — dwa w tej samej chwili sumuja sie jednoznacznie.
    """
    for segment in profil:
        _sprawdz_liczby(segment)
    for skoki, rampy, wielkosc in (
        (
            [s for s in profil if isinstance(s, SkokNapiecia)],
            [s for s in profil if isinstance(s, RampaNapiecia)],
            "amplitudy napięcia",
        ),
        (
            [s for s in profil if isinstance(s, SkokCzestotliwosci)],
            [s for s in profil if isinstance(s, RampaCzestotliwosci)],
            "czestotliwosci",
        ),
    ):
        chwile_skokow = [skok.t_s for skok in skoki]
        if len(set(chwile_skokow)) != len(chwile_skokow):
            raise _odmowa_profilu(
                f"dwa skoki {wielkosc} w tej samej chwili — profil nie ma jednej treści",
                wielkosc=wielkosc,
            )
        przedzialy = sorted((rampa.t_s, rampa.t_s + rampa.czas_trwania_s) for rampa in rampy)
        for (poczatek_a, koniec_a), (poczatek_b, _) in zip(
            przedzialy, przedzialy[1:], strict=False
        ):
            if poczatek_b < koniec_a:
                raise _odmowa_profilu(
                    f"rampy {wielkosc} nakladaja się: [{poczatek_a}, {koniec_a}) i rampa od "
                    f"{poczatek_b} s",
                    wielkosc=wielkosc,
                )
        for chwila in chwile_skokow:
            for poczatek, koniec in przedzialy:
                if poczatek < chwila < koniec:
                    raise _odmowa_profilu(
                        f"skok {wielkosc} w t={chwila} s lezy wewnątrz rampy [{poczatek}, "
                        f"{koniec}) — rampa i skok tej samej wielkości w jednej chwili",
                        wielkosc=wielkosc,
                        t_s=chwila,
                    )


def rozwin_profil(
    zrodlo: str, profil: tuple[SegmentProfilu, ...], *, f_bazowa_hz: float
) -> tuple[PrzypisanieStanu, ...]:
    """Profil stanowiska jako przypisania stanow zrodla `zrodlo` w DOKLADNYCH chwilach.

    Jednostki inzynierskie przeliczane tutaj (rdzen, nie adapter): odchylka i tempo
    czestotliwosci dzielone przez `f_b` (odchylka pulsacji w pu), kat w stopniach na
    radiany; przesuniecie fazy przypisywane jako skumulowana suma skokow do danej chwili
    (skok fazy jest przyrostem). Kolejnosc wyniku: po czasie, w chwili — konce ramp
    PRZED poczatkami (rampa konczaca sie w chwili poczatku nastepnej rampy tej samej
    wielkosci nie nadpisuje jej tempa), potem skoki; porzadek jest trescia, bo przypisania
    jednej chwili wykonuja sie w kolejnosci zapisu.
    """
    sprawdz_profil(profil)
    wpisy: list[tuple[float, int, int, str, float]] = []
    for indeks, segment in enumerate(profil):
        if isinstance(segment, SkokNapiecia):
            wpisy.append((segment.t_s, 2, indeks, STAN_MODULU, segment.u_pu))
        elif isinstance(segment, RampaNapiecia):
            wpisy.append((segment.t_s, 1, indeks, STAN_TEMPA_MODULU, segment.tempo_pu_na_s))
            wpisy.append((segment.t_s + segment.czas_trwania_s, 0, indeks, STAN_TEMPA_MODULU, 0.0))
        elif isinstance(segment, SkokCzestotliwosci):
            wpisy.append(
                (segment.t_s, 2, indeks, STAN_ODCHYLKI_PULSACJI, segment.odchylka_hz / f_bazowa_hz)
            )
        elif isinstance(segment, RampaCzestotliwosci):
            wpisy.append(
                (
                    segment.t_s,
                    1,
                    indeks,
                    STAN_TEMPA_ODCHYLKI,
                    segment.tempo_hz_na_s / f_bazowa_hz,
                )
            )
            wpisy.append(
                (segment.t_s + segment.czas_trwania_s, 0, indeks, STAN_TEMPA_ODCHYLKI, 0.0)
            )
        else:
            wpisy.append((segment.t_s, 2, indeks, STAN_PRZESUNIECIA_FAZY, segment.kat_deg))
    wpisy.sort(key=lambda wpis: (wpis[0], wpis[1], wpis[2]))
    przesuniecie_deg = 0.0
    wynik: list[PrzypisanieStanu] = []
    for t_s, _, _, stan, wartosc in wpisy:
        if stan == STAN_PRZESUNIECIA_FAZY:
            przesuniecie_deg += wartosc
            wartosc = math.radians(przesuniecie_deg)
        wynik.append(PrzypisanieStanu(t_s=t_s, urzadzenie=zrodlo, stan=stan, wartosc=wartosc))
    return tuple(wynik)


__all__ = [
    "NAZWY_STANOW_ZRODLA_TESTOWEGO",
    "STANY_PROFILU",
    "STAN_KATA",
    "STAN_MODULU",
    "STAN_ODCHYLKI_PULSACJI",
    "STAN_PRZESUNIECIA_FAZY",
    "STAN_TEMPA_MODULU",
    "STAN_TEMPA_ODCHYLKI",
    "RampaCzestotliwosci",
    "RampaNapiecia",
    "SegmentProfilu",
    "SkokCzestotliwosci",
    "SkokFazy",
    "SkokNapiecia",
    "ZrodloTestowe",
    "rozwin_profil",
    "sprawdz_profil",
    "zbuduj_zrodlo_testowe",
]

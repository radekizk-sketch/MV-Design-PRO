"""Prototypy urządzeń OZE: magazyn z energią, regulator elektrowni, maszyna dwustronnie zasilana.

KOD BADAWCZY — patrz `backend/research/README.md`. Nie jest dowodem regulacyjnym.

PO CO TEN MODUŁ ISTNIEJE
------------------------
Audyt zapisał trzy pozycje jako „do decyzji": magazyn ze stanem energii (D-07),
regulator elektrowni (PPC) oraz turbina wiatrowa typu 3 (D-12). Zapis „nie
wiadomo" nie jest stanem wiedzy — jest jego brakiem. Ten moduł zamienia trzy
„nie wiadomo" w trzy ZMIERZONE modele o jawnie wypisanych granicach: nie ustanawia
architektury produkcyjnej, tylko pokazuje, ile fizyki trzeba, żeby deklarowana
zdolność przestała być deklaracją.

DLACZEGO SAM STAN ENERGII JEST TU SEDNEM. Zdolność „LFSM-U" (wsparcie
częstotliwości przy niedomiarze mocy) bez modelu energii jest DEKLARACJĄ, a nie
zdolnością: magazyn bez SOC wspiera częstotliwość w nieskończoność, więc każdy
scenariusz wypada pozytywnie, niezależnie od tego, czy w ogniwach jest energia.
Dopiero równanie SOC sprawia, że wynik może wypaść NEGATYWNIE — i to jest cała
różnica między modelem a atrapą.

WSPÓLNE GRANICE WSZYSTKICH MODELI W TYM PLIKU
---------------------------------------------
- symulacja RMS w składowej ZGODNEJ: brak składowych przeciwnej i zerowej, więc
  brak zwarć niesymetrycznych i brak niesymetrii obciążenia,
- brak dynamiki obwodu pośredniczącego DC i brak modelu chłodzenia/ograniczeń
  termicznych zależnych od czasu (ograniczniki są chwilowe, nie całkowe),
- parametry podawane są w p.u. NA BAZIE SIECI (przeliczenie z bazy urządzenia
  wykonuje wołający przez `konwencje.BazyMocy` — cicha zmiana bazy jest klasycznym
  źródłem wyników wyglądających wiarygodnie i fizycznie błędnych),
- czas w sekundach, konwencja znaku GENERATOROWA (P > 0 = oddawanie do sieci).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import ClassVar, Protocol

import numpy as np
from numpy.typing import NDArray

from dynamic_lab.calkowanie import OgraniczenieStanu
from dynamic_lab.konwencje import (
    F_BAZOWA_HZ,
    OMEGA_S,
    PROG_NAPIECIA_PU,
    ogranicz_do_przedzialu,
    ogranicz_okregiem,
    ogranicz_prad,
)
from dynamic_lab.siec import Bocznik, TopologiaSieci
from dynamic_lab.tozsamosc import pole_nastawa


def _sprawdz_wykonalnosc_punktu_pracy(
    ref: str, s_zadane: complex, p_osiagalne: float, q_osiagalne: float, powod: str
) -> None:
    """Punkt pracy z rozpływu MUSI być wykonalny — inaczej start jest niespójny.

    PO CO TO ISTNIEJE (własność zmierzona, nie ostrożnościowa). ``rozplyw_ustalony``
    liczy napięcia PRZY ZAŁOŻENIU, że urządzenie wstrzykuje zadaną moc. Jeżeli
    urządzenie tej mocy nie wystawi — bo ogranicza je okrąg falownika, okno SOC albo
    limit eksportu — to napięcia z rozpływu opisują sieć, której nie ma, a wszystko,
    co z nich wyprowadzimy (kąty, punkty pracy pozostałych urządzeń, stan pętli
    synchronizacji), jest liczone w złym punkcie.

    Cicha korekta zadania do wartości wykonalnej wygląda uprzejmie i jest gorsza:
    zamienia BŁĄD DANYCH w niezauważalne przesunięcie punktu pracy. Model z pętlą
    synchronizacji wykrywa to i tak — startuje z rozsynchronizowaną fazą, więc silnik
    odrzuca punkt jako nierównowagowy, tyle że z komunikatem, który nie wskazuje
    przyczyny. Dlatego przyczyna jest zgłaszana tutaj, w miejscu, w którym jest znana.
    """
    osiagalne = complex(p_osiagalne, q_osiagalne)
    if abs(osiagalne - s_zadane) <= 1.0e-9:
        return
    raise ValueError(
        f"{ref}: rozpływ zakłada wstrzyknięcie {s_zadane:.4f} p.u., a urządzenie wystawi "
        f"{osiagalne:.4f} p.u. ({powod}). Punkt startowy byłby niespójny z siecią — "
        "zadaj moc wykonalną albo zmień zdolności urządzenia."
    )


@dataclass(frozen=True)
class PetlaSynchronizacjiPLL:
    """Pętla synchronizacji fazowej (SRF-PLL) — JEDYNE źródło pomiaru częstotliwości.

    PO CO. Protokół urządzenia dostaje od sieci wyłącznie NAPIĘCIE ZESPOLONE.
    Falownik nie ma dostępu do prędkości maszyn ani do żadnej globalnej
    „częstotliwości układu" — i tak jest w rzeczywistości: przekształtnik zna
    częstotliwość tylko tyle, ile zmierzy jego PLL. Wzięcie ``omega`` z maszyny
    byłoby wielkością, której urządzenie fizycznie nie ma (dokładnie defekt P0-05
    audytu, gdzie regulator czytał prędkość ze słownika stałych).

    RÓWNANIA (dwa stany: ``theta_pll``, ``omega_pll``)
        e            = sin(arg(V) - theta_pll)          (błąd fazy, znormalizowany)
        d(theta)/dt  = OMEGA_S * (omega_pll - 1 + k_p * e)
        d(omega)/dt  = k_i * e

    Linearyzacja daje ``s² + OMEGA_S·k_p·s + OMEGA_S·k_i = 0``, więc nastawy
    wyprowadzamy z pasma i tłumienia, a nie zgadujemy:
        k_p = 2·ζ·ω_n / OMEGA_S,   k_i = ω_n² / OMEGA_S,   ω_n = 2π·pasmo_hz.

    GRANICE. Model jest małosygnałowo poprawny i lokuje się w stanie ustalonym z
    ``e = 0``; NIE modeluje: utraty synchronizacji przy głębokim zapadzie
    (przy ``|V| < PROG`` błąd jest zamrażany, czyli PLL utrzymuje ostatnią
    częstotliwość), niesymetrii (brak składowej przeciwnej), filtracji
    wstępnej ani ograniczeń szybkości nadążania.
    """

    pasmo_hz: float = 10.0
    tlumienie: float = 0.7

    def __post_init__(self) -> None:
        if self.pasmo_hz <= 0.0:
            raise ValueError("pasmo_hz musi być > 0")
        if self.tlumienie <= 0.0:
            raise ValueError("tlumienie musi być > 0")

    @property
    def omega_wlasna_rad_s(self) -> float:
        return 2.0 * math.pi * self.pasmo_hz

    @property
    def k_p(self) -> float:
        return 2.0 * self.tlumienie * self.omega_wlasna_rad_s / OMEGA_S

    @property
    def k_i(self) -> float:
        return self.omega_wlasna_rad_s**2 / OMEGA_S

    def blad_fazy(self, v_szyny: complex, theta_pll_rad: float) -> float:
        """``sin(arg(V) - theta)`` — znormalizowana składowa prostopadła napięcia."""
        v_mod = abs(v_szyny)
        if v_mod < PROG_NAPIECIA_PU:
            return 0.0
        obrot = complex(math.cos(theta_pll_rad), -math.sin(theta_pll_rad))
        return float((v_szyny * obrot).imag / v_mod)

    def pochodne(
        self, theta_pll_rad: float, omega_pll_pu: float, v_szyny: complex
    ) -> tuple[float, float]:
        """``(d(theta)/dt, d(omega_pll)/dt)`` przy zmierzonym napięciu szyny."""
        e = self.blad_fazy(v_szyny, theta_pll_rad)
        return (
            OMEGA_S * (omega_pll_pu - 1.0 + self.k_p * e),
            self.k_i * e,
        )

    def stan_poczatkowy(self, v_szyny: complex) -> tuple[float, float]:
        """Zsynchronizowany punkt startowy: ``theta = arg(V)``, ``omega = 1`` → ``e = 0``."""
        return math.atan2(v_szyny.imag, v_szyny.real), 1.0


@dataclass(frozen=True)
class SkokObciazeniaBocznikowego:
    """Skokowe dołączenie obciążenia bocznikowego — zdarzenie WYWOŁUJĄCE odchyłkę f.

    PO CO OSOBNY TYP. `zdarzenia.py` ma wyłącznie zdarzenia zwarciowe i łączeniowe.
    Aby zbadać wsparcie częstotliwości, potrzebna jest NIERÓWNOWAGA MOCY CZYNNEJ,
    a nie zwarcie. Nazwanie skoku obciążenia „zwarciem przez rezystancję" dałoby
    poprawną liczbę i FAŁSZYWY ślad: pole ``zdarzenia[].typ`` w wyniku niesie nazwę
    klasy, więc scenariusz bilansowy zapisałby się jako zwarcie.

    ``g_pu`` to konduktancja dołączanego odbioru w p.u. bazy sieci; pobór mocy
    czynnej wynosi ``g_pu * |U|²``, czyli ZALEŻY OD NAPIĘCIA (model impedancyjny).
    Ujemna konduktancja jest odrzucana: byłaby źródłem mocy udającym odbiór.
    """

    czas_s: float
    szyna: str
    g_pu: float
    b_pu: float = 0.0
    priorytet: int = 15
    opis: str = "skok obciążenia bocznikowego"

    def __post_init__(self) -> None:
        if self.g_pu < 0.0:
            raise ValueError(
                "g_pu < 0 opisywałoby ŹRÓDŁO mocy czynnej podane jako obciążenie — "
                "to fabrykacja, a nie skok obciążenia."
            )

    def zastosuj(self, topologia: TopologiaSieci) -> TopologiaSieci:
        return topologia.z_bocznikiem(Bocznik(szyna=self.szyna, g_pu=self.g_pu, b_pu=self.b_pu))


class JednostkaSterowana(Protocol):
    """Moduł wytwórczy przyjmujący zadanie P/Q Z ZEWNĄTRZ (z regulatora elektrowni).

    Kontrakt jest CELOWO inny niż `urzadzenia.UrzadzenieDynamiczne`: nie ma metody
    ``pochodne(x, v)``, bo jednostka bez zadania nie ma czego liczyć. Zadanie
    wchodzi ARGUMENTEM, a nie polem obiektu — dokładnie tak, jak
    `MaszynaSynchroniczna4Rzedu.pochodne_bez_regulatorow` przyjmuje ``Pm`` i ``Efd``
    od zespołu. Dzięki temu nie istnieje ścieżka, w której jednostka liczy ze
    „starym" zadaniem zapisanym w polu, a regulator myśli, że wysłał nowe;
    nie istnieje też ukryty stan psujący czystość ``f(x)`` przy metodach niejawnych.
    """

    ref: str
    s_zn_pu: float

    def nazwy_stanow(self) -> tuple[str, ...]: ...

    def pochodne_ze_zadaniem(
        self,
        x: NDArray[np.float64],
        v_szyny: complex,
        *,
        p_zadane_pu: float,
        q_zadane_pu: float,
    ) -> NDArray[np.float64]: ...

    def wstrzykniecie(self, x: NDArray[np.float64], v_szyny: complex) -> complex: ...

    def inicjalizuj(self, v_szyny: complex, s_zadane: complex) -> NDArray[np.float64]: ...


@dataclass
class JednostkaSterowanaPQ:
    """Moduł przekształtnikowy sterowany z PPC — źródło prądowe P/Q z ogranicznikiem.

    STANY (2): ``[p_wyjscia_pu, q_wyjscia_pu]`` — moc ZADANA na wyjściu modułu,
    z filtrem 1. rzędu odwzorowującym skończoną szybkość regulacji.
    Nazwy stanów są rozłączne z kluczami przebiegów silnika — patrz uwaga
    o kolizji kluczy w `MagazynEnergiiBESS`.

    RÓWNANIA
        (P_zad, Q_zad) → okrąg |S| <= s_zn_pu  → (P_cel, Q_cel)
        dP/dt = (P_cel - P)/T_p,   dQ/dt = (Q_cel - Q)/T_q
        I     = conj((P + jQ)/V),  |I| <= krotnosc_pradu_max * s_zn_pu

    Ogranicznik prądowy jest wyrażony jako KROTNOŚĆ prądu znamionowego modułu,
    a nie jako wartość w p.u. bazy sieci — inaczej moduł o mocy 0,3 p.u. dostałby
    ogranicznik 1,2 p.u. bazy sieci, czyli czterokrotność własnej mocy.

    CZEGO NIE MA: trybu FRT (przełączenia na priorytet biernej przy zapadzie —
    ten ma `urzadzenia.FalownikGFL`), PLL, dynamiki DC, ograniczeń energii
    (jednostka jest źródłem bezpamięciowym; magazyn to `MagazynEnergiiBESS`).
    """

    ref: str
    s_zn_pu: float
    t_p_s: float = 0.05
    t_q_s: float = 0.05
    krotnosc_pradu_max: float = 1.2
    priorytet_biernej: bool = True

    def __post_init__(self) -> None:
        if self.s_zn_pu <= 0.0:
            raise ValueError(f"{self.ref}: s_zn_pu musi być > 0")
        if self.t_p_s <= 0.0 or self.t_q_s <= 0.0:
            raise ValueError(f"{self.ref}: stałe czasowe muszą być > 0")
        if self.krotnosc_pradu_max <= 0.0:
            raise ValueError(f"{self.ref}: krotnosc_pradu_max musi być > 0")

    @property
    def i_max_pu(self) -> float:
        """Ogranicznik prądu w p.u. BAZY SIECI (wyprowadzony z mocy modułu)."""
        return self.krotnosc_pradu_max * self.s_zn_pu

    def nazwy_stanow(self) -> tuple[str, ...]:
        return ("p_wyjscia_pu", "q_wyjscia_pu")

    def jednostki_stanow(self) -> tuple[str, ...]:
        return ("p.u.", "p.u.")

    def pochodne_ze_zadaniem(
        self,
        x: NDArray[np.float64],
        v_szyny: complex,
        *,
        p_zadane_pu: float,
        q_zadane_pu: float,
    ) -> NDArray[np.float64]:
        p_cel, q_cel = ogranicz_okregiem(
            p_zadane_pu, q_zadane_pu, self.s_zn_pu, priorytet_biernej=self.priorytet_biernej
        )
        p, q = float(x[0]), float(x[1])
        return np.array([(p_cel - p) / self.t_p_s, (q_cel - q) / self.t_q_s], dtype=np.float64)

    def ograniczniki_stanu(self, przesuniecie: int) -> tuple[OgraniczenieStanu, ...]:
        """Niezmienniki dyskretne stanów ``p_wyjscia_pu`` (0) i ``q_wyjscia_pu`` (1).

        Kwadrat ``[-s_zn, s_zn]^2`` jest zbiorem niezmienniczym przepływu ścisłego,
        bo cel obu torów przechodzi przez `ogranicz_okregiem` (uzasadnienie tam).
        """
        return (
            OgraniczenieStanu(
                indeks=przesuniecie + 0,
                dol=-self.s_zn_pu,
                gora=self.s_zn_pu,
                nazwa="p_wyjscia_pu",
                znaczenie=(
                    "moc czynna wystawiana przez moduł przekształtnikowy [p.u.]: "
                    "ograniczona mocą pozorną modułu (okrąg |S| <= s_zn_pu)"
                ),
            ),
            OgraniczenieStanu(
                indeks=przesuniecie + 1,
                dol=-self.s_zn_pu,
                gora=self.s_zn_pu,
                nazwa="q_wyjscia_pu",
                znaczenie=(
                    "moc bierna wystawiana przez moduł przekształtnikowy [p.u.]: "
                    "ograniczona mocą pozorną modułu (okrąg |S| <= s_zn_pu)"
                ),
            ),
        )

    def wstrzykniecie(self, x: NDArray[np.float64], v_szyny: complex) -> complex:
        if abs(v_szyny) < PROG_NAPIECIA_PU:
            return 0j
        i = complex(np.conj(complex(float(x[0]), float(x[1])) / v_szyny))
        return ogranicz_prad(i, v_szyny, self.i_max_pu, priorytet_biernej=self.priorytet_biernej)

    def inicjalizuj(self, v_szyny: complex, s_zadane: complex) -> NDArray[np.float64]:
        p0, q0 = ogranicz_okregiem(
            s_zadane.real, s_zadane.imag, self.s_zn_pu, priorytet_biernej=self.priorytet_biernej
        )
        _sprawdz_wykonalnosc_punktu_pracy(
            self.ref, s_zadane, p0, q0, f"moc pozorna modułu {self.s_zn_pu:.3f} p.u."
        )
        return np.array([p0, q0], dtype=np.float64)


@dataclass
class MagazynEnergiiBESS:
    """Magazyn energii ze STANEM NAŁADOWANIA — moc czynna ograniczona ENERGIĄ.

    STANY (5): ``[p_wyjscia_pu, q_wyjscia_pu, soc, theta_pll_rad, omega_pll_pu]``
      - ``p_wyjscia_pu``, ``q_wyjscia_pu``  moc ZADANA na wyjściu (filtr 1. rzędu),
      - ``soc``                             stan naładowania, 0…1 (bezwymiarowy),
      - dwa ostatnie                        stan pętli synchronizacji (pomiar f).

    NAZWY STANÓW SĄ ROZŁĄCZNE Z KLUCZAMI PRZEBIEGÓW — i to nie jest kosmetyka.
    `SilnikRMS._zapisz_probki` zapisuje pod kluczem ``p_pu@ref`` moc FAKTYCZNIE
    wstrzykniętą, a osobno każdy stan pod jego własną nazwą. Model, którego stan
    nazywa się ``p_pu`` (tak ma `urzadzenia.FalownikGFL`), wysyła więc do zbieracza
    DWIE wielkości o tej samej nazwie: moc zadaną i moc oddaną, które przy nasyceniu
    prądowym się rozjeżdżają. Tutaj stan nazywa się inaczej, więc ``p_pu@ref`` jest
    jednoznacznie mocą oddaną.

    AKTUALIZACJA (pakiet B audytu): zbieracz został naprawiony —
    `wynik.ZbieraczPrzebiegow` kluczuje na TRÓJCE ``(przestrzeń, klucz, ref)``
    i odrzuca kolizję (`KolizjaSygnaluError`) zamiast mieszać serie. Rozłączne
    nazwy stanów pozostają dobrą praktyką (czytelność `state.p_pu` vs
    `output.p_pu`), ale nie są już JEDYNĄ ochroną. Poprzednia redakcja tego
    akapitu kończyła się zdaniem „Naprawa samego zbieracza należy do `silnik.py`"
    — było prawdziwe, gdy je pisano, i przestało być po naprawie.

    RÓWNANIA
        f_zmierzona = F_BAZOWA_HZ * omega_pll            (wyjście CAŁKUJĄCE PLL)
        ΔP_f  = -(Δf_poza_strefą / F_BAZOWA_HZ) / statyzm_f * s_falownika_pu
        P_żąd = P_zad + ΔP_f
        P_cel = P_żąd * dostępność_energii(soc)          (patrz niżej)
        (P_cel, Q_cel) ograniczone OKRĘGIEM |S| <= s_falownika_pu
        dP/dt = (P_cel - P)/T_p,  dQ/dt = (Q_cel - Q)/T_q
        d(soc)/dt = -P_rzeczywiste * s_bazowa_mva / (3600 * e_pojemnosc_mwh)

    ZNAK SOC. Konwencja generatorowa: ``P > 0`` to ROZŁADOWANIE, więc ``soc``
    maleje. Mnożnik ``s_bazowa_mva`` przelicza p.u. na MW, dzielnik ``3600``
    przelicza MWh na MWs. ``P_rzeczywiste`` to moc PO ograniczniku prądowym
    (liczona z faktycznie wstrzykniętego prądu), a nie moc zadana — inaczej przy
    zapadzie napięcia magazyn rozładowywałby energię, której nie oddał.

    OGRANICZENIE ENERGIĄ (to jest sedno modelu)
        dostępność rozładowania = clamp((soc - soc_min)/pasmo_soc, 0, 1)
        dostępność ładowania    = clamp((soc_max - soc)/pasmo_soc, 0, 1)
    Pasmo przejścia jest niezerowe świadomie: skokowe odcięcie czyni ``f``
    nieciągłą, a nieciągłość ``f`` wywraca zbieżność metod niejawnych — to samo
    zjawisko, które w `FalownikGFL` wymusiło pasmo przejścia trybu FRT. Fizycznie
    też nic nie przełącza się skokowo: system zarządzania baterią zmniejsza moc
    przy zbliżaniu się do granicy okna pracy.

    OGRANICZENIE MOCĄ FALOWNIKA: OKRĄG ``|S| <= s_falownika_pu`` — uzasadnienie
    przy `ogranicz_okregiem`. Dodatkowo ogranicznik PRĄDU (``krotnosc_pradu_max``),
    bo przy zapadzie napięcia ta sama moc wymaga większego prądu.

    RÓWNOWAGA — ISTOTNE I NIEOCZYWISTE. Magazyn oddający moc nie jest w równowadze
    ENERGETYCZNEJ: ``d(soc)/dt != 0``. Dla ``P = 0.5`` p.u. przy 100 MVA i 10 MWh
    jest to 1,4e-3 1/s, czyli o trzy rzędy więcej niż tolerancja równowagi silnika.

    KOREKTA (pakiet D audytu). Poprzednia redakcja tego akapitu kończyła się
    zdaniem „`SilnikRMS` odrzuca taki punkt startowy — i tak ma być", a test
    pinował to jako zachowanie zamierzone. To było BŁĘDNE: normalnym punktem pracy
    magazynu jest praca z niezerową mocą, a symulacja krótkookresowa musi móc od
    niego wystartować. Dryf zapasu energii nie jest brakiem równowagi
    elektromechanicznej — jest bilansem energii.

    Rozstrzygnięcie: ``soc`` jest zadeklarowany jako STAN ZASOBOWY
    (``stany_zasobowe``), więc nie wchodzi do warunku ``||f_szybkie|| = 0``, a jego
    pochodna jest raportowana OSOBNO (``SilnikRMS.norma_pochodnej_zasobowej``).
    Równowagi wymagają nadal WSZYSTKIE stany szybkie: tor P/Q i PLL. Nie jest to
    podniesienie tolerancji — tolerancja stanów szybkich pozostaje bez zmian, a
    magazyn oddający moc przy niezbieżnym PLL nadal zostanie odrzucony.

    CZEGO TEN MODEL NIE MA (jawnie): sprawności ładowania/rozładowania i strat
    falownika (SOC całkuje moc na zaciskach AC, nie energię ogniw), samorozładowania,
    zależności mocy dyspozycyjnej od SOC i temperatury, degradacji, modelu napięcia
    ogniwa i prądu DC, trybu FRT z przełączeniem priorytetu, pracy wyspowej w trybie
    tworzenia sieci (to jest źródło PRĄDOWE — odpowiednikiem napięciowym jest
    `urzadzenia.FalownikGFM`).
    """

    ref: str
    szyna: str
    e_pojemnosc_mwh: float
    """Pojemność energetyczna [MWh] — BEZ wartości domyślnej, bo domyślna pojemność
    magazynu jest zgadywaniem wielkości, która rozstrzyga wynik testu wsparcia."""
    s_bazowa_mva: float
    """Baza mocy SIECI [MVA]. Musi być równa `ModelDynamiczny.s_bazowa_mva` —
    równanie SOC jest jedynym miejscem w laboratorium, gdzie p.u. spotyka się z
    jednostkami mianowanymi, więc baza nie może być domyślna."""
    s_falownika_pu: float = 1.0
    soc_poczatkowy: float = 0.5
    soc_min: float = 0.1
    soc_max: float = 0.9
    pasmo_soc: float = 0.02
    t_p_s: float = 0.05
    t_q_s: float = 0.05
    statyzm_f: float = 0.05
    """Statyzm częstotliwościowy (0,05 = 5 %): odchyłka 5 % f_n wysterowuje
    100 % mocy falownika."""
    strefa_martwa_f_hz: float = 0.2
    f_odniesienia_hz: float = F_BAZOWA_HZ
    krotnosc_pradu_max: float = 1.2
    priorytet_biernej: bool = False
    """Domyślnie priorytet MOCY CZYNNEJ: usługą magazynu jest energia. Wartość jest
    STAŁA — model nie ma trybu FRT przełączającego priorytet przy zapadzie."""
    pll: PetlaSynchronizacjiPLL = field(default_factory=PetlaSynchronizacjiPLL)
    p_ref_pu: float = pole_nastawa(
        default=0.0,
        powod=(
            "moc czynna zadana magazynu — wyliczana przez `inicjalizuj` z punktu pracy rozpływu, więc NIE jest "
            "definicją urządzenia; wchodzi do tożsamości BIEGU jako nastawa punktu "
            "pracy, nie do tożsamości MODELU"
        ),
    )
    q_ref_pu: float = pole_nastawa(
        default=0.0,
        powod=(
            "moc bierna zadana magazynu — wyliczana przez `inicjalizuj` z punktu pracy rozpływu, więc NIE jest "
            "definicją urządzenia; wchodzi do tożsamości BIEGU jako nastawa punktu "
            "pracy, nie do tożsamości MODELU"
        ),
    )

    def __post_init__(self) -> None:
        if self.e_pojemnosc_mwh <= 0.0:
            raise ValueError(f"{self.ref}: e_pojemnosc_mwh musi być > 0")
        if self.s_bazowa_mva <= 0.0:
            raise ValueError(f"{self.ref}: s_bazowa_mva musi być > 0")
        if self.s_falownika_pu <= 0.0:
            raise ValueError(f"{self.ref}: s_falownika_pu musi być > 0")
        if not 0.0 <= self.soc_min < self.soc_max <= 1.0:
            raise ValueError(f"{self.ref}: wymagane 0 <= soc_min < soc_max <= 1")
        if not 0.0 <= self.soc_poczatkowy <= 1.0:
            raise ValueError(f"{self.ref}: soc_poczatkowy poza [0, 1]")
        if self.pasmo_soc <= 0.0:
            raise ValueError(
                f"{self.ref}: pasmo_soc musi być > 0 — zerowe pasmo czyni pochodną "
                "nieciągłą na granicy okna SOC i wywraca metody niejawne."
            )
        if self.t_p_s <= 0.0 or self.t_q_s <= 0.0:
            raise ValueError(f"{self.ref}: stałe czasowe muszą być > 0")
        if self.statyzm_f <= 0.0:
            raise ValueError(f"{self.ref}: statyzm_f musi być > 0")
        if self.strefa_martwa_f_hz < 0.0:
            raise ValueError(f"{self.ref}: strefa_martwa_f_hz nie może być ujemna")
        if self.krotnosc_pradu_max <= 0.0:
            raise ValueError(f"{self.ref}: krotnosc_pradu_max musi być > 0")

    # -- wielkości pochodne ---------------------------------------------------

    @property
    def s_zn_pu(self) -> float:
        """Moc znamionowa widziana przez regulator elektrowni (= moc falownika)."""
        return self.s_falownika_pu

    @property
    def i_max_pu(self) -> float:
        return self.krotnosc_pradu_max * self.s_falownika_pu

    def nazwy_stanow(self) -> tuple[str, ...]:
        return ("p_wyjscia_pu", "q_wyjscia_pu", "soc", "theta_pll_rad", "omega_pll_pu")

    def stany_zasobowe(self) -> tuple[str, ...]:
        """``soc`` jest zapasem energii, nie zmienną elektromechaniczną.

        Jego pochodna jest niezerowa zawsze, gdy magazyn oddaje albo pobiera moc
        — to jest bilans energii, a nie brak równowagi. Warunkowi ``f = 0``
        podlegają pozostałe cztery stany: tor P/Q i PLL.
        """
        return ("soc",)

    def jednostki_stanow(self) -> tuple[str, ...]:
        """Jednostki DEKLAROWANE PRZEZ MODEL — ``soc`` jest niemianowany."""
        return ("p.u.", "p.u.", "1", "rad", "p.u.")

    def czestotliwosc_zmierzona_hz(self, x: NDArray[np.float64]) -> float:
        """Częstotliwość WIDZIANA PRZEZ URZĄDZENIE (wyjście całkujące PLL) [Hz].

        Nie jest to częstotliwość „układu" — takiej wielkości model sieci nie ma.
        To pomiar konkretnego falownika w konkretnym punkcie sieci.
        """
        return F_BAZOWA_HZ * float(x[4])

    def wklad_czestotliwosciowy_pu(self, f_hz: float) -> float:
        """Przyrost mocy czynnej z regulacji częstotliwościowej [p.u. bazy sieci].

        Charakterystyka jest SYMETRYCZNA: przy niedomiarze częstotliwości magazyn
        rozładowuje się (P > 0), przy nadmiarze ładuje (P < 0). Strefa martwa
        odpowiada progom włączenia trybu; poza nią zależność jest liniowa.
        """
        odchylka = f_hz - self.f_odniesienia_hz
        if abs(odchylka) <= self.strefa_martwa_f_hz:
            return 0.0
        znak = 1.0 if odchylka > 0.0 else -1.0
        efektywna = znak * (abs(odchylka) - self.strefa_martwa_f_hz)
        return -(efektywna / F_BAZOWA_HZ) / self.statyzm_f * self.s_falownika_pu

    def dostepnosc_energii(self, soc: float) -> tuple[float, float]:
        """``(dostępność rozładowania, dostępność ładowania)`` w [0, 1]."""
        return (
            ogranicz_do_przedzialu((soc - self.soc_min) / self.pasmo_soc, 0.0, 1.0),
            ogranicz_do_przedzialu((self.soc_max - soc) / self.pasmo_soc, 0.0, 1.0),
        )

    def cel_mocy(
        self, x: NDArray[np.float64], *, p_zadane_pu: float, q_zadane_pu: float
    ) -> tuple[float, float]:
        """Osiągalny cel ``(P, Q)`` po regulacji f, ograniczeniu energią i okręgu."""
        p_zadane = p_zadane_pu + self.wklad_czestotliwosciowy_pu(self.czestotliwosc_zmierzona_hz(x))
        rozladowanie, ladowanie = self.dostepnosc_energii(float(x[2]))
        p_dostepne = p_zadane * (rozladowanie if p_zadane > 0.0 else ladowanie)
        return ogranicz_okregiem(
            p_dostepne, q_zadane_pu, self.s_falownika_pu, priorytet_biernej=self.priorytet_biernej
        )

    # -- kontrakt urządzenia --------------------------------------------------

    def ograniczniki_stanu(self, przesuniecie: int) -> tuple[OgraniczenieStanu, ...]:
        """Niezmienniki dyskretne: ``p_wyjscia_pu`` (0), ``q_wyjscia_pu`` (1), ``soc`` (2).

        TOR P/Q — kwadrat ``[-s_falownika, s_falownika]^2``, bo cel obu torów
        przechodzi przez `ogranicz_okregiem` (uzasadnienie niezmienniczości tam).

        SOC — przedział ``[0, 1]`` jest DEFINICJĄ stanu naładowania, nie nastawą:
        ``soc`` poza nim nie jest „poza zakresem regulacji", tylko wielkością
        niefizyczną. Okno pracy ``[soc_min, soc_max]`` celowo NIE jest tu
        deklarowane: przy dostępności energii gasnącej dopiero na granicy okna,
        a mocy zmieniającej się z opóźnieniem ``T_p``, przepływ ścisły przekracza
        ``soc_min`` o ``P·T_p·S_base/(3600·E)`` — dla 1 p.u., 100 MVA, 0,05 s
        i 10 MWh jest to 1,4e-4. Okno nie jest więc zbiorem niezmienniczym
        przepływu ścisłego i rzutowanie na nie dokładałoby fizykę, której model
        nie ma. Przedział ``[0, 1]`` jest niezmienniczy z tym samym marginesem.
        """
        return (
            OgraniczenieStanu(
                indeks=przesuniecie + 0,
                dol=-self.s_falownika_pu,
                gora=self.s_falownika_pu,
                nazwa="p_wyjscia_pu",
                znaczenie=(
                    "moc czynna wystawiana przez falownik magazynu [p.u.]: ograniczona "
                    "mocą pozorną falownika (okrąg |S| <= s_falownika_pu)"
                ),
            ),
            OgraniczenieStanu(
                indeks=przesuniecie + 1,
                dol=-self.s_falownika_pu,
                gora=self.s_falownika_pu,
                nazwa="q_wyjscia_pu",
                znaczenie=(
                    "moc bierna wystawiana przez falownik magazynu [p.u.]: ograniczona "
                    "mocą pozorną falownika (okrąg |S| <= s_falownika_pu)"
                ),
            ),
            OgraniczenieStanu(
                indeks=przesuniecie + 2,
                dol=0.0,
                gora=1.0,
                nazwa="soc",
                znaczenie=(
                    "stan naładowania [1]: udział zgromadzonej energii w pojemności "
                    "magazynu — wielkość z definicji zawarta w [0, 1]"
                ),
            ),
        )

    def wstrzykniecie(self, x: NDArray[np.float64], v_szyny: complex) -> complex:
        if abs(v_szyny) < PROG_NAPIECIA_PU:
            return 0j
        i = complex(np.conj(complex(float(x[0]), float(x[1])) / v_szyny))
        return ogranicz_prad(i, v_szyny, self.i_max_pu, priorytet_biernej=self.priorytet_biernej)

    def moc_rzeczywista(self, x: NDArray[np.float64], v_szyny: complex) -> complex:
        """Moc faktycznie oddana do sieci — PO ograniczniku prądowym."""
        return complex(v_szyny * np.conj(self.wstrzykniecie(x, v_szyny)))

    def pochodne_ze_zadaniem(
        self,
        x: NDArray[np.float64],
        v_szyny: complex,
        *,
        p_zadane_pu: float,
        q_zadane_pu: float,
    ) -> NDArray[np.float64]:
        p_cel, q_cel = self.cel_mocy(x, p_zadane_pu=p_zadane_pu, q_zadane_pu=q_zadane_pu)
        p, q = float(x[0]), float(x[1])
        d_theta, d_omega = self.pll.pochodne(float(x[3]), float(x[4]), v_szyny)
        p_rzeczywiste = self.moc_rzeczywista(x, v_szyny).real
        d_soc = -p_rzeczywiste * self.s_bazowa_mva / (3600.0 * self.e_pojemnosc_mwh)
        return np.array(
            [(p_cel - p) / self.t_p_s, (q_cel - q) / self.t_q_s, d_soc, d_theta, d_omega],
            dtype=np.float64,
        )

    def pochodne(self, x: NDArray[np.float64], v_szyny: complex) -> NDArray[np.float64]:
        return self.pochodne_ze_zadaniem(
            x, v_szyny, p_zadane_pu=self.p_ref_pu, q_zadane_pu=self.q_ref_pu
        )

    def inicjalizuj(self, v_szyny: complex, s_zadane: complex) -> NDArray[np.float64]:
        """Punkt pracy z rozpływu; ``soc`` z parametru, PLL zsynchronizowany.

        Zadanie ``(P, Q)`` niewykonalne — bo wykracza poza okrąg falownika albo poza
        okno SOC — jest ODRZUCANE, a nie po cichu przycinane: magazyn rozładowany do
        ``soc_min`` nie odda zadanej mocy, więc rozpływ, który ją założył, opisuje
        inną sieć (patrz `_sprawdz_wykonalnosc_punktu_pracy`).

        Zwrócony stan jest równowagą TYLKO dla ``P = 0`` — magazyn pod obciążeniem
        zmienia energię, więc stanem ustalonym nie jest (patrz docstring klasy).
        """
        p0, q0 = ogranicz_okregiem(
            s_zadane.real,
            s_zadane.imag,
            self.s_falownika_pu,
            priorytet_biernej=self.priorytet_biernej,
        )
        rozladowanie, ladowanie = self.dostepnosc_energii(self.soc_poczatkowy)
        p0 = p0 * (rozladowanie if p0 > 0.0 else ladowanie)
        _sprawdz_wykonalnosc_punktu_pracy(
            self.ref,
            s_zadane,
            p0,
            q0,
            f"okrąg falownika {self.s_falownika_pu:.3f} p.u. oraz okno SOC "
            f"[{self.soc_min:.2f}, {self.soc_max:.2f}] przy soc = {self.soc_poczatkowy:.3f}",
        )
        self.p_ref_pu = p0
        self.q_ref_pu = q0
        theta0, omega0 = self.pll.stan_poczatkowy(v_szyny)
        return np.array([p0, q0, self.soc_poczatkowy, theta0, omega0], dtype=np.float64)


@dataclass
class RegulatorElektrowniPPC:
    """Regulator elektrowni (PPC) — obiekt NADRZĘDNY nad modułami, z limitem w PCC.

    STANY: ``[p_polecenie_pu, q_polecenie_pu, *stany kolejnych jednostek]``.
    Polecenie elektrowni jest STANEM, bo telemetria i regulacja nadrzędna mają
    skończoną szybkość (0,1–1 s); alokacja natychmiastowa byłaby niefizyczna i
    ukrywałaby to, co w rzeczywistej elektrowni decyduje o dotrzymaniu limitu:
    opóźnienie między pomiarem w PCC a wykonaniem przez moduły.

    RÓWNANIA
        (P_cel, Q_cel)     = zadanie ograniczone mocą zainstalowaną
                             oraz — dla mocy czynnej — LIMITEM EKSPORTU
        d(P_polecenie)/dt  = (P_cel - P_polecenie) / t_telemetrii_s
        d(Q_polecenie)/dt  = (Q_cel - Q_polecenie) / t_telemetrii_s
        zadania modułów    = alokacja(P_polecenie, Q_polecenie)
        I_PCC              = Σ I_jednostki,     S_PCC = V * conj(I_PCC)

    PO CO AGREGAT. Zgodność z wymaganiami przyłączeniowymi ocenia się W PCC, a nie
    na pojedynczym module: elektrownia z dwoma modułami po 0,5 p.u. i limitem
    eksportu 0,6 p.u. jest zgodna albo nie NA ZACISKU WSPÓLNYM. Dlatego PPC podaje
    `moc_w_pcc` — i to ta wielkość jest przedmiotem oceny, nie suma zadań.

    ALOKACJA — dwie strategie, obie zaimplementowane i obie zmierzone:
      - ``"proporcjonalna"`` — udział wprost proporcjonalny do mocy znamionowej.
        Uzasadnienie: równy stopień wykorzystania modułów, czyli równe obciążenie
        cieplne i równe zużycie; domyślna dla farmy jednorodnej.
      - ``"priorytetowa"`` — napełnianie w kolejności deklaracji do mocy modułu.
        Uzasadnienie: elektrownia hybrydowa, gdzie kolejność wynika z kosztu
        krańcowego (najpierw energia z wiatru/słońca, magazyn na końcu), oraz
        możliwość odstawienia modułu bez zmiany reszty nastaw.

    ``P`` i ``Q`` są alokowane NIEZALEŻNIE, a każdy moduł domyka parę własnym
    okręgiem mocy pozornej. Skutkiem jest sytuacja, w której suma alokacji nie
    jest osiągalna (zadanie P i Q wyczerpuje moc pozorną modułu). PPC tego nie
    ukrywa: `moc_w_pcc` zwraca moc FAKTYCZNĄ i to ona podlega ocenie.

    GRANICE (nazwane, żeby nikt nie wziął tego za model farmy):
      - brak SIECI WEWNĘTRZNEJ elektrowni: kable zbiorcze, transformatory blokowe
        i straty nie istnieją, więc wszystkie moduły widzą to samo napięcie PCC.
        Konsekwencja jest ważna: moc w PCC jest DOKŁADNIE sumą modułów, więc
        ograniczenie eksportu realizowane jest w przód (feedforward). Prawdziwy
        PPC domyka pętlę sprzężeniem od pomiaru w PCC, bo suma modułów różni się
        od mocy w PCC o straty; tutaj taka pętla regulowałaby różnicę tożsamościowo
        zerową, czyli byłaby atrapą regulatora,
      - brak ograniczeń szybkości narastania (rampy) i brak nastaw czasowych
        wymaganych przez operatora,
      - brak regulacji napięcia/współczynnika mocy w PCC (zadanie ``Q`` jest
        jawne, nie wynika z charakterystyki Q(U)),
      - brak modelu łączności: telemetria jest opóźnieniem 1. rzędu, nie ma utraty
        pakietów ani czasu odświeżania.
    """

    ref: str
    szyna: str
    jednostki: list[JednostkaSterowana]
    t_telemetrii_s: float = 0.3
    strategia: str = "proporcjonalna"
    limit_eksportu_pu: float | None = None
    p_zadane_pu: float = pole_nastawa(
        default=0.0,
        powod=(
            "polecenie mocy czynnej elektrowni — wyliczana przez `inicjalizuj` z punktu pracy rozpływu, więc NIE jest "
            "definicją urządzenia; wchodzi do tożsamości BIEGU jako nastawa punktu "
            "pracy, nie do tożsamości MODELU"
        ),
    )
    q_zadane_pu: float = pole_nastawa(
        default=0.0,
        powod=(
            "polecenie mocy biernej elektrowni — wyliczana przez `inicjalizuj` z punktu pracy rozpływu, więc NIE jest "
            "definicją urządzenia; wchodzi do tożsamości BIEGU jako nastawa punktu "
            "pracy, nie do tożsamości MODELU"
        ),
    )

    STRATEGIE: ClassVar[tuple[str, ...]] = ("proporcjonalna", "priorytetowa")

    def __post_init__(self) -> None:
        if not self.jednostki:
            raise ValueError(f"{self.ref}: elektrownia bez modułów nie jest elektrownią")
        refy = [j.ref for j in self.jednostki]
        if len(set(refy)) != len(refy):
            raise ValueError(f"{self.ref}: powtórzone identyfikatory modułów: {refy}")
        for j in self.jednostki:
            if j.s_zn_pu <= 0.0:
                raise ValueError(f"{self.ref}: moduł {j.ref} ma niedodatnią moc znamionową")
            szyna_modulu = getattr(j, "szyna", None)
            if szyna_modulu is not None and szyna_modulu != self.szyna:
                raise ValueError(
                    f"{self.ref}: moduł {j.ref} deklaruje szynę {szyna_modulu}, a PPC agreguje "
                    f"w {self.szyna}. Model nie ma sieci wewnętrznej elektrowni, więc moduł na "
                    "innej szynie byłby liczony w złym punkcie — to nie jest do naprawienia "
                    "parametrem."
                )
        if self.t_telemetrii_s <= 0.0:
            raise ValueError(
                f"{self.ref}: t_telemetrii_s musi być > 0 — alokacja natychmiastowa jest "
                "niefizyczna (pomiar, łącze i wykonanie mają skończoną szybkość)."
            )
        if self.strategia not in self.STRATEGIE:
            raise ValueError(f"{self.ref}: nieznana strategia {self.strategia!r}")
        if self.limit_eksportu_pu is not None and self.limit_eksportu_pu < 0.0:
            raise ValueError(f"{self.ref}: limit eksportu nie może być ujemny")

    # -- struktura stanu ------------------------------------------------------

    @property
    def moc_zainstalowana_pu(self) -> float:
        return sum(j.s_zn_pu for j in self.jednostki)

    def nazwy_stanow(self) -> tuple[str, ...]:
        nazwy = ["p_polecenie_pu", "q_polecenie_pu"]
        for j in self.jednostki:
            nazwy += [f"{j.ref}.{n}" for n in j.nazwy_stanow()]
        return tuple(nazwy)

    def jednostki_stanow(self) -> tuple[str, ...]:
        """Jednostki składane z deklaracji jednostek podrzędnych — jedna prawda.

        Kolejność musi odpowiadać ``nazwy_stanow`` co do pozycji, więc obie
        metody przechodzą po tej samej liście ``self.jednostki``. Gdyby moduł
        podrzędny zmienił liczbę stanów, niespójność wyjdzie natychmiast
        w ``konwencje.jednostki_stanow`` (kontrola długości), a nie jako cicho
        przesunięte etykiety.
        """
        jednostki = ["p.u.", "p.u."]
        for j in self.jednostki:
            jednostki += list(j.jednostki_stanow())
        return tuple(jednostki)

    def _wycinki(self) -> list[slice]:
        wycinki: list[slice] = []
        pozycja = 2
        for j in self.jednostki:
            dlugosc = len(j.nazwy_stanow())
            wycinki.append(slice(pozycja, pozycja + dlugosc))
            pozycja += dlugosc
        return wycinki

    # -- zadanie i alokacja ---------------------------------------------------

    def cel_plantu(self) -> tuple[float, float]:
        """Zadanie po ograniczeniu mocą zainstalowaną i limitem EKSPORTU.

        Limit dotyczy wyłącznie kierunku eksportu (``P > 0``): pobór z sieci nie
        jest eksportem i nie może być nim ograniczany.
        """
        zdolnosc = self.moc_zainstalowana_pu
        p_cel = ogranicz_do_przedzialu(self.p_zadane_pu, -zdolnosc, zdolnosc)
        q_cel = ogranicz_do_przedzialu(self.q_zadane_pu, -zdolnosc, zdolnosc)
        if self.limit_eksportu_pu is not None:
            p_cel = min(p_cel, self.limit_eksportu_pu)
        return p_cel, q_cel

    def _alokuj_jedna_wielkosc(self, wartosc: float) -> list[float]:
        zdolnosci = [j.s_zn_pu for j in self.jednostki]
        if self.strategia == "proporcjonalna":
            suma = sum(zdolnosci)
            return [wartosc * z / suma for z in zdolnosci]
        znak = 1.0 if wartosc >= 0.0 else -1.0
        pozostalo = abs(wartosc)
        udzialy: list[float] = []
        for z in zdolnosci:
            udzial = min(pozostalo, z)
            udzialy.append(znak * udzial)
            pozostalo -= udzial
        return udzialy

    def alokacja(self, p_pu: float, q_pu: float) -> list[tuple[float, float]]:
        """Zadania ``(P, Q)`` dla kolejnych modułów wg wybranej strategii."""
        return list(
            zip(
                self._alokuj_jedna_wielkosc(p_pu),
                self._alokuj_jedna_wielkosc(q_pu),
                strict=True,
            )
        )

    # -- kontrakt urządzenia --------------------------------------------------

    def pochodne(self, x: NDArray[np.float64], v_szyny: complex) -> NDArray[np.float64]:
        p_polecenie, q_polecenie = float(x[0]), float(x[1])
        p_cel, q_cel = self.cel_plantu()
        dx = np.zeros(len(self.nazwy_stanow()), dtype=np.float64)
        dx[0] = (p_cel - p_polecenie) / self.t_telemetrii_s
        dx[1] = (q_cel - q_polecenie) / self.t_telemetrii_s
        zadania = self.alokacja(p_polecenie, q_polecenie)
        for jednostka, wycinek, (p_zad, q_zad) in zip(
            self.jednostki, self._wycinki(), zadania, strict=True
        ):
            dx[wycinek] = jednostka.pochodne_ze_zadaniem(
                x[wycinek], v_szyny, p_zadane_pu=p_zad, q_zadane_pu=q_zad
            )
        return dx

    def ograniczniki_stanu(self, przesuniecie: int) -> tuple[OgraniczenieStanu, ...]:
        """Niezmienniki dyskretne: polecenia elektrowni + PROPAGACJA z modułów.

        Regulator nie kopiuje granic swoich modułów — pyta o nie te moduły, z ich
        własnym przesunięciem w wektorze (`_wycinki`). Dzięki temu dołożenie
        magazynu do elektrowni od razu wnosi jego okno SOC, bez dopisywania
        czegokolwiek tutaj.

        Granice POLECEŃ biorą się z `cel_plantu`: zadanie jest ograniczane mocą
        zainstalowaną, a dla kierunku eksportu dodatkowo ``limit_eksportu_pu``.
        Górna granica ``p_polecenie_pu`` jest więc mniejsza z tych dwóch — jedno
        źródło prawdy z `cel_plantu`, nie druga redakcja tej samej reguły.
        """
        zdolnosc = self.moc_zainstalowana_pu
        gora_p = (
            zdolnosc if self.limit_eksportu_pu is None else min(zdolnosc, self.limit_eksportu_pu)
        )
        ograniczenia: list[OgraniczenieStanu] = [
            OgraniczenieStanu(
                indeks=przesuniecie + 0,
                dol=-zdolnosc,
                gora=gora_p,
                nazwa="p_polecenie_pu",
                znaczenie=(
                    "polecenie mocy czynnej elektrowni [p.u.]: ograniczone mocą "
                    "zainstalowaną, a w kierunku eksportu także limitem eksportu"
                ),
            ),
            OgraniczenieStanu(
                indeks=przesuniecie + 1,
                dol=-zdolnosc,
                gora=zdolnosc,
                nazwa="q_polecenie_pu",
                znaczenie=(
                    "polecenie mocy biernej elektrowni [p.u.]: ograniczone mocą "
                    "zainstalowaną elektrowni"
                ),
            ),
        ]
        for jednostka, wycinek in zip(self.jednostki, self._wycinki(), strict=True):
            deklaracja = getattr(jednostka, "ograniczniki_stanu", None)
            if deklaracja is None:
                continue
            ograniczenia.extend(deklaracja(przesuniecie + wycinek.start))
        return tuple(ograniczenia)

    def wstrzykniecie(self, x: NDArray[np.float64], v_szyny: complex) -> complex:
        prad = 0j
        for jednostka, wycinek in zip(self.jednostki, self._wycinki(), strict=True):
            prad += jednostka.wstrzykniecie(x[wycinek], v_szyny)
        return complex(prad)

    def moc_w_pcc(self, x: NDArray[np.float64], v_szyny: complex) -> complex:
        """Zagregowana moc elektrowni W PUNKCIE PRZYŁĄCZENIA — wielkość oceniana."""
        return complex(v_szyny * np.conj(self.wstrzykniecie(x, v_szyny)))

    def moce_jednostek(self, x: NDArray[np.float64], v_szyny: complex) -> dict[str, complex]:
        """Moc faktyczna każdego modułu — do audytu alokacji (nie do oceny zgodności)."""
        return {
            jednostka.ref: complex(v_szyny * np.conj(jednostka.wstrzykniecie(x[wycinek], v_szyny)))
            for jednostka, wycinek in zip(self.jednostki, self._wycinki(), strict=True)
        }

    def inicjalizuj(self, v_szyny: complex, s_zadane: complex) -> NDArray[np.float64]:
        """Punkt pracy: zadanie z rozpływu rozdzielone na moduły; stan = polecenie.

        Dyspozycja PONAD limit eksportu albo ponad moc zainstalowaną jest ODRZUCANA,
        a nie przycinana do limitu: rozpływ policzyłby napięcia dla mocy, której
        elektrownia nie wystawi. Elektrownię pracującą pod ograniczeniem zadaje się
        mocą, którą faktycznie oddaje — a scenariusz „limit zaczyna wiązać" bada się
        zmianą dyspozycji PO inicjalizacji, czyli tak, jak dzieje się to naprawdę.
        """
        self.p_zadane_pu = s_zadane.real
        self.q_zadane_pu = s_zadane.imag
        p_cel, q_cel = self.cel_plantu()
        _sprawdz_wykonalnosc_punktu_pracy(
            self.ref,
            s_zadane,
            p_cel,
            q_cel,
            f"moc zainstalowana {self.moc_zainstalowana_pu:.3f} p.u., limit eksportu "
            f"{self.limit_eksportu_pu}",
        )
        stan: list[float] = [p_cel, q_cel]
        for jednostka, (p_zad, q_zad) in zip(
            self.jednostki, self.alokacja(p_cel, q_cel), strict=True
        ):
            stan += list(jednostka.inicjalizuj(v_szyny, complex(p_zad, q_zad)))
        return np.array(stan, dtype=np.float64)


class PozaZakresemWaznosciModeluError(RuntimeError):
    """Punkt pracy wyszedł poza zakres, dla którego model jest ważny.

    Świadomie głośny: model, który liczy dalej i oddaje liczbę spoza swojej
    dziedziny ważności, jest gorszy niż brak modelu, bo liczba wygląda tak samo
    jak poprawna.
    """


@dataclass
class MaszynaDwustronnieZasilana3Rzedu:
    """Maszyna asynchroniczna dwustronnie zasilana — model 3. RZĘDU, BEZ CROWBARU.

    Nazwa mówi, co jest policzone: trzy stany, SEM przejściowa za reaktancją
    przejściową plus prędkość wirnika. To NIE jest pełny model turbiny typu 3 —
    lista braków jest w ``ZJAWISKA_NIEOBJETE`` i jest częścią kontraktu tej klasy,
    nie ozdobą docstringa (sprawdza ją test).

    STANY (3): ``[e_prim_re_pu, e_prim_im_pu, omega_wirnika_pu]``
    Stan prędkości NIE nazywa się ``omega_pu`` celowo: silnik publikuje dla stanu
    o tej nazwie sygnał „Częstotliwość [Hz]", a prędkość wirnika DFIG (0,7…1,2 p.u.)
    nie jest częstotliwością sieci — taki sygnał byłby fałszem w wyniku.

    RÓWNANIA (rama sieci, konwencja generatorowa, reaktancje w p.u. bazy sieci)
        X   = x_s + x_m,  X_rr = x_r + x_m,  X' = X - x_m²/X_rr,
        T0' = X_rr / (OMEGA_S * r_r),        s = 1 - omega_wirnika

        I      = (E' - V) / (r_s + jX')                       (stojan, algebraicznie)
        dE'/dt = -(E' + j(X - X')·I)/T0' - j·s·OMEGA_S·E' + j·OMEGA_S·(x_m/X_rr)·V_r
        i_r    = -j·E'/x_m + (x_m/X_rr)·I                     (prąd wirnika)
        T_e    = Re(E' · conj(I))                             (moment, ω_s = 1 p.u.)
        2H·d(omega_wirnika)/dt = T_m - T_e

    DLACZEGO TO ODRÓŻNIA DFIG OD FALOWNIKA PEŁNOMOCOWEGO. Stojan jest przyłączony
    do sieci BEZPOŚREDNIO, więc maszyna jest ŹRÓDŁEM NAPIĘCIOWYM za małą
    reaktancją przejściową (tu ~0,18 p.u.): przy zapadzie napięcia prąd
    ``(E' - V)/(r_s + jX')`` sięga kilku p.u. i zanika dopiero ze stałą ``T0'``,
    bo strumień wirnika nie może zniknąć skokowo. Falownik pełnomocowy jest
    źródłem PRĄDOWYM z ogranicznikiem — jego prąd zwarciowy jest z definicji
    ograniczony do ~1,2 p.u. i ustala go regulator, a nie strumień. Ta różnica
    jest MIERZALNA i jest treścią testu porównawczego; w audytowanej produkcji
    wynik nie zależał od typu urządzenia (defekt P0-07).

    PRZEKSZTAŁTNIK WIRNIKA (RSC) jest modelowany jako proporcjonalny regulator
    prądu wirnika: ``V_r = V_r0 + k_rsc·(i_r_zadane - i_r)``, z nasyceniem modułu
    do ``u_wirnika_max_pu``. Człon proporcjonalny wnosi do ``dE'/dt`` składnik
    ``-k_rsc·OMEGA_S·E'/X_rr``, czyli działa jak podwyższenie rezystancji wirnika
    (sterowanie odmagnesowujące) — to jest realny mechanizm, a nie sztuczne
    tłumienie; zerowe ``k_rsc`` daje maszynę o strumieniu zanikającym wyłącznie
    naturalnie i to też jest dopuszczalny punkt badania.

    ZAKRES WAŻNOŚCI. Model nie ma crowbaru, więc przy głębokim zapadzie liczy
    prądy i napięcia wirnika, których rzeczywisty przekształtnik by nie wytrzymał
    — w takiej sytuacji zadziałałby crowbar i maszyna zachowywałaby się JAK KLATKA,
    czego ten model nie odwzorowuje. Dlatego: `czy_w_zakresie_waznosci` i
    `sprawdz_zakres_waznosci`. Kontrola NIE jest wywoływana w ``pochodne`` (to
    ocena, nie fizyka, a wyjątek w środku całkowania zabijałby przebieg), ale
    każdy, kto wyciąga z przebiegu wniosek o zachowaniu turbiny przy zapadzie,
    MUSI ją wywołać — inaczej cytuje liczbę spoza dziedziny modelu.
    """

    ZJAWISKA_NIEOBJETE: ClassVar[tuple[str, ...]] = (
        "crowbar i przejście w pracę klatkową przy przekroczeniu prądu wirnika",
        "przekształtnik sieciowy (GSC) i dynamika obwodu pośredniczącego DC",
        "transjenty strumienia stojana (składowa nieokresowa prądu zwarciowego)",
        "wał dwumasowy i drgania skrętne łańcucha napędowego",
        "aerodynamika, regulacja kąta łopat i śledzenie punktu mocy maksymalnej",
        "nadrzędna regulacja momentu i mocy biernej (zadanie prądu wirnika jest stałe)",
        "nasycenie obwodu magnetycznego i zależność X_m od strumienia",
        "praca przy niesymetrii — model liczy wyłącznie w składowej zgodnej",
    )

    ref: str
    szyna: str
    h_s: float = 4.0
    """Stała bezwładności całego łańcucha napędowego [s], NA BAZIE SIECI."""
    r_s_pu: float = 0.01
    x_s_pu: float = 0.10
    r_r_pu: float = 0.01
    x_r_pu: float = 0.08
    x_m_pu: float = 3.0
    omega_wirnika_zadana_pu: float = 1.15
    """Prędkość punktu pracy [p.u.]. Jest PARAMETREM, a nie wynikiem — model nie
    ma aerodynamiki, więc nie potrafi jej wyprowadzić z prędkości wiatru."""
    k_rsc: float = 0.02
    u_wirnika_max_pu: float = 0.35
    """Napięciowa granica przekształtnika częściowej mocy (~|poślizg|·U)."""
    i_wirnika_max_pu: float = 1.2
    _v_r0: complex = pole_nastawa(
        default=0j,
        repr=False,
        powod=(
            "wartość wyliczona przez `inicjalizuj` z punktu pracy (rozpływ), nie "
            "parametr modelu — punkt pracy jest osobną osią tożsamości "
            "(TozsamoscScenariusza)"
        ),
    )
    _i_r_zadane: complex = pole_nastawa(
        default=0j,
        repr=False,
        powod=(
            "wartość wyliczona przez `inicjalizuj` z punktu pracy (rozpływ), nie "
            "parametr modelu — punkt pracy jest osobną osią tożsamości "
            "(TozsamoscScenariusza)"
        ),
    )
    _t_m: float = pole_nastawa(
        default=0.0,
        repr=False,
        powod=(
            "wartość wyliczona przez `inicjalizuj` z punktu pracy (rozpływ), nie "
            "parametr modelu — punkt pracy jest osobną osią tożsamości "
            "(TozsamoscScenariusza)"
        ),
    )

    def __post_init__(self) -> None:
        if self.h_s <= 0.0:
            raise ValueError(f"{self.ref}: h_s musi być > 0")
        if self.x_m_pu <= 0.0 or self.x_r_pu <= 0.0 or self.x_s_pu <= 0.0:
            raise ValueError(f"{self.ref}: reaktancje muszą być > 0")
        if self.r_r_pu <= 0.0:
            raise ValueError(
                f"{self.ref}: r_r_pu musi być > 0 — zerowa rezystancja wirnika daje "
                "nieskończoną stałą czasową T0' (strumień nigdy nie zanika)."
            )
        if self.k_rsc < 0.0:
            raise ValueError(
                f"{self.ref}: k_rsc < 0 działałoby jak UJEMNA rezystancja wirnika "
                "(wzmacnianie strumienia) — to nie jest regulator, tylko niestabilność."
            )
        if self.u_wirnika_max_pu <= 0.0 or self.i_wirnika_max_pu <= 0.0:
            raise ValueError(f"{self.ref}: granice przekształtnika muszą być > 0")
        if not 0.0 < self.omega_wirnika_zadana_pu < 2.0:
            raise ValueError(f"{self.ref}: omega_wirnika_zadana_pu poza (0, 2)")
        if self.x_prim_pu <= 0.0:
            raise ValueError(f"{self.ref}: X' = {self.x_prim_pu} nie jest dodatnia")

    # -- wielkości pochodne ---------------------------------------------------

    @property
    def x_ss_pu(self) -> float:
        return self.x_s_pu + self.x_m_pu

    @property
    def x_rr_pu(self) -> float:
        return self.x_r_pu + self.x_m_pu

    @property
    def x_prim_pu(self) -> float:
        return self.x_ss_pu - self.x_m_pu**2 / self.x_rr_pu

    @property
    def t0_prim_s(self) -> float:
        return self.x_rr_pu / (OMEGA_S * self.r_r_pu)

    def nazwy_stanow(self) -> tuple[str, ...]:
        return ("e_prim_re_pu", "e_prim_im_pu", "omega_wirnika_pu")

    def jednostki_stanow(self) -> tuple[str, ...]:
        """Składowe SEM przejściowej w p.u.; prędkość wirnika w p.u."""
        return ("p.u.", "p.u.", "p.u.")

    @staticmethod
    def _sem(x: NDArray[np.float64]) -> complex:
        return complex(float(x[0]), float(x[1]))

    def poslizg(self, x: NDArray[np.float64]) -> float:
        """``s = 1 - omega_wirnika`` — ujemny przy pracy nadsynchronicznej."""
        return 1.0 - float(x[2])

    # -- kontrakt urządzenia --------------------------------------------------

    def wstrzykniecie(self, x: NDArray[np.float64], v_szyny: complex) -> complex:
        """Prąd STOJANA do sieci — bez ogranicznika, bo maszyna go nie ma.

        Falownik ogranicza prąd regulatorem; maszyna asynchroniczna ograniczyć go
        nie potrafi — jedyne, co ogranicza prąd zwarciowy DFIG, to zadziałanie
        crowbaru, czyli zjawisko spoza tego modelu.
        """
        return (self._sem(x) - v_szyny) / complex(self.r_s_pu, self.x_prim_pu)

    def prad_wirnika(self, x: NDArray[np.float64], v_szyny: complex) -> complex:
        """Prąd wirnika sprowadzony na stronę stojana [p.u.]."""
        i_stojana = self.wstrzykniecie(x, v_szyny)
        return -1j * self._sem(x) / self.x_m_pu + (self.x_m_pu / self.x_rr_pu) * i_stojana

    def napiecie_wirnika_zadane(self, x: NDArray[np.float64], v_szyny: complex) -> complex:
        """Żądanie regulatora prądu wirnika PRZED nasyceniem przekształtnika."""
        return self._v_r0 + self.k_rsc * (self._i_r_zadane - self.prad_wirnika(x, v_szyny))

    def napiecie_wirnika(self, x: NDArray[np.float64], v_szyny: complex) -> complex:
        """Napięcie faktycznie wystawione — moduł nasycony granicą przekształtnika."""
        zadane = self.napiecie_wirnika_zadane(x, v_szyny)
        modul = abs(zadane)
        if modul <= self.u_wirnika_max_pu or modul < 1.0e-15:
            return zadane
        return zadane * (self.u_wirnika_max_pu / modul)

    def moment_elektryczny(self, x: NDArray[np.float64], v_szyny: complex) -> float:
        """``T_e = Re(E'·conj(I))`` [p.u.], odniesiony do prędkości SYNCHRONICZNEJ."""
        return float((self._sem(x) * np.conj(self.wstrzykniecie(x, v_szyny))).real)

    def pochodne(self, x: NDArray[np.float64], v_szyny: complex) -> NDArray[np.float64]:
        e_prim = self._sem(x)
        i_stojana = self.wstrzykniecie(x, v_szyny)
        v_r = self.napiecie_wirnika(x, v_szyny)
        d_e = (
            -(e_prim + 1j * (self.x_ss_pu - self.x_prim_pu) * i_stojana) / self.t0_prim_s
            - 1j * self.poslizg(x) * OMEGA_S * e_prim
            + 1j * OMEGA_S * (self.x_m_pu / self.x_rr_pu) * v_r
        )
        d_omega = (self._t_m - self.moment_elektryczny(x, v_szyny)) / (2.0 * self.h_s)
        return np.array([d_e.real, d_e.imag, d_omega], dtype=np.float64)

    def inicjalizuj(self, v_szyny: complex, s_zadane: complex) -> NDArray[np.float64]:
        """Punkt pracy z rozpływu; ``V_r0``, ``i_r_zadane`` i ``T_m`` WYPROWADZONE.

        Kroki (każdy z warunku równowagi, nie z dopasowania):
          1. ``I = conj(S/V)``, ``E' = V + (r_s + jX')·I`` — z równania stojana.
          2. ``V_r0`` z warunku ``dE'/dt = 0`` przy zadanym poślizgu.
          3. ``i_r_zadane = i_r(E', I)`` — regulator startuje z zerowym uchybem.
          4. ``T_m = T_e`` — z warunku ``d(omega)/dt = 0``.

        Punkt pracy wymagający od przekształtnika więcej, niż wynosi jego granica,
        jest ODRZUCANY: maszyna, która nie potrafi utrzymać zadanego punktu, nie
        może być z niego symulowana.
        """
        if abs(v_szyny) < PROG_NAPIECIA_PU:
            raise ValueError(f"{self.ref}: napięcie punktu pracy bliskie zeru")
        i_stojana = complex(np.conj(s_zadane / v_szyny))
        e_prim = v_szyny + complex(self.r_s_pu, self.x_prim_pu) * i_stojana
        poslizg = 1.0 - self.omega_wirnika_zadana_pu
        licznik = (
            e_prim + 1j * (self.x_ss_pu - self.x_prim_pu) * i_stojana
        ) / self.t0_prim_s + 1j * poslizg * OMEGA_S * e_prim
        self._v_r0 = licznik / (1j * OMEGA_S * (self.x_m_pu / self.x_rr_pu))
        if abs(self._v_r0) > self.u_wirnika_max_pu:
            raise ValueError(
                f"{self.ref}: punkt pracy wymaga napięcia wirnika {abs(self._v_r0):.3f} p.u. "
                f"przy granicy {self.u_wirnika_max_pu:.3f} p.u. (poślizg {poslizg:+.3f}). "
                "Przekształtnik częściowej mocy tego nie wystawi."
            )
        stan = np.array([e_prim.real, e_prim.imag, self.omega_wirnika_zadana_pu], dtype=np.float64)
        self._i_r_zadane = self.prad_wirnika(stan, v_szyny)
        if abs(self._i_r_zadane) > self.i_wirnika_max_pu:
            raise ValueError(
                f"{self.ref}: punkt pracy wymaga prądu wirnika {abs(self._i_r_zadane):.3f} p.u. "
                f"przy granicy {self.i_wirnika_max_pu:.3f} p.u."
            )
        self._t_m = self.moment_elektryczny(stan, v_szyny)
        return stan

    # -- zakres ważności ------------------------------------------------------

    def diagnostyka_wirnika(self, x: NDArray[np.float64], v_szyny: complex) -> dict[str, float]:
        """Wielkości obwodu wirnika rozstrzygające o ważności modelu."""
        return {
            "i_wirnika_pu": abs(self.prad_wirnika(x, v_szyny)),
            "u_wirnika_zadane_pu": abs(self.napiecie_wirnika_zadane(x, v_szyny)),
            "i_wirnika_max_pu": self.i_wirnika_max_pu,
            "u_wirnika_max_pu": self.u_wirnika_max_pu,
        }

    def czy_w_zakresie_waznosci(self, x: NDArray[np.float64], v_szyny: complex) -> bool:
        d = self.diagnostyka_wirnika(x, v_szyny)
        return (
            d["i_wirnika_pu"] <= d["i_wirnika_max_pu"]
            and d["u_wirnika_zadane_pu"] <= d["u_wirnika_max_pu"]
        )

    def sprawdz_zakres_waznosci(self, x: NDArray[np.float64], v_szyny: complex) -> None:
        """Podnieś wyjątek, jeśli punkt pracy wyszedł poza dziedzinę modelu."""
        if self.czy_w_zakresie_waznosci(x, v_szyny):
            return
        d = self.diagnostyka_wirnika(x, v_szyny)
        braki = "\n  - ".join(self.ZJAWISKA_NIEOBJETE)
        raise PozaZakresemWaznosciModeluError(
            f"{self.ref}: obwód wirnika poza granicami przekształtnika "
            f"(prąd {d['i_wirnika_pu']:.2f} / {d['i_wirnika_max_pu']:.2f} p.u., "
            f"napięcie {d['u_wirnika_zadane_pu']:.2f} / {d['u_wirnika_max_pu']:.2f} p.u.). "
            "W rzeczywistej turbinie zadziałałby crowbar i maszyna przeszłaby w pracę "
            "klatkową — tego model NIE liczy. Zjawiska nieobjęte modelem:\n  - "
            f"{braki}"
        )

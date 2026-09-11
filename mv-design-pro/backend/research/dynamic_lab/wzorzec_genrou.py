"""Dowód **C1/W3** dla modelu 4. RZĘDU i REGULATORÓW wobec ANDES GENROU.

KOD BADAWCZY — patrz `backend/research/README.md`.
Taksonomia i identyfikatory: `dynamic_lab.drabina`.

PO CO TEN MODUŁ ISTNIEJE — LUKA, KTÓRĄ ZAMYKA
---------------------------------------------
`wzorzec_zewnetrzny.py` porównuje laboratorium z modelem **GENCLS** ANDES-a, a po
naszej stronie z maszyną 4. rzędu ZREDUKOWANĄ do klasycznej przez ``Xd = Xd'``
i ``Xq = Xq'`` (`benchmarki.maszyna_klasyczna`). Przy tej redukcji człony
``(Xd−Xd')·Id`` i ``(Xq−Xq')·Iq`` znikają, więc równania ``E'q`` i ``E'd`` stają
się trywialne: ``E'q ≡ Efd = const``, ``E'd ≡ 0``. Zwalidowane zostało tam
równanie wahań, transformacja dq, równania stojana i inicjalizacja — ale **NIE**
właściwa dynamika dwuosiowa (stałe czasowe ``Td0'``, ``Tq0'`` i sprzężenie SEM
przejściowych z prądem) ani **żaden regulator**. Zdanie „zgodna z ANDES do 8e-09"
było prawdziwe o tamtym zakresie i mylące o całym modelu.

Ten moduł rozszerza wyrocznię zewnętrzną na te trzy obszary i — co ważniejsze —
**mierzy granicę** swojej stosowalności zamiast ją zakładać.

CO ZOSTAŁO ZWALIDOWANE ZEWNĘTRZNIE, A CO NIE (podział na RÓWNANIA)
------------------------------------------------------------------
Tabela jest DANYMI (`ZAKRES_WALIDACJI`), nie prozą — każdy wiersz oznaczony jako
zwalidowany wskazuje test, który to sprawdza, a `test_wzorzec_genrou.py` pilnuje,
że wskazany test istnieje. Deklaracja bez przypiętego testu jest groźniejsza niż
brak deklaracji, bo wyłącza czujność.

| Równanie / mechanizm | Zewnętrznie? | Czym |
|---|---|---|
| ``dδ/dt = ω_s (ω−1)`` | TAK | widmo GENROU (mod elektromechaniczny) |
| ``2H dω/dt = Pm − Pe − D(ω−1)`` | TAK | widmo GENROU + zamiatanie ``H``, ``D`` |
| ``Td0' dE'q/dt = Efd − E'q − (Xd−Xd')·Id`` | TAK | widmo GENROU + zamiatanie ``Td0'`` |
| ``Tq0' dE'd/dt = −E'd + (Xq−Xq')·Iq`` | TAK | widmo GENROU + zamiatanie ``Tq0'`` |
| równania stojana ``Vd, Vq`` (RMS, Ra≠0) | TAK | punkt pracy + widmo |
| inicjalizacja ``δ0, E'q0, E'd0, Efd0, Pm0`` | TAK | porównanie punktu pracy |
| algebra sieci (odtworzenie ``V`` z ``P+jQ``) | TAK | porównanie ``|V|`` i ``arg V`` |
| inicjalizacja przy ``Xd' ≠ Xq'`` (anizotropia przejściowa) | TAK | punkt pracy zgadza się DOKŁADNIE, niezależnie od tłumików |
| widmo przy ``Xd' ≠ Xq'`` | TAK, ale ASYMPTOTYCZNIE | tylko w granicy ``Td0'' → 0`` (R2); ANDES wymusza ``Xd''=Xq''`` |
| całkowanie (RK4) na modelu 4. rzędu | TAK | mod z trajektorii vs wartość własna |
| ``T_a dEfd/dt = K_a(V_ref−V_t) − Efd`` (AVR) | TAK | widmo GENROU + SEXS (``TA=TB``) |
| ``T_g dPm/dt = P_ref − (ω−1)/R − Pm`` (governor) | TAK | widmo GENROU + TGOV1 (``T2=T3``) |
| ogranicznik i anti-windup AVR | **NIE** | porównanie małosygnałowe trzyma ogranicznik nieaktywny |
| ogranicznik i anti-windup governora | **NIE** | jw. |
| ogranicznik ŻĄDANIA w AVR laboratorium | **NIE** | SEXS nie ma tego członu — brak wzorca |
| nasycenie obwodu magnetycznego | **NIE** | laboratorium go NIE MA; rozbieżność ZMIERZONA |
| uzwojenia tłumiące (``Xd''``, ``Xq''``, ``Td0''``, ``Tq0''``) | **NIE** | laboratorium ich NIE MA; rozbieżność ZMIERZONA |
| człon lead-lag SEXS / TGOV1 | **NIE** | świadomie unieczynniony, żeby porównywać część wspólną |
| zachowanie dużosygnałowe (zwarcie, CCT) | **NIE** | to jest zakres `WyroczniaRownychPol` (C3/W2) |
| transjenty stojana, zmienna prędkość w stojanie | **NIE** | żaden z modeli ich nie ma — brak sporu, brak dowodu |

DWIE **DOKŁADNE** REDUKCJE GENROU DO MODELU DWUOSIOWEGO (obie zmierzone)
------------------------------------------------------------------------
GENROU jest modelem 6. rzędu (6 stanów: ``δ, ω, e1q, e1d, e2d, e2q``) z
nasyceniem kwadratowym. Nasz model ma 4 stany i nie ma nasycenia. Porównanie ma
sens tylko wtedy, gdy GENROU redukuje się do dwuosiowego — i to nie jest
założenie, tylko własność jego równań, prawdziwa w DWÓCH przypadkach:

**R1 — zerowy odstęp podprzejściowy** (``Xd'' = Xd'``, ``Xq'' = Xq''`` przy
``S10 = 0``; ponieważ ANDES wymusza ``Xd'' = Xq''``, wymaga to ``Xd' = Xq'``).
Wtedy ``γd1 = γq1 = 1`` i ``γd2 = γq2 = 0``, więc strumienie
szczelinowe upraszczają się do ``ψ''d = e1q`` i ``ψ''q = e1d``, a stany ``e2d``,
``e2q`` przestają wpływać na cokolwiek: jakobian jest blokowo-trójkątny. Widmo
GENROU staje się wtedy **sumą** widma modelu dwuosiowego i dwóch modów
odsprzężonych o wartościach **dokładnie** ``−1/Td0''`` i ``−1/Tq0''``.
ZMIERZONE: mody odsprzężone zgadzają się z ``−1/T`` co do bitu (błąd względny
0,0), a pozostałe cztery zgadzają się z laboratorium do 1,2·10⁻⁸ typowo i
2,3·10⁻⁷ najgorzej (przy ``P = 0,9`` p.u., gdzie dominuje tolerancja rozpływu
ANDES-a) — na całym zamiatanym iloczynie cech ``ra × H × P × Xq``.

**R2 — nieskończenie szybkie tłumiki** (``Td0'' → 0``, ``Tq0'' → 0``, dowolne
``Xd''``). Po podstawieniu stanu ustalonego tłumików wychodzi tożsamość
``γd1 + γd2(Xd'−Xl) = 1``, która skraca całą zależność od ``Xd''``: zostaje
``Vq = e1q − Xd'·Id`` i ``XadIfd = e1q + (Xd−Xd')·Id``, czyli równania dwuosiowe.
R2 jest JEDYNĄ drogą dla maszyny ANIZOTROPOWEJ (``Xd' ≠ Xq'``), czyli dla
domyślnej parametryzacji laboratorium — i działa: przy ``Xd' = 0,30``,
``Xq' = 0,55``, ``Xd'' = 0,25`` błąd widma to 1,096·``Td0''`` [1/s] w całym
zamiataniu (5,5·10⁻⁴ przy ``Td0'' = 0,5 ms``), a punkt pracy zgadza się
DOKŁADNIE (4·10⁻⁹) niezależnie od stałej tłumika.
ZMIERZONE przy ``Xd'' = 0,20`` (odstęp 0,10, maszyna izotropowa): błąd modu
elektromechanicznego
maleje LINIOWO ze stałą tłumika — 5,9·10⁻² (0,05 s), 2,5·10⁻² (0,02 s),
1,25·10⁻² (0,01 s), 6,3·10⁻³ (0,005 s), 2,5·10⁻³ (0,002 s),
1,25·10⁻³ (0,001 s), czyli
≈ 1,25·``Td0''`` [1/s]. To jest DOWÓD, że rozbieżność bierze się z tłumików, a
nie z błędu w którymkolwiek modelu.

Poza R1 i R2 modele **nie są równoważne** i moduł tego nie ukrywa: mówi to
wprost (`ModeleNierownowazneError`) i pozwala ZMIERZYĆ rozbieżność jako funkcję
parametru, który je różni (`rozbieznosc_od_reaktancji_podprzejsciowej`,
`rozbieznosc_od_stalej_tlumika`, `rozbieznosc_od_nasycenia`). Zakres zgodności
jest tu WYNIKIEM, nie porażką — dopasowywanie parametrów pod zielony wynik
byłoby fabrykacją zgodności.

REGULATORY — CZĘŚĆ WSPÓLNA, NIE CAŁOŚĆ
--------------------------------------
Struktury nie są 1:1, więc porównywana jest ich część wspólna, a różnice są
nazwane:

- **SEXS** = lead-lag ``(1+sTA)/(1+sTB)`` → człon inercyjny z anti-windup
  ``TE·dy/dt = K·u − y``. Nasz `RegulatorNapiecia` ma tylko ten drugi człon.
  Ustawienie ``TATB = 1`` daje ``TA = TB``, więc lead-lag ma transmitancję
  tożsamościową; jego stan zostaje, ale jest ODSPRZĘŻONY (człony z ``x`` znoszą
  się algebraicznie) i wnosi jeden mod o wartości dokładnie ``−1/TB``.
- **TGOV1** = człon inercyjny z anti-windup + lead-lag ``(1+sT2)/(1+sT3)`` +
  człon tłumiący ``Dt``. Ustawienie ``T2 = T3`` i ``Dt = 0`` zostawia część
  wspólną z naszym `RegulatorTurbiny`; lead-lag wnosi mod ``−1/T3``.
- Ograniczniki po obu stronach dostają te same wartości, ale w porównaniu
  małosygnałowym **są nieaktywne** — więc anti-windup NIE jest zwalidowany.
  Dodatkowo nasz AVR ogranicza ŻĄDANIE (``K_a·(V_ref−V_t)``), czego SEXS nie
  robi; ta różnica ujawnia się dopiero przy głębokim zapadzie napięcia i nie ma
  tu wzorca.

CO WNOSI, A CZEGO NIE WNOSI PORÓWNANIE WIDM
--------------------------------------------
Porównujemy CAŁE widmo, nie tylko mod elektromechaniczny, bo model może mieć
poprawną częstotliwość wahań i błędną stałą czasową obwodu wzbudzenia. Mody bez
odpowiednika są RAPORTOWANE, nie pomijane:
- po stronie ANDES: tłumiki (``−1/Td0''``, ``−1/Tq0''``) i lead-lag regulatorów;
- po stronie laboratorium: **zera strukturalne**. `ZespolSynchroniczny` trzyma
  ``Efd`` i ``Pm`` jako stany także wtedy, gdy nie ma regulatora — wiersze
  jakobianu są wtedy identycznie zerowe. To artefakt reprezentacji laboratorium
  (w ANDES ``vf`` jest wtedy stałą algebraiczną), a nie mod fizyczny.

Identyfikacja modów opiera się na optymalnym skojarzeniu odległościowym
(`scipy.optimize.linear_sum_assignment`), **nie** na współczynnikach
uczestnictwa — czyli mówi „ten mod ma odpowiednik o tej wartości", a nie „ten
mod należy do tego stanu". Nazwy w tym module trzymają się tej granicy.

PUŁAPKI ZMIERZONE PRZY BUDOWIE PRZYPADKU ANDES
-----------------------------------------------
1. **Baza częstotliwości.** ``ss.config.freq = 50`` NIE DZIAŁA także dla GENROU:
   zmierzono ``GENROU.fn = 60`` mimo ustawienia. Skuteczny jest wyłącznie ``fn``
   podawany PRZY URZĄDZENIU. Skutek pominięcia: mod elektromechaniczny
   8,955 j → 9,870 j, czyli 10,2 % za wysoko. Sprawdzane jawnie przez
   `wzorzec_zewnetrzny._sprawdz_baze_czestotliwosci` (ta sama funkcja, żeby nie
   powstały dwa progi tej samej rzeczy).
2. **Wyłączenie nasycenia.** Intuicyjne ``S10 = S12 = 0`` NIE wyłącza nasycenia
   w sposób jawny: ANDES ma korektę ``_fS12``, która podmienia ``S12 = 0`` na
   ``1``. Poprawne wyłączenie to ``S10 = 0`` przy ``S12 = 1`` (wtedy
   ``SAT_B = 0``). `PrzypadekGenrou` odrzuca ``s12 = 0``, żeby nikt nie
   raportował „nasycenie wyłączone" na podstawie wartości, którą narzędzie po
   cichu zmieniło.
3. **``xd2`` musi równać się ``xq2``**, inaczej inicjalizacja GENROU jest
   niespójna (wymaganie samego ANDES-a). Stąd w `PrzypadekGenrou` jedna wspólna
   reaktancja przejściowa ``x_prim_pu`` i jedna podprzejściowa ``x_bis_pu``.

DŁUG ZAPISANY JAWNIE
--------------------
Testy tego modułu są bramkowane ``importorskip("andes")``, bo ANDES nie jest
zależnością repozytorium. Dopóki nie jest zależnością deweloperską wpiętą w CI,
ten wzorzec jest NARZĘDZIEM BADAWCZYM, a nie obowiązującą bramką — dokładnie tak
samo jak `wzorzec_zewnetrzny.py` (pozycja decyzyjna D-13).
"""

from __future__ import annotations

import contextlib
import io
import math
from dataclasses import dataclass, replace
from typing import Any

import numpy as np
from numpy.typing import NDArray
from scipy.optimize import linear_sum_assignment

from dynamic_lab.konwencje import F_BAZOWA_HZ
from dynamic_lab.regulatory import RegulatorNapiecia, RegulatorTurbiny
from dynamic_lab.siec import Galaz, TopologiaSieci
from dynamic_lab.silnik import ModelDynamiczny, SilnikRMS
from dynamic_lab.sztywnosc import KROK_ROZNICOWY_WIDMA, jakobian_numeryczny
from dynamic_lab.urzadzenia import MaszynaSynchroniczna4Rzedu, ZespolSynchroniczny
from dynamic_lab.wzorzec_zewnetrzny import (
    BrakWzorcaError,
    _sprawdz_baze_czestotliwosci,
    czy_wzorzec_dostepny,
    wersja_wzorca,
)

__all__ = [
    "DopasowanieWidm",
    "ModeleNierownowazneError",
    "NastawyTurbiny",
    "NastawyWzbudzenia",
    "PomiarRozbieznosci",
    "PorownanieGenrou",
    "PozycjaZakresu",
    "PrzypadekGenrou",
    "WynikGenrou",
    "ZAKRES_WALIDACJI",
    "dopasuj_widma",
    "mod_z_trajektorii",
    "porownaj_z_wzorcem",
    "raport_zakresu_walidacji",
    "rozbieznosc_od_nasycenia",
    "rozbieznosc_od_reaktancji_podprzejsciowej",
    "rozbieznosc_od_stalej_tlumika",
    "tabela_zakresu_walidacji",
    "wynik_laboratorium",
    "wynik_wzorca",
    "zmierz_mod_oscylacyjny",
]


class ModeleNierownowazneError(RuntimeError):
    """Porównanie zażądano na przypadku, w którym modele NIE są równoważne.

    Podnoszone zamiast zwrócenia liczby, bo liczba bez tego kontekstu zostałaby
    odczytana jako miara błędu laboratorium, a jest miarą RÓŻNICY MODELI.
    """


#: Tolerancja algebry sieci. Ostrzejsza niż domyślna (1e-12) z tego samego
#: powodu co w `sztywnosc`: jakobian widma liczony jest różnicami centralnymi
#: o kroku 1e-6, więc szum sieci wchodzi do wyrazów jakobianu wzmocniony 1e6
#: razy. Przy 1e-13 daje to ~1e-7 — zmierzony rząd rozbieżności widm.
TOLERANCJA_SIECI: float = 1.0e-13

#: Próg [s⁻¹], poniżej którego ``|λ|`` laboratorium uznajemy za ZERO
#: STRUKTURALNE (stały stan ``Efd``/``Pm`` bez regulatora). Dobór nie jest
#: dowolny: te zera są dokładnie zerowe (wiersz jakobianu identycznie zerowy),
#: a najwolniejszy niezerowy mod zmierzony w zamiataniach to 0,199 s⁻¹ —
#: pięć rzędów wielkości powyżej progu.
PROG_ZERA_WIDMA: float = 1.0e-6


# ---------------------------------------------------------------------------
# Specyfikacja przypadku — JEDNA dla obu narzędzi
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PrzypadekGenrou:
    """Wspólna specyfikacja przypadku SMIB dla ANDES GENROU i laboratorium.

    Jedna struktura karmi oba narzędzia, więc nie da się porównać dwóch RÓŻNYCH
    układów i uznać rozbieżności za błąd modelu (albo — gorzej — zgodności za
    dowód).

    OGRANICZENIE NARZUCONE PRZEZ ANDES, nie przez nas: GENROU inicjalizuje się
    spójnie tylko dla ``xd'' = xq''`` — stąd JEDNA ``x_bis_pu``, a nie dwie.
    Konsekwencja jest istotna i wprost widoczna w `powody_nierownowaznosci`:
    redukcja dokładna R1 wymaga zerowego odstępu w OBU osiach, więc zachodzi
    wyłącznie przy ``Xd' = Xq'``. Przypadek ``Xd' ≠ Xq'`` — czyli domyślna,
    realistyczna parametryzacja laboratorium (``Xd' = 0,30``, ``Xq' = 0,55``) —
    jest porównywalny tylko w granicy R2 (``Td0'' → 0``), i moduł mówi to
    wprost zamiast go zabraniać albo udawać równoważność.

    ``x_bis_pu = None`` oznacza „równa ``x_prim_pu``"; ``xq_prim_pu = None``
    oznacza „równa ``x_prim_pu``", czyli maszynę izotropową przejściowo.
    """

    xd_pu: float = 1.9
    xq_pu: float = 1.7
    x_prim_pu: float = 0.30
    """``Xd'`` [p.u.] — reaktancja przejściowa osi d."""
    xq_prim_pu: float | None = None
    """``Xq'`` [p.u.]; ``None`` = równa ``x_prim_pu`` (maszyna izotropowa)."""
    x_bis_pu: float | None = None
    """``Xd'' = Xq''`` [p.u.] (ANDES wymaga równości); ``None`` = ``x_prim_pu``."""
    td0_prim_s: float = 8.0
    tq0_prim_s: float = 0.8
    td0_bis_s: float = 0.03
    tq0_bis_s: float = 0.02
    """Stałe czasowe tłumików. RÓŻNE świadomie: gdyby były równe, zamiana
    ``Td0''`` z ``Tq0''`` w mapowaniu parametrów byłaby niewykrywalna."""
    h_s: float = 4.0
    d_tlumienie: float = 0.0
    ra_pu: float = 0.0
    xl_pu: float = 0.0
    s10: float = 0.0
    s12: float = 1.0
    x_linii_pu: float = 0.15
    p_gen_pu: float = 0.50
    v_gen_pu: float = 1.00
    v_sys_pu: float = 1.00
    s_bazowa_mva: float = 100.0
    u_znamionowe_kv: float = 110.0

    def __post_init__(self) -> None:
        if self.x_prim_pu <= 0.0:
            raise ValueError("x_prim_pu musi być > 0")
        if self.xq_prim_efektywne <= 0.0:
            raise ValueError("xq_prim_pu musi być > 0")
        if self.x_bis_efektywne <= 0.0:
            raise ValueError("x_bis_pu musi być > 0")
        najmniejsza_przejsciowa = min(self.x_prim_pu, self.xq_prim_efektywne)
        if self.x_bis_efektywne > najmniejsza_przejsciowa:
            raise ValueError(
                f"Xd'' = Xq'' = {self.x_bis_efektywne:g} > min(Xd', Xq') = "
                f"{najmniejsza_przejsciowa:g}: reaktancja podprzejściowa nie może "
                "przewyższać przejściowej w żadnej osi."
            )
        if self.xl_pu > self.x_bis_efektywne:
            raise ValueError(
                f"xl = {self.xl_pu:g} > Xd'' = {self.x_bis_efektywne:g} — GENROU wymaga "
                "xl <= xd2 i inaczej inicjalizuje się niespójnie."
            )
        if self.xd_pu < self.x_prim_pu or self.xq_pu < self.xq_prim_efektywne:
            raise ValueError("Reaktancja przejściowa większa od synchronicznej")
        for nazwa, wartosc in (
            ("td0_prim_s", self.td0_prim_s),
            ("tq0_prim_s", self.tq0_prim_s),
            ("td0_bis_s", self.td0_bis_s),
            ("tq0_bis_s", self.tq0_bis_s),
            ("h_s", self.h_s),
        ):
            if wartosc <= 0.0:
                raise ValueError(f"{nazwa} musi być > 0")
        if self.s10 < 0.0:
            raise ValueError("s10 musi być >= 0")
        if self.s12 == 0.0:
            raise ValueError(
                "s12 = 0 jest PUŁAPKĄ: ANDES po cichu podmienia je na 1 (korekta `_fS12`), "
                "więc przypadek liczyłby się z innym parametrem niż zapisany. Nasycenie "
                "wyłącza się przez s10 = 0 przy s12 = 1."
            )
        if self.s12 < 0.0:
            raise ValueError("s12 musi być > 0")

    @property
    def xq_prim_efektywne(self) -> float:
        """``Xq'`` faktycznie użyte (``None`` znaczy „równa ``x_prim_pu``")."""
        return self.x_prim_pu if self.xq_prim_pu is None else self.xq_prim_pu

    @property
    def x_bis_efektywne(self) -> float:
        """``Xd'' = Xq''`` faktycznie użyte (``None`` znaczy „równa ``x_prim_pu``")."""
        return self.x_prim_pu if self.x_bis_pu is None else self.x_bis_pu

    @property
    def odstep_podprzejsciowy_d_pu(self) -> float:
        """``Xd' − Xd''`` — parametr, który RÓŻNI modele w osi d."""
        return self.x_prim_pu - self.x_bis_efektywne

    @property
    def odstep_podprzejsciowy_q_pu(self) -> float:
        """``Xq' − Xq''`` — parametr, który RÓŻNI modele w osi q.

        Osobno od osi d, bo ANDES wymusza ``Xd'' = Xq''``: przy ``Xd' ≠ Xq'``
        oba odstępy NIE MOGĄ być jednocześnie zerowe i zlanie ich w jedną liczbę
        ukryłoby ten fakt.
        """
        return self.xq_prim_efektywne - self.x_bis_efektywne

    @property
    def anizotropia_przejsciowa(self) -> bool:
        """Czy ``Xd' ≠ Xq'`` — czyli czy redukcja dokładna R1 jest w ogóle możliwa."""
        return self.xq_prim_efektywne != self.x_prim_pu

    @property
    def powody_nierownowaznosci(self) -> tuple[str, ...]:
        """Wszystkie powody, dla których GENROU nie redukuje się DOKŁADNIE.

        Pusta krotka znaczy: modele są strukturalnie równoważne (redukcja R1).
        Lista jest ZAMKNIĘTA — pilnuje jej test przypinający każdy powód do
        osobnego pomiaru rozbieżności.
        """
        powody: list[str] = []
        if self.anizotropia_przejsciowa:
            powody.append(
                f"anizotropia przejściowa: Xd' = {self.x_prim_pu:g} ≠ Xq' = "
                f"{self.xq_prim_efektywne:g}, a GENROU wymaga Xd'' = Xq'', więc odstęp "
                "podprzejściowy nie może zniknąć w obu osiach naraz — zostaje wyłącznie "
                "równoważność asymptotyczna R2 (Td0'' → 0)"
            )
        if self.odstep_podprzejsciowy_d_pu != 0.0 or self.odstep_podprzejsciowy_q_pu != 0.0:
            powody.append(
                f"uzwojenia tłumiące czynne: Xd' − Xd'' = "
                f"{self.odstep_podprzejsciowy_d_pu:g} p.u., Xq' − Xq'' = "
                f"{self.odstep_podprzejsciowy_q_pu:g} p.u. (równoważność dokładna wymaga "
                "zera w OBU osiach, inaczej zostaje granica Td0'' → 0)"
            )
        if self.s10 != 0.0:
            powody.append(
                f"nasycenie GENROU czynne: S10 = {self.s10:g} (laboratorium nie ma nasycenia)"
            )
        return tuple(powody)

    @property
    def rownowazne_strukturalnie(self) -> bool:
        return not self.powody_nierownowaznosci


@dataclass(frozen=True)
class NastawyWzbudzenia:
    """Nastawy wzbudnicy podawane OBU narzędziom (SEXS ↔ `RegulatorNapiecia`).

    ``t_lead_lag_s`` to ``TB`` modelu SEXS. Ustawiamy ``TATB = 1``, więc
    ``TA = TB`` i człon lead-lag ma transmitancję tożsamościową — jest to
    świadome UNIECZYNNIENIE części, której laboratorium nie ma, a nie
    dopasowanie parametru pod wynik. Jego stan zostaje w modelu ANDES i wnosi
    jeden mod odsprzężony o wartości ``−1/TB``; moduł raportuje go jako mod bez
    odpowiednika, nie ukrywa.
    """

    k_a: float = 200.0
    t_a_s: float = 0.05
    efd_min: float = 0.0
    efd_max: float = 5.0
    t_lead_lag_s: float = 1.0

    def __post_init__(self) -> None:
        if self.t_a_s <= 0.0 or self.t_lead_lag_s <= 0.0:
            raise ValueError("Stałe czasowe wzbudnicy muszą być > 0")
        if self.k_a == 0.0:
            raise ValueError("k_a = 0 jest odrzucane przez SEXS (parametr non_zero)")

    def regulator_laboratorium(self) -> RegulatorNapiecia:
        """`RegulatorNapiecia` o tych samych nastawach.

        ``v_ref_pu`` jest tu bez znaczenia: `ZespolSynchroniczny.inicjalizuj`
        wyznacza je z warunku równowagi (``dEfd/dt = 0``) — tak samo jak SEXS
        liczy ``vref = v + vf0/K``.
        """
        return RegulatorNapiecia(
            k_a=self.k_a,
            t_a_s=self.t_a_s,
            efd_min=self.efd_min,
            efd_max=self.efd_max,
        )

    @property
    def mod_lead_lag(self) -> complex:
        """Mod wnoszony przez unieczynniony lead-lag SEXS — ``−1/TB``."""
        return complex(-1.0 / self.t_lead_lag_s, 0.0)


@dataclass(frozen=True)
class NastawyTurbiny:
    """Nastawy regulatora turbiny podawane OBU narzędziom (TGOV1 ↔ `RegulatorTurbiny`).

    ``t_lead_lag_s`` to ``T3`` modelu TGOV1; ustawiamy ``T2 = T3``, więc lead-lag
    jest tożsamościowy, a ``Dt = 0`` usuwa człon tłumiący turbiny, którego
    laboratorium nie ma. Obie decyzje unieczynniają CZĘŚĆ RÓŻNIĄCĄ, zamiast
    stroić parametry pod wynik.
    """

    r_statyzm: float = 0.05
    t_g_s: float = 0.5
    p_min_pu: float = 0.0
    p_max_pu: float = 1.2
    t_lead_lag_s: float = 1.0

    def __post_init__(self) -> None:
        if self.t_g_s <= 0.0 or self.t_lead_lag_s <= 0.0:
            raise ValueError("Stałe czasowe turbiny muszą być > 0")
        if self.r_statyzm <= 0.0:
            raise ValueError("r_statyzm musi być > 0")

    def regulator_laboratorium(self) -> RegulatorTurbiny:
        return RegulatorTurbiny(
            r_statyzm=self.r_statyzm,
            t_g_s=self.t_g_s,
            p_min_pu=self.p_min_pu,
            p_max_pu=self.p_max_pu,
        )

    @property
    def mod_lead_lag(self) -> complex:
        """Mod wnoszony przez unieczynniony lead-lag TGOV1 — ``−1/T3``."""
        return complex(-1.0 / self.t_lead_lag_s, 0.0)


# ---------------------------------------------------------------------------
# Wyniki i ich porównanie
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class WynikGenrou:
    """Wielkości porównywalne między narzędziami — z jawnym źródłem i metodą."""

    zrodlo: str
    metoda: str
    delta0_rad: float
    e_q_prim_pu: float
    e_d_prim_pu: float
    efd_pu: float
    v_gen_modul_pu: float
    v_gen_kat_rad: float
    p_gen_pu: float
    q_gen_pu: float
    wartosci_wlasne: tuple[complex, ...]
    baza_czestotliwosci_hz: float

    @property
    def mody_oscylacyjne(self) -> tuple[complex, ...]:
        """Wartości własne o niezerowej części urojonej (jedna z pary sprzężonej)."""
        return tuple(w for w in self.wartosci_wlasne if w.imag > PROG_ZERA_WIDMA)

    @property
    def mod_najslabiej_tlumiony(self) -> complex:
        """Mod oscylacyjny o najmniejszym ``|Re λ|``.

        NAZWA JEST DOSŁOWNA. To NIE jest „mod elektromechaniczny": identyfikacja
        modu ze stanem wymaga współczynników uczestnictwa, których ten moduł nie
        liczy. W przypadkach tego modułu (SMIB bez i z regulatorami) najsłabiej
        tłumiony mod oscylacyjny JEST modem elektromechanicznym — zmierzono —
        ale to własność tych przypadków, nie definicja.

        Raises:
            ValueError: gdy widmo nie ma modu oscylacyjnego. Brak pomiaru jest
                wynikiem uczciwym, a nie powodem do podstawienia wartości.
        """
        mody = self.mody_oscylacyjne
        if not mody:
            raise ValueError(
                f"{self.zrodlo}: widmo nie zawiera modu oscylacyjnego — nie ma czego porównywać."
            )
        return min(mody, key=lambda w: abs(w.real))

    @property
    def f_oscylacji_hz(self) -> float:
        """Częstotliwość najsłabiej tłumionego modu oscylacyjnego [Hz]."""
        return abs(self.mod_najslabiej_tlumiony.imag) / (2.0 * math.pi)

    @property
    def v_gen_zespolone(self) -> complex:
        return complex(
            self.v_gen_modul_pu * math.cos(self.v_gen_kat_rad),
            self.v_gen_modul_pu * math.sin(self.v_gen_kat_rad),
        )


@dataclass(frozen=True)
class DopasowanieWidm:
    """Skojarzenie widma laboratorium z widmem wzorca — z jawnymi resztami.

    Trzy zbiory są rozdzielone świadomie, bo znaczą co innego:
      - ``pary``: mody, które mają odpowiednik po obu stronach,
      - ``zera_strukturalne_laboratorium``: stany stałe laboratorium (``Efd``,
        ``Pm`` bez regulatora) — artefakt reprezentacji, nie fizyka,
      - ``mody_wzorca_bez_odpowiednika``: to, czego nasz model NIE MA
        (tłumiki, lead-lag regulatorów).
    """

    pary: tuple[tuple[complex, complex], ...]
    zera_strukturalne_laboratorium: tuple[complex, ...]
    mody_wzorca_bez_odpowiednika: tuple[complex, ...]

    @property
    def maks_blad_wzgledny(self) -> float:
        """``max |λ_lab − λ_wzorzec| / |λ_wzorzec|`` po wszystkich parach."""
        if not self.pary:
            raise ValueError("Brak par — błąd dopasowania nie istnieje")
        return max(abs(a - b) / abs(b) for a, b in self.pary)

    def raport(self) -> str:
        wiersze = ["| λ laboratorium | λ wzorzec | błąd względny |", "|---|---|---|"]
        for lab, wzo in sorted(self.pary, key=lambda p: (p[1].real, abs(p[1].imag))):
            wiersze.append(
                f"| {lab.real:+.6f}{lab.imag:+.6f}j | {wzo.real:+.6f}{wzo.imag:+.6f}j "
                f"| {abs(lab - wzo) / abs(wzo):.3e} |"
            )
        for wzo in sorted(self.mody_wzorca_bez_odpowiednika, key=lambda w: w.real):
            wiersze.append(f"| — (brak w modelu 4. rzędu) | {wzo.real:+.6f}{wzo.imag:+.6f}j | — |")
        for lab in self.zera_strukturalne_laboratorium:
            wiersze.append(f"| {lab.real:+.3e}{lab.imag:+.3e}j (stan stały) | — | — |")
        return "\n".join(wiersze)


def dopasuj_widma(
    laboratorium: tuple[complex, ...] | NDArray[np.complex128],
    wzorzec: tuple[complex, ...] | NDArray[np.complex128],
    *,
    prog_zera: float = PROG_ZERA_WIDMA,
) -> DopasowanieWidm:
    """Skojarz mody laboratorium z modami wzorca minimalizując sumę odległości.

    Skojarzenie jest OPTYMALNE globalnie (``linear_sum_assignment``), nie
    zachłanne. Zachłanne przypisanie „najbliższy wolny" bywa niestabilne przy
    bliskich modach: pierwszy mod zabiera partnera drugiego i błąd rośnie o
    rzędy wielkości bez żadnej zmiany w fizyce — to byłby wynik zależny od
    kolejności, czyli nie wynik.

    Mody laboratorium o ``|λ| <= prog_zera`` są ODKŁADANE jako zera strukturalne
    ZANIM dojdzie do kojarzenia; bez tego zero mogłoby „zabrać" partnera
    prawdziwemu modowi.

    Raises:
        ValueError: gdy laboratorium ma więcej modów dynamicznych niż wzorzec.
            Cicha utrata modu byłaby ukryciem sprzeczności między modelami.
    """
    lab = np.asarray(laboratorium, dtype=np.complex128)
    wzo = np.asarray(wzorzec, dtype=np.complex128)
    if wzo.size == 0:
        raise ValueError("Puste widmo wzorca — nie ma czego dopasowywać")
    zera = tuple(complex(w) for w in lab if abs(w) <= prog_zera)
    dynamiczne = np.array([w for w in lab if abs(w) > prog_zera], dtype=np.complex128)
    if dynamiczne.size == 0:
        raise ValueError("Widmo laboratorium składa się z samych zer strukturalnych")
    if dynamiczne.size > wzo.size:
        raise ValueError(
            f"Laboratorium ma {dynamiczne.size} modów dynamicznych, wzorzec {wzo.size}. "
            "Skojarzenie zgubiłoby mod laboratorium — to sprzeczność modeli, nie szczegół."
        )
    koszt = np.abs(dynamiczne[:, None] - wzo[None, :])
    wiersze, kolumny = linear_sum_assignment(koszt)
    pary = tuple(
        (complex(dynamiczne[i]), complex(wzo[j])) for i, j in zip(wiersze, kolumny, strict=True)
    )
    uzyte = {int(j) for j in kolumny}
    reszta = tuple(complex(wzo[j]) for j in range(wzo.size) if j not in uzyte)
    return DopasowanieWidm(
        pary=pary,
        zera_strukturalne_laboratorium=zera,
        mody_wzorca_bez_odpowiednika=reszta,
    )


@dataclass(frozen=True)
class PorownanieGenrou:
    """Wynik porównania laboratorium ze wzorcem na JEDNYM przypadku."""

    przypadek: PrzypadekGenrou
    wzbudnica: NastawyWzbudzenia | None
    turbina: NastawyTurbiny | None
    wzorzec: WynikGenrou
    laboratorium: WynikGenrou
    dopasowanie: DopasowanieWidm

    @staticmethod
    def _blad_wzgledny(odniesienie: float, badane: float) -> float:
        if abs(odniesienie) < 1.0e-12:
            return abs(badane)
        return abs(badane - odniesienie) / abs(odniesienie)

    @property
    def blad_delta0(self) -> float:
        return self._blad_wzgledny(self.wzorzec.delta0_rad, self.laboratorium.delta0_rad)

    @property
    def blad_e_q_prim(self) -> float:
        return self._blad_wzgledny(self.wzorzec.e_q_prim_pu, self.laboratorium.e_q_prim_pu)

    @property
    def blad_e_d_prim(self) -> float:
        return self._blad_wzgledny(self.wzorzec.e_d_prim_pu, self.laboratorium.e_d_prim_pu)

    @property
    def blad_efd(self) -> float:
        return self._blad_wzgledny(self.wzorzec.efd_pu, self.laboratorium.efd_pu)

    @property
    def blad_napiecia_modul(self) -> float:
        return self._blad_wzgledny(self.wzorzec.v_gen_modul_pu, self.laboratorium.v_gen_modul_pu)

    @property
    def blad_napiecia_kat(self) -> float:
        return self._blad_wzgledny(self.wzorzec.v_gen_kat_rad, self.laboratorium.v_gen_kat_rad)

    @property
    def blad_punktu_pracy(self) -> float:
        """Najgorszy błąd względny wśród wielkości punktu pracy."""
        return max(
            self.blad_delta0,
            self.blad_e_q_prim,
            self.blad_e_d_prim,
            self.blad_efd,
            self.blad_napiecia_modul,
            self.blad_napiecia_kat,
        )

    @property
    def blad_widma(self) -> float:
        return self.dopasowanie.maks_blad_wzgledny

    @property
    def blad_modu_najslabiej_tlumionego(self) -> float:
        wzo = self.wzorzec.mod_najslabiej_tlumiony
        return abs(self.laboratorium.mod_najslabiej_tlumiony - wzo) / abs(wzo)

    @property
    def mody_oczekiwane_bez_odpowiednika(self) -> tuple[complex, ...]:
        """Mody, o których Z GÓRY WIADOMO, że nasz model ich nie ma.

        Tłumiki ``−1/Td0''`` i ``−1/Tq0''`` (zawsze) oraz lead-lag każdego
        podłączonego regulatora. Jawna lista pozwala testowi sprawdzić, że
        „mody bez odpowiednika" to DOKŁADNIE te — a nie że coś się zgubiło.
        """
        oczekiwane = [
            complex(-1.0 / self.przypadek.td0_bis_s, 0.0),
            complex(-1.0 / self.przypadek.tq0_bis_s, 0.0),
        ]
        if self.wzbudnica is not None:
            oczekiwane.append(self.wzbudnica.mod_lead_lag)
        if self.turbina is not None:
            oczekiwane.append(self.turbina.mod_lead_lag)
        return tuple(oczekiwane)

    @property
    def liczba_zer_strukturalnych_oczekiwana(self) -> int:
        """Ile stanów laboratorium jest stałych: ``Efd`` bez AVR, ``Pm`` bez governora."""
        return int(self.wzbudnica is None) + int(self.turbina is None)

    def raport(self) -> str:
        w, lab = self.wzorzec, self.laboratorium
        naglowek = [
            f"WZORZEC      : {w.zrodlo} ({w.metoda}), baza {w.baza_czestotliwosci_hz:g} Hz",
            f"LABORATORIUM : {lab.zrodlo} ({lab.metoda})",
            "MODELE RÓWNOWAŻNE: "
            + (
                "tak (redukcja Xd''=Xd', S10=0)"
                if self.przypadek.rownowazne_strukturalnie
                else "NIE — " + "; ".join(self.przypadek.powody_nierownowaznosci)
            ),
            "",
            "## Punkt pracy",
            f"  delta0  : {w.delta0_rad:.9f} rad | lab {lab.delta0_rad:.9f}"
            f" | blad {self.blad_delta0:.3e}",
            f"  E'q     : {w.e_q_prim_pu:.9f} pu  | lab {lab.e_q_prim_pu:.9f}"
            f" | blad {self.blad_e_q_prim:.3e}",
            f"  E'd     : {w.e_d_prim_pu:.9f} pu  | lab {lab.e_d_prim_pu:.9f}"
            f" | blad {self.blad_e_d_prim:.3e}",
            f"  Efd     : {w.efd_pu:.9f} pu  | lab {lab.efd_pu:.9f}" f" | blad {self.blad_efd:.3e}",
            f"  |V_gen| : {w.v_gen_modul_pu:.9f} pu  | lab {lab.v_gen_modul_pu:.9f}"
            f" | blad {self.blad_napiecia_modul:.3e}",
            f"  arg V   : {w.v_gen_kat_rad:.9f} rad | lab {lab.v_gen_kat_rad:.9f}"
            f" | blad {self.blad_napiecia_kat:.3e}",
            "",
            "## Widmo (skojarzenie odległościowe, NIE współczynniki uczestnictwa)",
        ]
        return "\n".join([*naglowek, self.dopasowanie.raport()])


# ---------------------------------------------------------------------------
# Wzorzec zewnętrzny — ANDES GENROU (+ SEXS, + TGOV1)
# ---------------------------------------------------------------------------


def _zbuduj_andes_genrou(
    przypadek: PrzypadekGenrou,
    *,
    fn_hz: float,
    wzbudnica: NastawyWzbudzenia | None,
    turbina: NastawyTurbiny | None,
) -> Any:
    """Zbuduj i rozwiąż SMIB z GENROU w ANDES; ``fn_hz`` jest jawny, żeby dało
    się go zepsuć w teście pułapki bazy częstotliwości."""
    import andes

    x_bis = przypadek.x_bis_efektywne
    ss = andes.System()
    ss.add(
        "Bus",
        {
            "idx": 1,
            "Vn": przypadek.u_znamionowe_kv,
            "v0": przypadek.v_gen_pu,
            "name": "GEN",
        },
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
    ss.add(
        "Line",
        {
            "idx": 1,
            "bus1": 1,
            "bus2": 2,
            "r": 0.0,
            "x": przypadek.x_linii_pu,
            "b": 0.0,
            "fn": fn_hz,
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
        "GENROU",
        {
            "idx": 1,
            "bus": 1,
            "gen": 1,
            "Sn": przypadek.s_bazowa_mva,
            "Vn": przypadek.u_znamionowe_kv,
            "fn": fn_hz,
            "D": przypadek.d_tlumienie,
            "M": 2.0 * przypadek.h_s,
            "ra": przypadek.ra_pu,
            "xl": przypadek.xl_pu,
            "xd": przypadek.xd_pu,
            "xq": przypadek.xq_pu,
            "xd1": przypadek.x_prim_pu,
            "xq1": przypadek.xq_prim_efektywne,
            "xd2": x_bis,
            "xq2": x_bis,
            "Td10": przypadek.td0_prim_s,
            "Tq10": przypadek.tq0_prim_s,
            "Td20": przypadek.td0_bis_s,
            "Tq20": przypadek.tq0_bis_s,
            "S10": przypadek.s10,
            "S12": przypadek.s12,
        },
    )
    if wzbudnica is not None:
        ss.add(
            "SEXS",
            {
                "idx": 1,
                "syn": 1,
                "TATB": 1.0,
                "TB": wzbudnica.t_lead_lag_s,
                "K": wzbudnica.k_a,
                "TE": wzbudnica.t_a_s,
                "EMIN": wzbudnica.efd_min,
                "EMAX": wzbudnica.efd_max,
            },
        )
    if turbina is not None:
        ss.add(
            "TGOV1",
            {
                "idx": 1,
                "syn": 1,
                "R": turbina.r_statyzm,
                "T1": turbina.t_g_s,
                "T2": turbina.t_lead_lag_s,
                "T3": turbina.t_lead_lag_s,
                "Dt": 0.0,
                "VMAX": turbina.p_max_pu,
                "VMIN": turbina.p_min_pu,
            },
        )
    # ANDES pisze obszerny log na stdout — ucisz go, ale NIE ukrywaj wyjątków.
    cisza = io.StringIO()
    with contextlib.redirect_stdout(cisza), contextlib.redirect_stderr(cisza):
        ss.setup()
        if not ss.PFlow.run():
            raise BrakWzorcaError("ANDES: rozpływ mocy nie zbiegł — brak punktu odniesienia")
        ss.TDS.init()
        if not ss.EIG.run():
            raise BrakWzorcaError("ANDES: analiza wartości własnych nie powiodła się")
    return ss


def _sprawdz_baze_mocy(ss: Any, przypadek: PrzypadekGenrou) -> None:
    """Baza mocy URZĄDZENIA musi równać się bazie mocy SYSTEMU we wzorcu.

    ANDES przelicza parametry oznaczone ``power``/``ipower`` (``M``, ``D``,
    ``VMAX``, ``R``) z bazy urządzenia na bazę systemu, a laboratorium NIE robi
    żadnego przeliczenia — `MaszynaSynchroniczna4Rzedu.h_s` jest z definicji
    „już na bazie sieci". Przy różnych bazach oba narzędzia liczyłyby inną
    maszynę, a rozbieżność wyglądałaby jak błąd modelu. Ta pułapka jest cicha,
    więc musi być sprawdzona, a nie opisana.
    """
    baza_systemu = float(ss.config.mva)
    if baza_systemu != przypadek.s_bazowa_mva:
        raise ModeleNierownowazneError(
            f"Baza mocy urządzenia {przypadek.s_bazowa_mva:g} MVA ≠ baza systemu wzorca "
            f"{baza_systemu:g} MVA. ANDES przeskalowałby M, D i ograniczniki, a "
            "laboratorium nie przelicza baz — porównywane byłyby dwie różne maszyny."
        )


def _sprawdz_unieczynnienie_lead_lag(
    ss: Any, wzbudnica: NastawyWzbudzenia | None, turbina: NastawyTurbiny | None
) -> None:
    """Sprawdź, że człony, które MIAŁY być unieczynnione, faktycznie są.

    Gdyby ANDES policzył ``TA ≠ TB`` (np. po zmianie znaczenia ``TATB``),
    porównywalibyśmy nasz regulator pierwszego rzędu z regulatorem z czynnym
    lead-lagiem i nazwali różnicę błędem laboratorium. Sprawdzenie kosztuje
    jedno porównanie i zamyka całą klasę takich pomyłek.
    """
    if wzbudnica is not None:
        t_a = float(ss.SEXS.TA.v[0])
        t_b = float(ss.SEXS.TB.v[0])
        if t_a != t_b:
            raise ModeleNierownowazneError(
                f"SEXS: TA = {t_a:g} ≠ TB = {t_b:g} — lead-lag jest CZYNNY, więc wzorzec "
                "ma człon, którego laboratorium nie ma. Porównanie byłoby fałszywe."
            )
    if turbina is not None:
        t_2 = float(ss.TGOV1.T2.v[0])
        t_3 = float(ss.TGOV1.T3.v[0])
        d_t = float(ss.TGOV1.Dt.v[0])
        if t_2 != t_3:
            raise ModeleNierownowazneError(
                f"TGOV1: T2 = {t_2:g} ≠ T3 = {t_3:g} — lead-lag jest CZYNNY."
            )
        if d_t != 0.0:
            raise ModeleNierownowazneError(
                f"TGOV1: Dt = {d_t:g} ≠ 0 — czynny człon tłumiący turbiny bez odpowiednika."
            )


def wynik_wzorca(
    przypadek: PrzypadekGenrou | None = None,
    *,
    fn_hz: float | None = None,
    wzbudnica: NastawyWzbudzenia | None = None,
    turbina: NastawyTurbiny | None = None,
) -> WynikGenrou:
    """Rozwiązanie wzorcowe z ANDES: punkt pracy + PEŁNE widmo wartości własnych.

    Widmo pochodzi z ``ss.EIG.mu``, czyli z linearyzacji z wyeliminowanymi
    zmiennymi algebraicznymi — ta sama wielkość, którą po naszej stronie daje
    jakobian ``df/dx`` silnika (algebra sieci jest rozwiązywana wewnątrz ``f``).
    """
    if not czy_wzorzec_dostepny():
        raise BrakWzorcaError(
            "ANDES nie jest zainstalowany. Brak wzorca to BRAK PORÓWNANIA — "
            "nie wolno tego raportować jako zgodności."
        )
    przypadek = przypadek or PrzypadekGenrou()
    uzyte_fn = F_BAZOWA_HZ if fn_hz is None else fn_hz
    ss = _zbuduj_andes_genrou(przypadek, fn_hz=uzyte_fn, wzbudnica=wzbudnica, turbina=turbina)
    _sprawdz_baze_czestotliwosci(float(ss.GENROU.fn.v[0]))
    _sprawdz_baze_mocy(ss, przypadek)
    _sprawdz_unieczynnienie_lead_lag(ss, wzbudnica, turbina)

    wartosci = tuple(complex(w) for w in ss.EIG.mu)
    if not wartosci:
        raise BrakWzorcaError("ANDES nie zwrócił żadnej wartości własnej")
    return WynikGenrou(
        zrodlo=wersja_wzorca(),
        metoda="GENROU + wartości własne linearyzacji (EIG)",
        delta0_rad=float(ss.GENROU.delta.v[0]),
        e_q_prim_pu=float(ss.GENROU.e1q.v[0]),
        e_d_prim_pu=float(ss.GENROU.e1d.v[0]),
        efd_pu=float(ss.GENROU.vf.v[0]),
        v_gen_modul_pu=float(ss.Bus.v.v[0]),
        v_gen_kat_rad=float(ss.Bus.a.v[0]),
        p_gen_pu=float(ss.GENROU.Pe.v[0]),
        q_gen_pu=float(ss.GENROU.Qe.v[0]),
        wartosci_wlasne=wartosci,
        baza_czestotliwosci_hz=float(ss.GENROU.fn.v[0]),
    )


# ---------------------------------------------------------------------------
# Laboratorium na TYM SAMYM przypadku
# ---------------------------------------------------------------------------


def _silnik_laboratorium(
    przypadek: PrzypadekGenrou,
    *,
    wzbudnica: NastawyWzbudzenia | None,
    turbina: NastawyTurbiny | None,
    krok_s: float,
) -> SilnikRMS:
    topo = TopologiaSieci(
        szyny=("GEN", "SYS"),
        galezie=[Galaz("GEN", "SYS", r_pu=0.0, x_pu=przypadek.x_linii_pu)],
        szyny_sztywne={"SYS": complex(przypadek.v_sys_pu, 0.0)},
    )
    maszyna = MaszynaSynchroniczna4Rzedu(
        ref="G1",
        szyna="GEN",
        h_s=przypadek.h_s,
        d_tlumienie=przypadek.d_tlumienie,
        ra_pu=przypadek.ra_pu,
        xd_pu=przypadek.xd_pu,
        xq_pu=przypadek.xq_pu,
        xd_prim_pu=przypadek.x_prim_pu,
        xq_prim_pu=przypadek.xq_prim_efektywne,
        td0_prim_s=przypadek.td0_prim_s,
        tq0_prim_s=przypadek.tq0_prim_s,
    )
    zespol = ZespolSynchroniczny(
        maszyna=maszyna,
        avr=None if wzbudnica is None else wzbudnica.regulator_laboratorium(),
        governor=None if turbina is None else turbina.regulator_laboratorium(),
    )
    model = ModelDynamiczny(
        topologia=topo, urzadzenia=[zespol], s_bazowa_mva=przypadek.s_bazowa_mva
    )
    return SilnikRMS(
        model,
        integrator="rk4",
        krok_s=krok_s,
        tolerancja_sieci=TOLERANCJA_SIECI,
    )


def wynik_laboratorium(
    przypadek: PrzypadekGenrou,
    *,
    q_gen_pu: float,
    wzbudnica: NastawyWzbudzenia | None = None,
    turbina: NastawyTurbiny | None = None,
    krok_roznicowy: float = KROK_ROZNICOWY_WIDMA,
) -> WynikGenrou:
    """Ten sam przypadek policzony laboratorium; widmo z jakobianu ``df/dx``.

    ``q_gen_pu`` pochodzi z rozwiązania wzorca: laboratorium nie ma węzła PV,
    więc dostaje moc zespoloną i musi ODTWORZYĆ napięcie zespolone wzorca. To
    czyni porównanie napięcia realnym sprawdzianem warstwy algebraicznej, a nie
    tautologią. Kolejność jest istotna: punkt pracy USTALA wzorzec.

    Jakobian jest liczony różnicami CENTRALNYMI (`sztywnosc.jakobian_numeryczny`)
    — ta sama funkcja, którą mierzona jest sztywność, żeby nie powstały dwie
    implementacje tej samej rzeczy o różnych progach. Zmierzona dokładność
    porównania widm: 1,2·10⁻⁸ typowo, 2,3·10⁻⁷ najgorzej.
    """
    silnik = _silnik_laboratorium(przypadek, wzbudnica=wzbudnica, turbina=turbina, krok_s=0.001)
    x0 = silnik.inicjalizuj({"G1": complex(przypadek.p_gen_pu, q_gen_pu)})
    v0 = silnik.rozwiaz_siec(x0)
    v_gen = complex(v0[silnik.model.topologia.indeks["GEN"]])
    wartosci = np.linalg.eigvals(jakobian_numeryczny(silnik, x0, krok=krok_roznicowy))
    return WynikGenrou(
        zrodlo="dynamic_lab (prototyp badawczy)",
        metoda="maszyna 4. rzędu + wartości własne jakobianu df/dx",
        delta0_rad=float(x0[0]),
        e_q_prim_pu=float(x0[2]),
        e_d_prim_pu=float(x0[3]),
        efd_pu=float(x0[4]),
        v_gen_modul_pu=abs(v_gen),
        v_gen_kat_rad=math.atan2(v_gen.imag, v_gen.real),
        p_gen_pu=przypadek.p_gen_pu,
        q_gen_pu=q_gen_pu,
        wartosci_wlasne=tuple(complex(w) for w in wartosci),
        baza_czestotliwosci_hz=F_BAZOWA_HZ,
    )


def porownaj_z_wzorcem(
    przypadek: PrzypadekGenrou | None = None,
    *,
    wzbudnica: NastawyWzbudzenia | None = None,
    turbina: NastawyTurbiny | None = None,
    wymagaj_rownowaznosci: bool = True,
) -> PorownanieGenrou:
    """Pełne porównanie laboratorium ze wzorcem na jednym przypadku.

    ``wymagaj_rownowaznosci=True`` (domyślnie) ODRZUCA przypadki, w których
    GENROU nie redukuje się do modelu dwuosiowego. To zabezpieczenie przeciwko
    najłatwiejszej pomyłce tego modułu: odczytaniu różnicy MODELI jako błędu
    laboratorium. Zamiatania rozbieżności wywołują tę funkcję z ``False``,
    bo tam różnica modeli JEST mierzoną wielkością.
    """
    przypadek = przypadek or PrzypadekGenrou()
    if wymagaj_rownowaznosci and not przypadek.rownowazne_strukturalnie:
        raise ModeleNierownowazneError(
            "Modele nie są równoważne na tym przypadku: "
            + "; ".join(przypadek.powody_nierownowaznosci)
            + ". Użyj wymagaj_rownowaznosci=False, jeśli chcesz ZMIERZYĆ rozbieżność."
        )
    wzorzec = wynik_wzorca(przypadek, wzbudnica=wzbudnica, turbina=turbina)
    lab = wynik_laboratorium(
        przypadek,
        q_gen_pu=wzorzec.q_gen_pu,
        wzbudnica=wzbudnica,
        turbina=turbina,
    )
    return PorownanieGenrou(
        przypadek=przypadek,
        wzbudnica=wzbudnica,
        turbina=turbina,
        wzorzec=wzorzec,
        laboratorium=lab,
        dopasowanie=dopasuj_widma(lab.wartosci_wlasne, wzorzec.wartosci_wlasne),
    )


# ---------------------------------------------------------------------------
# Mod oscylacyjny Z TRAJEKTORII — zamknięcie łańcuchu (równania + całkowanie)
# ---------------------------------------------------------------------------


def zmierz_mod_oscylacyjny(
    czas: NDArray[np.float64] | list[float],
    sygnal: NDArray[np.float64] | list[float],
) -> complex:
    """Wartość własna ``σ + jω`` odczytana z PRZEBIEGU (nie z jakobianu).

    Po co osobno od jakobianu: jakobian dowodzi, że RÓWNANIA laboratorium
    zgadzają się z wzorcem; trajektoria dowodzi, że zgadza się też CAŁKOWANIE.
    Bez tego drugiego kroku poprawne równania i błędny integrator dałyby zielony
    wynik.

    Metoda: ``ω`` z regresji liniowej czasów kolejnych EKSTREMÓW (odstęp = pół
    okresu), ``σ`` z regresji ``ln`` amplitudy międzyszczytowej.

    DLACZEGO NIE przez przejścia przez wartość średnią
    (`walidacja.zmierz_czestotliwosc_oscylacji`): ZMIERZONO, że przy tłumieniu
    ``ζ ≈ 0,11`` i obecności drugiego, nieoscylacyjnego modu (−0,20 s⁻¹) średnia
    całego przebiegu nie jest położeniem równowagi, więc przejścia są przesunięte.
    Błąd wynosi wtedy 1,2·10⁻² i **nie znika** przy amplitudzie dążącej do zera
    (0,2° → 1,20·10⁻²; 2° → 8,7·10⁻³) — czyli nie jest to efekt nieliniowości,
    tylko wady metody pomiaru. Regresja po ekstremach daje 6·10⁻⁵.
    Amplituda międzyszczytowa dodatkowo znosi w pierwszym rzędzie powolny dryf
    tła, więc ``σ`` wychodzi z błędem 1,7·10⁻⁴.

    Zakres stosowalności: siatka czasu RÓWNOMIERNA (interpolacja paraboliczna
    położenia ekstremum), co najmniej 4 ekstrema, dodatnie amplitudy.
    Poza nim funkcja PODNOSI WYJĄTEK — oszacowanie z dwóch punktów byłoby
    liczbą bez pokrycia.

    Raises:
        ValueError: gdy siatka nie jest równomierna, ekstremów jest za mało
            albo amplituda międzyszczytowa nie jest dodatnia.
    """
    t = np.asarray(czas, dtype=np.float64)
    y = np.asarray(sygnal, dtype=np.float64)
    if t.size != y.size:
        raise ValueError(f"Różne długości przebiegów: {t.size} vs {y.size}")
    if t.size < 8:
        raise ValueError("Przebieg zbyt krótki, żeby zmierzyć mod oscylacyjny")
    kroki = np.diff(t)
    if float(np.max(kroki) - np.min(kroki)) > 1.0e-9 * float(np.mean(kroki)):
        raise ValueError(
            "Siatka czasu nie jest równomierna — interpolacja paraboliczna ekstremum "
            "nie obowiązuje, a wynik byłby obciążony w sposób niemierzalny."
        )
    gora = np.where((y[1:-1] > y[:-2]) & (y[1:-1] >= y[2:]))[0] + 1
    dol = np.where((y[1:-1] < y[:-2]) & (y[1:-1] <= y[2:]))[0] + 1
    ekstrema = np.sort(np.concatenate([gora, dol]))
    if ekstrema.size < 4:
        raise ValueError(
            f"Znaleziono {ekstrema.size} ekstremów (potrzeba >= 4) — przebieg nie oscyluje "
            "wystarczająco długo, żeby zmierzyć mod."
        )
    czasy_ekstremow = np.empty(ekstrema.size, dtype=np.float64)
    for k, i in enumerate(ekstrema):
        y0, y1, y2 = float(y[i - 1]), float(y[i]), float(y[i + 1])
        mianownik = y0 - 2.0 * y1 + y2
        przesuniecie = 0.5 * (y0 - y2) / mianownik if mianownik != 0.0 else 0.0
        czasy_ekstremow[k] = float(t[i]) + przesuniecie * float(t[i + 1] - t[i])
    nachylenie, _ = np.polyfit(np.arange(czasy_ekstremow.size), czasy_ekstremow, 1)
    if nachylenie <= 0.0:
        raise ValueError("Odstęp ekstremów nie jest dodatni — przebieg nie jest oscylacją")
    omega = math.pi / float(nachylenie)

    amplitudy = np.abs(np.diff(y[ekstrema]))
    if float(np.min(amplitudy)) <= 0.0:
        raise ValueError("Zerowa amplituda międzyszczytowa — tłumienia nie da się zmierzyć")
    srodki = 0.5 * (czasy_ekstremow[:-1] + czasy_ekstremow[1:])
    sigma, _ = np.polyfit(srodki, np.log(amplitudy), 1)
    return complex(float(sigma), omega)


def mod_z_trajektorii(
    przypadek: PrzypadekGenrou,
    *,
    q_gen_pu: float,
    wzbudnica: NastawyWzbudzenia | None = None,
    turbina: NastawyTurbiny | None = None,
    krok_s: float = 0.001,
    czas_koncowy_s: float = 8.0,
    zaburzenie_stopni: float = 0.5,
) -> complex:
    """Zmierz mod oscylacyjny z trajektorii RK4 laboratorium po małym zaburzeniu ``δ``.

    ``zaburzenie_stopni`` jest MAŁE świadomie: wzorcem jest wartość własna, czyli
    zachowanie w granicy amplitudy dążącej do zera. Przy dużej amplitudzie
    trajektoria jest nieliniowa i różni się od wartości własnej z powodów
    FIZYCZNYCH — porównywanie ich i nazywanie różnicy błędem byłoby porównaniem
    dwóch różnych wielkości.
    """
    silnik = _silnik_laboratorium(przypadek, wzbudnica=wzbudnica, turbina=turbina, krok_s=krok_s)
    x0 = silnik.inicjalizuj({"G1": complex(przypadek.p_gen_pu, q_gen_pu)})
    x_start = x0.copy()
    x_start[0] += math.radians(zaburzenie_stopni)
    wynik = silnik.symuluj(x_start, czas_koncowy_s=czas_koncowy_s)
    if not wynik.diagnostyka.zbiegl:
        raise BrakWzorcaError(f"Symulacja laboratorium nie zbiegła: {wynik.diagnostyka.blad}")
    return zmierz_mod_oscylacyjny(
        np.array(wynik.czas_s), np.array(wynik.sygnal("delta_rad", "G1").wartosci)
    )


# ---------------------------------------------------------------------------
# ZAKRES ZGODNOŚCI — rozbieżność jako funkcja parametru, który różni modele
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PomiarRozbieznosci:
    """Jeden punkt zamiatania: parametr różniący modele → zmierzona rozbieżność."""

    nazwa_parametru: str
    wartosc: float
    blad_delta0: float
    blad_e_q_prim: float
    blad_e_d_prim: float
    blad_modu_najslabiej_tlumionego: float
    blad_widma: float
    """Najgorszy błąd po CAŁYM skojarzonym widmie, nie tylko po jednym modzie.

    Obie miary są potrzebne: mod najsłabiej tłumiony jest tym, co widać w
    przebiegu, a pełne widmo wykrywa rozjazd modu, którego nikt nie ogląda
    (np. obwodu wzbudzenia). Rozbieżność bywa w nich różnego rzędu.
    """

    @property
    def blad_punktu_pracy(self) -> float:
        return max(self.blad_delta0, self.blad_e_q_prim, self.blad_e_d_prim)


def _zmierz_rozbieznosc(
    przypadek: PrzypadekGenrou, nazwa: str, wartosc: float
) -> PomiarRozbieznosci:
    porownanie = porownaj_z_wzorcem(przypadek, wymagaj_rownowaznosci=False)
    return PomiarRozbieznosci(
        nazwa_parametru=nazwa,
        wartosc=wartosc,
        blad_delta0=porownanie.blad_delta0,
        blad_e_q_prim=porownanie.blad_e_q_prim,
        blad_e_d_prim=porownanie.blad_e_d_prim,
        blad_modu_najslabiej_tlumionego=porownanie.blad_modu_najslabiej_tlumionego,
        blad_widma=porownanie.blad_widma,
    )


def rozbieznosc_od_reaktancji_podprzejsciowej(
    przypadek: PrzypadekGenrou | None = None,
    *,
    reaktancje_pu: tuple[float, ...] = (0.30, 0.29, 0.28, 0.25, 0.20, 0.15),
) -> tuple[PomiarRozbieznosci, ...]:
    """Zmierz, jak rozbieżność rośnie z odstępem ``Xd' − Xd''``.

    To jest odpowiedź na pytanie „w jakim ZAKRESIE modele są porównywalne":
    przy ``Xd'' = Xd'`` rozbieżność jest na poziomie szumu numerycznego
    (7,5·10⁻⁹), a rośnie monotonicznie z odstępem — zmierzone 3,1·10⁻³ (0,01),
    6,1·10⁻³ (0,02), 1,5·10⁻² (0,05), 3,0·10⁻² (0,10), 4,5·10⁻² (0,15).
    PUNKT PRACY pozostaje przy tym niezmieniony (1,0·10⁻⁸ w całym zamiataniu):
    reaktancja podprzejściowa nie wchodzi do stanu ustalonego, tylko do dynamiki.
    """
    baza = przypadek or PrzypadekGenrou()
    return tuple(
        _zmierz_rozbieznosc(replace(baza, x_bis_pu=x_bis), "x_bis_pu", x_bis)
        for x_bis in reaktancje_pu
    )


def rozbieznosc_od_stalej_tlumika(
    przypadek: PrzypadekGenrou | None = None,
    *,
    x_bis_pu: float = 0.20,
    stale_s: tuple[float, ...] = (0.05, 0.02, 0.01, 0.005, 0.002, 0.001),
) -> tuple[PomiarRozbieznosci, ...]:
    """Zmierz DRUGĄ dokładną redukcję: ``Td0'' → 0`` przy CZYNNYM odstępie ``Xd''``.

    Wynik jest silniejszy niż samo „modele się różnią": rozbieżność maleje
    LINIOWO ze stałą czasową tłumika (zmierzone ≈ 1,25·``Td0''`` [1/s] dla
    maszyny izotropowej), co dowodzi, że różnica bierze się dokładnie z dynamiki
    tłumików, a nie z błędu po którejkolwiek stronie. Gdyby nie znikała w
    granicy, byłby to defekt.

    Ta sama funkcja obsługuje przypadek ANIZOTROPOWY (``Xq' ≠ Xd'``), w którym
    R2 jest JEDYNĄ dostępną drogą porównania — bo ANDES wymusza ``Xd'' = Xq''``,
    więc odstęp podprzejściowy nie może zniknąć w obu osiach naraz. Zmierzone
    dla ``Xd' = 0,30``, ``Xq' = 0,55``, ``Xd'' = 0,25``: iloraz błędu przez
    ``Td0''`` wynosi 1,096 s⁻¹ i jest stały w całym zamiataniu (5,3·10⁻² przy
    0,05 s → 5,5·10⁻⁴ przy 0,0005 s), a punkt pracy zgadza się DOKŁADNIE
    (4·10⁻⁹) niezależnie od stałej tłumika.
    """
    baza = przypadek or PrzypadekGenrou()
    return tuple(
        _zmierz_rozbieznosc(
            replace(baza, x_bis_pu=x_bis_pu, td0_bis_s=t, tq0_bis_s=t), "td0_bis_s", t
        )
        for t in stale_s
    )


def rozbieznosc_od_nasycenia(
    przypadek: PrzypadekGenrou | None = None,
    *,
    wspolczynniki: tuple[float, ...] = (0.0, 0.02, 0.05, 0.10, 0.20),
) -> tuple[PomiarRozbieznosci, ...]:
    """Zmierz rozbieżność wnoszoną przez nasycenie GENROU, którego nie mamy.

    ``S12`` jest ustawiane na ``3·S10`` (poza ``S10 = 0``, gdzie musi być 1 —
    patrz pułapka ``_fS12``), żeby zamiatanie miało jeden parametr, a nie dwa.
    Nasycenie różni modele INACZEJ niż tłumiki: rozjeżdża **punkt pracy**
    (zmierzony błąd względny ``δ0`` = 1,0·10⁻² już przy ``S10 = 0,02``, a przy
    ``S10 = 0,20`` już 1,0·10⁻¹), a nie tylko dynamikę.
    """
    baza = przypadek or PrzypadekGenrou()
    return tuple(
        _zmierz_rozbieznosc(
            replace(baza, s10=s10, s12=1.0 if s10 == 0.0 else 3.0 * s10), "s10", s10
        )
        for s10 in wspolczynniki
    )


# ---------------------------------------------------------------------------
# Zakres walidacji jako DANE (nie proza) — z przypiętym testem na każdy wiersz
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PozycjaZakresu:
    """Jedno równanie/mechanizm i jego status wobec wyroczni zewnętrznej."""

    rownanie: str
    zwalidowane: bool
    czym: str
    """Nazwa testu (gdy zwalidowane) albo POWÓD braku dowodu (gdy nie)."""


#: Zakres walidacji zewnętrznej — ZAMKNIĘTA lista. Każdy wiersz oznaczony jako
#: zwalidowany wskazuje test w `tests/research/test_wzorzec_genrou.py`, a test
#: `test_zakres_walidacji_wskazuje_istniejace_testy` pilnuje, że ten test istnieje.
#: Bez tego przypięcia tabela byłaby deklaracją bez pokrycia — czyli dokładnie
#: tym, co ten moduł ma naprawić.
ZAKRES_WALIDACJI: tuple[PozycjaZakresu, ...] = (
    PozycjaZakresu(
        rownanie="dδ/dt = ω_s·(ω − 1)",
        zwalidowane=True,
        czym="test_widmo_modelu_4_rzedu_zgadza_sie_z_genrou",
    ),
    PozycjaZakresu(
        rownanie="2H·dω/dt = Pm − Pe − D·(ω − 1)",
        zwalidowane=True,
        czym="test_bezwladnosc_i_tlumienie_przesuwaja_widmo_zgodnie",
    ),
    PozycjaZakresu(
        rownanie="Td0'·dE'q/dt = Efd − E'q − (Xd − Xd')·Id",
        zwalidowane=True,
        czym="test_stale_czasowe_obwodow_wirnika_przesuwaja_widmo_zgodnie",
    ),
    PozycjaZakresu(
        rownanie="Tq0'·dE'd/dt = −E'd + (Xq − Xq')·Iq",
        zwalidowane=True,
        czym="test_stale_czasowe_obwodow_wirnika_przesuwaja_widmo_zgodnie",
    ),
    PozycjaZakresu(
        rownanie="równania stojana Vd, Vq (RMS, Ra ≠ 0)",
        zwalidowane=True,
        czym="test_widmo_zgadza_sie_na_iloczynie_cech_maszyny",
    ),
    PozycjaZakresu(
        rownanie="inicjalizacja δ0, E'q0, E'd0, Efd0",
        zwalidowane=True,
        czym="test_punkt_pracy_modelu_4_rzedu_zgadza_sie_z_genrou",
    ),
    PozycjaZakresu(
        rownanie="algebra sieci: odtworzenie V z zadanego P + jQ",
        zwalidowane=True,
        czym="test_punkt_pracy_modelu_4_rzedu_zgadza_sie_z_genrou",
    ),
    PozycjaZakresu(
        rownanie="inicjalizacja przy Xd' ≠ Xq' (anizotropia przejściowa) — DOKŁADNIE",
        zwalidowane=True,
        czym="test_anizotropia_przejsciowa_zgadza_sie_w_granicy_szybkich_tlumikow",
    ),
    PozycjaZakresu(
        rownanie=(
            "widmo przy Xd' ≠ Xq' — tylko ASYMPTOTYCZNIE (granica Td0'' → 0), "
            "bo ANDES wymusza Xd'' = Xq''"
        ),
        zwalidowane=True,
        czym="test_anizotropia_przejsciowa_zgadza_sie_w_granicy_szybkich_tlumikow",
    ),
    PozycjaZakresu(
        rownanie="całkowanie RK4 na modelu 4. rzędu (trajektoria vs wartość własna)",
        zwalidowane=True,
        czym="test_mod_z_trajektorii_zgadza_sie_z_wartoscia_wlasna_wzorca",
    ),
    PozycjaZakresu(
        rownanie="T_a·dEfd/dt = K_a·(V_ref − V_t) − Efd (AVR, obszar liniowy)",
        zwalidowane=True,
        czym="test_avr_zgadza_sie_z_sexs_na_iloczynie_nastaw",
    ),
    PozycjaZakresu(
        rownanie="T_g·dPm/dt = P_ref − (ω − 1)/R − Pm (governor, obszar liniowy)",
        zwalidowane=True,
        czym="test_governor_zgadza_sie_z_tgov1_na_iloczynie_nastaw",
    ),
    PozycjaZakresu(
        rownanie="AVR i governor pracujące JEDNOCZEŚNIE",
        zwalidowane=True,
        czym="test_avr_i_governor_razem_zgadzaja_sie_z_wzorcem",
    ),
    PozycjaZakresu(
        rownanie="ogranicznik i anti-windup AVR",
        zwalidowane=False,
        czym="porównanie małosygnałowe trzyma ogranicznik nieaktywny — brak wzorca",
    ),
    PozycjaZakresu(
        rownanie="ogranicznik i anti-windup governora",
        zwalidowane=False,
        czym="jak wyżej — ogranicznik nieaktywny w otoczeniu punktu pracy",
    ),
    PozycjaZakresu(
        rownanie="ogranicznik ŻĄDANIA w AVR laboratorium",
        zwalidowane=False,
        czym="SEXS nie ma tego członu — nie istnieje wzorzec do porównania",
    ),
    PozycjaZakresu(
        rownanie="nasycenie obwodu magnetycznego (S10, S12)",
        zwalidowane=False,
        czym="laboratorium nie ma nasycenia; rozbieżność ZMIERZONA w rozbieznosc_od_nasycenia",
    ),
    PozycjaZakresu(
        rownanie="uzwojenia tłumiące (Xd'', Xq'', Td0'', Tq0'')",
        zwalidowane=False,
        czym=(
            "laboratorium ich nie ma; rozbieżność ZMIERZONA w "
            "rozbieznosc_od_reaktancji_podprzejsciowej i rozbieznosc_od_stalej_tlumika"
        ),
    ),
    PozycjaZakresu(
        rownanie="człon lead-lag SEXS / TGOV1",
        zwalidowane=False,
        czym="świadomie unieczynniony (TA = TB, T2 = T3), żeby porównywać część wspólną",
    ),
    PozycjaZakresu(
        rownanie="zachowanie dużosygnałowe (zwarcie, czas krytyczny)",
        zwalidowane=False,
        czym="poza zakresem tego wzorca — to oś C3/W2 (WyroczniaRownychPol)",
    ),
    PozycjaZakresu(
        rownanie="transjenty stojana, zmienna prędkość w równaniach stojana",
        zwalidowane=False,
        czym="żaden z modeli ich nie ma — brak sporu i brak dowodu",
    ),
)


def tabela_zakresu_walidacji() -> str:
    """Tabela do meldunku — żeby nie przepisywać jej ręcznie i nie rozjechać."""
    wiersze = ["| Równanie / mechanizm | Zewnętrznie? | Czym |", "|---|---|---|"]
    wiersze += [
        f"| {p.rownanie} | {'TAK' if p.zwalidowane else 'NIE'} | {p.czym} |"
        for p in ZAKRES_WALIDACJI
    ]
    return "\n".join(wiersze)


def raport_zakresu_walidacji(
    przypadek: PrzypadekGenrou | None = None,
) -> str:
    """Pełny raport: porównanie bazowe, z regulatorami i zmierzone granice zgodności.

    Wymaga zainstalowanego ANDES-a; bez niego podnosi `BrakWzorcaError`, bo
    raport bez wzorca byłby raportem o niczym.
    """
    przypadek = przypadek or PrzypadekGenrou()
    bez_regulatorow = porownaj_z_wzorcem(przypadek)
    z_avr = porownaj_z_wzorcem(przypadek, wzbudnica=NastawyWzbudzenia())
    z_gov = porownaj_z_wzorcem(przypadek, turbina=NastawyTurbiny())
    czesci = [
        "# Zakres walidacji zewnętrznej modelu 4. rzędu i regulatorów",
        "",
        tabela_zakresu_walidacji(),
        "",
        "## Przypadek bazowy (bez regulatorów)",
        bez_regulatorow.raport(),
        "",
        "## Z regulatorem napięcia (SEXS ↔ RegulatorNapiecia)",
        z_avr.raport(),
        "",
        "## Z regulatorem turbiny (TGOV1 ↔ RegulatorTurbiny)",
        z_gov.raport(),
        "",
        "## Granica zgodności — rozbieżność vs odstęp podprzejściowy",
        "| Xd'' [p.u.] | błąd punktu pracy | błąd modu |",
        "|---|---|---|",
    ]
    for pomiar in rozbieznosc_od_reaktancji_podprzejsciowej(przypadek):
        czesci.append(
            f"| {pomiar.wartosc:g} | {pomiar.blad_punktu_pracy:.3e} "
            f"| {pomiar.blad_modu_najslabiej_tlumionego:.3e} |"
        )
    czesci += [
        "",
        "## Granica zgodności — rozbieżność vs stała czasowa tłumika (Xd'' = 0,20)",
        "| Td0'' = Tq0'' [s] | błąd modu |",
        "|---|---|",
    ]
    for pomiar in rozbieznosc_od_stalej_tlumika(przypadek):
        czesci.append(f"| {pomiar.wartosc:g} | {pomiar.blad_modu_najslabiej_tlumionego:.3e} |")
    czesci += [
        "",
        "## Granica zgodności — rozbieżność vs nasycenie",
        "| S10 | błąd δ0 | błąd E'q | błąd modu |",
        "|---|---|---|---|",
    ]
    for pomiar in rozbieznosc_od_nasycenia(przypadek):
        czesci.append(
            f"| {pomiar.wartosc:g} | {pomiar.blad_delta0:.3e} | {pomiar.blad_e_q_prim:.3e} "
            f"| {pomiar.blad_modu_najslabiej_tlumionego:.3e} |"
        )
    return "\n".join(czesci)

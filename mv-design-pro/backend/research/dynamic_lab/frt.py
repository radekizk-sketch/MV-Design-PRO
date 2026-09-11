"""Ocena FRT: WYMAGANIE (obwiednia) i WYNIK (przebieg) jako dwa ROZDZIELNE byty.

KOD BADAWCZY — patrz `backend/research/README.md`.

To jest bezpośrednia odpowiedź na defekt P0-01 audytu. W produkcyjnym ewaluatorze
kod robił:

    limiting = min(curve, key=...)          # punkt obwiedni WYMAGANIA
    simulated_voltage = limiting.voltage_pu # ...przypisany jako wielkość "symulowana"
    margin = simulated_voltage - limiting.voltage_pu   # x - x, tożsamościowo 0
    ok = margin >= -1e-9                    # zawsze prawda

Wymaganie było porównywane samo ze sobą, więc test nie mógł wypaść negatywnie,
a ślad White Box zapisywał limit normatywny jako ``U_sim``.

REGUŁA KONSTRUKCYJNA tego modułu: obwiednia i przebieg mają RÓŻNE TYPY
(``ObwiedniaFrt`` vs ``PrzebiegNapiecia``) i funkcja oceny wymaga OBU. Nie da się
podać tego samego obiektu dwa razy — tautologia z audytu jest tu niewyrażalna
w typach, a nie tylko zakazana w komentarzu.

DRUGA RUNDA AUDYTU — ROZDZIELENIE OBWIEDNI OD ZDOLNOŚCI (pakiet C)
------------------------------------------------------------------
Poprzednia wersja miała JEDNĄ funkcję ``ocen_frt`` sprawdzającą wyłącznie
``U(t)`` względem obwiedni — i nazwę, która obiecywała ocenę FRT. To jest ta
sama klasa błędu, co tautologia wyżej, tylko o piętro wyżej: nazwa mówiła
więcej niż liczyła treść. Warunek

    U(t) >= U_LVRT(t)

NIE znaczy „moduł spełnił wymaganie FRT". Moduł mógł się w tym czasie odłączyć,
nie podać prądu biernego, nie odbudować mocy albo przebieg mógł się skończyć
przed końcem wymaganego okna.

Dlatego moduł ma dziś DWA poziomy, z różnymi typami wyniku:

  * ``ocen_obwiednie_napiecia`` -> ``OcenaObwiedniNapiecia``
    Jedno kryterium: przebieg napięcia względem obwiedni. Nazwa mówi dokładnie
    tyle, ile funkcja liczy.
  * ``ocen_zdolnosc_frt`` -> ``OcenaZdolnosciFrt``
    Składa kryteria WYMIENIONE W MANIFEŚCIE PROFILU w jeden werdykt. Werdykt
    pozytywny wymaga, żeby KAŻDE wymagane kryterium było rozstrzygnięte
    pozytywnie ORAZ żeby manifest nie zawierał kryteriów niezmapowanych ani
    nieobsługiwanych; brak danych daje ``NIEROZSTRZYGALNE``, nigdy ``SPELNIA``.

TRZECIA RUNDA AUDYTU — PIĘĆ LUK FAIL-OPEN
-----------------------------------------
Recenzja wykazała, że poza obwiednią napięcia (naprawioną w rundzie drugiej)
każdy pozostały sygnał miał własną, słabszą walidację albo nie miał żadnej.
Wszystkie pięć luk otwierały się w tę samą stronę — w stronę werdyktu
pozytywnego:

1. **Ekstrapolacja zamiast braku danych.** ``np.interp`` poza nośnikiem danych
   NIE zgłasza błędu, tylko zwraca wartość brzegową — czyli FABRYKUJE przebieg
   tam, gdzie pomiaru nie ma. Ocena prądu biernego robiła dokładnie to. Dziś
   wszystkie sygnały przechodzą przez JEDEN kontrakt
   (``sprawdz_szereg_czasowy``) i JEDNĄ interpolację (``interpoluj_w_nosniku``),
   która poza nośnikiem podnosi ``EkstrapolacjaZabronionaError``. Ta sama reguła
   obowiązuje obwiednię: profil, który kończy się przed końcem okna oceny, nie
   „obowiązuje dalej ostatnią wartością" — po prostu nie pokrywa okna.
2. **Pojedyncze ``True`` jako dowód kwantyfikatora ∀.** Stan przyłączenia był
   listą próbek, a kryterium szukało pierwszego ``False``. Jedna próbka
   ``(t=0.5, True)`` była więc czytana jako „moduł był przyłączony przez całe
   okno", choć wymaganie ma postać ``∀t∈[t_f,t_e]: c(t)=1``. Dziś stan
   przyłączenia to ``DziennikPrzylaczenia``: stan początkowy + KOMPLETNY dziennik
   zdarzeń na jawnie zadeklarowanym przedziale obowiązywania, czyli funkcja
   kawałkami stała określona wszędzie tam, gdzie wolno o nią pytać.
3. **Prąd bierny bez prawa znaku.** Kryterium przyjmowało abstrakcyjny,
   „dodatni" ``Iq`` — kto podał surowe ``Im(I)``, dostawał werdykt odwrócony.
   Dziś wielkość jest zdefiniowana wzorem z fazorów (``prad_wsparcia_z_fazora``)
   i niesiona osobnym typem.
4. **``None`` jako „profil tego nie wymaga".** Zapomniane zmapowanie wymagania
   było nieodróżnialne od świadomej decyzji „nie dotyczy". Dziś każde kryterium
   ma jawny status w ``ManifestKryteriowProfilu``.
5. **Ciche zero jako kryterium regulacyjne.** ``czas_utrzymania_s = 0`` oraz
   progi ``0.9`` / ``0.1`` były domyślne, więc kryterium mogło powstać bez ani
   jednej świadomej decyzji. Dziś parametry progowe są WYMAGANE, a zero czasu
   utrzymania wolno podać wyłącznie razem z jawną deklaracją, że profil koduje
   kryterium chwilowego przekroczenia.

GRANICE TEGO MODUŁU — NAZWANE, NIE UKRYTE
-----------------------------------------
Laboratorium liczy CZTERY kryteria: obwiednię napięcia, ciągłość przyłączenia,
amplitudowy warunek prądu wsparcia i odbudowę mocy czynnej. NIE liczy: czasu
odpowiedzi prądu biernego, logiki wyłączania zabezpieczeń producenta ani
zachowania obwodu pośredniczącego DC. Profil, który tych rzeczy wymaga, NIE
JEST tym modułem zwalidowany — i manifest musi to powiedzieć wprost
(``StatusKryterium.NIEOBSLUGIWANE``), co blokuje werdykt pozytywny.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from enum import StrEnum

import numpy as np
from numpy.typing import NDArray

#: Tolerancja porównań czasu [s]. Przebieg kończący się o ułamek kroku przed
#: końcem okna jest traktowany jak pokrywający okno — inaczej każdy bieg z
#: krokiem niebędącym dzielnikiem horyzontu byłby NIEROZSTRZYGALNY.
TOLERANCJA_CZASU_S = 1.0e-9


class WerdyktFrt(StrEnum):
    """Trzy stany — trzeci jest OBOWIĄZKOWY i nie wolno go zwijać do „spełnia"."""

    SPELNIA = "spelnia"
    NIE_SPELNIA = "nie_spelnia"
    NIEROZSTRZYGALNE = "nierozstrzygalne"


class WadaSzereguCzasowego(StrEnum):
    """Dlaczego szereg czasowy NIE nadaje się do orzekania w zadanym oknie.

    Jeden słownik wad dla WSZYSTKICH sygnałów FRT (napięcie, moc, prąd wsparcia,
    stan przyłączenia). Wcześniej każdy sygnał miał własny, inny zakres kontroli:
    napięcie pełny, moc żaden, prąd bierny żaden — i to nie była decyzja, tylko
    przypadek historii pliku.

    Wady są rozdzielone, bo wymagają różnych reakcji: skrócony bieg to inna
    usterka niż powtórzone znaczniki czasu, a NaN w danych to trzecia rzecz.
    """

    BRAK_PROBEK = "brak_probek_w_oknie"
    ZA_MALO_PROBEK = "za_malo_probek_do_orzekania"
    CZAS_NIESKONCZONY = "znacznik_czasu_nie_jest_liczba_skonczona"
    WARTOSC_NIESKONCZONA = "wartosc_nie_jest_liczba_skonczona"
    CZAS_NIEMONOTONICZNY = "czas_nie_jest_rosnacy"
    CZAS_ZDUBLOWANY = "powtorzone_znaczniki_czasu"
    POCZATEK_PO_ZAKLOCENIU = "przebieg_zaczyna_sie_po_chwili_zaklocenia"
    OKNO_NIEDOMKNIETE = "przebieg_konczy_sie_przed_koncem_okna"
    ZBYT_RZADKIE_PROBKI = "odstep_probek_przekracza_dopuszczalny"
    OBWIEDNIA_NIE_POKRYWA_OKNA = "obwiednia_profilu_konczy_sie_przed_koncem_okna"
    DZIENNIK_NIE_POKRYWA_OKNA = "dziennik_przylaczenia_nie_pokrywa_okna"


class EkstrapolacjaZabronionaError(ValueError):
    """Żądanie wartości sygnału poza nośnikiem danych.

    ``np.interp`` w takiej sytuacji zwraca wartość brzegową i nic nie mówi —
    czyli tworzy pomiar, którego nie ma. W ocenie zgodności to jest fabrykacja
    dowodu, a nie wygodne domknięcie brzegu, więc tutaj jest to twardy błąd.
    """


def sprawdz_szereg_czasowy(
    czas_s: NDArray[np.float64],
    wartosci: NDArray[np.float64] | None,
    *,
    okno_od_s: float,
    okno_do_s: float | None,
    maks_odstep_probek_s: float | None = None,
    minimalna_liczba_probek: int = 2,
) -> tuple[WadaSzereguCzasowego, ...]:
    """JEDEN kontrakt szeregu czasowego — wspólny dla wszystkich sygnałów FRT.

    Sprawdza, czy szereg w ogóle nadaje się do orzekania w oknie
    ``[okno_od_s, okno_do_s]``:

    * skończoność znaczników czasu i wartości (NaN/inf to brak danych, nie dane);
    * ściśle rosnący czas, bez duplikatów (``np.interp`` na osi z duplikatem daje
      wynik zależny od kolejności, a nie od fizyki);
    * pokrycie POCZĄTKU i KOŃCA okna — czyli brak potrzeby ekstrapolacji;
    * opcjonalny maksymalny odstęp próbek wewnątrz okna.

    Pokrycie obu krańców jest tym samym warunkiem, co zakaz ekstrapolacji:
    dopóki ``t[0] <= okno_od`` i ``t[-1] >= okno_do``, każda chwila okna leży w
    nośniku danych i interpolacja jest odczytem, a nie domysłem.

    Zwraca KROTKĘ wad (pustą, gdy szereg jest zdatny). Nie podnosi wyjątku, bo
    niezdatność danych jest wynikiem oceny (``NIEROZSTRZYGALNE``), a nie błędem
    programu.
    """
    braki: list[WadaSzereguCzasowego] = []
    if czas_s.size == 0:
        return (WadaSzereguCzasowego.BRAK_PROBEK,)
    if czas_s.size < minimalna_liczba_probek:
        braki.append(WadaSzereguCzasowego.ZA_MALO_PROBEK)

    if not bool(np.all(np.isfinite(czas_s))):
        # Dalsze kontrole na osi z NaN dają wyniki bez znaczenia (porównania z NaN
        # są zawsze fałszywe), więc meldujemy wadę i kończymy.
        braki.append(WadaSzereguCzasowego.CZAS_NIESKONCZONY)
        return tuple(braki)
    if wartosci is not None and not bool(np.all(np.isfinite(wartosci))):
        braki.append(WadaSzereguCzasowego.WARTOSC_NIESKONCZONA)

    roznice = np.diff(czas_s)
    if roznice.size:
        if np.any(roznice < -TOLERANCJA_CZASU_S):
            braki.append(WadaSzereguCzasowego.CZAS_NIEMONOTONICZNY)
        if np.any(np.abs(roznice) <= TOLERANCJA_CZASU_S):
            braki.append(WadaSzereguCzasowego.CZAS_ZDUBLOWANY)

    if float(czas_s[0]) > okno_od_s + TOLERANCJA_CZASU_S:
        braki.append(WadaSzereguCzasowego.POCZATEK_PO_ZAKLOCENIU)
    if okno_do_s is not None and float(czas_s[-1]) < okno_do_s - TOLERANCJA_CZASU_S:
        braki.append(WadaSzereguCzasowego.OKNO_NIEDOMKNIETE)

    if maks_odstep_probek_s is not None and roznice.size:
        koniec = okno_do_s if okno_do_s is not None else float(czas_s[-1])
        w_oknie = (czas_s[:-1] >= okno_od_s - TOLERANCJA_CZASU_S) & (
            czas_s[1:] <= koniec + TOLERANCJA_CZASU_S
        )
        if np.any(roznice[w_oknie] > maks_odstep_probek_s + TOLERANCJA_CZASU_S):
            braki.append(WadaSzereguCzasowego.ZBYT_RZADKIE_PROBKI)

    return tuple(braki)


def interpoluj_w_nosniku(
    zapytanie: NDArray[np.float64],
    czas_s: NDArray[np.float64],
    wartosci: NDArray[np.float64],
    *,
    nazwa_sygnalu: str,
) -> NDArray[np.float64]:
    """Interpolacja liniowa Z ZAKAZEM EKSTRAPOLACJI.

    ``np.interp(x, xp, fp)`` dla ``x`` poza ``[xp[0], xp[-1]]`` zwraca wartość
    brzegową — cicho, bez ostrzeżenia. Dla oceny zgodności znaczy to, że przebieg
    urwany w 0,4 s „ma" wartości aż do 2 s, i to dokładnie te, które były w chwili
    urwania. Tutaj taka sytuacja jest błędem, nie domknięciem brzegu.

    Funkcja jest zapadką ostatniej szansy: wywołania w tym module są poprzedzone
    kontrolą ``sprawdz_szereg_czasowy``, więc w poprawnym przebiegu NIGDY się nie
    zapala. Istnieje po to, żeby nowe miejsce użycia nie mogło pominąć kontroli
    bez natychmiastowego skutku.
    """
    if zapytanie.size == 0:
        return np.empty(0, dtype=np.float64)
    poczatek, koniec = float(czas_s[0]), float(czas_s[-1])
    minimum, maksimum = float(np.min(zapytanie)), float(np.max(zapytanie))
    if minimum < poczatek - TOLERANCJA_CZASU_S or maksimum > koniec + TOLERANCJA_CZASU_S:
        raise EkstrapolacjaZabronionaError(
            f"Sygnał '{nazwa_sygnalu}' ma nośnik [{poczatek:.6f}, {koniec:.6f}] s, "
            f"a zapytanie sięga [{minimum:.6f}, {maksimum:.6f}] s. Wartość brzegowa "
            "poza nośnikiem jest fabrykacją przebiegu, nie interpolacją."
        )
    return np.interp(zapytanie, czas_s, wartosci)


@dataclass(frozen=True)
class ObwiedniaFrt:
    """WYMAGANIE: dolna (LVRT) lub górna (HVRT) obwiednia czas→napięcie.

    Punkty ``(czas_s, napiecie_pu)`` liczone OD CHWILI ZAKŁÓCENIA; między
    punktami interpolacja liniowa.

    Poza ostatnim punktem obwiednia NIE OBOWIĄZUJE. Wcześniejsza wersja trzymała
    tam wartość ostatniego punktu, więc ocena na horyzoncie 2 s przy profilu
    opisanym do 1,5 s porównywała przebieg z wymaganiem, którego profil nie
    stawia — ta sama klasa defektu, co ekstrapolacja pomiaru, tylko po stronie
    wymagania. Dziś okno oceny wychodzące poza ostatni punkt jest wadą
    ``OBWIEDNIA_NIE_POKRYWA_OKNA``.
    """

    rodzaj: str  # "lvrt" | "hvrt"
    punkty: tuple[tuple[float, float], ...]

    def __post_init__(self) -> None:
        if self.rodzaj not in ("lvrt", "hvrt"):
            raise ValueError("rodzaj musi być 'lvrt' albo 'hvrt'")
        if len(self.punkty) < 2:
            raise ValueError("Obwiednia wymaga co najmniej dwóch punktów")
        czasy = [p[0] for p in self.punkty]
        wartosci = [p[1] for p in self.punkty]
        if not all(np.isfinite(czasy)) or not all(np.isfinite(wartosci)):
            raise ValueError("Punkty obwiedni muszą być liczbami skończonymi")
        if any(b - a <= TOLERANCJA_CZASU_S for a, b in zip(czasy, czasy[1:], strict=False)):
            raise ValueError(
                "Punkty obwiedni muszą mieć ŚCIŚLE rosnące czasy — powtórzony "
                "znacznik czasu czyni wartość wymagania niejednoznaczną."
            )
        if abs(czasy[0]) > TOLERANCJA_CZASU_S:
            raise ValueError(
                "Pierwszy punkt obwiedni musi wypadać w chwili zakłócenia (t=0), "
                "inaczej wymaganie nie jest określone na początku okna oceny."
            )

    @property
    def czasy_zalamania(self) -> NDArray[np.float64]:
        """Chwile załamania obwiedni [s od zakłócenia] — węzły funkcji kawałkami liniowej."""
        return np.array([p[0] for p in self.punkty], dtype=np.float64)

    @property
    def wartosci_zalamania(self) -> NDArray[np.float64]:
        return np.array([p[1] for p in self.punkty], dtype=np.float64)

    @property
    def koniec_obowiazywania_s(self) -> float:
        """Ostatnia chwila [s od zakłócenia], dla której profil stawia wymaganie."""
        return float(self.punkty[-1][0])

    def pokrywa(self, koniec_okna_od_zaklocenia_s: float) -> bool:
        """Czy profil stawia wymaganie do końca zadanego okna.

        JEDNO źródło prawdy dla dwóch miejsc: kontroli spójności profilu
        (``WymaganieZdolnosciFrt``) i oceny pojedynczego przebiegu
        (``ocen_obwiednie_napiecia``). Dwa niezależne warunki, które „dziś się
        zgadzają", byłyby defektem czekającym na dane brzegowe.
        """
        return koniec_okna_od_zaklocenia_s <= self.koniec_obowiazywania_s + TOLERANCJA_CZASU_S

    def wymagane_napiecie(self, czas_od_zaklocenia_s: float) -> float:
        """Wartość graniczna obwiedni w danej chwili [p.u.] — wyłącznie w nośniku."""
        return float(
            interpoluj_w_nosniku(
                np.array([czas_od_zaklocenia_s], dtype=np.float64),
                self.czasy_zalamania,
                self.wartosci_zalamania,
                nazwa_sygnalu=f"obwiednia_{self.rodzaj}",
            )[0]
        )


@dataclass(frozen=True)
class PrzebiegNapiecia:
    """WYNIK: zmierzony/zasymulowany przebieg napięcia — TYP RÓŻNY od obwiedni.

    ``zrodlo`` mówi wprost, skąd pochodzi przebieg. Wartość ``"obwiednia_profilu"``
    jest ZAKAZANA — to była właśnie fabrykacja z audytu.
    """

    czas_s: tuple[float, ...]
    napiecie_pu: tuple[float, ...]
    zrodlo: str
    element_ref: str

    def __post_init__(self) -> None:
        if len(self.czas_s) != len(self.napiecie_pu):
            raise ValueError("Niezgodne długości osi czasu i napięcia")
        if len(self.czas_s) < 2:
            raise ValueError("Przebieg wymaga co najmniej dwóch próbek")
        if self.zrodlo in ("obwiednia_profilu", "profil", "wymaganie"):
            raise ValueError(
                "Przebieg nie może pochodzić z obwiedni wymagania — to jest "
                "dokładnie fabrykacja wykryta w audycie (P0-01)."
            )


@dataclass(frozen=True)
class PrzebiegSkalarny:
    """Dowolny przebieg skalarny towarzyszący ocenie (moc czynna, ...).

    Osobny typ od ``PrzebiegNapiecia``, bo napięcie jest porównywane z obwiednią,
    a te wielkości z progami — pomylenie ich było źródłem defektu P0-01.

    UWAGA: ten typ NIE nadaje się do niesienia prądu wsparcia napięciowego.
    Wielkość bez zdefiniowanego prawa znaku jest tu zakazana — patrz
    ``PrzebiegPraduWsparcia``.
    """

    czas_s: tuple[float, ...]
    wartosci: tuple[float, ...]
    wielkosc: str
    jednostka: str
    zrodlo: str
    element_ref: str

    def __post_init__(self) -> None:
        if len(self.czas_s) != len(self.wartosci):
            raise ValueError("Niezgodne długości osi czasu i wartości")
        if len(self.czas_s) < 2:
            raise ValueError("Przebieg wymaga co najmniej dwóch próbek")


# ---------------------------------------------------------------------------
# Prąd wsparcia napięciowego — JAWNE PRAWO ZNAKU
# ---------------------------------------------------------------------------


def moc_pozorna_z_fazorow(napiecie_zespolone: complex, prad_zespolony: complex) -> complex:
    """Moc pozorna w KONWENCJI GENERATOROWEJ laboratorium: ``S = V · conj(I)``.

    Dodatnie ``P``/``Q`` to moc WSTRZYKIWANA do sieci (patrz `konwencje.py`, pkt 5
    i 6). Funkcja istnieje po to, żeby prawo znaku prądu wsparcia dało się
    sprawdzić testem wprost z definicji mocy, a nie przez zaufanie do komentarza.
    """
    return napiecie_zespolone * prad_zespolony.conjugate()


def prad_wsparcia_z_fazora(napiecie_zespolone: complex, prad_zespolony: complex) -> float:
    """Prąd wsparcia napięciowego [p.u.] z fazorów — JEDYNA definicja tej wielkości.

    WYPROWADZENIE (konwencja generatorowa ``S = V·conj(I)``, ``V = |V|e^{jθ}``):

        conj(I) = (P + jQ) / (|V| e^{jθ})
        I·e^{-jθ} = (P − jQ) / |V|
        Im(I·e^{-jθ}) = −Q / |V|

    Czyli w tej konwencji DODATNIE wsparcie napięcia (``Q > 0``, moc bierna
    wstrzykiwana) odpowiada UJEMNEJ części urojonej prądu w ramie napięcia.
    Dlatego wielkością kryterium jest

        I_q_wsparcie = −Im(I·e^{-jθ_V}) = Q / |V|

    i zachodzi ``Q > 0 ⟺ I_q_wsparcie > 0``.

    DLACZEGO TO JEST TYPEM, A NIE KOMENTARZEM. Poprzednia wersja kryterium brała
    abstrakcyjny, „dodatni" ``Iq`` z ogólnego przebiegu skalarnego. Kto podał tam
    surowe ``Im(I)``, dostawał werdykt ODWRÓCONY: falownik wstrzykujący moc bierną
    wyglądał na pobierający. To był błąd fizyczny, nie stylistyczny, i jedyną
    naprawą u źródła jest niesienie wielkości ZDEFINIOWANEJ, a nie nazwanej.

    Wynik jest niezmienniczy względem obrotu układu odniesienia: dla dowolnego φ
    podstawienie ``V→V·e^{jφ}``, ``I→I·e^{jφ}`` nie zmienia ani ``P``, ani ``Q``,
    ani tej wielkości.
    """
    modul = abs(napiecie_zespolone)
    if not np.isfinite(modul) or modul <= 0.0:
        raise ValueError(
            "Prąd wsparcia jest zdefiniowany względem FAZY napięcia — dla napięcia "
            "zerowego albo nieskończonego faza nie istnieje i wielkości nie da się "
            "wyznaczyć."
        )
    if not (np.isfinite(prad_zespolony.real) and np.isfinite(prad_zespolony.imag)):
        raise ValueError("Fazor prądu musi być liczbą skończoną")
    obrot = napiecie_zespolone.conjugate() / modul  # e^{-jθ}
    return -float((prad_zespolony * obrot).imag)


@dataclass(frozen=True)
class PrzebiegPraduWsparcia:
    """Przebieg prądu wsparcia napięciowego — wielkość z JAWNYM prawem znaku.

    Konwencja: ``I_q_wsparcie = −Im(I·e^{-jθ_V}) = Q/|V|``, dodatnia wartość =
    wsparcie napięcia (moc bierna wstrzykiwana). Konstruktor ``z_fazorow``
    wylicza tę wielkość z fazorów, więc nie da się jej „podać" w innej
    konwencji bez świadomego oszustwa.
    """

    czas_s: tuple[float, ...]
    wartosci_pu: tuple[float, ...]
    zrodlo: str
    element_ref: str

    def __post_init__(self) -> None:
        if len(self.czas_s) != len(self.wartosci_pu):
            raise ValueError("Niezgodne długości osi czasu i prądu wsparcia")
        if len(self.czas_s) < 2:
            raise ValueError("Przebieg wymaga co najmniej dwóch próbek")

    @classmethod
    def z_fazorow(
        cls,
        *,
        czas_s: Iterable[float],
        napiecie_zespolone: Iterable[complex],
        prad_zespolony: Iterable[complex],
        zrodlo: str,
        element_ref: str,
    ) -> PrzebiegPraduWsparcia:
        """Zbuduj przebieg z fazorów ``V(t)``, ``I(t)`` — jedyna droga bez założeń."""
        czasy = tuple(float(t) for t in czas_s)
        napiecia = tuple(napiecie_zespolone)
        prady = tuple(prad_zespolony)
        if not (len(czasy) == len(napiecia) == len(prady)):
            raise ValueError("Niezgodne długości osi czasu, napięcia i prądu")
        wartosci = tuple(prad_wsparcia_z_fazora(v, i) for v, i in zip(napiecia, prady, strict=True))
        return cls(czas_s=czasy, wartosci_pu=wartosci, zrodlo=zrodlo, element_ref=element_ref)


# ---------------------------------------------------------------------------
# Stan przyłączenia — dziennik zdarzeń, nie zbiór próbek
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ZdarzenieStanuPrzylaczenia:
    """Zmiana stanu przyłączenia w chwili ``czas_s`` (semantyka prawostronna).

    W chwili zdarzenia obowiązuje już stan NOWY. Dla wyłączenia jest to wybór
    ostrożny: moduł, który wypada w ``t``, jest w ``t`` uznany za odłączony.
    """

    czas_s: float
    przylaczony: bool

    def __post_init__(self) -> None:
        if not np.isfinite(self.czas_s):
            raise ValueError("Chwila zdarzenia musi być liczbą skończoną")


@dataclass(frozen=True)
class DziennikPrzylaczenia:
    """Stan początkowy + KOMPLETNY dziennik zdarzeń wyłączenia/powrotu.

    KONTRAKT TYPU (i jego cała treść): ``zdarzenia`` zawierają WSZYSTKIE zmiany
    stanu przyłączenia w przedziale ``[obowiazuje_od_s, obowiazuje_do_s]``.
    Dzięki temu stan jest funkcją kawałkami stałą, określoną w KAŻDEJ chwili
    tego przedziału — i tylko tam wolno o niego pytać.

    DLACZEGO NIE LISTA PRÓBEK. Wymaganie ma postać ``∀t∈[t_f,t_e]: c(t)=1``.
    Zbiór próbek z zapisem ``(t=0.5, True)`` mówi o JEDNEJ chwili; poprzednia
    wersja czytała z niego „moduł był przyłączony przez całe okno", bo szukała
    pierwszego ``False`` i żadnego nie znajdowała. Z jednej próbki kwantyfikator
    ogólny nie wynika — i ta wersja nie potrafi go z niej wyprowadzić: dziennik
    o zakresie ``[0.5, 0.5]`` po prostu nie pokrywa okna oceny.

    Postać kanoniczna (wymuszona w ``__post_init__``): czasy ściśle rosnące,
    stany NAPRZEMIENNE i różne od ``stan_poczatkowy`` na pierwszym zdarzeniu.
    Zdarzenie „bez zmiany stanu" nie niesie informacji, a psuje zliczanie parzystości.
    """

    stan_poczatkowy: bool
    zdarzenia: tuple[ZdarzenieStanuPrzylaczenia, ...]
    obowiazuje_od_s: float
    obowiazuje_do_s: float
    zrodlo: str

    def __post_init__(self) -> None:
        if not (np.isfinite(self.obowiazuje_od_s) and np.isfinite(self.obowiazuje_do_s)):
            raise ValueError("Przedział obowiązywania dziennika musi być skończony")
        if self.obowiazuje_do_s < self.obowiazuje_od_s - TOLERANCJA_CZASU_S:
            raise ValueError("Koniec obowiązywania dziennika wypada przed początkiem")
        stan = self.stan_poczatkowy
        poprzedni_czas: float | None = None
        for zdarzenie in self.zdarzenia:
            if (
                zdarzenie.czas_s < self.obowiazuje_od_s - TOLERANCJA_CZASU_S
                or zdarzenie.czas_s > self.obowiazuje_do_s + TOLERANCJA_CZASU_S
            ):
                raise ValueError(
                    f"Zdarzenie w t={zdarzenie.czas_s} leży poza przedziałem obowiązywania "
                    f"[{self.obowiazuje_od_s}, {self.obowiazuje_do_s}] — dziennik "
                    "deklarowałby kompletność poza własnym zakresem."
                )
            if (
                poprzedni_czas is not None
                and zdarzenie.czas_s <= poprzedni_czas + TOLERANCJA_CZASU_S
            ):
                raise ValueError("Zdarzenia dziennika muszą mieć ŚCIŚLE rosnące czasy")
            if zdarzenie.przylaczony == stan:
                raise ValueError(
                    "Zdarzenie nie zmienia stanu przyłączenia — dziennik musi być "
                    "w postaci kanonicznej (stany naprzemienne)."
                )
            stan = zdarzenie.przylaczony
            poprzedni_czas = zdarzenie.czas_s

    def pokrywa(self, od_s: float, do_s: float) -> bool:
        """Czy dziennik obowiązuje na CAŁYM zadanym oknie."""
        return (
            self.obowiazuje_od_s <= od_s + TOLERANCJA_CZASU_S
            and self.obowiazuje_do_s >= do_s - TOLERANCJA_CZASU_S
        )

    def przylaczony_w(self, czas_s: float) -> bool:
        """Stan w chwili ``czas_s`` — wyłącznie w przedziale obowiązywania."""
        if not self.pokrywa(czas_s, czas_s):
            raise EkstrapolacjaZabronionaError(
                f"Dziennik obowiązuje na [{self.obowiazuje_od_s:.6f}, "
                f"{self.obowiazuje_do_s:.6f}] s, a pytanie dotyczy t={czas_s:.6f} s. "
                "Poza zakresem dziennika stan przyłączenia jest NIEZNANY."
            )
        stan = self.stan_poczatkowy
        for zdarzenie in self.zdarzenia:
            if zdarzenie.czas_s <= czas_s + TOLERANCJA_CZASU_S:
                stan = zdarzenie.przylaczony
            else:
                break
        return stan

    def pierwsze_odlaczenie(self, od_s: float, do_s: float) -> float | None:
        """Pierwsza chwila okna, w której moduł NIE był przyłączony (albo ``None``).

        ``None`` znaczy tu ``∀t∈[od,do]: przyłączony`` — i znaczy to naprawdę,
        bo dziennik jest kompletny na całym oknie (warunek sprawdzany na wejściu).
        """
        if not self.pokrywa(od_s, do_s):
            raise EkstrapolacjaZabronionaError(
                f"Dziennik obowiązuje na [{self.obowiazuje_od_s:.6f}, "
                f"{self.obowiazuje_do_s:.6f}] s i nie pokrywa okna oceny "
                f"[{od_s:.6f}, {do_s:.6f}] s."
            )
        if not self.przylaczony_w(od_s):
            return float(od_s)
        for zdarzenie in self.zdarzenia:
            if (
                not zdarzenie.przylaczony
                and od_s - TOLERANCJA_CZASU_S <= zdarzenie.czas_s <= do_s + TOLERANCJA_CZASU_S
            ):
                return float(zdarzenie.czas_s)
        return None

    @classmethod
    def z_probek(
        cls,
        *,
        czas_s: Iterable[float],
        przylaczony: Iterable[bool],
        zrodlo: str,
        maks_odstep_s: float,
    ) -> DziennikPrzylaczenia:
        """Zbuduj dziennik z KANAŁU PRÓBKOWANEGO — z jawną semantyką kompletności.

        Wariant próbkowany jest dopuszczony, bo tak wychodzą dane z symulacji
        (kanał logiczny próbkowany krokiem całkowania), ale wolno go użyć tylko z
        DEKLARACJĄ ``maks_odstep_s``: „między dwiema kolejnymi próbkami odległymi
        o nie więcej niż Δ nie zgubiono żadnego zdarzenia". Deklaracja jest
        sprawdzana — kanał rzadszy niż Δ jest odrzucany, a nie milcząco przyjęty.

        REKONSTRUKCJA OSTROŻNA (reguła koniunkcji na przedziale): w przedziale
        między próbkami o RÓŻNYCH stanach chwila przełączenia jest nieznana, więc:

          * wyłączenie (True→False) datowane jest na POCZĄTEK przedziału,
          * powrót (False→True) datowany jest na KONIEC przedziału.

        Czyli w każdej chwili niepewności moduł jest uznany za ODŁĄCZONY. To jest
        wybór fail-closed: niepewność nie może pracować na korzyść modułu.
        Przedział przyłączenia o zerowej długości (próbka ``True`` między dwiema
        ``False``) znika — co jest tą samą regułą doprowadzoną do końca.

        Zakres obowiązywania dziennika to ``[t_pierwsza, t_ostatnia]``. Próbki NIE
        rozciągają go poza siebie: pomiar w 0,5 s nie mówi nic o 1,5 s.
        """
        if maks_odstep_s <= 0.0:
            raise ValueError("maks_odstep_s musi być dodatni — Δ=0 nie jest deklaracją")
        czasy = np.asarray(tuple(float(t) for t in czas_s), dtype=np.float64)
        stany = tuple(bool(s) for s in przylaczony)
        if czasy.size != len(stany):
            raise ValueError("Niezgodne długości osi czasu i stanu przyłączenia")
        if czasy.size == 0:
            raise ValueError("Kanał bez ani jednej próbki nie niesie informacji")

        wady = sprawdz_szereg_czasowy(
            czasy,
            None,
            okno_od_s=float(czasy[0]),
            okno_do_s=float(czasy[-1]),
            maks_odstep_probek_s=maks_odstep_s,
            minimalna_liczba_probek=1,
        )
        if wady:
            raise ValueError(
                "Kanał stanu przyłączenia nie spełnia zadeklarowanego kontraktu: "
                + ", ".join(w.value for w in wady)
            )

        surowe: list[ZdarzenieStanuPrzylaczenia] = []
        for i in range(len(stany) - 1):
            if stany[i] == stany[i + 1]:
                continue
            if stany[i] and not stany[i + 1]:
                surowe.append(ZdarzenieStanuPrzylaczenia(float(czasy[i]), False))
            else:
                surowe.append(ZdarzenieStanuPrzylaczenia(float(czasy[i + 1]), True))

        # Zwinięcie epizodów o zerowej długości: para zdarzeń w tej samej chwili
        # opisuje przyłączenie trwające zero sekund. Usuwamy PARĘ (parzystość
        # stanu zostaje zachowana), co jest regułą ostrożną doprowadzoną do końca.
        zdarzenia: list[ZdarzenieStanuPrzylaczenia] = []
        for zdarzenie in surowe:
            if zdarzenia and zdarzenie.czas_s <= zdarzenia[-1].czas_s + TOLERANCJA_CZASU_S:
                zdarzenia.pop()
                continue
            zdarzenia.append(zdarzenie)

        # Zwijanie par zachowuje naprzemienność (usuwane są dwa sąsiednie zdarzenia),
        # więc postać kanoniczna wychodzi z konstrukcji. Gdyby kiedyś przestała —
        # `__post_init__` odmówi zbudowania dziennika, zamiast go cicho poprawić.
        return cls(
            stan_poczatkowy=stany[0],
            zdarzenia=tuple(zdarzenia),
            obowiazuje_od_s=float(czasy[0]),
            obowiazuje_do_s=float(czasy[-1]),
            zrodlo=zrodlo,
        )


# ---------------------------------------------------------------------------
# Odbudowa mocy czynnej
# ---------------------------------------------------------------------------


class DziedzinaOdbudowy(StrEnum):
    """Dla jakiego znaku mocy przedzakłóceniowej kryterium profilu jest napisane.

    Reguła ``P(t) >= α·P_pre`` NIE jest neutralna względem znaku. Dla modułu
    wytwórczego (``P_pre > 0``) mówi „wróć do 90 % generacji". Zastosowana
    dosłownie do magazynu ładującego się mocą ``P_pre < 0`` mówi coś odwrotnego:
    ``P >= 0.9·P_pre`` jest spełnione już wtedy, gdy magazyn POBIERA MNIEJ, więc
    zaprzestanie ładowania „spełniałoby" wymaganie odbudowy. Dlatego profil musi
    zadeklarować, którą dziedzinę koduje, a ocena porównuje moc w
    ZADEKLAROWANYM kierunku.
    """

    GENERACJA = "generacja"
    POBOR = "pobor"

    @property
    def znak(self) -> float:
        return 1.0 if self is DziedzinaOdbudowy.GENERACJA else -1.0


@dataclass(frozen=True)
class KryteriumOdbudowyMocy:
    """Kryterium odbudowy mocy czynnej — bez ani jednej cichej wartości domyślnej.

    Definicja:

        t_rec = inf { t : P(τ)·znak >= α·|P_pre|  dla KAŻDEGO τ w [t, t+T_hold] }

    gdzie ``znak`` wynika z ``dziedzina``.

    WSZYSTKIE parametry progowe są WYMAGANE. Wcześniej ``prog_wzgledny=0.9``,
    ``czas_utrzymania_s=0.0`` i ``pasmo_martwe_pu=0.1`` były domyślne, więc
    kryterium regulacyjne mogło powstać bez ani jednej świadomej decyzji — a
    liczby normatywne różnią się między profilami operatorów. Zaszyta wartość
    domyślna progu jest twierdzeniem o normie, nie wygodą.

    ``czas_utrzymania_s = 0`` degeneruje definicję do „pierwsze przekroczenie
    progu", czyli do zachowania uznanego w audycie za niewystarczające
    (jednopróbkowy przeskok liczył się jako odbudowa). Wolno je podać WYŁĄCZNIE
    razem z ``dopuszcza_przekroczenie_chwilowe=True``, czyli z jawną deklaracją,
    że profil koduje kryterium chwilowego przekroczenia.
    """

    prog_wzgledny: float
    czas_utrzymania_s: float
    dziedzina: DziedzinaOdbudowy
    minimalna_moc_odniesienia_pu: float
    """Najmniejsze ``|P_pre|``, dla którego próg WZGLĘDNY ma sens [p.u.].

    Dla ``P_pre ≈ 0`` współczynnik odbudowy ``P/P_pre`` jest nieokreślony
    (dzielenie przez wielkość nieodróżnialną od zera), więc ocena zwraca
    ``NIEROZSTRZYGALNE``. Granica „≈ 0" jest parametrem kryterium, a nie stałą
    schowaną w kodzie — zaszyta byłaby dokładnie tym samym defektem, co progi
    domyślne wyżej.
    """
    maksymalny_czas_s: float | None = None
    """Wymagany limit czasu odbudowy [s od wyłączenia zwarcia]; ``None`` = nie oceniamy."""
    dopuszcza_przekroczenie_chwilowe: bool = False

    def __post_init__(self) -> None:
        if not 0.0 < self.prog_wzgledny <= 1.0:
            raise ValueError("prog_wzgledny musi być w (0, 1]")
        if self.czas_utrzymania_s < 0.0:
            raise ValueError("czas_utrzymania_s nie może być ujemny")
        if (
            self.czas_utrzymania_s <= TOLERANCJA_CZASU_S
            and not self.dopuszcza_przekroczenie_chwilowe
        ):
            raise ValueError(
                "czas_utrzymania_s = 0 znaczy 'wystarczy chwilowe przekroczenie progu'. "
                "To jest osobne kryterium regulacyjne, nie wartość domyślna — jeżeli "
                "profil je koduje, ustaw dopuszcza_przekroczenie_chwilowe=True."
            )
        if self.minimalna_moc_odniesienia_pu <= 0.0:
            raise ValueError("minimalna_moc_odniesienia_pu musi być dodatnia")
        if self.maksymalny_czas_s is not None and self.maksymalny_czas_s < 0.0:
            raise ValueError("maksymalny_czas_s nie może być ujemny")


@dataclass(frozen=True)
class OcenaOdbudowyMocy:
    """Wynik kryterium odbudowy mocy — z rozróżnieniem „nie odbudował" od „nie wiadomo"."""

    werdykt: WerdyktFrt
    czas_odbudowy_s: float | None
    """Czas od wyłączenia zwarcia do TRWAŁEGO przekroczenia progu; ``None`` = brak."""
    prog_pu: float | None
    """Próg w konwencji znakowej mocy (``None``, gdy kryterium jest poza dziedziną)."""
    uzasadnienie_pl: str
    wady_szeregu: tuple[WadaSzereguCzasowego, ...] = ()


def _przedzialy_powyzej_progu(
    t: NDArray[np.float64], wartosci: NDArray[np.float64], prog: float
) -> list[tuple[float, float]]:
    """Maksymalne przedziały, w których przebieg kawałkami liniowy jest >= progu.

    Krańce liczone DOKŁADNIE z przecięcia liniowego, nie zaokrąglane do próbek —
    inaczej próg przekroczony tuż po próbce przesuwałby początek utrzymania o
    cały krok i kryterium czasu utrzymania dawałoby inny wynik dla tej samej
    fizyki przy innym dt.
    """
    m = wartosci - prog
    przedzialy: list[tuple[float, float]] = []
    poczatek: float | None = float(t[0]) if m[0] >= 0.0 else None

    for i in range(len(t) - 1):
        a, b = float(m[i]), float(m[i + 1])
        ta, tb = float(t[i]), float(t[i + 1])
        if a >= 0.0 and b < 0.0:
            przeciecie = ta + (tb - ta) * (a / (a - b))
            if poczatek is not None:
                przedzialy.append((poczatek, przeciecie))
            poczatek = None
        elif a < 0.0 and b >= 0.0:
            poczatek = ta + (tb - ta) * (a / (a - b))
    if poczatek is not None:
        przedzialy.append((poczatek, float(t[-1])))
    return przedzialy


def ocen_odbudowe_mocy(
    przebieg: PrzebiegSkalarny,
    kryterium: KryteriumOdbudowyMocy,
    *,
    moc_przed_zaklocaniem_pu: float,
    chwila_wylaczenia_s: float,
    maks_odstep_probek_s: float | None = None,
) -> OcenaOdbudowyMocy:
    """Odbudowa P po wyłączeniu zwarcia — z WYMAGANYM czasem utrzymania.

    Defekt audytu (C5): poprzednia wersja zwracała chwilę PIERWSZEJ próbki
    powyżej progu. Przebieg, który na jedną próbkę przeskakuje 90 % mocy, zaraz
    potem opada i dopiero później wraca trwale, dostawał czas odbudowy z tego
    pierwszego, przypadkowego przeskoku. Tutaj odbudowa jest zdarzeniem TRWAŁYM:
    liczy się początek pierwszego przedziału, na którym warunek utrzymuje się
    przez pełne ``T_hold``.

    DZIEDZINA STOSOWALNOŚCI (runda 3). Próg jest WZGLĘDNY, więc ma sens tylko
    wtedy, gdy jest do czego go odnieść:

      * ``P_pre`` w kierunku zadeklarowanym przez ``kryterium.dziedzina`` i o
        module co najmniej ``minimalna_moc_odniesienia_pu`` → kryterium liczone;
      * ``P_pre`` o module poniżej tej granicy (praca jałowa) → współczynnik
        odbudowy NIEOKREŚLONY → ``NIEROZSTRZYGALNE``;
      * ``P_pre`` o znaku przeciwnym do zadeklarowanej dziedziny → kryterium
        jest poza swoją dziedziną → ``NIEROZSTRZYGALNE``.

    Gdy przebieg kończy się, zanim da się potwierdzić pełne okno utrzymania,
    wynik jest ``NIEROZSTRZYGALNE`` — nie ``NIE_SPELNIA``, bo brak obserwacji to
    nie jest obserwacja braku.
    """
    t = np.asarray(przebieg.czas_s, dtype=np.float64)
    p = np.asarray(przebieg.wartosci, dtype=np.float64)

    wady = sprawdz_szereg_czasowy(
        t,
        p,
        okno_od_s=chwila_wylaczenia_s,
        okno_do_s=None,
        maks_odstep_probek_s=maks_odstep_probek_s,
    )
    if wady:
        return OcenaOdbudowyMocy(
            werdykt=WerdyktFrt.NIEROZSTRZYGALNE,
            czas_odbudowy_s=None,
            prog_pu=None,
            uzasadnienie_pl=(
                "Przebieg mocy nie nadaje się do orzekania: "
                + ", ".join(w.value for w in wady)
                + ". Brak danych NIE jest wynikiem pozytywnym."
            ),
            wady_szeregu=wady,
        )

    if not np.isfinite(moc_przed_zaklocaniem_pu):
        return OcenaOdbudowyMocy(
            werdykt=WerdyktFrt.NIEROZSTRZYGALNE,
            czas_odbudowy_s=None,
            prog_pu=None,
            uzasadnienie_pl="Moc przed zakłóceniem nie jest liczbą skończoną.",
        )
    if abs(moc_przed_zaklocaniem_pu) < kryterium.minimalna_moc_odniesienia_pu:
        return OcenaOdbudowyMocy(
            werdykt=WerdyktFrt.NIEROZSTRZYGALNE,
            czas_odbudowy_s=None,
            prog_pu=None,
            uzasadnienie_pl=(
                f"Moc przed zakłóceniem {moc_przed_zaklocaniem_pu:+.4f} p.u. jest poniżej "
                f"granicy odniesienia {kryterium.minimalna_moc_odniesienia_pu:.4f} p.u. — "
                "współczynnik odbudowy P/P_pre jest NIEOKREŚLONY, kryterium względne "
                "nie ma tu treści."
            ),
        )
    znak = kryterium.dziedzina.znak
    if moc_przed_zaklocaniem_pu * znak < 0.0:
        return OcenaOdbudowyMocy(
            werdykt=WerdyktFrt.NIEROZSTRZYGALNE,
            czas_odbudowy_s=None,
            prog_pu=None,
            uzasadnienie_pl=(
                f"Kryterium jest zadeklarowane dla dziedziny '{kryterium.dziedzina.value}', "
                f"a moc przed zakłóceniem wynosi {moc_przed_zaklocaniem_pu:+.4f} p.u. "
                "Reguła progu względnego zastosowana do przeciwnego znaku mocy zmienia "
                "sens wymagania, więc nie jest tu stosowana."
            ),
        )

    prog_modulu = kryterium.prog_wzgledny * abs(moc_przed_zaklocaniem_pu)
    prog_pu = znak * prog_modulu

    maska = t >= chwila_wylaczenia_s - TOLERANCJA_CZASU_S
    if np.count_nonzero(maska) < 2:
        return OcenaOdbudowyMocy(
            werdykt=WerdyktFrt.NIEROZSTRZYGALNE,
            czas_odbudowy_s=None,
            prog_pu=prog_pu,
            uzasadnienie_pl=(
                "Przebieg mocy nie pokrywa czasu po wyłączeniu zwarcia — "
                "odbudowy nie da się ani potwierdzić, ani wykluczyć."
            ),
        )
    t_po = t[maska]
    p_po = znak * p[maska]
    koniec_danych = float(t_po[-1])
    przedzialy = _przedzialy_powyzej_progu(t_po, p_po, prog_modulu)

    for poczatek, koniec in przedzialy:
        if koniec - poczatek >= kryterium.czas_utrzymania_s - TOLERANCJA_CZASU_S:
            czas = float(poczatek - chwila_wylaczenia_s)
            if (
                kryterium.maksymalny_czas_s is not None
                and czas > kryterium.maksymalny_czas_s + TOLERANCJA_CZASU_S
            ):
                return OcenaOdbudowyMocy(
                    werdykt=WerdyktFrt.NIE_SPELNIA,
                    czas_odbudowy_s=czas,
                    prog_pu=prog_pu,
                    uzasadnienie_pl=(
                        f"Moc odbudowana trwale po {czas:.4f} s, wymagane "
                        f"≤ {kryterium.maksymalny_czas_s:.4f} s "
                        f"(próg {prog_pu:+.4f} p.u. utrzymany przez "
                        f"{kryterium.czas_utrzymania_s:.4f} s)."
                    ),
                )
            return OcenaOdbudowyMocy(
                werdykt=WerdyktFrt.SPELNIA,
                czas_odbudowy_s=czas,
                prog_pu=prog_pu,
                uzasadnienie_pl=(
                    f"Moc osiągnęła próg {prog_pu:+.4f} p.u. po {czas:.4f} s "
                    f"i utrzymała go przez wymagane {kryterium.czas_utrzymania_s:.4f} s."
                ),
            )

    # Żaden przedział nie osiągnął pełnego okna utrzymania. Rozstrzygnięcie zależy
    # od tego, CZY dane w ogóle pozwalały je zaobserwować.
    otwarte = [(a, b) for a, b in przedzialy if abs(b - koniec_danych) <= TOLERANCJA_CZASU_S]
    if otwarte:
        return OcenaOdbudowyMocy(
            werdykt=WerdyktFrt.NIEROZSTRZYGALNE,
            czas_odbudowy_s=None,
            prog_pu=prog_pu,
            uzasadnienie_pl=(
                f"Moc jest powyżej progu {prog_pu:+.4f} p.u. od t={otwarte[-1][0]:.4f} s, ale "
                f"przebieg kończy się w {koniec_danych:.4f} s, zanim upłynie wymagane "
                f"{kryterium.czas_utrzymania_s:.4f} s utrzymania — odbudowy nie da się potwierdzić."
            ),
        )
    if kryterium.maksymalny_czas_s is not None:
        wymagany_koniec = (
            chwila_wylaczenia_s + kryterium.maksymalny_czas_s + kryterium.czas_utrzymania_s
        )
        if koniec_danych < wymagany_koniec - TOLERANCJA_CZASU_S:
            return OcenaOdbudowyMocy(
                werdykt=WerdyktFrt.NIEROZSTRZYGALNE,
                czas_odbudowy_s=None,
                prog_pu=prog_pu,
                uzasadnienie_pl=(
                    f"Przebieg kończy się w {koniec_danych:.4f} s, przed chwilą "
                    f"{wymagany_koniec:.4f} s, do której wymaganie dopuszcza odbudowę — "
                    "braku odbudowy nie da się stwierdzić."
                ),
            )
    return OcenaOdbudowyMocy(
        werdykt=WerdyktFrt.NIE_SPELNIA,
        czas_odbudowy_s=None,
        prog_pu=prog_pu,
        uzasadnienie_pl=(
            f"Moc ani razu nie utrzymała progu {prog_pu:+.4f} p.u. przez wymagane "
            f"{kryterium.czas_utrzymania_s:.4f} s do końca obserwacji ({koniec_danych:.4f} s)."
        ),
    )


# ---------------------------------------------------------------------------
# Obwiednia napięcia
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class OcenaObwiedniNapiecia:
    """Wynik JEDNEGO kryterium: przebieg napięcia względem obwiedni.

    NIE jest oceną zdolności FRT — patrz ``OcenaZdolnosciFrt``. Nazwa typu jest
    tu zabezpieczeniem: konsument nie może wziąć tego wyniku za pełną ocenę,
    bo nie ma w nim pól, które pełna ocena musi nieść.
    """

    werdykt: WerdyktFrt
    margines_pu: float | None
    chwila_krytyczna_s: float | None
    napiecie_zmierzone_pu: float | None
    napiecie_wymagane_pu: float | None
    uzasadnienie_pl: str
    liczba_probek_ocenionych: int
    liczba_wezlow_siatki: int = 0
    """Rozmiar WSPÓLNEJ siatki (próbki + załamania obwiedni + krańce okna)."""
    okno_od_s: float | None = None
    okno_do_s: float | None = None
    wady_szeregu: tuple[WadaSzereguCzasowego, ...] = ()


def ocen_obwiednie_napiecia(
    przebieg: PrzebiegNapiecia,
    obwiednia: ObwiedniaFrt,
    *,
    chwila_zaklocenia_s: float,
    tolerancja_pu: float = 0.0,
    horyzont_s: float | None = None,
    maks_odstep_probek_s: float | None = None,
) -> OcenaObwiedniNapiecia:
    """Oceń zgodność PRZEBIEGU z OBWIEDNIĄ — dwa różne obiekty, dwa różne typy.

    Margines liczony jako minimalna rezerwa względem obwiedni:
      - LVRT: ``min(U_zmierzone(t) - U_wymagane(t))`` — ujemny = zejście pod obwiednię;
      - HVRT: ``min(U_wymagane(t) - U_zmierzone(t))`` — ujemny = wyjście ponad obwiednię.

    CO DOKŁADNIE ZNACZY „MINIMUM DOKŁADNE" (sprostowanie, runda 3). Wynik jest
    dokładnym minimum LINIOWEJ REKONSTRUKCJI ``Û(t) − U_req(t)``, czyli funkcji
    zbudowanej z próbek przez interpolację liniową — a NIE minimum nieznanego
    rzeczywistego rozwiązania między próbkami. Obie składowe rekonstrukcji są
    kawałkami liniowe (symulacja między próbkami, obwiednia między załamaniami),
    więc ich różnica jest kawałkami liniowa na SUMIE obu zbiorów węzłów i osiąga
    minimum w węźle — dlatego minimum na wspólnej siatce jest dokładne DLA
    REKONSTRUKCJI. Rzeczywisty przebieg między próbkami może zejść niżej; jedyną
    obroną przed tym jest gęstość próbkowania, czyli ``maks_odstep_probek_s``,
    a nie sama metoda liczenia minimum. Poprzednia wersja liczyła margines
    wyłącznie w chwilach próbek, więc krótkie załamanie obwiedni między próbkami
    było pomijane i wynik bywał zawyżony — to jest naprawione, ale nie jest
    równoznaczne z dowodem na continuum.

    Zwraca ``NIEROZSTRZYGALNE``, gdy przebieg nie pokrywa okna oceny albo gdy
    profil nie stawia wymagania do końca tego okna — brak danych i brak wymagania
    NIE są wynikiem pozytywnym.
    """
    t = np.asarray(przebieg.czas_s, dtype=np.float64)
    u = np.asarray(przebieg.napiecie_pu, dtype=np.float64)
    okno_od = float(chwila_zaklocenia_s)
    okno_do = None if horyzont_s is None else okno_od + float(horyzont_s)

    wady = sprawdz_szereg_czasowy(
        t,
        u,
        okno_od_s=okno_od,
        okno_do_s=okno_do,
        maks_odstep_probek_s=maks_odstep_probek_s,
    )

    maska = t >= okno_od - TOLERANCJA_CZASU_S
    if okno_do is not None:
        maska &= t <= okno_do + TOLERANCJA_CZASU_S
    if not bool(np.any(maska)):
        wady = wady + (WadaSzereguCzasowego.BRAK_PROBEK,)

    koniec = okno_do if okno_do is not None else (float(t[-1]) if t.size else okno_od)
    if WadaSzereguCzasowego.CZAS_NIESKONCZONY not in wady and not obwiednia.pokrywa(
        koniec - okno_od
    ):
        wady = wady + (WadaSzereguCzasowego.OBWIEDNIA_NIE_POKRYWA_OKNA,)

    if wady:
        return OcenaObwiedniNapiecia(
            werdykt=WerdyktFrt.NIEROZSTRZYGALNE,
            margines_pu=None,
            chwila_krytyczna_s=None,
            napiecie_zmierzone_pu=None,
            napiecie_wymagane_pu=None,
            uzasadnienie_pl=(
                f"Przebieg nie nadaje się do orzekania w oknie [{okno_od:.4f}, {koniec:.4f}] s: "
                + ", ".join(w.value for w in wady)
                + ". Brak danych NIE jest wynikiem pozytywnym."
            ),
            liczba_probek_ocenionych=int(np.count_nonzero(maska)),
            liczba_wezlow_siatki=0,
            okno_od_s=okno_od,
            okno_do_s=okno_do,
            wady_szeregu=wady,
        )

    wezly = [t[maska], obwiednia.czasy_zalamania + okno_od, np.array([okno_od, koniec])]
    siatka = np.unique(np.concatenate(wezly))
    siatka = siatka[
        (siatka >= okno_od - TOLERANCJA_CZASU_S) & (siatka <= koniec + TOLERANCJA_CZASU_S)
    ]

    u_siatka = interpoluj_w_nosniku(siatka, t, u, nazwa_sygnalu="napiecie")
    wymagane = interpoluj_w_nosniku(
        siatka - okno_od,
        obwiednia.czasy_zalamania,
        obwiednia.wartosci_zalamania,
        nazwa_sygnalu=f"obwiednia_{obwiednia.rodzaj}",
    )
    margines = (u_siatka - wymagane) if obwiednia.rodzaj == "lvrt" else (wymagane - u_siatka)

    i_min = int(np.argmin(margines))
    margines_min = float(margines[i_min])
    spelnia = margines_min >= -tolerancja_pu
    return OcenaObwiedniNapiecia(
        werdykt=WerdyktFrt.SPELNIA if spelnia else WerdyktFrt.NIE_SPELNIA,
        margines_pu=margines_min,
        chwila_krytyczna_s=float(siatka[i_min]),
        napiecie_zmierzone_pu=float(u_siatka[i_min]),
        napiecie_wymagane_pu=float(wymagane[i_min]),
        uzasadnienie_pl=(
            f"Punkt krytyczny t={float(siatka[i_min]):.4f} s: "
            f"U_zmierzone={float(u_siatka[i_min]):.4f} p.u., "
            f"U_wymagane={float(wymagane[i_min]):.4f} p.u., "
            f"margines={margines_min:+.4f} p.u. (dokładne minimum rekonstrukcji "
            f"kawałkami liniowej na wspólnej siatce {siatka.size} węzłów; "
            "zachowanie między próbkami pozostaje poza obserwacją)"
        ),
        liczba_probek_ocenionych=int(np.count_nonzero(maska)),
        liczba_wezlow_siatki=int(siatka.size),
        okno_od_s=okno_od,
        okno_do_s=okno_do,
        wady_szeregu=(),
    )


# ---------------------------------------------------------------------------
# Manifest kryteriów profilu — koniec z `None` jako „nie wymaga"
# ---------------------------------------------------------------------------


KRYTERIUM_OBWIEDNIA = "obwiednia_napiecia"
KRYTERIUM_STAN_PRZYLACZENIA = "stan_przylaczenia"
KRYTERIUM_PRAD_WSPARCIA = "prad_bierny_wsparcia"
KRYTERIUM_ODBUDOWA_MOCY = "odbudowa_mocy"
KRYTERIUM_CZAS_ODPOWIEDZI_BIERNEJ = "czas_odpowiedzi_biernej"
KRYTERIUM_LOGIKA_WYLACZENIA_OEM = "logika_wylaczenia_oem"
KRYTERIUM_OBWOD_DC = "obwod_dc_modulu"

KRYTERIA_OCENIANE: tuple[str, ...] = (
    KRYTERIUM_OBWIEDNIA,
    KRYTERIUM_STAN_PRZYLACZENIA,
    KRYTERIUM_PRAD_WSPARCIA,
    KRYTERIUM_ODBUDOWA_MOCY,
)
"""Kryteria, które to laboratorium potrafi policzyć."""

KRYTERIA_POZA_MODELEM: tuple[str, ...] = (
    KRYTERIUM_CZAS_ODPOWIEDZI_BIERNEJ,
    KRYTERIUM_LOGIKA_WYLACZENIA_OEM,
    KRYTERIUM_OBWOD_DC,
)
"""Kryteria FRT, których to laboratorium NIE liczy — wymienione, żeby profil
musiał się do nich odnieść zamiast o nich milczeć."""

KRYTERIA_FRT: tuple[str, ...] = KRYTERIA_OCENIANE + KRYTERIA_POZA_MODELEM
"""Lista ZAMKNIĘTA. Kryterium spoza niej jest w manifeście błędem (literówka w
nazwie cicho zostawiałaby prawdziwe kryterium niezmapowanym), a kryterium z niej
pominięte w manifeście ma status ``NIEZMAPOWANE`` — nigdy „niewymagane".
Przypięte testem ``test_lista_kryteriow_jest_zamknieta``."""


class StatusKryterium(StrEnum):
    """Status kryterium w profilu — jawny stan zamiast ``None``.

    ``None`` znaczyło naraz dwie różne rzeczy: „profil świadomie tego nie wymaga"
    i „ktoś zapomniał zmapować wymaganie". Pierwsze wolno pominąć, drugiego nie
    wolno — a odróżnić się ich nie dało. To ta sama klasa defektu, co dawny
    domyślny poziom dowodowy.

    Odpowiedniki angielskie z karty audytu: WYMAGANE = REQUIRED,
    NIE_DOTYCZY = NOT_APPLICABLE, NIEOBSLUGIWANE = UNSUPPORTED,
    NIEZMAPOWANE = NOT_MAPPED.
    """

    WYMAGANE = "wymagane"
    NIE_DOTYCZY = "nie_dotyczy"
    NIEOBSLUGIWANE = "nieobslugiwane"
    NIEZMAPOWANE = "niezmapowane"


#: Statusy, które BLOKUJĄ werdykt pozytywny całości. Tylko ``NIE_DOTYCZY`` wolno
#: pominąć — „nie umiem policzyć" i „nie wiem, czy trzeba" to nie to samo, co
#: „profil tego nie wymaga".
STATUSY_BLOKUJACE: frozenset[StatusKryterium] = frozenset(
    {StatusKryterium.NIEOBSLUGIWANE, StatusKryterium.NIEZMAPOWANE}
)


@dataclass(frozen=True)
class ManifestKryteriowProfilu:
    """Jawny status KAŻDEGO znanego kryterium FRT dla danego profilu."""

    pozycje: tuple[tuple[str, StatusKryterium], ...]

    def __post_init__(self) -> None:
        nazwy = [nazwa for nazwa, _ in self.pozycje]
        nieznane = sorted(set(nazwy) - set(KRYTERIA_FRT))
        if nieznane:
            raise ValueError(
                f"Manifest wymienia kryteria spoza listy zamkniętej: {nieznane}. "
                "Literówka w nazwie zostawiłaby prawdziwe kryterium niezmapowanym."
            )
        if len(set(nazwy)) != len(nazwy):
            raise ValueError("Manifest wymienia to samo kryterium więcej niż raz")
        for nazwa, status in self.pozycje:
            if nazwa in KRYTERIA_POZA_MODELEM and status is StatusKryterium.WYMAGANE:
                raise ValueError(
                    f"Kryterium '{nazwa}' jest poza modelem tego laboratorium, więc nie "
                    "może mieć statusu WYMAGANE — profil, który go wymaga, opisz jako "
                    "NIEOBSLUGIWANE (i tak zablokuje werdykt pozytywny, ale uczciwie)."
                )

    @classmethod
    def z_mapy(cls, mapa: Mapping[str, StatusKryterium]) -> ManifestKryteriowProfilu:
        """Manifest z mapy; kryterium pominięte dostaje ``NIEZMAPOWANE``."""
        return cls(pozycje=tuple((nazwa, mapa[nazwa]) for nazwa in sorted(mapa)))

    def status(self, kryterium: str) -> StatusKryterium:
        """Status kryterium — POMINIĘTE znaczy ``NIEZMAPOWANE``, nie „niewymagane"."""
        if kryterium not in KRYTERIA_FRT:
            raise ValueError(f"'{kryterium}' nie jest znanym kryterium FRT")
        for nazwa, status in self.pozycje:
            if nazwa == kryterium:
                return status
        return StatusKryterium.NIEZMAPOWANE

    def o_statusie(self, status: StatusKryterium) -> tuple[str, ...]:
        """Kryteria o zadanym statusie — w kolejności listy zamkniętej."""
        return tuple(k for k in KRYTERIA_FRT if self.status(k) is status)

    @property
    def kryteria_blokujace(self) -> tuple[str, ...]:
        """Kryteria, przez które całość nie może wyjść pozytywnie."""
        return tuple(k for k in KRYTERIA_FRT if self.status(k) in STATUSY_BLOKUJACE)


@dataclass(frozen=True)
class WymaganiePraduBiernego:
    """Wymaganie wsparcia napięcia prądem biernym w czasie zapadu (typu NC RfG k).

    ``wspolczynnik_k`` [p.u./p.u.]: wymagany przyrost prądu wsparcia na jednostkę
    zapadu napięcia poza pasmem martwym. ``pasmo_martwe_pu`` jest WYMAGANE —
    wartość 0,1 p.u. jest typowa, ale nie uniwersalna, a domyślna byłaby
    twierdzeniem o cudzym profilu.

    GRANICA TEGO KRYTERIUM — nazwana, nie ukryta: sprawdzany jest wyłącznie
    warunek amplitudowy ``ΔI_q_wsparcia >= k·(ΔU − pasmo_martwe)`` w oknie zapadu.
    NIE są sprawdzane: czas narastania odpowiedzi, dokładność regulacji w stanie
    ustalonym ani zachowanie po ustąpieniu zapadu. Profil operatora, który stawia
    te wymagania, NIE jest tym kryterium pokryty (patrz
    ``KRYTERIUM_CZAS_ODPOWIEDZI_BIERNEJ`` w manifeście).
    """

    wspolczynnik_k: float
    pasmo_martwe_pu: float

    def __post_init__(self) -> None:
        if self.wspolczynnik_k < 0.0:
            raise ValueError("wspolczynnik_k nie może być ujemny")
        if self.pasmo_martwe_pu < 0.0:
            raise ValueError("pasmo_martwe_pu nie może być ujemne")


@dataclass(frozen=True)
class WymaganieZdolnosciFrt:
    """CO profil wymaga — manifest statusów PLUS parametry wymaganych kryteriów.

    Requiredness kryterium wynika WYŁĄCZNIE z manifestu; pola parametrów niosą
    tylko liczby. Spójność obu jest sprawdzana w ``__post_init__``, żeby nie dało
    się zadeklarować wymagania bez progu ani podać progu do kryterium, którego
    profil nie wymaga.
    """

    obwiednia: ObwiedniaFrt
    horyzont_s: float
    manifest: ManifestKryteriowProfilu
    kryterium_odbudowy: KryteriumOdbudowyMocy | None = None
    wymaganie_pradu_biernego: WymaganiePraduBiernego | None = None
    tolerancja_napiecia_pu: float = 0.0
    maks_odstep_probek_s: float | None = None
    identyfikator_profilu: str = ""

    def __post_init__(self) -> None:
        if self.horyzont_s <= 0.0:
            raise ValueError("horyzont_s musi być dodatni — okno zerowej długości nic nie orzeka")
        if self.manifest.status(KRYTERIUM_OBWIEDNIA) is not StatusKryterium.WYMAGANE:
            raise ValueError(
                "Obwiednia napięcia jest definicyjnym rdzeniem FRT — manifest musi "
                "nadać jej status WYMAGANE."
            )
        if not self.obwiednia.pokrywa(self.horyzont_s):
            raise ValueError(
                f"Obwiednia profilu kończy się w {self.obwiednia.koniec_obowiazywania_s:.4f} s "
                f"od zakłócenia, a horyzont oceny sięga {self.horyzont_s:.4f} s. Poza ostatnim "
                "punktem profil nie stawia wymagania i nie wolno go dopowiadać."
            )
        self._sprawdz_spojnosc(
            KRYTERIUM_ODBUDOWA_MOCY, self.kryterium_odbudowy, "kryterium_odbudowy"
        )
        self._sprawdz_spojnosc(
            KRYTERIUM_PRAD_WSPARCIA, self.wymaganie_pradu_biernego, "wymaganie_pradu_biernego"
        )

    def _sprawdz_spojnosc(self, kryterium: str, parametry: object | None, pole: str) -> None:
        wymagane = self.manifest.status(kryterium) is StatusKryterium.WYMAGANE
        if wymagane and parametry is None:
            raise ValueError(
                f"Manifest wymaga kryterium '{kryterium}', a pole '{pole}' jest puste — "
                "wymaganie bez progu nie jest wymaganiem."
            )
        if not wymagane and parametry is not None:
            raise ValueError(
                f"Pole '{pole}' jest wypełnione, a manifest nie nadaje kryterium "
                f"'{kryterium}' statusu WYMAGANE. Parametry bez wymagania sugerowałyby "
                "ocenę, której nie będzie."
            )


# ---------------------------------------------------------------------------
# Złożenie: zdolność FRT
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class WierszWhiteBox:
    """Jeden wiersz uzasadnienia: co zmierzono, wobec czego, z jakim marginesem.

    Defekt P0-01 polegał na tym, że ślad zapisywał wartość WYMAGANIA w kolumnie
    wielkości zmierzonej. Tutaj to są dwa osobne pola i osobne źródła — wiersz,
    w którym ``zmierzone`` pochodzi z obwiedni, jest niewyrażalny.
    """

    kryterium: str
    werdykt: WerdyktFrt
    zmierzone: float | None
    jednostka_zmierzonego: str
    wymagane: float | None
    margines: float | None
    chwila_s: float | None
    okno_od_s: float
    okno_do_s: float
    dane_kompletne: bool
    zrodlo_przebiegu: str
    uzasadnienie_pl: str


@dataclass(frozen=True)
class OcenaZdolnosciFrt:
    """Werdykt złożony z kryteriów WYMIENIONYCH W MANIFEŚCIE — i tylko z nich.

    UCZCIWOŚĆ NAZWY (runda 3). Ten typ NIE twierdzi, że „pełna fizyka FRT została
    zwalidowana". Twierdzi dokładnie tyle: każde kryterium, któremu manifest
    profilu nadał status WYMAGANE, zostało rozstrzygnięte na podanych danych.
    Kompletność jest więc WZGLĘDNA wobec manifestu i czytelna w polach
    ``kryteria_nieobslugiwane`` / ``kryteria_niezmapowane`` — poza modelem
    laboratorium zostają m.in. czas odpowiedzi prądu biernego, logika wyłączania
    zabezpieczeń producenta i obwód pośredniczący DC.

    Werdykt ``SPELNIA`` wymaga łącznie: (a) każde wymagane kryterium
    rozstrzygnięte pozytywnie, (b) manifest bez statusów blokujących. Jedno
    ``NIEROZSTRZYGALNE`` czyni całość nierozstrzygalną; jedno ``NIE_SPELNIA``
    czyni całość negatywną. Nie ma sumowania „większość kryteriów przeszła".
    """

    werdykt: WerdyktFrt
    wiersze: tuple[WierszWhiteBox, ...]
    element_ref: str
    identyfikator_profilu: str
    uzasadnienie_pl: str
    status_dowodowy_pl: str = (
        "UNVALIDATED_MODEL — wynik laboratorium badawczego. Przydatność dowodową "
        "rozstrzyga rejestr `solver_input.provenance` po stronie produkcji, nie ten typ."
    )
    kryteria_niepokryte: tuple[str, ...] = ()
    """Kryteria wymagane przez profil, dla których NIE było danych."""
    kryteria_nie_dotyczy: tuple[str, ...] = ()
    kryteria_nieobslugiwane: tuple[str, ...] = ()
    kryteria_niezmapowane: tuple[str, ...] = ()

    @property
    def spelnia(self) -> bool:
        return self.werdykt is WerdyktFrt.SPELNIA

    @property
    def manifest_kompletny(self) -> bool:
        """Czy profil odniósł się do KAŻDEGO znanego kryterium i każde jest liczalne."""
        return not (self.kryteria_nieobslugiwane or self.kryteria_niezmapowane)


def _wiersz_braku(
    kryterium: str,
    *,
    okno_od_s: float,
    okno_do_s: float,
    uzasadnienie_pl: str,
    jednostka: str = "—",
) -> WierszWhiteBox:
    """Wiersz śladu dla kryterium, którego NIE dało się rozstrzygnąć."""
    return WierszWhiteBox(
        kryterium=kryterium,
        werdykt=WerdyktFrt.NIEROZSTRZYGALNE,
        zmierzone=None,
        jednostka_zmierzonego=jednostka,
        wymagane=None,
        margines=None,
        chwila_s=None,
        okno_od_s=okno_od_s,
        okno_do_s=okno_do_s,
        dane_kompletne=False,
        zrodlo_przebiegu="—",
        uzasadnienie_pl=uzasadnienie_pl,
    )


def _ocen_prad_wsparcia(
    przebieg_iq: PrzebiegPraduWsparcia,
    przebieg_u: PrzebiegNapiecia,
    wymaganie: WymaganiePraduBiernego,
    *,
    okno_od_s: float,
    okno_do_s: float,
    napiecie_przed_pu: float,
    iq_przed_pu: float,
    maks_odstep_probek_s: float | None,
) -> WierszWhiteBox:
    """Amplitudowy warunek wsparcia: ``ΔI_q >= k·(ΔU − pasmo_martwe)``.

    Oba szeregi (prąd wsparcia i napięcie) przechodzą przez ten sam kontrakt, co
    napięcie w ocenie obwiedni. Wcześniej ta funkcja interpolowała ``np.interp``
    bez ŻADNEJ kontroli pokrycia: przebieg prądu urwany w 0,5 s dostawał od
    biblioteki stałą wartość brzegową aż do końca okna i kryterium orzekało na
    danych, których nie było.
    """
    t_iq = np.asarray(przebieg_iq.czas_s, dtype=np.float64)
    iq = np.asarray(przebieg_iq.wartosci_pu, dtype=np.float64)
    t_u = np.asarray(przebieg_u.czas_s, dtype=np.float64)
    u = np.asarray(przebieg_u.napiecie_pu, dtype=np.float64)

    wady: list[str] = []
    for etykieta, czas, wartosci in (("prad_wsparcia", t_iq, iq), ("napiecie", t_u, u)):
        wady.extend(
            f"{etykieta}: {wada.value}"
            for wada in sprawdz_szereg_czasowy(
                czas,
                wartosci,
                okno_od_s=okno_od_s,
                okno_do_s=okno_do_s,
                maks_odstep_probek_s=maks_odstep_probek_s,
            )
        )
    if not np.isfinite(napiecie_przed_pu) or not np.isfinite(iq_przed_pu):
        return _wiersz_braku(
            KRYTERIUM_PRAD_WSPARCIA,
            okno_od_s=okno_od_s,
            okno_do_s=okno_do_s,
            jednostka="p.u.",
            uzasadnienie_pl="Wartości sprzed zakłócenia nie są liczbami skończonymi.",
        )
    if wady:
        return _wiersz_braku(
            KRYTERIUM_PRAD_WSPARCIA,
            okno_od_s=okno_od_s,
            okno_do_s=okno_do_s,
            jednostka="p.u.",
            uzasadnienie_pl=(
                "Szeregi prądu wsparcia/napięcia nie nadają się do orzekania w oknie: "
                + ", ".join(dict.fromkeys(wady))
                + ". Wartość brzegowa poza nośnikiem byłaby fabrykacją przebiegu."
            ),
        )

    siatka = np.unique(np.concatenate([t_iq, t_u, np.array([okno_od_s, okno_do_s])]))
    siatka = siatka[
        (siatka >= okno_od_s - TOLERANCJA_CZASU_S) & (siatka <= okno_do_s + TOLERANCJA_CZASU_S)
    ]
    if siatka.size == 0:
        return _wiersz_braku(
            KRYTERIUM_PRAD_WSPARCIA,
            okno_od_s=okno_od_s,
            okno_do_s=okno_do_s,
            jednostka="p.u.",
            uzasadnienie_pl="Brak próbek prądu wsparcia w oknie oceny.",
        )

    iq_s = interpoluj_w_nosniku(siatka, t_iq, iq, nazwa_sygnalu="prad_wsparcia")
    u_s = interpoluj_w_nosniku(siatka, t_u, u, nazwa_sygnalu="napiecie")
    zapad = np.maximum(napiecie_przed_pu - u_s - wymaganie.pasmo_martwe_pu, 0.0)
    wymagany_przyrost = wymaganie.wspolczynnik_k * zapad
    margines = (iq_s - iq_przed_pu) - wymagany_przyrost

    i = int(np.argmin(margines))
    ok = float(margines[i]) >= 0.0
    return WierszWhiteBox(
        kryterium=KRYTERIUM_PRAD_WSPARCIA,
        werdykt=WerdyktFrt.SPELNIA if ok else WerdyktFrt.NIE_SPELNIA,
        zmierzone=float(iq_s[i] - iq_przed_pu),
        jednostka_zmierzonego="p.u.",
        wymagane=float(wymagany_przyrost[i]),
        margines=float(margines[i]),
        chwila_s=float(siatka[i]),
        okno_od_s=okno_od_s,
        okno_do_s=okno_do_s,
        dane_kompletne=True,
        zrodlo_przebiegu=przebieg_iq.zrodlo,
        uzasadnienie_pl=(
            f"Najmniejsza rezerwa w t={float(siatka[i]):.4f} s: "
            f"ΔI_q_wsparcia={float(iq_s[i] - iq_przed_pu):+.4f} p.u., "
            f"wymagane ≥ {float(wymagany_przyrost[i]):+.4f} p.u. "
            f"(k={wymaganie.wspolczynnik_k:g}, pasmo martwe {wymaganie.pasmo_martwe_pu:g} p.u.; "
            "znak dodatni = wsparcie napięcia, Q wstrzykiwana)."
        ),
    )


def ocen_zdolnosc_frt(
    *,
    przebieg_napiecia: PrzebiegNapiecia,
    wymaganie: WymaganieZdolnosciFrt,
    chwila_zaklocenia_s: float,
    dziennik_przylaczenia: DziennikPrzylaczenia | None = None,
    przebieg_mocy: PrzebiegSkalarny | None = None,
    moc_przed_zaklocaniem_pu: float | None = None,
    chwila_wylaczenia_s: float | None = None,
    przebieg_pradu_wsparcia: PrzebiegPraduWsparcia | None = None,
    napiecie_przed_zaklocaniem_pu: float | None = None,
    prad_wsparcia_przed_zaklocaniem_pu: float | None = None,
) -> OcenaZdolnosciFrt:
    """Złóż kryteria wymagane przez manifest w JEDEN werdykt — fail-closed.

    To jest funkcja, której poprzednia wersja modułu nie miała: ``ocen_frt``
    sprawdzała wyłącznie obwiednię napięcia, a nazwa sugerowała pełną ocenę.
    Tutaj każde kryterium wymagane przez profil musi dostać dane; brak danych,
    kryterium nieobsługiwane przez laboratorium i kryterium niezmapowane w
    profilu dają ``NIEROZSTRZYGALNE``, nigdy ``SPELNIA``.
    """
    okno_od = float(chwila_zaklocenia_s)
    okno_do = okno_od + float(wymaganie.horyzont_s)
    manifest = wymaganie.manifest
    wiersze: list[WierszWhiteBox] = []
    niepokryte: list[str] = []

    ocena_u = ocen_obwiednie_napiecia(
        przebieg_napiecia,
        wymaganie.obwiednia,
        chwila_zaklocenia_s=okno_od,
        tolerancja_pu=wymaganie.tolerancja_napiecia_pu,
        horyzont_s=wymaganie.horyzont_s,
        maks_odstep_probek_s=wymaganie.maks_odstep_probek_s,
    )
    wiersze.append(
        WierszWhiteBox(
            kryterium=KRYTERIUM_OBWIEDNIA,
            werdykt=ocena_u.werdykt,
            zmierzone=ocena_u.napiecie_zmierzone_pu,
            jednostka_zmierzonego="p.u.",
            wymagane=ocena_u.napiecie_wymagane_pu,
            margines=ocena_u.margines_pu,
            chwila_s=ocena_u.chwila_krytyczna_s,
            okno_od_s=okno_od,
            okno_do_s=okno_do,
            dane_kompletne=not ocena_u.wady_szeregu,
            zrodlo_przebiegu=przebieg_napiecia.zrodlo,
            uzasadnienie_pl=ocena_u.uzasadnienie_pl,
        )
    )
    if ocena_u.wady_szeregu:
        niepokryte.append(KRYTERIUM_OBWIEDNIA)

    if manifest.status(KRYTERIUM_STAN_PRZYLACZENIA) is StatusKryterium.WYMAGANE:
        if dziennik_przylaczenia is None:
            niepokryte.append(KRYTERIUM_STAN_PRZYLACZENIA)
            wiersze.append(
                _wiersz_braku(
                    KRYTERIUM_STAN_PRZYLACZENIA,
                    okno_od_s=okno_od,
                    okno_do_s=okno_do,
                    uzasadnienie_pl=(
                        "Profil wymaga potwierdzenia, że moduł pozostał przyłączony, a "
                        "dziennika przyłączenia nie podano. BRAK sygnału wyłączenia "
                        "NIE jest dowodem przyłączenia."
                    ),
                )
            )
        elif not dziennik_przylaczenia.pokrywa(okno_od, okno_do):
            niepokryte.append(KRYTERIUM_STAN_PRZYLACZENIA)
            wiersze.append(
                WierszWhiteBox(
                    kryterium=KRYTERIUM_STAN_PRZYLACZENIA,
                    werdykt=WerdyktFrt.NIEROZSTRZYGALNE,
                    zmierzone=None,
                    jednostka_zmierzonego="s",
                    wymagane=None,
                    margines=None,
                    chwila_s=None,
                    okno_od_s=okno_od,
                    okno_do_s=okno_do,
                    dane_kompletne=False,
                    zrodlo_przebiegu=dziennik_przylaczenia.zrodlo,
                    uzasadnienie_pl=(
                        f"Dziennik przyłączenia obowiązuje na "
                        f"[{dziennik_przylaczenia.obowiazuje_od_s:.4f}, "
                        f"{dziennik_przylaczenia.obowiazuje_do_s:.4f}] s i nie pokrywa okna "
                        f"[{okno_od:.4f}, {okno_do:.4f}] s. Wymaganie ma postać "
                        "'przyłączony w KAŻDEJ chwili okna' — z zapisu krótszego niż okno "
                        f"({WadaSzereguCzasowego.DZIENNIK_NIE_POKRYWA_OKNA.value}) ono nie wynika."
                    ),
                )
            )
        else:
            odlaczenie = dziennik_przylaczenia.pierwsze_odlaczenie(okno_od, okno_do)
            wiersze.append(
                WierszWhiteBox(
                    kryterium=KRYTERIUM_STAN_PRZYLACZENIA,
                    werdykt=(WerdyktFrt.SPELNIA if odlaczenie is None else WerdyktFrt.NIE_SPELNIA),
                    zmierzone=None if odlaczenie is None else odlaczenie,
                    jednostka_zmierzonego="s",
                    wymagane=None,
                    margines=None,
                    chwila_s=odlaczenie,
                    okno_od_s=okno_od,
                    okno_do_s=okno_do,
                    dane_kompletne=True,
                    zrodlo_przebiegu=dziennik_przylaczenia.zrodlo,
                    uzasadnienie_pl=(
                        "Moduł pozostał przyłączony w każdej chwili okna oceny "
                        "(dziennik kompletny na całym oknie)."
                        if odlaczenie is None
                        else f"Moduł odłączył się w t={odlaczenie:.4f} s, wewnątrz okna oceny."
                    ),
                )
            )

    if manifest.status(KRYTERIUM_ODBUDOWA_MOCY) is StatusKryterium.WYMAGANE:
        kryterium_odbudowy = wymaganie.kryterium_odbudowy
        assert kryterium_odbudowy is not None  # gwarantowane przez WymaganieZdolnosciFrt
        brakuje = (
            przebieg_mocy is None or moc_przed_zaklocaniem_pu is None or chwila_wylaczenia_s is None
        )
        if brakuje:
            niepokryte.append(KRYTERIUM_ODBUDOWA_MOCY)
            wiersze.append(
                _wiersz_braku(
                    KRYTERIUM_ODBUDOWA_MOCY,
                    okno_od_s=okno_od,
                    okno_do_s=okno_do,
                    jednostka="s",
                    uzasadnienie_pl=(
                        "Profil wymaga oceny odbudowy mocy, a nie podano kompletu: "
                        "przebiegu P(t), mocy przed zakłóceniem i chwili wyłączenia."
                    ),
                )
            )
        else:
            assert przebieg_mocy is not None
            assert moc_przed_zaklocaniem_pu is not None
            assert chwila_wylaczenia_s is not None
            ocena_p = ocen_odbudowe_mocy(
                przebieg_mocy,
                kryterium_odbudowy,
                moc_przed_zaklocaniem_pu=moc_przed_zaklocaniem_pu,
                chwila_wylaczenia_s=chwila_wylaczenia_s,
                maks_odstep_probek_s=wymaganie.maks_odstep_probek_s,
            )
            if ocena_p.werdykt is WerdyktFrt.NIEROZSTRZYGALNE:
                niepokryte.append(KRYTERIUM_ODBUDOWA_MOCY)
            wiersze.append(
                WierszWhiteBox(
                    kryterium=KRYTERIUM_ODBUDOWA_MOCY,
                    werdykt=ocena_p.werdykt,
                    zmierzone=ocena_p.czas_odbudowy_s,
                    jednostka_zmierzonego="s",
                    wymagane=kryterium_odbudowy.maksymalny_czas_s,
                    margines=(
                        None
                        if (
                            ocena_p.czas_odbudowy_s is None
                            or kryterium_odbudowy.maksymalny_czas_s is None
                        )
                        else kryterium_odbudowy.maksymalny_czas_s - ocena_p.czas_odbudowy_s
                    ),
                    chwila_s=ocena_p.czas_odbudowy_s,
                    okno_od_s=okno_od,
                    okno_do_s=okno_do,
                    dane_kompletne=ocena_p.werdykt is not WerdyktFrt.NIEROZSTRZYGALNE,
                    zrodlo_przebiegu=przebieg_mocy.zrodlo,
                    uzasadnienie_pl=ocena_p.uzasadnienie_pl,
                )
            )

    if manifest.status(KRYTERIUM_PRAD_WSPARCIA) is StatusKryterium.WYMAGANE:
        wymaganie_iq = wymaganie.wymaganie_pradu_biernego
        assert wymaganie_iq is not None  # gwarantowane przez WymaganieZdolnosciFrt
        brakuje_iq = (
            przebieg_pradu_wsparcia is None
            or napiecie_przed_zaklocaniem_pu is None
            or prad_wsparcia_przed_zaklocaniem_pu is None
        )
        if brakuje_iq:
            niepokryte.append(KRYTERIUM_PRAD_WSPARCIA)
            wiersze.append(
                _wiersz_braku(
                    KRYTERIUM_PRAD_WSPARCIA,
                    okno_od_s=okno_od,
                    okno_do_s=okno_do,
                    jednostka="p.u.",
                    uzasadnienie_pl=(
                        "Profil wymaga wsparcia napięcia prądem biernym, a nie podano "
                        "przebiegu prądu wsparcia wraz z wartościami sprzed zakłócenia."
                    ),
                )
            )
        else:
            assert przebieg_pradu_wsparcia is not None
            assert napiecie_przed_zaklocaniem_pu is not None
            assert prad_wsparcia_przed_zaklocaniem_pu is not None
            wiersz_iq = _ocen_prad_wsparcia(
                przebieg_pradu_wsparcia,
                przebieg_napiecia,
                wymaganie_iq,
                okno_od_s=okno_od,
                okno_do_s=okno_do,
                napiecie_przed_pu=napiecie_przed_zaklocaniem_pu,
                iq_przed_pu=prad_wsparcia_przed_zaklocaniem_pu,
                maks_odstep_probek_s=wymaganie.maks_odstep_probek_s,
            )
            if wiersz_iq.werdykt is WerdyktFrt.NIEROZSTRZYGALNE:
                niepokryte.append(KRYTERIUM_PRAD_WSPARCIA)
            wiersze.append(wiersz_iq)

    nieobslugiwane = manifest.o_statusie(StatusKryterium.NIEOBSLUGIWANE)
    niezmapowane = manifest.o_statusie(StatusKryterium.NIEZMAPOWANE)
    for kryterium in nieobslugiwane:
        niepokryte.append(kryterium)
        wiersze.append(
            _wiersz_braku(
                kryterium,
                okno_od_s=okno_od,
                okno_do_s=okno_do,
                uzasadnienie_pl=(
                    f"Profil stawia wymaganie '{kryterium}', którego to laboratorium NIE "
                    "liczy. Pominięcie go byłoby twierdzeniem, że fizyka FRT została "
                    "zwalidowana w całości."
                ),
            )
        )
    for kryterium in niezmapowane:
        niepokryte.append(kryterium)
        wiersze.append(
            _wiersz_braku(
                kryterium,
                okno_od_s=okno_od,
                okno_do_s=okno_do,
                uzasadnienie_pl=(
                    f"Kryterium '{kryterium}' nie ma statusu w manifeście profilu. Brak "
                    "zmapowania NIE znaczy 'profil tego nie wymaga' — znaczy 'nie wiadomo'."
                ),
            )
        )

    werdykty = [w.werdykt for w in wiersze]
    if WerdyktFrt.NIE_SPELNIA in werdykty:
        calosc = WerdyktFrt.NIE_SPELNIA
    elif WerdyktFrt.NIEROZSTRZYGALNE in werdykty:
        calosc = WerdyktFrt.NIEROZSTRZYGALNE
    else:
        calosc = WerdyktFrt.SPELNIA

    negatywne = [w.kryterium for w in wiersze if w.werdykt is WerdyktFrt.NIE_SPELNIA]
    nierozstrzygniete = [w.kryterium for w in wiersze if w.werdykt is WerdyktFrt.NIEROZSTRZYGALNE]
    nie_dotyczy = manifest.o_statusie(StatusKryterium.NIE_DOTYCZY)
    if calosc is WerdyktFrt.SPELNIA:
        uzasadnienie = (
            f"Wszystkie {len(wiersze)} kryteria wymagane przez manifest profilu "
            f"rozstrzygnięte pozytywnie w oknie [{okno_od:.4f}, {okno_do:.4f}] s. "
            f"Poza oceną (status 'nie dotyczy'): {', '.join(nie_dotyczy) or 'brak'}."
        )
    elif calosc is WerdyktFrt.NIE_SPELNIA:
        uzasadnienie = "Kryteria niespełnione: " + ", ".join(negatywne) + "."
    else:
        uzasadnienie = (
            "Kryteria nierozstrzygalne: "
            + ", ".join(nierozstrzygniete)
            + ". Brak danych, kryterium nieobsługiwane i kryterium niezmapowane NIE są "
            "spełnieniem wymagania."
        )

    return OcenaZdolnosciFrt(
        werdykt=calosc,
        wiersze=tuple(wiersze),
        element_ref=przebieg_napiecia.element_ref,
        identyfikator_profilu=wymaganie.identyfikator_profilu,
        uzasadnienie_pl=uzasadnienie,
        kryteria_niepokryte=tuple(dict.fromkeys(niepokryte)),
        kryteria_nie_dotyczy=nie_dotyczy,
        kryteria_nieobslugiwane=nieobslugiwane,
        kryteria_niezmapowane=niezmapowane,
    )

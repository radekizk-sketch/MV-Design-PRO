"""Kandydat kontraktu wyniku dynamicznego: szereg czasowy + tożsamość + diagnostyka.

KOD BADAWCZY — patrz `backend/research/README.md`.
**KANDYDAT, NIE KANON.** Nie zastępuje ``ResultSetV1`` bez akceptacji właściciela.

Dlaczego istniejący kontrakt nie wystarcza (audyt §25):
- ``resultset_v1_schema.json`` jest z założenia MIGAWKOWY — nie ma osi czasu,
  tablicy próbek ani ``dt``;
- kontrakty dynamiczne w produkcji są trzy, równoległe i niekanoniczne;
- brakuje ``f(t)``, ``Efd(t)``, ``Pm(t)``, ``SOC(t)``; ``P(t)``/``Q(t)`` są
  zadeklarowane, ale nigdy nie wypełniane;
- dwa z trzech wyników nie mają ŻADNEGO odcisku i nie wiążą się z migawką sieci.

Zasada projektowa tego kandydata: **wynik musi dać się odtworzyć i obalić.**
Dlatego niesie nie tylko przebiegi, ale tożsamość modelu, scenariusza i migawki,
tolerancje numeryczne oraz stan zbieżności — bez tego nie da się orzec, czy dwa
różne wyniki to różnica fizyki, czy różnica nastaw solvera.

Przydatność dowodowa NIE jest polem tego kontraktu — decyduje o niej rejestr
``solver_input.provenance`` po stronie produkcji. Wynik laboratorium jest z
definicji ``UNVALIDATED_MODEL``.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from dynamic_lab.skonczonosc import wymagaj_skonczonosci

KONTRAKT = "DynamicResultSetKandydatV1"


class PrzestrzenSygnalu(StrEnum):
    """Skąd pochodzi przebieg — WYJŚCIE modelu czy ZMIENNA STANU integratora.

    Bez tego rozróżnienia klucz sygnału nie był tożsamością. ``FalownikGFL`` ma
    stany nazwane ``p_pu``/``q_pu``, a silnik zapisuje pod tymi samymi nazwami
    moc czynną i bierną policzoną z wstrzyknięcia. Obie serie trafiały więc do
    JEDNEGO ciągu i przeplatały się próbka po próbce: wynik ``p_pu@DER`` był
    naprzemiennie mocą wyjściową i zmienną stanu. Nic tego nie zgłaszało, a
    testy OZE radziły sobie braniem co drugiej próbki — czyli utrwalały defekt
    zamiast go pokazać.
    """

    WYJSCIE = "output"
    """Wielkość policzona z modelu i napięcia sieci (P, Q, I, U, f)."""
    STAN = "state"
    """Zmienna stanu całkowana przez integrator."""


class KompletnoscPrzebiegu(StrEnum):
    """Czy przebieg pokrywa ŻĄDANY przedział czasu.

    ``zbiegl=False`` nie wystarczało: solver, który miał policzyć do 2,0 s i padł
    w 0,4 s, oddawał 0,4 s poprawnych danych. Konsument czytający wyłącznie
    przebiegi widział komplet liczb i nie miał jak stwierdzić, że okno jest
    niedomknięte (defekt B3/H audytu).
    """

    PELNY = "pelny"
    PRZERWANY_BLEDEM = "przerwany_bledem"


class KolizjaSygnaluError(RuntimeError):
    """Dwa zapisy TEGO SAMEGO sygnału w jednej chwili — dane by się przeplotły."""


class NiezgodnaDlugoscPrzebieguError(ValueError):
    """Przebieg ma inną liczbę próbek niż oś czasu — nie da się go odczytać."""


class NiemonotonicznaOsCzasuError(ValueError):
    """Oś czasu nie rośnie ściśle — chwila powtórzona albo cofnięta."""


#: Tolerancja porównań czasu w diagnostyce [s].
_TOLERANCJA_CZASU_S = 1.0e-9


@dataclass(frozen=True)
class Sygnal:
    """Pojedynczy przebieg czasowy z jawną jednostką i przypisaniem.

    TOŻSAMOŚCIĄ sygnału jest trójka ``(przestrzen, klucz, element_ref)``, a nie
    sama para ``(klucz, element_ref)``. Patrz ``PrzestrzenSygnalu``.
    """

    klucz: str
    etykieta_pl: str
    jednostka: str
    element_ref: str | None
    wartosci: tuple[float, ...]
    przestrzen: PrzestrzenSygnalu = PrzestrzenSygnalu.WYJSCIE

    @property
    def klucz_pelny(self) -> str:
        """Jednoznaczny identyfikator sygnału, np. ``state.p_pu`` / ``output.p_pu``."""
        return f"{self.przestrzen.value}.{self.klucz}"

    def to_dict(self) -> dict[str, Any]:
        return {
            "klucz": self.klucz,
            "klucz_pelny": self.klucz_pelny,
            "przestrzen": self.przestrzen.value,
            "etykieta_pl": self.etykieta_pl,
            "jednostka": self.jednostka,
            "element_ref": self.element_ref,
            "wartosci": list(self.wartosci),
        }


@dataclass(frozen=True)
class TozsamoscModelu:
    """Kto liczył — model, jego wersja i zestaw parametrów.

    ``odcisk_parametrow`` pozwala wykryć, że „ten sam" model policzył co innego,
    bo zmieniono parametr. Bez tego porównanie dwóch biegów jest bez wartości.
    """

    element_ref: str
    klasa_modelu: str
    liczba_stanow: int
    nazwy_stanow: tuple[str, ...]
    odcisk_parametrow: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "element_ref": self.element_ref,
            "klasa_modelu": self.klasa_modelu,
            "liczba_stanow": self.liczba_stanow,
            "nazwy_stanow": list(self.nazwy_stanow),
            "odcisk_parametrow": self.odcisk_parametrow,
        }


@dataclass(frozen=True)
class BladSolvera:
    """Forensyka niepowodzenia — dlaczego, kiedy i na czym symulacja padła.

    PO CO. Pierwsza wersja tego laboratorium redukowała KAŻDE niepowodzenie do
    jednego ``zbiegl = False``. Pod tym Booleanem chowały się cztery zupełnie
    różne zdarzenia, wymagające czterech różnych reakcji inżyniera:

      - Newton integratora się rozjechał  -> zmniejsz krok albo zmień metodę,
      - macierz sieci osobliwa            -> wyspa bez źródła / błąd topologii,
      - model zwrócił NaN/Inf             -> błąd równań urządzenia,
      - przekroczono limit iteracji sieci -> zaostrz/poluzuj tolerancję.

    Wynik, z którego nie da się odczytać, KTÓRE z nich zaszło, nie nadaje się
    ani na ślad White Box, ani na materiał dowodowy — a to jest deklarowany cel
    kandydata kontraktu. Ten typ jest odpowiedzią na tę lukę.
    """

    klasa: str
    """Nazwa klasy wyjątku, np. ``BrakZbieznosciSieciError``."""
    komunikat: str
    faza: str
    """Gdzie padło: ``"algebra_sieci"``, ``"calkowanie"`` albo ``"probkowanie"``."""
    czas_s: float
    """Chwila symulacji, w której nastąpiło niepowodzenie."""
    krok_s: float
    """Długość kroku, na którym padło (może być krótsza od nominalnej)."""
    numer_kroku: int
    residuum_sieci: float
    """Największe residuum algebraiczne zaobserwowane do tej chwili."""
    stan_skonczony: bool
    """Czy wektor stanu był skończony tuż przed niepowodzeniem (NaN/Inf = False)."""
    stany_niesksonczone: tuple[str, ...] = ()
    """Nazwy stanów (``urzadzenie.stan``), które przestały być skończone."""
    szyny_niesksonczone: tuple[str, ...] = ()
    """Szyny, których napięcie przestało być skończone."""

    def to_dict(self) -> dict[str, Any]:
        return {
            "klasa": self.klasa,
            "komunikat": self.komunikat,
            "faza": self.faza,
            "czas_s": self.czas_s,
            "krok_s": self.krok_s,
            "numer_kroku": self.numer_kroku,
            "residuum_sieci": self.residuum_sieci,
            "stan_skonczony": self.stan_skonczony,
            "stany_niesksonczone": list(self.stany_niesksonczone),
            "szyny_niesksonczone": list(self.szyny_niesksonczone),
        }


@dataclass(frozen=True)
class RzutowanieStanu:
    """Ślad JEDNEGO rzutowania stanu na przedział dopuszczalny urządzenia.

    PO CO W WYNIKU, A NIE TYLKO W LOGU INTEGRATORA. Rzutowanie znaczy, że krok
    wyszedł poza zbiór niezmienniczy przepływu ścisłego — czyli że w TYM kroku
    metoda spadła do rzędu 1, a błąd lokalny ma rozmiar ``nadmiar``. Konsument
    wyniku musi móc to zobaczyć, żeby nie wziąć przebiegu trzymającego się granicy
    za dowód, że model sam w niej został.

    Typ jest ZDUBLOWANY względem ``calkowanie.ZapisRzutowania`` świadomie: kontrakt
    wyniku nie importuje warstwy numerycznej, bo wtedy przestałby być czytelny bez
    niej. Mapowanie robi `silnik.SilnikRMS` — w jednym miejscu.
    """

    chwila_s: float
    indeks: int
    nazwa: str
    znaczenie: str
    wartosc_przed: float
    wartosc_po: float
    granica: str
    """``"dol"`` albo ``"gora"``."""

    @property
    def nadmiar(self) -> float:
        """O ile krok wyszedł poza dopuszczalny przedział."""
        return abs(self.wartosc_przed - self.wartosc_po)

    def to_dict(self) -> dict[str, Any]:
        return {
            "chwila_s": self.chwila_s,
            "indeks": self.indeks,
            "nazwa": self.nazwa,
            "znaczenie": self.znaczenie,
            "wartosc_przed": self.wartosc_przed,
            "wartosc_po": self.wartosc_po,
            "granica": self.granica,
            "nadmiar": self.nadmiar,
        }


@dataclass(frozen=True)
class DiagnostykaSolvera:
    """Czy wynikowi wolno ufać od strony NUMERYCZNEJ (to nie to samo co fizycznie)."""

    integrator: str
    krok_s: float
    liczba_krokow: int
    ewaluacje_pochodnych: int
    maks_residuum_sieci: float
    maks_iteracji_sieci: int
    zbiegl: bool
    norma_pochodnej_w_t0: float
    """``||f(x0, y0)||`` — dowód (lub jego brak), że start jest w równowadze."""
    blad: BladSolvera | None = None
    """Wypełnione DOKŁADNIE wtedy, gdy ``zbiegl`` jest ``False``."""
    czas_zadany_s: float = 0.0
    """Koniec przedziału, który symulacja miała policzyć (``requested_end_time``)."""
    czas_osiagniety_s: float = 0.0
    """Do której chwili symulacja realnie doszła (przy błędzie < żądany koniec)."""
    kompletnosc: KompletnoscPrzebiegu = KompletnoscPrzebiegu.PELNY
    """Czy przebieg pokrywa ŻĄDANY przedział — patrz ``KompletnoscPrzebiegu``."""
    kroki_skrocone: int = 0
    """Ile kroków zostało skróconych, żeby trafić dokładnie w zdarzenie/koniec."""
    kroki_scisle_zbiezne: int = 0
    """Ile kroków całkowania osiągnęło ŻĄDANĄ tolerancję (``rho <= 1``).

    Metody jawne nie rozwiązują równania nieliniowego, więc każdy ich krok jest
    ścisły z definicji — dla nich ta liczba równa się ``liczba_krokow``."""
    kroki_na_podlodze_numerycznej: int = 0
    """Ile kroków ZATRZYMAŁO SIĘ na podłodze numerycznej powyżej żądanej tolerancji.

    Krok taki jest kontynuowany wyłącznie przy jawnej zgodzie
    (``dopuszczaj_zastoj=True`` + dziennik). NIEZEROWA wartość oznacza, że wynik
    NIE spełnia zadeklarowanej tolerancji — i to musi być widoczne w wyniku, a nie
    tylko w logu integratora. Przed tą zmianą jądro Newtona zwracało sukces DWIEMA
    drogami (``||r|| < tol`` oraz zastój z ``||r|| < 10^4 * tol``) tą samą wartością;
    zmierzone na siatce 410 przypadków: 93 zwróciły sukces z residuum powyżej progu
    ścisłego, największe ``1,2494e-06`` przy progu ``1,0e-09`` (1249×)."""
    najgorsze_rho: float = 0.0
    """Największe residuum SKALOWANE spośród kroków (``rho <= 1`` = tolerancja ścisła)."""
    rzutowania_stanu: tuple[RzutowanieStanu, ...] = ()
    """Rzutowania stanu na przedział dopuszczalny urządzenia — patrz ``RzutowanieStanu``.

    Pusta krotka znaczy „niezmiennik trzymał się sam". Niepusta NIE jest błędem,
    ale JEST informacją, że krok był na tyle duży, iż wyszedł poza zbiór
    niezmienniczy przepływu ścisłego — czyli że rząd metody w tym kroku spadł."""
    niezmienniki_stanu_egzekwowane: int = 0
    """Ile ograniczników stanu urządzeń pilnował integrator tego biegu.

    ZERO przy modelu, który ograniczniki deklaruje, znaczyłoby, że nakładka nie
    została wpięta — dlatego liczba jest w wyniku, a nie tylko w konfiguracji."""

    def __post_init__(self) -> None:
        # LICZBY DIAGNOSTYKI TEŻ MUSZĄ BYĆ LICZBAMI (plan naprawy §2). ``NaN`` w
        # ``maks_residuum_sieci`` albo w ``najgorsze_rho`` przechodził przez KAŻDE
        # porównanie poniżej jako fałsz, więc wynik z rozjechaną numeryką wyglądał
        # na wynik o doskonałej diagnostyce.
        for nazwa, wartosc in (
            ("krok_s", self.krok_s),
            ("maks_residuum_sieci", self.maks_residuum_sieci),
            ("norma_pochodnej_w_t0", self.norma_pochodnej_w_t0),
            ("czas_zadany_s", self.czas_zadany_s),
            ("czas_osiagniety_s", self.czas_osiagniety_s),
            ("najgorsze_rho", self.najgorsze_rho),
        ):
            wymagaj_skonczonosci(wartosc, co=nazwa, gdzie="diagnostyka solvera")
        if self.zbiegl and self.blad is not None:
            raise ValueError("Wynik zbieżny nie może nieść opisu błędu")
        if not self.zbiegl and self.blad is None:
            raise ValueError(
                "Wynik niezbieżny MUSI nieść opis błędu — sam `zbiegl=False` "
                "nie pozwala odróżnić rozjechanego Newtona od osobliwej sieci."
            )
        # PREDYKATY PARAMI: „przebieg pełny" i „doszedł do żądanego końca" muszą
        # pochodzić z jednego źródła prawdy, inaczej wynik urwany w 0,4 s mógłby
        # nadal deklarować kompletność dla okna 2,0 s.
        niedomkniety = self.czas_osiagniety_s < self.czas_zadany_s - _TOLERANCJA_CZASU_S
        if niedomkniety and self.kompletnosc is KompletnoscPrzebiegu.PELNY:
            raise ValueError(
                f"Przebieg kończy się w {self.czas_osiagniety_s} s, a żądano "
                f"{self.czas_zadany_s} s — nie wolno oznaczyć go jako PELNY."
            )
        if self.kroki_scisle_zbiezne < 0 or self.kroki_na_podlodze_numerycznej < 0:
            raise ValueError("Liczniki kroków nie mogą być ujemne")
        policzone = self.kroki_scisle_zbiezne + self.kroki_na_podlodze_numerycznej
        if self.zbiegl and policzone != self.liczba_krokow:
            raise ValueError(
                f"Bieg zbieżny ma {self.liczba_krokow} kroków, a sprawozdania opisują "
                f"{policzone} ({self.kroki_scisle_zbiezne} ścisłych + "
                f"{self.kroki_na_podlodze_numerycznej} na podłodze). Każdy przyjęty krok "
                "MUSI mieć sprawozdanie — inaczej „wszystkie kroki ścisłe” byłoby "
                "twierdzeniem o krokach, których nikt nie policzył."
            )
        if self.najgorsze_rho < 0.0:
            raise ValueError("rho nie może być ujemne")
        # PREDYKATY PARAMI: status kroku i osiągnięte rho pochodzą z jednego
        # sprawozdania, więc nie wolno im się rozjechać.
        if self.kroki_na_podlodze_numerycznej == 0 and self.najgorsze_rho > 1.0:
            raise ValueError(
                f"Żaden krok nie zgłosił zastoju, a najgorsze rho = {self.najgorsze_rho} > 1. "
                "Status kroku i osiągnięte residuum muszą pochodzić z tego samego "
                "sprawozdania."
            )

    @property
    def kazdy_krok_scisle_zbiezny(self) -> bool:
        """Czy KAŻDY przyjęty krok osiągnął żądaną tolerancję.

        Jedyne miejsce, w którym wolno powiedzieć „bieg spełnia zadeklarowaną
        tolerancję". Samo ``zbiegl`` tego NIE znaczy: bieg dopuszczający zastój
        kończy się bez wyjątku, mając kroki powyżej progu."""
        return self.zbiegl and self.kroki_na_podlodze_numerycznej == 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "integrator": self.integrator,
            "krok_s": self.krok_s,
            "liczba_krokow": self.liczba_krokow,
            "ewaluacje_pochodnych": self.ewaluacje_pochodnych,
            "maks_residuum_sieci": self.maks_residuum_sieci,
            "maks_iteracji_sieci": self.maks_iteracji_sieci,
            "zbiegl": self.zbiegl,
            "norma_pochodnej_w_t0": self.norma_pochodnej_w_t0,
            "blad": self.blad.to_dict() if self.blad is not None else None,
            "czas_zadany_s": self.czas_zadany_s,
            "czas_osiagniety_s": self.czas_osiagniety_s,
            "kompletnosc": self.kompletnosc.value,
            "kroki_skrocone": self.kroki_skrocone,
            "kroki_scisle_zbiezne": self.kroki_scisle_zbiezne,
            "kroki_na_podlodze_numerycznej": self.kroki_na_podlodze_numerycznej,
            "najgorsze_rho": self.najgorsze_rho,
            "rzutowania_stanu": [r.to_dict() for r in self.rzutowania_stanu],
            "niezmienniki_stanu_egzekwowane": self.niezmienniki_stanu_egzekwowane,
        }


@dataclass(frozen=True)
class WynikDynamiczny:
    """Kandydat wyniku symulacji dynamicznej."""

    kontrakt: str
    czas_s: tuple[float, ...]
    sygnaly: tuple[Sygnal, ...]
    modele: tuple[TozsamoscModelu, ...]
    zdarzenia: tuple[dict[str, Any], ...]
    diagnostyka: DiagnostykaSolvera
    odcisk_scenariusza: str
    odcisk_topologii: str
    odcisk_implementacji: str = ""
    """Odcisk KODU, który policzył ten wynik — patrz `tozsamosc.odcisk_implementacji`.

    Tożsamość modelu i scenariusza mówią, CO liczono; ten odcisk mówi, CZYM.
    Bez niego wynik da się przypisać do kodu, który go nie policzył: poprawka w
    solverze, w ograniczniku prądu albo w kryterium zbieżności zmienia przebieg,
    nie ruszając żadnego z pozostałych odcisków.

    Pusty napis znaczy „wynik zbudowany poza silnikiem" (import, konwersja,
    ręcznie złożony przypadek testowy) i jest uczciwym meldunkiem braku —
    wpisanie tam bieżącego odcisku byłoby TWIERDZENIEM, że ten kod policzył
    dane, których nie widział."""
    uwaga_dowodowa_pl: str = (
        "Wynik z laboratorium badawczego. NIE jest dowodem regulacyjnym "
        "ani zwalidowaną symulacją fizyczną."
    )

    def __post_init__(self) -> None:
        """RÓWNOLEGŁOŚĆ SERII: jedna próbka na sygnał na każdą chwilę osi czasu.

        PO CO TO JEST MECHANIZMEM, A NIE UMOWĄ. Przebieg o innej długości niż oś
        czasu nie jest „trochę niekompletny" — jest NIEINTERPRETOWALNY: nie
        wiadomo, którym chwilom odpowiadają jego wartości, a wykres i tak się
        narysuje. Laboratorium miało już taki defekt: zbieracz kluczował sygnały
        bez przestrzeni, więc wyjście ``p_pu`` i stan ``p_pu`` falownika trafiały
        do JEDNEGO ciągu naprzemiennie. Seria była DWA RAZY dłuższa od osi czasu,
        a testy radziły sobie braniem co drugiej próbki — czyli utrwalały defekt.
        Kolizję łapie dziś ``ZbieraczPrzebiegow``, ale kontrakt wyniku nie może
        opierać się na tym, że ktoś inny się nie pomylił: ``WynikDynamiczny`` da
        się zbudować z dowolnego źródła.

        Sprawdzane są TRZY własności, bo każda z osobna przechodzi przy naruszeniu
        pozostałych: długość serii, ścisła monotoniczność osi czasu i
        jednoznaczność tożsamości sygnału.
        """
        n = len(self.czas_s)
        # SKOŃCZONOŚĆ PRZED WSZYSTKIM INNYM (plan naprawy §2). Wynik z ``NaN`` w osi
        # czasu albo w przebiegu jest NIEINTERPRETOWALNY tak samo jak przebieg o
        # złej długości — z tą różnicą, że długość rzuca się w oczy, a ``NaN``
        # rysuje się jako przerwa w wykresie i bywa brany za „brak danych".
        # Kontrola osi czasu idzie PRZED kontrolą monotoniczności: ``not b > a``
        # dla ``NaN`` też podnosi wyjątek, ale z komunikatem o monotoniczności,
        # czyli wskazującym złą przyczynę.
        wymagaj_skonczonosci(self.czas_s, co="oś czasu", gdzie=self.kontrakt)
        for sygnal in self.sygnaly:
            wymagaj_skonczonosci(
                sygnal.wartosci,
                co="przebieg",
                gdzie=f"{sygnal.klucz_pelny}@{sygnal.element_ref}",
            )
        for s in self.sygnaly:
            if len(s.wartosci) != n:
                raise NiezgodnaDlugoscPrzebieguError(
                    f"Sygnał {s.klucz_pelny}@{s.element_ref} ma {len(s.wartosci)} próbek "
                    f"przy osi czasu o {n} chwilach. Przebieg o innej długości niż oś "
                    "czasu nie ma jednoznacznego przypisania wartości do chwil."
                )
        for a, b in zip(self.czas_s[:-1], self.czas_s[1:], strict=True):
            if not b > a:
                raise NiemonotonicznaOsCzasuError(
                    f"Oś czasu nie rośnie ściśle: {a} -> {b}. Powtórzona albo cofnięta "
                    "chwila czyni przebieg nieinterpretowalnym (dwie wartości tej samej "
                    "wielkości w tej samej chwili)."
                )
        tozsamosci = [(s.przestrzen.value, s.klucz, s.element_ref) for s in self.sygnaly]
        if len(set(tozsamosci)) != len(tozsamosci):
            powtorzone = sorted({poz for poz in tozsamosci if tozsamosci.count(poz) > 1})
            raise KolizjaSygnaluError(
                f"Dwa sygnały o tej samej tożsamości (przestrzeń, klucz, element): "
                f"{powtorzone}. Tożsamość sygnału musi być jednoznaczna, inaczej "
                "``sygnal()`` zgaduje, o którą wielkość pytał konsument."
            )

    def sygnal(
        self,
        klucz: str,
        element_ref: str | None = None,
        przestrzen: PrzestrzenSygnalu | None = None,
    ) -> Sygnal:
        """Pobierz przebieg po kluczu (i opcjonalnie elemencie oraz przestrzeni).

        Gdy klucz występuje w OBU przestrzeniach dla tego samego elementu (np.
        ``p_pu`` falownika: wyjście i stan), pominięcie ``przestrzen`` jest
        błędem GŁOŚNYM. Milczące wybranie jednej z nich byłoby zgadywaniem, o
        którą wielkość fizyczną pytał konsument.
        """
        trafienia = [
            s
            for s in self.sygnaly
            if s.klucz == klucz
            and (element_ref is None or s.element_ref == element_ref)
            and (przestrzen is None or s.przestrzen is przestrzen)
        ]
        if len(trafienia) == 1:
            return trafienia[0]
        if not trafienia:
            dostepne = sorted({f"{s.klucz_pelny}@{s.element_ref}" for s in self.sygnaly})
            raise KeyError(f"Brak sygnału {klucz}@{element_ref}. Dostępne: {dostepne}")
        kolidujace = sorted(s.klucz_pelny for s in trafienia)
        raise KeyError(
            f"Sygnał {klucz}@{element_ref} jest niejednoznaczny — pasuje do "
            f"{kolidujace}. Podaj `przestrzen`, żeby wskazać, o którą wielkość chodzi."
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "kontrakt": self.kontrakt,
            "czas_s": list(self.czas_s),
            "sygnaly": [s.to_dict() for s in self.sygnaly],
            "modele": [m.to_dict() for m in self.modele],
            "zdarzenia": list(self.zdarzenia),
            "diagnostyka": self.diagnostyka.to_dict(),
            "odcisk_scenariusza": self.odcisk_scenariusza,
            "odcisk_implementacji": self.odcisk_implementacji,
            "odcisk_topologii": self.odcisk_topologii,
            "uwaga_dowodowa_pl": self.uwaga_dowodowa_pl,
        }

    def odcisk_wyniku(self) -> str:
        """SHA-256 kanonicznej postaci — powtarzalność biegu."""
        return odcisk(self.to_dict())


class NieserializowalnyLadunekError(TypeError):
    """Ładunek odcisku zawiera wartość, której nie da się zapisać deterministycznie."""


def odcisk(payload: Any) -> str:
    """Deterministyczny SHA-256 z kanonicznego JSON — BEZ awaryjnego ``str``.

    Poprzednia wersja miała ``default=str``, co dla obiektu bez własnego
    ``__str__`` daje ``"<... object at 0x7fd630701150>"`` — czyli ADRES W PAMIĘCI
    wpisany do skrótu. Odcisk przestawał wtedy być deterministyczny (ten sam
    ładunek w dwóch procesach dawał różne skróty), a wyglądał na policzony:
    funkcja nie zgłaszała niczego, zwracała poprawny szesnastkowy ciąg.

    To jest naruszenie reguły determinizmu przez CICHE przybliżenie, więc
    zamiast zapisywać cokolwiek, funkcja odmawia i mówi, czego nie umie zapisać.
    Dziś żadna ścieżka tego nie trafia (``zastosowane`` niesie same skalary) —
    ale „dziś nie trafia" to nie to samo, co „nie może trafić".
    """
    try:
        tekst = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    except TypeError as wyjatek:
        raise NieserializowalnyLadunekError(
            f"Ładunek odcisku zawiera wartość niezapisywalną kanonicznie: {wyjatek}. "
            "Awaryjne `str()` wpisałoby do skrótu adres obiektu w pamięci, "
            "czyniąc odcisk niedeterministycznym bez żadnego sygnału."
        ) from wyjatek
    return hashlib.sha256(tekst.encode("utf-8")).hexdigest()


@dataclass
class ZbieraczPrzebiegow:
    """Akumulator przebiegów w trakcie symulacji (kolejność deterministyczna).

    WYKRYWA KOLIZJĘ zamiast ją mieszać. Klucz akumulatora to trójka
    ``(przestrzen, klucz, element_ref)``; dwa zapisy tej samej trójki w jednej
    chwili próbkowania są błędem, nie „dopisaniem kolejnej wartości". Poprzednia
    wersja kluczowała na parze bez przestrzeni, więc wyjście ``p_pu`` i stan
    ``p_pu`` tego samego falownika lądowały w JEDNYM ciągu naprzemiennie —
    i wyglądało to jak poprawny, tylko dwa razy dłuższy przebieg.
    """

    _dane: dict[tuple[str, str, str | None], list[float]] = field(default_factory=dict)
    _meta: dict[tuple[str, str, str | None], tuple[str, str]] = field(default_factory=dict)
    _ostatnia_probka: dict[tuple[str, str, str | None], int] = field(default_factory=dict)
    _numer_probki: int = -1

    def rozpocznij_probke(self) -> None:
        """Otwórz nową chwilę próbkowania — od tej pory każdy sygnał raz."""
        self._numer_probki += 1

    def dodaj(
        self,
        klucz: str,
        wartosc: float,
        *,
        element_ref: str | None = None,
        etykieta_pl: str = "",
        jednostka: str = "",
        przestrzen: PrzestrzenSygnalu = PrzestrzenSygnalu.WYJSCIE,
    ) -> None:
        k = (przestrzen.value, klucz, element_ref)
        if self._ostatnia_probka.get(k) == self._numer_probki:
            raise KolizjaSygnaluError(
                f"Sygnał {przestrzen.value}.{klucz}@{element_ref} zapisany DWA RAZY "
                f"w próbce nr {self._numer_probki}. Dwie wielkości dzielą tożsamość "
                "sygnału — przebieg byłby przeplotem dwóch różnych serii."
            )
        if k not in self._dane:
            self._dane[k] = []
            self._meta[k] = (etykieta_pl or klucz, jednostka)
        self._dane[k].append(float(wartosc))
        self._ostatnia_probka[k] = self._numer_probki

    def sygnaly(self) -> tuple[Sygnal, ...]:
        return tuple(
            Sygnal(
                klucz=klucz,
                etykieta_pl=self._meta[(przestrzen, klucz, ref)][0],
                jednostka=self._meta[(przestrzen, klucz, ref)][1],
                element_ref=ref,
                wartosci=tuple(wartosci),
                przestrzen=PrzestrzenSygnalu(przestrzen),
            )
            for (przestrzen, klucz, ref), wartosci in sorted(
                self._dane.items(), key=lambda para: (para[0][0], para[0][1], para[0][2] or "")
            )
        )

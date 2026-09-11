"""PROTOTYP modelu zaufania: status dowodowy WYPROWADZANY, nie nadawany.

KOD BADAWCZY — patrz `backend/research/README.md`. **PROTOTYP, NIE KANON.**
Ten moduł niczego nie zmienia w produkcji i nie jest propozycją kontraktu.

PROBLEM, KTÓRY BADA (pozycja decyzyjna D-09)
--------------------------------------------
Produkcyjny `solver_input.provenance.EvidenceTier` jest **wartością, którą kod
może sobie przypisać**. Dziś żadna zdolność dynamiczna nie ma najwyższego
stopnia, więc bezpiecznik D-00 trzyma — ale trzyma UMOWĄ, nie konstrukcją.
Wystarczy, że ktoś wpisze najwyższy stopień w rejestrze, i cały tor dowodowy
otwiera się bez żadnego dowodu. Jest to dokładnie ta sama konstrukcja, która
pozwoliła powstać defektowi P0-01: status nadany deklaracją, nie pomiarem.

HIPOTEZA SPRAWDZANA TUTAJ
-------------------------
Że da się zrobić inaczej: żeby „to jest zwalidowana symulacja” było
**funkcją danych**, a nie literałem. Wtedy:

- model bez zapisanego dowodu walidacji NIE MOŻE dostać stopnia dowodowego;
- model zwalidowany na wąskim zakresie **traci** stopień dowodowy poza tym
  zakresem, automatycznie i bez niczyjej decyzji;
- zmiana parametru modelu unieważnia dowód, bo odcisk przestaje się zgadzać;
- przeterminowanie wyroczni (nowa wersja narzędzia) też unieważnia dowód.

Klucz jest w ostatnim punkcie listy: dowód nie jest atrybutem MODELU, tylko
relacją między MODELEM, ZAKRESEM i PUNKTEM PRACY, w którym pytamy.

DWIE ZASADY KONSTRUKCYJNE (po audycie kontradyktoryjnym)
--------------------------------------------------------
1. **Tożsamość jest WYPROWADZANA z definicji, nie wypisywana ręcznie.**
   ``DowodWalidacji.odcisk`` liczy się z KOMPLETU pól dataklasy przez
   ``tozsamosc.odcisk``. Poprzednia wersja składała odcisk z sześciu ręcznie
   wybranych pozycji i **gubiła ``zakres``**: dwa dowody o zakresach
   ``napiecie_pu=(0.9, 1.1)`` i ``(0.1, 1.3)`` miały IDENTYCZNY odcisk, a z
   metryk brała dwie liczby, więc podmiana metryki na inną o tych samych
   liczbach też była niewidoczna. Pole dołożone do dowodu w przyszłości wchodzi
   do odcisku samo — zapomnienie nie może już zawęzić tożsamości.

2. **Brak danych NIE JEST pokryciem.** Każda oś ``ZakresWalidacji`` odpowiada na
   pytanie „czy ten dowód obejmuje TEN punkt pracy” trójwartościowo: obejmuje /
   nie obejmuje / nie da się potwierdzić. Trzeci przypadek — dowód ogranicza oś,
   a punkt pracy nie zna swojej współrzędnej — kończy się BRAKIEM POKRYCIA.
   Poprzednia wersja zaczynała od ``if wartosc is None: return None``, czyli
   nieznane SCR czytała jako „brak zastrzeżeń” (UNKNOWN → covered).

CZEGO TEN PROTOTYP NIE ROBI
---------------------------
Nie zastępuje `provenance.py`, nie nadaje niczego produkcji i świadomie NIE
używa produkcyjnych literałów stopni — nazwy są tu polskie i własne, żeby nie
dało się pomylić prototypu z kontraktem (pilnuje tego `research_isolation_guard`).
"""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass, field, replace
from enum import StrEnum
from typing import Any

from dynamic_lab.tozsamosc import (
    KonfiguracjaSolvera,
    PunktPracy,
    TozsamoscScenariusza,
    odcisk,
)

__all__ = [
    "DowodWalidacji",
    "KonfiguracjaSolvera",
    "MetrykiAkceptacji",
    "NiezadeklarowanaOsZakresuError",
    "OrzeczenieDowodowe",
    "OsZakresu",
    "PrzypadekWalidacji",
    "PunktPracy",
    "RejestrDowodow",
    "RodzajOsi",
    "StopienDowodowy",
    "TozsamoscImplementacji",
    "TozsamoscModelu",
    "TozsamoscParametrow",
    "TozsamoscProfiluWymagan",
    "TozsamoscScenariusza",
    "TrybOrzekania",
    "Wyrocznia",
    "ZakresWalidacji",
]


class StopienDowodowy(StrEnum):
    """Stopnie zaufania do wyniku — NAZWY WŁASNE prototypu, nie kontrakt produkcji."""

    ZWALIDOWANA_SYMULACJA = "ZWALIDOWANA_SYMULACJA"
    DEKLARACJA = "DEKLARACJA"
    MODEL_NIEZWALIDOWANY = "MODEL_NIEZWALIDOWANY"
    NIE_SYMULOWANO = "NIE_SYMULOWANO"


class TrybOrzekania(StrEnum):
    """O co pytamy: o zgodność fizyczną modelu czy o dowód wobec wymagania.

    Rozdzielenie jest konieczne, bo te dwa pytania mają różny domyślny wynik przy
    braku danych. Pytanie FIZYCZNE wolno zadać bez profilu wymagań (interesuje
    nas model, nie norma). Pytanie REGULACYJNE bez wskazanej redakcji wymagań nie
    ma treści — i musi być odrzucone, a nie potraktowane jak brak zastrzeżeń.
    """

    FIZYCZNY = "FIZYCZNY"
    REGULACYJNY = "REGULACYJNY"


class NiezadeklarowanaOsZakresuError(RuntimeError):
    """Wymiar ``ZakresWalidacji`` bez deklaracji wiązania z punktem pracy.

    Bezpiecznik na PRZYSZŁOŚĆ: nowy wymiar dołożony do zakresu bez deklaracji
    (``os_zakresu``) nie może być cicho pominięty przy sprawdzaniu pokrycia, bo
    pominięty wymiar = wymiar nieograniczający = dowód szerszy, niż zmierzono.
    """


@dataclass(frozen=True)
class TozsamoscImplementacji:
    """CO liczy — klasa modelu i wersja KODU, nie jego nastawy.

    Rozdzielenie tożsamości implementacji od tożsamości parametrów jest
    odpowiedzią na konkretną lukę: przy jednym wspólnym odcisku „ten sam
    parametr + nowy kod” dawało STARY dowód nadal ważny. Przepisanie równania
    stojana bez zmiany ani jednej stałej jest dokładnie tym przypadkiem — i jest
    zmianą, po której dowód walidacji musi wygasnąć.

    ``odcisk_kodu`` ma pochodzić z TREŚCI implementacji (skrót źródła, id
    wydania), a nie z numeru wersji wpisanego ręcznie: numer wpisany ręcznie
    jest deklaracją i da się go zapomnieć podnieść.
    """

    klasa: str
    wersja_publiczna: str
    """Widoczny identyfikator modelu — może zostać ten sam mimo zmiany kodu."""
    odcisk_kodu: str
    """Odcisk TREŚCI implementacji. To on unieważnia dowód, nie numer wersji."""

    @property
    def odcisk(self) -> str:
        return odcisk(self)


@dataclass(frozen=True)
class TozsamoscParametrow:
    """CZYM liczy — komplet nastaw modelu, REKURENCYJNIE.

    ``parametry`` to dowolna struktura: płaska mapa nastaw albo CAŁY obiekt
    urządzenia. Postać kanoniczna (``tozsamosc.postac_kanoniczna``) schodzi w głąb
    dataklas, więc AVR, governor, PLL, ogranicznik GFM i parametry magazynu
    wchodzą do odcisku bez dopisywania jakiejkolwiek gałęzi per model.

    Poprzednia wersja przyjmowała ``dict[str, float]``, czyli PŁASKIE skalary —
    dokładnie tak, jak robi to dziś ``SilnikRMS._tozsamosci`` (pola skalarne plus
    ręczny ``getattr(u, "maszyna")``). Przy takim odcisku zmiana ``k_a`` AVR-a
    albo pasma PLL była niewidoczna: dwa biegi różniące się regulatorem miały
    identyczną tożsamość parametrów.
    """

    parametry: Any

    @classmethod
    def z_obiektu(cls, obiekt: Any) -> TozsamoscParametrow:
        """Tożsamość WYPROWADZONA z obiektu urządzenia (dataklasy), rekurencyjnie."""
        return cls(parametry=obiekt)

    @property
    def odcisk(self) -> str:
        return odcisk(self)


@dataclass(frozen=True)
class TozsamoscProfiluWymagan:
    """WOBEC CZEGO orzekamy — redakcja normy albo profilu operatora.

    Dowód walidacji modelu i obowiązujące wymaganie to dwie różne rzeczy, ale
    orzeczenie zależy od OBU: model zwalidowany wobec profilu z 2024 nie dowodzi
    spełnienia wymagania z redakcji z 2026. Bez tej osi rejestr milcząco
    zakładałby, że norma się nie zmienia.

    ``tresc`` jest OBOWIĄZKOWA i niepusta, a ``odcisk_tresci`` liczy się z niej
    deterministycznie. Powód: etykieta wersji jest deklaracją człowieka. Operator
    potrafi poprawić wartość progu w dokumencie, zostawiając „2026.1” — i dowód
    wystawiony wobec starej treści dalej wyglądałby na ważny. Odcisk treści
    zamyka tę drogę: zmiana JAKIEJKOLWIEK wartości profilu zmienia tożsamość,
    niezależnie od tego, co napisano w polu wersji.
    """

    identyfikator: str
    wersja: str
    obowiazuje_od: str
    tresc: Any
    """Kanoniczna TREŚĆ profilu (progi, obwiednie, wymagania) — nie sama etykieta."""

    def __post_init__(self) -> None:
        if not str(self.identyfikator).strip() or not str(self.wersja).strip():
            raise ValueError("Profil wymagań musi mieć identyfikator i wersję.")
        if not self.tresc:
            raise ValueError(
                "Profil wymagań bez treści nie jest profilem — sama etykieta wersji "
                "jest deklaracją, a deklaracji nie da się porównać z modelem."
            )

    @property
    def odcisk_tresci(self) -> str:
        """Odcisk SAMEJ treści — rozstrzyga o zgodności niezależnie od etykiety wersji."""
        return odcisk(self.tresc)

    @property
    def odcisk(self) -> str:
        return odcisk(self)


@dataclass(frozen=True)
class TozsamoscModelu:
    """Pełna tożsamość liczącego: implementacja + parametry.

    ``odcisk`` łączy OBIE osie, więc zmiana którejkolwiek gubi stary dowód.
    Osie są rozdzielone, żeby dało się powiedzieć, KTÓRA się zmieniła
    (``co_sie_zmienilo``) — komunikat „dowód nie pasuje” bez tego jest
    bezużyteczny dla inżyniera.
    """

    implementacja: TozsamoscImplementacji
    parametry: TozsamoscParametrow

    @classmethod
    def prosta(
        cls, *, klasa: str, wersja: str, odcisk_kodu: str, parametry: Any
    ) -> TozsamoscModelu:
        """Skrót konstrukcyjny dla przypadków testowych i prototypowych."""
        return cls(
            implementacja=TozsamoscImplementacji(
                klasa=klasa, wersja_publiczna=wersja, odcisk_kodu=odcisk_kodu
            ),
            parametry=TozsamoscParametrow(parametry=parametry),
        )

    @classmethod
    def z_urzadzenia(cls, urzadzenie: Any, *, wersja: str, odcisk_kodu: str) -> TozsamoscModelu:
        """Tożsamość modelu wyprowadzona z OBIEKTU urządzenia laboratorium.

        Klasa bierze się z typu obiektu, a parametry z jego pól — rekurencyjnie,
        łącznie z regulatorami, pętlą synchronizacji i strategią ogranicznika.
        """
        return cls(
            implementacja=TozsamoscImplementacji(
                klasa=type(urzadzenie).__name__,
                wersja_publiczna=wersja,
                odcisk_kodu=odcisk_kodu,
            ),
            parametry=TozsamoscParametrow.z_obiektu(urzadzenie),
        )

    @property
    def klasa(self) -> str:
        return self.implementacja.klasa

    @property
    def wersja(self) -> str:
        return self.implementacja.wersja_publiczna

    @property
    def odcisk(self) -> str:
        return odcisk(self)

    def co_sie_zmienilo(self, inny: TozsamoscModelu) -> tuple[str, ...]:
        """Nazwij OŚ różnicy między dwiema tożsamościami."""
        roznice: list[str] = []
        if self.implementacja.odcisk != inny.implementacja.odcisk:
            if self.implementacja.wersja_publiczna == inny.implementacja.wersja_publiczna:
                roznice.append("implementacja (ten sam identyfikator publiczny, inny kod)")
            else:
                roznice.append("implementacja")
        if self.parametry.odcisk != inny.parametry.odcisk:
            roznice.append("parametry")
        return tuple(roznice)


class RodzajOsi(StrEnum):
    """Jak oś ogranicza: przedziałem liczbowym czy zbiorem dopuszczonych wartości."""

    PRZEDZIAL = "PRZEDZIAL"
    ZBIOR = "ZBIOR"


KLUCZ_OSI = "os_zakresu"
"""Klucz metadanych pola ``ZakresWalidacji`` niosący wiązanie z punktem pracy."""


@dataclass(frozen=True)
class OsZakresu:
    """Deklaracja wymiaru zakresu: etykieta, wiązanie z punktem pracy, rodzaj."""

    etykieta_pl: str
    atrybut_punktu: str
    rodzaj: RodzajOsi


def os_zakresu(
    *,
    etykieta_pl: str,
    atrybut_punktu: str,
    rodzaj: RodzajOsi,
    default: Any = dataclasses.MISSING,
    default_factory: Any = dataclasses.MISSING,
) -> Any:
    """Zadeklaruj wymiar zakresu walidacji (patrz ``NiezadeklarowanaOsZakresuError``)."""
    metadane = {KLUCZ_OSI: OsZakresu(etykieta_pl, atrybut_punktu, rodzaj)}
    if default_factory is not dataclasses.MISSING:
        return field(metadata=metadane, default_factory=default_factory)
    return field(metadata=metadane, default=default)


@dataclass(frozen=True)
class ZakresWalidacji:
    """Obszar, w którym dowód OBOWIĄZUJE — poza nim i POZA WIEDZĄ nie obowiązuje.

    Każdy wymiar jest deklarowany przez ``os_zakresu``: niesie etykietę, nazwę
    atrybutu ``PunktPracy`` i rodzaj ograniczenia. ``braki_pokrycia`` iteruje po
    WSZYSTKICH polach dataklasy, więc:

    - wymiar dołożony w przyszłości BEZ deklaracji podnosi wyjątek zamiast zostać
      pominięty (pominięty wymiar = wymiar nieograniczający = dowód szerszy, niż
      zmierzono);
    - wymiar nieustalony (``None`` / pusty zbiór) znaczy „nie badano”, a NIE
      „dowolny”;
    - wymiar ograniczony, ale o NIEZNANEJ współrzędnej punktu pracy, daje BRAK
      POKRYCIA — „nie wiem, gdzie jestem” nie jest dowodem, że jestem w zakresie.
    """

    napiecie_pu: tuple[float, float] | None = os_zakresu(
        etykieta_pl="napięcie",
        atrybut_punktu="napiecie_pu",
        rodzaj=RodzajOsi.PRZEDZIAL,
        default=None,
    )
    moc_pu: tuple[float, float] | None = os_zakresu(
        etykieta_pl="moc",
        atrybut_punktu="moc_pu",
        rodzaj=RodzajOsi.PRZEDZIAL,
        default=None,
    )
    scr: tuple[float, float] | None = os_zakresu(
        etykieta_pl="SCR",
        atrybut_punktu="scr",
        rodzaj=RodzajOsi.PRZEDZIAL,
        default=None,
    )
    rodzaje_zdarzen: frozenset[str] = os_zakresu(
        etykieta_pl="rodzaj zdarzenia",
        atrybut_punktu="rodzaj_zdarzenia",
        rodzaj=RodzajOsi.ZBIOR,
        default=frozenset(),
    )

    def __post_init__(self) -> None:
        for pole, os in self._osie():
            if os.rodzaj is not RodzajOsi.PRZEDZIAL:
                continue
            przedzial = getattr(self, pole)
            if przedzial is None:
                continue
            dol, gora = przedzial
            if dol > gora:
                raise ValueError(
                    f"{os.etykieta_pl}: przedział walidacji [{dol:g}, {gora:g}] jest "
                    "odwrócony — taki zakres nie obejmuje żadnego punktu."
                )

    @classmethod
    def _osie(cls) -> tuple[tuple[str, OsZakresu], ...]:
        """Wymiary zakresu WYPROWADZONE z definicji dataklasy — bez listy ręcznej."""
        osie: list[tuple[str, OsZakresu]] = []
        for pole in dataclasses.fields(cls):
            os = pole.metadata.get(KLUCZ_OSI)
            if not isinstance(os, OsZakresu):
                raise NiezadeklarowanaOsZakresuError(
                    f"Wymiar `{pole.name}` zakresu walidacji nie ma deklaracji "
                    "`os_zakresu(...)`. Wymiar bez deklaracji byłby przy sprawdzaniu "
                    "pokrycia pominięty, czyli dowód obowiązywałby SZERZEJ, niż go "
                    "zmierzono. Zadeklaruj wiązanie z `PunktPracy` albo usuń pole."
                )
            osie.append((pole.name, os))
        return tuple(osie)

    def braki_pokrycia(self, punkt: PunktPracy) -> tuple[str, ...]:
        """Wypisz powody, dla których dowód NIE obejmuje tego punktu pracy.

        Pusta krotka = dowód obejmuje punkt. Każdy inny wynik to odmowa z
        uzasadnieniem — także wtedy, gdy przyczyną jest brak danych o punkcie
        pracy, a nie wyjście poza zakres.
        """
        powody: list[str] = []
        for pole, os in self._osie():
            if not hasattr(punkt, os.atrybut_punktu):
                raise NiezadeklarowanaOsZakresuError(
                    f"Wymiar `{pole}` wskazuje atrybut `{os.atrybut_punktu}`, którego "
                    "`PunktPracy` nie ma — deklaracja osi rozjechała się z punktem pracy."
                )
            ograniczenie = getattr(self, pole)
            wartosc = getattr(punkt, os.atrybut_punktu)
            powod = (
                self._brak_w_przedziale(os, ograniczenie, wartosc)
                if os.rodzaj is RodzajOsi.PRZEDZIAL
                else self._brak_w_zbiorze(os, ograniczenie, wartosc)
            )
            if powod is not None:
                powody.append(powod)
        return tuple(powody)

    @staticmethod
    def _brak_w_przedziale(
        os: OsZakresu, przedzial: tuple[float, float] | None, wartosc: float | None
    ) -> str | None:
        if przedzial is None:
            return f"{os.etykieta_pl}: model nie był walidowany w tym wymiarze"
        dol, gora = przedzial
        if wartosc is None:
            return (
                f"{os.etykieta_pl}: dowód obowiązuje w [{dol:g}, {gora:g}], a punkt "
                f"pracy nie zna tej wartości — nie można potwierdzić pokrycia"
            )
        if not (dol <= wartosc <= gora):
            return f"{os.etykieta_pl} = {wartosc:g} poza zakresem walidacji [{dol:g}, {gora:g}]"
        return None

    @staticmethod
    def _brak_w_zbiorze(
        os: OsZakresu, dopuszczone: frozenset[str], wartosc: str | None
    ) -> str | None:
        if not dopuszczone:
            return f"{os.etykieta_pl}: model nie był walidowany w tym wymiarze"
        if wartosc is None:
            objete = ", ".join(sorted(dopuszczone))
            return (
                f"{os.etykieta_pl}: dowód obejmuje [{objete}], a punkt pracy nie podaje "
                f"tej wartości — nie można potwierdzić pokrycia"
            )
        if wartosc not in dopuszczone:
            return f"zdarzenie „{wartosc}” nie było objęte walidacją"
        return None


@dataclass(frozen=True)
class MetrykiAkceptacji:
    """Tolerancje ustalone PRZED biegiem — inaczej dowód dopasowuje się do wyniku.

    ``nazwa`` jest obowiązkowa i wchodzi do odcisku dowodu. Bez niej metryka to
    dwie gołe liczby: podmiana „maksymalne odchylenie kąta” na „RMS błędu
    napięcia” przy tych samych liczbach była dla odcisku niewidoczna, choć
    orzekała o czymś zupełnie innym.
    """

    nazwa: str
    maks_blad_wzgledny: float
    zmierzony_blad_wzgledny: float

    def __post_init__(self) -> None:
        if not self.nazwa.strip():
            raise ValueError(
                "Metryka akceptacji bez nazwy nie mówi, CO zmierzono — dwie gołe "
                "liczby nie odróżniają błędu kąta od błędu napięcia."
            )
        if self.maks_blad_wzgledny < 0.0 or self.zmierzony_blad_wzgledny < 0.0:
            raise ValueError(f"{self.nazwa}: błędy nie mogą być ujemne")

    @property
    def spelnione(self) -> bool:
        return self.zmierzony_blad_wzgledny <= self.maks_blad_wzgledny


@dataclass(frozen=True)
class Wyrocznia:
    """Czym mierzono — z wersją, bo zmiana wersji unieważnia dowód."""

    nazwa: str
    wersja: str
    metoda: str


@dataclass(frozen=True)
class PrzypadekWalidacji:
    """Jeden przypadek walidacyjny: nazwa + TOŻSAMOŚĆ tego, co policzono.

    Nazwa sama w sobie jest etykietą („SMIB H=4”) i nie mówi, na jakiej migawce,
    w jakim punkcie pracy i przy jakich nastawach solvera policzono bieg. Dowód
    złożony z takich etykiet jest nieodtwarzalny i nieobalalny, więc scenariusz
    jest tu OBOWIĄZKOWY.
    """

    nazwa: str
    scenariusz: TozsamoscScenariusza

    def __post_init__(self) -> None:
        if not self.nazwa.strip():
            raise ValueError("Przypadek walidacyjny musi mieć nazwę.")

    @property
    def klucz_porzadkowy(self) -> tuple[str, str]:
        return (self.nazwa, self.scenariusz.odcisk)


@dataclass(frozen=True)
class DowodWalidacji:
    """Zapis walidacji: kto, czym, wobec czego, w jakim zakresie i z jakim wynikiem.

    Dowód można WYCOFAĆ (``wycofany``) — bo wykrycie błędu w wyroczni albo w
    samej walidacji zdarza się częściej niż zmiana modelu, a bez możliwości
    cofnięcia jedynym sposobem byłoby udawanie, że model się zmienił.

    ``odcisk`` liczy się z KOMPLETU pól (patrz nagłówek modułu, zasada 1), więc
    obejmuje zakres, pełną tożsamość modelu, wyrocznię z wersją i metodą, komplet
    metryk z nazwami, listę przypadków wraz z ich scenariuszami, profil wymagań
    wraz z odciskiem jego treści oraz stan wycofania.
    """

    model: TozsamoscModelu
    wyrocznia: Wyrocznia
    zakres: ZakresWalidacji
    metryki: tuple[MetrykiAkceptacji, ...]
    przypadki: tuple[PrzypadekWalidacji, ...]
    profil_wymagan: TozsamoscProfiluWymagan | None = None
    """Wobec jakiej redakcji normy/profilu walidowano. ``None`` = walidacja
    czysto fizyczna, niezwiązana z konkretnym wymaganiem."""
    wycofany: bool = False
    powod_wycofania_pl: str = ""

    def __post_init__(self) -> None:
        if self.wycofany and not self.powod_wycofania_pl.strip():
            raise ValueError(
                "Wycofanie dowodu bez podanego powodu jest nieodróżnialne od "
                "pomyłki — powód jest częścią wycofania."
            )
        if not self.przypadki:
            raise ValueError(
                "Dowód walidacji bez ANI JEDNEGO przypadku jest dowodem przez "
                "nieobecność dowodu — pułapka `all([]) == True`."
            )
        if not self.metryki:
            raise ValueError("Dowód walidacji bez metryk akceptacji nie jest dowodem.")
        klucze = [p.klucz_porzadkowy for p in self.przypadki]
        if len(set(klucze)) != len(klucze):
            raise ValueError(
                "Ten sam przypadek (nazwa + scenariusz) występuje w dowodzie wielokrotnie "
                "— licznik przypadków mierzyłby wtedy powtórzenia, nie pokrycie."
            )
        # Porządek kanoniczny: dowód o tych samych przypadkach podanych w innej
        # kolejności jest TYM SAMYM dowodem i musi mieć ten sam odcisk.
        object.__setattr__(
            self, "przypadki", tuple(sorted(self.przypadki, key=lambda p: p.klucz_porzadkowy))
        )

    @property
    def wszystkie_metryki_spelnione(self) -> bool:
        return all(m.spelnione for m in self.metryki)

    @property
    def odcisk(self) -> str:
        return odcisk(self)


@dataclass(frozen=True)
class OrzeczenieDowodowe:
    """Wynik pytania „czy to jest dowód TUTAJ” — zawsze z uzasadnieniem."""

    stopien: StopienDowodowy
    powody: tuple[str, ...]
    odcisk_dowodu: str | None

    @property
    def przydatny_dowodowo(self) -> bool:
        return self.stopien is StopienDowodowy.ZWALIDOWANA_SYMULACJA


@dataclass
class RejestrDowodow:
    """Rejestr dowodów walidacji, indeksowany ODCISKIEM MODELU, nie jego nazwą.

    Indeksowanie odciskiem, a nie nazwą, jest decyzją projektową: model po
    zmianie parametru ALBO po zmianie kodu ma inny odcisk, więc automatycznie
    przestaje być objęty starym dowodem — bez niczyjej pamięci i bez migracji.

    Jeden model może mieć WIELE dowodów o różnych zakresach (np. osobny zestaw
    benchmarków dla sieci sztywnej i osobny dla słabej). Orzeczenie sprawdza je
    wszystkie i wystarczy JEDEN pokrywający punkt pracy — ale suma zakresów NIE
    jest sumą mnogościową „na oko”: każdy dowód musi pokrywać punkt SAMODZIELNIE.
    Sklejanie dwóch częściowych pokryć w jedno pełne byłoby ekstrapolacją między
    zakresami, czyli twierdzeniem, którego nikt nie zmierzył.
    """

    _dowody: dict[str, list[DowodWalidacji]] = field(default_factory=dict)

    def zarejestruj(self, dowod: DowodWalidacji) -> None:
        self._dowody.setdefault(dowod.model.odcisk, []).append(dowod)

    def wycofaj(self, odcisk_dowodu: str, powod_pl: str) -> bool:
        """Wycofaj dowód (np. po wykryciu błędu w wyroczni). Zwraca, czy znaleziono.

        Wycofanie jest ZAPISEM, nie usunięciem: usunięty dowód byłby
        nieodróżnialny od nigdy niezłożonego, a to dwa różne stany.
        """
        for odcisk_modelu, dowody in self._dowody.items():
            for i, dowod in enumerate(dowody):
                if dowod.odcisk == odcisk_dowodu:
                    self._dowody[odcisk_modelu][i] = replace(
                        dowod, wycofany=True, powod_wycofania_pl=powod_pl
                    )
                    return True
        return False

    def orzeknij(
        self,
        model: TozsamoscModelu,
        punkt: PunktPracy,
        *,
        profil: TozsamoscProfiluWymagan | None = None,
        tryb: TrybOrzekania = TrybOrzekania.FIZYCZNY,
    ) -> OrzeczenieDowodowe:
        """Czy wynik TEGO modelu w TYM punkcie wobec TEGO profilu jest dowodem.

        Kolejność sprawdzeń idzie od najbardziej podstawowego braku do
        najbardziej szczegółowego, żeby komunikat wskazywał PRZYCZYNĘ, a nie
        pierwszy napotkany objaw. Gdy żaden dowód nie pokrywa punktu, powody
        zbierają odmowy WSZYSTKICH kandydatów — inżynier musi wiedzieć, czego
        brakuje w każdym z nich, a nie tylko w pierwszym.

        W trybie REGULACYJNYM brak wskazanego profilu wymagań jest odmową
        (fail-closed): pytanie „czy to dowodzi zgodności” bez podanej redakcji
        wymagań nie ma treści, a milcząca zgoda byłaby dowodem z niczego.
        """
        if tryb is TrybOrzekania.REGULACYJNY and profil is None:
            return OrzeczenieDowodowe(
                stopien=StopienDowodowy.MODEL_NIEZWALIDOWANY,
                powody=(
                    "Pytanie w trybie dowodu regulacyjnego bez wskazanej redakcji "
                    "wymagań — nie ma wobec czego orzekać. Brak profilu NIE jest "
                    "zgodnością.",
                ),
                odcisk_dowodu=None,
            )

        kandydaci = self._dowody.get(model.odcisk, [])
        if not kandydaci:
            powody = [
                f"Brak zapisanego dowodu walidacji dla modelu {model.klasa} "
                f"{model.wersja} (odcisk {model.odcisk[:12]}…)."
            ]
            powody.extend(self._podpowiedz_o_innej_tozsamosci(model))
            return OrzeczenieDowodowe(
                stopien=StopienDowodowy.MODEL_NIEZWALIDOWANY,
                powody=tuple(powody),
                odcisk_dowodu=None,
            )

        odmowy: list[str] = []
        for dowod in kandydaci:
            powod = self._dlaczego_nie(dowod, punkt, profil)
            if powod is None:
                return OrzeczenieDowodowe(
                    stopien=StopienDowodowy.ZWALIDOWANA_SYMULACJA,
                    powody=(
                        f"Walidacja wobec {dowod.wyrocznia.nazwa} "
                        f"{dowod.wyrocznia.wersja} ({dowod.wyrocznia.metoda}), "
                        f"{len(dowod.przypadki)} przypadków, wszystkie metryki "
                        "spełnione, punkt pracy w zakresie.",
                    ),
                    odcisk_dowodu=dowod.odcisk,
                )
            odmowy.append(f"{dowod.odcisk[:12]}…: {powod}")
        return OrzeczenieDowodowe(
            stopien=StopienDowodowy.MODEL_NIEZWALIDOWANY,
            powody=(
                f"Żaden z {len(kandydaci)} zapisanych dowodów nie obejmuje tego " "przypadku.",
                *odmowy,
            ),
            odcisk_dowodu=None,
        )

    def _podpowiedz_o_innej_tozsamosci(self, model: TozsamoscModelu) -> list[str]:
        """Jeżeli istnieje dowód dla POKREWNEJ tożsamości — powiedz, co się różni.

        Bez tego komunikat „brak dowodu” nie odróżnia modelu nigdy
        niewalidowanego od modelu, któremu ktoś właśnie zmienił jedną stałą.
        """
        for dowody in self._dowody.values():
            for dowod in dowody:
                roznice = dowod.model.co_sie_zmienilo(model)
                if roznice and dowod.model.klasa == model.klasa:
                    return [
                        "Istnieje dowód dla tej samej klasy modelu, ale różni się: "
                        + ", ".join(roznice)
                        + "."
                    ]
        return []

    @staticmethod
    def _dlaczego_nie(
        dowod: DowodWalidacji,
        punkt: PunktPracy,
        profil: TozsamoscProfiluWymagan | None,
    ) -> str | None:
        """``None`` = dowód obejmuje ten przypadek; inaczej zwięzła przyczyna."""
        if dowod.wycofany:
            return f"dowód WYCOFANY — {dowod.powod_wycofania_pl}"
        if not dowod.wszystkie_metryki_spelnione:
            niespelnione = [
                f"{m.nazwa}: błąd {m.zmierzony_blad_wzgledny:.2e} > tolerancja "
                f"{m.maks_blad_wzgledny:.2e}"
                for m in dowod.metryki
                if not m.spelnione
            ]
            return "metryki akceptacji NIE są spełnione (" + "; ".join(niespelnione) + ")"
        if profil is not None:
            if dowod.profil_wymagan is None:
                return (
                    "dowód nie jest powiązany z żadną redakcją wymagań, a pytanie "
                    f"dotyczy {profil.identyfikator} {profil.wersja}"
                )
            if dowod.profil_wymagan.odcisk != profil.odcisk:
                if dowod.profil_wymagan.odcisk_tresci != profil.odcisk_tresci and (
                    dowod.profil_wymagan.identyfikator,
                    dowod.profil_wymagan.wersja,
                ) == (profil.identyfikator, profil.wersja):
                    return (
                        f"profil {profil.identyfikator} {profil.wersja} ma INNĄ TREŚĆ niż "
                        f"ta, wobec której walidowano (odcisk treści "
                        f"{dowod.profil_wymagan.odcisk_tresci[:12]}… vs "
                        f"{profil.odcisk_tresci[:12]}…) — etykieta wersji się nie zmieniła, "
                        "wymaganie tak"
                    )
                return (
                    f"dowód dotyczy {dowod.profil_wymagan.identyfikator} "
                    f"{dowod.profil_wymagan.wersja}, a pytanie "
                    f"{profil.identyfikator} {profil.wersja}"
                )
        braki = dowod.zakres.braki_pokrycia(punkt)
        if braki:
            return "punkt pracy poza zakresem walidacji (" + "; ".join(braki) + ")"
        return None

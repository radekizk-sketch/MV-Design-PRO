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
Że da się zrobić inaczej: żeby „to jest zwalidowana symulacja" było
**funkcją danych**, a nie literałem. Wtedy:

- model bez zapisanego dowodu walidacji NIE MOŻE dostać stopnia dowodowego;
- model zwalidowany na wąskim zakresie **traci** stopień dowodowy poza tym
  zakresem, automatycznie i bez niczyjej decyzji;
- zmiana parametru modelu unieważnia dowód, bo odcisk przestaje się zgadzać;
- przeterminowanie wyroczni (nowa wersja narzędzia) też unieważnia dowód.

Klucz jest w ostatnim punkcie listy: dowód nie jest atrybutem MODELU, tylko
relacją między MODELEM, ZAKRESEM i PUNKTEM PRACY, w którym pytamy.

CZEGO TEN PROTOTYP NIE ROBI
---------------------------
Nie zastępuje `provenance.py`, nie nadaje niczego produkcji i świadomie NIE
używa produkcyjnych literałów stopni — nazwy są tu polskie i własne, żeby nie
dało się pomylić prototypu z kontraktem (pilnuje tego `research_isolation_guard`).
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field, replace
from enum import StrEnum
from typing import Any


class StopienDowodowy(StrEnum):
    """Stopnie zaufania do wyniku — NAZWY WŁASNE prototypu, nie kontrakt produkcji."""

    ZWALIDOWANA_SYMULACJA = "ZWALIDOWANA_SYMULACJA"
    DEKLARACJA = "DEKLARACJA"
    MODEL_NIEZWALIDOWANY = "MODEL_NIEZWALIDOWANY"
    NIE_SYMULOWANO = "NIE_SYMULOWANO"


def _odcisk(payload: Any) -> str:
    tekst = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(tekst.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class TozsamoscImplementacji:
    """CO liczy — klasa modelu i wersja KODU, nie jego nastawy.

    Rozdzielenie tożsamości implementacji od tożsamości parametrów jest
    odpowiedzią na konkretną lukę: przy jednym wspólnym odcisku „ten sam
    parametr + nowy kod" dawało STARY dowód nadal ważny. Przepisanie równania
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
        return _odcisk(
            {
                "klasa": self.klasa,
                "wersja_publiczna": self.wersja_publiczna,
                "odcisk_kodu": self.odcisk_kodu,
            }
        )


@dataclass(frozen=True)
class TozsamoscParametrow:
    """CZYM liczy — zestaw nastaw modelu."""

    parametry: dict[str, float]

    @property
    def odcisk(self) -> str:
        return _odcisk({"parametry": self.parametry})


@dataclass(frozen=True)
class TozsamoscProfiluWymagan:
    """WOBEC CZEGO orzekamy — wersja normy albo profilu operatora.

    Dowód walidacji modelu i obowiązujące wymaganie to dwie różne rzeczy, ale
    orzeczenie zależy od OBU: model zwalidowany wobec profilu z 2024 nie dowodzi
    spełnienia wymagania z redakcji z 2026. Bez tej osi rejestr milcząco
    zakładałby, że norma się nie zmienia.
    """

    identyfikator: str
    wersja: str
    obowiazuje_od: str

    @property
    def odcisk(self) -> str:
        return _odcisk(
            {
                "identyfikator": self.identyfikator,
                "wersja": self.wersja,
                "obowiazuje_od": self.obowiazuje_od,
            }
        )


@dataclass(frozen=True)
class TozsamoscModelu:
    """Pełna tożsamość liczącego: implementacja + parametry.

    ``odcisk`` łączy OBIE osie, więc zmiana którejkolwiek gubi stary dowód.
    Osie są rozdzielone, żeby dało się powiedzieć, KTÓRA się zmieniła
    (``co_sie_zmienilo``) — komunikat „dowód nie pasuje" bez tego jest
    bezużyteczny dla inżyniera.
    """

    implementacja: TozsamoscImplementacji
    parametry: TozsamoscParametrow

    @classmethod
    def prosta(
        cls, *, klasa: str, wersja: str, odcisk_kodu: str, parametry: dict[str, float]
    ) -> TozsamoscModelu:
        """Skrót konstrukcyjny dla przypadków testowych i prototypowych."""
        return cls(
            implementacja=TozsamoscImplementacji(
                klasa=klasa, wersja_publiczna=wersja, odcisk_kodu=odcisk_kodu
            ),
            parametry=TozsamoscParametrow(parametry=parametry),
        )

    @property
    def klasa(self) -> str:
        return self.implementacja.klasa

    @property
    def wersja(self) -> str:
        return self.implementacja.wersja_publiczna

    @property
    def odcisk(self) -> str:
        return _odcisk(
            {
                "implementacja": self.implementacja.odcisk,
                "parametry": self.parametry.odcisk,
            }
        )

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


@dataclass(frozen=True)
class ZakresWalidacji:
    """Obszar, w którym dowód OBOWIĄZUJE — poza nim nie obowiązuje.

    Każdy wymiar jest przedziałem domkniętym. Wymiar nieustalony (``None``)
    znaczy „nie badano", a NIE „dowolny": pytanie o punkt pracy w takim wymiarze
    kończy się brakiem pokrycia. To jest różnica między dowodem a życzeniem.
    """

    napiecie_pu: tuple[float, float] | None = None
    moc_pu: tuple[float, float] | None = None
    scr: tuple[float, float] | None = None
    rodzaje_zdarzen: frozenset[str] = frozenset()

    def _poza(
        self, nazwa: str, wartosc: float | None, przedzial: tuple[float, float] | None
    ) -> str | None:
        if wartosc is None:
            return None
        if przedzial is None:
            return f"{nazwa}: model nie był walidowany w tym wymiarze"
        dol, gora = przedzial
        if not (dol <= wartosc <= gora):
            return f"{nazwa} = {wartosc:g} poza zakresem walidacji [{dol:g}, {gora:g}]"
        return None

    def braki_pokrycia(self, punkt: PunktPracy) -> tuple[str, ...]:
        """Wypisz powody, dla których dowód NIE obejmuje tego punktu pracy."""
        powody = [
            self._poza("napięcie", punkt.napiecie_pu, self.napiecie_pu),
            self._poza("moc", punkt.moc_pu, self.moc_pu),
            self._poza("SCR", punkt.scr, self.scr),
        ]
        if (
            punkt.rodzaj_zdarzenia is not None
            and punkt.rodzaj_zdarzenia not in self.rodzaje_zdarzen
        ):
            powody.append(f"zdarzenie „{punkt.rodzaj_zdarzenia}" + "” nie było objęte walidacją")
        return tuple(p for p in powody if p is not None)


@dataclass(frozen=True)
class PunktPracy:
    """Warunki, w których PYTAMY o przydatność dowodową."""

    napiecie_pu: float | None = None
    moc_pu: float | None = None
    scr: float | None = None
    rodzaj_zdarzenia: str | None = None


@dataclass(frozen=True)
class MetrykiAkceptacji:
    """Tolerancje ustalone PRZED biegiem — inaczej dowód dopasowuje się do wyniku."""

    maks_blad_wzgledny: float
    zmierzony_blad_wzgledny: float

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
class DowodWalidacji:
    """Zapis walidacji: kto, czym, wobec czego, w jakim zakresie i z jakim wynikiem.

    Dowód można WYCOFAĆ (``wycofany``) — bo wykrycie błędu w wyroczni albo w
    samej walidacji zdarza się częściej niż zmiana modelu, a bez możliwości
    cofnięcia jedynym sposobem byłoby udawanie, że model się zmienił.
    """

    model: TozsamoscModelu
    wyrocznia: Wyrocznia
    zakres: ZakresWalidacji
    metryki: tuple[MetrykiAkceptacji, ...]
    przypadki: tuple[str, ...]
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

    @property
    def wszystkie_metryki_spelnione(self) -> bool:
        return all(m.spelnione for m in self.metryki)

    @property
    def odcisk(self) -> str:
        return _odcisk(
            {
                "model": self.model.odcisk,
                "wyrocznia": [self.wyrocznia.nazwa, self.wyrocznia.wersja, self.wyrocznia.metoda],
                "profil_wymagan": (
                    self.profil_wymagan.odcisk if self.profil_wymagan is not None else None
                ),
                "wycofany": self.wycofany,
                "przypadki": sorted(self.przypadki),
                "metryki": [
                    [m.maks_blad_wzgledny, m.zmierzony_blad_wzgledny] for m in self.metryki
                ],
            }
        )


@dataclass(frozen=True)
class OrzeczenieDowodowe:
    """Wynik pytania „czy to jest dowód TUTAJ" — zawsze z uzasadnieniem."""

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
    jest sumą mnogościową „na oko": każdy dowód musi pokrywać punkt SAMODZIELNIE.
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
    ) -> OrzeczenieDowodowe:
        """Czy wynik TEGO modelu w TYM punkcie wobec TEGO profilu jest dowodem.

        Kolejność sprawdzeń idzie od najbardziej podstawowego braku do
        najbardziej szczegółowego, żeby komunikat wskazywał PRZYCZYNĘ, a nie
        pierwszy napotkany objaw. Gdy żaden dowód nie pokrywa punktu, powody
        zbierają odmowy WSZYSTKICH kandydatów — inżynier musi wiedzieć, czego
        brakuje w każdym z nich, a nie tylko w pierwszym.
        """
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

        Bez tego komunikat „brak dowodu" nie odróżnia modelu nigdy
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
                f"błąd {m.zmierzony_blad_wzgledny:.2e} > tolerancja " f"{m.maks_blad_wzgledny:.2e}"
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
                return (
                    f"dowód dotyczy {dowod.profil_wymagan.identyfikator} "
                    f"{dowod.profil_wymagan.wersja}, a pytanie "
                    f"{profil.identyfikator} {profil.wersja}"
                )
        braki = dowod.zakres.braki_pokrycia(punkt)
        if braki:
            return "punkt pracy poza zakresem walidacji (" + "; ".join(braki) + ")"
        return None

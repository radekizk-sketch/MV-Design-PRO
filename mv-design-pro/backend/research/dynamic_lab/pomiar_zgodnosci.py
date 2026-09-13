"""§11.3/3 — POMIAR jako obiekt, którego nie da się wypisać ręcznie.

KOD BADAWCZY — patrz `backend/research/README.md`. **PROTOTYP, NIE KANON.**

CO BYŁO NIE TAK (luka wykryta przez konstrukcję, nie przez test)
---------------------------------------------------------------
`dowod_walidacji.MetrykiAkceptacji` przyjmował ``zmierzony_blad_wzgledny``
jako **goły float podany przez wołającego**. Cała reszta modelu zaufania była
szczelna — odcisk z kompletu pól, brak danych ≠ pokrycie, wycofywanie dowodu —
a mimo to kompletny, poprawny, przechodzący walidację ``DowodWalidacji`` można
było złożyć **nie uruchamiając ani jednej symulacji**:

    MetrykiAkceptacji(nazwa="cokolwiek", maks_blad_wzgledny=1e-4,
                      zmierzony_blad_wzgledny=0.0)

To jest dokładnie ta sama klasa defektu co P0-01 (status nadany deklaracją),
tylko o piętro niżej: nie „stopień dowodowy jest literałem", lecz „POMIAR jest
literałem". Dowód wyprowadzany z literału jest wyprowadzany z niczego.

CZEGO TO NIE DA SIĘ ZROBIĆ W PYTHONIE — POWIEDZIANE WPROST
-----------------------------------------------------------
Nie da się zagwarantować, że liczba pochodzi z realnego biegu. W jednym
procesie wołający zawsze może podać spreparowane tablice do funkcji mierzącej,
a ``object.__setattr__`` przebije każdą zamrożoną dataklasę. Kryptografia
niczego tu nie zmienia, bo klucz i tak leży w tym samym procesie.

Co DA się zrobić i co jest tutaj zrobione — trzy rzeczy, każda mierzalna:

1. **Liczby nie da się WPISAĆ.** ``PomiarZgodnosci`` odmawia konstrukcji bez
   żetonu, który wydaje wyłącznie ``zmierz_zgodnosc``. Przypadkowa i wygodna
   ścieżka „wpiszę 0.0" przestaje istnieć; zostaje wyłącznie ścieżka celowego
   fałszerstwa, a to jest inna kategoria zdarzenia.
2. **Liczba jest PRZELICZALNA.** Pomiar niesie próbki, na których powstał, więc
   ``przelicz()`` odtwarza wartość z danych. Rozjazd między deklarowaną a
   przeliczoną wartością jest wykrywany, a nie zakładany jako niemożliwy.
3. **Liczba jest ZWIĄZANA ze scenariuszem.** Pomiar niesie odcisk scenariusza,
   odcisk przebiegu badanego i odcisk wzorca. Dowód odrzuca metrykę, której
   scenariusz nie występuje wśród jego przypadków — czyli „zmierzone na biegu A,
   podstawione pod dowód o biegu B" przestaje być możliwe po cichu.

Granica jest więc przesunięta z „wystarczy wpisać liczbę" na „trzeba wytworzyć
spójną parę przebiegów i tożsamość scenariusza". To nie jest dowód niemożliwości
fałszerstwa i nie jest tak nazywane.
"""

from __future__ import annotations

import math
from dataclasses import InitVar, dataclass
from enum import StrEnum

import numpy as np
from numpy.typing import NDArray

from dynamic_lab.tozsamosc import TozsamoscScenariusza, odcisk
from dynamic_lab.wzorzec_trajektoria import Przebieg

__all__ = [
    "PomiarNiepowiazanyError",
    "PomiarSfabrykowanyError",
    "PomiarZgodnosci",
    "RodzajMetryki",
    "odcisk_przebiegu",
    "zmierz_zgodnosc",
]


class RodzajMetryki(StrEnum):
    """CO liczy metryka. Nazwa metryki jest etykietą; rodzaj jest definicją.

    Bez rodzaju dwie metryki o tej samej nazwie i tej samej liczbie mogą być
    policzone zupełnie inaczej (maksimum vs RMS), a ``przelicz()`` nie miałby
    czego odtwarzać.
    """

    MAKS_BLAD_WZGLEDNY = "MAKS_BLAD_WZGLEDNY"
    RMS_BLAD_WZGLEDNY = "RMS_BLAD_WZGLEDNY"
    MAKS_BLAD_BEZWZGLEDNY = "MAKS_BLAD_BEZWZGLEDNY"


class PomiarSfabrykowanyError(RuntimeError):
    """Próba zbudowania pomiaru z pominięciem funkcji mierzącej."""


class PomiarNiepowiazanyError(RuntimeError):
    """Pomiar, którego scenariusz nie występuje wśród przypadków dowodu."""


_ZETON = object()
"""Żeton wydawany wyłącznie przez ``zmierz_zgodnosc``.

Świadomie NIE jest to flaga typu ``bool`` ani łańcuch: obie dałoby się podać z
zewnątrz bez sięgania po prywatną nazwę modułu. Tożsamość obiektu jest tu
jedynym kluczem, a ``is`` jedynym testem.
"""


def odcisk_przebiegu(przebieg: Przebieg) -> str:
    """SHA-256 próbek przebiegu — z kwantyzacją do 12 cyfr znaczących.

    DLACZEGO KWANTYZACJA. Przebieg powstaje z obliczeń zmiennoprzecinkowych,
    w których kolejność redukcji zależy od BLAS-a i liczby wątków (zmierzone na
    ``np.linalg.inv``: różnice 1–2 ULP). Odcisk liczony z surowego ``repr``
    wzmacnia to do zupełnie innego skrótu, więc ten sam bieg na innej maszynie
    „nie pasowałby" do własnego pomiaru. Dwanaście cyfr znaczących leży o cztery
    rzędy poniżej progu akceptacji najostrzejszej z używanych tu metryk i o kilka
    rzędów powyżej szumu międzymaszynowego.
    """
    return odcisk(
        {
            "jednostka": przebieg.jednostka,
            "czas_s": [float(f"{float(t):.11e}") for t in przebieg.czas_s],
            "wartosci": [float(f"{float(w):.11e}") for w in przebieg.wartosci],
        }
    )


def _wartosc_metryki(
    rodzaj: RodzajMetryki,
    badany: NDArray[np.float64],
    wzorzec: NDArray[np.float64],
) -> float:
    """Definicja metryki — JEDNO miejsce, z którego korzysta i pomiar, i przeliczenie.

    Gdyby przeliczenie miało własną kopię wzoru, zgodność „wartość == przelicz()"
    dowodziłaby wyłącznie tego, że dwie kopie tego samego błędu się zgadzają.
    """
    roznica = np.abs(badany - wzorzec)
    if rodzaj is RodzajMetryki.MAKS_BLAD_BEZWZGLEDNY:
        return float(np.max(roznica))

    # Odniesienie względne: amplituda wzorca w oknie. Dzielenie przez wartość
    # chwilową wywraca się przy przejściu wzorca przez zero (błąd względny rośnie
    # do nieskończoności w punkcie, w którym fizyka nic złego nie robi), więc
    # mianownikiem jest ROZPIĘTOŚĆ wzorca — a gdy jest zerowa (wzorzec stały),
    # jego wartość bezwzględna.
    rozpietosc = float(np.max(wzorzec) - np.min(wzorzec))
    odniesienie = rozpietosc if rozpietosc > 0.0 else float(np.max(np.abs(wzorzec)))
    if odniesienie <= 0.0:
        raise ValueError(
            "Wzorzec jest tożsamościowo zerowy — błąd WZGLĘDNY nie ma wtedy "
            "mianownika. Użyj MAKS_BLAD_BEZWZGLEDNY albo innego wzorca."
        )
    if rodzaj is RodzajMetryki.MAKS_BLAD_WZGLEDNY:
        return float(np.max(roznica) / odniesienie)
    return float(math.sqrt(float(np.mean(roznica**2))) / odniesienie)


@dataclass(frozen=True)
class PomiarZgodnosci:
    """Jedna zmierzona liczba WRAZ z danymi, z których powstała.

    Pomiar niesie własne próbki (na wspólnej siatce), więc jest PRZELICZALNY —
    i to jest jego istota. Pomiar bez danych to znowu tylko liczba.
    """

    nazwa: str
    rodzaj: RodzajMetryki
    wartosc: float
    okno_s: tuple[float, float]
    odcisk_scenariusza: str
    odcisk_badanego: str
    odcisk_wzorca: str
    probki_badanego: tuple[float, ...]
    probki_wzorca: tuple[float, ...]
    siatka_s: tuple[float, ...]
    zeton: InitVar[object] = None
    """``InitVar``, a nie pole — świadomie.

    Żeton jest warunkiem WYTWORZENIA pomiaru, a nie jego własnością: gdyby był
    polem, wszedłby do postaci kanonicznej i do odcisku, czyli tożsamość pomiaru
    zależałaby od obiektu bez deterministycznej reprezentacji. ``InitVar`` nie
    pojawia się w ``dataclasses.fields``, więc odcisk obejmuje dokładnie dane
    pomiaru — i ani jednej rzeczy więcej.
    """

    def __post_init__(self, zeton: object) -> None:
        if zeton is not _ZETON:
            raise PomiarSfabrykowanyError(
                "PomiarZgodnosci nie powstaje przez konstruktor — jedyną drogą jest "
                "`zmierz_zgodnosc`, bo pomiar wpisany ręcznie nie jest pomiarem. "
                "Jeżeli piszesz test, ZMIERZ na spreparowanych przebiegach: to nadal "
                "przechodzi przez definicję metryki i przez wiązanie ze scenariuszem."
            )
        if not self.nazwa.strip():
            raise ValueError("Pomiar bez nazwy nie mówi, CO zmierzono.")
        if not math.isfinite(self.wartosc) or self.wartosc < 0.0:
            raise ValueError(f"{self.nazwa}: wartość metryki musi być skończona i >= 0.")
        if self.okno_s[0] >= self.okno_s[1]:
            raise ValueError(f"{self.nazwa}: okno pomiarowe musi mieć dodatnią długość.")
        dlugosci = {len(self.probki_badanego), len(self.probki_wzorca), len(self.siatka_s)}
        if len(dlugosci) != 1:
            raise ValueError(f"{self.nazwa}: próbki badanego, wzorca i siatki mają różne długości.")
        if len(self.siatka_s) < 2:
            raise ValueError(f"{self.nazwa}: pomiar na mniej niż dwóch próbkach nie jest pomiarem.")
        for pole in ("odcisk_scenariusza", "odcisk_badanego", "odcisk_wzorca"):
            if not str(getattr(self, pole)).strip():
                raise ValueError(f"{self.nazwa}: puste pole `{pole}` rozwiązuje wiązanie pomiaru.")

    @property
    def liczba_probek(self) -> int:
        return len(self.siatka_s)

    def przelicz(self) -> float:
        """Odtwarza wartość z zapisanych próbek — TĄ SAMĄ definicją metryki."""
        return _wartosc_metryki(
            self.rodzaj,
            np.asarray(self.probki_badanego, dtype=np.float64),
            np.asarray(self.probki_wzorca, dtype=np.float64),
        )

    def spojny(self, *, tolerancja: float = 1.0e-12) -> bool:
        """Czy deklarowana wartość zgadza się z przeliczoną z danych."""
        return abs(self.przelicz() - self.wartosc) <= tolerancja

    @property
    def odcisk(self) -> str:
        return odcisk(self)


def zmierz_zgodnosc(
    *,
    nazwa: str,
    rodzaj: RodzajMetryki,
    badany: Przebieg,
    wzorzec: Przebieg,
    okno_s: tuple[float, float],
    scenariusz: TozsamoscScenariusza,
    liczba_probek: int = 201,
) -> PomiarZgodnosci:
    """JEDYNA droga do ``PomiarZgodnosci``: policz metrykę z dwóch przebiegów.

    Oba przebiegi są sprowadzane na WSPÓLNĄ siatkę w oknie — bez tego porównanie
    dwóch różnych siatek jest porównaniem dwóch różnych rzeczy. Ekstrapolacja jest
    zabroniona po stronie ``Przebieg.na_siatce``, więc okno wychodzące poza dane
    kończy się błędem, a nie wartością brzegową udającą doskonałą zgodność.
    """
    if badany.jednostka != wzorzec.jednostka:
        raise ValueError(
            f'{nazwa}: jednostka badanego („{badany.jednostka}") różni się od jednostki '
            f'wzorca („{wzorzec.jednostka}") — to porównanie dwóch różnych wielkości.'
        )
    if liczba_probek < 2:
        raise ValueError(f"{nazwa}: siatka pomiarowa musi mieć co najmniej dwie próbki.")
    lo, hi = okno_s
    if not (math.isfinite(lo) and math.isfinite(hi)) or lo >= hi:
        raise ValueError(f"{nazwa}: okno pomiarowe [{lo!r}, {hi!r}] jest puste lub nieskończone.")

    siatka = np.linspace(lo, hi, liczba_probek, dtype=np.float64)
    probki_badanego = badany.na_siatce(siatka)
    probki_wzorca = wzorzec.na_siatce(siatka)
    wartosc = _wartosc_metryki(rodzaj, probki_badanego, probki_wzorca)

    return PomiarZgodnosci(
        nazwa=nazwa,
        rodzaj=rodzaj,
        wartosc=wartosc,
        okno_s=(float(lo), float(hi)),
        odcisk_scenariusza=scenariusz.odcisk,
        odcisk_badanego=odcisk_przebiegu(badany),
        odcisk_wzorca=odcisk_przebiegu(wzorzec),
        probki_badanego=tuple(float(w) for w in probki_badanego),
        probki_wzorca=tuple(float(w) for w in probki_wzorca),
        siatka_s=tuple(float(t) for t in siatka),
        zeton=_ZETON,
    )

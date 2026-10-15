"""§9/§10 audytu — PRZEBIEG ZWIĄZANY Z BIEGIEM, a nie luźna tablica obok scenariusza.

KOD BADAWCZY — patrz `backend/research/README.md`.

LUKA, KTÓRĄ ZAMYKA (zarzut §9, potwierdzony konstrukcyjnie)
------------------------------------------------------------
`pomiar_zgodnosci.zmierz_zgodnosc` przyjmował TRZY niezależne argumenty::

    badany:      Przebieg
    wzorzec:     Przebieg
    scenariusz:  TozsamoscScenariusza

Sam `Przebieg` to oś czasu i wartości — nie niesie ŻADNEJ informacji o tym, skąd
pochodzi. Nic więc nie sprawdzało, czy podany przebieg powstał właśnie w podanym
scenariuszu. Błąd integracyjny postaci::

    trajektoria_A  +  scenariusz_B

przechodził bez jednego wyjątku — pomiar wiązał się odciskiem z biegiem, którego
nie widział.

To jest ta sama klasa co pomiar wpisywany ręcznie, ale piętro wyżej: tam
fałszowało się WARTOŚĆ, tu POCHODZENIE.

CO ROBI TEN MODUŁ
-----------------
`PrzebiegZwiazany` da się wytworzyć WYŁĄCZNIE z `WynikDynamiczny` (funkcja
`przebieg_z_biegu`), więc niesie tożsamość biegu, z którego został wyjęty:
odcisk scenariusza, topologii i implementacji, status zbieżności i kompletności
oraz pełną tożsamość kanału (klucz, element, przestrzeń, jednostka). Pomiar
zgodności liczony na takim przebiegu ODMAWIA, gdy deklarowany scenariusz nie jest
tym, w którym bieg powstał.

CZEGO NIE UDAJE
---------------
To nie jest podpis kryptograficzny i nie chroni przed celowym fałszerstwem w tym
samym procesie — `object.__setattr__` przebije każdą zamrożoną dataklasę.
Zamyka ŚCIEŻKĘ PRZYPADKOWĄ: pomylenie biegów przy składaniu dowodu przestaje być
możliwe po cichu.
"""

from __future__ import annotations

from dataclasses import InitVar, dataclass

import numpy as np

from dynamic_lab.tozsamosc import TozsamoscScenariusza
from dynamic_lab.wynik import PrzestrzenSygnalu, WynikDynamiczny
from dynamic_lab.wzorzec_trajektoria import Przebieg

__all__ = [
    "NiezgodnaProweniencjaError",
    "PrzebiegZwiazany",
    "TozsamoscBiegu",
    "przebieg_z_biegu",
    "zdarzenia_w_biegu",
    "zdarzenie_w_biegu",
]


class NiezgodnaProweniencjaError(RuntimeError):
    """Przebieg nie pochodzi z biegu, o którym mówi wołający."""


_ZETON = object()


@dataclass(frozen=True)
class TozsamoscBiegu:
    """Komplet odcisków biegu — CO liczono, CZYM i z jakim skutkiem."""

    odcisk_scenariusza: str
    odcisk_topologii: str
    odcisk_implementacji: str
    zbiegl: bool
    kompletnosc: str
    kroki_na_podlodze_numerycznej: int

    @property
    def material_dowodowy(self) -> bool:
        """Czy bieg w ogóle nadaje się na materiał dowodowy.

        Trzy warunki, każdy konieczny: zbieżność, kompletność przebiegu i brak
        kroków poniżej zadeklarowanej tolerancji. Ostatni bywa pomijany, bo
        ``zbiegl=True`` wygląda na wystarczające — a nie jest: bieg dopuszczający
        zastój kończy się bez wyjątku, mając kroki powyżej progu.
        """
        return (
            self.zbiegl
            and self.kompletnosc == "pelny"
            and self.kroki_na_podlodze_numerycznej == 0
        )


@dataclass(frozen=True)
class PrzebiegZwiazany:
    """Przebieg WRAZ z tożsamością biegu, z którego pochodzi.

    Konstruktor odmawia bez żetonu wydawanego przez `przebieg_z_biegu` — inaczej
    „związanie" byłoby polem do wypełnienia, czyli deklaracją.
    """

    przebieg: Przebieg
    bieg: TozsamoscBiegu
    klucz: str
    element_ref: str
    przestrzen: PrzestrzenSygnalu
    zeton: InitVar[object] = None

    def __post_init__(self, zeton: object) -> None:
        if zeton is not _ZETON:
            raise NiezgodnaProweniencjaError(
                "PrzebiegZwiazany powstaje WYŁĄCZNIE przez `przebieg_z_biegu(wynik, …)`. "
                "Złożenie go ręcznie znaczyłoby, że tożsamość biegu jest wpisywana, a nie "
                "odczytywana — czyli dokładnie to, przed czym ten typ ma chronić."
            )

    @property
    def tozsamosc_kanalu(self) -> str:
        return f"{self.przestrzen.value}.{self.klucz}@{self.element_ref}"

    def zgodny_ze_scenariuszem(self, scenariusz: TozsamoscScenariusza) -> bool:
        return self.bieg.odcisk_scenariusza == scenariusz.odcisk


def przebieg_z_biegu(
    wynik: WynikDynamiczny,
    *,
    klucz: str,
    element_ref: str,
    przestrzen: PrzestrzenSygnalu = PrzestrzenSygnalu.WYJSCIE,
) -> PrzebiegZwiazany:
    """JEDYNA droga do `PrzebiegZwiazany` — wyjmij kanał ze ŚLADU biegu.

    Tożsamość biegu jest ODCZYTYWANA z wyniku, nie przyjmowana argumentem, więc
    nie da się zbudować przebiegu „z biegu A" deklarującego bieg B.
    """
    sygnal = wynik.sygnal(klucz, element_ref, przestrzen)
    przebieg = Przebieg(
        czas_s=np.asarray(wynik.czas_s, dtype=np.float64),
        wartosci=np.asarray(sygnal.wartosci, dtype=np.float64),
        jednostka=sygnal.jednostka,
        zrodlo=f"bieg:{wynik.odcisk_scenariusza[:12]}/{przestrzen.value}.{klucz}@{element_ref}",
    )
    return PrzebiegZwiazany(
        przebieg=przebieg,
        bieg=TozsamoscBiegu(
            odcisk_scenariusza=wynik.odcisk_scenariusza,
            odcisk_topologii=wynik.odcisk_topologii,
            odcisk_implementacji=wynik.odcisk_implementacji,
            zbiegl=wynik.diagnostyka.zbiegl,
            kompletnosc=wynik.diagnostyka.kompletnosc.value,
            kroki_na_podlodze_numerycznej=wynik.diagnostyka.kroki_na_podlodze_numerycznej,
        ),
        klucz=klucz,
        element_ref=element_ref,
        przestrzen=przestrzen,
        zeton=_ZETON,
    )


def zdarzenia_w_biegu(
    wynik: WynikDynamiczny,
    *,
    chwila_s: float,
    tolerancja_s: float = 1.0e-9,
    adres: str | None = None,
) -> tuple[dict[str, object], ...]:
    """WSZYSTKIE zdarzenia śladu zastosowane w podanej chwili.

    Ta funkcja i ``zdarzenie_w_biegu`` dzielą JEDNĄ regułę dopasowania: ta druga
    zwraca pierwsze trafienie tej pierwszej. Dwa niezależne dopasowania („czy
    jest" i „które są") zgadzałyby się tylko dopóki ktoś nie poprawi jednego
    z nich — a paczka zdarzeń tej samej chwili jest właśnie tym miejscem, gdzie
    odpowiedzi muszą pochodzić z tego samego przesiewu.
    """
    trafienia: list[dict[str, object]] = []
    for zdarzenie in wynik.zdarzenia:
        zastosowano = zdarzenie.get("czas_zastosowania_s", zdarzenie.get("czas_s"))
        if zastosowano is None:
            continue
        if abs(float(zastosowano) - chwila_s) > tolerancja_s:
            continue
        if adres is not None and zdarzenie.get("adres") != adres:
            continue
        trafienia.append(dict(zdarzenie))
    return tuple(trafienia)


def zdarzenie_w_biegu(
    wynik: WynikDynamiczny,
    *,
    chwila_s: float,
    tolerancja_s: float = 1.0e-9,
    adres: str | None = None,
) -> dict[str, object] | None:
    """Czy w ŚLADZIE biegu jest zdarzenie zastosowane w podanej chwili.

    §10 audytu: `chwila_zaklocenia_s` była podawana do oceny FRT NIEZALEŻNIE od
    wyniku, więc nic nie sprawdzało, czy w tym biegu cokolwiek się wtedy wydarzyło.
    Ocena „FRT wobec zakłócenia w 0,5 s" na biegu bez zakłócenia jest oceną
    obwiedni wobec przebiegu ustalonego — i wychodzi pozytywnie.

    ``adres`` ZAWĘŻA pytanie z „coś się wtedy stało" do „stało się to w tym
    miejscu" (np. ``"szyna:GEN"``) i jest przeznaczony dla wołającego, który pyta
    o konkretną szynę czy gałąź. Ocena FRT go NIE zawęża i zawężać nie może:
    zapad na zaciskach modułu wywołany zwarciem na szynie ODLEGŁEJ to typowy
    przypadek LVRT, więc wymaganie zdarzenia „na szynie modułu" odrzucałoby oceny
    poprawne. ``None`` (domyślnie) znaczy „miejsce nieistotne".

    Porównywany jest ``czas_zastosowania_s`` (chwila, w której zdarzenie FAKTYCZNIE
    weszło do modelu), a nie ``czas_s`` z harmonogramu: różnią się o błąd
    dopasowania do siatki kroku i to ten pierwszy opisuje przebieg.
    """
    trafienia = zdarzenia_w_biegu(
        wynik, chwila_s=chwila_s, tolerancja_s=tolerancja_s, adres=adres
    )
    return trafienia[0] if trafienia else None

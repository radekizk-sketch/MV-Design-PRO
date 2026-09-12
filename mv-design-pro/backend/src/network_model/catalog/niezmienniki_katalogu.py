"""Niezmienniki katalogu z JAWNĄ klasyfikacją mocy (§12–14 remediacji).

DLACZEGO TEN MODUŁ POWSTAŁ. Poprzednia wersja traktowała ponad czterdzieści
reguł jednakowo — każda była TWARDĄ bramką. Niezależny recenzent zakwestionował
pięć z nich jako zbyt mocne dla rodzin, do których były stosowane, i miał rację:
reguła, która dziś przechodzi na wszystkich rekordach, nie jest przez to prawem
fizyki. Odrzuciłaby pierwszy poprawny rekord spoza dotychczasowego zbioru.

CZTERY KLASY MOCY. Tylko trzy pierwsze mogą być TWARDĄ bramką:

  * ``KONIECZNOSC_FIZYCZNA`` — złamanie opisuje obiekt, który nie może istnieć
    (np. napięcie zerowe albo ujemne, przekładnia odwrócona).
  * ``WYMOG_NORMOWY`` — relacja wynika z definicji wielkości w normie
    (np. ``Ics ≤ Icu`` w IEC 60947-2: obie opisują TEN SAM aparat i ta sama norma
    definiuje jedną jako ułamek drugiej).
  * ``OGRANICZENIE_ZAKRESU_PRODUKTU`` — wynika z jawnie zadeklarowanego zakresu
    produktu, nie z fizyki.
  * ``WIARYGODNOSC`` — relacja typowa dla rodziny, ale NIE konieczna. Daje
    ostrzeżenie „do przeglądu", nigdy twardej odmowy.

ZASADA, KTÓREJ TU PILNUJEMY: lepiej przepuścić nietypowy, ale poprawny rekord z
ostrzeżeniem, niż odrzucić go twardo na podstawie doświadczenia z rekordów, które
akurat mamy. Fałszywa pewność reguły jest droższa niż jej brak.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from enum import StrEnum
from typing import Any


class KlasaNiezmiennika(StrEnum):
    """Moc reguły — rozstrzyga, czy złamanie jest odmową, czy ostrzeżeniem."""

    KONIECZNOSC_FIZYCZNA = "KONIECZNOSC_FIZYCZNA"
    WYMOG_NORMOWY = "WYMOG_NORMOWY"
    OGRANICZENIE_ZAKRESU_PRODUKTU = "OGRANICZENIE_ZAKRESU_PRODUKTU"
    WIARYGODNOSC = "WIARYGODNOSC"


#: Zapas na zaokrąglenia przy porównaniach „nie większe niż" — dane katalogowe
#: bywają podane z inną precyzją niż wielkość, z którą je zestawiamy.
LUZ_POROWNANIA: float = 1.0001

#: Klasy, których złamanie jest TWARDĄ odmową.
KLASY_TWARDE: frozenset[KlasaNiezmiennika] = frozenset(
    {
        KlasaNiezmiennika.KONIECZNOSC_FIZYCZNA,
        KlasaNiezmiennika.WYMOG_NORMOWY,
        KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
    }
)

#: Reguły PRZEKLASYFIKOWANE po recenzji niezależnej, z uzasadnieniem każdej zmiany.
#: Klucz: nazwa reguły. Wartość: (klasa, uzasadnienie).
PRZEKLASYFIKOWANE: dict[str, tuple[KlasaNiezmiennika, str]] = {
    "R0 >= R1": (
        KlasaNiezmiennika.WIARYGODNOSC,
        "Rezystancja składowej zerowej zależy od konstrukcji żyły powrotnej, "
        "ekranu i drogi powrotu przez ziemię. Dla konstrukcji z powrotem "
        "ziemnym R0 jest zwykle kilkukrotnie większe (pomiar katalogu: R0/R1 "
        "od 3,0 do 6,5), ale nie jest to nierówność uniwersalna dla każdej "
        "konstrukcji kabla i linii. Twarda bramka odrzuciłaby poprawny rekord "
        "spoza dotychczasowego zbioru.",
    ),
    "P0 < Pk": (
        KlasaNiezmiennika.WIARYGODNOSC,
        "Relacja typowa dla transformatorów rozdzielczych (pomiar katalogu: "
        "P0/Pk od 0,11 do 0,22), ale nie konieczność matematyczna dla każdej "
        "rodziny konstrukcyjnej. Odwrócenie pary zwykle oznacza zamienione "
        "kolumny przy imporcie — i o tym ma powiedzieć ostrzeżenie, a nie "
        "odmowa wczytania pozycji.",
    ),
    "Icw <= Icu (nN)": (
        KlasaNiezmiennika.WIARYGODNOSC,
        "IEC 60947-2 definiuje Ics JAWNIE jako procent Icu (§4.3.5.2.2) — i ta "
        "relacja zostaje twarda. Dla Icw takiej definicji NIE MA: norma opisuje "
        "je osobno (§4.3.5.4), jako wytrzymałość krótkotrwałą wyłącznika "
        "kategorii B przez zadany czas, a nie jako ułamek zdolności wyłączalnej. "
        "Icw i Icu to różne zdolności (przewodzenie bez uszkodzenia kontra "
        "przerwanie prądu) i porównywać je wolno wyłącznie dla tego samego "
        "wariantu, napięcia i czasu. Globalna nierówność po całej rodzinie nN "
        "nie ma podstawy normowej.",
    ),
    "Icw <= Icu (SN)": (
        KlasaNiezmiennika.WIARYGODNOSC,
        "Icw (wytrzymałość krótkotrwała) i Icu (zdolność wyłączalna) to RÓŻNE "
        "wielkości znamionowe, a poprzednia reguła porównywała je globalnie, "
        "przez rodziny aparatów o różnym zakresie zastosowania normy. Pomiar: "
        "28 par w katalogu, WSZYSTKIE równe — czyli reguła i tak niczego dziś "
        "nie rozstrzyga, a mogłaby odrzucić poprawny rekord aparatu, dla "
        "którego norma tej relacji nie narzuca.",
    ),
    "0 < R/X < 1": (
        KlasaNiezmiennika.WIARYGODNOSC,
        "Umowa równoważna sieci SN jest zwykle silnie indukcyjna (pomiar: R/X "
        "od 0,08 do 0,12), ale równoważnik rezystancyjny albo specjalnie "
        "zdefiniowany może mieć R/X ≥ 1. Ograniczenie należy do zakresu "
        "produktu, nie do fizyki — a dopóki zakres nie jest zadeklarowany, "
        "twarda bramka jest nieuzasadniona.",
    ),
    "0 < i0% < 10": (
        KlasaNiezmiennika.WIARYGODNOSC,
        "Zakres rozsądny dla transformatorów rozdzielczych (pomiar: 0,25–2,8 %), "
        "ale nie uniwersalny dla transformatorów specjalnych. Górna granica 10 % "
        "była kontrolą jednostki, a nie wielkością normowaną.",
    ),
}


# ---------------------------------------------------------------------------
# Strukturalny wynik przeglądu wiarygodności (§ remediacji: odstępstwo widoczne
# maszynowo, nie wydrukiem testu)
# ---------------------------------------------------------------------------

#: Stabilne kody reguł wiarygodności. Kod jest tożsamością odstępstwa w
#: raportach i w porównaniach między przebiegami — nazwa reguły jest opisem dla
#: człowieka i wolno ją przeredagować, kodu nie.
KODY_REGUL_WIARYGODNOSCI: dict[str, str] = {
    "R0 >= R1": "KAT-W-001",
    "P0 < Pk": "KAT-W-002",
    "Icw <= Icu (SN)": "KAT-W-003",
    "Icw <= Icu (nN)": "KAT-W-004",
    "0 < R/X < 1": "KAT-W-005",
    "0 < i0% < 10": "KAT-W-006",
}


@dataclass(frozen=True)
class OdstepstwoWiarygodnosci:
    """Jedna pozycja katalogu łamiąca regułę klasy ``WIARYGODNOSC``."""

    kod: str
    regula: str
    pozycja_id: str
    opis_wartosci: str

    def to_dict(self) -> dict[str, str]:
        return {
            "kod": self.kod,
            "regula": self.regula,
            "pozycja_id": self.pozycja_id,
            "opis_wartosci": self.opis_wartosci,
        }


@dataclass(frozen=True)
class WynikPrzegladuWiarygodnosci:
    """Wynik przeglądu — MASZYNOWY, nie wydruk na stdout.

    DLACZEGO TO ISTNIEJE. Po przeklasyfikowaniu pięciu reguł na ostrzeżenia
    odstępstwo przestało zatrzymywać cokolwiek — i w pierwszej wersji było
    widoczne wyłącznie jako tekst wypisany przez test do przechwytywanego
    stdout. Przy zielonym przebiegu nie powstawał żaden artefakt, więc zdanie
    „reguła nadal raportuje odstępstwa" było operacyjnie puste. Tutaj wynik jest
    obiektem: da się go policzyć, porównać między wersjami katalogu i dołączyć
    do raportu, a `bez_odstepstw` jest jednym, sprawdzalnym predykatem.
    """

    odstepstwa: tuple[OdstepstwoWiarygodnosci, ...]
    sprawdzone_reguly: tuple[str, ...]

    @property
    def bez_odstepstw(self) -> bool:
        return not self.odstepstwa

    def wedlug_kodu(self) -> dict[str, int]:
        liczniki: dict[str, int] = {}
        for o in self.odstepstwa:
            liczniki[o.kod] = liczniki.get(o.kod, 0) + 1
        return dict(sorted(liczniki.items()))

    def to_dict(self) -> dict[str, object]:
        return {
            "sprawdzone_reguly": list(self.sprawdzone_reguly),
            "liczba_odstepstw": len(self.odstepstwa),
            "wedlug_kodu": self.wedlug_kodu(),
            "odstepstwa": [o.to_dict() for o in self.odstepstwa],
        }


def klasa_reguly(regula: str) -> KlasaNiezmiennika:
    """Klasa reguły. Reguła spoza rejestru przeklasyfikowania jest TWARDA.

    Domyślna twardość jest celowa: nowa reguła dopisana bez decyzji o jej mocy
    ma zachowywać się jak bramka, a nie po cichu wejść na stronę ostrzeżeń.
    """
    wpis = PRZEKLASYFIKOWANE.get(regula)
    return wpis[0] if wpis else KlasaNiezmiennika.KONIECZNOSC_FIZYCZNA


def regula_jest_twarda(regula: str) -> bool:
    return klasa_reguly(regula) in KLASY_TWARDE


def przeglad_wiarygodnosci_aparatury_nn(
    pozycje: Iterable[Any],
) -> WynikPrzegladuWiarygodnosci:
    """Przegląd reguł klasy ``WIARYGODNOSC`` dla aparatury nN.

    Dziś obejmuje jedną regułę (``Icw ≤ Icu``), bo tylko ona została dla tej
    rodziny przeklasyfikowana. Funkcja zwraca jednak WYNIK ZBIORCZY z listą
    sprawdzonych reguł, żeby dopisanie kolejnej nie wymagało zmiany kształtu
    odpowiedzi ani konsumentów.

    ZERO ODMOWY. Reguła wiarygodności NIGDY nie podnosi wyjątku — jej złamanie
    jest sygnałem „do przeglądu", a decyzję podejmuje człowiek z kartą producenta
    w ręku.
    """
    regula = "Icw <= Icu (nN)"
    kod = KODY_REGUL_WIARYGODNOSCI[regula]
    odstepstwa: list[OdstepstwoWiarygodnosci] = []
    for p in pozycje:
        icw = getattr(p, "icw_ka", None)
        icu = getattr(p, "i_cu_ka", None)
        if icw is None or icu is None:
            continue
        if icw > icu * LUZ_POROWNANIA:
            odstepstwa.append(
                OdstepstwoWiarygodnosci(
                    kod=kod,
                    regula=regula,
                    pozycja_id=str(getattr(p, "id", "?")),
                    opis_wartosci=f"Icw = {icw} kA, Icu = {icu} kA",
                )
            )
    return WynikPrzegladuWiarygodnosci(
        odstepstwa=tuple(odstepstwa),
        sprawdzone_reguly=(regula,),
    )

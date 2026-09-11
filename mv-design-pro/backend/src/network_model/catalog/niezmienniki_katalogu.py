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

from enum import StrEnum


class KlasaNiezmiennika(StrEnum):
    """Moc reguły — rozstrzyga, czy złamanie jest odmową, czy ostrzeżeniem."""

    KONIECZNOSC_FIZYCZNA = "KONIECZNOSC_FIZYCZNA"
    WYMOG_NORMOWY = "WYMOG_NORMOWY"
    OGRANICZENIE_ZAKRESU_PRODUKTU = "OGRANICZENIE_ZAKRESU_PRODUKTU"
    WIARYGODNOSC = "WIARYGODNOSC"


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

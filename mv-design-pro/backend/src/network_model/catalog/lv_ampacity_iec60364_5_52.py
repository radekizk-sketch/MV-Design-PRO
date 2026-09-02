"""Tablice korekcyjne obciazalnosci Iz' kabli nN wg PN-HD 60364-5-52 (DANE, G-D1).

Karta P0.5a (docs/nn/H_PLAN_IMPLEMENTACJI_NN.md sekcja P0.5, luka G-08/G-D1 —
docs/nn/G_MACIERZ_LUK_BACKENDU_NN.md).

REGULA KLASA, NIE INSTANCJA (przeglad 2026-08-01) — jedna sciezka fizyki. Do
karty P0.5a istnialy DWIE rownolegle struktury liczace obciazalnosc skorygowana:
`network_model.solvers.cable_ampacity_derating` (SN) i ten modul (P0.2, rejestr
G-D1 byl wtedy PUSTY). Rozstrzygniecie karty P0.5a: fizyka (skladanie
wspolczynnikow, mnozenie, Iz' = Iz * iloczyn) zyje WYLACZNIE w warstwie solvera
(`network_model.solvers.cable_ampacity_derating`). TEN modul jest odtad
WYLACZNIE nosnikiem DANYCH tablic normy z proweniencja — nie eksportuje zadnej
funkcji liczacej ani wlasnosci `iloczyn`. Kto potrzebuje Iz' nN, importuje
solver (`cable_ampacity_derating.wspolczynniki_nn` /
`cable_ampacity_derating.obciazalnosc_skorygowana`), ktory czyta ponizsze
rejestry.

ZASADA (bez zmian od P0.2): wspolczynnik pochodzi WYLACZNIE z wpisu tablicy o
UDOKUMENTOWANEJ, DWUZRODLOWEJ proweniencji (wzorzec flip-to-verified: Arc Flash
D-01, UM-ICU-KATALOG). Kazdy wpis niesie `podstawa` z DOKLADNYM numerem tablicy
normy PN-HD 60364-5-52 ORAZ nazwami dwoch niezaleznych zweryfikowanych zrodel
(katalog producenta kabli i/lub poradnik instalacyjny/publikacja SEP). Wartosc
niepotwierdzona w dwoch zrodlach NIE wchodzi do rejestru — rejestr jawnie
CZESCIOWY jest lepszy niz rejestr zgadniety. Braki (karta P0.5a, raport
wdrozeniowy):
  - korekta temperatury powietrza PONIZEJ 30 st C (10/15/20/25 st C) — tylko
    JEDNO zrodlo znaleziono (ecalpro.com); wzor normowy potwierdza wartosci
    matematycznie, ale karta wymaga DWOCH zrodel PUBLIKOWANYCH, nie
    przeliczenia wzoru — poza rejestrem.
  - grupowanie w powietrzu dla n=5 obwodow — tylko jedno zrodlo (ecalpro.com:
    0,60) — poza rejestrem.
  - grupowanie w gruncie (metoda D2, kable przylegajace) dla n=5,6 obwodow —
    tylko jedno zrodlo (ecalpro.com) — poza rejestrem.
  - metody ulozenia A1/A2/B1/B2/E/F (oznaczenia normy poza „powietrze"/"grunt"
    uproszczonym tu do dwoch srodowisk) — nie zasilone, brak dwuzrodlowej
    weryfikacji w tej karcie.

Domyslnie (brak override warunkow ulozenia) Iz' = Iz katalogowe — tablice
zwracaja wspolczynnik 1,0 dokladnie w punkcie odniesienia normy (30 st C
powietrze / 20 st C grunt / 2,5 K*m/W / 1 obwod), wiec obecnosc tego modulu NIE
zmienia zadnego dotychczasowego wyniku dla kabli bez jawnie zadeklarowanych
warunkow.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class WpisNormyNN:
    """Jeden wpis tablicy normy PN-HD 60364-5-52: wartosc + PELNA proweniencja.

    Walidacja zakresu jest integralnoscia DANYCH (wartosc spoza fizycznie
    sensownego zakresu korekty obciazalnosci jest bledem wpisu), nie fizyka —
    modul nie mnozy wpisow, nie sklada zestawow, nie liczy Iz'.
    """

    wartosc: float
    podstawa: str

    def __post_init__(self) -> None:
        if not 0.0 < self.wartosc <= 1.3:
            raise ValueError(
                f"Wartość współczynnika tablicowego musi leżeć w zakresie (0; 1,3] — "
                f"otrzymano {self.wartosc}."
            )
        if not self.podstawa or not self.podstawa.strip():
            raise ValueError("Wpis tablicy normy wymaga podstawy (proweniencji).")


# ---------------------------------------------------------------------------
# Proweniencja wspolna dla kazdej rodziny tablic (DWA niezalezne zrodla per
# rodzina + dokladny numer tablicy normy PN-HD 60364-5-52:2011).
# ---------------------------------------------------------------------------

_PODSTAWA_TEMPERATURA_POWIETRZE = (
    "PN-HD 60364-5-52:2011 tab. B.52.14 (korekta temperatury otoczenia — powietrze, "
    "odniesienie 30°C). Zweryfikowano w dwóch niezależnych źródłach: (1) katalog "
    "producenta kabli LAPP, „Tabele techniczne T12”, tabela 12-2 „Przeliczniki” "
    "(wyciąg z DIN VDE 0298-4:2013-06 tab. 17 — ta sama metodyka korekty "
    "temperaturowej co IEC/HD 60364-5-52); (2) ecalpro.com, „IEC 60364-5-52: "
    "Correction Factors (B.52.14-B.52.21)”."
)

_PODSTAWA_TEMPERATURA_GRUNT = (
    "PN-HD 60364-5-52:2011 tab. B.52.15 (korekta temperatury gruntu, odniesienie "
    "20°C). Zweryfikowano w dwóch niezależnych źródłach: (1) F. Lesiak, "
    "„Obciążalność prądowa kabli ułożonych w ziemi”, Oddział Krakowski SEP, "
    "§3.2 (cytuje tab. B52.15 wprost z wartościami); (2) uprawnieniaenergetyczne.com.pl, "
    "„Czym jest obciążalność prądowa kabli ułożonych w ziemi?” (te same wartości, "
    "ta sama tablica B52.15). Wartości zgodne ze wzorem normowym "
    "k=√((Tmax−Tamb)/(Tmax−Tref))."
)

_PODSTAWA_REZYSTYWNOSC_GRUNTU = (
    "PN-HD 60364-5-52:2011 tab. B.52.16 (korekta rezystywności cieplnej gruntu, "
    "odniesienie 2,5 K·m/W). Zweryfikowano w dwóch niezależnych źródłach: "
    "(1) ecalpro.com, tabela B.52.16; (2) F. Lesiak, Oddział Krakowski SEP, "
    "„Obciążalność prądowa kabli ułożonych w ziemi”, §3.1 (cytuje tab. 52.16 wprost; "
    "współczynniki k3 potwierdzone przeliczeniem tabel obciążalności skorygowanej "
    "Tab.2–Tab.9 tego samego dokumentu, dla wielu przekrojów, kabli Cu/Al, PCV/XLPE)."
)

_PODSTAWA_GRUPOWANIE_POWIETRZE = (
    "PN-HD 60364-5-52:2011 tab. B.52.17 (grupowanie obwodów wielożyłowych w "
    "wiązce/na ścianie/w rurze lub kanale instalacyjnym — metoda referencyjna C). "
    "Zweryfikowano w dwóch niezależnych źródłach: (1) katalog producenta kabli LAPP, "
    "„Tabele techniczne T12”, tabela 12-6 „Przeliczniki”, wiersz „W wiązce, "
    "bezpośrednio na ścianie, podłodze, w rurce lub kanale instalacyjnym” "
    "(wyciąg z DIN VDE 0298-4:2013-06 tab. 21); (2) ecalpro.com, tabela B.52.17 "
    "„Bunched Cables in Conduit/Trunking”."
)

_PODSTAWA_GRUPOWANIE_GRUNT = (
    "PN-HD 60364-5-52:2011 tab. B.52.18 (grupowanie kabli ułożonych bezpośrednio "
    "w ziemi, metoda referencyjna D2, kable przylegające). Zweryfikowano w dwóch "
    "niezależnych źródłach: (1) F. Lesiak, Oddział Krakowski SEP, „Obciążalność "
    "prądowa kabli ułożonych w ziemi”, §3.4 (cytuje tab. B52.18 wprost, kolumna "
    "„kable przylegające”); (2) ecalpro.com, tabela B.52.20 „Buried Cables”, "
    "kolumna „touching” — wartości identyczne dla n=2,3,4."
)

# ---------------------------------------------------------------------------
# 1. Korekta temperatury otoczenia — POWIETRZE (odniesienie 30°C)
# ---------------------------------------------------------------------------

TABLICA_TEMPERATURY_POWIETRZE_NN: dict[tuple[str, int], WpisNormyNN] = {
    ("PVC", 30): WpisNormyNN(1.00, _PODSTAWA_TEMPERATURA_POWIETRZE),
    ("PVC", 40): WpisNormyNN(0.87, _PODSTAWA_TEMPERATURA_POWIETRZE),
    ("PVC", 50): WpisNormyNN(0.71, _PODSTAWA_TEMPERATURA_POWIETRZE),
    ("PVC", 60): WpisNormyNN(0.50, _PODSTAWA_TEMPERATURA_POWIETRZE),
    ("XLPE", 30): WpisNormyNN(1.00, _PODSTAWA_TEMPERATURA_POWIETRZE),
    ("XLPE", 40): WpisNormyNN(0.91, _PODSTAWA_TEMPERATURA_POWIETRZE),
    ("XLPE", 50): WpisNormyNN(0.82, _PODSTAWA_TEMPERATURA_POWIETRZE),
    ("XLPE", 60): WpisNormyNN(0.71, _PODSTAWA_TEMPERATURA_POWIETRZE),
    ("XLPE", 70): WpisNormyNN(0.58, _PODSTAWA_TEMPERATURA_POWIETRZE),
    ("XLPE", 80): WpisNormyNN(0.41, _PODSTAWA_TEMPERATURA_POWIETRZE),
}

# ---------------------------------------------------------------------------
# 2. Korekta temperatury gruntu (odniesienie 20°C)
# ---------------------------------------------------------------------------

TABLICA_TEMPERATURY_GRUNTU_NN: dict[tuple[str, int], WpisNormyNN] = {
    ("PVC", 10): WpisNormyNN(1.10, _PODSTAWA_TEMPERATURA_GRUNT),
    ("PVC", 15): WpisNormyNN(1.05, _PODSTAWA_TEMPERATURA_GRUNT),
    ("PVC", 20): WpisNormyNN(1.00, _PODSTAWA_TEMPERATURA_GRUNT),
    ("PVC", 25): WpisNormyNN(0.95, _PODSTAWA_TEMPERATURA_GRUNT),
    ("PVC", 30): WpisNormyNN(0.89, _PODSTAWA_TEMPERATURA_GRUNT),
    ("XLPE", 10): WpisNormyNN(1.07, _PODSTAWA_TEMPERATURA_GRUNT),
    ("XLPE", 15): WpisNormyNN(1.04, _PODSTAWA_TEMPERATURA_GRUNT),
    ("XLPE", 20): WpisNormyNN(1.00, _PODSTAWA_TEMPERATURA_GRUNT),
    ("XLPE", 25): WpisNormyNN(0.96, _PODSTAWA_TEMPERATURA_GRUNT),
    ("XLPE", 30): WpisNormyNN(0.93, _PODSTAWA_TEMPERATURA_GRUNT),
}

# ---------------------------------------------------------------------------
# 3. Korekta rezystywności cieplnej gruntu (odniesienie 2,5 K·m/W)
# ---------------------------------------------------------------------------

TABLICA_REZYSTYWNOSCI_GRUNTU_NN: dict[float, WpisNormyNN] = {
    0.5: WpisNormyNN(1.28, _PODSTAWA_REZYSTYWNOSC_GRUNTU),
    0.7: WpisNormyNN(1.20, _PODSTAWA_REZYSTYWNOSC_GRUNTU),
    1.0: WpisNormyNN(1.18, _PODSTAWA_REZYSTYWNOSC_GRUNTU),
    1.5: WpisNormyNN(1.10, _PODSTAWA_REZYSTYWNOSC_GRUNTU),
    2.0: WpisNormyNN(1.05, _PODSTAWA_REZYSTYWNOSC_GRUNTU),
    2.5: WpisNormyNN(1.00, _PODSTAWA_REZYSTYWNOSC_GRUNTU),
    3.0: WpisNormyNN(0.96, _PODSTAWA_REZYSTYWNOSC_GRUNTU),
}

# ---------------------------------------------------------------------------
# 4. Grupowanie obwodów wielożyłowych — POWIETRZE (wiązka/rura/kanał, metoda C)
# ---------------------------------------------------------------------------

TABLICA_GRUPOWANIA_POWIETRZE_NN: dict[int, WpisNormyNN] = {
    1: WpisNormyNN(1.00, _PODSTAWA_GRUPOWANIE_POWIETRZE),
    2: WpisNormyNN(0.80, _PODSTAWA_GRUPOWANIE_POWIETRZE),
    3: WpisNormyNN(0.70, _PODSTAWA_GRUPOWANIE_POWIETRZE),
    4: WpisNormyNN(0.65, _PODSTAWA_GRUPOWANIE_POWIETRZE),
    6: WpisNormyNN(0.57, _PODSTAWA_GRUPOWANIE_POWIETRZE),
}

# ---------------------------------------------------------------------------
# 5. Grupowanie kabli — GRUNT (metoda D2, kable przylegające bezpośrednio)
# ---------------------------------------------------------------------------

TABLICA_GRUPOWANIA_GRUNTU_NN: dict[int, WpisNormyNN] = {
    1: WpisNormyNN(1.00, _PODSTAWA_GRUPOWANIE_GRUNT),
    2: WpisNormyNN(0.75, _PODSTAWA_GRUPOWANIE_GRUNT),
    3: WpisNormyNN(0.65, _PODSTAWA_GRUPOWANIE_GRUNT),
    4: WpisNormyNN(0.60, _PODSTAWA_GRUPOWANIE_GRUNT),
}

# Powod, dla ktorego rejestry sa czesciowe — zapisany w kodzie, zeby nie
# wygladaly na przeoczenie (patrz tez lista brakow w docstringu modulu).
OGRANICZENIE_TABLIC_PL = (
    "Rejestry zawierają wyłącznie wpisy tablic PN-HD 60364-5-52 zweryfikowane w DWÓCH "
    "niezależnych publikowanych źródłach (karta P0.5a). Braki: korekta temperatury "
    "powietrza poniżej 30°C, grupowanie w powietrzu dla 5 obwodów, grupowanie w "
    "gruncie dla 5–6 obwodów, metody ułożenia inne niż uproszczone „powietrze”/„grunt” "
    "— system nie fabrykuje współczynników z jednego źródła ani z pamięci."
)

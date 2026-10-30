"""Słownik funkcji EAZ pola SN — JEDNO źródło kodów `Bay.protection_codes` i `BayTemplate.funkcje_eaz`.

PO CO. Zestaw funkcji zabezpieczeń i automatyk należy do SZABLONU pola (ENEA Operator „Stacje
elektroenergetyczne 110 kV", Zeszyt 1: Z.10 ≠ Z.11 przy tej samej roli pola odpływowego), a nie
do roli. Dawna tablica „kody wg roli" nie mogła tego wyrazić i nie znała funkcji z rysunków
ENEA (ZS, LRW, SCO, SPZE, ARN, ZAWSC, BT/BD, Ir>, SZR). Każdy kod zapisany w modelu albo
w szablonie musi mieć tu wpis z nazwą i podstawą — kod spoza słownika jest błędem szablonu
(walidator `BayTemplate`) i operacji (test spójności).

KLUCZ. Kod funkcji = numer IEEE C37.2 (powszechny w przekaźnikach i w istniejących
konsumentach: glify schematu, LoM `application/analyses/ochrona_lom.py`, mapa funkcji
`application/field_read_model.FUNCTION_TYPE_MAP`, walidacja prerekwizytów topologii frontu),
gdy taki numer istnieje; inaczej — skrót krajowy ze standardu ENEA (ZS, SCO, SPZE, OWG, ZAWSC,
BT, BD, SZR). `oznaczenie_pl` to zapis z rysunków ENEA (I>, I>>, Io>, LRW, SPZ…) pokazywany
inżynierowi obok kodu. Jeden kod = jedna funkcja: dawny zapis „df/dt" w zestawie pola źródłowego
i „81R" w LoM opisywały TĘ SAMĄ funkcję dwoma kodami (LoM nie rozpoznawał deklaracji pola
źródłowego) — słownik zna wyłącznie „81R".

JEDNA NOMENKLATURA, KAŻDA FUNKCJA RAZ (decyzja architekta 2026-10-30, karta
UX-04/POLE-LINIOWE-WZORZEC). Reguła klucza obowiązuje bez wyjątków: funkcja z numerem IEEE C37.2
ma kod równy numerowi — także zabezpieczenia technologiczne transformatora (63 — Buchholz,
26 — temperatura, 63P — ciśnienie; dawniej klucze-nazwy „Buchholz", „temp", „ciśnienie"); skrót
krajowy jest kodem wyłącznie funkcji bez numeru. Słownik nie zna kodów złożonych z oznaczeń
innych funkcji ani agregatów kryteriów wymienianych obok tych kryteriów: dawne „SPZ/SCO"
(= SPZ 79 + SCO) jest częścią automatyki SCO, dawne „anti-islanding" (zestaw kryteriów LoM
27/59/81U/81O/81R stojących w tym samym zestawie pola) — skasowane. Przypina
`tests/network_model/catalog/test_funkcje_eaz_bez_duplikatow.py` na iloczynie wszystkich
szablonów pól × klas pola × warunków funkcji.

Moduł jest LIŚCIEM (stdlib): czytają go szablony pól, operacje domenowe, walidator i API.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

__all__ = [
    "FUNKCJE_EAZ",
    "FunkcjaEaz",
    "RodzajFunkcjiEaz",
    "funkcja_eaz",
    "kody_spoza_slownika",
    "opis_funkcji_eaz_pl",
]

RodzajFunkcjiEaz = Literal["ZABEZPIECZENIE", "AUTOMATYKA", "BLOKADA", "TECHNOLOGICZNE"]

_Z1 = "ENEA Operator, Stacje elektroenergetyczne 110 kV, Zeszyt 1"
_IR = "IRiESD ENEA Operator (wersja 2.3)"
_KS = "ENEA Operator, Katalog standardowych sygnałów telemechaniki obiektowej (2022)"


@dataclass(frozen=True)
class FunkcjaEaz:
    """Funkcja EAZ pola: kod, zapis z rysunku standardu, numer IEEE C37.2, nazwa i podstawa."""

    kod: str
    oznaczenie_pl: str
    ansi: str | None
    nazwa_pl: str
    rodzaj: RodzajFunkcjiEaz
    podstawa: str


_WPISY: tuple[FunkcjaEaz, ...] = (
    FunkcjaEaz(
        "51",
        "I>",
        "51",
        "nadprądowe zwłoczne",
        "ZABEZPIECZENIE",
        f"IEC 60255-151; {_Z1}, Z.10 s.89, Z.11 s.90, Z.11.1 s.91; {_IR} II.4.5.4.2.1 pkt 1",
    ),
    FunkcjaEaz(
        "50",
        "I>>",
        "50",
        "nadprądowe zwarciowe (bezzwłoczne)",
        "ZABEZPIECZENIE",
        f"IEC 60255-151; {_Z1}, Z.10 s.89, Z.11 s.90, Z.11.1 s.91; {_IR} II.4.5.4.2.1 pkt 1",
    ),
    FunkcjaEaz(
        "67",
        "I> kierunkowe",
        "67",
        "nadprądowe kierunkowe (blokada kierunkowa — przepływ mocy w stronę szyn)",
        "ZABEZPIECZENIE",
        f"{_Z1}, Z.11 s.90 i Z.11.1 s.91 („ZS (kierunkowe I>)”); "
        f"{_IR} II.4.5.4.2.2 pkt 1 i pkt 8, II.4.5.4.2.3 pkt 1",
    ),
    FunkcjaEaz(
        "51N",
        "Io>",
        "51N",
        "ziemnozwarciowe zwłoczne (prąd zerowy)",
        "ZABEZPIECZENIE",
        f"IEC 60255-151; {_Z1}, Z.13–Z.15 (Io>); {_IR} II.4.5.4.2.1 pkt 2",
    ),
    FunkcjaEaz(
        "50N",
        "Io>>",
        "50N",
        "ziemnozwarciowe bezzwłoczne (prąd zerowy)",
        "ZABEZPIECZENIE",
        f"IEC 60255-151; {_Z1}, Z.13–Z.15 (Io>>)",
    ),
    FunkcjaEaz(
        "67N",
        "Io> kierunkowe",
        "67N",
        "ziemnozwarciowe kierunkowe (wejścia Io i U0)",
        "ZABEZPIECZENIE",
        f"{_Z1}, Z.10 s.89 (zabezpieczenie ziemnozwarciowe, wejścia Io i U0), Z.11, Z.11.1; "
        f"{_IR} II.4.5.4.2.1 pkt 2, II.4.5.4.2.2 pkt 2, II.4.5.4.2.3 pkt 2",
    ),
    FunkcjaEaz(
        "Yo>",
        "Yo>",
        None,
        "ziemnozwarciowe admitancyjne",
        "ZABEZPIECZENIE",
        f"{_IR} II.4.5.4.2.1 pkt 2 (zabezpieczenie ziemnozwarciowe — kryterium wg sposobu "
        "pracy punktu neutralnego); numer IEEE C37.2 nie jest znormalizowany",
    ),
    FunkcjaEaz(
        "Go>",
        "Go>",
        None,
        "ziemnozwarciowe konduktancyjne",
        "ZABEZPIECZENIE",
        f"{_IR} II.4.5.4.1.4 pkt 3–4 (współczynniki czułości zabezpieczeń konduktancyjnych), "
        "II.4.5.4.2.1 pkt 2 (kryterium wg sposobu pracy punktu neutralnego); numer IEEE C37.2 "
        "nie jest znormalizowany",
    ),
    FunkcjaEaz(
        "32",
        "P>",
        "32",
        "kierunkowe mocy czynnej (od skutków mocy zwrotnej)",
        "ZABEZPIECZENIE",
        f"{_IR} II.4.5.5.4 (o wyposażeniu linii w zabezpieczenie od skutków mocy zwrotnej "
        "decyduje operator)",
    ),
    FunkcjaEaz(
        "27",
        "U<",
        "27",
        "podnapięciowe (przekładniki od strony linii)",
        "ZABEZPIECZENIE",
        f"{_Z1}, Z.11 s.90, Z.11.1 s.91; {_IR} II.4.5.4.2.2 pkt 6, II.4.5.4.2.3 pkt 5",
    ),
    FunkcjaEaz(
        "59",
        "U>",
        "59",
        "nadnapięciowe (przekładniki od strony linii)",
        "ZABEZPIECZENIE",
        f"{_Z1}, Z.11 s.90, Z.11.1 s.91, Z.16 s.96; {_IR} II.4.5.4.2.2 pkt 6, II.4.5.4.2.3 pkt 5",
    ),
    FunkcjaEaz(
        "59N",
        "U0>",
        "59N",
        "nadnapięciowe zerowe (napięcie 3U0 z otwartego trójkąta)",
        "ZABEZPIECZENIE",
        f"{_Z1}, Z.17 s.97 (Uo>)",
    ),
    FunkcjaEaz(
        "81U",
        "f<",
        "81U",
        "podczęstotliwościowe",
        "ZABEZPIECZENIE",
        f"{_Z1}, Z.11 s.90, Z.11.1 s.91, Z.17 s.97; {_IR} II.4.5.4.2.1 pkt 5, II.4.5.4.2.2 pkt 5",
    ),
    FunkcjaEaz(
        "81O",
        "f>",
        "81O",
        "nadczęstotliwościowe",
        "ZABEZPIECZENIE",
        f"{_Z1}, Z.11 s.90, Z.11.1 s.91; {_IR} II.4.5.4.2.2 pkt 5, II.4.5.4.2.3 pkt 4",
    ),
    FunkcjaEaz(
        "81R",
        "df/dt",
        "81R",
        "szybkość zmian częstotliwości (ROCOF)",
        "ZABEZPIECZENIE",
        f"{_Z1}, Z.11 s.90, Z.11.1 s.91, Z.17 s.97; {_IR} II.4.5.4.2.2 pkt 5, II.4.5.4.2.3 pkt 4",
    ),
    FunkcjaEaz(
        "78",
        "skok wektora",
        "78",
        "przesunięcie wektora napięcia (ochrona od pracy wyspowej)",
        "ZABEZPIECZENIE",
        "IEEE C37.2 (78); wymóg wyłącznie z warunków przyłączenia OSD",
    ),
    FunkcjaEaz(
        "ZS",
        "ZS",
        None,
        "współpraca z logicznym zabezpieczeniem szyn (sygnał blokowania ZS)",
        "ZABEZPIECZENIE",
        f"{_Z1}, Z.10 s.89, Z.11, Z.11.1, Z.7, Z.12–Z.16; {_IR} II.4.5.4.2.1 pkt 4, "
        "II.4.5.4.7.1 pkt 3–4",
    ),
    FunkcjaEaz(
        "50BF",
        "LRW",
        "50BF",
        "lokalna rezerwa wyłącznikowa",
        "ZABEZPIECZENIE",
        f"{_Z1}, Z.10 s.89, Z.11, Z.11.1, Z.7, Z.12–Z.16; {_IR} II.4.5.4.2.1 pkt 4, "
        "II.4.5.4.7.1 pkt 3–4",
    ),
    FunkcjaEaz(
        "79",
        "SPZ",
        "79",
        "samoczynne ponowne załączenie (wielokrotne, programowalne, z blokadą)",
        "AUTOMATYKA",
        f"{_Z1}, Z.10 s.89 (tSPZ), Z.11, Z.11.1, Z.15; {_IR} II.4.5.4.2.1 pkt 3, "
        "II.4.5.4.2.2 pkt 3",
    ),
    FunkcjaEaz(
        "SPZE",
        "SPZE",
        None,
        "samoczynne ponowne załączenie z czasem tE (rozwinięcia skrótu standard nie podaje)",
        "AUTOMATYKA",
        f"{_Z1}, Z.11 s.90, Z.11.1 s.91 (SPZE, tE)",
    ),
    FunkcjaEaz(
        # JEDNA funkcja pola: udział w automatyce SCO — wyłączenie od stopni SCO1, SCO2 i ponowne
        # załączenie po SCO (obwód okrężny „SCO/SPZ”). Rysunki s.89, s.90, s.91 nie mają osobnego
        # bloku „SPZ po SCO”: trzy obwody okrężne SCO1, SCO2, SCO/SPZ wchodzą do jednego
        # sterownika pola, a przekaźnik SCO stoi w polu pomiaru napięcia (Z.17 s.97, §26.10.6).
        # Dawny osobny kod „SPZ/SCO” powtarzał na schemacie SPZ (79) i SCO — dwie funkcje pod
        # trzema nazwami (decyzja architekta 2026-10-30, deduplikacja u źródła). Wymóg IRiESD
        # stopnia SPZ po SCO („jeśli ENEA Operator tego wymaga”, „w uzgodnieniu z ENEA Operator”)
        # niesie wymóg tej funkcji w macierzy klas (`bay_templates.WYMAGANIA_EAZ_KLASY_POLA`).
        "SCO",
        "SCO",
        None,
        "samoczynne częstotliwościowe odciążenie — wyłączenie od stopni SCO1, SCO2 i ponowne "
        "załączenie po SCO (SPZ po SCO)",
        "AUTOMATYKA",
        f"{_Z1}, Z.10 s.89, Z.11 s.90, Z.11.1 s.91 (obwody okrężne SCO1, SCO2, SCO/SPZ do "
        f"sterownika pola), Z.17 s.97, §26.10.6; {_IR} II.4.5.4.2.1 pkt 6 (SPZ/SCO — jeśli ENEA "
        "Operator tego wymaga), II.4.5.4.6.1 (sygnały SCO i SPZ/SCO z pola pomiaru napięcia), "
        "II.4.5.4.7.1 pkt 1–2 (SCO co najmniej dwustopniowe; SPZ/SCO w uzgodnieniu z ENEA "
        "Operator; w liniach z jednostkami wytwórczymi SCO nie należy uruchamiać)",
    ),
    FunkcjaEaz(
        "OWG",
        "OWG",
        None,
        "wyłączenie pól z generacją (od zabezpieczeń transformatora i przed SZR)",
        "AUTOMATYKA",
        f"{_Z1}, Z.11 i Z.11.1 („wył. od zab. TR”), §26.10.4; {_KS}, „Linia SN z generacją”",
    ),
    FunkcjaEaz(
        "NZ",
        "blokada NZ",
        None,
        "blokada załączenia przy napięciu w linii (napięcie zwrotne)",
        "BLOKADA",
        f"{_Z1}, §26.9.3, §26.10.3; {_IR} II.4.5.4.2.2 pkt 7, II.4.5.4.2.3 pkt 6; {_KS} "
        "(>NZ/blNZ — gdy zabezpieczenie nie realizuje kontroli synchronizmu)",
    ),
    FunkcjaEaz(
        "25",
        "synchrocheck",
        "25",
        "kontrola synchronizmu przy załączaniu",
        "BLOKADA",
        f"{_IR} II.4.5.4.2.2 pkt 7, II.4.5.4.2.3 pkt 6; {_KS} (>SYN/blSYN)",
    ),
    FunkcjaEaz(
        "87T",
        "różnicowe",
        "87T",
        "różnicowe transformatora",
        "ZABEZPIECZENIE",
        f"IEC 60255-187-1; {_Z1}, Z.7 s.86",
    ),
    FunkcjaEaz(
        "90",
        "ARN",
        "90",
        "automatyczna regulacja napięcia transformatora",
        "AUTOMATYKA",
        f"{_Z1}, Z.7 s.86",
    ),
    FunkcjaEaz(
        "ZAWSC",
        "ZAWSC",
        None,
        "automatyka wymuszania składowej czynnej prądu ziemnozwarciowego",
        "AUTOMATYKA",
        f"{_Z1}, Z.13 s.93, Z.14 s.94",
    ),
    FunkcjaEaz(
        "BT",
        "BT I / BT II",
        None,
        "zabezpieczenia technologiczne transformatora uziemiającego (dwa stopnie)",
        "TECHNOLOGICZNE",
        f"{_Z1}, Z.13 s.93, Z.14 s.94",
    ),
    FunkcjaEaz(
        "BD",
        "BD I / BD II",
        None,
        "zabezpieczenia technologiczne dławika gaszącego (dwa stopnie)",
        "TECHNOLOGICZNE",
        f"{_Z1}, Z.13 s.93, Z.14 s.94",
    ),
    FunkcjaEaz(
        # Kod = numer IEEE C37.2 (jak 51, 50, 67N): ten sam kod nosi zestaw funkcji pola baterii
        # kondensatorów (`bay_templates.FUNKCJE_EAZ_ROLI_BEZ_SZABLONU["BKR"]`).
        "60N",
        "Ir>",
        "60N",
        "od niezrównoważenia baterii kondensatorów (prąd między punktami gwiazd)",
        "ZABEZPIECZENIE",
        f"{_Z1}, Z.16 s.96",
    ),
    FunkcjaEaz(
        "SZR",
        "SZR",
        None,
        "samoczynne załączenie rezerwy (przekaźnik w polu łącznika szyn)",
        "AUTOMATYKA",
        f"{_Z1}, §13 (druk s.25), Z.7, Z.17; {_IR} II.4.5.4.7.2",
    ),
    FunkcjaEaz(
        "63",
        "Buchholz",
        "63",
        "gazowo-przepływowe transformatora",
        "TECHNOLOGICZNE",
        "IEEE C37.2 (63) — zabezpieczenie technologiczne transformatora olejowego "
        "(przekaźnik gazowo-przepływowy)",
    ),
    FunkcjaEaz(
        "26",
        "temperatura",
        "26",
        "temperaturowe transformatora",
        "TECHNOLOGICZNE",
        "IEEE C37.2 (26) — zabezpieczenie technologiczne transformatora",
    ),
    FunkcjaEaz(
        "63P",
        "ciśnienie",
        "63P",
        "od wzrostu ciśnienia w kadzi transformatora",
        "TECHNOLOGICZNE",
        "IEEE C37.2 (63) — zabezpieczenie technologiczne transformatora",
    ),
)

#: Słownik funkcji EAZ — kod → wpis (kolejność stała, jak w `_WPISY`).
FUNKCJE_EAZ: dict[str, FunkcjaEaz] = {w.kod: w for w in _WPISY}


def funkcja_eaz(kod: str) -> FunkcjaEaz:
    """Wpis słownika dla kodu. Kod spoza słownika = `KeyError` z nazwanym kodem."""
    try:
        return FUNKCJE_EAZ[kod]
    except KeyError:
        raise KeyError(f"Kod funkcji EAZ spoza słownika: {kod!r}") from None


def kody_spoza_slownika(kody: tuple[str, ...] | list[str]) -> list[str]:
    """Kody nieznane słownikowi (kolejność wejścia, bez powtórzeń)."""
    wynik: list[str] = []
    for kod in kody:
        if kod not in FUNKCJE_EAZ and kod not in wynik:
            wynik.append(kod)
    return wynik


def opis_funkcji_eaz_pl(kod: str) -> str:
    """Zdanie dla inżyniera: „I> (51) — nadprądowe zwłoczne"."""
    wpis = funkcja_eaz(kod)
    numer = f" ({wpis.ansi})" if wpis.ansi and wpis.ansi != wpis.oznaczenie_pl else ""
    return f"{wpis.oznaczenie_pl}{numer} — {wpis.nazwa_pl}"

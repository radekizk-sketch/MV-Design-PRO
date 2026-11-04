"""Słownik funkcji EAZ — JEDNO źródło kodów `ProtectionAssignment.funkcje` i szablonów pól.

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
from typing import Literal, get_args

__all__ = [
    "ETYKIETY_WARTOSCI_WYBORU",
    "FUNKCJE_EAZ",
    "KIERUNKI_DZIALANIA",
    "JEDNOSTKI_PROGU_PRADOWEGO",
    "KRZYWE_CZASOWE",
    "WEJSCIA_FUNKCJI",
    "ZESTAWY_FUNKCJI_RODZAJU",
    "FunkcjaEaz",
    "OcenaFunkcji",
    "RodzajFunkcjiEaz",
    "SchematNastawy",
    "TypNastawy",
    "WejscieFunkcji",
    "funkcja_eaz",
    "kody_spoza_slownika",
    "etykieta_funkcji_eaz",
    "opis_funkcji_eaz_pl",
]

RodzajFunkcjiEaz = Literal["ZABEZPIECZENIE", "AUTOMATYKA", "BLOKADA", "TECHNOLOGICZNE"]

_Z1 = "ENEA Operator, Stacje elektroenergetyczne 110 kV, Zeszyt 1"
_IR = "IRiESD ENEA Operator (wersja 2.3)"
_KS = "ENEA Operator, Katalog standardowych sygnałów telemechaniki obiektowej (2022)"


#: Wejście pomiarowe albo sygnałowe funkcji (karta OCHRONA-JEDNO-ZRODLO). Wiązanie wejść
#: z przekładnikami robi sterownik w modelu (`enm.models.WejsciaZabezpieczenia`); dostępność
#: wejścia sterownika rozstrzyga jedna reguła `enm.zabezpieczenie.wejscia_dostepne`.
#:  * ``I`` — prądy fazowe (przekładnik prądowy pola),
#:  * ``U`` — napięcia fazowe (przekładnik napięciowy),
#:  * ``3I0`` — prąd zerowy: układ Holmgreena (suma prądów fazowych przekładników pola) albo
#:    przekładnik Ferrantiego,
#:  * ``3U0`` — napięcie zerowe: uzwojenie otwartego trójkąta przekładnika napięciowego albo
#:    napięcie obliczone z napięć fazowych,
#:  * ``I_STRONY_2`` — prądy drugiej strony strefy różnicowej (87T, 87L),
#:  * ``SYGNAL`` — sygnał binarny z innego urządzenia (blokowanie ZS, pobudzenie SZR).
WejscieFunkcji = Literal["I", "U", "3I0", "3U0", "I_STRONY_2", "SYGNAL"]
WEJSCIA_FUNKCJI: tuple[str, ...] = get_args(WejscieFunkcji)

#: Typ wartości nastawy: liczba (z jednostką), wybór z listy albo wartość logiczna.
TypNastawy = Literal["LICZBA", "WYBOR", "LOGICZNA"]

#: Charakterystyki czasowo-prądowe stopni nadprądowych — kody wyboru nastawy ``krzywa``.
#: IEC 60255-151 (SI/VI/EI/LTI) i czas niezależny (DT) liczy rdzeń
#: ``protection_iec60255.compute_curve_trip_time``; IEEE C37.112 (MI/VI/EI) —
#: ``protection_iec60255.compute_ieee_c37112_generic``.
KRZYWE_CZASOWE: tuple[str, ...] = (
    "DT",
    "IEC_SI",
    "IEC_VI",
    "IEC_EI",
    "IEC_LTI",
    "IEEE_MI",
    "IEEE_VI",
    "IEEE_EI",
)
#: Strona przekładnika, po której podany jest próg prądowy (decyzja właściciela PZ-09).
JEDNOSTKI_PROGU_PRADOWEGO: tuple[str, ...] = ("A_WTORNY", "A_PIERWOTNY")
#: Kierunek działania funkcji kierunkowej (67, 67N) względem pola.
KIERUNKI_DZIALANIA: tuple[str, ...] = ("DO_LINII", "DO_SZYN")

#: Etykieta KAŻDEJ wartości wyboru nastaw (krzywe, strona progu, kierunek) — jedno źródło dla
#: oceny (komunikaty, ślad), karty pola i edytora nastaw (lustro `slownikFunkcjiEaz.json`).
ETYKIETY_WARTOSCI_WYBORU: dict[str, str] = {
    "DT": "czas niezależny (DT)",
    "IEC_SI": "IEC normalnie odwrotna (SI)",
    "IEC_VI": "IEC bardzo odwrotna (VI)",
    "IEC_EI": "IEC skrajnie odwrotna (EI)",
    "IEC_LTI": "IEC odwrotna długoczasowa (LTI, 120)",
    "IEEE_MI": "IEEE umiarkowanie odwrotna (MI)",
    "IEEE_VI": "IEEE bardzo odwrotna (VI)",
    "IEEE_EI": "IEEE skrajnie odwrotna (EI)",
    "A_WTORNY": "A po stronie wtórnej przekładnika",
    "A_PIERWOTNY": "A po stronie pierwotnej przekładnika",
    "DO_LINII": "w stronę linii",
    "DO_SZYN": "w stronę szyn",
}

#: Identyfikator ewaluatora funkcji w warstwie analiz. ``NADPRADOWA_IEC_60255`` — ocena
#: i czas zadziałania z rdzenia IEC 60255 (`application.analyses.protection.ocena_nadpradowa`);
#: ``LOM`` — ocena ochrony od pracy wyspowej (`application.analyses.ochrona_lom`). Funkcja bez
#: ewaluatora (``None``) ma w każdej ocenie status NIE_OCENIONO z wyjaśnieniem.
OcenaFunkcji = Literal["NADPRADOWA_IEC_60255", "LOM"]


@dataclass(frozen=True)
class SchematNastawy:
    """Jedna nastawa funkcji: klucz, nazwa, typ, jednostka i dopuszczalne wartości.

    Zakres i krok nastawy są cechą URZĄDZENIA (pozycja katalogu), nie funkcji — schemat
    niesie wyłącznie to, co wynika z definicji funkcji: typ, jednostkę, listę wyboru
    i warunek dodatniości wielkości fizycznej.
    """

    klucz: str
    nazwa_pl: str
    typ: TypNastawy
    jednostka: str | None = None
    wartosci: tuple[str, ...] = ()
    dodatnia: bool = False


@dataclass(frozen=True)
class FunkcjaEaz:
    """Funkcja EAZ pola: kod, zapis z rysunku standardu, numer IEEE C37.2, nazwa i podstawa,
    a od karty OCHRONA-JEDNO-ZRODLO także SCHEMAT: wymagane i opcjonalne wejścia, nastawy
    i ewaluator. Dodanie funkcji do produktu = jeden wpis tej klasy (model, operacje, API,
    karta pola i schemat czytają rejestr)."""

    kod: str
    oznaczenie_pl: str
    ansi: str | None
    nazwa_pl: str
    rodzaj: RodzajFunkcjiEaz
    podstawa: str
    wejscia_wymagane: tuple[WejscieFunkcji, ...] = ()
    wejscia_opcjonalne: tuple[WejscieFunkcji, ...] = ()
    nastawy: tuple[SchematNastawy, ...] = ()
    ocena: OcenaFunkcji | None = None

    def schemat_nastawy(self, klucz: str) -> SchematNastawy | None:
        """Schemat nastawy po kluczu (``None`` — klucz spoza schematu funkcji)."""
        return next((n for n in self.nastawy if n.klucz == klucz), None)


def _liczba(klucz: str, nazwa_pl: str, jednostka: str, *, dodatnia: bool = True) -> SchematNastawy:
    return SchematNastawy(klucz, nazwa_pl, "LICZBA", jednostka, dodatnia=dodatnia)


def _wybor(klucz: str, nazwa_pl: str, wartosci: tuple[str, ...]) -> SchematNastawy:
    return SchematNastawy(klucz, nazwa_pl, "WYBOR", None, wartosci)


_ZWLOKA = _liczba("zwloka_s", "zwłoka", "s")
#: Stopień nadprądowy (fazowy albo zerowy): próg z jawną stroną przekładnika, charakterystyka,
#: zwłoka (czas niezależny) albo mnożnik czasowy (charakterystyka zależna).
_NASTAWY_STOPNIA_PRADOWEGO: tuple[SchematNastawy, ...] = (
    _liczba("prog", "próg rozruchowy", "A"),
    _wybor("jednostka_progu", "strona przekładnika progu", JEDNOSTKI_PROGU_PRADOWEGO),
    _wybor("krzywa", "charakterystyka czasowa", KRZYWE_CZASOWE),
    _liczba("tms", "mnożnik czasowy", "1"),
    _ZWLOKA,
)
_NASTAWY_KIERUNKU: tuple[SchematNastawy, ...] = (
    _wybor("kierunek", "kierunek działania", KIERUNKI_DZIALANIA),
    _liczba("kat_charakterystyczny_deg", "kąt charakterystyczny", "°", dodatnia=False),
)
_NASTAWY_NAPIECIOWE: tuple[SchematNastawy, ...] = (
    _liczba("prog_proc_un", "próg napięciowy", "% Un"),
    _ZWLOKA,
)
_NASTAWY_CZESTOTLIWOSCI: tuple[SchematNastawy, ...] = (_liczba("prog_hz", "próg", "Hz"), _ZWLOKA)
_TYLKO_ZWLOKA: tuple[SchematNastawy, ...] = (_ZWLOKA,)


_WPISY: tuple[FunkcjaEaz, ...] = (
    FunkcjaEaz(
        "51",
        "I>",
        "51",
        "nadprądowe zwłoczne",
        "ZABEZPIECZENIE",
        f"IEC 60255-151; {_Z1}, Z.10 s.89, Z.11 s.90, Z.11.1 s.91; {_IR} II.4.5.4.2.1 pkt 1",
        wejscia_wymagane=("I",),
        wejscia_opcjonalne=(),
        nastawy=_NASTAWY_STOPNIA_PRADOWEGO,
        ocena="NADPRADOWA_IEC_60255",
    ),
    FunkcjaEaz(
        "50",
        "I>>",
        "50",
        "nadprądowe zwarciowe (bezzwłoczne)",
        "ZABEZPIECZENIE",
        f"IEC 60255-151; {_Z1}, Z.10 s.89, Z.11 s.90, Z.11.1 s.91; {_IR} II.4.5.4.2.1 pkt 1",
        wejscia_wymagane=("I",),
        wejscia_opcjonalne=(),
        nastawy=_NASTAWY_STOPNIA_PRADOWEGO,
        ocena="NADPRADOWA_IEC_60255",
    ),
    FunkcjaEaz(
        "67",
        "I> kierunkowe",
        "67",
        "nadprądowe kierunkowe (blokada kierunkowa — przepływ mocy w stronę szyn)",
        "ZABEZPIECZENIE",
        f"{_Z1}, Z.11 s.90 i Z.11.1 s.91 („ZS (kierunkowe I>)”); "
        f"{_IR} II.4.5.4.2.2 pkt 1 i pkt 8, II.4.5.4.2.3 pkt 1",
        wejscia_wymagane=("I", "U"),
        wejscia_opcjonalne=(),
        nastawy=_NASTAWY_STOPNIA_PRADOWEGO + _NASTAWY_KIERUNKU,
        ocena=None,
    ),
    FunkcjaEaz(
        "51N",
        "Io>",
        "51N",
        "ziemnozwarciowe zwłoczne (prąd zerowy)",
        "ZABEZPIECZENIE",
        f"IEC 60255-151; {_Z1}, Z.13–Z.15 (Io>); {_IR} II.4.5.4.2.1 pkt 2",
        wejscia_wymagane=("3I0",),
        wejscia_opcjonalne=(),
        nastawy=_NASTAWY_STOPNIA_PRADOWEGO,
        ocena=None,
    ),
    FunkcjaEaz(
        "50N",
        "Io>>",
        "50N",
        "ziemnozwarciowe bezzwłoczne (prąd zerowy)",
        "ZABEZPIECZENIE",
        f"IEC 60255-151; {_Z1}, Z.13–Z.15 (Io>>)",
        wejscia_wymagane=("3I0",),
        wejscia_opcjonalne=(),
        nastawy=_NASTAWY_STOPNIA_PRADOWEGO,
        ocena=None,
    ),
    FunkcjaEaz(
        "67N",
        "Io> kierunkowe",
        "67N",
        "ziemnozwarciowe kierunkowe (wejścia Io i U0)",
        "ZABEZPIECZENIE",
        f"{_Z1}, Z.10 s.89 (zabezpieczenie ziemnozwarciowe, wejścia Io i U0), Z.11, Z.11.1; "
        f"{_IR} II.4.5.4.2.1 pkt 2, II.4.5.4.2.2 pkt 2, II.4.5.4.2.3 pkt 2",
        wejscia_wymagane=("3I0", "3U0"),
        wejscia_opcjonalne=(),
        nastawy=_NASTAWY_STOPNIA_PRADOWEGO + _NASTAWY_KIERUNKU,
        ocena=None,
    ),
    FunkcjaEaz(
        "Yo>",
        "Yo>",
        None,
        "ziemnozwarciowe admitancyjne",
        "ZABEZPIECZENIE",
        f"{_IR} II.4.5.4.2.1 pkt 2 (zabezpieczenie ziemnozwarciowe — kryterium wg sposobu "
        "pracy punktu neutralnego); numer IEEE C37.2 nie jest znormalizowany",
        wejscia_wymagane=("3I0", "3U0"),
        wejscia_opcjonalne=(),
        nastawy=(
            _liczba("prog_y0_ms", "próg admitancji zerowej", "mS"),
            _liczba("prog_u0_proc", "próg rozruchowy napięcia zerowego", "% U0n"),
            _ZWLOKA,
        ),
        ocena=None,
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
        wejscia_wymagane=("3I0", "3U0"),
        wejscia_opcjonalne=(),
        nastawy=(
            _liczba("prog_g0_ms", "próg konduktancji zerowej", "mS"),
            _liczba("prog_u0_proc", "próg rozruchowy napięcia zerowego", "% U0n"),
            _ZWLOKA,
        ),
        ocena=None,
    ),
    FunkcjaEaz(
        "32",
        "P>",
        "32",
        "kierunkowe mocy czynnej (od skutków mocy zwrotnej)",
        "ZABEZPIECZENIE",
        f"{_IR} II.4.5.5.4 (o wyposażeniu linii w zabezpieczenie od skutków mocy zwrotnej "
        "decyduje operator)",
        wejscia_wymagane=("I", "U"),
        wejscia_opcjonalne=(),
        nastawy=(_liczba("prog_proc_sn", "próg mocy zwrotnej", "% Sn"), _ZWLOKA),
        ocena=None,
    ),
    FunkcjaEaz(
        "27",
        "U<",
        "27",
        "podnapięciowe (przekładniki od strony linii)",
        "ZABEZPIECZENIE",
        f"{_Z1}, Z.11 s.90, Z.11.1 s.91; {_IR} II.4.5.4.2.2 pkt 6, II.4.5.4.2.3 pkt 5",
        wejscia_wymagane=("U",),
        wejscia_opcjonalne=(),
        nastawy=_NASTAWY_NAPIECIOWE,
        ocena=None,
    ),
    FunkcjaEaz(
        "59",
        "U>",
        "59",
        "nadnapięciowe (przekładniki od strony linii)",
        "ZABEZPIECZENIE",
        f"{_Z1}, Z.11 s.90, Z.11.1 s.91, Z.16 s.96; {_IR} II.4.5.4.2.2 pkt 6, II.4.5.4.2.3 pkt 5",
        wejscia_wymagane=("U",),
        wejscia_opcjonalne=(),
        nastawy=_NASTAWY_NAPIECIOWE,
        ocena=None,
    ),
    FunkcjaEaz(
        "59N",
        "U0>",
        "59N",
        "nadnapięciowe zerowe (napięcie 3U0 z otwartego trójkąta)",
        "ZABEZPIECZENIE",
        f"{_Z1}, Z.17 s.97 (Uo>)",
        wejscia_wymagane=("3U0",),
        wejscia_opcjonalne=(),
        nastawy=(_liczba("prog_u0_proc", "próg napięcia zerowego", "% U0n"), _ZWLOKA),
        ocena=None,
    ),
    FunkcjaEaz(
        "81U",
        "f<",
        "81U",
        "podczęstotliwościowe",
        "ZABEZPIECZENIE",
        f"{_Z1}, Z.11 s.90, Z.11.1 s.91, Z.17 s.97; {_IR} II.4.5.4.2.1 pkt 5, II.4.5.4.2.2 pkt 5",
        wejscia_wymagane=("U",),
        wejscia_opcjonalne=(),
        nastawy=_NASTAWY_CZESTOTLIWOSCI,
        ocena="LOM",
    ),
    FunkcjaEaz(
        "81O",
        "f>",
        "81O",
        "nadczęstotliwościowe",
        "ZABEZPIECZENIE",
        f"{_Z1}, Z.11 s.90, Z.11.1 s.91; {_IR} II.4.5.4.2.2 pkt 5, II.4.5.4.2.3 pkt 4",
        wejscia_wymagane=("U",),
        wejscia_opcjonalne=(),
        nastawy=_NASTAWY_CZESTOTLIWOSCI,
        ocena="LOM",
    ),
    FunkcjaEaz(
        "81R",
        "df/dt",
        "81R",
        "szybkość zmian częstotliwości (ROCOF)",
        "ZABEZPIECZENIE",
        f"{_Z1}, Z.11 s.90, Z.11.1 s.91, Z.17 s.97; {_IR} II.4.5.4.2.2 pkt 5, II.4.5.4.2.3 pkt 4",
        wejscia_wymagane=("U",),
        wejscia_opcjonalne=(),
        nastawy=(_liczba("prog_hz_s", "próg szybkości zmian częstotliwości", "Hz/s"), _ZWLOKA),
        ocena="LOM",
    ),
    FunkcjaEaz(
        "78",
        "skok wektora",
        "78",
        "przesunięcie wektora napięcia (ochrona od pracy wyspowej)",
        "ZABEZPIECZENIE",
        "IEEE C37.2 (78); wymóg wyłącznie z warunków przyłączenia OSD",
        wejscia_wymagane=("U",),
        wejscia_opcjonalne=(),
        nastawy=(_liczba("prog_deg", "próg przesunięcia wektora", "°"), _ZWLOKA),
        ocena="LOM",
    ),
    FunkcjaEaz(
        "ZS",
        "ZS",
        None,
        "współpraca z logicznym zabezpieczeniem szyn (sygnał blokowania ZS)",
        "ZABEZPIECZENIE",
        f"{_Z1}, Z.10 s.89, Z.11, Z.11.1, Z.7, Z.12–Z.16; {_IR} II.4.5.4.2.1 pkt 4, "
        "II.4.5.4.7.1 pkt 3–4",
        wejscia_wymagane=("I", "SYGNAL"),
        wejscia_opcjonalne=(),
        nastawy=(_liczba("zwloka_blokowania_s", "czas oczekiwania na sygnał blokowania", "s"),),
        ocena=None,
    ),
    FunkcjaEaz(
        "50BF",
        "LRW",
        "50BF",
        "lokalna rezerwa wyłącznikowa",
        "ZABEZPIECZENIE",
        f"{_Z1}, Z.10 s.89, Z.11, Z.11.1, Z.7, Z.12–Z.16; {_IR} II.4.5.4.2.1 pkt 4, "
        "II.4.5.4.7.1 pkt 3–4",
        wejscia_wymagane=("I",),
        wejscia_opcjonalne=(),
        nastawy=(_liczba("prog_pradu_proc_in", "próg kontroli prądu", "% In"), _ZWLOKA),
        ocena=None,
    ),
    FunkcjaEaz(
        "79",
        "SPZ",
        "79",
        "samoczynne ponowne załączenie (wielokrotne, programowalne, z blokadą)",
        "AUTOMATYKA",
        f"{_Z1}, Z.10 s.89 (tSPZ), Z.11, Z.11.1, Z.15; {_IR} II.4.5.4.2.1 pkt 3, "
        "II.4.5.4.2.2 pkt 3",
        wejscia_wymagane=(),
        wejscia_opcjonalne=(),
        nastawy=(
            _liczba("liczba_cykli", "liczba cykli", "1"),
            _liczba("t_przerwy_1_s", "czas przerwy cyklu 1", "s"),
            _liczba("t_przerwy_2_s", "czas przerwy cyklu 2", "s"),
            _liczba("t_przerwy_3_s", "czas przerwy cyklu 3", "s"),
            _liczba("t_przerwy_4_s", "czas przerwy cyklu 4", "s"),
            _liczba("t_blokady_s", "czas blokady po załączeniu", "s"),
        ),
        ocena=None,
    ),
    FunkcjaEaz(
        "SPZE",
        "SPZE",
        None,
        "samoczynne ponowne załączenie z czasem tE (rozwinięcia skrótu standard nie podaje)",
        "AUTOMATYKA",
        f"{_Z1}, Z.11 s.90, Z.11.1 s.91 (SPZE, tE)",
        wejscia_wymagane=(),
        wejscia_opcjonalne=(),
        nastawy=(_liczba("t_e_s", "czas tE", "s"),),
        ocena=None,
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
        # Sterownik pola dostaje SCO SYGNAŁAMI z przekaźnika SCO pola pomiaru napięcia (obwody
        # okrężne SCO1, SCO2, SCO/SPZ — rysunki s.89–s.91, IRiESD II.4.5.4.6.1); częstotliwość
        # mierzy tamten przekaźnik, nie przekładnik napięciowy pola liniowego.
        wejscia_wymagane=("SYGNAL",),
        wejscia_opcjonalne=(),
        nastawy=(
            _liczba("prog_hz_sco1", "próg stopnia SCO1", "Hz"),
            _liczba("prog_hz_sco2", "próg stopnia SCO2", "Hz"),
            _ZWLOKA,
        ),
        ocena=None,
    ),
    FunkcjaEaz(
        "OWG",
        "OWG",
        None,
        "wyłączenie pól z generacją (od zabezpieczeń transformatora i przed SZR)",
        "AUTOMATYKA",
        f"{_Z1}, Z.11 i Z.11.1 („wył. od zab. TR”), §26.10.4; {_KS}, „Linia SN z generacją”",
        wejscia_wymagane=("SYGNAL",),
        wejscia_opcjonalne=(),
        nastawy=_TYLKO_ZWLOKA,
        ocena=None,
    ),
    FunkcjaEaz(
        "NZ",
        "blokada NZ",
        None,
        "blokada załączenia przy napięciu w linii (napięcie zwrotne)",
        "BLOKADA",
        f"{_Z1}, §26.9.3, §26.10.3; {_IR} II.4.5.4.2.2 pkt 7, II.4.5.4.2.3 pkt 6; {_KS} "
        "(>NZ/blNZ — gdy zabezpieczenie nie realizuje kontroli synchronizmu)",
        wejscia_wymagane=("U",),
        wejscia_opcjonalne=(),
        nastawy=(_liczba("prog_proc_un", "próg napięcia w linii", "% Un"),),
        ocena=None,
    ),
    FunkcjaEaz(
        "25",
        "synchrocheck",
        "25",
        "kontrola synchronizmu przy załączaniu",
        "BLOKADA",
        f"{_IR} II.4.5.4.2.2 pkt 7, II.4.5.4.2.3 pkt 6; {_KS} (>SYN/blSYN)",
        wejscia_wymagane=("U",),
        wejscia_opcjonalne=(),
        nastawy=(
            _liczba("du_proc_un", "dopuszczalna różnica napięć", "% Un"),
            _liczba("df_hz", "dopuszczalna różnica częstotliwości", "Hz"),
            _liczba("dfi_deg", "dopuszczalna różnica kątów", "°"),
        ),
        ocena=None,
    ),
    FunkcjaEaz(
        "87T",
        "różnicowe",
        "87T",
        "różnicowe transformatora",
        "ZABEZPIECZENIE",
        f"IEC 60255-187-1; {_Z1}, Z.7 s.86",
        wejscia_wymagane=("I", "I_STRONY_2"),
        wejscia_opcjonalne=(),
        nastawy=(
            _liczba("prog_roznicowy_proc_in", "próg różnicowy", "% In"),
            _liczba("stabilizacja_proc", "współczynnik stabilizacji", "%"),
            _liczba("blokada_2h_proc", "blokada drugą harmoniczną", "%"),
        ),
        ocena=None,
    ),
    FunkcjaEaz(
        "87L",
        "różnicowe linii",
        "87L",
        "różnicowe linii (porównanie prądów obu końców łączem)",
        "ZABEZPIECZENIE",
        "IEC 60255-187-1 (różnicowe linii); IEEE C37.2 (87L)",
        wejscia_wymagane=("I", "I_STRONY_2"),
        wejscia_opcjonalne=(),
        nastawy=(
            _liczba("prog_roznicowy_proc_in", "próg różnicowy", "% In"),
            _liczba("stabilizacja_proc", "współczynnik stabilizacji", "%"),
        ),
        ocena=None,
    ),
    FunkcjaEaz(
        "21",
        "Z<",
        "21",
        "odległościowe (impedancyjne, strefy Z1–Z3)",
        "ZABEZPIECZENIE",
        "IEC 60255-121; IEEE C37.2 (21)",
        wejscia_wymagane=("I", "U"),
        wejscia_opcjonalne=("3I0",),
        nastawy=(
            _liczba("z1_ohm", "zasięg strefy Z1 (strona pierwotna)", "Ω"),
            _liczba("z1_zwloka_s", "zwłoka strefy Z1", "s", dodatnia=False),
            _liczba("z2_ohm", "zasięg strefy Z2 (strona pierwotna)", "Ω"),
            _liczba("z2_zwloka_s", "zwłoka strefy Z2", "s"),
            _liczba("z3_ohm", "zasięg strefy Z3 (strona pierwotna)", "Ω"),
            _liczba("z3_zwloka_s", "zwłoka strefy Z3", "s"),
            _liczba("kat_linii_deg", "kąt impedancji linii", "°"),
        ),
        ocena=None,
    ),
    FunkcjaEaz(
        "46",
        "I2>",
        "46",
        "od asymetrii prądów (składowa przeciwna)",
        "ZABEZPIECZENIE",
        "IEC 60255-151 (stopień składowej przeciwnej); IEEE C37.2 (46)",
        wejscia_wymagane=("I",),
        wejscia_opcjonalne=(),
        nastawy=(_liczba("prog_i2_proc_in", "próg składowej przeciwnej", "% In"), _ZWLOKA),
        ocena=None,
    ),
    FunkcjaEaz(
        "49",
        "θ>",
        "49",
        "przeciążeniowe cieplne (model cieplny)",
        "ZABEZPIECZENIE",
        "IEC 60255-149; IEEE C37.2 (49)",
        wejscia_wymagane=("I",),
        wejscia_opcjonalne=(),
        nastawy=(
            _liczba("prad_dopuszczalny_proc_in", "prąd dopuszczalny długotrwale", "% In"),
            _liczba("stala_czasowa_min", "stała czasowa nagrzewania", "min"),
            _liczba("prog_alarmu_proc", "próg alarmu cieplnego", "%"),
        ),
        ocena=None,
    ),
    FunkcjaEaz(
        "90",
        "ARN",
        "90",
        "automatyczna regulacja napięcia transformatora",
        "AUTOMATYKA",
        f"{_Z1}, Z.7 s.86",
        wejscia_wymagane=("U",),
        wejscia_opcjonalne=(),
        nastawy=(
            _liczba("napiecie_zadane_proc_un", "napięcie zadane", "% Un"),
            _liczba("strefa_nieczulosci_proc", "strefa nieczułości", "%"),
            _ZWLOKA,
        ),
        ocena=None,
    ),
    FunkcjaEaz(
        "ZAWSC",
        "ZAWSC",
        None,
        "automatyka wymuszania składowej czynnej prądu ziemnozwarciowego",
        "AUTOMATYKA",
        f"{_Z1}, Z.13 s.93, Z.14 s.94",
        wejscia_wymagane=("3U0",),
        wejscia_opcjonalne=(),
        nastawy=(_liczba("prog_u0_proc", "próg napięcia zerowego", "% U0n"), _ZWLOKA),
        ocena=None,
    ),
    FunkcjaEaz(
        "BT",
        "BT I / BT II",
        None,
        "zabezpieczenia technologiczne transformatora uziemiającego (dwa stopnie)",
        "TECHNOLOGICZNE",
        f"{_Z1}, Z.13 s.93, Z.14 s.94",
        wejscia_wymagane=("SYGNAL",),
        wejscia_opcjonalne=(),
        nastawy=_TYLKO_ZWLOKA,
        ocena=None,
    ),
    FunkcjaEaz(
        "BD",
        "BD I / BD II",
        None,
        "zabezpieczenia technologiczne dławika gaszącego (dwa stopnie)",
        "TECHNOLOGICZNE",
        f"{_Z1}, Z.13 s.93, Z.14 s.94",
        wejscia_wymagane=("SYGNAL",),
        wejscia_opcjonalne=(),
        nastawy=_TYLKO_ZWLOKA,
        ocena=None,
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
        wejscia_wymagane=("I",),
        wejscia_opcjonalne=(),
        nastawy=(
            _liczba("prog", "próg prądu niezrównoważenia", "A"),
            _wybor("jednostka_progu", "strona przekładnika progu", JEDNOSTKI_PROGU_PRADOWEGO),
            _ZWLOKA,
        ),
        ocena=None,
    ),
    FunkcjaEaz(
        "SZR",
        "SZR",
        None,
        "samoczynne załączenie rezerwy (przekaźnik w polu łącznika szyn)",
        "AUTOMATYKA",
        f"{_Z1}, §13 (druk s.25), Z.7, Z.17; {_IR} II.4.5.4.7.2",
        wejscia_wymagane=("U", "SYGNAL"),
        wejscia_opcjonalne=(),
        nastawy=(_liczba("prog_zaniku_proc_un", "próg zaniku napięcia", "% Un"), _ZWLOKA),
        ocena=None,
    ),
    FunkcjaEaz(
        "63",
        "Buchholz",
        "63",
        "gazowo-przepływowe transformatora",
        "TECHNOLOGICZNE",
        "IEEE C37.2 (63) — zabezpieczenie technologiczne transformatora olejowego "
        "(przekaźnik gazowo-przepływowy)",
        wejscia_wymagane=("SYGNAL",),
        wejscia_opcjonalne=(),
        nastawy=(),
        ocena=None,
    ),
    FunkcjaEaz(
        "26",
        "temperatura",
        "26",
        "temperaturowe transformatora",
        "TECHNOLOGICZNE",
        "IEEE C37.2 (26) — zabezpieczenie technologiczne transformatora",
        wejscia_wymagane=("SYGNAL",),
        wejscia_opcjonalne=(),
        nastawy=(),
        ocena=None,
    ),
    FunkcjaEaz(
        "63P",
        "ciśnienie",
        "63P",
        "od wzrostu ciśnienia w kadzi transformatora",
        "TECHNOLOGICZNE",
        "IEEE C37.2 (63) — zabezpieczenie technologiczne transformatora",
        wejscia_wymagane=("SYGNAL",),
        wejscia_opcjonalne=(),
        nastawy=(),
        ocena=None,
    ),
)

#: Słownik funkcji EAZ — kod → wpis (kolejność stała, jak w `_WPISY`).
FUNKCJE_EAZ: dict[str, FunkcjaEaz] = {w.kod: w for w in _WPISY}


#: Typowe zestawy funkcji sterownika wg rodzaju zabezpieczenia — podpowiedź kreatora
#: przekaźnika (``add_relay.relay_type``); projektant zmienia zestaw w karcie pola. Jedno
#: źródło dla backendu i lustra UI (`slownikFunkcjiEaz.json`). ``NIESTANDARDOWY`` — zestaw
#: wskazuje projektant (lista ``funkcje`` operacji).
ZESTAWY_FUNKCJI_RODZAJU: dict[str, tuple[str, ...]] = {
    "NADPRADOWY": ("50", "51"),
    "ZIEMNOZWARCIOWY": ("50N", "51N"),
    "KIERUNKOWY_NADPRADOWY": ("67", "67N"),
    "ODLEGLOSCIOWY": ("21",),
    "ROZNICOWY_TRANSFORMATORA": ("87T",),
    "ROZNICOWY_LINII": ("87L",),
    "NIESTANDARDOWY": (),
}


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


def etykieta_funkcji_eaz(kod: object) -> str:
    """Etykieta funkcji dla projektanta: zapis z rysunku i kod w nawiasie — „I> (51)".

    JEDNA etykieta funkcji w produkcie (ocena, raport koordynacji, komunikaty nastaw). Kod
    spoza rejestru jest nazwany wprost, nie zgadywany."""
    wpis = FUNKCJE_EAZ.get(str(kod))
    if wpis is None:
        return f"funkcja spoza rejestru ({kod})"
    if wpis.oznaczenie_pl == wpis.kod:
        return wpis.kod
    return f"{wpis.oznaczenie_pl} ({wpis.kod})"


def opis_funkcji_eaz_pl(kod: str) -> str:
    """Zdanie dla inżyniera: „I> (51) — nadprądowe zwłoczne"."""
    wpis = funkcja_eaz(kod)
    numer = f" ({wpis.ansi})" if wpis.ansi and wpis.ansi != wpis.oznaczenie_pl else ""
    return f"{wpis.oznaczenie_pl}{numer} — {wpis.nazwa_pl}"

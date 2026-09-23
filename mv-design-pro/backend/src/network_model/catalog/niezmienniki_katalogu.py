"""Niezmienniki katalogu — MOC reguly nazwana w JEDNYM rejestrze.

DWA PYTANIA, DWA MODULY. `catalog/governance.py::wymagalnosc_katalogu(rodzaj)`
odpowiada „CZY element sieci wymaga referencji katalogowej" (brama wiazania
elementu). TEN modul odpowiada na zupelnie inne pytanie: „CZY rekord katalogu
jest DOPUSZCZALNY (twarda bramka), a jesli jest, to czy jest WIARYGODNY
(sygnal do przegladu)". Moduly nie importuja sie wzajemnie — dwie bramki o
roznych dziedzinach, ktore zlaczone w jeden plik zaczelyby udawac jedna regule.

PO CO REJESTR MOCY. Przed ta karta katalog mial 33 twarde bramki rekordu
(22 w `types.py`, 7 w `audit2_catalogs.py`, 2 + 2 w tablicach nN) i ZADNA z nich
nie mowila, na czym stoi: czy lamanie reguly opisuje obiekt, ktory nie moze
istniec, czy tylko rekord nietypowy dla zbioru, ktory akurat mamy. Reguła, ktora
dzis przechodzi na wszystkich rekordach, nie jest przez to prawem fizyki —
odrzucilaby pierwszy poprawny rekord spoza dotychczasowego zbioru. Rejestr
`REGULY_KATALOGU` nazywa kazda z nich: kod stabilny, klasa mocy, podstawa
(norma albo zakres produktu) i uzasadnienie.

EGZEKWOWANIE WYPROWADZONE Z REJESTRU. Kazda twarda bramka rekordu katalogu
przechodzi przez `odmowa_twarda(kod, komunikat)`, ktora sprawdza, ze kod
ISTNIEJE w rejestrze i ma klase twarda. Deklaracja „kazda twarda regula katalogu
jest nazwana" nie jest zdaniem w docstringu — pilnuje jej guard AST
(`scripts/niezmienniki_katalogu_guard.py`) i test rownosci zbiorow kodow
(`tests/network_model/catalog/test_niezmienniki_obie_strony.py`).

POMIAR NA TYM DRZEWIE (2026-09-17, przed zmiana). Szesc regul, ktore niezalezny
przeglad wskazal jako ZA MOCNE (R0>=R1, P0<Pk, Icw<=Icu SN i nN, 0<R/X<1,
0<i0%<10), NIE BYLO u nas twardymi bramkami — nie ma wiec defektu falszywego
odrzucania do naprawienia. Wchodza tu jako reguly klasy `WIARYGODNOSC`: liczone,
raportowane i pokazywane projektantowi jako „pozycje do przegladu", nigdy jako
odmowa. Dlatego rejestr nie ma dzis ani jednego wpisu klasy `REGULA_ZA_MOCNA` —
klasa istnieje (historia przeklasyfikowania musi miec gdzie mieszkac) i jej
kontrakt jest sprawdzany testem na rekordzie syntetycznym, ale zadna NASZA
regula nie zostala zdegradowana, bo zadna nie byla egzekwowana za mocno.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from enum import StrEnum
from typing import Any, NoReturn


class KlasaNiezmiennika(StrEnum):
    """Moc reguly — rozstrzyga, czy zlamanie jest odmowa, czy ostrzezeniem."""

    KONIECZNOSC_FIZYCZNA = "KONIECZNOSC_FIZYCZNA"
    """Zlamanie opisuje wielkosc, ktora nie moze istniec (moc ujemna, zbior pusty)."""

    WYMOG_NORMOWY = "WYMOG_NORMOWY"
    """Relacja ZDEFINIOWANA w normie — `podstawa` nazywa norme i jej miejsce."""

    OGRANICZENIE_ZAKRESU_PRODUKTU = "OGRANICZENIE_ZAKRESU_PRODUKTU"
    """Granica dziedziny MV-DESIGN-PRO — poza nia produkt nie deklaruje wyniku."""

    WIARYGODNOSC = "WIARYGODNOSC"
    """Straznik prawdopodobienstwa danej: sygnal „do przegladu”, nigdy odmowa."""

    REGULA_ZA_MOCNA = "REGULA_ZA_MOCNA"
    """Regula egzekwowana MOCNIEJ, niz ma podstawe — klasa HISTORYCZNA.

    Opisuje ustalenie przegladu, nie biezaca moc reguly, wiec kazdy wpis z ta
    klasa MUSI niesc `klasa_docelowa` (moc, ktora regula ma OD TERAZ). Bez tego
    regula nie mialaby zadnej mocy, a to nie jest to samo co „ma mniejsza moc".
    """

    NIESKLASYFIKOWANA = "NIESKLASYFIKOWANA"
    """Regula BEZ decyzji o podstawie — egzekwowana twardo, ale NIE NAZWANA.

    Rozdziela MOC od TWIERDZENIA. Twarde egzekwowanie jest bezpiecznym domyslnym
    wyborem dla nowej bramki; nazwanie jej „konieczoscia fizyczna" jest zdaniem o
    swiecie, ktorego domyslnie postawic nie wolno. Regula, ktora ma byc nazwana
    koniecznoscia fizyczna, trafia do rejestru z uzasadnieniem.
    """


#: Klasy, ktorych zlamanie jest TWARDA odmowa. Zbior wymieniony JAWNIE, nie
#: liczony jako dopelnienie: dopelnienie wciagnieloby kazda nowa klase na strone
#: „odmawiaj", czyli w strone, ktorej nikt nie zadeklarowal.
KLASY_TWARDE: frozenset[KlasaNiezmiennika] = frozenset(
    {
        KlasaNiezmiennika.KONIECZNOSC_FIZYCZNA,
        KlasaNiezmiennika.WYMOG_NORMOWY,
        KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        KlasaNiezmiennika.NIESKLASYFIKOWANA,
    }
)

#: Klasy, ktorych zlamanie jest WYLACZNIE sygnalem do przegladu. Suma z
#: `KLASY_TWARDE` musi pokrywac KOMPLET klas — pilnuje testu rownosci.
KLASY_MIEKKIE: frozenset[KlasaNiezmiennika] = frozenset(
    {
        KlasaNiezmiennika.WIARYGODNOSC,
        KlasaNiezmiennika.REGULA_ZA_MOCNA,
    }
)

#: Zapas na zaokraglenia przy porownaniach „nie wieksze niz" — dane katalogowe
#: bywaja podane z inna precyzja niz wielkosc, z ktora je zestawiamy.
LUZ_POROWNANIA: float = 1.0001

#: Przedrostki kodow. Twarda regula = `KAT-T-nnn`, wiarygodnosc = `KAT-W-nnn`.
PRZEDROSTEK_TWARDY = "KAT-T-"
PRZEDROSTEK_WIARYGODNOSCI = "KAT-W-"

#: Oznaczenia norm dopuszczalne w `podstawa` reguly klasy `WYMOG_NORMOWY`.
#: Regula normowa, ktora nie potrafi nazwac normy, nie jest regula normowa.
OZNACZENIA_NORM: tuple[str, ...] = ("IEC ", "PN-", "NC RfG", "IEEE ", "EN ")


class BladRejestruNiezmiennikow(ValueError):
    """Rejestr regul katalogu jest niespojny — blad programu, nie danych.

    Osobny typ, zeby odmowa rekordu katalogu (`OdmowaKatalogu`) nigdy nie
    pomylila sie z uszkodzeniem samego rejestru: pierwsza mowi „ten rekord jest
    niedopuszczalny", druga „kod, ktorym probujesz odmowic, nie istnieje".
    """


class OdmowaKatalogu(ValueError):
    """Twarda odmowa rekordu katalogu z NAZWANA regula (`.kod`).

    Dziedziczy po `ValueError`, bo tym byla kazda z 33 bramek przed ta karta i
    konsumenci (konstruktory rekordow, `from_dict`, importery) lapia `ValueError`.
    Nowe jest to, ze odmowa niesie kod reguly, wiec da sie ja policzyc,
    zaraportowac i zestawic z rejestrem, zamiast porownywac lancuchy komunikatow.
    """

    def __init__(self, komunikat: str, *, kod: str) -> None:
        super().__init__(komunikat)
        self.kod = kod


@dataclass(frozen=True)
class RegulaKatalogu:
    """Jedna regula katalogu z JAWNA moca, podstawa i uzasadnieniem."""

    kod: str
    nazwa: str
    klasa: KlasaNiezmiennika
    podstawa: str
    uzasadnienie: str
    klasa_docelowa: KlasaNiezmiennika | None = None

    def __post_init__(self) -> None:
        if not self.nazwa.strip():
            raise BladRejestruNiezmiennikow(f"{self.kod}: regula bez nazwy.")
        if not self.podstawa.strip():
            raise BladRejestruNiezmiennikow(f"{self.kod}: regula bez podstawy.")
        if not self.uzasadnienie.strip():
            raise BladRejestruNiezmiennikow(f"{self.kod}: regula bez uzasadnienia.")
        if self.klasa in KLASY_TWARDE and not self.kod.startswith(PRZEDROSTEK_TWARDY):
            raise BladRejestruNiezmiennikow(
                f"{self.kod}: regula klasy twardej wymaga kodu {PRZEDROSTEK_TWARDY}nnn."
            )
        if self.klasa in KLASY_MIEKKIE and not self.kod.startswith(PRZEDROSTEK_WIARYGODNOSCI):
            raise BladRejestruNiezmiennikow(
                f"{self.kod}: regula miekka wymaga kodu {PRZEDROSTEK_WIARYGODNOSCI}nnn."
            )
        if self.klasa is KlasaNiezmiennika.WYMOG_NORMOWY and not any(
            oznaczenie in self.podstawa for oznaczenie in OZNACZENIA_NORM
        ):
            raise BladRejestruNiezmiennikow(
                f"{self.kod}: regula klasy WYMOG_NORMOWY musi nazwac norme w `podstawa` "
                f"(oczekiwane jedno z {OZNACZENIA_NORM}), jest {self.podstawa!r}."
            )
        if self.klasa is KlasaNiezmiennika.REGULA_ZA_MOCNA:
            if self.klasa_docelowa is None:
                raise BladRejestruNiezmiennikow(
                    f"{self.kod}: klasa REGULA_ZA_MOCNA opisuje HISTORIE i wymaga "
                    "`klasa_docelowa` — regula bez mocy docelowej nie jest regula."
                )
            if self.klasa_docelowa is KlasaNiezmiennika.REGULA_ZA_MOCNA:
                raise BladRejestruNiezmiennikow(
                    f"{self.kod}: `klasa_docelowa` nie moze byc znowu REGULA_ZA_MOCNA."
                )
        elif self.klasa_docelowa is not None:
            raise BladRejestruNiezmiennikow(
                f"{self.kod}: `klasa_docelowa` ma sens wylacznie dla REGULA_ZA_MOCNA."
            )

    @property
    def twarda(self) -> bool:
        return self.klasa in KLASY_TWARDE

    def to_dict(self) -> dict[str, Any]:
        return {
            "kod": self.kod,
            "nazwa": self.nazwa,
            "klasa": str(self.klasa),
            "podstawa": self.podstawa,
            "uzasadnienie": self.uzasadnienie,
            "twarda": self.twarda,
            **(
                {"klasa_docelowa": str(self.klasa_docelowa)}
                if self.klasa_docelowa is not None
                else {}
            ),
        }


def _rejestr(*reguly: RegulaKatalogu) -> dict[str, RegulaKatalogu]:
    """Zbuduj rejestr posortowany po kodzie, z twardym zakazem duplikatu kodu."""
    wynik: dict[str, RegulaKatalogu] = {}
    for regula in reguly:
        if regula.kod in wynik:
            raise BladRejestruNiezmiennikow(f"Duplikat kodu reguly katalogu: {regula.kod}.")
        wynik[regula.kod] = regula
    return dict(sorted(wynik.items()))


#: JEDYNY rejestr regul katalogu. Kod jest tozsamoscia reguly w raportach i w
#: porownaniach miedzy przebiegami — nazwe wolno przeredagowac, kodu nie.
REGULY_KATALOGU: dict[str, RegulaKatalogu] = _rejestr(
    # -----------------------------------------------------------------------
    # network_model/catalog/types.py — metadane katalogu
    # -----------------------------------------------------------------------
    RegulaKatalogu(
        kod="KAT-T-001",
        nazwa="Status weryfikacji katalogu z zamknietego slownika",
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa="Kontrakt katalogu MV-DESIGN-PRO v2.0 — `CatalogVerificationStatus`",
        uzasadnienie=(
            "Brak pola legalnie dostaje wartosc domyslna (nikt jeszcze nie ocenil), "
            "ale NIEPUSTY lancuch spoza slownika to rekord uszkodzony: cicha promocja "
            "literowki na status domyslny ukrylaby blad danych."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-002",
        nazwa="Status katalogu z zamknietego slownika",
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa="Kontrakt katalogu MV-DESIGN-PRO v2.0 — `CatalogStatus`",
        uzasadnienie=(
            "Jak KAT-T-001: status produkcyjny/referencyjny/analityczny/testowy/projektowy "
            "rozstrzyga o dopuszczeniu pozycji do doboru, wiec nierozpoznana wartosc nie "
            "moze po cichu stac sie statusem domyslnym."
        ),
    ),
    # -----------------------------------------------------------------------
    # network_model/catalog/types.py — przeksztaltniki
    # -----------------------------------------------------------------------
    RegulaKatalogu(
        kod="KAT-T-003",
        nazwa="Wspolczynnik udzialu zwarciowego k_sc skonczony i dodatni",
        klasa=KlasaNiezmiennika.KONIECZNOSC_FIZYCZNA,
        podstawa="Definicja k_sc = I_k'' / I_n przeksztaltnika (wielkosc dodatnia)",
        uzasadnienie=(
            "k_sc = 0 znaczy „zrodlo nie wnosi pradu zwarciowego”, wartosc ujemna nie "
            "ma sensu, a NaN/±Inf nie sa liczbami — kazda z nich rozsadzilaby wynik "
            "zwarciowy po cichu. Warunek `math.isfinite` domyka NaN i obie "
            "nieskonczonosci jednym predykatem."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-004",
        nazwa="Krzywa zdolnosci P-Q niepusta",
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa="Kontrakt pola `pq_curve` — `None` znaczy „karta nie niesie krzywej”",
        uzasadnienie=(
            "Pusta krotka nie jest krzywa: pole nieobecne ma byc `None` (brak danej), a "
            "nie lista bez punktow, ktora konsument policzy jako „obwiednia pusta”."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-005",
        nazwa="Punkt krzywej P-Q ma trzy wspolrzedne",
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa="Kontrakt pola `pq_curve` — (p_mw, q_min_mvar, q_max_mvar)",
        uzasadnienie=(
            "Ksztalt punktu jest czescia kontraktu katalogu; punkt o innej dlugosci to "
            "uszkodzony import, a nie krzywa o innej rozdzielczosci."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-006",
        nazwa="Moc czynna punktu krzywej P-Q nieujemna",
        klasa=KlasaNiezmiennika.KONIECZNOSC_FIZYCZNA,
        podstawa="Obwiednia P-Q opisuje generacje przeksztaltnika (P >= 0)",
        uzasadnienie=(
            "Krzywa zdolnosci opisuje zakres pracy od zera do mocy znamionowej; punkt o "
            "ujemnym P nie opisuje tego samego urzadzenia (pobor to inny tryb, ktory "
            "katalog niesie osobnymi polami)."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-007",
        nazwa="Punkt krzywej P-Q wymaga q_min <= q_max",
        klasa=KlasaNiezmiennika.KONIECZNOSC_FIZYCZNA,
        podstawa="Definicja przedzialu mocy biernej w punkcie obwiedni",
        uzasadnienie=(
            "Para (q_min, q_max) z q_min > q_max opisuje zbior PUSTY — punkt pracy o "
            "takim przedziale nie istnieje, wiec nie jest to rekord nietypowy, tylko "
            "sprzeczny."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-008",
        nazwa="Punkty krzywej P-Q rosnaco po p_mw",
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa="Kontrakt pola `pq_curve` — interpolacja po rosnacym p_mw",
        uzasadnienie=(
            "Konsument interpoluje obwiednie po p_mw; nieposortowana albo powtarzajaca "
            "sie odcieta dalaby wynik zalezny od kolejnosci wierszy, czyli zlamanie "
            "determinizmu."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-009",
        nazwa="Widmo harmonicznych jako obiekt rzad->procent",
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa="Kontrakt pola `harmonic_spectrum_percent`",
        uzasadnienie=(
            "Ksztalt widma jest czescia kontraktu; wartosc innego typu to uszkodzony "
            "zapis, a nie inna reprezentacja tej samej danej."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-010",
        nazwa="Zakres nastawialnosci wymaga min <= max",
        klasa=KlasaNiezmiennika.KONIECZNOSC_FIZYCZNA,
        podstawa="Definicja przedzialu nastaw aparatu (Ir/Isd/Ii/tr/tsd)",
        uzasadnienie=(
            "Para (min, max) z min > max opisuje zbior PUSTY nastaw — aparat o takim "
            "zakresie nie istnieje. Cicha zamiana granic miejscami bylaby poprawianiem "
            "danych producenta, czego katalog robic nie moze."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-011",
        nazwa="Wspolczynnik emisji migotania flicker_c dodatni",
        klasa=KlasaNiezmiennika.KONIECZNOSC_FIZYCZNA,
        podstawa="Definicja wspolczynnika c(psi_k, v_a) migotania (wielkosc dodatnia)",
        uzasadnienie=(
            "Wspolczynnik migotania mnozy moc znamionowa w ocenie emisji; zero albo "
            "wartosc ujemna oznaczalaby zrodlo, ktore migotania nie wnosi wcale albo je "
            "odejmuje — takiego urzadzenia nie ma."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-012",
        nazwa="Statyzm P/f przeksztaltnika grid-forming dodatni",
        klasa=KlasaNiezmiennika.KONIECZNOSC_FIZYCZNA,
        podstawa="Definicja statyzmu s = -(df/f_n)/(dP/P_n) regulatora pierwotnego",
        uzasadnienie=(
            "Statyzm zerowy znaczy regulator o nieskonczonym wzmocnieniu, ujemny — "
            "dodatnie sprzezenie zwrotne rozbiegajace czestotliwosc. Zaden z tych "
            "przypadkow nie opisuje urzadzenia, ktore mozna wpiac do sieci."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-013",
        nazwa="Statyzm Q/U przeksztaltnika grid-forming dodatni",
        klasa=KlasaNiezmiennika.KONIECZNOSC_FIZYCZNA,
        podstawa="Definicja statyzmu napieciowego regulatora mocy biernej",
        uzasadnienie=(
            "Jak KAT-T-012, dla toru Q/U: zero i wartosc ujemna opisuja regulator, "
            "ktory nie stabilizuje napiecia, tylko je rozbiega."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-014",
        nazwa="Widmo harmonicznych niepuste",
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa="Kontrakt pola `harmonic_spectrum_percent` — `None` znaczy brak danej",
        uzasadnienie=(
            "Jak KAT-T-004: brak widma zapisujemy `None`, nie pustym obiektem, ktory "
            "konsument policzylby jako „widmo zerowe”."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-015",
        nazwa=(
            "Rzad harmonicznej calkowity w przedziale 2..50 "
            "(widmo rodzaju CURRENT_SPECTRUM_INTEGER_ORDER)"
        ),
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa="IEC 61000-4-7 — zakres oceny harmonicznych do rzedu 50",
        uzasadnienie=(
            "Widmo pradu w rzedach calkowitych (deklaracja producenta) obejmuje rzedy "
            "2..50 normowane przez IEC 61000-4-7; rzad 0/1 nie jest harmoniczna. "
            "Niezmiennik dotyczy WYLACZNIE tego rodzaju widma, nie produktu: "
            "interharmoniczne i supraharmoniczne leza na osi czestotliwosci w Hz "
            "(audyt harmonicznych #28) i wejda jako osobne rodzaje widma."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-016",
        nazwa="Udzial harmonicznej w przedziale 0..100 % pradu znamionowego",
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa="Kontrakt pola — udzial wyrazony w % pradu znamionowego",
        uzasadnienie=(
            "Dolna granica jest konieczna (udzial ujemny nie istnieje), gorna jest "
            "granica zakresu produktu: pojedyncza harmoniczna przekraczajaca prad "
            "znamionowy opisuje stan awaryjny, a nie widmo emisji przy pracy "
            "znamionowej. Klasa slabsza z tych dwoch — nie twierdzimy wiecej, niz wiemy."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-017",
        nazwa="Hierarchia mocy karty przeksztaltnika",
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa="Kontrakt karty mocy: Pzainst >= Pn,AC >= Pprzylacz >= Posiagl",
        uzasadnienie=(
            "Cztery moce karty sa zdefiniowane jako coraz wezsze ograniczenia tego samego "
            "zrodla, wiec kolejnosc wynika z definicji pol karty, a nie z prawa fizyki. "
            "Sprawdzane sa wylacznie pary OBECNE — karta wypelniona czesciowo nigdy nie "
            "odpada przez pole, ktorego nie ma."
        ),
    ),
    # -----------------------------------------------------------------------
    # network_model/catalog/types.py — bateria BESS
    # -----------------------------------------------------------------------
    RegulaKatalogu(
        kod="KAT-T-018",
        nazwa="Pojemnosc pakietu baterii dodatnia",
        klasa=KlasaNiezmiennika.KONIECZNOSC_FIZYCZNA,
        podstawa="Definicja pojemnosci znamionowej pakietu [kWh]",
        uzasadnienie="Pakiet o pojemnosci zerowej albo ujemnej nie jest magazynem energii.",
    ),
    RegulaKatalogu(
        kod="KAT-T-019",
        nazwa="Napiecie znamionowe szyny DC dodatnie",
        klasa=KlasaNiezmiennika.KONIECZNOSC_FIZYCZNA,
        podstawa="Definicja napiecia znamionowego szyny DC [V]",
        uzasadnienie="Szyna o napieciu zerowym albo ujemnym nie opisuje istniejacego pakietu.",
    ),
    RegulaKatalogu(
        kod="KAT-T-020",
        nazwa="Szybkosc ladowania C-rate dodatnia",
        klasa=KlasaNiezmiennika.KONIECZNOSC_FIZYCZNA,
        podstawa="Definicja C-rate jako wielokrotnosci pojemnosci na godzine [1/h]",
        uzasadnienie=(
            "C-rate zerowy opisuje pakiet, ktorego nie da sie naladowac ani rozladowac; "
            "ujemny nie ma interpretacji."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-021",
        nazwa="Chemia ogniwa z zamknietego slownika",
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa="Kontrakt katalogu — chemie LFP / NMC / LTO",
        uzasadnienie=(
            "Produkt deklaruje wynik dla trzech chemii, dla ktorych niesie dane "
            "eksploatacyjne. Chemia spoza slownika nie jest bledem fizyki, tylko "
            "pozycja, dla ktorej produkt nie ma czym policzyc — i ma to powiedziec "
            "wprost, a nie przyjac rekord i milczec."
        ),
    ),
    # -----------------------------------------------------------------------
    # network_model/catalog/types.py — wkladka topikowa nN
    # -----------------------------------------------------------------------
    RegulaKatalogu(
        kod="KAT-T-022",
        nazwa="Wkladka topikowa ma znamionowa zdolnosc wylaczania",
        klasa=KlasaNiezmiennika.WYMOG_NORMOWY,
        podstawa="IEC 60269-1 — znamionowa zdolnosc wylaczania jest wielkoscia znamionowa wkladki",
        uzasadnienie=(
            "Norma wymaga tej wielkosci dla kazdej wkladki, wiec `None`/0 w katalogu to "
            "BRAK DANEJ, a nie stan „nie dotyczy”. Ciche `None` przenioslo by sie do "
            "dowodu wytrzymalosci nN jako SN-owe NIE_DOTYCZY i pozycja bez zdolnosci "
            "wylaczania przeszlaby dobor."
        ),
    ),
    # -----------------------------------------------------------------------
    # network_model/catalog/audit2_catalogs.py
    # -----------------------------------------------------------------------
    RegulaKatalogu(
        kod="KAT-T-023",
        nazwa="Pasmo TCC wkladki ma adres tabeli producenta",
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa="Wzorzec proweniencji katalogu — pasmo przepisane z tabeli producenta",
        uzasadnienie=(
            "Pasmo czasowo-pradowe bez adresu tabeli, z ktorej je przepisano, jest "
            "nieweryfikowalne — a katalog niesie WYLACZNIE dane o ustalonym pochodzeniu."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-024",
        nazwa="Pasmo TCC niepuste",
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa="Kontrakt pola `pasmo_tcc` — `None` znaczy „pasma nie ma”",
        uzasadnienie=(
            "Pasmo bez punktow nie jest pasmem; brak danych zapisujemy `None`, zeby "
            "konsument nie policzyl pustej listy jako „brak ograniczenia czasowego”."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-025",
        nazwa="Prad krotkotrwaly aparatu SN z szeregu znormalizowanego",
        klasa=KlasaNiezmiennika.WYMOG_NORMOWY,
        podstawa="IEC 62271-1 — szereg znamionowych pradow krotkotrwalych wytrzymywanych",
        uzasadnienie=(
            "Norma wymienia szereg wartosci znamionowych; aparat SN o I_th spoza szeregu "
            "nie ma znamionowania, ktore produkt potrafi zestawic z wynikiem zwarciowym."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-026",
        nazwa="Czas trwania zwarcia aparatu SN z szeregu znormalizowanego",
        klasa=KlasaNiezmiennika.WYMOG_NORMOWY,
        podstawa="IEC 62271-1 — szereg znamionowych czasow trwania zwarcia",
        uzasadnienie=(
            "Prad krotkotrwaly jest znamionowany LACZNIE z czasem odniesienia; czas spoza "
            "szeregu unieruchamialby przeliczenie I_th na inny czas (regula I^2t)."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-027",
        nazwa="Statyzm LFSM w przedziale nastawialnym",
        klasa=KlasaNiezmiennika.WYMOG_NORMOWY,
        podstawa="NC RfG art. 13 ust. 2 — przedzial nastawialny statyzmu LFSM-O",
        uzasadnienie=(
            "Rozporzadzenie wyznacza przedzial nastawialny wprost; profil poza nim nie "
            "jest profilem NC RfG, tylko innym trybem regulacji."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-028",
        nazwa="Strefa nieczulosci LFSM w przedziale nastawialnym",
        klasa=KlasaNiezmiennika.WYMOG_NORMOWY,
        podstawa="NC RfG art. 13 ust. 2 — przedzial strefy nieczulosci LFSM-O",
        uzasadnienie="Jak KAT-T-027, dla strefy nieczulosci progu czestotliwosciowego.",
    ),
    RegulaKatalogu(
        kod="KAT-T-029",
        nazwa="Zakres pracy czestotliwosciowej z zalacznika normowego",
        klasa=KlasaNiezmiennika.WYMOG_NORMOWY,
        podstawa="NC RfG zalacznik II tab. 2 — zakresy czestotliwosci obszaru synchronicznego",
        uzasadnienie=(
            "Zakres pracy jest ustalony dla obszaru synchronicznego, nie wybierany przez "
            "producenta; inny zakres oznacza profil spoza dziedziny oceny NC RfG."
        ),
    ),
    # -----------------------------------------------------------------------
    # network_model/catalog/lv_disconnection_times_iec60364_4_41.py
    # -----------------------------------------------------------------------
    RegulaKatalogu(
        kod="KAT-T-030",
        nazwa="Czas wylaczenia tablicy w przedziale (0; 5] s",
        klasa=KlasaNiezmiennika.WYMOG_NORMOWY,
        podstawa="IEC 60364-4-41 tab. 41.1 — najdluzsze dopuszczalne czasy wylaczenia",
        uzasadnienie=(
            "Tablica normy nie wykracza poza 5 s (obwod rozdzielczy); wpis powyzej nie "
            "pochodzi z tej tablicy, a wpis niedodatni nie jest czasem."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-031",
        nazwa="Wpis tablicy czasow wylaczenia ma proweniencje",
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa="Wzorzec proweniencji katalogu — kazdy wpis tablicy niesie podstawe",
        uzasadnienie=(
            "Wartosc normowa bez wskazania miejsca w normie jest nierozroznialna od "
            "liczby wpisanej z pamieci — a dowod ma cytowac podstawe, nie liczbe."
        ),
    ),
    # -----------------------------------------------------------------------
    # network_model/catalog/lv_ampacity_iec60364_5_52.py
    # -----------------------------------------------------------------------
    RegulaKatalogu(
        kod="KAT-T-032",
        nazwa="Wspolczynnik tablicowy obciazalnosci w przedziale (0; 1,3]",
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa="IEC 60364-5-52 — tablice wspolczynnikow poprawkowych obciazalnosci",
        uzasadnienie=(
            "Wspolczynniki tablic normy nie wychodza poza ten przedzial; wartosc spoza "
            "niego oznacza pomylona kolumne przy przepisywaniu tablicy, a nie warunek "
            "ulozenia, ktorego norma nie przewidziala."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-033",
        nazwa="Wpis tablicy obciazalnosci ma proweniencje",
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa="Wzorzec proweniencji katalogu — kazdy wpis tablicy niesie podstawe",
        uzasadnienie="Jak KAT-T-031, dla tablic obciazalnosci dlugotrwalej.",
    ),
    # -----------------------------------------------------------------------
    # REGULY WIARYGODNOSCI — sygnal do przegladu, NIGDY odmowa
    # -----------------------------------------------------------------------
    RegulaKatalogu(
        kod="KAT-W-001",
        nazwa="R0 >= R1 przewodu",
        klasa=KlasaNiezmiennika.WIARYGODNOSC,
        podstawa="Typowa konstrukcja zyly powrotnej / ekranu z powrotem ziemnym",
        uzasadnienie=(
            "Rezystancja skladowej zerowej zalezy od konstrukcji zyly powrotnej, ekranu i "
            "drogi powrotu przez ziemie. Dla konstrukcji z powrotem ziemnym R0 jest "
            "zwykle kilkukrotnie wieksze, ale nie jest to nierownosc uniwersalna dla "
            "kazdej konstrukcji kabla i linii. Twarda bramka odrzucilaby poprawny rekord "
            "spoza dotychczasowego zbioru."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-W-002",
        nazwa="P0 < Pk transformatora",
        klasa=KlasaNiezmiennika.WIARYGODNOSC,
        podstawa="Relacja typowa dla transformatorow rozdzielczych",
        uzasadnienie=(
            "Straty jalowe sa zwykle ulamkiem strat obciazeniowych, ale nie jest to "
            "koniecznosc matematyczna dla kazdej rodziny konstrukcyjnej. Odwrocenie pary "
            "zwykle oznacza zamienione kolumny przy imporcie — i o tym ma powiedziec "
            "ostrzezenie, a nie odmowa wczytania pozycji."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-W-003",
        nazwa="Icw <= Icu aparatu SN",
        klasa=KlasaNiezmiennika.WIARYGODNOSC,
        podstawa="IEC 62271-100 — Icw i Icu sa ODDZIELNYMI wielkosciami znamionowymi",
        uzasadnienie=(
            "Prad krotkotrwaly wytrzymywany (przewodzenie bez uszkodzenia) i zdolnosc "
            "wylaczania (przerwanie pradu) to rozne zdolnosci, znamionowane osobno. "
            "Globalna nierownosc po calej rodzinie aparatow SN nie ma podstawy normowej "
            "i moglaby odrzucic poprawny rekord aparatu, dla ktorego norma tej relacji "
            "nie narzuca."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-W-004",
        nazwa="Icw <= Icu aparatu nN",
        klasa=KlasaNiezmiennika.WIARYGODNOSC,
        podstawa="IEC 60947-2 § 4.3.5.4 (Icw) wobec § 4.3.5.2.2 (Ics jako % Icu)",
        uzasadnienie=(
            "Norma definiuje Ics JAWNIE jako procent Icu (§ 4.3.5.2.2) — tamta relacja "
            "moglaby byc twarda. Dla Icw takiej definicji NIE MA: norma opisuje je osobno "
            "(§ 4.3.5.4), jako wytrzymalosc krotkotrwala wylacznika kategorii B przez "
            "zadany czas, a nie jako ulamek zdolnosci wylaczalnej. Porownywac je wolno "
            "wylacznie dla tego samego wariantu, napiecia i czasu."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-W-005",
        nazwa="0 < R/X < 1 umowy rownowaznej sieci",
        klasa=KlasaNiezmiennika.WIARYGODNOSC,
        podstawa="Typowa charakterystyka rownowaznika sieci SN (silnie indukcyjna)",
        uzasadnienie=(
            "Rownowaznik sieci SN jest zwykle silnie indukcyjny, ale rownowaznik "
            "rezystancyjny albo specjalnie zdefiniowany moze miec R/X >= 1. Ograniczenie "
            "nalezy do zakresu produktu, nie do fizyki — a dopoki zakres nie jest "
            "zadeklarowany, twarda bramka jest nieuzasadniona."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-W-006",
        nazwa="0 < i0 % < 10 transformatora",
        klasa=KlasaNiezmiennika.WIARYGODNOSC,
        podstawa="Zakres typowy dla transformatorow rozdzielczych",
        uzasadnienie=(
            "Zakres rozsadny dla transformatorow rozdzielczych, ale nie uniwersalny dla "
            "transformatorow specjalnych. Gorna granica 10 % byla kontrola jednostki "
            "(procent kontra ulamek), a nie wielkoscia normowana."
        ),
    ),
)

#: Kody twarde — WYPROWADZONE z rejestru, nie z drugiej listy.
KODY_TWARDE: frozenset[str] = frozenset(
    kod for kod, regula in REGULY_KATALOGU.items() if regula.twarda
)

#: Kody wiarygodnosci — WYPROWADZONE z rejestru (predykaty parami: jedno zrodlo).
KODY_WIARYGODNOSCI: frozenset[str] = frozenset(
    kod for kod, regula in REGULY_KATALOGU.items() if not regula.twarda
)


def regula(kod: str) -> RegulaKatalogu:
    """Regula o danym kodzie. Kod spoza rejestru to blad programu, nie danych."""
    try:
        return REGULY_KATALOGU[kod]
    except KeyError:
        raise BladRejestruNiezmiennikow(
            f"Kod reguly katalogu {kod!r} nie istnieje w rejestrze REGULY_KATALOGU."
        ) from None


def odmowa_twarda(kod: str, komunikat: str) -> NoReturn:
    """JEDYNE wyjscie twardej bramki rekordu katalogu.

    Sprawdza, ze kod ISTNIEJE w rejestrze i ma klase TWARDA, a dopiero potem
    odmawia. Dzieki temu zdanie „kazda twarda regula katalogu jest nazwana" jest
    egzekwowane w czasie wykonania, a nie tylko deklarowane: bramka z kodem
    nieistniejacym albo z kodem reguly wiarygodnosci konczy sie
    `BladRejestruNiezmiennikow` (blad programu) zamiast cichej odmowy.
    """
    wpis = regula(kod)
    if not wpis.twarda:
        raise BladRejestruNiezmiennikow(
            f"{kod}: regula klasy {wpis.klasa} jest MIEKKA — wiarygodnosc raportuje "
            "odstepstwo przez `przeglad_wiarygodnosci`, nigdy nie odmawia rekordu."
        )
    raise OdmowaKatalogu(f"{komunikat} (kod reguly: {kod})", kod=kod)


# ---------------------------------------------------------------------------
# PRZEGLAD WIARYGODNOSCI — wynik MASZYNOWY, zdolnosc produktu
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class OdstepstwoWiarygodnosci:
    """Jedna pozycja katalogu lamiaca regule klasy `WIARYGODNOSC`."""

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
class PokrycieReguly:
    """Ile pozycji rodziny regula FAKTYCZNIE policzyla, a ilu nie dotyczy.

    BEZ TEGO LICZNIKA „zero odstepstw" jest nierozroznialne od „reguly nie dalo
    sie policzyc" — dokladnie ten ksztalt cichego zera, ktory karta zakazuje w
    danych fizycznych. Pozycja trafia do `pominiete`, gdy rodzina ja niesie, ale
    regula nie ma na niej sensu (brak ktorejs z porownywanych wielkosci albo
    aparat, ktory danej zdolnosci z definicji nie ma).
    """

    kod: str
    policzone: int
    pominiete: int
    powod_pominiecia: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "kod": self.kod,
            "policzone": self.policzone,
            "pominiete": self.pominiete,
            "powod_pominiecia": self.powod_pominiecia,
        }


@dataclass(frozen=True)
class WynikPrzegladuWiarygodnosci:
    """Wynik przegladu — OBIEKT, nie wydruk testu.

    Po przeklasyfikowaniu regul na ostrzezenia odstepstwo przestaje cokolwiek
    zatrzymywac. Gdyby bylo widoczne wylacznie jako tekst wypisany przez test,
    przy zielonym przebiegu nie powstawalby zaden artefakt i zdanie „regula nadal
    raportuje odstepstwa" byloby operacyjnie puste. Tutaj wynik da sie policzyc,
    porownac miedzy wersjami katalogu i pokazac projektantowi.
    """

    rodzina: str
    etykieta_pl: str
    liczba_pozycji: int
    pokrycie: tuple[PokrycieReguly, ...]
    odstepstwa: tuple[OdstepstwoWiarygodnosci, ...]

    @property
    def sprawdzone_reguly(self) -> tuple[str, ...]:
        return tuple(p.kod for p in self.pokrycie)

    @property
    def bez_odstepstw(self) -> bool:
        return not self.odstepstwa

    def wedlug_kodu(self) -> dict[str, int]:
        liczniki: dict[str, int] = {}
        for o in self.odstepstwa:
            liczniki[o.kod] = liczniki.get(o.kod, 0) + 1
        return dict(sorted(liczniki.items()))

    def to_dict(self) -> dict[str, Any]:
        return {
            "rodzina": self.rodzina,
            "etykieta_pl": self.etykieta_pl,
            "liczba_pozycji": self.liczba_pozycji,
            "sprawdzone_reguly": list(self.sprawdzone_reguly),
            "pokrycie": [p.to_dict() for p in self.pokrycie],
            "liczba_odstepstw": len(self.odstepstwa),
            "wedlug_kodu": self.wedlug_kodu(),
            "odstepstwa": [o.to_dict() for o in self.odstepstwa],
        }


@dataclass(frozen=True)
class SpecyfikacjaRodziny:
    """Rodzina katalogu objeta przegladem: kody regul + pola, na ktorych dzialaja.

    Pola sa NAZWANE tutaj, a nie zgadywane przez `getattr` z listy kandydatow —
    nazwa pola spoza kontraktu dalaby ciche zero sprawdzen (wynik „brak
    odstepstw" nierozroznialny od „reguly nie policzono").
    """

    rodzina: str
    etykieta_pl: str
    kody: tuple[str, ...]


#: Rodziny katalogu objete przegladem wiarygodnosci — KOMPLET, w ktorym regula
#: ma sens. Rodziny bez reguly sa wymienione w `RODZINY_BEZ_REGUL` z powodem;
#: razem musza pokryc kazda rodzine katalogu (test parytetu wobec `api/catalog.py`).
RODZINY_PRZEGLADU: dict[str, SpecyfikacjaRodziny] = {
    "aparaty-nn": SpecyfikacjaRodziny(
        rodzina="aparaty-nn",
        etykieta_pl="Aparatura nN",
        kody=("KAT-W-004",),
    ),
    "aparaty-sn": SpecyfikacjaRodziny(
        rodzina="aparaty-sn",
        etykieta_pl="Aparatura SN",
        kody=("KAT-W-003",),
    ),
    "transformatory": SpecyfikacjaRodziny(
        rodzina="transformatory",
        etykieta_pl="Transformatory",
        kody=("KAT-W-002", "KAT-W-006"),
    ),
    "linie-sn": SpecyfikacjaRodziny(
        rodzina="linie-sn",
        etykieta_pl="Linie napowietrzne SN",
        kody=("KAT-W-001",),
    ),
    "kable-sn": SpecyfikacjaRodziny(
        rodzina="kable-sn",
        etykieta_pl="Kable SN",
        kody=("KAT-W-001",),
    ),
    "kable-nn": SpecyfikacjaRodziny(
        rodzina="kable-nn",
        etykieta_pl="Kable nN",
        kody=("KAT-W-001",),
    ),
    "zrodla-systemowe": SpecyfikacjaRodziny(
        rodzina="zrodla-systemowe",
        etykieta_pl="Zrodla systemowe (GPZ)",
        kody=("KAT-W-005",),
    ),
}

#: Rodziny katalogu BEZ reguly wiarygodnosci, z powodem merytorycznym. Rodzina
#: pominieta milczeniem bylaby nierozroznialna od przeoczonej.
RODZINY_BEZ_REGUL: dict[str, str] = {
    "switch-equipment": (
        "Aparat laczeniowy pola bez znamion zwarciowych w kontrakcie typu — relacje "
        "Icw/Icu niesie rodzina aparatow SN."
    ),
    "lv-breaker-mcb": (
        "Wylacznik nadpradowy MCB: kontrakt niesie pasmo wyzwalania z IEC 60898-1, bez "
        "pary Icw/Icu, na ktorej dziala regula wiarygodnosci."
    ),
    "lv-fuse-link": (
        "Wkladka topikowa nie ma pradu krotkotrwalego wytrzymywanego — jej zdolnosc "
        "wylaczania jest bramka TWARDA (KAT-T-022), nie sygnalem do przegladu."
    ),
    "load": "Typ odbioru nie niesie impedancji skladowych ani znamion zwarciowych.",
    "ct": "Przekladnik pradowy: znamiona dokladnosci i przetezenia, bez par objetych regulami.",
    "vt": "Przekladnik napieciowy: jak CT.",
    "surge-arrester": (
        "Ogranicznik przepiec: znamiona napieciowo-energetyczne (Um, MCOV, Ures, BIL), "
        "bez par objetych regulami."
    ),
    "shunt-capacitor": "Bateria kondensatorow: moc bierna i napiecie, bez par objetych regulami.",
    "pv-inverter": (
        "Przeksztaltnik PV: udzial zwarciowy k_sc jest bramka TWARDA (KAT-T-003); brak "
        "k_sc jest BRAKIEM DANEJ raportowanym przez miernik gotowosci, nie odstepstwem."
    ),
    "bess-inverter": "Przeksztaltnik magazynu: jak PV.",
    "bess-battery": (
        "Pakiet baterii: pojemnosc / napiecie DC / C-rate sa bramkami TWARDYMI " "(KAT-T-018..020)."
    ),
    "converter": "Przeksztaltnik (PV/BESS/WIND) — jak PV.",
    "wind-inverter": "Przeksztaltnik farmy wiatrowej — podzbior rodziny przeksztaltnikow.",
    "der-dynamic": (
        "Profil dynamiczny DER nie jest rekordem sprzetu — jego zakresy sa bramkami "
        "TWARDYMI wyprowadzonymi z NC RfG (KAT-T-027..029)."
    ),
    "branch-point": "Punkt odgalezny (slup/ZKSN): geometria i wyposazenie, bez wielkosci objetych regulami.",
    "switchgear-families": "Rodzina rozdzielnicy to kontener konfiguracyjny, nie rekord sprzetu.",
    "complete-bay-templates": "Szablon pola to zestawienie pozycji katalogu, nie pozycja katalogu.",
    "protection-device": (
        "Zabezpieczenie: nastawy i krzywe czasowo-pradowe, bez par wielkosci znamionowych "
        "objetych regulami wiarygodnosci."
    ),
    "ptpiree-certificates": (
        "Wykaz certyfikatow PTPiREE to rejestr dokumentow, nie rekordow sprzetu."
    ),
    "synchronous-generator": (
        "Generator synchroniczny: reaktancje podprzejsciowe/przejsciowe i stale czasowe, "
        "bez par objetych regulami (relacja x''<x'<x nie byla u nas nigdy bramka i nie ma "
        "dzis konsumenta przegladu)."
    ),
}


def _pomiar(pozycja: Any, pole: str) -> float | None:
    """Odczyt pola jako SKONCZONEJ liczby albo `None` (brak danej do policzenia).

    Jedna funkcja zamiast pary „predykat + rzutowanie": predykat `bool` nie zawezal
    typu, wiec kazde uzycie wymagalo osobnego `float(...)` na wartosci, ktora dla
    sprawdzajacego typy nadal mogla byc `None`. Tu wynik JEST liczba albo jej nie ma.

    `bool` odpada jawnie — `True` nie jest pomiarem, a `isinstance(True, int)` jest
    prawda. NaN i obie nieskonczonosci odpadaja przez `math.isfinite`: wartosc, na
    ktorej nie da sie porownac, nie jest policzona, tylko pominieta.
    """
    wartosc = getattr(pozycja, pole, None)
    if isinstance(wartosc, bool) or not isinstance(wartosc, int | float):
        return None
    liczba = float(wartosc)
    return liczba if math.isfinite(liczba) else None


def _id_pozycji(pozycja: Any) -> str:
    return str(getattr(pozycja, "id", "?"))


@dataclass(frozen=True)
class _WynikReguly:
    """Tri-stan predykatu: policzony czy nie, a jesli tak — czy z odstepstwem.

    Dwustanowy wynik (`OdstepstwoWiarygodnosci | None`) mieszal „regula policzona,
    wartosci sie zgadzaja" z „reguly nie dalo sie policzyc" — to ta sama klasa
    cichego zera, ktora karta zakazuje w danych fizycznych.
    """

    policzona: bool
    odstepstwo: OdstepstwoWiarygodnosci | None = None


_NIEPOLICZONA = _WynikReguly(policzona=False)


def _odstepstwo(kod: str, pozycja: Any, opis_wartosci: str) -> _WynikReguly:
    return _WynikReguly(
        policzona=True,
        odstepstwo=OdstepstwoWiarygodnosci(
            kod=kod,
            regula=REGULY_KATALOGU[kod].nazwa,
            pozycja_id=_id_pozycji(pozycja),
            opis_wartosci=opis_wartosci,
        ),
    )


def _sprawdz_kat_w_001(pozycja: Any) -> _WynikReguly:
    """R0 >= R1 — rezystancja skladowej zerowej wobec skladowej zgodnej."""
    r0 = _pomiar(pozycja, "r0_ohm_per_km")
    r1 = _pomiar(pozycja, "r_ohm_per_km")
    if r0 is None or r1 is None:
        return _NIEPOLICZONA
    if r0 * LUZ_POROWNANIA < r1:
        return _odstepstwo("KAT-W-001", pozycja, f"R0 = {r0} Ω/km, R1 = {r1} Ω/km")
    return _WynikReguly(policzona=True)


def _sprawdz_kat_w_002(pozycja: Any) -> _WynikReguly:
    """P0 < Pk — straty jalowe wobec strat obciazeniowych."""
    p0 = _pomiar(pozycja, "p0_kw")
    pk = _pomiar(pozycja, "pk_kw")
    if p0 is None or pk is None:
        return _NIEPOLICZONA
    if p0 >= pk:
        return _odstepstwo("KAT-W-002", pozycja, f"P0 = {p0} kW, Pk = {pk} kW")
    return _WynikReguly(policzona=True)


def _sprawdz_kat_w_003(pozycja: Any) -> _WynikReguly:
    """Icw <= Icu aparatu SN — TYLKO dla aparatu o dodatniej zdolnosci wylaczania.

    ZAKRES REGULY, NIE PODRASOWANIE DANYCH (pomiar 2026-09-17). Rodzina aparatow
    SN niesie 13 pozycji z `breaking_capacity_ka = 0.0`: odlaczniki, rozlaczniki i
    uziemniki. Zero nie jest tu brakiem danej ani bledem — jest DEKLARACJA, ze
    aparat z definicji nie przerywa pradu zwarciowego (odlacznik lamie tylko prad
    jalowy, uziemnik nie lamie nic). Zestawienie pradu krotkotrwalego
    wytrzymywanego ze zdolnoscia wylaczania, ktorej aparat NIE MA, nie jest
    sygnalem „do przegladu" tylko szumem — a 13 pozycji szumu wylaczyloby czujnosc
    na pierwsze prawdziwe odstepstwo. Pozycje bez dodatniej Icu ida wiec do
    `pominiete` z nazwanym powodem, a nie do odstepstw i nie do cichego zera.
    """
    icw = _pomiar(pozycja, "i_th_ka")
    icu = _pomiar(pozycja, "breaking_capacity_ka")
    if icw is None or icu is None or icu <= 0.0:
        return _NIEPOLICZONA
    if icw > icu * LUZ_POROWNANIA:
        return _odstepstwo("KAT-W-003", pozycja, f"Icw (I_th) = {icw} kA, Icu = {icu} kA")
    return _WynikReguly(policzona=True)


def _sprawdz_kat_w_004(pozycja: Any) -> _WynikReguly:
    """Icw <= Icu aparatu nN — jak KAT-W-003: Icu niedodatnie = zdolnosci nie ma."""
    icw = _pomiar(pozycja, "icw_ka")
    icu = _pomiar(pozycja, "i_cu_ka")
    if icw is None or icu is None or icu <= 0.0:
        return _NIEPOLICZONA
    if icw > icu * LUZ_POROWNANIA:
        return _odstepstwo("KAT-W-004", pozycja, f"Icw = {icw} kA, Icu = {icu} kA")
    return _WynikReguly(policzona=True)


def _sprawdz_kat_w_005(pozycja: Any) -> _WynikReguly:
    """0 < R/X < 1 umowy rownowaznej sieci — oba warianty (maksymalny i minimalny)."""
    policzona = False
    for nazwa_pola, etykieta in (("rx_ratio", "R/X"), ("rx_ratio_min", "R/X (min)")):
        rx = _pomiar(pozycja, nazwa_pola)
        if rx is None:
            continue
        policzona = True
        if not 0.0 < rx < 1.0:
            return _odstepstwo("KAT-W-005", pozycja, f"{etykieta} = {rx}")
    return _WynikReguly(policzona=policzona)


def _sprawdz_kat_w_006(pozycja: Any) -> _WynikReguly:
    """0 < i0 % < 10 transformatora."""
    i0 = _pomiar(pozycja, "i0_percent")
    if i0 is None:
        return _NIEPOLICZONA
    if not 0.0 < i0 < 10.0:
        return _odstepstwo("KAT-W-006", pozycja, f"i0 = {i0} %")
    return _WynikReguly(policzona=True)


#: Mapa kod -> predykat przegladu. JEDNO zrodlo prawdy dla „ktore reguly umiemy
#: policzyc": rodzina, ktora wskazuje kod bez predykatu, konczy sie bledem
#: rejestru, a nie cichym pominieciem reguly.
PREDYKATY_WIARYGODNOSCI: dict[str, Callable[[Any], _WynikReguly]] = {
    "KAT-W-001": _sprawdz_kat_w_001,
    "KAT-W-002": _sprawdz_kat_w_002,
    "KAT-W-003": _sprawdz_kat_w_003,
    "KAT-W-004": _sprawdz_kat_w_004,
    "KAT-W-005": _sprawdz_kat_w_005,
    "KAT-W-006": _sprawdz_kat_w_006,
}

#: Powod pominiecia pozycji przez regule — nazwany, bo „pominieto 28 z 48" bez
#: powodu jest tak samo nieme jak ciche zero.
POWODY_POMINIECIA: dict[str, str] = {
    "KAT-W-001": "pozycja nie niesie rezystancji skladowej zerowej (R0)",
    "KAT-W-002": "pozycja nie niesie strat jalowych (P0) albo obciazeniowych (Pk)",
    "KAT-W-003": (
        "aparat bez dodatniej zdolnosci wylaczania — odlacznik, rozlacznik albo uziemnik "
        "z definicji nie przerywa pradu zwarciowego"
    ),
    "KAT-W-004": (
        "aparat bez dodatniej zdolnosci wylaczania Icu albo bez pradu krotkotrwalego Icw "
        "w karcie katalogowej"
    ),
    "KAT-W-005": "zrodlo nie niesie stosunku R/X (ani wariantu maksymalnego, ani minimalnego)",
    "KAT-W-006": "transformator nie niesie pradu biegu jalowego (i0 %)",
}


def przeglad_rodziny(rodzina: str, pozycje: Iterable[Any]) -> WynikPrzegladuWiarygodnosci:
    """Przeglad wiarygodnosci JEDNEJ rodziny katalogu.

    ZERO ODMOWY, ZERO ZMIAN DANYCH. Regula wiarygodnosci nigdy nie podnosi
    wyjatku i niczego nie poprawia — jej zlamanie jest sygnalem „do przegladu", a
    decyzje podejmuje czlowiek z karta producenta w reku.
    """
    if rodzina not in RODZINY_PRZEGLADU:
        raise BladRejestruNiezmiennikow(
            f"Rodzina {rodzina!r} nie jest objeta przegladem wiarygodnosci. "
            f"Dostepne: {', '.join(sorted(RODZINY_PRZEGLADU))}."
        )
    specyfikacja = RODZINY_PRZEGLADU[rodzina]
    lista = list(pozycje)
    odstepstwa: list[OdstepstwoWiarygodnosci] = []
    policzone: dict[str, int] = {kod: 0 for kod in specyfikacja.kody}
    pominiete: dict[str, int] = {kod: 0 for kod in specyfikacja.kody}
    for kod in specyfikacja.kody:
        if kod not in PREDYKATY_WIARYGODNOSCI:
            raise BladRejestruNiezmiennikow(
                f"Rodzina {rodzina!r} wskazuje kod {kod}, dla ktorego nie ma predykatu "
                "przegladu — regula bez predykatu nie jest sprawdzana."
            )
        if kod not in POWODY_POMINIECIA:
            raise BladRejestruNiezmiennikow(
                f"Regula {kod} nie ma nazwanego powodu pominiecia — „pominieto N pozycji” "
                "bez powodu jest tak samo nieme jak ciche zero."
            )
    for pozycja in lista:
        for kod in specyfikacja.kody:
            wynik = PREDYKATY_WIARYGODNOSCI[kod](pozycja)
            if wynik.policzona:
                policzone[kod] += 1
            else:
                pominiete[kod] += 1
            if wynik.odstepstwo is not None:
                odstepstwa.append(wynik.odstepstwo)
    odstepstwa.sort(key=lambda o: (o.kod, o.pozycja_id))
    return WynikPrzegladuWiarygodnosci(
        rodzina=specyfikacja.rodzina,
        etykieta_pl=specyfikacja.etykieta_pl,
        liczba_pozycji=len(lista),
        pokrycie=tuple(
            PokrycieReguly(
                kod=kod,
                policzone=policzone[kod],
                pominiete=pominiete[kod],
                powod_pominiecia=POWODY_POMINIECIA[kod],
            )
            for kod in specyfikacja.kody
        ),
        odstepstwa=tuple(odstepstwa),
    )


def przeglad_wiarygodnosci(
    rodziny: Mapping[str, Iterable[Any]],
) -> tuple[WynikPrzegladuWiarygodnosci, ...]:
    """Przeglad KOMPLETU rodzin objetych regulami, posortowany po nazwie rodziny.

    Wolajacy MUSI podac kazda rodzine z `RODZINY_PRZEGLADU` — rodzina pominieta
    dalaby raport, w ktorym „brak odstepstw" jest nierozroznialne od „nie
    sprawdzono".
    """
    brakujace = sorted(set(RODZINY_PRZEGLADU) - set(rodziny))
    if brakujace:
        raise BladRejestruNiezmiennikow(
            f"Przeglad wiarygodnosci wymaga kompletu rodzin — brakuje: {', '.join(brakujace)}."
        )
    nadmiarowe = sorted(set(rodziny) - set(RODZINY_PRZEGLADU))
    if nadmiarowe:
        raise BladRejestruNiezmiennikow(f"Rodziny spoza przegladu: {', '.join(nadmiarowe)}.")
    return tuple(przeglad_rodziny(nazwa, rodziny[nazwa]) for nazwa in sorted(rodziny))

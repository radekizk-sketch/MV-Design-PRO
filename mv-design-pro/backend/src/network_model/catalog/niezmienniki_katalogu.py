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

from network_model.nazwy import jest_nazwa


class KlasaNiezmiennika(StrEnum):
    """Moc reguly — rozstrzyga, czy zlamanie jest odmowa, czy ostrzezeniem."""

    KONIECZNOSC_FIZYCZNA = "KONIECZNOSC_FIZYCZNA"
    """Złamanie opisuje wielkość, która nie może istnieć (moc ujemna, zbiór pusty)."""

    WYMOG_NORMOWY = "WYMOG_NORMOWY"
    """Relacja ZDEFINIOWANA w normie — `podstawa` nazywa normę i jej miejsce."""

    OGRANICZENIE_ZAKRESU_PRODUKTU = "OGRANICZENIE_ZAKRESU_PRODUKTU"
    """Granica dziedziny MV-DESIGN-PRO — poza nią produkt nie deklaruje wyniku."""

    WIARYGODNOSC = "WIARYGODNOSC"
    """Strażnik prawdopodobieństwa danej: sygnał „do przeglądu”, nigdy odmowa."""

    REGULA_ZA_MOCNA = "REGULA_ZA_MOCNA"
    """Reguła egzekwowana MOCNIEJ, niż ma podstawę — klasa HISTORYCZNA.

    Opisuje ustalenie przeglądu, nie bieżącą moc reguły, więc każdy wpis z tą
    klasą MUSI nieść `klasa_docelowa` (moc, którą reguła ma OD TERAZ). Bez tego
    reguła nie miałaby żadnej mocy, a to nie jest to samo co „ma mniejszą moc".
    """

    NIESKLASYFIKOWANA = "NIESKLASYFIKOWANA"
    """Reguła BEZ decyzji o podstawie — egzekwowana twardo, ale NIE NAZWANA.

    Rozdziela MOC od TWIERDZENIA. Twarde egzekwowanie jest bezpiecznym domyślnym
    wyborem dla nowej bramki; nazwanie jej „koniecznością fizyczną" jest zdaniem o
    świecie, którego domyślnie postawić nie wolno. Reguła, która ma być nazwana
    koniecznością fizyczną, trafia do rejestru z uzasadnieniem.
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
        if not jest_nazwa(self.nazwa):
            raise BladRejestruNiezmiennikow(f"{self.kod}: reguła bez nazwy.")
        if not self.podstawa.strip():
            raise BladRejestruNiezmiennikow(f"{self.kod}: reguła bez podstawy.")
        if not self.uzasadnienie.strip():
            raise BladRejestruNiezmiennikow(f"{self.kod}: reguła bez uzasadnienia.")
        if self.klasa in KLASY_TWARDE and not self.kod.startswith(PRZEDROSTEK_TWARDY):
            raise BladRejestruNiezmiennikow(
                f"{self.kod}: reguła klasy twardej wymaga kodu {PRZEDROSTEK_TWARDY}nnn."
            )
        if self.klasa in KLASY_MIEKKIE and not self.kod.startswith(PRZEDROSTEK_WIARYGODNOSCI):
            raise BladRejestruNiezmiennikow(
                f"{self.kod}: reguła miękka wymaga kodu {PRZEDROSTEK_WIARYGODNOSCI}nnn."
            )
        if self.klasa is KlasaNiezmiennika.WYMOG_NORMOWY and not any(
            oznaczenie in self.podstawa for oznaczenie in OZNACZENIA_NORM
        ):
            raise BladRejestruNiezmiennikow(
                f"{self.kod}: reguła klasy WYMOG_NORMOWY musi nazwać normę w `podstawa` "
                f"(oczekiwane jedno z {OZNACZENIA_NORM}), jest {self.podstawa!r}."
            )
        if self.klasa is KlasaNiezmiennika.REGULA_ZA_MOCNA:
            if self.klasa_docelowa is None:
                raise BladRejestruNiezmiennikow(
                    f"{self.kod}: klasa REGULA_ZA_MOCNA opisuje HISTORIĘ i wymaga "
                    "`klasa_docelowa` — reguła bez mocy docelowej nie jest regułą."
                )
            if self.klasa_docelowa is KlasaNiezmiennika.REGULA_ZA_MOCNA:
                raise BladRejestruNiezmiennikow(
                    f"{self.kod}: `klasa_docelowa` nie może być znowu REGULA_ZA_MOCNA."
                )
        elif self.klasa_docelowa is not None:
            raise BladRejestruNiezmiennikow(
                f"{self.kod}: `klasa_docelowa` ma sens wyłącznie dla REGULA_ZA_MOCNA."
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
            raise BladRejestruNiezmiennikow(f"Duplikat kodu reguły katalogu: {regula.kod}.")
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
        nazwa="Status weryfikacji katalogu z zamkniętego słownika",
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa="Kontrakt katalogu MV-DESIGN-PRO v2.0 — `CatalogVerificationStatus`",
        uzasadnienie=(
            "Brak pola legalnie dostaje wartość domyślną (nikt jeszcze nie ocenił), "
            "ale NIEPUSTY łańcuch spoza słownika to rekord uszkodzony: cicha promocja "
            "literówki na status domyślny ukryłaby błąd danych."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-002",
        nazwa="Status katalogu z zamkniętego słownika",
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa="Kontrakt katalogu MV-DESIGN-PRO v2.0 — `CatalogStatus`",
        uzasadnienie=(
            "Jak KAT-T-001: status produkcyjny/referencyjny/analityczny/testowy/projektowy "
            "rozstrzyga o dopuszczeniu pozycji do doboru, więc nierozpoznana wartość nie "
            "może po cichu stać się statusem domyślnym."
        ),
    ),
    # -----------------------------------------------------------------------
    # network_model/catalog/types.py — przeksztaltniki
    # -----------------------------------------------------------------------
    RegulaKatalogu(
        kod="KAT-T-003",
        nazwa="Współczynnik udziału zwarciowego k_sc skończony i dodatni",
        klasa=KlasaNiezmiennika.KONIECZNOSC_FIZYCZNA,
        podstawa="Definicja k_sc = I_k'' / I_n przekształtnika (wielkość dodatnia)",
        uzasadnienie=(
            "k_sc = 0 znaczy „źródło nie wnosi prądu zwarciowego”, wartość ujemna nie "
            "ma sensu, a NaN/±Inf nie są liczbami — każda z nich rozsadziłaby wynik "
            "zwarciowy po cichu. Warunek `math.isfinite` domyka NaN i obie "
            "nieskończoności jednym predykatem."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-004",
        nazwa="Krzywa zdolności P-Q niepusta",
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa="Kontrakt pola `pq_curve` — `None` znaczy „karta nie niesie krzywej”",
        uzasadnienie=(
            "Pusta krotka nie jest krzywą: pole nieobecne ma być `None` (brak danej), a "
            "nie lista bez punktów, która konsument policzy jako „obwiednia pusta”."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-005",
        nazwa="Punkt krzywej P-Q ma trzy współrzędne",
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa="Kontrakt pola `pq_curve` — (p_mw, q_min_mvar, q_max_mvar)",
        uzasadnienie=(
            "Kształt punktu jest częścią kontraktu katalogu; punkt o innej długości to "
            "uszkodzony import, a nie krzywa o innej rozdzielczości."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-006",
        nazwa="Moc czynna punktu krzywej P-Q nieujemna",
        klasa=KlasaNiezmiennika.KONIECZNOSC_FIZYCZNA,
        podstawa="Obwiednia P-Q opisuje generację przekształtnika (P >= 0)",
        uzasadnienie=(
            "Krzywa zdolności opisuje zakres pracy od zera do mocy znamionowej; punkt o "
            "ujemnym P nie opisuje tego samego urządzenia (pobór to inny tryb, który "
            "katalog niesie osobnymi polami)."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-007",
        nazwa="Punkt krzywej P-Q wymaga q_min <= q_max",
        klasa=KlasaNiezmiennika.KONIECZNOSC_FIZYCZNA,
        podstawa="Definicja przedziału mocy biernej w punkcie obwiedni",
        uzasadnienie=(
            "Para (q_min, q_max) z q_min > q_max opisuje zbiór PUSTY — punkt pracy o "
            "takim przedziale nie istnieje, więc nie jest to rekord nietypowy, tylko "
            "sprzeczny."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-008",
        nazwa="Punkty krzywej P-Q rosnąco po p_mw",
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa="Kontrakt pola `pq_curve` — interpolacja po rosnącym p_mw",
        uzasadnienie=(
            "Konsument interpoluje obwiednię po p_mw; nieposortowana albo powtarzająca "
            "się odcięta dałaby wynik zależny od kolejności wierszy, czyli złamanie "
            "determinizmu."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-009",
        nazwa="Kształt modelu widmowego karty (rodzaj ↔ źródło i część wewnętrzna)",
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa=(
            "Kontrakt karty widmowej `dziedziny.karta_widmowa.KartaWidmowa` (karta AB-H0 "
            "§0.4.3; reguła `widmo.ksztalt`) — przecelowana z dawnego pola "
            "`ConverterType.harmonic_spectrum_percent` (skasowanego, 0/176 pozycji z widmem)"
        ),
        uzasadnienie=(
            "Rodzaj modelu określa, co model niesie: widmo prądu/napięcia — tylko źródło, "
            "równoważnik Nortona/Thevenina — źródło i część wewnętrzna na tej samej siatce, "
            "równoważnik zależny od częstotliwości — wyłącznie część wewnętrzna. Rekord "
            "o innym kształcie to uszkodzony zapis, a nie inna reprezentacja tej samej danej."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-010",
        nazwa="Zakres nastawialności wymaga min <= max",
        klasa=KlasaNiezmiennika.KONIECZNOSC_FIZYCZNA,
        podstawa="Definicja przedziału nastaw aparatu (Ir/Isd/Ii/tr/tsd)",
        uzasadnienie=(
            "Para (min, max) z min > max opisuje zbiór PUSTY nastaw — aparat o takim "
            "zakresie nie istnieje. Cicha zamiana granic miejscami byłaby poprawianiem "
            "danych producenta, czego katalog robić nie może."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-011",
        nazwa="Współczynnik emisji migotania flicker_c dodatni",
        klasa=KlasaNiezmiennika.KONIECZNOSC_FIZYCZNA,
        podstawa="Definicja współczynnika c(psi_k, v_a) migotania (wielkość dodatnia)",
        uzasadnienie=(
            "Współczynnik migotania mnoży moc znamionową w ocenie emisji; zero albo "
            "wartość ujemna oznaczałaby źródło, które migotania nie wnosi wcale albo je "
            "odejmuje — takiego urządzenia nie ma."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-012",
        nazwa="Statyzm P/f przekształtnika grid-forming dodatni",
        klasa=KlasaNiezmiennika.KONIECZNOSC_FIZYCZNA,
        podstawa="Definicja statyzmu s = -(df/f_n)/(dP/P_n) regulatora pierwotnego",
        uzasadnienie=(
            "Statyzm zerowy znaczy regulator o nieskończonym wzmocnieniu, ujemny — "
            "dodatnie sprzężenie zwrotne rozbiegające częstotliwość. Żaden z tych "
            "przypadków nie opisuje urządzenia, które można wpiąć do sieci."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-013",
        nazwa="Statyzm Q/U przekształtnika grid-forming dodatni",
        klasa=KlasaNiezmiennika.KONIECZNOSC_FIZYCZNA,
        podstawa="Definicja statyzmu napięciowego regulatora mocy biernej",
        uzasadnienie=(
            "Jak KAT-T-012, dla toru Q/U: zero i wartość ujemna opisują regulator, "
            "który nie stabilizuje napięcia, tylko je rozbiega."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-014",
        nazwa="Model widmowy niepusty (karta ma model, model ze źródłem ma składowe)",
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa=(
            "Kontrakt karty widmowej (karta AB-H0 §0.7.1; reguła `widmo.niepuste`) — "
            "przecelowana z dawnego pola `harmonic_spectrum_percent`"
        ),
        uzasadnienie=(
            "Jak KAT-T-004: brak widma to brak karty, nie pusta karta ani pusty model, "
            "który konsument policzyłby jako „widmo zerowe”."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-015",
        nazwa=(
            "Częstotliwość składowej widma > 0 Hz, w zakresie częstotliwości modelu, "
            "bez duplikatów"
        ),
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa=(
            "Kontrakt karty widmowej (karta AB-H0 §0.4.4; reguła `widmo.czestotliwosc`) — "
            "częstotliwość f w Hz z liczb rzeczywistych dodatnich zastępuje dawny „rząd "
            "całkowity 2..50”"
        ),
        uzasadnienie=(
            "Kontrakt przyjmuje f ∈ R+ (także interharmoniczne i supraharmoniczne), więc "
            "całkowity rząd nie jest już warunkiem. Częstotliwość niedodatnia nie istnieje, "
            "duplikat daje dwie wartości jednej składowej (wynik zależny od kolejności "
            "wierszy), a składowa spoza zakresu dokumentu jest ekstrapolacją danych."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-016",
        nazwa="Amplituda składowej nieujemna, udział procentowy <= 100 % z nazwaną bazą",
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa=(
            "Kontrakt karty widmowej (karta AB-H0 §0.4.5; reguła `widmo.amplituda`) — "
            "procent zawsze z nazwaną bazą (I_n urządzenia, I_1 w punkcie pracy, U_1, U_n)"
        ),
        uzasadnienie=(
            "Amplituda ujemna nie istnieje; „% prądu znamionowego” i „% podstawowej” to "
            "różne wielkości, więc goły procent jest niejednoznaczny. Górna granica 100 % "
            "bazy jest granicą zakresu produktu (widmo emisji, nie stan awaryjny) — klasa "
            "słabsza z dwóch, nie twierdzimy więcej, niż wiemy."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-017",
        nazwa="Hierarchia mocy karty przekształtnika",
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa="Kontrakt karty mocy: Pzainst >= Pn,AC >= Pprzylacz >= Posiagl",
        uzasadnienie=(
            "Cztery moce karty są zdefiniowane jako coraz węższe ograniczenia tego samego "
            "źródła, więc kolejność wynika z definicji pól karty, a nie z prawa fizyki. "
            "Sprawdzane są wyłącznie pary OBECNE — karta wypełniona częściowo nigdy nie "
            "odpada przez pole, którego nie ma."
        ),
    ),
    # -----------------------------------------------------------------------
    # network_model/catalog/types.py — bateria BESS
    # -----------------------------------------------------------------------
    RegulaKatalogu(
        kod="KAT-T-018",
        nazwa="Pojemność pakietu baterii dodatnia",
        klasa=KlasaNiezmiennika.KONIECZNOSC_FIZYCZNA,
        podstawa="Definicja pojemności znamionowej pakietu [kWh]",
        uzasadnienie="Pakiet o pojemności zerowej albo ujemnej nie jest magazynem energii.",
    ),
    RegulaKatalogu(
        kod="KAT-T-019",
        nazwa="Napięcie znamionowe szyny DC dodatnie",
        klasa=KlasaNiezmiennika.KONIECZNOSC_FIZYCZNA,
        podstawa="Definicja napięcia znamionowego szyny DC [V]",
        uzasadnienie="Szyna o napięciu zerowym albo ujemnym nie opisuje istniejącego pakietu.",
    ),
    RegulaKatalogu(
        kod="KAT-T-020",
        nazwa="Szybkość ładowania C-rate dodatnia",
        klasa=KlasaNiezmiennika.KONIECZNOSC_FIZYCZNA,
        podstawa="Definicja C-rate jako wielokrotności pojemności na godzinę [1/h]",
        uzasadnienie=(
            "C-rate zerowy opisuje pakiet, którego nie da się naładować ani rozładować; "
            "ujemny nie ma interpretacji."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-021",
        nazwa="Chemia ogniwa z zamkniętego słownika",
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa="Kontrakt katalogu — chemie LFP / NMC / LTO",
        uzasadnienie=(
            "Produkt deklaruje wynik dla trzech chemii, dla których niesie dane "
            "eksploatacyjne. Chemia spoza słownika nie jest błędem fizyki, tylko "
            "pozycją, dla której produkt nie ma czym policzyć — i ma to powiedzieć "
            "wprost, a nie przyjąć rekord i milczeć."
        ),
    ),
    # -----------------------------------------------------------------------
    # network_model/catalog/types.py — wkladka topikowa nN
    # -----------------------------------------------------------------------
    RegulaKatalogu(
        kod="KAT-T-022",
        nazwa="Wkładka topikowa ma znamionową zdolność wyłączania",
        klasa=KlasaNiezmiennika.WYMOG_NORMOWY,
        podstawa="IEC 60269-1 — znamionowa zdolność wyłączania jest wielkością znamionową wkładki",
        uzasadnienie=(
            "Norma wymaga tej wielkości dla każdej wkładki, więc `None`/0 w katalogu to "
            "BRAK DANEJ, a nie stan „nie dotyczy”. Ciche `None` przeniosłoby się do "
            "dowodu wytrzymałości nN jako SN-owe NIE_DOTYCZY i pozycja bez zdolności "
            "wyłączania przeszłaby dobór."
        ),
    ),
    # -----------------------------------------------------------------------
    # network_model/catalog/audit2_catalogs.py
    # -----------------------------------------------------------------------
    RegulaKatalogu(
        kod="KAT-T-023",
        nazwa="Pasmo TCC wkładki ma adres tabeli producenta",
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa="Wzorzec proweniencji katalogu — pasmo przepisane z tabeli producenta",
        uzasadnienie=(
            "Pasmo czasowo-prądowe bez adresu tabeli, z której je przepisano, jest "
            "nieweryfikowalne — a katalog niesie WYŁĄCZNIE dane o ustalonym pochodzeniu."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-024",
        nazwa="Pasmo TCC niepuste",
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa="Kontrakt pola `pasmo_tcc` — `None` znaczy „pasma nie ma”",
        uzasadnienie=(
            "Pasmo bez punktów nie jest pasmem; brak danych zapisujemy `None`, żeby "
            "konsument nie policzył pustej listy jako „brak ograniczenia czasowego”."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-025",
        nazwa="Prąd krótkotrwały aparatu SN z szeregu znormalizowanego",
        klasa=KlasaNiezmiennika.WYMOG_NORMOWY,
        podstawa="IEC 62271-1 — szereg znamionowych prądów krótkotrwałych wytrzymywanych",
        uzasadnienie=(
            "Norma wymienia szereg wartości znamionowych; aparat SN o I_th spoza szeregu "
            "nie ma znamionowania, które produkt potrafi zestawić z wynikiem zwarciowym."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-026",
        nazwa="Czas trwania zwarcia aparatu SN z szeregu znormalizowanego",
        klasa=KlasaNiezmiennika.WYMOG_NORMOWY,
        podstawa="IEC 62271-1 — szereg znamionowych czasów trwania zwarcia",
        uzasadnienie=(
            "Prąd krótkotrwały jest znamionowany ŁĄCZNIE z czasem odniesienia; czas spoza "
            "szeregu unieruchamialby przeliczenie I_th na inny czas (reguła I^2t)."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-027",
        nazwa="Statyzm LFSM w przedziale nastawialnym",
        klasa=KlasaNiezmiennika.WYMOG_NORMOWY,
        podstawa="NC RfG art. 13 ust. 2 — przedział nastawialny statyzmu LFSM-O",
        uzasadnienie=(
            "Rozporządzenie wyznacza przedział nastawialny wprost; profil poza nim nie "
            "jest profilem NC RfG, tylko innym trybem regulacji."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-028",
        nazwa="Strefa nieczułości LFSM w przedziale nastawialnym",
        klasa=KlasaNiezmiennika.WYMOG_NORMOWY,
        podstawa="NC RfG art. 13 ust. 2 — przedział strefy nieczułości LFSM-O",
        uzasadnienie="Jak KAT-T-027, dla strefy nieczułości progu częstotliwościowego.",
    ),
    RegulaKatalogu(
        kod="KAT-T-029",
        nazwa="Zakres pracy częstotliwościowej z załącznika normowego",
        klasa=KlasaNiezmiennika.WYMOG_NORMOWY,
        podstawa="NC RfG załącznik II tab. 2 — zakresy częstotliwości obszaru synchronicznego",
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
        nazwa="Czas wyłączenia tablicy w przedziale (0; 5] s",
        klasa=KlasaNiezmiennika.WYMOG_NORMOWY,
        podstawa="IEC 60364-4-41 tab. 41.1 — najdłuższe dopuszczalne czasy wyłączenia",
        uzasadnienie=(
            "Tablica normy nie wykracza poza 5 s (obwód rozdzielczy); wpis powyżej nie "
            "pochodzi z tej tablicy, a wpis niedodatni nie jest czasem."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-031",
        nazwa="Wpis tablicy czasów wyłączenia ma proweniencję",
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa="Wzorzec proweniencji katalogu — każdy wpis tablicy niesie podstawę",
        uzasadnienie=(
            "Wartość normowa bez wskazania miejsca w normie jest nierozróżnialna od "
            "liczby wpisanej z pamięci — a dowód ma cytować podstawę, nie liczbę."
        ),
    ),
    # -----------------------------------------------------------------------
    # network_model/catalog/lv_ampacity_iec60364_5_52.py
    # -----------------------------------------------------------------------
    RegulaKatalogu(
        kod="KAT-T-032",
        nazwa="Współczynnik tablicowy obciążalności w przedziale (0; 1,3]",
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa="IEC 60364-5-52 — tablice współczynników poprawkowych obciążalności",
        uzasadnienie=(
            "Współczynniki tablic normy nie wychodzą poza ten przedział; wartość spoza "
            "niego oznacza pomyloną kolumnę przy przepisywaniu tablicy, a nie warunek "
            "ułożenia, którego norma nie przewidziała."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-033",
        nazwa="Wpis tablicy obciążalności ma proweniencję",
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa="Wzorzec proweniencji katalogu — każdy wpis tablicy niesie podstawę",
        uzasadnienie="Jak KAT-T-031, dla tablic obciążalności długotrwałej.",
    ),
    # -----------------------------------------------------------------------
    # dziedziny/karta_widmowa.py — karta widmowa urządzenia (karta AB-H0 §0.7)
    # (KAT-T-009, 014, 015, 016 wyżej są PRZECELOWANE na rekord karty)
    # -----------------------------------------------------------------------
    RegulaKatalogu(
        kod="KAT-T-034",
        nazwa="Identyfikatory modeli karty widmowej unikalne",
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa="Kontrakt karty widmowej (reguła `karta.modele_unikalne`)",
        uzasadnienie=(
            "Identyfikator modelu wskazuje model w wyborze (f, punkt pracy) i w "
            "proweniencji elementu; dwa modele o jednym identyfikatorze czynią odnośnik "
            "niejednoznacznym."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-035",
        nazwa="Dowód karty widmowej jest dowodem widma w dziedzinie częstotliwości",
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa="Kontrakt karty widmowej (reguły `karta.dowody`, `dowod.pokrywa`)",
        uzasadnienie=(
            "Karta niesie raport badań, pomiar albo certyfikat modelu pokrywający dziedzinę "
            "harmoniczną lub supraharmoniczną; certyfikat zgodności NC RfG albo dowód "
            "innej dziedziny w karcie widmowej podniósłby status sekcji, której nie dotyczy."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-036",
        nazwa="Podstawa danych widma: karta producenta albo założenie projektowe",
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa=(
            "Kontrakt karty widmowej (reguła `widmo.podstawa`) i `werdykt.PodstawaWymagania`"
        ),
        uzasadnienie=(
            "Dane urządzenia pochodzą z dokumentu producenta albo od inżyniera projektu; "
            "podstawa innego rodzaju (norma, OSD) albo podstawa o stanie mocniejszym niż "
            "pozwalają jej pola kłamałaby o pochodzeniu widma."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-037",
        nazwa="Faza składowej widma: nieznana to nie zero, interharmoniczna bez fazy",
        klasa=KlasaNiezmiennika.KONIECZNOSC_FIZYCZNA,
        podstawa="Definicja fazy względnej składowej wobec podstawowej (karta AB-H0 §0.4.6)",
        uzasadnienie=(
            "Faza składowej o częstotliwości niebędącej wielokrotnością podstawowej nie ma "
            "stałego odniesienia — nie istnieje jako liczba. Faza nieznana zapisana jako 0 "
            "czyni sumę fazorową fałszywą (sonda P10: dwa źródła 5 % = jedno 10 %)."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-038",
        nazwa="Komplet parametrów pomiaru widma zmierzonego (RBW dla supraharmonicznych)",
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa=(
            "Kontrakt parametrów pomiaru `dziedziny.pomiar` (karta AB-H0 §0.5; reguła "
            "`widmo.pomiar`)"
        ),
        uzasadnienie=(
            "Widmo zmierzone bez metody, rozdzielczości, okna, agregacji i dokumentu nie ma "
            "określonego zakresu ważności; w paśmie supraharmonicznym wynik zależy od pasma "
            "rozdzielczości analizatora."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-039",
        nazwa="Częstotliwość przełączania wyłącznie w modelu dziedziny supraharmonicznej",
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa=(
            "Niezmiennik produktu „częstotliwość przełączania nigdy w DAE” (karta AB-H0 "
            "§0.14; reguła `widmo.przelaczanie`)"
        ),
        uzasadnienie=(
            "Częstotliwość przełączania opisuje emisję w paśmie 2–150 kHz; w modelu "
            "harmonicznym nie ma konsumenta, a jej obecność zachęcałaby do użycia jej tam, "
            "gdzie produkt jej nie modeluje."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-040",
        nazwa="Przedziały punktu pracy widma z jawnym domknięciem i porządkiem granic",
        klasa=KlasaNiezmiennika.KONIECZNOSC_FIZYCZNA,
        podstawa="Definicja przedziału liczbowego (reguła `kanon.przedzial`)",
        uzasadnienie=(
            "Przedział z granicą dolną większą od górnej albo zdegenerowany i otwarty jest "
            "zbiorem PUSTYM — model o takiej domenie nie obejmuje żadnego punktu pracy."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-T-041",
        nazwa="Karta widmowa katalogu statycznego z wyciągiem dokumentu przypiętym SHA-256",
        klasa=KlasaNiezmiennika.OGRANICZENIE_ZAKRESU_PRODUKTU,
        podstawa=(
            "Wzorzec karty z dokumentem (SPEC_KATALOGI — wzorzec ABB Emax 2; karta AB-H0 "
            "§0.9.4): katalog statyczny przyjmuje widmo WYŁĄCZNIE z dokumentem producenta"
        ),
        uzasadnienie=(
            "Bez dokumentu karta w katalogu statycznym byłaby widmem „typowym” podanym jako "
            "dana urządzenia — dokładnie fabrykacja, której katalog zabrania. Skrót SHA-256 "
            "wiąże rekord z konkretnym wyciągiem, więc podmiana dokumentu jest wykrywalna."
        ),
    ),
    # -----------------------------------------------------------------------
    # REGULY WIARYGODNOSCI — sygnal do przegladu, NIGDY odmowa
    # -----------------------------------------------------------------------
    RegulaKatalogu(
        kod="KAT-W-001",
        nazwa="R0 >= R1 przewodu",
        klasa=KlasaNiezmiennika.WIARYGODNOSC,
        podstawa="Typowa konstrukcja żyły powrotnej / ekranu z powrotem ziemnym",
        uzasadnienie=(
            "Rezystancja składowej zerowej zależy od konstrukcji żyły powrotnej, ekranu i "
            "drogi powrotu przez ziemię. Dla konstrukcji z powrotem ziemnym R0 jest "
            "zwykle kilkukrotnie większe, ale nie jest to nierówność uniwersalna dla "
            "każdej konstrukcji kabla i linii. Twarda bramka odrzuciłaby poprawny rekord "
            "spoza dotychczasowego zbioru."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-W-002",
        nazwa="P0 < Pk transformatora",
        klasa=KlasaNiezmiennika.WIARYGODNOSC,
        podstawa="Relacja typowa dla transformatorów rozdzielczych",
        uzasadnienie=(
            "Straty jałowe są zwykle ułamkiem strat obciążeniowych, ale nie jest to "
            "konieczność matematyczna dla każdej rodziny konstrukcyjnej. Odwrócenie pary "
            "zwykle oznacza zamienione kolumny przy imporcie — i o tym ma powiedzieć "
            "ostrzeżenie, a nie odmowa wczytania pozycji."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-W-003",
        nazwa="Icw <= Icu aparatu SN",
        klasa=KlasaNiezmiennika.WIARYGODNOSC,
        podstawa="IEC 62271-100 — Icw i Icu są ODDZIELNYMI wielkościami znamionowymi",
        uzasadnienie=(
            "Prąd krótkotrwały wytrzymywany (przewodzenie bez uszkodzenia) i zdolność "
            "wyłączania (przerwanie prądu) to różne zdolności, znamionowane osobno. "
            "Globalna nierówność po całej rodzinie aparatów SN nie ma podstawy normowej "
            "i mogłaby odrzucić poprawny rekord aparatu, dla którego norma tej relacji "
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
            "mogłaby być twarda. Dla Icw takiej definicji NIE MA: norma opisuje je osobno "
            "(§ 4.3.5.4), jako wytrzymałość krótkotrwała wyłącznika kategorii B przez "
            "zadany czas, a nie jako ułamek zdolności wyłączalnej. Porównywać je wolno "
            "wyłącznie dla tego samego wariantu, napięcia i czasu."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-W-005",
        nazwa="0 < R/X < 1 umowy równoważnej sieci",
        klasa=KlasaNiezmiennika.WIARYGODNOSC,
        podstawa="Typowa charakterystyka równoważnika sieci SN (silnie indukcyjna)",
        uzasadnienie=(
            "Równoważnik sieci SN jest zwykle silnie indukcyjny, ale równoważnik "
            "rezystancyjny albo specjalnie zdefiniowany może mieć R/X >= 1. Ograniczenie "
            "należy do zakresu produktu, nie do fizyki — a dopóki zakres nie jest "
            "zadeklarowany, twarda bramka jest nieuzasadniona."
        ),
    ),
    RegulaKatalogu(
        kod="KAT-W-006",
        nazwa="0 < i0 % < 10 transformatora",
        klasa=KlasaNiezmiennika.WIARYGODNOSC,
        podstawa="Zakres typowy dla transformatorów rozdzielczych",
        uzasadnienie=(
            "Zakres rozsądny dla transformatorów rozdzielczych, ale nie uniwersalny dla "
            "transformatorów specjalnych. Górna granica 10 % była kontrolą jednostki "
            "(procent kontra ułamek), a nie wielkością normowaną."
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
            f"Kod reguły katalogu {kod!r} nie istnieje w rejestrze REGULY_KATALOGU."
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
            f"{kod}: reguła klasy {wpis.klasa} jest MIĘKKA — wiarygodność raportuje "
            "odstępstwo przez `przeglad_wiarygodnosci`, nigdy nie odmawia rekordu."
        )
    raise OdmowaKatalogu(f"{komunikat} (kod reguły: {kod})", kod=kod)


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
        etykieta_pl="Źródła systemowe (GPZ)",
        kody=("KAT-W-005",),
    ),
}

#: Rodziny katalogu BEZ reguly wiarygodnosci, z powodem merytorycznym. Rodzina
#: pominieta milczeniem bylaby nierozroznialna od przeoczonej.
RODZINY_BEZ_REGUL: dict[str, str] = {
    "switch-equipment": (
        "Aparat łączeniowy pola bez znamion zwarciowych w kontrakcie typu — relacje "
        "Icw/Icu niesie rodzina aparatów SN."
    ),
    "lv-breaker-mcb": (
        "Wyłącznik nadprądowy MCB: kontrakt niesie pasmo wyzwalania z IEC 60898-1, bez "
        "pary Icw/Icu, na której działa reguła wiarygodności."
    ),
    "lv-fuse-link": (
        "Wkładka topikowa nie ma prądu krótkotrwałego wytrzymywanego — jej zdolność "
        "wyłączania jest bramką TWARDĄ (KAT-T-022), nie sygnałem do przeglądu."
    ),
    "load": "Typ odbioru nie niesie impedancji składowych ani znamion zwarciowych.",
    "ct": "Przekładnik prądowy: znamiona dokładności i przetężenia, bez par objętych regułami.",
    "vt": "Przekładnik napięciowy: jak CT.",
    "surge-arrester": (
        "Ogranicznik przepięć: znamiona napięciowo-energetyczne (Um, MCOV, Ures, BIL), "
        "bez par objętych regułami."
    ),
    "shunt-capacitor": "Bateria kondensatorów: moc bierna i napięcie, bez par objętych regułami.",
    "pv-inverter": (
        "Przekształtnik PV: udział zwarciowy k_sc jest bramką TWARDĄ (KAT-T-003); brak "
        "k_sc jest BRAKIEM DANEJ raportowanym przez miernik gotowości, nie odstępstwem."
    ),
    "bess-inverter": "Przekształtnik magazynu: jak PV.",
    "bess-battery": (
        "Pakiet baterii: pojemność / napięcie DC / C-rate są bramkami TWARDYMI " "(KAT-T-018..020)."
    ),
    "converter": "Przekształtnik (PV/BESS/WIND) — jak PV.",
    "wind-inverter": "Przekształtnik farmy wiatrowej — podzbiór rodziny przekształtników.",
    "der-dynamic": (
        "Profil dynamiczny DER nie jest rekordem sprzętu — jego zakresy są bramkami "
        "TWARDYMI wyprowadzonymi z NC RfG (KAT-T-027..029)."
    ),
    "branch-point": "Punkt odgałęźny (słup/ZKSN): geometria i wyposażenie, bez wielkości objętych regułami.",
    "switchgear-families": "Rodzina rozdzielnicy to kontener konfiguracyjny, nie rekord sprzętu.",
    "complete-bay-templates": "Szablon pola to zestawienie pozycji katalogu, nie pozycja katalogu.",
    "protection-device": (
        "Zabezpieczenie: nastawy i krzywe czasowo-prądowe, bez par wielkości znamionowych "
        "objętych regułami wiarygodności."
    ),
    "ptpiree-certificates": (
        "Wykaz certyfikatów PTPiREE to rejestr dokumentów, nie rekordów sprzętu."
    ),
    "synchronous-generator": (
        "Generator synchroniczny: reaktancje podprzejściowe/przejściowe i stałe czasowe, "
        "bez par objętych regułami (relacja x''<x'<x nie była u nas nigdy bramką i nie ma "
        "dziś konsumenta przeglądu)."
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
    "KAT-W-001": "pozycja nie niesie rezystancji składowej zerowej (R0)",
    "KAT-W-002": "pozycja nie niesie strat jałowych (P0) albo obciążeniowych (Pk)",
    "KAT-W-003": (
        "aparat bez dodatniej zdolności wyłączania — odłącznik, rozłącznik albo uziemnik "
        "z definicji nie przerywa prądu zwarciowego"
    ),
    "KAT-W-004": (
        "aparat bez dodatniej zdolności wyłączania Icu albo bez prądu krótkotrwałego Icw "
        "w karcie katalogowej"
    ),
    "KAT-W-005": "źródło nie niesie stosunku R/X (ani wariantu maksymalnego, ani minimalnego)",
    "KAT-W-006": "transformator nie niesie prądu biegu jałowego (i0 %)",
}


def przeglad_rodziny(rodzina: str, pozycje: Iterable[Any]) -> WynikPrzegladuWiarygodnosci:
    """Przeglad wiarygodnosci JEDNEJ rodziny katalogu.

    ZERO ODMOWY, ZERO ZMIAN DANYCH. Regula wiarygodnosci nigdy nie podnosi
    wyjatku i niczego nie poprawia — jej zlamanie jest sygnalem „do przegladu", a
    decyzje podejmuje czlowiek z karta producenta w reku.
    """
    if rodzina not in RODZINY_PRZEGLADU:
        raise BladRejestruNiezmiennikow(
            f"Rodzina {rodzina!r} nie jest objęta przeglądem wiarygodności. "
            f"Dostępne: {', '.join(sorted(RODZINY_PRZEGLADU))}."
        )
    specyfikacja = RODZINY_PRZEGLADU[rodzina]
    lista = list(pozycje)
    odstepstwa: list[OdstepstwoWiarygodnosci] = []
    policzone: dict[str, int] = {kod: 0 for kod in specyfikacja.kody}
    pominiete: dict[str, int] = {kod: 0 for kod in specyfikacja.kody}
    for kod in specyfikacja.kody:
        if kod not in PREDYKATY_WIARYGODNOSCI:
            raise BladRejestruNiezmiennikow(
                f"Rodzina {rodzina!r} wskazuje kod {kod}, dla którego nie ma predykatu "
                "przeglądu — reguła bez predykatu nie jest sprawdzana."
            )
        if kod not in POWODY_POMINIECIA:
            raise BladRejestruNiezmiennikow(
                f"Reguła {kod} nie ma nazwanego powodu pominięcia — „pominięto N pozycji” "
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
            f"Przegląd wiarygodności wymaga kompletu rodzin — brakuje: {', '.join(brakujace)}."
        )
    nadmiarowe = sorted(set(rodziny) - set(RODZINY_PRZEGLADU))
    if nadmiarowe:
        raise BladRejestruNiezmiennikow(f"Rodziny spoza przeglądu: {', '.join(nadmiarowe)}.")
    return tuple(przeglad_rodziny(nazwa, rodziny[nazwa]) for nazwa in sorted(rodziny))

"""Katalog analiz specjalistycznych V12.6 — JEDNO źródło prawdy dla ekranu
„Analizy specjalistyczne” (karta B-02 / W3-E, 2026-09-10).

DLACZEGO W BACKENDZIE. Do tej karty front trzymał własny katalog rodzajów
(`ui2/wyniki/akademickie/prezentacja.ts`: pytanie inżynierskie, kryterium,
norma) obok listy kodów z `GET /api/catalog/v126/analysis-types` — dwa miejsca
prawdy o tym, CO analiza rozstrzyga i WOBEC CZEGO. Dyrektywa właściciela
(B-02 §3.1, §9): katalog analiz pozostaje po stronie backendu, front go
wyłącznie prezentuje. Ten moduł opisuje każdy rodzaj kontraktu
`V126AnalysisType` (komplet 14 — pilnuje test parytetu) w języku inżynierskim:

  * GRUPA — realne znaczenie inżynierskie (jakość energii i stabilność,
    uziemienia i izolacja, aparatura i stany przejściowe, niezawodność
    i niepewność), NIE kod ani moduł;
  * PYTANIE INŻYNIERSKIE — co analiza rozstrzyga (jedno zdanie);
  * BADANY ZAKRES — jakie elementy modelu i w jakich warunkach;
  * GŁÓWNE WIELKOŚCI — symbol, nazwa, jednostka;
  * PODSTAWA OCENY — WYŁĄCZNIE tam, gdzie solver FROZEN
    (`network_model/solvers/v126_academic.py`) realnie stosuje próg:
    wielkość, warunek, wartość graniczna, źródło. Liczby graniczne są
    LITERAŁAMI solvera (margines BIL 20 %, zapad 15 %,
    margines TRV 10 %, I_res ≤ 10 % I_C…) — parytet z solverem pilnuje
    `tests/test_v126_katalog_analiz.py`, bo solver ich nie eksportuje (B-01,
    nie edytujemy go). Rodzaj bez progu w solverze mówi to WPROST
    (`bez_podstawy_pl`) i NIGDY nie dostaje progu w interfejsie;
  * DANE WEJŚCIOWE z rozdziałem źródeł: z modelu / od użytkownika (z flagą
    „wymagane”) / domyślne solvera (tylko parametry METODY, które solver
    dokumentuje jako parametr, nie dane elementu — patrz karta §0 poz. 4).

ZERO fizyki: moduł jest opisem, nie obliczeniem. Kolejność pozycji = kolejność
prezentacji (determinizm).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from solver_input.v126_contracts import V126AnalysisType

# --- Grupy inżynierskie -----------------------------------------------------

GRUPA_JAKOSC = "jakosc_energii_i_stabilnosc"
GRUPA_UZIEMIENIA = "uziemienia_i_izolacja"
GRUPA_APARATURA = "aparatura_i_stany_przejsciowe"
GRUPA_NIEZAWODNOSC = "niezawodnosc_i_niepewnosc"
GRUPA_WYCOFANE = "wycofane_z_powierzchni"

NAZWY_GRUP: dict[str, str] = {
    GRUPA_JAKOSC: "Jakość energii i stabilność przekształtników",
    GRUPA_UZIEMIENIA: "Uziemienia, punkt neutralny i izolacja",
    GRUPA_APARATURA: "Aparatura i stany przejściowe",
    GRUPA_NIEZAWODNOSC: "Niezawodność i niepewność wyniku",
    GRUPA_WYCOFANE: "Rodzaje wycofane z powierzchni",
}

#: Kolejność prezentacji grup (determinizm ekranu).
KOLEJNOSC_GRUP: tuple[str, ...] = (
    GRUPA_JAKOSC,
    GRUPA_UZIEMIENIA,
    GRUPA_APARATURA,
    GRUPA_NIEZAWODNOSC,
    GRUPA_WYCOFANE,
)


@dataclass(frozen=True)
class WielkoscGlowna:
    symbol: str
    nazwa_pl: str
    jednostka: str
    #: Karta V12.7 §0.1 — zapis LaTeX SYMBOLU (nie wzoru), renderowany
    #: `MathInline`. Pole WYMAGANE (bez wartości domyślnej): nowa wielkość
    #: katalogu nie powstanie bez zapisu LaTeX — brak argumentu jest błędem
    #: konstrukcji (nie kompiluje się), a test kompletności
    #: (`tests/application/analyses/test_v126_katalog_latex.py`) dodatkowo
    #: sprawdza zero pustych `symbol_latex` w całym katalogu (obrona przed
    #: pustym napisem przekazanym jawnie).
    symbol_latex: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "symbol": self.symbol,
            "nazwa_pl": self.nazwa_pl,
            "jednostka": self.jednostka,
            "symbol_latex": self.symbol_latex,
        }


@dataclass(frozen=True)
class PodstawaOceny:
    """Kryterium stosowane przez solver — wielkość, warunek, granica, źródło."""

    wielkosc_pl: str
    symbol: str
    jednostka: str
    warunek_pl: str
    #: Liczba graniczna (literał solvera) albo opis słowny, gdy granica jest
    #: wielkością wyznaczaną przez solver z danych (np. U_dot,dop z ρ_s i t_f).
    wartosc_graniczna: float | str
    zrodlo_pl: str
    #: Karta V12.7 §0.1 — zapis LaTeX symbolu (`MathInline`). Pole WYMAGANE
    #: (bez wartości domyślnej) — brak argumentu nie kompiluje się; test
    #: kompletności sprawdza dodatkowo zero pustych napisów.
    symbol_latex: str
    #: Karta V12.7 §0.1 — pełna nierówność/warunek jako LaTeX (`MathInline`),
    #: np. `U_{\\mathrm{dot}} \\leq U_{\\mathrm{dot,dop}}`. Pole WYMAGANE.
    warunek_latex: str
    #: Karta V12.7 §0.1 — zapis LaTeX WZORU granicy (`MathBlock`), WYŁĄCZNIE
    #: gdy `wartosc_graniczna` jest napisem (granica wyznaczana wzorem, nie
    #: stałym literałem) — inaczej pusty. Opis parametrów w `wzor_opis_pl`.
    wzor_latex: str = ""
    #: Opis parametrów wzoru granicy (np. „ρ_s — rezystywność warstwy
    #: powierzchniowej, C_s — współczynnik redukcji, t_f — czas wyłączenia
    #: zwarcia; IEEE 80, metoda Sveraka”). Pusty, gdy `wzor_latex` pusty.
    wzor_opis_pl: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "wielkosc_pl": self.wielkosc_pl,
            "symbol": self.symbol,
            "jednostka": self.jednostka,
            "warunek_pl": self.warunek_pl,
            "wartosc_graniczna": self.wartosc_graniczna,
            "zrodlo_pl": self.zrodlo_pl,
            "symbol_latex": self.symbol_latex,
            "warunek_latex": self.warunek_latex,
            "wzor_latex": self.wzor_latex,
            "wzor_opis_pl": self.wzor_opis_pl,
        }


@dataclass(frozen=True)
class DanaZModelu:
    nazwa_pl: str
    #: Które elementy modelu ją niosą (język inżynierski, nie nazwy pól).
    elementy_pl: str

    def to_dict(self) -> dict[str, Any]:
        return {"nazwa_pl": self.nazwa_pl, "elementy_pl": self.elementy_pl}


@dataclass(frozen=True)
class ParametrUzytkownika:
    """Dana, której model nie niesie — podaje ją projektant.

    ``klucz`` = klucz w ``V126RunRequest.parameters`` (dla obiektów złożonych
    notacja ``obiekt.pole`` albo ``lista[].pole``) — ten sam, który obsługuje
    formularz ``ui2/wyniki/akademickie/parametry.ts`` (parytet CI).
    """

    klucz: str
    nazwa_pl: str
    jednostka: str
    wymagane: bool
    opis_pl: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "klucz": self.klucz,
            "nazwa_pl": self.nazwa_pl,
            "jednostka": self.jednostka,
            "wymagane": self.wymagane,
            "opis_pl": self.opis_pl,
        }


@dataclass(frozen=True)
class DomyslnaSolvera:
    """Parametr METODY z udokumentowaną wartością domyślną solvera."""

    klucz: str
    nazwa_pl: str
    wartosc: float | str
    jednostka: str
    uzasadnienie_pl: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "klucz": self.klucz,
            "nazwa_pl": self.nazwa_pl,
            "wartosc": self.wartosc,
            "jednostka": self.jednostka,
            "uzasadnienie_pl": self.uzasadnienie_pl,
        }


@dataclass(frozen=True)
class KartaAnalizy:
    kod: str
    nazwa_pl: str
    grupa: str
    pytanie_pl: str
    zakres_pl: str
    wielkosci_glowne: tuple[WielkoscGlowna, ...] = ()
    podstawa_oceny: tuple[PodstawaOceny, ...] = ()
    #: Zdanie mówiące WPROST, że solver nie stosuje progu (gdy `podstawa_oceny` puste).
    bez_podstawy_pl: str | None = None
    dane_z_modelu: tuple[DanaZModelu, ...] = ()
    od_uzytkownika: tuple[ParametrUzytkownika, ...] = ()
    domyslne_solvera: tuple[DomyslnaSolvera, ...] = ()
    prezentowany: bool = True
    powod_wycofania_pl: str | None = None
    #: Karta AB-1d_min krok 3 — następca rodzaju WYCOFANEGO, który ekran „Analizy
    #: specjalistyczne" pokazuje razem z powodem zamiast uruchamialnej karty (rodzaj
    #: wycofany Z następcą nie znika bez śladu: projektant, który go szuka, dowiaduje
    #: się, dlaczego go nie ma i co go zastąpi). `None` = rodzaj wycofany bez
    #: następcy na ekranie (W3-E: kanon ma własny ekran; V126-WYGASZENIE).
    nastepca_pl: str | None = None
    #: Przestrzeń nazw `GET /api/catalog/v126/{namespace}` z danymi odniesienia.
    katalog_odniesienia: str | None = None
    #: Uwagi o metodzie solvera istotne dla interpretacji (jawne, nie ukryte).
    uwagi_metody_pl: tuple[str, ...] = field(default_factory=tuple)
    #: Karta V12.7 §0.7 — zakres, jaki werdykt tego rodzaju WOLNO nazwać na
    #: ekranie: `"kryterium"` (werdykt nazywa WYŁĄCZNIE sprawdzone kryterium,
    #: np. „NIE SPEŁNIA KRYTERIUM DOPUSZCZALNEGO NAPIĘCIA DOTYKOWEGO” —
    #: domyślne dla WSZYSTKICH 14 rodzajów V12.6: żaden nie sprawdza kompletu
    #: kryteriów oceny całego układu/obiektu, więc żaden nie dostaje szerszego
    #: werdyktu) albo `"uklad"` (komplet kryteriów kontraktu oceny wykonany —
    #: wolno nazwać CAŁY układ/obiekt, np. „przyłącze zgodne”). UI czyta pole,
    #: nie zgaduje (§0.7) — front NIE wystawia werdyktu o obiekcie, dopóki to
    #: pole nie mówi `"uklad"`.
    zakres_oceny: str = "kryterium"

    def to_dict(self) -> dict[str, Any]:
        return {
            "kod": self.kod,
            "nazwa_pl": self.nazwa_pl,
            "grupa": {"kod": self.grupa, "nazwa_pl": NAZWY_GRUP[self.grupa]},
            "pytanie_pl": self.pytanie_pl,
            "zakres_pl": self.zakres_pl,
            "wielkosci_glowne": [w.to_dict() for w in self.wielkosci_glowne],
            "podstawa_oceny": [p.to_dict() for p in self.podstawa_oceny],
            "bez_podstawy_pl": self.bez_podstawy_pl,
            "dane": {
                "z_modelu": [d.to_dict() for d in self.dane_z_modelu],
                "od_uzytkownika": [p.to_dict() for p in self.od_uzytkownika],
                "domyslne_solvera": [d.to_dict() for d in self.domyslne_solvera],
            },
            "prezentowany": self.prezentowany,
            "powod_wycofania_pl": self.powod_wycofania_pl,
            "nastepca_pl": self.nastepca_pl,
            "katalog_odniesienia": self.katalog_odniesienia,
            "uwagi_metody_pl": list(self.uwagi_metody_pl),
            "zakres_oceny": self.zakres_oceny,
        }


# --- Literały progów solvera FROZEN (parytet pilnowany testem) ---------------

# Karta AB-1d_min krok 3: literały THD_U 8 % / 5 % i TDD 5 % USUNIĘTE z katalogu —
# karta „Jakość energii i harmoniczne” jest wycofana i nie publikuje podstawy oceny
# (limity harmonicznych czekają na dokument źródłowy, OD-38).
MARGINES_BIL_MIN_PROCENT = 20.0
ZAPAD_ROZRUCHU_MAX_PROCENT = 15.0
WSKAZNIK_CIEPLNY_ROZRUCHU_MAX = 1.0
MARGINES_TRV_MIN_PROCENT = 10.0
UDZIAL_2H_BLOKADA_87T_PROCENT = 10.0
PRAD_RESZTKOWY_MAX_UDZIAL_IC = 0.10
KROTNOSC_OCHRONY_DODATKOWEJ = 1.25

_PARAMETRY_UZIOMU: tuple[ParametrUzytkownika, ...] = (
    ParametrUzytkownika("earthing.gpz_ref", "Oznaczenie stacji", "-", False),
    ParametrUzytkownika("earthing.rho1_ohm_m", "Rezystywność warstwy górnej gruntu", "Ω·m", True),
    ParametrUzytkownika(
        "earthing.rho2_ohm_m",
        "Rezystywność warstwy dolnej gruntu",
        "Ω·m",
        False,
        "Raportowana w wyniku; rachunek IEEE 80 solvera używa warstwy górnej.",
    ),
    ParametrUzytkownika(
        "earthing.h1_m",
        "Grubość warstwy górnej gruntu",
        "m",
        False,
        "Raportowana w wyniku; rachunek solvera jej nie używa.",
    ),
    ParametrUzytkownika("earthing.length_m", "Długość uziomu kratowego", "m", True),
    ParametrUzytkownika("earthing.width_m", "Szerokość uziomu kratowego", "m", True),
    ParametrUzytkownika("earthing.mesh_spacing_m", "Rozstaw oczek siatki", "m", True),
    ParametrUzytkownika("earthing.buried_depth_m", "Głębokość ułożenia siatki", "m", True),
    ParametrUzytkownika(
        "earthing.rods_total_length_m", "Sumaryczna długość uziomów pionowych", "m", True
    ),
    ParametrUzytkownika(
        "earthing.split_factor", "Współczynnik podziału prądu zwarciowego", "-", True
    ),
    ParametrUzytkownika("earthing.fault_current_ka", "Prąd zwarcia doziemnego", "kA", True),
    ParametrUzytkownika("earthing.fault_clearing_time_s", "Czas wyłączenia zwarcia", "s", True),
    ParametrUzytkownika(
        "earthing.surface_layer_rho_ohm_m", "Rezystywność warstwy powierzchniowej", "Ω·m", True
    ),
    ParametrUzytkownika(
        "earthing.surface_layer_derating",
        "Współczynnik redukcji warstwy powierzchniowej",
        "-",
        True,
    ),
)

_PARAMETRY_SILNIKA: tuple[ParametrUzytkownika, ...] = (
    ParametrUzytkownika("motors[].ref", "Oznaczenie silnika", "-", True),
    ParametrUzytkownika("motors[].bus_ref", "Szyna przyłączenia", "-", True),
    ParametrUzytkownika("motors[].rated_kw", "Moc znamionowa", "kW", True),
    ParametrUzytkownika("motors[].rated_voltage_kv", "Napięcie znamionowe", "kV", True),
    ParametrUzytkownika(
        "motors[].locked_rotor_multiplier", "Krotność prądu rozruchowego", "-", True
    ),
    ParametrUzytkownika(
        "motors[].start_power_factor", "Współczynnik mocy przy rozruchu", "-", True
    ),
    ParametrUzytkownika("motors[].start_time_s", "Czas rozruchu", "s", True),
    ParametrUzytkownika(
        "motors[].allowable_locked_rotor_time_s", "Dopuszczalny czas utyku", "s", True
    ),
    ParametrUzytkownika("motors[].max_torque_pu", "Moment maksymalny", "j.w.", True),
    ParametrUzytkownika("motors[].critical_slip", "Poślizg krytyczny", "-", True),
    ParametrUzytkownika(
        "motors[].load_start_torque_pu", "Moment obciążenia przy rozruchu", "j.w.", True
    ),
)

_WYCOFANIE_HOSTING = (
    "Lokalna impedancja Thevenina per szyna, metodą Monte Carlo, bez sprzężenia sieci — "
    "kanon liczy zdolność przyłączeniową pełnym rozpływem przez wariant sieci (ekran "
    "„OZE › Zdolność przyłączeniowa”). Uruchomienie nowego biegu jest odmawiane."
)
_WYCOFANIE_OPF = (
    "Straty ze współczynnikiem obciążenia 0,45 zaszytym w solverze i zaczepem zawsze zerowym "
    "— kanon czyta straty z karty katalogowej transformatora (ekran „Kryteria › Wyposażenie”) "
    "i optymalizuje zaczep w badaniach OLTC. Uruchomienie nowego biegu jest odmawiane."
)
_WYCOFANIE_BENCHMARK = (
    "Bada, czy solver odtwarza sieci odniesienia — sprawdza narzędzie, nie projekt; "
    "miejsce tego sprawdzenia to kontrola jakości, nie ekran projektanta."
)
_WYCOFANIE_STABILNOSC = (
    "Solver nie wyznacza już wielkości tej analizy: wskaźniki stały na współczynnikach bez "
    "pokrycia w danych i normie oraz na mocy zwarciowej węzłów podstawianej z napięcia "
    "znamionowego. Powrót wymaga policzenia wielkości rozpływem, nie przywrócenia tabel."
)
# Karta AB-1d_min krok 3 — karty ekranu tych samych dwóch rodzajów, dla których
# `api/v126_academic.py::_ANALIZY_WYCOFANE` niesie treść 410; parę „rejestr withdrawn ⇔
# treść 410 ⇔ karta nieprezentowana z powodem" przypina
# `tests/application/test_rodzaje_biegow_jedna_lista.py`.
_WYCOFANIE_HARMONICZNE = (
    "Liczby tej analizy nie opisują fizyki sieci: admitancja sieci w funkcji częstotliwości "
    "bez modeli elementów zależnych od częstotliwości, ciche pseudoodwrócenie macierzy, "
    "impedancja źródła przyjęta z założenia i limity THD/TDD zaszyte bez dokumentu "
    "źródłowego. Uruchomienie nowego biegu jest odmawiane."
)
_NASTEPCA_HARMONICZNE = (
    "Rozpływ harmonicznych na osi częstotliwości w hercach (także interharmoniczne) "
    "z modelami elementów zależnymi od częstotliwości — do czasu jego rdzenia produkt "
    "nie pokazuje żadnej liczby harmonicznej. Limity harmonicznych czekają na dokument "
    "źródłowy właściwego operatora."
)
_WYCOFANIE_SSCI = (
    "Analiza badawcza: werdykt kryterium Nyquista stał na zapasie fazy 30° zaszytym w kodzie "
    "i na impedancji sieci wyznaczonej z impedancji źródła przyjętej z założenia — nie jest "
    "dowodem stabilności. Uruchomienie nowego biegu jest odmawiane, werdykt nie jest "
    "wyświetlany."
)
_NASTEPCA_SSCI = (
    "Powrót jako analiza badawcza po wyznaczeniu impedancji sieci w funkcji częstotliwości "
    "przez rdzeń harmoniczny — z zapasem stabilności pochodzącym z dokumentu, nie z kodu."
)

KATALOG_ANALIZ_V126: tuple[KartaAnalizy, ...] = (
    # Karta AB-1d_min krok 3: oba rodzaje WYCOFANE z powierzchni (rejestr zdolności
    # `availability="withdrawn"`, 410 na POST) — karta niesie wyłącznie powód i
    # następcę. Dawna treść (podstawa oceny THD_U ≤ 8 %/5 %, TDD ≤ 5 %, skan Z(f)
    # 50–2500 Hz, werdykt Nyquista) USUNIĘTA: publikowała liczby, które nie opisują
    # fizyki sieci (audyt harmonicznych F1–F9, przegląd adwersarialny §6.4).
    KartaAnalizy(
        kod=V126AnalysisType.POWER_QUALITY_HARMONICS.value,
        nazwa_pl="Jakość energii i harmoniczne",
        grupa=GRUPA_WYCOFANE,
        pytanie_pl=(
            "Czy odkształcenie napięcia i prądu w węzłach sieci mieści się w granicach "
            "kompatybilności elektromagnetycznej?"
        ),
        zakres_pl="Rodzaj wycofany z powierzchni — uruchomienie nowego biegu jest odmawiane.",
        bez_podstawy_pl=_WYCOFANIE_HARMONICZNE,
        prezentowany=False,
        powod_wycofania_pl=_WYCOFANIE_HARMONICZNE,
        nastepca_pl=_NASTEPCA_HARMONICZNE,
    ),
    KartaAnalizy(
        kod=V126AnalysisType.SSCI_IMPEDANCE.value,
        nazwa_pl="Stabilność podsynchroniczna (SSCI)",
        grupa=GRUPA_WYCOFANE,
        pytanie_pl=(
            "Czy przekształtnik przyłączony do sieci o danej sztywności nie wejdzie "
            "w interakcję podsynchroniczną (rezonans regulacyjny)?"
        ),
        zakres_pl="Analiza badawcza wycofana z powierzchni — bez werdyktu stabilności.",
        bez_podstawy_pl=_WYCOFANIE_SSCI,
        prezentowany=False,
        powod_wycofania_pl=_WYCOFANIE_SSCI,
        nastepca_pl=_NASTEPCA_SSCI,
    ),
    KartaAnalizy(
        kod=V126AnalysisType.VOLTAGE_STABILITY.value,
        nazwa_pl="Stabilność napięciowa",
        grupa=GRUPA_WYCOFANE,
        pytanie_pl="Jak blisko punktu załamania napięcia pracują węzły sieci?",
        zakres_pl="Rodzaj wycofany z toru projektanta — bieg nie wyznacza wielkości.",
        bez_podstawy_pl=_WYCOFANIE_STABILNOSC,
        prezentowany=False,
        powod_wycofania_pl=_WYCOFANIE_STABILNOSC,
    ),
    KartaAnalizy(
        kod=V126AnalysisType.RELIABILITY_CONTINGENCY.value,
        nazwa_pl="Niezawodność zasilania",
        grupa=GRUPA_NIEZAWODNOSC,
        pytanie_pl=(
            "Jak często i jak długo odbiorcy pozostaną bez zasilania z powodu awarii "
            "elementów sieci?"
        ),
        zakres_pl=(
            "Wszystkie gałęzie modelu (linie, kable, aparaty łączeniowe) jako zdarzenia N-1; "
            "odbiorcy dotknięci awarią = odbiorcy szyny końcowej gałęzi; wskaźniki liczone "
            "z intensywności uszkodzeń i czasów odtworzenia elementów."
        ),
        wielkosci_glowne=(
            WielkoscGlowna("SAIDI", "Średni czas przerw na odbiorcę", "min/rok", r"\mathrm{SAIDI}"),
            WielkoscGlowna(
                "SAIFI", "Średnia liczba przerw na odbiorcę", "1/rok", r"\mathrm{SAIFI}"
            ),
            WielkoscGlowna("CAIDI", "Średni czas trwania jednej przerwy", "min", r"\mathrm{CAIDI}"),
            WielkoscGlowna("MAIFI", "Średnia liczba przerw krótkich", "1/rok", r"\mathrm{MAIFI}"),
        ),
        bez_podstawy_pl=(
            "Solver nie stosuje progu normatywnego — wartości docelowe wskaźników określa "
            "operator; IEEE 1366 definiuje wyłącznie sposób liczenia wskaźników."
        ),
        dane_z_modelu=(
            DanaZModelu("Rodzaj i długość gałęzi", "linie, kable, aparaty łączeniowe"),
            DanaZModelu("Obciążenie i generacja szyn (moc czynna i bierna)", "odbiory, wytwórcy"),
            DanaZModelu(
                "Obciążalność długotrwała gałęzi", "linie, kable, aparaty (model lub karta)"
            ),
        ),
        od_uzytkownika=(
            ParametrUzytkownika(
                klucz="customer_counts",
                nazwa_pl="Liczba odbiorców zasilanych z szyny",
                jednostka="-",
                wymagane=True,
                opis_pl=(
                    "Model sieci nie niesie liczby odbiorców — projektant podaje ją dla szyn "
                    "zasilających odbiorców (identyfikator szyny → liczba odbiorców); wskaźniki "
                    "SAIDI/SAIFI/CAIDI są tą liczbą ważone."
                ),
            ),
        ),
        domyslne_solvera=(
            DomyslnaSolvera(
                "failure_rate_per_year",
                "Intensywność uszkodzeń elementu",
                "0,08 (linia napowietrzna) / 0,015 (kabel) na km i rok; 0,015 na rok (aparat)",
                "1/rok",
                "Wartości typowe z katalogu danych odniesienia „reliability-defaults”; model nie niesie "
                "danych niezawodnościowych elementów.",
            ),
            DomyslnaSolvera(
                "mttr_h",
                "Czas odtworzenia zasilania po awarii elementu",
                "3,5 (linia napowietrzna) / 12 (kabel) / 4 (aparat)",
                "h",
                "Wartości typowe z katalogu danych odniesienia „reliability-defaults”.",
            ),
        ),
        katalog_odniesienia="reliability-defaults",
        uwagi_metody_pl=(
            "Ranking dotkliwości kontyngencji N-1 nie jest prezentowany z tej analizy — kanon "
            "liczy go pełnym rozpływem na ekranie „Kontyngencje N-1”.",
        ),
    ),
    KartaAnalizy(
        kod=V126AnalysisType.EARTHING_SAFETY.value,
        nazwa_pl="Bezpieczeństwo uziomu stacji",
        grupa=GRUPA_UZIEMIENIA,
        pytanie_pl=(
            "Czy przy zwarciu doziemnym napięcia rażenia na terenie stacji nie zagrażają "
            "człowiekowi?"
        ),
        zakres_pl=(
            "Uziom kratowy jednej stacji: geometria siatki i uziomów pionowych, grunt "
            "dwuwarstwowy, warstwa powierzchniowa; rażenie dotykowe i krokowe przy prądzie "
            "zwarcia doziemnego odprowadzanym przez uziom w czasie wyłączenia."
        ),
        wielkosci_glowne=(
            WielkoscGlowna("R_g", "Rezystancja uziomu stacji", "Ω", r"R_g"),
            WielkoscGlowna("GPR", "Wzrost potencjału uziomu", "kV", r"\mathrm{GPR}"),
            WielkoscGlowna("U_dot", "Napięcie dotykowe rażeniowe", "V", r"U_{\mathrm{dot}}"),
            WielkoscGlowna("U_kr", "Napięcie krokowe", "V", r"U_{\mathrm{kr}}"),
            WielkoscGlowna("I_g", "Prąd odprowadzany przez uziom", "kA", r"I_g"),
        ),
        podstawa_oceny=(
            PodstawaOceny(
                "Napięcie dotykowe rażeniowe",
                "U_dot",
                "V",
                "wartość dopuszczalna liczona z rezystywności warstwy powierzchniowej, jej "
                "współczynnika redukcji i czasu wyłączenia zwarcia (ciało 70 kg) — wzór obok",
                "U_dot,dop = (1000 + 1,5·C_s·ρ_s)·0,157/√t_f",
                "IEEE 80 (metoda Sverak) · PN-EN 50522",
                symbol_latex=r"U_{\mathrm{dot}}",
                warunek_latex=r"U_{\mathrm{dot}} \leq U_{\mathrm{dot,dop}}",
                wzor_latex=(
                    r"U_{\mathrm{dot,dop}} = \left(1000 + 1{,}5\, C_s\, \rho_s\right)"
                    r"\cdot \dfrac{0{,}157}{\sqrt{t_f}}"
                ),
                wzor_opis_pl=(
                    "ρ_s — rezystywność warstwy powierzchniowej [Ω·m]; C_s — współczynnik "
                    "redukcji warstwy powierzchniowej; t_f — czas wyłączenia zwarcia [s]; "
                    "ciało człowieka 70 kg. IEEE 80 (metoda Sveraka) · PN-EN 50522."
                ),
            ),
            PodstawaOceny(
                "Napięcie krokowe",
                "U_kr",
                "V",
                "wartość dopuszczalna liczona jak dla napięcia dotykowego, ze współczynnikiem 6 "
                "zamiast 1,5 — wzór obok",
                "U_kr,dop = (1000 + 6·C_s·ρ_s)·0,157/√t_f",
                "IEEE 80 (metoda Sverak) · PN-EN 50522",
                symbol_latex=r"U_{\mathrm{kr}}",
                warunek_latex=r"U_{\mathrm{kr}} \leq U_{\mathrm{kr,dop}}",
                wzor_latex=(
                    r"U_{\mathrm{kr,dop}} = \left(1000 + 6\, C_s\, \rho_s\right)"
                    r"\cdot \dfrac{0{,}157}{\sqrt{t_f}}"
                ),
                wzor_opis_pl=(
                    "ρ_s — rezystywność warstwy powierzchniowej [Ω·m]; C_s — współczynnik "
                    "redukcji warstwy powierzchniowej; t_f — czas wyłączenia zwarcia [s]; "
                    "ciało człowieka 70 kg. IEEE 80 (metoda Sveraka) · PN-EN 50522."
                ),
            ),
            PodstawaOceny(
                "Przekroczenie tolerowane ze środkami dodatkowymi",
                "U/U_dop",
                "-",
                'przekroczenie do 25 % daje stan „wymaga ochrony", powyżej — „niezgodny"',
                KROTNOSC_OCHRONY_DODATKOWEJ,
                "reguła solvera (klasyfikacja stanu)",
                symbol_latex=r"U/U_{\mathrm{dop}}",
                warunek_latex=r"U/U_{\mathrm{dop}} \leq 1{,}25",
            ),
        ),
        od_uzytkownika=_PARAMETRY_UZIOMU,
        uwagi_metody_pl=(
            "Model sieci nie niesie geometrii uziomu ani danych gruntu — bez danych projektanta "
            "analiza nie jest uruchamiana (zakaz podstawiania uziomu domyślnego).",
        ),
    ),
    KartaAnalizy(
        kod=V126AnalysisType.INSULATION_COORDINATION.value,
        nazwa_pl="Koordynacja izolacji",
        grupa=GRUPA_UZIEMIENIA,
        pytanie_pl=(
            "Czy dobrane ograniczniki przepięć chronią izolację aparatów z wymaganym zapasem?"
        ),
        zakres_pl=(
            "Ograniczniki przepięć modelu (aparaty pierwotne pól i stacji) — jedno miejsce "
            "zainstalowania per szyna i typ; poziom izolacji z typoszeregu IEC 60071-1 dla "
            "najwyższego napięcia urządzenia; sposób uziemienia punktu neutralnego z modelu."
        ),
        wielkosci_glowne=(
            WielkoscGlowna(
                "MCOV",
                "Trwałe dopuszczalne napięcie pracy ogranicznika",
                "kV",
                r"\mathrm{MCOV}",
            ),
            WielkoscGlowna(
                "U_res", "Napięcie obniżone przy prądzie 10 kA", "kV", r"U_{\mathrm{res}}"
            ),
            WielkoscGlowna("BIL", "Wytrzymałość udarowa piorunowa izolacji", "kV", r"\mathrm{BIL}"),
            WielkoscGlowna("TOV", "Przewidywane przepięcie dorywcze", "kV", r"\mathrm{TOV}"),
            WielkoscGlowna("M_BIL", "Margines ochrony izolacji", "%", r"M_{\mathrm{BIL}}"),
        ),
        podstawa_oceny=(
            PodstawaOceny(
                "Margines ochrony izolacji",
                "M_BIL",
                "%",
                "M_BIL = (BIL − U_res)/U_res·100 ≥ granica, w każdym miejscu zainstalowania",
                MARGINES_BIL_MIN_PROCENT,
                "IEC 60071 (koordynacja izolacji)",
                symbol_latex=r"M_{\mathrm{BIL}}",
                warunek_latex=(
                    r"M_{\mathrm{BIL}} = \dfrac{\mathrm{BIL} - U_{\mathrm{res}}}"
                    r"{U_{\mathrm{res}}}\cdot 100\% \geq 20\%"
                ),
            ),
            PodstawaOceny(
                "Przepięcie dorywcze",
                "TOV",
                "kV",
                "TOV ≤ U_r ogranicznika (1,25·MCOV)",
                "U_r = 1,25·MCOV",
                "IEC 60071 / IEC 60099-4",
                symbol_latex=r"\mathrm{TOV}",
                warunek_latex=r"\mathrm{TOV} \leq U_r",
                wzor_latex=r"U_r = 1{,}25\cdot \mathrm{MCOV}",
                wzor_opis_pl=(
                    "MCOV — trwałe dopuszczalne napięcie pracy ogranicznika [kV]; "
                    "U_r — napięcie znamionowe ogranicznika [kV]. IEC 60071 / IEC 60099-4."
                ),
            ),
        ),
        dane_z_modelu=(
            DanaZModelu(
                "Ograniczniki przepięć i ich karty katalogowe (MCOV, U_res, TOV, energia)",
                "aparaty pierwotne pól i stacji",
            ),
            DanaZModelu(
                "Najwyższe napięcie urządzenia U_m", "karta ogranicznika albo poziom napięcia szyny"
            ),
            DanaZModelu("Sposób uziemienia punktu neutralnego", "szyny, transformatory"),
        ),
        domyslne_solvera=(
            DomyslnaSolvera(
                "arrester_mcov_kv",
                "Dobór wstępny ogranicznika bez karty katalogowej",
                "MCOV = 1,05·U_m (sieć izolowana) albo 1,05·U_m/√3 (uziemiona); U_res = 2,8·MCOV; "
                "TOV = 1,4·U_m (izolowana) albo 1,15·U_m",
                "kV",
                "Reguły doboru wstępnego solvera stosowane WYŁĄCZNIE przy braku karty ogranicznika — "
                "miejsce bez karty jest oznaczone w gotowości.",
            ),
        ),
        katalog_odniesienia="insulation-levels",
    ),
    KartaAnalizy(
        kod=V126AnalysisType.EARTH_FAULT_DETECTION.value,
        nazwa_pl="Detekcja zwarć doziemnych",
        grupa=GRUPA_UZIEMIENIA,
        pytanie_pl=(
            "Jaką metodą wykryć zwarcie doziemne przy danym sposobie uziemienia punktu "
            "neutralnego i czy przekaźnik w polu ją obsługuje?"
        ),
        zakres_pl=(
            "Sieć SN jako całość: sposób uziemienia punktu neutralnego wobec wyposażenia "
            "przekaźnika; wynik = metoda zalecana i alternatywna z tabeli decyzyjnej."
        ),
        wielkosci_glowne=(
            WielkoscGlowna(
                "metoda",
                "Metoda detekcji zalecana i alternatywna",
                "-",
                r"\text{metoda}",
            ),
            WielkoscGlowna(
                "obsługa",
                "Dostępność metody zalecanej w przekaźniku",
                "-",
                r"\text{obsługa}",
            ),
        ),
        bez_podstawy_pl=(
            "Tabela decyzyjna (praktyka sieci SN kompensowanych i uziemionych przez rezystor) — "
            "bez wartości granicznej; nastawy rozruchowe U0/P0/I5 nie są prezentowane, bo solver "
            "nie ma dla nich udokumentowanej podstawy."
        ),
        dane_z_modelu=(
            DanaZModelu(
                "Sposób uziemienia punktu neutralnego (wartość proponowana do potwierdzenia)",
                "szyny SN, transformatory",
            ),
        ),
        od_uzytkownika=(
            ParametrUzytkownika(
                "neutral_grounding",
                "Sposób uziemienia punktu neutralnego",
                "-",
                True,
                "Proponowany z modelu, gdy model niesie uziemienie punktu neutralnego.",
            ),
            ParametrUzytkownika(
                "relay_methods",
                "Metody detekcji dostępne w przekaźniku",
                "-",
                True,
                "Wyposażenie przekaźnika pola — model go nie niesie.",
            ),
        ),
    ),
    KartaAnalizy(
        kod=V126AnalysisType.TRANSIENT_TRV.value,
        nazwa_pl="Napięcie powrotne i stany przejściowe",
        grupa=GRUPA_APARATURA,
        pytanie_pl=(
            "Czy napięcie powrotne po przerwaniu prądu zwarciowego mieści się pod obwiednią "
            "wytrzymałości wyłącznika?"
        ),
        zakres_pl=(
            "Wyłącznik o napięciu znamionowym U_r; przebieg napięcia powrotnego 2–100 µs wobec "
            "obwiedni wytrzymałości; udar załączania transformatora i zalecenie blokady "
            "różnicowej; ryzyko ferrorezonansu z pojemności doczepnej gałęzi sieci izolowanej."
        ),
        wielkosci_glowne=(
            WielkoscGlowna(
                "M_TRV", "Najmniejszy margines napięcia powrotnego", "%", r"M_{\mathrm{TRV}}"
            ),
            WielkoscGlowna(
                "I_2h/I_szczyt",
                "Udział 2. harmonicznej w prądzie załączania",
                "%",
                r"I_{2h}/I_{\mathrm{szczyt}}",
            ),
            WielkoscGlowna("ferro", "Ryzyko ferrorezonansu", "-", r"\text{ferro}"),
        ),
        podstawa_oceny=(
            PodstawaOceny(
                "Margines napięcia powrotnego",
                "M_TRV",
                "%",
                "M_TRV = (obwiednia − u_TRV)/obwiednia·100 ≥ granica w całym przebiegu",
                MARGINES_TRV_MIN_PROCENT,
                "IEC 62271-100 (obwiednia napięcia powrotnego)",
                symbol_latex=r"M_{\mathrm{TRV}}",
                warunek_latex=(
                    r"M_{\mathrm{TRV}} = \dfrac{\text{obwiednia} - u_{\mathrm{TRV}}}"
                    r"{\text{obwiednia}}\cdot 100\% \geq 10\%"
                ),
            ),
            PodstawaOceny(
                "Blokada różnicowej od 2. harmonicznej",
                "I_2h/I_szczyt",
                "%",
                "udział ≥ granica ⇒ blokada 87T zalecana",
                UDZIAL_2H_BLOKADA_87T_PROCENT,
                "reguła solvera (praktyka zabezpieczeń różnicowych)",
                symbol_latex=r"I_{2h}/I_{\mathrm{szczyt}}",
                warunek_latex=r"I_{2h}/I_{\mathrm{szczyt}} \geq 10\%",
            ),
        ),
        dane_z_modelu=(
            DanaZModelu("Najwyższe napięcie znamionowe szyn (proponowane U_r)", "szyny"),
            DanaZModelu("Susceptancje doziemne gałęzi (ferrorezonans)", "linie, kable"),
            DanaZModelu(
                "Sposób uziemienia punktu neutralnego (wartość proponowana do potwierdzenia)",
                "szyny SN, transformatory",
            ),
        ),
        od_uzytkownika=(
            ParametrUzytkownika(
                "breaker_rated_voltage_kv",
                "Napięcie znamionowe wyłącznika",
                "kV",
                False,
                "Puste = najwyższe napięcie znamionowe szyny modelu.",
            ),
            ParametrUzytkownika(
                "trv_natural_frequency_hz",
                "Częstotliwość własna napięcia powrotnego",
                "Hz",
                True,
                "Właściwość obwodu wyłączanego — model jej nie niesie.",
            ),
            ParametrUzytkownika(
                "trv_tau_s", "Stała czasowa napięcia powrotnego", "s", True, "Właściwość obwodu."
            ),
            ParametrUzytkownika(
                "inrush_multiple_in",
                "Krotność prądu załączania transformatora",
                "× I_n",
                True,
                "Właściwość transformatora — model jej nie niesie.",
            ),
            ParametrUzytkownika(
                "neutral_grounding",
                "Sposób uziemienia punktu neutralnego",
                "-",
                True,
                "Proponowany z modelu, gdy model niesie uziemienie punktu neutralnego.",
            ),
        ),
    ),
    KartaAnalizy(
        kod=V126AnalysisType.MOTOR_STARTING.value,
        nazwa_pl="Rozruch silników",
        grupa=GRUPA_APARATURA,
        pytanie_pl=(
            "Czy silnik ruszy pod obciążeniem i czy jego rozruch nie zapadnie napięcia na "
            "szynie poniżej dopuszczalnego?"
        ),
        zakres_pl=(
            "Silniki podane przez projektanta (model sieci nie zawiera silników), każdy na "
            "wskazanej szynie; impedancja źródła z mocy zwarciowej szyny albo z pierwszej "
            "gałęzi zasilającej."
        ),
        wielkosci_glowne=(
            WielkoscGlowna("I_r", "Prąd rozruchowy", "A", r"I_r"),
            WielkoscGlowna("ΔU", "Zapad napięcia na szynie", "%", r"\Delta U"),
            WielkoscGlowna("M_r", "Moment rozruchowy", "j.w.", r"M_r"),
            WielkoscGlowna("I²t", "Wykorzystanie dopuszczalnego czasu utyku", "-", r"I^{2} t"),
        ),
        podstawa_oceny=(
            PodstawaOceny(
                "Zapad napięcia na szynie",
                "ΔU",
                "%",
                "ΔU ≤ granica przy prądzie rozruchowym k_LR·I_n",
                ZAPAD_ROZRUCHU_MAX_PROCENT,
                "kryteria rozruchowe silników SN (reguła solvera)",
                symbol_latex=r"\Delta U",
                warunek_latex=r"\Delta U \leq 15\%",
            ),
            PodstawaOceny(
                "Wskaźnik cieplny rozruchu",
                "I²t",
                "-",
                "k_LR²·t_rozruchu/t_utyku ≤ granica",
                WSKAZNIK_CIEPLNY_ROZRUCHU_MAX,
                "kryteria rozruchowe silników SN (reguła solvera)",
                symbol_latex=r"I^{2} t",
                warunek_latex=r"k_{LR}^2 \cdot \dfrac{t_{\mathrm{rozruchu}}}{t_{\mathrm{utyku}}} \leq 1",
            ),
            PodstawaOceny(
                "Moment rozruchowy",
                "M_r",
                "j.w.",
                "M_r > M_obciążenia przy rozruchu",
                "M_r > M_obc",
                "kryteria rozruchowe silników SN (reguła solvera)",
                symbol_latex=r"M_r",
                warunek_latex=r"M_r > M_{\mathrm{obc}}",
                wzor_latex=r"M_r > M_{\mathrm{obc}}",
                wzor_opis_pl=(
                    "M_r — moment rozruchowy silnika w jednostkach względnych; "
                    "M_obc — moment obciążenia napędzanego mechanizmu przy rozruchu, "
                    "w tych samych jednostkach. Granica nie jest stałą liczbą — jest "
                    "porównaniem dwóch wielkości z tego samego biegu."
                ),
            ),
        ),
        dane_z_modelu=(
            DanaZModelu("Moc zwarciowa szyny albo impedancja gałęzi zasilającej", "szyny, gałęzie"),
        ),
        od_uzytkownika=_PARAMETRY_SILNIKA,
    ),
    KartaAnalizy(
        kod=V126AnalysisType.HOSTING_CAPACITY.value,
        nazwa_pl="Zdolność przyłączeniowa źródeł",
        grupa=GRUPA_WYCOFANE,
        pytanie_pl="Ile generacji rozproszonej można przyłączyć bez naruszenia kryteriów?",
        zakres_pl="Rodzaj wycofany z powierzchni — kanon na ekranie „OZE › Zdolność przyłączeniowa”.",
        bez_podstawy_pl=_WYCOFANIE_HOSTING,
        prezentowany=False,
        powod_wycofania_pl=_WYCOFANIE_HOSTING,
    ),
    KartaAnalizy(
        kod=V126AnalysisType.OPF_LOSS_LCC.value,
        nazwa_pl="Optymalizacja strat i koszt cyklu życia",
        grupa=GRUPA_WYCOFANE,
        pytanie_pl="Jakie są straty energii i ich koszt w cyklu życia?",
        zakres_pl="Rodzaj wycofany z powierzchni — kanon strat i zaczepu w innych ekranach.",
        bez_podstawy_pl=_WYCOFANIE_OPF,
        prezentowany=False,
        powod_wycofania_pl=_WYCOFANIE_OPF,
    ),
    KartaAnalizy(
        kod=V126AnalysisType.BENCHMARK_VALIDATION.value,
        nazwa_pl="Walidacja na sieciach odniesienia",
        grupa=GRUPA_WYCOFANE,
        pytanie_pl="Czy solver odtwarza wyniki sieci odniesienia w zadanych tolerancjach?",
        zakres_pl="Rodzaj wycofany z toru projektanta — kontrola jakości narzędzia.",
        bez_podstawy_pl=_WYCOFANIE_BENCHMARK,
        prezentowany=False,
        powod_wycofania_pl=_WYCOFANIE_BENCHMARK,
    ),
    KartaAnalizy(
        kod=V126AnalysisType.UNCERTAINTY_SENSITIVITY.value,
        nazwa_pl="Niepewność i wrażliwość wyniku",
        grupa=GRUPA_NIEZAWODNOSC,
        pytanie_pl=(
            "Jak bardzo niepewność danych katalogowych przenosi się na wynik i który "
            "parametr o tym decyduje?"
        ),
        zakres_pl=(
            "Transformatory (napięcie zwarcia), gałęzie (moduł impedancji) i szyny z mocą "
            "zwarciową; tolerancje propagowane jako niezależne składowe wariancji wyniku; "
            "ranking udziałów parametrów."
        ),
        wielkosci_glowne=(
            WielkoscGlowna("U_95", "Niepewność rozszerzona wyniku (k = 2)", "%", r"U_{95}"),
            WielkoscGlowna(
                "udział", "Udział parametru w całkowitej niepewności", "%", r"\text{udział}"
            ),
        ),
        bez_podstawy_pl=(
            "Solver nie stosuje progu normatywnego; niepewność powyżej 100 % oznacza wynik "
            "niewiarygodny (blok wiarygodności), a ranking wskazuje parametr do uściślenia."
        ),
        dane_z_modelu=(
            DanaZModelu("Napięcie zwarcia transformatorów", "transformatory"),
            DanaZModelu("Impedancje gałęzi", "linie, kable, aparaty łączeniowe"),
            DanaZModelu("Moc zwarciowa szyn zasilanych ze źródła", "źródła"),
        ),
        domyslne_solvera=(
            DomyslnaSolvera(
                "tolerancje",
                "Tolerancje danych katalogowych przyjęte w propagacji",
                "10 % napięcia zwarcia; 5 % modułu impedancji gałęzi; 10 % mocy zwarciowej",
                "%",
                "Założenie metody zaszyte w solverze (dokumentowane w śladzie obliczeń).",
            ),
            DomyslnaSolvera(
                "k",
                "Współczynnik rozszerzenia przedziału",
                2.0,
                "-",
                "Przedział rozszerzony k = 2 (ok. 95 %).",
            ),
        ),
    ),
    KartaAnalizy(
        kod=V126AnalysisType.NEUTRAL_EARTHING_DESIGN.value,
        nazwa_pl="Dobór uziemienia punktu neutralnego",
        grupa=GRUPA_UZIEMIENIA,
        pytanie_pl=(
            "Jak uziemić punkt neutralny sieci i jaki dobrać dławik gaszący albo rezystor, "
            "żeby ograniczyć prąd zwarcia doziemnego?"
        ),
        zakres_pl=(
            "Galwanicznie połączona sieć SN: pojemność doziemna z susceptancji zerowej linii "
            "i kabli (łączniki otwarte pominięte; element bez susceptancji zerowej jest "
            "pomijany i wymieniony); napięcie sieci = najwyższe napięcie znamionowe szyny "
            "modelu; dobór dławika gaszącego (Petersen) albo rezystora uziemiającego."
        ),
        wielkosci_glowne=(
            WielkoscGlowna("I_C", "Prąd pojemnościowy doziemienia sieci", "A", r"I_C"),
            WielkoscGlowna("C_0", "Pojemność doziemna sieci", "F", r"C_0"),
            WielkoscGlowna("L, X_L", "Indukcyjność i reaktancja dławika", "H, Ω", r"L,\ X_L"),
            WielkoscGlowna("I_res", "Prąd resztkowy przy rozstrojeniu", "A", r"I_{\mathrm{res}}"),
            WielkoscGlowna("R_N", "Rezystancja uziemiająca punktu neutralnego", "Ω", r"R_N"),
            WielkoscGlowna("E", "Energia wydzielona w rezystorze w czasie wyłączenia", "J", r"E"),
        ),
        podstawa_oceny=(
            PodstawaOceny(
                "Prąd resztkowy (sieć kompensowana)",
                "I_res/I_C",
                "-",
                "I_res przy przyjętym rozstrojeniu ≤ udział granicznego prądu pojemnościowego",
                PRAD_RESZTKOWY_MAX_UDZIAL_IC,
                "kompensacja rezonansowa Petersena · IEC 62271-203",
                symbol_latex=r"I_{\mathrm{res}}/I_C",
                warunek_latex=r"I_{\mathrm{res}}/I_C \leq 10\%",
            ),
            PodstawaOceny(
                "Energia w rezystorze (sieć uziemiona przez rezystor)",
                "E",
                "J",
                "E = I_ef²·R·t_wył ≤ E_n rezystora",
                "E ≤ E_n",
                "IEC 60364 / praktyka sieci uziemionych przez rezystor",
                symbol_latex=r"E",
                warunek_latex=r"E \leq E_n",
                wzor_latex=r"E = I_{\mathrm{ef}}^2 \cdot R \cdot t_{\text{wył}}",
                wzor_opis_pl=(
                    "I_ef — wynikowy prąd doziemienia [A]; R — rezystancja uziemiająca "
                    "punktu neutralnego [Ω]; t_wył — czas wyłączenia zwarcia [s]; "
                    "E_n — energia znamionowa rezystora [J]."
                ),
            ),
        ),
        dane_z_modelu=(
            DanaZModelu("Susceptancja zerowa (doziemna) i długość gałęzi", "linie, kable"),
            DanaZModelu("Napięcie znamionowe sieci", "szyny"),
            DanaZModelu(
                "Sposób uziemienia punktu neutralnego (wartość proponowana do potwierdzenia)",
                "szyny SN, transformatory",
            ),
        ),
        od_uzytkownika=(
            ParametrUzytkownika(
                "neutral_earthing_type",
                "Schemat uziemienia punktu neutralnego",
                "-",
                True,
                "Dławik gaszący albo rezystor; proponowany z modelu.",
            ),
            ParametrUzytkownika(
                "ner_target_earth_fault_current_a",
                "Docelowy prąd doziemienia (rezystor)",
                "A",
                True,
                "Wymagany dla schematu rezystorowego.",
            ),
            ParametrUzytkownika(
                "ner_clearing_time_s",
                "Czas wyłączenia (rezystor)",
                "s",
                True,
                "Wymagany dla sprawdzenia cieplnego rezystora.",
            ),
            ParametrUzytkownika(
                "ner_energy_rating_j",
                "Energia znamionowa rezystora",
                "J",
                True,
                "Wymagana dla sprawdzenia cieplnego rezystora.",
            ),
            # Karta B-02 (parytet katalog ↔ kontrolki): oba parametry dławika solver
            # CZYTA z `parameters` (nadpisanie wartości domyślnej), więc karta musi je
            # obiecywać jako dane od użytkownika — opcjonalne, z wartością domyślną
            # udokumentowaną niżej w `domyslne_solvera` (jedna para: pole + domyślna).
            ParametrUzytkownika(
                "petersen_detuning",
                "Stopień rozstrojenia dławika",
                "-",
                False,
                "Opcjonalnie; bez wpisu solver przyjmuje wartość domyślną 0,05 (±5 %).",
            ),
            ParametrUzytkownika(
                "petersen_residual_damping",
                "Tłumienie prądu resztkowego",
                "-",
                False,
                "Opcjonalnie (d = I_R/I_C z karty dławika); bez wpisu 0 — bez strat dławika.",
            ),
        ),
        domyslne_solvera=(
            DomyslnaSolvera(
                "petersen_detuning",
                "Stopień rozstrojenia dławika",
                0.05,
                "-",
                "Parametr metody: ±5 % rozstrojenia przyjęte przy braku wartości projektanta.",
            ),
            DomyslnaSolvera(
                "petersen_residual_damping",
                "Składowa tłumienia prądu resztkowego",
                0.0,
                "-",
                "Parametr metody: brak strat dławika w karcie ⇒ 0 (prąd resztkowy w rezonansie = 0).",
            ),
        ),
        uwagi_metody_pl=(
            "Solver przyjmuje jako napięcie sieci najwyższe napięcie znamionowe szyny modelu — "
            "w modelu z szyną WN (np. 110 kV) dobór odnosi się do tego poziomu, nie do SN.",
        ),
    ),
)

_KATALOG_PO_KODZIE: dict[str, KartaAnalizy] = {karta.kod: karta for karta in KATALOG_ANALIZ_V126}


def karta_analizy(kod: str) -> KartaAnalizy:
    """Karta rodzaju po kodzie kontraktu (KeyError = rodzaj spoza katalogu)."""
    return _KATALOG_PO_KODZIE[kod]


def katalog_do_dict() -> list[dict[str, Any]]:
    """Komplet kart w kolejności prezentacji (grupa, potem kolejność katalogu)."""
    kolejnosc = {kod: indeks for indeks, kod in enumerate(KOLEJNOSC_GRUP)}
    posortowane = sorted(
        enumerate(KATALOG_ANALIZ_V126), key=lambda para: (kolejnosc[para[1].grupa], para[0])
    )
    return [karta.to_dict() for _, karta in posortowane]


def grupy_do_dict() -> list[dict[str, str]]:
    """Grupy w kolejności prezentacji (tylko te, które mają rodzaj prezentowany)."""
    obecne = {karta.grupa for karta in KATALOG_ANALIZ_V126 if karta.prezentowany}
    return [{"kod": kod, "nazwa_pl": NAZWY_GRUP[kod]} for kod in KOLEJNOSC_GRUP if kod in obecne]


def nazwa_parametru_pl(kod_rodzaju: str, klucz_pelny: str) -> str:
    """Polska nazwa parametru użytkownika (`ParametrUzytkownika.nazwa_pl`) —
    JEDYNE źródło polskich nazw parametrów w komunikatach gotowości (karta
    B02-BE-TESTY, reguła KLASA §3, „prezentacja.straznik.test.tsx"): identyfikator
    Pythona (`rho1_ohm_m`, `rated_kw`) nie może trafić na ekran projektanta wprost
    — każdy komunikat wyliczający brakujące parametry cytuje TĘ funkcję, nie klucz
    surowy.

    ``klucz_pelny`` jest postacią z ``ParametrUzytkownika.klucz`` (z notacją
    zagnieżdżenia: ``earthing.rho1_ohm_m``, ``motors[].rated_kw``) — DOKŁADNIE
    ten sam ciąg, którego szuka `od_uzytkownika` karty. `KeyError`, gdy katalog
    nie zna takiego klucza dla tego rodzaju — brak w katalogu jest błędem
    wywołania (defekt do naprawienia u źródła), nie brakiem do cichego pominięcia.
    """
    karta = karta_analizy(kod_rodzaju)
    for parametr in karta.od_uzytkownika:
        if parametr.klucz == klucz_pelny:
            return parametr.nazwa_pl
    raise KeyError(
        f"{kod_rodzaju}: parametr {klucz_pelny!r} nie jest w katalogu od_uzytkownika "
        "(nazwa_parametru_pl wymaga zgodnego wpisu w KATALOG_ANALIZ_V126)"
    )

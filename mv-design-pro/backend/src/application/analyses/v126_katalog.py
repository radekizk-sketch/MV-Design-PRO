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
  * PODSTAWA OCENY — WYŁĄCZNIE kryteria, które rekordy oceny wyniku
    (`application/analyses/v126_oceny.py`) naprawdę rozstrzygają: wielkość,
    warunek, wartość graniczna, źródło. Progi i reguły są ZAŁOŻENIAMI
    INŻYNIERSKIMI z rejestru `v126_oceny.REJESTR_ZALOZEN` (paragrafy Z-n;
    margines BIL 20 %, I_res ≤ 10 % I_C, zapad 15 %…) — katalog importuje je
    z rejestru (jedno źródło, nie kopia literałów), a źródło nazywa paragraf
    rejestru i praktykę, z której założenie pochodzi, bez udawania normy.
    Rodzaj bez kryterium rozstrzyganego w wyniku mówi to WPROST
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

from application.analyses.v126_oceny import (
    Z_CZAS_ROZRUCHU,
    Z_ENERGIA_REZYSTORA,
    Z_MARGINES_IZOLACJI,
    Z_METODA_DETEKCJI,
    Z_MOMENT_ROZRUCHOWY,
    Z_NAPIECIE_DOTYKOWE,
    Z_NAPIECIE_KROKOWE,
    Z_NAPIECIE_PRACY,
    Z_PRAD_RESZTKOWY,
    Z_PRZEPIECIE_DORYWCZE,
    Z_ZAPAD_ROZRUCHU,
    ZalozenieKryterium,
)
from application.v126_artifacts import POWODY_NIEZWALIDOWANIA_HARMONICZNYCH_PL
from network_model.catalog.wartosci_robocze import (
    ODNIESIENIE_MAIFI,
    PROPOZYCJE_NIEZAWODNOSCI,
    UDZIAL_MAIFI_DO_SAIFI,
)
from network_model.solvers.v126_academic import (
    POZIOMY_IZOLACJI_IEC60071 as POZIOMY_IZOLACJI_IEC60071,  # re-eksport dla katalogu API
)
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
            "katalog_odniesienia": self.katalog_odniesienia,
            "uwagi_metody_pl": list(self.uwagi_metody_pl),
            "zakres_oceny": self.zakres_oceny,
        }


def zrodlo_zalozenia(zalozenie: ZalozenieKryterium) -> str:
    """Źródło kryterium w katalogu: paragraf rejestru założeń i praktyka (nie norma)."""
    return f"założenie inżynierskie {zalozenie.paragraf} programu — {zalozenie.praktyka_pl}"


def _prog(zalozenie: ZalozenieKryterium) -> float:
    """Próg założenia — ta sama definicja co ocena (`ZalozenieKryterium.granica`)."""
    return zalozenie.granica().wartosc


def _lp(wartosc: float) -> str:
    return format(wartosc, "g").replace(".", ",")


def _opis_niezawodnosci(intensywnosc: bool) -> str:
    """Wartości robocze rejestru niezawodności w zdaniu (jedno źródło: rejestr)."""
    czesci = []
    for p in PROPOZYCJE_NIEZAWODNOSCI.values():
        wartosc = (
            f"{_lp(p.intensywnosc_uszkodzen)} {p.jednostka_intensywnosci}"
            if intensywnosc
            else f"{_lp(p.czas_odnowy_h)} h"
        )
        czesci.append(f"{wartosc} ({p.nazwa_pl})")
    return "; ".join(czesci)


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
    ParametrUzytkownika(
        "motors[].rated_power_factor",
        "Znamionowy współczynnik mocy cos φ_n",
        "-",
        False,
        "Z tabliczki silnika; puste = wartość robocza rejestru maszyn indukcyjnych (dana "
        "przyjęta wyniku).",
    ),
    ParametrUzytkownika(
        "motors[].rated_efficiency",
        "Sprawność znamionowa η_n",
        "-",
        False,
        "Z tabliczki silnika; puste = wartość robocza rejestru maszyn indukcyjnych (dana "
        "przyjęta wyniku).",
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

KATALOG_ANALIZ_V126: tuple[KartaAnalizy, ...] = (
    KartaAnalizy(
        kod=V126AnalysisType.POWER_QUALITY_HARMONICS.value,
        nazwa_pl="Jakość energii i harmoniczne",
        grupa=GRUPA_JAKOSC,
        pytanie_pl=(
            "Czy odkształcenie napięcia i prądu w węzłach sieci mieści się w granicach "
            "kompatybilności elektromagnetycznej?"
        ),
        # Uczciwość natychmiastowa (audyt harmonicznych 2026-09-23): zakres i dane opisują
        # to, co solver FAKTYCZNIE robi. Dawne twierdzenia „harmoniczne rzędów 2–49",
        # „skan … z wykrywaniem rezonansów" i „moc zwarciowa źródła zasilania" były
        # fałszywe (18 zaszytych rzędów z cichym pomijaniem pozostałych, „rezonans" = każdy
        # punkt skanu ponad 10·|Z(50 Hz)|, sieć nadrzędna jako admitancja 1e6 S).
        zakres_pl=(
            "Wszystkie szyny modelu; źródła odkształcające = przekształtniki z widmem "
            "harmonicznym (karta katalogowa albo widmo podane ręcznie); 18 zaszytych rzędów "
            "harmonicznych (pozostałe rzędy widma są pomijane); skan modułu impedancji "
            "węzłów w paśmie 50–2500 Hz. Wynik solvera jest niezwalidowany — ocena "
            "kompatybilności nie jest wykonywana, liczby są dostępne wyłącznie w sekcji "
            "audytowej."
        ),
        wielkosci_glowne=(
            WielkoscGlowna("THD_U", "Współczynnik odkształcenia napięcia", "%", r"\mathrm{THD}_U"),
            WielkoscGlowna("TDD", "Odkształcenie prądu odbiorcy", "%", r"\mathrm{TDD}"),
            WielkoscGlowna("K", "Współczynnik K obciążenia transformatora", "-", "K"),
            WielkoscGlowna("Z(f)", "Impedancja węzła w funkcji częstotliwości", "Ω", r"Z(f)"),
        ),
        bez_podstawy_pl=(
            "Ocena kompatybilności nie jest wykonywana — solver harmoniczny jest niezwalidowany "
            "(powody w uwagach metody), więc granice odkształcenia PN-EN 50160 i IEEE 519 "
            "(katalog odniesienia „harmonic-limits”) nie są stosowane do jego liczb."
        ),
        dane_z_modelu=(
            DanaZModelu("Napięcie znamionowe i obciążenie szyn", "szyny, odbiory"),
            DanaZModelu("Impedancje i susceptancje gałęzi", "linie, kable, aparaty łączeniowe"),
            DanaZModelu("Parametry transformatorów", "transformatory (S_n, u_k)"),
            DanaZModelu(
                "Widmo harmoniczne i moc znamionowa przekształtników",
                "karty katalogowe przekształtników PV/BESS/wiatrowych",
            ),
        ),
        uwagi_metody_pl=POWODY_NIEZWALIDOWANIA_HARMONICZNYCH_PL,
        od_uzytkownika=(
            ParametrUzytkownika(
                "harmonic_spectra",
                "Widmo harmoniczne przekształtnika (wejście ręczne)",
                "% I_n per rząd",
                False,
                "Nadpisuje widmo karty katalogowej wskazanego przekształtnika.",
            ),
        ),
        katalog_odniesienia="harmonic-limits",
    ),
    KartaAnalizy(
        kod=V126AnalysisType.SSCI_IMPEDANCE.value,
        nazwa_pl="Stabilność podsynchroniczna (SSCI)",
        grupa=GRUPA_JAKOSC,
        pytanie_pl=(
            "Czy przekształtnik przyłączony do sieci o danej sztywności nie wejdzie "
            "w interakcję podsynchroniczną (rezonans regulacyjny)?"
        ),
        zakres_pl=(
            "Jeden przekształtnik — wskazany parametrem albo pierwszy przekształtnik modelu; "
            "impedancja sieci widziana z jego szyny i impedancja wyjściowa przekształtnika "
            "w paśmie podsynchronicznym. Ocena stabilności kryterium Nyquista nie jest "
            "wykonywana: impedancja sieci liczona jest bez przekładni transformatora."
        ),
        wielkosci_glowne=(
            WielkoscGlowna(
                "Z_grid(f)",
                "Impedancja sieci z szyny przekształtnika",
                "Ω",
                r"Z_{\mathrm{grid}}(f)",
            ),
            WielkoscGlowna(
                "Z_conv(f)",
                "Impedancja wyjściowa przekształtnika",
                "Ω",
                r"Z_{\mathrm{conv}}(f)",
            ),
            WielkoscGlowna(
                "L(f)",
                "Wzmocnienie pętli mniejszej Z_grid/Z_conv",
                "-",
                r"L(f) = Z_{\mathrm{grid}}(f)/Z_{\mathrm{conv}}(f)",
            ),
            WielkoscGlowna(
                "Re Z_conv,min",
                "Najmniejsza rezystancja wyjściowa przekształtnika",
                "Ω",
                r"\min\ \mathrm{Re}\,Z_{\mathrm{conv}}",
            ),
        ),
        bez_podstawy_pl=(
            "Ta analiza dostarcza tablice impedancji. Ocena stabilności (kryterium "
            "impedancyjne Nyquista wg Sun 2011 / Wen 2016) nie jest wykonywana — impedancja "
            "sieci Z_grid(f) liczona jest bez przekładni transformatora; okno „Stabilność "
            "SSCI” pokazuje wyjaśnienie i metryki wyłącznie jako materiał audytowy."
        ),
        dane_z_modelu=(
            DanaZModelu(
                "Karta przekształtnika: napięcie i moc znamionowa, pasma pętli prądowej, "
                "napięciowej i PLL, opóźnienie regulacji, indukcyjność i rezystancja filtra, "
                "tryb pracy, punkt pracy P/Q",
                "przekształtnik PV/BESS/wiatrowy z kartą katalogową",
            ),
            DanaZModelu("Impedancje i susceptancje gałęzi", "linie, kable, aparaty łączeniowe"),
            DanaZModelu("Moc zwarciowa źródła zasilania", "źródło sieci nadrzędnej"),
        ),
        od_uzytkownika=(
            ParametrUzytkownika(
                "ssci_converter_ref",
                "Oznaczenie przekształtnika do badania",
                "-",
                False,
                "Puste = pierwszy przekształtnik modelu.",
            ),
        ),
        katalog_odniesienia="converter-modes",
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
            ParametrUzytkownika(
                klucz="reliability_data",
                nazwa_pl="Dane niezawodności elementu (intensywność uszkodzeń, czas odnowy)",
                jednostka="1/rok, h",
                wymagane=False,
                opis_pl=(
                    "Identyfikator gałęzi → całkowita intensywność uszkodzeń elementu [1/rok] "
                    "i czas odnowy [h]; zastępuje wartość roboczą rejestru niezawodności dla "
                    "tego elementu."
                ),
            ),
        ),
        domyslne_solvera=(
            DomyslnaSolvera(
                "failure_rate_per_year",
                "Intensywność uszkodzeń elementu",
                _opis_niezawodnosci(intensywnosc=True),
                "1/rok",
                "Wartość robocza rejestru niezawodności programu — "
                + next(iter(PROPOZYCJE_NIEZAWODNOSCI.values())).odniesienie
                + ". Model nie niesie danych niezawodnościowych elementów; każda wartość "
                "robocza jest daną przyjętą wyniku (kompletność dowodu NIEPEŁNY), a projektant "
                "zastępuje ją w danych niezawodności analizy.",
            ),
            DomyslnaSolvera(
                "mttr_h",
                "Czas odtworzenia zasilania po awarii elementu",
                _opis_niezawodnosci(intensywnosc=False),
                "h",
                "Wartość robocza rejestru niezawodności programu (założenie inżynierskie, bez "
                "wartości normowej) — dana przyjęta wyniku; projektant zastępuje ją w danych "
                "niezawodności analizy.",
            ),
            DomyslnaSolvera(
                "maifi_udzial",
                "Udział przerw krótkich w liczbie przerw długich",
                UDZIAL_MAIFI_DO_SAIFI,
                "1",
                f"MAIFI = {_lp(UDZIAL_MAIFI_DO_SAIFI)}·SAIFI — {ODNIESIENIE_MAIFI}; dana przyjęta "
                "wyniku.",
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
                zrodlo_zalozenia(Z_NAPIECIE_DOTYKOWE),
                symbol_latex=r"U_{\mathrm{dot}}",
                warunek_latex=r"U_{\mathrm{dot}} \leq U_{\mathrm{dot,dop}}",
                wzor_latex=(
                    r"U_{\mathrm{dot,dop}} = \left(1000 + 1{,}5\, C_s\, \rho_s\right)"
                    r"\cdot \dfrac{0{,}157}{\sqrt{t_f}}"
                ),
                wzor_opis_pl=(
                    "ρ_s — rezystywność warstwy powierzchniowej [Ω·m]; C_s — współczynnik "
                    "redukcji warstwy powierzchniowej; t_f — czas wyłączenia zwarcia [s]; "
                    "ciało człowieka 70 kg (praktyka IEEE 80, metoda Sveraka)."
                ),
            ),
            PodstawaOceny(
                "Napięcie krokowe",
                "U_kr",
                "V",
                "wartość dopuszczalna liczona jak dla napięcia dotykowego, ze współczynnikiem 6 "
                "zamiast 1,5 — wzór obok",
                "U_kr,dop = (1000 + 6·C_s·ρ_s)·0,157/√t_f",
                zrodlo_zalozenia(Z_NAPIECIE_KROKOWE),
                symbol_latex=r"U_{\mathrm{kr}}",
                warunek_latex=r"U_{\mathrm{kr}} \leq U_{\mathrm{kr,dop}}",
                wzor_latex=(
                    r"U_{\mathrm{kr,dop}} = \left(1000 + 6\, C_s\, \rho_s\right)"
                    r"\cdot \dfrac{0{,}157}{\sqrt{t_f}}"
                ),
                wzor_opis_pl=(
                    "ρ_s — rezystywność warstwy powierzchniowej [Ω·m]; C_s — współczynnik "
                    "redukcji warstwy powierzchniowej; t_f — czas wyłączenia zwarcia [s]; "
                    "ciało człowieka 70 kg (praktyka IEEE 80, metoda Sveraka)."
                ),
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
                _prog(Z_MARGINES_IZOLACJI),
                zrodlo_zalozenia(Z_MARGINES_IZOLACJI),
                symbol_latex=r"M_{\mathrm{BIL}}",
                warunek_latex=(
                    r"M_{\mathrm{BIL}} = \dfrac{\mathrm{BIL} - U_{\mathrm{res}}}"
                    r"{U_{\mathrm{res}}}\cdot 100\% \geq 20\%"
                ),
            ),
            PodstawaOceny(
                "Przepięcie dorywcze przy doziemieniu",
                "U_c",
                "kV",
                "U_TOV = k·U_m/√3; sieć izolowana i kompensowana (doziemienie długotrwałe): "
                "U_c ≥ U_TOV; sieć z rezystorem i uziemiona bezpośrednio (doziemienie "
                "wyłączane): U_c ≥ U_m/√3 oraz wytrzymałość TOV 10 s ≥ U_TOV",
                "k z solvera doziemienia sieci (sposób pracy punktu neutralnego)",
                f"{zrodlo_zalozenia(Z_NAPIECIE_PRACY)}; {zrodlo_zalozenia(Z_PRZEPIECIE_DORYWCZE)}",
                symbol_latex=r"U_c",
                warunek_latex=(
                    r"U_c \geq U_{\mathrm{TOV}} \ \text{albo}\ "
                    r"\left(U_c \geq \dfrac{U_m}{\sqrt{3}} \wedge "
                    r"\mathrm{TOV}_{10\,\mathrm{s}} \geq U_{\mathrm{TOV}}\right)"
                ),
                wzor_latex=r"U_{\mathrm{TOV}} = k\,\dfrac{U_m}{\sqrt{3}}",
                wzor_opis_pl=(
                    "k — współczynnik zwarcia doziemnego sieci (U_fazy zdrowej/U_f) z solvera "
                    "doziemienia wg sposobu pracy punktu neutralnego; U_m — napięcie "
                    "najwyższe sieci [kV]; U_c — napięcie trwałej pracy ogranicznika [kV]; "
                    "TOV_10s — wytrzymałość ogranicznika na przepięcie dorywcze 10 s [kV]."
                ),
            ),
        ),
        dane_z_modelu=(
            DanaZModelu(
                "Ograniczniki przepięć i ich karty katalogowe (U_c, U_r, U_res, wytrzymałość "
                "TOV 10 s)",
                "aparaty pierwotne pól i stacji",
            ),
            DanaZModelu(
                "Napięcie najwyższe sieci U_m",
                "poziom napięcia szyny albo karta ogranicznika",
            ),
            DanaZModelu(
                "Sposób pracy punktu neutralnego i współczynnik zwarcia doziemnego k",
                "zespoły uziemiające sieci SN (solver doziemienia), źródła, transformatory",
            ),
        ),
        domyslne_solvera=(
            DomyslnaSolvera(
                "arrester_mcov_kv",
                "Dobór wstępny ogranicznika bez karty katalogowej",
                "U_c = wymagane wg czasu doziemienia (przy doziemieniu wyłączanym U_c dobrane "
                "tak, by TOV_10s ≥ U_TOV); U_r = 1,2·U_c; U_res = 4,0·U_c; TOV_10s = 1,4·U_c "
                "(skrajne stosunki ograniczników ZnO SN katalogu programu, zachowawczo)",
                "kV",
                "Wartości robocze WYŁĄCZNIE przy braku karty ogranicznika — każda jest daną "
                "przyjętą wiersza o jakości szacowanej, a ocena ma kompletność dowodu NIEPEŁNY.",
            ),
            DomyslnaSolvera(
                "earth_fault_factor",
                "Współczynnik zwarcia doziemnego bez wyniku doziemienia sieci",
                "k = √3 (sieć izolowana, kompensowana, z rezystorem); k = 1,4 (uziemiona "
                "bezpośrednio)",
                "1",
                "Wartość robocza trybu dla szyny poza siecią SN modelu — dana przyjęta "
                "wiersza (IEC 60071-1).",
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
        podstawa_oceny=(
            PodstawaOceny(
                "Funkcje metody zalecanej w przekaźniku",
                "F_wym",
                "-",
                "każda funkcja metody zalecanej dla sposobu pracy punktu neutralnego jest w "
                "wyposażeniu przekaźnika wskazanym przez projektanta",
                "F_wym ⊆ F_przekaźnika",
                zrodlo_zalozenia(Z_METODA_DETEKCJI),
                symbol_latex=r"F_{\mathrm{wym}}",
                warunek_latex=r"F_{\mathrm{wym}} \subseteq F_{\mathrm{przekaźnika}}",
                wzor_latex=r"F_{\mathrm{wym}} \subseteq F_{\mathrm{przekaźnika}}",
                wzor_opis_pl=(
                    "F_wym — funkcje metody zalecanej (metoda złożona 51N+67N wymaga obu funkcji, "
                    "51N/50N — obu funkcji); F_przekaźnika — funkcje wskazane przez projektanta. "
                    "Granica nie jest liczbą — jest porównaniem zbiorów."
                ),
            ),
        ),
        dane_z_modelu=(
            DanaZModelu(
                "Sposób uziemienia punktu neutralnego sieci SN (wariant zespołu uziemiającego)",
                "zespoły uziemiające sekcji SN, transformatory",
            ),
        ),
        od_uzytkownika=(
            ParametrUzytkownika(
                "relay_methods",
                "Funkcje detekcji doziemień dostępne w przekaźniku",
                "-",
                False,
                "Wyposażenie przekaźnika pola — model go nie niesie. Bez niego dobór metody "
                "biegnie, a kryterium dostępności funkcji jest nieocenione (brak nazwany).",
            ),
        ),
        uwagi_metody_pl=(
            "Nastawy rozruchowe U0/P0/I5 nie są prezentowane — solver nie ma dla nich "
            "udokumentowanej podstawy.",
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
                "u_TRV_max",
                "Największa wartość napięcia powrotnego",
                "kV",
                r"\max u_{\mathrm{TRV}}",
            ),
            WielkoscGlowna(
                "I_2h/I_szczyt",
                "Udział 2. harmonicznej w prądzie załączania",
                "%",
                r"I_{2h}/I_{\mathrm{szczyt}}",
            ),
            WielkoscGlowna("ferro", "Ryzyko ferrorezonansu", "-", r"\text{ferro}"),
        ),
        bez_podstawy_pl=(
            "Obwiednia wytrzymałości wyłącznika na napięcie powrotne wynika z parametrów u_c, "
            "t_3 tablic IEC 62271-100 dla napięcia znamionowego wyłącznika — tablice nie są "
            "danymi programu, więc kryterium nie ma podstawy (rekord oceny „brak podstawy”); "
            "przebieg napięcia powrotnego jest wynikiem bez oceny."
        ),
        dane_z_modelu=(
            DanaZModelu(
                "Napięcie najwyższe urządzenia U_m sieci SN (proponowane U_r wyłącznika, "
                "IEC 60038 / IEC 62271-1)",
                "sieci SN, szyny",
            ),
            DanaZModelu("Susceptancje doziemne gałęzi (ferrorezonans)", "linie, kable"),
            DanaZModelu(
                "Sposób uziemienia punktu neutralnego sieci SN (wariant zespołu uziemiającego)",
                "zespoły uziemiające sekcji SN, transformatory",
            ),
        ),
        od_uzytkownika=(
            ParametrUzytkownika(
                "breaker_rated_voltage_kv",
                "Napięcie znamionowe wyłącznika",
                "kV",
                False,
                "Puste = napięcie najwyższe urządzenia U_m sieci SN modelu (IEC 60038 tab. 3–5; "
                "U_r aparatu = U_m, IEC 62271-1).",
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
        ),
        uwagi_metody_pl=(
            "Zalecenie blokady zabezpieczenia różnicowego od 2. harmonicznej (udział ≥ 10 % "
            "szczytu prądu załączania, udział szacowany zależnością 63 %/krotność) jest regułą "
            "solvera bez podstawy normowej — informacja, nie ocena kryterium.",
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
            "wskazanej szynie, rozruch bezpośredni; zapad z impedancji zastępczej sieci w węźle "
            "silnika (przekątna macierzy impedancyjnej z impedancją zasilania systemowego); "
            "szyna zasilana przez transformator nie ma zapadu — macierz analizy nie ma "
            "przekładni transformatora (nazwany brak w wyniku)."
        ),
        wielkosci_glowne=(
            WielkoscGlowna("I_r", "Prąd rozruchowy", "A", r"I_r"),
            WielkoscGlowna("ΔU", "Zapad napięcia na szynie", "%", r"\Delta U"),
            WielkoscGlowna("M_r", "Moment rozruchowy", "j.w.", r"M_r"),
            WielkoscGlowna(
                "t_r/t_utyku",
                "Czas rozruchu odniesiony do dopuszczalnego czasu utyku",
                "-",
                r"t_r / t_{\mathrm{utyku}}",
            ),
        ),
        podstawa_oceny=(
            PodstawaOceny(
                "Zapad napięcia na szynie",
                "ΔU",
                "%",
                "ΔU ≤ granica przy prądzie rozruchowym k_LR·I_n",
                _prog(Z_ZAPAD_ROZRUCHU),
                zrodlo_zalozenia(Z_ZAPAD_ROZRUCHU),
                symbol_latex=r"\Delta U",
                warunek_latex=r"\Delta U \leq 15\%",
            ),
            PodstawaOceny(
                "Czas rozruchu",
                "t_r",
                "s",
                "t_r ≤ t_utyku (dopuszczalny czas utyku podany przy prądzie zablokowanego wirnika)",
                "t_r ≤ t_utyku",
                zrodlo_zalozenia(Z_CZAS_ROZRUCHU),
                symbol_latex=r"t_r",
                warunek_latex=r"t_r \leq t_{\mathrm{utyku}}",
                wzor_latex=r"t_r \leq t_{\mathrm{utyku}}",
                wzor_opis_pl=(
                    "t_r — czas rozruchu napędu [s]; t_utyku — dopuszczalny czas utyku silnika "
                    "z karty silnika [s]. Granica jest daną silnika, nie stałą liczbą."
                ),
            ),
            PodstawaOceny(
                "Moment rozruchowy",
                "M_r",
                "j.w.",
                "M_r ≥ M_obciążenia przy rozruchu",
                "M_r ≥ M_obc",
                zrodlo_zalozenia(Z_MOMENT_ROZRUCHOWY),
                symbol_latex=r"M_r",
                warunek_latex=r"M_r \geq M_{\mathrm{obc}}",
                wzor_latex=r"M_r \geq M_{\mathrm{obc}}",
                wzor_opis_pl=(
                    "M_r — moment rozruchowy silnika w jednostkach względnych; "
                    "M_obc — moment obciążenia napędzanego mechanizmu przy rozruchu, "
                    "w tych samych jednostkach. Granica nie jest stałą liczbą — jest "
                    "porównaniem dwóch wielkości z tego samego biegu."
                ),
            ),
        ),
        dane_z_modelu=(
            DanaZModelu(
                "Impedancje gałęzi i impedancja zasilania systemowego Z_Q (sieć zasilająca)",
                "linie, kable, aparaty łączeniowe, źródło sieci nadrzędnej",
            ),
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
            "Galwanicznie połączona sieć SN wszystkich sekcji (dobór zespołu na pracę jednego "
            "zespołu na sieć — ENEA Zeszyt 1 §16): pojemność doziemna z susceptancji zerowej "
            "linii i kabli tej sieci (łączniki otwarte pominięte; element bez susceptancji "
            "zerowej jest pomijany i wymieniony; linie 110 kV i kable nN nie należą do sieci "
            "SN); napięcie sieci = napięcie znamionowe sieci SN; dobór dławika gaszącego "
            "(Petersen) albo sprawdzenie rezystora uziemiającego zespołu z modelu."
        ),
        wielkosci_glowne=(
            WielkoscGlowna("I_C", "Prąd pojemnościowy doziemienia sieci", "A", r"I_C"),
            WielkoscGlowna("C_0", "Pojemność doziemna sieci", "F", r"C_0"),
            WielkoscGlowna("L, X_L", "Indukcyjność i reaktancja dławika", "H, Ω", r"L,\ X_L"),
            WielkoscGlowna("I_res", "Prąd resztkowy dławika modelu", "A", r"I_{\mathrm{res}}"),
            WielkoscGlowna("R_N", "Rezystancja uziemiająca punktu neutralnego", "Ω", r"R_N"),
            WielkoscGlowna("E", "Energia wydzielona w rezystorze w czasie wyłączenia", "J", r"E"),
        ),
        podstawa_oceny=(
            PodstawaOceny(
                "Prąd resztkowy (sieć kompensowana)",
                "I_res/I_C",
                "%",
                "I_res = √(I_w² + (I_C − I_L)²) dławika modelu (I_L, I_w z impedancji punktów "
                "neutralnych w ruchu) ≤ udział prądu pojemnościowego",
                _prog(Z_PRAD_RESZTKOWY),
                zrodlo_zalozenia(Z_PRAD_RESZTKOWY),
                symbol_latex=r"I_{\mathrm{res}}/I_C",
                warunek_latex=r"I_{\mathrm{res}}/I_C \leq 10\%",
            ),
            PodstawaOceny(
                "Energia w rezystorze (sieć uziemiona przez rezystor)",
                "E",
                "J",
                "E_k = I_th²·R·t_wył ≤ E_n = I_n²·R·t_n rezystora (I_th = I_R,k·√(m+n), "
                "I_R,k = c_max·U_f/|R + Z_0,TU/3|)",
                "E ≤ E_n",
                zrodlo_zalozenia(Z_ENERGIA_REZYSTORA),
                symbol_latex=r"E",
                warunek_latex=r"E \leq E_n",
                wzor_latex=(
                    r"E_k = I_{\mathrm{th}}^2 \cdot R \cdot t_{\text{wył}} \leq "
                    r"E_n = I_n^2 \cdot R \cdot t_n\text{,}\quad "
                    r"I_{R,k} = \dfrac{c_{\max} U_f}{\left|R + Z_{0,\mathrm{TU}}/3\right|}"
                ),
                wzor_opis_pl=(
                    "I_R,k — największy prąd rezystora przy doziemieniu metalicznym wg IEC 60909-0 "
                    "(c_max z tab. 1, droga zerowa gałęzi uziemiającej Z_0,TU/3 + R) [A]; "
                    "I_th = I_R,k·√(m+n) — prąd cieplny zastępczy (IEC 60909-0 §12) [A]; R — "
                    "rezystancja rezystora zespołu uziemiającego [Ω]; t_wył — czas wyłączenia "
                    "zwarcia doziemnego [s]; I_n, t_n — prąd znamionowy rezystora i dopuszczalny "
                    "czas jego przepływu [A, s] (IEEE Std C57.32)."
                ),
            ),
        ),
        dane_z_modelu=(
            DanaZModelu("Susceptancja zerowa (doziemna) i długość gałęzi", "linie, kable sieci SN"),
            DanaZModelu("Napięcie znamionowe sieci SN", "sieć SN zespołu uziemiającego"),
            DanaZModelu(
                "Sposób uziemienia punktu neutralnego sieci SN (wariant zespołu uziemiającego)",
                "zespoły uziemiające sekcji SN, transformatory",
            ),
            DanaZModelu(
                "Rezystor punktu neutralnego (R, prąd znamionowy, dopuszczalny czas przepływu), "
                "impedancje punktów neutralnych w ruchu (dławik gaszący, rezystor wymuszający "
                "AWSC, dławik ‖ rezystor) i impedancja zerowa transformatora uziemiającego",
                "zespoły uziemiające sekcji SN, transformatory",
            ),
        ),
        od_uzytkownika=(
            # Karta UX-04/POLE-ZU-SKLADOWA-ZEROWA §0 pkt 4: rezystor (R, I_n, t_n) jest daną
            # MODELU — dawne parametry „docelowy prąd doziemienia" i „energia znamionowa
            # rezystora" nadpisywały model i zostały skasowane. Czas wyłączenia to dana
            # zabezpieczeń: bez niego analiza liczy R i I_ef, a sprawdzenia cieplnego nie
            # wykonuje (nazwany brak w wyniku) — nie blokuje biegu.
            ParametrUzytkownika(
                "ner_clearing_time_s",
                "Czas wyłączenia zwarcia doziemnego (rezystor)",
                "s",
                False,
                "Dla sieci z rezystorem w punkcie neutralnym; bez wpisu sprawdzenie cieplne "
                "rezystora nie jest wykonywane.",
            ),
        ),
        uwagi_metody_pl=(
            "Dławik dobierany do rezonansu z pojemnością doziemną sieci; prąd resztkowy, "
            "rozstrojenie i składowa czynna liczone dla dławika MODELU tym samym solverem co "
            "wiersz zwarcia jednofazowego (straty czynne dławika i upływność izolacji sieci "
            "nie są opisane w modelu — rzeczywisty prąd resztkowy jest nie mniejszy).",
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

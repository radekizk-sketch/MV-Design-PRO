"""
Wzorzec odniesienia C: Wpływ generacji lokalnej na zabezpieczenia SN

PATTERN ID: RP-LOC-GEN-IMPACT
NAME (PL): Wpływ generacji lokalnej na zabezpieczenia SN

CEL:
Diagnostyka wpływu generacji lokalnej (PV/BESS/agregaty) na działanie
zabezpieczeń SN, w szczególności:
- prądy „widziane" przez zabezpieczenia,
- ryzyko niepożądanej blokady zabezpieczenia szyn,
- wpływ na selektywność stopni nadprądowych I> oraz I>>.

CANONICAL ALIGNMENT:
- NOT-A-SOLVER: Wzorzec jest komponentem warstwy INTERPRETACJI.
  NIE wykonuje obliczeń fizycznych — jedynie analizuje i porównuje wyniki.
- WHITE BOX: Pełny ślad wszystkich kroków diagnostycznych.
- DETERMINISM: Identyczne wejście → identyczny wynik.

SPRAWDZENIA DIAGNOSTYCZNE:
A) Zmiana prądu zwarciowego w punkcie zabezpieczenia
   - ±10% → informacyjne
   - 10-30% → GRANICZNE
   - >30% → NIEZGODNE

B) Ryzyko niepożądanej blokady zabezpieczenia szyn
   - sprawdzenie wkładu prądowego generacji lokalnej

C) Wpływ na selektywność zabezpieczeń nadprądowych
   - porównanie relacji I>/I>> dla scenariuszy bez/z generacją

WERDYKT:
- ZGODNE: brak istotnego wpływu generacji lokalnej
- GRANICZNE: wpływ zauważalny, możliwy do opanowania nastawami
- NIEZGODNE: generacja powoduje istotne ryzyko błędnego działania zabezpieczeń

BEZ NAZW KODOWYCH W UI/DOWODZIE.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from typing import Any

from werdykt import OcenaKryterium, WynikWymagania, format_liczba
from werdykt.porownanie import DOTYCZY_OBIEKTU, Porownanie

from .base import (
    ReferencePatternResult,
    build_check,
    build_trace_step,
    stable_sort_dict,
)
from .oceny import (
    ocena_sprawdzenia,
    opis_werdyktu,
    podstawa_wzorca_c,
    status_sprawdzenia,
    werdykt_wzorca,
    wymaganie_wzorca,
)

# =============================================================================
# STAŁE
# =============================================================================

PATTERN_C_ID = "RP-LOC-GEN-IMPACT"
PATTERN_C_NAME_PL = "Wpływ generacji lokalnej na zabezpieczenia SN"

# Progi oceny zmiany prądu zwarciowego
PROG_INFORMACYJNY_PCT = 10.0  # do ±10% → INFO
PROG_GRANICZNY_PCT = 30.0  # 10-30% → GRANICZNE, >30% → NIEZGODNE

# Próg wpływu na selektywność (zmniejszenie rezerwy)
PROG_REZERWY_SELEKTYWNOSCI_PCT = 20.0  # utrata >20% rezerwy → GRANICZNE

# Ryzyko blokady szyn: wkład generacji powyżej 0,8 progu blokady
WSPOLCZYNNIK_RYZYKA_BLOKADY = 0.8

# Margines selektywności I>> / I''k,next: minimum i próg ostrzeżenia
MARGINES_SELEKTYWNOSCI_MIN = 1.2
MARGINES_SELEKTYWNOSCI_OSTRZEZENIE = 1.5

_PODSTAWA_B = "próg ryzyka 0,8 progu blokady zabezpieczenia szyn"

# Podkatalog fixtures
PATTERN_C_FIXTURES_SUBDIR = "wzorzec_c_generacja_lokalna"


# =============================================================================
# TYPY DANYCH WEJŚCIOWYCH
# =============================================================================


class TypGeneracji(StrEnum):
    """Typ źródła generacji lokalnej."""

    PV = "PV"
    BESS = "BESS"
    AGREGAT = "AGREGAT"


@dataclass(frozen=True)
class ZrodloGeneracji:
    """Dane źródła generacji lokalnej."""

    id: str
    nazwa: str
    typ: TypGeneracji
    moc_znamionowa_kw: float
    prad_zwarciowy_a: float  # Wkład do prądu zwarciowego


@dataclass(frozen=True)
class DaneZwarciowePunktuZabezpieczenia:
    """Dane zwarciowe dla punktu zabezpieczenia w danym scenariuszu."""

    scenariusz: str  # np. "bez_generacji", "generacja_min", "generacja_max"
    ik_3f_a: float  # Prąd zwarciowy 3-fazowy [A]
    ik_2f_a: float  # Prąd zwarciowy 2-fazowy [A]
    ik_1f_a: float | None  # Prąd zwarciowy 1-fazowy [A] (opcjonalnie)
    wklad_generacji_a: float  # Wkład prądowy od generacji lokalnej [A]


@dataclass(frozen=True)
class NastawyZabezpieczen:
    """Nastawy zabezpieczeń nadprądowych."""

    i_wyzszy_stopien_a: float  # I>> (wyższy stopień) [A]
    i_nizszy_stopien_a: float  # I> (niższy stopień) [A]
    prog_blokady_szyn_a: float | None  # Próg blokady zabezpieczenia szyn [A]


@dataclass(frozen=True)
class WzorzecCInput:
    """
    Dane wejściowe dla wzorca C.

    STRUKTURA ZAMROŻONA - nie modyfikować bez wersjonowania.
    """

    # Identyfikatory
    punkt_zabezpieczenia_id: str
    punkt_zabezpieczenia_nazwa: str
    szyny_id: str
    szyny_nazwa: str

    # Źródła generacji lokalnej
    zrodla_generacji: tuple[ZrodloGeneracji, ...]

    # Dane zwarciowe dla każdego scenariusza
    dane_bez_generacji: DaneZwarciowePunktuZabezpieczenia
    dane_generacja_min: DaneZwarciowePunktuZabezpieczenia
    dane_generacja_max: DaneZwarciowePunktuZabezpieczenia

    # Nastawy zabezpieczeń
    nastawy: NastawyZabezpieczen

    # Opcjonalnie: prąd zwarciowy za następnym zabezpieczeniem
    ik_za_nastepnym_zabezpieczeniem_a: float | None = None


# =============================================================================
# ŁADOWANIE FIXTURES
# =============================================================================


def get_fixtures_dir() -> Path:
    """Zwraca ścieżkę do katalogu fixtures."""
    return Path(__file__).parent / "fixtures"


def get_pattern_c_fixtures_dir() -> Path:
    """Zwraca ścieżkę do katalogu fixtures wzorca C."""
    return get_fixtures_dir() / PATTERN_C_FIXTURES_SUBDIR


def load_fixture_c(filename: str) -> dict[str, Any]:
    """
    Wczytuje dane fixture z pliku JSON.

    Args:
        filename: Nazwa pliku fixture (np. "przypadek_zgodny.json")

    Returns:
        Dane fixture jako słownik.

    Raises:
        FileNotFoundError: Gdy plik nie istnieje.
    """
    pattern_c_path = get_pattern_c_fixtures_dir() / filename
    if pattern_c_path.exists():
        with open(pattern_c_path, encoding="utf-8") as f:
            return json.load(f)

    raise FileNotFoundError(f"Fixture '{filename}' nie znaleziony. Sprawdzono: {pattern_c_path}")


def fixture_to_input_c(fixture: dict[str, Any]) -> WzorzecCInput:
    """
    Konwertuje dane fixture na WzorzecCInput.

    Args:
        fixture: Dane fixture jako słownik

    Returns:
        Instancja WzorzecCInput
    """
    # Buduj źródła generacji
    zrodla = tuple(
        ZrodloGeneracji(
            id=z["id"],
            nazwa=z["nazwa"],
            typ=TypGeneracji(z["typ"]),
            moc_znamionowa_kw=z["moc_znamionowa_kw"],
            prad_zwarciowy_a=z["prad_zwarciowy_a"],
        )
        for z in fixture["zrodla_generacji"]
    )

    # Buduj dane zwarciowe dla scenariuszy
    def parse_dane_zwarciowe(data: dict, scenariusz: str) -> DaneZwarciowePunktuZabezpieczenia:
        return DaneZwarciowePunktuZabezpieczenia(
            scenariusz=scenariusz,
            ik_3f_a=data["ik_3f_a"],
            ik_2f_a=data["ik_2f_a"],
            ik_1f_a=data.get("ik_1f_a"),
            wklad_generacji_a=data["wklad_generacji_a"],
        )

    dane_bez = parse_dane_zwarciowe(fixture["dane_bez_generacji"], "bez_generacji")
    dane_min = parse_dane_zwarciowe(fixture["dane_generacja_min"], "generacja_min")
    dane_max = parse_dane_zwarciowe(fixture["dane_generacja_max"], "generacja_max")

    # Buduj nastawy
    nastawy_data = fixture["nastawy"]
    nastawy = NastawyZabezpieczen(
        i_wyzszy_stopien_a=nastawy_data["i_wyzszy_stopien_a"],
        i_nizszy_stopien_a=nastawy_data["i_nizszy_stopien_a"],
        prog_blokady_szyn_a=nastawy_data.get("prog_blokady_szyn_a"),
    )

    return WzorzecCInput(
        punkt_zabezpieczenia_id=fixture["punkt_zabezpieczenia_id"],
        punkt_zabezpieczenia_nazwa=fixture["punkt_zabezpieczenia_nazwa"],
        szyny_id=fixture["szyny_id"],
        szyny_nazwa=fixture["szyny_nazwa"],
        zrodla_generacji=zrodla,
        dane_bez_generacji=dane_bez,
        dane_generacja_min=dane_min,
        dane_generacja_max=dane_max,
        nastawy=nastawy,
        ik_za_nastepnym_zabezpieczeniem_a=fixture.get("ik_za_nastepnym_zabezpieczeniem_a"),
    )


# =============================================================================
# WALIDATOR WZORCA
# =============================================================================


@dataclass(frozen=True)
class _Sprawdzenie:
    """Sprawdzenie wzorca C: słownik sprawdzenia, krok śladu, rekord K i zdanie ograniczenia
    (sygnał ostrzeżenia na spełnionym rekordzie) — jedno źródło dla werdyktu i podsumowania."""

    check: dict[str, Any]
    trace: dict[str, Any]
    ocena: OcenaKryterium
    ograniczenie: str | None


@dataclass
class WzorzecCGeneracjaLokalna:
    """
    Wzorzec odniesienia C: Wpływ generacji lokalnej na zabezpieczenia SN.

    Wykonuje sprawdzenia diagnostyczne:
    A) Zmiana prądu zwarciowego w punkcie zabezpieczenia
    B) Ryzyko niepożądanej blokady zabezpieczenia szyn
    C) Wpływ na selektywność zabezpieczeń nadprądowych

    NOT-A-SOLVER: Jedynie interpretuje wyniki obliczeń zwarciowych.
    """

    def validate(
        self,
        input_data: WzorzecCInput | None = None,
        fixture_file: str | None = None,
    ) -> ReferencePatternResult:
        """
        Uruchamia walidację wzorca C.

        Args:
            input_data: Dane wejściowe WzorzecCInput
            fixture_file: Nazwa pliku fixture do wczytania

        Returns:
            ReferencePatternResult z werdyktem, sprawdzeniami i śladem.
        """
        trace_steps: list[dict[str, Any]] = []

        # Krok 1: Wczytaj dane
        if fixture_file:
            trace_steps.append(
                build_trace_step(
                    step="wczytanie_fixture",
                    description_pl="Wczytanie danych referencyjnych z pliku fixture",
                    inputs={"fixture_file": fixture_file},
                    outputs={"status": "wczytano"},
                )
            )
            fixture = load_fixture_c(fixture_file)
            input_data = fixture_to_input_c(fixture)

        if input_data is None:
            raise ValueError("Musisz podać input_data lub fixture_file")

        trace_steps.append(
            build_trace_step(
                step="inicjalizacja_diagnostyki",
                description_pl="Inicjalizacja diagnostyki wpływu generacji lokalnej",
                inputs={
                    "punkt_zabezpieczenia": input_data.punkt_zabezpieczenia_nazwa,
                    "szyny": input_data.szyny_nazwa,
                    "liczba_zrodel_generacji": len(input_data.zrodla_generacji),
                },
            )
        )

        # Krok 2-4: sprawdzenia A, B, C — każde z rekordem K i sygnałem ograniczenia.
        spr_a = self._sprawdz_zmiane_pradu_zwarciowego(input_data)
        spr_b = self._sprawdz_ryzyko_blokady_szyn(input_data)
        spr_c = self._sprawdz_wplyw_na_selektywnosc(input_data)
        sprawdzenia = (spr_a, spr_b, spr_c)

        checks_sorted = sorted((s.check for s in sprawdzenia), key=lambda c: c["name_pl"])
        trace_steps.extend(s.trace for s in sprawdzenia)

        # Krok 5: Wyznacz werdykt — projekcja rekordu W nad trzema sprawdzeniami.
        oceny = tuple(s.ocena for s in sprawdzenia)
        ograniczenia = [s.ograniczenie for s in sprawdzenia if s.ograniczenie is not None]
        wymaganie = wymaganie_wzorca(
            wzorzec="C",
            wymaganie_id=f"wzorzec_c.{input_data.punkt_zabezpieczenia_id}",
            nazwa_pl=f"{PATTERN_C_NAME_PL} — {input_data.punkt_zabezpieczenia_nazwa}",
            oceny=oceny,
        )
        verdict = werdykt_wzorca(oceny, ograniczenia=ograniczenia)
        opis = opis_werdyktu(wymaganie, verdict, ograniczenia)

        trace_steps.append(
            build_trace_step(
                step="wyznaczenie_werdyktu",
                description_pl="Wyznaczenie werdyktu końcowego wzorca",
                inputs={
                    "status_sprawdzenia_a": spr_a.check["status"],
                    "status_sprawdzenia_b": spr_b.check["status"],
                    "status_sprawdzenia_c": spr_c.check["status"],
                },
                outputs={"verdict": verdict, "wyjasnienie": wymaganie.wyjasnienie.zdanie_pl},
            )
        )

        # Krok 6: Zbuduj artefakty
        artifacts = self._buduj_artefakty(input_data, sprawdzenia)

        # Krok 7: Zbuduj podsumowanie
        summary_pl = self._buduj_podsumowanie(wymaganie, ograniczenia, input_data, sprawdzenia)

        return ReferencePatternResult(
            pattern_id=PATTERN_C_ID,
            name_pl=PATTERN_C_NAME_PL,
            verdict=verdict,
            verdict_description_pl=opis,
            summary_pl=summary_pl,
            wymaganie=wymaganie,
            wyjasnienie=wymaganie.wyjasnienie,
            checks=tuple(checks_sorted),
            trace=tuple(trace_steps),
            artifacts=stable_sort_dict(artifacts),
        )

    def _sprawdzenie(
        self,
        input_data: WzorzecCInput,
        porownanie: Porownanie,
        *,
        name_pl: str,
        description_pl: str,
        podstawa_pl: str,
        prog_ostrzezenia: float | None,
        details: dict[str, Any] | None,
        trace_step: str,
        trace_description_pl: str,
        formula: str,
        trace_inputs: dict[str, Any],
        calculation: dict[str, Any] | None,
    ) -> _Sprawdzenie:
        """Rekord K sprawdzenia, sygnał ograniczenia i kod zastany z JEDNEJ wielkości.

        Sygnał ograniczenia (``WARN``) nakłada się wyłącznie na rekord SPEŁNIONY i porównuje
        ten sam ``porownanie.wynik`` z progiem ostrzeżenia w kierunku relacji kryterium."""
        ocena = ocena_sprawdzenia(
            porownanie,
            wzorzec="C",
            element_ref=input_data.punkt_zabezpieczenia_id,
            nazwa_pl=input_data.punkt_zabezpieczenia_nazwa,
            krok_sladu=trace_step,
            podstawa=podstawa_wzorca_c(podstawa_pl),
        )
        ograniczenie: str | None = None
        wynik = porownanie.wynik
        if (
            ocena.status_maszynowy == "SPELNIA"
            and prog_ostrzezenia is not None
            and wynik is not None
            and (
                wynik > prog_ostrzezenia
                if porownanie.relacja == "NIE_WIECEJ"
                else wynik < prog_ostrzezenia
            )
        ):
            jednostka = "" if porownanie.jednostka == "1" else f" {porownanie.jednostka}"
            ograniczenie = (
                f"{name_pl}: {porownanie.wielkosc_pl} {format_liczba(wynik)}{jednostka} "
                f"poza progiem ostrzeżenia {format_liczba(prog_ostrzezenia)}{jednostka}"
            )
        status = status_sprawdzenia(ocena, ograniczenie=ograniczenie is not None)
        check = build_check(
            name_pl=name_pl,
            status=status,
            description_pl=description_pl,
            ocena=ocena,
            details=details,
        )
        trace = build_trace_step(
            step=trace_step,
            description_pl=trace_description_pl,
            formula=formula,
            inputs=trace_inputs,
            calculation=calculation,
            outputs={
                "status": status,
                "wyjasnienie": ocena.wyjasnienie.zdanie_pl,
            },
        )
        return _Sprawdzenie(check=check, trace=trace, ocena=ocena, ograniczenie=ograniczenie)

    def _sprawdz_zmiane_pradu_zwarciowego(self, input_data: WzorzecCInput) -> _Sprawdzenie:
        """
        Sprawdzenie A: Zmiana prądu zwarciowego w punkcie zabezpieczenia.

        Rekord K: |ΔI''k| ≤ PROG_GRANICZNY_PCT (30 %); powyżej PROG_INFORMACYJNY_PCT (10 %) —
        sygnał ograniczenia. Prąd bez generacji niedodatni — zmiany nie wyznaczono
        (``NIE_OCENIONO``, dawniej cicha zmiana 0 % dawała wynik pozytywny).
        """
        ik_bez = input_data.dane_bez_generacji.ik_3f_a
        ik_z_gen = input_data.dane_generacja_max.ik_3f_a
        zmiana_pct = abs(ik_z_gen - ik_bez) / ik_bez * 100.0 if ik_bez > 0 else None

        if zmiana_pct is None:
            opis = (
                f"Zmiany prądu zwarciowego nie wyznaczono: prąd bez generacji "
                f"{ik_bez:.1f} A jest niedodatni."
            )
        elif zmiana_pct <= PROG_INFORMACYJNY_PCT:
            opis = (
                f"Zmiana prądu zwarciowego mieści się w zakresie ±{PROG_INFORMACYJNY_PCT:.0f}%. "
                f"Zmiana: {zmiana_pct:.1f}% ({ik_bez:.1f} A → {ik_z_gen:.1f} A). "
                f"Wpływ informacyjny, brak istotnego ryzyka."
            )
        elif zmiana_pct <= PROG_GRANICZNY_PCT:
            opis = (
                f"Zmiana prądu zwarciowego w zakresie "
                f"{PROG_INFORMACYJNY_PCT:.0f}–{PROG_GRANICZNY_PCT:.0f}%. "
                f"Zmiana: {zmiana_pct:.1f}% ({ik_bez:.1f} A → {ik_z_gen:.1f} A). "
                f"Wymagana weryfikacja nastaw zabezpieczeń."
            )
        else:
            opis = (
                f"Zmiana prądu zwarciowego przekracza {PROG_GRANICZNY_PCT:.0f}%. "
                f"Zmiana: {zmiana_pct:.1f}% ({ik_bez:.1f} A → {ik_z_gen:.1f} A). "
                f"Generacja lokalna powoduje istotną zmianę warunków zwarciowych."
            )

        return self._sprawdzenie(
            input_data,
            Porownanie(
                kryterium_id="wzorzec_c.zmiana_pradu_zwarciowego",
                opis_pl=(
                    "Zmiana prądu zwarciowego trójfazowego w punkcie zabezpieczenia po "
                    "przyłączeniu generacji lokalnej (scenariusz generacji maksymalnej)"
                ),
                relacja="NIE_WIECEJ",
                wielkosc_pl="zmiana względna I''k3",
                warunek_latex=r"\Delta I_{k} \le 30\,\%",
                symbol_latex=r"\Delta I_{k}",
                jednostka="%",
                wynik=zmiana_pct,
                limit=PROG_GRANICZNY_PCT,
                limit_pl=(
                    f"próg graniczny wzorca {PROG_GRANICZNY_PCT:.0f} % (ostrzeżenie powyżej "
                    f"{PROG_INFORMACYJNY_PCT:.0f} %)"
                ),
                braki=(
                    ()
                    if zmiana_pct is not None
                    else ("dodatni prąd zwarciowy trójfazowy bez generacji lokalnej",)
                ),
            ),
            name_pl="A) Zmiana prądu zwarciowego",
            description_pl=opis,
            podstawa_pl=(
                f"próg graniczny zmiany I''k {format_liczba(PROG_GRANICZNY_PCT)} %, próg "
                f"informacyjny {format_liczba(PROG_INFORMACYJNY_PCT)} %"
            ),
            prog_ostrzezenia=PROG_INFORMACYJNY_PCT,
            details={
                "ik_bez_generacji_a": ik_bez,
                "ik_z_generacja_max_a": ik_z_gen,
                "zmiana_wzgledna_pct": None if zmiana_pct is None else round(zmiana_pct, 2),
                "prog_informacyjny_pct": PROG_INFORMACYJNY_PCT,
                "prog_graniczny_pct": PROG_GRANICZNY_PCT,
            },
            trace_step="sprawdzenie_zmiany_pradu",
            trace_description_pl=(
                "Sprawdzenie A: analiza zmiany prądu zwarciowego w punkcie zabezpieczenia"
            ),
            formula=r"\Delta I_{k} = \frac{|I''_{k,gen} - I''_{k,bez}|}{I''_{k,bez}} \times 100\%",
            trace_inputs={
                "ik_bez_generacji_a": ik_bez,
                "ik_z_generacja_max_a": ik_z_gen,
            },
            calculation={
                "zmiana_wzgledna_pct": None if zmiana_pct is None else round(zmiana_pct, 2),
            },
        )

    def _sprawdz_ryzyko_blokady_szyn(self, input_data: WzorzecCInput) -> _Sprawdzenie:
        """
        Sprawdzenie B: Ryzyko niepożądanej blokady zabezpieczenia szyn.

        Rekord K: wkład prądowy generacji ≤ 0,8 · próg blokady szyn. Brak progu blokady —
        kryterium nie dotyczy (``NIE_DOTYCZY``, nie „spełnione”); próg niedodatni — progu
        porównania nie ustalono (``NIE_OCENIONO``). Równość z progiem ryzyka nie jest
        przekroczeniem (reguła pakietu werdykt; dawniej ``>=`` dawało ryzyko na samym progu).
        """
        prog_blokady = input_data.nastawy.prog_blokady_szyn_a
        wklad_generacji = input_data.dane_generacja_max.wklad_generacji_a
        dotyczy = prog_blokady is not None
        prog_ryzyka = (
            prog_blokady * WSPOLCZYNNIK_RYZYKA_BLOKADY
            if prog_blokady is not None and prog_blokady > 0
            else None
        )
        porownanie = Porownanie(
            kryterium_id="wzorzec_c.ryzyko_blokady_szyn",
            opis_pl=(
                "Wkład prądowy generacji lokalnej poniżej progu ryzyka niepożądanej blokady "
                "zabezpieczenia szyn"
            ),
            relacja="NIE_WIECEJ",
            wielkosc_pl="wkład prądowy generacji lokalnej (generacja maksymalna)",
            warunek_latex=r"I_{gen} \le 0{,}8 \cdot I_{blokada}",
            symbol_latex=r"I_{gen}",
            jednostka="A",
            wynik=wklad_generacji if prog_ryzyka is not None else None,
            limit=prog_ryzyka,
            limit_pl=(
                f"{format_liczba(WSPOLCZYNNIK_RYZYKA_BLOKADY)} · próg blokady szyn "
                f"{format_liczba(prog_blokady) if prog_blokady is not None else '—'} A"
            ),
            braki=(
                ("dodatni próg blokady zabezpieczenia szyn w nastawach",)
                if dotyczy and prog_ryzyka is None
                else ()
            ),
            dotyczy=dotyczy,
            powod_stosowalnosci_pl=(
                DOTYCZY_OBIEKTU
                if dotyczy
                else (
                    "brak skonfigurowanego progu blokady zabezpieczenia szyn — sprawdzenie "
                    "nie dotyczy tej konfiguracji"
                )
            ),
        )
        if prog_blokady is None:
            return self._sprawdzenie(
                input_data,
                porownanie,
                name_pl="B) Ryzyko blokady zabezpieczenia szyn",
                podstawa_pl=_PODSTAWA_B,
                description_pl=(
                    "Brak skonfigurowanego progu blokady zabezpieczenia szyn. "
                    "Sprawdzenie nie dotyczy tej konfiguracji."
                ),
                prog_ostrzezenia=None,
                details=None,
                trace_step="sprawdzenie_blokady_szyn",
                trace_description_pl=("Sprawdzenie B: brak progu blokady — sprawdzenie pominięte"),
                formula=r"I_{gen} \le 0{,}8 \times I_{blokada}",
                trace_inputs={"prog_blokady_szyn_a": None},
                calculation=None,
            )

        stosunek_pct = (wklad_generacji / prog_blokady) * 100 if prog_blokady > 0 else None
        if prog_ryzyka is None:
            opis = (
                f"Próg blokady zabezpieczenia szyn {prog_blokady:.1f} A jest niedodatni — "
                "ryzyka blokady nie oceniono."
            )
        elif wklad_generacji > prog_ryzyka:
            opis = (
                f"Wkład prądowy generacji lokalnej ({wklad_generacji:.1f} A) "
                f"może spełnić warunki blokady zabezpieczenia szyn (próg: {prog_blokady:.1f} A). "
                f"Zalecenia: zastosowanie zabezpieczenia kierunkowego lub "
                f"korekta progów blokady."
            )
        else:
            opis = (
                f"Wkład prądowy generacji lokalnej ({wklad_generacji:.1f} A) "
                f"stanowi {stosunek_pct:.1f}% progu blokady ({prog_blokady:.1f} A). "
                f"Brak ryzyka niepożądanej blokady zabezpieczenia szyn."
            )
        return self._sprawdzenie(
            input_data,
            porownanie,
            name_pl="B) Ryzyko blokady zabezpieczenia szyn",
            description_pl=opis,
            podstawa_pl=_PODSTAWA_B,
            prog_ostrzezenia=None,
            details={
                "wklad_generacji_a": wklad_generacji,
                "prog_blokady_szyn_a": prog_blokady,
                "stosunek_do_progu_pct": (None if stosunek_pct is None else round(stosunek_pct, 2)),
            },
            trace_step="sprawdzenie_blokady_szyn",
            trace_description_pl=(
                "Sprawdzenie B: analiza ryzyka niepożądanej blokady zabezpieczenia szyn"
            ),
            formula=r"I_{gen} \le 0{,}8 \times I_{blokada}",
            trace_inputs={
                "wklad_generacji_a": wklad_generacji,
                "prog_blokady_szyn_a": prog_blokady,
            },
            calculation={"prog_80pct_a": prog_ryzyka},
        )

    def _sprawdz_wplyw_na_selektywnosc(self, input_data: WzorzecCInput) -> _Sprawdzenie:
        """
        Sprawdzenie C: Wpływ na selektywność zabezpieczeń nadprądowych.

        Z prądem za następnym zabezpieczeniem — rekord K: I>> / I''k,next ≥ 1,2 (ostrzeżenie
        poniżej 1,5); bez niego — zmiana rezerwy I>> ≤ 2 · PROG_REZERWY_SELEKTYWNOSCI_PCT
        (ostrzeżenie powyżej PROG_REZERWY_SELEKTYWNOSCI_PCT). Mianownik niedodatni —
        wielkości nie wyznaczono (``NIE_OCENIONO``; dawniej margines nieskończony albo rezerwa
        zerowa dawały wynik pozytywny).
        """
        i_wyzszy = input_data.nastawy.i_wyzszy_stopien_a
        i_nizszy = input_data.nastawy.i_nizszy_stopien_a
        ik_za_nastepnym = input_data.ik_za_nastepnym_zabezpieczeniem_a
        nazwa_c = "C) Wpływ na selektywność I>/I>>"
        krok_c = "sprawdzenie_selektywnosci"
        opis_kroku_c = "Sprawdzenie C: analiza wpływu generacji na selektywność stopni nadprądowych"
        wzor_c = r"Margines_{sel} = \frac{I_{>>}}{I''_{k,next}}"
        wejscia_c: dict[str, Any] = {
            "i_wyzszy_stopien_a": i_wyzszy,
            "i_nizszy_stopien_a": i_nizszy,
            "ik_za_nastepnym_a": ik_za_nastepnym,
        }

        if ik_za_nastepnym is None:
            ik_bez = input_data.dane_bez_generacji.ik_3f_a
            ik_z_gen = input_data.dane_generacja_max.ik_3f_a
            # Rezerwa = (Ik - I_nastawy) / I_nastawy * 100%
            rezerwa_bez: float | None = None
            rezerwa_z_gen: float | None = None
            zmiana_rezerwy: float | None = None
            if i_wyzszy > 0:
                rb = (ik_bez - i_wyzszy) / i_wyzszy * 100
                rz = (ik_z_gen - i_wyzszy) / i_wyzszy * 100
                rezerwa_bez, rezerwa_z_gen, zmiana_rezerwy = rb, rz, abs(rz - rb)
            prog_przekroczenia = 2 * PROG_REZERWY_SELEKTYWNOSCI_PCT

            if zmiana_rezerwy is None:
                opis = (
                    f"Zmiany rezerwy selektywności nie wyznaczono: nastawa I>> "
                    f"{i_wyzszy:.1f} A jest niedodatnia."
                )
            elif zmiana_rezerwy <= PROG_REZERWY_SELEKTYWNOSCI_PCT:
                opis = (
                    f"Zmiana rezerwy selektywności: {zmiana_rezerwy:.1f}%. "
                    f"Wpływ generacji na selektywność jest akceptowalny."
                )
            elif zmiana_rezerwy <= prog_przekroczenia:
                opis = (
                    f"Zmiana rezerwy selektywności: {zmiana_rezerwy:.1f}%. "
                    f"Wpływ generacji zauważalny — zalecana weryfikacja koordynacji zabezpieczeń."
                )
            else:
                opis = (
                    f"Zmiana rezerwy selektywności: {zmiana_rezerwy:.1f}%. "
                    f"Generacja lokalna powoduje istotną utratę rezerwy selektywności. "
                    f"Wymagana korekta nastaw lub zmiana schematu zabezpieczeń."
                )
            zaokr = _zaokraglona
            return self._sprawdzenie(
                input_data,
                Porownanie(
                    kryterium_id="wzorzec_c.zmiana_rezerwy_selektywnosci",
                    opis_pl=(
                        "Zmiana rezerwy selektywności stopnia I>> po przyłączeniu generacji "
                        "lokalnej"
                    ),
                    relacja="NIE_WIECEJ",
                    wielkosc_pl="zmiana rezerwy (I''k − I>>) / I>>",
                    warunek_latex=r"|\Delta r_{sel}| \le 40\,\%",
                    symbol_latex=r"|\Delta r_{sel}|",
                    jednostka="%",
                    wynik=zmiana_rezerwy,
                    limit=prog_przekroczenia,
                    limit_pl=(
                        f"2 · {PROG_REZERWY_SELEKTYWNOSCI_PCT:.0f} % (ostrzeżenie powyżej "
                        f"{PROG_REZERWY_SELEKTYWNOSCI_PCT:.0f} %)"
                    ),
                    braki=(
                        ()
                        if zmiana_rezerwy is not None
                        else ("dodatnia nastawa stopnia I>> (wyższego)",)
                    ),
                ),
                description_pl=opis,
                podstawa_pl=(
                    "próg zmiany rezerwy selektywności "
                    f"{format_liczba(PROG_REZERWY_SELEKTYWNOSCI_PCT)} % (przekroczenie: "
                    "dwukrotność progu)"
                ),
                prog_ostrzezenia=PROG_REZERWY_SELEKTYWNOSCI_PCT,
                details={
                    "i_wyzszy_stopien_a": i_wyzszy,
                    "i_nizszy_stopien_a": i_nizszy,
                    "ik_bez_generacji_a": ik_bez,
                    "ik_z_generacja_a": ik_z_gen,
                    "rezerwa_bez_generacji_pct": zaokr(rezerwa_bez, 2),
                    "rezerwa_z_generacja_pct": zaokr(rezerwa_z_gen, 2),
                    "zmiana_rezerwy_pct": zaokr(zmiana_rezerwy, 2),
                },
                calculation={
                    "rezerwa_bez": zaokr(rezerwa_bez, 2),
                    "rezerwa_z_gen": zaokr(rezerwa_z_gen, 2),
                    "zmiana_rezerwy": zaokr(zmiana_rezerwy, 2),
                },
                name_pl=nazwa_c,
                trace_step=krok_c,
                trace_description_pl=opis_kroku_c,
                formula=wzor_c,
                trace_inputs=wejscia_c,
            )

        # Margines selektywności = I_wyzszy / Ik_za_nastepnym (stały — zależny od nastaw
        # i prądu za następnym zabezpieczeniem).
        margines = i_wyzszy / ik_za_nastepnym if ik_za_nastepnym > 0 else None
        if margines is None:
            opis = (
                f"Marginesu selektywności nie wyznaczono: prąd za następnym zabezpieczeniem "
                f"{ik_za_nastepnym:.1f} A jest niedodatni."
            )
        elif margines < MARGINES_SELEKTYWNOSCI_MIN:
            opis = (
                f"Margines selektywności: {margines:.2f} (wymagane ≥ "
                f"{MARGINES_SELEKTYWNOSCI_MIN}). Niewystarczający margines selektywności I>>."
            )
        elif margines < MARGINES_SELEKTYWNOSCI_OSTRZEZENIE:
            opis = (
                f"Margines selektywności: {margines:.2f}. "
                f"Margines na granicy — zalecana weryfikacja koordynacji."
            )
        else:
            opis = (
                f"Margines selektywności: {margines:.2f}. "
                f"Selektywność zachowana z odpowiednim zapasem."
            )
        return self._sprawdzenie(
            input_data,
            Porownanie(
                kryterium_id="wzorzec_c.margines_selektywnosci",
                opis_pl="Margines selektywności stopnia I>> względem następnego zabezpieczenia",
                relacja="NIE_MNIEJ",
                wielkosc_pl="margines selektywności I>> / I''k,next",
                warunek_latex=r"\frac{I_{>>}}{I''_{k,next}} \ge 1{,}2",
                symbol_latex=r"\frac{I_{>>}}{I''_{k,next}}",
                jednostka="1",
                wynik=margines,
                limit=MARGINES_SELEKTYWNOSCI_MIN,
                limit_pl=(
                    f"margines minimalny wzorca {MARGINES_SELEKTYWNOSCI_MIN} (ostrzeżenie "
                    f"poniżej {MARGINES_SELEKTYWNOSCI_OSTRZEZENIE})"
                ),
                braki=(
                    ()
                    if margines is not None
                    else ("dodatni prąd zwarciowy za następnym zabezpieczeniem",)
                ),
            ),
            description_pl=opis,
            podstawa_pl=(
                "margines selektywności minimalny "
                f"{format_liczba(MARGINES_SELEKTYWNOSCI_MIN)}, próg ostrzeżenia "
                f"{format_liczba(MARGINES_SELEKTYWNOSCI_OSTRZEZENIE)}"
            ),
            prog_ostrzezenia=MARGINES_SELEKTYWNOSCI_OSTRZEZENIE,
            details={
                "i_wyzszy_stopien_a": i_wyzszy,
                "ik_za_nastepnym_a": ik_za_nastepnym,
                "margines_selektywnosci": _zaokraglona(margines, 3),
            },
            calculation={"margines": _zaokraglona(margines, 3)},
            name_pl=nazwa_c,
            trace_step=krok_c,
            trace_description_pl=opis_kroku_c,
            formula=wzor_c,
            trace_inputs=wejscia_c,
        )

    def _buduj_artefakty(
        self,
        input_data: WzorzecCInput,
        sprawdzenia: tuple[_Sprawdzenie, _Sprawdzenie, _Sprawdzenie],
    ) -> dict[str, Any]:
        """Buduje słownik artefaktów wynikowych (status sprawdzeń = kod zastany, projekcja
        rekordu K — znaczenie niesie rekord ``ocena`` w sprawdzeniu)."""
        ik_bez = input_data.dane_bez_generacji.ik_3f_a
        ik_max = input_data.dane_generacja_max.ik_3f_a

        zmiana_pct = abs(ik_max - ik_bez) / ik_bez * 100 if ik_bez > 0 else None
        spr_a, spr_b, spr_c = sprawdzenia

        artifacts: dict[str, Any] = {
            "punkt_zabezpieczenia_id": input_data.punkt_zabezpieczenia_id,
            "punkt_zabezpieczenia_nazwa": input_data.punkt_zabezpieczenia_nazwa,
            "szyny_id": input_data.szyny_id,
            "szyny_nazwa": input_data.szyny_nazwa,
            "liczba_zrodel_generacji": len(input_data.zrodla_generacji),
            "sumaryczna_moc_generacji_kw": sum(
                z.moc_znamionowa_kw for z in input_data.zrodla_generacji
            ),
            "ik_bez_generacji_3f_a": ik_bez,
            "ik_z_generacja_max_3f_a": ik_max,
            "zmiana_pradu_zwarciowego_pct": _zaokraglona(zmiana_pct, 2),
            "wklad_generacji_max_a": input_data.dane_generacja_max.wklad_generacji_a,
            "i_wyzszy_stopien_a": input_data.nastawy.i_wyzszy_stopien_a,
            "i_nizszy_stopien_a": input_data.nastawy.i_nizszy_stopien_a,
            "prog_blokady_szyn_a": input_data.nastawy.prog_blokady_szyn_a,
            "status_sprawdzenia_a": spr_a.check["status"],
            "status_sprawdzenia_b": spr_b.check["status"],
            "status_sprawdzenia_c": spr_c.check["status"],
        }

        return artifacts

    def _buduj_podsumowanie(
        self,
        wymaganie: WynikWymagania,
        ograniczenia: list[str],
        input_data: WzorzecCInput,
        sprawdzenia: tuple[_Sprawdzenie, _Sprawdzenie, _Sprawdzenie],
    ) -> str:
        """Podsumowanie po polsku: etykieta rekordu W, generacja lokalna, naruszone
        i nieocenione sprawdzenia (z rekordów) oraz ograniczenia. Pełne zdanie werdyktu
        niesie ``verdict_description_pl`` i rekord ``wymaganie``."""
        moc_total = sum(z.moc_znamionowa_kw for z in input_data.zrodla_generacji)
        czesci = [
            f"{wymaganie.etykieta.etykieta_pl}. Generacja lokalna ({moc_total:.0f} kW, "
            f"{len(input_data.zrodla_generacji)} źródeł) w punkcie zabezpieczenia "
            f"{input_data.punkt_zabezpieczenia_nazwa}."
        ]
        for spr in sprawdzenia:
            if spr.ocena.status_maszynowy not in ("SPELNIA", "NIE_DOTYCZY"):
                czesci.append(f"{spr.check['name_pl']}: {spr.ocena.wyjasnienie.zdanie_pl}")
        if ograniczenia:
            czesci.append(f"Ograniczenia: {'; '.join(ograniczenia)}.")
        return " ".join(czesci)


def _zaokraglona(wartosc: float | None, cyfry: int) -> float | None:
    return None if wartosc is None else round(wartosc, cyfry)


# =============================================================================
# PUBLICZNE API
# =============================================================================


def run_pattern_c(
    input_data: WzorzecCInput | None = None,
    fixture_file: str | None = None,
) -> ReferencePatternResult:
    """
    Uruchamia walidację wzorca C (wpływ generacji lokalnej).

    Args:
        input_data: Dane wejściowe WzorzecCInput
        fixture_file: Nazwa pliku fixture do wczytania

    Returns:
        ReferencePatternResult z werdyktem, sprawdzeniami i śladem.
    """
    pattern = WzorzecCGeneracjaLokalna()
    return pattern.validate(
        input_data=input_data,
        fixture_file=fixture_file,
    )

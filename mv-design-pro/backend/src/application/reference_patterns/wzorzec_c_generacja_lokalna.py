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
from enum import Enum
from pathlib import Path
from typing import Any

from .base import (
    CheckStatus,
    ReferencePatternResult,
    ReferenceVerdict,
    build_check,
    build_trace_step,
    stable_sort_dict,
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

# Podkatalog fixtures
PATTERN_C_FIXTURES_SUBDIR = "wzorzec_c_generacja_lokalna"


# =============================================================================
# TYPY DANYCH WEJŚCIOWYCH
# =============================================================================


class TypGeneracji(str, Enum):
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

        # Krok 2: Sprawdzenie A - zmiana prądu zwarciowego
        check_a, trace_a, wynik_a = self._sprawdz_zmiane_pradu_zwarciowego(input_data)

        # Krok 3: Sprawdzenie B - ryzyko blokady szyn
        check_b, trace_b, wynik_b = self._sprawdz_ryzyko_blokady_szyn(input_data)

        # Krok 4: Sprawdzenie C - wpływ na selektywność
        check_c, trace_c, wynik_c = self._sprawdz_wplyw_na_selektywnosc(input_data)

        # Zbierz sprawdzenia
        checks = [check_a, check_b, check_c]
        trace_steps.extend([trace_a, trace_b, trace_c])

        # Sortuj sprawdzenia deterministycznie
        checks_sorted = sorted(checks, key=lambda c: c["name_pl"])

        # Krok 5: Wyznacz werdykt
        verdict = self._wyznacz_werdykt(wynik_a, wynik_b, wynik_c)

        trace_steps.append(
            build_trace_step(
                step="wyznaczenie_werdyktu",
                description_pl="Wyznaczenie werdyktu końcowego wzorca",
                inputs={
                    "wynik_sprawdzenia_a": wynik_a,
                    "wynik_sprawdzenia_b": wynik_b,
                    "wynik_sprawdzenia_c": wynik_c,
                },
                outputs={"verdict": verdict},
            )
        )

        # Krok 6: Zbuduj artefakty
        artifacts = self._buduj_artefakty(input_data, wynik_a, wynik_b, wynik_c)

        # Krok 7: Zbuduj podsumowanie
        summary_pl = self._buduj_podsumowanie(verdict, input_data, wynik_a, wynik_b, wynik_c)

        return ReferencePatternResult(
            pattern_id=PATTERN_C_ID,
            name_pl=PATTERN_C_NAME_PL,
            verdict=verdict,
            summary_pl=summary_pl,
            checks=tuple(checks_sorted),
            trace=tuple(trace_steps),
            artifacts=stable_sort_dict(artifacts),
        )

    def _sprawdz_zmiane_pradu_zwarciowego(
        self,
        input_data: WzorzecCInput,
    ) -> tuple[dict[str, Any], dict[str, Any], str]:
        """
        Sprawdzenie A: Zmiana prądu zwarciowego w punkcie zabezpieczenia.

        Porównuje prąd bez generacji i z maksymalną generacją.
        Klasyfikacja:
        - ±10% → INFO (informacyjne)
        - 10-30% → GRANICZNE
        - >30% → NIEZGODNE

        Returns:
            (check, trace_step, wynik): wynik to "INFO"/"GRANICZNE"/"NIEZGODNE"
        """
        ik_bez = input_data.dane_bez_generacji.ik_3f_a
        ik_z_gen = input_data.dane_generacja_max.ik_3f_a

        # Oblicz zmianę względną
        if ik_bez > 0:
            zmiana_pct = abs(ik_z_gen - ik_bez) / ik_bez * 100.0
        else:
            zmiana_pct = 0.0

        # Klasyfikuj
        if zmiana_pct <= PROG_INFORMACYJNY_PCT:
            status: CheckStatus = "INFO"
            wynik = "INFO"
            opis = (
                f"Zmiana prądu zwarciowego mieści się w zakresie ±{PROG_INFORMACYJNY_PCT:.0f}%. "
                f"Zmiana: {zmiana_pct:.1f}% ({ik_bez:.1f} A → {ik_z_gen:.1f} A). "
                f"Wpływ informacyjny, brak istotnego ryzyka."
            )
        elif zmiana_pct <= PROG_GRANICZNY_PCT:
            status = "WARN"
            wynik = "GRANICZNE"
            opis = (
                f"Zmiana prądu zwarciowego w zakresie {PROG_INFORMACYJNY_PCT:.0f}–{PROG_GRANICZNY_PCT:.0f}%. "
                f"Zmiana: {zmiana_pct:.1f}% ({ik_bez:.1f} A → {ik_z_gen:.1f} A). "
                f"Wymagana weryfikacja nastaw zabezpieczeń."
            )
        else:
            status = "FAIL"
            wynik = "NIEZGODNE"
            opis = (
                f"Zmiana prądu zwarciowego przekracza {PROG_GRANICZNY_PCT:.0f}%. "
                f"Zmiana: {zmiana_pct:.1f}% ({ik_bez:.1f} A → {ik_z_gen:.1f} A). "
                f"Generacja lokalna powoduje istotną zmianę warunków zwarciowych."
            )

        check = build_check(
            name_pl="A) Zmiana prądu zwarciowego",
            status=status,
            description_pl=opis,
            details={
                "ik_bez_generacji_a": ik_bez,
                "ik_z_generacja_max_a": ik_z_gen,
                "zmiana_wzgledna_pct": round(zmiana_pct, 2),
                "prog_informacyjny_pct": PROG_INFORMACYJNY_PCT,
                "prog_graniczny_pct": PROG_GRANICZNY_PCT,
            },
        )

        trace = build_trace_step(
            step="sprawdzenie_zmiany_pradu",
            description_pl="Sprawdzenie A: analiza zmiany prądu zwarciowego w punkcie zabezpieczenia",
            formula=r"\Delta I_{k} = \frac{|I''_{k,gen} - I''_{k,bez}|}{I''_{k,bez}} \times 100\%",
            inputs={
                "ik_bez_generacji_a": ik_bez,
                "ik_z_generacja_max_a": ik_z_gen,
            },
            calculation={
                "zmiana_wzgledna_pct": round(zmiana_pct, 2),
            },
            outputs={
                "wynik": wynik,
                "status": status,
            },
        )

        return check, trace, wynik

    def _sprawdz_ryzyko_blokady_szyn(
        self,
        input_data: WzorzecCInput,
    ) -> tuple[dict[str, Any], dict[str, Any], str]:
        """
        Sprawdzenie B: Ryzyko niepożądanej blokady zabezpieczenia szyn.

        Sprawdza, czy wkład prądu od generacji lokalnej może spełnić
        warunki blokady zabezpieczenia szyn.

        Returns:
            (check, trace_step, wynik): wynik to "PASS"/"NIEZGODNE"
        """
        prog_blokady = input_data.nastawy.prog_blokady_szyn_a
        wklad_generacji = input_data.dane_generacja_max.wklad_generacji_a

        # Jeśli brak progu blokady, sprawdzenie nie dotyczy
        if prog_blokady is None:
            check = build_check(
                name_pl="B) Ryzyko blokady zabezpieczenia szyn",
                status="INFO",
                description_pl=(
                    "Brak skonfigurowanego progu blokady zabezpieczenia szyn. "
                    "Sprawdzenie nie dotyczy tej konfiguracji."
                ),
            )
            trace = build_trace_step(
                step="sprawdzenie_blokady_szyn",
                description_pl="Sprawdzenie B: brak progu blokady — sprawdzenie pominięte",
                inputs={"prog_blokady_szyn_a": None},
                outputs={"wynik": "PASS", "status": "INFO"},
            )
            return check, trace, "PASS"

        # Sprawdź, czy wkład generacji może uruchomić blokadę
        ryzyko_blokady = wklad_generacji >= prog_blokady * 0.8  # 80% progu = ryzyko

        if ryzyko_blokady:
            status: CheckStatus = "FAIL"
            wynik = "NIEZGODNE"
            opis = (
                f"Wkład prądowy generacji lokalnej ({wklad_generacji:.1f} A) "
                f"może spełnić warunki blokady zabezpieczenia szyn (próg: {prog_blokady:.1f} A). "
                f"Zalecenia: zastosowanie zabezpieczenia kierunkowego lub "
                f"korekta progów blokady."
            )
        else:
            status = "PASS"
            wynik = "PASS"
            stosunek_pct = (wklad_generacji / prog_blokady) * 100 if prog_blokady > 0 else 0
            opis = (
                f"Wkład prądowy generacji lokalnej ({wklad_generacji:.1f} A) "
                f"stanowi {stosunek_pct:.1f}% progu blokady ({prog_blokady:.1f} A). "
                f"Brak ryzyka niepożądanej blokady zabezpieczenia szyn."
            )

        check = build_check(
            name_pl="B) Ryzyko blokady zabezpieczenia szyn",
            status=status,
            description_pl=opis,
            details={
                "wklad_generacji_a": wklad_generacji,
                "prog_blokady_szyn_a": prog_blokady,
                "stosunek_do_progu_pct": (
                    round((wklad_generacji / prog_blokady) * 100, 2) if prog_blokady > 0 else 0
                ),
                "ryzyko_blokady": ryzyko_blokady,
            },
        )

        trace = build_trace_step(
            step="sprawdzenie_blokady_szyn",
            description_pl="Sprawdzenie B: analiza ryzyka niepożądanej blokady zabezpieczenia szyn",
            formula=r"Ryzyko = I_{gen} \geq 0.8 \times I_{blokada}",
            inputs={
                "wklad_generacji_a": wklad_generacji,
                "prog_blokady_szyn_a": prog_blokady,
            },
            calculation={
                "prog_80pct_a": prog_blokady * 0.8,
                "ryzyko_blokady": ryzyko_blokady,
            },
            outputs={
                "wynik": wynik,
                "status": status,
            },
        )

        return check, trace, wynik

    def _sprawdz_wplyw_na_selektywnosc(
        self,
        input_data: WzorzecCInput,
    ) -> tuple[dict[str, Any], dict[str, Any], str]:
        """
        Sprawdzenie C: Wpływ na selektywność zabezpieczeń nadprądowych.

        Porównuje relacje I>/I>> dla scenariuszy bez/z generacją
        i ocenia zmianę rezerwy selektywności.

        Returns:
            (check, trace_step, wynik): wynik to "PASS"/"GRANICZNE"/"NIEZGODNE"
        """
        i_wyzszy = input_data.nastawy.i_wyzszy_stopien_a
        i_nizszy = input_data.nastawy.i_nizszy_stopien_a
        ik_za_nastepnym = input_data.ik_za_nastepnym_zabezpieczeniem_a

        # Jeśli brak danych o następnym zabezpieczeniu, oceniamy tylko stosunek stopni
        if ik_za_nastepnym is None:
            # Porównaj rezerwy między stopniami
            ik_bez = input_data.dane_bez_generacji.ik_3f_a
            ik_z_gen = input_data.dane_generacja_max.ik_3f_a

            # Rezerwa = (Ik - I_nastawy) / I_nastawy * 100%
            rezerwa_bez = ((ik_bez - i_wyzszy) / i_wyzszy * 100) if i_wyzszy > 0 else 0
            rezerwa_z_gen = ((ik_z_gen - i_wyzszy) / i_wyzszy * 100) if i_wyzszy > 0 else 0

            zmiana_rezerwy = abs(rezerwa_z_gen - rezerwa_bez)

            if zmiana_rezerwy <= PROG_REZERWY_SELEKTYWNOSCI_PCT:
                status: CheckStatus = "PASS"
                wynik = "PASS"
                opis = (
                    f"Zmiana rezerwy selektywności: {zmiana_rezerwy:.1f}%. "
                    f"Wpływ generacji na selektywność jest akceptowalny."
                )
            elif zmiana_rezerwy <= 2 * PROG_REZERWY_SELEKTYWNOSCI_PCT:
                status = "WARN"
                wynik = "GRANICZNE"
                opis = (
                    f"Zmiana rezerwy selektywności: {zmiana_rezerwy:.1f}%. "
                    f"Wpływ generacji zauważalny — zalecana weryfikacja koordynacji zabezpieczeń."
                )
            else:
                status = "FAIL"
                wynik = "NIEZGODNE"
                opis = (
                    f"Zmiana rezerwy selektywności: {zmiana_rezerwy:.1f}%. "
                    f"Generacja lokalna powoduje istotną utratę rezerwy selektywności. "
                    f"Wymagana korekta nastaw lub zmiana schematu zabezpieczeń."
                )

            details = {
                "i_wyzszy_stopien_a": i_wyzszy,
                "i_nizszy_stopien_a": i_nizszy,
                "ik_bez_generacji_a": ik_bez,
                "ik_z_generacja_a": ik_z_gen,
                "rezerwa_bez_generacji_pct": round(rezerwa_bez, 2),
                "rezerwa_z_generacja_pct": round(rezerwa_z_gen, 2),
                "zmiana_rezerwy_pct": round(zmiana_rezerwy, 2),
            }

            calc = {
                "rezerwa_bez": round(rezerwa_bez, 2),
                "rezerwa_z_gen": round(rezerwa_z_gen, 2),
                "zmiana_rezerwy": round(zmiana_rezerwy, 2),
            }

        else:
            # Analiza z uwzględnieniem następnego zabezpieczenia
            # Margines selektywności = I_wyzszy / Ik_za_nastepnym
            # Margines jest stały (zależny od nastaw i prądu za następnym zabezpieczeniem)
            # Sprawdzamy, czy margines jest wystarczający (>= 1.2)
            margines = i_wyzszy / ik_za_nastepnym if ik_za_nastepnym > 0 else float("inf")

            # Jeśli margines jest poniżej 1.2, ryzyko utraty selektywności
            if margines < 1.2:
                status = "FAIL"
                wynik = "NIEZGODNE"
                opis = (
                    f"Margines selektywności: {margines:.2f} (wymagane ≥ 1.2). "
                    f"Niewystarczający margines selektywności I>>."
                )
            elif margines < 1.5:
                status = "WARN"
                wynik = "GRANICZNE"
                opis = (
                    f"Margines selektywności: {margines:.2f}. "
                    f"Margines na granicy — zalecana weryfikacja koordynacji."
                )
            else:
                status = "PASS"
                wynik = "PASS"
                opis = (
                    f"Margines selektywności: {margines:.2f}. "
                    f"Selektywność zachowana z odpowiednim zapasem."
                )

            details = {
                "i_wyzszy_stopien_a": i_wyzszy,
                "ik_za_nastepnym_a": ik_za_nastepnym,
                "margines_selektywnosci": round(margines, 3),
            }

            calc = {
                "margines": round(margines, 3),
            }

        check = build_check(
            name_pl="C) Wpływ na selektywność I>/I>>",
            status=status,
            description_pl=opis,
            details=details,
        )

        trace = build_trace_step(
            step="sprawdzenie_selektywnosci",
            description_pl="Sprawdzenie C: analiza wpływu generacji na selektywność stopni nadprądowych",
            formula=r"Margines_{sel} = \frac{I_{>>}}{I''_{k,next}}",
            inputs={
                "i_wyzszy_stopien_a": i_wyzszy,
                "i_nizszy_stopien_a": i_nizszy,
                "ik_za_nastepnym_a": ik_za_nastepnym,
            },
            calculation=calc,
            outputs={
                "wynik": wynik,
                "status": status,
            },
        )

        return check, trace, wynik

    def _wyznacz_werdykt(
        self,
        wynik_a: str,
        wynik_b: str,
        wynik_c: str,
    ) -> ReferenceVerdict:
        """
        Wyznacza werdykt końcowy na podstawie wyników sprawdzeń.

        Logika:
        - NIEZGODNE: którekolwiek sprawdzenie = NIEZGODNE
        - GRANICZNE: którekolwiek sprawdzenie = GRANICZNE (i brak NIEZGODNE)
        - ZGODNE: wszystkie sprawdzenia = PASS lub INFO
        """
        wyniki = [wynik_a, wynik_b, wynik_c]

        if "NIEZGODNE" in wyniki:
            return "NIEZGODNE"

        if "GRANICZNE" in wyniki:
            return "GRANICZNE"

        return "ZGODNE"

    def _buduj_artefakty(
        self,
        input_data: WzorzecCInput,
        wynik_a: str,
        wynik_b: str,
        wynik_c: str,
    ) -> dict[str, Any]:
        """Buduje słownik artefaktów wynikowych."""
        ik_bez = input_data.dane_bez_generacji.ik_3f_a
        ik_max = input_data.dane_generacja_max.ik_3f_a

        zmiana_pct = abs(ik_max - ik_bez) / ik_bez * 100 if ik_bez > 0 else 0

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
            "zmiana_pradu_zwarciowego_pct": round(zmiana_pct, 2),
            "wklad_generacji_max_a": input_data.dane_generacja_max.wklad_generacji_a,
            "i_wyzszy_stopien_a": input_data.nastawy.i_wyzszy_stopien_a,
            "i_nizszy_stopien_a": input_data.nastawy.i_nizszy_stopien_a,
            "prog_blokady_szyn_a": input_data.nastawy.prog_blokady_szyn_a,
            "wynik_sprawdzenia_a": wynik_a,
            "wynik_sprawdzenia_b": wynik_b,
            "wynik_sprawdzenia_c": wynik_c,
        }

        return artifacts

    def _buduj_podsumowanie(
        self,
        verdict: ReferenceVerdict,
        input_data: WzorzecCInput,
        wynik_a: str,
        wynik_b: str,
        wynik_c: str,
    ) -> str:
        """Buduje podsumowanie po polsku."""
        moc_total = sum(z.moc_znamionowa_kw for z in input_data.zrodla_generacji)

        if verdict == "ZGODNE":
            return (
                f"Wzorzec ZGODNY. Generacja lokalna ({moc_total:.0f} kW, "
                f"{len(input_data.zrodla_generacji)} źródeł) nie powoduje istotnego wpływu "
                f"na zabezpieczenia punktu {input_data.punkt_zabezpieczenia_nazwa}. "
                f"Wszystkie sprawdzenia (zmiana prądu, blokada szyn, selektywność) pozytywne."
            )
        elif verdict == "GRANICZNE":
            problemy = []
            if wynik_a == "GRANICZNE":
                problemy.append("zmiana prądu zwarciowego w zakresie granicznym")
            if wynik_c == "GRANICZNE":
                problemy.append("zauważalny wpływ na selektywność")
            problemy_str = ", ".join(problemy) if problemy else "wpływ na parametry zabezpieczeń"
            return (
                f"Wzorzec GRANICZNY. Generacja lokalna ({moc_total:.0f} kW) "
                f"powoduje {problemy_str}. "
                f"Zalecana weryfikacja i ewentualna korekta nastaw zabezpieczeń."
            )
        else:  # NIEZGODNE
            problemy = []
            if wynik_a == "NIEZGODNE":
                problemy.append("znacząca zmiana prądu zwarciowego (>30%)")
            if wynik_b == "NIEZGODNE":
                problemy.append("ryzyko niepożądanej blokady zabezpieczenia szyn")
            if wynik_c == "NIEZGODNE":
                problemy.append("utrata selektywności stopni nadprądowych")
            problemy_str = "; ".join(problemy)
            return (
                f"Wzorzec NIEZGODNY. Generacja lokalna ({moc_total:.0f} kW) "
                f"powoduje istotne ryzyko błędnego działania zabezpieczeń: {problemy_str}. "
                f"Wymagane działania korygujące: zastosowanie zabezpieczeń kierunkowych, "
                f"korekta nastaw lub zmiana schematu zabezpieczeń."
            )


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

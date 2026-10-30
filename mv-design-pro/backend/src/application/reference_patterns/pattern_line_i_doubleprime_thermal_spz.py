"""
Reference Pattern A: Dobór I>> dla linii SN — selektywność, czułość, cieplne, SPZ

PATTERN ID: RP-LINE-I2-THERMAL-SPZ
NAME (PL): Dobór I>> dla linii SN: selektywność, czułość, cieplne, SPZ

PURPOSE:
Benchmark reference pattern for validating I>> setting methodology for MV lines.

STATUS (karta W3-C2, 2026-09-09): przebudowany na JEDYNY kanoniczny silnik
metodyki nastaw — `application.protection_settings.engine.ProtectionSettingsEngine`
(Hoppel/IRiESD). Poprzednio konsumował `application.analyses.protection.
line_overcurrent_setting` (FIX-12D) — ten moduł został SKASOWANY w tej samej
karcie (0 innych konsumentów w repo). Sekcje raportu (selektywność, czułość,
cieplne, SPZ, generacja lokalna, okno) renderowane z `ProtectionSettingsResult`.

CANONICAL ALIGNMENT:
- NOT-A-SOLVER: This is INTERPRETATION layer. No physics calculations.
  All physics data comes from `ProtectionSettingsEngine`, które samo interpretuje
  wyniki solverów SC/PF (nie jest solverem).
- WHITE BOX: Full trace of all validation steps.
- DETERMINISM: Same inputs → identical outputs.

METHODOLOGY VALIDATION (Hoppel/IRiESD, `protection_settings/engine.py`):
1. Selectivity (I>> selektywność): I_min_sel = k_b * Ik_max_next_bus
2. Sensitivity (I>> czułość): I_max_sens = Ik3_min_beginning / k_b
   (JEDEN współczynnik k_b dla obu warunków — Hoppel nie rozróżnia kb/kc,
   inaczej niż dawny FIX-12D; patrz karta W3-C2 §0.1 tabela różnic)
3. Thermal (górna granica okna I>>): I_max_th = (s * j_thn / sqrt(0,05 s)) / k_bth
   (czas zadziałania chwilowego, BEZ cykli SPZ — SPZ to punkt 5, osobno)
4. Setting Window (okno_nastaw): [I_min_sel, min(I_max_sens, I_max_th)],
   z nazwanym kryterium granicznym i tekstem konfliktu (rozszerzenie W3-C2)
5. SPZ Blocking (`_analyze_spz`): analiza cieplna PEŁNEGO cyklu SPZ
   (wyzwolenie + przerwa + ponowne wyzwolenie), formuła s*jthn/sqrt(t_total)
   — bez tabeli progowej (dawny `spz_lookup.py`, KASACJA, bez cytatu normy)
6. Local generation (generacja_lokalna): diagnostyka wkładu E-L i ryzyka
   blokady ZSZ — próg ryzyka jako wejście JAWNE (rozszerzenie W3-C2)

WERDYKT (karta WERDYKT-MIGRACJA-190): każde sprawdzenie niesie rekord K (`oceny.py`),
wzorzec — rekord W nad kryteriami selektywności, czułości, cieplnym, okna i SPZ. Kod
`verdict` jest projekcją rekordów (`oceny.werdykt_wzorca`):
- NIEZGODNE: którekolwiek kryterium naruszone (sprzeczne okno albo SPZ wymagające blokady);
- GRANICZNE: kryteria spełnione, ale z ograniczeniem — wąskie okno albo ryzyko blokady ZSZ
  w diagnostyce generacji lokalnej (diagnostyka nie wchodzi do rekordu W);
- ZGODNE: kryteria spełnione bez ograniczeń.

Poza zakresem tego wzorca (nazwa/PATTERN_ID = wyłącznie "I>>"): nastawa I>
(opóźniona, stopniowana czasowo) i osobny ogólny test wytrzymałości cieplnej
przewodu (`ProtectionSettingsResult.thermal`, czas zadziałania I>) — obie
zdolności ISTNIEJĄ w silniku Hoppla, ale nie są prezentowane w tym wzorcu,
bo nie wchodziły w zakres dawnego FIX-12D ani nazwy wzorca (karta W3-C2 §0.1
punkt 8, świadomie nazwane, nie pominięte milczeniem).

NO CODENAMES IN UI/PROOF.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# Import kanonicznego silnika metodyki nastaw (bez modyfikacji silnika)
from application.protection_settings.engine import (
    THERMAL_DENSITY,
    InstantaneousSettings,
    InstantaneousSettingWindow,
    LocalGenerationDiagnostic,
    ProtectionSettingsEngine,
    ProtectionSettingsInput,
    ProtectionSettingsResult,
    SPZAnalysisResult,
)
from enm.nazwy_elementow import opis_bez_nazwy
from network_model.pochodne import a_na_ka
from werdykt import OcenaKryterium, WynikWymagania
from werdykt.porownanie import DOTYCZY_OBIEKTU, Porownanie

from .base import (
    CheckStatus,
    ReferencePatternResult,
    build_check,
    build_trace_step,
    stable_sort_dict,
)
from .oceny import (
    ocena_sprawdzenia,
    opis_werdyktu,
    status_sprawdzenia,
    werdykt_wzorca,
    wymaganie_wzorca,
)

# =============================================================================
# CONSTANTS
# =============================================================================

PATTERN_ID = "RP-LINE-I2-THERMAL-SPZ"
PATTERN_NAME_PL = "Dobór I>> dla linii SN: selektywność, czułość, cieplne, SPZ"

# Próg wąskiego okna: (I_max - I_min) / I_min < 0.05 (5%) — próg PREZENTACYJNY
# wzorca (warstwa interpretacji), nie parametr silnika Hoppla; bez zmian
# względem dawnego FIX-12D (żadna ze stron nie cytuje dla niego normy — to
# umowny próg czytelności raportu, nie wielkość fizyczna).
NARROW_WINDOW_THRESHOLD = 0.05

# Pattern A fixture subdirectory
PATTERN_A_FIXTURES_SUBDIR = "pattern_a_line_i_doubleprime_thermal_spz"


# =============================================================================
# FIXTURE LOADING
# =============================================================================


def get_fixtures_dir() -> Path:
    """Get path to fixtures directory."""
    return Path(__file__).parent / "fixtures"


def get_pattern_a_fixtures_dir() -> Path:
    """Get path to Pattern A specific fixtures directory."""
    return get_fixtures_dir() / PATTERN_A_FIXTURES_SUBDIR


def load_fixture(filename: str) -> dict[str, Any]:
    """
    Load fixture data from JSON file.

    Searches in the following order:
    1. Pattern A specific subfolder (pattern_a_line_i_doubleprime_thermal_spz/)
    2. Root fixtures folder (for backwards compatibility)

    Args:
        filename: Fixture filename (e.g., "case_A_zgodne.json")

    Returns:
        Parsed fixture data as dictionary.

    Raises:
        FileNotFoundError: If fixture file doesn't exist in any location.
    """
    # Try Pattern A subfolder first
    pattern_a_path = get_pattern_a_fixtures_dir() / filename
    if pattern_a_path.exists():
        with open(pattern_a_path, encoding="utf-8") as f:
            return json.load(f)

    # Fall back to root fixtures folder (backwards compatibility)
    root_path = get_fixtures_dir() / filename
    if root_path.exists():
        with open(root_path, encoding="utf-8") as f:
            return json.load(f)

    # If neither exists, raise error with helpful message
    raise FileNotFoundError(
        f"Fixture '{filename}' nie znaleziony. " f"Sprawdzono: {pattern_a_path}, {root_path}"
    )


def fixture_to_input(fixture: dict[str, Any]) -> ProtectionSettingsInput:
    """
    Convert fixture dictionary to `ProtectionSettingsInput` (silnik Hoppla).

    Pola 1:1 z `ProtectionSettingsInput` (karta W3-C2) — silnik Hoppla nie ma
    zagnieżdżonych struktur (ConductorData/SPZConfig dawnego FIX-12D), wejście
    jest płaskie.

    Args:
        fixture: Fixture data dictionary

    Returns:
        ProtectionSettingsInput instance
    """
    return ProtectionSettingsInput(
        line_id=fixture["line_id"],
        line_name=fixture["line_name"],
        cross_section_mm2=fixture["cross_section_mm2"],
        conductor_material=fixture["conductor_material"],
        length_km=fixture["length_km"],
        i_nominal_a=fixture["i_nominal_a"],
        ik3_max_beginning_a=fixture["ik3_max_beginning_a"],
        ik3_min_beginning_a=fixture["ik3_min_beginning_a"],
        ik3_max_end_a=fixture["ik3_max_end_a"],
        ik3_min_end_a=fixture["ik3_min_end_a"],
        ik2_min_end_a=fixture["ik2_min_end_a"],
        ik_max_next_bus_a=fixture["ik_max_next_bus_a"],
        i_load_max_a=fixture["i_load_max_a"],
        delta_t_s=fixture.get("delta_t_s", 0.3),
        k_b=fixture.get("k_b", 1.2),
        k_bth=fixture.get("k_bth", 1.1),
        t_upstream_s=fixture.get("t_upstream_s", 0.0),
        spz_enabled=fixture.get("spz_enabled", True),
        spz_pause_s=fixture.get("spz_pause_s", 0.5),
        lokalna_generacja_aktywna=fixture.get("lokalna_generacja_aktywna", False),
        lokalna_generacja_typ_zrodla=fixture.get("lokalna_generacja_typ_zrodla"),
        lokalna_generacja_wklad_a=fixture.get("lokalna_generacja_wklad_a", 0.0),
        lokalna_generacja_prog_udzialu_zsz=fixture.get("lokalna_generacja_prog_udzialu_zsz"),
    )


def _spz_wylaczone(spz: SPZAnalysisResult) -> bool:
    """Czy `_analyze_spz` zwrócił gałąź "SPZ wyłączone" — czytane z jego trace,
    bez potrzeby oryginalnego `ProtectionSettingsInput` (silnik ZAWSZE zwraca
    blok SPZ, w przeciwieństwie do dawnego FIX-12D, gdzie `spz_blocking` był
    `None` przy wyłączonym SPZ)."""
    if not spz.trace:
        return False
    pierwszy = spz.trace[0]
    return bool(pierwszy.get("result", {}).get("spz_enabled") is False)


# =============================================================================
# REFERENCE PATTERN VALIDATOR
# =============================================================================


@dataclass
class LineIDoublePrimeReferencePattern:
    """
    Reference Pattern A: Dobór I>> dla linii SN.

    Validates methodology coherence by:
    1. Running `ProtectionSettingsEngine.calculate()` (or accepting a pre-computed result)
    2. Extracting key values (okno nastaw, SPZ, generacja lokalna)
    3. Building validation checks
    4. Determining verdict (ZGODNE/GRANICZNE/NIEZGODNE)
    5. Recording WHITE-BOX trace

    NOT-A-SOLVER: Only interprets `ProtectionSettingsResult`.
    """

    def validate(
        self,
        input_data: ProtectionSettingsInput | None = None,
        analysis_result: ProtectionSettingsResult | None = None,
        fixture_file: str | None = None,
    ) -> ReferencePatternResult:
        """
        Run reference pattern validation.

        Args:
            input_data: `ProtectionSettingsInput` (if provided, runs the engine)
            analysis_result: Pre-computed `ProtectionSettingsResult` (skips the engine)
            fixture_file: Fixture filename to load (if provided, loads and runs)

        Returns:
            ReferencePatternResult with verdict, checks, and trace.

        Note:
            Exactly one of input_data, analysis_result, or fixture_file must be provided.
        """
        trace_steps: list[dict[str, Any]] = []

        # Step 1: Resolve input and run/use analysis
        if fixture_file:
            trace_steps.append(
                build_trace_step(
                    step="load_fixture",
                    description_pl="Wczytanie danych referencyjnych z pliku fixture",
                    inputs={"fixture_file": fixture_file},
                    outputs={"status": "loaded"},
                )
            )
            fixture = load_fixture(fixture_file)
            input_data = fixture_to_input(fixture)

        if analysis_result is None:
            if input_data is None:
                raise ValueError("Musisz podać input_data, analysis_result lub fixture_file")

            trace_steps.append(
                build_trace_step(
                    step="run_analysis",
                    description_pl="Uruchomienie silnika doboru nastaw I>/I>> (Hoppel/IRiESD)",
                    inputs={
                        "line_id": input_data.line_id,
                        "line_name": input_data.line_name,
                        "k_b": input_data.k_b,
                        "k_bth": input_data.k_bth,
                        "spz_enabled": input_data.spz_enabled,
                        "lokalna_generacja_aktywna": input_data.lokalna_generacja_aktywna,
                    },
                )
            )

            analysis_result = ProtectionSettingsEngine.calculate(input_data)

            trace_steps.append(
                build_trace_step(
                    step="analysis_completed",
                    description_pl="Obliczenie nastaw I>/I>> zakończone",
                    inputs={},
                    outputs={
                        "window_valid": analysis_result.setting_window.window_valid,
                        "spz_allowed": analysis_result.spz.spz_allowed,
                    },
                )
            )

        # Step 2: Extract key values (zakres wzorca: I>>, cieplne okna, SPZ,
        # generacja lokalna — BEZ I>/cieplne ogólne, patrz nagłówek modułu)
        instantaneous = analysis_result.instantaneous
        setting_window = analysis_result.setting_window
        spz = analysis_result.spz
        local_generation = analysis_result.local_generation

        # `ithn_a` (prad znamionowy cieplny 1s = przekroj x gestosc) wymaga
        # przekroju/materialu przewodu — `ProtectionSettingsResult` ich NIE
        # przenosi (inaczej niz dawny FIX-12D, gdzie `ThermalWithstandResult`
        # niosl `ithn_a` wprost). Gdy wzorzec wola z `analysis_result` (bez
        # `input_data` — sciezka wylacznie do testow post-processingu bez
        # ponownego liczenia silnika), artefakt jest NIEDOSTEPNY — zero
        # fabrykacji domyslnego materialu/przekroju.
        ithn_a: float | None = None
        if input_data is not None:
            j_thn = THERMAL_DENSITY.get(input_data.conductor_material, 94.0)
            ithn_a = round(input_data.cross_section_mm2 * j_thn, 1)

        artifacts: dict[str, Any] = {
            "tk_total_s": spz.total_fault_time_s,
            "ithn_a": ithn_a,
            "ithdop_a": spz.i_th_available_a,
            "i_min_sel_primary_a": instantaneous.i_min_selectivity_a,
            "i_max_sens_primary_a": instantaneous.i_max_sensitivity_a,
            "i_max_th_primary_a": instantaneous.i_max_thermal_a,
            "window_i_min_primary_a": setting_window.i_min_a,
            "window_i_max_primary_a": setting_window.i_max_a,
            "window_valid": setting_window.window_valid,
            "limiting_criterion_min": setting_window.limiting_criterion_min,
            "limiting_criterion_max": setting_window.limiting_criterion_max,
            "recommended_setting_primary_a": instantaneous.i_setting_a,
            "window_conflict_pl": setting_window.conflict_pl,
            "window_recommendations_pl": list(setting_window.recommendations_pl),
            "spz_i_th_required_a": spz.i_th_required_a,
            "spz_allowed": spz.spz_allowed,
            "spz_enabled": not _spz_wylaczone(spz),
            "generacja_lokalna_aktywna": local_generation.aktywna,
            "generacja_lokalna_wklad_el_a": local_generation.wklad_el_a,
            "generacja_lokalna_wklad_systemu_a": local_generation.wklad_systemu_a,
            "generacja_lokalna_udzial_el": local_generation.udzial_el,
            "generacja_lokalna_ryzyko_zsz": local_generation.ryzyko_blokady_zsz,
        }

        trace_steps.append(
            build_trace_step(
                step="extract_values",
                description_pl="Ekstrakcja kluczowych wartości z wyniku silnika",
                inputs={"line_id": analysis_result.line_id},
                outputs=stable_sort_dict(artifacts),
            )
        )

        # Step 3: Build checks
        checks: list[dict[str, Any]] = []
        linia = (analysis_result.line_id, analysis_result.line_name)

        sel_check, sel_ocena = self._build_selectivity_check(linia, instantaneous, setting_window)
        checks.append(sel_check)
        trace_steps.append(
            build_trace_step(
                step="check_selectivity",
                description_pl="Sprawdzenie kryterium selektywności I>>",
                formula=r"I_{min,sel} = k_b \times I''_{k,max}^{(następna~strefa)}",
                inputs={
                    "k_b": instantaneous.k_b,
                    "i_min_selectivity_a": instantaneous.i_min_selectivity_a,
                },
                outputs={"check_status": sel_check["status"]},
            )
        )

        sens_check, sens_ocena = self._build_sensitivity_check(linia, instantaneous, setting_window)
        checks.append(sens_check)
        trace_steps.append(
            build_trace_step(
                step="check_sensitivity",
                description_pl="Sprawdzenie kryterium czułości I>>",
                formula=r"I_{max,cz} = I''_{k3,min}^{(początek~linii)} / k_b",
                inputs={
                    "k_b": instantaneous.k_b,
                    "i_max_sensitivity_a": instantaneous.i_max_sensitivity_a,
                },
                outputs={"check_status": sens_check["status"]},
            )
        )

        th_check, th_ocena = self._build_thermal_check(linia, instantaneous, setting_window)
        checks.append(th_check)
        trace_steps.append(
            build_trace_step(
                step="check_thermal",
                description_pl="Sprawdzenie górnej granicy cieplnej okna I>> (zadziałanie chwilowe)",
                formula=r"I_{max,th} = \frac{s \cdot j_{thn}}{k_{bth} \cdot \sqrt{0{,}05\ s}}",
                inputs={
                    "k_bth": instantaneous.k_bth,
                    "i_max_thermal_a": instantaneous.i_max_thermal_a,
                },
                outputs={"check_status": th_check["status"]},
            )
        )

        window_check, okno_ocena, waskie_okno = self._build_window_check(linia, setting_window)
        checks.append(window_check)
        trace_steps.append(
            build_trace_step(
                step="check_window",
                description_pl="Sprawdzenie okna nastaw [I_min, I_max]",
                inputs={
                    "i_min_a": setting_window.i_min_a,
                    "i_max_a": setting_window.i_max_a,
                },
                calculation={
                    "window_width_a": setting_window.i_max_a - setting_window.i_min_a,
                    "window_valid": setting_window.window_valid,
                },
                outputs={"check_status": window_check["status"]},
            )
        )

        spz_check, spz_ocena = self._build_spz_check(linia, spz)
        checks.append(spz_check)
        trace_steps.append(
            build_trace_step(
                step="check_spz",
                description_pl="Sprawdzenie analizy cieplnej cyklu SPZ",
                inputs={
                    "spz_wylaczone": _spz_wylaczone(spz),
                    "total_fault_time_s": spz.total_fault_time_s,
                    "i_th_required_a": spz.i_th_required_a,
                    "i_th_available_a": spz.i_th_available_a,
                },
                outputs={"spz_allowed": spz.spz_allowed, "check_status": spz_check["status"]},
            )
        )

        lg_check, lg_ocena = self._build_local_generation_check(linia, local_generation)
        checks.append(lg_check)
        trace_steps.append(
            build_trace_step(
                step="check_local_generation",
                description_pl="Sprawdzenie diagnostyki generacji lokalnej (E-L)",
                inputs={
                    "aktywna": local_generation.aktywna,
                    "udzial_el": local_generation.udzial_el,
                    "prog_udzialu_zsz": local_generation.prog_udzialu_zsz,
                },
                outputs={
                    "ryzyko_blokady_zsz": local_generation.ryzyko_blokady_zsz,
                    "check_status": lg_check["status"],
                },
            )
        )

        # Step 4: Sort checks deterministically
        checks_sorted = sorted(checks, key=lambda c: c["name_pl"])

        # Step 5: Determine verdict — rekord W nad kryteriami okna i SPZ; diagnostyka
        # generacji lokalnej i wąskie okno to sygnały ograniczenia (GRANICZNE), nie kryteria.
        oceny = (sel_ocena, sens_ocena, th_ocena, okno_ocena, spz_ocena)
        ograniczenia = [o for o in (waskie_okno,) if o is not None]
        if lg_ocena.status_maszynowy == "NIE_SPELNIA":
            ograniczenia.append(
                f"ryzyko blokady ZSZ od generacji lokalnej ({lg_check['description_pl']})"
            )
        wymaganie = wymaganie_wzorca(
            wzorzec="A",
            wymaganie_id=f"wzorzec_a.{analysis_result.line_id}",
            nazwa_pl=f"{PATTERN_NAME_PL} — {analysis_result.line_name or opis_bez_nazwy('branches')}",
            oceny=oceny,
        )
        verdict = werdykt_wzorca(oceny, ograniczenia=ograniczenia)
        opis = opis_werdyktu(wymaganie, verdict, ograniczenia)

        trace_steps.append(
            build_trace_step(
                step="determine_verdict",
                description_pl="Wyznaczenie werdyktu końcowego wzorca",
                inputs={
                    "window_valid": setting_window.window_valid,
                    "spz_allowed": spz.spz_allowed,
                    "ryzyko_blokady_zsz": local_generation.ryzyko_blokady_zsz,
                },
                outputs={"verdict": verdict, "wyjasnienie": wymaganie.wyjasnienie.zdanie_pl},
            )
        )

        # Step 6: Build summary
        summary_pl = self._build_summary(wymaganie, ograniczenia, setting_window, artifacts)

        return ReferencePatternResult(
            pattern_id=PATTERN_ID,
            name_pl=PATTERN_NAME_PL,
            verdict=verdict,
            verdict_description_pl=opis,
            summary_pl=summary_pl,
            wymaganie=wymaganie,
            wyjasnienie=wymaganie.wyjasnienie,
            checks=tuple(checks_sorted),
            trace=tuple(trace_steps),
            artifacts=stable_sort_dict(artifacts),
        )

    def _ocena(
        self,
        result_line: tuple[str, str],
        *,
        kryterium_id: str,
        opis_pl: str,
        wielkosc_pl: str,
        spelniony: bool | None,
        stan_pl: str,
        krok_sladu: str,
        dotyczy: bool = True,
        powod_stosowalnosci_pl: str | None = None,
        braki: tuple[str, ...] = (),
    ) -> OcenaKryterium:
        """Rekord K sprawdzenia wzorca A — kryterium LOGICZNE czytane z decyzji silnika
        nastaw (``range_valid``, ``spz_allowed``, ``ryzyko_blokady_zsz``): silnik decyduje na
        wartościach niezaokrąglonych, więc rekord bierze JEGO rozstrzygnięcie (jedno źródło),
        a liczby niesie opis stanu."""
        line_id, line_name = result_line
        return ocena_sprawdzenia(
            Porownanie(
                kryterium_id=f"wzorzec_a.{kryterium_id}",
                opis_pl=opis_pl,
                relacja="LOGICZNE",
                wielkosc_pl=wielkosc_pl,
                spelniony=spelniony if dotyczy else None,
                stan_pl=stan_pl,
                braki=braki,
                dotyczy=dotyczy,
                powod_stosowalnosci_pl=powod_stosowalnosci_pl or DOTYCZY_OBIEKTU,
            ),
            wzorzec="A",
            element_ref=line_id,
            nazwa_pl=line_name or opis_bez_nazwy("branches"),
            krok_sladu=krok_sladu,
        )

    def _build_selectivity_check(
        self,
        linia: tuple[str, str],
        instantaneous: InstantaneousSettings,
        setting_window: InstantaneousSettingWindow,
    ) -> tuple[dict[str, Any], OcenaKryterium]:
        """Build selectivity criterion check."""
        ocena = self._ocena(
            linia,
            kryterium_id="selektywnosc",
            opis_pl=(
                "Selektywność I>>: dolna granica nastawy k_b · I''k,max(następna strefa) "
                "mieści się poniżej górnej granicy okna"
            ),
            wielkosc_pl="dolna granica selektywności I_min,sel wobec górnej granicy okna I>>",
            spelniony=setting_window.window_valid,
            stan_pl=(
                f"I_min,sel = {instantaneous.i_min_selectivity_a:.1f} A (k_b = "
                f"{instantaneous.k_b}), górna granica okna {setting_window.i_max_a:.1f} A"
            ),
            krok_sladu="check_selectivity",
        )
        desc = (
            f"Selektywność wyznacza dolną granicę konfliktu: I_min = "
            f"{instantaneous.i_min_selectivity_a:.1f} A (k_b={instantaneous.k_b}). "
            f"{setting_window.conflict_pl}"
            if not setting_window.window_valid
            else f"Selektywność spełniona: I_min = {instantaneous.i_min_selectivity_a:.1f} A "
            f"(k_b={instantaneous.k_b})"
        )
        return (
            build_check(
                name_pl="Selektywność I>>",
                status=status_sprawdzenia(ocena, ograniczenie=False),
                description_pl=desc,
                ocena=ocena,
                details={
                    "i_min_selectivity_a": instantaneous.i_min_selectivity_a,
                    "k_b": instantaneous.k_b,
                },
            ),
            ocena,
        )

    def _build_sensitivity_check(
        self,
        linia: tuple[str, str],
        instantaneous: InstantaneousSettings,
        setting_window: InstantaneousSettingWindow,
    ) -> tuple[dict[str, Any], OcenaKryterium]:
        """Build sensitivity criterion check (naruszona, gdy czułość wyznacza górną granicę
        sprzecznego okna)."""
        limituje = (
            not setting_window.window_valid
            and setting_window.limiting_criterion_max == "sensitivity"
        )
        ocena = self._ocena(
            linia,
            kryterium_id="czulosc",
            opis_pl=(
                "Czułość I>>: górna granica I''k3,min(początek linii) / k_b nie wyznacza "
                "sprzecznego okna nastaw"
            ),
            wielkosc_pl="górna granica czułości I_max,cz wobec dolnej granicy selektywności",
            spelniony=not limituje,
            stan_pl=(
                f"I_max,cz = {instantaneous.i_max_sensitivity_a:.1f} A (k_b = "
                f"{instantaneous.k_b}), I_min,sel = {instantaneous.i_min_selectivity_a:.1f} A"
            ),
            krok_sladu="check_sensitivity",
        )
        desc = (
            f"Czułość wyznacza górną granicę konfliktu: I_max = "
            f"{instantaneous.i_max_sensitivity_a:.1f} A (k_b={instantaneous.k_b}). "
            f"{setting_window.conflict_pl}"
            if limituje
            else f"Czułość spełniona: I_max = {instantaneous.i_max_sensitivity_a:.1f} A "
            f"(k_b={instantaneous.k_b})"
        )
        return (
            build_check(
                name_pl="Czułość I>>",
                status=status_sprawdzenia(ocena, ograniczenie=False),
                description_pl=desc,
                ocena=ocena,
                details={
                    "i_max_sensitivity_a": instantaneous.i_max_sensitivity_a,
                    "k_b": instantaneous.k_b,
                },
            ),
            ocena,
        )

    def _build_thermal_check(
        self,
        linia: tuple[str, str],
        instantaneous: InstantaneousSettings,
        setting_window: InstantaneousSettingWindow,
    ) -> tuple[dict[str, Any], OcenaKryterium]:
        """Build thermal (window ceiling) criterion check."""
        limituje = (
            not setting_window.window_valid and setting_window.limiting_criterion_max == "thermal"
        )
        ocena = self._ocena(
            linia,
            kryterium_id="cieplne",
            opis_pl=(
                "Kryterium cieplne I>>: górna granica I_th,max / k_bth (zadziałanie chwilowe "
                "0,05 s) nie wyznacza sprzecznego okna nastaw"
            ),
            wielkosc_pl="górna granica cieplna I_max,th wobec dolnej granicy selektywności",
            spelniony=not limituje,
            stan_pl=(
                f"I_max,th = {instantaneous.i_max_thermal_a:.1f} A (k_bth = "
                f"{instantaneous.k_bth}), I_min,sel = {instantaneous.i_min_selectivity_a:.1f} A"
            ),
            krok_sladu="check_thermal",
        )
        desc = (
            f"Kryterium cieplne wyznacza górną granicę konfliktu: I_max = "
            f"{instantaneous.i_max_thermal_a:.1f} A (k_bth={instantaneous.k_bth}). "
            f"{setting_window.conflict_pl}"
            if limituje
            else f"Kryterium cieplne spełnione: I_max = {instantaneous.i_max_thermal_a:.1f} A "
            f"(k_bth={instantaneous.k_bth}, zadziałanie chwilowe 0,05 s)"
        )
        return (
            build_check(
                name_pl="Kryterium cieplne",
                status=status_sprawdzenia(ocena, ograniczenie=False),
                description_pl=desc,
                ocena=ocena,
                details={
                    "i_max_thermal_a": instantaneous.i_max_thermal_a,
                    "k_bth": instantaneous.k_bth,
                },
            ),
            ocena,
        )

    def _build_window_check(
        self, linia: tuple[str, str], setting_window: InstantaneousSettingWindow
    ) -> tuple[dict[str, Any], OcenaKryterium, str | None]:
        """Build setting window check. Zwraca też zdanie ograniczenia (wąskie okno) — sygnał
        nałożony na SPEŁNIONY rekord okna, liczony z tych samych granic okna."""
        ocena = self._ocena(
            linia,
            kryterium_id="okno_nastaw",
            opis_pl="Okno nastaw I>>: dolna granica nie przekracza górnej",
            wielkosc_pl="okno nastaw [I_min; I_max]",
            spelniony=setting_window.window_valid,
            stan_pl=(
                f"I_min = {setting_window.i_min_a:.1f} A "
                f"({setting_window.limiting_criterion_min}), I_max = "
                f"{setting_window.i_max_a:.1f} A ({setting_window.limiting_criterion_max})"
            ),
            krok_sladu="check_window",
        )
        relative_width = _szerokosc_wzgledna(setting_window)
        ograniczenie: str | None = None
        if not setting_window.window_valid:
            desc = setting_window.conflict_pl or (
                f"Okno nastaw sprzeczne: I_min ({setting_window.i_min_a:.1f} A) > "
                f"I_max ({setting_window.i_max_a:.1f} A)"
            )
        elif relative_width is None:
            # Dolna granica okna niedodatnia: szerokości względnej nie da się wyznaczyć — sygnał
            # ograniczenia jawny (nie zerowa ani nieskończona szerokość podstawiona za brak).
            ograniczenie = (
                f"szerokość względna okna nastaw niewyznaczona — dolna granica I_min = "
                f"{setting_window.i_min_a:.1f} A nie jest dodatnia"
            )
            desc = (
                f"Okno nastaw: [{setting_window.i_min_a:.1f}, {setting_window.i_max_a:.1f}] A, "
                "szerokość względna niewyznaczona (I_min ≤ 0 A)"
            )
        elif relative_width < NARROW_WINDOW_THRESHOLD:
            ograniczenie = (
                f"okno nastaw wąskie — szerokość względna {relative_width*100:.1f}% < "
                f"{NARROW_WINDOW_THRESHOLD*100}%"
            )
            desc = (
                f"Okno nastaw wąskie: [{setting_window.i_min_a:.1f}, "
                f"{setting_window.i_max_a:.1f}] A, szerokość względna = "
                f"{relative_width*100:.1f}% < {NARROW_WINDOW_THRESHOLD*100}%"
            )
        else:
            desc = (
                f"Okno nastaw prawidłowe: [{setting_window.i_min_a:.1f}, "
                f"{setting_window.i_max_a:.1f}] A"
            )

        return (
            build_check(
                name_pl="Okno nastaw",
                status=status_sprawdzenia(ocena, ograniczenie=ograniczenie is not None),
                description_pl=desc,
                ocena=ocena,
                details={
                    "i_min_a": setting_window.i_min_a,
                    "i_max_a": setting_window.i_max_a,
                    "window_valid": setting_window.window_valid,
                    "limiting_min": setting_window.limiting_criterion_min,
                    "limiting_max": setting_window.limiting_criterion_max,
                },
            ),
            ocena,
            ograniczenie,
        )

    def _build_spz_check(
        self, linia: tuple[str, str], spz: SPZAnalysisResult
    ) -> tuple[dict[str, Any], OcenaKryterium]:
        """Build SPZ thermal-cycle check (SPZ wyłączone — kryterium nie dotyczy)."""
        wylaczone = _spz_wylaczone(spz)
        ocena = self._ocena(
            linia,
            kryterium_id="spz",
            opis_pl=(
                "Cykl SPZ: wymagana wytrzymałość cieplna I''k,max nie przekracza dostępnej "
                "s · j_thn / √t_cyklu"
            ),
            wielkosc_pl="wytrzymałość cieplna przewodu w pełnym cyklu SPZ",
            spelniony=spz.spz_allowed,
            stan_pl=(
                f"wymagana {a_na_ka(spz.i_th_required_a):.2f} kA, dostępna "
                f"{a_na_ka(spz.i_th_available_a):.2f} kA w cyklu {spz.total_fault_time_s:.2f} s"
            ),
            krok_sladu="check_spz",
            dotyczy=not wylaczone,
            powod_stosowalnosci_pl=(
                "SPZ wyłączone w danych przypadku — cykl cieplny SPZ nie występuje"
                if wylaczone
                else None
            ),
        )
        if wylaczone:
            return (
                build_check(
                    name_pl="SPZ: dozwolone/blokować",
                    status=status_sprawdzenia(ocena, ograniczenie=False),
                    description_pl="SPZ wyłączone — analiza cyklu cieplnego niedostępna",
                    ocena=ocena,
                ),
                ocena,
            )

        desc = (
            f"SPZ dozwolone: wymagana wytrzymałość {a_na_ka(spz.i_th_required_a):.2f} kA "
            f"<= dostępna {a_na_ka(spz.i_th_available_a):.2f} kA w cyklu "
            f"{spz.total_fault_time_s:.2f} s"
            if spz.spz_allowed
            else f"SPZ powinno być zablokowane: wymagana wytrzymałość "
            f"{a_na_ka(spz.i_th_required_a):.2f} kA > dostępna "
            f"{a_na_ka(spz.i_th_available_a):.2f} kA w cyklu {spz.total_fault_time_s:.2f} s"
        )
        return (
            build_check(
                name_pl="SPZ: dozwolone/blokować",
                status=status_sprawdzenia(ocena, ograniczenie=False),
                description_pl=desc,
                ocena=ocena,
                details={
                    "spz_allowed": spz.spz_allowed,
                    "total_fault_time_s": spz.total_fault_time_s,
                    "i_th_required_a": spz.i_th_required_a,
                    "i_th_available_a": spz.i_th_available_a,
                },
            ),
            ocena,
        )

    def _build_local_generation_check(
        self, linia: tuple[str, str], local_generation: LocalGenerationDiagnostic
    ) -> tuple[dict[str, Any], OcenaKryterium]:
        """Build local generation (E-L) diagnostic check.

        DIAGNOSTYKA, nie kryterium okna: rekord K „brak ryzyka blokady ZSZ” nie wchodzi do
        rekordu W wzorca — jego naruszenie jest sygnałem ograniczenia (``WARN`` →
        ``GRANICZNE``), a nierozstrzygnięcie (brak jawnego progu albo udziału) — ``INFO``."""
        aktywna = local_generation.aktywna
        ryzyko = local_generation.ryzyko_blokady_zsz
        if (
            aktywna
            and ryzyko is not None
            and (local_generation.udzial_el is None or local_generation.prog_udzialu_zsz is None)
        ):
            # `ryzyko_blokady_zsz` ustawione => silnik
            # (`ProtectionSettingsEngine._check_local_generation`) GWARANTUJE, że
            # `udzial_el`/`prog_udzialu_zsz` są wtedy oba wyznaczone. Jawne zgłoszenie
            # zamiast cichego zastępnika (zero fabrykacji).
            raise ValueError(
                "Niespójność silnika: ryzyko_blokady_zsz ustawione, ale udzial_el/"
                "prog_udzialu_zsz są None — narusza niezmiennik "
                "ProtectionSettingsEngine._check_local_generation."
            )
        udzial = local_generation.udzial_el
        prog = local_generation.prog_udzialu_zsz
        braki: tuple[str, ...] = ()
        if aktywna and ryzyko is None:
            braki = (
                ("jawnie podany próg udziału E-L w prądzie zwarciowym dla ryzyka blokady ZSZ",)
                if prog is None
                else ("dodatni prąd zwarciowy łącznie na początku linii (udział E-L)",)
            )
        ocena = self._ocena(
            linia,
            kryterium_id="generacja_lokalna_zsz",
            opis_pl=(
                "Generacja lokalna (E-L): udział wkładu E-L w prądzie zwarciowym poniżej progu "
                "ryzyka niepożądanej blokady ZSZ"
            ),
            wielkosc_pl="ryzyko blokady ZSZ od wkładu generacji lokalnej",
            spelniony=None if ryzyko is None else not ryzyko,
            stan_pl=(
                f"wkład E-L {udzial*100:.1f}% wobec progu {prog*100:.1f}%"
                if udzial is not None and prog is not None
                else "udział E-L albo próg ryzyka niewyznaczony"
            ),
            krok_sladu="check_local_generation",
            dotyczy=aktywna,
            powod_stosowalnosci_pl=(
                None if aktywna else "generacja lokalna nieaktywna w danych przypadku"
            ),
            braki=braki,
        )
        ryzyko_stwierdzone = ocena.status_maszynowy == "NIE_SPELNIA"
        details: dict[str, Any] | None = None
        if not aktywna:
            desc = "Generacja lokalna nieaktywna — diagnostyka niedotycząca"
        elif udzial is None or prog is None:
            desc = f"Ryzyko blokady ZSZ niedostępne — brak: {braki[0]}"
            details = {
                "wklad_el_a": local_generation.wklad_el_a,
                "wklad_systemu_a": local_generation.wklad_systemu_a,
            }
        else:
            desc = (
                f"Ryzyko blokady ZSZ: wkład E-L {udzial*100:.1f}% >= próg {prog*100:.1f}%"
                if ryzyko_stwierdzone
                else f"Brak ryzyka blokady ZSZ: wkład E-L {udzial*100:.1f}% < próg "
                f"{prog*100:.1f}%"
            )
            details = {
                "typ_zrodla": local_generation.typ_zrodla,
                "wklad_el_a": local_generation.wklad_el_a,
                "wklad_systemu_a": local_generation.wklad_systemu_a,
                "udzial_el": local_generation.udzial_el,
                "prog_udzialu_zsz": local_generation.prog_udzialu_zsz,
                "ryzyko_blokady_zsz": local_generation.ryzyko_blokady_zsz,
            }
        # Naruszenie diagnostyki = sygnał ograniczenia (WARN), nie niezgodność wzorca.
        status: CheckStatus = (
            "WARN" if ryzyko_stwierdzone else status_sprawdzenia(ocena, ograniczenie=False)
        )
        return (
            build_check(
                name_pl="Generacja lokalna (E-L)",
                status=status,
                description_pl=desc,
                ocena=ocena,
                details=details,
            ),
            ocena,
        )

    def _build_summary(
        self,
        wymaganie: WynikWymagania,
        ograniczenia: list[str],
        setting_window: InstantaneousSettingWindow,
        artifacts: dict[str, Any],
    ) -> str:
        """Podsumowanie po polsku: etykieta rekordu W, ograniczenia oraz okno i zalecana
        nastawa (albo konflikt kryteriów, gdy okno jest sprzeczne). Pełne zdanie werdyktu
        niesie ``verdict_description_pl`` i rekord ``wymaganie``."""
        czesci = [f"{wymaganie.etykieta.etykieta_pl}."]
        if ograniczenia:
            czesci.append(f"Ograniczenia: {'; '.join(ograniczenia)}.")
        if not setting_window.window_valid:
            czesci.append(
                f"{setting_window.conflict_pl} Nie można dobrać nastawy I>> spełniającej "
                "wszystkie kryteria."
            )
        else:
            czesci.append(
                f"Okno nastaw I>>: [{setting_window.i_min_a:.1f}, "
                f"{setting_window.i_max_a:.1f}] A. Zalecana nastawa: "
                f"{artifacts['recommended_setting_primary_a']:.1f} A."
            )
        return " ".join(czesci)


def _szerokosc_wzgledna(setting_window: InstantaneousSettingWindow) -> float | None:
    """Szerokość względna okna (I_max − I_min) / I_min — jedno źródło sygnału wąskiego okna;
    ``None``, gdy dolna granica nie jest dodatnia (wielkość niewyznaczona, nie zero)."""
    if setting_window.i_min_a <= 0:
        return None
    return (setting_window.i_max_a - setting_window.i_min_a) / setting_window.i_min_a


# =============================================================================
# PUBLIC API
# =============================================================================


def run_pattern_a(
    input_data: ProtectionSettingsInput | None = None,
    analysis_result: ProtectionSettingsResult | None = None,
    fixture_file: str | None = None,
) -> ReferencePatternResult:
    """
    Run Reference Pattern A validation.

    Convenience function for running the pattern.

    Args:
        input_data: `ProtectionSettingsInput` (runs the Hoppel/IRiESD engine)
        analysis_result: Pre-computed `ProtectionSettingsResult`
        fixture_file: Fixture filename to load

    Returns:
        ReferencePatternResult with verdict, checks, and trace.
    """
    pattern = LineIDoublePrimeReferencePattern()
    return pattern.validate(
        input_data=input_data,
        analysis_result=analysis_result,
        fixture_file=fixture_file,
    )

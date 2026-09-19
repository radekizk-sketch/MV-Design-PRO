"""
Protection Settings Engine — Dobór nastaw zabezpieczeń nadprądowych I>/I>>

Based on: Dr Hoppel article "Dobór nastaw zabezpieczeń nadprądowych zwarciowych dla linii SN"
Standards: PN-EN 60255, IRiESD ENEA (Δt = 0.3 s)

LOCATION: Application layer (NOT a solver — interprets existing SC and PF results)

Principles:
- Uses SC results (I_k_max, I_k_min) from existing solvers
- Uses PF results (I_obc_max) from existing solvers
- Uses cable/line parameters from Catalog
- NO physics calculations — only interpretation and settings calculation
- Full WHITE BOX trace for each calculation step

Key formulas:
1. I> (delayed/time-graded): I_nast > k_b * I_obc_max
2. I>> (instantaneous):
   - Selectivity: I_nast_>> >= k_b * I_k_max_next_bus
   - Thermal withstand: I_nast_>> <= I_th_dop = s * j_thn / sqrt(t_k)
   - Sensitivity: I_nast_>> < I_k_min_bus / k_b
3. SPZ (auto-reclose): Analysis of I>> blocking during SPZ cycle

Parameters:
- delta_t_s: Time grading step (0.3s per IRiESD ENEA, older practice uses 0.5s)
- k_b: Selectivity factor (typically 1.2-1.5)
- k_bth: Thermal correction factor (1.05-1.2, depends on line length)

Thermal withstand tables (from Hoppel article):
- Copper: j_thn = 142 A/mm² (for 1s)
- Aluminium: j_thn = 94 A/mm² (for 1s)
- ACSR (AlFe): j_thn = 87 A/mm² (for 1s)

Extensions (karta W3-C2, 2026-09-09; ADDYTYWNE, opcjonalne wejścia, nowe bloki
wyniku — istniejące liczby I>/I>>/cieplne/SPZ dla dotychczasowych wejść bez
zmian, patrz tests/test_protection_settings_w3c2_identity.py):
4. Local generation (generacja_lokalna): diagnostics of E-L (distributed
   generation) contribution to fault current and ZSZ (busbar protection)
   blocking risk — explicit inputs, no guessed thresholds.
5. Setting window (okno_nastaw): I>> window bounds with named limiting
   criteria, conflict text (with numeric deficit) and recommendations when
   the window is empty.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

# Thermal density values j_thn [A/mm²] for 1 second (IEC 60909/Hoppel Table 3-4)
THERMAL_DENSITY = {
    "Cu": 142.0,
    "Al": 94.0,
    "AlFe": 87.0,
    "ACSR": 87.0,
}

# Default correction factor k_bth by line length ratio (Hoppel Table 7)
K_BTH_TABLE = {
    "short": 1.05,  # < 30% of total line
    "medium": 1.10,  # 30-70% of total line
    "long": 1.20,  # > 70% of total line
}


@dataclass(frozen=True)
class ProtectionSettingsInput:
    """Input data for protection settings calculation."""

    line_id: str
    line_name: str

    # Cable/line parameters
    cross_section_mm2: float
    conductor_material: str  # "Cu", "Al", "AlFe", "ACSR"
    length_km: float
    i_nominal_a: float  # Rated current capacity

    # Short circuit currents (from SC solver)
    ik3_max_beginning_a: float  # I_k3_max at line beginning (c_max)
    ik3_min_beginning_a: float  # I_k3_min at line beginning (c_min)
    ik3_max_end_a: float  # I_k3_max at line end
    ik3_min_end_a: float  # I_k3_min at line end
    ik2_min_end_a: float  # I_k2_min at line end (for sensitivity)

    # Next downstream bus max SC current (for selectivity)
    ik_max_next_bus_a: float

    # Power flow results
    i_load_max_a: float  # Maximum load current from PF

    # Configuration
    delta_t_s: float = 0.3  # Time grading step [s] (IRiESD)
    k_b: float = 1.2  # Selectivity factor
    k_bth: float = 1.1  # Thermal correction factor
    t_upstream_s: float = 0.0  # Upstream protection time [s]
    spz_enabled: bool = True  # Whether SPZ (auto-reclose) is considered
    spz_pause_s: float = 0.5  # SPZ dead time [s]

    # --- Rozszerzenie W3-C2 (2026-09-09): generacja lokalna (E-L) — ADDYTYWNE,
    # opcjonalne, bez zmiany domyślnych wyników I>/I>>/cieplne/SPZ dla
    # dotychczasowych wejść (karta W3-C2 §0.2 pkt 2). Przeniesione z
    # `line_overcurrent_setting/analyzer.py::_check_local_generation` z
    # wejściami JAWNYMI — próg ryzyka blokady ZSZ NIE ma domyślnej wartości
    # (dawny analizator zaszywał 30% bez cytatu źródła; tu brak progu = werdykt
    # NIEDOSTĘPNY, zero zgadywania).
    lokalna_generacja_aktywna: bool = False  # Czy sieć ma aktywną generację lokalną (E-L)
    lokalna_generacja_typ_zrodla: str | None = (
        None  # "SYNCHRONICZNE" | "ASYNCHRONICZNE" | "FALOWNIKOWE"
    )
    lokalna_generacja_wklad_a: float = 0.0  # Wkład E-L do I_k3_max na początku linii [A]
    lokalna_generacja_prog_udzialu_zsz: float | None = (
        None  # Próg udziału E-L → ryzyko ZSZ; brak = NIEDOSTĘPNY
    )


@dataclass(frozen=True)
class DelayedSettings:
    """Result for I> (delayed/time-graded) protection setting."""

    i_setting_a: float  # Recommended setting [A]
    t_setting_s: float  # Time delay [s]
    i_load_max_a: float  # Max load current used
    k_b: float  # Selectivity factor used
    sensitivity_ratio: float  # I_k_min / I_setting (should be >= 1.5)
    is_valid: bool
    validation_notes: list[str]
    trace: list[dict[str, Any]]


@dataclass(frozen=True)
class InstantaneousSettings:
    """Result for I>> (instantaneous) protection setting."""

    i_setting_a: float  # Recommended setting [A]
    i_min_selectivity_a: float  # Min from selectivity condition
    i_max_thermal_a: float  # Max from thermal condition
    i_max_sensitivity_a: float  # Max from sensitivity condition
    range_valid: bool  # Whether valid range exists
    k_b: float
    k_bth: float
    is_valid: bool
    validation_notes: list[str]
    trace: list[dict[str, Any]]


@dataclass(frozen=True)
class ThermalWithstandResult:
    """Thermal withstand check result."""

    i_th_dop_a: float  # Allowable thermal current [A]
    j_thn: float  # Thermal density [A/mm²]
    cross_section_mm2: float
    t_fault_s: float  # Total fault time [s]
    ik_max_a: float  # Maximum fault current [A]
    is_adequate: bool  # Whether cable withstands the fault
    margin_percent: float  # Safety margin [%]
    trace: list[dict[str, Any]]


@dataclass(frozen=True)
class SPZAnalysisResult:
    """Auto-reclose (SPZ) analysis result."""

    spz_allowed: bool  # Whether SPZ is allowed with I>>
    total_fault_time_s: float  # Total thermal stress time
    i_th_required_a: float  # Required thermal withstand
    i_th_available_a: float  # Available thermal withstand
    blocking_recommended: bool  # Whether I>> should block SPZ
    trace: list[dict[str, Any]]


@dataclass(frozen=True)
class LocalGenerationDiagnostic:
    """Diagnostyka sieci z generacją lokalną (E-L) — rozszerzenie W3-C2.

    Interpretacja porównawcza prądów zwarciowych: rozkład prądu 3F na początku
    chronionej linii (`ik3_max_beginning_a`, wynik solvera SC z kotwicy) na
    wkład systemu i wkład E-L (wejście JAWNE). Ryzyko blokady ZSZ liczone
    TYLKO gdy próg udziału podany jawnie w wejściu (`lokalna_generacja_prog_
    udzialu_zsz`) — bez progu `ryzyko_blokady_zsz` jest `None` (NIEDOSTĘPNY),
    silnik nie zgaduje progu bez cytowanego źródła (poprzedni analizator FIX-12D
    zaszywał 30% bez cytatu — świadomie NIE przeniesione, patrz karta W3-C2 §0.2).
    """

    aktywna: bool
    typ_zrodla: str | None
    prad_widziany_lacznie_a: float
    wklad_el_a: float
    wklad_systemu_a: float
    udzial_el: float | None
    prog_udzialu_zsz: float | None
    ryzyko_blokady_zsz: bool | None
    uwagi_pl: list[str]
    trace: list[dict[str, Any]]

    def to_dict(self) -> dict[str, Any]:
        """Serialize to JSON-compatible dict."""
        return {
            "aktywna": self.aktywna,
            "typ_zrodla": self.typ_zrodla,
            "prad_widziany_lacznie_a": self.prad_widziany_lacznie_a,
            "wklad_el_a": self.wklad_el_a,
            "wklad_systemu_a": self.wklad_systemu_a,
            "udzial_el": self.udzial_el,
            "prog_udzialu_zsz": self.prog_udzialu_zsz,
            "ryzyko_blokady_zsz": self.ryzyko_blokady_zsz,
            "uwagi_pl": self.uwagi_pl,
            "trace": self.trace,
        }


@dataclass(frozen=True)
class InstantaneousSettingWindow:
    """Okno dopuszczalnych nastaw I>> z nazwanymi kryteriami granic — rozszerzenie W3-C2.

    Dolna granica zawsze z warunku selektywności (`InstantaneousSettings.
    i_min_selectivity_a`). Górna granica z warunku, który silniej ogranicza
    (cieplny albo czułości) — pole `limiting_criterion_max` nazywa który.
    `window_valid` czyta TEN SAM predykat co `InstantaneousSettings.range_valid`
    (jedno źródło prawdy — reguła KLASA NIE INSTANCJA, predykaty parami). Przy
    pustym oknie `conflict_pl` niesie deficyt liczbowy i nazywa oba kryteria
    (przeniesione z `line_overcurrent_setting/analyzer.py::_mark_window_conflict`,
    dostosowane do parametrów Hoppla — bez przekładni CT, bez `kc` osobnego).
    """

    i_min_a: float
    i_max_a: float
    limiting_criterion_min: str
    limiting_criterion_max: str
    window_valid: bool
    conflict_pl: str | None
    recommendations_pl: list[str]
    trace: list[dict[str, Any]]

    def to_dict(self) -> dict[str, Any]:
        """Serialize to JSON-compatible dict."""
        return {
            "i_min_a": self.i_min_a,
            "i_max_a": self.i_max_a,
            "limiting_criterion_min": self.limiting_criterion_min,
            "limiting_criterion_max": self.limiting_criterion_max,
            "window_valid": self.window_valid,
            "conflict_pl": self.conflict_pl,
            "recommendations_pl": self.recommendations_pl,
            "trace": self.trace,
        }


@dataclass(frozen=True)
class ProtectionSettingsResult:
    """Complete result of protection settings calculation."""

    line_id: str
    line_name: str
    delayed: DelayedSettings
    instantaneous: InstantaneousSettings
    thermal: ThermalWithstandResult
    spz: SPZAnalysisResult
    local_generation: LocalGenerationDiagnostic
    setting_window: InstantaneousSettingWindow
    overall_valid: bool
    summary_notes: list[str]

    def to_dict(self) -> dict[str, Any]:
        """Serialize to JSON-compatible dict."""
        return {
            "line_id": self.line_id,
            "line_name": self.line_name,
            "delayed": {
                "i_setting_a": self.delayed.i_setting_a,
                "t_setting_s": self.delayed.t_setting_s,
                "i_load_max_a": self.delayed.i_load_max_a,
                "k_b": self.delayed.k_b,
                "sensitivity_ratio": self.delayed.sensitivity_ratio,
                "is_valid": self.delayed.is_valid,
                "validation_notes": self.delayed.validation_notes,
                "trace": self.delayed.trace,
            },
            "instantaneous": {
                "i_setting_a": self.instantaneous.i_setting_a,
                "i_min_selectivity_a": self.instantaneous.i_min_selectivity_a,
                "i_max_thermal_a": self.instantaneous.i_max_thermal_a,
                "i_max_sensitivity_a": self.instantaneous.i_max_sensitivity_a,
                "range_valid": self.instantaneous.range_valid,
                "k_b": self.instantaneous.k_b,
                "k_bth": self.instantaneous.k_bth,
                "is_valid": self.instantaneous.is_valid,
                "validation_notes": self.instantaneous.validation_notes,
                "trace": self.instantaneous.trace,
            },
            "thermal": {
                "i_th_dop_a": self.thermal.i_th_dop_a,
                "j_thn": self.thermal.j_thn,
                "cross_section_mm2": self.thermal.cross_section_mm2,
                "t_fault_s": self.thermal.t_fault_s,
                "ik_max_a": self.thermal.ik_max_a,
                "is_adequate": self.thermal.is_adequate,
                "margin_percent": self.thermal.margin_percent,
                "trace": self.thermal.trace,
            },
            "spz": {
                "spz_allowed": self.spz.spz_allowed,
                "total_fault_time_s": self.spz.total_fault_time_s,
                "i_th_required_a": self.spz.i_th_required_a,
                "i_th_available_a": self.spz.i_th_available_a,
                "blocking_recommended": self.spz.blocking_recommended,
                "trace": self.spz.trace,
            },
            # Rozszerzenie W3-C2 (ADDYTYWNE) — nowe bloki, istniejące klucze wyżej
            # niezmienione bit w bit dla dotychczasowych wejść.
            "generacja_lokalna": self.local_generation.to_dict(),
            "okno_nastaw": self.setting_window.to_dict(),
            "overall_valid": self.overall_valid,
            "summary_notes": self.summary_notes,
        }


class ProtectionSettingsEngine:
    """
    Silnik doboru nastaw zabezpieczeń nadprądowych I>/I>>.

    Application layer — NIE jest solverem.
    Interpretuje wyniki istniejących solverów (SC, PF) i oblicza nastawy.
    """

    @staticmethod
    def calculate(inp: ProtectionSettingsInput) -> ProtectionSettingsResult:
        """
        Calculate complete protection settings for a line.

        Returns ProtectionSettingsResult with I>, I>>, thermal check, and SPZ analysis.
        """
        delayed = ProtectionSettingsEngine._calculate_delayed(inp)
        instantaneous = ProtectionSettingsEngine._calculate_instantaneous(inp)
        thermal = ProtectionSettingsEngine._check_thermal_withstand(inp)
        spz = ProtectionSettingsEngine._analyze_spz(inp, instantaneous, thermal)
        # Rozszerzenie W3-C2 (ADDYTYWNE) — nie zmienia notes/overall_valid poniżej,
        # więc istniejące wyjścia dla dotychczasowych wejść zostają bit w bit.
        local_generation = ProtectionSettingsEngine._check_local_generation(inp)
        setting_window = ProtectionSettingsEngine._build_setting_window(inp, instantaneous)

        notes: list[str] = []
        overall_valid = True

        if not delayed.is_valid:
            overall_valid = False
            notes.append("Nastawa I> nie spełnia warunków")
        if not instantaneous.is_valid:
            overall_valid = False
            notes.append("Nastawa I>> nie spełnia warunków")
        if not thermal.is_adequate:
            overall_valid = False
            notes.append("Wytrzymałość cieplna przewodu niewystarczająca")
        if spz.blocking_recommended:
            notes.append("Zalecana blokada SPZ od I>>")

        return ProtectionSettingsResult(
            line_id=inp.line_id,
            line_name=inp.line_name,
            delayed=delayed,
            instantaneous=instantaneous,
            thermal=thermal,
            spz=spz,
            local_generation=local_generation,
            setting_window=setting_window,
            overall_valid=overall_valid,
            summary_notes=notes,
        )

    @staticmethod
    def _calculate_delayed(inp: ProtectionSettingsInput) -> DelayedSettings:
        """
        Calculate I> (delayed/time-graded) protection setting.

        I_nast > k_b * I_obc_max
        t = t_upstream + delta_t
        """
        trace: list[dict[str, Any]] = []

        # Step 1: Calculate setting based on max load current
        i_setting = inp.k_b * inp.i_load_max_a
        trace.append(
            {
                "step": "Obliczenie nastawy I>",
                "formula": "I_{>} = k_b \\cdot I_{obc,max}",
                "inputs": {"k_b": inp.k_b, "I_obc_max_A": inp.i_load_max_a},
                "substitution": f"{inp.k_b} * {inp.i_load_max_a:.1f}",
                "result": {"I_setting_A": round(i_setting, 1)},
            }
        )

        # Step 2: Time grading
        t_setting = inp.t_upstream_s + inp.delta_t_s
        trace.append(
            {
                "step": "Stopniowanie czasowe I>",
                "formula": "t_{>} = t_{upstream} + \\Delta t",
                "inputs": {
                    "t_upstream_s": inp.t_upstream_s,
                    "delta_t_s": inp.delta_t_s,
                },
                "substitution": f"{inp.t_upstream_s} + {inp.delta_t_s}",
                "result": {"t_setting_s": round(t_setting, 2)},
            }
        )

        # Step 3: Sensitivity check
        sensitivity = inp.ik2_min_end_a / i_setting if i_setting > 0 else 0.0
        trace.append(
            {
                "step": "Sprawdzenie czułości I>",
                "formula": "k_{cz} = I_{k2,min,end} / I_{>}",
                "inputs": {
                    "I_k2_min_end_A": inp.ik2_min_end_a,
                    "I_setting_A": round(i_setting, 1),
                },
                "substitution": f"{inp.ik2_min_end_a:.1f} / {i_setting:.1f}",
                "result": {"sensitivity_ratio": round(sensitivity, 2)},
                "requirement": "k_cz >= 1.5",
                "passed": sensitivity >= 1.5,
            }
        )

        notes: list[str] = []
        is_valid = True

        if sensitivity < 1.5:
            is_valid = False
            notes.append(
                f"Czułość zabezpieczenia I> niewystarczająca: " f"k_cz = {sensitivity:.2f} < 1.5"
            )

        if i_setting > inp.i_nominal_a:
            notes.append(
                f"Nastawa I> = {i_setting:.0f} A przekracza prąd znamionowy "
                f"przewodu In = {inp.i_nominal_a:.0f} A"
            )

        return DelayedSettings(
            i_setting_a=round(i_setting, 1),
            t_setting_s=round(t_setting, 2),
            i_load_max_a=inp.i_load_max_a,
            k_b=inp.k_b,
            sensitivity_ratio=round(sensitivity, 2),
            is_valid=is_valid,
            validation_notes=notes,
            trace=trace,
        )

    @staticmethod
    def _calculate_instantaneous(inp: ProtectionSettingsInput) -> InstantaneousSettings:
        """
        Calculate I>> (instantaneous) protection setting using Hoppel method.

        Three conditions must be satisfied:
        1. Selectivity: I>> >= k_b * I_k_max_next_bus
        2. Thermal withstand: I>> <= I_th_dop
        3. Sensitivity: I>> < I_k_min_bus / k_b
        """
        trace: list[dict[str, Any]] = []

        # Condition 1: Selectivity
        i_min_sel = inp.k_b * inp.ik_max_next_bus_a
        trace.append(
            {
                "step": "Warunek selektywności I>>",
                "formula": "I_{>>} \\geq k_b \\cdot I_{k,max,next}",
                "inputs": {
                    "k_b": inp.k_b,
                    "I_k_max_next_A": inp.ik_max_next_bus_a,
                },
                "substitution": f"{inp.k_b} * {inp.ik_max_next_bus_a:.1f}",
                "result": {"I_min_selectivity_A": round(i_min_sel, 1)},
            }
        )

        # Condition 2: Thermal withstand
        j_thn = THERMAL_DENSITY.get(inp.conductor_material, 94.0)
        t_fault_inst = 0.05  # Instantaneous trip ~50ms
        if t_fault_inst > 0:
            i_th_dop = inp.cross_section_mm2 * j_thn / math.sqrt(t_fault_inst)
        else:
            i_th_dop = float("inf")

        i_max_thermal = i_th_dop / inp.k_bth
        trace.append(
            {
                "step": "Warunek wytrzymałości cieplnej I>>",
                "formula": "I_{>>} \\leq \\frac{I_{th,dop}}{k_{bth}} = "
                "\\frac{s \\cdot j_{thn}}{k_{bth} \\cdot \\sqrt{t_k}}",
                "inputs": {
                    "s_mm2": inp.cross_section_mm2,
                    "j_thn_A_mm2": j_thn,
                    "k_bth": inp.k_bth,
                    "t_fault_s": t_fault_inst,
                },
                "substitution": (
                    f"({inp.cross_section_mm2} * {j_thn}) / "
                    f"({inp.k_bth} * sqrt({t_fault_inst}))"
                ),
                "result": {
                    "I_th_dop_A": round(i_th_dop, 1),
                    "I_max_thermal_A": round(i_max_thermal, 1),
                },
            }
        )

        # Condition 3: Sensitivity
        i_max_sensitivity = inp.ik3_min_beginning_a / inp.k_b
        trace.append(
            {
                "step": "Warunek czułości I>>",
                "formula": "I_{>>} < \\frac{I_{k,min,bus}}{k_b}",
                "inputs": {
                    "I_k_min_bus_A": inp.ik3_min_beginning_a,
                    "k_b": inp.k_b,
                },
                "substitution": f"{inp.ik3_min_beginning_a:.1f} / {inp.k_b}",
                "result": {"I_max_sensitivity_A": round(i_max_sensitivity, 1)},
            }
        )

        # Determine valid range and recommended setting
        range_valid = i_min_sel <= min(i_max_thermal, i_max_sensitivity)

        if range_valid:
            # Choose setting in the middle of valid range
            upper = min(i_max_thermal, i_max_sensitivity)
            i_setting = (i_min_sel + upper) / 2.0
        else:
            # No valid range — use selectivity minimum as best effort
            i_setting = i_min_sel

        trace.append(
            {
                "step": "Wyznaczenie nastawy I>>",
                "formula": "I_{min,sel} \\leq I_{>>} \\leq \\min(I_{max,th}, I_{max,cz})",
                "inputs": {
                    "I_min_selectivity_A": round(i_min_sel, 1),
                    "I_max_thermal_A": round(i_max_thermal, 1),
                    "I_max_sensitivity_A": round(i_max_sensitivity, 1),
                },
                "result": {
                    "I_setting_A": round(i_setting, 1),
                    "range_valid": range_valid,
                },
            }
        )

        notes: list[str] = []
        is_valid = range_valid

        if not range_valid:
            notes.append(
                f"Brak dopuszczalnego zakresu nastaw I>>: "
                f"I_min_sel = {i_min_sel:.0f} A > "
                f"min(I_max_th, I_max_cz) = "
                f"{min(i_max_thermal, i_max_sensitivity):.0f} A"
            )

        return InstantaneousSettings(
            i_setting_a=round(i_setting, 1),
            i_min_selectivity_a=round(i_min_sel, 1),
            i_max_thermal_a=round(i_max_thermal, 1),
            i_max_sensitivity_a=round(i_max_sensitivity, 1),
            range_valid=range_valid,
            k_b=inp.k_b,
            k_bth=inp.k_bth,
            is_valid=is_valid,
            validation_notes=notes,
            trace=trace,
        )

    @staticmethod
    def _check_thermal_withstand(
        inp: ProtectionSettingsInput,
    ) -> ThermalWithstandResult:
        """
        Check thermal withstand of cable/line.

        I_th_dop = s * j_thn / sqrt(t_k)
        """
        trace: list[dict[str, Any]] = []

        j_thn = THERMAL_DENSITY.get(inp.conductor_material, 94.0)

        # Total fault time = protection time + breaker time
        t_fault = inp.t_upstream_s + inp.delta_t_s + 0.07  # +70ms breaker
        if t_fault <= 0:
            t_fault = 0.1

        i_th_dop = inp.cross_section_mm2 * j_thn / math.sqrt(t_fault)

        trace.append(
            {
                "step": "Obliczenie dopuszczalnego prądu cieplnego",
                "formula": "I_{th,dop} = \\frac{s \\cdot j_{thn}}{\\sqrt{t_k}}",
                "inputs": {
                    "s_mm2": inp.cross_section_mm2,
                    "j_thn_A_mm2": j_thn,
                    "material": inp.conductor_material,
                    "t_fault_s": round(t_fault, 3),
                },
                "substitution": (f"{inp.cross_section_mm2} * {j_thn} / sqrt({t_fault:.3f})"),
                "result": {"I_th_dop_A": round(i_th_dop, 1)},
            }
        )

        ik_max = inp.ik3_max_beginning_a
        is_adequate = ik_max <= i_th_dop
        margin = ((i_th_dop - ik_max) / i_th_dop * 100) if i_th_dop > 0 else 0.0

        trace.append(
            {
                "step": "Sprawdzenie wytrzymałości cieplnej",
                "formula": "I_{k,max} \\leq I_{th,dop}",
                "inputs": {
                    "I_k_max_A": round(ik_max, 1),
                    "I_th_dop_A": round(i_th_dop, 1),
                },
                "result": {
                    "is_adequate": is_adequate,
                    "margin_percent": round(margin, 1),
                },
            }
        )

        return ThermalWithstandResult(
            i_th_dop_a=round(i_th_dop, 1),
            j_thn=j_thn,
            cross_section_mm2=inp.cross_section_mm2,
            t_fault_s=round(t_fault, 3),
            ik_max_a=round(ik_max, 1),
            is_adequate=is_adequate,
            margin_percent=round(margin, 1),
            trace=trace,
        )

    @staticmethod
    def _analyze_spz(
        inp: ProtectionSettingsInput,
        inst: InstantaneousSettings,
        thermal: ThermalWithstandResult,
    ) -> SPZAnalysisResult:
        """
        Analyze SPZ (auto-reclose) interaction with I>>.

        SPZ cycle: t_fault1 + t_pause + t_fault2
        Total thermal stress must not exceed cable rating.
        """
        trace: list[dict[str, Any]] = []

        if not inp.spz_enabled:
            return SPZAnalysisResult(
                spz_allowed=True,
                total_fault_time_s=0.0,
                i_th_required_a=0.0,
                i_th_available_a=thermal.i_th_dop_a,
                blocking_recommended=False,
                trace=[
                    {
                        "step": "SPZ wyłączone",
                        "result": {"spz_enabled": False},
                    }
                ],
            )

        # SPZ cycle: trip + pause + trip (if unsuccessful)
        t_trip = 0.05  # I>> instantaneous ~50ms
        t_total = t_trip + inp.spz_pause_s + t_trip

        trace.append(
            {
                "step": "Czas cyklu SPZ",
                "formula": "t_{total} = t_{trip} + t_{SPZ,pause} + t_{trip}",
                "inputs": {
                    "i_instantaneous_setting_a": inst.i_setting_a,
                    "t_trip_s": t_trip,
                    "t_spz_pause_s": inp.spz_pause_s,
                },
                "substitution": f"{t_trip} + {inp.spz_pause_s} + {t_trip}",
                "result": {"t_total_s": round(t_total, 3)},
            }
        )

        # Thermal stress during SPZ cycle
        j_thn = THERMAL_DENSITY.get(inp.conductor_material, 94.0)
        i_th_available = (
            inp.cross_section_mm2 * j_thn / math.sqrt(t_total) if t_total > 0 else float("inf")
        )
        i_th_required = inp.ik3_max_beginning_a

        spz_allowed = i_th_required <= i_th_available
        blocking_recommended = not spz_allowed

        trace.append(
            {
                "step": "Sprawdzenie wytrzymałości cieplnej w cyklu SPZ",
                "formula": "I_{k,max} \\leq \\frac{s \\cdot j_{thn}}{\\sqrt{t_{total}}}",
                "inputs": {
                    "I_k_max_A": round(i_th_required, 1),
                    "I_th_available_A": round(i_th_available, 1),
                    "I_instantaneous_setting_A": inst.i_setting_a,
                },
                "result": {
                    "spz_allowed": spz_allowed,
                    "blocking_recommended": blocking_recommended,
                },
            }
        )

        return SPZAnalysisResult(
            spz_allowed=spz_allowed,
            total_fault_time_s=round(t_total, 3),
            i_th_required_a=round(i_th_required, 1),
            i_th_available_a=round(i_th_available, 1),
            blocking_recommended=blocking_recommended,
            trace=trace,
        )

    @staticmethod
    def _check_local_generation(inp: ProtectionSettingsInput) -> LocalGenerationDiagnostic:
        """
        Rozszerzenie W3-C2: diagnostyka sieci z generacją lokalną (E-L).

        Porównanie wkładu systemu i E-L do prądu zwarcia 3F na początku chronionej
        linii (`ik3_max_beginning_a` — wynik solvera SC z kotwicy biegu). Wkład E-L
        jest wejściem JAWNYM (`lokalna_generacja_wklad_a`) — silnik nie liczy fizyki,
        tylko interpretuje różnicę. Ryzyko blokady ZSZ liczone WYŁĄCZNIE gdy próg
        udziału podany jawnie w wejściu; bez progu — `ryzyko_blokady_zsz = None`
        (NIEDOSTĘPNY), zero zgadywania (Zero-Debt / Zero fabrykacji).
        """
        trace: list[dict[str, Any]] = []

        if not inp.lokalna_generacja_aktywna:
            return LocalGenerationDiagnostic(
                aktywna=False,
                typ_zrodla=None,
                prad_widziany_lacznie_a=0.0,
                wklad_el_a=0.0,
                wklad_systemu_a=0.0,
                udzial_el=None,
                prog_udzialu_zsz=None,
                ryzyko_blokady_zsz=None,
                uwagi_pl=["Generacja lokalna (E-L) nieaktywna."],
                trace=[
                    {
                        "step": "Generacja lokalna nieaktywna",
                        "result": {"lokalna_generacja_aktywna": False},
                    }
                ],
            )

        prad_lacznie = inp.ik3_max_beginning_a
        wklad_el = inp.lokalna_generacja_wklad_a
        wklad_systemu = prad_lacznie - wklad_el
        udzial_el = wklad_el / prad_lacznie if prad_lacznie > 0 else None

        trace.append(
            {
                "step": "Rozkład wkładów prądu zwarciowego (system / E-L)",
                "formula": "I_{system} = I_{k3,max,poczatek} - I_{E-L}",
                "inputs": {
                    "ik3_max_beginning_a": round(prad_lacznie, 1),
                    "wklad_el_a": round(wklad_el, 1),
                },
                "substitution": f"{prad_lacznie:.1f} - {wklad_el:.1f}",
                "result": {
                    "wklad_systemu_a": round(wklad_systemu, 1),
                    "udzial_el": round(udzial_el, 4) if udzial_el is not None else None,
                },
            }
        )

        uwagi: list[str] = []
        prog_wejsciowy = inp.lokalna_generacja_prog_udzialu_zsz
        ryzyko: bool | None
        if prog_wejsciowy is None:
            ryzyko = None
            uwagi.append(
                "Ryzyko blokady ZSZ NIEDOSTĘPNE: brak jawnie podanego progu udziału E-L "
                "(lokalna_generacja_prog_udzialu_zsz) — silnik nie zgaduje progu bez "
                "nazwanego źródła."
            )
            trace.append(
                {
                    "step": "Ryzyko blokady ZSZ — brak progu wejściowego",
                    "result": {"ryzyko_blokady_zsz": None, "powod": "brak progu wejściowego"},
                }
            )
        elif udzial_el is None:
            ryzyko = None
            uwagi.append(
                "Ryzyko blokady ZSZ NIEDOSTĘPNE: prąd zwarciowy łącznie na początku linii "
                "jest niedodatni — udział E-L niewyznaczalny."
            )
            trace.append(
                {
                    "step": "Ryzyko blokady ZSZ — udział niewyznaczalny",
                    "result": {"ryzyko_blokady_zsz": None, "powod": "ik3_max_beginning_a <= 0"},
                }
            )
        else:
            ryzyko = udzial_el >= prog_wejsciowy
            if ryzyko:
                uwagi.append(
                    f"Wkład E-L stanowi {udzial_el*100:.1f}% prądu zwarciowego (próg "
                    f"{prog_wejsciowy*100:.1f}%) — ryzyko niepożądanej blokady ZSZ; rozważ "
                    "blokadę kierunkową i sprawdź nastawy ZSZ pod kątem wkładu od E-L."
                )
            else:
                uwagi.append(
                    f"Wkład E-L {udzial_el*100:.1f}% poniżej progu ryzyka blokady ZSZ "
                    f"({prog_wejsciowy*100:.1f}%)."
                )
            trace.append(
                {
                    "step": "Sprawdzenie ryzyka blokady ZSZ",
                    "formula": "ryzyko = (I_{E-L} / I_{lacznie}) \\geq prog_{ZSZ}",
                    "inputs": {"udzial_el": udzial_el, "prog_udzialu_zsz": prog_wejsciowy},
                    "result": {"ryzyko_blokady_zsz": ryzyko},
                }
            )

        if inp.lokalna_generacja_typ_zrodla == "SYNCHRONICZNE":
            uwagi.append(
                "Generator synchroniczny — znaczący wkład do prądów zwarciowych; "
                "uwzględnij wkład E-L w analizie czułości zabezpieczeń."
            )
        elif inp.lokalna_generacja_typ_zrodla == "FALOWNIKOWE":
            uwagi.append(
                "Źródło falownikowe — ograniczony wkład do prądów zwarciowych "
                "(typowo 1,1–1,5 In falownika)."
            )

        return LocalGenerationDiagnostic(
            aktywna=True,
            typ_zrodla=inp.lokalna_generacja_typ_zrodla,
            prad_widziany_lacznie_a=round(prad_lacznie, 1),
            wklad_el_a=round(wklad_el, 1),
            wklad_systemu_a=round(wklad_systemu, 1),
            udzial_el=round(udzial_el, 4) if udzial_el is not None else None,
            prog_udzialu_zsz=inp.lokalna_generacja_prog_udzialu_zsz,
            ryzyko_blokady_zsz=ryzyko,
            uwagi_pl=uwagi,
            trace=trace,
        )

    @staticmethod
    def _build_setting_window(
        inp: ProtectionSettingsInput, inst: InstantaneousSettings
    ) -> InstantaneousSettingWindow:
        """
        Rozszerzenie W3-C2: okno dopuszczalnych nastaw I>> z nazwanymi kryteriami.

        Nie liczy niczego od nowa — czyta WYŁĄCZNIE pola już policzone przez
        `_calculate_instantaneous` (`i_min_selectivity_a`, `i_max_thermal_a`,
        `i_max_sensitivity_a`, `range_valid`) — jedno źródło prawdy dla ważności
        okna, tak jak `InstantaneousSettings.is_valid` powyżej. Dodaje wyłącznie
        NAZWĘ kryterium granicznego, tekst konfliktu i rekomendacje — informacje,
        których dotychczasowy silnik nie ujawniał w osobnym, nazwanym bloku
        (karta W3-C2 §0.2 pkt 2, przeniesione z `line_overcurrent_setting/
        analyzer.py::_calculate_setting_window`/`_mark_window_conflict`/
        `_generate_recommendations`, dostosowane do parametrów Hoppla — bez
        przekładni CT, bez sugestii dotyczących `kc`, którego Hoppel nie ma).
        """
        trace: list[dict[str, Any]] = []

        i_min = inst.i_min_selectivity_a
        if inst.i_max_sensitivity_a <= inst.i_max_thermal_a:
            i_max = inst.i_max_sensitivity_a
            limiting_max = "sensitivity"
        else:
            i_max = inst.i_max_thermal_a
            limiting_max = "thermal"
        window_valid = inst.range_valid

        trace.append(
            {
                "step": "Nazwanie kryteriów granic okna I>>",
                "inputs": {
                    "i_min_selectivity_a": i_min,
                    "i_max_thermal_a": inst.i_max_thermal_a,
                    "i_max_sensitivity_a": inst.i_max_sensitivity_a,
                },
                "result": {
                    "i_min_a": round(i_min, 1),
                    "i_max_a": round(i_max, 1),
                    "limiting_criterion_max": limiting_max,
                    "window_valid": window_valid,
                },
            }
        )

        conflict_pl: str | None = None
        recommendations: list[str] = []

        if not window_valid:
            deficit = i_min - i_max
            limiting_pl = "czułość" if limiting_max == "sensitivity" else "wytrzymałość cieplna"
            conflict_pl = (
                f"Konflikt kryteriów: dolna granica {i_min/1000:.2f} kA (selektywność) "
                f"przewyższa górną {i_max/1000:.2f} kA ({limiting_pl}) o "
                f"{deficit/1000:.2f} kA — żadna nastawa I>> nie spełnia obu warunków "
                "jednocześnie."
            )
            recommendations.append(
                f"Okno nastaw jest sprzeczne (I_min = {i_min/1000:.2f} kA > "
                f"I_max = {i_max/1000:.2f} kA)."
            )
            if limiting_max == "sensitivity":
                recommendations.append(
                    "Możliwe rozwiązania: obniż współczynnik k_b, zwiększ zapas wobec "
                    "kolejnej strefy selektywności, lub przenieś punkt kolejnego "
                    "zabezpieczenia (next_bus_id)."
                )
            else:
                recommendations.append(
                    "Możliwe rozwiązania: zwiększ przekrój przewodu, skróć czas "
                    "zadziałania zabezpieczenia (delta_t_s / t_upstream_s), lub "
                    "wyłącz SPZ."
                )
            trace.append(
                {
                    "step": "Konflikt okna nastaw I>>",
                    "inputs": {"i_min_a": round(i_min, 1), "i_max_a": round(i_max, 1)},
                    "outputs": {
                        "deficit_a": round(deficit, 1),
                        "limiting_criterion_max": limiting_max,
                        "notes_pl": conflict_pl,
                    },
                }
            )
        else:
            recommendations.append(
                f"Zalecana nastawa I>>: {inst.i_setting_a:.1f} A (środek okna "
                f"[{i_min:.1f}, {i_max:.1f}] A)."
            )

        return InstantaneousSettingWindow(
            i_min_a=round(i_min, 1),
            i_max_a=round(i_max, 1),
            limiting_criterion_min="selectivity",
            limiting_criterion_max=limiting_max,
            window_valid=window_valid,
            conflict_pl=conflict_pl,
            recommendations_pl=recommendations,
            trace=trace,
        )

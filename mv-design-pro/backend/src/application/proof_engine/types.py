"""
Proof Engine Types — Kanoniczne struktury danych P11.1a

STATUS: CANONICAL & BINDING
Reference: PROOF_SCHEMAS.md, P11_1a_MVP_SC3F_AND_VDROP.md
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4


class ProofType(StrEnum):
    """Typ dowodu matematycznego."""

    SC3F_IEC60909 = "SC3F_IEC60909"
    VDROP = "VDROP"
    LOAD_FLOW_VOLTAGE = "LOAD_FLOW_VOLTAGE"
    SC1F_IEC60909 = "SC1F_IEC60909"
    SC2F_IEC60909 = "SC2F_IEC60909"
    SC2FG_IEC60909 = "SC2FG_IEC60909"
    Q_U_REGULATION = "Q_U_REGULATION"
    EQUIPMENT_PROOF = "EQUIPMENT_PROOF"
    LOAD_CURRENTS_OVERLOAD = "LOAD_CURRENTS_OVERLOAD"
    LOSSES_ENERGY = "LOSSES_ENERGY"
    PROTECTION_OVERCURRENT = "PROTECTION_OVERCURRENT"
    EARTHING_GROUND_FAULT_SN = "EARTHING_GROUND_FAULT_SN"
    # Phase 4: rozszerzenie audytu 2 (eng.10/13/15/17/18/20 + B.1/B.5).
    AUDIT2_BESS_OPERATION_MODES = "AUDIT2_BESS_OPERATION_MODES"
    AUDIT2_TAP_CHANGER_PLAN = "AUDIT2_TAP_CHANGER_PLAN"
    AUDIT2_HOSTING_CAPACITY_EXPORT = "AUDIT2_HOSTING_CAPACITY_EXPORT"
    AUDIT2_DEVICE_WITHSTAND = "AUDIT2_DEVICE_WITHSTAND"
    AUDIT2_VT_GROUNDING_VALIDATION = "AUDIT2_VT_GROUNDING_VALIDATION"
    # Karta P0.10 (nN): pakiet dowodowy weryfikacji obwodu nN (10 kroków, G-21).
    LV_CIRCUIT_VERIFICATION = "LV_CIRCUIT_VERIFICATION"


class LoadElementKind(StrEnum):
    """Rodzaj elementu dla P15: LINE, CABLE, TRANSFORMER."""

    LINE = "LINE"
    CABLE = "CABLE"
    TRANSFORMER = "TRANSFORMER"


class LossesEnergyTargetKind(StrEnum):
    """Rodzaj elementu dla P17: LINE, CABLE, TRANSFORMER, AGGREGATE."""

    LINE = "LINE"
    CABLE = "CABLE"
    TRANSFORMER = "TRANSFORMER"
    AGGREGATE = "AGGREGATE"


# =============================================================================
# Semantic Aliases — P11.1e
# =============================================================================


@dataclass(frozen=True)
class SemanticAlias:
    """
    Alias semantyczny dla doboru aparatury.

    Mapuje klucz wynikowy na polski termin techniczny.
    Używane przez Inspector do prezentacji wyników.

    Attributes:
        alias_pl: Polski termin techniczny (np. "prąd wyłączalny")
        target_key: Klucz w key_results (np. "ikss_ka")
        notes: Opcjonalne notatki
    """

    alias_pl: str
    target_key: str
    notes: str = ""


# Kanoniczne aliasy semantyczne dla doboru aparatury (BINDING)
# Mapowanie: target_key -> SemanticAlias
SEMANTIC_ALIASES: dict[str, SemanticAlias] = {
    "ikss_ka": SemanticAlias(
        alias_pl="prąd wyłączalny",
        target_key="ikss_ka",
        notes="I_k'' wg IEC 60909",
    ),
    "ip_ka": SemanticAlias(
        alias_pl="prąd udarowy",
        target_key="ip_ka",
        notes="i_p wg IEC 60909",
    ),
    "ith_ka": SemanticAlias(
        alias_pl="prąd cieplny",
        target_key="ith_ka",
        notes="I_th wg IEC 60909",
    ),
    "idyn_ka": SemanticAlias(
        alias_pl="prąd dynamiczny",
        target_key="idyn_ka",
        notes="I_dyn; jeśli brak, używa ip_ka jako proxy (BINDING: I_dyn = i_p)",
    ),
    "sk_mva": SemanticAlias(
        alias_pl="moc zwarciowa",
        target_key="sk_mva",
        notes="S_k'' wg IEC 60909",
    ),
    "breaking_ok": SemanticAlias(
        alias_pl="wyłączalność",
        target_key="breaking_ok",
        notes="Warunek I_k'' ≤ I_cu",
    ),
    "dynamic_ok": SemanticAlias(
        alias_pl="warunek dynamiczny",
        target_key="dynamic_ok",
        notes="Warunek i_p ≤ I_dyn",
    ),
    "thermal_ok": SemanticAlias(
        alias_pl="warunek cieplny",
        target_key="thermal_ok",
        notes="Warunek ∫i²dt ≤ I_th",
    ),
    "selectivity_ok": SemanticAlias(
        alias_pl="selektywność",
        target_key="selectivity_ok",
        notes="Porównanie granic charakterystyk",
    ),
}


@dataclass(frozen=True)
class SymbolDefinition:
    """
    Definicja symbolu matematycznego.

    Attributes:
        symbol: Symbol matematyczny w notacji LaTeX (np. "I_k''")
        unit: Jednostka SI lub '—' dla wielkości bezwymiarowych
        description_pl: Opis po polsku
        mapping_key: Literalny klucz w intermediate_values lub output_results
    """

    symbol: str
    unit: str
    description_pl: str
    mapping_key: str

    def to_dict(self) -> dict[str, str]:
        return {
            "symbol": self.symbol,
            "unit": self.unit,
            "description_pl": self.description_pl,
            "mapping_key": self.mapping_key,
        }


@dataclass(frozen=True)
class EquationDefinition:
    """
    Definicja równania z rejestru równań.

    Attributes:
        equation_id: Unikalny identyfikator równania (np. "EQ_SC3F_004")
        latex: Wzór w notacji LaTeX
        name_pl: Nazwa równania po polsku
        standard_ref: Odniesienie do normy
        symbols: Lista symboli użytych w równaniu
        unit_derivation: Ścieżka derywacji jednostek
        notes: Opcjonalne notatki
    """

    equation_id: str
    latex: str
    name_pl: str
    standard_ref: str
    symbols: tuple[SymbolDefinition, ...]
    unit_derivation: str = ""
    notes: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "equation_id": self.equation_id,
            "latex": self.latex,
            "name_pl": self.name_pl,
            "standard_ref": self.standard_ref,
            "symbols": [s.to_dict() for s in self.symbols],
            "unit_derivation": self.unit_derivation,
            "notes": self.notes,
        }

    def get_symbol_by_mapping_key(self, mapping_key: str) -> SymbolDefinition | None:
        """Zwraca definicję symbolu dla danego mapping_key."""
        for sym in self.symbols:
            if sym.mapping_key == mapping_key:
                return sym
        return None

    def get_result_symbol(self) -> SymbolDefinition | None:
        """Zwraca pierwszy symbol jako wynik (zazwyczaj lewa strona równania)."""
        return self.symbols[0] if self.symbols else None


@dataclass(frozen=True)
class ProofValue:
    """
    Wartość z jednostką i formatowaniem.

    Attributes:
        symbol: Symbol matematyczny (np. "I_k''")
        value: Wartość numeryczna
        unit: Jednostka (np. "kA")
        formatted: Sformatowana wartość (np. "12.45 kA")
        source_key: Klucz w trace/result (np. "ikss_ka")
    """

    symbol: str
    value: float | complex | str
    unit: str
    formatted: str
    source_key: str

    def to_dict(self) -> dict[str, Any]:
        val = self.value
        if isinstance(val, complex):
            val = f"{val.real:.4f}+j{val.imag:.4f}"
        return {
            "symbol": self.symbol,
            "value": val,
            "unit": self.unit,
            "formatted": self.formatted,
            "source_key": self.source_key,
        }

    @staticmethod
    def format_value(
        value: float | complex,
        unit: str,
        precision: int = 4,
    ) -> str:
        """
        Formatuje wartość z jednostką.

        Args:
            value: Wartość do sformatowania
            unit: Jednostka
            precision: Liczba miejsc znaczących

        Returns:
            Sformatowany string (np. "4.620 kA")
        """
        if isinstance(value, complex):
            r = value.real
            i = value.imag
            sign = "+" if i >= 0 else ""
            return f"{r:.{precision}f}{sign}j{i:.{precision}f} {unit}".strip()
        elif isinstance(value, int | float):
            return f"{value:.{precision}f} {unit}".strip()
        return f"{value} {unit}".strip()

    @classmethod
    def create(
        cls,
        symbol: str,
        value: float | complex,
        unit: str,
        source_key: str,
        precision: int = 4,
    ) -> ProofValue:
        """Factory method tworzący ProofValue z automatycznym formatowaniem."""
        formatted = cls.format_value(value, unit, precision)
        return cls(
            symbol=symbol,
            value=value,
            unit=unit,
            formatted=formatted,
            source_key=source_key,
        )


@dataclass(frozen=True)
class UnitCheckResult:
    """
    Wynik weryfikacji spójności jednostek.

    Attributes:
        passed: Czy weryfikacja jednostek przeszła pomyślnie
        expected_unit: Oczekiwana jednostka wyniku
        computed_unit: Jednostka obliczona z jednostek wejściowych
        input_units: Jednostki wartości wejściowych
        derivation: Ścieżka derywacji jednostek (np. "kV / Ω = kA")
    """

    passed: bool
    expected_unit: str
    computed_unit: str
    input_units: dict[str, str] = field(default_factory=dict)
    derivation: str = ""

    def __hash__(self) -> int:
        return hash(
            (
                self.passed,
                self.expected_unit,
                self.computed_unit,
                tuple(sorted(self.input_units.items())),
                self.derivation,
            )
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "expected_unit": self.expected_unit,
            "computed_unit": self.computed_unit,
            "input_units": dict(sorted(self.input_units.items())),
            "derivation": self.derivation,
        }


@dataclass(frozen=True)
class ProofStep:
    """
    Pojedynczy krok w łańcuchu dowodowym.

    Format: Wzór → Dane → Podstawienie → Wynik → Weryfikacja jednostek

    Attributes:
        step_id: Unikalny identyfikator kroku (np. "SC3F_STEP_004")
        step_number: Numer porządkowy (1, 2, 3, ...)
        title_pl: Tytuł kroku po polsku
        equation: Definicja równania z rejestru
        input_values: Wartości wejściowe do podstawienia
        substitution_latex: Wzór z podstawionymi wartościami (LaTeX)
        result: Wynik obliczenia
        unit_check: Wynik weryfikacji jednostek
        source_keys: Mapping: symbol → klucz w trace/result
    """

    step_id: str
    step_number: int
    title_pl: str
    equation: EquationDefinition
    input_values: tuple[ProofValue, ...]
    substitution_latex: str
    result: ProofValue
    unit_check: UnitCheckResult
    source_keys: dict[str, str] = field(default_factory=dict)

    def __hash__(self) -> int:
        return hash(
            (
                self.step_id,
                self.step_number,
                self.title_pl,
                self.equation,
                self.input_values,
                self.substitution_latex,
                self.result,
                self.unit_check,
                tuple(sorted(self.source_keys.items())),
            )
        )

    def to_dict(self) -> dict[str, Any]:
        # Sortowanie input_values alfabetycznie po symbol (determinizm)
        sorted_inputs = sorted(self.input_values, key=lambda x: x.symbol)
        return {
            "step_id": self.step_id,
            "step_number": self.step_number,
            "title_pl": self.title_pl,
            "equation": self.equation.to_dict(),
            "input_values": [v.to_dict() for v in sorted_inputs],
            "substitution_latex": self.substitution_latex,
            "result": self.result.to_dict(),
            "unit_check": self.unit_check.to_dict(),
            "source_keys": dict(sorted(self.source_keys.items())),
        }

    @staticmethod
    def generate_step_id(proof_type: str, step_number: int) -> str:
        """Generuje stabilne ID kroku."""
        return f"{proof_type}_STEP_{step_number:03d}"


@dataclass(frozen=True)
class ProofHeader:
    """
    Nagłówek dokumentu dowodowego.

    Attributes:
        project_name: Nazwa projektu
        case_name: Nazwa przypadku obliczeniowego
        run_timestamp: Czas uruchomienia
        solver_version: Wersja solvera
        target_id: Identyfikator elementu (np. LINE/TR)
        element_kind: Rodzaj elementu (LINE/CABLE/TRANSFORMER)
        fault_location: Lokalizacja zwarcia (dla SC)
        fault_type: Typ zwarcia (dla SC)
        voltage_factor: Współczynnik napięciowy (dla SC)
        source_bus: Szyna źródłowa (dla VDROP)
        target_bus: Szyna docelowa (dla VDROP)
    """

    project_name: str
    case_name: str
    run_timestamp: datetime
    solver_version: str
    target_id: str | None = None
    element_kind: str | None = None
    fault_location: str | None = None
    fault_type: str | None = None
    voltage_factor: float | None = None
    source_bus: str | None = None
    target_bus: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "project_name": self.project_name,
            "case_name": self.case_name,
            "run_timestamp": self.run_timestamp.isoformat(),
            "solver_version": self.solver_version,
            "target_id": self.target_id,
            "element_kind": self.element_kind,
            "fault_location": self.fault_location,
            "fault_type": self.fault_type,
            "voltage_factor": self.voltage_factor,
            "source_bus": self.source_bus,
            "target_bus": self.target_bus,
        }


@dataclass(frozen=True)
class ProofSummary:
    """
    Podsumowanie wyników dowodu.

    Attributes:
        key_results: Główne wyniki z jednostkami
        unit_check_passed: Czy wszystkie jednostki OK
        total_steps: Liczba kroków dowodu
        warnings: Ostrzeżenia (jeśli są)
        counterfactual_diff: Różnice A vs B (jeśli dotyczy)
    """

    key_results: dict[str, ProofValue]
    unit_check_passed: bool
    total_steps: int
    warnings: tuple[str, ...] = ()
    overall_status: str | None = None
    failed_checks: tuple[str, ...] = ()
    counterfactual_diff: dict[str, ProofValue] = field(default_factory=dict)

    def __hash__(self) -> int:
        return hash(
            (
                tuple(sorted((k, v) for k, v in self.key_results.items())),
                self.unit_check_passed,
                self.total_steps,
                self.warnings,
                self.overall_status,
                self.failed_checks,
                tuple(sorted((k, v) for k, v in self.counterfactual_diff.items())),
            )
        )

    def to_dict(self) -> dict[str, Any]:
        # Sortowanie key_results alfabetycznie (determinizm)
        sorted_results = dict(sorted(self.key_results.items()))
        sorted_counterfactual = dict(sorted(self.counterfactual_diff.items()))
        return {
            "key_results": {k: v.to_dict() for k, v in sorted_results.items()},
            "unit_check_passed": self.unit_check_passed,
            "total_steps": self.total_steps,
            "warnings": list(self.warnings),
            "overall_status": self.overall_status,
            "failed_checks": list(self.failed_checks),
            "counterfactual_diff": {k: v.to_dict() for k, v in sorted_counterfactual.items()},
        }


@dataclass(frozen=True)
class ProofDocument:
    """
    Dokument dowodowy dla pojedynczego uruchomienia solvera.

    Attributes:
        document_id: Unikalny identyfikator dokumentu
        artifact_id: Powiązanie z TraceArtifact
        created_at: Data i czas utworzenia
        proof_type: Typ dowodu
        title_pl: Tytuł dokumentu po polsku
        header: Nagłówek dokumentu
        steps: Lista kroków dowodu
        summary: Podsumowanie wyników
    """

    document_id: UUID
    artifact_id: UUID
    created_at: datetime
    proof_type: ProofType
    title_pl: str
    header: ProofHeader
    steps: tuple[ProofStep, ...]
    summary: ProofSummary

    @property
    def json_representation(self) -> str:
        """Zwraca pełną serializację JSON (deterministyczną)."""
        return json.dumps(self.to_dict(), ensure_ascii=False, indent=2, sort_keys=True)

    @property
    def latex_representation(self) -> str:
        """Zwraca kod LaTeX dokumentu."""
        from application.proof_engine.latex_renderer import LaTeXRenderer

        return LaTeXRenderer.render(self)

    def to_dict(self) -> dict[str, Any]:
        # Sortowanie kroków po step_number (determinizm)
        sorted_steps = sorted(self.steps, key=lambda x: x.step_number)
        return {
            "document_id": str(self.document_id),
            "artifact_id": str(self.artifact_id),
            "created_at": self.created_at.isoformat(),
            "proof_type": self.proof_type.value,
            "title_pl": self.title_pl,
            "header": self.header.to_dict(),
            "steps": [s.to_dict() for s in sorted_steps],
            "summary": self.summary.to_dict(),
        }

    @staticmethod
    def create(
        artifact_id: UUID,
        proof_type: ProofType,
        title_pl: str,
        header: ProofHeader,
        steps: list[ProofStep],
        summary: ProofSummary,
    ) -> ProofDocument:
        """Factory method tworzący ProofDocument z automatycznymi ID i timestamp."""
        return ProofDocument(
            document_id=uuid4(),
            artifact_id=artifact_id,
            created_at=datetime.utcnow(),
            proof_type=proof_type,
            title_pl=title_pl,
            header=header,
            steps=tuple(sorted(steps, key=lambda x: x.step_number)),
            summary=summary,
        )


# =============================================================================
# Q(U) Regulation Input Types — P11.1b
# =============================================================================


@dataclass
class QUInput:
    """
    Dane wejściowe dla generatora dowodu Q(U).

    Attributes:
        project_name: Nazwa projektu
        case_name: Nazwa przypadku obliczeniowego
        run_timestamp: Czas uruchomienia
        u_meas_kv: Napięcie zmierzone [kV]
        u_ref_kv: Napięcie referencyjne [kV]
        u_dead_kv: Szerokość martwej strefy [kV]
        k_q_mvar_per_kv: Współczynnik regulacji Q(U) [Mvar/kV]
        q_min_mvar: Minimalna moc bierna [Mvar]
        q_max_mvar: Maksymalna moc bierna [Mvar]

        # P11.1c: Opcjonalne wyniki VDROP (LINK-ONLY, bez nowych obliczeń)
        vdrop_delta_u_x_percent: Składowa bierna spadku napięcia [%] (z VDROP)
        vdrop_delta_u_percent: Całkowity spadek napięcia [%] (z VDROP)
        vdrop_u_kv: Napięcie w punkcie [kV] (z VDROP)
    """

    project_name: str
    case_name: str
    run_timestamp: datetime
    u_meas_kv: float
    u_ref_kv: float
    u_dead_kv: float
    k_q_mvar_per_kv: float
    q_min_mvar: float
    q_max_mvar: float

    # P11.1c: Opcjonalne wyniki VDROP dla linku Q_cmd → U
    vdrop_delta_u_x_percent: float | None = None
    vdrop_delta_u_percent: float | None = None
    vdrop_u_kv: float | None = None


@dataclass
class QUCounterfactualInput:
    """
    Dane wejściowe dla porównania counterfactual A vs B.

    Attributes:
        a: Dane scenariusza A
        b: Dane scenariusza B
    """

    a: QUInput
    b: QUInput


# =============================================================================
# Load Currents & Overload Input Types — P15
# =============================================================================


@dataclass
class LoadCurrentsInput:
    """
    Dane wejściowe dla dowodu P15: Prądy robocze i przeciążenia.

    Attributes:
        project_name: Nazwa projektu
        case_name: Nazwa przypadku obliczeniowego
        run_timestamp: Czas uruchomienia
        target_id: Identyfikator elementu (linia/kabel/transformator)
        u_ll_kv: Napięcie międzyfazowe [kV]
        p_mw: Moc czynna [MW]
        q_mvar: Moc bierna [Mvar]
        in_a: Prąd znamionowy [A] (wymagany dla LINE/CABLE)
        sn_mva: Moc znamionowa [MVA] (wymagana dla TRANSFORMER)
        element_kind: LINE | CABLE | TRANSFORMER
    """

    project_name: str
    case_name: str
    run_timestamp: datetime
    target_id: str
    u_ll_kv: float
    p_mw: float
    q_mvar: float
    in_a: float | None
    sn_mva: float | None
    element_kind: LoadElementKind


@dataclass
class LoadCurrentsCounterfactualInput:
    """
    Dane wejściowe dla porównania A vs B (P15).

    Attributes:
        a: Dane scenariusza A
        b: Dane scenariusza B
    """

    a: LoadCurrentsInput
    b: LoadCurrentsInput


# =============================================================================
# Losses Energy Profile Input Types — P17
# =============================================================================


@dataclass
class EnergyProfilePoint:
    """
    Punkt profilu energii strat.

    Attributes:
        t_h: Czas w godzinach od startu (mapping_key: t_h)
        p_loss_kw: Moc strat w kW (mapping_key: p_loss_kw)
    """

    t_h: float = field(metadata={"mapping_key": "t_h"})
    p_loss_kw: float = field(metadata={"mapping_key": "p_loss_kw"})


@dataclass
class LossesEnergyInput:
    """
    Dane wejściowe dla dowodu P17: Energia strat (profil czasowy).

    Attributes:
        project_name: Nazwa projektu (mapping_key: project_name)
        case_name: Nazwa przypadku obliczeniowego (mapping_key: case_name)
        run_timestamp: Czas uruchomienia (mapping_key: run_timestamp)
        solver_version: Wersja solvera (mapping_key: solver_version)
        target_kind: LINE | CABLE | TRANSFORMER | AGGREGATE (mapping_key: target_kind)
        target_id: Identyfikator elementu (mapping_key: target_id)
        points: Punkty profilu (mapping_key: points)
        p_loss_const_kw: Moc strat stała (mapping_key: p_loss_kw)
        duration_h: Czas trwania (mapping_key: t_h)
    """

    project_name: str = field(metadata={"mapping_key": "project_name"})
    case_name: str = field(metadata={"mapping_key": "case_name"})
    run_timestamp: datetime = field(metadata={"mapping_key": "run_timestamp"})
    solver_version: str = field(metadata={"mapping_key": "solver_version"})
    target_kind: LossesEnergyTargetKind = field(metadata={"mapping_key": "target_kind"})
    target_id: str = field(metadata={"mapping_key": "target_id"})
    points: list[EnergyProfilePoint] = field(
        default_factory=list, metadata={"mapping_key": "points"}
    )
    p_loss_const_kw: float | None = field(default=None, metadata={"mapping_key": "p_loss_kw"})
    duration_h: float | None = field(default=None, metadata={"mapping_key": "t_h"})


# =============================================================================
# Earthing / Ground Fault Input Types — P19
# =============================================================================


@dataclass
class EarthingGroundFaultInput:
    """
    Dane wejściowe dla dowodu P19: Doziemienia / uziemienia SN.

    Attributes:
        project_name: Nazwa projektu
        case_name: Nazwa przypadku obliczeniowego
        run_timestamp: Czas uruchomienia
        solver_version: Wersja solvera / źródła danych
        fault_location: Lokalizacja zwarcia (opcjonalnie)
        fault_type: Typ zwarcia (np. 1F-Z) (opcjonalnie)
        earthing_mode: Opisowy tryb uziemienia (np. rezystor/cewka/izolowana)
        u0_v: Napięcie zerowe U_0 [V]
        z_e_ohm: Impedancja uziemienia Z_E [Ω]
        i_u_a: Prąd przez uziom I_u [A]
        i_p_a: Prąd przez pozostałe ścieżki I_p [A]
        r_u_ohm: Rezystancja uziemienia stanowiska R_u [Ω]
    """

    project_name: str
    case_name: str
    run_timestamp: datetime
    solver_version: str
    fault_location: str | None = None
    fault_type: str | None = None
    earthing_mode: str | None = None
    u0_v: float | None = None
    z_e_ohm: float | None = None
    i_u_a: float | None = None
    i_p_a: float | None = None
    r_u_ohm: float | None = None


# =============================================================================
# Protection Overcurrent & Selectivity Input Types — P18
# =============================================================================


@dataclass
class ProtectionSelectivityInput:
    """
    Dane wejściowe dla selektywności (analitycznej).

    Attributes:
        current_ka: Prąd odniesienia do porównań charakterystyk [kA]
        downstream_device_id: Identyfikator zabezpieczenia dolnego stopnia
        upstream_device_id: Identyfikator zabezpieczenia górnego stopnia
        downstream_max_s: Maksymalny czas wyłączenia zabezpieczenia dolnego [s]
        upstream_min_s: Minimalny czas wyłączenia zabezpieczenia górnego [s]
        margin_s: Margines czasowy selektywności [s]
    """

    current_ka: float | None
    downstream_device_id: str | None
    upstream_device_id: str | None
    downstream_max_s: float | None
    upstream_min_s: float | None
    margin_s: float = 0.0


@dataclass
class ProtectionProofInput:
    """
    Dane wejściowe dla dowodu P18: zabezpieczenia nadprądowe i selektywność.

    Attributes:
        project_name: Nazwa projektu
        case_name: Nazwa przypadku obliczeniowego
        run_timestamp: Czas uruchomienia
        target_id: Identyfikator urządzenia/zabezpieczenia
        device_id: Identyfikator zabezpieczenia (opcjonalnie)

        # P11: wyniki zwarciowe
        ikss_ka: Prąd początkowy I_k'' [kA]
        ip_ka: Prąd udarowy i_p [kA]
        ith_ka: Prąd cieplny równoważny I_th [kA]
        tk_s: Czas trwania zwarcia t_k [s]
        i2t_ka2s: Energia zwarcia ∫i²dt [kA²s] (opcjonalnie)

        # Dane katalogowe zabezpieczenia
        icu_ka: Zdolność wyłączalna I_cu [kA]
        idyn_ka: Wytrzymałość dynamiczna I_dyn [kA]
        ith_device_ka: Wytrzymałość cieplna I_th [kA] (opcjonalnie)
        t_th_s: Czas odniesienia dla I_th [s] (opcjonalnie)
        ith_limit_ka2s: Wytrzymałość cieplna w postaci I²t [kA²s] (opcjonalnie)

        # Selektywność (opcjonalnie)
        selectivity: Dane selektywności (graniczne)
    """

    project_name: str
    case_name: str
    run_timestamp: datetime
    target_id: str
    device_id: str | None = None
    ikss_ka: float | None = None
    ip_ka: float | None = None
    ith_ka: float | None = None
    tk_s: float | None = None
    i2t_ka2s: float | None = None
    icu_ka: float | None = None
    idyn_ka: float | None = None
    ith_device_ka: float | None = None
    t_th_s: float | None = None
    ith_limit_ka2s: float | None = None
    selectivity: ProtectionSelectivityInput | None = None

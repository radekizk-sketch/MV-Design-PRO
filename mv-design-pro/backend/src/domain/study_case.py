"""
Study Case Domain Model — P10 FULL MAX

CANONICAL ALIGNMENT:
- P10 FULL MAX: Study Cases / Variants (industrial-grade)
- StudyCase = configuration entity, NOT domain entity
- One Project = One NetworkModel (invariant)
- Case NEVER mutates NetworkModel

STATUS WYNIKOW NIE JEST TU PRZECHOWYWANY (CV-2-W). Przypadek nie niesie juz pola
`result_status` ani `result_refs`: status wynikow (NONE / FRESH / OUTDATED) jest
FUNKCJA biegow przypadku i biezacej rewizji modelu, liczona w jednym miejscu
(`application/result_freshness.status_wynikow_przypadku`, wolane przez
`application/study_case/status_wynikow.py`). Dopoki status byl POLEM, kazda
sciezka mutujaca model musiala pamietac o wywolaniu „uniewazniacza” — a gdy
ktoras zapomniala (dispatcher operacji domenowych, kreator, zmiana typu
katalogowego), przypadek pokazywal „aktualne” przy modelu, ktory pojechal dalej.
Stan, ktorego nikt nie utrzymuje, nie moze sklamac.

Kolumna `study_cases.result_status` i `study_cases.result_refs_jsonb` zostaja w
bazie jako DANE ZASTANE (archiwum projektu przenosi je 1:1), ale zaden kod ich
juz nie czyta ani nie pisze — pilnuje tego `scripts/result_status_writer_guard.py`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4


@dataclass(frozen=True)
class StudyCaseConfig:
    """
    Study case calculation configuration.

    Contains ONLY calculation parameters, NOT network topology.
    Immutable — changes create new config instances.
    """

    # Short-circuit analysis parameters
    c_factor_max: float = 1.10  # Voltage factor for max short-circuit (IEC 60909)
    c_factor_min: float = 0.95  # Voltage factor for min short-circuit

    # Power flow parameters
    base_mva: float = 100.0  # Base MVA for per-unit calculations
    max_iterations: int = 50  # Max Newton-Raphson iterations
    tolerance: float = 1e-6  # Convergence tolerance

    # Analysis options
    include_motor_contribution: bool = True
    include_inverter_contribution: bool = True
    thermal_time_seconds: float = 1.0  # Time for thermal current calculation

    # Operator profile (NC RfG / IRiESD per OSD)
    # Determines: FRT curves, Q-U envelope, cos φ(P) profile, ramp rate, dead band,
    # frequency response thresholds. Loaded from backend/src/catalog/profiles/nc_rfg/
    # {operator_profile_id}.yaml. Supported: pse | energa | tauron | enea | pge.
    # Default: "enea" — per /goal V12K (ENEA Operator pierwszy w priorytecie).
    operator_profile_id: str = "enea"

    # SC input mode (PLAN_E2E_INDUSTRIAL § 3.9 K3 + ENGINEER_WORKFLOW_AUDIT § 3.1)
    # "simplified" — projektant podaje tylko S″k_SN po stronie SN [MVA] + R/X
    #                (wystarczające dla typowego projektu SN, IEC 60909).
    # "advanced" — pełny model 110 kV + TR + GPZ z impedancjami (jak dotychczas).
    # Default: "simplified" — uproszczona ścieżka dla typowego projektu.
    sc_input_mode: str = "simplified"

    # Simplified mode fields (used when sc_input_mode == "simplified").
    # Pomijane w trybie "advanced" — solver używa modelu pełnego z NetworkGraph.
    sc_simplified_sk_mva: float | None = None  # S″k po stronie SN [MVA]
    sc_simplified_r_x_ratio: float = 0.1  # R/X stosunek po stronie SN (domyślnie 0.1)

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary for storage."""
        return {
            "c_factor_max": self.c_factor_max,
            "c_factor_min": self.c_factor_min,
            "base_mva": self.base_mva,
            "max_iterations": self.max_iterations,
            "tolerance": self.tolerance,
            "include_motor_contribution": self.include_motor_contribution,
            "include_inverter_contribution": self.include_inverter_contribution,
            "thermal_time_seconds": self.thermal_time_seconds,
            "operator_profile_id": self.operator_profile_id,
            "sc_input_mode": self.sc_input_mode,
            "sc_simplified_sk_mva": self.sc_simplified_sk_mva,
            "sc_simplified_r_x_ratio": self.sc_simplified_r_x_ratio,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> StudyCaseConfig:
        """Deserialize from dictionary."""
        return cls(
            c_factor_max=data.get("c_factor_max", 1.10),
            c_factor_min=data.get("c_factor_min", 0.95),
            base_mva=data.get("base_mva", 100.0),
            max_iterations=data.get("max_iterations", 50),
            tolerance=data.get("tolerance", 1e-6),
            include_motor_contribution=data.get("include_motor_contribution", True),
            include_inverter_contribution=data.get("include_inverter_contribution", True),
            thermal_time_seconds=data.get("thermal_time_seconds", 1.0),
            operator_profile_id=data.get("operator_profile_id", "enea"),
            sc_input_mode=data.get("sc_input_mode", "simplified"),
            sc_simplified_sk_mva=data.get("sc_simplified_sk_mva"),
            sc_simplified_r_x_ratio=data.get("sc_simplified_r_x_ratio", 0.1),
        )


@dataclass(frozen=True)
class ProtectionConfig:
    """
    Protection configuration for study case (P14c).

    Contains reference to ProtectionSettingTemplate and optional overrides.
    NO calculations, NO solver logic - just configuration data.

    INVARIANTS:
    - Case stores reference (template_ref + fingerprint), NOT copied data
    - Overrides are optional (values + units)
    - library_manifest_ref tracks source library for auditability
    - bound_at is timestamp when template was bound to case

    Attributes:
        template_ref: ID of ProtectionSettingTemplate from catalog.
        template_fingerprint: Fingerprint of the template at bind time (for audit).
        library_manifest_ref: Reference to library manifest (library_id + revision).
        overrides: Optional overrides for setting fields (dict[field_name, value]).
        bound_at: Timestamp when template was bound to this case.
    """

    template_ref: str | None = None
    template_fingerprint: str | None = None
    library_manifest_ref: dict[str, Any] | None = None
    overrides: dict[str, Any] = field(default_factory=dict)
    bound_at: datetime | None = None

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary for storage."""
        return {
            "template_ref": self.template_ref,
            "template_fingerprint": self.template_fingerprint,
            "library_manifest_ref": self.library_manifest_ref,
            "overrides": self.overrides or {},
            "bound_at": self.bound_at.isoformat() if self.bound_at else None,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ProtectionConfig:
        """Deserialize from dictionary."""
        return cls(
            template_ref=data.get("template_ref"),
            template_fingerprint=data.get("template_fingerprint"),
            library_manifest_ref=data.get("library_manifest_ref"),
            overrides=data.get("overrides") or {},
            bound_at=datetime.fromisoformat(data["bound_at"]) if data.get("bound_at") else None,
        )


@dataclass(frozen=True)
class StudyCase:
    """
    Study Case entity — configuration for calculations (P10a).

    INVARIANTS:
    - StudyCase is a configuration entity, NOT a domain entity
    - Never mutates NetworkModel
    - Contains only calculation parameters
    - Results belong to the case, not to the model
    - Exactly one case can be active per project

    P10a ADDITIONS:
    - network_snapshot_id: Reference to the snapshot this case was configured against

    STATUS WYNIKOW: patrz naglowek modulu — przypadek go NIE PRZECHOWUJE.
    """

    id: UUID
    project_id: UUID
    name: str
    description: str = ""

    # P10a: Reference to the network snapshot this case is bound to
    network_snapshot_id: str | None = None

    # Configuration (calculation parameters only)
    config: StudyCaseConfig = field(default_factory=StudyCaseConfig)

    # P14c: Protection configuration (reference to template + overrides)
    protection_config: ProtectionConfig = field(default_factory=ProtectionConfig)

    # Active case indicator (exactly one per project)
    is_active: bool = False

    # Audit metadata
    revision: int = 1
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    # For backward compatibility with study_payload field
    study_payload: dict[str, Any] = field(default_factory=dict)

    def with_updated_config(self, config: StudyCaseConfig) -> StudyCase:
        """Create a new StudyCase with updated config.

        Zmiana konfiguracji NIE oznacza tu niczego jako nieaktualne: status wynikow
        jest wyprowadzany z biegow, a bieg policzony na innej konfiguracji ma inny
        `input_hash` — nie ma stanu, ktory trzeba by przestawic.
        """
        return StudyCase(
            id=self.id,
            project_id=self.project_id,
            name=self.name,
            description=self.description,
            network_snapshot_id=self.network_snapshot_id,
            config=config,
            protection_config=self.protection_config,
            is_active=self.is_active,
            revision=self.revision + 1,
            created_at=self.created_at,
            updated_at=datetime.now(UTC),
            study_payload=config.to_dict(),
        )

    def with_protection_config(self, protection_config: ProtectionConfig) -> StudyCase:
        """Create a new StudyCase with updated protection config (P14c)."""
        return StudyCase(
            id=self.id,
            project_id=self.project_id,
            name=self.name,
            description=self.description,
            network_snapshot_id=self.network_snapshot_id,
            config=self.config,
            protection_config=protection_config,
            is_active=self.is_active,
            revision=self.revision + 1,
            created_at=self.created_at,
            updated_at=datetime.now(UTC),
            study_payload=self.study_payload,
        )

    def with_name(self, name: str) -> StudyCase:
        """Create a new StudyCase with updated name."""
        return StudyCase(
            id=self.id,
            project_id=self.project_id,
            name=name,
            description=self.description,
            network_snapshot_id=self.network_snapshot_id,
            config=self.config,
            protection_config=self.protection_config,
            is_active=self.is_active,
            revision=self.revision + 1,
            created_at=self.created_at,
            updated_at=datetime.now(UTC),
            study_payload=self.study_payload,
        )

    def with_description(self, description: str) -> StudyCase:
        """Create a new StudyCase with updated description."""
        return StudyCase(
            id=self.id,
            project_id=self.project_id,
            name=self.name,
            description=description,
            network_snapshot_id=self.network_snapshot_id,
            config=self.config,
            protection_config=self.protection_config,
            is_active=self.is_active,
            revision=self.revision + 1,
            created_at=self.created_at,
            updated_at=datetime.now(UTC),
            study_payload=self.study_payload,
        )

    def mark_as_active(self) -> StudyCase:
        """Mark this case as active."""
        return StudyCase(
            id=self.id,
            project_id=self.project_id,
            name=self.name,
            description=self.description,
            network_snapshot_id=self.network_snapshot_id,
            config=self.config,
            protection_config=self.protection_config,
            is_active=True,
            revision=self.revision,
            created_at=self.created_at,
            updated_at=self.updated_at,
            study_payload=self.study_payload,
        )

    def mark_as_inactive(self) -> StudyCase:
        """Mark this case as inactive."""
        return StudyCase(
            id=self.id,
            project_id=self.project_id,
            name=self.name,
            description=self.description,
            network_snapshot_id=self.network_snapshot_id,
            config=self.config,
            protection_config=self.protection_config,
            is_active=False,
            revision=self.revision,
            created_at=self.created_at,
            updated_at=self.updated_at,
            study_payload=self.study_payload,
        )

    def with_network_snapshot_id(self, network_snapshot_id: str) -> StudyCase:
        """P10a: Bind this case to a new network snapshot.

        Samo PRZYPIECIE migawki — bez reguly uniewazniania. Regula „nowa migawka
        → wyniki OUTDATED” byla drugim (obok rewizji modelu) zrodlem prawdy o
        swiezosci i znikla razem z pozostalymi pisarzami statusu (CV-2-W): bieg
        niesie w kopercie rewizje modelu, na ktorej powstal, wiec rozjazd widac
        bez przestawiania czegokolwiek na przypadku.
        """
        return StudyCase(
            id=self.id,
            project_id=self.project_id,
            name=self.name,
            description=self.description,
            network_snapshot_id=network_snapshot_id,
            config=self.config,
            protection_config=self.protection_config,
            is_active=self.is_active,
            revision=self.revision + 1,
            created_at=self.created_at,
            updated_at=datetime.now(UTC),
            study_payload=self.study_payload,
        )

    def clone(self, new_name: str | None = None) -> StudyCase:
        """
        Clone this case with new ID.

        CLONING RULES (canonical-style):
        - Configuration is copied (including protection_config)
        - network_snapshot_id is copied (same snapshot binding)
        - Results are NOT copied (klon nie ma wlasnych biegow, wiec jego status
          wynikow wychodzi NONE bez zapisywania czegokolwiek)
        - New case is NOT active
        """
        now = datetime.now(UTC)
        return StudyCase(
            id=uuid4(),
            project_id=self.project_id,
            name=new_name or f"{self.name} (kopia)",
            description=self.description,
            network_snapshot_id=self.network_snapshot_id,  # P10a: Copy snapshot binding
            config=self.config,
            protection_config=self.protection_config,  # P14c: Copy protection config
            is_active=False,  # Clone is not active
            revision=1,
            created_at=now,
            updated_at=now,
            study_payload=self.study_payload,
        )

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary for API responses.

        BEZ statusu wynikow: `result_status` / `results_valid` dokleja WYLACZNIE
        warstwa API (`api/study_cases.py`) z werdyktu wyprowadzonego z biegow —
        przypadek nie ma czego o nim powiedziec.
        """
        return {
            "id": str(self.id),
            "project_id": str(self.project_id),
            "name": self.name,
            "description": self.description,
            "network_snapshot_id": self.network_snapshot_id,  # P10a
            "config": self.config.to_dict(),
            "protection_config": self.protection_config.to_dict(),  # P14c
            "is_active": self.is_active,
            "revision": self.revision,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> StudyCase:
        """Deserialize from dictionary."""
        config = StudyCaseConfig.from_dict(data.get("config", {}))
        protection_config = ProtectionConfig.from_dict(data.get("protection_config", {}))  # P14c
        return cls(
            id=UUID(data["id"]),
            project_id=UUID(data["project_id"]),
            name=data["name"],
            description=data.get("description", ""),
            network_snapshot_id=data.get("network_snapshot_id"),  # P10a
            config=config,
            protection_config=protection_config,  # P14c
            is_active=data.get("is_active", False),
            revision=data.get("revision", 1),
            created_at=(
                datetime.fromisoformat(data["created_at"])
                if "created_at" in data
                else datetime.now(UTC)
            ),
            updated_at=(
                datetime.fromisoformat(data["updated_at"])
                if "updated_at" in data
                else datetime.now(UTC)
            ),
            study_payload=config.to_dict(),
        )


def new_study_case(
    project_id: UUID,
    name: str,
    description: str = "",
    config: StudyCaseConfig | None = None,
    is_active: bool = False,
    network_snapshot_id: str | None = None,
) -> StudyCase:
    """
    Factory function to create a new StudyCase (P10a + P14c).

    Args:
        project_id: ID of the project this case belongs to
        name: Case name (displayed in UI)
        description: Optional description
        config: Calculation configuration (defaults to standard values)
        is_active: Whether this case should be active
        network_snapshot_id: P10a - Snapshot this case is bound to

    Returns:
        New StudyCase instance (bez biegow, wiec jego status wynikow wychodzi NONE)
    """
    cfg = config or StudyCaseConfig()
    now = datetime.now(UTC)
    return StudyCase(
        id=uuid4(),
        project_id=project_id,
        name=name,
        description=description,
        network_snapshot_id=network_snapshot_id,
        config=cfg,
        protection_config=ProtectionConfig(),  # P14c: Empty protection config by default
        is_active=is_active,
        revision=1,
        created_at=now,
        updated_at=now,
        study_payload=cfg.to_dict(),
    )


@dataclass(frozen=True)
class StudyCaseComparison:
    """
    Comparison between two study cases.

    P10: Case Compare view — 100% read-only, no mutations.
    """

    case_a_id: UUID
    case_b_id: UUID
    case_a_name: str
    case_b_name: str

    # Configuration differences
    config_differences: tuple[tuple[str, Any, Any], ...]

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary for API responses.

        BEZ `status_a` / `status_b`: statusy wynikow obu przypadkow dokleja warstwa
        API z werdyktow wyprowadzonych z biegow (ta sama zasada co `StudyCase.to_dict`).
        """
        return {
            "case_a_id": str(self.case_a_id),
            "case_b_id": str(self.case_b_id),
            "case_a_name": self.case_a_name,
            "case_b_name": self.case_b_name,
            "config_differences": [
                {"field": field, "value_a": val_a, "value_b": val_b}
                for field, val_a, val_b in self.config_differences
            ],
        }


def compare_study_cases(case_a: StudyCase, case_b: StudyCase) -> StudyCaseComparison:
    """
    Compare two study cases.

    Returns a StudyCaseComparison with all configuration differences.
    This is a read-only operation — no mutations allowed.
    """
    config_a = case_a.config.to_dict()
    config_b = case_b.config.to_dict()

    # Find all differences
    differences: list[tuple[str, Any, Any]] = []
    all_keys = set(config_a.keys()) | set(config_b.keys())

    for key in sorted(all_keys):
        val_a = config_a.get(key)
        val_b = config_b.get(key)
        if val_a != val_b:
            differences.append((key, val_a, val_b))

    return StudyCaseComparison(
        case_a_id=case_a.id,
        case_b_id=case_b.id,
        case_a_name=case_a.name,
        case_b_name=case_b.name,
        config_differences=tuple(differences),
    )

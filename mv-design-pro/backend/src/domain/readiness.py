"""
ReadinessProfileV1 — Per-analysis readiness with FixActions.

CANONICAL: Gotowość projektu do uruchomienia analiz / wyswietlenia SLD / eksportu.
Rozszerza AnalysisEligibilityMatrix o per-area grouping (KATALOGI, TOPOLOGIA, etc.)
i formalne profile: sld_ready, short_circuit_ready, load_flow_ready, protection_ready.

INVARIANTS:
- Immutable (frozen dataclass).
- Deterministyczny: identyczny Snapshot → identyczny ReadinessProfileV1 + content_hash.
- FixActions sa stabilne kody PL — brak auto-uzupelnien.
- ReadinessProfileV1 NIE mutuje modelu — tylko informuje.
- Kazdy FixAction wskazuje element_id (ElementRefV1.element_id) + obszar + priorytet.

ALIGNMENT with existing:
- AnalysisEligibilityMatrix (eligibility_models.py) — per-analysis eligibility (BLOCKER/WARNING)
- FixAction (enm/fix_actions.py) — UI suggestion (OPEN_MODAL, NAVIGATE_TO_ELEMENT, etc.)
- FieldDeviceFixActionV1 (frontend) — SLD-level fix actions
ReadinessProfileV1 AGGREGATES all of these into a single per-project readiness view.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

# ---------------------------------------------------------------------------
# Readiness Area — logical grouping for FixActions
# ---------------------------------------------------------------------------


class ReadinessAreaV1(StrEnum):
    """Obszar gotowosci — grupy problemow w kreatorze."""

    CATALOGS = "CATALOGS"
    TOPOLOGY = "TOPOLOGY"
    SOURCES = "SOURCES"
    STATIONS = "STATIONS"
    GENERATORS = "GENERATORS"
    PROTECTION = "PROTECTION"
    ANALYSIS = "ANALYSIS"


class ReadinessPriority(StrEnum):
    """Priorytet problemu gotowosci."""

    BLOCKER = "BLOCKER"
    WARNING = "WARNING"
    INFO = "INFO"


# ---------------------------------------------------------------------------
# ReadinessIssueV1 — single readiness issue
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ReadinessIssueV1:
    """Pojedynczy problem gotowosci.

    Stabilny kod, komunikat PL, wskazanie elementu + obszaru + priorytetu.
    """

    code: str
    area: ReadinessAreaV1
    priority: ReadinessPriority
    message_pl: str
    element_id: str | None = None
    element_type: str | None = None
    fix_hint_pl: str | None = None
    wizard_step: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "area": self.area.value,
            "priority": self.priority.value,
            "message_pl": self.message_pl,
            "element_id": self.element_id,
            "element_type": self.element_type,
            "fix_hint_pl": self.fix_hint_pl,
            "wizard_step": self.wizard_step,
        }


# ---------------------------------------------------------------------------
# ReadinessProfileV1 — per-analysis readiness profile
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ReadinessProfileV1:
    """Profil gotowosci projektu — jedno zrodlo prawdy dla kreator/SLD/analizy.

    Kazdy profil zawiera:
    - sld_ready: czy SLD moze byc wyrenderowane (topologia, stacje, aparaty)
    - short_circuit_ready: czy mozna uruchomic obliczenia zwarciowe
    - load_flow_ready: czy mozna uruchomic rozplyw mocy
    - protection_ready: czy mozna uruchomic analize ochrony

    Kazde 'False' ma liste ReadinessIssueV1 z kodem PL i wskazaniem do kreatora.
    """

    snapshot_id: str
    snapshot_fingerprint: str

    sld_ready: bool = False
    short_circuit_ready: bool = False
    load_flow_ready: bool = False
    protection_ready: bool = False

    issues: tuple[ReadinessIssueV1, ...] = field(default_factory=tuple)

    content_hash: str = ""

    @property
    def sld_issues(self) -> tuple[ReadinessIssueV1, ...]:
        """Issues blocking SLD readiness."""
        return tuple(
            i
            for i in self.issues
            if i.area
            in (
                ReadinessAreaV1.TOPOLOGY,
                ReadinessAreaV1.STATIONS,
                ReadinessAreaV1.GENERATORS,
            )
            and i.priority == ReadinessPriority.BLOCKER
        )

    @property
    def short_circuit_issues(self) -> tuple[ReadinessIssueV1, ...]:
        """Issues blocking short circuit readiness."""
        return tuple(
            i
            for i in self.issues
            if i.priority == ReadinessPriority.BLOCKER
            and i.area
            in (
                ReadinessAreaV1.TOPOLOGY,
                ReadinessAreaV1.SOURCES,
                ReadinessAreaV1.CATALOGS,
            )
        )

    @property
    def by_area(self) -> dict[str, list[ReadinessIssueV1]]:
        """Group issues by area."""
        grouped: dict[str, list[ReadinessIssueV1]] = {}
        for issue in self.issues:
            grouped.setdefault(issue.area.value, []).append(issue)
        return grouped

    def to_dict(self) -> dict[str, Any]:
        return {
            "snapshot_id": self.snapshot_id,
            "snapshot_fingerprint": self.snapshot_fingerprint,
            "sld_ready": self.sld_ready,
            "short_circuit_ready": self.short_circuit_ready,
            "load_flow_ready": self.load_flow_ready,
            "protection_ready": self.protection_ready,
            "issues": [i.to_dict() for i in self.issues],
            "content_hash": self.content_hash,
        }


# ---------------------------------------------------------------------------
# Builder
# ---------------------------------------------------------------------------


def _sort_issues(
    issues: list[ReadinessIssueV1],
) -> tuple[ReadinessIssueV1, ...]:
    """Sort issues deterministically by area, priority, code, element_id."""
    priority_order = {
        ReadinessPriority.BLOCKER: 0,
        ReadinessPriority.WARNING: 1,
        ReadinessPriority.INFO: 2,
    }
    return tuple(
        sorted(
            issues,
            key=lambda i: (
                i.area.value,
                priority_order.get(i.priority, 9),
                i.code,
                i.element_id or "",
            ),
        )
    )


def build_readiness_profile(
    *,
    snapshot_id: str,
    snapshot_fingerprint: str,
    issues: list[ReadinessIssueV1],
) -> ReadinessProfileV1:
    """Build ReadinessProfileV1 with computed readiness flags and hash.

    Readiness = no BLOCKER issues in relevant areas.
    """
    sorted_issues = _sort_issues(issues)

    blockers_by_area: dict[str, bool] = {}
    for issue in sorted_issues:
        if issue.priority == ReadinessPriority.BLOCKER:
            blockers_by_area[issue.area.value] = True

    sld_ready = not any(
        blockers_by_area.get(a.value, False)
        for a in (
            ReadinessAreaV1.TOPOLOGY,
            ReadinessAreaV1.STATIONS,
            ReadinessAreaV1.GENERATORS,
        )
    )
    short_circuit_ready = not any(
        blockers_by_area.get(a.value, False)
        for a in (
            ReadinessAreaV1.TOPOLOGY,
            ReadinessAreaV1.SOURCES,
            ReadinessAreaV1.CATALOGS,
        )
    )
    load_flow_ready = not any(
        blockers_by_area.get(a.value, False)
        for a in (
            ReadinessAreaV1.TOPOLOGY,
            ReadinessAreaV1.SOURCES,
            ReadinessAreaV1.CATALOGS,
        )
    )
    protection_ready = not any(
        blockers_by_area.get(a.value, False)
        for a in (
            ReadinessAreaV1.TOPOLOGY,
            ReadinessAreaV1.PROTECTION,
            ReadinessAreaV1.CATALOGS,
        )
    )

    profile_no_hash = ReadinessProfileV1(
        snapshot_id=snapshot_id,
        snapshot_fingerprint=snapshot_fingerprint,
        sld_ready=sld_ready,
        short_circuit_ready=short_circuit_ready,
        load_flow_ready=load_flow_ready,
        protection_ready=protection_ready,
        issues=sorted_issues,
    )

    sig_data = profile_no_hash.to_dict()
    sig_data.pop("content_hash", None)
    payload = json.dumps(sig_data, sort_keys=True, separators=(",", ":"))
    content_hash = hashlib.sha256(payload.encode("utf-8")).hexdigest()

    return ReadinessProfileV1(
        snapshot_id=snapshot_id,
        snapshot_fingerprint=snapshot_fingerprint,
        sld_ready=sld_ready,
        short_circuit_ready=short_circuit_ready,
        load_flow_ready=load_flow_ready,
        protection_ready=protection_ready,
        issues=sorted_issues,
        content_hash=content_hash,
    )


# ---------------------------------------------------------------------------
# Readiness Gate — hard blocking mechanisms (RUN #3E §3)
# ---------------------------------------------------------------------------


class ReadinessGateError(Exception):
    """Raised when an operation is blocked by readiness requirements."""

    def __init__(self, gate: str, blockers: list[ReadinessIssueV1]) -> None:
        self.gate = gate
        self.blockers = blockers
        codes = ", ".join(b.code for b in blockers[:5])
        super().__init__(f"Readiness gate '{gate}' BLOCKED: {len(blockers)} blocker(s) [{codes}]")


def require_sld_ready(profile: ReadinessProfileV1) -> None:
    """Gate: SLD rendering requires sld_ready=True. Raises ReadinessGateError if not."""
    if profile.sld_ready:
        return
    blockers = [
        i
        for i in profile.issues
        if i.priority == ReadinessPriority.BLOCKER
        and i.area
        in (
            ReadinessAreaV1.TOPOLOGY,
            ReadinessAreaV1.STATIONS,
            ReadinessAreaV1.GENERATORS,
        )
    ]
    raise ReadinessGateError("sld_ready", blockers)


def require_short_circuit_ready(profile: ReadinessProfileV1) -> None:
    """Gate: Short circuit analysis requires short_circuit_ready=True."""
    if profile.short_circuit_ready:
        return
    blockers = [
        i
        for i in profile.issues
        if i.priority == ReadinessPriority.BLOCKER
        and i.area
        in (
            ReadinessAreaV1.TOPOLOGY,
            ReadinessAreaV1.SOURCES,
            ReadinessAreaV1.CATALOGS,
        )
    ]
    raise ReadinessGateError("short_circuit_ready", blockers)


def require_load_flow_ready(profile: ReadinessProfileV1) -> None:
    """Gate: Load flow analysis requires load_flow_ready=True."""
    if profile.load_flow_ready:
        return
    blockers = [
        i
        for i in profile.issues
        if i.priority == ReadinessPriority.BLOCKER
        and i.area
        in (
            ReadinessAreaV1.TOPOLOGY,
            ReadinessAreaV1.SOURCES,
            ReadinessAreaV1.CATALOGS,
        )
    ]
    raise ReadinessGateError("load_flow_ready", blockers)


def require_export_ready(profile: ReadinessProfileV1) -> None:
    """Gate: Export requires ALL readiness flags=True (no BLOCKERs anywhere)."""
    all_blockers = [i for i in profile.issues if i.priority == ReadinessPriority.BLOCKER]
    if not all_blockers:
        return
    raise ReadinessGateError("export_ready", all_blockers)


# ---------------------------------------------------------------------------
# Field/Device readiness gates (RUN #3F §3)
# ---------------------------------------------------------------------------


def require_fields_complete(profile: ReadinessProfileV1) -> None:
    """Gate: All station fields must have required apparatus.

    Blocks when any field.device_missing.* BLOCKER exists.
    """
    blockers = [
        i
        for i in profile.issues
        if i.priority == ReadinessPriority.BLOCKER and i.code.startswith("field.device_missing.")
    ]
    if not blockers:
        return
    raise ReadinessGateError("fields_complete", blockers)


def require_devices_parametrized(profile: ReadinessProfileV1) -> None:
    """Gate: All critical apparatus must have parameters (CB rating, CT ratio, etc.).

    Blocks when any device.*.missing BLOCKER exists.
    """
    blockers = [
        i
        for i in profile.issues
        if i.priority == ReadinessPriority.BLOCKER
        and (i.code.startswith("device.") or i.code == "catalog.ref_missing")
    ]
    if not blockers:
        return
    raise ReadinessGateError("devices_parametrized", blockers)


def require_protection_bindings(profile: ReadinessProfileV1) -> None:
    """Gate: All relays must be bound to breakers (CB).

    Blocks when protection.relay_binding_missing or protection.relay_cb_binding_missing.
    """
    blockers = [
        i
        for i in profile.issues
        if i.priority == ReadinessPriority.BLOCKER and i.code.startswith("protection.")
    ]
    if not blockers:
        return
    raise ReadinessGateError("protection_bindings", blockers)


def require_pv_bess_transformer_rule(profile: ReadinessProfileV1) -> None:
    """Gate: PV/BESS always through transformer (variant A or B).

    RUN #3G §2.3: Blocks when generator.connection_variant_missing,
    generator.station_ref_missing, generator.block_transformer_missing,
    or any other generator.* BLOCKER.
    """
    blockers = [
        i
        for i in profile.issues
        if i.priority == ReadinessPriority.BLOCKER and i.code.startswith("generator.")
    ]
    if not blockers:
        return
    raise ReadinessGateError("pv_bess_transformer_rule", blockers)

"""
Parameter provenance tracking for solver-input contract.

Each technical/numerical field in solver payload has a provenance trace entry
documenting its origin (CATALOG, OVERRIDE, DERIVED, DEFAULT_FORBIDDEN).

All structures are JSON-serializable and deterministically sorted.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from enum import Enum, StrEnum
from typing import Any


class SourceKind(Enum):
    """Origin of a parameter value in solver-input payload (PIPELINE axis).

    Answers: *where did this value come from in the pipeline* — catalog lookup,
    user override, a derivation rule, or a forbidden default.
    """

    CATALOG = "CATALOG"
    OVERRIDE = "OVERRIDE"
    DERIVED = "DERIVED"
    DEFAULT_FORBIDDEN = "DEFAULT_FORBIDDEN"


class FieldQuality(StrEnum):
    """Data-quality provenance axis for a single card field.

    Orthogonal to :class:`SourceKind` (which records *where* a value came from in
    the pipeline). ``FieldQuality`` records *how trustworthy* the value is:

    - ``DATASHEET`` (karta_techniczna): value taken from a manufacturer datasheet
      / type-test report — fully trustworthy for the OSD package.
    - ``ESTIMATED`` (oszacowane): value is an engineering estimate without a real
      source (e.g. a controller bandwidth assumed from technology defaults). It
      MUST be tagged ``ESTIMATED`` — never ``DATASHEET`` — until a real source is
      attached.
    - ``SYSTEM_DEFAULT`` (domyslne_techniczne): value is a system/technical
      default carried by the schema (the field is present but no real value has
      been provided).

    Paramount rule: "no gaps" means the schema is COMPLETE (every field present),
    NOT that every field is filled with a fabricated value. A value with no real
    source is ``ESTIMATED`` (or ``SYSTEM_DEFAULT``), never ``DATASHEET``.
    """

    DATASHEET = "DATASHEET"
    ESTIMATED = "ESTIMATED"
    SYSTEM_DEFAULT = "SYSTEM_DEFAULT"

    @property
    def label_pl(self) -> str:
        """Polish UI label (no codenames)."""
        return _FIELD_QUALITY_LABEL_PL[self]


_FIELD_QUALITY_LABEL_PL: dict[FieldQuality, str] = {
    FieldQuality.DATASHEET: "karta_techniczna",
    FieldQuality.ESTIMATED: "oszacowane",
    FieldQuality.SYSTEM_DEFAULT: "domyslne_techniczne",
}


class EvidenceTier(StrEnum):
    """Regulatory-evidence axis for a COMPUTED RESULT (not for an input field).

    Third provenance axis, orthogonal to the two above:

    - :class:`SourceKind` — *where did this input value come from in the pipeline*;
    - :class:`FieldQuality` — *how trustworthy is this input value*;
    - ``EvidenceTier`` — *may this computed result be presented as demonstrated
      proof that a normative requirement is met*.

    The distinction the two older axes cannot express: an input can be perfectly
    datasheet-grade while the computation consuming it has no established
    physical validity. Evidence eligibility is a property of the COMPUTATION,
    at capability granularity — not of any single field.

    Tiers:

    - ``VALIDATED_SIMULATION``: a physical computation whose model and numerical
      behaviour have established validity (validation evidence exists). The ONLY
      tier eligible for regulatory evidence.
    - ``DECLARATION``: the value was declared by the applicant (or read from a
      profile) and compared against a requirement. A legitimate requirement
      check — but nothing was demonstrated by computation.
    - ``UNVALIDATED_MODEL``: a computation ran, but the model behind it has no
      established physical validity, so its output cannot support a normative
      conclusion.
    - ``NOT_SIMULATED``: no physical computation was performed at all; any
      "simulated" quantity attached to such a result is not a computed value.

    Paramount rule (mirrors the FieldQuality rule): admission to
    ``VALIDATED_SIMULATION`` follows demonstrated capability, never naming.
    Tagging a capability as validated does not make it validated; the tier must
    be raised only when validation evidence exists.
    """

    VALIDATED_SIMULATION = "VALIDATED_SIMULATION"
    DECLARATION = "DECLARATION"
    UNVALIDATED_MODEL = "UNVALIDATED_MODEL"
    NOT_SIMULATED = "NOT_SIMULATED"

    @property
    def regulatory_evidence_eligible(self) -> bool:
        """True only for tiers admissible as regulatory evidence (fail-closed)."""
        return self is EvidenceTier.VALIDATED_SIMULATION

    @property
    def label_pl(self) -> str:
        """Polish label (no codenames)."""
        return _EVIDENCE_TIER_LABEL_PL[self]


# Zdanie kanoniczne uzywane wszedzie, gdzie wynik NIE jest dowodem regulacyjnym.
# Swiadomie mowi o BRAKU DOWODU, a nie o niespelnieniu wymagania — to dwa rozne
# stany i mylenie ich byloby rownie nieuczciwe jak falszywy wynik pozytywny.
BRAK_DOWODU_PL = "BRAK WYSTARCZAJĄCEGO DOWODU SPEŁNIENIA WYMAGANIA"

_EVIDENCE_TIER_LABEL_PL: dict[EvidenceTier, str] = {
    EvidenceTier.VALIDATED_SIMULATION: "symulacja_zwalidowana",
    EvidenceTier.DECLARATION: "deklaracja_wnioskodawcy",
    EvidenceTier.UNVALIDATED_MODEL: "model_niezwalidowany",
    EvidenceTier.NOT_SIMULATED: "brak_symulacji",
}


@dataclass(frozen=True)
class CapabilityEvidence:
    """Evidence classification of one computation capability.

    Attributes:
        capability_id: Stable dotted id of the computing capability
            (e.g. ``"frt_hvrt.trajectory"``). Names the COMPUTATION, not a field.
        tier: Evidence tier of results produced by that capability.
        rationale_pl: Technical reason for the tier (no soft language).
        audit_ref: Reference to the evidence backing the classification.
    """

    capability_id: str
    tier: EvidenceTier
    rationale_pl: str
    audit_ref: str

    @property
    def regulatory_evidence_eligible(self) -> bool:
        return self.tier.regulatory_evidence_eligible

    def to_dict(self) -> dict[str, Any]:
        return {
            "capability_id": self.capability_id,
            "tier": self.tier.value,
            "tier_pl": self.tier.label_pl,
            "regulatory_evidence_eligible": self.regulatory_evidence_eligible,
            "rationale_pl": self.rationale_pl,
            "audit_ref": self.audit_ref,
        }


_AUDIT_CARD = "docs/plan/KARTA_MAX_DYNAMIC_SIMULATION_AUDIT_2026-09.md"

# Evidence classification of dynamic-simulation capabilities.
#
# Every entry is UNVALIDATED_MODEL, DECLARATION or NOT_SIMULATED: as of the
# audit above, NO dynamic capability in this repository has established physical
# validity, so none is admissible as regulatory evidence. An entry may be raised
# to VALIDATED_SIMULATION only together with validation evidence for that
# capability (reference network / external oracle / analytical solution).
#
# This map is intentionally NOT exhaustive of all future capabilities: an
# unknown capability id resolves to UNVALIDATED_MODEL (fail-closed), so a new
# dynamic engine is inadmissible until it is classified deliberately.
_DYNAMIC_CAPABILITY_EVIDENCE: dict[str, CapabilityEvidence] = {
    entry.capability_id: entry
    for entry in (
        CapabilityEvidence(
            capability_id="ncrfg_ptpiree.ride_through",
            tier=EvidenceTier.NOT_SIMULATED,
            rationale_pl=(
                "Ocena LVRT/HVRT nie uruchamia zadnej symulacji: wielkosc porownywana "
                "jest przypisana z limitu profilu, wiec margines wychodzi tozsamosciowo "
                "zerowy niezaleznie od danych modulu."
            ),
            audit_ref=f"{_AUDIT_CARD} §21.1",
        ),
        CapabilityEvidence(
            capability_id="ncrfg_ptpiree.p_recovery",
            tier=EvidenceTier.DECLARATION,
            rationale_pl=(
                "Czas odbudowy mocy czynnej jest wartoscia zadeklarowana na wejsciu i "
                "porownana z wymaganiem profilu; nie pochodzi z przebiegu P(t)."
            ),
            audit_ref=f"{_AUDIT_CARD} §17",
        ),
        CapabilityEvidence(
            capability_id="ncrfg_ptpiree.reactive_current_frt",
            tier=EvidenceTier.DECLARATION,
            rationale_pl=(
                "Prad bierny podczas zwarcia jest wyliczany z zadeklarowanego "
                "wzmocnienia przy zaszytym spadku napiecia; nie pochodzi z przebiegu Iq(t)."
            ),
            audit_ref=f"{_AUDIT_CARD} §18",
        ),
        CapabilityEvidence(
            capability_id="ncrfg_ptpiree.frequency_response",
            tier=EvidenceTier.DECLARATION,
            rationale_pl=(
                "Odpowiedz czestotliwosciowa jest podstawieniem algebraicznym przy "
                "zaszytej czestotliwosci testowej; brak przebiegu f(t) i P(t)."
            ),
            audit_ref=f"{_AUDIT_CARD} §16",
        ),
        CapabilityEvidence(
            capability_id="frt_hvrt.trajectory",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            rationale_pl=(
                "Przebieg napiecia jest funkcja zadana z parametru wejsciowego, a nie "
                "rozwiazaniem sieci; modul wytworczy nie wplywa na wynik."
            ),
            audit_ref=f"{_AUDIT_CARD} §15",
        ),
        CapabilityEvidence(
            capability_id="stability_rms.time_domain",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            rationale_pl=(
                "Calkowanie rozprzezonych rownan skalarnych przy napieciu stalym, bez "
                "sprzezenia z siecia i bez inicjalizacji w punkcie rownowagi."
            ),
            audit_ref=f"{_AUDIT_CARD} §12, §13",
        ),
        CapabilityEvidence(
            capability_id="stability_rms.small_signal",
            tier=EvidenceTier.UNVALIDATED_MODEL,
            rationale_pl=(
                "Wartosci wlasne liczone per element w punkcie zerowym, bez macierzy "
                "stanu ukladu; mody miedzymaszynowe sa niewykrywalne."
            ),
            audit_ref=f"{_AUDIT_CARD} §20.1",
        ),
        CapabilityEvidence(
            capability_id="dynamic_stability.fault_clear",
            tier=EvidenceTier.DECLARATION,
            rationale_pl=(
                "Katy wirnika i wielkosci pozwarciowe pochodza z opcji biegu z "
                "wartosciami domyslnymi; werdykt jest porownaniem progowym, nie calkowaniem."
            ),
            audit_ref=f"{_AUDIT_CARD} §20.2",
        ),
    )
}


def classify_dynamic_capability(capability_id: str) -> CapabilityEvidence:
    """Return the evidence classification of a dynamic capability (fail-closed).

    An unregistered capability id is classified ``UNVALIDATED_MODEL`` — a new or
    renamed dynamic engine is inadmissible as regulatory evidence until it is
    classified deliberately, so forgetting to register one cannot silently
    produce admissible evidence.
    """
    known = _DYNAMIC_CAPABILITY_EVIDENCE.get(capability_id)
    if known is not None:
        return known
    return CapabilityEvidence(
        capability_id=capability_id,
        tier=EvidenceTier.UNVALIDATED_MODEL,
        rationale_pl=(
            "Zdolnosc dynamiczna nie jest sklasyfikowana w rejestrze dowodowym; "
            "domyslnie nieprzydatna jako dowod regulacyjny."
        ),
        audit_ref=f"{_AUDIT_CARD} §23",
    )


def registered_dynamic_capabilities() -> tuple[str, ...]:
    """Capability ids present in the evidence registry, deterministically sorted."""
    return tuple(sorted(_DYNAMIC_CAPABILITY_EVIDENCE))


@dataclass(frozen=True)
class SourceRef:
    """Reference to the source of a parameter value."""

    catalog_ref: str | None = None
    catalog_path: str | None = None
    override_reason: str | None = None
    derivation_rule: str | None = None

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {}
        if self.catalog_ref is not None:
            result["catalog_ref"] = self.catalog_ref
        if self.catalog_path is not None:
            result["catalog_path"] = self.catalog_path
        if self.override_reason is not None:
            result["override_reason"] = self.override_reason
        if self.derivation_rule is not None:
            result["derivation_rule"] = self.derivation_rule
        return result


@dataclass(frozen=True)
class ProvenanceEntry:
    """
    Single provenance trace entry for one field in solver-input payload.

    Attributes:
        element_ref: Element reference ID (e.g., "line_1", "trafo_1").
        field_path: Dotted path to the field in payload (e.g., "branches[0].r_ohm_per_km").
        source_kind: Origin category (CATALOG / OVERRIDE / DERIVED / DEFAULT_FORBIDDEN).
        source_ref: Detailed source reference.
        value_hash: Deterministic hash of the value (SHA-256 of JSON-encoded value).
        unit: Physical unit if applicable (e.g., "ohm/km", "A").
        note: Technical note (no soft language).
        quality: Data-quality axis (DATASHEET / ESTIMATED / SYSTEM_DEFAULT).
            Orthogonal to ``source_kind``; optional so existing entries serialize
            byte-identically when unset.
    """

    element_ref: str
    field_path: str
    source_kind: SourceKind
    source_ref: SourceRef = field(default_factory=SourceRef)
    value_hash: str = ""
    unit: str | None = None
    note: str | None = None
    quality: FieldQuality | None = None

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "element_ref": self.element_ref,
            "field_path": self.field_path,
            "source_kind": self.source_kind.value,
            "source_ref": self.source_ref.to_dict(),
            "value_hash": self.value_hash,
        }
        if self.unit is not None:
            result["unit"] = self.unit
        if self.note is not None:
            result["note"] = self.note
        if self.quality is not None:
            result["quality"] = self.quality.value
        return result


@dataclass(frozen=True)
class CardFieldStatus:
    """Data-quality status of one field on a converter (inverter) card.

    Lightweight, JSON-serializable. The map {field_name -> CardFieldStatus}
    attached to a card answers, per field, *how trustworthy* its value is. A
    field MISSING from this map is NOT allowed for a complete card — the schema
    is complete, so every card field has a status; the status (not the presence)
    says how trustworthy each value is.

    Attributes:
        field_name: Card field name (matches a ConverterType attribute).
        quality: Data-quality classification (DATASHEET / ESTIMATED / SYSTEM_DEFAULT).
        source_ref: Reference to the real source (datasheet / report) if any.
        note: Technical note (no soft language).
    """

    field_name: str
    quality: FieldQuality
    source_ref: str | None = None
    note: str | None = None

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "field_name": self.field_name,
            "quality": self.quality.value,
        }
        if self.source_ref is not None:
            result["source_ref"] = self.source_ref
        if self.note is not None:
            result["note"] = self.note
        return result

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> CardFieldStatus:
        return cls(
            field_name=str(data["field_name"]),
            quality=FieldQuality(str(data["quality"])),
            source_ref=data.get("source_ref"),
            note=data.get("note"),
        )


def card_status_map_to_dict(
    status_map: dict[str, CardFieldStatus],
) -> dict[str, dict[str, Any]]:
    """Serialize a {field_name -> CardFieldStatus} map deterministically."""
    return {name: status_map[name].to_dict() for name in sorted(status_map)}


def compute_value_hash(value: Any) -> str:
    """Compute deterministic SHA-256 hash of a JSON-serializable value."""
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()[:16]


@dataclass(frozen=True)
class ProvenanceSummary:
    """Aggregated provenance summary for solver-input envelope."""

    catalog_refs_used: tuple[str, ...] = field(default_factory=tuple)
    overrides_used_count: int = 0
    overrides_used_refs: tuple[str, ...] = field(default_factory=tuple)
    derived_fields_count: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "catalog_refs_used": list(self.catalog_refs_used),
            "overrides_used_count": self.overrides_used_count,
            "overrides_used_refs": list(self.overrides_used_refs),
            "derived_fields_count": self.derived_fields_count,
        }


def build_provenance_summary(entries: list[ProvenanceEntry]) -> ProvenanceSummary:
    """Build aggregated summary from list of provenance entries."""
    catalog_refs: set[str] = set()
    override_refs: set[str] = set()
    derived_count = 0

    for entry in entries:
        if entry.source_kind == SourceKind.CATALOG:
            if entry.source_ref.catalog_ref:
                catalog_refs.add(entry.source_ref.catalog_ref)
        elif entry.source_kind == SourceKind.OVERRIDE:
            override_refs.add(entry.element_ref)
        elif entry.source_kind == SourceKind.DERIVED:
            derived_count += 1

    return ProvenanceSummary(
        catalog_refs_used=tuple(sorted(catalog_refs)),
        overrides_used_count=len(override_refs),
        overrides_used_refs=tuple(sorted(override_refs)),
        derived_fields_count=derived_count,
    )


# Inverter-card ("karta falownika") rating/identity fields. When present these
# seed to DATASHEET (a published catalog rating is treated as datasheet-grade).
_CARD_RATING_FIELDS: tuple[str, ...] = (
    "un_kv",
    "sn_mva",
    "pmax_mw",
    "qmin_mvar",
    "qmax_mvar",
    "cosphi_min",
    "cosphi_max",
    "manufacturer",
    "model",
)


def card_field_quality_map(converter: Any) -> dict[str, CardFieldStatus]:
    """Derive the SEED data-quality map for an inverter card (ConverterType).

    This is only the seed; explicit per-card overrides come later (a separate
    step). Default rule, per field of the COMPLETE card schema:

    - rating / manufacturer / model present (not None) => ``DATASHEET``
      (a published catalog rating is treated as datasheet-grade);
    - controller-bandwidth (SSCI / Z_conv) fields => ``ESTIMATED`` by default
      (these are engineering estimates until a real datasheet value is attached —
      they MUST NOT be tagged DATASHEET just to make D-03 compute);
    - any other card field that is absent (None) => ``SYSTEM_DEFAULT``;
    - SC-model / power-hierarchy fields present (not None) => ``DATASHEET``.

    A field MISSING from the schema is not allowed: the schema is complete, so
    every card field appears in this map; the quality (not the presence) says how
    trustworthy each value is.

    ``converter`` is typed ``Any`` to avoid a hard import of the catalog layer at
    module load; the field tuples are imported lazily from the catalog (single
    source of truth for the card schema).
    """
    from network_model.catalog.types import (  # lazy: avoid import cycle
        _CARD_POWER_HIERARCHY_FIELDS,
        _CARD_SC_MODEL_FIELDS,
        _CARD_SSCI_FIELDS,
    )

    result: dict[str, CardFieldStatus] = {}
    source_ref = getattr(converter, "source_reference", None)

    # Rating / identity block: DATASHEET when present, else SYSTEM_DEFAULT.
    for name in _CARD_RATING_FIELDS:
        present = getattr(converter, name, None) is not None
        result[name] = CardFieldStatus(
            field_name=name,
            quality=FieldQuality.DATASHEET if present else FieldQuality.SYSTEM_DEFAULT,
            source_ref=source_ref if present else None,
        )

    # SC-model and power-hierarchy blocks: DATASHEET when present, else SYSTEM_DEFAULT.
    for name in _CARD_SC_MODEL_FIELDS + _CARD_POWER_HIERARCHY_FIELDS:
        present = getattr(converter, name, None) is not None
        result[name] = CardFieldStatus(
            field_name=name,
            quality=FieldQuality.DATASHEET if present else FieldQuality.SYSTEM_DEFAULT,
            source_ref=source_ref if present else None,
        )

    # Controller-bandwidth + converter-filter (SSCI / Z_conv) block: ESTIMATED by
    # default when present (never DATASHEET without a real source), SYSTEM_DEFAULT
    # when absent. Filter L/R are typical-class VSC estimates, just like the bands.
    for name in _CARD_SSCI_FIELDS:
        present = getattr(converter, name, None) is not None
        result[name] = CardFieldStatus(
            field_name=name,
            quality=FieldQuality.ESTIMATED if present else FieldQuality.SYSTEM_DEFAULT,
            note="oszacowanie pasma/filtra regulatora; wymaga zrodla z karty technicznej",
        )

    return result


def resolve_card_field_quality_map(converter: Any) -> dict[str, CardFieldStatus]:
    """Resolve the EFFECTIVE per-field data-quality map for a converter card.

    Starts from :func:`card_field_quality_map` (the default seed) and applies any
    explicit per-card override carried by the converter as ``card_field_status``
    (a ``{field_name -> CardFieldStatus}`` map, e.g. attached by the catalog
    builder so a reference card can declare its real provenance). The override is
    the single place a card asserts, per field, how trustworthy its value is — it
    can promote a seeded ESTIMATED bandwidth to DATASHEET *only* when a real source
    is attached (the carrier itself records ``source_ref``), and can never be
    fabricated silently because the status is explicit and serialized.

    ``converter`` is ``Any`` to avoid a hard catalog import at module load.
    """
    resolved = card_field_quality_map(converter)
    override = getattr(converter, "card_field_status", None)
    if override:
        for name, status in override.items():
            if isinstance(status, CardFieldStatus):
                resolved[name] = status
            elif isinstance(status, dict):
                resolved[name] = CardFieldStatus.from_dict(status)
    return resolved


# ---------------------------------------------------------------------------
# OSD acceptance gate — blocks the OSD package (NOT the analysis) on any card
# field that is ESTIMATED / SYSTEM_DEFAULT and not consciously accepted.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CardFieldAcceptance:
    """Engineer-acceptance carrier for inverter-card fields toward the OSD package.

    A field whose data quality is ``ESTIMATED`` / ``SYSTEM_DEFAULT`` does NOT block
    the analysis (the full physical model runs on the typical value), but it MUST
    be consciously accepted by an engineer before the card may enter the OSD /
    connection-application ("wniosek przylaczeniowy") package. This carrier is that
    conscious acceptance: a frozen, serializable set of accepted field names plus
    the accepting engineer's identity for the audit trail.

    Attributes:
        accepted_fields: card field names the engineer has explicitly accepted as
            estimated/default for the OSD package.
        accepted_by: optional engineer identity (for the audit trail).
        note: optional technical note (no soft language).
    """

    accepted_fields: frozenset[str] = field(default_factory=frozenset)
    accepted_by: str | None = None
    note: str | None = None

    @classmethod
    def of(cls, fields: set[str] | frozenset[str] | None, **kwargs: Any) -> CardFieldAcceptance:
        """Build from a plain set (``None`` => nothing accepted)."""
        return cls(accepted_fields=frozenset(fields or ()), **kwargs)

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {"accepted_fields": sorted(self.accepted_fields)}
        if self.accepted_by is not None:
            result["accepted_by"] = self.accepted_by
        if self.note is not None:
            result["note"] = self.note
        return result


# Readiness code (single source of truth) for an unaccepted estimated/default
# card field that blocks the OSD package. Mirrors READINESS_CODES key in
# domain.canonical_operations (no parallel readiness system).
OSD_CARD_FIELD_BLOCKER_CODE = "oze.card_field_not_accepted"


def osd_card_gate(
    converter: Any,
    accepted_fields: set[str] | frozenset[str] | CardFieldAcceptance | None,
) -> tuple[bool, list[Any]]:
    """OSD acceptance gate for one inverter card. Blocks ONLY the OSD package.

    For each card field whose effective :class:`FieldQuality` is ``ESTIMATED`` or
    ``SYSTEM_DEFAULT`` and that is NOT in ``accepted_fields``, emit a
    :class:`~enm.domain_ops_models.ReadinessBlocker` (the existing readiness model —
    no second truth) with a Polish message::

        pole '<f>' = <quality> wymaga akceptacji inzyniera przed pakietem OSD

    ``DATASHEET`` fields never block. The analysis path is independent of this gate:
    the solver still runs on the typical (estimated) value — the gate guards the
    OSD / connection-application export only, exactly per the paramount rule
    (full physical model, explicit status, no deferral, conscious acceptance to
    leave the estimate in the formal package).

    Args:
        converter: a ConverterType-like card (typed ``Any`` to avoid a catalog
            import at module load).
        accepted_fields: the consciously-accepted field names — a plain set, a
            :class:`CardFieldAcceptance` carrier, or ``None`` (nothing accepted).

    Returns:
        ``(ready, blockers)`` — ``ready`` is True iff ``blockers`` is empty.
        Blockers are deterministically ordered by field name.
    """
    from enm.domain_ops_models import ReadinessBlocker  # lazy: avoid import cycle

    if isinstance(accepted_fields, CardFieldAcceptance):
        accepted = set(accepted_fields.accepted_fields)
    else:
        accepted = set(accepted_fields or ())

    quality_map = resolve_card_field_quality_map(converter)
    element_ref = getattr(converter, "id", None)

    blockers: list[Any] = []
    for field_name in sorted(quality_map):
        status = quality_map[field_name]
        if status.quality is FieldQuality.DATASHEET:
            continue  # datasheet-grade values never block the OSD package
        if field_name in accepted:
            continue  # consciously accepted by an engineer
        blockers.append(
            ReadinessBlocker(
                code=OSD_CARD_FIELD_BLOCKER_CODE,
                message_pl=(
                    f"pole '{field_name}' = {status.quality.value} "
                    "wymaga akceptacji inzyniera przed pakietem OSD"
                ),
                element_ref=element_ref,
            )
        )

    return (not blockers, blockers)

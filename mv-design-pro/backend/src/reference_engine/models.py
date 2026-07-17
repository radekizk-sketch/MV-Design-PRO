"""Reference Engine V1 — modele danych pakietów referencyjnych.

REFERENCE_ENGINE_SPEC_V1.md §3 (dyrektywa właściciela 2026-07-17
„Globalna integracja referencji SLD", rejestr konfliktów V12K-060).

Pakiet referencyjny (`ReferencePack`) to WERSJONOWANE DANE (packs/*/pack.json)
walidowane tym modułem przy ładowaniu — zmiana referencji jest edycją JSON,
nie przebudową kodu (pkt 11 dyrektywy). Warstwa referencji: czysta
interpretacja, zero fizyki, zero mutacji modelu.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

# Słownik aparatów = kanon `BayPrimaryDevice.kind` (enm/models.py) — jedna
# nomenklatura dla danych pola, profili referencyjnych i mapy symboli.
ApparatusKind = Literal[
    "CB",
    "LOAD_SWITCH",
    "DS",
    "ES",
    "CT",
    "VT",
    "CABLE_HEAD",
    "TRANSFORMER_DEVICE",
    "FUSE",
    "SURGE_ARRESTER",
    "GENERATOR_PV",
    "GENERATOR_BESS",
    "GENERATOR_FW",
    "PCS",
    "BATTERY",
]

PackKind = Literal["norm", "manufacturer", "osd"]

# Kanon statusów źródła przejęty z catalog.switchgear (reguła nadrzędna
# rejestru producentów: „nie fabrykuj danych producenta").
ReferencePackStatus = Literal[
    "verified",
    "repo_verified",
    "user_defined",
    "requires_catalog",
    "deprecated",
]


class ReferenceFieldProfile(BaseModel):
    """Profil pola (spec §4): semantyka walidacyjna składu i kolejności aparatów.

    `canonical_order` to szablon kolejności OD SZYNY W DÓŁ; sprawdzenie
    podciągiem obejmuje wyłącznie aparaty TORU GŁÓWNEGO (kindy spoza
    `lateral_only`). Aparaty z `lateral_only` nigdy nie leżą w osi toru
    (SLD_CAD_SPEC_V3 §18.1 / V12K-033) — ich `placement` musi być
    `GROUND_BRANCH` albo `OFF_PATH`.
    """

    profile_id: str
    name_pl: str
    required: list[ApparatusKind] = Field(default_factory=list)
    # Grupy alternatywne (np. funkcja łączeniowa toru pola RMU:
    # rozłącznik ALBO wyłącznik) — grupa spełniona, gdy obecny ≥1 kind.
    one_of_groups: list[list[ApparatusKind]] = Field(default_factory=list)
    optional: list[ApparatusKind] = Field(default_factory=list)
    forbidden: list[ApparatusKind] = Field(default_factory=list)
    canonical_order: list[ApparatusKind] = Field(default_factory=list)
    lateral_only: list[ApparatusKind] = Field(default_factory=list)
    notes_pl: str | None = None


class ReferenceSymbolMapEntry(BaseModel):
    """Wpis słownika symboli (pakiet `iec60617`): kind → symbol IEC.

    `frontend_symbol_id` = `SymbolId` biblioteki v3 (`symbols/defs.ts`);
    `None` dla kindów DER (nie są aparatem pola — renderowane osobno,
    lustro `symbolIdForPrimaryDeviceKind`, parytet egzekwowany testem).
    """

    kind: ApparatusKind
    symbol_name_pl: str
    frontend_symbol_id: str | None = None


class ReferenceRule(BaseModel):
    """Reguła referencyjna (połączeniowa/stacyjna) jako DANA.

    `implemented=True` ⇔ silnik zgodności (`compliance.py`) liczy to
    sprawdzenie. `implemented=False` = reguła udokumentowana w pakiecie,
    egzekwowana gdzie indziej albo PLAN (opis w `description_pl` — uczciwie,
    zero cichych pominięć).
    """

    rule_id: str
    description_pl: str
    implemented: bool = False


class ReferencePack(BaseModel):
    """Wersjonowany pakiet referencyjny (spec §3)."""

    pack_id: str
    kind: PackKind
    name_pl: str
    version: str
    status: ReferencePackStatus
    source_document_refs: list[str] = Field(default_factory=list)
    # WYŁĄCZNIE pakiety `manufacturer`: ref do SWITCHGEAR_FAMILY_REGISTRY —
    # dane rodziny (napięcia, prądy, dozwolone pola/aparaty) mają JEDNO
    # źródło w katalogu; pakiet ich NIE kopiuje (spec §1 pkt 4).
    switchgear_family_ref: str | None = None
    # Referencje warstwy zabezpieczeniowo-sterowniczej producenta (np. karty
    # sterowników polowych e²TANGO — spec §11).
    protection_control_refs: list[str] = Field(default_factory=list)
    field_profiles: list[ReferenceFieldProfile] = Field(default_factory=list)
    symbol_map: list[ReferenceSymbolMapEntry] = Field(default_factory=list)
    station_rules: list[ReferenceRule] = Field(default_factory=list)
    connection_rules: list[ReferenceRule] = Field(default_factory=list)
    notes_pl: str | None = None


# ---------------------------------------------------------------------------
# Raport zgodności (spec §7)
# ---------------------------------------------------------------------------

CheckStatus = Literal["pass", "fail"]


class ComplianceCheck(BaseModel):
    """Pojedyncze sprawdzenie ✓/✗ elementu wobec pakietu (pkt 7 dyrektywy)."""

    element_ref: str
    pack_id: str
    rule_code: str
    status: CheckStatus
    message_pl: str


class PackComplianceReport(BaseModel):
    """Raport per pakiet + Reference Score (spec §7, pkt 8 dyrektywy).

    `score_percent = round(100 · passed / applicable)`;
    `applicable == 0` → `score_percent=None` + „nie dotyczy" (uczciwe —
    zero sztucznych 100% na pustych danych).
    """

    pack_id: str
    name_pl: str
    kind: PackKind
    version: str
    applicable: int
    passed: int
    failed: int
    score_percent: int | None
    checks: list[ComplianceCheck] = Field(default_factory=list)


class ReferenceComplianceReport(BaseModel):
    """Pełny raport zgodności referencyjnej projektu (deterministyczny)."""

    packs: list[PackComplianceReport] = Field(default_factory=list)

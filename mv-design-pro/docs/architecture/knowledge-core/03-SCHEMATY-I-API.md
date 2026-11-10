# 03. EKC — SCHEMATY TECHNICZNE, API, RELACJE, PERSISTENCJA

**Charakter:** kontrakty proponowane, nie pliki implementacji. Priorytet: zgodność z obecnym Pydantic ReferencePack i endpointami /api/reference/*; wersje schema pozostają niezależne od wydań norm. Dokument zawiera typy i przykłady projektowe, nie wykładnię normy.

## 1. Model relacyjny (propozycja DDL)

Dla interoperacyjności i spójności transakcyjnej rozważyć tabele w istniejącym persistence/UoW; oddzielne store logicznie, nie koniecznie osobna baza.

~~~sql
CREATE TABLE ekc_document_families (
  family_id TEXT PRIMARY KEY,
  publisher TEXT NOT NULL,
  class TEXT NOT NULL,
  designation TEXT NOT NULL,
  jurisdiction TEXT,
  title_pl TEXT,
  created_at TIMESTAMP NOT NULL
);
CREATE TABLE ekc_editions (
  edition_id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES ekc_document_families(family_id),
  edition_label TEXT NOT NULL,
  language TEXT, publisher_release_date DATE,
  valid_from DATE, valid_to DATE,
  source_status TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL,
  UNIQUE(family_id, edition_label, language)
);
CREATE TABLE ekc_artifacts (
  artifact_sha256 TEXT PRIMARY KEY,
  mime TEXT NOT NULL, byte_size BIGINT NOT NULL,
  page_count INTEGER, storage_uri TEXT NOT NULL,
  license_class TEXT NOT NULL, entitlement_ref TEXT,
  access_scope TEXT NOT NULL, indexed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL
);
CREATE TABLE ekc_edition_artifacts (
  edition_id TEXT NOT NULL REFERENCES ekc_editions(edition_id),
  artifact_sha256 TEXT NOT NULL REFERENCES ekc_artifacts(artifact_sha256),
  role TEXT NOT NULL, source_url TEXT, fetched_at TIMESTAMP,
  PRIMARY KEY(edition_id, artifact_sha256)
);
CREATE TABLE ekc_evidence_anchors (
  anchor_id TEXT PRIMARY KEY, edition_id TEXT NOT NULL,
  artifact_sha256 TEXT NOT NULL, pdf_page INTEGER NOT NULL,
  printed_page TEXT, section_ref TEXT, table_ref TEXT,
  formula_ref TEXT, figure_ref TEXT,
  bbox_json TEXT, content_sha256 TEXT, extraction_method TEXT,
  extraction_quality REAL, original_language TEXT,
  FOREIGN KEY(edition_id, artifact_sha256)
    REFERENCES ekc_edition_artifacts(edition_id, artifact_sha256)
);
CREATE TABLE ekc_knowledge_revisions (
  revision_id TEXT PRIMARY KEY,
  stable_record_id TEXT NOT NULL, kind TEXT NOT NULL,
  payload_canonical_json TEXT NOT NULL, status TEXT NOT NULL,
  authored_by TEXT, reviewed_by TEXT, approved_by TEXT,
  approved_at TIMESTAMP, revision_sha256 TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL
);
CREATE TABLE ekc_record_evidence (
  revision_id TEXT NOT NULL REFERENCES ekc_knowledge_revisions(revision_id),
  anchor_id TEXT NOT NULL REFERENCES ekc_evidence_anchors(anchor_id),
  role TEXT NOT NULL, PRIMARY KEY(revision_id, anchor_id, role)
);
CREATE TABLE ekc_relationships (
  edge_id TEXT PRIMARY KEY, src_ref TEXT NOT NULL,
  relation_type TEXT NOT NULL, dst_ref TEXT NOT NULL,
  evidence_anchor_id TEXT, validated_at TIMESTAMP
);
CREATE TABLE ekc_consumer_bindings (
  binding_id TEXT PRIMARY KEY, record_revision_id TEXT NOT NULL,
  consumer_module TEXT NOT NULL, adapter_name TEXT NOT NULL,
  adapter_version TEXT NOT NULL, capability_id TEXT NOT NULL,
  status TEXT NOT NULL, test_evidence_ref TEXT
);
CREATE TABLE ekc_releases (
  release_id TEXT PRIMARY KEY, manifest_sha256 TEXT NOT NULL UNIQUE,
  manifest_json TEXT NOT NULL, approved_at TIMESTAMP NOT NULL,
  approved_by TEXT NOT NULL, lifecycle TEXT NOT NULL
);
CREATE TABLE ekc_project_locks (
  lock_id TEXT PRIMARY KEY, project_id TEXT NOT NULL,
  case_id TEXT, release_id TEXT NOT NULL REFERENCES ekc_releases(release_id),
  enm_snapshot_sha256 TEXT, catalog_snapshot_sha256 TEXT,
  solver_manifest_sha256 TEXT,
  lock_manifest_json TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL, superseded_by TEXT
);
CREATE TABLE ekc_review_events (
  event_id TEXT PRIMARY KEY, actor_ref TEXT NOT NULL,
  action TEXT NOT NULL, target_ref TEXT NOT NULL,
  before_sha256 TEXT, after_sha256 TEXT, reason TEXT,
  created_at TIMESTAMP NOT NULL
);
~~~

Production storage: exact migration and DB dialect follow existing architecture. For SQLite, no cross-thread writer leakage and serialized publishing. BLOB storing PDF text in the public DB is prohibited; vault and database independent. Retention and backup policy must account for license expiration while preserving historical non-licensed verification metadata.

Indices: editions (family_id, valid_from/to); knowledge stable_record_id and status; anchors (edition,pdf_page,section); graph (src,relation_type),(dst,relation_type); consumer (module,status); project locks (project,case); curated FTS of descriptions; optional vector index only approved or license-permitted excerpts. Migrations additive first, reversible; explicit schema_version.

## 2. JSON schema contract: DocumentFamily and Edition

~~~json
{
  "family_id": "PN-EN-60909-0",
  "designation": "PN-EN 60909-0",
  "source_class": "NATIONAL_STANDARD",
  "publisher": "PKN",
  "jurisdiction": "PL",
  "edition": {
    "edition_id": "PN-EN-60909-0:2016-09:EN",
    "edition_label": "2016-09",
    "language": "en",
    "adopted_from": ["EN-60909-0:2016", "IEC-60909-0:2016"],
    "status_observation": {
      "observed_at": "2026-11-10",
      "catalog_state": "REQUIRES_LIVE_CONFIRMATION",
      "publisher_url": "https://sklep.pkn.pl/"
    },
    "valid_from": null,
    "valid_to": null,
    "relationship_assertions": [
      {
        "type": "RELATED_EDITION",
        "target": "IEC-60909-0:2026",
        "state": "REQUIRES_CROSS_EDITION_REVIEW"
      }
    ]
  }
}
~~~

Important: English/Polish translated title, adopted edition and publisher status must be confirmed individually. Link to an IEC newer edition does not assert Polish PN withdrawal. A standard can be cited in a project with contractual as_of date even if later withdrawn, with a warning.

## 3. Evidence anchor — page accuracy

~~~json
{
  "anchor_id": "anc:iec60909-2016:pdf51:eq33:v1",
  "edition_id": "PN-EN-60909-0:2016-09:EN",
  "artifact_sha256": "76557bba63396e4340fb23deec563eb1fc9fbcc5dff4aef38aacba8b2e903193",
  "pdf_page": 51,
  "printed_page": "IEC 43",
  "section_ref": "7.2.1",
  "formula_ref": "(33)",
  "table_ref": null,
  "coordinate_system": "pdf_points_top_left",
  "bbox": null,
  "extraction": {
    "method": "MANUAL_VERIFICATION_FROM_SCAN",
    "reviewed": true,
    "confidence": null,
    "requires_visual_page_proof": false
  }
}
~~~

The bbox is nullable in legacy imports; new verified visual extraction of scanned mathematics must require bounding box or crop anchor before production. Page numbering is explicit: PDF 51 != IEC printed 43. Never implement universal offset -8 for all documents (annexes have their own page systems); use per-page mapping.

## 4. Record schemas — strong discriminator

~~~python
from typing import Annotated, Literal, Union
from pydantic import BaseModel, Field
from decimal import Decimal

class Quantity(BaseModel):
    name: str
    scalar: Decimal | None = None
    unit: str  # controlled unit registry, not arbitrary display string
    measurement_kind: str  # RMS, PEAK, PHASOR, PER_PHASE, THREE_PHASE, etc.
    direction: str | None = None
    reference_side: str | None = None

class Requirement(BaseModel):
    kind: Literal["REQUIREMENT"]
    stable_record_id: str
    revision_id: str
    modality: Literal["MUST", "MUST_NOT", "SHOULD", "MAY", "INFORMATIONAL"]
    scope_predicate: dict
    required_data_paths: list[str]
    assertion: dict
    exceptions: list[dict] = []
    evidence_anchor_ids: list[str]
    verification_state: str

class Formula(BaseModel):
    kind: Literal["FORMULA"]
    stable_record_id: str
    revision_id: str
    display_latex: str
    symbolic_ast: dict
    inputs: list[dict]  # quantity kind, dimensions, units, base, sign
    output: dict
    applicability: dict
    implementation_binding_id: str | None
    test_vector_ids: list[str]
    evidence_anchor_ids: list[str]

class Table(BaseModel):
    kind: Literal["TABLE"]
    stable_record_id: str
    revision_id: str
    columns: list[dict]
    rows: list[dict]  # stable row key, typed keys, decimals, alternative groups
    footnotes: list[dict]
    interpolation_rule_ref: str | None
    evidence_anchor_ids: list[str]

KnowledgeRecord = Annotated[
    Union[Requirement, Formula, Table],
    Field(discriminator="kind")
]
~~~

Extensible kinds: PARAMETER, DEFINITION, PROCEDURE, TEST_METHOD, SYMBOL, FIGURE, EXAMPLE, GUIDANCE. Do not collapse to one untyped content string. Serialise decimals consistently; deny NaN/Infinity. UUID/ULID may identify review events; stable semantic IDs for records; content hashes for immutable revisions.

## 5. Typed formula — verified 2016 example

~~~json
{
  "kind": "FORMULA",
  "stable_record_id": "iec60909.initial_short_circuit_3phase",
  "revision_id": "rev:iec60909:2016:eq33:1",
  "source": {
    "edition_id": "PN-EN-60909-0:2016-09:EN",
    "anchor_id": "anc:iec60909-2016:pdf51:eq33:v1"
  },
  "display_latex": "I_k'' = c U_n / (sqrt(3) |Z_k|)",
  "symbolic_ast": {
    "op": "DIV",
    "args": [
      {"op":"MUL","args":[{"var":"c"},{"var":"Un"}]},
      {"op":"MUL","args":[{"const_decimal":"1.7320508075688772"},{"op":"ABS","args":[{"var":"Zk"}]}]}
    ]
  },
  "inputs": [
    {"id":"c","quantity":"VOLTAGE_FACTOR","unit":"1","scope":"SC_MAX_OR_MIN"},
    {"id":"Un","quantity":"VOLTAGE_LL_NOMINAL","unit":"kV"},
    {"id":"Zk","quantity":"SHORT_CIRCUIT_IMPEDANCE","unit":"ohm","complex":true}
  ],
  "output": {"quantity":"INITIAL_SYMMETRICAL_SHORT_CIRCUIT_CURRENT_3P","unit":"kA","rms":true},
  "implementation": {
    "owner": "network_model/solvers/short_circuit_iec60909.py",
    "adapter": "SC60909ParameterBundleV1",
    "status": "PROPOSED_NOT_VERIFIED_BY_THIS_PR"
  }
}
~~~

Symbolic AST is a verification/display aid, not runtime eval. Prefer exact sqrt(3) operation instead of hardcoded float in final implementation; example represents schema not a prescribed numerical kernel. Tests should use dimensional analysis, independent calculation and actual repository solver; do not build second SC engine.

## 6. Typed table — IEC 60909 2016 c for SN

~~~json
{
  "kind": "TABLE",
  "stable_record_id": "iec60909.voltage_factor",
  "revision_id": "rev:iec60909:2016:table1:1",
  "source": {
    "edition_id": "PN-EN-60909-0:2016-09:EN",
    "pdf_page": 30,
    "printed_page": "IEC 22",
    "table_ref": "Table 1"
  },
  "rows": [{
    "row_id": "un_gt1_le230",
    "lower": {"value": "1", "unit": "kV", "inclusive": false},
    "upper": {"value": "230", "unit": "kV", "inclusive": true},
    "columns": {
      "cmax": {"decimal": "1.10", "unit": "1"},
      "cmin": {"decimal": "1.00", "unit": "1"}
    },
    "notes": ["edition_2016_only"]
  }],
  "completeness": "PARTIAL_TABLE_EXAMPLE",
  "review_state": "NOT_A_FULL_REPLACEMENT_OF_TABLE_1"
}
~~~

This is one row only; it is not the entire norm table. Source cmin=0.95 in a 15 kV case is not a valid automatic value of this row. A complete record requires all categories, footnotes, alternatives and boundary tests. The importer must not silently replace a complete table with this simplified example.

## 7. ENEA requirement and applicability

~~~json
{
  "kind": "REQUIREMENT",
  "stable_record_id": "enea.sn.z1.prefab_compact.bay_composition",
  "revision_id": "proposal:enea:snz1:2024:0431",
  "source": {
    "edition_id": "ENEA-SN-Z1:06.2024",
    "section_ref": "4.3.1",
    "printed_page": "12/37",
    "evidence_state": "VERIFY_AGAINST_CURRENT_OFFICIAL_ARTIFACT"
  },
  "modality": "MUST",
  "scope_predicate": {
    "all": [
      {"path": "case.operator_profile_id", "eq": "enea"},
      {"path": "station.construction", "eq": "PREFAB_COMPACT"},
      {"path": "station.variant", "eq": "Z1_STANDARD"},
      {"path": "station.lifecycle", "in": ["NEW", "REBUILD"]},
      {"path": "source_effective_date", "gte": "2025-01-01"}
    ]
  },
  "required_data_paths": [
    "station.construction",
    "station.variant",
    "station.lifecycle",
    "station.bays"
  ],
  "assertion": {
    "transformer_bay_count": {"eq": 1},
    "line_bay_count": {"gte": 2, "lte": 4}
  },
  "missing_data_policy": "NOT_EVALUATED",
  "implementation_status": "PROPOSED_REQUIRES_ADAPTER_AND_TESTS"
}
~~~

This structure is a design example informed by the archived PR #493; the exact date applicability, exceptions and current text must be checked against the official edition and contract. Do not enforce merely from this spec. The legacy Bay model may lack station.variant and lifecycle: a safe migration marks NOT_EVALUATED until there is sufficient data or a validated compatibility rule.

## 8. Applicability DSL — full operator contract

Canonical AST nodes: ALL, ANY, NOT; FIELD:EQ, NE, IN, PRESENT, ABSENT; numeric LT/LTE/GT/GTE/RANGE open/closed, DATE interval (timezones UTC store, local date semantics), KIND, UNIT_TYPED_NUMERIC, edition active, cross-source relationship. Never accept user-supplied Python/SQL expression; typed parser with allowlisted ENM/case/catalog paths; no arbitrary attribute traversal.

Evaluation returns:
- result: APPLIES | NOT_APPLICABLE | UNKNOWN_DATA | CONFLICT;
- resolved context;
- used input paths (including provenance and version);
- missing fields;
- rule_revision and source edition;
- exact evaluator software version;
- deterministic digest of inputs and outcome.
Tri-state logic must preserve UNKNOWN; do not collapse AND unknown into false unless another predicate false proves NOT_APPLICABLE.

## 9. Releaser / resolver — manifest

~~~json
{
  "schema_version": "ekc.release.v1",
  "release_id": "ekc:release:<content_sha256>",
  "title": "MV-DESIGN-PRO ENEA/SC baseline",
  "approved_at": "example-not-an-actual-release",
  "editions": [
    {"edition_id": "PN-EN-60909-0:2016-09:EN", "artifact_sha256": "<64 hex>"},
    {"edition_id": "ENEA-SN-Z1:06.2024", "artifact_sha256": "<64 hex>"}
  ],
  "approved_revision_ids": [
    "rev:iec60909:2016:eq33:1",
    "rev:iec60909:2016:table1:1"
  ],
  "consumer_bindings": [
    {"id": "SC60909ParameterBundleV1", "version": "1", "tests": ["SC_T_001"]}
  ],
  "dependency_closure_sha256": "<64 hex>",
  "signatures": [],
  "license_policy": {"embed_originals": false}
}
~~~

All angle placeholders mean **illustrative only**, not file-ready valid release. SHA-256 computed from canonical JSON with stable sorted keys, explicit decimal representation and no volatile timestamps inside fingerprint. Digital approval signature optional for prototype but audit identity must be immutable. An edition with no source artifact can be metadata-registered but not released as VERIFIED_CONTENT.

## 10. ProjectKnowledgeLock / norm freshness

~~~json
{
  "schema_version": "ekc.lock.v1",
  "project_ref": "project-id",
  "study_case_ref": "case-id",
  "knowledge_release_id": "ekc:release:<sha256>",
  "operator_id": "enea",
  "jurisdiction": "PL",
  "as_of_valid": "2026-11-10",
  "as_of_known": "2026-11-10T12:00:00Z",
  "contract_refs": [],
  "explicit_overrides": [],
  "enm_snapshot_hash": "<sha256>",
  "catalog_snapshot_hash": "<sha256>",
  "solver_implementation_hash": "<sha256>",
  "immutability": "PINNED"
}
~~~

The final model should reference existing case/twin key; do not introduce an alternative project identifier. Distinguish result freshness after ENM change (model_stale) and normative basis superseded (knowledge_update_available) and source artifact integrity failure (source_unavailable). A historical case can remain valid-for-its-basis despite new publications.

## 11. API proposal (additive routes)

Existing V1:
GET /api/reference/packs
GET /api/reference/packs/{pack_id}
GET /api/cases/{case_id}/reference/compliance

Proposed V2 with typed Pydantic response models and pagination:
GET /api/reference/v2/documents?class=&publisher=&designation=
GET /api/reference/v2/documents/{family_id}/editions?as_of_valid=
GET /api/reference/v2/editions/{edition_id}/sections
GET /api/reference/v2/records?kind=&source=&edition=&status=&query=
GET /api/reference/v2/records/{revision_id}
GET /api/reference/v2/evidence/{anchor_id}  [auth check; metadata or permitted preview]
POST /api/reference/v2/resolve [project context, candidate editions, resolution options]
POST /api/reference/v2/parameter-bundle [consumer capability, lock, scenario]
POST /api/reference/v2/evaluate [read-only ENM/reference compliance]
GET /api/reference/v2/releases
GET /api/reference/v2/releases/{release_id}/manifest
GET /api/reference/v2/cases/{case_id}/lock
POST /api/reference/v2/cases/{case_id}/migration-preview
GET /api/reference/v2/impact?from_release=&to_release=&module=
POST /api/reference/v2/imports [authorized upload metadata; original bytes private]
POST /api/reference/v2/records/{revision_id}/review [authorized]
POST /api/reference/v2/releases/build [authorized; validation gate]
POST /api/reference/v2/releases/publish [authorized, idempotent]

Security: private evidence endpoint does not return full text to unauthorized users. Read APIs may return 404 or 403 per threat model; no inference of confidential contents via search suggestions. Writes need idempotency keys, optimistic concurrency revision/version, audit events; publication must be a single transaction.

### 11.1 Resolve response

~~~json
{
  "resolution_id": "sha256-of-context-and-release",
  "status": "CONFLICT",
  "release_id": "ekc:release:...",
  "context": {"operator":"enea","Un_kV":"15","station":"PREFAB_COMPACT"},
  "applied_rule_revision_ids": [],
  "not_applicable_rules": [],
  "not_evaluated_rules": [{"rule_id":"...","missing":["station.variant"]}],
  "conflicts": [{"conflict_id":"...","source_revision_ids":["...","..."]}],
  "source_integrity": "VERIFIED_ARTIFACTS",
  "warnings": []
}
~~~

### 11.2 ParameterBundle response

~~~json
{
  "schema_version": "sc60909.bundle.v1",
  "consumer": "SC_IEC60909",
  "scenario": "MAX",
  "basis": {
    "knowledge_release_id": "ekc:release:...",
    "edition_ids": ["PN-EN-60909-0:2016-09:EN"]
  },
  "parameters": {
    "voltage_factor": {
      "decimal": "1.10",
      "unit": "1",
      "record_revision_id": "rev:iec60909:2016:table1:1",
      "table_row_id": "un_gt1_le230"
    }
  },
  "unverified_assumptions": [],
  "missing_required_inputs": [],
  "bundle_hash": "<sha256>"
}
~~~

Do not construct parameter bundles from a live AI answer; same release/context yields same bundle hash. If user forces a different voltage factor, preserve assumption and source mismatch in trace, not pretend source approved it.

## 12. Error codes and failure reporting

Mandatory explicit codes:
EKC_SOURCE_UNAVAILABLE, EKC_SOURCE_HASH_MISMATCH,
EKC_SOURCE_ACCESS_DENIED, EKC_EDITION_UNKNOWN,
EKC_EDITION_NOT_EFFECTIVE, EKC_AMENDMENT_BASE_MISSING,
EKC_EVIDENCE_UNVERIFIED, EKC_FORMULA_AMBIGUOUS,
EKC_TABLE_CELL_AMBIGUOUS, EKC_UNITS_INVALID,
EKC_APPLICABILITY_MISSING_DATA, EKC_APPLICABILITY_CONFLICT,
EKC_CONSUMER_BINDING_MISSING, EKC_ADAPTER_UNTESTED,
EKC_RELEASE_NOT_APPROVED, EKC_LOCK_MISMATCH,
EKC_UPGRADE_REQUIRES_CONFIRMATION, EKC_NO_VERDICT.

No 200 OK with pass=true for unresolved. Internal integration errors should not leak private content. Each error contains correlation_id, source refs without restricted excerpts, required action, retryable boolean, affected element IDs when permitted.

## 13. Temporal and version API hazards

A source's valid_from can be retroactively corrected without changing historical transaction time. Store all observations and approvals. API must choose (known at X, valid at Y), never use today implicitly for a project calculation unless chosen on project creation. Explicit support for edition family supersession, amendment cumulative effects, and issued date vs applied date. A newer IEC edition does not automatically supersede PN edition. A conditional ENEA rule applies only to its correct subvariant and construction timeframe.

## 14. Tests as code contracts

Schema tests: discriminator handling, SHA canonicalization stability (key-order, decimals, timezone), UTF-8 PL names, null/unknown handling, isolation of date semantics, no UUID drift in release hash, ACL enforcement, cross-entity foreign keys, concurrency approval collision. Fuzz DSL bounds: bad units, missing field, NaN, sparse arrays, date in 1900/2100, duplicate row IDs, conflicting footnotes. Contract compatibility tests against existing reference_engine V1 and UI2; no breaking change to read routes.

Integration tests:
- fixture of scanned IEC PDF with page mapping, formula and table provenance;
- ENEA edition 06.2024 with partial station variant and UNKNOWN_DATA;
- R4 educational material imported as GUIDANCE, never promoted to REQUIREMENT automatically;
- edition update generates affected consumers without stale old results;
- user without PDF license receives citation metadata but not PDF body;
- golden old project reopens and emits same result under same lock;
- reverse index from code adapter to source record works.

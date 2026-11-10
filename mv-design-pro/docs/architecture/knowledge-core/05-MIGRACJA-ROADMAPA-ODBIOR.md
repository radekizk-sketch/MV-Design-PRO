# 05. EKC — MIGRACJA, PROGRAM WDROŻENIA, DOWODY I BRAMKI ODBIORU

**Typ:** program delivery; plan nie jest autoryzacją do automatycznego merge lub przebudowy produkcyjnej. **Priorytet P0:** poprawność obliczeń i zachowanie starych snapshotów. Zero akceptacji „testy zielone” bez inspekcji żywej aplikacji i źródła.

## 1. Inwentaryzacja i konflikt poprzednich prac

### 1.1 Stan main stwierdzony 2026-11-10

W repo istnieje backend/src/reference_engine/{models,registry,compliance,validation,field_configuration_catalog}.py i packs (IEC60617, IEC62271, producenci, osd_enea). Existing ReferencePack contains pack_id, kind norm/manufacturer/osd, version, status, source_document_refs, field_profiles, symbol_map, cell configurations, station_rules and implemented Boolean. Aktualne API: GET /api/reference/packs, GET /api/reference/packs/{id}, GET /api/cases/{case_id}/reference/compliance. Reference profile data interacts with ENM validation. Project has separate catalogs, analysis flows, proof packs, current solver modules. Preserve these interfaces until demonstrably superseded.

### 1.2 PR #493 — open draft, not merged

Branch codex/enea-knowledge-e2e-20261023; 18 files (according to GitHub PR file list); includes:
- source_catalog.json: 25 standard documents and two IRiESD in catalog as per 2026-10-23 inventory, not proof of complete operator document corpus;
- curated_requirements.json: verified requirements for selected ENEA standards, edition/section/page and date;
- enea_questions.py and reference Engine API, UI EneaQuestionPanel.tsx and EneaSourceDocuments.tsx;
- scripts/enea_knowledge.py: sync, audit, FTS5 index, local private storage, handling OCR;
- CI workflow for audit; documentation with operational limitations.

Important documented discrepancy: standard ENEA Z1 legacy reference pack had earlier edition 09.2021-2, while PR #493 source catalog identifies Z1 06.2024 effective 2025-01-01. Full old rule cross-audit was NOT completed; do not mark existing implemented rules current without it. PR documentation mentions previous temporal behavior, local index not always runtime API enabled, need to inspect current branch source before reusing. Do not blindly rebase this feature; cherry-pick by explicit diff and migration plan.

### 1.3 PR #521 — closed draft, not merged

Branch feat/kb-iec60909-2016-provenance; 17 files under docs/knowledge/iec60909_2016. Latest described R4: 230 knowledge cards, 9 sources, 79 proposed rules, FTS5 and HTML offline. Sources include IEC 60909-0:2016, 60909-3, 62271-1, EN 50160 A1, PTPiREE NC RfG v3, educational materials and metering forms. Evidence includes printed page/PDF page, hand curated summaries and source SHA256. **Not integrated into P0 solver; tests execution and CI not necessarily completed; not a production knowledge engine.**

Avoid promoting stale file paths named iec60909_2016 as global schema. Migrate records into typed relational registry preserving original source IDs and adding crosswalk. Distinguish proposed rules from approved/released rule implementations. R4 card count is inventory, not compliance percentage.

### 1.4 Required inventory output

Before first implementation PR, produce report:
- all sources, editions, SHA, source licenses, number of pages, source release;
- duplicate semantic rules across reference_engine packs, R4 and ENEA curated requirements;
- source status and known contradictions (ENEA Z1, 60909 editions, missing A1/base of 50160 etc);
- data paths and ownership in ENM, catalog and solver;
- API/UI consumers, indexes and code paths;
- branch status, merge base, ahead/behind, tests in both PRs;
- recommended reuse vs archival vs rejection at per-file/per-record granularity;
- risk matrix (severity/likelihood/mitigation).

Must not infer that source of 2026 is fully available just because official IEC webstore has listing. Never infer entire set of ENEA standards has been validated when 25 PDF pages were downloaded.

## 2. Stepwise architectural migration (no big bang)

**Stage 0 — evidence baseline / freeze**
- branch from current main;
- write test baselines for current ReferencePack schema, REST API, ENM runtime and UI2 referencje;
- compare old work PR #493/#521; record source license and publication status;
- define source/edition/record crosswalk + metadata-only migration;
- failure is documented with named reason; no merge production change.

Gate G0: technical map, duplicate report and baseline hashes reviewed; no source ambiguity falsely classified solved.

**Stage 1 — generalized document registry**
- additive models for DocumentFamily, DocumentEdition, ArtifactReference, PageMapping, SourceObservation and change relations;
- importer accepts metadata-only; no copied PDFs, no OCR code path required yet;
- migrate sources of osd_enea and preexisting references, keep original pack.json V1 unchanged;
- add list/find/read API v2, compatibility V1 tests.

Gate G1: two different IEC/PN editions can coexist; ENEA Z1 revisions coexist; no V1 API change; no source content leakage.

**Stage 2 — Evidence and Curation**
- private vault and safe file intake; security, sha256 and page count;
- optional existing ENEA sync adaptation with SSRF/licensing audit;
- OCR/text extraction, page mapping and CANDIDATE record types;
- curated verified anchors and quality gates, no release implied.
- migrate R4 cards as explicit historical evidence or proposal; flag missing complete source.

Gate G2: scanned IEC page 30/51 map correctly; Dołęga bad encoding safely diagnosed; missing footnote rejects auto approval; source ACL tested.

**Stage 3 — Release, resolver, project lock**
- immutable KnowledgeRelease and typed Applicability DSL;
- authorizable curator/reviewer/publisher flows; separate status for source, interpretation, adapter;
- project lock to existing case/twin object, not duplicate project identity;
- editor UI for edition/source and profile selection; old current case locks preserved.

Gate G3: pinned old case deterministic after publishing new release; explicit conflict and missing scope states; no unstated override of OSD.

**Stage 4 — First end-to-end cut (P0 SC)**
- select ONE vetted IEC 2016 table row and eq (33) with reviewed anchors, plus selected existing solver adapter;
- validate cmax/cmin with exact voltage ranges, while retaining current default / user assumption detection without changing solver silently;
- ParameterBundle with provenance and unit checks, consumed by current short circuit computation in a controlled mode;
- independent numerical test and whitebox trace from result to formula/table;
- side-by-side old and new results with no unintended delta; no upgrade to IEC 2026 unless reviewed separately.

Gate G4: complete source -> trusted record -> resolved bundle -> live solver -> exact result trace; P0 tests/goldens unchanged unless explicit approved physical correction.

**Stage 5 — ENEA vertical check**
- reconcile ENEA Z1 editions and all existing osd_enea implemented rules;
- build scoped rule(s) for prefabricated station variant with adequate ENM fields;
- preserve missing-data behavior and exact edition;
- return compliance via existing API adapter; inspector shows source;
- ensure NO semantically true but stale operator rules.

Gate G5: new vs rebuilt vs existing, Z1 vs Z2 vs Z3, unknown variant, source edition; verified against actual PDF and independent reviewer; no false PASS.

**Stage 6 — Broad module adoption**
- switchgear/CT/VT/GPS field profiles, LF/quality, OZE/RfG/PTPiREE, EAZ/telemechanika, cables/overhead, nN/earthing, manufacturer catalogs, reports and AI.
- Each area produces consumer bindings, at least one actual vertical E2E, negative test and source evidence.
- Current code owns physics; approval step for normative threshold changes must be independent of code deployment.

Gate G6: per module trace and impacts; imported record count not mistaken for functionality coverage.

**Stage 7 — Operations and cross-project adoption**
- monitoring publications/change detection, release diff, impact graph;
- project migration preview with explicit approval/undo snapshots;
- authorization, backups, retention, multi-tenant load, SN-SAG-LAB readonly contract if agreed;
- release lifecycle policy and disaster restore.

Gate G7: monitoring source change does not alter results; disaster restore reproduces historical report; unauthorized access impossible; clear ownership/maintenance instructions.

## 3. Dependency and risk ordering

Do first: identity/editions, evidence, ACL, scope statuses, lock, no fake PASS.  
Do next: selected SC and ENEA E2E (smallest valuable vertical cuts).  
Do later: complex semantic diff embeddings, external MCP, vector retrieval, automated suggest-for-review, multi-OSD and publication monitor.  
Do not do without evidence: live norms used by solver, independent formula interpreter, duplicated apparatus catalogs, a whole new UI hierarchy or new microservices.

Estimated engineering effort cannot be asserted without code baseline/CI and decision on storage or license. Implementer estimates after G0.

## 4. Exact acceptance suite taxonomy

### Source and editions
SRC-001 Byte exact sha256 and identical file dedupe; preserve multiple origins.
SRC-002 Correct IEC vs PN publisher and adoption relationship.
SRC-003 Date issue/current/effective/withdrawn distinct; source status confirmed by official publisher.
SRC-004 Amendment A1 cannot make base norm complete.
SRC-005 Historical edition and current edition simultaneously resolvable by date and project.
SRC-006 JSON schema checks do not imply manual review.
SRC-007 2026 IEC new release does not modify 2016 pinned output.
SRC-008 ENEA Z1 revision conflict detected.
SRC-009 IRiESD card and consolidated text dependency, with rollback.
SRC-010 Unknown source gives no conclusion about nonexistence of rule.

### Extraction quality
OCR-001 Scanned PDF has correct page count and text extraction attempts.
OCR-002 Math I''k, conjugation, √3, κ, superscripts and subscripts visual review.
OCR-003 Numeric comma interpreted precisely (1,10 not 110).
OCR-004 Printed page vs PDF index for IEC and multi-annex PTPiREE.
OCR-005 Table merged headers/alternatives/notes not flattened.
OCR-006 Damaged Polish encoding warns and prevents automatic approval.
OCR-007 Null/empty pages not converted to false evidence.
OCR-008 Rotation and crop mapping robust.
OCR-009 Single changed PDF page does not orphan unrelated approved anchors without impact report.
OCR-010 license redaction and no public text index.

### Domain & compliance
CMP-001 APPLIES/NOT_APPLICABLE/UNKNOWN_DATA/CONFLICT logic; no false PASS.
CMP-002 Existing pole-mounted station rule applied only to correct lifecycle.
CMP-003 Variant Z1 vs Z2 incomplete -> NOT_EVALUATED.
CMP-004 CT/VT and relay classification; Ferranti is residual CT.
CMP-005 I''k vs peak and breaking current separate.
CMP-006 ENEA minimum specs vs manufacturer device rating use matched quantities.
CMP-007 15kV min c=1.00 IEC2016, 0.95 manual variant recognized.
CMP-008 IEC2026 unknown interpretation cannot appear approved automatically.
CMP-009 Private source reference may be cited only to authorized person.
CMP-010 project-specific approved deviation does not change global rule.

### Solver/ENM/whitebox
SC-001 Independent 3F mathematical baseline.
SC-002 2F and ground sequence impedance.
SC-003 MAX/MIN independent assumptions, temperatures.
SC-004 Source current contributions and PV/BESS model limitations.
SC-005 Result trace source release, formula and parameter row.
LF-001 P+jQ balance and correct directional sign.
LF-002 Voltage/reactive compensation effect.
LF-003 Asymmetric phase model no zero sequence leakage across delta.
ENM-001 Source update without topology change does not change ENM hash.
ENM-002 Topology mutation invalidates numerical result not necessarily norm source.
ENM-003 New release only changes normative freshness flag.
CAT-001 Catalog source family ID and device product revision pinned.
SLD-001 NO parity all LOD and no nN overlay in SN.
DOC-001 Report/archives preserve lock and reproducibility.

### Security, temporal & failure
SEC-001 User without entitlement cannot retrieve binary/text/private search result.
SEC-002 Ingestion PDF cannot execute JavaScript, shell, external link injection.
SEC-003 LLM prompt injection in PDF is treated as data.
SEC-004 Uploaded URL cannot reach internal network (SSRF).
SEC-005 Private PDF and vector/text indexes not committed to GitHub or static assets.
SEC-006 Upload quotas and parser sandbox do not hang service.
TIME-001 valid_at vs known_at queries differ where corrected later.
TIME-002 publication day vs effective day both handled.
TIME-003 duplicate simultaneous standard applicability yields conflict not arbitrary auto choice.
CONC-001 Two reviewers/agents cannot publish conflicting revisions via race.
CONC-002 Branch migrations leave old releases intact.
REST-001 Disaster restore brings old lock, records, tests and hashes.
API-001 Backward compatible existing /api/reference/*.
UI-001 Inspection source page, conditions, allowed access.
UI-002 Live case uses release pinned in underlying backend, not browser local mutable text.

## 5. Engineering E2E reference scenarios

**E2E-EKC-01 / SC:** Upload licensed PN-EN 60909-0:2016 scan (private). Verify PDF30 table1 row Un>1kV<=230kV and PDF51 Eq33. Approve records, publish release, lock 15kV case; compute I''k from actual source Sk''/R/X and trace voltage factor. Produce proof pack citing page. Ingest IEC2026 metadata; old case bit-identical. Deliberately request cmin=0.95: explicit assumption status/variance, not approved tabular 2016 value.

**E2E-EKC-02 / ENEA:** Ingest official Z1 06.2024 and legacy 09.2021-2 metadata. Build edition-specific bay-composition rule for correct prefab station variant; test new/rebuild/existing, Z1/Z2, unknown variant, remote CT/VT when telemechanics applies. Compare existing osd_enea rule behavior and log version delta. Do not allow automatic legacy rule PASS if source edition mismatch.

**E2E-EKC-03 / OZE:** Use PTPiREE v3.0 main doc and named annex(s) with correct per-part pages; map type B PGM applicability, Q(U)/LFSM-O requirements only after source verification; attach ENEA IRiESD date, conditions, certificate and inverter revision; return missing-data and source-based test plan. No signed acceptance until independent evidence.

**E2E-EKC-04 / Catalog SW:** Given ENEA field nominal minimum and manufacturer datasheet, evaluate Ur, Ir, short-time withstand Ik/time, peak Ipk, IAC and breaking where relevant as distinct facets; resulting compliance each item cites different governing source when applicable. Breaker withstand cannot stand in for interrupting capacity.

**E2E-EKC-05 / Historic:** Export proof pack under old release. Publish newer ENEA doc with changed rule. Case remains pinned old release and old report unchanged; new case selects updated release. Migration preview lists affected entities, needs human decision, creates new snapshot and provides before-after.

**E2E-EKC-06 / Wrong rights:** User without access may locate existence and citation metadata if allowed, but cannot download/source-search confidential PDF. Any attempt is audited; no exposed snippet from logs, vector index or inline report.

## 6. Minimum PR strategy and gates

An implementation PR must contain only one vertical slice and include:
- source documents identified by edition, official reference, artifact metadata, license;
- schema + migrations + source refs and unit contracts;
- typed payload example and consumer adapter;
- tests unit/integration/negative/source+regression, relevant golden and UI screenshot if UI changed;
- proof of live endpoint and UX behavior (not only mocks);
- register of known gaps and unresolved interpretation;
- review by another technical agent and independent normative validation;
- unchanged ENM/SLD unless explicitly justified and tested;
- rollback/feature flag, revision history, impact report;
- commit and PR links, complete test command/output, exact baseline SHA.

No blanket „implement all standards” ticket should be considered DONE. Deliverability is measured per record class/consumer and verified source coverage.

## 7. Documentation sync and acceptance authority

Update canonical architecture docs only after explicit decision. A new EKC-ARCH-V1 should not silently supersede REFERENCE_ENGINE_SPEC_V1 or PRODUCT_CAPABILITY_CONSTITUTION. The implementation agent records conflict/migration plan (supersedes, integrates, keeps) in an ADR approved by owner. For source conflicts, a normative reviewer is needed; for code/regression, engineering reviewer; for release visibility/UX, product owner. Approval of all three is required for a fully live normative check.

## 8. Operational observability and SLO targets (proposals, not promises)

Count registered editions, available artifacts, indexed pages, failed OCR, verified formula/table rows, review backlog, approved rules, enforced adapters, untested bindings, missing sources, stale references, blocked project cases, ACL-denied requests, release build failures, SOURCE_HASH_MISMATCH, historical replay failures. Log IDs and timings, not licensed full text. Trace each import job with correlation ID; gather performance evidence. SLO for search latency and throughput to be set after measuring corpus size and deployment environment, not invented in spec.

## 9. Rollback and emergency procedure

If an incorrect normative rule is discovered:
1. mark affected release as REVOKED_FOR_NEW_USE (not deleted);
2. locate all ProjectKnowledgeLocks and runs via reverse graph;
3. issue affected-projects report and corrected interpretation revision;
4. publish new release after source/evaluator audit and tests;
5. let owners explicitly rerun affected calculations and archive new results;
6. historical results remain retrievable with visible revoked-basis warning;
7. if safety-critical result at risk, block new signoff/report approval pending review;
8. document incident timeline, proof and restoration.

Rollback can restore old package for reproducibility but must not silently continue wrong rule as authoritative for new designs. A source URL removal alone does not erase already approved history, subject to legal retention rules.

## 10. Delivery dashboard (status vocabulary)

NOT_STARTED; INVENTORIED; SOURCE_REGISTERED; ARTIFACT_VERIFIED; EXTRACTED; MANUAL_REVIEWED; APPROVED; CODE_BOUND; TESTED; RELEASED; INTEGRATED_UI; LIVE_E2E; REJECTED/BLOCKED. Keep source quality separate from implementation quality. Progress metrics by module from 02; no headline „100% standards done” based on counts alone.

## 11. Final executable DoD

No implementation is READY until:
- V1 API and existing production flows unaffected;
- source actual edition/page/appendix and license validated;
- typed AST, units and predicates reviewed independently;
- compliance reports NOT_EVALUATED for missing data;
- accepted records actually used in one real consumer;
- tests on actual ENM/run and live interface passed;
- release/project lock deterministic, reproducibility demonstrated;
- source change impact list works;
- archiving and audit capture applied edition and source;
- proof docs and PR are accessible; reviewer independently signs decision;
- owner approves migration and merge.

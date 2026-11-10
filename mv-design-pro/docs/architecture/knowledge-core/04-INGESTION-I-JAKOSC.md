# 04. EKC — INGESTION, PARSOWANIE PDF, OCR, KURATORSTWO, JAKOŚĆ I LICENCJE

**Cel:** jednakowa ścieżka dla kolejnych norm IEC/PN-EN, standardów ENEA/OSD, IRiESD, praw, kart katalogowych, instrukcji i materiałów dydaktycznych — bez traktowania ich jako źródeł tej samej rangi.

## 1. Tryby wejścia i kontrakt

Dopuszczone źródła: ręcznie przesłany PDF z licencją użytkownika; oficjalny publiczny URL i bezpieczna kopia z uprawnieniami; DOCX/HTML/XML/CSV/XLSX jeśli własne lub legalnie dostępne; metadane dokumentu bez pełnych bajtów; rysunki/załączniki katalogowe. Każde źródło ma source_class, publisher, verified_origin, licensing, access scope, language, owner, publication date, date of application, document family and edition. Nie zakładać, że metadane z nazwy pliku są poprawne. Deduplikacja sha256 jest operacją bajtową, nie identyfikacją edycji.

Przykłady:
- załącznik 60909 2016.pdf: skan 82 stron; potrzebny high-quality vision/manual evidence, nie prosty pdftotext;
- dolega_stacje_elektroenergetyczne.pdf: warstwa tekstowa uszkodzona w części polskich znaków; cytowanie oparte na zrzucie strony i zweryfikowanym fragmencie;
- xWyklad_20_Praca_SN.pdf: wykład o obliczeniach SN symetrycznych/niesymetrycznych; posiada równania i rysunki, status źródła EDUCATIONAL, nie NORMATIVE;
- ENEA oficjalne PDF-y: publiczne URL nie oznacza automatycznie prawa do publicznej redystrybucji treści;
- IRiESD tekst ujednolicony plus karty aktualizacji: powiązania amendments i printed pagination.

## 2. Fazy pipeline

**INTAKE:** stworzenie Job z content type, MIME sniffing, size/page limits, quota, sha256, source URL (allowlisted provider, SSRF prevention), user/tenant/license; antivirus/security scanning; zachowanie readonly original; idempotent import(key=sha256+edition candidate).

**PRE-FLIGHT:** PDF structure inspection (pages, text layers, encryption/password, rotated scans, embedded fonts, invisible glyphs, malformed object stream, scanned images, tables and formulas). Zapis raportu diagnostycznego per strona. Rozróżnić FORM_TEXT / VECTOR_MATH / SCAN / MIXED / BAD_ENCODING / IMAGE_ONLY / ROTATED.

**PARSE TEXT:** PDF text and layout extraction with bounding boxes; separate headings, paragraphs, footers, footnotes; ignore repeated watermarks only after preserving evidence. Obliczenia na wzorach z bitmap/drukowanej treści nie mogą polegać na zlepionym OCR plain text.

**VISUAL/SCAN:** raster per page at suitable DPI for review; OCR języka PL/EN only where necessary; reading order and cropped region; equations/tables are separate visual recognition tasks. No invention of subscript or fractions. Every region gets original image anchor and extraction confidence.

**STRUCTURE:** parse hierarchy chapters/subchapters, clauses (3.2.1), equation numbers (33), table identifiers, diagram caption, annex identifiers and normative/informative status. For document with independent annex pagination create document_part_id and per-page page_mapping.

**EXTRACT SEMANTICS:** requirements (modal verbs, conditions and exceptions), formulas with variables and units, tables incl. multiline header, merged cells, alternatives, notes, cross references; references to product norms, OSD and amendments; content types with evidence. Automatic stage returns only CANDIDATE and uncertainty.

**CURATE:** human-assisted compare side-by-side original crop and typed candidate; reviewer checks number signs, decimal commas, OCR uncertainty, edition, status, applicability, footnotes, citations and units. Difference in conditions or table footnotes is a blocker. Two-stage approval for high-risk calculations (extractor != independent reviewer). Signing and evidence logged.

**RELEASE:** validate referential integrity, hash, license, source completeness, exact editions, adapter tests; create immutable knowledge release; publish only with explicit approve role.

## 3. Page and anchor model

A page has:
- source artifact sha256;
- page_pdf (1-based), page_label (e.g. iii, 17, Annex A:3), printed_page, section path, part/annex label, image orientation;
- original pixel/point crop region, coordinate convention, transform version;
- extraction_run_id, engine and version, OCR languages, uncertainty;
- text fingerprint of region (where license permits), reviewed flag and timestamp.

Never hard-code printed page = PDF-8 globally: in PN-EN 60909-0:2016 scanned sample a local mapping happens to show IEC 43 at PDF page 51, but ENEA and PTPiREE annexes have different numbering. Print page numbers in citation *as printed* plus separate PDF page. If edition artifact changes but pagination identical, old anchors still point to old hash.

## 4. Formula recognition gates

Mandatory checks before VERIFIED_FORMULA:
1. Every math operator read correctly, including numerator/denominator, sqrt/power, prime/double prime, bar/conjugate, sign, absolute value, sum and product indices.
2. Symbol glossary: c, U_n, Z_k, I''k, Ip vs I_k; no OCR confusions (l/I, 0/O, 1/l, minus/plus, Greek κ/k).
3. Type/units: V vs kV, Ω vs mΩ, percent vs per unit, RMS vs peak, AC vs DC, phase vs line, instantaneous vs steady state, complex conjugation.
4. Formula scope and valid assumptions: single fed vs multiple fed, symmetric vs asymmetrical, source class, maxima/minima and temperature.
5. Cross-references to tables/figures and footnotes retained; no implicit interpolation.
6. Independent numeric test vector or algebraic check, when meaningful.
7. Reviewer links the verified formula revision to concrete implementation binding in existing solver; source record itself does not execute.
8. If formula cannot be disambiguated from original, reject candidate or mark UNVERIFIED.

Example IEC 60909 2016: use image of PDF page 51 and original clause 7.2.1 to verify equation (33). The OCR extracted text on page cannot be trusted alone. Diligence for 2026 edition repeats independently, not inherited by number.

## 5. Table recognition gates

Hard cases: merged header, two test conditions in one row, alternative pairs in voltage withstand, conditions below footnote, units in row header, repeated table across pages, tolerance columns, cells with ≥ vs >, cells „not applicable”, percent of rated vs absolute. Each cell stores value, exact decimal, unit, row key, column key, table version and source bbox, plus if that value is normative vs informational.

Validation:
- structural: row and column counts, no orphaned units and references, unique stable IDs;
- semantic: ranges nonoverlapping unless source explicitly has alternative conditions, row applicability, exact endpoints and footnotes;
- numeric: independent sample queries on both interval edges, no inferred gaps, alternative combinations preserved;
- visual: reviewer opens source cell and full caption.
Tables must encode alternate groups rather than flattening e.g. 62271-1 insulation levels into one mandatory numerical choice. In doubt publish table metadata as evidence-only; do not feed automatic selection.

## 6. Change detection and comparison

Monitoring obtains source URL, ETag, Last-Modified, SHA256 if allowed, publisher edition identifier, issue/effective/withdrawal dates. Changed checksum alone -> NEW_ARTIFACT_CANDIDATE; it might be a server re-export with no substantive change. Verify whether content changed, edition changed, attachment added, page changed, link redirected or access denied.

Comparison levels:
L0 binary/checksum;
L1 structural sections, tables, equations and annexes;
L2 semantic rules: old vs new scope, modal verbs, numbers, ranges, notes;
L3 actual consumer impact (which resolvers, catalogs, solver bundles and cases);
L4 independent calculation/regression delta (opt-in and deterministic).

Never autoupgrade a project on source discovery. Generate delta report with evidence both sides, severity per affected module, reviewer acceptance and signature. Escalate changed formula, numeric coefficient, scope, exceptions, withdrawn edition, identity mismatch, missing base amendment.

## 7. Source families and rights

Classify NORM (IEC/EN/PN), OSD_STANDARD, IRIESD, LAW, CONTRACT/CONNECTION_CONDITIONS, MANUFACTURER_DATASHEET, TEST_PROCEDURE, TECHNICAL_GUIDANCE, ACADEMIC, USER_NOTE. The ability to answer from a source doesn't imply its legal or normative authority. Individual connection conditions may contain confidential data; enforce project/tenant ACL. Public ENEA PDF may still have copyright reserved.

Vault:
- encrypted at rest; authenticated retrieval, per-tenant authorization;
- physical copy never shipped into public GitHub, frontend bundle, static files or logs;
- indexed text separated and ACL-filtered; search results redacted to authorized set;
- controlled short paraphrases and citations in public docs; full original only through private viewer if license permits;
- backups encrypted, retention and delete policy; metadata and fingerprints may remain when required to audit historic calculations if legally permitted;
- no upload to external AI without explicit contractual/legal permission;
- no unreviewed third-party connector authorized to publish binary documents.

Model card per document: license owner, scope of use, copying/derivatives, machine processing permission where applicable, number of seats, expiration, secure storage, retrieval entitlement. If rights are unclear, metadata-only ingest until resolved. Do not store entire norm in public GitHub or merge OCR text into source code.

## 8. Quality score — no fake confidence

Score components distinct: source authenticity (official page and edition), binary integrity (hash), extraction reliability (characters/layout), formula/table visual review, engineering interpretation, applicability validation, implementation/test coverage, temporal currency, licensing authorization. A scalar quality score may help triage but cannot replace hard gates. It is possible to have 100% pages indexed and 0 approved formulas.

Statuses:
- SOURCE_REGISTERED,
- ARTIFACT_VERIFIED,
- INDEXED_TEXT,
- EXTRACTED_CANDIDATES,
- EVIDENCE_VERIFIED,
- INTERPRETATION_APPROVED,
- RULE_TESTED,
- RELEASED_FOR_USE,
- HISTORICAL / PARTIAL / STALE / QUARANTINED / REVOKED.
Do not return all cards verified on the basis of a passed JSON schema test.

## 9. Threat model

- Malicious PDF with embedded actions or XFA: never execute; sandbox PDF parsers.
- OCR prompt injection in text: treat as untrusted source material, no agent instructions from PDF.
- Source URL SSRF, credential theft, absolute paths, path traversal: allowlist and validation; no direct user URL internal network fetch.
- Data contamination by wrong edition (IEC2026 vs PN2016): edition-specific tests.
- Incorrect decimal/comma parsing: decimal and locale explicit.
- Stale source replacing approved artifact: content-addressed storage/quarantine.
- License leakage via frontend/API/logs/debug artifacts: access controls and redacted logs.
- Unauthorized approval by importer or agent: role separation and audit.
- Historical result drift on new data: immutable lock + SHA regression.
- DOS via very large PDF or millions of OCR crops: page/size/time quota and queue.
- Fuzzy vector retrieval cross-tenant: mandatory scope filter before ranking.
- Poisoned FTS snippets: answer generation conditioned on approved cards, not raw content.

## 10. Acceptance fixtures from user-provided source types

Fixture F1 SCAN IEC60909: verified 82-page PDF; page 30 table1 source, page 51 equation33, page 58 κ; test exact page mapping and multiple classes of math.
Fixture F2 ENEA SOURCE: Z1 exact official edition; cross-check section and page; changed URL/edition not auto-override old.
Fixture F3 DOLEGA BAD_ENCODING: detect severe text corruption and mark for visual/manual verification, not convert gibberish into approved text.
Fixture F4 ZDUN DIAGRAM/MATH: academic source with equations and diagrams; correct source_kind and no norm compliance verdict.
Fixture F5 PTPiREE BUNDLED_ANNEXES: separate part_id and relative printed page numbering; program titles and date of application.
Fixture F6 EN50160 A1_NO_BASE: status PARTIAL; no claim that all quality limits known.
Fixture F7 62271 INSULATION ALTERNATIVES: preserved row alternatives and footnotes; min permitted selected by actual application not a single fake value.
Fixture F8 REVISED_PDF_IDENTICAL_CONTENT: hash change triggers review but not forced new norm edition.
Fixture F9 CONFIDENTIAL_CC: private connection conditions not searchable by another tenant.
Fixture F10 SOURCE_DELETED: historical release preserves provenance metadata and raises license-dependent source unavailable, not changes old numeric results.

## 11. Architecture of extraction workers

Suggested components (implementation may vary following repo audit):
- ImportCoordinator: queue/job idempotency and progress;
- ArtifactVaultAdapter: bytes and entitlement;
- PDFPreflightAdapter: page/image/text diagnosis;
- TextLayoutExtractor: text spans, bbox;
- ScanExtractor: OCR per page only if needed, not blanket OCR;
- MathRegionExtractor: math candidate and visual context, never auto-approval;
- TableRegionExtractor: cell grid and notes;
- StructureResolver: headings/clauses/page labels/annexes;
- CandidateBuilder: typed KnowledgeRecord proposals;
- EvidenceReviewService: human reviewed anchors;
- PublicationService: immutable release and dependency closure;
- EditionWatcher: optional periodic metadata checks;
- ImpactEngine: semantic changes and affected consumers;
- KnowledgeSearchIndex: lexical semantic search over approved and permitted records.

Async processing of large PDFs is acceptable for ingestion jobs, but synchronous solver/run endpoints must never wait for OCR or remote source. UI shows progress and explicit failures; background jobs have durable retry/dead letter metadata; import failure leaves the previous release intact.

## 12. Validation commands/proofs to implement

- scan integrity: original file sha256 and page count, read-only opening all pages;
- extraction coverage: pages with text vs OCR vs empty; failed pages nonzero count;
- evidence test: every approved row/eq anchors an actual source page with correct artifact hash;
- math test: same formula reviewer typed and numeric independent vector parity;
- table boundary: inclusive/exclusive, missing footnotes and alternatives;
- source status live: publisher metadata and review date;
- license: test unauthorized source access forbidden in UI/API and logs;
- recoverability: deliberate parser crash, retry idempotent, no corrupted release;
- malicious PDF: no file/network execution from document contents;
- regression: PDF edit/new normative edition cannot change pinned project bundle automatically.

## 13. Manual review ergonomic contract

Review screen shows original crop or page on left, structured candidate on right, edition and source status at top, uncertainty highlighted at character/cell level, checkboxes for units/ranges/footnotes/mathematics/applicability, independent reviewer field, decision and comment. One action to reject or propose correction, a separate action to approve. Change of one cell creates new revision and triggers dependent rules/test review; it never mutates a published revision in place.

When norm has protected content and reviewer lacks view entitlement, UI must refuse original display and allow metadata-only management, not silently show licensed text captured during another person's session.

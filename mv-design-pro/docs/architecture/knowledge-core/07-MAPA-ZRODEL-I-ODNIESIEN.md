# 07. EKC — MAPA ŹRÓDEŁ, DOWODÓW, NORM I KONFLIKTÓW

**Uwaga metodologiczna:** Ten rejestr dokumentuje podstawę **specyfikacji** na 2026-11-10. Nie jest pełną bazą tekstów norm ani certyfikacją ich aktualności w polskim systemie normalizacyjnym. Rozdzielono: attached original / main code / unmerged PR claim / current publisher listing / proposed future source.

## 1. Źródła rzeczywiście dostarczone w kontekście pracy

| Źródło | Charakter i potwierdzone dane | Zastosowanie w EKC | Ograniczenia |
| --- | --- | --- | --- |
| 60909 2016.pdf | Skan 82-stronicowy, okładka PN-EN 60909-0:2016, EN/IEC 60909-0:2016 | Przyjęty historyczny test importer → verified formula/table → solver | Brak warstwy tekstu; OCR nie jest autorytetem; licencja ENEA/PKN/IEC na stronach, nie publikować |
| xWyklad_20_Praca_SN.pdf | Wykład Z./T. Zdun, 2022, SN obciążenia symetryczne i niesymetryczne, metoda węzłowa, przykłady | LF examples i wizualizacja zależności | Źródło dydaktyczne, nie norma |
| dolega_stacje_elektroenergetyczne.pdf | W. Dołęga, Stacje elektroenergetyczne, podręcznik akademicki | Katalog typowych układów i terminologia jako Guidance | Znaczne uszkodzenia kodowania w warstwie tekstowej; rysunki tylko po visual check; nie norma/OSD |
| Przykłady schematów EPLAN.txt | Notatka, w rzeczywistości dotycząca QElectroTech PR #499 | Tylko historyczny kontekst biblioteki symboli | Nie dowodzi normowej zgodności IEC/EPLAN |

### 1.1 Potwierdzone przykłady z PN-EN 60909-0:2016

- Strona pliku PDF 30, drukowana IEC 22, Table 1: dla zakresu >1 kV do 230 kV cmax=1.10 i cmin=1.00; pełna tabela ma inne pasma i przypisy, których nie wolno odtworzyć z tego jednego wiersza.
- PDF str. 33, IEC s.25, §6.3.1: transformer rated impedance formulas (7)–(9); sprawdzić symbolikę i stronę napięcia w oryginale.
- PDF str. 51, IEC s.43, §7.2.1 wzór (33): three-phase initial symmetrical short circuit current I''k; scope and assumptions in clauses 5 and 7.
- PDF str. 58, IEC s.50, §8.1.1, wzór (57): factor κ dependent on R/X and method constraints.
- Dokument jest edycją 2016, nie dowodem na identyczne brzmienie wzorów lub tabel w edycji IEC 2026.

### 1.2 Potwierdzone przykłady z wykładu Zdun

Wykład 2022: §1.2 i §1.5 (metoda potencjałów węzłowych i aktualizacja napięć), §1.7 (przepływy mocy na końcach gałęzi), §3 i §4 (porównanie symetrycznego i niesymetrycznego obciążenia). Trzeba zachować dokładny schemat modelu, przenoszenie składowych przez grupy transformatorów i znak mocy; dokument jest materiałem weryfikacji przykładu, nie źródłem automatycznego zakresu obowiązywania.

## 2. Oficjalne źródła katalogowe — weryfikacja bieżąca

- IEC 60909-0:2026 — IEC Webstore, Edition 3.0, publication 2026-07-23: https://webstore.iec.ch/en/publication/68454
- ENEA Operator — indeks standardów: https://www.operator.enea.pl/uslugi-dystrybucyjne/instrukcje-i-standardy/standardy-w-sieci-dystrybucji
- ENEA Operator — IRiESD: https://www.operator.enea.pl/uslugi-dystrybucyjne/iriesd
- PKN — sklepy i katalog PN, w tym PN-EN 60909-0:2016-09: https://sklep.pkn.pl/
- PKN — komunikaty statusu wycofanych norm i dozwolonego stosowania w ocenie zgodności: https://pkn.pl/polskie-normy/komunikaty-decyzje-i-obwieszczenia-prezesa-pkn/komunikaty-prezesa-pkn-w-sprawie-pn

UWAGA: IEC publication is not itself proof of PN adoption/withdrawal or applicability to a particular Polish project. PKN official status and legal/contractual references must be checked on a particular report date; record source observation and method of checking.

## 3. Potwierdzone repozytorium main — wejścia

Linki względne od katalogu mv-design-pro:

- backend/src/reference_engine/models.py — ReferencePack, ReferenceFieldProfile, ReferenceRule etc.;
- backend/src/reference_engine/registry.py — load packs, manufacturer registry consistency, profile ownership and OSD operator mapping;
- backend/src/reference_engine/compliance.py — checks and station rules;
- backend/src/reference_engine/validation.py — bridge to ENM validation;
- backend/src/reference_engine/packs/osd_enea/pack.json — existing ENEA rules and notes;
- backend/src/api/reference_engine.py — V1 routes (do not break);
- backend/src/network_model/solvers/short_circuit_iec60909.py;
- backend/src/network_model/solvers/short_circuit_core.py;
- backend/src/network_model/solvers/short_circuit_asymmetrical_quantities.py;
- backend/src/network_model/solvers/machine_sc_iec60909.py;
- backend/src/network_model/solvers/power_flow_newton.py;
- backend/src/network_model/solvers/power_flow_unbalanced.py;
- backend/src/network_model/solvers/power_flow_oltc.py;
- backend/src/network_model/solvers/cable_ampacity_derating.py;
- backend/src/network_model/solvers/cable_voltage_drop.py;
- backend/src/network_model/solvers/conductor_thermal_withstand.py;
- backend/src/network_model/solvers/protection_iec60255.py;
- backend/src/enm/validator.py, models.py, topology.py and model-specific modules;
- backend/src/api/quality_analysis_runs.py, proof_pack.py, project_archive.py, document_store.py;
- frontend/src/ui2/referencje, inspector, wyniki, kreatory and existing SLD view;
- docs/sld/REFERENCE_ENGINE_SPEC_V1.md;
- docs/architecture/PRODUCT_CAPABILITY_CONSTITUTION.md and CANONICAL_TWIN_ARCHITECTURE.md;
- docs/domain/POMIAR_ROZLICZENIOWY_SN_V1.md.

These paths were inspected as directory entries or relevant file reads during planning. Agent must re-audit actual SHA, imports, operational ownership and test results before claiming exact line-level behavior. Unmerged PR paths are **not present on main** just because the PR mentions them.

## 4. Historical unmerged work — exact identity

**PR #493:** https://github.com/radekizk-sketch/MV-Design-PRO/pull/493
- open draft at planning date;
- branch codex/enea-knowledge-e2e-20261023;
- 25 standard items + 2 IRiESD in source_catalog according to branch README;
- backend/src/reference_engine/packs/osd_enea/source_catalog.json, curated_requirements.json;
- backend/src/reference_engine/enea_questions.py;
- scripts/enea_knowledge.py; CI acceptance workflow; UI components;
- important self-reported Z1 revision discrepancy vs main pack, scope and missing full validation.
- Status described in PR is **claimed**, needs test/runtime verification.

**PR #521:** https://github.com/radekizk-sketch/MV-Design-PRO/pull/521
- closed, not merged;
- branch feat/kb-iec60909-2016-provenance;
- 230 cards, 9 sources, 79 proposed rules according to R4 metadata and README;
- docs/knowledge/iec60909_2016/ sources.json, rules.json, knowledge.json, extensions_*.json, kb.py, offline index.html;
- PDF copies absent, intended by design;
- source cards are not integrated into live P0 solver; count is not a proof of technical validity or implementation.

**Current proposal PR #526:** only docs/architecture/knowledge-core/*.md; no replacement for #493/#521 automatic; review before conversion into tasks.

## 5. Register of source uncertainties and incompatibilities

| ID | Issue | Severity | Resolution proof required |
| --- | --- | --- | --- |
| N-01 | IEC 60909-0:2026 vs PN-EN 60909-0:2016-09 | Critical | Official edition identity, content delta and Polish applicable status, no auto upgrade |
| N-02 | 2016 cmin for SN=1.00 vs historical project assumption 0.95 | Critical | Table 1 and explicit assumption status in case |
| N-03 | IEC 60909-0 1F-earth scope in isolated/compensated SN vs 60909-3 | Critical | Original scope clauses per edition, correct solver path |
| N-04 | ENEA Z1 edition 09.2021-2 vs 06.2024 | Critical | Verify all current implemented rules vs official 06.2024 |
| N-05 | EN 50160 A1 without base | High | Base edition + amendment complete source closure |
| N-06 | IEC 62271-1 cited as complete product standard | High | Map equipment class to proper -100/-102/-103/-105/-200/-202 |
| N-07 | Insulation alternative table values flattened | High | Full source row/column alternatives and footnote checked |
| N-08 | Ik withstand versus short-circuit breaking | Critical | Type/units/conditions + independent comparison |
| N-09 | CT and VT / Ferranti inconsistent entity | High | Exact device semantics and wiring evidence |
| N-10 | PTPiREE bundled annexes have reset pagination | High | Part/page mapping and application date verified |
| N-11 | R4 metering formula variable units incomplete | High | Full glossary/table and approval before any calculator |
| N-12 | Dołęga broken encoding | Medium | Visual/manual source anchors, never auto normative approval |
| N-13 | Missing station construction variant/lifecycle in ENM | High | Model gap, UNKNOWN_DATA not false PASS |
| N-14 | Private PDF or full FTS index exposed | Critical | ACL/licensing and security test |
| N-15 | Historical source rule updated in place | Critical | Immutable revision/release/lock and replay |
| N-16 | No evidence for operator-specific application to project | Critical | Contract/conditions/operator/time context, uncertainty |
| N-17 | Generic "IEC current" metadata mislabeled as adopted Polish PN | High | Separate document families and adoption evidence |
| N-18 | Catalog duplicated in reference pack and manufacturer registry | High | Single canonical product param owner + provenance refs |
| N-19 | Imported knowledge unused by real module | High | consumer binding + runtime E2E proof |
| N-20 | AI explains from raw OCR as definitive requirement | Critical | verified record gate and explicit evidence-only status |

## 6. Reference classification for acceptance

**PROVEN_ATTACHED:** Directly read supplied PDF/table/figure; still edition-specific and license-sensitive.  
**PROVEN_REPO:** Existing branch/main code, doc, PR metadata (but not proof of runtime correctness).  
**PROVEN_PUBLISHER:** Official currently accessed public metadata, with checked_at date.  
**PROPOSAL:** Desired schema/logic/sequence; not yet implemented or tested.  
**ENGINEERING_INFERENCE:** Reasonable independent engineering practice, to validate before normative rule.  
**TO_VERIFY:** Norm edition/section/content not provided or not visually reviewed.  
**BLOCKED:** Cannot safely enforce or release until evidence, scope or license is resolved.

Review reports should put these labels on contentious details rather than pretending all are current authoritative standards.

## 7. Norm references — precise scope review backlog

Every line below creates a **review work item**, not an assertion of full verified normative compliance.

- 60909 family: applicability, equivalent voltage, transformations, initial symmetrical, peak, breaking, steady-state, special earth faults, machine and converter contributions, max/min.
- 62271 family: general ratings, product-specific switching, earthing, enclosure, insulation, internal arc, prefab station, manufacturer configurations.
- 60617: apparatus identity / diagram symbol and licensing of graphic database.
- 60076: power transformer rated data, vector group, short-circuit impedance, thermal, tap, no-load data, applicable parts.
- 61869: CT/VT accuracy, burdens, measurement and protection cores, ratios, technical data.
- 50160 and 61000: quality, harmonics, measurement windows, compatibility vs emission.
- 60287/60502/60949: cable thermal, product and fault withstand; exact national transposition to verify.
- 50341 and national supplements: overhead line geometry, climatic cases, crossings and clearances.
- 60255/61850/60870: protection, IED and communication; not automatically each required for every station.
- 60364 and earth network standards: LV protection loop and shock protection; avoid using for 15kV calculations beyond scope.
- NC RfG/PTPiREE/IRiESD: power generating module classification and tests, date and network operator.
- Manufacturer/technical guidance: particular model/firmware and revision; status not NORM even if exact electrical ratings are mandatory inputs.
- Owner conditions and contractual scope: project-specific, restricted ACL and versioned.

## 8. Source citations UX contract

Citation identifier: family designation + edition + clause/table/formula + page printed + PDF page + version/hash of source; optionally timestamp and official URL. User opens exact permitted PDF page, not publisher homepage and not equivalent newer edition. If user has no entitlement, display citation without preview, not a blank success. Source can be re-exported/rehosted; historical archived anchor preserves original hash. Citation on a calculation also identifies applied norm and parameter record revision, not merely document name.

## 9. Review of international/national standard currentness

At the date of this spec IEC official Webstore lists edition 3.0 of IEC 60909-0 published 2026-07-23. This observation does **not** settle the current Polish PN edition nor requirements of a concrete project. ENEA official web index and IRiESD pages are changeable and must be checked again on implementation date, together with source files. PR #493 and #521 provide useful past snapshots, not guaranteed current publisher truth.

## 10. Evidence handoff to future agent

For each proposed normative candidate the implementing agent produces a card:
- title/designation/edition/publisher;
- source hash/page/section/equation/table/figure and exact applicable text scope;
- source acquisition date, effective status and rights;
- interpreted variable glossary/units/exceptions;
- reason why applies to a concrete ENM case;
- module/adapter link, test refs and expected numerical/boolean result;
- reviewer name/time/outcome;
- release membership;
- downstream impacted consumers and migration requirements.

This is the minimum object that can be reused across solvers, catalog, SLD inspector and proofs without duplicated normative interpretation.

# 12. PTPiREE V3.0 — PROGRAMY TESTÓW, SYMULACJE, PROTOKOŁY I ODBIÓR PRZYŁĄCZENIOWY

**Status:** spec do zatwierdzenia źródłowego. Produkt nie może nazywać symulacji deklarowanych parametrów rzeczywistym testem zgodności PTPiREE. Projekt rozwija aktualne 20 testów T01–T20 i Werdykt, nie zastępuje ich; oficjalne programy załącznikowe są osobną wersjonowaną podstawą, a ich dokładne warunki i liczby muszą zostać przeniesione po ręcznym odczycie.

## 1. Co zostało potwierdzone

PTPiREE publikuje Procedurę testowania modułów wytwarzania energii v3.0 i załączniki programów ramowych jako integralny zestaw. Procedura ma zastosowanie od 2026-01-01 według daty złożenia odpowiedniego oświadczenia przez właściciela. Obejmuje różny podział obowiązków dla typów A/B i C/D oraz dodatkowe warunki dla istniejących C/D, modernizacji i testów zdarzeniowych.
Oficjalne źródło: https://ptpiree.pl/kodeksy-sieci/procedura-testowania/
Normatywna podstawa ogólna: NC RfG art. 29–36 (procedury pozwolenia) i art. 40–43 (testy/symulacje/monitorowanie zgodności) — zweryfikować dokładną kwalifikację dla typu i system operatora w tekstach, nie nadając automatycznie każdemu testowi obowiązku w każdym PGM.

## 2. Nie mylić różnych poziomów twierdzeń

LEVEL-0 MODEL_DECLARATION: użytkownik wprowadził has_lvrt_curve=True, meta frequency_droop, Q range, firmware; dowodzi tylko deklaracji.
LEVEL-1 STATIC_CONFIGURATION: nastawy/parametry, karta producenta i cert evidence; może potwierdzać konfigurację, nie zachowanie dynamiczne.
LEVEL-2 EQUIPMENT_TYPE_TEST: certyfikat urządzenia i wynik badań w zakresie objętym danym certyfikatem.
LEVEL-3 VALIDATED_SIMULATION: model matematyczny z udowodnioną walidacją i scenariuszami, trace wejścia/wyników, zakres prawidłowości modelu.
LEVEL-4 ON_SITE_COMPLIANCE_TEST: kontrolowany test przeprowadzony na zainstalowanym PGM zgodnie z zatwierdzonym programem, z pomiarem, protokołem i zatwierdzeniem.
LEVEL-5 OPERATOR_ACCEPTANCE: zgłoszone/zaakceptowane dokumenty, wymagania formalne i pozwolenie operatora.
To niekoniecznie porządek „każdy kolejny zastępuje poprzedni”; są to **różne typy dowodów**, a konkretna reguła dopuszcza ANY_OF/ALL_OF. Werdykt ma pozostać zgodny z obecną centralną oceną dowodową, bez nowej równoległej klasyfikacji.

Current engine: 20 internal comparison tests, T14–T18 dynamic tests return NOT_EVALUATED without a dynamic run, per source code. That is correct. Program tests in yaml are currently empty and criteria fields are NIEUSTALONE. Do not count T01–T20 as 20 completed official field acceptance protocols.

## 3. Domena programu badań — artefakty

RegulatoryTestPlan:
plan_id, project/case/pgm ref, PGM type, operator, scope event dates and WOS/WiPWC/procedure version, required requirement IDs, exact official programme annex/edition, preliminary network model, source/certificate requirements, planned scenario table, agreed measurement method, signatories, plan approval status, dependencies and exclusions.

TestProgrammeRevision:
programme_id, programme_version, clause and annex, applicability predicates, event/perturbation nature, required initial operating conditions, grid variables and units, prescribed shape and pass envelope, number of repeats and evidence grade, source hash and reviewer.

ComplianceTestCase:
test_id, requirement_id, scenario_id, PGM state (P,Q,U,cosphi/frequency/SOC where applicable), reference point (generator terminals/inverter AC/PCC and measurement location), f(t), U(t), faults or commands, trigger/event time t0, sampling and instrumentation, acceptance window, baseline or expected function, uncertainty and permissible tolerance, time synchronization, data completeness threshold, method (lab/type/field/simulation), operator approval, required artefacts.

TestExecution:
execution_id, programme_revision, event timeline, measurement dataset and checksum, simulator software/version and validated model version if simulated, equipment and firmware state, scenario snapshot, actual setpoint, acquisition timestamps, raw waveform files in protected storage, processed time series, time reference t0, observations, deviations, exceptions and auditor.

TestVerdict:
per criterion score and trace; evidence tier, evaluated bounds, acceptable envelope over time, missing data, reviewers/approval, specific observed curves, obligation status. Do not compress independent criteria into a vague bool.

TestDossier:
requirement matrix, program, certificates, raw/processed results, signatures, operator correspondence, final report source and case lock, revisions and long-term archive.

## 4. Test family matrix — applicability to be sourced per edition

The following is a technical candidate list, NOT a claim each test is universally mandatory. The official 3.0 main procedure and each relevant program annex must supply test identifier, scenario and tolerances.

| Rodzina | Parametry wejściowe | Oczekiwane rezultaty i dowody | Krytyczne pułapki |
| --- | --- | --- | --- |
| LFSM-O | f_Hz(t), f0, P_base, Pmax, droop, f_trigger, deadband, initial P and available power | P(t) and response gain, start/settle, stable regulation, curve overlay | frequency vs network voltage, % of Pmax vs Pn, clipping |
| LFSM-U | frequency under threshold, available reserve, Pmin, available irradiance/wind | P increase capability only under test preconditions and proven reserve | impossible response when no reserve |
| FSM | symmetric frequency excursion, power range and deadband, droop | sign, speed and response; correct device class | not every PGM class must have FSM |
| Active P setpoint | command time, rate, limits, command quality, target and actual P | P(t) ramp and stable target, latency, clipping | PLC/PPC feedback at wrong reference point |
| Stop/reduction | remote/local trip and reduction state | delay from command interface to actual export at PCC | grid disconnect is not equivalent to smooth reduction |
| Q(U) / U control | U_ref, deadband, Q envelope, controller gains, P, U_PCC, xfmr tap | Q(U) curve, direction and settling, negative feedback sign | Q measured on wrong side of TR, compensation raises U |
| cosphi(P)/cosphi const | P(t), Q(t), export/import sign and mode | capability and tracking across P range | signed cosphi and Q consumption/generation convention |
| P-Q capability | P and U grid, temperature, converter limitations, TR/cable losses | effective capability at chosen evaluation point | nameplate inverter Q range is not PCC Q envelope |
| LVRT | U(t), duration and phases, Ppre, Qpre, converter current limit, protection | stay connected and recovery within adopted envelope; actual waveform and grid model | u in pu of wrong base, missing protection settings, test vs static curve |
| HVRT | overvoltage trajectory, duration, preconditions | behavior/no disconnection when required and proof | generic profile with stale/unknown ENEA edition |
| Fast fault current / reactive injection | fault voltage, sequence, current limit, impedance/strength, K control | Iq(t), Id(t), reaction delay and voltage/fault behavior | model injection only declared, not independently measured |
| Post-fault active power recovery | Ppre, Uref, t0, pRecovery | P(t) after recovery and limits | uncertain definition of restoration time |
| RoCoF / frequency withstand | f(t), df/dt, protective trips and measurement filter | no unintended disconnection under applicable scenario | measuring filter derivative vs actual f |
| LoM/islanding/black start | grid topology, LoM setpoint, test stage, operator-specific requirements | simulated or measured behavior when mandated | do not universalize optional abilities |
| Harmonics/quality | frequency spectrum current/voltage, PCC impedance, time window | measured limits with correct methodology | THD_U declared of inverter is not PCC THD_U |
| Telecontrol/monitoring | SCADA interface, command and response timestamps, quality/status, recorder | end-to-end controls, evidence of signals and timing | data sheet != field communications acceptance |

Each row becomes tests with source-prescribed acceptance criteria, not hard-coded arbitrary tolerance values. The current internal criteria in procedura_ptpiree.yaml are marked NIEUSTALONE; do not promote values such as tolerance droop 1.0 pp or THD 8% without official programme evidence and context.

## 5. Mathematical processing rules

Signal type: f [Hz], U [kV or p.u. explicit base], I [A RMS/instantaneous], Iq/Id [A,p.u., axis sign], P [kW/MW], Q [kvar/Mvar], S [kVA/MVA], time [s] with zero and clock sync, df/dt [Hz/s], droop % referenced to a named power base.

No automatic smoothing that creates a pass. Every processed signal must be traceable to original checksum and transform chain: data source -> calibration -> unit normalization -> time alignment -> filtering -> measurement/acceptance functions -> error margins -> verdict. Filters and sampling rates are part of approved test procedure. Device internal sampling vs PCC analyzer timing cannot be silently merged.

For acceptance curves:
- no single-point comparison can substitute time envelope if condition requires a trace;
- compute minimum distance to threshold, first response time, settling time/hold if prescribed, overshoot/undershoot and duration outside allowed envelope;
- exact test method defines window and measurement uncertainty; do not guess a generally applicable 5% tolerance;
- make failure details available with actual P(t), Q(t), U(t), f(t), Iq(t) and the normative envelope;
- missing samples in required interval => UNCERTAIN/INCOMPLETE, not PASS;
- avoid numerical time integration converting complex phasor to RMS without defined window;
- quality test needs statistical periods and measurement standard where actually required.

Dynamic simulation must distinguish network equivalent, controller model, vendor black-box model, grid strength SCR, initial conditions, fault type and voltage dip; no unsupported implication that a fast decoupled static LF proves LVRT/HVRT.

## 6. PGM test applicability / certificates composition

For each requirement:
- mandatory for which PGM type & family, technology and operator scope;
- which method(s) accepted by WiPWC and procedural annex;
- source edition WOS/NC RfG and project event conditions;
- is equipment certificate sufficient by itself? allowed only when legal programme says so;
- if component certificate used, is site-level PPC/test required to prove integrated function?
- if simulation allowed, what model validation, test cases and source artifacts?
- site-specific conditions and document signature requirements;
- operator right to demand additional tests or evidence;
- conflict with existing test certificate scope/firmware -> retest required.

Do not transform „certified inverter” into all-pass for the plant. For one 499 kW type B PGM, each LFSM, Q, fault, monitoring and testing obligation needs its own evidenced compliance route.

## 7. Formal document lifecycle — not just PDF export

ENEA publishes downloadable templates for:
- DI — Dokument instalacji for type A in applicable procedure;
- PGMD — Dokument modułu wytwarzania energii for B and C;
- EON — pozwolenie na podanie napięcia for D;
- ION — tymczasowe pozwolenie na użytkowanie for D;
- LON — ograniczone pozwolenie na użytkowanie for D;
- FON — ostateczne pozwolenie na użytkowanie for D.
Official document list: https://www.operator.enea.pl/uslugi-dystrybucyjne/dla-firm/pliki-do-pobrania
NC RfG arts. 30–36 underpin type-specific operational notification; actual current ENEA forms must be used and versioned as templates. Never claim the application issues an operator permit.

Candidate workflow:
RegulatoryCase Created
 -> Classification and applicable requirement matrix
 -> Required certificate validation
 -> Project readiness and protection setting agreement
 -> Operator procedure/form selected by type
 -> Testing programme and reviewer acceptance
 -> Factory evidence / dynamic model validation / field tests
 -> Reports and deficiency disposition
 -> Submission dossier generated
 -> Operator response recorded
 -> Accepted/conditional/rejected operator decision (from actual record)
 -> As-built lock and audit archive.

State machine must allow requests for supplements and retesting, new firmware, new connection conditions and conditional derogations. No forced linear "progress=100%" until actual operator status evidence exists.

## 8. Requirements-to-evidence matrix (core product)

Each row:
requirement_id | NC_RfG_article | WOS_clause | OSD_conditions_ref | technology | type |
  required_capability | acceptance_method (CERT/TEST/SIM/CONFIG/OPERATOR) |
  certificate_refs | test_plan_ref | dataset_ref | model_validity_ref |
  observed_result | verdict per Werdykt | reviewer | operator_response |
  source anchors | missing proof | override.
Status categories: SPELNIA / NIE_SPELNIA / NIE_OCENIONO / BRAK_DOWODU / BRAK_PODSTAWY / NIE_DOTYCZY / NIEJEDNOZNACZNY and actual current Werdykt statuses; legal acceptance is separate field. A result from UI request /run is UNVALIDATED_INPUT and must not become a formal certificate.

## 9. Performance and provenance contract

Source artifact may include CSV, COMTRADE, oscilloscope plot, disturbance recorder waveform, dynamic model input/output and regulator settings; each has sha256, captured_at, time accuracy, acquisition equipment/calibration evidence, version and access rights. Use existing document_store and proof_pack, not a duplicated file store, after audit. Large waveforms in secured binary store, metadata in relational DB; no public GitHub uploads.

Every test references:
- ENM/case hash, source PGM configuration, materialized catalog device/firmware;
- locked WOS/WiPWC/PTPiREE procedure versions and exact annex;
- PTPiREE register snapshot and accepted cert evidence;
- test conditions P/Q/U/f, network impedance and event sequence;
- simulation model version and validation range if used;
- raw and processed signals plus processing code commit;
- requirement matrix and Werdykt code version;
- reviewer, signoff and operator acknowledgement.

## 10. Operational UX

Dedicated view under existing UI2 OZE -> „Zgodność i odbiór”:
1) Urządzenie / certyfikaty (identity and expiry acceptance);
2) Wymagania NC RfG / WOS / OSD (per requirement);
3) Badania i symulacje (procedure and programme, cases, results);
4) Dokumenty i gotowość (DI/PGMD/EON/ION/LON/FON where applicable);
5) Historia / braki / najbliższe ryzyka.
Use the current ncRfgStore, not another state owner. Statuses and source links shown in Inspector; actual submitted documents and operator decisions cannot be optimistically fabricated. Trend panel with P/Q/U/f curves must show numerical traces and threshold envelopes, not decorative movement.

## 11. Detailed acceptance tests

TEST-01 Procedure 3.0 selected by proper readiness statement date, not physical completion.
TEST-02 Programme annex reference and subtest mapping to each current T01–T20 with reviewed exact source; absent mapping => missing.
TEST-03 Thresholds in existing YAML remain NIEUSTALONE until source-bound.
TEST-04 Partial 1 of 5 required scenarios never gives full pass.
TEST-05 Static declared has_lvrt_curve True does not satisfy dynamic test.
TEST-06 Missing dynamic run makes T14–T18 NOT_EVALUATED.
TEST-07 Certified inverter + no plant-level PPC proof if control delegated => incomplete.
TEST-08 Dynamic run has no model validation: not VALIDATED_SIMULATION.
TEST-09 Wrong data period, sampling gaps, wrong units or time reference => no pass.
TEST-10 Reaction direction in Q(U) and LFSM-O correct and tested against independent source.
TEST-11 Active power output at PCC differs from converter AC due to TR/cable losses; correct node.
TEST-12 Certificate coverage stage and site test obligation computed independently.
TEST-13 Old operator procedure version remains on historical accepted PGMD package.
TEST-14 Type A does not get EON/ION/FON type D workflow.
TEST-15 Type B/C PGMD selected; type D appropriate EON/ION/LON/FON procedures.
TEST-16 Generated app PDF must be called report/statement of compliance evidence, not pretend to be accredited equipment certificate or operator permission.
TEST-17 Data-only 'what-if' run cannot export accepted formal proof as if model/cert certified.
TEST-18 Operator asks for additional tests; requirement matrix updates case history, not global WOS.
TEST-19 Expired certificate between plan and submission triggers recheck.
TEST-20 Protection trip during FRT test requires investigation; cannot silently use only inverter voltage curve as pass.
TEST-21 Installed firmware changes and test repeat/revalidation requirements are evaluated.
TEST-22 Field data from distorted/incorrect measurement gives INCOMPLETE with reason.
TEST-23 All artifacts cite source, exact time/date and user signoff; ACL enforced.
TEST-24 Repeated analysis under identical locked inputs yields same processed result and proof report.

## 12. Source and review work items

Official PTPiREE procedure webpage and complete current annex PDF: https://ptpiree.pl/kodeksy-sieci/procedura-testowania/ . Original annexes must be acquired legally and page-by-page mapped via secure importer. PSE WOS2025: https://www.pse.pl/kodeksy/rfg . ENEA form templates: https://www.operator.enea.pl/uslugi-dystrybucyjne/dla-firm/pliki-do-pobrania . PTPiREE WiPWC: https://ptpiree.pl/kodeksy-sieci/warunki-i-procedury/ .

Before enabling tests in production: apply the latest verified schedule to current selected edition and build actual scenario datasets and independent plots. Without those, tests stay engineering preview with honest proof tier.

# 13. LUKI I ROZSZERZONA MAPA ZGODNOŚCI — PRIORYTETY PO AUDYCIE NC RfG

**Cel:** rejestr tego, co poza pierwotnymi dziesięcioma dokumentami EKC jest potrzebne do rzeczywistej pracy inżyniera. Priorytet ≠ zobowiązanie do osobnego mikroserwisu. Preferuj małe rozszerzenia istniejących warstw norm, Werdykt, katalog, ENM, proof_pack i OZE.

## 1. Główne brakujące granice procesu

| ID | Brak w pierwotnym projekcie | Właściciel istniejący | Doprojektowanie | Priorytet |
| --- | --- | --- | --- | --- |
| GAP-R01 | WOS2025 jako wydanie i specyficzne daty wejścia dla A/B/C/D | nc_rfg loader / EKC | Regulator timeline, 2018/2025 branch, reviewer | P0 |
| GAP-R02 | Zdezaktualizowany snapshot PTPiREE na tle publikacji z X–XI 2026 | mv_ptpiree_catalog | Snapshot history and delta, no run-time scraping | P0 |
| GAP-R03 | Brak potwierdzonej wersji ENEA IRiESD i banku nastaw w profilu | osd/enea.yaml, EKC | Source proof, selected approved source editions | P0 |
| GAP-R04 | Niezweryfikowane kryteria akceptacji i puste programy badań | procedura_ptpiree.yaml / engine | Full source mapping, actual programme data/test cases | P0 |
| GAP-R05 | Sam wpis wykazu nie udowadnia autentyczności/zakresu certyfikatu | model_bridge, certificates | certificate/issuer/FW/proof binding | P0 |
| GAP-R06 | Data umowy nie wystarcza do WOS/procedury | ENM declarations | EventTimeline additional fields | P0 |
| GAP-R07 | Certyfikat sprzętu nie dowodzi PGM/PPC w PCC | OZE/DER, catalogs | Per capability evidence composition and site tests | P1 |
| GAP-R08 | Formalne procedury przyłączeniowe i pozwolenia nie są modelowane | document_store/proof_pack | DI/PGMD/EON/ION/LON/FON, operator status | P1 |
| GAP-R09 | Model dynamiki może nie być zwalidowany | dynamika/provenance | model validation artifact and scope of applicability | P1 |
| GAP-R10 | Rzeczywiste pomiary nie są zasobem dowodowym | document_store, analysis | waveform/run metadata, calibration, timestamps, hashes | P1 |
| GAP-R11 | Modernizacja, zmiana parametrów lub FW wymaga ponownej oceny | project revision/cert | change impact and recertification/test review | P1 |
| GAP-R12 | Standalone BESS nie ma źródłowo opisanych wymagań krajowych | magazyny.yaml | own energy-storage requirement register | P1 |
| GAP-R13 | Certyfikaty aparatury SN/GPZ/CT/VT i FAT/SAT oddzielne od RfG | catalog + equipment checks | standard/test report evidence families | P1 |
| GAP-R14 | Metrologia stanowiska testowego / jakość danych | measurements | calibration/data quality/time synchronization | P2 |
| GAP-R15 | Operator specific redysponowanie/sterowanie i telemechanika | OZE/telemetry | point maps and POC proof | P1 |
| GAP-R16 | Cybersecurity IED/telecontrol and firmware supply chain | system/security | applies when project requires, separate evidence | P2 |
| GAP-R17 | DCC/HVDC/new codes when future application extends scope | document registry | metadata only, no phantom SN obligations | P3 |
| GAP-R18 | End-to-end project normative dossier and historical lock | proof_pack/archives | release+cert+test+operator decision bundle | P1 |
| GAP-R19 | Jurisdiction/contractual deviations/waivers | case and Werdykt | signed, scoped exception with owner and expiry | P1 |
| GAP-R20 | Source completeness and protected PDF rights | source vault | entitlement, original source, no public full text | P0 |

Priority P0 here means absence can cause technically unsound claims, not authorization to change solver behavior automatically.

## 2. Wider knowledge source families necessary for a real engineering platform

### Connection/access and grid-code obligations

Core: NC RfG (2016/631), WOS2019/2025, WiPWC 1.2/1.3, PTPiREE procedure and annexes, PSE requirements, ENEA/other OSD IRiESD, connection conditions, regulation/legal time, compliance certificates. Do not create independent automatic sources from unsigned informal operator emails; when an agreed individual condition is sourced, model it as contract-specific and restricted by project.

Candidates beyond RfG, not automatically applicable:
- Demand Connection Code (NC DCC, EU 2016/1388) for specified demand facilities, large industrial loads, demand response and relevant use cases if product extends to these;
- HVDC Code (EU 2016/1447) only if actual DC transmission/embedded DC connected facility model is added;
- SOGL/ER/Electricity Balancing regulations if current modules genuinely require operational obligations — else only link metadata;
- national/grid connection law, instructions and protection rules when they govern the object.
These families should be **in scope for the generic document registry** but **out of automatic enforcement** until product capability and applicable source are proven.

### Device certification beyond generators

IEC 62271 switchgear device type/routine tests, internal arc and ratings; IEC 60076 transformer dielectric/thermal/short-circuit technical evidence, IEC 61869 CT/VT metrology, IEC 60255 relays and 61850 IED communications, IEC 60502 cable product/test, IEC 62933 energy storage safety/system considerations; IEC 62443 and related cybersecurity product requirements only where explicitly contracted. The point is to link supplier certificates/test protocols to catalog product revisions and specific requirements, not to implement every external standard in the first sprint.

Product certification: genuine conformity certificate / accredited lab test report / EU DoC / manufacturer statement / FAT / SAT / installed site test each with separate proof tiers. Avoid equivalence of CE marking, IEC test report and NC RfG acceptance.

### Network and commissioning / site verification

GPZ/stations: earthing installation tests and touch/step voltage studies where applicable, switchgear interlocking checks, transformer routine/test protocols, CT polarity and burden, VT secondary connections, relay secondary injection and trips, control/SCADA signals, commissioning sheet and as-built measurements. Each test refers to actual diagram revision, measurement instrument calibration and installation date. Legal acceptance remains owner/operator workflow.

Lines: cable sheath insulation/bonding, phase continuity, identification, earth fault return path, cable accessories and commissioning test methods under correct standards; overhead line support foundations and clearance survey with actual terrain. EKC links proof types and criteria; no invented test voltage or minimum distances.

Protection: coordination studies are not laboratory product certificates. Actual relay setting upload, installed firmware, trip tests, CT saturation and time-current curve version may be needed. A protection faceplate screenshot is not a signed setting record.

Power quality: capability of PGM to inject harmonics versus measured voltage quality at PCC is a separate calculation/evaluation. Do not auto-mark THD_U pass based on converter manufacturer current spectrum. A source's data set must have measurement period and quality.

## 3. BESS and hybrid PV+BESS — explicit boundary

EU NC RfG art. 3(2)(d) excludes electrical energy storage devices with pumped-storage exception according to current source/legal interpretation, and ACER explains storage devices are outside RfG. Source: https://www.acer.europa.eu/electricity/connection-codes/requirements-for-generators . Current repo has MAGAZYNY separate, and a hybrid PPM plus BESS modeled with distinct assets. This is the correct starting point, not reason to ignore storage altogether.

For standalone BESS:
- sources national law, IRiESD, conditions, power electronics safety, separate protection/telecontrol, export/import limitations, system service requirements if contracted;
- model AC charging/generation capacities, energy, SOC, PPC/EMS, fault contribution and grid-forming, protections, measurement and energy accounting;
- no auto-cloning of all PGM obligations as NC RfG.
For hybrid:
- legally/contractually classify actual PGM boundary and shared PCC;
- distinguish generating assets, storage charging/discharging, export limit and actual operator commands;
- source-specific applicability review per hybrid configuration;
- functional tests may require interactions of PPC and inverter/storage, even if individual converter certificates exist.

Test hybrid site: same PGM with PV 2.5 MWp and BESS 1MW/2MWh would have distinct PV DC installed rating, AC Pmax, BESS charge/discharge power, P-Q response, SOC and PCC constraint; example values are illustrative only. A single “installed MW” field cannot support correct classification and proofs.

## 4. Measurement, transient dynamics and digital models

Require:
- exact boundary PCC and signal location; CT/VT ratio and vector group;
- sampling, time sync and event trigger; data quality flags;
- instrument calibration dates;
- event scenario and network short-circuit strength R/X as observed/assumed;
- dynamic model provenance and vendor/firmware validity, validated parameter set, model scope;
- passive vs active frequency/reactive controller priority, limiter saturation and anti-windup if modeled;
- event FRT and postfault recovery proof with actual waveform;
- uncertainty analysis and witness approvals;
- authenticity of raw files and processed plot generation.
No simulation can be certified merely by producing a mathematically plausible plot, and no static power flow shows dynamic FRT compliance.

## 5. Manufacturer data and installed identity — one catalogue, many proofs

Catalog hierarchy:
Manufacturer -> ProductFamily -> Variant -> ProductRevision -> FirmwareRevision -> InstalledDevice (ENM reference) -> CertificateCoverage -> ProjectTest -> OperatorAcceptance. All entries share stable IDs and unique provenance.
A replaced converter or updated firmware creates an impact task: validate certificate coverage, test programme, settings and final report; it does not rewrite the archived source. For older projects, status “zgodne z podstawą z dnia” and visible later change risk.

## 6. Reference release packaging — extend ProjectKnowledgeLock

Existing proposed lock fields must add:
regulatory_basis_manifest, wos_variant, wipwc_version, ptpiree_procedure_version and annex hashes, operator IRiESD edition, manufacturer certificate references and issuer evidence hashes, PTPiREE list snapshot sha, installed firmware and device revision refs, programme and test result artefact hashes, operator acceptance evidence and date.

Do not physically embed signed PDF files into generic public release if restricted; private vault holds originals with authorized access. Case lock contains hash and resolution reference.

Separate reproducibility dimensions:
A. normative content reproducible;
B. equipment installed config reproducible;
C. certificate status as known on date reproducible;
D. field test processing reproducible;
E. operator decision recorded, no claim to reproduce actual operator decision algorithm.

## 7. Implementation backlog with modified sequencing

**P0-1:** reconcile official WOS2025 effectivity, existing wos.yaml, 2018/2025 version selection with event timeline; tests across A/B/C/D boundaries and 2025/2027 deadlines. No manual/silent source reclassification.
**P0-2:** newer PTPiREE snapshots and certificate coverage; source original, exact matching of model/FW, per-device acceptance window. Preserve historical snapshots.
**P0-3:** source approved programme v3.0 and exact annexes; replace status of unknown programme criteria only after actual source evidence. Prevent false “certified” result by app.
**P0-4:** ENEA current profile IRiESD, WOS applicability and operator controls; plan gaps as typed statuses.
**P1-1:** per requirement proof composition cert/test/simulation/site, no automatic equivalence.
**P1-2:** formal document flow DI/PGMD/EON/ION/LON/FON and operator responses with source editions.
**P1-3:** dynamic model validity and data capture for real tests.
**P1-4:** BESS standalone and hybrid-specific legal/technical source classification.
**P1-5:** cross-domain product conformity and FAT/SAT evidence shared with GPZ, EAZ, cables and SLD.
**P2:** notification scheduler and impact graph (suspended cert, new registry, firmware change, WOS update), secured automation with no auto-approval.
**P3:** broader legal codes only when app actually supports their scope.

These are proposed increments for Opus/Fable to review and trim; do not spin up an independent platform to manage test reports before proving reuse of document_store and existing compliance model.

## 8. Hard safety invariants for future reviewer

1. Source edition selected per event timeline, not just system clock.
2. BESS standalone cannot inherit NC RfG pass/fail by operator-profile convenience.
3. A certificate is valid within its actual covered type/family/firmware/functions, not the entire generating plant.
4. Old scheme certificate expiry and acceptance window are different facts.
5. A public PTPiREE list row is necessary for relevant WiPWC path but not always sufficient for full conformity.
6. Program-run data without accepted model/certificate cannot claim operator-approved compliance.
7. Test criteria with source status NIEUSTALONE never become full pass.
8. EON/ION/FON official decisions are not generated by MV-DESIGN-PRO, only evidence dossiers/applications.
9. No new geometry algorithm or duplicate ENM state follows from certification requirements.
10. No licensed certificate or PTPiREE PDF copied to public repo without rights; keep metadata and hashes.
11. Released historical case remains linked to old source editions and snapshot of certificate status as known then.
12. An error in regulatory applicability triggers new review release and affected-project impact, not silent edit.

## 9. Architecture verdict requested

Future reviewer must answer: Which gaps above can be closed through 7-layer profile loader and source registry, which need new strict temporal event fields in ENM, which need evidence/certificate storage, and which should stay external? Show per-claim source proof, actual line of code and test. Resist overdesign. The objective is reliable engineering outcomes in MV-DESIGN-PRO, not maximum number of classes or services.

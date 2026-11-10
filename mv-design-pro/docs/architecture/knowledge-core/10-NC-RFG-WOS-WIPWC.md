# 10. NC RfG / WOS / WiPWC — KONTRAKT REGULACYJNY I STOSOWALNOŚĆ

**Status:** ROZSZERZENIE ARCHITEKTURY, data źródeł publicznych 2026-11-10. Przed produkcyjnym wdrożeniem reviewer ma potwierdzić oficjalne wydanie oraz treść tabel/załączników. **Nie tworzyć nowego solvera NC RfG** — istnieją: profile siedmiowarstwowe, 20 testów, model bridge, Werdykt i API. Ten dokument uzupełnia braki wersji, certyfikatów i ścieżek dowodowych.

## 1. Kluczowa poprawka zakresu

Norma techniczna, NC RfG, WOS, WiPWC, Procedura PTPiREE, dokument operatora i certyfikat urządzenia to nie to samo:
1. Rozporządzenie Komisji (UE) 2016/631 (NC RfG): obowiązek i zakres europejski, definicja modułów i wymagań.
2. WOS 2018/2019 i WOS 2025: krajowe, zatwierdzone przez Prezesa URE wartości i wybory w obszarach pozostawionych do sprecyzowania; ścisła data zastosowania.
3. WiPWC 1.2/1.3: uznawanie certyfikatów w procesie przyłączania, zakres akceptacji i czas. Nie jest tabelą parametrów FRT/LFSM.
4. PTPiREE Procedura testowania v3.0: przebieg testów, podział obowiązków, kryteria wyników i programy ramowe, nie to samo co certyfikat sprzętu.
5. Operator — IRiESD, właściwe procedury pozwolenia i warunki przyłączenia, ewentualny program badań/nastawy.
6. Certyfikat sprzętu — dowód dla określonego urządzenia/konfiguracji i konkretnych funkcji oraz typów MWE, w czasie akceptowanym przez OSD.
7. Raporty z prób i modele symulacyjne — dowód rzeczywistego PGM/zakładu, nie certyfikat sprzętu.
8. Deklaracja zgodności UE i karta producenta — inna podstawa prawna i inny zakres niż NC RfG.
9. Pozwolenie operatora (PGMD/EON/ION/FON/LON) — odrębny etap decyzji; program MV-DESIGN-PRO nie wydaje go we własnym imieniu.

Każdy obiekt ma własne edition_id, source sha, data_effectivity, warunki stosowania i dowody. Globalny KnowledgeRelease może wskazywać ich zestaw, ale nie może zastępować specjalistycznego evaluator/Werdykt.

## 2. Oficjalnie potwierdzone ramy temporalne

### 2.1 WOS 2025 — decyzja i wdrożenie

PSE i URE wskazują dokument Wymogi ogólnego stosowania — Maj 2025 r., zatwierdzony decyzją URE z 15 maja 2025 r. (znak DRE.WKP.744.18.15.2024.WŻ.MKo4); ogólna data wejścia w życie 1 grudnia 2025. Stosowanie jest różnicowane:
- dla MWE typu B/C/D: warunki przyłączenia wydane od **2025-12-01**;
- dla MWE typu A: według reguł dat wydania warunków lub zgłoszenia od **2027-01-01**; dokładną formułę warunków z oryginału zachować bez upraszczania;
- modernizacja/remont/modyfikacja istniejącego typu C/D powodująca znaczną zmianę umowy — od 2025-12-01 i odpowiednio do zakresu modernizacji;
- w pozostałych przypadkach, dla których WOS 2025 nie ma zastosowania, PSE wskazuje utrzymanie Wymogów 2019.
Źródła: https://www.pse.pl/kodeksy/rfg , https://www.ure.gov.pl/pl/urzad/informacje-ogolne/aktualnosci/12682,Prezes-URE-zatwierdzil-nowe-Wymogi-ogolnego-stosowania-dla-przylaczania-jednoste.html

**Ważne:** data opublikowania WOS 2025 nie wystarcza, aby wybrać go w każdym nowym projekcie. Znaczenie mają typ MWE, data zdarzenia (warunki/zgłoszenie), status nowy/istniejący i zakres modernizacji. Model prosty valid_from=2025-12-01 byłby BŁĘDNY dla MWE A.

### 2.2 WiPWC 1.2/1.3 i wykaz PTPiREE

PTPiREE wskazuje okres przejściowy WiPWC:
- wykaz certyfikatów akceptowanych według WiPWC 1.2: do **2026-12-31**;
- WiPWC 1.3 stosowany według reguł od 2024-11-01, wymagania etapu II od 2027-01-01;
- indywidualne terminy akceptacji wynikają z konkretnego wpisu wykazu, daty wydania certyfikatu, jego ważności, ewentualnego zawieszenia/wycofania i zasad przejściowych;
- PTPiREE opisuje wyjątek dla B/C/D: urządzenia wykreślone z nowszego wykazu, wskazane w warunkach przyłączenia wydanych przed 2025-12-01 według WOS2018, mogą być akceptowane do daty z kolumny Data akceptacji dokumentu;
- ENEA Operator w komunikacie 2026-10-05 podkreśla, że koniec okresu akceptacji WiPWC 1.2 jest niezależny od daty ważności certyfikatu.
Źródła: https://ptpiree.pl/kodeksy-sieci/warunki-i-procedury/ ; https://ptpiree.pl/kodeksy-sieci/wykaz-certyfikatow/ ; https://www.m.operator.enea.pl/o-spolce/teczka-prasowa/komunikaty/komunikat-dotyczacy-wykazu-urzadzen-zgodnych-z-wymaganiami-nc

PTPiREE publikuje aktualizowany okresowo wykaz. W widoku wyszukiwarki na 2026-11-10 figurują PDF **2026-10-26 1.2** i **2026-11-06 1.3**. Nie zakładać, że każdy request czasu rzeczywistego ma tę samą snapshot; rejestr snapshotu ma observation_date/source_file_sha i publish_date. Jeżeli serwis offline i najnowszy wpis nieznany, status CHECK_REGISTRY_FRESHNESS, nigdy „aktualny certyfikat potwierdzony”.

### 2.3 Procedura testowania PTPiREE v3.0

PTPiREE v3.0 obowiązuje od **2026-01-01** dla PGM typ A/B/C, których właściciel złożył po dacie obowiązywania dokument Oświadczenie o gotowości przyłączenia PGM, a dla typu D dokument Oświadczenie o gotowości do przyjęcia napięcia. Właściwość procedury rozstrzyga zatem data złożenia określonego dokumentu, nie sam calendar(now). Main procedure and program annexes form a versioned composite document.
Źródło: https://ptpiree.pl/kodeksy-sieci/procedura-testowania/

## 3. Klasyfikacja MWE — must retain single implementation

Polska klasyfikacja techniczna w publicznej informacji OSD:
- A: 0.8 kW <= Pmax < 200 kW, U_point < 110 kV;
- B: 200 kW <= Pmax < 10,000 kW, U_point < 110 kV;
- C: 10,000 kW <= Pmax < 75,000 kW, U_point < 110 kV;
- D: Pmax >= 75,000 kW przy U_point < 110 kV albo U_point >= 110 kV niezależnie od Pmax dla objętych NC RfG MWE.
Źródło operatora: https://energa-operator.pl/przylaczenie-do-sieci/kodeksy-sieciowe/rfg i https://www.tauron-dystrybucja.pl/uslugi-dystrybucyjne/nc-rfg

To wartości polskiej klasyfikacji, nie europejskie wartości graniczne maksymalnie dopuszczalnych progów. Kod już ma single function catalog.profiles.nc_rfg.klasyfikacja_modulu i GET /api/ncrfg-tests/modul. **Nie tworzyć klasyfikacji w EKC, UI lub kolejnym API.** EKC dostarcza wersjonowaną podstawę progów oraz proof; normalizację wartości/progów nadal wykonuje istniejący loader. Dynamiczna rewizja progów tylko po explicit migration.

Model classification input:
- module_id and plant_id, family SyPGM/PPM/OFFSHORE (offshore beyond current MV scope);
- generator vs storage vs hybrid, technology PV/FW/biogas etc;
- Pmax declared at applicable boundary and configuration, voltage U at connection point, not inverter nominal AC;
- installed capacity vs generator rated apparent S vs max export/import conditions separate;
- ENM source and project date, operator jurisdiction and operator connection conditions;
- status existing/modernized, conditional exception and decision.

**Boundary tests:** 0.799/0.8/199.999/200/9999.999/10000/74999.999/75000 kW; U=109.99/110.00 kV; unequal inverter Sn and Pmax; multiple PPM behind common connection; site with independent PGM IDs. Not every asset in plant is necessarily one separate PGM; exact classification must follow legal definition and operator connection configuration.

## 4. WOS technical coverage (not only type thresholds)

WOS 2025 updates highlighted by PSE include:
- frequency ride-through and ranges/time;
- LFSM-O/U, FSM and P(f) response, droop, deadband, dead zone and reference P;
- active-power setpoint, ramping, stop/reduction/remote control, manual adjustment;
- reactive Q capability, cosphi(P), Q(U), U/Q and P-Q envelope at correct connection point and Pmax reference;
- LVRT/HVRT and post-fault active-power recovery, fault ride-through across P/Q/voltage scenarios;
- fast fault current injection and reactive current response (where applicable), grid strength dependence;
- simulation models and their validation for compliance simulation;
- measurement/monitoring, operator control signals, data recording and telemetry;
- possible operator-specific capabilities (virtual inertia, POD, islanding, black-start) only if specifically required/contracted, not blanket assumption.

PSE explicitly notes in the 2025 revision the changed treatment of simulation model standard, frequency automation power base, P regulation, remote control, fast fault current and Q capability, plus removed unconditional statements of *no requirement* for virtual inertia/POD. Source: https://www.pse.pl/kodeksy/rfg

**Regulatory RequirementRecord** per capability:
requirement_id, NC_RFG article and subclause, WOS edition and clause, field/technology type, A/B/C/D, default/conditional operator option, point_of_evaluation (POC/PCC/module terminal and source-specific terms), threshold or curve with units and reference bases, response-time and event windows, test or certificate evidence mapping, simulation proof kind, authorized waiver, source refs and legal dates.
Unverified numeric WOS values must remain UNVERIFIED. Never copy previous legacy OSD 2024-Q4 curves as „WOS2025 verified”.

## 5. Temporal resolver — structured events

Proposed EventTimeline for each PGM:
- connection_conditions_issued_at; notification_submitted_at; connection_agreement_signed_at; installed/commissioned date;
- ready_for_connection_statement_submitted_at; ready_for_energization_statement_submitted_at; modernization_notified_at;
- significant_change_art4 decision and scope;
- certificate_issue_at, valid_to, suspended_at, withdrawn_at, accepted_until, lookup_snapshot_date;
- PGMD accepted_at, EON/ION/LON/FON dates where applicable;
- operator review date and chosen WOS/WiPWC/procedure interpretation.
One field data_umowy_przylaczeniowej in current contract does **not** fully solve WOS2025 temporal selection; do not abuse it as synonym for conditions_issued_at or readiness declaration date.

Resolver:
(1) classify module and legal scope, (2) decide WOS2019/WOS2025 by correct event and MWE type, (3) decide WiPWC basis and verify per-device register acceptability at evaluation date, (4) select procedure 3.0 by document submission event, (5) choose OSD-specific rules/conditions, (6) derive required capabilities/tests, (7) bind actual equipment certificates and project tests, (8) aggregate evidence without inventing operator-issued permission.

Example WOS2025 selection for B:
type=B, conditions issue date=2025-12-01 => 2025 branch; type=B conditions issue date=2025-11-30 => 2019 branch unless special rules/modernisation. Example A: conditions 2026-12-31, readiness 2027 => not automatically 2025 because wrong event chosen. Type C existing and modified => art4 gate, not blanket new-plant application.

## 6. Existing repo — observed state and exact gaps (2026-11-10)

backend/src/catalog/profiles/nc_rfg/loader.py implements 7 layers:
NC_RFG, WOS, PROCEDURA_PTPIREE, WIPWC, OSD, MAGAZYNY, NIEUSTALONA; applies one source of type thresholds, clear state names. **Keep it.**

warstwy/wos.yaml: source edition "2018", only threshold parameters 200/10000/75000 kW; other country parameters missing; rule evidence unit redaction status NIEUSTALONE. **Does not implement new WOS2025 temporal branch.**

warstwy/procedura_ptpiree.yaml: procedure version 3.0, effective date null, acceptance criterion values (20 internal tests) marked NIEUSTALONE; program_badan.scenariusze=[]; cannot claim verified tests against official program annexes.

warstwy/wipwc.yaml: edition "1.3" but versions/snapshot publication dates refer to 2026-05-06 and 2026-05-08; PTPiREE current site lists newer Oct/Nov 2026 snapshots. Certificate coverage per requirement is NIEUSTALONE; do not promote to SPELNIA without accepted WiPWC clause.

operatorzy/enea.yaml: last_revision 2024-Q4, IRiESD edition missing, Bank Nastaw and operator right execution not verified, HVRT values inherited 2024-Q4 and marked unknown. **Not current confirmed ENEA requirements.**

warstwy/magazyny.yaml: correctly isolates BESS outside NC RfG (except relevant pumped storage), but contains zero sourced national requirements. This is substantial gap for BESS standalone.

backend/src/network_model/solvers/ncrfg_ptpiree/engine.py: T01–T20 deterministic engine; documented not to replace field tests or dynamics simulations. backend/src/application/ncrfg_compliance/ocena_wymagan.py: per requirement verdict using Werdykt; model_bridge.py maps approved ENM to tests/certificate proof. API exists; do not replace it.

## 7. Specific integration decision for EKC

**EKC becomes edition/evidence/release provider** to existing seven-layer loader, not an eighth conflicting regulatory solver. Preserve current NC RfG parameter schemas and per-requirement status. The current YAML layers can be generated/verifiably loaded from a pinned EKC manifest after proven parity, or remain versioned static adapters until then.

New thin components:
- RegulatoryEditionSelector: multi-event timeline and WOS/WiPWC/procedure selection;
- RequirementEvidenceBinder: link current per-requirement source refs to EKC EvidenceAnchor;
- NormativeReleasePin: lock selected layered profile and register snapshots to case;
- ComplianceCoverageIndex: source verified vs dynamically tested/certified;
- CompatibilityAdapter: same NcRfgProfile and current API response, additive fields only.

Do not mutate model bridge or engine to do PDF retrieval, certificate discovery or time-dependent web calls during run. Build approved snapshot first; use pinned snapshot hash during evaluation.

## 8. Distinct statuses

REGULATORY_SCOPE: APPLIES / NOT_APPLICABLE / UNDECIDED.  
SOURCE_STATUS: VERIFIED / NOT_VERIFIED / STALE / LICENSE_RESTRICTED.  
CERT_STATUS: VERIFIED_ACCEPTED / CERT_VALID_BUT_NOT_ACCEPTED / OUTSIDE_COVERAGE / SUSPENDED / REVOKED / EXPIRED / NOT_FOUND / REGISTRY_STALE / UNVERIFIED.  
TEST_STATUS: NOT_PLANNED / PLANNED / APPROVED / EXECUTED / VALIDATED / REJECTED / RETEST_REQUIRED.  
COMPLIANCE_STATUS: as existing Werdykt StatusWerdyktu with BRAK_DOWODU/BRAK_PODSTAWY/NA_OCENE etc; use actual existing enums, not invent parallel verdicts.
OPERATOR_STATUS: NOT_SUBMITTED / SUBMITTED / REQUESTED_SUPPLEMENT / ACCEPTED / REJECTED / WITHDRAWN.

A certificate valid until 2028 but WiPWC 1.2 accepted only until 2026-12-31 => CERT_VALID_BUT_NOT_ACCEPTED after deadline. This is not CERT_EXPIRED. A device certified for type A but project type B => OUTSIDE_COVERAGE. Missing firm/firmware version => UNVERIFIED; never name it accepted.

## 9. Test acceptance and proof

RG-01 A/B/C/D boundaries incl 110kV. RG-02 B conditions date crossing 2025-12-01. RG-03 A crossing 2027-01-01 and notification vs conditions distinction. RG-04 C/D modernisation scope. RG-05 WiPWC 1.2 old certificate valid beyond acceptability end. RG-06 B old conditions exception + per-record date. RG-07 Procedure 3.0 selected by readiness declaration date, not construction date. RG-08 law edition independent of ENEA profile. RG-09 BESS no NC RfG by default but separate storage legal review. RG-10 missing IRiESD source => not verified. RG-11 changing operator profile does not silently change saved compliant case. RG-12 report records version of each layer and list of unresolved interpretations.

### Acceptance gate RG-0

Before enabling WOS2025 automatic claims: official content/citations approved, per-type/date applicability independently tested, new snapshots introduced, Werdykt parity established, at least one live approved ENM case; no silent reclassification of old projects.

## 10. Authoritative online reference register

- EUR-Lex regulation 2016/631: https://eur-lex.europa.eu/eli/reg/2016/631/oj
- URE on WOS2025 and effective dates: https://www.ure.gov.pl/pl/urzad/informacje-ogolne/aktualnosci/12682,Prezes-URE-zatwierdzil-nowe-Wymogi-ogolnego-stosowania-dla-przylaczania-jednoste.html
- PSE RfG guidance including special applicability dates: https://www.pse.pl/kodeksy/rfg
- PTPiREE WiPWC: https://ptpiree.pl/kodeksy-sieci/warunki-i-procedury/
- PTPiREE certificate registers: https://ptpiree.pl/kodeksy-sieci/wykaz-certyfikatow/
- PTPiREE procedure v3.0: https://ptpiree.pl/kodeksy-sieci/procedura-testowania/
- ENEA operator announcement: https://www.m.operator.enea.pl/o-spolce/teczka-prasowa/komunikaty/komunikat-dotyczacy-wykazu-urzadzen-zgodnych-z-wymaganiami-nc
- ENERGA example country PGM class thresholds: https://energa-operator.pl/przylaczenie-do-sieci/kodeksy-sieciowe/rfg

Every monitored page requires checked_at and stored original metadata; URL and content may change.

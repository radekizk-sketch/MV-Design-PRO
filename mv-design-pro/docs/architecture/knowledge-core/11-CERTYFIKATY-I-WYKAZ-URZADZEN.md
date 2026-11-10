# 11. CERTYFIKATY URZĄDZEŃ, WYKAZ PTPiREE, MODELE, OPROGRAMOWANIE I DOWODY TECHNICZNE

**Status:** specyfikacja rozszerzenia istniejącego katalogu; bez automatycznego uznawania certyfikatów. **Najważniejsza zasada:** certyfikat urządzenia, obecność modelu w wykazie, akceptacja w danym procesie, zdolność całej instalacji i wydane pozwolenie operatora są odrębnymi stanami.

## 1. Obecna struktura — zachować

Istnieją:
- network_model/catalog/ptpiree_wykaz_snapshot.json;
- network_model/catalog/mv_ptpiree_catalog.py;
- /api/catalog/ptpiree/*;
- catalog/profiles/nc_rfg/warstwy/wipwc.yaml (wskazuje rejestr, nie kopiuje listy);
- network_model/solvers/ncrfg_ptpiree/contracts.py: DowodCertyfikatu;
- application/ncrfg_compliance/model_bridge.py: buduje po stronie serwera dowód z materialized_params, dopasowuje rejestr, nie ufa polom żądania;
- application/ncrfg_compliance/ocena_wymagan.py: Werdykt per wymaganie i osobna metoda CERTYFIKAT/TEST/BRAK_METODY;
- OZE UI, w tym ncRfgStore i wizualizacje katalogu.

Ten stan jest dobrym fundamentem, nie tworzyć nowego drugiego rejestru certyfikowanych falowników. EKC dodaje źródło, historię snapshotów, autentyczność, zakres pokrycia i procedurę review. Na podstawie samej listy nie wolno wystawiać prawnego certyfikatu.

## 2. Cztery niezależne encje

### 2.1 EquipmentProductRevision

Identyfikator katalogowego wyrobu: manufacturer legal entity + normalized product_model + model_variation + hardware_revision + firmware_version/range + product_options + topology and rated quantity. Single product can have multiple certificates; one certificate can cover multiple explicitly wymienione modele i wersje oprogramowania. Exact identity matching is preferable to broad substring; aliases need curated mapping and original manufacturer proof.

Fields:
product_id, manufacturer_id, model_exact, model_normalized, aliases, revision, model_family, product_category (inverter, converter, synch generator, wind turbine controller, PPC, relay, protection, transformer, BESS converter, BMS/EMS), firmware_version, firmware_range_predicate, hardware_revision, option_set, serial_number optional for installed device, installed_at, replaced_at. Instance and type remain distinct.

### 2.2 EquipmentCertificate

certificate_id, issuer legal name, issuer accreditation and scheme, certificate number, original document artifact sha, issued_at, valid_until, cert_status, status_observed_at, covered product revisions, applicable NC RfG articles/requirements, WOS edition, WiPWC scheme, module family and types, rated power/frequency/voltage ranges, covered functions, test method, conditions/limitations, embedded external models, Annex references, document language and authorized translation, issuer signature/authentication status, issuer contact, approved evidence.

Certification basis for NC RfG/WOS must correspond to the stated certification scheme, authorized certification organization and accreditation scope. PTPiREE describes independent accredited certification bodies to EN ISO/IEC 17065. The accreditation number must be checkable in competent accreditation register. An ISO 9001 certificate of the producer is not substitute for NC RfG equipment certificate.

### 2.3 PtpireeRegistryRecord

RegistryEntry: source_snapshot_sha; source_version WiPWC 1.2/1.3; published_at and captured_at; row_ref and exact manufacturer/model; cert_document_number; WOS version shown; PGM types covered; firmware/version shown; limitation and date accept_until; official list status; source URL and row/page anchor. All fields preserve exact reading of official source. Multiple entries for same model across editions/revisions are preserved, not overwritten. Known official PTPiREE snapshots at source review 2026-11-10: list 1.2 publication 2026-10-26 and list 1.3 publication 2026-11-06. Earlier May snapshots in repo may remain in history with their own hashes but must be labeled historical.

### 2.4 ProjectDeviceEvidence

InstalledDevice: case/project/PGM ID; ENM generator_ref and equipment_ref; manufacturer, exact model, hardware, actual firmware, serial or device count, commissioning date, installation connection and PPC/plant controller use, associated source docs, acceptance evidence per requirement and operator. A factory certificate for inverter is not evidence of correct installed parameterization at PCC if actual function is delegated to a PPC or external controller. Model generator setpoint belongs to case/ENM; certificate evidence belongs to proof layer.

## 3. Independent validation dimensions

**F1 — Document authenticity:** original certificate exists and is unaltered; signature/issuer verified where possible; legal representative and electronic signature per PTPiREE submission requirements, EU trusted list verification and translation where needed.
**F2 — Issuer competence:** accredited certification body, accreditation valid for correct programme on certificate issue, evidence stored, not merely logo.
**F3 — Product identity:** manufacturer and exact model, revision, firmware, variant, accessories.
**F4 — Coverage:** PGM type A/B/C/D, SyPGM/PPM, technology, functionality LFSM/Q/FRT etc, specified power/voltage range and test method.
**F5 — Scheme:** WOS2018 vs WOS2025, WiPWC version, NC RfG basis, effective project case.
**F6 — Validity:** issued_at/valid_until, suspension/revocation, effective usage stage, special transition conditions and cap on acceptance time.
**F7 — Registry acceptance:** latest captured PTPiREE list, exact entry row, accept-until at evaluation date, any B/C/D grandfathering conditions.
**F8 — Plant-level realization:** control wiring, communication, converter, PPC and transformer all consistent with certified component functional boundary.
**F9 — Commissioning proof:** actual installed unit firmware/settings, FAT/SAT where applicable, on-site test, signed protocols.
**F10 — Operator review:** accepted on site or approved formal submission; an EKC verdict never substitutes operator acceptance.
An overall state can be VERIFIED_ACCEPTED only if applicable required facets are satisfied with sourced evidence. It should have an evaluation_date and a clearly labeled intended stage; otherwise return missing-data status.

## 4. Certificate state model

DRAFT_IMPORTED -> BASIC_VALIDATED -> ISSUER_CHECKED -> PRODUCT_MATCHED -> REGISTRY_MATCHED -> SCHEME_AND_SCOPE_CHECKED -> ACCEPTED_FOR_PROJECT_EVALUATION.
Independent events: ISSUER_SUSPENSION, CERT_REVOKED, NEW_FW_REVISION, ACCEPTANCE_WINDOW_ENDED, NEW_REGISTRY_SNAPSHOT, REPLACED_DEVICE, CONFLICT_FOUND.
Flags: NOT_FOUND, UNVERIFIED, OUT_OF_COVERAGE, WRONG_WOS, WRONG_WIPWC_SCHEME, VALID_BUT_NOT_ACCEPTED, FW_MISMATCH, MULTI_MODEL_AMBIGUOUS, ISSUER_NOT_VERIFIED, SUSPENDED, REVOKED, TRANSLATION_MISSING, NO_SITE_PROOF.

A certificate expiring 2028 but accepted under old scheme only until 2026-12-31 cannot count as accepted in 2027 merely because its document itself is valid.

## 5. Acceptance window algorithm

Input includes evaluation_at, PGM type and legal/date scope, event timeline, exact certificate registry record, scheme, issue/validity, suspension/revocation and exceptions. Steps:
1) If no official source or registry unavailable/stale: NOT_VERIFIED (not ACCEPTED).
2) Verify certificate and source hash plus exact device identity/firmware.
3) Validate covered functionality and PGM class.
4) Choose WOS/WiPWC applicable to project from event resolver (10).
5) Calculate effective acceptance interval from scheme, record accept_until, certificate expiry, applicable cap (PTPiREE page cites 5 years from issue), withdrawals and specific legal/contract restrictions; **cap according to verified original WiPWC rules**, not blindly always five years.
6) Evaluate special transition for B/C/D with pre-2025-12-01 connection conditions and source record.
7) Return per requirement EvidenceStatus and limitations; do not assert whole PGM acceptance.
8) Pin snapshot of register/certificate/decision to project lock. Later source update triggers impact review.

Current model_bridge only has legacy fields including record_id, model, cert number, WOS/WiPWC and accept date, but no full approved artifact/issuer verification. This new design is an additive evidence layer, not a reason to make API request accept arbitrary certificate booleans.

## 6. Functional coverage at level of control chain

For each requirement R:
requirement_id -> ability_id -> accepted demonstration methods -> necessary components -> type certificate refs -> installed configuration -> site tests/simulation refs -> coverage verdict.

Examples:
- LFSM-O may be implemented in converter alone or depend on PPC, turbine/other controller. An inverter type certificate cannot prove the end-to-end function if setpoint logic or droop is in noncertified PPC.
- Q(U) function can exist in inverter firmware but actual regulated voltage measurement at PCC and PPC override may change response; require control chain and site configuration.
- LVRT/HVRT certificate must cover relevant converter characteristic and, depending on regime, plant behavior, protection settings, and network conditions. Static diagram/flag has_lvrt_curve is not proof.
- Reactive capability Q(U)/cosphi(P) has capability envelope dependent on P, voltage, temperature and inverter mode; same catalog presence not enough to prove contractual Q requirement at PCC after transformer/cable losses.
- Fast fault current injection: distinguish type-certified device control from actual fault current as simulated and measurable for scenario; requires verified model, parameters, test/validated simulation evidence.
- Telecontrol/active power reduction: cert of grid-tied inverter without test of dispatch interface and plant controller is incomplete.

Define ProofCompositionRule with ANY_OF/ALL_OF and CONDITIONAL branches plus evidence exclusions. Never assume that the presence of cert automatically replaces every site test.

## 7. Additional certificates and document families — reuse EvidenceVault

The certificate registry should support classes but not confuse their effects:
- NC_RFG_DEVICE_CERTIFICATE / COMPONENT_CERTIFICATE / POWER_PLANT_MODULE_CERTIFICATE;
- EU_DECLARATION_OF_CONFORMITY (LVD/EMC/RoHS, and other directives where applicable);
- IEC_TYPE_TEST_REPORT (switchgear, transformer, cable, CT/VT, relay, battery);
- FACTORY_TEST/FAT; ON_SITE_TEST/SAT; COMMISSIONING_PROTOCOL;
- IEC 61850 communication conformance evidence and IEC 62443 cyber-security certification where project requires (not automatically mandatory for every SN station);
- CALIBRATION_CERTIFICATE for meters, disturbance recorders, VT/CT test equipment;
- manufacturer datasheet, firmware release note, installation/service documentation;
- time-bound quality assurance and conformity declarations;
- environmental and safety declarations only within their actual normative scope.

EU DoC confirms relevant product regulatory compliance; it does not by itself prove NC RfG performance compliance. CE marking is not a certificate of all 2016/631 requirements. Product standard type-test does not substitute commissioning test when requirements are site-specific.

PTPiREE public requirements refer to EU conformity declarations (LVD 2014/35/EU, EMC 2014/30/EU, RoHS 2011/65/EU with 2015/863 changes) for listed devices; choose directives appropriate to actual equipment and regulated scope. Source: https://ptpiree.pl/kodeksy-sieci/

## 8. Suggested schema (illustrative, not implemented)

~~~json
{
  "schema_version": "ekc.certificate-evidence.v1",
  "certificate_ref": "cert:issuer:number:revision",
  "certificate_artifact_sha256": "SOURCE_HASH_REQUIRED",
  "issuer": {
    "legal_name": "CERTIFYING_BODY",
    "accreditation_number": null,
    "accreditation_scheme": "EN ISO/IEC 17065",
    "scope_verified_at": null,
    "signature_checked_at": null
  },
  "basis": {
    "nc_rfg_edition": "EU-2016-631",
    "wos_edition": "WOS2025",
    "wipwc_scheme": "1.3"
  },
  "covered_devices": [{
    "manufacturer_ref": "manufacturer-id",
    "model_exact": "MODEL-X",
    "hardware_revision": "H1",
    "firmware": {"exact": "FW-1.2.3"},
    "rated_power_kw": "250",
    "covered_pgm_types": ["B"],
    "covered_requirement_ids": []
  }],
  "validity": {
    "issued_at": null,
    "valid_until": null,
    "suspended_at": null,
    "revoked_at": null
  },
  "registry_binding": {
    "source": "PTPIREE",
    "registry_snapshot_sha256": "REQUIRED",
    "row_key": "EXACT_ROW_KEY",
    "source_wipwc_version": "1.3",
    "accepted_until": null
  },
  "project_evaluation": {
    "project_case_ref": "CASE-ID",
    "pgm_ref": "PGM-ID",
    "device_instance_ref": "DEVICE-ID",
    "installed_firmware": "FW-1.2.3",
    "evaluated_at": "2027-01-15",
    "status": "NOT_EVALUATED",
    "reasons": ["This is a schema example with no verified source documents"]
  }
}
~~~

This is fictional test data, no device named MODEL-X is claimed to exist or be certified.

## 9. Links with catalogs, model and UI

Catalog remains unique owner of product ratings/model/firmware. EKC attaches CertificateEvidence refs; does not own another physical device catalog. ENM stores installed device and input settings; evidence layer stores cryptographic hash/verification, available certified capabilities and operator review. Reverse link permits:
- list products that are currently accepted for PGM type B;
- notify cases using revoked/mismatched certificate;
- evaluate source replacement or firmware upgrade;
- identify which tests become required if cert no longer covers capability;
- report origin to operator without exposing protected full certificate to unauthorized user.

UI in DER configurator:
device card shows exact manufacturer/model/FW, NC RfG/WOS scope, WiPWC version, certificate number, registered row/date and explicit status; clicking „Sprawdź” shows age of snapshot, allowed range, deficits and necessary tests. Never show only one green tick „certyfikowany” without PGM and date context. In the SLD inspector present a small status link; detailed review in source/certificate panel.

## 10. Automated monitoring (separate from solver)

PTPiREE list watcher checks metadata monthly or when user requests, captures current files privately where rights permit, stores source sha and exact comparison rows, emits:
- MODEL_REMOVED_FROM_LIST;
- ACCEPTED_UNTIL_CHANGED;
- WOS_COVERAGE_CHANGED;
- NEW_CERT_NUMBER / FIRMWARE_RANGE_CHANGED;
- ISSUER_CERT_REVOKED;
- NEW_WIPWC_SCHEME;
- REVIEW_REQUIRED.
Never auto-replace pinned snapshot or silently mark all affected cases PASS/FAIL; show impact graph and recertification plan.

Import can support PDF table reading with OCR/visual review; do not trust manufacturer/model normalization auto-joins with similar strings. Source provenance and permission class attached to every artifact.

## 11. Adversarial tests

CERT-01 exact model present with one firmware, installed other FW => FAIL_MATCH.
CERT-02 manufacturer suffix similar but distinct product => AMBIGUOUS, not auto-accepted.
CERT-03 registered only for type A, project type B => OUTSIDE_COVERAGE.
CERT-04 certificate valid to 2028, WiPWC1.2 acceptance ended 2026-12-31 => VALID_NOT_ACCEPTED.
CERT-05 WOS2018 cert under WOS2025 project with no valid exception => WRONG_BASIS.
CERT-06 B/C/D old conditions before 2025-12-01 and specific registry acceptance date => conditional evaluation, never blanket automatic.
CERT-07 certificate issuer accreditation suspended, document not expired => needs verification/block.
CERT-08 revocation or signature invalid => cannot accept.
CERT-09 operator/tenant cannot read restricted certificate bytes => access denied despite public registry metadata.
CERT-10 inverter certified but PPC actually controls LFSM => device evidence insufficient for plant.
CERT-11 no certificate artifact but list row present => registry-derived proof may be partial only according to accepted legal scheme; provenance exact.
CERT-12 older snapshot vs current source => freshness warning, no invented removal.
CERT-13 power 249kW vs 299kVA or 299kW manufacturer plate => mismatch named.
CERT-14 multiple inverters vs one certificate covering only one model => separate device evidence.
CERT-15 new firmware rev triggers reevaluation, old project remains historically traceable.
CERT-16 EU DoC LVD does not auto-pass NC RfG.
CERT-17 source list inclusion not conflated with commissioning/operator permission.
CERT-18 test request client cannot inject certificate: preserve model_bridge server-only behavior.
CERT-19 certificate number collision across issuers not merged.
CERT-20 daylight/timezone/date boundaries selection deterministic.

## 12. Sources and legal limits

- https://ptpiree.pl/kodeksy-sieci/wykaz-certyfikatow/ (list, authentication, language, validity warnings)
- https://ptpiree.pl/kodeksy-sieci/warunki-i-procedury/ (acceptance transition)
- https://ptpiree.pl/kodeksy-sieci/ (accreditation, WOS, EU DoC)
- https://www.pse.pl/kodeksy/rfg (WOS applicability)
- https://eur-lex.europa.eu/eli/reg/2016/631/oj (European basis)
- https://www.m.operator.enea.pl/o-spolce/teczka-prasowa/komunikaty/komunikat-dotyczacy-wykazu-urzadzen-zgodnych-z-wymaganiami-nc (ENEA Oct2026)
All snapshot dates must be live-rechecked by implementing agent, with actual source PDF and document clauses for enforcement.

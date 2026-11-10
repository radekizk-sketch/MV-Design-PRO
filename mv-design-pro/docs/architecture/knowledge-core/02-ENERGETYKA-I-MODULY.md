# 02. EKC — KONTRAKTY ENERGETYCZNE WSZYSTKICH MODUŁÓW

Status: projekt do audytu Opus/Fable. Wskazanie oznaczenia normy jako kandydata nie jest potwierdzeniem jej konkretnego wymagania ani wydania. Dla każdej normy wdrożenie wymaga edition ID, dowodu strony/punktu, zakresu i testów. Oznaczenia bez potwierdzonej treści = TO_VERIFY.

## 0. Globalna semantyka wielkości

Wszystkie moduły obowiązuje typowanie wielkości: napięcia międzyfazowe/fazowe, RMS/peak, faza/przewód, strona transformatora, moc czynna/bierna/pozorna, import/export, current direction, czas zwarcia/zwłoki, układ zgodny/przeciwny/zerowy, nominal vs actual, cold/hot resistance, f=50/60 Hz. Zmiana bazy napięciowej lub układu odniesienia wymaga jawnej transformacji ze śladem. Katalog, projektant, norma, standard OSD i wynik obliczeń mają odmienne kategorie pochodzenia. Nie ustanawiać globalnej hierarchii „ENEA > IEC”; wymóg może dotyczyć innego obiektu.

Każdy consumer binding definiuje: owner module, input model version, context predicates, knowledge release reference, type of normative output (parameter/rule/formula/table/limit), mapping to domain field, missing-data behavior, local tests, evidence, deployment state. Brak dokumentu nie może dać PASS.

## 1. Moduł obliczeń zwarciowych IEC 60909 — P0

**Rzeczywiste moduły:** backend/src/network_model/solvers/short_circuit_iec60909.py, short_circuit_core.py, short_circuit_asymmetrical_quantities.py, short_circuit_contributions.py, machine_sc_iec60909.py; enm/zero_sequence_transformer.py; test_short_circuit_iec60909.py i golden.

**Źródła:** PN-EN 60909-0:2016-09 (dołączony skan), IEC 60909-0:2026 (nowe osobne wydanie, nie domyślnie zgodne), IEC 60909-3 dla specyficznych zwarć doziemnych, IEC TR 60909-4 przykładów. Wydania sprawdzać osobno. ENEA/warunki przyłączenia mogą definiować dane wejścia źródła, nie algorytm całej IEC.

**Atomy wiedzy:** współczynniki cmax/cmin z zakresami Un i odpowiednią tabelą, I''k, ip, Ib, Ik, iDC(t), impedance correction KT/KG/KS, equivalent voltage source, ZQ from Sk''/Ik'', ratio R/X, cable line Z1/Z2/Z0, generator and inverter contribution, transformer vector group and zero sequence, MAX/MIN assumptions, network configuration, thermal effects.

**Potwierdzone w skanie 2016:** tabela 1 IEC printed 22/PDF 30: dla 1 kV < Un <= 230 kV cmax=1,10 i cmin=1,00; §7.2.1 wzór (33), IEC 43/PDF 51: I''k=c Un/(sqrt3 |Zk|); §6.3.1 wzory (7)–(9), IEC 25/PDF 33 dotyczą impedancji TR; §8.1.1 wzór (57), IEC 50/PDF 58 dotyczy κ. To nie weryfikuje 2026. Parametr cmin=0,95 w projekcie 15 kV musi być jawnie sklasyfikowany jako user assumption/odstępstwo względem 2016, nie opisany jako norma 2016.

**Kontrakt SC_Bundle:** release hash; IEC edition; case MAX/MIN; voltage factor record; selected impedance correction methods; fault class; accepted source models; transformer/cable parameter refs; per-source presence and uncertainty; adapters compatibility. Współczynniki pochodzą z normy albo są wyliczane przez solver — nie mieszać. Brak R/X, Z0, modelu przekształtnika lub danych producenta to jawny brak/wariant ograniczony.

**Testy:** 3F/2F/2F-Z/1F-Z różne sieci składowych, neutral isolated/compensated scope, Z0 path, MAX/MIN independent topology and resistance temperature, multiple source contributions, inverters restricted currents, ip vs I''k vs Ib vs Ik separate outputs, transformer impedance HV/LV basis, reproducibility pinned IEC2016 after indexing IEC2026. Reference 15kV GPZ Sk''=250MVA, R/X=0.10 i TR 110/15 25MVA uk=10.5% stanowią parametry przykładowe do testu z niezależnym rachunkiem, nie wzorcowe dane normowe.

## 2. Rozpływ mocy, napięcia i straty — symetryczne i niesymetryczne

**Kod:** power_flow_newton.py, power_flow_fast_decoupled.py, power_flow_gauss_seidel.py, power_flow_unbalanced.py, power_flow_oltc.py, power_flow_zip.py, power_flow_inverter.py, power_flow_result.py, power_flow_trace.py, enm/rozplyw_niesymetryczny_wynik.py.

**Źródła:** wymagania OSD/IRiESD, PN-EN 50160 dla jakości (nie samej metody algebraicznej), dane katalogowe R'/X'/C' i TR, warunki przyłączenia, modele urządzeń; wykład Zdun 2022 to przykład metody, nie norma.

**Model:** Ybus complex and per-phase, node voltages, P/Q injection sign, slack/PV/PQ node, frequency, phase group, tap OLTC, P_from, P_to, Q_from, Q_to, I_from/to, P_loss, Q_loss, voltage bases, ZIP and inverter current limits, reactive control schedules, convergence tolerance. Straty z bilansu muszą być zgodne z definicjami znaków; nie wyznaczać „dozwolonej” dokładności Newtona ze standardu jakości energii. Rozdzielić physical solver constraint od normative verification limit.

**Bundle:** quality threshold profile as separate evaluator, allowed equipment temperatures, thermal limits, connection point voltage conditions, user-selected Q(U)/cosφ modes, source evidence. Testy: bilans P+jQ, P/Q flows in both directions, compensation raising voltage, reversed PV generation, OLTC saturation, unbalanced 1F load, solver convergence, preservation of topology and results after source update.

## 3. Jakość energii, harmoniczne, asymetria, flicker

**Kod:** quality_analysis_runs.py i powiązane wyniki. **Kandydaci normowi:** PN-EN 50160 wydanie bazowe + A1 jako oddzielna zmiana; IEC 61000-2-2, IEC 61000-2-12, IEC/TR 61000-3-6; warunki ENEA/IRiESD i umowne. Odróżnić limit jakości dostawy od poziomu kompatybilności i alokacji emisji.

Atom limitu: param name and order h, measurement point, voltage class SN/nN, unit (%, V, Hz), aggregation period, percentile, observation window, excluded events, measurement standard and applicable conditions. Single power-flow result != 95th-percentile weekly measurement. THD_U != individual harmonic; V2/V1 != phase voltage spread. Missing window or only A1 without base => PARTIAL/NOT_EVALUATED. Testy: boundary percentiles, histogram/window, not-current measurement, statistical period, harmonics by order, missing source.

## 4. Linie kablowe SN — elektryka i technologia

**Kod:** cable_ampacity_derating.py, cable_voltage_drop.py, conductor_thermal_withstand.py, katalog kabli, ENM line records. **Normy-kandydaci:** IEC 60287 (ampacity), IEC 60502-2 (SN cable product), IEC 60949 (thermal short circuit) i odpowiednie standardy ENEA linii kablowych, producent cable datasheets. Edycje i zakresy wymagają audytu.

Typowane wartości: material Cu/Al, conductor cross-section, XLPE and insulation rating, U0/U/Um, R20, AC resistance frequency/temperature, X', C', screen materials and section, screen bonding and earth-return impedance, length, depth, laying method, ducts/trench, soil thermal resistivity/temperature, grouping, installation correction factors, maximum operating and short-circuit conductor temperatures, accessories, route segments.

Independent check facets: I_load <= Iz_corrected, voltage drop, I²t for phase and screen, insulation, earth-fault return path, min bend radius, mechanical installation, ENEA permitted construction, manufacturer data. If thermal conditions missing => no synthetic default „normal soil” without explicit assumption and provenance. Testy C01 cable group, C02 temperature derivative, C03 parallel lines, C04 thermal fault duration, C05 screen zero sequence, C06 sourced R/X on SN, C07 historical product revision.

## 5. Linie napowietrzne SN, podpory, mechanika, odległości

**Kod MV:** parametry_linii_napowietrznej.py and ENM; planned shared use by SN-SAG-LAB. **Normy-kandydaci:** PN-EN 50341 and national conditions, ENEA line standards, technical regulations for clearances, conductor manufacturer data. Exact scope and official release must be verified; do not invent a universal clearance.

Domain: support type and coordinates, elevation, span length, conductor tensile strength/modulus/linear mass/thermal expansion, climatic temperature/wind/ice combinations, sag catenary and stress, crossarm geometry, insulator/clearance, crossing object type, min distance evaluated at actual load cases, material catalog, geographic reference system. Knowledge supplies verified constraints by scenario/object category; mechanics solver calculates catenary. Test unequal end elevations, hot/cold, icing, terrain collision, export DXF with evidence, EPSG transformations, historical validity. SN-SAG-LAB consumes readonly signed Release via API, not a duplicate local normative registry.

## 6. Stacje SN/nN — A/B/C/D, technologia i cykl życia

**Kod:** enm/rodzaj_stacji.py, pole_transformatorowe.py, station templates; reference_engine/osd_enea. **Źródła:** ENEA SN Z1/Z2/Z3 with exact edition (Z1 06.2024 vs 09.2021-2 requires reconciliation), IEC 62271-202 prefab station, IEC 62271-200 switchgear, IEC 60076 transformer, manufacturer catalog.

Topology A end/B through/C branch/D section is distinct from construction: prefab compact/uproszczona/pole-mounted/indoor. Need separate fields lifecycle NEW/REBUILD/EXISTING, station_construction_variant, transformer_count and Sn, line/transformer/measurement bays, SN nominal/Ur/Ik/Ipk/IAC, remote control, associated devices. ENEA Z1 describes specific compact variants, Z2 simplified, Z3 pole-mounted; not one generic union. Existing implementation only partially models variant: avoid presenting broad range as unconditional PASS. Modes FORBIDDEN/RECOMMENDED/REQUIRES_WAIVER and CONDITIONAL.

Tests ST01 all A/B/C/D, ST02 630 kVA compact vs simplified 400 variant, ST03 pole-mounted cable approach only for new case if standard source supports, ST04 one transformer bay + line bays, ST05 historical station does not automatically fail new-construction rules, ST06 missing construction -> NOT_EVALUATED.

## 7. GPZ 110/SN i model graniczny zasilania

**Cel:** GPZ electrical source and SN bays; no uncontrolled expansion to complete 110kV design. **Sources:** ENEA 110/SN station standards Z.1–Z.17 where actually supplied; IEC 62271, IEC 60076 and IEC 61869 relevant parts.

Grid equivalent: U_WN, Sk''_WN, R/X, Z0 if valid, TR Sn, UK%, Pcu/P0, turns ratio and clock group Yd11 where applicable, tap and tap direction, SN bus sections, CB/CT/VT, outgoing cable and NO states. Separate 110kV boundary context from 15kV SLD projection; CT stays in main path, VT in measurement branch, earthing switch physically lateral. Protection relay boxes and Ferranti residual CT not the same class as VT. Tests HV/SN impedance reference, multi-section bus, normal open device parity L0/L1/L2, transformer sequence conversion, source voltage and I''k, ENEA figure evidence.

## 8. Pola SN, rozdzielnice i aparatura

**Code:** reference_engine field_profiles and compliance, switchgear family catalog, field_configuration_catalog, station configurator, frontend SLD symbol map. **Norms candidates:** IEC 62271-1 common, product specific IEC 62271-100 breaker, -102 disconnectors/earth switches, -103 switches, -105 switch-fuse, -200 metal-enclosed switchgear, -202 prefab stations; official editions required.

Rated quantities typed separately: Ur, Ir, short-time withstand Ik/time, peak withstand Ip, breaking capacity for CB, making current where relevant, insulation Ud/Up, IAC and duration, IP/IK, mechanical/electrical life, specific cell options. **Ik withstand ≠ breaking capacity.** Peak factor cannot be generic for every system R/X. Catalog profile: main path sequence from bus down; lateral_only devices earth switch, VT and surge arrester as electrically appropriate; CT in current path; real cell allowed options. Distinguish manufacturer capabilities and minimum ENEA requirement. Tests switching function, interlocking, device state OPEN/CLOSED/UNKNOWN, CT/VT placement, no multiple source of field profiles, truth across SLD L0/L1/L2, insulation alternative row choices.

## 9. Symbole SLD i geometria — IEC 60617

**Code:** frontend/src symbols/defs.ts, SldCanvasV3 and computeLayout, reference_engine/packs/iec60617. **Source:** IEC 60617 relevant symbol, ENEA approved drawings, real manufacturer wiring. The knowledge registry maps semantic apparatus identity to canonical SymbolId and evidence, but renderer owns SVG geometry; do not copy normative graphic without rights. Do not make layout a validator. Maintain orthogonal routing, consistent labels, no crossings, separate SN/nN views, NO parity, no PV directly on SN bus. Detect duplicate symbol definitions and stale edition links. Tests visual both themes, black-on-white/print, L0-L2 states, order and collisions.

## 10. Transformatory mocy i instrument transformers

**Source candidates:** IEC 60076 series, IEC 61869 relevant CT/VT parts, ENEA Z.11.1 and approved field illustrations, manufacturer datasheets. Data: Sn, HV/LV, uk%, uR%, Pcu, P0, no-load I0, vector clock, tap range, zero sequence, neutral earthing. CT: ratio and selectable taps, Ipr/Isr, burden VA, accuracy class, ALF, FS, multi-core, saturation, polarization. VT: phase voltage ratio, secondary connections, class, burdens, three-star vs open-delta and actual approved wiring. Ferranti ring CT separate class.

Tests TR01 impedance correction for purpose, TR02 zero sequence and groups, TR03 taps, CT01 applied ratio vs nameplate, CT02 protection accuracy and burden, VT01 exact source diagram, VT02 classes and terminal consistency. Design detail based on previously discussed ENEA Z.11.1 requires verification against the exact original PDF edition; never create an absent open-delta winding by guesswork.

## 11. Zabezpieczenia i selektywność

**Code:** protection_iec60255.py, protection_lv_curves.py, enm/nastawy_zabezpieczen.py, protection analysis API. **Sources:** IEC 60255 applicable parts, actual relay manufacturer operating manual, ENEA EAZ and IRiESD, IEC 61850 where used.

Records: 50/51, 50N/51N, 67/67N, 27/59, 81, trip circuit, CB failure, SPZ/SZR only when applicable; CT/VT ratio and polarity; actual pickup, curve family/time multiplier, delay, direction, min fault current and max load/inrush, coordination margins, breaker opening time, earth-fault neutral network. Do not enable 67N from drawing a residual CT; no invisible default on relay configuration.

Tests min short-circuit vs pickup, nominal load stability, coordination with adjacent relays and LV, phase/earth directions, no unknown CT burden PASS, edition-pinned relay curve.

## 12. Telemechanika, IEC 61850, obwody wtórne

**Sources:** ENEA telemechanika applicable revision (repo references 12.2025), IEC 61850, IEC 60870-5 (if applied), manufacturer/control devices. Typed requirements: qualification of object vs technical specification, current/voltage measurements per remote-controlled line bay, signaling and status quality, remote controls and interlocks, TETRA/GSM or other concrete ENEA requirement, auxiliary DC supply and driver, protocol, IED mapping, security, timestamps. Avoid inferring all stations must have telemechanika just because technical standard lists capabilities.

Tests TEL01 correct CT+VT for eligible remote line, TEL02 local bay exclusion, TEL03 loss-of-communication quality, TEL04 voltage class and measured quantity, TEL05 approved protocol mapping and no unauthorized breaker control.

## 13. PV, BESS, FW, biogaz i źródła synchroniczne

**Code:** der_sn_validation.py, der_selection_preview.py, ncrfg_ptpiree/, power_flow_inverter.py, dynamika, oze_analysis_runs.py. **Sources:** NC RfG and Polish implementation, PTPiREE testing v3.0 (main doc + 18 program annexes according to historical PR #521), current ENEA IRiESD and connection conditions, manufacturer tests/certificates.

Type A/B/C/D PGM applicability and dates, active/reactive capacity Pmax/Q, rated vs connected vs measured power; Q(U), cosphi(P), P(f), LFSM-O/U, FSM, HVRT/LVRT, PPW, Pmax/Pmin, PGM equipment certificates; operator-specific setpoints. Converter contribution k_sc cannot be guessed; explicit control/ride-through limitations; turbine synchronous/asynchronous and converters differ.

Tests DER01 generator type classification and performance test applicability; DER02 Q(U) deadband proper voltage and sign; DER03 production/consumption directions and reactive limits; DER04 source missing k_sc = NOT_EVALUATED; DER05 certificate model/firmware/status; DER06 transformer block and field required on SN SLD; DER07 biogas nameplate 299kW vs Pmax 249kW not conflated; DER08 proper 2026 procedural release.

## 14. BESS, energia i cyber/functional safety

BESS is not merely a PV inverter with negative P. Types: PACmax, PDCmax, E_nom, E_usable, SOC, charge/discharge efficiency separated, P/Q envelope, mode grid-forming/following, fault contribution, protection, safety. Candidate IEC 62933 plus applicable electrical/fire/operational rules after edition audit; do not invent generic SOC/efficiency from norm. Test BESS01 energy/power units, BESS02 SOC boundary, BESS03 reverse power and voltage, BESS04 inverter fault clipping, BESS05 reporting charge and discharge separately.

## 15. nN i portal SN–TR–nN

**Code:** enm/uklad_sieci_nn.py, fault_loop_iec60364.py, fault_loop_builder.py, protection_lv_curves.py, nn_proof API. **Sources:** PN-HD/IEC 60364 relevant part, IEC 60909 in its scope, ENEA nN, manufacturer protection curves.

One ENM computation network but two visual SLD projections. nN parameters: L/N/PE/PEN, TN-C/TN-S/TT/IT, neutral grounding, conductor loop impedance, ADS conditions, fuse/CB curves and disconnection, RCD if modeled, voltage drop, thermal conductor and neutral. Project does not receive fake PASS when earthing system unknown. LV portal on transformer secondary endpoint; independent LOD. Tests LV01 loop and disconnection, LV02 TT/IT special case, LV03 neutral source path, LV04 no mixed SN+nN symbols in one SLD, LV05 exact product curve.

## 16. Uziemienia, sieć składowej zerowej i kompensacja

**Code:** zero_sequence_transformer.py, uziemienie.py, uziom_instalacji.py, petla_zwarcia_tt_it.py. **Candidates:** IEC 60909-3, EN 50522, ENEA earthing and neutral management, conductor ground and cable sheath source. Need correct neutral topology: isolated, compensated (Petersen coil), resistor/grounded, zero-sequence impedance and capacitance network, return path through screens/soil, protection residual current, touch/step voltage where solver implemented. 3F I''k does not prove earth fault protection. Tests EARTH01 isolated 1F fault scope, EARTH02 Z0 path, EARTH03 transformer delta blockage, EARTH04 missing earth model no PASS.

## 17. Pomiary rozliczeniowe, CT/VT, współczynniki, straty umowne

**Code/source:** POMIAR_ROZLICZENIOWY_SN_V1, ENEA measuring standard, IRiESD, meter manufacturers; PR #521 training material EMH/Landis/Pozyton (NOT NORMA). Direct/semi-indirect/indirect metering, meter class, CT/VT ratio, actual circuitry, active/reactive import/export, contract multiplier, metering period and comparison. Separate technical power-flow I²R losses from energy accounting I²h/U²h formula. Do not enable multiplier calculator unless all variables and units verified from source. Tests M01 polarity, M02 burden and classes, M03 multiple meter configurations, M04 source and version, M05 no normative threshold from owner note without confirmatory source.

## 18. Aparaty i katalogi producentów

**Code:** network_model/catalog/switchgear, catalog/materialization, switchgear_config.py, reference_engine manufacturer packs. Product family registry remains single owner of ratings; EKC attaches edition and source evidence. Features: family option-dependent cells, Ur/Ir/Ik/Ip/IAC, pressure/insulation, CT/VT options, features and firmware, certificates, catalog validity, substitution constraints. Evaluator computes multiple independent checks: manufacturer capability + ENEA applicability + product standard + thermal/electrical sizing. Tests CAT01 version and option, CAT02 min ENEA vs rated catalog, CAT03 missing certificate, CAT04 no duplicate static JSON truth, CAT05 BOM and product revisions pinned.

## 19. Trasa GIS, profil, CAD, prace budowlane

Source classes include regulations and public maps separately from norms. Geometry constraints: route lengths, clearance, crossings, installation depth, cadastral zoning, coordinate reference, uncertainty, data currency, ownership, easements. EKC provides compliance criteria and links, map and CAD provide geometry. External SN-SAG-LAB can use protected readonly release or exported manifest; never share raw licensed PDFs without rights. Test GPS/EPSG correctness, physical dimensions, collision category, source valid time, export trace and rights.

## 20. Estymacja stanu i stan operacyjny

**Code:** state_estimation_wls.py, state_estimation_synthetic_benchmark.py, enm states. Data timestamp/quality, measurement variance, phase, RTC, switching status; external operational rules only if within application scope. Estimated state is not a measured value. A stale result after ENM topology edit is a different warning from „norm source release superseded”. No SCADA animation semantics required. Test estimator observability/quality, asynchronous source clocks, state consistency with topology and NO.

## 21. Raporty, archiwizacja, testy i ślady

**Code:** proof_pack, equipment_proof_pack, document_store, project_archive, archive_diff, result_contract_v1, analysis runs. Every engineering output must include project/case and ENM fingerprint, knowledge lock, document editions and record IDs, applied assumptions, solver version, catalog version, warnings, conflict resolution, deviation approvals, actual source clause/table/equation, input and result values, unit and sign conventions.

PDF reports can cite sources and short controlled quotations but cannot embed full licensed norms. Archive package retains manifest, release hash and source refs; offline reproducibility depends on preserved approved record data and solver code, not remote latest. Test RPT01 trace from Ip to κ source; RPT02 historical reopen; RPT03 license/ACL; RPT04 all mandatory normative bases present; RPT05 no fake PASS.

## 22. Interfejs, asystent i MCP

**Code:** frontend/src/ui2/referencje, ui2/inspector, ui2/wyniki, ui2/kreatory, api/reference_engine.py. Three surfaces not duplicated: global „Baza wiedzy”, contextual „Podstawa” on element/result, controlled reviewer/importer. Views: Documents, Editions, Requirements, Formulas, Tables, Changes, Approval, Impact, Project Lock. One click to actual source PDF page if authorized; when not authorized show metadata and reason.

Agent read-only actions: search sources, ask verified question, resolve applicability, explain conflict, list impacted consumers, compare editions/releases, export citations. Separate approved actions for import/proposal/review/release/migration. No LLM deciding COMPLIANT. Interface labels in Polish and explicit statuses NIE OCENIONO / BRAK DANYCH / KONFLIKT / NIE DOTYCZY / ZWERYFIKOWANO. Test cross-version citation, dark/light, mobile, source permissions, no misleading all-green summary.

## 23. Candidate source list — intake plan, not compliance claim

SC: IEC/PN-EN 60909-0; IEC 60909-3; IEC TR 60909-4.  
Switchgear/stations: IEC 62271-1/-100/-102/-103/-105/-200/-202; IEC 60076.  
Measurements: IEC 61869 series; meter/product-specific documents.  
Quality: PN-EN 50160 base and A1; IEC 61000 appropriate parts.  
Cables: IEC 60287, IEC 60502-2, IEC 60949, manufacturer/ENEA.  
Overhead: PN-EN 50341 and national annexes, operator standards.  
Protection/data: IEC 60255, IEC 61850, IEC 60870 applicable parts and manuals.  
LV/earthing: PN-HD IEC 60364 appropriate parts, EN 50522 where applicable.  
PGM: NC RfG/OSD IRiESD/PTPiREE testing/conditions/certificates.  
OSD: ENEA, then other operators as independent edition families.  
Educational: Dołęga and Zdun — explanatory only.

No claims of verified coverage for unimported versions. Each imported edition receives an evidence and implementation coverage matrix: % indexed pages; # verified records; # enforced; # with tests; # stale; # unresolved; # unknown-required-data.

## 24. Vertical acceptance milestones

First: SC 60909 sample (versioned c table + I''k equation + locked result trace) and ENEA Z1 specific station/bay rule (actual ENM consumer and manual source check). Second: switchgear device ratings and catalog; third: LF, CT/VT, protection and quality; fourth: PV/BESS/FW and PTPiREE; fifth: cables/overhead/LV/earth; sixth: reports, cross-app interfaces, multi-operator sources. One PR per vertical cut, separate independent reviewer and golden tests; do not accept isolated card counts as end-to-end success.

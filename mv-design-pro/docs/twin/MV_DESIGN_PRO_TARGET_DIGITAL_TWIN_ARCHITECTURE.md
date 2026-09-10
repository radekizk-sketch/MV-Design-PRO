# MV-DESIGN-PRO — TARGET DIGITAL TWIN ARCHITECTURE (FAZA B)

> **Status od 2026-09-04 (kontrakt MAX PLATFORM):** materiał wejściowy i dowodowy programu konwergencji. Źródło kanoniczne architektury: `../architecture/PRODUCT_CAPABILITY_CONSTITUTION.md`, `../architecture/CAPABILITY_ARCHITECTURE_MATRIX.md`, `../architecture/CANONICAL_TWIN_ARCHITECTURE.md`, `../architecture/CONVERGENCE_ROADMAP.md`, `../architecture/DECISION_FREEZE_REGISTER.md`, `../reference-networks/REFERENCE_NETWORK_REGISTRY.md`, `../evidence/CONVERGENCE_EVIDENCE.md`. Przy rozbieżności obowiązuje dokument kanoniczny; w szczególności: nie powstaje nowa klasa `TwinModel` (Canonical Project Twin = rozwinięty ENM), `network_model` jest pochodnym IR, program nie zatrzymuje się po M0, lecz prowadzi konwergencję wycinkami CV-0…CV-6 z bramkami B-01/B-02 i procedurą kasacji.


**Status:** PROPOZYCJA DO PRZEGLĄDU WŁAŚCICIELA (mandat §156, §179–§180). Nie jest jeszcze kanonem.
Do czasu decyzji właściciela obowiązuje kanon V12.xx; każda różnica względem kanonu jest
zarejestrowana w `OWNER_REVIEW_PACKAGE.md` §C (konflikty mandatu) i nie została wdrożona.
**Data:** 2026-09-02 · **Autor:** Fable (architekt) · **Gałąź:** `claude/mv-design-pro-twin-audit-u4lhy0`
**Wejście:** mandat „FINAL MASTER ARCHITECTURE MANDATE" (§0–§186) + audyt śledczy
`MV_DESIGN_PRO_DIGITAL_TWIN_AUDIT.md` (FAZA A) + rdzeń repo (`enm/models.py`,
`network_model/core/*`, `application/analyses/lv_domain/*`, kanon `docs/v12xx/KANON_V12_XX.md`).
**Dokumenty siostrzane:** `MV_DESIGN_PRO_SIMULATION_ARCHITECTURE.md` (solvery, orkiestrator),
`MV_DESIGN_PRO_PROTECTION_ARCHITECTURE.md`, `MV_DESIGN_PRO_DESIGN_OPTIMIZATION_ARCHITECTURE.md`,
`MV_DESIGN_PRO_SLD_PRESENTATION_ARCHITECTURE.md`, `MV_DESIGN_PRO_DATA_VERSIONING_PROVENANCE.md`,
`MV_DESIGN_PRO_TARGET_ENGINEERING_WORKFLOW.md`, `MV_DESIGN_PRO_MIGRATION_PLAN.md`, ADR-012…ADR-028.

---

## 0. Po co ten dokument i czego NIE robi

Ten dokument definiuje **docelowy rdzeń** platformy: kanoniczny cyfrowy bliźniak sieci SN + SN/nN + nN
(dalej: **twin**), jego tożsamości, model terminalowy, warstwy stanu, scenariusze, kontrakty wyników,
katalog, walidację, projekcje, wersjonowanie, API i inwalidację. Opisuje *co ma być prawdą* i *gdzie
ta prawda żyje*. Nie opisuje kolejności prac (to `MV_DESIGN_PRO_MIGRATION_PLAN.md`) ani ekranów
(to `MV_DESIGN_PRO_TARGET_ENGINEERING_WORKFLOW.md`).

Dokument NIE zaczyna implementacji (mandat §2, §180). Wszystkie typy w tym dokumencie są
**kontraktami do przeglądu**, zapisanymi w notacji Pythona (Pydantic v2 / frozen dataclass), bo taka
jest konwencja repo; nazwy angielskie w kodzie, polskie w warstwie użytkowej (kanon V12.xx §3).

### 0.1 Diagnoza, na którą ten dokument odpowiada (skrót z FAZY A)

| Klasa defektu (dowód w audycie) | Odpowiedź architektury docelowej (sekcja) |
|---|---|
| Trzy zapisywane źródła prawdy: ENM (flat-file JSON), worek `Substation.meta.field_specs` / `nn_field_specs` (aktywna prawda o polach i aparatach), legacy ORM `network_nodes/…` + `NetworkSnapshot` w torze `analysis_runs`/`wizard_runtime`/`xlsx_import` | Jeden `TwinModel` z jawnymi encjami aparatów w polach; worek meta i tor legacy znikają (§4, §6, §25) |
| `ref_id` stabilne, ale tłumaczone na `uuid5` w czterech przestrzeniach nazw (mapping, field_read_model, sld projection, CGMES) i wyciekające do `solver_input`, ResultSetV1 (`element_ref` + `element_ref_id`), UI („Element #ABCD1234") | Jedna przestrzeń tożsamości `asset_id` + `ref_id` + `terminal_id`; mapowanie na indeksy solvera wyłącznie wewnątrz adaptera, nigdy w kontrakcie (§5) |
| Brak terminali: `Port` „nie jest węzłem fizycznym", `ConnectionNode` „interpretacja", scalanie węzłów przez łączniki dopiero w `AdmittanceMatrixBuilder` | Model terminal-centric: `Terminal` ↔ `ConnectivityNode`; `TopologicalNode` wyprowadzany przez `TopologyService` (§6, §9) |
| Brak modelu fazowego (`Bus.phase_system: Literal["3ph"]`), układ TN/TT/IT jako string w `meta` | `PhaseCode` na terminalu i przyłączu, `EarthingSystem` jako encja poziomu napięcia (§7, §16) |
| Stan łącznika w ośmiu reprezentacjach (`status`, `in_service`, `switch_state`, `BaySwitchState.actual_state`, `BayOperatingState`, `BayScenarioState`, `SwitchingStateORM`, sceny SLD) | Jedna oś `OperationalState` + jedna oś `AssetLifecycle` + delty scenariusza; wszystko rozwiązywane w jednym `EffectiveStateResolver` (§10, §23) |
| Inwalidacja „zmiana modelu = wszystkie przypadki OUTDATED" (docstring `domain/study_case.py`) mimo macierzy invalidacji w kanonie | Graf zależności atrybut→analiza i selektywna inwalidacja zakresowa (§22) |
| Projekcja nN liczona w backendzie (dobrze), projekcja SN składana w kliencie z `enmToSldAdapter.ts` (6585 LOC) — dwa tory tej samej sieci | Jedna warstwa projekcji semantycznej w backendzie dla SN i nN; geometria jako stan prezentacji (§19) |

---

## 1. Zasady fundamentalne (mandat §184–§185 jako inwarianty)

Kolejność ważności: **MODEL → FIZYKA → TOŻSAMOŚĆ → TERMINALE → ŚLAD → WORKFLOW → automatyzacja tam,
gdzie bezpieczna → decyzja inżyniera zawsze jawna**. Dopiero na tym CAD, SCADA, UI, raporty, AI.

Inwarianty architektury (każdy dostaje test klasy — §26 tego dokumentu):

| # | Inwariant | Kryterium FAIL z §185, które chroni |
|---|---|---|
| I-01 | Istnieje dokładnie jedno zapisywane źródło prawdy o sieci projektu: `TwinModel` w rewizji. Każda inna reprezentacja jest projekcją z jawnym `source_revision`. | „dwa źródła prawdy" |
| I-02 | Każde urządzenie ma jedno `asset_id` niezmienne przez cały cykl życia, we wszystkich modułach (model, scenariusz, solver, wynik, SLD, raport, archiwum, CIM). | „solver ma własną tożsamość", „SCADA i CAD wymagają dwóch modeli" |
| I-03 | Łączność (`ConnectivityNode`) nie zmienia się przy OPEN/CLOSED; topologia efektywna jest wyprowadzana, nigdy zapisywana jako prawda. | „SLD ma własną topologię" |
| I-04 | Fizyka wyłącznie w solverach; projekcja, UI, raport, walidacja, optymalizator nie liczą wielkości elektrycznych. | (kanon NOT-A-SOLVER) |
| I-05 | Każdy wynik ma `Provenance` (run, solver+wersja, rewizja, scenariusz, ustawienia, katalog, czas, status) i status świeżości; wynik bez provenance nie może wejść do projekcji ani dokumentu. | „wynik nie posiada provenance", „nowa sieć + stary wynik" |
| I-06 | Zmiana w modelu propaguje się deterministycznie: komenda → rewizja → inwalidacja selektywna → (przeliczenie) → projekcje i dokumenty oznaczone. Brak ręcznej synchronizacji. | „zmiana nie propaguje się" |
| I-07 | Każda rekomendacja niesie dowód (ograniczenia, marginesy, alternatywy, ślad obliczeń). | „rekomendacja nie posiada dowodu" |
| I-08 | Brak danych nie jest zerem: `MISSING_DATA` / `ASSUMPTION_REQUIRED` / `NOT_EVALUABLE` są stanami pierwszej klasy. | (§91, §138) |
| I-09 | Twin działa dla dowolnej sieci spełniającej kontrakt, nie tylko dla fixtur; kod produkcyjny nie zna nazw fixtur. | „działa tylko dla fixture/demo" |
| I-10 | Decyzja projektowa jest zawsze jawna: automat proponuje (`PROPOSED`), człowiek zatwierdza (`APPROVED`). | (§134, §182) |

---

## 2. Mapa kontekstów (bounded contexts)

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ IDENTITY & VERSIONING  (asset_id, ref_id, rewizje, gałęzie wariantów, decision log)       │
└──────────────────────────────────────────────────────────────────────────────────────────┘
      │ nadaje tożsamość i rewizje wszystkiemu poniżej
┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│ CATALOG       │→ │ TWIN CORE     │← │ SCENARIO &    │  │ MEASUREMENT & │  │ GRID INTERFACE│
│ (typy, rewizje│  │ Asset ·       │  │ TIME          │  │ OPERATIONS    │  │ & DER         │
│  provenance)  │  │ Connectivity ·│  │ (delty, N-1,  │  │ (pomiary,     │  │ (punkt        │
│               │  │ Topology ·    │  │  horyzonty,   │  │  stan ruchowy,│  │  przyłączenia,│
│               │  │ Earthing ·    │  │  szeregi)     │  │  granica      │  │  umowa, RfG)  │
│               │  │ Phase         │  │               │  │  SCADA)       │  │               │
└───────────────┘  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘
                           └──────────────────┴──────────────────┴──────────────────┘
                                              │ EffectiveStateResolver → CanonicalNetworkSnapshot
┌───────────────┐  ┌───────────────────────────┐  ┌───────────────┐  ┌────────────────────────┐
│ PROTECTION    │← │ SIMULATION                │→ │ RESULTS &     │→ │ DESIGN ENGINEERING     │
│ (CT/VT, IED,  │  │ (SolverOrchestrator,      │  │ PROVENANCE    │  │ (ConstraintEngine,     │
│  funkcje,     │  │  adaptery, cache,         │  │ (ResultSet v2,│  │  DesignOptimization,   │
│  nastawy, TCC)│  │  White Box)               │  │  freshness)   │  │  candidates, decisions)│
└───────────────┘  └───────────────────────────┘  └───────────────┘  └────────────────────────┘
                                              │
┌───────────────┐  ┌───────────────────────────┐  ┌───────────────┐  ┌────────────────────────┐
│ VALIDATION &  │  │ PRESENTATION              │  │ DOCUMENTATION │  │ INTEGRATION            │
│ READINESS     │  │ (projekcja semantyczna,   │  │ (dokumenty    │  │ (CIM/CGMES, GIS, XLSX, │
│               │  │  layout, symbole, LOD,    │  │  jako         │  │  DXF-like, SCL/61850   │
│               │  │  CAD/SCADA/ENGINEERING)   │  │  projekcje)   │  │  boundary)             │
└───────────────┘  └───────────────────────────┘  └───────────────┘  └────────────────────────┘
                                              │
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ ENGINEERING WORKFLOW (etapy, dojrzałość projektu, następna akcja, komendy domenowe, API)  │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

Reguły między kontekstami:

1. **Twin Core** nie zna solverów, projekcji, dokumentów ani UI. Zna katalog wyłącznie przez `CatalogBinding` (identyfikator + rewizja), nie przez kopie parametrów.
2. **Scenario & Time** nie mutuje twin: produkuje delty nakładane przez `EffectiveStateResolver`.
3. **Simulation** przyjmuje wyłącznie `CanonicalNetworkSnapshot`; nie czyta `TwinModel` bezpośrednio (§20).
4. **Results & Provenance** przechowuje wyniki kluczowane tożsamościami twin; nigdy indeksami solvera.
5. **Presentation** i **Documentation** czytają twin, scenariusze, wyniki i provenance; nie liczą fizyki; zapisują wyłącznie własny stan prezentacji (layout, preferencje).
6. **Design Engineering** (ograniczenia, optymalizacja, decyzje) czyta wyniki i katalog; proponuje komendy domenowe; nigdy nie zapisuje do twin bezpośrednio.
7. **Grid Interface & DER** trzyma punkt przyłączenia jako obiekt *umowy i rozliczeń* odwołujący się do terminala twin — nie jako węzeł fizyczny (rozstrzygnięcie konfliktu §44 w §17).
8. **Measurement & Operations** to jedyne miejsce, gdzie istnieje pojęcie „stanu rzeczywistego" i „telemetrii"; sterowanie urządzeniami jest poza platformą (§119, §24).

Mapowanie kontekstów na dzisiejsze pakiety repo (docelowo): `backend/src/twin/` (Twin Core, Identity, Scenario, Effective State, Topology, Validation), `backend/src/catalog/` (dziś rozproszone w `network_model/catalog`), `backend/src/simulation/` (dziś `network_model/solvers` + `solver_input` + `enm/canonical_analysis.py` + `application/analyses/*` z fizyką), `backend/src/protection/`, `backend/src/results/`, `backend/src/design/` (ograniczenia, optymalizacja, decyzje), `backend/src/presentation/` (projekcja semantyczna, layout, symbole), `backend/src/documentation/`, `backend/src/integration/`, `backend/src/workflow/`. Szczegóły przeniesień: `MV_DESIGN_PRO_MIGRATION_PLAN.md`.

---

## 3. Warstwy stanu (mandat §6) — czego nie wolno mieszać

| Warstwa | Co zawiera | Gdzie żyje | Kto pisze | Klucz wersji |
|---|---|---|---|---|
| ASSET MODEL | urządzenia, ich klasy, powiązanie katalogowe, parametry projektowe, ratingi, lifecycle | `TwinModel.assets` | komendy domenowe | `revision_id` |
| CONNECTIVITY MODEL | terminale, węzły łączności, kontenery (stacja, poziom napięcia, pole, linia) | `TwinModel.connectivity` | komendy domenowe | `revision_id` |
| TOPOLOGY MODEL | węzły topologiczne, wyspy, energizacja, tory zasilania, feedery | **wyprowadzany** przez `TopologyService` | nikt (cache) | hash(rewizja, stan ruchowy, delta scenariusza) |
| DESIGN STATE | wartości projektowe, override'y z uzasadnieniem, założenia, decyzje | `TwinModel` + `DesignDecisionLog` + `AssumptionsRegister` | komendy domenowe | `revision_id` |
| AS-BUILT STATE | znacznik lifecycle INSTALLED/COMMISSIONED + parametry powykonawcze + pomiary odbiorcze | nakładka `AsBuiltOverlay` na tej samej tożsamości | komendy `record_as_built_*` | `revision_id` (tag AS_BUILT) |
| OPERATIONAL STATE | położenia łączników, in-service, zaczepy, tryby pracy DER, stan normalny vs bieżący | `OperationalState` (stan normalny w rewizji; stan bieżący w Operations) | komendy ruchowe / import | `operational_state_id` |
| MEASUREMENT STATE | pomiary z jakością i źródłem, przypięte do terminali/urządzeń | `MeasurementSet` | import / ręczne wprowadzenie | `measurement_set_id` |
| SCENARIO STATE | delty względem bazy | `Scenario` | komendy scenariuszowe | `scenario_revision_id` |
| SIMULATION STATE | migawka efektywna + ustawienia solvera | `CanonicalNetworkSnapshot` + `SolverSettings` | `EffectiveStateResolver` | `snapshot_hash` |
| RESULT STATE | wyniki frozen + provenance + status świeżości | `ResultStore` | orkiestrator | `analysis_run_id` |
| PRESENTATION STATE | layouty, przypięcia, LOD, preferencje widoku, tabliczki rysunków | `PresentationStore` (per widok, per użytkownik/projekt) | UI przez komendy prezentacji | `layout_revision_id` |

Zakaz mieszania jest egzekwowany typami (osobne moduły i modele Pydantic bez wspólnych pól) oraz guardem architektury (import graph między pakietami — rozszerzenie dzisiejszego `arch_guard.py`).

---

## 4. Ontologia rdzenia: encje i value objects

Ontologia jest **wyrównana z IEC 61970-301 (CIM)** tam, gdzie CIM ma dojrzałe pojęcie, ale nie jest kopią CIM (mandat §121–§122: mapping boundary, nie rewrite). Wyrównanie daje: gotową granicę CGMES (istniejący `infrastructure/cgmes/*` przestaje potrzebować side-cara dla stacji/pól/terminali), spójny język z PowerFactory/CIM-owymi narzędziami OSD, i zerową potrzebę wymyślania nazw.

### 4.1 Encje kontenerowe (hierarchia §13)

```python
class Substation(Container):            # stacja: GPZ, SN/nN, rozdzielcza, odbiorcza, RGnN wolnostojąca
    asset_id: AssetId; ref_id: RefId; designation: str | None
    kind: Literal["GPZ", "MV_LV", "SWITCHING", "CUSTOMER", "LV_BOARD", "INLINE", "BRANCH", "TERMINAL"]
    construction: Literal["wnetrzowa","kontenerowa","slupowa","prefabrykowana","inna"] | None
    voltage_levels: list[VoltageLevelId]

class VoltageLevel(Container):          # jawny poziom napięcia w stacji (110 kV / 15 kV / 0,4 kV / 0,69 kV)
    substation_id: AssetId
    base_voltage: BaseVoltage           # nominal_kv + pasmo (HV/MV/LV) — JEDNA definicja pasma w repo
    earthing_system: EarthingSystem | None   # dla nN: TN-C/TN-S/TN-C-S/TT/IT; dla SN: sposób uziemienia punktu neutralnego (§16)
    bays: list[BayId]; busbar_sections: list[AssetId]

class Bay(Container):                   # pole: liniowe, transformatorowe, sprzęgłowe, pomiarowe, DER, potrzeb własnych, rezerwowe, odpływ nN
    voltage_level_id: VoltageLevelId
    role: BayRole; template_ref: CatalogRef | None; designation: str | None
    equipment: list[AssetId]            # aparaty W polu jako prawdziwe urządzenia z terminalami (nie rekordy-obrazki)

class Line(Container):                  # ciąg liniowy (magistrala/odgałęzienie/pierścień) — zbiór odcinków między stacjami
    segments: list[AssetId]; kind: Literal["main_trunk","branch","ring","loop"]; normal_open_point: AssetId | None
```

Pasmo napięcia jest wyprowadzane z `BaseVoltage`, nigdy z koloru, nazwy ani pozycji na rysunku (mandat §13). Jedna funkcja `voltage_band(nominal_kv)` w `twin/base_voltage.py` zastępuje dwie niezgodne stałe (`< 1.0` vs `<= 1.0` kV) wykryte w audycie.

### 4.2 Urządzenia przewodzące (ConductingEquipment) — każde ma terminale

| Klasa (docelowa) | Terminale | Odpowiednik CIM | Dziś w ENM | Uwagi |
|---|---|---|---|---|
| `BusbarSection` | 1 | BusbarSection | `Bus` (węzeł) | Szyna jest **urządzeniem** o jednym terminalu na węźle łączności; sekcje szyn = osobne `BusbarSection` + `Breaker/Disconnector` sprzęgła między nimi |
| `Breaker` | 2 | Breaker | `SwitchBranch(type="breaker")`, `BayPrimaryDevice(kind="CB")` | stan ruchowy: OPEN/CLOSED/TRIPPED/INTERMEDIATE/UNKNOWN; zdolności: `Icu/Ics/Icm/Icw/tk` z katalogu |
| `Disconnector` | 2 | Disconnector | `type="disconnector"`, `kind="DS"` | |
| `LoadBreakSwitch` | 2 | LoadBreakSwitch | `type="switch"`, `kind="LOAD_SWITCH"` | rozłącznik |
| `EarthSwitch` (uziemnik) | 1 (+ziemia) | GroundDisconnector | `kind="ES"` | stan EARTHED wynika z CLOSED uziemnika; typologia `earthing_role` |
| `Fuse` | 2 | Fuse | `FuseBranch`, `kind="FUSE"` | wkładka gG/aM/MCB-band z katalogu; przepalenie = zdarzenie, nie stan |
| `FuseSwitch` (rozłącznik bezpiecznikowy) | 2 | (kompozycja) | `device_kind=ROZLACZNIK_BEZPIECZNIKOWY` | jedno urządzenie o dwóch funkcjach; `conditional_sc_current_ka` kombinacji |
| `Contactor` | 2 | (Switch) | brak | odbiory silnikowe nN |
| `Recloser` | 2 | Recloser | `junction_type="recloser_point"` | reklozer SN z funkcjami SPZ |
| `ACLineSegment` (kabel / linia napowietrzna) | 2 | ACLineSegment | `Cable`, `OverheadLine` | parametry z katalogu przez `CatalogBinding`; `n_parallel`, mufy jako `CableJoint` (element bez podziału topologii), ekran i sposób uziemienia ekranu (§16) |
| `PowerTransformer` + `TransformerEnd` (2–3 końcówki) | 1 per końcówkę | PowerTransformer / PowerTransformerEnd | `Transformer(hv_bus_ref, lv_bus_ref)` | grupa połączeń, przełącznik zaczepów (`TapChanger` ISTNIEJE — zachować), uziemienie punktu neutralnego per końcówka (`GroundingImpedance`) |
| `EnergyConsumer` (odbiór) | 1 | EnergyConsumer | `Load` | model P/Q/ZIP/silnik; `phase_connection` (§7); klasa odbiorcy i współczynnik jednoczesności (wymaganie dodatkowe R-06) |
| `AsynchronousMachine` (silnik) | 1 | AsynchronousMachine | `Machine` w core, `silnik` w E2E nN | rozruch: `Istart/In`, `cosφ_start`, metoda rozruchu (§29) |
| `ExternalGrid` (zasilanie systemowe) | 1 | EquivalentInjection / EnergySource | `Source` | `Sk″max/min`, `R/X`, `Z0/Z1`, `c_max/c_min`, pasmo U; provenance z warunków OSD |
| `SynchronousMachine` | 1 | SynchronousMachine | `Generator(gen_type="synchronous")` | agregat/SZR — wymaganie dodatkowe R-09 |
| `PowerElectronicsConnection` (falownik PV / PCS BESS / FW pełnoprzekształtnikowe) | 1 | PowerElectronicsConnection | `Generator(gen_type in pv_inverter/bess/fw_pmsg…)`, `ConverterType` | tryby: `Q(U)`, `cosφ(P)`, `P(f)`, `GFL/GFM/DUAL`, model zwarciowy (`k_sc`, `sc_pq_split`); źródło pierwotne osobno (§17) |
| `EnergySourceUnit` (moduły PV / turbina / bateria) | 0 (przyłączone przez PEC) | PhotoVoltaicUnit / WindGeneratingUnit / BatteryUnit | zlepione w `Generator` | rozdzielenie źródła pierwotnego od konwertera (§39) |
| `ShuntCompensator` | 1 | ShuntCompensator | `ShuntCapacitor` (ISTNIEJE) | + dławik (`ShuntReactor`) |
| `PetersenCoil` / `NeutralResistor` | 1 (między punktem neutralnym a ziemią) | PetersenCoil / GroundingImpedance | `GroundingConfig` na `Bus`/`Transformer` | jako urządzenie z tożsamością (dobór, katalog, dokumentacja) |
| `CurrentTransformer` (+ `CTCore[]`) | przyłączony do terminala (AuxiliaryEquipment) | CurrentTransformer | `Measurement(measurement_type="CT")` | rdzenie: klasa, moc, ALF/Kn; rola per rdzeń (§36) |
| `PotentialTransformer` (+ uzwojenia) | AuxiliaryEquipment | PotentialTransformer | `Measurement("VT")` | `open_delta/star`, `vt_mounting` (ISTNIEJE — zachować pola) |
| `SurgeArrester` | 1 | SurgeArrester | `kind="SURGE_ARRESTER"` | dobór IEC 60099-5 (R-12) |
| `Meter` (układ pomiarowo-rozliczeniowy) | AuxiliaryEquipment | Meter | `POMIAR_ROZLICZENIOWY_SN_V1.md` | wiąże rdzeń pomiarowy CT/VT i punkt przyłączenia |
| `CableHead` (głowica kablowa) | 1 | (Junction) | `kind="CABLE_HEAD"` | jawny koniec kabla w polu — „kabel nie wchodzi w szyny" (§105) |
| `Junction` / `BranchPoint` (słup rozgałęźny, ZKSN, mufa rozgałęźna) | n | Junction | `BranchPointSN`, `Junction` | węzeł łączności z tożsamością i katalogiem (ZKSN) |
| `NeutralSplitPoint` (rozdział PEN→PE+N) | 1 | (brak w CIM) | brak | nN: punkt rozdziału jako urządzenie (§16) |
| `EarthElectrode` (uziom) | ziemia | (brak) | pola `earth_electrode_resistance_ohm` w `BayEarthFaultPath` | dobór i pomiar `R_E`; napięcia dotykowe (R-10) |

Wszystkie klasy dziedziczą po `Asset`:

```python
class Asset(BaseModel):
    asset_id: AssetId                       # UUIDv4 nadawany raz przy utworzeniu, NIGDY z hasha nazwy
    ref_id: RefId                           # stabilny klucz domenowy (dzisiejsze ref_id ENM — zachowane 1:1 w migracji)
    designation: Designation | None         # oznaczenie projektowe wg IEC 81346 (=,+,-); NIE jest tożsamością
    name: str
    kind: AssetKind                         # dyskryminator klasy
    lifecycle: AssetLifecycle               # PLANNED…RETIRED (§23)
    catalog_binding: CatalogBinding | None  # {item_id, catalog_revision} — bez kopii parametrów (§15)
    overrides: list[ParameterOverride]      # {param, value, unit, reason, author, at, quality}
    parameters: ParameterSet                # WYŁĄCZNIE wartości niekatalogowe (długość, moc odbioru, nastawa zaczepu…)
    data_quality: DataQuality               # KNOWN/ASSUMED/ESTIMATED/UNCERTAIN + completeness (§15)
    terminals: list[Terminal]
    container_id: ContainerId | None        # pole/poziom napięcia/linia
    tags: list[str]; meta: dict             # meta NIE MOŻE nieść prawdy domenowej (guard: zakaz odczytu meta w solverach/projekcjach)
```

Wartości (value objects): `Quantity(value, unit)` na granicy API (§15.3), `PhaseCode`, `BaseVoltage`, `CatalogRef`, `RefId`, `Designation`, `Provenance`, `DataQuality`, `Rating`, `Margin`.

### 4.3 Co znika z modelu (zasady inżynierskie właściciela: bez warstw zgodności)

- `Substation.meta.field_specs` / `nn_field_specs` (worek nietypowany) → pola i aparaty jako encje (§4.1–§4.2); migracja deterministyczna z istniejących `field_specs` (mapa `kind`+`placement` → łańcuch urządzeń w polu) z komunikatem `NOT_MODELED` tam, gdzie brak danych — bez fabrykacji.
- `Port` / `PortRef` / `ConnectionNode` (adresy „nie-węzły") → `Terminal` / `ConnectivityNode`.
- `Bus` jako węzeł-i-urządzenie → `ConnectivityNode` + `BusbarSection`.
- `BayPrimaryDevice`, `BayCanonicalModel` (read-model v10.bay.1 z własnymi stanami) → urządzenia w polu + `OperationalState`; read-model pola staje się zwykłą projekcją.
- `InverterType` (duplikat `ConverterType`, dług D-15) → jeden `PowerElectronicsConverterType`.
- Legacy ORM `network_nodes/branches/sources/loads`, `NetworkSnapshotORM`, tor `analysis_runs`/`wizard_runtime` na `NetworkGraph` bez ENM → kasacja po migracji konsumentów (plan migracji, slice 0–1).
- `materialized_params: dict` kopiowane do elementów → materializacja na żądanie z katalogu w rewizji (§15.1).

---

## 5. Tożsamość (mandat §9) — jedna przestrzeń, zero tłumaczeń w kontraktach

| Identyfikator | Postać | Nadawanie | Trwałość | Gdzie wolno użyć |
|---|---|---|---|---|
| `asset_id` | UUIDv4 | raz, przy komendzie tworzącej | na zawsze (także po RETIRED i po usunięciu — w dzienniku) | wszędzie: model, scenariusze, wyniki, projekcje, dokumenty, archiwum, CIM (`mRID = asset_id`) |
| `ref_id` | string stabilny (dzisiejszy `ref_id` ENM) | deterministycznie przez komendę (`_make_id` — zachować algorytm dla zgodności istniejących projektów) | stabilny; zmiana nazwy/parametrów go nie zmienia | klucz domenowy w API i dokumentach; unikalny w projekcie |
| `designation` | „=ST-03+RGnN-QF1" (IEC 81346) | użytkownik / konwencja OSD | zmienny | wyłącznie warstwa użytkowa i rysunki; NIGDY jako klucz |
| `terminal_id` | `{asset_id}:T{n}` | deterministycznie z klasy urządzenia | stabilny | model, scenariusze (delty per terminal), pomiary, wyniki per terminal, projekcje |
| `connectivity_node_id` | UUIDv4 | komenda łączenia | stabilny | model, projekcje |
| `topological_node_id` | `tn:{sha256(sorted CN ids)[:16]}` | wyprowadzany | ważny w obrębie migawki | wyniki (obok listy CN), projekcje |
| `container_id` | UUIDv4 | komenda | stabilny | model |
| `revision_id` | monotoniczny + hash treści | `RevisionService` | trwały | wszystko wersjonowane |
| `scenario_id` / `scenario_revision_id` | UUIDv4 / hash delt | komenda | trwały | migawki, wyniki, dokumenty |
| `snapshot_hash` | sha256 kanonicznej migawki | `EffectiveStateResolver` | deterministyczny | cache, provenance |
| `analysis_run_id` | UUIDv4 + `run_hash` | orkiestrator | trwały | wyniki, dokumenty, ślady |
| `measurement_id` | UUIDv4 | import/wpis | trwały | pomiary |
| `catalog_item_id@rev` | `namespace:item@N` | katalog | niezmienny per rewizja | binding, provenance |
| `solver_mapping` | tabela `asset_id/terminal_id → indeks` | adapter solvera | żyje tylko w `SolverInput` i w provenance run | NIGDY w kontraktach publicznych |

Reguły:

1. `uuid5(ref_id)` w czterech dzisiejszych przestrzeniach (mapping, field_read_model, sld projection, CGMES) przestaje istnieć; pozostaje jedna funkcja migracyjna `legacy_uuid5_for(ref_id)` w pakiecie migracji, używana wyłącznie do odczytu starych wyników/archiwów.
2. `ResultSet v2` (§14) kluczuje po `asset_id`/`terminal_id`/`topological_node_id`; `element_ref` = `ref_id` dodatkowo dla czytelności. Frozen `ShortCircuitResult`/`PowerFlowResult` (poziom solvera) pozostają nietknięte — ich `bus_id` to indeks solverowy tłumaczony w adapterze.
3. Guard `no_raw_ids_in_ui_guard.py` rozszerzony: UI nie może wyświetlać `asset_id` ani `uuid5` — tylko `designation`/`ref_id`/`name`; brak `designation` = jawny komunikat, nie „Element #ABCD".
4. Kanoniczna `MACIERZ_ID_I_REFERENCJI.md` zostaje przepisana do powyższej tabeli (audyt: wymagane `catalog_snapshot_id/variant_id/switching_snapshot_id/result_id` nie istnieją w kodzie).

---

## 6. Model terminalowy (mandat §10)

```python
class ConnectivityNode(BaseModel):          # punkt równego potencjału w łączności (bez impedancji)
    cn_id: CnId; container_id: ContainerId; base_voltage: BaseVoltage
    phases: PhaseCode                        # zbiór faz dostępnych w węźle (ABCN, ABC, AN…)

class Terminal(BaseModel):                   # zacisk urządzenia
    terminal_id: TerminalId; asset_id: AssetId; sequence: int   # 1..n, znaczenie per klasa (np. TR: 1=HV, 2=LV, 3=TV)
    cn_id: CnId | None                       # None = zacisk wolny (nieprzyłączony) — legalny stan modelu niekompletnego (§138)
    phases: PhaseCode                        # fazy, którymi urządzenie wchodzi do węzła (ABC / ABCN / AN / N / PE / PEN)
    connected: bool = True                   # rozłączenie logiczne bez usuwania łączności (CIM Terminal.connected)
```

Przykłady (mandat §10): `Breaker`: T1 — QF — T2; `PowerTransformer`: T1 (HV end), T2 (LV end), [T3 (TV end)]; `ACLineSegment`: T1 (from), T2 (to); `BusbarSection`: T1; `EnergyConsumer`: T1; `CurrentTransformer`: przyłączony do konkretnego `terminal_id` innego urządzenia (`attached_terminal_id`), z własnymi rdzeniami; `EarthSwitch`: T1 + niejawny terminal ziemi.

Gramatyka pola (§104) wynika z łączności, nie z szablonu: pole liniowe SN to łańcuch `CableHead(T1)=CN1 — Disconnector — CN2 — CurrentTransformer@T — Breaker — CN3 — BusbarSection`, gdzie `EarthSwitch` siedzi na CN1. Szablon pola z katalogu (`bay_templates.py` — zachować jako wzorzec) **materializuje** taki łańcuch komendą `create_bay_from_template`, a projekcja rysuje to, co jest w łączności. Zero „dorysowywania" (§104).

Reguła jednoznaczności: terminal należy do dokładnie jednego urządzenia; węzeł łączności może mieć 0..n terminali; dwa terminale tego samego urządzenia nie mogą wskazywać tego samego CN (zwarcie wewnętrzne) — walidacja `MODEL/T-01…T-06` (§18) i testy inwariantów (§26).

---

## 7. Model fazowy (mandat §11, §23)

```python
PhaseCode = Literal["ABC", "ABCN", "AB", "BC", "CA", "A", "B", "C", "AN", "BN", "CN", "N", "PE", "PEN", "ABN", "BCN", "CAN"]
```

- `Terminal.phases` i `ConnectivityNode.phases` niosą fazy; `EnergyConsumer.phase_connection` mówi, między którymi fazami jest odbiór (np. `BN` = odbiór jednofazowy L2-N).
- Przewody: `ACLineSegment.conductors: ConductorSet` = zestaw żył `{L1,L2,L3,N,PE,PEN}` z parametrami per żyła (R, X, przekrój, materiał, Ith/jth) — dzisiejsze pola `return_conductor_*` (ISTNIEJĄ, zachować dane) stają się żyłą `PE`/`PEN` w `ConductorSet`; brak żyły = brak, nie zero.
- Solvery deklarują `phase_domain` w rejestrze zdolności (`POSITIVE_SEQUENCE`, `SYMMETRICAL_COMPONENTS`, `PHASE_ABC`, `PHASE_ABCN`); `CanonicalNetworkSnapshot` jest budowany w wariancie właściwym dla solvera (§13). Zadanie wymagające ABCN (odbiory 1-faz., prąd N, asymetria U wg EN 50160) nie może dostać migawki positive-sequence — orkiestrator odmawia z `NOT_EVALUABLE(phase_domain)`.
- Terminal ziemi (`PE`) jest jawny; pętla zwarcia L-PE/L-PEN liczy się po żyłach z `ConductorSet` tej samej trasy (dzisiejszy `fault_loop/route.py` — zachować algorytm, przenieść na twin).

---

## 8. Hierarchia i poziomy napięć (mandat §13) — patrz §4.1

Reguły: każde urządzenie należy do dokładnie jednego kontenera (`Bay` lub `VoltageLevel` lub `Line`); `BaseVoltage` jest cechą `VoltageLevel` i `ConnectivityNode`; transformator SN/nN ma końcówki w dwóch `VoltageLevel` tej samej `Substation` (jeden obiekt łączy poziomy — mandat §12); RGnN wolnostojąca to `Substation(kind="LV_BOARD")` z jednym `VoltageLevel(0,4 kV)`; podrozdzielnica = kolejna `Substation(kind="LV_BOARD")` zasilana `ACLineSegment`.

---

## 9. Łączność a topologia (mandat §14) — `TopologyService`

```python
class TopologyService:
    def derive(self, snapshot: CanonicalNetworkSnapshot) -> TopologyView: ...
class TopologyView(BaseModel):              # WYNIK wyprowadzony, cache'owany, nigdy zapisywany jako prawda
    topological_nodes: list[TopologicalNode]     # CN scalone przez ZAMKNIĘTE łączniki (union-find) — jedno miejsce w repo
    islands: list[Island]                        # §43: island_id, sources, grid_forming_reference, frequency/voltage/neutral reference, power_balance, validity
    energization: dict[TerminalId, EnergizationState]   # ENERGIZED/DEENERGIZED/UNKNOWN/CONFLICT/MULTISOURCE (semantyka z projekcji nN 3.0.0 — ZACHOWAĆ)
    supply_paths: dict[AssetId, SupplyPath]      # tor zasilania każdego urządzenia od źródła (§111 trace supply)
    feeders: list[Feeder]                        # feeder = zbiór urządzeń za polem odpływowym w stanie normalnym
    voltage_islands: ...                         # sprawdzenie spójności pasm napięć (inwarianty T0 z sld/v3/electrical — ZACHOWAĆ, przenieść do backendu)
```

Zasady: OPEN/CLOSED nie modyfikuje łączności (I-03); `TopologyView` liczy się wyłącznie w backendzie; frontend dostaje ją w projekcji (dzisiejsza projekcja nN 3.0.0 robi to poprawnie — to wzorzec dla SN). Dzisiejsze scalanie węzłów w `AdmittanceMatrixBuilder` staje się konsumentem `TopologyView`, nie jej producentem.

---

## 9a. Macierz zdolności topologicznych (wymóg właściciela §C.3)

„Obsługujemy sieci SN" jest zdaniem bez treści dopóki nie wiadomo, które układy pracy są policzalne, a które nie. Macierz jest **kontraktem zdolności**: każda pozycja ma status, warunek stosowalności, test na sieci z rejestru wzorcowego i zachowanie przy braku zdolności (jawna odmowa, nigdy wynik przybliżony).

| # | Zdolność topologiczna | Co musi umieć twin | Dotyka |
|---|---|---|---|
| T1 | `RADIAL` — sieć promieniowa | jedno źródło, jeden tor zasilania per odbiór | `TopologyService`, LF, SC |
| T2 | `RING` — pierścień zamknięty | pętla zamknięta, rozpływ dwustronny, SC z dwóch stron | LF, SC, koordynacja |
| T3 | `NOP` — pierścień otwarty w punkcie podziału | punkt podziału jako stan łącznika, nie jako brak elementu | `EffectiveState`, scenariusze |
| T4 | `BUS_COUPLER` — sprzęgło szyn | dwie sekcje jako osobne TN przy sprzęgle otwartym, jedno TN przy zamkniętym | union-find CN→TN |
| T5 | `SHARED_UPSTREAM` — wspólne zasilanie górne | wspólna impedancja zastępcza dla wielu odejść; korelacja zwarć | assembler, SC |
| T6 | `INDEPENDENT_SOURCES` — źródła niezależne | wiele źródeł bez galwanicznego połączenia; osobne wyspy | `Island`, slack per wyspa |
| T7 | `PARALLEL_OPERATION` — praca równoległa | dwa transformatory/linie równolegle, rozpływ prądów wyrównawczych, grupy połączeń | LF, SC, cieplne |
| T8 | `BACKFEED` — zasilanie zwrotne | odwrócenie kierunku mocy przy generacji; kierunkowość zabezpieczeń | LF, 67/67N |
| T9 | `ISLAND` — praca wyspowa | wyspa z odniesieniem grid-forming lub bez; bilans mocy; częstotliwość | `Island`, RMS, LoM |
| T10 | `MULTI_TR` — wiele transformatorów w stacji | rozdział obciążenia, zaczepy, sekcje nN | LF, nN |
| T11 | `MULTI_SECTION` — wiele sekcji szyn | sekcjonowanie SN i nN, przełączenia | topologia, N-1 |
| T12 | `DEEP_LV` — głęboka nN | rozgałęziona sieć nN za stacją, kilka poziomów rozdzielnic | projekcja nN, IEC 60364 |
| T13 | `PHASE_DOMAIN` — domena fazowa | ABCN, asymetria, przewód N i PE, VUF | solver 4-przewodowy |

Reguły: (1) status zdolności (`SUPPORTED` / `PARTIAL` / `NOT_IMPLEMENTED`) deklaruje **rejestr zdolności solverów**, nie dokument; (2) każda pozycja ma co najmniej jedną sieć w rejestrze wzorcowym pokrywającą ją jawnie; (3) kombinacja zdolności (np. T2 × T8 × T13 — pierścień z zasilaniem zwrotnym w domenie fazowej) jest osobnym przypadkiem testowym, zgodnie z regułą KLASA, NIE INSTANCJA (test jako iloczyn cech); (4) analiza żądana na topologii poza zdolnością solvera kończy się jawną odmową z powodem i wskazaniem, której zdolności brakuje.

---

## 10. Effective State Resolution (mandat §15) — jedna funkcja, deterministyczna

```
EffectiveState = resolve(
    base   = TwinRevision(revision_id),
    asbuilt= AsBuiltOverlay | None,            # gdy projekt jest w formie AS_BUILT/AS_OPERATED (§8)
    ops    = OperationalState(operational_state_id),   # stan normalny (z rewizji) lub bieżący (Operations)
    delta  = ScenarioDelta(scenario_revision_id),
    time   = TimeContext(horizon, timestamp | None),
) -> CanonicalNetworkSnapshot(snapshot_hash, resolved_assets, resolved_terminals, resolved_ops, provenance_per_attribute)
```

Reguły rozwiązywania (kolejność pierwszeństwa, jawna i zapisana w provenance każdego atrybutu): `ScenarioDelta` > `OperationalState` > `AsBuiltOverlay` > `TwinRevision`; katalog materializowany w rewizji katalogu zapisanej w bindingu; override projektanta > katalog; brak wartości = `MISSING` (nigdy domyślna liczba). Rozproszone `??`/`if` w kliencie (audyt A2) znikają — klient dostaje gotowe wartości efektywne z etykietą źródła.

---

## 11. Scenariusze, horyzonty, szeregi czasowe (mandat §16–§19)

```python
class Scenario(BaseModel):
    scenario_id: ScenarioId; name: str; base_revision_id: RevisionId; parent_scenario_id: ScenarioId | None
    deltas: list[Delta]; kind: ScenarioKind      # BASE, PEAK_LOAD, MIN_LOAD, MAX_DER, MIN_DER, N_1, LINE_OUTAGE, TR_OUTAGE, BUS_SECTION_OUTAGE,
                                                 # OPEN_RING, CLOSED_RING, ISLAND, MAINTENANCE, FAULT, PV_CURTAILMENT, BESS_CHARGE, BESS_DISCHARGE,
                                                 # FUTURE_DEVELOPMENT, MOTOR_START, COLD_LOAD_PICKUP, BACKFEED_TEST, PROTECTION_STUDY, CUSTOM
    time: TimeContext | None                     # YEAR_0/5/10/CUSTOM + wzrost obciążeń/DER per klasa; opcjonalnie znacznik czasu dla szeregów
Delta = SwitchStateDelta | OutageDelta | LoadScaleDelta | LoadValueDelta | GenerationDelta | CurtailmentDelta | BessModeDelta
      | TapDelta | SourceEquivalentDelta | TemperatureDelta | FaultDelta | MaintenanceEarthingDelta | ProtectionSettingDelta
      | TimeSeriesBindingDelta | GrowthDelta
```

- `ScenarioEngine` składa `BASE + DELTA = EFFECTIVE` (nie kopiuje sieci; dzisiejsze `CanonicalRun.snapshot = pełna kopia ENM` zastępuje `snapshot_hash` + odtwarzalność z rewizji i delt).
- Scenariusze standardowe generowane komendami (`generate_n1_contingencies`, `generate_ring_states`, `generate_der_envelope`) — dzisiejszy N-1 (`N-1-BACKEND`) staje się generatorem scenariuszy, a nie osobną analizą z własną pętlą.
- `TimeSeries` to obiekt pierwszej klasy (kolumnowy magazyn, nie JSON w modelu): `series_id`, `quantity`, `unit`, `resolution`, `values`; `TimeSeriesBindingDelta` wiąże serię z atrybutem urządzenia (P odbioru, P PV, SOC BESS, temperatura, zaczep, stan łącznika). Pętla QSTS orkiestratora konsumuje binding. Dziś istnieje wyłącznie zalążek: `run_annual_oltc_profile` z jednym globalnym `load_scale` per krok (audyt A2-12/A2 §11.1), a operacja `run_time_series_power_flow` byla fantomem (usunieta CV-3.2) — fundament pod 8760 h wymaga magazynu serii i profili per element, bez nowego solvera (§19).
- `StudyCase` (kanon V12: przypadek obliczeniowy) = `{scenario_id, analysis_kinds, solver_settings, operator_profile}`; „wariant pracy" kanonu = `Scenario`; „migawka stanów łącznikowych" = `OperationalState` w migawce. Trzy byty kanonu §7 zachowane, ale spięte jedną osią delt.
- **Warianty projektu** (§85–§86) NIE są scenariuszami: to gałęzie rewizji twin (`VariantBranch`) z tym samym `asset_id`; porównanie wariantów = `diff(revision_a, revision_b)` + porównanie wyników. Istniejące `archive_diff` (sekcje archiwum) i `study_case_delta` (diff LEGACY `NetworkSnapshot`, nie ENM — audyt A2-15) są wzorcem ALGORYTMU diff, nie kodem do wpięcia.

---

## 12. Pomiary (mandat §117–§118)

```python
class Measurement(BaseModel):
    measurement_id: MeasurementId; target: TerminalId | AssetId
    quantity: Literal["U","I","P","Q","S","f","cosphi","THD_U","THD_I","U_unbalance","temperature","tap","switch_position","SOC","R_E"]
    value: float; unit: str; timestamp: datetime; quality: Literal["GOOD","SUSPECT","BAD","MANUAL"]
    source: Literal["MEASURED","CALCULATED","ESTIMATED","ASSUMED"]; source_ref: str | None   # np. protokół pomiarowy, tag SCADA, run_id
```

Granica estymacji stanu: WLS (ISTNIEJE: `state_estimation_wls.py`) czyta `MeasurementSet` + migawkę; wynik estymacji jest `ResultSet` ze `source=ESTIMATED`, nigdy pomiarem i nigdy wynikiem solwera rozpływu — trzy odrębne magazyny (§118). Dzisiejsze `BayMeasurements`/`BayRuntimeState` wewnątrz modelu ENM przechodzą do `MeasurementSet` i `OperationalState` (poza rewizją projektową).

---

## 13. Migawka kanoniczna i solvery (mandat §20–§21) — skrót

Pełny opis: `MV_DESIGN_PRO_SIMULATION_ARCHITECTURE.md`. Kontrakt: `TWIN → SCENARIO → EFFECTIVE SNAPSHOT → SOLVER ADAPTER → SOLVER → CANONICAL RESULT`. Jedna ścieżka (dzisiejszych ścieżek ENM→solver jest kilka: `canonical_analysis`, `solver_input/builder`, `load_flow_run_input`, `analysis_run`, `network_wizard`, `power_flow_input_builder` — audyt A3). Adaptery: `PositiveSequenceAdapter` (NR/GS/FD/IEC 60909 3F), `SequenceComponentsAdapter` (SC 1F/2F/2F-E z Z0), `PhaseDomainAdapter` (rozpływ niesymetryczny nN, pętle L-PE/L-PEN), `DynamicAdapter` (RMS/FRT), `QstsAdapter`. Frozen rdzenie solverów bez zmian (B-01).

---

## 14. Wyniki i provenance (mandat §113–§116)

```python
class Provenance(BaseModel):
    analysis_run_id: RunId; analysis_kind: AnalysisKind; solver_id: str; solver_version: str
    twin_revision_id: RevisionId; scenario_revision_id: ScenarioRevisionId; operational_state_id: str
    snapshot_hash: str; settings_hash: str; catalog_revision_set: dict[str, int]; rules_version: str | None
    started_at: datetime; finished_at: datetime; status: Literal["FINISHED","FAILED","NOT_READY","PARTIAL"]
class ResultSetV2(BaseModel):                  # kluczowany tożsamościami twin; FROZEN po publikacji
    provenance: Provenance
    per_terminal: dict[TerminalId, TerminalResult]; per_asset: dict[AssetId, AssetResult]; per_topological_node: dict[TnId, NodeResult]
    global_results: dict[str, Quantity]; violations: list[Violation]; trace_ref: TraceRef      # White Box (§113–§114)
    freshness: Freshness                        # FRESH / STALE(reason, changed_scope) / SUPERSEDED — liczona przez graf zależności (§22), nie przez porównanie całego hasha
```

`ResultSetV1` (FROZEN, kluczowany `element_ref`) pozostaje kontraktem legacy do wygaszenia po migracji konsumentów (overlay, proof, raporty); adapter `v2→v1` jest mostem migracyjnym z datą wyłączenia (slice 1–3). Klik w wynik prowadzi po `trace_ref` do śladu: wynik → solver → scenariusz → rewizja → wejście → wzór → wartości pośrednie (§113) — istniejący Proof Engine i `WhiteBoxTrace` są tu do zachowania w całości.

---

## 15. Katalog, asset, provenance, jednostki, jakość danych (mandat §88–§95, §135–§136)

### 15.1 Catalog item vs installed asset
- `CatalogItem` niezmienny per rewizja (`namespace:item@N`); zmiana danych producenta = nowa rewizja katalogu, stary binding dalej wskazuje starą (reprodukowalność). Katalog dostaje `CatalogRevisionLog` (dziś katalogi to stałe Pythona bez rewizji — audyt A6).
- `Asset.catalog_binding + overrides` zamiast `materialized_params` (kopia). Materializacja = funkcja czysta `materialize(asset, catalog_at(rev)) -> EffectiveParameters` z provenance per parametr; istniejący `MaterializationContract`/`solver_fields` (ZACHOWAĆ) staje się jej tabelą kontraktową.
- Jedno źródło prawdy dla wszystkich rodzin (§95): kable, linie, transformatory, aparaty SN/nN, wkładki, MCB/MCCB, CT, VT, przekaźniki/IED, falowniki/PCS, BESS, generatory, kondensatory, dławiki, cewki Petersena, ograniczniki, szablony pól i stacji. Duplikaty (`InverterType`, katalogi `audit2_*`, mirrory TS) → jeden rejestr + generowane typy TS (§21).

### 15.2 Provenance parametru i data lineage
Każdy parametr efektywny niesie `ParameterProvenance {source: CATALOG(rev) | OVERRIDE | DERIVED(formula, inputs) | ASSUMED(assumption_id) | MEASURED(measurement_id) | MISSING, quality: DATASHEET | ESTIMATED | SYSTEM_DEFAULT | KNOWN | UNCERTAIN, at, by}`. Istniejący `solver_input/provenance.py` (`SourceKind`, `FieldQuality`, `CardFieldStatus`, `osd_card_gate`) jest ziarnem tej klasy — zachować, uogólnić na wszystkie rodziny (dziś obejmuje wybrane pola). Lineage wyniku: `ResultSetV2.trace_ref` + `Provenance` + `snapshot.provenance_per_attribute` dają łańcuch „R kabla ← katalog X@5" / „Ik ← run 123" bez dodatkowej struktury.

### 15.3 System jednostek (§92)
Wewnątrz domeny: jednostki kanoniczne SI ze skalą zapisaną w nazwie pola (`_kv`, `_mva`, `_ohm_per_km`) + rejestr jednostek `twin/units.py` (jedna tabela: symbol, wymiar, skala). Na granicy API: `Quantity{value, unit}` tam, gdzie klient formatuje (wyniki, inspektor, dokumenty). Frontend ma JEDEN moduł formatowania (`ui2/units/format.ts`) bez arytmetyki jednostek; lokalne `/1000`, `*Math.sqrt(3)` znikają (guard `ui_no_physics` rozszerzony o konwersje). Konflikt z literalnym brzmieniem §92 („każda wartość: value+unit") rozstrzygnięty: obiekt per wartość na granicy prezentacji, nie w każdym polu modelu (uzasadnienie w `OWNER_REVIEW_PACKAGE.md` §C-09).

### 15.4 Jakość danych, założenia, override'y, niepewność (§88–§91, §135)
- `DataQuality {status: KNOWN|ASSUMED|ESTIMATED|UNCERTAIN, completeness: 0..1, missing: [param]}` per asset; `AnalysisReadiness {READY|NOT_READY(missing)|STALE|VALID|FAILED}` per analiza per scenariusz (dziś: `readiness`/`eligibility` — zachować kody, przenieść na twin).
- `AssumptionsRegister` (rewizjonowany): `{assumption_id, value, unit, source, reason, scope, revision}`; parametr `ASSUMED` musi wskazywać `assumption_id`.
- `ParameterOverride` (ISTNIEJE w ENM: `key/value/reason`) rozszerzony o `old_value`, `author`, `at`, `affected_constraints` (§89).
- Zero cichego fallbacku (§91): `EffectiveStateResolver` nie zna wartości domyślnych; brak = `MISSING` → readiness `NOT_READY` z listą braków → fix-action. Guard `domain_no_guessing`/`false_zero`/`solver_input_substitute` (ISTNIEJĄ) przenoszą się na nowe pakiety.

---

### 15.5 Rejestr źródeł normatywnych i danych (wymóg właściciela §C.4)

Każda liczba wchodząca do obliczeń ma **klasę źródła** i **rewizję źródła**. Bez tego nie da się odpowiedzieć na pytanie „skąd to się wzięło", a to jest warunek dowodowości całego produktu.

```python
class SourceClass(str, Enum):
    STANDARD = "STANDARD"                # norma: IEC 60909, IEC 60364, IEC 60287, IEC 60255, PN-EN 50160...
    OSD_POLICY = "OSD_POLICY"            # instrukcja ruchu i eksploatacji sieci, wytyczne operatora
    MANUFACTURER = "MANUFACTURER"        # dane producenta z dokumentu (karta katalogowa, protokół prób)
    CATALOG = "CATALOG"                  # pozycja katalogu wewnętrznego z rewizją
    USER_ASSUMPTION = "USER_ASSUMPTION"  # założenie projektanta z uzasadnieniem
    MEASUREMENT = "MEASUREMENT"          # pomiar z datą, przyrządem i niepewnością

@dataclass(frozen=True)
class NormativeSource:
    source_id: str
    source_class: SourceClass
    designation: str            # "IEC 60909-0:2016", "IRiESD OSD X wyd. 5", "protokol prob TR nr ..."
    revision: str               # wydanie / data / numer rewizji katalogu
    clause: str | None          # punkt normy, tabela, wzór
    valid_from: date | None
    valid_to: date | None
    document_ref: str | None    # odsyłacz do dokumentu w archiwum projektu
```

Reguły wiążące: (1) **każda stała normatywna** użyta przez assembler lub solver (c_max/c_min, κ, współczynniki jednoczesności, dopuszczalne spadki, temperatury graniczne, współczynniki poprawkowe) pochodzi z rejestru — zakaz literału w kodzie fizyki; (2) zmiana wydania normy jest zmianą rewizji źródła i **unieważnia wyniki** przez graf zależności, tak samo jak zmiana modelu; (3) `ParameterProvenance` wskazuje `source_id` — raport odtwarza pełny łańcuch: wartość → parametr → źródło → wydanie → punkt; (4) `USER_ASSUMPTION` bez uzasadnienia jest niedopuszczalne (wiąże się z `AssumptionsRegister`, §15.4); (5) `MANUFACTURER` bez wskazania dokumentu jest fabrykacją i jest blokowane guardem — to bezpośrednia podstawa kasacji fikcyjnych nazw katalogowych w M0-4; (6) dwa źródła dla tej samej wielkości = jawny konflikt do rozstrzygnięcia, nigdy ciche pierwszeństwo.

---

## 16. Uziemienia i układy sieci (mandat §25) — encje, nie parametry „obok"

```python
class EarthingSystem(BaseModel):      # cecha VoltageLevel
    lv_system: Literal["TN-C","TN-S","TN-C-S","TT","IT"] | None           # nN
    mv_neutral: Literal["ISOLATED","PETERSEN","RESISTOR","REACTOR","SOLID"] | None   # SN: sposób pracy punktu neutralnego sieci zasilającej
    neutral_device_ids: list[AssetId]     # PetersenCoil / NeutralResistor / GroundingImpedance przy TR lub w GPZ
    pen_split_point_ids: list[AssetId]    # NeutralSplitPoint
    earth_electrode_ids: list[AssetId]
```
Konsumenci: zwarcia 1F/2F-E (Z0), pętla zwarcia i SWZ (system TN/TT/IT; TT/IT dziś `NotImplementedError` — do pełnej implementacji w slice 1), detekcja ziemnozwarciowa sieci kompensowanych (ISTNIEJE), wyspy (odniesienie N/PE — semantyka z projekcji nN 3.0.0), napięcia dotykowe/krokowe (PN-EN 50522 — wymaganie dodatkowe R-10), dokumentacja.

---

## 17. Grid Interface & DER (mandat §39–§45) — rozstrzygnięcie punktu przyłączenia

Punkt przyłączenia jest **obiektem umowy i zgodności**, nie węzłem elektrycznym:

```python
class GridConnectionPoint(BaseModel):          # kontekst Grid Interface (poza grafem elektrycznym)
    gcp_id: str; terminal_id: TerminalId       # ODWOŁANIE do istniejącego terminala twin (np. T2 pola przyłączeniowego)
    agreement: ConnectionAgreement             # warunki przyłączenia OSD: P_max, Q-range/cosφ, Sk″ min/max, U band, taryfa, wymagania EAZ i pomiaru
    der_ids: list[AssetId]; meter_ids: list[AssetId]; protection_ids: list[AssetId]
    rfg_class: Literal["A","B","C","D"] | None; pq_emission_limits: PqLimits | None
```
Fizyka liczy się na terminalu (Ik″, U, P/Q, THD) — obiekt GCP tylko *interpretuje* wynik względem umowy. Tak spełniamy §44 (first-class, spina DER/EAZ/pomiar/RfG/PQ/limity) bez łamania zasady „bez fikcyjnych węzłów w solverach". Dzisiejszy guard `pcc_zero_guard.py` (zakaz *słowa* w kodzie produkcyjnym) zostaje zastąpiony guardem strukturalnym: „żadna klasa kontekstu Grid Interface nie jest `ConductingEquipment` ani nie wchodzi do `CanonicalNetworkSnapshot`". Szczegóły DER (rozdział źródło/konwerter/sterowanie/EAZ, GFL/GFM, BESS, hosting) — `MV_DESIGN_PRO_SIMULATION_ARCHITECTURE.md` §DER i `MV_DESIGN_PRO_TARGET_ENGINEERING_WORKFLOW.md` (DER Designer).

---

## 18. Walidacja, gotowość, ograniczenia (mandat §137–§140) — trzy różne rzeczy

| Silnik | Pytanie | Wyjście | Dziś |
|---|---|---|---|
| `ModelValidationEngine` | Czy model jest poprawny? (MODEL / TOPOLOGY / DATA QUALITY) | `ValidationMessage {code, severity INFO/WARNING/ERROR/BLOCKING, refs, fix_action}` | `enm/validator.py` (E0xx/W0xx), audyt nN `NN-AUD-*` — ZACHOWAĆ kody, ujednolicić w jednym rejestrze |
| `ReadinessService` | Czy analiza X może się policzyć na scenariuszu Y? | `AnalysisReadiness` | `eligibility_service`, `calculation_readiness`, `readiness_fix_actions` — ZACHOWAĆ, jedna bramka |
| `ConstraintEngine` | Czy projekt jest adekwatny? (DESIGN / SOLVER / PROTECTION / COMPLIANCE / DOCUMENTATION) | `ConstraintEvaluation {id, type HARD/SOFT/PREFERENCE, source (norma/polityka), inputs, result, limit, margin, status PASS/FAIL/NOT_EVALUABLE/OPTIMIZATION_OPPORTUNITY}` | rozproszone: `equipment_checks`, `swz`, `nn_device_selection`, `kryteria` w UI — do jednego silnika (`MV_DESIGN_PRO_DESIGN_OPTIMIZATION_ARCHITECTURE.md`) |

Rozdział fizyka/polityka (§52): `Constraint.source` rozróżnia `PHYSICS(norm)` (Iz′, I²t, Ik″ vs Icu) od `POLICY(project|OSD)` (np. obciążenie ≤ 70 %); polityki są danymi projektu (`DesignPolicySet`), nie stałymi w kodzie. Model niekompletny jest stanem poprawnym (§138): walidacja ERROR ≠ blokada edycji; blokuje tylko analizy, które tego wymagają.

---

## 19. Projekcje (mandat §96–§99) — skrót

`ProjectionService.scene(revision, scenario, result_set?, policy, lod) -> SceneGraph` w backendzie: elementy sceny = urządzenia/terminale/węzły/kontenery z tożsamościami twin, stanami (REST/OPEN/CLOSED/TRIPPED/INTERMEDIATE/UNKNOWN/EARTHED), energizacją, wyspami, nakładkami wyników z provenance, komunikatami audytu. Polityka prezentacji (`CAD`/`SCADA`/`ENGINEERING`) wybiera, które stany i nakładki wchodzą do sceny; rodzina symboli jest jedna. Geometria (layout) to `PresentationState` per widok z trwałością i stabilnością (§107); SN i nN idą tą samą ścieżką (dziś: nN w backendzie 3.0.0 — wzorzec; SN w kliencie — do przeniesienia). Pełny opis: `MV_DESIGN_PRO_SLD_PRESENTATION_ARCHITECTURE.md`.

---

## 20. Wersjonowanie, gałęzie, decyzje (mandat §8, §85–§89, §125) — skrót

`RevisionGraph`: append-only dziennik komend domenowych (dzisiejszy `dziennik_zmian.py` — ziarno) → materializowane rewizje z hashem treści; gałęzie (`VariantBranch`) dla wariantów projektu; tagi form sieci `AS_DESIGNED` / `AS_BUILT` / `AS_OPERATED` (§8) na tej samej osi tożsamości; `DesignDecisionLog` (decyzje inżynierskie, nie kliknięcia) i `AssumptionsRegister` wersjonowane razem z rewizją; dokumenty odwołują się do `(revision_id, scenario_revision_id, run_ids)` i dostają `OUTDATED`, gdy graf zależności to wykaże. Pełny opis: `MV_DESIGN_PRO_DATA_VERSIONING_PROVENANCE.md`.

---

## 21. Komendy domenowe, API, undo/redo (mandat §128–§131)

- Jedyny sposób mutacji twin: `DomainCommand` (typowana, walidowana, idempotentna z `command_id`, z deklaracją `changes: set[AttributeClass]` i `scope: set[AssetId]`). Rejestr komend zastępuje `domain_operations.py`/`_v2.py` (16,5k LOC na `dict`) — istniejące 48 operacji kanonicznych (`domain/canonical_operations.py`) to lista wejściowa; każda dostaje handler na typowanym `TwinModel`.
- Minimalny zestaw §131: `ADD_EQUIPMENT`, `CONNECT_TERMINALS`, `DISCONNECT_TERMINAL`, `INSERT_STATION_ON_SEGMENT`, `SPLIT_SEGMENT`, `CREATE_BAY_FROM_TEMPLATE`, `CHANGE_CATALOG_BINDING`, `SET_OVERRIDE`, `SET_SWITCH_NORMAL_STATE`, `SET_TAP`, `SET_PROTECTION_SETTINGS`, `CREATE_SCENARIO`, `ADD_DELTA`, `ASSIGN_GRID_CONNECTION_POINT`, `RECORD_DECISION`, `RECORD_ASSUMPTION`, `RECORD_AS_BUILT`, `BATCH(commands)` (§75).
- Undo/redo = odwrotność komendy w dzienniku (każda komenda ma `inverse()` albo jest odtwarzana z poprzedniej rewizji) — nie patchowanie stanu React (dziś `ui/history` — audyt A2).
- API: `POST /twin/{project}/commands` (jedno wejście zapisu, jak dziś `/enm/domain-ops`), `GET /twin/{project}/revisions/{rev}/…` (odczyty projekcji), `POST /runs` (orkiestrator), `GET /results/…`, `GET /projections/…`, `GET /documents/…`. Kontrakty generowane z OpenAPI do TS (koniec ręcznych mirrorów `types/enm.ts` — 1642 linie).
- Agent (§132): operuje wyłącznie komendami i tworzy `VariantBranch(status=PROPOSED)`; nie może zatwierdzić (I-10).

---

## 21a. Kontrakt współbieżności (wymóg właściciela §C.5)

Model współdzielony bez kontraktu współbieżności traci dane po cichu. Kontrakt obowiązuje **od pierwszego dnia**, także we wdrożeniu local-first — architektura jest server-capable, więc zapis nigdy nie zakłada jednego pisarza.

Każda komenda domenowa niesie trzy pola obowiązkowe:

```python
class DomainCommandEnvelope(BaseModel):
    command_id: UUID          # idempotencja: powtórzenie tego samego command_id nie tworzy drugiego skutku
    actor: ActorRef           # kto: użytkownik, agent, import, migracja — zapisywane w dzienniku rewizji
    expected_revision: int    # na jakiej rewizji pracował autor komendy
```

Reguły: (1) `expected_revision` niezgodna z bieżącą rewizją = **`409 CONFLICT`** z opisem rozbieżności (co się zmieniło, kto zmienił, kiedy) i propozycją rebase komendy; (2) **zakaz silent last-write-wins** — żadna ścieżka zapisu nie nadpisuje nowszej rewizji bez decyzji; (3) idempotencja: ten sam `command_id` zwraca ten sam skutek i tę samą rewizję, bez drugiego wpisu w dzienniku; (4) `actor` jest wymagany także dla operacji automatycznych (agent, import XLSX, migracja) — dziennik bez aktora jest niedopuszczalny; (5) **transakcyjność**: komenda zapisuje model i dziennik w jednej transakcji — awaria dziennika wycofuje zmianę modelu (predykaty parami: to samo źródło prawdy dla wejścia i wyjścia transakcji, wraz z testem awarii zapisu dziennika); (6) **dual-write w stranglerze** (stara i nowa ścieżka zapisu równolegle) jest dopuszczalny wyłącznie z **guardem równoważności** po każdym zapisie i z **krótkim, zadeklarowanym terminem życia** — po terminie stara ścieżka znika zgodnie z procedurą kasacji; (7) kontrakt jest przypięty testem współbieżnym (dwie komendy na tej samej rewizji → dokładnie jedna sukces, jedna 409) oraz testem iloczynu cech (ta sama komenda × awaria dziennika, operacja A × operacja B równolegle).

---

## 22. Graf zależności i inwalidacja (mandat §57–§60)

```python
AttributeClass = Literal["LABEL","GEOMETRY","IMPEDANCE","RATING","TOPOLOGY","SWITCH_STATE","LOAD","GENERATION","DER_CONTROL",
                         "TAP","SOURCE_EQUIVALENT","EARTHING","PROTECTION_SETTING","CT_VT","CATALOG_BINDING","TIME_SERIES","POLICY"]
DEPENDENCIES: dict[AnalysisKind, set[AttributeClass]]   # np. LOAD_FLOW: {IMPEDANCE, TOPOLOGY, SWITCH_STATE, LOAD, GENERATION, DER_CONTROL, TAP, SOURCE_EQUIVALENT}
                                                        #     SHORT_CIRCUIT: {IMPEDANCE, TOPOLOGY, SWITCH_STATE, GENERATION(sc), SOURCE_EQUIVALENT, EARTHING, TAP}
                                                        #     PROTECTION/TCC: {PROTECTION_SETTING, CT_VT, CATALOG_BINDING(relay/fuse)} + zależność od SC (wynik→wynik)
                                                        #     SWZ: SC_MIN + {EARTHING, PROTECTION_SETTING, CATALOG_BINDING(mcb/fuse)}
                                                        #     DOCUMENT(X): zależy od wyników i atrybutów użytych w X
```
Komenda deklaruje `changes` i `scope`; `InvalidationService` liczy przecięcie i oznacza `STALE(scope: local|area|case|project, reason)` wyłącznie dotknięte wyniki, dokumenty i cache (`MACIERZ_INVALIDACJI.md` staje się testem tej tabeli, nie prozą). Zmiana etykiety nie inwaliduje niczego poza dokumentami z etykietą. `RECALCULATE_AFFECTED` = orkiestrator bierze zbiór `STALE` i porządkuje wg DAG. Cache wyników kluczowany `(snapshot_hash, solver_id, solver_version, settings_hash, catalog_revision_set)` (§60).

---

## 23. Lifecycle i cztery postacie sieci (mandat §7–§8)

`AssetLifecycle ∈ {PLANNED, PROPOSED, APPROVED, INSTALLED, COMMISSIONED, IN_SERVICE, OUT_OF_SERVICE, RETIRED}` (oś assetu) i `OperationalState.switch_position ∈ {OPEN, CLOSED, TRIPPED, INTERMEDIATE, UNKNOWN}` + `earthed` (z uziemnika) + `in_service` (oś ruchowa) — nie mieszają się: RETIRED urządzenie może mieć zapisany ostatni stan łącznika; PLANNED urządzenie ma stan normalny projektowy. Postacie `AS_DESIGNED / AS_BUILT / AS_OPERATED / AS_SIMULATED` to (rewizja + nakładka + stan ruchowy + scenariusz) rozwiązywane w §10 — nie cztery kopie.

---

## 24. Sprawy przekrojowe

- **Determinizm:** każda projekcja, migawka, wynik, dokument ma hash; sortowanie po tożsamościach; brak losowości poza jawnie zasianymi analizami MC (seed w provenance).
- **Wydajność (§143–§144):** `TopologyService` inkrementalny (przeliczenie tylko dotkniętych składowych), cache projekcji per (rewizja, scenariusz, LOD), migawki bez pełnych kopii JSON, kolumnowe szeregi czasowe; benchmarki na sieciach S/M/L (`MV_DESIGN_PRO_PERFORMANCE_PLAN.md`).
- **Granica SCADA (§119):** kontekst Operations przyjmuje *odczyt* stanu (import, wpis ręczny, przyszła telemetria) i nigdy nie emituje komend do urządzeń; ewentualne sterowanie = osobny system z własną autoryzacją, potwierdzeniami i audytem (poza tym mandatem). Dzisiejsze pola `BayControlSurface`, `BayCommandExecutionState`, `kas_available` w ENM są usuwane z modelu projektowego (należą do systemu sterowania, którego nie ma).
- **Bezpieczeństwo i współbieżność:** komendy z `expected_revision` (optymistyczna blokada), role użytkowników i ślad autora w dzienniku (wymaganie dodatkowe R-02/R-03).

---

## 25. Mapowanie stanu obecnego na docelowy (skrót; pełne tabele KEEP/REPLACE/DELETE w planie migracji)

| Dziś | Docelowo | Tryb |
|---|---|---|
| `EnergyNetworkModel` v1.0 (Pydantic) | `TwinModel` (rewizjonowany) z automatyczną migracją ENM→twin i mostem twin→ENM na czas migracji | REPLACE (strangler) |
| `enm/store.py` flat-file per case + `.enm_store/` | `RevisionStore` (append-only komendy + materializowane rewizje) w bazie | REPLACE |
| `domain_operations*.py` (16,5k LOC, `dict`) | rejestr komend na typowanym twin | REPLACE |
| `network_model/core/*` (NetworkGraph, Node, Branch, Switch) | wewnętrzna struktura adapterów solverów (bez persystencji, bez ORM) | KEEP jako wewnętrzność solvera, DELETE jako źródło prawdy |
| Frozen solvery + White Box + Proof Engine | bez zmian | KEEP |
| `application/analyses/lv_domain/*` (projekcja nN 3.0.0: energizacja, wyspy, tory, audyt) | `TopologyService` + `ProjectionService` dla SN i nN | KEEP semantyka, uogólnić |
| `enm/validator.py` + `NN-AUD-*` + readiness/eligibility | `ModelValidationEngine` + `ReadinessService` (jeden rejestr kodów) | KEEP kody, scalić |
| `MaterializationContract`, `solver_input/provenance.py`, `osd_card_gate` | `materialize()` + `ParameterProvenance` | KEEP, uogólnić |
| `TapChanger`, `ShuntCapacitor`, `Measurement` CT/VT pola, `return_conductor_*`, `n_parallel` | odpowiednie encje twin | KEEP dane, przenieść |
| Legacy ORM tor `analysis_runs`/`wizard_runtime`/`xlsx_import` na `NetworkGraph` | brak | DELETE po migracji importu XLSX na komendy |
| `BayCanonicalModel`, `BayRuntimeState`, `BayControlSurface`… | `OperationalState`, `MeasurementSet`, projekcja pola | REPLACE / DELETE |
| `Port`/`PortRef`/`ConnectionNode`, `LineRun`, `Corridor`, `Junction` | `Terminal`/`ConnectivityNode`, `Line`, `Junction` | REPLACE |
| `ResultSetV1` (`element_ref`) | `ResultSetV2` + most v2→v1 z datą wyłączenia | REPLACE |
| `pcc_zero_guard.py` (zakaz słowa) | guard strukturalny kontekstu Grid Interface | REPLACE |

---

## 26. Inwarianty twin do przypięcia testami (mandat §145, §149–§152)

Każdy z poniższych dostaje test klasy (iloczyn cech: typ urządzenia × stan × scenariusz), uruchamiany na sieciach złotych G01–G17 (`MV_DESIGN_PRO_MIGRATION_PLAN.md` §7):

1. Terminal należy do dokładnie jednego urządzenia; `terminal_id` jest deterministyczny z `asset_id`.
2. Zamknięty łącznik łączy swoje dwa terminale w jeden `TopologicalNode`; otwarty — rozdziela; łączność (`cn_id`) w obu przypadkach identyczna.
3. Projekcja (SN, nN, CAD, SCADA, ENGINEERING) nie zmienia łączności ani topologii (hash `TopologyView` przed/po = równy).
4. Indeksy solvera nie zmieniają tożsamości: `ResultSetV2` klucze ⊆ tożsamości twin; brak `uuid5`/indeksów w kontrakcie publicznym (guard).
5. Wspólne źródło zasilania nie jest duplikowane w żadnej projekcji (jedna kotwica na system SN — semantyka istniejąca).
6. Wynik z `snapshot_hash ≠ hash(effective(current))` nigdy nie ma statusu FRESH; dokument z takim wynikiem ma OUTDATED.
7. Scenariusz nie mutuje bazy: `hash(TwinRevision)` przed/po nałożeniu delt równy.
8. Kabel 35→70 mm² (zmiana bindingu): `asset_id` stały; `IMPEDANCE`/`RATING` zmienione; STALE dokładnie {LF, SC, SWZ, losses, dokumenty z tym kablem}; SLD/BOM/raport po przeliczeniu zgodne bez ręcznej synchronizacji (§150).
9. QF OPEN→CLOSED w scenariuszu: baza niezmieniona, delta zmieniona, topologia i energizacja zmienione, wyspy przeliczone, wyniki STALE w zakresie przypadku, scena CAD niezmieniona (REST), scena SCADA/ENGINEERING zmieniona, layout niezmieniony (§151).
10. Wstawienie stacji na odcinku: powstają urządzenia, terminale, węzły, poziomy napięć, pola, TR; odcinek podzielony z zachowaniem łączności i tożsamości obu nowych odcinków (deterministyczne `ref_id`); solvery widzą ją natychmiast; inwalidacja obszarowa (§152).
11. Te same `asset_id` w: model, scenariusz, wynik, projekcja SN, projekcja nN, TCC, dokument, archiwum ZIP, eksport CGMES (§149).
12. Model niekompletny (terminal wolny, brak długości): walidacja ERROR, analizy `NOT_READY(missing)`, brak wartości domyślnych w migawce (§138, §91).

---

## 26a. Reference validation suite (wymóg właściciela §C.2) — sieć wzorcowa to nie test samego siebie

Dzisiejsze „golden network" jest testem regresji: fixture powstał z tego samego kodu, który sprawdza. Wykrywa zmianę, nie wykrywa błędu od początku obecnego. Twin wymaga rozdzielenia dwóch pojęć:

| Pojęcie | Co dowodzi | Czego NIE dowodzi |
|---|---|---|
| **Regression fixture** | że wynik się nie zmienił | że wynik jest poprawny |
| **Reference validation case** | że wynik zgadza się z niezależną wyrocznią | że nie zmieni się w przyszłości |

Każdy przypadek walidacyjny deklaruje wyrocznię jednej z czterech klas: `ANALYTICAL` (rozwiązanie zamknięte policzalne ręcznie — dzielnik impedancji, zwarcie na końcu pojedynczej linii, spadek napięcia na obciążeniu skupionym), `NORMATIVE` (przykład obliczeniowy z normy wraz z punktem i wydaniem — rejestr §15.5), `PUBLISHED_BENCHMARK` (IEEE 13/34/123, CIGRE MV, z odsyłaczem do publikacji i danych wejściowych), `INDEPENDENTLY_VERIFIED` (wynik potwierdzony niezależnym narzędziem, z zapisem narzędzia, wersji i danych wejściowych).

Reguły: (1) **każda rodzina solverów** (rozpływ zgodny, rozpływ fazowy, zwarcia, pętla zwarciowa nN, cieplne, zabezpieczenia, dynamika) ma co najmniej jeden przypadek z wyrocznią inną niż regresja; (2) tolerancja jest deklarowana **per przypadek** wraz z uzasadnieniem (co jest szumem numerycznym, a co różnicą modelu); (3) przypadek walidacyjny jest wykonywany w CI jak każdy inny test i jego niepowodzenie jest defektem fizyki, nie „zmianą fixture" — zakaz aktualizacji oczekiwanej wartości bez decyzji i uzasadnienia; (4) brak wyroczni dla rodziny solverów jest **luką pokrycia widoczną w dokumencie generowanym z rejestru**, nie ciszą; (5) żadna decyzja architektoniczna ani numeryczna nie może być optymalizowana pod aktualny fixture (zasada nadrzędna właściciela) — dlatego wyrocznia jest zewnętrzna wobec kodu.

---

## 27. Decyzje wymagające właściciela (zebrane także w `OWNER_REVIEW_PACKAGE.md`)

1. Zgoda na przejście z modelu bus-branch (ENM v1) na model terminalowy (twin) jako źródło prawdy — z automatyczną migracją istniejących projektów i mostem na czas migracji (ADR-013).
2. Rozstrzygnięcie punktu przyłączenia jako obiektu umowy odwołującego się do terminala (ADR-027) — zmienia treść, nie ducha reguły „bez fikcyjnych węzłów".
3. Zakres kasacji toru legacy ORM (`analysis_runs`, `wizard_runtime`, import XLSX na `NetworkGraph`) — po przeniesieniu importu XLSX na komendy.
4. Wybór miejsca silnika layoutu (backend Python vs TS) — rekomendacja: semantyka sceny w backendzie, geometria w dedykowanym deterministycznym silniku TS z trwałością layoutu w backendzie (ADR-023).
5. Polityka rewizji katalogu (kto i jak publikuje rewizję; zamrożenie bindingów w projektach zatwierdzonych).

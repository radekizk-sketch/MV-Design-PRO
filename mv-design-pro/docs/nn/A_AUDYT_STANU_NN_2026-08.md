# A — AUDYT STANU ZASTANEGO nN (LV CURRENT STATE AUDIT)

**Data:** 2026-08-13 · **Baza:** `main` @ `3f4c7714` · **Metoda:** 10 równoległych audytów
obszarowych (LV-funkcje, TR/stacje, zwarcia, rozpływ, katalog, zabezpieczenia, ENM/ops/przypadki,
SLD, UI shell, proof/raporty), każdy z dowodami `plik:linia`. Klasyfikacja:
**EXISTS / PARTIAL / MISSING / DUPLICATED / LEGACY**.

## 0. Wniosek naczelny

Repo NIE jest zerowe w nN — ma **fundamenty lepsze, niż sugeruje inwentarz** (katalogi KABEL_NN
i APARAT_NN z realnymi danymi, solver pętli IEC 60364, tor Ybus/Zbus w pełni wielonapięciowy,
kreator stacji tworzący realną szynę nN + transformator + odbiory). Brakuje **czterech ogniw
strukturalnych**, które blokują wszystko dalej:

1. **Topologia obwodów nN nie istnieje** — żadna operacja domenowa nie tworzy kabla/gałęzi nN
   z impedancją; odpływ = metadane (`Substation.meta["nn_field_specs"]`), odbiór wisi wprost na
   jedynej szynie nN stacji (`enm/domain_operations_v2.py:1971-1989`). Elektrycznie cała sieć nN
   to dziś jedna szyna.
2. **Ik_min jest nieosiągalny** z kanonicznej ścieżki (StudyCase → binding → ResultSet v1):
   `c_factor_min` jest zdefiniowany, serializowany, pokazywany w UI — i nigdy nie czytany
   (`application/solvers/short_circuit_binding.py:91` używa wyłącznie `c_factor_max`).
   Współczynnik c nie jest per pasmo napięcia (poprawna Tabela 1 IEC 60909 istnieje na
   `TransformerBranch.get_voltage_factor_c_max/min`, `core/branch.py:884-910`, ale zasila tylko K_T).
   Brak korekty temperaturowej R dla Ik_min (istotne właśnie dla nN, gdzie dominuje R).
3. **SWZ nie istnieje jako werdykt** — zero tabeli czasów wyłączenia (0,4 s / 5 s,
   IEC 60364-4-41 Tab. 41.1), zero porównania Ia↔Ik_min, zero oceny w najdalszym punkcie obwodu.
   Solver pętli sam deklaruje: „decyzję o disconnection time podejmuje WARSTWA WYŻSZA" — ta
   warstwa nie istnieje (grep potwierdzony).
4. **Krzywe aparatów nN nie istnieją** — APARAT_NN ma ratingi bez charakterystyk I–t (brak
   IEC 60898 B/C/D, brak gG IEC 60269, brak Ir/Isd/Ii dla MCCB); `CurveStandard.FUSE` to fantom
   cicho liczony formułą przekaźnikową IEC (`coordination/analyzer.py:545-549`).

Dodatkowo jeden **dług repo-wide blokujący nN**: archiwum ZIP projektu w ogóle nie serializuje
ENM (`application/project_archive/service.py` — zero referencji do ENM; ENM żyje we flat-file
store `.enm_store/` poza ORM). Każda funkcja nN zbudowana na ENM **zniknęłaby przy
eksporcie/imporcie projektu**.

## 1. Tabela klasyfikacyjna — stan zastany (skonsolidowana)

### 1.1 Model i operacje (ENM)

| Obszar | Status | Dowód |
|---|---|---|
| Szyna nN jako `Bus` (voltage_kv≤1, bez limitu dolnego) | EXISTS | `enm/models.py:168-174`; walidator pasm nN/SN/WN `enm/validator.py:38-53` |
| Poziomy napięcia nN 0,4/0,69 kV (+lista custom) | EXISTS | `ui2/kreatory/stacja/stacjaModel.ts:74-80` |
| Transformator SN/nN (model+katalog 15/0,4, 20/0,4, Dyn11/Yd11, 63–2500 kVA) | EXISTS | `enm/models.py:322-352`; `mv_transformer_catalog.py:305-914` |
| Uziemienie punktu N (GroundingConfig per uzwojenie) + etykieta układu TN-S/TN-C-S/TN-C/TT/IT | EXISTS | `enm/models.py:21-24`; `domain_operations.py:3870,3894-3931` |
| Tworzenie szyny nN + TR + odbiór/agregat/UPS/DER przez operacje kanoniczne | EXISTS | `insert_station_on_segment_sn`, `add_transformer_sn_nn`, `add_nn_load`, `add_genset_nn`, `add_ups_nn`, `add_converter_source` |
| Kabel/gałąź nN z impedancją (topologia obwodów) | **MISSING** | brak odpowiednika `continue_trunk_segment_sn` dla nN; `KABEL_NN` — 0 użyć w `enm/`+`application/` |
| Pole odpływowe nN | PARTIAL (tylko metadane bay) | `domain_operations_v2.py:1817-1871` → `meta["nn_field_specs"]` |
| Typowane porty `nn_feeder`/`nn_load`/`nn_der_*` | PARTIAL (zdefiniowane, nieużywane) | `enm/models.py:685-743`; dwie równoległe reprezentacje odpływu |
| Podrozdzielnica / sekcje / sprzęgło nN | MISSING | `GPZSection`+`COUPLER` tylko dla SN (`enm/models.py:850-916`) |
| Odbiór 1-fazowy (pole fazy na Load) | MISSING | brak pola fazy w ENM `Load` i katalogu |
| Rejestr operacji kanonicznych ↔ handlery | PARTIAL (dryf: 41 wpisów vs 49 handlerów; guard miękki) | `canonical_ops_guard.py:126-134`; `append_station_on_endpoint` niezarejestrowana |
| Rewizje ENM (łańcuch 5 hashy + dziennik zmian) | EXISTS | `enm/hash.py`, `enm/store.py:120-160`, `dziennik_zmian.py` |
| Inwalidacja wyników przy zmianie modelu (ENM domain-ops) | PARTIAL | hash-dedup w `analysis_dispatch` działa; `ResultInvalidator` wołany tylko z legacy wizard (`network_wizard/service.py:1575`) |
| **Archiwum ZIP obejmuje ENM** | **MISSING (dług repo-wide)** | `project_archive/service.py` — 0 referencji ENM; `.enm_store/` poza ORM |

### 1.2 Katalog

| Obszar | Status | Dowód |
|---|---|---|
| `LVCableType` / KABEL_NN (17 rekordów YAKY/YKY/YKXS, R/X/Imax) | EXISTS (dane) / PARTIAL (schemat: brak r0/x0, Ith/Jth, temperatur, żyły powrotnej PE/PEN) | `catalog/types.py:1856-1933`; `mv_auxiliary_catalog.py:4-297` |
| `LVApparatusType` / APARAT_NN (14 rekordów ABB Emax2/Tmax XT, Jean Muller) | EXISTS (ratingi) / PARTIAL (brak Icu/Ics, biegunów, wyzwalacza, krzywych) | `catalog/types.py:2209-2275`; `mv_auxiliary_catalog.py:339-560` |
| Krzywe MCB IEC 60898 (B/C/D) | MISSING | brak w całym repo |
| Krzywe bezpieczników gG/gM IEC 60269 | MISSING (`CurveStandard.FUSE` = fantom) | `domain/protection_device.py:53`; `analyzer.py:545-549` cichy fallback do IEC |
| RCD (IΔn, typ AC/A/F/B, klasa czasowa, S) | MISSING | jedynie tekst opisowy `EarthingSystemSelector.tsx:87` |
| Rozdzielnice/szyny nN (Icw, ip) | MISSING | pakiet `switchgear/` wyłącznie SN; brak pola ip nawet dla SN |
| Kompensacja nN (bateria PFC 0,4 kV) | MISSING | `ShuntCapacitorType` seedowany tylko SN |
| Agregat (genset), UPS — typy katalogowe | MISSING | grep pusty |
| `LoadType` (ZIP + częstotliwość) | EXISTS — voltage-agnostic, reużywalny | `catalog/types.py:1941-2050` |
| Korekty obciążalności wg PN-HD 60364-5-52 (sposób ułożenia/grupowanie/temperatura) | MISSING | `cable_ampacity_derating.py` = tylko SN-grunt, niepodpięty do `LVCableType` |
| `InverterType` — żywy duplikat `ConverterType` (D-15), 0 rekordów | DUPLICATED | `catalog/types.py:1291-1425`; `repository.py:615` |
| Architektura katalogu (namespace'y, materializacja, guardy) | EXISTS — generyczna, gotowa na nowe namespace'y | `catalog_binding_guard.py` waliduje automatycznie |

### 1.3 Solvery

| Obszar | Status | Dowód |
|---|---|---|
| IEC 60909: Zbus/Ybus wielonapięciowy, K_T, Z0 z grupy połączeń (Dyn11) | EXISTS | `core/ybus.py:226-263`; `enm/zero_sequence_transformer.py:220-374` |
| c per pasmo napięcia w torze produkcyjnym SC | **MISSING (wired)** | `short_circuit_binding.py:91` — jeden c na całą sieć |
| Ik_min z kanonicznej ścieżki | **MISSING (dead data)** | `.c_factor_min` — 0 odczytów poza serializacją |
| Korekta temperaturowa R dla Ik_min | MISSING | `LineBranch.get_total_impedance()` bez członu temperatury (`core/branch.py:416-432`) |
| Test SC na węźle 0,4 kV (regresja) | MISSING | zero testów `compute_*_short_circuit` przy voltage_level=0.4 |
| Pętla zwarcia IEC 60364-4-41 (TN-S/TN-C-S/TN-C) | PARTIAL (MVP „u źródła", przewody R=X=0; TT/IT→501=D-11; ręczne R/X na surowym endpoincie) | `fault_loop_iec60364.py`; `fault_loop/service.py:119-122` |
| Rozpływ NR/GS/FD wielonapięciowy (`_base_scale`) | EXISTS (mechanizm) / PARTIAL (0 testów PF przy 0,4 kV; ryzyko zbieżności przy R/X≥1 niezbadane) | `power_flow_newton_internal.py:882-901` |
| ZIP + falowniki Q(U)/P(f) + reverse flow | EXISTS (backend end-to-end) | `power_flow_zip.py`, `power_flow_inverter.py`; ZIP bez UI |
| Rozpływ niesymetryczny (BFS 3-fazowy) | PARTIAL→odcięty (tylko harness IEEE 13/34) | `power_flow_unbalanced.py`; brak buildera z ENM i dispatchu |
| QSTS ogólny (profile per odbiór/DER) | MISSING (jest tylko OLTC z jednym `load_scale`) | `power_flow_oltc_studies.py:286-357` |
| Wytrzymałość cieplna I²t≤k²S² (IEC 60949) | EXISTS (fizyka) / MISSING (wpięcie nN) | `conductor_thermal_withstand.py`; analiza `wytrzymalosc_cieplna_przewodow.py` = tylko SN |
| Spadek napięcia kabla (preview, sign-aware) | EXISTS | `cable_voltage_drop.py:108-152` |
| OLTC (pętla AVR, LDC, Ybus tap) | EXISTS (solver) / MISSING (UI autorskie) | `power_flow_oltc.py` |
| `fault_scenario_executor.py` (wg CLAUDE.md) | MISSING — plik nie istnieje (stale doc) | potwierdzone listingiem |

### 1.4 Zabezpieczenia i SWZ

| Obszar | Status | Dowód |
|---|---|---|
| Krzywe przekaźników IEC 60255/IEEE + koordynacja + TCC (SN) | EXISTS (dojrzałe, 51 rekordów) | `protection/curves/`, `coordination/analyzer.py` |
| Formuła IEC 60255 zaimplementowana 2× (rozłączne grafy wywołań) | **DUPLICATED** | `protection/curves/iec_curves.py` vs `network_model/solvers/protection_iec60255.py` |
| SWZ (tabela czasów + Ia↔Ik_min + werdykt) | **MISSING** | §0 pkt 3 |
| Ib≤In≤Iz | MISSING | brak w repo |
| I²t zabezpieczenia ↔ k²S² przewodu dla nN | MISSING | łańcuch wpięty tylko do SC SN |
| Selektywność SN↔nN w jednym TCC | MISSING | brak dopływu prądów/krzywych nN do koordynacji |
| `ProtectionSetting` (ENM) | PARTIAL — jawny stub, Literal wyłącznie ANSI przekaźnikowe | `enm/models.py:54-91` |
| Ścieżka `fault_loop_nn` w AnalysisRun | **LEGACY (martwy stub NN_SOLVER_NOT_IMPLEMENTED)** | `analysis_run/service.py:392-404`; nieosiągalny z API |
| `envelope_adapter` fault-loop niezarejestrowany w `run_registry` | LEGACY | `run_registry.py:25-29` |
| `FaultLoopResultPanel.tsx` nigdy niemontowany | LEGACY | grep: tylko własny test |

### 1.5 SLD, UI, proof, raporty

| Obszar | Status | Dowód |
|---|---|---|
| SLD v3 (produkcyjny), overlay generyczny (U/loading/Ik″/ip/Ith per ownerRef) | EXISTS | `v3/canvas/overlay.ts:137-274`, `resultLabels.ts` |
| Render strony nN | PARTIAL — udokumentowany stub: jedna szyna + zagregowana strzałka / „granica modelu" | `v3/compose/station.ts:1424-1499`; `SLD_CAD_SPEC_V3.md:486-487` |
| Adapter zwija wszystkie szyny/odbiory nN do jednego skalara | PARTIAL (główny bloker overlayi nN) | `enmToSldAdapter.ts:3573-3613` |
| DER po stronie nN renderowane per element (wzorzec do skopiowania) | EXISTS | `station.ts:1501-1618` |
| Symbole nN (rozdzielnica, MCB, RCD, licznik nN) | MISSING | `v3/symbols/defs.ts:14-38` (24 symbole, wszystkie SN/DER) |
| Shell `ui2` (7 przestrzeni, PanelLayout, rama kreatorów, 20 kreatorów, w tym `pole-nn`) | EXISTS | `ui2/shell/*`, `ui2/kreatory/rama/*`, `KreatorPolaNn.tsx` |
| Ekrany kanonu E-18/E-19/E-20 (TR SN/nN, strona nN, odbiór nN) | EXISTS | `screenCanonRegistry.ts:474-542` |
| Edytowalny grid-arkusz (tabela odcinków) | MISSING (`TabelaWynikow` = read-only, wirtualizacja ręczna >500 wierszy) | `ui2/wyniki/wzorzec/TabelaWynikow.tsx` |
| Wykresy (Recharts: profil U, TCC log-log) | EXISTS — do adaptacji | `ProfilNapiecChart.tsx`, `TccChart.tsx` |
| Proof engine (ProofDocument/EquationRegistry, 8+ paków) | EXISTS | `application/proof_engine/` |
| VDROP pack | PARTIAL — osierocony (0 API, 0 UI), limit 1 odcinka, **druga formuła ΔU** niż solver | `proof_generator.py:2112-2116`; `packs/vdrop.py` |
| Equipment P12 (U/Icu/Idyn/Ith z fallbackiem I²t) — najbliższy analog weryfikacji aparatu nN | EXISTS (API bez UI) | `equipment_proof/generator.py` |
| Pętla IEC 60364 i wytrzymałość cieplna — brak paków dowodowych | MISSING | §10 raportu A10 |
| Eksport XLSX/CSV (jakikolwiek) | MISSING (tylko import) | grep `openpyxl`/csv — wyłącznie import |
| `ProofPacksPanel` zamontowany bez callbacków (przyciski nigdy się nie renderują) | LEGACY/martwe UI | `SldCanvasV3Workspace.tsx:1876` |
| Kreator `station-wizard-v2` „Krok 10 — Strona nN" | **LEGACY (fantom: zero zapisu, hardcoded katalog TS, osiągalny przez `#kreator-stacji-v2`)** | `StationWizardStepContent.tsx:494-508`; `transformerContract.ts:75-264` |
| `network_model/catalog/station_templates.py` (w tym szablon przemysłowy 6 kV + 0,4 kV) | DUPLICATED/osierocony (0 importów produkcyjnych) | żywy system = `application/station_templates/` |
| `forbidden_ui_terms_guard` pomija `ui2` | luka guardowa | `SCAN_DIRS` bez ui2 |

## 2. Dług napotkany (Zero-Debt — do naprawy w kolejce P0, nie „potem")

| # | Dług | Klasa | Naprawa |
|---|---|---|---|
| N-D1 | Archiwum ZIP bez ENM (dane nN znikają przy eksporcie) | BLOKER | Sekcja `enm` w archiwum + round-trip test (H §P0.0) |
| N-D2 | Martwy stub `_execute_fault_loop_nn` + niezarejestrowany envelope_adapter + niemontowany `FaultLoopResultPanel` | martwy kod | usunąć lub wpiąć do realnej ścieżki (H §P0.7) |
| N-D3 | `station-wizard-v2` — fantomowe UI z własnym katalogiem TS | phantom rule | usunąć trasę + pliki (H §P0.0) |
| N-D4 | Dwie implementacje formuły IEC 60255 | dwie prawdy fizyki | scalić do jednej ścieżki (H §P0.9) |
| N-D5 | `CurveStandard.FUSE` cicho liczony jak przekaźnik IEC | cichy fałsz | jawny błąd do czasu silnika krzywych topikowych (H §P0.9) |
| N-D6 | VDROP: druga formuła ΔU + limit 1 odcinka + osierocenie | dwie prawdy + dług | pack konsumuje solver, multi-segment, wpięcie API/UI (H §P0.5) |
| N-D7 | `c_factor_min` martwe dane | dead data | wpięcie scenariusza MIN (H §P0.6) |
| N-D8 | Dryf rejestru operacji kanonicznych (41 vs 49) + miękki guard | CI-ślepota | rejestracja braków + guard dwukierunkowy (H §P0.1) |
| N-D9 | `forbidden_ui_terms_guard` bez `ui2` | luka guardowa | `SCAN_DIRS += ui2` (H §P0.10) |
| N-D10 | Osierocony `catalog/station_templates.py` (zdolność multi-voltage nN nieosiągalna) | duplikat | przenieść zdolność do żywego systemu albo usunąć (H §P1) |
| N-D11 | `InverterType` duplikat (D-15, znany) | duplikat | dedykowana migracja (poza P0 nN, rejestr STAN_REPO) |
| N-D12 | Stale wpisy CLAUDE.md (fault_scenario_executor, proof-inspector/, results-browser/…) | dok | korekta dokumentu przy commicie H |

## 3. Źródła szczegółowe

Raporty obszarowe agentów (pełne dowody file:line) zarchiwizowane w sesji audytowej;
niniejszy dokument jest ich wiążącą syntezą. Kluczowe wcześniejsze dokumenty repo:
`docs/uiux/INWENTARZ_FUNKCJI_2026-07.md` (S9, S20–S22, W-612), `STAN_REPO.md` (D-11, D-15),
`docs/sld/SLD_CAD_SPEC_V3.md` §14.1 (luka nN w SLD), `docs/audit/IMPLEMENTATION_GAP_ANALYSIS.md`.

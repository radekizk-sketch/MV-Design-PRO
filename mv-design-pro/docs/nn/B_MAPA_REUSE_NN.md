# B — MAPA REUSE (czego NIE budujemy od nowa)

**Zasada:** reużycie zamiast duplikacji (dyrektywa właściciela nr 7). Każda pozycja poniżej
jest zweryfikowana audytem A — istnieje, działa i ma zostać WPIĘTA, nie przepisana.

## 1. Model i operacje

| Potrzeba modułu nN | Reużywany byt | Co dokładamy |
|---|---|---|
| Szyna nN, podrozdzielnice | `enm.models.Bus` (voltage_kv ≤ 1,0) | nic — typ generyczny wystarcza |
| Kabel/przewód nN | `enm.models.Cable` / `OverheadLine` (unia `Branch`) | wiązanie `KABEL_NN` + operacje tworzące |
| Łącznik/wyłącznik/bezpiecznik nN w torze | `SwitchBranch` / `FuseBranch` | wiązanie `APARAT_NN` + krzywe |
| Rozdzielnica (RGnN / podrozdzielnica) | `Substation` (kontener logiczny, bez fizyki) | nowy `station_type="rozdzielnica_nn"` |
| Odbiór, silnik (P0: jako odbiór), agregat, UPS, PV, BESS | `Load`, `Generator` + istniejące operacje `add_nn_load`/`add_genset_nn`/`add_ups_nn`/`add_converter_source` | pola dodatkowe wg C |
| Układ sieci TN-S/TN-C-S/TN-C/TT/IT | `substation.meta.nn_earthing_system` + `Transformer.lv_neutral` (GroundingConfig) | konsumpcja w SWZ/pętli |
| Stany łączników, promieniowość, spójność | `BranchBase.status` + `topology.py`/`topology_ops.py` (voltage-agnostic) | nic |
| Walidator pasm napięcia (E020: gałąź nie łączy pasm bez TR) | `enm/validator.py:38-53,1192-1241` | nowe reguły nN (C §5) |
| Seam nowych operacji kanonicznych | `execute_domain_operation` + `_HANDLERS`/`ALL_V2_HANDLERS` + `POST /api/cases/{id}/enm/domain-ops` | rodzina operacji nN (C §4) |
| Wzorzec nowego elementu ENM (świeży precedens) | `ShuntCapacitor` (element + hash + walidator E040-42 + CGMES) | analogiczna checklista dla elementów nN |
| Rewizje/inwalidacja | łańcuch 5 hashy ENM + `compute_dispatch_input_hash` | wpis inwalidacji dla ops nN (D §6) |

## 2. Katalog

| Potrzeba | Reużywany byt | Co dokładamy |
|---|---|---|
| Kable nN | `LVCableType`/KABEL_NN + 17 rekordów + kontrakt materializacji + REST `/api/catalog/lv-cable-types` | pola: r0/x0, Ith/Jth/temperatury, żyła powrotna PE/PEN, liczba żył/funkcje |
| Aparaty nN (ACB/MCCB/rozłącznik bezp.) | `LVApparatusType`/APARAT_NN + 14 rekordów + REST | pola: Icu/Ics, Icw, bieguny, wyzwalacz, `curve_ref`; nowe klasy: MCB, RCD, fuse-link |
| Obciążenia (ZIP+f) | `LoadType`/OBCIAZENIE — bez zmian schematu | seedy profili nN (mieszk./usł./przem. już są) |
| Transformatory SN/nN | `TransformerType` + 36 rekordów (15/0,4, 20/0,4) | nic w P0 |
| Falowniki PV/BESS 0,4 kV | `PVInverterType`/`BESSInverterType` (+ `ConverterType` karta pełna) | bez piątej klasy falownika (D-15 do migracji osobno) |
| Governance/eksport/import/fingerprint | `governance.py` — namespace-generic | nowe namespace'y przechodzą automatycznie |
| Guardy katalogu | `catalog_binding_guard.py` i siostrzane | automatycznie obejmą nowe kontrakty |

## 3. Solvery i analizy

| Potrzeba | Reużywany byt | Co dokładamy |
|---|---|---|
| Ik max/min nN (z upstream SN + TR) | **kanoniczny tor IEC 60909** (`short_circuit_iec60909.py` FROZEN + `ybus.py` z K_T i bazami napięć; Z0 z grupy połączeń Dyn11) | c per pasmo w bindingu, scenariusz MIN, korekta temperaturowa R w budowie wejścia — bez dotykania zamrożonego rdzenia |
| Tabela 1 IEC 60909 (c per pasmo) | `TransformerBranch.get_voltage_factor_c_max/min` (`core/branch.py:884-910`) — logika już poprawna | przeniesienie do wspólnego helpera wybieranego per węzeł zwarcia |
| Zs / pętla zwarcia | `fault_loop_iec60364.py` + `transformer_lv_impedance_ohm()` | builder P0.5b: ekstrakcja R/X toru z grafu + katalogu (żyła fazowa i powrotna), upstream Z z grafu SN |
| Rozpływ nN (U, ΔU, I, straty, reverse) | NR/GS/FD + `_base_scale` + ZIP + `InverterControl` + `PowerFlowResultV1` + `voltage_profile/builder.py` | testy LV-scale; ΔU per odcinek z wyników PF (analiza, nie nowa fizyka) |
| Obciążalność Iz po korektach | `cable_ampacity_derating.py` (wzorzec współczynników z podstawą dokumentową) | zestawy współczynników PN-HD 60364-5-52 (dane normatywne — rejestr G) + wpięcie `LVCableType` |
| I²t ≤ k²S² | `conductor_thermal_withstand.py` (IEC 60949; ta sama fizyka co Equipment P12 `_check_ith`) | rozszerzenie Ith/Jth w KABEL_NN + przebieg nN w `wytrzymalosc_cieplna_przewodow` |
| Ib≤In (połowa Ib≤In≤Iz) | P15 `generate_load_currents_proof` + `EQ_LC_001..004` | człon In≤Iz (nowe równanie) |
| Krzywe zabezpieczeń | `protection/curves/` + koordynacja + TCC | rodziny krzywych nN (MCB/MCCB/gG) w JEDNEJ ścieżce (po scaleniu N-D4) |
| Czas wyłączenia per gałąź | `czas_wylaczenia_galezi.py` (wzorzec: topologia→aparat→nastawa→czas) | wariant nN: aparat nN → krzywa → czas przy Ik_min |
| Werdykt projektowy (agregat kryteriów) | `werdykt_projektowy.py` (E1–E6, 3 stany, `ZAKRES_POZA_AUTOMATEM`) | nowe kryteria nN jako dostawcy |
| Silniki SC (wkłady μ/q) | `machine_sc_iec60909.py` | konsumpcja przy silnikach nN (P1) |

## 4. Proof / raporty

| Potrzeba | Reużywany byt | Co dokładamy |
|---|---|---|
| Pak dowodowy weryfikacji obwodu nN | seam `ProofType`+`EquationRegistry.merge`+`ProofPackBuilder` (deterministyczny ZIP) + wzorzec Equipment P12 | pak `LV_CIRCUIT_VERIFICATION` (Ib≤In≤Iz, ΔU, SWZ, I²t) wg 10-krokowej procedury (raport A10 §9) |
| ΔU dowód | `packs/vdrop.py` + `EQ_VDROP_*` | multi-segment + konsumpcja `cable_voltage_drop`/PF (jedna fizyka) |
| Raport nN (PDF/DOCX) | `analysis_run_exports.py` (sekcje/poziomy szczegółu) | sekcje nN wg spisu z §63 zlecenia; wzorzec raportu skonsolidowanego wielu analiz (`p24_plus_report.py`) usunięty CV-3.2 (0 wołających, 0 tras HTTP) — projektować od zera na `analysis_run_exports.py`, nie kopiować nieistniejącego wzorca |
| White Box A–D | struktura `ProofStep` (Teoria→Dane→Podstawienie→Wynik) + binarna bramka ekspercka | nic nowego — nie budować 4-poziomowego przełącznika |

## 5. UI

| Potrzeba | Reużywany byt | Co dokładamy |
|---|---|---|
| Układ studio (drzewo/środek/inspektor) | `ui2/shell/PanelLayout.tsx` + `ContextTree` (adapter per przestrzeń) + `InspectorPanel` | adapter drzewa nN, zakładki |
| Kreator RGnN / odcinka / odbioru | `ui2/kreatory/rama` (`KreatorRama`, `pola.tsx`, `PoleKatalogu`, gotowość, teoria) + precedensy `KreatorStacjiSnNn`, `KreatorPolaNn` | kreatory `rgnn`, `odcinek-nn`, rozbudowa `pole-nn` o picker katalogu (po stronie backendu — koniec „ZERO fabrykacji") |
| Tabele wyników | `TabelaWynikow` + `EkranAnalizy` (sort, klik→dowód, wirtualizacja) | tabela odcinków (edycja = nowy byt, F §5) |
| Wykresy: profil U, TCC, margines SWZ | `ProfilNapiecChart.tsx` (wzorzec ui2), `TccChart`/`TimeCurrentChart` (log-log) | serie nN; wykres Ik vs droga i Ik_min/Ia wg wzorca profilu |
| Overlay wyników na SLD | `SldV3Overlay` + `resultLabels.ts` (U/loading/Ik″/ip/Ith per ownerRef — zero zmian kontraktu) | symbole/segmenty nN per element (SLD seam A8 §9) |
| Stan/selekcja/undo/tryby | `app-state`, event bus `ui2/events`, `HistoryStore`, `ModeGate`, tryb Podstawowy/Ekspercki | wpięcie, zero nowych store'ów globalnych |
| Wzorzec HTTP | `api.ts` per moduł + Zustand (NIE react-query) | moduły `api.ts` nN |
| Pętla zwarcia w inspektorze | `SekcjaPetlaZwarcia.tsx` (żywy) | rozszerzenie o wynik „najdalszy punkt" + werdykt SWZ |

## 6. Czego świadomie NIE robimy

- **Żadnych klas `LvBus`/`LvCable`/… jako nowych typów modelu** — lista typów z §3 zlecenia
  jest realizowana przez istniejące byty generyczne + katalog + walidator pasm (patrz C §2).
- **Żadnego osobnego solvera „kalkulator nN"** — jedna fizyka w istniejących torach.
- **Żadnej piątej klasy falownika** i żadnego nowego frameworku kreatora/tabeli/wykresu.
- **Żadnego nowego kontraktu overlay/ResultSet** — ResultSet v1 jest addytywnie rozszerzalny
  (`analysis_type` wolny string, `values`/`global_results` additionalProperties:true).

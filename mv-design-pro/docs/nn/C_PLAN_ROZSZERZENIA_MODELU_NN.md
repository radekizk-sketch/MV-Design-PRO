# C — PLAN ROZSZERZENIA MODELU (MODEL EXTENSION PLAN)

**Decyzja naczelna (architekt):** sieć nN jest reprezentowana przez **istniejące, generyczne
elementy ENM** w paśmie napięcia ≤ 1 kV. Nie wprowadzamy równoległej rodziny klas `Lv*` —
wprowadzenie ich stworzyłoby drugi model (złamanie Single Model Rule) i wymusiło duplikację
walidatora, topologii, mapowań solverów i SLD. Pasmo napięcia (`_voltage_band`,
`enm/validator.py:38-53`) + wiązanie katalogowe + rola elementu dają pełną semantykę nN.

## 1. Mapowanie typów domenowych ze zlecenia (§3) na ENM

| Typ ze zlecenia | Realizacja w ENM | Uwagi |
|---|---|---|
| LvBus | `Bus` (voltage_kv ≤ 1,0) | istnieje |
| LvSection | `Bus` per sekcja + `SwitchBranch` (sprzęgło) między sekcjami | sekcja = szyna; rejestr sekcji w `Substation` (§3) |
| LvFeeder (odpływ) | `SwitchBranch`/`FuseBranch` (aparat odpływowy) + `Cable` + `Bus` docelowa | promocja `nn_field_specs` → realne elementy (§4.2) |
| LvCable / LvLine | `Cable` / `OverheadLine` z `catalog_namespace="KABEL_NN"` (`LINIA_NN` w P1 dla napowietrznych) | impedancja z materializacji |
| LvSwitch / LvBreaker | `SwitchBranch` + wiązanie `APARAT_NN` | aparat W TORZE (LV-INV-03) |
| LvFuse | `FuseBranch` + wiązanie `APARAT_NN` (fuse-link, krzywa gG) | krzywe P0.9 |
| LvRcd | `SwitchBranch` z wiązaniem `RCD_NN` (nowa klasa katalogowa) + `ProtectionAssignment` | P1 |
| LvDistributionBoard (RGnN, podrozdzielnica) | `Substation` z nowym `station_type="rozdzielnica_nn"` | kontener logiczny bez fizyki — zgodny z kanonem Station |
| LvLoad | `Load` (istnieje) | + pole fazy w P1 (§2.3) |
| LvMotor | `Load` z `LoadType` silnikowym (P0) → dedykowane pola rozruchu (P1) | analizy rozruchu P1 |
| LvTransformerSecondary | `Transformer.lv_bus_ref` (istnieje) | nic |
| LvGenerator / LvPvSource / LvBess / LvUps | `Generator` + istniejące operacje (`add_genset_nn`, `add_converter_source`, `add_ups_nn`) | istnieją |
| LvCapacitorBank | `ShuntCapacitor` + nowa klasa katalogowa `KOMPENSATOR_NN` | P1 |
| LvMeasurementPoint | `Measurement` (istnieje) | nic |
| LvPcc | **NIE WCHODZI DO MODELU** (BoundaryNode Prohibition Rule) — punkt rozliczeniowy = interpretacja w warstwie analizy | kanon |
| LvNeutral / LvPeConductor / LvPenConductor | **atrybuty kabla** (funkcje żył w `LVCableType` + parametry żyły powrotnej), nie osobne gałęzie grafu | §2.2; pętla zwarcia czyta z katalogu |
| LvEarthingPoint | `Transformer.lv_neutral` (GroundingConfig) + `meta.nn_earthing_system` (istnieją) | TT/IT: rezystancja uziemienia odbiorcy jako pole stacji (P1) |

**Uzasadnienie (projektant/profesor):** przewód PE/PEN nie jest modelowany jako osobna gałąź
grafu admitancyjnego — w rozpływie i zwarciach międzyfazowych nie uczestniczy, a w pętli
zwarcia L-PE uczestniczy jego impedancja własna, którą wyznaczamy z katalogu kabla (żyła
powrotna) po tej samej trasie co żyła fazowa. To dokładnie odwzorowuje praktykę obliczeń
IEC 60364-4-41 i nie zaśmieca grafu elementami bez potencjału obliczeniowego w PF/SC.

## 2. Rozszerzenia schematów

### 2.1 `Substation` (enm/models.py)
- `station_type`: + `"rozdzielnica_nn"` (rozdzielnica wolnostojąca/podrozdzielnica; stacja
  SN/nN nadal `mv_lv`).
- `nn_sections: list[NnSection]` — NOWY typ `NnSection {section_id, order, bus_ref,
  coupler_ref | None, incoming_refs: list[str]}` (analogia do `GPZSection`); sekcje RGnN,
  sprzęgło = `SwitchBranch` między `bus_ref` sekcji.
- `nn_voltage_levels` — zaczyna być FAKTYCZNIE wypełniane (dziś deklaracja bez producenta).
- `meta.nn_field_specs` — **wygaszane** (§4.2); po migracji pozostaje wyłącznie projekcją
  do odczytu (SLD/read-model) generowaną z realnych elementów, nie źródłem prawdy.

### 2.2 Katalog (network_model/catalog/types.py)
- `LVCableType` (KABEL_NN) — pola addytywne: `r0_ohm_per_km`, `x0_ohm_per_km`,
  `ith_1s_a`, `jth_1s_a_per_mm2`, `max_temperature_c`, `short_circuit_temperature_c`,
  `core_functions` (np. `"3L+N+PE"`, `"3L+PEN"`), `return_conductor_cross_section_mm2`,
  `return_conductor_r_ohm_per_km_20c`, `standard` — wzorzec: `CableType` (SN) już te pola ma.
- `LVApparatusType` (APARAT_NN) — pola addytywne: `icu_ka`, `ics_ka`, `icw_ka`, `poles`,
  `trip_unit` (`TM`/`ELECTRONIC`/`NONE`), `curve_ref`, nastawialność (`ir_range`, `isd_range`,
  `ii_range`, `tr_range`, `tsd_range`) — capability-driven UI czyta stąd (§67 zlecenia).
- NOWE klasy + namespace'y: `LVBreakerMcbType` (`APARAT_NN_MCB`: In, klasa B/C/D wg IEC 60898-1),
  `LVFuseLinkType` (`WKLADKA_NN`: gG/gM, In, bramki I–t z tablic normatywnych — rejestr G),
  `RcdType` (`RCD_NN`: IΔn, typ AC/A/F/B, klasa czasowa, selektywny S) [P1],
  `LVSwitchboardType` (`ROZDZIELNICA_NN`: In szyn, Icw, ip, układ sekcji) [P1],
  `LVCapacitorBankType` (`KOMPENSATOR_NN`) [P1], `GensetType` (`AGREGAT_NN`: Sn, Un, xd″, cosφ)
  [P1], `UpsType` (`UPS_NN`) [P1].
- Krzywe aparatów: reużycie kontenera `ProtectionCurve.parameters` + NOWE rodziny interpretacji
  w jednej ścieżce krzywych (patrz H §P0.9): `MCB_THERMAL_MAGNETIC` (pasmo 1,13/1,45·In +
  próg magnetyczny B: 3–5·In, C: 5–10·In, D: 10–20·In — stałe normatywne IEC 60898-1),
  `FUSE_GG` (bramki z IEC 60269 — dane normatywne, rejestr G), `MCCB_ELECTRONIC` (Ir/Isd/Ii/tr/tsd).
- Sposoby ułożenia + korekty Iz: NOWY moduł danych `lv_ampacity_iec60364_5_52.py`
  (metody instalacji A1…F, współczynniki temperatury/grupowania/gruntu) — **wyłącznie z
  autorytatywnego źródła z proweniencją** (rejestr G; wzorzec: `cable_ampacity_derating.py`
  z podstawą dokumentową, zakaz fabrykacji).

### 2.3 `Load` (P1, architektura przygotowana w P0)
- `connected_phases: Literal["L1","L2","L3","L1L2L3", ...] | None` — pole addytywne; brak =
  3-fazowy symetryczny (reduce-to-obecne-zachowanie). Konsument: rozpływ niesymetryczny (P1)
  + bilans faz. W P0 pole NIE jest dodawane (zakaz kontrolek bez konsumenta).

### 2.4 Porty
Typowane porty `nn_feeder`/`nn_load`/`nn_der_*` (`enm/models.py:685-743`) **stają się jedyną
reprezentacją przyłączy nN** dla SLD: operacje nN wypełniają `Bay.ports`/`endpoint_*_port`.
Zakaz rozwijania drugiej reprezentacji (worek meta) — LV-INV-12.

## 3. Nowe elementy — checklista integracyjna (wzorzec ShuntCapacitor)

Każdy nowy typ/pole przechodzi KOMPLET: (1) `enm/models.py` + kolekcja w `EnergyNetworkModel`;
(2) `enm/hash.py` — `_ELEMENT_KEYS` + projekcje `_SEMANTIC_INCLUDE_*` (pominięcie = cicha
dziura w inwalidacji); (3) `enm/element_kind.py`; (4) `enm/mapping.py` (ENM→NetworkGraph);
(5) walidator (§5); (6) materializacja katalogu + guardy; (7) eksport CGMES (side-car dla pojęć
ENM-specyficznych); (8) archiwum ZIP (po N-D1); (9) testy.

## 4. Operacje kanoniczne nN (nowa rodzina `NN_NETWORK`)

### 4.1 Nowe operacje (rejestr + handler + schema + dispatcher — seam A7 §2.3)

| Operacja | Semantyka |
|---|---|
| `add_nn_cable_segment` | kabel nN (KABEL_NN, długość, ułożenie, n_parallel) od szyny/portu do NOWEJ lub istniejącej szyny nN |
| `add_nn_distribution_board` | podrozdzielnica: `Substation(rozdzielnica_nn)` + szyna główna (+ zasilenie = `add_nn_cable_segment`) |
| `add_nn_switch_device` | aparat (SwitchBranch/FuseBranch + APARAT_NN/WKLADKA_NN) w torze między szynami / na początku odpływu |
| `split_nn_segment` | rozcięcie kabla na dwa odcinki z nową szyną pośrednią (zachowanie sumy długości) |
| `merge_nn_segments` | scalenie dwóch odcinków tego samego typu przez szynę pośrednią bez innych przyłączy |
| `add_nn_section_coupler` | sekcja szyn + sprzęgło w rozdzielnicy (`NnSection`) |
| `set_nn_cable_laying_conditions` | warunki ułożenia + współczynniki korekcyjne (meta odcinka, wzorzec DER `cable_laying_conditions`) |
| `remove_nn_element` / `copy_nn_feeder` | usuwanie/kopiowanie poddrzewa odpływu (§4 zlecenia: dodaj/usuń/kopiuj/rozdziel/połącz) |

Wszystkie operacje: catalog-binding obowiązkowy (Rule 10), `_response(...)` + walidacja
semantyczna post-hook, rejestracja w `CANONICAL_OPERATIONS` **i** w handlerach (guard N-D8
utwardzony na dwukierunkowość).

### 4.2 Migracja `nn_field_specs` → realne elementy
Operacja porządkowa + migracja przy odczycie: każdy wpis `nn_field_specs` (wyłącznik główny,
odpływy) dostaje realny `SwitchBranch` (APARAT_NN z metadanych `catalog_bindings`) na szynie
nN; `add_nn_load` przestaje wieszać odbiór na szynie stacji — odbiór trafia za aparat odpływowy
(+ opcjonalny kabel). Stare ENM-y czytane są przez migrator (bez fallbacków w kodzie liczącym —
zasada inżynierska nr 1: bez warstw kompatybilności; migracja jednorazowa przy load).

## 5. Nowe reguły walidatora (enm/validator.py)

| Kod | Reguła | Waga |
|---|---|---|
| E060 | odbiór/źródło nN bez ciągłej ścieżki do transformatora/źródła (LV-INV-01) | BLOCKER |
| E061 | gałąź nN bez wiązania katalogowego KABEL_NN/APARAT_NN | BLOCKER |
| E062 | mieszanie poziomów nN (0,4 vs 0,69) bez transformatora (zaostrzenie E020 w paśmie nN, LV-INV-11) | BLOCKER |
| E063 | stacja z odbiorami nN bez `nn_earthing_system` | BLOCKER (dla SWZ) |
| E064 | aparat nN bez umiejscowienia w torze (wiszący ProtectionAssignment) — LV-INV-03 | BLOCKER |
| W060 | odcinek nN bez warunków ułożenia (Iz liczona katalogowo — jawne założenie) | WARNING |
| W061 | Icu aparatu < Ik″max na szynie (po biegu SC; walidacja wyników → analiza, nie walidator modelu) | w warstwie analizy |
| W062 | równoległe źródła nN bez sprzęgła/logiki SZR (konflikt) | WARNING |

## 6. Co pozostaje świadomie POZA modelem

- **SZR jako automat** — stany A/B/awaria modelujemy stanami łączników per przypadek
  obliczeniowy (STUDY_CASE — istniejący mechanizm switching_snapshot_hash), nie nowym bytem
  fizycznym; logika przełączeń = warstwa aplikacji (P1).
- **Harmoniczne** — `BACKEND GAP — LV HARMONIC LOAD FLOW` (rejestr G), architektura ENM
  nie wymaga zmian dziś.
- **PCC/BoundaryNode** — zakaz kanoniczny, punkt rozliczeniowy wyłącznie w analizie.

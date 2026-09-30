# KARTA W5 — Model fazowy i uziemienie (= CV-5): jedna reprezentacja uziemienia, typowany `Bay`, stan łączeniowy, fazy, TT/IT, terminale

Status: karta architekta (projekt kontraktów i kolejności), 2026-09-16. Nadrzędne: `MISJA_DOMKNIECIA_PRODUKTU_2026-09.md`,
`SYNTEZA_DOMKNIECIA_PRODUKTU_2026-09.md` §5 (kolejność W3 → W6-0 → **W5** → W4 → W6-1/2 → W8), mapa
`MAPA_DOMKNIECIA_PRODUKTU_2026-09.md` §4 wiersz W5 i aneks 3a (B5, C2, C4, C8, F9, G6), decyzje T-2 i F-1…F-4 w
`../architecture/CANONICAL_TWIN_ARCHITECTURE.md` §T-2/§F. Podstawa: inwentarz dowodowy `../audit/INWENTARZ_W5_2026-09-16.md`
(pomiar grepem na drzewie `e08def50`, plik:linia dla każdego miejsca). Wejście: W3 odebrane (fala 3 wypchnięta) i W6-0
(S-1…S-4) odebrane, bo W5 dotyka `readiness`, `eligibility_service` i `field_read_model`, które S-1/S-2 zmieniają.

## 0. Co zmierzono (streszczenie inwentarza — pełne tabele w dokumencie inwentarza)

| wielkość | pomiar |
|---|---|
| reprezentacje uziemienia punktu neutralnego / układu uziemienia | **20 miejsc** (14 backend + 6 frontend); **5 słowników wartości** typu punktu neutralnego; **4 definicje** zbioru TN-S/TN-C-S/TN-C/TT/IT |
| reprezentacje czytane przez fizykę | **1**: `Transformer.hv_neutral/lv_neutral` → `enm/zero_sequence_transformer.py` → `enm/mapping.py` → `enm/assembler.py`; `Bus.grounding` — 0 odczytów w fizyce |
| reprezentacje bez konsumenta | **5**: `domain/grounding.py::Grounding`, `substation.meta["grounding"|"zero_sequence"]`, `ui/topology/earthingTypes.ts`, `EarthingSystemSelector.tsx`, `EarthingBadge.tsx` |
| `meta.field_specs` / `nn_field_specs` / `switchgear_field_specs` | **106 plików** (17 `backend/src`, 49 `backend/tests`, 15 FE produkcyjnych, 25 FE testów); 1 builder `_build_field_spec` z 7 wołaniami; 3 kolekcje; typowany `Bay` ma 14 pól, 7 pól wpisu nie ma odpowiednika |
| rozpływ niesymetryczny `solvers/power_flow_unbalanced.py` | **0 konsumentów produkcyjnych**, 2 pliki testów; jedyna żywa ścieżka „fazowa" to `phase_state_sn` (wejście jawne, nie rozpływ; liczy odchylenie od średniej, nie VUF) |
| stan łącznika | **7 reprezentacji**; 1 pisarz `status="open"` (`set_normal_open_point`), 24 pisarzy `"closed"`, **brak operacji zamknięcia**; NOP nie zamyka poprzedniego |
| pętla zwarcia nN | `POST /api/fault-loop/compute`: 0 konsumentów FE, 0 testów; TT/IT → `NotImplementedError` w solverze (FROZEN); `fault_loop/service.py` podstawia **`_DEFAULT_SYSTEM = "TN-C-S"`**, gdy `meta` puste; RCD: 0 trafień w kodzie |
| `vector_group` | walidator sprawdza tylko OBECNOŚĆ (W004); katalog `types.py` ma **domyślne `"Dyn11"`**; UI: wolny tekst; dostępność punktu neutralnego wyprowadzana z litery grupy, jawny `GroundingConfig` ma pierwszeństwo nawet na uzwojeniu bez punktu neutralnego |
| terminale (T-2) | `Terminal` nie istnieje; `enm/topology.terminals(enm)` nie istnieje; `Port`/`PortRef` metadane, E030 wyłączone domyślnie; `ConnectionNode` 0 pisarzy / 0 czytelników; „port" i „terminal" mają po trzy semantyki |

## 1. Rozstrzygnięcia architekta (wiążące dla wykonawców)

1. **Uziemienie punktu neutralnego — jeden typ, dwa nośniki fizyczne, zero kopii.** `GroundingConfig` (`type ∈ {isolated,
   petersen_coil, directly_grounded, resistor_grounded}`, `r_ohm`, `x_ohm`) pozostaje JEDYNYM typem. Nośniki: (a)
   `Transformer.hv_neutral / lv_neutral` (jest; czyta `zero_sequence_transformer` → Y0), (b) **`Source.neutral_grounding:
   GroundingConfig | None`** (NOWE) — opis inżynierski punktu neutralnego równoważnika sieci zasilającej; fizyka źródła
   czyta, jak dziś, `Source.r0_ohm/x0_ohm | z0_z1_ratio`. Kreator źródła GPZ przestaje pisać do `Bus.grounding` i
   `substation.meta`: wyprowadza `r0/x0` z (Z0 równoważnika transformatora zasilającego + 3·Z_N) funkcją w
   `network_model/pochodne/skladowe_zerowe.py` (algebra wielkości pochodnych, jawny wzór, proweniencja `WYPROWADZONE`)
   i zapisuje OBA: opis (`neutral_grounding`) i liczby (`r0/x0`). Walidator: reguła spójności `E-W5-01` (opis
   `isolated` z podanym skończonym Z0 źródła, `resistor_grounded` bez `r_ohm`, `petersen_coil` bez `x_ohm`) — odmowa
   nazwana, nie domysł. **Kasacje** (procedura 7 kroków, każda z pomiarem konsumentów): `Bus.grounding` (migracja: wartość
   → `Source.neutral_grounding` źródła na tej szynie; brak źródła → wpis dziennika i utrata z nazwą),
   `substation.meta["grounding"]`/`["zero_sequence"]` (0 czytelników; migracja czyszcząca), `domain/grounding.py`
   (0 użyć), FE `ui/topology/earthingTypes.ts`, `EarthingInspector.tsx`, `EarthingSystemSelector.tsx`,
   `ui/sld/v2/renderer/EarthingBadge.tsx` (+ testy). **Jeden słownik wartości:** `BayEarthFaultPath.neutral_grounding_mode`
   przyjmuje literały `GroundingConfig.type` (koniec polskich literałów w kontrakcie; etykiety PL w prezentacji),
   `MvNeutralGroundingItem.grounding_type` typowane tym samym `Literal`, `earthing_system` typu źródła w katalogu
   (`"PUNKT_NEUTRALNY_UZIEMIONY"`, bez konsumenta fizycznego) skasowane razem z etykietą w `TypeLibraryBrowser`. Ekran
   składowych (E-29) czyta `Source.neutral_grounding` + `Transformer.*_neutral`.
2. **Układ sieci nN — jedno pole typowane.** `Transformer.lv_earthing_system: UkladSieciNn | None`, gdzie
   `UkladSieciNn = Literal["TN-S", "TN-C-S", "TN-C", "TT", "IT"]` jest zdefiniowany RAZ w `enm/models.py`;
   `substation.meta["nn_earthing_system"]` skasowane z migracją przy wczytaniu; kreator stacji pisze pole typowane. Enum
   solvera `fault_loop_iec60364.NetworkType` zostaje kontraktem solvera (FROZEN) — JEDNA funkcja mapująca w
   `solver_input/` + test równości zbiorów literałów (pin obu stron). FE: typ z OpenAPI, nie własna lista.
   **`_DEFAULT_SYSTEM = "TN-C-S"` w `application/analyses/fault_loop/service.py` skasowane** — brak układu = odmowa
   nazwana istniejącym kodem `ELIG_FLNN_MISSING_EARTHING_SYSTEM`; warunek „brak układu nN" liczony w JEDNYM predykacie
   (dziś 3 miejsca: `eligibility_service.py`, `enm/validator.py`, `readiness_bridge.py`).
3. **`vector_group` z walidacją słownika (F-4, G6).** Słownik dopuszczalnych grup połączeń wg IEC 60076-1 (notacja
   zegarowa: `[YDZ][ynzdN]?[0-9]{1,2}` z literami `N`/`n` dla dostępnego punktu neutralnego) jako JEDNO źródło:
   walidator (`E-W5-02`: wartość nieparsowalna = błąd blokujący z `fix_navigation` do modalu transformatora), OpenAPI
   enum, FE `select` zamiast wolnego tekstu (`StationConfigTransformerCard.tsx`), kreator transformatora ui2 pokazuje
   wartość z katalogu i pozwala ją zmienić z tej samej listy. **Domyślne `"Dyn11"` w `catalog/types.py` skasowane** —
   rekord katalogu deklaruje grupę albo jej nie ma (i wtedy gotowość mówi to wprost); `ui/property-grid/field-definitions.ts`
   przestaje nieść `'Dyn11'` na sztywno. Reguła spójności `E-W5-03`: `GroundingConfig` na uzwojeniu bez dostępnego punktu
   neutralnego (litera bez `N`/`n`, np. strona `D`) = błąd walidatora; `enm/zero_sequence_transformer.py` (nie FROZEN)
   zamienia dzisiejsze pierwszeństwo jawnego configu nad literą (`:138`) na odmowę nazwaną — fizyka nie uziemia trójkąta.
4. **Ekran kabla (F9) — pole typowane bez fabrykacji fizyki.** `Cable.screen_bonding: Literal["single_end",
   "both_ends", "cross_bonded"] | None`; typ kabla w katalogu dostaje `z0_reference_bonding` (dla którego układu
   uziemienia ekranu producent podał r0/x0). Walidator `W-W5-01`: modelowane `screen_bonding` ≠ referencyjne katalogu →
   ostrzeżenie „składowa zerowa z katalogu dla innego układu uziemienia ekranu" (bez przeliczania — nie ma danych geometrii;
   ich pomiar należy do miernika gotowości z karty `KATALOG-NIEZMIENNIKI`). `earthing_role = "cable_screen"` dostaje
   pisarza w kreatorze pola (uziemnik ekranu) — dziś 0 pisarzy. Napięcia indukowane w ekranach: **poza W5** (wymagają
   geometrii ułożenia, której katalog nie niesie) — wiersz F9 mapy: BRAK z nazwanym powodem, nie „częściowe".
5. **`meta.field_specs` → typowany `Bay` (W5-B, największy wycinek: 106 plików).** `Bay` rozszerzony o pola wpisu bez
   odpowiednika (`field_role`, `funkcja_pomiaru`, `rodzaj_pomiaru`, `catalog_bindings`, `wybor_bloku`,
   `metadane_pochodzenia`, `terminal_bus_ref`) i o kotwicę `branch_point_ref` (pola ZKSN); jedna kolekcja `enm.bays` dla
   pól SN, nN i ZKSN (rozróżnienie przez `bay_role`/`substation_ref`/`branch_point_ref`). JEDEN builder
   (`_build_field_spec` → `Bay`) i JEDEN pisarz do `bays`; `LEGACY_FIELD_COLLECTIONS` przestaje blokować `bays` (staje się
   kanoniczne), blokada przechodzi na klucze `meta.field_specs`/`nn_field_specs`/`switchgear_field_specs` (zapis = błąd).
   Migracja przy wczytaniu: `enm/migrations/nn_field_specs_promocja.py` rozszerzona do `field_specs_promocja.py`
   (3 kolekcje → `bays`), po promocji klucze usunięte z `meta`. Czytelnicy: 17 modułów backendu i 15 plików FE przepięte
   na `bays` (FE przez ten sam JSON ENM — `enmToSldAdapter.ts`, `topologyInputReader.ts`, `MiniBlockRmuRenderer.tsx`,
   `useFieldReadModel.ts` i pozostałe z inwentarza). Guard `meta_field_specs_resurrection_guard` (zapowiedziany w
   `CONVERGENCE_ROADMAP.md` i `CANONICAL_TWIN_ARCHITECTURE.md`, dotąd nieistniejący) w CI. Dowód: sygnatura sceny SLD v3 i
   projekcja nN **bit w bit** PRZED/PO na rejestrze sieci (G00–G15) i fixturach e2e; hash ENM zmienia się ŚWIADOMIE
   (kolekcja `bays` w odcisku) — golden przeliczone z dowodem klasy zmian per sieć (tylko `bays`/`meta`, zero zmian w
   fizyce). Sub-karta `SZABLONY-NN` (wiązanie wyłącznika głównego nN, pole TR `W041`, pole nN tylko przy odpływach — wariant
   B+A; adaptacja `domain/dobor_aparatu_pola.py` z wątku badawczego) wchodzi PO W5-B na typowanych szablonach.
6. **Stan łączeniowy — jedna prawda (W5-C; C2/C4/C8).** `BranchBase.status` zostaje JEDYNYM stanem czytanym przez
   fizykę. NOWE: `SwitchBranch.normal_state: Literal["closed", "open"] | None` (pozycja normalna z projektu; `None` =
   niezadeklarowana, nie domysł). Operacje kanoniczne `open_switch` / `close_switch` (polityka, dziennik, świeżość jak
   każda operacja); `set_normal_open_point` przepisane: `normal_state=open` + `status=open` na wskazanym łączniku i
   `normal_state=closed` + `status=closed` na poprzednim NOP tego samego pierścienia — atomowo (dziś pętla kończy się po
   pierwszym trafieniu i nic nie zamyka). `corridor.no_point_ref` → wyprowadzane akcesorem (`enm/topology.punkty_podzialu`),
   zapis skasowany z migracją. `OperatingScenario.switch_states: dict[str, Literal["closed", "open"]]` stosowane w
   `apply_scenario` do migawki efektywnej (konsument realny: assembler PF/SC; test: scenariusz z otwartym łącznikiem daje
   inny rozpływ niż bazowy, bit w bit równy rozpływowi modelu z tym łącznikiem otwartym na stałe). `out_of_service`
   (element nieobecny) i `switch_states` (stan łącznika) to DWA pojęcia — oba nazwane w docstringu `scenariusze.py`.
   `BaySwitchState.actual_state` i `BayOperatingState.normal_position/current_position` wyprowadzane w
   `field_read_model` z `status`/`normal_state` (koniec „bez dostawcy"). SLD: akcja `'set-switch-state'` → realne
   `open_switch`/`close_switch` (etykieta „Zmień stan łącznika" przestaje kłamać), `CadSwitchState.unknown` skasowane (ENM
   zawsze zna stan), `topologyInputReader.isNormallyOpen` z `normal_state`.
7. **Model fazowy (W5-D; F-1).** `PhaseSet = Literal["ABC", "A", "B", "C", "AB", "BC", "CA"]` w `enm/models.py`;
   `Load.phases: PhaseSet | None = None` (brak = odbiór trójfazowy symetryczny — jedyne znaczenie, jakie `Load` kiedykolwiek
   miał; `exclude_none` zachowuje odciski istniejących migawek); kreator odbioru nN pozwala wybrać fazę. Terminal niesie
   `phases` (p. 9). **Rozpływ niesymetryczny jako bieg produktu:** typ analizy `PF_UNBALANCED`
   (`analysis_type = "rozplyw_niesymetryczny"`) w tym samym dyspozytorze `_wykonaj_analize_biegu`; wejście z assemblera
   (ES → TV → IR) — impedancje własna/wzajemna gałęzi z impedancji składowych wg `Z_s = (Z_0 + 2·Z_1)/3`,
   `Z_m = (Z_0 − Z_1)/3` w `network_model/pochodne/skladowe_symetryczne.py` (algebra wielkości pochodnych, White Box:
   wzór, dane, podstawienie, wynik), odbiory per faza z `Load.phases`; solver `solvers/power_flow_unbalanced.py`
   (FROZEN) nietknięty. Kontrakt wyniku `ResultSetPowerFlowUnbalancedV1` (osobny, addytywny: U/I per faza, straty,
   `voltage_unbalance_factor_pct` wg IEC 61000-4-30 z solvera), API `/results/rozplyw-niesymetryczny`, gotowość: sieć
   nieradialna w scenariuszu → odmowa nazwana `power_flow.unbalanced_requires_radial` (BFS jest radialny — to własność
   solvera, nie domysł). Ekran E-31 (stan fazowy) dostaje DRUGIE źródło z etykietą „z rozpływu niesymetrycznego"; zdanie
   „ten wskaźnik nie jest dziś liczony" w `strings.ts` zastąpione stanem faktycznym per źródło (odchylenie od średniej z
   `phase_state_sn`, VUF wg składowych z rozpływu niesymetrycznego).
8. **TT/IT/RCD (W5-E).** Model: `Load` nN / obwód nN dostaje `rcd: RcdSpec | None` (`i_delta_n_a`, `typ ∈ {AC, A, F, B}`,
   `selektywny: bool`, `catalog_ref`) i `earth_electrode_r_ohm: float | None` (R_A instalacji odbiorczej, TT/IT);
   `Transformer.lv_neutral.r_ohm` pełni rolę R_B. Katalog RCD typowany, bez domyślnych wartości. Fizyka: solver
   `fault_loop_iec60364.py` (FROZEN) podnosi `NotImplementedError` dla TT/IT → **OD-25** (B-01): nowy moduł
   `solvers/petla_zwarcia_tt_it.py` (TT: `R_A · I_Δn ≤ 50 V` i czas wyłączenia wg IEC 60364-4-41 411.5.3 / tab. 41.1; IT:
   pierwsze zwarcie `R_A · I_d ≤ 50 V` 411.6.2, drugie zwarcie jak TN/TT 411.6.4). Do decyzji: gotowość odmawia nazwanym
   kodem `fault_loop.tt_it_not_supported` — nigdy domyślnym TN-C-S. `POST /api/fault-loop/compute` (ręczne R+X, 0
   konsumentów, 0 testów) — kasacja procedurą 7 kroków; żywa trasa `station-fault-loop` (z modelu) zostaje.
9. **Terminale (W5-T; T-2).** Akcesor `enm/topology.terminals(enm) → tuple[Terminal, ...]`,
   `Terminal = (equipment_ref, sequence, cn_ref, phases)`, tożsamość `"{equipment_ref}:t{sequence}"`, wyprowadzany
   deterministycznie z `bus_ref`/`from_bus_ref`/`to_bus_ref` i `Bay.ports` — bez nowego stanu w modelu. `ConnectionNode`
   (0/0) kasacja; `enm/migrations/endpoint_ports.py` (0 wołań; `port_binding_guard --strict` już wymusza porty w fixturach)
   kasacja; E030 (połączenie SN bez portu) domyślnie WŁĄCZONE, flaga `ENM_STRICT_PORT_BINDING` skasowana po przejściu
   rejestru sieci; `branch_point["ports"]` (`MAIN_IN/MAIN_OUT/BRANCH`) → `Port` z `kind`; `meta["terminal_bus_ref"]` →
   `Bay.terminal_bus_ref` (p. 5); „terminale korytarza" (końce magistrali) → nazwa `konce_magistrali` w backendzie i FE
   (jedno słowo = jedno pojęcie).
10. **Kolejność i równoległość.** W5-A (uziemienie, `vector_group`, ekran kabla, kasacje) ∥ W5-D (model fazowy +
    rozpływ niesymetryczny) → W5-B (typowany `Bay`) → W5-C (stan łączeniowy) ∥ W5-E (TT/IT/RCD bez solvera; solver po
    OD-25) → W5-T (terminale) → `SZABLONY-NN`. Powód: W5-B, W5-C i W5-T dotykają `enm/domain_operations.py`
    (10 tys. wierszy) — szeregowo; W5-A i W5-D dzielą tylko `enm/models.py` (dopisania pól, konflikt trywialny).
11. **Bramki dowodowe wspólne dla każdej sub-karty.** (a) Z0 i SC_1F na rejestrze sieci bit w bit tam, gdzie migracja nie
    zmienia danych; każda zmiana ŚWIADOMA (np. `Bus.grounding` → `Source`) z dowodem per sieć PRZED/PO; (b) sygnatura
    sceny SLD v3 i projekcja nN identyczne; (c) klasy zmian hasha ENM nazwane; (d) snapshot OpenAPI przeliczony;
    (e) guardy: nowy `meta_field_specs_resurrection_guard`, rozszerzenie `grep_zero_guard` o skasowane symbole
    (`Bus.grounding`, `nn_earthing_system`, `_DEFAULT_SYSTEM`, `EarthingSystemSelector`, `fault-loop/compute`,
    `ConnectionNode`); (f) pełny łańcuch przedpushowy; (g) e2e klasy D (mapa §5 p. 4: „D od W5") jako bramka CI po W5-D.
12. **Decyzje właściciela (B-01) — zapis do mapy §7:** **OD-24** — `solvers/v126_academic.py` (FROZEN): fallbacki
    `neutral_earthing_type` (`petersen_coil`/`petersen_tuned`/`isolated`) i stała `"voltage_unbalance_u2_u1": 0.0` to
    domyślne wartości fizyki w rdzeniu; W5 gwarantuje, że wejście zawsze niesie wartość z modelu (test pinujący), ale kod
    fallbacku zostaje do zgody właściciela. **OD-25** — nowy moduł solvera pętli zwarcia TT/IT z RCD (p. 8).

## 2. Granice (czego wykonawcy NIE robią)
- Nie edytują `network_model/solvers/**` (B-01) — `power_flow_unbalanced.py`, `fault_loop_iec60364.py`,
  `v126_academic.py` nietknięte; wszystkie zmiany fizyki wejścia w `enm/`, `solver_input/`, `network_model/pochodne/`.
- Zero domyślnych liczb i literałów fizycznych: brak danych = odmowa nazwana z kodem gotowości i `fix_navigation`.
- Żadnej równoległej reprezentacji „na czas migracji": każda kasacja procedurą 7 kroków z pomiarem konsumentów PRZED
  i po, wpis w rejestrze kasacji, guard wskrzeszenia.
- Nie zmieniać kontraktów FROZEN wyniku PF/SC; nowe kontrakty tylko addytywnie i osobno (`ResultSetPowerFlowUnbalancedV1`).
- Nie „naprawiać" fixtur pod testy: fixtura, która po migracji traci dane, to znalezisko do meldunku, nie do przemilczenia.

## 3. Definicja ukończenia W5 (całości)
1. Jedna reprezentacja uziemienia (p. 1–2) — inwentarz PO: 0 kopii, 1 słownik wartości, 1 definicja układu nN, 0
   reprezentacji bez konsumenta; `_DEFAULT_SYSTEM` nie istnieje.
2. `vector_group` walidowany słownikiem z jednego źródła; katalog bez domyślnego `"Dyn11"`; E-W5-03 blokuje uziemienie
   uzwojenia bez punktu neutralnego.
3. `meta.field_specs` (3 kolekcje) nie istnieje w kodzie ani w migawkach po migracji; `bays` jedyną kolekcją pól; guard
   w CI; scena SLD i projekcja nN bit w bit.
4. `open_switch`/`close_switch`, `normal_state`, `switch_states` w scenariuszu z konsumentem w assemblerze; NOP zamyka
   poprzedni; SLD zmienia stan łącznika naprawdę.
5. `Load.phases`; bieg `rozplyw_niesymetryczny` end-to-end (model → bieg → wynik → E-31 → dowód White Box), VUF wg
   IEC 61000-4-30 z solvera; e2e klasy D zielone jako bramka CI.
6. TT/IT/RCD: model + katalog + gotowość nazwana; `/api/fault-loop/compute` skasowany; OD-25 zapisane.
7. Terminale: akcesor T-2, `ConnectionNode` i martwa migracja skasowane, E030 domyślnie włączone.
8. Dokumenty: `CANONICAL_TWIN_ARCHITECTURE.md` §T-2/§F (stan „wdrożone" z odnośnikiem do commitów), mapa §4 wiersz W5 i
   aneks 3a (B5 pozostaje w W4, C2/C4/C8/F9/G6 zamknięte lub nazwane), rejestr konfliktów (wiersz W5), evidence §E/§F.

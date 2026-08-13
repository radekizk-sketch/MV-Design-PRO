# OLTC End-to-End — architektura wiążąca i plan fazowy (2026-07)

**Status:** BINDING (podrzędny wobec kanonu V12.xx i specyfikacji `docs/system/SPEC_*`).
**Zakres:** przełącznik zaczepów pod obciążeniem (OLTC) oraz off-load (DETC) —
kompletny łańcuch od modelu elektrycznego, przez solvery i analizy, po UI, SLD,
raporty, API i optymalizację.
**Rejestr:** V12K-045 (`docs/v12xx/REJESTR_KONFLIKTOW.md`).
**Dyrektywy właściciela:** Opcja MAX, wizja end-to-end „do ostatniego klika",
zero fabrykacji (każda kontrolka UI mapuje na realne pole backendu), reużycie
istniejącej infrastruktury, audyt eksperckim gronem przed przebudową.

---

## 0. Panel ekspercki — soczewki i rozstrzygnięcia

Zgodnie z dyrektywą „audyt szerokiego grona ekspertów przed przebudową", zakres
OLTC przeszedł ocenę przez soczewki:

| Soczewka | Kluczowe wymaganie | Rozstrzygnięcie architektoniczne |
|----------|--------------------|----------------------------------|
| Projektant sieci SN | Jeden obiekt regulacji na transformatorze, edytowalny w kreatorze GPZ i widoczny na SLD | Kanoniczny `TapChanger` na transformatorze = jedyne źródło prawdy (§1). |
| Zwarciowiec (IEC 60909) | Brak podwójnego liczenia zaczepu w prądach zwarciowych | K_T wg IEC 60909-0 §3.3.3 liczone z wartości **znamionowych** (tap-niezależne); OLTC nie wpływa na Ik″ w metodzie kanonicznej (§6). Plik solvera SC pozostaje NIETKNIĘTY. |
| Rozpływowiec (LF) | Pętla regulacji AVR: jeden zaczep na krok, aż do pasma nieczułości | Pętla OLTC w warstwie solvera LF, deterministyczna, WHITE BOX (§2). |
| Zabezpieczenia | Zmiana przekładni wpływa na prądy i nastawy; regulacja nie może oscylować z OZE Q(U) | Wyniki LF po zbieżności pętli OLTC zasilają analizy zabezpieczeń; koordynacja z Q(U)/cosφ(P) przez wspólny punkt zbieżności (§4, §10). |
| Rozdzielnie / katalogi | Reużycie istniejącego `TapChangerItem` (katalog typów) | Katalog = typoszereg (immutable), instancja `TapChanger` = stan na modelu; instancja może być zasiana z katalogu (§1.3). |
| Przyłączenia / OZE | Regulacja napięcia współpracuje z Q(U), STATCOM, baterie kondensatorów | Wspólna pętla sterowania napięciem: OLTC + urządzenia Q rozwiązywane w jednym zbieżnym rozpływie (§10). |
| UX / IA | Kontrolki inżynierskie, nie „wielkie suwaki"; uczciwe stany zerowe | Krok „Transformatory" kreatora GPZ rozbudowany o sekcję regulacji z polami liczbowymi/wyborami mapującymi 1:1 na pola backendu (§3). |

**Zasada nadrzędna (single source of truth):** żaden moduł nie trzyma lokalnej
kopii stanu zaczepu. Wszyscy konsumenci czytają `TapChanger` z transformatora
(lub jego rzut w kontrakcie solver-input / wynik pętli OLTC z LF).

---

## 1. Model kanoniczny — `TapChanger` (jedyne źródło prawdy)

### 1.1 Stan obecny (recon)

| Warstwa | Pola zaczepu (przed OLTC) | Plik |
|---------|---------------------------|------|
| Domena | `tap_position:int`, `tap_step_percent:float`, `get_tap_ratio()` | `network_model/core/branch.py` (TransformerBranch) |
| ENM | `tap_position`, `tap_min`, `tap_max`, `tap_step_percent` | `enm/models.py` (Transformer) |
| Solver-input | `tap_position`, `tap_step_percent` (frozen) | `solver_input/contracts.py` (TransformerPayload) |
| LF | `TransformerTapSpec(branch_id, tap_ratio)` → Y-bus (przekładnia STAŁA) | `power_flow_types.py`, `power_flow_newton.py` |
| Katalog | `TapChangerItem` (typ oltc/detc, neutral, count, step, range, regulated_side, switching_time, supports_avr) | `network_model/catalog/audit2_catalogs.py` |
| Adapter | `apply_audit2_to_network_model` ustawia `tap_position` przed solverem | `solver_input/audit2_solver_adjuster.py` |
| Eksport | RatioTapChanger (min/max/normalStep/step) | `infrastructure/cgmes/cgmes_exporter.py` |

**Braki:** brak jednego obiektu regulacji (regulowane uzwojenie, tryb sterowania,
napięcie zadane, pasmo nieczułości, opóźnienie, kompensacja spadku na linii LDC,
sterowana szyna). Stan rozproszony (pozycja+krok na branchu, min/max tylko w ENM).

### 1.2 Kontrakt `TapChanger`

Wartość osadzana na transformatorze (domena + ENM), **addytywna**,
`exclude_none`, w pełni wstecznie zgodna (brak = zachowanie jak dotychczas):

| Pole | Typ | Znaczenie |
|------|-----|-----------|
| `regulation_type` | `NONE` \| `DETC` \| `OLTC` | rodzaj regulacji; `NONE`/brak → obecne zachowanie |
| `regulated_winding` | `HV` \| `LV` | uzwojenie z zaczepami |
| `neutral_position` | int | pozycja neutralna (przekładnia znamionowa) |
| `current_position` | int | bieżąca pozycja zaczepu |
| `min_position` / `max_position` | int | zakres pozycji |
| `step_percent` | float | wielkość kroku [%] |
| `control_mode` | `MANUAL`\|`AUTOMATIC`\|`PROFILE`\|`REMOTE` | tryb sterowania |
| `voltage_setpoint_kv` | float\|None | napięcie zadane (tryb AUTOMATIC) |
| `deadband_kv` | float\|None | pasmo nieczułości |
| `delay_seconds` | float\|None | opóźnienie zadziałania |
| `controlled_bus_id` | str\|None | regulowana szyna (domyślnie szyna regulowanego uzwojenia) |
| `line_drop_compensation` | `{enabled, r_ohm, x_ohm}`\|None | kompensacja spadku na linii (LDC) |

### 1.3 Przekładnia efektywna (jeden helper)

Jeden, jedyny helper liczy przekładnię efektywną z przekładni znamionowej +
pozycji zaczepu, z uwzględnieniem regulowanego uzwojenia:

```
t_tap = 1 + (current_position - neutral_position) * step_percent / 100
regulated_winding == HV  → n_eff = (U_hv * t_tap) / U_lv
regulated_winding == LV  → n_eff = U_hv / (U_lv * t_tap)
```

Helper żyje na modelu (domena `TransformerBranch.effective_ratio()` + zgodny
wynik w ENM). `get_tap_ratio()` pozostaje (wsteczna zgodność), ale wyprowadza
`t_tap` z kanonu (`current_position`/`neutral_position` gdy `TapChanger` obecny,
w przeciwnym razie `tap_position` jak dziś).

### 1.4 Reużycie katalogu

`TapChangerItem` (typ) zasiewa instancję `TapChanger` (fabryka
`tap_changer_from_catalog(item, *, current_position=None)`); brak duplikacji
pól — katalog opisuje typoszereg, instancja trzyma stan ruchowy.

---

## 2. Pętla regulacji OLTC w rozpływie (LF)

**Warstwa:** solver LF (jedyne miejsce z fizyką). Pętla deterministyczna:

```
1. Rozwiąż LF przy bieżących pozycjach zaczepów.
2. Dla każdego OLTC w trybie AUTOMATIC:
   U_reg = |V(controlled_bus)|  (z LDC, jeśli enabled: U_reg -= I·(r+jx))
   jeśli |U_reg - setpoint| <= deadband/2 → bez zmian.
   w przeciwnym razie: przesuń DOKŁADNIE JEDEN zaczep w stronę zadanego
   (respektuj kierunek wg regulated_winding i min/max).
3. Jeśli którykolwiek zaczep się zmienił i nie przekroczono limitu iteracji →
   wróć do 1. W przeciwnym razie koniec.
```

- **Jeden zaczep na krok** (bez skoków wielopozycyjnych) — wymóg właściciela §4.
- **Determinizm:** kolejność OLTC sortowana po `branch_id`; remisy rozstrzygane
  deterministycznie; brak losowości.
- **WHITE BOX:** ślad decyzji regulatora per iteracja (pozycja przed/po, U_reg,
  setpoint, deadband, powód: `within_deadband`\|`step_up`\|`step_down`\|`limit_reached`).
- **Frozen Result API:** `PowerFlowResult`/`PowerFlowNewtonSolution` rozszerzane
  wyłącznie **addytywnie** (`oltc_control_trace`, `oltc_final_positions`), pola
  opcjonalne, `exclude_none`; payload bez OLTC → seed i wyniki bez zmian.

---

## 3. UI — kreator GPZ, krok „Transformatory" (bez fabrykacji)

Sekcja „Regulacja napięcia (zaczepy)" — kontrolki inżynierskie, każda mapuje na
pole `TapChanger`:

- wybór `regulation_type` (Brak / DETC / OLTC),
- `regulated_winding`, `neutral/current/min/max_position`, `step_percent`,
- `control_mode`, `voltage_setpoint_kv`, `deadband_kv`, `delay_seconds`,
- LDC (włącz + R, X), `controlled_bus_id` (domyślnie szyna regulowana).

Pola liczbowe i wybory (`PoleLiczbowe`, `PoleWyboru`, `PolePrzelacznikBinarny`)
— nie „wielkie suwaki". Widoczność zależna od `regulation_type` (Brak → sekcja
zwinięta; DETC → bez trybu AUTO/setpoint; OLTC → pełny zestaw). Zasilenie z
katalogu `TapChangerItem` przez picker (reużycie).

---

## 4. Mapa konsumpcji „do ostatniego klika" (end-to-end)

| Ogniwo | Konsument | Co czyta | Uwaga |
|--------|-----------|----------|-------|
| A | Solver LF | `TapChanger` → pętla OLTC → `oltc_final_positions` | §2 |
| B | Analiza napięć / profile | wyniki LF (V, ΔU, straty, PQ) po zbieżności pętli | wynik z solvera |
| C | IEC 60909 (SC) | K_T znamionowe (tap-niezależne) | §6, plik WATCHED nietknięty |
| D | Scenariusze (study cases) | własny stan OLTC per scenariusz (start/end pos, licznik przełączeń, limity) | §7 |
| E | Profile roczne | per krok: czas/pozycja/V/licznik/limity/czas poza deadband | §8 |
| F | Wrażliwość | przemiatanie OLTC (min/neutral/max/pełny zakres) | §9 |
| G | OZE | wspólny zbieżny rozpływ OLTC + Q(U)/cosφ(P)/STATCOM/kondensatory | §10 |
| H | Transformatory równoległe | każdy własny `TapChanger`; kontrola spójności przekładni/grup/uk; prądy cyrkulacyjne | §11 |
| I | Walidacje | blokady: poza zakresem, step=0, brak regulatora w AUTO, brak controlledBus, zły zakres, różne przekładnie równoległych | §12 |
| J | SLD | znacznik OLTC/pozycja/AUTO-MAN/setpoint; odświeżenie po obliczeniu | §13 — koordynacja z wątkiem SLD |
| K | Raporty PDF/HTML/Excel | pozycje, ślad regulatora, V przed/po | §14 |
| L | Snapshoty/undo/redo/eksport/import | `TapChanger` w serializacji projektu (deterministycznej) | §15 |
| M | API REST/JSON/CSV/GIS | `TapChanger` w kontraktach (addytywnie) | §16 |
| N | Optymalizacja | OLTC jako zmienna decyzyjna (min. strat / utrzymanie V / min. przełączeń) | §17 |
| O | White Box | pozycja początkowa, decyzje regulatora, powód, V przed/po, deadband | §18 |

---

## 5. Ograniczenia twarde

1. **FROZEN Result API** (`ShortCircuitResult`, `PowerFlowResult`): tylko pola
   addytywne, `exclude_none`, seed determinizmu bez zmian dla payloadów bez OLTC.
2. **WATCHED SC** (`short_circuit_iec60909*.py`, `short_circuit_contributions.py`,
   `protection_engine_v1.py`): `solver_boundary_guard.py` twardo blokuje diff.
   OLTC **nie wymaga** zmian w tych plikach (K_T znamionowe — §6). Nie ruszamy.
3. **Determinizm:** ten sam wejściowy model → identyczny ślad OLTC i wyniki.
4. **Single Model Rule:** jeden `TapChanger` per transformator; brak kopii.
5. **Wątek SLD osobny:** pliki `frontend/src/ui/sld/**`, `sld-editor/**`,
   `engine/sld-layout/**` należą do wątku SLD — konsumpcję J koordynujemy kartą,
   nie edytujemy jednostronnie (kolizja plików zabroniona).

---

## 6. Faza wykonania

| Faza | Zakres | Bramka weryfikacji |
|------|--------|--------------------|
| F0 | Ten dokument + rejestr V12K-045 | docs_guard zielony |
| F1 | Kanoniczny `TapChanger` (domena + ENM), helper przekładni efektywnej, fabryka z katalogu | pytest backend zielony; determinizm LF bez OLTC bez zmian |
| F2 | Pętla OLTC w LF + WHITE BOX + addytywne pola wyniku | pytest backend; determinizm; frozen API |
| F3 | UI kreatora GPZ (sekcja regulacji) + payload + testy realnej ścieżki | vitest; type-check; guardy UI |
| F4 | Konsumpcja downstream (analizy/scenariusze/profile/wrażliwość/OZE/równoległe/walidacje/raporty/snapshoty/API/optymalizacja); SLD kartą do wątku SLD | pełne regresje obu stosów; guardy; determinizm |

Każda faza: pełna regresja właściwej warstwy, type-check/lint, właściwe guardy,
determinizm/hash, commit z opisem, push na `claude/power-network-design-ui-ir91mv`.

---

## 7. Status realizacji (2026-07-19)

**Zrealizowane i zweryfikowane (regresje obu stosów zielone):**

- **F0** — ten dokument + rejestr V12K-045.
- **F1** — kanoniczny `TapChanger` (domena + ENM), helper przekładni efektywnej,
  fabryka z katalogu, projekcja ENM→domena. 17 testów.
- **F2** — pętla OLTC w LF (jeden zaczep/krok, deterministyczna, WHITE BOX),
  addytywne pola wyniku (`white_box_trace`/`raw_result.oltc_control`),
  liczniki przełączeń (`switch_counts`/`total_switch_count`). 10 testów.
- **F3** — kreator GPZ (krok Transformatory): pełny zestaw kontrolek OLTC/DETC
  mapujących 1:1 na backend (`_build_gpz_tap_changer`), API katalogu
  przełączników, walidacja §12. Testy backend + frontend (model + realna ścieżka).
- **F4 (część automatyczna)** — konsumpcja przez warstwę analizy:
  - test integracyjny na poziomie `canonical_analysis` (ENM→mapping→pętla→wynik).
  - **B/D/G/O**: analiza napięć, scenariusze (własny stan OLTC per run: pozycje
    końcowe + liczniki przełączeń), współpraca z OZE (Q(U)/cosφ(P) współzbieżne
    w tej samej pętli LF), White Box — spełnione, bo konsumenci czytają wynik LF
    po zbieżności pętli OLTC.
  - **C (IEC 60909)**: K_T znamionowe (tap-niezależne, §3.3.3) — bez zmian w
    solverze SC (WATCHED), brak podwójnego liczenia.
  - **M (API)**: `oltc_control` w `raw_result`/`power_flow_trace` spływa przez API.

**Do zlecenia — funkcje dedykowane wykraczające poza fundament** (rejestr długu,
Zero-Debt §4 — nie ukryte, z przyczyną i planem):

| Sekcja | Zakres | Przyczyna odłożenia | Plan |
|--------|--------|---------------------|------|
| §8 (E) | Profile roczne per krok czasowy (czas/pozycja/V/licznik/czas poza deadband, wykres pozycja vs czas) | Wymaga dedykowanej analizy szeregów czasowych (iteracja LF po profilu obciążeń) — osobny moduł | Nowa analiza `oltc_annual_profile` czytająca profil obciążeń + pętlę OLTC per krok |
| §9 (F) | Wrażliwość: przemiatanie OLTC (min/neutral/max/pełny zakres) | Feature analizy wrażliwości (sweep pozycji) | Rozszerzenie modułu sensitivity o zmienną `tap_position` |
| §17 (N) | Optymalizacja: OLTC jako zmienna decyzyjna (min. strat / utrzymanie V / min. przełączeń) | Wymaga solvera optymalizacyjnego (brak w repo) | Nowy moduł optymalizacji z OLTC jako zmienną całkowitoliczbową |
| §13 (J) | SLD: znacznik OLTC/pozycja/AUTO-MAN/setpoint, odświeżenie po obliczeniu | Pliki `ui/sld/**` należą do wątku SLD (V12K-060) — kolizja plików zabroniona | Karta do wątku SLD: glif OLTC czytający `tap_changer` + `oltc_control` |
| §14 (K) | Raporty PDF/HTML/Excel: pozycje, ślad regulatora, V przed/po | Rozszerzenie generatora raportu PF (moduł raportowy) | Sekcja OLTC w proof/raporcie PF czytająca `oltc_control` (READ-ONLY) |

Dane dla wszystkich powyższych są już produkowane przez pętlę OLTC
(`oltc_control`: pozycje początkowe/końcowe, liczniki przełączeń, ślad decyzji,
V przed/po per iteracja) — pozostaje warstwa prezentacji/orkiestracji.

---

## 8. Funkcje dedykowane G1–G5 (2026-07-19) — ZREALIZOWANE

Na polecenie właściciela („wykonaj każdą to osobna funkcja dedykowana") rejestr
długu z §7 został domknięty. Silniki liczące działają na warstwie solvera
(orkiestracja wokół FROZEN solvera, ZERO własnej fizyki), są deterministyczne i
WHITE BOX (zwracają wszystkie ocenione punkty), a badania przywracają stan zaczepu.

| Karta | Sekcja | Dostawca | Co dostarcza |
|-------|--------|----------|--------------|
| **G1** | §9 wrażliwość | `power_flow_oltc_studies.sweep_tap_positions` | LF przy każdej stałej pozycji (min..max/pełny zakres); per pozycja: przekładnia, U sterowanej szyny, min/max U, straty [MW]; przywraca stan |
| **G2** | §8 profile roczne | `power_flow_oltc_studies.run_annual_oltc_profile` | Pętla OLTC per krok czasowy (skalowanie obciążeń); per krok: pozycje, liczba przełączeń, U szyny, czy w paśmie nieczułości; sumy przełączeń i kroków poza deadband |
| **G3** | §17 optymalizacja | `power_flow_oltc_studies.optimize_tap_positions` | OLTC jako całkowitoliczbowa zmienna decyzyjna — enumeracja EXACT po zakresie (przestrzeń mała), cele: `minimize_losses` / `maintain_voltage` / `minimize_switching`; deterministyczne rozstrzyganie remisów; brak solvera zewnętrznego nie jest potrzebny. **Kryterium dopuszczalności pozycji jest daną wyniku** (`feasibility_criterion`: rodzaj, wartość, źródło): dla `minimize_switching` to pasmo nieczułości regulatora z MODELU (`TapChanger.deadband_kv`, połowa pasma jak w pętli AVR) wokół napięcia docelowego badania; brak którejkolwiek danej ⇒ wynik NIEDOSTĘPNY (`best_position`/`switch_count` = `null`) + kody gotowości `oltc.deadband_missing` / `oltc.target_voltage_missing`. Żadnego progu zaszytego w kodzie (D6, karta D) |
| **G4** | §14 raporty | `analysis/reporting/oltc_report.py` | Sekcja OLTC raportu PF (JSON/tekst PL/LaTeX) READ-ONLY z `oltc_control`: pozycje pocz./końc., przełączenia, U przed/po |
| **G5** | §13 glif SLD | `docs/uiux/KARTA_KOORDYNACJI_SLD_02_OLTC_GLIF.md` | Karta koordynacyjna do wątku SLD (V12K-060) — kontrakt danych READ-ONLY + specyfikacja glifu; BEZ edycji `ui/sld/**` (kolizja plików zabroniona) |

Testy: `tests/network_model/solvers/test_power_flow_oltc_studies.py` (27),
`tests/analysis/test_oltc_report.py` (5). Wszystkie deterministyczne.

### 8.1 H1 — osiągalność silników przez run API (2026-07-19)

Silniki G1–G3 są osiągalne end-to-end przez istniejący pipeline analiz, bez
duplikacji budowniczego `pf_input`: `canonical_analysis._execute_power_flow`
uruchamia badanie na tym samym `pf_input`, gdy `run.options["oltc_study"]`
jest ustawione (`_run_oltc_study`), i dopina wynik do `raw_result`.

**Kontrakt osiągalności z frontendu** (gotowy, potwierdzony reconem
`api/execution_runs.py` — `request.solver_input` → canonical `options`):

```
createRun(caseId, { analysis_type: "load_flow", solver_input: {
    oltc_study: "sweep" | "annual_profile" | "optimize",
    // opcjonalnie:
    oltc_branch_id, oltc_sweep_positions,          // sweep
    oltc_load_profile: [{label, load_scale}, ...],  // annual_profile
    oltc_objective, oltc_target_kv, oltc_switch_penalty_mw  // optimize
}}) → executeRun(runId) → run.raw_result.oltc_sweep | oltc_annual_profile | oltc_optimization
```

Bez `oltc_study` przebieg jest bez zmian (determinizm zachowany).

### 8.2 H2 — ekran UI badań — ZREALIZOWANE (2026-07-19)

Ekran „Badania regulacji OLTC" (`frontend/src/ui2/wyniki/oltc/`), zakładka
„Regulacja OLTC" w warsztacie Wyniki:
- picker badania (wrażliwość / profil dobowy / optymalizacja) + parametry
  (cel + napięcie docelowe dla optymalizacji; edytor kroków profilu),
- uruchomienie na aktywnym przypadku wg kontraktu 8.1 (`createRun` z
  `solver_input:{oltc_study,...}` → `executeRun` → `getRunResults` →
  `global_results.oltc_*`); ZERO fizyki w UI,
- wizualizacje Recharts: sweep (U sterowanej szyny / straty vs pozycja, dwie
  osie Y) + tabela; profil dobowy (pozycja step-after + U vs krok) + tabela +
  liczniki przełączeń; optymalizacja (KPI pozycja optymalna/startowa/przełączenia
  + tabela kandydatów z podświetleniem wybranej),
- tokeny `--mvd-*` (oba motywy), uczciwe stany zerowe/ładowania/błędu.

Backend: `build_execution_result_set` (PF) dopina `oltc_control`/`oltc_sweep`/
`oltc_annual_profile`/`oltc_optimization` do `global_results` (addytywnie).

Testy: `oltcBadaniaModel.test.ts` (7) + `EkranBadanOltc.test.tsx` (6, realna
ścieżka: klik natywny → run API → render wyniku) + backend
`test_oltc_analysis_integration` (result-set surfacing).

# INWENTARYZACJA FAKTOGRAFICZNA FLOW PROJEKTANTA (2026-07)

Status: materiał wejściowy do audytu (FAKTOGRAFIA, nie projekt). Źródło prawdy: KOD.

## UWAGA WSTĘPNA — pochodzenie faktów (ważne dla czytelnika)

Ten worktree (`worktree-agent-ae480360e9af02677`, HEAD `95d05763` = `main`) **nie zawiera**
katalogu `frontend/src/ui2/` ani `docs/uiux/` — CLAUDE.md tego worktree opisuje stan
projektu z 2026-05 (4 solvery, brak ui2, brak 7 przestrzeni). Cały kod opisany w tym
dokumencie (`ui2/**`, kreatory, canonical_operations.py w zakresie odczytanym poniżej)
został zweryfikowany w **równoległym checkoucie tego samego repozytorium**
(`/home/user/MV-Design-PRO`, branch `claude/power-network-design-ui-ir91mv`,
commit `bc4223ce` — zweryfikowano: `bc4223ce` = tip `origin/claude/power-network-design-ui-ir91mv`,
czyli branch jest wypchnięty na zdalne, nie jest to lokalny WIP). Ścieżki plików podane
niżej jako `mv-design-pro/...` odnoszą się do struktury repo na TYM branchu/commicie —
identycznej struktury katalogów w tym worktree (na `main`) NIE MA. Backend
(`backend/src/domain/canonical_operations.py`) istnieje na OBU branchach i ma identyczną
treść w zakresie sprawdzonym (plik nie jest częścią programu UI/UX, więc nie powinien się
różnić — nie zweryfikowano bajt-po-bajcie, patrz sekcja NIE USTALONO).

Wszystkie odniesienia `plik:linia` poniżej są względem tego stanu (branch
`claude/power-network-design-ui-ir91mv` @ `bc4223ce` dla `frontend/`, ten sam plik
istnieje też w tym worktree dla `backend/src/domain/canonical_operations.py`).

---

## A. MAPA PRZESTRZENI (powłoka ui2, okno W-110)

Rejestr 7 przestrzeni: `frontend/src/ui2/shell/spaces.ts:31-39` (tablica `SPACES`, kolejność
= flow inżyniera: Projekt → Model → Schemat → Gotowość → Obliczenia → Wyniki → Dokumentacja).
Renderowanie/skład: `frontend/src/ui2/AppRoot.tsx:212-316` (funkcja `AppRoot`, prop
`children` przekazywany do `LegacyWarsztat`), most tras: `frontend/src/ui2/legacy/LegacyWarsztat.tsx`.

| Przestrzeń (etykieta PL) | ID | Plik głównego komponentu | Panele składowe | Store'y źródłowe (odczyt) | Odniesienie |
|---|---|---|---|---|---|
| Projekt | `projekt` | `ui2/spaces/projekt/PulpitProjektu.tsx` | `KafelModelu`, `KafelGotowosci`, `KafelOstatniegoPrzebiegu`, `KafelPrzylaczenia`, `KafelSpojnosci`, `KafelWkrotce`, `ListaPrzypadkow` (pliki w `ui2/spaces/projekt/`) | `useSnapshotStore` (`snapshot`, `loading`) — adapter `pulpitAdapter.ts:293-294`; `useSnapshotStore.readiness` — `pulpitAdapter.ts:301,306`; `useExecutionRunsStore.runs` — `pulpitAdapter.ts:316` | `ui2/AppRoot.tsx:266-273`; `ui2/spaces/projekt/pulpitAdapter.ts:9-21,55,57` |
| Model sieci | `model` | `ui2/spaces/model/ModelWarsztat.tsx` | `WlasciwosciModelu.tsx`, `ZgodnoscReferencyjna.tsx`; podkatalogi `katalog/`, `szablony/` (`PrzegladarkaSzablonow.tsx`) | `useAppStateStore` (`activeCaseId`), `useSnapshotStore` (`snapshot`) | `ui2/AppRoot.tsx:228`; `ui2/spaces/model/ModelWarsztat.tsx:15,20,59,63` |
| Schemat (SLD) | `schemat` | BRAK komponentu natywnego ui2 — most do warstwy legacy `ui/sld/v3/canvas/SldCanvasV3Workspace.tsx` przez trasę `#sld` | Kanwa SLD v3 + `AreaContextPanel` (legacy, zamiast `ContextTree` ui2) jako panel kontekstu | store'y legacy: `useNetworkBuildStore`, `useSnapshotStore`, `useSelectionStore` (nie odczytywane wprost przez `AppRoot`, tylko przez most tras) | `ui2/legacy/LegacyWarsztat.tsx:94-109` (trasy `#sld-view`, `ROUTES.SLD.hash`); `ui2/AppRoot.tsx:276-281` (`PanelKontekstuObszaru`) |
| Gotowość | `gotowosc` | `ui2/spaces/gotowosc/PanelGotowosci.tsx` | `SekcjaCelu.tsx`, `SekcjaZgodnosciReferencyjnej.tsx`, `WierszProblemu.tsx` | `useSnapshotStore` (`snapshot`, `loading`, `error`, `readiness`, `fixActions`) | `ui2/AppRoot.tsx:242-257`; `ui2/spaces/gotowosc/adapters/gotowoscAdapter.ts:9,26,39,119-122,135` |
| Obliczenia | `obliczenia` | `ui2/spaces/obliczenia/MenedzerPrzypadkow.tsx` (+ `KartaPrzypadku.tsx`, `NowyPrzypadek.tsx`, `PorownanieKonfiguracji.tsx`, `przebiegi/PrzebiegiPanel.tsx`) | lista przypadków, karta przypadku, formularz nowego przypadku, porównanie konfiguracji, panel przebiegów | `useAppStateStore` (`setActiveCase`), `useStudyCasesStore`, `useExecutionRunsStore` | `ui2/AppRoot.tsx:229-241`; `ui2/spaces/obliczenia/adapters/przypadkiAdapter.ts:14,24,55-56,136` |
| Wyniki i dowody | `wyniki` | `ui2/spaces/wyniki/WynikiWarsztat.tsx` | zakładki natywne: `EkranCoWymagaUwagi`, `EkranRozplywu`, `EkranZwarc`, `EkranJakosci`, `EkranEstymacji`, `EkranSsci`, `EkranOdbioru`, `EkranPorownania`, `DowodPrzebiegu`, `EkranBadanOltc`; zakładka „Pozostałe analizy" = most do `LegacySurface`/`WorkspaceSurfaceRouter` (legacy), którędy osiągalne są `EkranKoordynacji`, `EkranStabilnosci`, `EkranSkladowych`, `EkranStanuFazowego`, `EkranZbieznosci` (patrz `ui/workspace/screenCanonRegistry.ts`) | `useAppStateStore`, `useExecutionRunsStore`, `useStudyCasesStore`, `useShellStore` | `ui2/spaces/wyniki/WynikiWarsztat.tsx:19-48`; `ui2/AppRoot.tsx:258-264` |
| Dokumentacja | `dokumentacja` | `ui2/spaces/dokumentacja/MostDokumentacji.tsx` → `HubDokumentacji.tsx` | hub z kartami raportu/dowodu (dostawcy E-37/E-36 otwierani przez `openRouteSurface`, bez auto-nawigacji) | `useAppStateStore`, `useNetworkBuildStore`, `useExecutionRunsStore`, `useSnapshotStore`, `useShellStore` | `ui2/AppRoot.tsx:265`; `ui2/spaces/dokumentacja/HubDokumentacji.tsx:19-24,209-214` |

Fakt dodatkowy: domyślna przestrzeń przy aktywnym projekcie to **Schemat**, nie Projekt —
`ui2/AppRoot.tsx:116-128` (`domyslnaPrzestrzenUstawiona`, jednorazowe przełączenie na `'schemat'`).

Fakt dodatkowy (rozbieżność dokumentacja vs kod): komentarz w `ui2/shell/AppShell.tsx:9-10`
mówi „ui2 NIE jest importowane z produkcyjnego wejścia aplikacji (App.tsx/main.tsx)" —
to NIEAKTUALNE. `frontend/src/App.tsx:1-2` i `frontend/src/main.tsx` (komentarz „E1.7c: nowa
powłoka (AppRoot) jest jedynym wejściem aplikacji") pokazują, że `AppRoot` (ui2) JEST
produkcyjnym wejściem — `App.tsx` to tylko cienki wrapper motywu.

---

## B. KREATORY (wizards, `ui2/kreatory/`)

Rejestr wiążący operacja→kreator→ekran: `frontend/src/ui/topology/modals/operationSurfaceRegistry.ts:47-301`
(`OPERATION_SURFACE_REGISTRY`, 23 wpisy). 21 katalogów kreatorów + 1 wrapper (`rama`, layout,
bez własnej operacji: `KreatorRama` `kreatory/rama/KreatorRama.tsx:48`, `KreatorSekcja:192`,
`KreatorInfo:205`, `KreatorSiatka:214`).

| Nazwa PL (etykieta rejestru) | Plik (linia `export function`) | Operacja kanoniczna wywoływana | Typ danych formularza | Walidacja przed wysyłką |
|---|---|---|---|---|
| Dodaj źródło zasilania GPZ | `kreatory/zrodlo/KreatorZrodloZasilania.tsx:124` | `add_grid_source_sn` | `GridSourceFormData` | TAK — `zrodlo/zrodloModel.ts:218` `walidujFormularz`, `:315` `walidujOltc` |
| Wyprowadź magistralę SN | `kreatory/magistrala/KreatorMagistralaSn.tsx:115` | `continue_trunk_segment_sn` | `MagistralaFormData` | TAK — `magistrala/magistralaModel.ts:69` |
| Wstaw stację SN/nN | `kreatory/stacja/KreatorStacjiSnNn.tsx:106` | `insert_station_on_segment_sn` | (model stacji) | TAK — `stacja/stacjaModel.ts:222` |
| Dodaj odgałęzienie SN | `kreatory/odgalezienie/KreatorOdgalezienia.tsx:69` | `start_branch_segment_sn` | `OdgaleznieFormData` | TAK — `odgalezienie/odgaleznieModel.ts:51` |
| Wstaw łącznik sekcyjny | `kreatory/lacznik/KreatorLacznikaSekcyjnego.tsx:65` | `insert_section_switch_sn` | `LacznikFormData` | TAK — `lacznik/lacznikModel.ts:37` |
| Domknij pierścień wtórny / Ustaw NOP | `kreatory/pierscien/KreatorPierscienia.tsx:78` | `connect_secondary_ring_sn` + `set_normal_open_point` (jeden kreator, dwie operacje) | `PierscienFormData` | TAK — `pierscien/pierscienModel.ts:67` `walidujDomkniecie`, `:78` `walidujNop` |
| Dodaj odpływ nN | `kreatory/pole-nn/KreatorPolaNn.tsx:44` | `add_nn_outgoing_field` | brak osobnego `Model.ts` | walidacja inline w komponencie (nie wydzielona) |
| Dodaj odbiór nN | `kreatory/odbior/KreatorOdbioruNn.tsx:78` | `add_nn_load` | `OdbiorFormData` | TAK — `odbior/odbiorModel.ts:47` |
| Dodaj baterię kondensatorów SN | `kreatory/kompensator/KreatorKompensatoraSn.tsx:84` | `add_shunt_compensator_sn` (uwaga: brak w backendowym rejestrze `canonical_operations.py` — patrz C.2) | `KompensatorFormData` | TAK — `kompensator/kompensatorModel.ts:34` |
| Dodaj ogranicznik przepięć SN | `kreatory/ogranicznik/KreatorOgranicznikaSn.tsx:84` | `add_surge_arrester_sn` (jw. — brak w rejestrze backendu, patrz C.2) | `OgranicznikFormData` | TAK — `ogranicznik/ogranicznikModel.ts:28` |
| Dodaj źródło PV/BESS/FW z katalogu | `kreatory/zrodlo-oze/KreatorZrodlaOze.tsx:116` | `add_converter_source` | `DerSnFormData` | TAK — `zrodlo-oze/zrodloOzeModel.ts:202` `walidujFormularz`, `:494` `walidujDerSn` |
| Dodaj zabezpieczenie | `kreatory/przekaznik/KreatorPrzekaznika.tsx:59` | `add_relay` | brak osobnego `Model.ts` | walidacja inline |
| Przypisz katalog do elementu | `kreatory/przypisanie-katalogu/KreatorPrzypisaniaKatalogu.tsx:37` | `assign_catalog_to_element` | brak osobnego `Model.ts` | walidacja inline (CatalogPicker) |
| Zmień parametry elementu | `kreatory/edycja-parametrow/KreatorEdycjiParametrow.tsx:53` | `update_element_parameters` | brak osobnego `Model.ts` | walidacja inline |
| Dodaj agregat nN / Dodaj UPS nN | `kreatory/zrodlo-dyspozycyjne/KreatorZrodloDyspozycyjne.tsx:64` | `add_genset_nn` + `add_ups_nn` (jeden kreator, dwie operacje) | `ZrodloDyspozycyjneFormData` | TAK — `zrodlo-dyspozycyjne/zrodloDyspozycyjneModel.ts:80` |
| Dodaj pole SN | `kreatory/pole/KreatorPolaSn.tsx:73` | `add_sn_bay` | `PolaSnFormData` | TAK — `pole/polaSnModel.ts:112` |
| Dodaj transformator SN/nN | `kreatory/transformator/KreatorTransformatoraSnNn.tsx:83` | `add_transformer_sn_nn` | `TransformatorFormData` | TAK — `transformator/transformatorModel.ts:58` |
| Wstaw słup rozgałęźny | `kreatory/slup-odgalezny/KreatorSlupaOdgaleznego.tsx:86` | `insert_branch_pole_on_segment_sn` (brak w rejestrze backendu, patrz C.2) | `SlupOdgaleznyFormData` | TAK — `slup-odgalezny/slupOdgaleznyModel.ts:60` |
| Wstaw złącze kablowe SN (ZK SN) | `kreatory/zksn/KreatorZksn.tsx:100` | `insert_zksn_on_segment_sn` (brak w rejestrze backendu, patrz C.2) | `ZksnFormData` | TAK — `zksn/zksnModel.ts:70` |
| Dodaj przekładnik prądowy / napięciowy | `kreatory/pomiar/KreatorPomiaru.tsx:48` | `add_ct` + `add_vt` (jeden kreator, dwie operacje) | brak osobnego `Model.ts` | walidacja inline |

Uwaga metodyczna: kolumna „Typ danych formularza" podaje nazwę interfejsu i plik, NIE
wypisuje wyczerpująco każdego pola (zbyt duży zakres — patrz NIE USTALONO, poz. 4).

---

## C. OPERACJE KANONICZNE BEZ UI ORAZ UI BEZ OPERACJI (sedno zadania)

### Architektura wykonania — 2 rejestry, 1 realny dyspozytor

- Rejestr dokumentacyjny: `backend/src/domain/canonical_operations.py:53-430` (`CANONICAL_OPERATIONS`,
  **40 wpisów** — komentarz w linii 52 mówi „ALL 39 canonical operations", co jest
  NIEAKTUALNE/błędne wobec faktycznej liczby 40 wpisów w słowniku, zweryfikowano programowo).
- Endpoint `POST /api/v1/domain-ops/execute` (`backend/src/api/domain_operations.py:111-200`)
  używa `CANONICAL_OPERATIONS` wprost, ale **frontend NIGDZIE go nie wywołuje** — zero
  wystąpień `/api/v1/domain-ops` lub `domain-ops/execute` w `frontend/src` (grep). To
  martwy/osierocony endpoint.
- REALNY endpoint produkcyjny: `POST /api/cases/{case_id}/enm/domain-ops`
  (`backend/src/api/enm.py:713-782`), wywoływany przez frontend z
  `frontend/src/ui/topology/domainApi.ts:4,15,228-236` (`executeDomainOp`). Dyspozytor:
  `backend/src/enm/domain_operations.py:7706-7750` (`execute_domain_operation`) + fallback
  `backend/src/enm/domain_operations_v2.py:3917-3947` (`ALL_V2_HANDLERS`).
- Frontendowa biała lista dozwolonych nazw operacji: `frontend/src/types/domainOps.ts:20-81`
  (`CanonicalOpName` / `CANONICAL_OPERATION_NAMES`, **27 wpisów**). Egzekwowana w runtime:
  `frontend/src/ui/topology/domainApi.ts:70-72` (`resolveCanonicalName` → `assertCanonicalOpName`,
  `types/domainOps.ts:89-94` — RZUCA WYJĄTEK dla nazwy spoza listy 27).

### C.1 — Operacje kanoniczne (backend, 40) BEZ ścieżki wykonania z UI

**Poziom 1 — brak handlera w realnym dyspozytorze** (nie da się wykonać przez
`/enm/domain-ops` NAWET pomijając frontend — `dispatcher.unknown_operation`):

| Operacja | Rejestr (linia) | Handler w `_HANDLERS`/`ALL_V2_HANDLERS`? |
|---|---|---|
| `export_project_artifacts` | `canonical_operations.py:411-420` | BRAK — nieobecna w `enm/domain_operations.py:7684-7702` i `enm/domain_operations_v2.py:3917-3947` |
| `run_protection_study` | `canonical_operations.py:421-429` | BRAK — jw. |

**Poziom 2 — handler istnieje w `ALL_V2_HANDLERS` (`enm/domain_operations_v2.py:3917-3947`),
ale frontendowa biała lista (`types/domainOps.ts:53-81`) NIE zawiera tej nazwy → wywołanie
przez `executeDomainOp` rzuci wyjątek w runtime, więc ŻADEN ekran nie może jej wywołać tą
drogą:**

`update_relay_settings`, `link_relay_to_field`, `calculate_tcc_curve`, `validate_selectivity`,
`create_study_case`, `set_case_switch_state`, `set_case_normal_state`, `set_case_source_mode`,
`set_case_time_profile`, `run_short_circuit`, `run_power_flow`, `run_time_series_power_flow`,
`compare_study_cases`, `set_source_operating_mode`, `set_dynamic_profile`, `rename_element`,
`set_label` (17 operacji; `set_connection_conditions` opisana osobno w C.3 — TA operacja
MA realnego wywołującego, mimo tej samej blokady).

Dla części z tych 17 zweryfikowano, że **funkcjonalność istnieje pod inną, nie-kanoniczną
ścieżką REST** (czyli operacja jest tylko wpisem-widmem w `canonical_operations.py`, a
realny mechanizm jest gdzie indziej):

| Operacja (widmo w rejestrze) | Realna ścieżka REST | Realny wywołujący UI |
|---|---|---|
| `run_short_circuit` | `POST /{case_id}/runs/short-circuit` — `enm.py:508` | przycisk „Oblicz" (`handleCalculate`, `ui2/AppRoot.tsx:100`, `ui/App.tsx`-owy odpowiednik legacy) |
| `run_power_flow` | `POST /{case_id}/runs/power-flow` — `enm.py:567` | jw. |
| `create_study_case` | dedykowany endpoint REST — `backend/src/api/study_cases.py:166` (nie odwołuje się w ogóle do `canonical_operations.py` — 0 wystąpień, sprawdzono grepem) | `ui2/spaces/obliczenia/NowyPrzypadek.tsx` |
| `compare_study_cases` | `backend/src/api/study_cases.py:371` (jw., własna ścieżka REST) | `ui2/spaces/obliczenia/PorownanieKonfiguracji.tsx` (nie zweryfikowano 1:1 wywołania — patrz NIE USTALONO) |
| `run_protection_study` (też Poziom 1) | `backend/src/api/protection_runs.py:96,140` (`create_protection_run`, `execute_protection_run`) | ekran ochrony (nie zweryfikowano dokładnego pliku wywołującego — NIE USTALONO) |

Dla pozostałych z tej siedemnastki (`update_relay_settings`, `link_relay_to_field`,
`calculate_tcc_curve`, `validate_selectivity`, `set_case_switch_state`, `set_case_normal_state`,
`set_case_source_mode`, `set_case_time_profile`, `run_time_series_power_flow`,
`set_source_operating_mode`, `set_dynamic_profile`, `rename_element`, `set_label`) — literał
nazwy operacji **nie występuje ani razu** w `frontend/src` (grep, poza jednym wystąpieniem
`rename_element` jako klucz tablicy komunikatów sukcesu w
`frontend/src/ui/topology/operationSuccessMessages.ts:68`, który nie ma żadnego
wywołującego). Istnieją POKREWNE identyfikatory akcji menu kontekstowego o innych nazwach
(`calc_tcc`, `validate_selectivity`, `set_switch_states`, `set_normal_states`,
`set_source_modes`, `edit_label`, `rename` — `frontend/src/ui/context-menu/actionMenuBuilders.ts:168-169,889,1132-1135`),
ale NIE zweryfikowano w budżecie czasu zadania, do jakiego wywołania API prowadzą te
handlery (patrz NIE USTALONO). Traktuję je jako **niepotwierdzone wywołanie kanonicznej
operacji o tej nazwie** — mogą być martwe albo mogą wywoływać inny mechanizm.

### C.2 — Kontrolki UI wywołujące nazwy operacji NIEOBECNE w backendowym rejestrze `CANONICAL_OPERATIONS`

Frontendowa biała lista (`types/domainOps.ts:20-51`, `CanonicalOpName`) zawiera 7 nazw, których
NIE MA w backendowym `canonical_operations.py:53-430` (40 wpisów) — mimo to mają realny
handler w `enm/domain_operations.py`/`domain_operations_v2.py` i realne kreatory/wywołania,
więc funkcjonalnie DZIAŁAJĄ, ale poza „kanonicznym" rejestrem dokumentacyjnym:

| Nazwa operacji (UI) | Plik UI wywołujący | Handler backendowy | Obecna w `CANONICAL_OPERATIONS`? |
|---|---|---|---|
| `append_station_on_endpoint` | `types/domainOps.ts:25` (typ), most tras `ui2/AppRoot.tsx` | `enm/domain_operations.py:7702` | NIE |
| `insert_branch_pole_on_segment_sn` | kreator `KreatorSlupaOdgaleznego` — `operationSurfaceRegistry.ts:257-267` | `enm/domain_operations.py:7688` | NIE |
| `insert_zksn_on_segment_sn` | kreator `KreatorZksn` — `operationSurfaceRegistry.ts:268-278` | `enm/domain_operations.py:7689` | NIE |
| `add_gpz_section` | edytor `StationCard` (komentarz `types/domainOps.ts:46-49`) | `enm/domain_operations.py:7699` | NIE |
| `update_gpz_section` | jw. | `enm/domain_operations.py:7700` | NIE |
| `delete_gpz_section` | jw. | `enm/domain_operations.py:7701` | NIE |
| `refresh_snapshot` | techniczne odświeżenie (`snapshotStore.ts:328,424`) | `enm/domain_operations.py:7698` | NIE (oczekiwane — nie jest mutacją domeny) |

### C.3 — NAJWAŻNIEJSZE ZNALEZISKO: realny formularz UI wywołujący operację, którą frontendowa biała lista ODRZUCA w runtime

Kafel „Warunki przyłączenia i bilans mocy" na pulpicie projektu
(`frontend/src/ui2/spaces/projekt/KafelPrzylaczenia.tsx:33-80`, formularz
`FormularzWarunkowOsd`) po kliknięciu „Zapisz" wywołuje:

```
frontend/src/ui2/spaces/projekt/KafelPrzylaczenia.tsx:66-70
  executeDomainOperation(activeCaseId, 'set_connection_conditions', payload)
```

- `set_connection_conditions` JEST w backendowym rejestrze:
  `backend/src/domain/canonical_operations.py:403-410`.
- MA handler: `backend/src/enm/domain_operations_v2.py:3946`.
- `executeDomainOperation` (store) woła `executeDomainOp`
  (`frontend/src/ui/topology/snapshotStore.ts:266-278,273` →
  `frontend/src/ui/topology/domainApi.ts:228-236`), który na linii 234 woła
  `resolveCanonicalName(opName)` → `assertCanonicalOpName` (`domainApi.ts:70-72`).
- `assertCanonicalOpName` (`types/domainOps.ts:89-94`) rzuca
  `Niekanoniczna nazwa operacji: set_connection_conditions`, ponieważ
  `'set_connection_conditions'` **NIE występuje** w liście `CANONICAL_OPERATION_NAMES`
  (`types/domainOps.ts:53-81`, 27 wpisów — sprawdzono brak tej nazwy).

**Wniosek faktograficzny**: przy realnym kliknięciu „Zapisz" w tym formularzu w
działającej aplikacji ścieżka produkcyjna rzuci wyjątek JS w `executeDomainOp` (nazwa
operacji zostanie odrzucona, zanim dojdzie do żądania sieciowego).

Test `frontend/src/ui2/spaces/projekt/__tests__/pulpitProjektu.test.tsx:168`
(`expect(executeDomainOperation).toHaveBeenCalledWith('case-1', 'set_connection_conditions', ...)`)
**mockuje** `executeDomainOperation` na poziomie store'u, więc nie przechodzi przez
`assertCanonicalOpName` — test nie wykrywa tej awarii (wzorzec „test maskujący defekt
produktu" z `CLAUDE.md` §Zero-Debt tego repo).

### C.4 — Kontrolka menu kontekstowego wskazująca na nieistniejący handler

`frontend/src/ui/context-menu/actionMenuBuilders.ts:889`:
```
action('rename', 'Zmień nazwę...', { enabled: edit, handler: handlers.onRename }),
```
`onRename` — **0 innych wystąpień** w całym `frontend/src` (grep: brak deklaracji typu,
brak implementacji, brak przypisania). Jedyne miejsce w repo, gdzie ten identyfikator się
pojawia, to właśnie ten odczyt właściwości.

---

## D. KODY GOTOWOŚCI (`READINESS_CODES`) W UI

`READINESS_CODES` (`backend/src/domain/canonical_operations.py:487-930`) ma **42 kody**
(zweryfikowano programowo — nie 37 jak wstępnie zakładano w poleceniu zadania), każdy z
polami `fix_action_id` i `fix_navigation`.

### Globalne ustalenie: cały rejestr `READINESS_CODES` jest MARTWY

- Backend: `READINESS_CODES` (słownik) ma **0 odwołań** w `backend/src` poza plikiem
  własnej definicji (grep `READINESS_CODES\[|READINESS_CODES\.get` — brak wyników poza
  `canonical_operations.py`). Żaden endpoint API go nie zwraca.
- Frontend: **0 wystąpień** jakiejkolwiek wartości `fix_action_id` z tego rejestru
  (`fix_source_voltage`, `fix_add_source`, `fix_trunk_terminal`, `fix_station_type`,
  `fix_transformer_catalog`, `fix_oze_transformer`, `fix_ring_nop`, `fix_protection_ct`,
  `fix_catalog_select`, `fix_pv_transformer`, `fix_bess_transformer` i pozostałe —
  sprawdzono grepem po całym `frontend/src`, zero trafień).
- Guard `scripts/readiness_codes_guard.py:1-36` **waliduje tylko kształt** rejestru
  (obecność 24 wymaganych kodów, pola `message_pl`/`priority`/`level`/`fix_action_id`/
  `fix_navigation`, brak duplikatów) — NIE sprawdza, czy rejestr jest gdziekolwiek
  konsumowany. CI jest zielone mimo że rejestr jest martwy.
- Realny, działający mechanizm gotowości/napraw jest INNY: `backend/src/domain/readiness_fix_actions.py`
  (485 linii, funkcja `resolve_fix_action:26`, prywatne fabryki `_fix_*` linie 50-305,
  `check_blocker_fix_action_coverage:444`) + `backend/src/enm/fix_actions.py` (typ `FixAction`),
  konsumowany przez `backend/src/application/eligibility_service.py`. Odpowiedź API niesie to
  jako pole `fix_actions` (kontrakt `OperationResponseContract.fix_actions` —
  `canonical_operations.py:975`), które faktycznie trafia do UI:
  `ui2/spaces/gotowosc/adapters/gotowoscAdapter.ts:26` („dowiązuje realny `fix_action` z
  `useSnapshotStore.fixActions`"). Kody w TYM systemie mają inną przestrzeń nazw
  (`ELIG_SC1_MISSING_Z0`, `ELIG_SC3_SOURCE_NO_SC_PARAMS`, `line.missing_catalog`,
  `branch_point.invalid_parent_medium` itd. — `frontend/src/ui/engineering-readiness/fixActionRouting.ts:3-25`)
  i NIE pokrywają się 1:1 z kodami `READINESS_CODES` (np. `trunk.catalog_missing` vs
  `line.missing_catalog` — podobna semantyka, różny identyfikator).

### Tabela: wszystkie 42 kody `READINESS_CODES` i ich (brak) obsługi w UI

Kolumna „Obsłużony w UI" jest jednolicie NIE dla `fix_action_id` z tego konkretnego
rejestru (patrz ustalenie globalne wyżej) — kolumna „Realny odpowiednik" wskazuje, gdzie
(jeśli wiadomo) podobny problem jest faktycznie zgłaszany przez działający system
`readiness_fix_actions.py`/`eligibility_service.py`; „nie ustalono" = nie sprawdzono w
budżecie zadania.

| Kod (`canonical_operations.py`, linia) | Poziom | `fix_action_id` | Obsłużony w UI (ten rejestr) | Realny odpowiednik (inny system) |
|---|---|---|---|---|
| `source.voltage_invalid` (489) | BLOCKER | `fix_source_voltage` | NIE | nie ustalono |
| `source.sk3_invalid` (498) | BLOCKER | `fix_source_sk3` | NIE | `ELIG_SC3_SOURCE_NO_SC_PARAMS` (`fixActionRouting.ts:12`, przypuszczalnie) |
| `source.grid_supply_missing` (507) | BLOCKER | `fix_add_source` | NIE | `missing_source`/`missing_generator` (`fixActionRouting.ts:4,21`, przypuszczalnie) |
| `source.connection_missing` (516) | BLOCKER | `fix_source_connection` | NIE | nie ustalono |
| `trunk.terminal_missing` (526) | BLOCKER | `fix_trunk_terminal` | NIE | nie ustalono |
| `trunk.segment_missing` (535) | BLOCKER | `fix_trunk_segment` | NIE | nie ustalono |
| `trunk.segment_length_missing` (544) | BLOCKER | `fix_segment_length` | NIE | nie ustalono |
| `trunk.segment_length_invalid` (553) | BLOCKER | `fix_segment_length` | NIE | nie ustalono |
| `trunk.catalog_missing` (562) | BLOCKER | `fix_line_catalog` | NIE | `line.missing_catalog`/`line.missing_impedance` (`fixActionRouting.ts:5,16`, podobna semantyka) |
| `station.type_invalid` (572) | BLOCKER | `fix_station_type` | NIE | nie ustalono |
| `station.voltage_missing` (581) | BLOCKER | `fix_station_voltage` | NIE | nie ustalono |
| `station.nn_outgoing_min_1` (590) | WARNING | `fix_station_outgoing` | NIE | nie ustalono |
| `station.required_field_missing` (599) | BLOCKER | `fix_station_field` | NIE | nie ustalono |
| `transformer.catalog_missing` (609) | BLOCKER | `fix_transformer_catalog` | NIE | nie ustalono |
| `transformer.connection_missing` (618) | BLOCKER | `fix_transformer_connection` | NIE | nie ustalono |
| `nn.bus_missing` (628) | BLOCKER | `fix_nn_bus` | NIE | nie ustalono |
| `nn.main_breaker_missing` (637) | BLOCKER | `fix_nn_breaker` | NIE | nie ustalono |
| `oze.transformer_required` (647) | BLOCKER | `fix_oze_transformer` | NIE | `bess.missing_transformer` (`fixActionRouting.ts:20`, podobna semantyka) |
| `oze.nn_bus_required` (656) | BLOCKER | `fix_oze_nn_bus` | NIE | nie ustalono |
| `oze.card_field_not_accepted` (665) | BLOCKER | `fix_oze_card_field_acceptance` | NIE | nie ustalono |
| `ring.endpoints_missing` (678) | BLOCKER | `fix_ring_endpoints` | NIE | nie ustalono |
| `ring.nop_required` (687) | BLOCKER | `fix_ring_nop` | NIE | `ring.not_configured` (`fixActionRouting.ts:24`, podobna semantyka) |
| `protection.ct_required` (697) | BLOCKER | `fix_protection_ct` | NIE | nie ustalono |
| `protection.vt_required` (706) | BLOCKER | `fix_protection_vt` | NIE | nie ustalono |
| `protection.settings_incomplete` (715) | WARNING | `fix_protection_settings` | NIE | nie ustalono |
| `protection.nominal_current_missing` (728) | WARNING | `fix_protection_nominal_current` | NIE | nie ustalono |
| `protection.fault_current_missing` (739) | WARNING | `fix_protection_run_short_circuit` | NIE | nie ustalono |
| `earthing.electrode_data_missing` (752) | WARNING | `fix_earthing_electrode` | NIE | nie ustalono |
| `study_case.missing_base_snapshot` (762) | BLOCKER | `fix_case_snapshot` | NIE | nie ustalono |
| `analysis.blocked_by_readiness` (771) | BLOCKER | `None` (brak) | NIE | — (brak akcji z definicji) |
| `catalog.ref_required` (781) | BLOCKER | `fix_catalog_select` | NIE | `ELIG_SC3_MISSING_CATALOG_REF` (`fixActionRouting.ts:13`, podobna semantyka) |
| `import.catalog_mapping_required` (791) | BLOCKER | `fix_import_catalog_mapping` | NIE | nie ustalono |
| `catalog.binding_version_missing` (804) | BLOCKER | `fix_catalog_version` | NIE | nie ustalono |
| `catalog.binding_missing` (817) | BLOCKER | `fix_catalog_binding` | NIE | nie ustalono |
| `catalog.materialization_failed` (830) | BLOCKER | `fix_catalog_rematerialize` | NIE | nie ustalono |
| `oze.pv_no_transformer` (840) | BLOCKER | `fix_pv_transformer` | NIE | `pv.control_mode_missing` (`fixActionRouting.ts:23`, częściowo pokrewne) |
| `oze.bess_no_transformer` (853) | BLOCKER | `fix_bess_transformer` | NIE | `bess.missing_transformer` (`fixActionRouting.ts:20`) |
| `apparatus.sn_catalog_missing` (867) | BLOCKER | `fix_apparatus_sn_catalog` | NIE | nie ustalono |
| `apparatus.nn_catalog_missing` (880) | BLOCKER | `fix_apparatus_nn_catalog` | NIE | nie ustalono |
| `load.catalog_missing` (894) | WARNING | `fix_load_catalog` | NIE | nie ustalono |
| `load.power_zero` (907) | WARNING | `fix_load_power` | NIE | nie ustalono |
| `nn.cable_catalog_missing` (917) | WARNING | `fix_nn_cable_catalog` | NIE | nie ustalono |

---

## E. ŚCIEŻKA OD WYNIKU DO DECYZJI (pętla „popraw w modelu")

Rejestr wzorca ogólnego: `frontend/src/ui2/wyniki/wzorzec/akcjeNaprawcze.ts:1-109`
(`AKCJA_GENERYCZNA` = selekcja + zoom SLD + przejście do przestrzeni „Schemat", hook
`usePoprawWModelu.ts`). Plik dokumentuje explicite (linie 10-38) źródła werdyktów i
świadomie WYKLUCZONE przypadki.

| Ekran wyników | Pętla do modelu? | Mechanizm | Odniesienie |
|---|---|---|---|
| Jakość (napięcie, obciążalność gałęzi/transformatora, migotanie) | TAK — „Popraw w modelu" (generyczna: selekcja + SLD) | `akcjeNaprawcze.ts:71-75,96-99` (`AKCJA_GENERYCZNA`), zużywane przez `wyniki/wzorzec/TabelaWynikow.tsx` w ekranach `EkranJakosci` | `ui2/wyniki/jakosc/EkranJakosci.tsx` |
| Bilans mocy biernej (jakość) | TAK — akcja KONTEKSTOWA, inna niż generyczna: otwiera okno „Dobór kompensacji" (zakładka `kompensacja` przestrzeni Wyniki) | `akcjeNaprawcze.ts:83-87,100` (`AKCJA_DOBOR_KOMPENSACJI`) | j.w. |
| Rozpływ mocy (napięcie w tabeli gałęzi/szyn) | TAK — jw. wzorzec generyczny | `ui2/wyniki/rozplyw/TabelaGalezi.tsx`, `TabelaSzyn.tsx` (import `usePoprawWModelu`) | grep potwierdza import w obu plikach |
| Odbiory (pomiar U) | TAK — jw. wzorzec generyczny | `ui2/wyniki/odbior/EkranOdbioru.tsx` (import `usePoprawWModelu`) | jw. |
| Bilans strat (LOSS_BUDGET) | **NIE — jawnie wyłączone z projektu** | `akcjeNaprawcze.ts:21-22`: „agregat systemowy bez elementu modelu — przycisk decyzji w ogóle się nie renderuje" | `ui2/wyniki/wzorzec/akcjeNaprawcze.ts:21-22` |
| Zwarcia (SC) | CZĘŚCIOWO — „Pokaż na schemacie" (nawigacja/lokalizacja + wczytanie overlayu rozpływu zwarciowego), NIE jest to ramowane jako akcja naprawcza | `ui2/wyniki/zwarcia/pokazNaSchemacie.ts:36-68` (`usePokazZwarcieNaSchemacie`) | j.w. |
| Dowód (proof, kroki) | CZĘŚCIOWO — przycisk „Pokaż na schemacie" per krok (tylko selekcja elementu, bez ramowania naprawczego) | `ui2/wyniki/dowod/KrokDowodu.tsx:66-70,79-88` | j.w. |
| Koordynacja zabezpieczeń | NIE znaleziono pętli (brak `selectElement`/`centerSldOnElement`/`navigateToSld`/`setActiveSpace('schemat')` w katalogu — potwierdzono bezpośrednim odczytem `EkranKoordynacji.tsx`) | ślepy wynik | `ui2/wyniki/koordynacja/EkranKoordynacji.tsx` |
| Stabilność (RMS) | NIE znaleziono pętli (potwierdzono bezpośrednim odczytem `EkranStabilnosci.tsx`) | ślepy wynik | `ui2/wyniki/stabilnosc/EkranStabilnosci.tsx` |
| Składowe symetryczne | NIE znaleziono pętli (grep katalogu, brak dopasowań) | ślepy wynik (nie potwierdzono odczytem pliku — patrz NIE USTALONO) | `ui2/wyniki/skladowe/` |
| Stan fazowy SN | jw. — brak dopasowań w grepie katalogu | ślepy wynik (nie potwierdzono odczytem) | `ui2/wyniki/stan-fazowy/` |
| Zbieżność (convergence) | jw. — brak dopasowań w grepie katalogu | ślepy wynik (nie potwierdzono odczytem) | `ui2/wyniki/zbieznosc/` |
| Porównanie (A/B) | jw. — brak dopasowań w grepie katalogu | ślepy wynik (nie potwierdzono odczytem) | `ui2/wyniki/porownanie/` |
| SSCI | jw. — brak dopasowań w grepie katalogu | ślepy wynik (nie potwierdzono odczytem) | `ui2/wyniki/ssci/` |
| Estymacja stanu (WLS) | jw. — brak dopasowań w grepie katalogu | ślepy wynik (nie potwierdzono odczytem) | `ui2/wyniki/estymacja/` |
| Badania OLTC | jw. — brak dopasowań w grepie katalogu | ślepy wynik (nie potwierdzono odczytem) | `ui2/wyniki/oltc/` |

Uwaga: wiersze oznaczone „nie potwierdzono odczytem" zostały ustalone WYŁĄCZNIE przez
grep całego drzewa `ui2/wyniki/` (wzorzec `setActiveSpace\('schemat'\)|centerSldOnElement|
selectElement|navigateToSld|pokazNaSchemacie`) bez ich dopasowania — nie jest wykluczone,
że stosują inny, nierozpoznany wzorzec nazewnictwa nawigacji.

---

## F. STANY ZEROWE I BŁĘDY

| Przestrzeń / ekran | Komunikat stanu pustego | Mówi CO zrobić? | Odniesienie |
|---|---|---|---|
| Gotowość (brak aktywnego projektu) | „Nie otwarto projektu" + „Otwórz projekt, aby zobaczyć kontrolę gotowości." | TAK | `ui2/spaces/gotowosc/strings.ts:18-19` |
| Gotowość (cel bez braków) | „Brak braków w tym celu." | Nie dotyczy (stan pozytywny, nie błąd) | `ui2/spaces/gotowosc/strings.ts:44` |
| Gotowość (zgodność referencyjna, brak przypadku) | „Wybierz zakres obliczeń, aby zobaczyć ocenę zgodności referencyjnej." | TAK | `ui2/spaces/gotowosc/strings.ts:64` |
| Gotowość (zgodność referencyjna, brak pakietów) | „Brak pakietów referencyjnych do oceny." | NIE (sam fakt, bez akcji) | `ui2/spaces/gotowosc/strings.ts:67` |
| Obliczenia (lista przypadków pusta) | „Brak przypadków obliczeniowych" (sam komunikat, bez akcji w treści) | NIE w treści komunikatu — ALE przycisk „Nowy przypadek" jest zawsze widoczny osobno na tym samym ekranie (poza warunkiem pustej listy) | komunikat: `ui2/spaces/obliczenia/strings.ts:38`; render warunkowy: `ui2/spaces/obliczenia/MenedzerPrzypadkow.tsx:126-131`; przycisk zawsze widoczny: `MenedzerPrzypadkow.tsx:121` (`T.nowyPrzypadek`) |
| Obliczenia (tworzenie przypadku bez projektu) | „Otwórz projekt, aby utworzyć przypadek." | TAK | `ui2/spaces/obliczenia/strings.ts:89` |
| Wyniki (porównanie bez projektu) | „Otwórz projekt, aby porównywać przebiegi obliczeń." | TAK | `ui2/spaces/wyniki/strings.ts:29` |
| Schemat (SLD, kanwa pusta) | „Wybierz wariant GPZ i rozpocznij ciąg SN" + rozwinięty opis kroków („Zacznij od kompletnego układu GPZ (...) Potem wyprowadź odcinek katalogowy i zakończ go stacją, ZK SN, słupem rozgałęźnym albo kolejnym węzłem ciągu.") | TAK, ze szczegółowym opisem kolejnych kroków | `ui/sld/v3/canvas/SldCanvasV3Workspace.tsx:1713-1719` |
| Model sieci | nie ustalono w budżecie zadania | — | — |
| Dokumentacja | nie ustalono w budżecie zadania | — | — |
| Projekt (pulpit, kafle bez danych) | nie ustalono w budżecie zadania (kafle takie jak `KafelWkrotce.tsx` sugerują istnienie stanu „wkrótce", nie zweryfikowano treści) | — | `ui2/spaces/projekt/KafelWkrotce.tsx` (nazwa pliku, treść nieodczytana) |

---

## NIE USTALONO

1. **Dokładny tekst i jakość (czy mówi „co zrobić") pustego stanu dla przestrzeni „Model
   sieci" i „Dokumentacja"** oraz dla poszczególnych kafli pulpitu projektu poza
   opisanymi w tabeli F — nie zweryfikowano w dostępnym budżecie czasu.
2. **Realna ścieżka wywołania (jeśli istnieje) dla operacji**: `update_relay_settings`,
   `link_relay_to_field`, `calculate_tcc_curve`, `validate_selectivity`,
   `set_case_switch_state`, `set_case_normal_state`, `set_case_source_mode`,
   `set_case_time_profile`, `run_time_series_power_flow`, `set_source_operating_mode`,
   `set_dynamic_profile`, `rename_element`, `set_label` — potwierdzono TYLKO że literał
   nazwy kanonicznej nigdzie nie występuje we frontendzie i że frontendowa biała lista by
   go odrzuciła w runtime; NIE zweryfikowano wyczerpująco, czy każda z tych operacji ma
   funkcjonalny odpowiednik pod inną nazwą/endpointem (zweryfikowano to tylko dla
   `run_short_circuit`, `run_power_flow`, `create_study_case`, `compare_study_cases`,
   `run_protection_study`, `export_project_artifacts`).
3. **Docelowe wywołanie API** dla identyfikatorów akcji menu kontekstowego `calc_tcc`,
   `validate_selectivity`, `set_switch_states`, `set_normal_states`, `set_source_modes`,
   `edit_label`, `rename` (`ui/context-menu/actionMenuBuilders.ts`) — handlery są
   przekazywane z góry (`handlers.xxx`), nie prześledzono do konkretnej implementacji i
   wywołania REST/domain-ops w budżecie zadania.
4. **Wyczerpująca lista pól (required/optional) dla każdego z 21 kreatorów** — podano
   tylko nazwę typu `FormData` i plik walidatora (sekcja B); pełne wypisanie pól
   przekraczało budżet zadania.
5. **Relacja między worktree tego zadania a branchem źródła faktów.** Ten worktree
   (`main` @ `95d05763`) nie zawiera `ui2/`; wszystkie fakty A–F pochodzą z równoległego
   checkoutu na branchu `claude/power-network-design-ui-ir91mv` (potwierdzono: tip tego
   brancha na `origin` = `bc4223ce`, ten sam commit widoczny w checkoucie). Nie
   zweryfikowano, kiedy/czy ten branch zostanie zmergowany do `main`, ani czy dokładnie
   commit `bc4223ce` jest tym, który architekt uzna za wiążący do dalszego audytu.
   `backend/src/domain/canonical_operations.py` istnieje identycznie nazwany w OBU
   branchach (odczytany z tego worktree), ale nie porównano go bajt-po-bajcie z wersją na
   `claude/power-network-design-ui-ir91mv` — zakładam identyczność (plik nie jest częścią
   programu UI/UX), nie jest to potwierdzone.
6. **Przyczyna rozbieżności** komentarza „ALL 39 canonical operations"
   (`canonical_operations.py:52`) wobec faktycznych 40 wpisów słownika — nie ustalono, czy
   komentarz jest przestarzały, czy któryś wpis został dodany bez aktualizacji komentarza.
7. **Dokładne dopasowanie 1:1** między kodami `READINESS_CODES` a kodami rzeczywistego
   systemu `readiness_fix_actions.py`/`fixActionRouting.ts` — w tabeli D podano kilka
   par o „podobnej semantyce" na podstawie nazw, ale nie zweryfikowano, że backend
   faktycznie emituje oba kody dla tego samego stanu sieci.
8. **`PorownanieKonfiguracji.tsx`** (obliczenia) — nie zweryfikowano bezpośrednim
   odczytem, czy wywołuje `compare_study_cases` czy inny endpoint.

# UIUX_SLD_REDESIGN_EXECUTION.md

**Data:** 2026-04-30
**Branch:** `claude/industrial-system-architecture-3vOUj`
**Status:** WDROŻONE — Faza 1 (twardnienie domeny) + Faza 2 częściowa (chain hashy)
**Powiązane:** `UIUX_SCREEN_AUDIT_AND_REDESIGN_EXECUTION.md` (D-001..D-005, 2026-04-29)

---

## 1. Skan repozytorium — co znaleziono

Trzy agenty Explore zmapowały frontend, backend i testy/strażniki. Najważniejsze ustalenie: redesign UI/UX z zewnętrznego briefu jest w 80–90 % już WDROŻONY w `UIUX_SCREEN_AUDIT_AND_REDESIGN_EXECUTION.md`. Faktyczne luki są domenowe, nie wizualne.

**Co już działa (nie ruszane):**
- `frontend/src/ui/layout/CanonicalLayout.tsx` — flex shell z TopBar 48 px + WorkflowContextStrip 28 px (D-001..D-005)
- `frontend/src/ui/sld/core/topologyAdapter.ts` — deterministic Symbols → VisualGraph
- `frontend/src/ui/sld/core/sldSemanticAdapter.ts` — semantic adapter, ciągłość przez stację przelotową w FE
- `frontend/src/ui/inspector-panel/InspectorResolver.tsx` + `SemanticInspectorCard.tsx` — Karta semantyczna jako pierwsza zakładka
- `frontend/src/ui/engineering-semantic/semanticContextActions.ts` — menu wyprowadzane z polityki, nie z lokalnych list
- `frontend/src/ui/network-build/forms/catalogFirstRules.ts` — `checkCatalogGate()` w FE
- 15 z 17 testów z briefu już istniało; ścieżka end-to-end pusty projekt → raport działa

**Co było luką:**
1. Backend nie egzekwował portów/ról domeny (gałąź SN do szyny nN przechodziła)
2. `Generator.connection_variant` był enumem bez walidacji refów
3. Katalog-first miękki w domenie (twardy dopiero w `eligibility_service`)
4. Jednolity ENM hash bez różnicowego unieważniania
5. Wyniki solverów kluczują po UUID, nie po `ref_id`
6. Polot wizualny vs render referencyjny: legenda, mini-mapa z viewportem, mode selector, hash w pasku statusu

---

## 2. Decyzje samodzielne

Pełna ścieżka 1+2+3 z planu (`/root/.claude/plans/pracujesz-jako-g-wny-architekt-curried-zephyr.md`) zatwierdzona przez użytkownika. W tej iteracji wykonana Faza 1 + większość Fazy 2.

Pięć wpisów dodanych do `REJESTR_DECYZJI_SEMANTYCZNYCH.md`:
- **V12S-007** — Domena egzekwuje pasma napięciowe na końcach gałęzi i ciągłość SN przez stację przelotową.
- **V12S-008** — Generator.connection_variant walidowany krzyżowo z station_ref/blocking_transformer_ref.
- **V12S-009** — Katalog-first hard w action envelope, soft w modelu (draft=True tworzy LogicalSketch).
- **V12S-010** — Split jednolitego ENM hash na pięć ortogonalnych: semantic / input / case / variant / switching_snapshot.
- **V12S-011** — Wyniki solverów niosą `element_ref_id` (zaplanowane, nie wdrożone w tej iteracji).

---

## 3. Wdrożone commity (5 z planowanych 11)

| # | Commit | Zakres |
|---|---|---|
| 1+2 | `ef8c73b` | V12S-007: validator E020 (pasmo napięciowe) + E021 (ciągłość SN), `DomainInvariantError`, naprawa fixtur, 12 testów |
| 3 | `7518559` | V12S-008: Pydantic `model_validator` na `Generator`, 14 testów |
| 4 | `4a9d9e1` | V12S-009: gate katalogowy w `action_envelope.py` dla `cable`/`line_overhead`, 4 testy |
| 5 | `2cb2934` | V12S-010: pięć ortogonalnych hashy w `enm/hash.py`, 5 nowych pól w `ENMHeader`, 18 testów |

**Łącznie:** 4348 testów backendu PASS, 0 regresji, dwa kluczowe strażniki (semantic_architecture_guard, pcc_zero_guard) PASS.

---

## 4. Zmiany pliku po pliku

### Backend
- `backend/src/enm/exceptions.py` (NOWY) — `DomainInvariantError`
- `backend/src/enm/validator.py` — `_voltage_band` helper, `_check_voltage_band_consistency` (E020), `_check_through_station_continuity` (E021)
- `backend/src/enm/models.py` — Pydantic `model_validator` na `Generator` (V12S-008), 5 nowych pól w `ENMHeader` (V12S-010)
- `backend/src/enm/hash.py` — pełna przebudowa: 5 ortogonalnych funkcji + zachowane stare `compute_enm_hash`
- `backend/src/network_model/core/action_envelope.py` — `_CATALOG_REQUIRED_BRANCH_KINDS` + gate katalogowy w `_validate_payload_values`

### Testy backendu (NOWE)
- `backend/tests/enm/test_voltage_band_endpoint_validation.py` — 8 testów
- `backend/tests/enm/test_through_station_continuity_domain.py` — 4 testy
- `backend/tests/enm/test_generator_connection_variant_validation.py` — 14 testów
- `backend/tests/enm/test_hash_chain_split.py` — 18 testów
- `backend/tests/test_action_envelope.py` — 4 dodane (V12S-009)

### Naprawione fixtury
- `backend/tests/enm/golden_network_fixture.py` — 4 nowe SN szyny pomocnicze, 4 kable OZE z MV→nN na MV→MV
- `backend/tests/enm/test_fix_action_generation.py` — `_golden_enm()` przerobione (linia SN→SN, transformator SN→nN)

### Dokumentacja
- `docs/v12xx/REJESTR_DECYZJI_SEMANTYCZNYCH.md` — V12S-007..V12S-011

---

## 5. Backlog — to, czego ta iteracja NIE wdrożyła

### Faza 2 — pozostałe
- **Commit 6 (V12S-011): `element_ref_id` w wynikach solverów.** Wymaga rozszerzenia `backend/src/application/result_mapping/`, dodania pola w `ShortCircuitResult` / `PowerFlowNewtonSolution` (additive, default `None`), update `backend/schemas/resultset_v1_schema.json`, rozszerzenie `scripts/resultset_v1_schema_guard.py`. **Powód odłożenia:** zakres zmian + kontekst sesji. **Wpływ na produkt:** FE już dziś robi UUID lookup — nie blokuje raportów. Hash chain (V12S-010) jest dostępny niezależnie.

### Faza 3 — polot wizualny (commits 7-10)
Wszystkie odłożone z powodu konieczności wizualnej weryfikacji w przeglądarce, której CLI nie zapewnia wiarygodnie:

- **Commit 7:** `AppShellV12.tsx` — segmentowany selektor trybu pracy TE/TW/TZ/TP/TA/TN (32 px) + summary strip (40 px) z chipami `Faza projektu BUDOWA`, `Blokery N`, `Gotowość N%`, licznikami `Elementy/Pola SN/Stacji/Długość/Transformatory/Odbiory nN`.
- **Commit 8:** `StatusBarV12.tsx` — `Migawka` (selektor S0007 z timestampem), `Run` (R000127), `Hash` (skrócony `a7f3c9d2`), prawa strefa: `Walidacja N`, `OK 118 i 5`, `Sieć OK 126 elem.`. `WorkflowContextStrip.tsx` — panel **„Następna akcja"** (`N elementów wymaga uzupełnienia danych | Pokaż`).
- **Commit 9:** `LegendPanel.tsx` — pasma napięciowe + 6 symboli + stany gotowości (Gotowe / Częściowo / Nie gotowe). `SldSemanticMinimap.tsx` — viewport rect overlay z drag-to-pan.
- **Commit 10:** `InspectorResolver.tsx` — trzy sekcje rozwijalne (Karta semantyczna pinowana / Inspektor techniczny / Zabezpieczenia), `dataQualityState` chips na każdym polu. `IndustrialAesthetics.ts` — denser tokens (padding 16→12 px, line-height 1.45→1.3, font 13→12 px etykiet).

### Faza 3 — testy frontend (część)
- `sld-updates-after-domain-operation.test.tsx` (NOWY)
- Rozszerzenie `SldSemanticMinimap.test.tsx` o viewport overlay
- Rozszerzenie `StatusBarV12.test.tsx` o hash chain + readiness chip
- `EngineeringReasoning.test.tsx` (NOWY)
- `LegendPanel.test.tsx` (NOWY)
- `ModeSelector.test.tsx` (NOWY)
- `WorkflowContextStrip.nextAction.test.tsx` (NOWY)
- `e2e/generator-connection-variants.spec.ts` (NOWY)
- `e2e/proof-hash-chain.spec.ts` (NOWY)

### Audyt języka polskiego
Zaplanowane skanowanie `grep` po `feeder/snapshot/busbar/switchgear/wizard/modal/dialog` w JSX/template-literal (nie w komentarzach kodu — komentarze techniczne pozostają zgodnie z briefem). Strażnicy `forbidden_ui_terms_guard.py` i `ui_terminology_guard.py` po stronie projektu nadal zachowane.

---

## 6. Test odbiorowy — pełna ścieżka inżyniera (oczekiwane zachowanie)

Po wdrożeniu *całej* Fazy 1+2+3 użytkownik musi przejść w przeglądarce:

1. Pusty projekt → tworzenie GPZ uproszczonego z TopBar.
2. Widok SLD: GPZ + szyna SN + pole SN, Karta semantyczna w Inspektorze.
3. Dodanie pola odpływowego SN przez menu kontekstowe szyny.
4. Wyprowadzenie odcinka kablowego SN z katalogu — TypePicker, `checkCatalogGate()` blokuje bez wyboru. **(WDROŻONE backendowo: V12S-009)**
5. Wstawienie stacji przelotowej SN/nN — domena waliduje ciągłość pasm. **(WDROŻONE: V12S-007)**
6. Próba błędu: gałąź SN do szyny nN → odrzucona. **(WDROŻONE: V12S-007 E020)**
7. Dodanie transformatora SN/nN, strony nN, obciążenia.
8. Dodanie źródła PV z `connection_variant=LV_BEHIND_STATION_TRANSFORMER` — walidacja refów. **(WDROŻONE: V12S-008)**
9. Utworzenie przypadku, wariantu, migawki łączeniowej.
10. Tryb TZ → Oblicz → wynik na SLD.
11. Inspektor wyniku pokazuje pięć hashy chain (semantic / input / case / variant / switching). **(WDROŻONE backendowo: V12S-010, FE wymaga commitu 8)**
12. Modyfikacja modelu → odpowiedni hash zmieniony, wynik OUTDATED, blokada raportu z powodem.

Kroki 1–9 + 11 (backend) gotowe. Kroki 10, 11 (FE), 12 wymagają commitów 7–10.

---

## 7. Strażnicy

Zachowane PASS po wszystkich pięciu commitach:
- `python scripts/semantic_architecture_guard.py` ✓
- `python scripts/pcc_zero_guard.py` ✓
- `tests/test_professional_invariants.py` ✓ (no-Any budget zachowany)

Strażnicy wymagający uruchomienia po pełnym wdrożeniu Fazy 3 (z briefu):
- `forbidden_ui_terms_guard.py`, `ui_terminology_guard.py`, `no_codenames_guard.py`
- `dead_click_guard.py`, `dialog_completeness_guard.py`, `fix_action_completeness_guard.py`
- `interaction_matrix_guard.py`, `overlay_no_physics_guard.py`, `trace_ui_leak_guard.py`
- `sld_determinism_guards.py`, `trace_determinism_guard.py`
- `resultset_v1_schema_guard.py` (wymaga commitu 6)

---

## 8. Ryzyka i mitygacje

| Ryzyko | Mitygacja | Status |
|---|---|---|
| Frozen Result API breakage | Wszystkie zmiany Fazy 2 additive (5 nowych Optional pól w ENMHeader, stare `compute_enm_hash` zachowane bit-w-bit) | ✓ |
| Determinizm dryfu po split hashy | Test `test_hash_chain_split.py` pokrywa determinizm wszystkich 5 funkcji | ✓ |
| Single Model rule (variant_hash) | `compute_variant_hash` operuje na delcie/overlay, nie na osobnym modelu. Udokumentowane w docstring | ✓ |
| BoundaryNode resurfacing przez walidator napięć | Walidacja działa na `Bus.voltage_kv`, nie wprowadza PCC | ✓ (`pcc_zero_guard` PASS) |
| Wymóg V12S-N w rejestrze przed commitem | V12S-007..V12S-011 dodane w pierwszym commicie (`ef8c73b`) przed kodem | ✓ |
| Złamanie WHITE BOX przez `element_ref_id` | Nie wdrożone w tej iteracji; plan zachowuje WHITE BOX (mapping na boundary, nie w solverze) | otwarte |
| Migracja FE z 5 nowych hashy | FE konsumuje opcjonalnie (Optional fields) — placeholder „Hash audytu w toku" do czasu commitu 8 | otwarte |

---

## 9. Kryteria zamknięcia tej iteracji

- [x] V12S-007..V12S-011 zatwierdzone w rejestrze decyzji.
- [x] Walidacja port/rola/napięcie egzekwowana w domenie (E020, E021).
- [x] `Generator.connection_variant` walidowany krzyżowo (Pydantic).
- [x] Katalog-first hard w action envelope (`catalog_ref_missing`).
- [x] Pięć ortogonalnych hashy ENM (`semantic / input / case / variant / switching_snapshot`).
- [x] Wsteczna kompatybilność `compute_enm_hash` (zachowana semantyka, deterministyczność).
- [x] 4348/4348 testów backendu PASS, 0 regresji.
- [x] `semantic_architecture_guard.py` + `pcc_zero_guard.py` PASS.
- [ ] `element_ref_id` w wynikach solverów — odłożone do następnej iteracji.
- [ ] Polot wizualny FE (commits 7-10) — odłożone do iteracji z weryfikacją w przeglądarce.

---

## 10. Co dalej (rekomendowana następna iteracja)

1. **Commit 6 (V12S-011)** — element_ref_id w `result_mapping/`, schema v1 update, FE może wtedy zrezygnować z UUID lookup. Małe ryzyko, duża wygoda.
2. **Commit 7-10 (Faza 3)** — w sesji z dostępnym dev-serwerem i Browser Use / Playwright. Wymaga pixel-level review.
3. **Audyt PL** — finalne `grep` w JSX, run `forbidden_ui_terms_guard` i `ui_terminology_guard` przed/po.
4. **E2E real backend** — uruchomienie `npm run test:e2e:real` po wdrożeniu Fazy 3 dla pełnej weryfikacji łańcucha wynikowego.

Kontrakt v8 jest spełniony w warstwie domenowej. Pozostałe luki są warstwy prezentacji — nie blokują kontraktu, ale są w drodze do pełnego renderu referencyjnego.

# V12 — Tryby schematu jednokreskowego i czytelność dużych sieci — audyt wdrożenia

Data: 2026-04-27
Branża: schemat jednokreskowy (SN/nN), tryby pracy, poziomy szczegółowości, mini-mapa, widok szkieletowy, filtry warstwowe, pochodzenie wartości
Branch: `claude/setup-opus-environment-wjwnb`

## 1. Stan istniejący — moduły relewantne

### 1.1 Magazyny stanu

| Magazyn | Plik | Co przechowuje | Uwagi |
| --- | --- | --- | --- |
| `useAppStateStore` | `mv-design-pro/frontend/src/ui/app-state/store.ts` | `activeArea` (MO/AN/ZA/OZ/RA/AD/HI), `activeWorkMode` (TE/TW/TZ/TP/TA/TN), `activeMode` (MODEL_EDIT/RESULT_VIEW), `activeRunId`, `activeSnapshotId` | Główny magazyn shellu V12. `activeWorkMode` to **kanon V12** — używamy go. |
| `useSldModeStore` | `mv-design-pro/frontend/src/ui/sld/sldModeStore.ts` | `mode` (EDYCJA/WYNIKI/ZABEZPIECZENIA), `diagnosticLayerVisible`, `protectionLayerVisible` | Starszy magazyn trybów SLD. Pozostawiamy zgodność, ale **canon = `activeWorkMode`** w V12. |
| `useOperationalModeStore` | `mv-design-pro/frontend/src/ui/sld/operationalModeStore.ts` | `mode` (NORMALNY/AWARYJNY/ZWARCIE), `pendingOutOfServiceIds`, `selectedFaultBusId` | Symulacja interakcji na schemacie. Niezależny od trybów pracy V12. |
| `useLabelModeStore` | `mv-design-pro/frontend/src/ui/sld/labelModeStore.ts` | `mode` (MINIMALNY/TECHNICZNY/ANALITYCZNY), `visible` | Gęstość etykiet — dotyczy widoczności, nie geometrii. |
| `useOverlayStore` | `mv-design-pro/frontend/src/ui/sld-overlay/overlayStore.ts` | `overlay`, `visibleOverlays: OverlayKind[]` | Driverem `visibleOverlays` jest `V12OverlayModeController`. |

### 1.2 Tryby pracy V12 — jak przełączane

`AppShellV12.tsx:174` montuje `<V12OverlayModeController />` (headless). Kontroler odczytuje `activeWorkMode` i mapuje go na zestaw nakładek przez `WORK_MODE_OVERLAYS_BASE` (frozen). To **istniejący kanoniczny mechanizm** sterowania widocznością nakładek przez tryby pracy.

`activeWorkMode` jest jedynym kanonicznym źródłem trybu pracy w V12. Mapping istniejący:

| Tryb | Kod | Etykieta PL | Nakładki |
| --- | --- | --- | --- |
| Edycja | TE | Edycja | (brak) |
| Wyniki | TW | Wyniki | results, power_flow, [zero_sequence] |
| Zabezpieczenia | TZ | Zabezpieczenia | results, protection, zero_sequence |
| Porównanie | TP | Porównanie | diagnostics |
| Audyt | TA | Audyt | results, trace_markers, [zero_sequence] |
| Operator nocny | TN | Operator nocny | results, [zero_sequence] |

### 1.3 Filtry warstwowe — stan obecny

Komponent `SldVisualModes` (`mv-design-pro/frontend/src/ui/network-build/SldVisualModes.tsx`) wystawia 5 filtrów (ALL / READINESS_ONLY / SOURCES_ONLY / NN_ONLY / PROTECTION_ONLY), zdefiniowanych w `mv-design-pro/frontend/src/ui/sld/core/keyboardShortcuts.ts:95` (`VISUAL_FILTERS`).

**Problem:** filtr emituje `CustomEvent('sld:visual-filter-change')`, ale **nie ma żadnego konsumenta** w kodzie (poza emiterem). Stan filtra żyje w lokalnym `useState` komponentu — nie ma magazynu. To martwy mechanizm. **Wdrożenie musi go zastąpić jednym spójnym magazynem** i **wpiąć go w canvas**.

### 1.4 Inspektor i pochodzenie wartości

`mv-design-pro/frontend/src/ui/inspector/types.ts` definiuje `InspectorField.source: 'instance' | 'type' | 'calculated' | 'audit'`. `PropertyGrid` pokazuje krótkie znaczniki `(z katalogu)`, `(obliczone)`, `(system)`. **Brak nawigacji ze znacznika do śladu obliczeń lub do wpisu w katalogu.** Nie ma mechanizmu prowadzenia od wartości na schemacie do jej źródła.

### 1.5 Widok / zoom / LOD

`mv-design-pro/frontend/src/ui/sld/types.ts` — `ViewportState { offsetX, offsetY, zoom }`. `ZOOM_MIN=0.25`, `ZOOM_MAX=3.0`.
`SLDViewCanvas.tsx:294` zawiera **jedyną istniejącą reakcję na zoom**: `const showTechnicalCanonicalLabels = viewport.zoom >= 1.35;` — to jednorazowy próg, nie spójny system poziomów szczegółowości.

**Brak:**
- centralnej tabeli poziomów (LOD bands),
- klasyfikacji elementów wg ważności topologicznej,
- API do wyznaczania widoczności elementu wg LOD,
- testów stabilności LOD.

### 1.6 Mini-mapa

`grep -rn "minimap\|MiniMap"` — **brak** jakiegokolwiek komponentu mini-mapy w `mv-design-pro/frontend/src`.

### 1.7 Widok szkieletowy

`grep -rn "skeleton\|szkielet"` — `geometricSkeleton.ts` w `sld-editor/utils/topological-layout/` to inna koncepcja (auto-układ topologiczny). **Brak wizualnego trybu szkieletowego** dla schematu.

### 1.8 Blokada edycji poza trybem Edycja

`mv-design-pro/frontend/src/ui/mode-gate/ModeGate.tsx` + `useModePermissions.ts` zawierają macierz uprawnień działającą na poziomie `activeMode` (MODEL_EDIT vs RESULT_VIEW). `ModeGate` wycina UI, `BlockedOverlay` blokuje kliknięcia. **Działa**, ale operuje na 2-stanowej osi, podczas gdy V12 ma 6 trybów pracy. Trzeba wpiąć ją również do osi `activeWorkMode` (tylko TE pozwala na edycję).

### 1.9 Testy

| Plik | Co testuje |
| --- | --- |
| `sld/__tests__/sldModeStore.test.ts` | Przełączanie EDYCJA/WYNIKI/ZABEZPIECZENIA, URL sync |
| `sld/__tests__/operationalModes.test.ts` | NORMALNY/AWARYJNY/ZWARCIE click resolution |
| `sld/__tests__/fitToContent.test.ts` | Autodopasowanie viewportu |
| `sld/__tests__/sldModeInteraction.test.ts` | Dispatch klików w trybach |
| `sld/core/__tests__/layoutPipeline.test.ts` | Determinizm geometrii |
| `sld/core/__tests__/determinism.test.ts` | Hash stabilność |
| `shell/__tests__/V12OverlayModeController.test.tsx` | Mapping work-mode → overlays |
| `mode-gate/__tests__/` | Macierz uprawnień |

**Brakuje:** testów geometrii niezmiennej między trybami pracy V12, testów LOD, testów mini-mapy, testów filtrów warstwowych jako magazynu, testów widoku szkieletowego, testów audytu pochodzenia.

## 2. Decyzje projektowe

1. **Tryby = `activeWorkMode` (kanon V12).** Nie tworzymy kolejnego magazynu trybów. Stary `useSldModeStore` zostawiamy w obecnym stanie (back-compat dla starych testów); blokada edycji idzie przez `activeWorkMode !== 'TE'`.
2. **Geometria niezmienna.** Wszystkie nowe mechanizmy (LOD, filtry, szkielet) działają **tylko** przez:
   - widoczność (`display: none` / `opacity` na warstwie),
   - styl (kolor, grubość kreski),
   - filtrowanie listy renderowalnych symboli, **bez modyfikacji ich pozycji**.
3. **Jeden magazyn filtrów warstwowych.** `sldLayerFiltersStore` (Zustand). `SldVisualModes` migruje do tego magazynu; eventy okienkowe zostają usunięte.
4. **Poziomy szczegółowości deterministyczne.** Tabela LOD `LOD_BANDS` (frozen array) określa ranges zoomu i klasy widocznych elementów. Klasy elementów wynikają z pól `elementType` symbolu — nie z heurystyki.
5. **Mini-mapa semantyczna.** Renderuje **prostokąt opakowujący** każdej stacji + szyny GPZ + magistrale jako kreski. Nie kopiuje całej geometrii — używa `calculateSymbolsBounds` dla każdej grupy.
6. **Pochodzenie wartości.** Rozszerzenie `InspectorField` o opcjonalne `provenance: ValueProvenance`, oraz dodanie ikony „pochodzenie" obok wartości, otwierającej panel źródła. W trybie Audyt (TA) panel jest otwarty domyślnie.
7. **Polskie napisy.** Wszystkie nowe etykiety są po polsku. Zakazane terminy nie pojawiają się w napisach widocznych dla użytkownika.

## 3. Lista plików do utworzenia

| Plik | Cel |
| --- | --- |
| `mv-design-pro/frontend/src/ui/sld/sldDetailLevel.ts` | LOD bands, `getLodBand`, klasy widocznych elementów |
| `mv-design-pro/frontend/src/ui/sld/sldLayerFiltersStore.ts` | Magazyn filtrów warstwowych |
| `mv-design-pro/frontend/src/ui/sld/SldSemanticMinimap.tsx` | Mini-mapa semantyczna |
| `mv-design-pro/frontend/src/ui/sld/sldSkeletonView.ts` | Klasyfikacja elementów do widoku szkieletowego |
| `mv-design-pro/frontend/src/ui/sld/SldReadabilityOverlay.tsx` | Komponent pasywnej warstwy widoczności (LOD + filtry + szkielet) |
| `mv-design-pro/frontend/src/ui/inspector/ValueProvenancePopover.tsx` | UI pochodzenia wartości |
| Testy: `__tests__/sldDetailLevel.test.ts`, `__tests__/sldLayerFiltersStore.test.ts`, `__tests__/sldSkeletonView.test.ts`, `__tests__/SldSemanticMinimap.test.tsx`, `__tests__/SldReadabilityIntegration.test.tsx`, `__tests__/valueProvenance.test.tsx`, `__tests__/v12WorkModeEditGate.test.ts`, `__tests__/v12GeometryStability.test.ts` | Pokrycie testowe wymagane przez kryterium akceptacji |

## 4. Lista plików do zmiany

| Plik | Zmiana |
| --- | --- |
| `mv-design-pro/frontend/src/ui/sld/SLDViewCanvas.tsx` | Dodać LOD-aware filtrację symboli (po sortowaniu, przed renderem); wpiąć `sldLayerFiltersStore` |
| `mv-design-pro/frontend/src/ui/sld/SLDView.tsx` | Wpiąć mini-mapę i kontroler trybów pracy V12 (TE→edycja, TA→audyt) |
| `mv-design-pro/frontend/src/ui/network-build/SldVisualModes.tsx` | Migracja z CustomEvent → store |
| `mv-design-pro/frontend/src/ui/inspector/types.ts` | Dodać `ValueProvenance`, `provenance?` do `InspectorField` |
| `mv-design-pro/frontend/src/ui/inspector/PropertyGrid.tsx` | Renderować ikonę pochodzenia gdy obecne |
| `mv-design-pro/frontend/src/ui/inspector/InspectorPanel.tsx` | Auto-otwarcie pochodzenia w trybie Audyt |
| `mv-design-pro/frontend/src/ui/sld/index.ts` | Eksporty nowych modułów |
| `mv-design-pro/frontend/src/ui/mode-gate/useModePermissions.ts` | Dodać sygnaturę uprawnień zależnych od `activeWorkMode` (TE→edytowalny) |

## 5. Plan testów

1. `sldDetailLevel.test.ts` — `getLodBand(zoom)` deterministyczne, klasyfikacja elementów stała.
2. `sldLayerFiltersStore.test.ts` — toggle warstw, multi-select, brak mutacji modelu.
3. `sldSkeletonView.test.ts` — klasyfikacja: szkielet zawiera GPZ, stacje, BranchPole, ZKSN, Bus, magistrale; nie zawiera Loadów, urządzeń pomiarowych.
4. `SldSemanticMinimap.test.tsx` — render struktury sieci, ramka okna widoku, klik = nawigacja.
5. `SldReadabilityIntegration.test.tsx` — geometria niezmieniona przy zmianie trybu pracy, zmianie LOD, zmianie filtrów; deterministyczny render po snapshocie.
6. `valueProvenance.test.tsx` — kliknięcie znacznika pochodzenia otwiera popover z danymi (etykieta po polsku, brak zakazanych terminów); brak wartości → komunikat „brak śladu".
7. `v12WorkModeEditGate.test.ts` — tylko `activeWorkMode === 'TE'` daje uprawnienia edycyjne.
8. `v12GeometryStability.test.ts` — symbole zachowują pozycje przy każdej zmianie trybu, LOD, filtra.
9. `valueProvenance.terminology.test.ts` — etykiety nie zawierają zakazanych terminów.

## 6. Co NIE jest zmieniane

- Solvery i ich kontrakty wynikowe.
- Pipeline geometryczny `layoutPipeline.ts`.
- Sygnatury `ENM`, `Snapshot`, `useSnapshotStore`.
- Reguły `WORK_MODE_OVERLAYS_BASE`.
- Polskojęzyczna konwencja UI ani lista zakazanych terminów.

## 7. Ryzyka i ograniczenia

- Mini-mapa renderuje SVG dla całej sieci. Dla bardzo dużych sieci (>5000 symboli) trzeba dorzucić cache i throttle. Ograniczamy mini-mapę do **agregatów** (stacja, GPZ, magistrala), nie pojedynczych symboli — to klucz wydajności.
- Filtr warstwowy ma już mapowanie 5 kategorii w `VISUAL_FILTERS`. Migracja do magazynu zachowuje te kategorie 1:1 (brak zmian semantycznych).
- Pochodzenie wartości w trybie Audyt nie generuje nowych obliczeń — używa wyłącznie metadanych istniejących w danych wejściowych. Brak danych jest komunikowany jawnie.
- Stary `useSldModeStore` jest pozostawiony do czasu pełnej migracji (poza zakresem tej iteracji) — nie usuwamy go, by nie zerwać istniejących testów PR-SLD-06/PR-SLD-09.

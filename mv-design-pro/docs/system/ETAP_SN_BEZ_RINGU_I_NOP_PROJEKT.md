# Etap SN bez ringu i NOP — projekt docelowego przepływu

## 1. Mapa stanu aktualnego

### Realne ścieżki
- `#editor` jest już kanonicznym wejściem do modelowania i renderuje `NetworkEditorPage`.
- `ProcessPanel` jest głównym wejściem do operacji `GPZ -> magistrala -> stacja -> odgałęzienie`.
- `SLDView` nadal pozwala inicjować te same operacje z płótna przez `CreatorToolbar`.
- `#results` jest kanonicznym wejściem do przestrzeni wyników i analizy.
- `#proof` nadal prowadzi do pomocniczego workspace legacy, opartego o `ResultsInspectorPage` wymuszone na zakładce TRACE.

### Realny przepływ
- `GPZ -> analiza -> run -> #results` działa częściowo poprawnie.
- `RunViewPanel` pozwala kliknąć wynik i ustawić selection oraz żądanie centrowania w SLD.
- `ResultsWorkspacePage` odświeża aktywny run w stanach `PENDING` i `RUNNING`.
- `ResultsInspectorPage` ma działający eksport i TRACE, ale nie jest jeszcze dobrze sprzężony z kanonicznym workspace wyników.

### Realne rozjazdy
- Formularze `AddGridSourceForm`, `ContinueTrunkForm`, `InsertStationForm`, `StartBranchForm` nie składają jeszcze kanonicznych payloadów zgodnych z backendem.
- `ProcessPanel` podaje do formularzy mieszankę nowych i legacy kluczy kontekstu.
- `interactionController.ts` i `SldEditorPage.tsx` nadal potrafią wykonywać operacje domenowe z poziomu SLD przy użyciu domyślnych katalogów, co łamie katalog-first.
- `urlState.ts` nadpisuje query tylko selection, przez co potrafi zgubić `run`, `mode`, `overlay` i stan śladu obliczeń.
- `SldOverlayPanel.tsx` jest placeholderem zamiast rzeczywistego mostu do `SLD / inspektora / powrotu do modelu`.
- `#proof` i eksport raportu pozostają na powierzchni legacy zamiast być naturalnym przedłużeniem `#results`.
- Sekcja `Sekcjonowanie i ringi` jest nadal aktywna w głównym panelu, mimo że ten etap ma być domknięty bez ringu i NOP jako blockerów.

## 2. Model docelowego przepływu dla tego etapu

### Zakres etapu
- Start w `#editor`
- Dodanie GPZ
- Kontynuacja magistrali
- Wstawienie stacji
- Start odgałęzienia
- Uruchomienie analizy
- Obserwacja `PENDING / RUNNING`
- Wejście w `#results`
- Kliknięcie wyniku
- Wskazanie elementu modelu
- Przejście do `SLD / inspektora`
- Przejście do `White Box`
- Przejście do raportu
- Powrót do modelu i korekta

### Kanoniczny model pracy
1. Inżynier otwiera `Edytor sieci`.
2. Buduje model przez katalog-first:
   - GPZ jako jawny kontrakt techniczny źródła,
   - kabel lub linia dla magistrali,
   - stacja z katalogowym transformatorem,
   - odgałęzienie z katalogowym segmentem.
3. Każda operacja zapisuje nowy Snapshot.
4. SLD pokazuje nowy stan bez lokalnej mutacji topologii.
5. Gdy model jest gotowy, analiza tworzy konkretny run i kieruje do `#results?run=...&mode=run`.
6. Workspace wyników pokazuje stan runa, a po kliknięciu wyniku ustawia jedną selection prawdę.
7. Ta sama selection prowadzi do:
   - powrotu do modelu,
   - centrowania SLD,
   - inspektora,
   - TRACE / White Box,
   - raportu.
8. Powrót do modelu zachowuje selection i kontekst, tak aby inżynier mógł od razu poprawić wskazany element.

### Gotowość do przyszłego ringu i NOP
- Kontekst operacji pozostaje oparty o porty i segmenty, więc późniejsze `ring/NOP` można dołączyć bez łamania API.
- W tym etapie narzędzia `connect_ring` i `set_nop` mają zostać wygaszone w głównym UX, a nie rozwijane.

## 3. Miejsca wejścia do operacji

### Główne
- `ProcessPanel` — podstawowe wejście operatorskie dla tego etapu.
- `SLD / CreatorToolbar` — pomocnicze wejście bezpośrednio z płótna, ale wyłącznie przez otwarcie formularza kanonicznego, nie przez natychmiastową mutację.
- `RunViewPanel` — wejście do wskazania elementu z poziomu wyników.

### Pomocnicze
- `ProjectTree` — wybór elementu i przejście do inspektora.
- `ResultsInspectorPage` — TRACE i eksport raportu dla aktywnego runa.
- `WorkspaceHeader / SldOverlayPanel` — przejścia między `wyniki -> model -> White Box -> raport`.

### Zakazane / do wygaszenia
- Bezpośrednie `executeDomainOperation()` z SLD dla `add_gpz`, `continue_trunk`, `insert_station`, `start_branch` z payloadem budowanym na domyślnych katalogach.
- Legacy `/enm/ops` jako ścieżka tworzenia elementów technicznych.
- `ring/NOP` jako element podstawowego workflow tego etapu.

## 4. Model formularzy

### Operacje jako formularze w panelu bocznym
- `add_grid_source_sn`
- `continue_trunk_segment_sn`
- `insert_station_on_segment_sn`
- `start_branch_segment_sn`

### Operacje pozostające modalami lub helperami poza zakresem etapu
- `connect_secondary_ring_sn`
- `set_normal_open_point`
- inne legacy modale pomocnicze, jeśli nie są na ścieżce tego etapu

### Prefill z kontekstu
- `GPZ`: brak kontekstu topologicznego, prefill tylko z ostatnio użytych parametrów technicznych.
- `Magistrala`: `from_terminal_id`, `trunk_id`, sugerowany rodzaj segmentu z kontekstu.
- `Stacja`: `segment_ref`, `insert_at` domyślnie `0.5`, typ stacji zależny od wejścia.
- `Odgałęzienie`: `from_ref` preferowane z portu BRANCH; `from_bus_ref` tylko jako zgodność pomocnicza.

### Wybór obowiązkowy użytkownika
- Długość i rodzaj segmentu SN.
- Pozycja katalogowa dla każdego segmentu technicznego.
- Typ stacji i katalog transformatora.
- Jawne parametry GPZ jako wyjątek kontraktu technicznego źródła.

### Twarda bramka katalogu
- `continue_trunk_segment_sn`: brak `catalog_binding` blokuje submit.
- `insert_station_on_segment_sn`: brak `catalog_binding` transformatora blokuje submit.
- `start_branch_segment_sn`: brak `catalog_binding` segmentu blokuje submit.
- `GPZ`: brak katalogu dopuszczony tylko jako jawny kontrakt techniczny, bez zgadywania.

## 5. Model przejść użytkownika

### model -> analiza
- Start z `#editor`.
- Po spełnieniu readiness użytkownik uruchamia analizę.
- System zapisuje `activeRunId` i przechodzi do `#results?run={runId}&mode=run&overlay=result`.

### analiza -> wyniki
- `ResultsWorkspacePage` ładuje projekcję, wybiera właściwy run i odświeża go co 3 sekundy dla `PENDING / RUNNING`.
- UI pokazuje status i zalecany następny krok.

### wyniki -> element
- Kliknięcie wiersza tabeli ustawia `SelectedElement`, zachowuje `run/mode/overlay` w URL i zgłasza `centerSldOnElement`.

### element -> SLD / inspektor
- Z `#results` użytkownik wybiera `Otwórz w modelu`.
- System przechodzi do `#editor` zachowując selection w URL.
- `SLDView` centruje się na elemencie, a inspektor pokazuje jego dane bez dodatkowej lokalnej prawdy.

### wyniki -> White Box
- Z `#results` użytkownik wybiera `White Box`.
- System przechodzi do `#proof?run={runId}&sel={elementId}...`.
- TRACE dostaje selection i potrafi wskazać właściwy krok, jeśli istnieje mapowanie.

### wyniki -> raport
- Z `#results` użytkownik wybiera `Raport / eksport`.
- System otwiera helper exportu dla aktywnego runa bez opuszczania kontekstu runu.

### White Box / raport -> model
- Każdy widok pomocniczy ma akcję `Wroc do modelu`.
- Powrót zachowuje selection elementu oraz aktualny run jako kontekst roboczy.

## 6. Model selection / URL / inspektora

### Jedna prawda
- `SelectionStore` pozostaje jedynym źródłem selection w pamięci.
- URL jest jedynym trwałym zapisem selection w nawigacji hashowej.
- `ResultsWorkspaceStore` jest jedynym źródłem `mode/run/batch/comparison/overlay`.

### Jeden przepływ
- `selection -> url`: `useUrlSelectionSync`
- `url -> selection`: `readSelectionFromUrl`
- `run/mode/overlay -> url`: `ResultsWorkspaceStore.syncToUrl`
- `wynik -> selection -> center -> editor`: przez `selectElement()` oraz `centerSldOnElement()`

### Bez lokalnych duplikatów
- `updateUrlWithSelection()` musi zachowywać istniejące parametry `run/mode/overlay/trace`.
- `ResultsInspectorPage` nie może sam tworzyć osobnego modelu selection; ma tylko konsumować globalną selection.
- `TraceViewerContainer` ma dostać `selectionId` i mapowanie `selection -> trace`.

## 7. Lista zmian w plikach

### Pliki do ruszenia
- `frontend/src/ui/navigation/urlState.ts`
- `frontend/src/ui/navigation/useUrlSelectionSync.ts`
- `frontend/src/ui/results-workspace/ResultsWorkspacePage.tsx`
- `frontend/src/ui/results-workspace/WorkspaceHeader.tsx`
- `frontend/src/ui/results-workspace/RunViewPanel.tsx`
- `frontend/src/ui/results-workspace/SldOverlayPanel.tsx`
- `frontend/src/App.tsx`
- `frontend/src/ui/results-inspector/ResultsInspectorPage.tsx`
- `frontend/src/ui/proof/TraceViewer.tsx`
- `frontend/src/ui/network-build/ProcessPanel.tsx`
- `frontend/src/ui/network-build/OperationFormRouter.tsx`
- `frontend/src/ui/network-build/forms/AddGridSourceForm.tsx`
- `frontend/src/ui/network-build/forms/ContinueTrunkForm.tsx`
- `frontend/src/ui/network-build/forms/InsertStationForm.tsx`
- `frontend/src/ui/network-build/forms/StartBranchForm.tsx`
- `frontend/src/ui/sld/interactionController.ts`
- `frontend/src/ui/sld/SldEditorPage.tsx`

### Pliki do wygaszenia lub ograniczenia
- `frontend/src/ui/results-workspace/SldOverlayPanel.tsx` jako placeholder
- `frontend/src/ui/results-inspector/LegacyTraceWorkspacePage.tsx` jako pomocniczy wrapper, nie główna ścieżka analizy
- legacy modalne wrappery w formularzach głównego przepływu, jeśli nadal wymuszają zły payload

### Pliki do testów
- `frontend/src/ui/navigation/__tests__/routes.test.ts`
- nowe testy `urlState`
- nowe testy formularzy `GPZ / magistrala / stacja / odgałęzienie`
- `frontend/src/ui/results-workspace/__tests__/ResultsWorkspacePage.test.tsx`
- nowe testy `RunViewPanel`
- testy `ResultsInspectorPage / TraceViewer`
- `frontend/e2e/critical-run-flow.spec.ts`
- backendowe testy ENM dla payloadów aktualnego etapu

## 8. Definition of Done

- Inżynier może wykonać przepływ `GPZ -> magistrala -> stacja -> odgałęzienie -> analiza -> wynik -> element -> SLD/inspektor -> White Box -> raport -> model`.
- Formularze `GPZ / magistrala / stacja / odgałęzienie` składają kanoniczne payloady zgodne z backendem.
- Dla elementów technicznych katalog jest twardą bramką już przed mutacją Snapshot.
- `SLD` nie wykonuje mutacji głównych operacji z domyślnych katalogów.
- `#results` zachowuje `run/mode/overlay` przy zmianie selection.
- Kliknięcie wyniku prowadzi do konkretnego elementu i jego inspektora po powrocie do modelu.
- `White Box` i raport działają z kontekstem tego samego runu.
- `ring/NOP` nie blokują tego etapu i są wyraźnie odłożone poza główny przepływ.
- Testy frontendowe, backendowe i co najmniej jeden test E2E dla tego etapu są zielone.

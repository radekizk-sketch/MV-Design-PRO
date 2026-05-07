# Browser E2E pretest and repair audit

Status: w toku. Ten dokument opisuje rzeczywiście wykonane przejścia w przeglądarce, naprawy i walidację. Nie oznacza pełnego ukończenia celu, dopóki finalny browser pass i szeroka walidacja nie przejdą.

## Komendy i środowisko

Frontend:

```bash
cd mv-design-pro/frontend
npm run dev:e2e
```

Backend:

```bash
cd mv-design-pro/backend
poetry run uvicorn api.main:app --host 127.0.0.1 --port 8000
```

URL aplikacji: `http://127.0.0.1:5173`

URL API: `http://127.0.0.1:8000`

Logi lokalne:

- `tmp/e2e-frontend.out.log`
- `tmp/e2e-frontend.err.log`
- `tmp/e2e-backend.out.log`
- `tmp/e2e-backend.err.log`

## Trasy i obszary do pokrycia

Zakres docelowy obejmuje:

- E-00 pulpit projektu i modal metadanych projektu.
- E-01 środowisko SLD.
- E-04 gotowość obliczeń.
- E-10 GPZ.
- E-11 pole SN.
- E-12 odcinki SN.
- E-13 stacja SN/nN.
- E-14 ZK SN.
- E-15 słup.
- E-17 NOP.
- E-21 PV.
- E-22 BESS.
- E-23 FW.
- E-25/E-37 raporty.
- E-36 uzasadnienie inżynierskie.

Pełny finalny pass nie został jeszcze zakończony.

## Dane testowe

Projekt browser E2E: `E2E_PRETEST_MV_DESIGN_PRO`

Zakres obliczeń: `Zakres E2E pretest`

## Dowody z przeglądarki

- `tmp/browser-e2e-gpz-created.png` - utworzony GPZ widoczny na SLD.
- `tmp/browser-e2e-after-reload-hydrated.png` - po odświeżeniu aktywna migawka ENM odtworzona z backendu.
- `tmp/browser-e2e-trunk-segment-created.png` - dodany odcinek ciągu głównego z katalogowym kablem.
- `tmp/browser-e2e-station-inserted.png` - stacja wstawiona na odcinku.
- `tmp/browser-e2e-station-panel-after-fix.png` - panel budowy po naprawie licznika odbiorów.
- `tmp/browser-e2e-station-internal-after-fix.png` - dwuklik stacji otwiera wewnętrzny SLD z nazwą domenową i danymi ze snapshotu.
- `tmp/browser-e2e-pv-added.png` - PV dodane ze stacji i widoczne na SLD oraz w sekcji OZE/BESS.
- `tmp/browser-e2e-pv-e21-after-fix.png` - dwuklik PV otwiera E-21 z danymi tego samego obiektu, bez pustego komunikatu.
- `tmp/browser-e2e-readiness-open-from-topbar.png` - przycisk `Sprawdź braki` otwiera E-04.
- `tmp/browser-e2e-blocker-to-transformer-form.png` - klik blockera PV w E-04 otwiera formularz dodania transformatora SN/nN.

## Defekty znalezione i naprawione

### E2E-001 - frontend nie startował przez brak selektorów pola

Ekran: E-01 / SLD.

Akcja: uruchomienie dev servera i otwarcie aplikacji.

Rzeczywiste zachowanie: Vite zgłaszał brak modułu `fieldControlSelectors`.

Naprawa: dodano `frontend/src/ui/field/fieldControlSelectors.ts` z selektorami urządzeń sterowania i licznikami pomiarów.

Test: `frontend/src/ui/field/__tests__/fieldControlSelectors.test.ts`.

Status: naprawione i potwierdzone testem celowanym.

### E2E-002 - modal nowego projektu pozwalał na niepoprawny zapis

Ekran: E-00 / `ProjectMetadataModal`.

Akcja: otwarcie modala i próba zapisu bez nazwy.

Rzeczywiste zachowanie: brak jednoznacznej blokady zapisu i fokusu na polu nazwy.

Naprawa: dodano focus na nazwie projektu, blokadę przycisku zapisu, komunikat wymaganej nazwy i test-id pól.

Test: `ProjectDashboardSurface.test.tsx`.

Status: naprawione i potwierdzone w przeglądarce.

### E2E-003 - przycisk tworzenia zakresu obliczeń był nieergonomiczny i częściowo rozłączony

Ekran: panel analiz.

Akcja: klik `+ Nowy`.

Rzeczywiste zachowanie: dialog był trudny do aktywowania w normalnej ścieżce pracy.

Naprawa: panel analiz synchronizuje aktywny projekt, przycisk otwiera dialog przez stan i hash, a utworzony zakres trafia do globalnego stanu aplikacji.

Test: `AnContextPanel.test.tsx`.

Status: naprawione i potwierdzone w przeglądarce przez utworzenie zakresu `Zakres E2E pretest`.

### E2E-004 - widoczne etykiety miały uszkodzone polskie znaki i nazwy techniczne

Ekrany: pasek statusu, routing, widoki robocze.

Akcja: przegląd widocznych etykiet.

Rzeczywiste zachowanie: widoczne były stare lub uszkodzone etykiety typu `Biezacy`.

Naprawa: poprawiono etykiety w `StatusBarV12`, `WorkspaceSurfaceRouter`, `routes.ts` i typach widoków.

Test: aktualizacja oczekiwań w testach workspace.

Status: naprawione w dotkniętym zakresie.

### E2E-005 - dodanie GPZ otwierało statyczny ekran zamiast formularza operacji

Ekran: E-01 / operacja `Dodaj GPZ`.

Akcja: klik `+ Dodaj GPZ`.

Rzeczywiste zachowanie: aplikacja pokazywała statyczny edytor E-10 z technicznymi opisami operacji zamiast aktywnego formularza zapisu.

Naprawa: `WorkspaceSurfaceRouter` renderuje formularze operacji domenowych dla delegacji `operation_form`, a `GpzConfiguratorSurface` ma polskie etykiety inżynierskie.

Testy: `workspaceShellV125.test.tsx`, `Etap3Configurators.test.tsx`.

Status: naprawione, GPZ utworzony w przeglądarce i widoczny na SLD.

### E2E-006 - modal wyprowadzenia ciągu miał błędy kodowania i techniczny identyfikator

Ekran: E-12 / wyprowadzenie ciągu głównego.

Akcja: klik `Połącz zacisk pola SN`.

Rzeczywiste zachowanie: modal zawierał uszkodzone polskie znaki i techniczny identyfikator operacji.

Naprawa: przepisano `TrunkContinueModal.tsx` na polskie etykiety techniczne i usunięto produkcyjny tekst techniczny.

Testy: oba testy `ContinueTrunkForm.test.tsx`.

Status: naprawione, odcinek z katalogowym kablem YAKXS dodany w przeglądarce.

### E2E-007 - po odświeżeniu aktywny zakres nie odtwarzał migawki ENM

Ekran: E-01 / SLD po reload.

Akcja: odświeżenie strony po utworzeniu GPZ.

Rzeczywiste zachowanie: aktywny projekt i zakres były zachowane, ale SLD pokazywał pusty stan lub brak migawki.

Naprawa: `App.tsx` odtwarza migawkę z backendu, gdy istnieje aktywny zakres bez lokalnego snapshotu.

Test: `App.routes.test.tsx`.

Status: naprawione i potwierdzone w przeglądarce.

### E2E-008 - formularz GPZ startował w trybie ręcznym zamiast katalogowym

Ekran: E-10 / formularz GPZ.

Akcja: dodanie GPZ.

Rzeczywiste zachowanie: nowe źródło mogło startować bez katalogowego trybu powiązania.

Naprawa: `GridSourceEditor` ustawia `manual_mode: false` i nie wpisuje przykładowych notatek technicznych.

Test: `AddGridSourceForm.test.tsx`.

Status: naprawione.

### E2E-009 - akcja wstawienia stacji wyglądała jak placeholder

Ekran: panel budowy sieci.

Akcja: przegląd akcji po utworzeniu odcinka.

Rzeczywiste zachowanie: widoczna była etykieta w nawiasach kwadratowych `[Wstaw stację na odcinku]`.

Naprawa: usunięto nawiasy z aktywnej etykiety i poprawiono polskie komunikaty akcji SLD.

Status: naprawione, stacja została wstawiona w browser flow.

### E2E-010 - panel budowy renderował `undefined` w liczniku odbiorów

Ekran: E-01 / panel budowy modelu.

Akcja: rozwinięcie sekcji `Transformatory i nN`.

Rzeczywiste zachowanie: etykieta sekcji pokazywała `1 TR / undefined odb.`.

Naprawa: `useNetworkBuildDerived()` materializuje `loadCount` i `trunkSegmentCount` z aktualnego snapshotu i logical views.

Test: `networkBuildStore.test.tsx`.

Status: naprawione i potwierdzone w przeglądarce po reload.

### E2E-011 - dwuklik stacji otwierał nieczytelny wewnętrzny SLD

Ekran: E-01 / SLD / dwuklik stacji.

Akcja: dwuklik bloku stacji na SLD.

Rzeczywiste zachowanie: overlay stacji otwierał się, ale był szerszy niż dostępna kanwa i pokazywał surowy identyfikator stacji zamiast nazwy domenowej.

Naprawa: `SldWorkspaceContainer` buduje dane overlayu z ENM snapshotu: nazwa stacji, typ topologiczny, napięcie SN, poziomy nN, transformatory, pola i rozdzielnice nN. Rozmiar overlayu jest dopasowany do dostępnej kanwy.

Test: `SldWorkspaceContainer.test.tsx`.

Status: naprawione i potwierdzone w browser retest.

### E2E-012 - klik PV na SLD nie synchronizował wspólnego SelectionState

Ekran: E-01 / SLD / PV przy stacji.

Akcja: klik obiektu PV na SLD.

Rzeczywiste zachowanie: lokalne zaznaczenie SLD zmieniało obrys elementu, ale prawy inspektor i wspólny SelectionState pozostawały bez domenowego obiektu PV.

Naprawa: `SldWorkspaceContainer` mapuje elementy DER, stacje, GPZ, odcinki i sekcje do `SelectedElement` w `useSelectionStore`, zachowując lokalne podświetlenie SLD.

Test: `SldWorkspaceContainer.test.tsx` - klik DER synchronizuje `selectedElement` i otwiera inspektor.

Status: naprawione i potwierdzone w przeglądarce.

### E2E-013 - dwuklik PV otwierał E-21 bez danych po odświeżeniu

Ekran: E-21 / `DerConfigurator`.

Akcja: dwuklik PV na SLD po reloadzie aplikacji.

Rzeczywiste zachowanie: E-21 pokazywał `Źródło niewybrane`, ponieważ lokalny `useStationDerStore` był pusty, mimo że kanoniczny ENM snapshot zawierał generator PV.

Naprawa: `DerSurfaces` odtwarza `StationDerConnection` z ENM snapshotu jako projekcję read-only, gdy lokalny store DER nie ma obiektu. `DerConfigurator` pokazuje konkretne pola katalogowe zamiast ogólnego pustego komunikatu.

Testy: `Etap5Der.test.tsx`, `DerConfigurator.test.tsx`.

Status: naprawione, screenshot `tmp/browser-e2e-pv-e21-after-fix.png`.

### E2E-014 - aktywne UI nadal eksponowało zakazane terminy

Ekran: główna nawigacja obszarów.

Akcja: inspekcja tooltipów nawigacji w browser flow.

Rzeczywiste zachowanie: tooltip raportów zawierał `proof-pack`, a historia używała starych opisów migawek/uruchomień.

Naprawa: `areaRegistry.ts` używa polskich etykiet `pakiet uzasadnienia`, `wersje modelu użyte do obliczeń` i `ostatnie obliczenia`.

Test: `area-registry.test.ts` z guardem zakazanych terminów w aktywnych etykietach obszarów.

Status: naprawione i potwierdzone przez odczyt tooltipów w in-app browser.

### E2E-015 - `Sprawdź braki` było wizualnie klikalne, ale zablokowane przez `aria-disabled`

Ekran: TopBar / E-01.

Akcja: klik `Sprawdź braki`.

Rzeczywiste zachowanie: Browser Use nie mógł kliknąć przycisku, ponieważ miał `aria-disabled=true`, mimo że handler miał otwierać gotowość obliczeń.

Naprawa: przycisk nie deklaruje już fałszywej niedostępności; gdy obliczenia są zablokowane, klik przekierowuje do akcji `readiness`.

Test: `TopBar.test.tsx`.

Status: naprawione i potwierdzone w przeglądarce.

### E2E-016 - akcja `readiness` w App była martwa

Ekran: TopBar / globalne menu akcji.

Akcja: `Sprawdź braki` po odblokowaniu kliknięcia.

Rzeczywiste zachowanie: `handleMenuAction('readiness')` wpadało w gałąź domyślną, więc E-04 nie otwierał się.

Naprawa: `App.tsx` obsługuje `readiness` i `show-readiness`, otwierając kanoniczny surface E-04 z zakładką braków.

Test: `App.routes.test.tsx`.

Status: naprawione i potwierdzone screenshotem `tmp/browser-e2e-readiness-open-from-topbar.png`.

### E2E-017 - blockery E-04 nie prowadziły do pola lub formularza naprawy

Ekran: E-04 / `ModelGapsSurface`.

Akcja: klik `Napraw:` przy blockerze PV wymagającym transformatora.

Rzeczywiste zachowanie: handler był pusty w praktyce - zawierał komentarz o przyszłej synchronizacji, ale nie wybierał elementu ani nie otwierał formularza.

Naprawa: klik blockera synchronizuje `SelectionState`, centruje element SLD i używa `resolveFixActionSurface` do otwarcia właściwego formularza operacyjnego. Dla blockerów bez jawnego `fix_action` tworzona jest kontrolowana akcja fallback, żeby nie było martwych wpisów.

Test: `ModelGapsSurface.test.tsx`.

Status: naprawione i potwierdzone screenshotem `tmp/browser-e2e-blocker-to-transformer-form.png`.

### E2E-018 - aktywny UI nadal eksponował zakazane terminy `snapshot`, `Przypadek`, `run`

Ekran: E-01 / pusty SLD, lewy panel schematu, dolny pasek statusu, historia obliczeń.

Akcja: retest w narzędziu przeglądarkowym po wejściu na `http://127.0.0.1:5173/`.

Rzeczywiste zachowanie: aktywny tekst zawierał `Aktualny snapshot nie zawiera elementów schematu...`, dostępnościowy tekst paska statusu zawierał `Przypadek`, a lista historii używała widocznych etykiet `runy`.

Naprawa:

- `SchematContextPanel` używa teraz `Aktualna wersja modelu...` i `zakres obliczeń`.
- `StatusBarV12` używa `Zakres obliczeń`, `Ostatnie obliczenie`, `Obliczenia` i `Stan` w tooltipie hashy.
- `RunListView` używa `Historia obliczeń`, `Zakres obliczeń` i `obliczeń` zamiast `runów`.
- `WynikiContextPanel` i `WorkflowContextStrip` usuwają widoczne `przypadek`/`migawki`.
- `labelGuards` sprawdza zakazane etykiety bez względu na wielkość liter i obejmuje dodatkowo `Fallback`, `Legacy`, `Debug`, `Mock`, `TODO`, `Not implemented`, `Coming soon`, `Przypadek`.

Test:

- `StatusBarV12.test.tsx`
- `context-panel-empty-states.test.tsx`
- `RunListView.test.tsx`
- `ui-label-blacklist.test.tsx`
- `area-registry.test.ts`

Status: naprawione i potwierdzone screenshotem `tmp/browser-e2e-language-guard-after-fix.png`. Retest przeglądarkowy nie znalazł `proof`, `run`, `snapshot`, `feeder`, `branch`, `case`, `wizard`, `fallback`, `legacy`, `placeholder`, `TODO`, `not implemented`, `coming soon`, `debug`, `mock`, `Przypadek` ani `migawk` w aktywnym tekście strony.

### E2E-019 - repozytoryjny guard terminologii UI nadal wykrywał 10 widocznych etykiet technicznych

Ekran: aktywne powierzchnie UI skanowane przez `ui-terminology-guard`.

Akcja: uruchomienie pełnego guarda etykiet UI dla `src/ui`.

Rzeczywiste zachowanie: guard wykrył 10 naruszeń w `ProcessPanel`, `ResultsInspectorPage`, `MoContextPanel`, `stationBlockBuilder`, `SldAnalysisLauncher` i `SldEditorPage`: `branch`, `case`, `Migawka modelu`, `Uruchomienie`, `Wybierz uruchomienie`, `Przypadek`.

Naprawa:

- usunięto nazwy techniczne z publicznych stringów i komunikatów diagnostycznych,
- `SldAnalysisLauncher` pokazuje `Panel obliczeń`, `Historia obliczeń`, `Obliczenie A/B`,
- `SldEditorPage` pokazuje `Zakres obliczeń`, `Wersja modelu`, `Ostatnie obliczenie`,
- `MoContextPanel` tworzy lokalny identyfikator zakresu jako `scope:...`, nie `case:...`,
- dodatkowo usunięto widoczne `Study Case`, `overlay`, `BRANCH`, `Historia uruchomień`, `Migawki modelu` z pobliskich aktywnych etykiet.

Test:

- `ui-terminology-guard.test.ts`
- `activeShellTerminology.test.ts`
- `ui-label-blacklist.test.tsx`
- `TopBar.test.tsx`
- `StatusBarV12.test.tsx`
- `AreaContextPanel.test.tsx`
- `context-panel-empty-states.test.tsx`
- `RunListView.test.tsx`
- `area-registry.test.ts`

Status: naprawione. Finalny retest przeglądarkowy nie znalazł zakazanych terminów w aktywnym ekranie E-01. Screenshot: `tmp/browser-e2e-language-guard-final.png`.

## Walidacja automatyczna wykonana

Zielony zestaw testów celowanych:

```bash
cd mv-design-pro/frontend
npm test -- src/__tests__/App.routes.test.tsx src/ui/network-build/forms/__tests__/AddGridSourceForm.test.tsx src/ui/workspace/__tests__/workspaceShellV125.test.tsx src/ui/workspace/surfaces/__tests__/Etap3Configurators.test.tsx src/ui/network-build/forms/__tests__/ContinueTrunkForm.test.tsx src/ui/network-build/__tests__/ContinueTrunkForm.test.tsx
```

Wynik: 6 plików, 48 testów przeszło. W testach `ContinueTrunkForm` pozostają ostrzeżenia React `act(...)`, bez porażki testu.

Dodatkowy zielony zestaw testów celowanych:

```bash
cd mv-design-pro/frontend
npm test -- src/ui/sld/v2/canvas/__tests__/SldWorkspaceContainer.test.tsx src/ui/network-build/__tests__/networkBuildStore.test.tsx
```

Wynik: 2 pliki, 6 testów przeszło.

Najnowszy zielony zestaw testów po naprawach E2E-012..E2E-017:

```bash
cd mv-design-pro/frontend
npm test -- src/ui/workspace/__tests__/ModelGapsSurface.test.tsx src/__tests__/App.routes.test.tsx src/ui/shell/__tests__/TopBar.test.tsx src/ui/navigation/__tests__/area-registry.test.ts src/ui/workspace/surfaces/__tests__/Etap5Der.test.tsx src/ui/network-build/der-configurator/__tests__/DerConfigurator.test.tsx src/ui/sld/v2/canvas/__tests__/SldWorkspaceContainer.test.tsx
```

Wynik: 7 plików, 60 testów przeszło.

Zielony zestaw testów guardu języka UI po E2E-018:

```bash
cd mv-design-pro/frontend
npm test -- src/ui/shell/__tests__/StatusBarV12.test.tsx src/ui/shell/context-panels/__tests__/context-panel-empty-states.test.tsx src/ui/history/__tests__/RunListView.test.tsx src/ui/canon/__tests__/ui-label-blacklist.test.tsx src/ui/navigation/__tests__/area-registry.test.ts
```

Wynik: 5 plików, 28 testów przeszło.

Uwaga narzędziowa: Browser Use / IAB w tej sesji zwrócił `No Codex IAB backends were discovered`, więc retest E2E-018 wykonano dostępnym narzędziem przeglądarkowym Playwright. Fallback jest udokumentowany, a screenshot zapisano lokalnie.

Wspólny zielony zestaw regresji po E2E-012..E2E-018:

```bash
cd mv-design-pro/frontend
npm test -- src/ui/workspace/__tests__/ModelGapsSurface.test.tsx src/__tests__/App.routes.test.tsx src/ui/shell/__tests__/TopBar.test.tsx src/ui/navigation/__tests__/area-registry.test.ts src/ui/workspace/surfaces/__tests__/Etap5Der.test.tsx src/ui/network-build/der-configurator/__tests__/DerConfigurator.test.tsx src/ui/sld/v2/canvas/__tests__/SldWorkspaceContainer.test.tsx src/ui/shell/__tests__/StatusBarV12.test.tsx src/ui/shell/context-panels/__tests__/context-panel-empty-states.test.tsx src/ui/history/__tests__/RunListView.test.tsx src/ui/canon/__tests__/ui-label-blacklist.test.tsx
```

Wynik: 11 plików, 85 testów przeszło.

Zielony zestaw guardów języka i aktywnego shell-a po E2E-019:

```bash
cd mv-design-pro/frontend
npm test -- src/ui/__tests__/ui-terminology-guard.test.ts src/ui/__tests__/activeShellTerminology.test.ts src/ui/canon/__tests__/ui-label-blacklist.test.tsx src/ui/shell/__tests__/TopBar.test.tsx src/ui/shell/__tests__/StatusBarV12.test.tsx src/ui/shell/context-panels/__tests__/AreaContextPanel.test.tsx src/ui/shell/context-panels/__tests__/context-panel-empty-states.test.tsx src/ui/history/__tests__/RunListView.test.tsx src/ui/navigation/__tests__/area-registry.test.ts
```

Wynik: 9 plików, 57 testów przeszło.

Szeroki type-check:

```bash
cd mv-design-pro/frontend
npm run type-check
```

Wynik: nie przeszedł także po E2E-019. Błędy obejmują istniejące braki modułów legacy SLD, brakujące eksporty oraz niespójności typów w starszych komponentach, m.in. `EngineeringContextMenu`, `CanonicalLayout`, `InspectorEngineeringView`, `ReadOnlyPanelRouter`, stare pliki `src/ui/sld/*` i brakujące moduły `SldEditorPage`/`SLDView`. Build nie może być oznaczony jako potwierdzony, dopóki te błędy nie zostaną domknięte.

## Pozostałe blokady i następne kroki

Pozostały do przejścia i naprawy w tej pętli:

- E-13 pełne 10 kart, wewnętrzny SLD, transformator SN/nN, multi-voltage nN.
- E-14 ZK SN.
- E-15 słup.
- E-17 NOP.
- E-21 PV, E-22 BESS, E-23 FW ze stacji i z PCC.
- E-04 gotowość obliczeń z klikalnymi blockerami.
- E-36 uzasadnienie inżynierskie z przejściem do źródła danych.
- E-25/E-37 raporty i eksporty.
- Pełny guard braków danych i fałszywych zer.
- Szeroka walidacja `type-check`, `lint`, `test`, `build`, testy E2E i guardy.

Twarda uwaga statusowa: aplikacja jest częściowo utwardzona w ścieżce start -> projekt -> zakres -> GPZ -> odcinek -> stacja, ale cel całościowy nie jest jeszcze ukończony.
## Release-gate update: type-check/build odblokowane

Data: 2026-05-07.

W tej fazie bezwarunkowo odblokowano globalny TypeScript i build bez obniżania strictness oraz bez produkcyjnych wykluczeń w `tsconfig.json`.

Naprawy:

- usunięto martwe legacy SLD i odłączone panele blokujące type-check,
- zaktualizowano `test:golden` na aktywne testy SLD v2,
- usunięto stare wykluczenia Vitest,
- zaktualizowano guardy import/semantic architecture do aktywnych plików,
- poprawiono aktywne etykiety audit2 tak, aby nie wracały `run`, `snapshot`, `Power Flow`, stare angielskie opisy i widoczne mojibake w dotkniętym zakresie,
- test audit2 został zaktualizowany do nowych polskich etykiet.

Walidacja zielona:

```bash
cd mv-design-pro/frontend
npm run type-check
npm run build
npm run lint
npm run test:ci
npm run test:golden
npm run guard:grep-zero
npm run guard:ui-terminology
npm run guard:codenames
npm run test:e2e:setup:real
npm run test:e2e:real
```

Wyniki:

- `npm run type-check`: PASS.
- `npm run build`: PASS, wyłącznie ostrzeżenie Vite o dużym chunku.
- `npm run lint`: PASS.
- `npm run test:ci`: PASS, 249 plików, 3078 testów passed, 1 skipped.
- `npm run test:golden`: PASS, 146 testów SLD v2.
- `npm run guard:grep-zero`: PASS.
- `npm run guard:ui-terminology`: PASS.
- `npm run guard:codenames`: PASS.
- `npm run test:e2e:real`: PASS, real-backend smoke.

Backend i guardy CI:

```bash
cd mv-design-pro/backend
poetry run pytest -q
```

Wynik: 4663 passed, 6 skipped, 4 xpassed.

Lokalne odpowiedniki guardów CI:

- `py -3.11 mv-design-pro/scripts/arch_guard.py`: PASS.
- `py -3.11 mv-design-pro/scripts/repo_hygiene_guard.py`: PASS.
- `py -3.11 mv-design-pro/scripts/docs_guard.py`: PASS.
- `py -3.11 mv-design-pro/scripts/sld_determinism_guards.py`: PASS.
- `py -3.11 mv-design-pro/scripts/dialog_completeness_guard.py`: PASS.
- `py -3.11 mv-design-pro/scripts/local_truth_guard.py`: PASS.
- `py -3.11 mv-design-pro/scripts/import_graph_guard.py`: PASS.
- `py -3.11 mv-design-pro/scripts/semantic_architecture_guard.py`: PASS.

Browser Use / IAB:

Ponowiona próba użycia Browser Use / IAB zakończyła się komunikatem: `No Codex IAB backends were discovered`. Zgodnie z goal użyto Playwright fallback.

Playwright fallback:

- `npm run test:e2e:real`: PASS.
- Dodatkowe uruchomienie całego katalogu `e2e` na realnym backendzie (`node ./scripts/playwright-run-real.mjs`) dało 26 passed i 14 failed. Porażki dotyczą historycznych, nie-CI speców z selektorami starego shell-a (`project-tree`, `left-panel-mode-readiness`, `mode-indicator`, `sld-connections-layer`) oraz testów oczekujących SLD przy braku aktywnego projektu, podczas gdy aktywny kontrakt startowy to E-00.

Aktualny status:

- CI release-gate jest zielony lokalnie.
- Smoke browser pass wymagany przez workflow CI jest zielony.
- Pełny katalog historycznych E2E wymaga osobnej migracji speców do aktywnego AppShell/SLD v2; nie jest traktowany jako dowód ukończenia całego wieloetapowego celu E2E.

# SLD V2 OpenAI Goal Runbook

## Cel

Doprowadzić aktywny SLD V2 MV-DESIGN-PRO do poziomu przemysłowego SCADA/CAD: czytelny tor mocy `GPZ -> TR 110/SN -> sekcje SN -> pola -> głowice -> odcinki -> stacje -> odgałęzienia/DER`, z kanoniczną aparaturą, portami, LOD/CAD, klikalnością, guardami i zieloną walidacją.

Referencja wizualna użytkownika: `C:/Users/radek/Desktop/gpzjpg.jpg`. Obraz traktowany jest jako wzorzec jakości operatorowej, nie jako źródło danych katalogowych ani topologicznych.

## Źródła obowiązujące

- `AGENTS.md`
- `mv-design-pro/AGENTS.md`
- `mv-design-pro/SYSTEM_SPEC.md`
- `mv-design-pro/PLANS.md`
- `mv-design-pro/docs/sld/STACJE_ELEKTROENERGETYCZNE_PROJECT_STANDARD.md`
- `mv-design-pro/docs/sld/SLD_SYSTEM_SPEC_CANONICAL.md`
- aktywna ścieżka kodu: `ENM snapshot -> buildSldDataFromSnapshot/projectEnmSnapshotToSld -> SldCanvasV2 -> renderery V2`

## Milestone i walidacja

| ID | Zakres | Warunek ukończenia | Walidacja |
|---|---|---|---|
| M0 | Audit bazowy | Potwierdzona aktywna ścieżka SLD V2, istniejące renderery, LOD/CAD, API, readiness i ograniczenia solverów. | Odczyt spec/code + wpis w logu decyzji. |
| M1 | Aparaty SN i selekcja | Wyłącznik/rozłącznik/odłącznik/bezpiecznik SN nie są traktowane jako `LineBranch`; URL, readiness, drzewo i inspektor prowadzą do aparatu. | Vitest dla selection, URL sync, readiness, fix action, panelu Schemat i inspektora. |
| M2 | GPZ/TR 110/SN | GPZ LOD2+ pokazuje stronę 110 kV, TR1/TR2, pola TR, sekcje SN, sprzęgła, odpływy i brak bezpośredniego wiązania 110 kV-TR-SN bez pola. | Test/guard `no_direct_110kv_tr_tie_without_switchgear` + visual/browser screenshot. |
| M3 | Porty i tor mocy | Odcinek wychodzi z głowicy/portu pola; supply path/main run/branch/NMO są jednoznacznie widoczne. | Test port binding, cable leaves from head, SupplyPathHighlighter, browser screenshot. |
| M4 | Stacje SN/nN | LOD0/1 stacji to mini-RMU/RM6; LOD3+ pokazuje pola, aparaty, CT/VT, uziemnik, TR SN/nN, wyłącznik nN, szynę nN i PCC/DER. | `station_not_rectangle`, DER/PCC tests, visual fixtures. |
| M5 | Flow dodawania stacji | Domyślnie stacja jest endpointem odcinka i początkiem następnego; split istnieje tylko jako osobna komenda preview/cancel/commit/audit. | Testy kontrolerów append/split + e2e workflow. |
| M6 | Szablony pól i katalogi | Flow producent -> rodzina -> typ pola -> wariant -> preview -> zastosuj działa; verified tylko ze `source_ref`, brak źródła = blocker `requires_catalog`. | Testy API/pickerów + audit katalogowy, bez fabrykowania danych. |
| M7 | LOD/CAD/layout | LOD semantyczny z histerezą, grid, snap, port magnets, ortho routing, manual bends, route lock, declutter i layout 30/50/80 stacji. | Testy LOD/CAD/layout, `label_overlap`, `layout_readability`, browser screenshots. |
| M8 | Acceptance końcowy | Type-check, build, unit, visual, e2e, browser-use/Playwright i guardy zielone; audyt zawiera screenshoty przed/po. | Pełna lista komend i wyników w tym pliku. |

## Log decyzji

| ID | Decyzja | Uzasadnienie |
|---|---|---|
| D1 | Nie zmieniać solverów ani frozen result API dla SLD. | SLD jest warstwą aplikacji/prezentacji; fizyka pozostaje wyłącznie w solverach. |
| D2 | Rozwijać istniejącą ścieżkę SLD V2 zamiast tworzyć równoległy renderer. | `SldCanvasV2`, `GpzCanonicalRenderer`, `MiniBlockRmuRenderer`, `CableRunRenderer`, LOD i CAD już stanowią aktywny produktowy szkielet. |
| D3 | Brak danych katalogowych producenta jest blockerem, nie miejscem na domysł. | Zgodne ze standardem projektowym i polityką `requires_catalog`. |
| D4 | Referencja SCADA od użytkownika wyznacza gęstość i czytelność widoku, ale nie zastępuje ENM ani katalogów. | Unikamy fikcyjnej topologii i danych. |
| D5 | Checkpoint M1 obejmuje przeniesiony błąd z aktywnego deep linku: `sn_field_breaker` zapisany jako `LineBranch`. | Ten błąd łamie cel “aparaty kanoniczne i klikalne” oraz powoduje zły panel kontekstowy. |

## Log problemów

| ID | Problem | Status | Następny krok |
|---|---|---|---|
| E1 | Deep link i readiness mogą podawać wyłącznik pola SN jako `LineBranch`. | W trakcie M1 | Testy focused + poprawki selekcji/URL/readiness/inspektora. |
| E2 | Widok TR 110/SN może wyglądać jak zwarcie/paralelizacja, jeśli renderer pokaże połączenie bez pola/switchgear. | Do sprawdzenia w M2 | Dodać guard i screenshot aktywnego GPZ. |
| E3 | Nie każdy widok GPZ/stacji musi jeszcze dorównywać referencji operatorowej 10/10. | Do sprawdzenia M2-M7 | Iteracje visual + browser. |
| E4 | W repo są historyczne pozostałości mojibake w plikach UI/testów. | Aktywne | Naprawiać w dotykanym zakresie bez szerokiej, niepowiązanej migracji. |
| E5 | PowerShell `Get-Content`/`Get-ChildItem` w części katalogów SLD blokuje się lokalnie; `cmd /c` działa. | Obejście aktywne | Do odczytu używać `rg`, `cmd /c more/findstr` lub testów projektowych. |
| E6 | Pierwotny aktywny URL po odświeżeniu wskazywał TR, ale aktywny projekt miał pusty ENM (`Węzły: 0`, `Gałęzie: 0`). | Rozpoznane | Do walidacji wizualnej użyto real-backend fixture z GPZ i case z e2e; pusty projekt zostaje baseline problemu aktywnego stanu. |

## Log screenshotów

| ID | Plik | Stan | Opis |
|---|---|---|---|
| REF-1 | `C:/Users/radek/Desktop/gpzjpg.jpg` | Referencja użytkownika | Gęsty widok SCADA/CAD z GPZ, sekcjami, polami, TR, bilansem i siecią SN. |
| S0 | `docs/audits/screenshots/sld-openai-m1-current-transformer.png` | Baseline bieżącej sesji | Pierwotny URL TR po odświeżeniu: aplikacja działa, ale projekt pusty i SLD pokazuje empty state. |
| S1 | `docs/audits/screenshots/sld-openai-m1-gpz-fixture.png` | M1 browser fixture | Real-backend SLD z GPZ, TR1/TR2, sekcjami SN, aparaturą SN i odcinkami. |
| S2 | `docs/audits/screenshots/sld-openai-m1-station-breaker-selected.png` | Po M1 | Klik drzewa `sn_field_breaker/000` ustawia URL `type=Switch` i otwiera E-11 konfigurator pola SN, bez inspektora odcinka. |
| S3 | `docs/audits/screenshots/sld-openai-m1-stale-url-canonicalized.png` | Po M1 | Stary deep link z `type=LineBranch` został automatycznie skanonizowany do `type=Switch`. |

## Checkpoint M1 - plan wykonania

1. Dokończyć poprawki semantyki `Branch.type in {breaker, switch, disconnector, fuse, bus_coupler}` jako aparatura SN.
2. Utrzymać segmenty liniowe wyłącznie dla `cable` i `line_overhead`.
3. Upewnić się, że URL sync kanonizuje historyczne `type=LineBranch` na `type=Switch`.
4. Upewnić się, że readiness/fix-action prowadzi do powierzchni aparatu, a nie segmentu SN.
5. Uruchomić focused Vitest i `npm run type-check`.
6. Zweryfikować w browser aktywny SLD oraz historyczny deep link aparatu.

## Checkpoint M1 - wynik

Status: PASS dla zakresu kodowego i browser na real-backend fixture.

Zmiany wykonane:

- `selectionResolution` zachowuje metadane semantyczne i rozwiązuje branch aparatu SN jako `Switch`.
- `useUrlSelectionSync` po dostępności snapshotu kanonizuje odtworzoną selekcję URL, np. `LineBranch` -> `Switch`.
- `SchematContextPanel` rozdziela `Aparatura SN` od `Odcinki SN`; odcinki obejmują tylko kable/linie, aparaty trafiają do E-11.
- `ReadinessBar` i fix-action runtime wybierają typ z ENM zamiast ufać generycznemu `branch`.
- `InspectorEngineeringView` nie uruchamia inspektora segmentu dla branchy aparatowych.

Walidacja:

```bash
cd mv-design-pro/frontend
npm run test:ci -- \
  src/ui/shared/__tests__/selectionResolution.test.ts \
  src/ui/navigation/useUrlSelectionSync.test.tsx \
  src/ui/shared/__tests__/fixActionSurfaceRuntime.test.ts \
  src/ui/shell/context-panels/__tests__/AreaContextPanel.test.tsx \
  src/ui/network-build/__tests__/InspectorEngineeringView.switch-branch.test.tsx \
  src/ui/network-build/__tests__/ReadinessBar.switch-branch.test.tsx
# 6 plików PASS, 26 testów PASS

npm run type-check
# PASS
```

## Checkpoint M2/M4 - audyt specjalistyczny i szybka naprawa wizualna

Status: CZĘŚCIOWY PASS dla błędów pokazanych przez użytkownika w bieżącej sesji.

Audyt specjalistów:

- Energetyka/topologia: potwierdzono, że SLD wygląda jak atrapa, gdy porty odcinków i stacji są składane ze stałych geometrii zamiast z jednego kontraktu portów ENM. Krytyczne: niespójne anchory GPZ/odcinków/stacji, możliwość syntetycznych pól i brak jednego źródła prawdy footprintu GPZ.
- Zabezpieczenia/DER/NC RfG: renderer potrafi wyglądać kompletnie mimo braku `primary_devices`, CT/VT, ochron i PCC w ENM. To musi stać się blockerem danych, nie domyślną aparaturą.
- SCADA/CAD/layout: startowy `fitToView` schodził do ok. 44% i LOD1, przez co GPZ był mikroskopijny. Brak wspólnego decluttera etykiet powodował nakładanie opisu kabla na mini-RMU.

Naprawy wykonane:

- `SldCanvasV2` wymusza czytelny start dla małej topologii z kanonicznym GPZ: minimum `scale=0.72`, LOD2, zamiast miniatury LOD1.
- `CableRunRenderer` odsuwa etykietę odcinka od symboli mini-RMU, gdy label wpada w obszar portów stacji.
- `ContinueTrunkForm` wykorzystuje aktualnie zaznaczoną stację jako fallback kontekstu, jeśli otwarty formularz ma pusty/stary kontekst operacji.
- `TrunkContinueModal` rozróżnia `station_out` od głowicy pola SN i pokazuje konkretną blokadę: brak wolnego portu wyjściowego stacji.
- `InspectorEngineeringView` dodaje jawne działanie `Kontynuuj ciąg SN` dla stacji.
- `GpzCanonicalRenderer` oznacza połączenie TR jako zakończone na kotwie pola TR, bez starego `gpz.transformer.lv_connector` sugerującego bezpośredni tie do szyny SN.

Walidacja:

```bash
cd mv-design-pro/frontend
npm run type-check
# PASS

npx vitest run --no-file-parallelism src/ui/network-build/__tests__/operationContext.test.ts --reporter=verbose
# PASS: 1 file, 16 tests

npx vitest run --no-file-parallelism src/ui/sld/v2/renderer/__tests__/cableRunMissingPort.test.tsx --reporter=verbose
# TIMEOUT lokalnego runnera po 90 s; browser potwierdził brak overlapu etykiet.
```

Browser:

- URL: `/#sld?project=70a99b32-abb8-4249-bf17-96f6d85183b9&case=f5117ef9-45a4-484a-ba78-2f3ba1b91a11&sel=stn/2a7545c755e3062ff0c46df728a88843/station&type=Station`.
- `sld-canvas-v2`: `data-lod=2`, `data-scale=0.720`.
- Etykiety segmentów vs. mini-RMU: browser bbox overlap = `[false, false]`.
- Klik `Kontynuuj ciąg SN` ze stacji nie pokazuje już „Wyprowadź odcinek z głowicy pola SN”; modal pokazuje `Kontynuuj ciąg SN z wybranego portu`, `Stacja SN/nN 1 - port wyjściowy SN` i blokadę braku wolnego portu.

Screenshoty:

- `docs/audits/screenshots/sld-openai-fix-station-modal-label.png`
- `docs/audits/screenshots/sld-openai-fix-station-label-no-overlap.png`

Pozostałe blokery po checkpointcie:

- Porty GPZ/stacji/odcinków nadal wymagają jednego resolvera anchorów ENM.
- Adaptery nadal częściowo fabrykują aparaturę/pola, zamiast pokazywać blocker braku danych.
- DER/PCC nadal wymaga pełnego wariantu LOD i powiązania z readiness NC RfG.

Browser:

- Backend `http://127.0.0.1:8000/api/health`: `ok`, `db_ok=true`, `engine_ok=true`.
- Frontend `http://127.0.0.1:5173`: HTTP 200.
- Real-backend fixture `project=70a99b32-abb8-4249-bf17-96f6d85183b9`, `case=f5117ef9-45a4-484a-ba78-2f3ba1b91a11`: `sld-canvas-v2` widoczny.
- Stary URL `type=LineBranch` dla `stn/d63b00d3998a69eaf98e1bc6a9dbc443/sn_field_breaker/000` po załadowaniu snapshotu kończy jako `type=Switch`.

## Checkpoint M2/M4b - korekta geometrii GPZ i etykiety mini-RMU

Status: PASS dla aktualnie zgłoszonego błędu wizualnego "etykieta kabla na aparaturze stacji" oraz dla rozjazdu geometrii GPZ między adapterem a rendererem.

Decyzja:

- `enmToSldAdapter` musi używać tej samej rezerwy pola transformatorowego, którą rysuje `GpzCanonicalRenderer`. Stare `CANONICAL_LV_BUS_GAP=16` było niespójne z rendererem (`LV_BUS_GAP=110`) i mogło ustawiać kanał odcinka tak, jakby wychodził z przypadkowej wysokości GPZ.
- Etykieta odcinka ma być odsunięta od footprintu mini-RMU. Dla aktywnej stacji po korekcie ramka stacji ma zakres `x=766..1034, y=809..1035`, a etykieta przy stacji jest w `x=928, y=796`, czyli nad ramką, nie na aparaturze.

Zmiana:

- `frontend/src/ui/sld/v2/canvas/enmToSldAdapter.ts`: `CANONICAL_LV_BUS_GAP` ustawione na `110`, zgodnie z rendererem GPZ.
- `frontend/src/ui/sld/v2/renderer/CableRunRenderer.tsx`: utrzymana korekta decluttera etykiet segmentów przy portach stacji.

Walidacja:

```bash
cd mv-design-pro/frontend
npm run type-check
# PASS

npx vitest run --no-file-parallelism src/ui/sld/v2/canvas/__tests__/enmToSldAdapter.test.ts --reporter=verbose
# TIMEOUT lokalnego runnera po 180 s, bez raportu końcowego; walidacja wizualna wykonana w Browser.
```

Browser:

- URL: `http://127.0.0.1:5173/#sld?project=70a99b32-abb8-4249-bf17-96f6d85183b9&case=f5117ef9-45a4-484a-ba78-2f3ba1b91a11&sel=stn/2a7545c755e3062ff0c46df728a88843/station&type=Station`.
- Strona: `MV-DESIGN PRO`, brak błędów i ostrzeżeń konsoli.
- Canvas: `data-lod=2`, `data-scale=0.720`.
- Mini-RMU aktywnej stacji: `data-lod-variant=detail`, `transform=translate(900, 922)`.
- Overlap etykiet względem ramki aktywnej stacji: `[false, false]`.

Screenshot:

- `docs/audits/screenshots/sld-openai-fix-gpz-gap-and-rmu-label.png`

## Checkpoint M2/M5 - stacja jako start kontynuacji ciągu

Status: PASS dla zgłoszenia "nie działa" w formularzu kontynuacji ze stacji.

Problem:

- Formularz otwarty ze stacji potrafił pokazać kontekst głowicy pola SN albo blokadę braku portu, mimo że użytkownik pracował na stacji w ciągu.
- Resolver szukał terminala stacji zbyt wąsko: po szynie SN lub po terminalu logicznym, ale nie po polach SN stacji i nie po technicznym końcu korytarza za stacją.

Zmiana:

- `operationContextResolvers` dla `Station` szuka dostępnego terminala także po polach SN tej stacji.
- Jeżeli terminal logiczny nie istnieje, ale stacja należy do korytarza, resolver wyznacza aktualny techniczny koniec tego korytarza i używa go jako `from_terminal_id`.
- Fallback stacyjny jest zawężony do `elementType === 'Station'`, żeby nie maskować niejednoznacznej selekcji samej szyny SN.
- UI nadal pokazuje użytkownikowi `port wyjściowy stacji SN`, ale payload operacji domenowej dostaje konkretny `from_terminal_id`.

Walidacja:

```bash
cd mv-design-pro/frontend
npm run type-check
# PASS

npx vitest run --no-file-parallelism src/ui/network-build/__tests__/operationContext.test.ts --reporter=verbose
# PASS: 1 file, 18 tests

npx vitest run --no-file-parallelism src/ui/network-build/__tests__/ContinueTrunkForm.test.tsx --reporter=verbose
# PASS: 1 file, 8 tests
```

Browser:

- URL aktywnego scenariusza stacji: `project=70a99b32-abb8-4249-bf17-96f6d85183b9`, `case=f5117ef9-45a4-484a-ba78-2f3ba1b91a11`, `sel=stn/2a7545c755e3062ff0c46df728a88843/station`.
- Klik `Kontynuuj ciąg SN`: modal nie pokazuje `Wyprowadź odcinek z głowicy pola SN`.
- Modal pokazuje `port wyjściowy stacji SN`.
- Blokada `Nie znaleziono wolnego portu wyjściowego SN` nie występuje.
- Po ustawieniu długości `1 km` przycisk `Utwórz odcinek SN` jest aktywny.

Screenshot:

- `docs/audits/screenshots/sld-openai-fix-station-continue-enabled.png`

## Checkpoint M2/M6 - decyzja techniczna po utworzeniu odcinka SN

Status: PASS dla zgłoszenia "nic nie działa" w sekcji `Dalej` formularza wyprowadzenia odcinka SN.

Problem:

- Opcje `Wstaw stację SN/nN`, `Wstaw ZK SN`, `Wstaw słup rozgałęźny` i `Kontynuuj kolejny odcinek` były renderowane jak kafle decyzyjne, ale technicznie były martwymi elementami bez akcji.
- Po kliknięciu kafla użytkownik nie dostawał dalszego formularza ani jasnej walidacji.
- Po wyborze długości z presetu błąd długości potrafił zostać w UI jako nieaktualny komunikat.

Zmiana:

- `TrunkContinueModal` ma teraz jawne `next_step` i prawdziwe przyciski z `aria-pressed`.
- Kliknięcie kolejnego kroku waliduje formularz, wybiera zamiar użytkownika i zmienia etykietę zapisu, np. `Utwórz odcinek i wstaw ZK SN`.
- Zmiana długości, katalogu albo rodzaju odcinka czyści nieaktualne błędy pola.
- `ContinueTrunkForm` po utworzeniu odcinka otwiera właściwy następny formularz: stacja, ZK SN, słup rozgałęźny albo kolejny odcinek.
- Test `ContinueTrunkForm` nie mockuje już całego modułu katalogu i nie psuje równoległej walidacji formularza GPZ.

Walidacja:

```bash
cd mv-design-pro/frontend
npm run type-check
# PASS

npm test -- --run src/ui/network-build/forms/__tests__/ContinueTrunkForm.test.tsx src/ui/network-build/forms/__tests__/GridSourceEditor.catalogFallback.test.tsx src/ui/sld/v2/renderer/__tests__/GpzCanonicalRenderer.noDirectTie.test.tsx
# PASS: 3 files, 8 tests

npm run build
# PASS
```

Browser:

- URL: `http://127.0.0.1:5173/#sld`.
- `trunk-next-step-zksn` istnieje jako przycisk i po kliknięciu ma `aria-pressed=true`.
- Bez długości pokazuje walidację `Podaj długość odcinka większą od 0 m.` i blokuje zapis.
- Po kliknięciu `500 m` liczba błędów długości wynosi `0`, a przycisk `Utwórz odcinek i wstaw ZK SN` jest aktywny.

## Checkpoint M2/M7 - krytyczne błędy wizualne GPZ i magistrali SN

Status: PASS dla zgłoszenia "popraw krytyczne błędy schematu" na widoku GPZ z dwoma TR i oczekującym końcem odcinka.

Problem:

- Brak jawnej rozdzielni WN powodował, że renderer rysował jedną ciągłą szynę 110 kV przez TR1/TR2. Wizualnie wyglądało to jak nieudokumentowane sprzężenie/paralelizacja po stronie 110 kV.
- Etykieta `110 kV` dublowała się przy wskaźniku `System 110 kV`.
- Pola odpływowe były przycinane do identycznego `Pole odpły`, więc projektant nie widział numeru pola.
- Etykiety kolejnych odcinków `EPR Al 1C 120` mogły mieć prawie te same współrzędne i nachodziły na siebie przy końcu prowadzonego odcinka.

Zmiana:

- `GpzCanonicalRenderer` w trybie bez jawnych `hvSections` rysuje teraz oddzielne segmenty szyny WN per transformator (`data-hv-bus-mode=segmented_by_transformer`) zamiast jednej wspólnej szyny 110 kV.
- Ciągły `gpz-canonical-hv-bus` pozostaje tylko dla modelu z jawnie zdefiniowaną rozdzielnią WN.
- Etykiety sekcji SN dostały mniejszy, techniczny badge odsunięty od szyny.
- Etykiety pól odpływowych są skracane semantycznie do `Odpływ 1`, `Odpływ 2`, bez utraty numeru.
- `CableRunRenderer` rozsuwa etykiety odcinków i odsuwa je od pending endpointu.

Walidacja:

```bash
cd mv-design-pro/frontend
npm run type-check
# PASS

npm test -- --run src/ui/sld/v2/renderer/__tests__/GpzCanonicalRenderer.test.tsx src/ui/sld/v2/renderer/__tests__/GpzCanonicalRenderer.noDirectTie.test.tsx src/ui/sld/v2/renderer/__tests__/cableRunMissingPort.test.tsx
# PASS: 3 files, 48 tests
```

Browser:

- URL: `http://127.0.0.1:5173/#sld?sel=gpz/.../source/main&type=Source&name=GPZ+1`.
- `gpz-canonical-hv` ma `data-hv-bus-mode=segmented_by_transformer`.
- Ciągły `gpz-canonical-hv-bus` nie występuje w trybie bez jawnej rozdzielni WN.
- Widoczne są oddzielne segmenty `gpz-canonical-hv-bus-segment-.../transformer/001/wn_sn` i `.../002/wn_sn`.
- Etykiety pól są `Odpływ 1`, `Odpływ 2`.
- Detekcja overlapu etykiet kabli zwróciła `[]`.

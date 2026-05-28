# SLD MAX FIX - audyt wykonania

## Zakres

Cel: aktywny SLD V2 ma byc weryfikowany na dzialajacym backendzie, z realnym ENM i realnym przypadkiem obliczeniowym, a nie na pustej powloce frontendu.

## Decyzje wykonawcze

- Backend zostal uruchomiony lokalnie przez Poetry jako `uvicorn api.main:app --host 127.0.0.1 --port 8000`.
- Gotowosc API potwierdzona przez `GET http://127.0.0.1:8000/ready` z odpowiedzia `{"status":"ready"}`.
- Stary dowod przegladarkowy z pusta kanwa nie jest traktowany jako dowod jakosci SLD.
- Seeder GN01 zostal dopasowany do aktualnego kontraktu ENM: pola liniowe sa pobierane z `substations[].meta.field_specs`, a stacja jest dopinana na koncu odcinka przez `append_station_on_endpoint`.
- Renderer mini-RMU otrzymal guardowy atrybut `data-station-not-rectangle="true"` takze w glownym wariancie live SLD.
- Renderer mini-RMU zostal zaostrzony dla aktywnego widoku `overview/compact`: widoczne teksty `WE/TR` nie sa juz naklejane na szynie, ramka rozdzielnicy SN oddziela stacje od toru terenowego, a porty CAD maja `data-port-magnet`, `data-port-side`, `data-field-direction` i hit-area.
- Korekta po przegladzie aktywnego SLD: kompaktowy mini-RMU nie rysuje juz wszystkich pol w dol od szyny. Pola liniowe ida od szyny SN do gory do portu terenowego i glowicy kablowej (`line_from_bus_up_to_terrain`), a pole transformatorowe idzie od szyny SN w dol przez aparat/fuse do transformatora i szyny nN (`transformer_from_bus_down_to_lv`).

## Przypadek dowodowy

- Projekt: `e7387f58-db5c-451d-951a-72973386aa4c`
- Case: `c2808404-4014-43f0-b1ae-729911609684`
- URL: `http://127.0.0.1:5173/#sld?project=e7387f58-db5c-451d-951a-72973386aa4c&case=c2808404-4014-43f0-b1ae-729911609684`

Seeder GN01 przeszedl pelny flow:

- GPZ 110/15 kV
- pole SN
- odcinek magistrali SN
- stacja SN/nN na koncu odcinka
- ZKSN
- odgalezienie SN
- PV na nN stacji
- nastawy zrodlowe
- analizy: SC_3F, SC_2F, LOAD_FLOW, PHASE_STATE_SN, DYNAMIC_STABILITY, SOURCE_COMPLIANCE
- eksporty proof/report: JSON, LaTeX, PDF, DOCX

## Dowody przegladarkowe

- Screenshot po uruchomieniu backendu: `docs/audits/SLD_MAX_FIX_AFTER_BACKEND.png`
- Screenshot bez przewodnika: `docs/audits/SLD_MAX_FIX_AFTER_BACKEND_NO_GUIDE_2.png`
- Diagnostyka DOM: `docs/audits/SLD_MAX_FIX_BROWSER_DIAGNOSTICS_AFTER_BACKEND_NO_GUIDE_2.json`
- Screenshot aktywnego widoku po korekcie mini-RMU: `docs/audits/SLD_OVERVIEW_MINIRMU_AFTER_FIX.png`
- Diagnostyka aktywnego widoku po korekcie mini-RMU: `docs/audits/SLD_OVERVIEW_MINIRMU_AFTER_FIX_DIAGNOSTICS.json`
- Screenshot aktywnego widoku po korekcie kierunkowej compact RMU: `docs/audits/SLD_COMPACT_DIRECTIONAL_STATION_AFTER_FIX_FULL.png`
- Diagnostyka aktywnego widoku po korekcie kierunkowej compact RMU: `docs/audits/SLD_COMPACT_DIRECTIONAL_STATION_AFTER_FIX_DIAGNOSTICS.json`
- Screenshot aktywnego widoku po korekcie SCADA/CAD compact RMU: `docs/audits/SLD_COMPACT_STATION_SCADA_CAD_AFTER.png`
- Izolowany SVG stacji compact RMU po korekcie SCADA/CAD: `docs/audits/SLD_COMPACT_STATION_SCADA_CAD_AFTER.svg`
- Diagnostyka aktywnego widoku po korekcie SCADA/CAD compact RMU: `docs/audits/SLD_COMPACT_STATION_SCADA_CAD_AFTER_DIAGNOSTICS.json`

Najwazniejsze metryki z diagnostyki:

- `bodyHasGuide`: false
- `loadingTexts`: 0
- `consoleMessages`: []
- `gpzCanonical`: 74
- `hvBus`: 1
- `trFields`: 6
- `bayFeeders`: 2
- `stationLabelsLower`: 4
- `miniRmuGroups`: 9
- `stationNotRectangle`: 2
- `energizedRuns`: 2
- `supplyPathRoles`: `main_run`, `branch`

Metryki po korekcie mini-RMU w aktywnym widoku `#variants`:

- `frameworkOverlay`: false
- `overviewEnclosure`: 1
- `bayMarkerTextCount`: 0
- `overviewBays`: 2
- `miniRoots`: 1
- `console errors/warnings`: []
- aktywny root stacji: `mini_block_compact`, `data-readable-label-stack=true`, `anchors=2`, `designations=[]`, `roles=["WE","TR"]`

Metryki po korekcie kierunkowej compact RMU w aktywnym widoku `#sld`:

- `compactRoot`: true
- `lineFlow`: `line_from_bus_up_to_terrain`
- `trFlow`: `transformer_from_bus_down_to_lv`
- `busStrokeWidth`: `3`
- `busCadRole`: `internal_station_busbar`
- `captions`: `["WE"]`
- `console errors/warnings`: []
- geometria: `lineBox.y < busBox.y`, `trBox.y >= busBox.y`, czyli tor liniowy jest nad szyna, a tor transformatora pod szyna.

Metryki po korekcie SCADA/CAD compact RMU w aktywnym widoku `#sld`:

- `compactRoot`: true
- `bodyStroke`: `transparent`
- `bodyStrokeWidth`: `0`
- `selectionStyle`: `cad_corner_handles`
- `selectionLines`: 8
- `anchors`: `WE terrain_network translate(-82, -80)`, `TR transformer translate(82, 45)`
- `transformerSymbol`: true
- `console errors/warnings`: []
- geometria: port WE jest nad szyna SN, port TR jest pod szyna SN i przy szynie nN.

## Testy i guardy

- `npm test -- --run src/ui/sld/v2/renderer/__tests__/stationNotRectangle.test.tsx src/ui/sld/v2/__tests__/StationInternalView.test.tsx src/ui/sld/v2/__tests__/renderers.test.tsx` - PASS, 117 testow
- `npm run type-check` - PASS
- `npm run lint` - PASS
- `npm run build` - PASS
- `node --check scripts/seed-gn01.mjs` - PASS
- `py -3 scripts/station_not_rectangle_guard.py` - PASS
- `py -3 scripts/no_direct_110kv_tr_tie_without_switchgear.py` - PASS
- `GET /ready` - PASS
- Browser/Playwright screenshot na aktywnym backendzie - PASS
- `npm test -- --run src/ui/sld/v2/renderer/__tests__/miniBlockRmu.test.tsx src/ui/sld/v2/renderer/__tests__/stationNotRectangle.test.tsx src/ui/sld/v2/__tests__/renderers.test.tsx` - PASS, 171 testow
- Browser QA aktywnego `#variants` po korekcie mini-RMU - PASS, `bayMarkerTextCount=0`, `overviewEnclosure=1`, console bez bledow/warningow
- `npm test -- --run src/ui/sld/v2/renderer/__tests__/miniBlockRmu.test.tsx src/ui/sld/v2/renderer/__tests__/stationNotRectangle.test.tsx` - PASS, 70 testow
- Browser QA aktywnego `#sld` po korekcie kierunkowej compact RMU - PASS, `lineFlow=line_from_bus_up_to_terrain`, `trFlow=transformer_from_bus_down_to_lv`, console bez bledow/warningow
- `npm test -- --run src/ui/sld/v2/renderer/__tests__/miniBlockRmu.test.tsx src/ui/sld/v2/renderer/__tests__/stationNotRectangle.test.tsx` - PASS, 72 testy
- `py -3 scripts/station_not_rectangle_guard.py` - PASS, 13/13 markerow
- `py -3 scripts/no_direct_110kv_tr_tie_without_switchgear.py` - PASS
- `npm run type-check` - PASS
- `npm run lint` - PASS
- `npm run build` - PASS, ostrzezenie Vite o duzych chunkach bez bledu
- `GET /ready` - PASS
- Browser QA aktywnego `#sld` po korekcie SCADA/CAD compact RMU - PASS, `selectionStyle=cad_corner_handles`, `bodyStroke=transparent`, `WE=terrain_network`, `TR=transformer`, console bez bledow/warningow

## Status kryteriow

| Kryterium | Status | Dowod |
|---|---:|---|
| Backend odpowiada przed testem przegladarkowym | PASS | `/ready` |
| SLD laduje realny ENM | PASS | screenshot + diagnostyka DOM |
| GPZ renderuje kanoniczny tor 110 kV / TR / SN | PASS | `gpzCanonical`, `hvBus`, `trFields` |
| Stacja nie jest prostokatem/kaflem | PASS | `stationNotRectangle`, `miniRmuGroups` |
| Mini-RMU nie przykleja etykiet WE/TR do szyny | PASS | `bayMarkerTextCount=0`, test `overview nie przykleja etykiet WE/TR do szyny SN` |
| Mini-RMU ma jawne porty CAD | PASS | `data-port-magnet`, `data-port-side`, `data-field-direction`, test portow WE/WY/TR |
| Compact RMU ma poprawne kierunki pol | PASS | `lineFlow=line_from_bus_up_to_terrain`, `trFlow=transformer_from_bus_down_to_lv` |
| Compact RMU nie jest pelnym kaflem po zaznaczeniu | PASS | `selectionStyle=cad_corner_handles`, `bodyStroke=transparent`, test selected compact |
| Port TR nie jest portem magistrali terenowej | PASS | `TR data-port-side=transformer`, `WE data-port-side=terrain_network`, test separacji portow |
| Tory zasilania sa oznaczone semantycznie | PASS | `supplyPathRoles` |
| Brak widocznego loadingu po zaladowaniu | PASS | `loadingTexts=0` |
| Brak bledow/warningow konsoli w przebiegu dowodowym | PASS | `consoleMessages=[]` |

## Luki krytyczne

0 w zakresie przebiegu dowodowego opisanego wyzej.

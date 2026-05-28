# SLD Industrial SCADA/CAD Runbook

## Cel

Doprowadzic aktywny SLD V2 MV-DESIGN-PRO do przemyslowego standardu SCADA/CAD w maksymalnym bezpiecznym zakresie biezacego przebiegu. SLD ma pozostac widokiem ENM/topologii, a nie niezalezna grafika.

## Przeczytane instrukcje i dokumenty

- `AGENTS.md`
- `mv-design-pro/AGENTS.md`
- `docs/v12xx/KANON_V12_XX.md`
- `docs/system/SPEC_ARCHITEKTURA_SYSTEMU.md`
- `docs/system/SPEC_BACKEND_SOLVERS.md`
- `docs/system/SPEC_FRONTEND_UX.md`
- `docs/system/SPEC_INTEGRATION_API.md`
- `docs/system/SPEC_SECURITY_AUDIT.md`
- `docs/system/SPEC_TESTING_QA.md`
- `docs/sld/STACJE_ELEKTROENERGETYCZNE_PROJECT_STANDARD.md`
- `docs/sld/SLD_CONTRACT_FLOW_V1.md`
- `docs/sld/SLD_INDUSTRIAL_SPEC_v1.md`
- `docs/sld/SLD_INDUSTRIAL_SCADA_CAD_TARGET.md`

## Mapa implementacji

- Canvas: `frontend/src/ui/sld/v2/canvas/SldCanvasV2.tsx`
- Adapter ENM -> SLD: `frontend/src/ui/sld/v2/canvas/enmToSldAdapter.ts`
- GPZ: `frontend/src/ui/sld/v2/renderer/GpzCanonicalRenderer.tsx`
- Stacja mini-RMU/RM6: `frontend/src/ui/sld/v2/renderer/MiniBlockRmuRenderer.tsx`
- Layout stacji: `frontend/src/ui/sld/v2/renderer/MiniBlockBayLayout.ts`
- Ciagi kablowe: `frontend/src/ui/sld/v2/renderer/CableRunRenderer.tsx`
- Aparaty: `frontend/src/ui/sld/v2/renderer/GpzApparatusSymbols.tsx`
- Testy stacji: `frontend/src/ui/sld/v2/renderer/__tests__/miniBlockRmu.test.tsx`
- Guard WE/WY: `scripts/sld_no_external_we_wy_bridge_guard.py`
- Guardy SLD: `scripts/station_not_rectangle_guard.py`, `scripts/label_overlap_guard.py`, `scripts/layout_readability_guard.py`, `scripts/enm_adapter_consistency_guard.py`

## Claude design review

- Prompt: `docs/audits/CLAUDE_DESIGN_REVIEW_sld_industrial_scada_cad_20260527_180619.prompt.md`
- Review: `docs/audits/CLAUDE_DESIGN_REVIEW_sld_industrial_scada_cad_20260527_180619.md`
- Meta: `docs/audits/CLAUDE_DESIGN_REVIEW_sld_industrial_scada_cad_20260527_180619.meta.json`
- Decyzje: `docs/audits/CLAUDE_DESIGN_REVIEW_sld_industrial_scada_cad_20260527_180619.decision.md`

## Defekty z aktualnego browser evidence

| ID | Priorytet | Defekt | Status |
| --- | --- | --- | --- |
| SLD-001 | critical | Kompaktowa stacja pokazuje pomocniczy napis `przerwa`, ktory wyglada jak latka graficzna zamiast schematu aparaturowego. | do poprawy |
| SLD-002 | critical | WE/WY w LOD compact nadal moze byc odczytane jako sztuczny mostek albo zwarcie, bo zewnetrzny kabel terenowy i wewnetrzna szyna SN nie sa wystarczajaco rozdzielone. | do poprawy |
| SLD-003 | major | Symbol transformatora w stacji jest zbyt slaby wizualnie w widoku kompaktowym; kontrakt musi wymuszac dwa przecinajace sie okregi, hit area i osobna konfiguracje. | do poprawy |
| SLD-004 | major | Dlugie ciagi maja nadal ryzyko kolizji etykiet i pustych obszarow; guardy musza pozostac aktywne. | monitorowane |
| SLD-005 | major | Stary runbook deklarowal PASS, ale nowe zrzuty uzytkownika przecza praktycznej czytelnosci. Ten runbook traktuje stare PASS jako nieaktualne do czasu nowego browser retestu. | przyjete |

## Decyzje projektowe

- SLD mini-RMU ma pokazywac dwa rozne poziomy: kabel terenowy na portach WE/WY oraz wewnetrzna szyne SN laczaca pola. Te linie nie moga byc narysowane jako jeden ciag przez stacje.
- Widoczna etykieta `przerwa` jest usuwana. Kontrakt rozdzialu zostaje w atrybutach `data-*`, testach i guardach.
- Transformator SN/nN pozostaje osobnym klikalnym elementem w polu TR; symbol to dwa przecinajace sie okregi.
- Brak zmian solverow i frozen result API w tej iteracji.

## Komendy walidacyjne

Planowane minimum po poprawce:

```powershell
cd C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro\frontend
npm test -- --run src/ui/sld/v2/renderer/__tests__/miniBlockRmu.test.tsx
npm run type-check
npm run build

cd C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro
python scripts/sld_no_external_we_wy_bridge_guard.py
python scripts/station_not_rectangle_guard.py
python scripts/label_overlap_guard.py
python scripts/layout_readability_guard.py
python scripts/enm_adapter_consistency_guard.py
```

## Screenshoty

| Etap | Plik | Status |
| --- | --- | --- |
| before | `tmp/sld-industrial/browser/00_before.png` | wykonane |
| after reload | `tmp/sld-industrial/browser/01_after.png` | wykonane, stan loading |
| after loaded | `tmp/sld-industrial/browser/02_after_loaded.png` | wykonane |
| after diagnostics | `tmp/sld-industrial/browser/02_after_loaded_diagnostics.json` | wykonane |
| station selected diagnostics | `tmp/sld-industrial/browser/03_station_selected_diagnostics.json` | wykonane; screenshot CDP timeout |
| latest active SLD diagnostics | `tmp/sld-industrial/browser/10_active_sld_after_latest_fixes_diagnostics.json` | wykonane przez in-app browser; screenshot CDP timeout |
| latest active SLD screenshot | `tmp/sld-industrial/browser/11_active_sld_playwright_after_latest_fixes.png` | wykonane przez Playwright fallback po timeout CDP in-app browser |
| latest active SLD diagnostics fallback | `tmp/sld-industrial/browser/11_active_sld_playwright_after_latest_fixes_diagnostics.json` | wykonane |

## Wynik implementacji biezacej iteracji

- `MiniBlockRmuRenderer.tsx`: widoczny napis `przerwa` zostal usuniety z aktywnego SVG. Pozostal jawny kontrakt danych `data-guard="no_external_we_wy_bridge"`, `data-render-contract="mask_only_not_electrical_element"` i `data-visible-label="false"`.
- `miniBlockRmu.test.tsx`: regresja compact sprawdza brak widocznej etykiety, brak zewnetrznego mostka WE-WY, oddzielne stuby portow terenowych oraz dropy do wewnetrznej szyny SN.
- `sld_no_external_we_wy_bridge_guard.py`: guard blokuje powrot widocznej etykiety `przerwa` i wymaga kontraktu mask-only.

## Wyniki walidacji

| Komenda | Wynik |
| --- | --- |
| `npm test -- --run src/ui/sld/v2/renderer/__tests__/miniBlockRmu.test.tsx` | PASS, 65/65 |
| `py scripts/sld_no_external_we_wy_bridge_guard.py` | PASS |
| `py scripts/station_not_rectangle_guard.py` | PASS |
| `py scripts/label_overlap_guard.py` | PASS |
| `py scripts/layout_readability_guard.py` | PASS |
| `py scripts/enm_adapter_consistency_guard.py` | PASS |
| `py scripts/no_direct_110kv_tr_tie_without_switchgear.py` | PASS |
| `py scripts/cable_leaves_from_head_guard.py` | PASS |
| `py scripts/der_pcc_guard.py` | PASS |
| `py scripts/lod_hysteresis_guard.py` | PASS |
| `py scripts/false_zero_guard.py` | PASS |
| `py scripts/forbidden_ui_terms_guard.py` | PASS |
| `py scripts/dead_click_guard.py` | PASS; 375 wywolan akcji menu, 110 akcji engineering menu, 51 akcji SLD V2, 51 pokrytych aktywnym routingiem |
| `npm run type-check` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS, z ostrzezeniem Vite o duzych chunkach |
| `npm run test:e2e -- e2e/sld-supply-path-visibility.spec.ts` | PASS, 7 passed / 2 skipped |
| `npm test` | Historycznie TIMEOUT po 5 i 15 minutach; ponowna proba po naprawie `window.confirm` zakonczyla sie PASS - patrz sekcja iteracji 19:18 |

## Browser diagnostics

`tmp/sld-industrial/browser/02_after_loaded_diagnostics.json`:

```json
{
  "hasPrzerwaText": false,
  "transformerSymbols": [
    {
      "overlap": "7.2",
      "role": "button",
      "testid": "sld-symbol-mini-transformer-stn/ac3f845407ac60c5df26c7e641dacec2/transformer"
    }
  ]
}
```

`tmp/sld-industrial/browser/03_station_selected_diagnostics.json`:

```json
{
  "hasPrzerwaText": false,
  "stationFound": true,
  "stationLod": "compact",
  "stationRole": "button",
  "noExternalBridgeGuard": true,
  "gapVisibleLabel": "false",
  "gapContract": "mask_only_not_electrical_element",
  "transformerSymbols": [
    {
      "overlap": "7",
      "role": "button",
      "testid": "sld-symbol-mini-transformer-stn/ac3f845407ac60c5df26c7e641dacec2/transformer"
    },
    {
      "overlap": "7",
      "role": null,
      "testid": "sld-v2-mini-rmu-compact-transformer-symbol"
    }
  ]
}
```

`tmp/sld-industrial/browser/10_active_sld_after_latest_fixes_diagnostics.json`:

```json
{
  "hasSldCanvas": true,
  "hasVisiblePrzerwaText": false,
  "noExternalBridgeGuard": true,
  "noExternalBridgeAttrs": {
    "data-guard": "no_external_we_wy_bridge",
    "data-render-contract": "mask_only_not_electrical_element",
    "data-visible-label": "false"
  },
  "visibleErrors": []
}
```

## Iteracja interakcji SLD 2026-05-27 19:18

Defekt wykryty przez `dead_click_guard.py`: rejestr SLD V2 zawieral akcje `delete-zksn` i `delete-branch-pole`, ktore byly renderowane w menu, ale nie mialy aktywnej sciezki wykonania. To naruszalo wymaganie "kazdy element klikalny i konfigurowalny".

Naprawa:

- `SldWorkspaceContainer.tsx`: dodano bezposredni routing akcji usuwania obiektow SLD do operacji domenowej `delete_element` z potwierdzeniem, przekazaniem `element_ref`, `action_id` i `source: "sld_context_menu"`.
- `SldWorkspaceContainer.tsx`: dodano polskie etykiety usuwanych obiektow dla `delete-bay`, `delete-segment`, `delete-station`, `delete-zksn`, `delete-branch-pole`, `delete-pv`, `delete-bess`, `delete-fw`.
- `SldContextMenuController.test.tsx`: dodano regresje, ze menu ZK SN przekazuje `delete-zksn` do aktywnego routingu SLD.
- `dead_click_guard.py`: guard parsuje rzeczywiste `action(...)`, rejestr SLD, routing operacji, mapy ekranow, mapy delete i modal registry. Guard failuje, gdy akcja renderowana w SLD nie ma aktywnej sciezki.
- `SldWorkspaceContainer.test.tsx`: cleanup testow hydratacji URL/snapshotu objety `act(...)`; ostrzezenia React `act(...)` usuniete w celowanym pakiecie.

Walidacja najnowszej iteracji:

| Komenda | Wynik |
| --- | --- |
| `npm test -- --run src/ui/context-menu/__tests__/SldContextMenuController.test.tsx src/ui/sld/v2/canvas/__tests__/SldWorkspaceContainer.test.tsx src/ui/sld/v2/renderer/__tests__/miniBlockRmu.test.tsx` | PASS, 98/98, bez ostrzezen `act(...)` |
| `npm run type-check` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS, tylko ostrzezenie Vite o duzych chunkach |
| `py scripts/dead_click_guard.py` | PASS; 51/51 akcji SLD V2 pokrytych routingiem |
| `py scripts/sld_no_external_we_wy_bridge_guard.py` | PASS |
| `py scripts/station_not_rectangle_guard.py` | PASS |
| `py scripts/label_overlap_guard.py` | PASS |
| `py scripts/layout_readability_guard.py` | PASS |
| `py scripts/enm_adapter_consistency_guard.py` | PASS |
| `py scripts/no_direct_110kv_tr_tie_without_switchgear.py` | PASS |
| `py scripts/cable_leaves_from_head_guard.py` | PASS |
| `py scripts/der_pcc_guard.py` | PASS |
| `py scripts/lod_hysteresis_guard.py` | PASS |
| `py scripts/false_zero_guard.py` | PASS |
| `py scripts/forbidden_ui_terms_guard.py` | PASS |
| `npm run test:e2e -- e2e/sld-supply-path-visibility.spec.ts` | PASS, 7 passed / 2 skipped |
| `npm test` | PASS, pelny Vitest po usunieciu `window.confirm`; pozostaly ostrzezenia testowe spoza SLD fix: `GridSourceEditor`, `StudyCaseList`, export jsdom navigation, AnonymizationProvider expected-error path |

Browser retest:

- In-app browser: DOM retest aktywnego URL potwierdzil `hasSldCanvas=true`, `hasVisiblePrzerwaText=false`, `noExternalBridgeGuard=true`, brak widocznych bledow strony. `Page.captureScreenshot` przekroczyl timeout CDP, wiec screenshot zapisano przez Playwright fallback.
- Playwright fallback: screenshot `tmp/sld-industrial/browser/11_active_sld_playwright_after_latest_fixes.png` i diagnostyka `tmp/sld-industrial/browser/11_active_sld_playwright_after_latest_fixes_diagnostics.json`.

Iteracja po pelnym `npm test`:

- `window.confirm` zostal usuniety z routingu delete SLD, bo kanon `canon-alert-ban` blokuje `alert/confirm/prompt`.
- Usuwanie z menu SLD dziala teraz przez sticky toast z akcjami `Usun` / `Anuluj`; dopiero akcja `Usun` wywoluje `delete_element`.
- Ponowna walidacja: `canon-alert-ban`, `SldWorkspaceContainer`, `SldContextMenuController`, `dead_click_guard`, `npm test`, `type-check`, `lint`, `build`, guard bundle i e2e smoke sa zielone.

## Status kryteriow

| Kryterium | Status |
| --- | --- |
| Claude review zapisany z prompt/odpowiedzia/meta/exit | PASS |
| Decision log Accepted/Rejected/Deferred | PASS |
| Mini-RMU nie wyglada jak zwarcie WE-WY | PASS w regresji compact; browser active byl w LOD overview |
| Transformator ma dwa przecinajace sie okregi i hit area | PASS w DOM active: overlap 7.2, role button |
| `sld_no_external_we_wy_bridge_guard.py` | PASS |
| `station_not_rectangle_guard.py` | PASS |
| `label_overlap_guard.py` | PASS |
| `layout_readability_guard.py` | PASS |
| `enm_adapter_consistency_guard.py` | PASS |
| type-check | PASS |
| build | PASS |
| browser after screenshot | PASS |
| Krytyczne luki SLD = 0 | PASS po finalnym retescie: SLD/ENM guardy, full Vitest, type-check, lint, build, real backend e2e, masowy flow przemyslowy, Browser DOM retest i Playwright screenshots sa zielone |

## Finalny retest 2026-05-27 20:18

Browser / Playwright:

- In-app Browser na aktywnym URL `#sld?...Odcinek+04`: PASS dla tozsamosci strony, niepustego SLD, braku overlay frameworka, braku logow `error/warn`, braku widocznego tekstu `przerwa`, braku zakazanych terminow UI i 101 klikalnych celow. `Page.captureScreenshot` ponownie przekroczyl timeout CDP, dlatego obraz zapisano kontrolowanym fallbackiem Playwright.
- Playwright fallback, aktywny odcinek: `tmp/sld-industrial/browser/12_active_sld_final_playwright.png`.
- Playwright fallback, stacja widoczna w powiekszonym viewporcie: `tmp/sld-industrial/browser/14_station_visible_large_viewport.png`.
- Diagnostyka stacji: `tmp/sld-industrial/browser/13_station_selected_final_playwright_diagnostics.json` potwierdza `hasVisiblePrzerwaText=false`, `hasCanvas=true`, 93 klikalne cele, brak zakazanych terminow UI oraz transformator `data-symbol-canon="transformer_intersecting_circles"`, `data-transformer-circles-intersect="true"`, `overlap=7.2`, `role=button`.

Realny przeplyw projektanta na backendzie:

| Komenda | Wynik |
| --- | --- |
| `npm run test:e2e:real -- e2e/critical-run-flow.spec.ts` | PASS, 1/1; case -> GPZ -> ciag -> stacja -> odgalezienie -> katalogi -> readiness -> obliczenie -> wyniki -> uzasadnienie -> kontrola niezmiennosci ENM |
| `npm run test:e2e:real -- e2e/industrial-template-mass-flow.spec.ts` | PASS, 2/2 lacznie z krytycznym flow; 50 szablonow stacji, OZE, readiness, SC3F, trace, eksport raportu JSON, eksport uzasadnienia JSON/LaTeX, power-flow i widoki zabezpieczen |
| `npm run verify:v12.6` | PASS; utf8 guard, canon guard, lifecycle guard, wszystkie guardy SLD/ENM, backend tests, NC RfG/PTPiREE tests, frontend registry tests, type-check, lint i backend ruff |

# SLD Station TR Claude Fix Audit

## Zakres

Aktywny defekt dotyczył czytelności i poprawności symbolu transformatora SN/nN w SLD V2 oraz klikalności elementów stacji. Użytkownik wskazał, że symbol TR wygląda niepoprawnie, a okręgi uzwojeń muszą się przecinać.

## Claude review

- Pierwszy przebieg: `CLAUDE_IMPLEMENTATION_REVIEW_station_transformer_symbol_claude_fix_20260527_165145.*`
  - status: `timeout_after_300s`
  - dowód: `CLAUDE_IMPLEMENTATION_REVIEW_station_transformer_symbol_claude_fix_20260527_165145.meta.json`
- Drugi przebieg: `CLAUDE_IMPLEMENTATION_REVIEW_station_transformer_symbol_claude_fix_fast2_20260527_165919.*`
  - status: `ok`, exit code `0`
  - odpowiedź: `CLAUDE_IMPLEMENTATION_REVIEW_station_transformer_symbol_claude_fix_fast2_20260527_165919.md`

## Accepted / Rejected / Deferred

Accepted:
- Symbol transformatora jako dwa przecinające się okręgi z jawnym `data-symbol-canon="transformer_intersecting_circles"`.
- Zmiana geometrii `DeviceRenderer.TRANSFORMER_DEVICE` na `r=15`, `cy=-7.5/+7.5`, overlap `15`.
- Zmiana pełnego symbolu stacji na overlap `18` i jawne linie SN -> TR oraz TR -> nN per transformator.
- Dodanie `role`, `tabIndex`, `aria-label`, `onDoubleClick`, `onContextMenu`, `onKeyDown` i większych hit-area dla klikalnych aparatów.
- Uzupełnienie mini-RMU o klikalny host transformatora, role portów, pól i stacji.
- Testy geometrii przecięcia, hit-area i klikalności.

Rejected:
- Zmiany solverów, fizyki, wyników albo frozen result API. To był fix SLD/interaction.
- Zmiany tekstów SVG `title`, które naruszały kontrakty LOD i testy ukrywające roboczą nazwę stacji.

Deferred:
- Brak krytycznych deferred dla zgłoszonego defektu. Pełny Vitest frontend nie zakończył się w limicie 240 s, więc nie jest oznaczony jako zielony.

## Dowody browser

- Screenshot po poprawce: `docs/audits/SLD_STATION_TR_AFTER_CLAUDE_FIX.png`
- Diagnostyka po poprawce: `docs/audits/SLD_STATION_TR_AFTER_CLAUDE_FIX_DIAGNOSTICS.json`

Wynik diagnostyki aktywnego SLD:
- `miniStationRootButtons = 2`
- `stationPortButtons = 6`
- `miniBayButtons = 6`
- `transformerButtons = 1`
- host transformatora: `role="button"`, `tabindex="0"`, `aria-label="Transformator SN/nN stacji"`
- symbol transformatora: `circleCount = 2`, `data-transformer-circle-overlap-px = 7`

## Testy i komendy

Zielone:
- `npm test -- --run src/ui/sld/v2/renderer/__tests__/miniBlockRmu.test.tsx src/ui/sld/v2/__tests__/StationInternalView.test.tsx src/ui/sld/v2/__tests__/renderers.test.tsx`
  - 3 pliki, 174 testy passed
- `npm run type-check`
- `npm run lint`
- `npm run build`

Nieukończone:
- `npm test -- --run`
  - przerwane przez timeout 240 s w środowisku narzędziowym.

## Audyt ekspertów

Profesor elektroenergetyki:
- Poprawiono podstawowy błąd symboliki: TR ma dwie przecinające się cewki/uzwojenia i nie wygląda jak przypadkowe kółka.
- W pełnym widoku stacji transformator ma jawne połączenie z szyną SN i nN per transformator.

Projektant SN/OSD:
- Stacja, porty, pola i transformator w mini-RMU są fokusowalne i wybieralne.
- Prawy panel pozostaje zsynchronizowany z wyborem stacji/transformatora.

UX/CAD:
- Usunięto dead-click na hostach mini-RMU dla stacji, portów, pól i transformatora.
- Zachowano dotychczasowe kontrakty LOD i krótkie title `WE/WY/TR - ...`, aby nie zaśmiecać etykiet SVG.

QA:
- Dodano regresję geometrii TR, hit-area i keyboard activation.
- Browser retest zapisany w screenshotach i JSON.

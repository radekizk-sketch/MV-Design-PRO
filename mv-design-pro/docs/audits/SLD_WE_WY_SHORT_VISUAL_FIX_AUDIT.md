# SLD WE/WY Short Visual Fix Audit

## Defekt

Aktywny kompaktowy render stacji SN/nN mógł być odczytany jako zwarcie lub zewnętrzny most WE-WY. Przyczyną była ta sama oś wizualna dla przebiegu terenowego i portów WE/WY oraz jedna pionowa kreska pola od portu do szyny SN.

## Claude Review

- Prompt: `docs/audits/CLAUDE_DESIGN_REVIEW_station_we_wy_short_circuit_visual_fix_20260527_174012.prompt.md`
- Odpowiedź: `docs/audits/CLAUDE_DESIGN_REVIEW_station_we_wy_short_circuit_visual_fix_20260527_174012.md`
- Metadane: `docs/audits/CLAUDE_DESIGN_REVIEW_station_we_wy_short_circuit_visual_fix_20260527_174012.meta.json`
- Status: `ok`, exit code `0`

## Accepted / Rejected / Deferred

Accepted:
- Rozdzielić zewnętrzny pas kabla od wewnętrznej szyny SN.
- Wprowadzić jawny guard `no_external_we_wy_bridge`.
- Rozbić pole liniowe na `external_stub` kończący się na głowicy oraz `bay_drop_to_bus` od głowicy do szyny.
- Utrzymać szynę SN jako jedyny poziomy łącznik WE-WY wewnątrz rozdzielnicy.

Rejected:
- Zmiany solverów, NetworkModel i wyników obliczeń. To defekt renderingu SLD.
- Zmiana kanonu symboli aparatów i kolejności pól.

Deferred:
- Brak dla tego defektu.

## Implementacja

- `frontend/src/ui/sld/v2/renderer/MiniBlockRmuRenderer.tsx`
  - `COMPACT_TERRAIN_PORT_Y = -96`, żeby pas terenowy był wyraźnie powyżej szyny.
  - Dodano maskę/gap `data-guard="no_external_we_wy_bridge"` pomiędzy portami terenowymi.
  - Dodano osobne parytety:
    - `station.mini.external_stub.compact`
    - `station.mini.bay_drop_to_bus.compact`
- `frontend/src/ui/sld/v2/renderer/__tests__/miniBlockRmu.test.tsx`
  - Dodano regresję, że compact nie renderuje zewnętrznego mostka WE-WY.
- `scripts/sld_no_external_we_wy_bridge_guard.py`
  - Dodano statyczny guard kontraktu renderera i testu.

## Dowody Browser

- Screenshot: `docs/audits/SLD_WE_WY_SHORT_FIX_AFTER.png`
- Crop SVG: `docs/audits/SLD_WE_WY_SHORT_FIX_AFTER_CROP.svg`
- Diagnostyka: `docs/audits/SLD_WE_WY_SHORT_FIX_AFTER_DIAGNOSTICS.json`
- Klikalność: `docs/audits/SLD_WE_WY_CLICKABILITY_DIAGNOSTICS.json`

Kluczowe wartości z diagnostyki:
- `externalY = -96`
- `busbarY = -41`
- `data-cad-role = internal_station_busbar`
- `external_stub.compact = 2`
- `bay_drop_to_bus.compact = 2`
- zewnętrzny przebieg kabla jest rozcięty na dwa segmenty: lewy do WE i prawy od WY.
- porty `WE`, `WY`, `TR` oraz transformator mają `role="button"` i `tabindex="0"`.

## Walidacja

Zielone:
- `npm test -- --run src/ui/sld/v2/renderer/__tests__/miniBlockRmu.test.tsx`
- `npm test -- --run src/ui/sld/v2/renderer/__tests__/miniBlockRmu.test.tsx src/ui/sld/v2/renderer/__tests__/stationNotRectangle.test.tsx src/ui/sld/v2/__tests__/renderers.test.tsx`
- `npm run type-check`
- `npm run lint`
- `npm run build`
- `py scripts/station_not_rectangle_guard.py`
- `py scripts/sld_no_external_we_wy_bridge_guard.py`

Uwaga środowiskowa:
- `python` nie jest dostępny w PATH, działa `py` (`Python 3.11.9`).

## Audyt Ekspercki

Profesor elektroenergetyki:
- Po poprawce WE i WY nie są pokazane jako zewnętrzny most. Szyna SN jest oddzielnym elementem rozdzielni.

Projektant SN:
- Port terenowy, głowica i zjazd pola są rozróżnione. To prowadzi wzrok: kabel -> głowica -> aparat/pole -> szyna.

Automatyk zabezpieczeniowy:
- Nie zmieniono stanu łączeniowego ani logiki. Zmiana jest wizualna i nie fałszuje topologii.

UX/CAD:
- Dodano jawny wizualny gap, żeby użytkownik nie odczytywał topowego przebiegu jako ciągłego przewodu przez stację.

QA:
- Dodano test regresyjny i guard statyczny dla tego defektu.

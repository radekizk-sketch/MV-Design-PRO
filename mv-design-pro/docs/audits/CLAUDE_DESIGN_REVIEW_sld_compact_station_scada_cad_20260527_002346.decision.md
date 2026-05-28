# Claude Design Review Decision Log - sld_compact_station_scada_cad

Review: docs/audits/CLAUDE_DESIGN_REVIEW_sld_compact_station_scada_cad_20260527_002346.md
Prompt: docs/audits/CLAUDE_DESIGN_REVIEW_sld_compact_station_scada_cad_20260527_002346.prompt.md
Meta: docs/audits/CLAUDE_DESIGN_REVIEW_sld_compact_station_scada_cad_20260527_002346.meta.json

## Accepted

- MF-4 / SLD-CAD: rozdzielic semantyke portu terenowego WE/WY od portu transformatorowego TR w kompaktowej stacji. Test: DOM/guard musi widziec `data-port-side="terrain_network"` tylko dla pol liniowych oraz `data-port-side="transformer"` dla TR.
- SLD-CAD: LOD kompaktowy ma pokazywac tor mocy `kabel -> pole liniowe -> szyna SN -> pole TR -> transformator -> szyna nN`, bez duzego prostokatnego kafla. Test: komponentowy `MiniBlockRmuRenderer` sprawdza kierunki `line_from_bus_up_to_terrain` i `transformer_from_bus_down_to_lv`, obecnosc szyny SN/nN oraz brak pelnej ramki zaznaczenia.
- SLD-CAD: zaznaczenie ma byc CAD-owe, punktowe, a nie pelna karta zaslaniajaca schemat. Test: selected compact renderuje `data-selection-style="cad_corner_handles"` i glowny hit-area pozostaje transparentny.
- Recommended follow-up tests: uruchomic browser QA na aktywnym SLD z backendem i sprawdzic brak bledow konsoli oraz pozycje portow wzgledem szyny.

## Rejected

- MF-1/MF-2/MF-3/MF-6 pelny workflow rysowania i undo: poza zakresem tej poprawki renderera; nie jest implementowany w prezentacji mini-RMU, bo wymaga kontrolera operacji modelu i audytu komend.
- Color-blind simulation jako automatyczny test: nie ma obecnie lokalnego narzedzia w pipeline tej powierzchni; zachowano niekolorowe rozroznienie ksztaltow aparatury.

## Deferred

- Brak.

## Implementation Notes

- Claude review jest checkpointiem czytelnosci i flow, nie zrodlem prawdy domenowej.
- Implementowane sa tylko przyjete punkty, ktore zachowuja ENM, katalogi, solvery i aktywny kanon V12.xx.

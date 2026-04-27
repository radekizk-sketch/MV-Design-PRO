# MV-DESIGN-PRO V12.xx - kontrakt SLD CAD

## Decyzja

SLD jest renderowany jako schemat jednokreskowy z jawnie rozdzielonymi domenami napięciowymi. Kontynuacja sieci SN nie może przechodzić przez stronę nN stacji. Jedynym elementem sprzęgającym domeny SN i nN jest transformator SN/nN z dwoma jawnymi portami: `TRANSFORMER_SN` i `TRANSFORMER_NN`.

## Moduły wdrożone

| Moduł | Rola |
|---|---|
| `SldVoltageDomainGuard.ts` | Waliduje kompatybilność portów WN/SN/nN/DC/sterowanie/pomiar. Blokuje SN -> nN bez transformatora. |
| `SldStationLayoutEngine.ts` | Buduje deterministyczny model CAD stacji SN/nN: pola SN, szyna SN, transformator, szyna nN i odpływy nN. |
| `FieldBlockRenderer.tsx` | Renderuje stację jako układ techniczny CAD, a nie kafel. |
| `SldLevelOfDetailEngine.ts` | Definiuje poziomy LOD-0..LOD-7 oraz mapowanie do dotychczasowych pasm widoczności. |

## Reguły topologiczne

| Reguła | Status |
|---|---|
| GPZ i pola SN pracują w domenie `SN` | wdrożone w kontraktach portów i renderingu |
| Pole SN ma jawny port `BAY_SN_OUT` dla dalszego odcinka SN | wdrożone w rendererze stacji i typach interakcji |
| Stacja przelotowa kontynuuje SN przez pole `LINE_OUT` | wdrożone w `SldStationLayoutEngine` |
| Stacja końcowa nie ma dalszego portu SN za szyną nN | wdrożone w `SldStationLayoutEngine` i testach |
| Szyna nN jest wyłącznie domeną `NN` | wdrożone w atrybutach renderera i guardzie |
| Bezpośrednie SN -> nN jest blokowane kodem `SLD-VOLTAGE-001` | wdrożone w `SldVoltageDomainGuard` |

## Testy akceptacyjne

| Test | Pokrycie |
|---|---|
| `SldVoltageDomainGuard.test.ts` | blokady SN/nN, transformator, DC/AC przez falownik |
| `SldStationLayoutEngine.test.tsx` | stacja przelotowa, stacja końcowa, domeny SN/nN w SVG |
| `SldLevelOfDetailEngine.test.ts` | LOD-0..LOD-7, tryb wynikowy, tryb audytowy |
| `sld-gpz-bay-render.test.tsx` | GPZ, szyny, pola SN i sprzęgło 6-7 |

## Kryterium wizualne

Stacja SN/nN musi mieć:

- górną sekcję `strona SN`,
- szynę SN jako dominującą linię,
- pola SN jako pionowe tory z odłącznikiem, wyłącznikiem, odłącznikiem i uziemnikiem bocznym,
- transformator SN/nN jako jedyne zejście do domeny nN,
- dolną sekcję `strona nN`,
- szynę nN z odpływami nN,
- brak geometrii sugerującej kontynuację SN przez stronę nN.

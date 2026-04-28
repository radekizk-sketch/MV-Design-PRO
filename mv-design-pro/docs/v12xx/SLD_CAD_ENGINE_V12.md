# MV-DESIGN-PRO V12.xx - kontrakt SLD CAD

## Decyzja

SLD jest renderowany jako schemat jednokreskowy z jawnie rozdzielonymi domenami napieciowymi. Kontynuacja sieci SN nie moze przechodzic przez strone nN stacji. Jedynym elementem sprzegajacym domeny SN i nN jest transformator SN/nN z dwoma jawnymi portami: `TRANSFORMER_SN` i `TRANSFORMER_NN`.

Pelny GPZ z transformatorem WN/SN jest rowniez jawnym sprzezeniem domen. Tor WN i tor SN nie sa laczone przewodem ani kontynuacja szyny, tylko przez porty transformatora.

## Moduly wdrozone

| Modul | Rola |
|---|---|
| `SldCadEngineV12.ts` | Spina ENM -> projekcja SLD -> graf CAD -> walidacja domen -> LOD -> profil wydruku technicznego. |
| `SldVoltageDomainGuard.ts` | Waliduje kompatybilnosc portow WN/SN/nN/DC/sterowanie/pomiar. Blokuje SN -> nN bez transformatora. |
| `SldStationLayoutEngine.ts` | Buduje deterministyczny model CAD stacji SN/nN: pola SN, szyna SN, transformator, szyna nN i odplywy nN. |
| `FieldBlockRenderer.tsx` | Renderuje stacje jako uklad techniczny CAD, a nie kafel. |
| `SldLevelOfDetailEngine.ts` | Definiuje poziomy LOD-0..LOD-7 oraz mapowanie do dotychczasowych pasm widocznosci. |

## Reguly topologiczne

| Regula | Status |
|---|---|
| GPZ i pola SN pracuja w domenie `SN` | wdrozone w kontraktach portow i renderingu |
| Pole SN ma jawny port `BAY_SN_OUT` dla dalszego odcinka SN | wdrozone w rendererze stacji, grafie CAD i typach interakcji |
| Stacja przelotowa kontynuuje SN przez pole `LINE_OUT` | wdrozone w `SldStationLayoutEngine` |
| Stacja koncowa nie ma dalszego portu SN za szyna nN | wdrozone w `SldStationLayoutEngine` i testach |
| Szyna nN jest wylacznie domena `NN` | wdrozone w atrybutach renderera i guardzie |
| Bezposrednie SN -> nN jest blokowane kodem `SLD-VOLTAGE-001` | wdrozone w `SldVoltageDomainGuard` i `SldCadEngineV12` |
| Transformator WN/SN w pelnym GPZ jest jawnym sprzezeniem domen, a nie przewodem | wdrozone w `SldVoltageDomainGuard` i `SldCadEngineV12` |
| Wyniki na SLD nie zmieniaja sygnatury geometrii | wdrozone w `SldCadEngineV12` i tescie sygnatury geometrii |

## Pipeline

1. ENM jest jedynym zrodlem prawdy.
2. `SldCadEngineV12` uruchamia projekcje ENM do symboli i polaczen SLD.
3. Ten sam przebieg buduje `SldCadGraph` z wezlami, portami i krawedziami.
4. Kazdy port ma `ownerRefId`, domene napieciowa, napiecie znamionowe, role i kierunek.
5. Kazda krawedz przechodzi przez `SldVoltageDomainGuard`.
6. Wynik projekcji zawiera `lodLevel` oraz jasny profil wydruku technicznego.
7. Warstwa wynikowa moze zmienic LOD na `LOD-6`, ale nie moze zmienic geometrii.

## Testy akceptacyjne

| Test | Pokrycie |
|---|---|
| `SldCadEngineV12.test.ts` | graf CAD z refId i portami, blokada SN/nN, transformator WN/SN, LOD, profil wydruku, brak zmiany geometrii przez wyniki |
| `SldVoltageDomainGuard.test.ts` | blokady SN/nN, transformator SN/nN, transformator WN/SN, DC/AC przez falownik |
| `SldStationLayoutEngine.test.tsx` | stacja przelotowa, stacja koncowa, domeny SN/nN w SVG |
| `SldLevelOfDetailEngine.test.ts` | LOD-0..LOD-7, tryb wynikowy, tryb audytowy |
| `sld-gpz-bay-render.test.tsx` | GPZ, szyny, pola SN i sprzeglo 6-7 |

## Kryterium wizualne

Stacja SN/nN musi miec:

- gorna sekcje `strona SN`,
- szyne SN jako dominujaca linie,
- pola SN jako pionowe tory z odlacznikiem, wylacznikiem, odlacznikiem i uziemnikiem bocznym,
- transformator SN/nN jako jedyne zejscie do domeny nN,
- dolna sekcje `strona nN`,
- szyne nN z odplywami nN,
- brak geometrii sugerujacej kontynuacje SN przez strone nN.

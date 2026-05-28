# Claude Design Review Decision Log - sld_industrial_scada_cad

Review: `docs/audits/CLAUDE_DESIGN_REVIEW_sld_industrial_scada_cad_20260527_180619.md`
Prompt: `docs/audits/CLAUDE_DESIGN_REVIEW_sld_industrial_scada_cad_20260527_180619.prompt.md`
Meta: `docs/audits/CLAUDE_DESIGN_REVIEW_sld_industrial_scada_cad_20260527_180619.meta.json`

## Accepted

- M4: LOD nie moze ukrywac sensu elektrycznego. W tym przebiegu poprawiany jest kompaktowy renderer stacji tak, aby rozroznial kabel terenowy, pole WE/WY, wewnetrzna szyne SN i pole TR bez wizualnego mostka WE-WY. Test: `miniBlockRmu.test.tsx` + `sld_no_external_we_wy_bridge_guard.py`.
- M7: model selekcji i klikalnosc musza byc jednoznaczne. W dotykanym zakresie utrzymujemy `role=button`, hit area, tooltip, left/double/right click dla pola i transformatora. Test: `miniBlockRmu.test.tsx`.
- SLD/CAD/LOD: porty musza miec jawne kotwice, a snap/port magnets nie moga sugerowac polaczenia przez losowy punkt. W dotykanym zakresie utrzymujemy oddzielne stuby portow WE/WY i dropy do szyny stacji. Test: guard parytetu `station.mini.external_stub.compact` oraz `station.mini.bay_drop_to_bus.compact`.
- Etykiety: aktywny widok nie moze zawierac pomocniczych napisow, ktore wygladaja jak obejscie modelu. Przyjeto usuniecie widocznej etykiety `przerwa` z kompaktowego SLD i zastapienie jej niejawnym znacznikiem CAD. Test: `miniBlockRmu.test.tsx` oraz guard.
- Transformator: symbol musi byc osobnym elementem z dwoma przecinajacymi sie okregami i czytelnym kliknieciem. W tym przebiegu wzmacniamy kontrakt danych symbolu i testujemy dodatni overlap okregow.

## Rejected

- M1 w brzmieniu "length is derived from geometry x scale" jako jedyne zrodlo prawdy: konfliktuje z kanonem projektu, w ktorym dlugosc odcinka moze pochodzic z uzytkownika, geometrii, importu, GIS albo fixture testowego. Przyjeta czesc: brak dlugosci jest blockerem, nigdy `0`, ale geometria UI nie staje sie fizyka sieci.
- Jakiekolwiek rekomendacje, ktore przenosza obliczenia, nastawy albo logike zabezpieczeniowa do UI. SLD pozostaje widokiem ENM/topologii; fizyka zostaje w solverach.
- Zmiany solverow albo frozen result API w ramach tej poprawki wizualnej. Poprawka dotyczy renderingu/kontraktow SLD i guardow.

## Deferred

- M6: pelny system undo/redo dla 50 operacji i widoczna historia mutacji. To jest istotne dla klasy CAD, ale nie jest bezposrednia przyczyna obecnego wrazenia zwarcia WE-WY/TR ze zrzutu. Wymaga osobnego kontraktu komend mutujacych ENM, aby nie wprowadzic niespojnego cofania.
- M5: pelna parytetowa enumeracja wszystkich akcji right-click/ribbon/keyboard. W dotykanym zakresie nie dodajemy nowych akcji; nie rozszczelniamy obecnego modelu klikniec.
- M3: pelny modal split-section z preview/cancel/commit/audit. Obecna poprawka nie zmienia mechaniki split; krytyczny render WE/WY zostaje poprawiony bez mutacji ENM.

## Implementation Notes

- Claude review jest checkpointem flow i czytelnosci, nie zrodlem prawdy domenowej.
- ENM, katalogi, solvery, testy i aktywny kanon V12.xx pozostaja nadrzedne.
- Ten przebieg implementuje zaakceptowany minimalny zakres dla krytycznej wady widocznej w browserze: mini-RMU nie moze wygladac jak zwarcie WE-WY ani jak dekoracyjny klocek.

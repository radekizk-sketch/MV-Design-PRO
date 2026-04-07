# Audyt Jednego Edytora Katalog-First

## Stan zastany
- `frontend/src/App.tsx` utrzymywal rownolegle kilka ciezkich powierzchni produktu w glownym bundle i rozdzielal modelowanie od wynikow przez historyczne aliasy.
- `frontend/src/ui/main-menu/MainMenuBar.tsx` i `frontend/src/ui/active-case-bar/ActiveCaseBar.tsx` nie uzywaly jednego jezyka produktu dla wynikow.
- `frontend/src/ui/layout/PowerFactoryLayout.tsx` trzymal katalog jako modal poboczny zamiast stalego narzedzia po lewej stronie.
- `frontend/src/ui/wizard/WizardPage.tsx` pozostawal legacy przeplywem o semantyce kreatora, mimo ze kanoniczna praca przeniosla sie do `NetworkEditorPage`.
- `frontend/src/ui/results-inspector/ResultsInspectorPage.tsx` byl nadal widokiem ogolnym i przez statyczny import dokladal sie do glownych chunkow.

## Decyzje
- `KEEP`: `frontend/src/ui/sld/SldEditorPage.tsx` jako silnik centralnego plotna.
- `MERGE`: aliasy `#sld` i `#network-build` do jednego wejscia `#editor`.
- `MERGE`: alias `#results-workspace` do jednej kanonicznej przestrzeni `#results`.
- `MERGE`: katalog do stalego lewego panelu shella narzedziowego.
- `ISOLATE`: `WizardPage` jako legacy flow dostepny tylko przez jawny legacy surface.
- `ISOLATE`: `ResultsInspectorPage` jako legacy ekran pomocniczy dla diagnostyki, nie jako glowny widok wynikow.
- `REMOVE`: produktowe nazwy sugerujace dwa rozne produkty dla tej samej decyzji operatora.

## Wdrozone w tej iteracji
- Kanoniczna trasa edytora zostala znormalizowana do `#editor`.
- Kanoniczna trasa wynikow zostala znormalizowana do `#results`.
- Dodano `NetworkEditorPage` z lepszym prowadzeniem operatora SN:
  - status gotowosci,
  - status wynikow,
  - kontekst przypadku,
  - os przebiegu `GPZ -> Magistrala SN -> Stacja/Trafo -> Zabezpieczenia -> Analiza`.
- `ResultsWorkspacePage` stal sie glowna przestrzenia `Wyniki i analiza`.
- `ResultsInspectorPage` zostal ograniczony do pomocniczego widoku `LegacyTraceWorkspacePage` dla `#proof`.
- Publiczne baryly przestaly wystawiac `WizardPage` i `ResultsInspectorPage` jako domyslne API produktu.
- Dodano route-level lazy loading dla ciezkich ekranow i manual chunking w `frontend/vite.config.ts`.

## Wplyw na inzyniera sieci SN
- Operator buduje siec w jednym miejscu, bez przechodzenia miedzy `SLD`, `Budowa sieci` i `Kreator`.
- Katalog pozostaje stale dostepny przy modelowaniu GPZ, linii, kabli, stacji, transformatorow i zabezpieczen.
- Wyniki i analiza sa jednym przeplywem: wybor runu, przeglad wynikow, porownanie i nakladka SLD.
- Stary slad obliczen nadal istnieje, ale jest jawnie oznaczony jako pomocnicza diagnostyka solvera.

## Otwarte obszary dlugu
- `frontend/src/ui/wizard/WizardPage.tsx` nadal istnieje fizycznie i wymaga dalszej dekompozycji lub usuniecia po migracji testow oraz helperow.
- W kodzie nadal sa historyczne komentarze i czesc nazw technicznych odnoszacych sie do `SLD` lub `kreatora`.
- Po redukcji bundle trzeba dalej obserwowac rozklad chunkow przy kolejnych duzych funkcjach domenowych.

# MV-DESIGN-PRO SLD Runtime Audit

Data: 2026-04-24

## Cel PR-A

PR-A odcina statyczny ekran SLD z runtime i przywraca aktywny widok schematu do istniejacego potoku:

`ENM -> projectEnmSnapshotToSld -> topology/layout -> SLDView/SLDViewCanvas -> UI`

Ten PR nie naprawia symboliki SN, stacji SN/nN, PV/BESS, NOP, backendu, jezyka publicznego UI ani goldenow.

Uwaga po porzadkowaniu dokumentacji PR-A..PR-G: nazwy `EngineeringSldScreen`, `canonicalSnSldModel` i `canonicalSnSldSymbols` wystepuja w tym raporcie wylacznie jako historyczny dowod audytowy odrzuconej proby statycznego SLD. Nie sa kanonem produktu ani aktywna sciezka runtime.

## Stan bazowy przed zmianami

`git status --short` przed PR-A:

```text
 M mv-design-pro/docs/sld/CANONICAL_SN_SLD_ENGINEERING_BLUEPRINT.md
 M mv-design-pro/frontend/src/App.tsx
 M mv-design-pro/frontend/src/__tests__/App.routes.test.tsx
 M mv-design-pro/frontend/src/ui/main-menu/MainMenuBar.tsx
 M mv-design-pro/frontend/src/ui/navigation/routes.ts
 M mv-design-pro/frontend/src/ui/sld/index.ts
?? mv-design-pro/frontend/src/ui/sld/EngineeringSldScreen.tsx
?? mv-design-pro/frontend/src/ui/sld/__tests__/CanonicalSnSldModel.test.ts
?? mv-design-pro/frontend/src/ui/sld/__tests__/EngineeringSldScreen.test.tsx
?? mv-design-pro/frontend/src/ui/sld/canonicalSnSldModel.ts
?? mv-design-pro/frontend/src/ui/sld/canonicalSnSldSymbols.tsx
?? mv-design-pro/frontend/src/ui/sld/engineering-sld-screen.css
```

`git diff --stat` przed PR-A:

```text
 .../sld/CANONICAL_SN_SLD_ENGINEERING_BLUEPRINT.md  | 524 +++++++--------------
 mv-design-pro/frontend/src/App.tsx                 |  10 +-
 .../frontend/src/__tests__/App.routes.test.tsx     |   3 +-
 .../frontend/src/ui/main-menu/MainMenuBar.tsx      |   4 +-
 mv-design-pro/frontend/src/ui/navigation/routes.ts |   8 +-
 mv-design-pro/frontend/src/ui/sld/index.ts         |  23 +
 6 files changed, 218 insertions(+), 354 deletions(-)
```

`rg` byl dostepny w srodowisku, ale nieuruchamialny:

```text
Program 'rg.exe' failed to run: Odmowa dostepu
```

Do skanu uzyto `Get-ChildItem` + `Select-String`.

## Importy i podpiecia przed zmianami

Znalezione aktywne podpiecia statycznego SLD:

```text
frontend/src/App.tsx:31: import { EngineeringSldScreen, SLDViewPage, SldEditorPage } from './ui/sld';
frontend/src/App.tsx:405: if (route === '' || route === ROUTES.SLD.hash) {
frontend/src/App.tsx:408: <EngineeringSldScreen />
frontend/src/ui/sld/index.ts:18: export { EngineeringSldScreen } from './EngineeringSldScreen';
frontend/src/ui/sld/index.ts:28: } from './canonicalSnSldModel';
frontend/src/ui/sld/index.ts:40: } from './canonicalSnSldModel';
frontend/src/__tests__/App.routes.test.tsx:76: EngineeringSldScreen: () => <div data-testid="engineering-sld-screen">Kanoniczny SLD</div>,
frontend/src/__tests__/App.routes.test.tsx:280: expect(await screen.findByTestId('engineering-sld-screen')).toBeInTheDocument();
```

Dokumentacja blueprintu rowniez opisywala statyczny ekran i `canonicalSn*` jako wdrozony kanon runtime. To bylo bledne twierdzenie dokumentacyjne i zostalo wycofane w PR-A:

```text
docs/sld/CANONICAL_SN_SLD_ENGINEERING_BLUEPRINT.md: status PR-A before cleanup - static screen described as runtime canon.
```

Pliki statycznej proby przed PR-A:

```text
frontend/src/ui/sld/EngineeringSldScreen.tsx
frontend/src/ui/sld/canonicalSnSldModel.ts
frontend/src/ui/sld/canonicalSnSldSymbols.tsx
frontend/src/ui/sld/engineering-sld-screen.css
frontend/src/ui/sld/__tests__/CanonicalSnSldModel.test.ts
frontend/src/ui/sld/__tests__/EngineeringSldScreen.test.tsx
```

## Zmiany wykonane w PR-A

Odpięto statyczny ekran z aktywnej sciezki runtime:

```text
App.tsx: import z ui/sld wrocil do SLDViewPage + SldEditorPage.
App.tsx: usunieto blok route === '' || route === ROUTES.SLD.hash renderujacy EngineeringSldScreen.
ui/sld/index.ts: usunieto eksport EngineeringSldScreen i eksporty canonicalSnSldModel.
App.routes.test.tsx: mock i oczekiwanie wrocily do sld-editor-page.
```

Przywrocono dokument blueprintu do stanu repo baseline, bo poprzednia wersja blednie przedstawiala statyczny ekran jako kanon runtime.

Usunieto nieśledzone artefakty statycznej proby po potwierdzeniu, ze byly zwiazane z odrzuconym ekranem i nie mialy miejsca w aktywnym runtime.

Dodano guard w:

```text
frontend/src/ui/sld/__tests__/sldCanonicalHygiene.test.ts
```

Guard sprawdza, ze:

```text
App.tsx nie zawiera EngineeringSldScreen.
ui/sld/index.ts nie zawiera EngineeringSldScreen.
ui/sld/index.ts nie zawiera canonicalSnSldModel.
ui/sld/index.ts nie zawiera canonicalSnSldSymbols.
App.tsx renderuje SldEditorPage useDemo={false}.
SldEditorPage zawiera projectEnmSnapshotToSld i enmProjection.
```

## Stan po zmianach

Wyniki skanu dokladnych nazw po zmianach, przed utworzeniem tego raportu:

```text
PATTERN EngineeringSldScreen: NO MATCH
PATTERN canonicalSnSldModel: NO MATCH
PATTERN canonicalSnSldSymbols: NO MATCH
```

Po utworzeniu raportu te nazwy wystepuja wylacznie w dokumentacji audit jako dowod audytowy, nie w aktywnym runtime.

Aktywna trasa / widok SLD po zmianach:

```text
frontend/src/App.tsx:31: import { SLDViewPage, SldEditorPage } from './ui/sld';
frontend/src/App.tsx:397: if (route === '#sld-view') {
frontend/src/App.tsx:400: <SLDViewPage useDemo={false} />
frontend/src/App.tsx:418: <SldEditorPage useDemo={false} />
```

Aktywny projektor ENM -> SLD:

```text
frontend/src/ui/sld/SldEditorPage.tsx:63: import { projectEnmSnapshotToSld } from './enmSnapshotToSldSymbols';
frontend/src/ui/sld/SldEditorPage.tsx:616: const enmProjection = useMemo(
frontend/src/ui/sld/SldEditorPage.tsx:617: () => projectEnmSnapshotToSld((enmSnapshot ?? null) as Record<string, unknown> | null),
```

Kontrola fallback/demo path w `SldEditorPage`:

```text
frontend/src/ui/sld/SldEditorPage.tsx:73: const DEMO_SYMBOLS: AnySldSymbol[] = [
frontend/src/ui/sld/SldEditorPage.tsx:403: void DEMO_SYMBOLS;
frontend/src/ui/sld/SldEditorPage.tsx:433: useDemo = false,
frontend/src/ui/sld/SldEditorPage.tsx:437: void useDemo;
```

Wniosek: `DEMO_SYMBOLS` nadal istnieje jako martwy historyczny blok w pliku, ale aktywna sciezka `App.tsx` przekazuje `useDemo={false}`, a `SldEditorPage` ignoruje `useDemo` i buduje `enmProjection` przez `projectEnmSnapshotToSld`. Usuniecie samego martwego bloku `DEMO_SYMBOLS` zostaje jako cleanup poza PR-A.

## Testy

Uruchomiono repo-native Vitest:

```text
npm test -- src/__tests__/App.routes.test.tsx src/ui/sld/__tests__/sldCanonicalHygiene.test.ts src/ui/sld/__tests__/enmSnapshotToSldSymbols.test.ts src/ui/sld/core/__tests__/determinism.test.ts src/ui/sld/core/__tests__/layoutPipeline.test.ts src/ui/sld/core/__tests__/switchgearConfig.hashParity.test.ts
```

Wynik:

```text
Test Files  6 passed (6)
Tests       80 passed (80)
```

Uruchomiono type-check:

```text
npm run type-check
```

Wynik:

```text
tsc --noEmit
exit code 0
```

Uruchomiono filtr hash parity:

```text
npm test -- hashParity
```

Wynik:

```text
Test Files  1 passed (1)
Tests       3 passed (3)
```

Sprawdzono GitHub checks dla PR #438:

```text
gh pr checks 438 --repo radekizk-sketch/MV-Design-PRO
```

Wynik:

```text
14 checks passed
```

Nie aktualizowano snapshotow, goldenow ani hashy.

## Stan po PR-A

Rzeczywisty diff po odpięciu runtime i przywroceniu plikow spoza PR-A:

```text
 M mv-design-pro/frontend/src/ui/sld/__tests__/sldCanonicalHygiene.test.ts
?? mv-design-pro/docs/audit/MV_DESIGN_PRO_SLD_RUNTIME_AUDIT.md
```

## Dalsze prace poza PR-A

- PR-B: kontrakty symboliki i pol GPZ.
- PR-C: stacje SN/nN jako rozdzielnice z polami.
- PR-D: PV/BESS, NOP i walidacje wariantow z ENM.
- PR-E: jezyk publiczny UI i mojibake.
- PR-F: regresje, golden i deterministycznosc.
- PR-G: raport/eksport i przeplyw uzytkownika end-to-end.
- Cleanup: usunac historyczny, nieaktywny `DEMO_SYMBOLS` z `SldEditorPage`, jezeli osobny PR potwierdzi brak zaleznosci testowych.

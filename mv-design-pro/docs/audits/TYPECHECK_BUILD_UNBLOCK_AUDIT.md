# Type-check / build unblock audit

Status: release-gate evidence, 2026-05-07.

## Cel

Celem tej fazy bylo odblokowanie globalnego `npm run type-check` i `npm run build` bez maskowania bledow TypeScript w `tsconfig.json`.

## Stan wejściowy

`frontend/tsconfig.json` wykluczal produkcyjne pliki legacy:

- `src/ui/context-menu/EngineeringContextMenu.tsx`
- `src/ui/layout/CanonicalLayout.tsx`
- `src/ui/network-build/cards/BayCard.tsx`
- `src/ui/network-build/InspectorEngineeringView.tsx`
- `src/ui/network-build/ReadOnlyPanelRouter.tsx`
- `src/ui/results-inspector/ResultsInspectorPage.tsx`
- `src/ui/sld/*.ts`, `src/ui/sld/*.tsx`, `src/ui/sld/core/**/*`, `src/ui/sld/inspector/**/*`

Po usunieciu tych wykluczen `npm run type-check` ujawnil bledy w martwym legacy SLD i odłączonych panelach.

## Klasyfikacja błędów

| Klasa | Przyklady | Decyzja |
| --- | --- | --- |
| Brakujące moduły/importy | stare `src/ui/sld/*`, `EngineeringContextMenu`, `InspectorEngineeringView` | delete |
| Martwe legacy SLD | `SldEditorPage`, `SLDView`, `SLDViewCanvas`, stare `core/*` | delete, aktywne SLD to `SldCanvasV2` |
| Martwe legacy layout/panele | `CanonicalLayout.tsx`, `ReadOnlyPanelRouter.tsx`, `ResultsInspectorPage.tsx` | delete |
| Testy tylko dla legacy | stare testy `src/ui/sld/__tests__/*`, `BayCard`, `InspectorEngineeringView` | delete/migrate do v2 tests |
| Nieaktualne golden scripts | `test:golden` wskazywal stare pliki | migrate do SLD v2 fixtures |
| Guardy wskazujące usunięte pliki | `import_graph_guard.py`, `semantic_architecture_guard.py` | migrate do aktywnej architektury |

## Pliki usunięte

- `frontend/src/ui/context-menu/EngineeringContextMenu.tsx`
- `frontend/src/ui/layout/CanonicalLayout.tsx`
- `frontend/src/ui/network-build/cards/BayCard.tsx`
- `frontend/src/ui/network-build/InspectorEngineeringView.tsx`
- `frontend/src/ui/network-build/ReadOnlyPanelRouter.tsx`
- `frontend/src/ui/results-inspector/ResultsInspectorPage.tsx`
- stare `frontend/src/ui/sld/*`
- stare `frontend/src/ui/sld/core/*`
- `frontend/src/ui/sld/inspector/fieldDeviceInspector.ts`
- legacy-only tests for those files

## Pliki zmigrowane / naprawione

- `frontend/tsconfig.json`: usunieto produkcyjne wykluczenia.
- `frontend/vite.config.ts`: usunieto niestandardowe wykluczenia legacy testow.
- `frontend/package.json`: `test:golden` i `test:golden:update` wskazuja SLD v2.
- `frontend/src/ui/canon/technicalDebtRegistry.ts`: usunieto referencje do usunietych plikow.
- `frontend/src/ui/workspace/WorkspaceSurfaceRouter.tsx`: usunieto aktywne etykiety `run/snapshot/Power Flow/proof` z sekcji audit2.
- `frontend/src/ui/network-build/station-configurator/cards/StationConfigProtectionCard.tsx`: `VT (per pole)` zastapiono polska etykieta techniczna.
- `frontend/src/ui/workspace/__tests__/ProofSurfaceAudit2PowerFlow.test.tsx`: test pilnuje nowych polskich etykiet.
- `scripts/import_graph_guard.py`: usunieto martwy cel `CanonicalLayout.tsx`.
- `scripts/semantic_architecture_guard.py`: przepieto guard z wygaszonych plikow na aktywny adapter semantyczny i SLD v2.

## Potwierdzenie braku maskowania

Nie zmieniono strictness TypeScript. Nie dodano produkcyjnych wykluczen do `tsconfig.json`.
Aktualne `exclude` obejmuje tylko testy i katalog E2E, ktore nie sa czescia produkcyjnego type-checku.

## Walidacja

| Komenda | Wynik | Uwagi |
| --- | --- | --- |
| `npm run type-check` | PASS | `tsc --noEmit` bez produkcyjnych wykluczen legacy |
| `npm run build` | PASS | ostrzezenie Vite o duzym chunku, bez porazki |
| `npm run lint` | PASS | zero warningow ESLint |
| `npm run test:ci` | PASS | 249 plikow, 3078 testow passed, 1 skipped |
| `npm run test:golden` | PASS | SLD v2: 3 pliki, 146 testow |
| `npm run guard:grep-zero` | PASS | brak falszywych `0.00` w aktywnej sciezce |
| `npm run guard:ui-terminology` | PASS | brak zakazanych terminow UI |
| `npm run guard:codenames` | PASS | brak kryptonimow |
| `npm run test:e2e:setup:real` | PASS | Playwright Chromium wykryty lokalnie |
| `npm run test:e2e:real` | PASS | real backend smoke: 1 test passed |
| `poetry run pytest -q` | PASS | 4663 passed, 6 skipped, 4 xpassed |
| `py -3.11 mv-design-pro/scripts/arch_guard.py` | PASS | lokalny odpowiednik CI |
| `py -3.11 mv-design-pro/scripts/repo_hygiene_guard.py` | PASS | catalog-first active paths clean |
| `py -3.11 mv-design-pro/scripts/docs_guard.py` | PASS | all checks pass |
| `py -3.11 mv-design-pro/scripts/sld_determinism_guards.py` | PASS | 0 naruszen |
| `py -3.11 mv-design-pro/scripts/import_graph_guard.py` | PASS | guard zaktualizowany do aktywnego layoutu |
| `py -3.11 mv-design-pro/scripts/semantic_architecture_guard.py` | PASS | guard zaktualizowany do aktywnego adaptera semantycznego |

## Browser / E2E

Browser Use / IAB zostal ponownie sprawdzony. Backend IAB zwrocil: `No Codex IAB backends were discovered`.
Zastosowano Playwright fallback.

Obowiazkowy smoke CI:

```bash
cd mv-design-pro/frontend
npm run test:e2e:real
```

Wynik: PASS, real-backend krytyczny flow GPZ -> magistrala -> stacja -> odgalezienie -> katalogi -> gotowosc -> obliczenia -> wyniki -> SLD -> uzasadnienie.

Dodatkowo uruchomiono caly katalog `e2e` na realnym backendzie poleceniem:

```bash
cd mv-design-pro/frontend
node ./scripts/playwright-run-real.mjs
```

Wynik: 26 passed, 14 failed. Porażki dotycza historycznych nie-CI specow z selektorami starego shell-a (`project-tree`, `left-panel-mode-readiness`, `mode-indicator`, `sld-connections-layer`) oraz scenariuszy oczekujacych SLD bez aktywnego projektu, podczas gdy aktywny kontrakt startowy to E-00.

## Pozostałe luki

Brak blokad dla CI i smoke release-gate. Pełny katalog nie-CI E2E wymaga osobnej migracji historycznych specow do aktywnego AppShell/SLD v2, ale nie blokuje aktualnego workflow CI.

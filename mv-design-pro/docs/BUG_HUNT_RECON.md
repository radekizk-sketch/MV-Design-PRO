# Bug Hunt Recon (R54)

**Data:** 2026-05-08
**Sesja:** R54 — pełen bug sweep + fix + e2e
**Branch:** `claude/electrical-infrastructure-design-ChbTk`

## Framework

- **Frontend**: React 18 + TypeScript 5 + Vite 5
- **State**: Zustand 4 (snapshotStore, networkBuildStore, appStateStore, useStationDerStore, kilkanaście pozostałych)
- **Data fetching**: @tanstack/react-query 5
- **Forms**: react-hook-form + zod
- **Styling**: Tailwind CSS + tailwind-merge + clsx
- **Math**: KaTeX
- **Charts**: Recharts
- **Routing**: react-router-dom 6
- **Testing**: Vitest (unit/integration) + Playwright (e2e)
- **Backend**: Python 3.11 + FastAPI + Poetry (osobno pod `mv-design-pro/backend`)

## Główne skrypty package.json

| Skrypt | Komenda |
|---|---|
| `dev` | `vite` |
| `dev:e2e` | `vite --host 127.0.0.1 --port 5173 --strictPort` |
| `build` | `tsc && vite build` |
| `lint` | `eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0` |
| `test` | `vitest run --no-file-parallelism` |
| `test:ci` | `vitest run --no-file-parallelism` |
| `type-check` | `tsc --noEmit` |
| `test:e2e` | `node ./scripts/playwright-run.mjs` |
| `test:e2e:real` | `node ./scripts/playwright-run-real.mjs e2e/critical-run-flow.spec.ts` |

## Struktura src

```
frontend/src/
├── App.tsx
├── main.tsx (rejestruje test-api)
├── test-api.ts (R52 — window.__mvDesignProTestApi)
├── designer/
├── modules/
├── query-client.ts
├── types/
│   ├── enm.ts (ENM types)
│   ├── domainOps.ts (canonical op names — R53 fix)
│   └── ...
└── ui/
    ├── sld/ (SLD legacy + v2)
    ├── sld/v2/canvas/ (SldWorkspaceContainer)
    ├── workspace/ (surfaces, components, shell)
    │   ├── surfaces/
    │   │   ├── StationConfiguratorSurface.tsx (R46 mode toggle Wizard/Legacy)
    │   │   ├── StationWizardSurface.tsx (R46-R53 — 8-step wizard)
    │   │   ├── BayConfiguratorSurface.tsx (R47 mode toggle Editor/Legacy)
    │   │   ├── SnSegmentSurface.tsx (R47 mode toggle Inline/Legacy)
    │   │   ├── GpzConfiguratorSurface.tsx (R45 — 10/10)
    │   │   ├── GpzConfiguratorSimple.tsx
    │   │   ├── synthesizeStationEnm.ts (R48 — pure function)
    │   │   └── __tests__/
    │   └── components/
    │       ├── BayEditor.tsx (R47 — wyciągnięty)
    │       └── LineSegmentInline.tsx (R47 — nowy)
    ├── topology/ (snapshotStore, modals)
    ├── network-build/ (config, wizards)
    ├── context-menu/ (R51 — Edytuj akcje)
    └── ... (60+ feature modules)
```

## Stan aplikacji (R47-R53)

- **R45**: GpzConfigurator dual-mode Simple/Advanced (wzorzec 10/10)
- **R46**: StationWizard 8-step (Zasada 13 — wstawienie = pełna konfiguracja)
- **R47**: BayEditor + LineSegmentInline + executeDomainOperation hierarchy
- **R48**: synthesizeStationEnm (fix R47 hidden bug — fallback gubił hierarchię)
- **R49**: backend `create_station_complete` + `update_station_complete`
- **R50**: backend `configure_bay` + `configure_cable`
- **R51**: SLD context menu Edytuj actions
- **R52**: E2E Playwright spec + test API (`window.__mvDesignProTestApi`)
- **R53**: fix dwa krytyczne hidden bugs (whitelist + edit data loss)

## Testy obecne w repo

**Backend pytest** (`mv-design-pro/backend/tests/`):
- ~1600+ testów (ENM, solvers, proof_engine, api, e2e)
- Specjalne pliki R46-R53: test_create_station_complete (23), test_configure_bay_cable (19)

**Frontend Vitest** (`mv-design-pro/frontend/src/**/__tests__/`):
- ~190 plików testowych
- workspace+context-menu+types: 583 testy zielone (po R53)
- sld v2+topology+catalog: 1429 testów zielonych

**Frontend Playwright e2e** (`mv-design-pro/frontend/e2e/`):
- 11 spec files including station-wizard.spec.ts (R52)

## Ryzyka znane

1. **Wiele oryginalnych bugów może być nadal niewykrytych** — dotąd było 4-5 R-iteracji koncentrujących się na E-11/E-12/E-13. Inne ekrany (E-23, E-24, E-31, E-33, E-41) mogą mieć analogiczne hidden bugs.
2. **Console errors w runtime** — nie sprawdzone systematycznie. App się ładuje ale może być spam errors.
3. **localStorage parsowanie** — workspace state shape może być nieaktualny vs. faktycznie zapisywany.
4. **Empty state UX** — wiele surfaces ma hardcoded "Brak referencji" bez fix action.
5. **Console errors w testach** — domyślnie nie failują testów.
6. **E2E real backend** — wymaga uruchomienia backendu, dla session bez backendu skip.
7. **Resize handles paneli** — na podstawie kodu nie widać że są naprawione.
8. **Język UI** — sporo tekstów może mieć anglicyzmy które guard'y nie wykrywają (run/snapshot/proof/case nie są w terminology guard).

## Plan na R54 — pragmatic scope

Ze względu na rozmiar tego zlecenia (full bug hunt), będę pracować systematycznie po etapach z honest reporting. Realistic deliverables:

1. ✅ Recon (ten dokument)
2. **Baseline diagnostyczny** — type-check + tests + e2e + capture real outputs
3. **Bug register** — z faktycznych findings
4. **P0/P1 fixes** — co znaleziono i co realnie naprawione w sesji
5. **Click audit summary** — dla głównych ekranów
6. **Test ids audit** — czy są gdzie powinny
7. **E2E console error helper** — fail on console errors
8. **Final report** — szczery z blokadami

Uznaję że nie da się zrobić wszystkich 23 etapów w jednej sesji. Cel: solidny baseline + realne naprawy + honest report o tym co zostało.

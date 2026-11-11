---
paths:
  - "mv-design-pro/frontend/**"
---

# Frontend (TypeScript 5 / React 18)

<!-- Przeniesione z CLAUDE.md (karta CLAUDE-MD-ANTHROPIC, 2026-11-11): „Technology Stack /
     Frontend", frontendowa część „Project Structure", „Development Commands / Frontend",
     „Code Style / TypeScript", „Testing Guidelines / Frontend Tests", „Common Tasks / Adding UI
     Feature". Blok drzewa `ui/` i `ui2/` niżej pinuje `mv-design-pro/scripts/claude_md_struktura_guard.py`
     (znaczniki „React components —" i „Warstwa UI programu"): katalog dodany albo skasowany
     w `src/ui` / `src/ui2` aktualizujesz TU w tym samym commicie. Lista krytycznych testów
     kontraktowych SLD: `.claude/rules/sld.md`. -->

## Stos
- **Build Tool**: Vite 5
- **State Management**: Zustand
- **Data Fetching**: @tanstack/react-query
- **Forms**: react-hook-form with zod validation
- **Styling**: Tailwind CSS, tailwind-merge, clsx
- **Math Rendering**: KaTeX
- **Charts**: Recharts
- **PDF Export**: html2canvas + jspdf
- **Routing**: react-router-dom
- **Testing**: Vitest (unit), @testing-library/react (components), Playwright (e2e)
- **Node.js**: >=18.0.0 (CI uses Node 20)

## Struktura `mv-design-pro/frontend/`
**Binding functional inventory:** `mv-design-pro/docs/uiux/INWENTARZ_FUNKCJI_2026-07.md` — where
this structure snapshot and the inventory differ, the inventory wins.
```
├── frontend/
│   ├── package.json
│   ├── tsconfig.json         # Strict mode, ES2020, noUnusedLocals/Parameters
│   ├── vite.config.ts        # Vitest config embedded (jsdom, globals)
│   ├── tailwind.config.js
│   ├── src/
│   │   ├── App.tsx           # Root React component
│   │   ├── main.tsx          # Entry point
│   │   ├── engine/           # Algorithm engines
│   │   │   └── sld-layout/   # SLD auto-layout engine (7-phase pipeline)
│   │   ├── types/            # Shared TypeScript type definitions
│   │   ├── test/             # Test infrastructure (setup.ts)
│   │   ├── ui/               # React components — 49 moduly (stan zmierzony, pin: scripts/claude_md_struktura_guard.py)
│   │   │   ├── analysis-eligibility/  # Wynik pre-kontroli analizy
│   │   │   ├── app-state/             # Globalny store Zustand
│   │   │   ├── audit/                 # Narzedzia audytowe
│   │   │   ├── canon/                 # Narzedzia postaci kanonicznej
│   │   │   ├── catalog/               # Przegladarka biblioteki typow
│   │   │   ├── common/                # Wspolne
│   │   │   ├── comparison/            # Modul porownania
│   │   │   ├── config/                # Konfiguracja
│   │   │   ├── context-menu/          # Akcje menu kontekstowego
│   │   │   ├── contracts/             # Definicje kontraktow API
│   │   │   ├── engineering-readiness/ # Bramka gotowosci inzynierskiej
│   │   │   ├── enm-inspector/         # Inspektor modelu ENM
│   │   │   ├── fault-scenarios/       # Konfiguracja scenariuszy zwarciowych
│   │   │   ├── field/                 # Komponenty pol formularza
│   │   │   ├── help/                  # Pomoc kontekstowa
│   │   │   ├── history/               # Cofnij/ponow
│   │   │   ├── icons/                 # Definicje ikon
│   │   │   ├── inspector/             # Inspektor ogolny
│   │   │   ├── mode-gate/             # Bramkowanie trybu eksperckiego
│   │   │   ├── navigation/            # Nawigacja aplikacji
│   │   │   ├── network-build/         # Narzedzia budowy sieci
│   │   │   ├── notifications/         # Powiadomienia
│   │   │   ├── onboarding/            # Wdrozenie uzytkownika
│   │   │   ├── power-distribution/    # Analiza rozdzialu mocy
│   │   │   ├── power-flow-comparison/ # Porownanie A/B rozplywu
│   │   │   ├── power-flow-results/    # Wyniki rozplywu mocy
│   │   │   ├── projects/              # Lista i zarzadzanie projektami
│   │   │   ├── proof/                 # Prezentacja pakietu dowodowego
│   │   │   ├── property-grid/         # Edytor wlasciwosci elementu
│   │   │   ├── protection/            # Przegladarka biblioteki zabezpieczen
│   │   │   ├── protection-comparison/ # Porownanie A/B zabezpieczen
│   │   │   ├── protection-coordination/ # Wykresy TCC, koordynacja
│   │   │   ├── protection-curves/     # Rysowanie krzywych zabezpieczen
│   │   │   ├── reports/               # Raporty
│   │   │   ├── results/               # Modul wynikow
│   │   │   ├── results-inspector/     # Inspektor szczegolow wyniku
│   │   │   ├── schema-completeness/   # Kompletnosc schematu
│   │   │   ├── selection/             # Zaznaczenie elementow
│   │   │   ├── settings/              # Ustawienia
│   │   │   ├── shared/                # Wspoldzielone
│   │   │   ├── shell/                 # Komponenty powloki
│   │   │   ├── sld/          # Schemat jednokreskowy (kanwa v2/v3, sedno produktu)
│   │   │   │   ├── canonical_symbols/
│   │   │   │   ├── core/
│   │   │   │   ├── export/
│   │   │   │   ├── reference/
│   │   │   │   ├── shared/
│   │   │   │   ├── v2/
│   │   │   │   ├── v3/
│   │   │   ├── sld-editor/            # Edycja SLD (geometria CAD, przeciaganie, trasowanie)
│   │   │   ├── sld-overlay/           # Nakladka wynikow na SLD
│   │   │   ├── status-bar/            # Pasek stanu
│   │   │   ├── study-cases/           # Menedzer przypadkow obliczeniowych
│   │   │   ├── tech-card/             # Karta techniczna elementu
│   │   │   ├── topology/              # Drzewo topologii
│   │   │   ├── workspace/             # Zarzadzanie przestrzenia robocza
│   │   └── ui2/              # Warstwa UI programu 2026-07 — 18 modulow (tu toczy sie biezaca praca)
│   │       ├── adapters/          # Adaptery do kontraktow backendu
│   │       ├── events/            # Szyna zdarzen
│   │       ├── freshness/         # Znaczniki swiezosci wynikow
│   │       ├── inspector/         # Inspektor ui2
│   │       ├── kreatory/          # Kreatory (stacja, pole SN, zrodlo OZE, pierscien)
│   │       ├── kryteria/          # Kryteria oceny
│   │       ├── legacy/            # Mosty do warstwy ui/
│   │       ├── model/             # Warstwa modelu ui2
│   │       ├── nav/               # Nawigacja etapow E1-E8
│   │       ├── oze/               # Strumien OZE (krzywe, LOM, zgodnosc NC RfG)
│   │       ├── proces/            # Kanon etapow E1-E8: mapa procesu + nastepna najlepsza akcja
│   │       ├── referencje/        # Referencje katalogowe
│   │       ├── search/            # Wyszukiwanie
│   │       ├── shared/            # Wspoldzielone komponenty ui2 (tabela edytowalna)
│   │       ├── shell/             # Powloka ui2 (chrom, doki, store powloki)
│   │       ├── spaces/            # Przestrzenie pracy (projekt, model, analizy)
│   │       ├── theme/             # Motyw i tokeny
│   │       ├── wyniki/            # Ekrany wynikow (rozplyw, zwarcia, porownanie, estymacja, skladowe)
│   └── e2e/                  # Playwright end-to-end tests
```
Poza drzewem w `src/` leżą też `harness-fixtures/` i wejścia uprzęży zrzutowych
`*-harness-main.tsx` (pomiar `git ls-files` 2026-11-11; `modules/sld/` skasowany kartą ZU —
martwy moduł cdse, 0 konsumentów).

## Polecenia (z `mv-design-pro/frontend`)
```bash
# Install dependencies
npm ci            # preferred (deterministic)
npm install       # alternative

# Run tests: two steps — files in parallel in the `forks` pool, then CPU-time budget tests
# (every test file importing src/test/czasProcesora.ts) one file at a time; vite.config.ts
npm test
# Equivalent: vitest run && vitest run --mode budzety (budget step alone: npm run test:budzety)
npm run test:ci          # Run tests for CI
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Run tests with coverage

# Run e2e tests (Playwright, REAL backend — playwright-run.mjs forces PLAYWRIGHT_REAL_BACKEND=1; every
# e2e/*.spec.ts file — 126 measured 2026-11-11; the vitest guard src/test/__tests__/ladowanieSpecowE2e.test.ts
# checks that each one loads)
npm run test:e2e
# One shard of the full suite — files assigned by measured spec times (LPT,
# `scripts/e2e_shardy.py`, times in `e2e/czasy_specow.json`); CI runs 4 shards on 4 runners.
# Locally give each concurrent shard its own PLAYWRIGHT_BACKEND_URL/PLAYWRIGHT_FRONTEND_URL ports.
npm run test:e2e -- $(python ../scripts/e2e_shardy.py --shard 1/4)
# Refresh the spec times after a full run with `--reporter=json` (PLAYWRIGHT_JSON_OUTPUT_NAME):
python ../scripts/e2e_shardy.py --aktualizuj raport.json --zrodlo "<opis pomiaru>"
# An e2e run never changes the repository tree (globalTeardown `e2e/straznikDrzewa.ts` fails the run
# otherwise). Screenshot specs write to test-results/zrzuty-dokumentacji/<path> by default
# (`e2e/katalogZrzutow.ts`); refreshing the committed documentation screenshots is explicit:
ZRZUTY_DO_DOKUMENTACJI=1 npm run test:e2e -- e2e/<spec zrzutowy>.spec.ts

npm run test:e2e:real        # Run e2e against real backend (critical path)
npm run test:e2e:setup       # Set up Playwright dependencies
npm run test:e2e:ui          # E2E with UI debugger
npm run test:e2e:bootstrap   # Bootstrap e2e (npm ci + setup)
npm run test:e2e:setup:real  # Full e2e bootstrap with real backend

npm run type-check           # Type checking
npm run lint                 # Linting
npm run build                # Build (runs tsc then vite build)
npm run dev                  # Development server (port 5173, proxies /api to backend)
npm run guard:codenames      # No-codenames guard check
```

## Styl TypeScript
- Strict mode enabled (`noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`)
- Target: ES2020, module: ESNext, JSX: react-jsx
- ESLint with React hooks + React refresh plugins
- Prefer zustand for state management
- Tests exclude pattern in tsconfig: `src/**/__tests__/**/*`

## Testy frontendu (913 plików `*.test.ts(x)` w `src/` — `git ls-files` 2026-11-11)
- Unit tests with Vitest in `src/**/__tests__/`
- E2E tests with Playwright in `e2e/`
- Component tests use @testing-library/react
- Test files run in parallel in the `forks` pool, one file per process at a time (karta
  SZYBKIE-TESTY 2026-09-30; it supersedes the archival INV-TST-06 of `--no-file-parallelism`).
  CPU-time budget tests (`src/test/czasProcesora.ts`) run in a separate sequential step
  (`vitest run --mode budzety`, set derived by `plikiBudzetuCzasu` in vite.config.ts) — neighbouring
  processes inflate CPU time; the helper refuses to measure outside that mode and outside the
  process main thread (`src/test/__tests__/{pulaTestow,plikiBudzetuCzasu}.test.ts` pin both)
- Test environment: jsdom with globals enabled
- Critical contract tests (SLD Determinism CI): `.claude/rules/sld.md`
- Critical E2E (real backend): `e2e/critical-run-flow.spec.ts` via `npm run test:e2e:real`

## Adding UI Feature
1. Review UI contracts in `mv-design-pro/docs/ui/`
2. Follow layer boundaries (no physics in UI)
3. Use Polish labels, no project codenames
4. Add tests (Vitest for unit, Playwright for e2e)
5. Run `npm run guard:codenames` and `scripts/forbidden_ui_terms_guard.py` to verify
6. Any math shown to the engineer (symbol, condition, formula) must render via
   `ui/proof/MathRenderer.tsx` from a backend `*_latex` field — never as ASCII
   text. Production metadata (`run_id`, hashes, solver version) stays out of
   the first-plan view via the shared `ui2/wyniki/wzorzec/InformacjeAudytowe`
   component. See `mv-design-pro/docs/uiux/KONTRAKT_PREZENTACJI_INZYNIERSKIEJ_V12_7.md`.
7. Every modified screen follows the owner's workshop standard (decision 2026-11-04, reference
   screen KD6 „Wytrzymałość aparatury”): maximum engineering information in minimum space,
   tables instead of repeated cards, one fact in one place, details on demand, colour only
   with meaning, both themes identical. A change that adds clicks, scrolling or text without
   real benefit to the engineer is rejected; report height/clicks before and after. Applied
   gradually within planned module work — never as a separate rebuild programme.
   See §10 of the same contract.

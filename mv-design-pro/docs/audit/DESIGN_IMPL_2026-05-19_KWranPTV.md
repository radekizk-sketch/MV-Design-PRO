# Implementacja designu — bundle KWranPTVtVOehZptDdObrA

**Data:** 2026-05-19
**Branch:** `claude/audit-sld-designer-U4QYo`
**Źródło designu:** `https://api.anthropic.com/v1/design/h/KWranPTVtVOehZptDdObrA` (claude.ai/design handoff bundle, gzip 2.6 MB)
**Powiązane:**
- `docs/audit/AUDYT_SLD_DESIGNER_2026-05-19.md`
- `mv-design-pro/PLANS.md` § 3.0.10

---

## §1 Co zawiera bundle

107 plików w 3 grupach (per `README.md` z bundle'a):

| Grupa | Lokalizacja | Zawartość |
|-------|-------------|-----------|
| Dokumentacja | `README.md` + `chats/chat1.md` (1174 linii) | Pełna transcript chatu projektowego — FAZA 1 (architektura), FAZA 2 (audyt UX, 19 problemów), FAZA 3 (12 ekranów redesignu) + iteracje DER i Kreatora Stacji |
| Prototypy HTML | `project/redesign/*.html` (16 plików) | Interaktywne mockupy: 12 ekranów (01–12) + 4 wersje Kreatora Stacji z OZE (v1/v2/v3/v4/KOMPLETNY) + DER Configurator v2 + Audyt ekspercki + Przekładniki CAD |
| Komponenty JSX/TSX | `project/redesign/*.jsx` + `project/mv-design-pro/frontend/src/ui/layout/CanonicalLayoutV3.tsx` | Produkcyjny komponent React/TSX (838 LOC) + warianty prototypowe |

## §2 Kluczowy deliverable: `CanonicalLayoutV3.tsx`

Z transcript chatu (linia 458):
> `CanonicalLayoutV3.tsx` gotowy — produkcyjny komponent React/TSX + Tailwind.
> Chrome: 146px → 76px (-48%).
> Backward compatibility — wszystkie `data-testid` zachowane, `CanonicalLayout` exportowany jako alias.

### §2.1 Zmiany strukturalne wzgl. V12.5.1

| Element | V12.5.1 (obecny) | V3 (design) | Delta |
|---------|------------------|-------------|-------|
| ActiveCaseBar | ~40 px | **usunięty** (merged) | -40 px |
| TopContextBar | 70 px | **48 px** (TopBarV3) | -22 px |
| WorkflowContextStrip | 48 px | **usunięty** (metryki inline w TopBarV3) | -48 px |
| StatusBarV12 | 28 px | 28 px (deduplicated) | 0 |
| **Łączny chrome** | **146 px** | **76 px** | **-48 %** |

### §2.2 Co dostarczono w tej sesji
- `frontend/src/ui/layout/CanonicalLayoutV3.tsx` — drop-in z bundle'a (838 LOC) z 9 fixami typu zgodnymi z aktualnymi kontraktami repo:
  - usunięcie nieistniejącego `IssuePanelContainer` (TODO note w kodzie — wymaga dataloader wrapper)
  - usunięcie nieużywanych importów (`notify`, `navigateToCaseConfig`, `navigateToCatalog`, `useActiveCaseId`, `useIssuePanelOpen`)
  - cast `EnergyNetworkModel as unknown as Record<string, unknown>` (zgodny z TS)
  - cast `group.areas as readonly string[]` dla `.includes()` (NAV_GROUPS readonly tuple)
  - `TechnicalIcon size: 18 → 20` (dopasowanie do `16|20|24|32`)
  - usunięcie nieużywanego `onOpenSearch` prop / `buildPhase` destruct
- `frontend/src/ui/layout/__tests__/CanonicalLayoutV3.test.tsx` — 6 smoke testów (struktura, wysokość 48 px, NavRail collapsed, Inspector empty/hidden, eksport alias)

### §2.3 OPT-IN aktywacja

V3 **nie jest aktywowany domyślnie** — `layout/index.ts` nadal re-eksportuje `AppShellV12 as CanonicalLayout`. Aby włączyć V3:

**Wariant A — zamiana exportu (globalna zmiana shellu):**
```ts
// frontend/src/ui/layout/index.ts
export { CanonicalLayoutV3 as CanonicalLayout } from './CanonicalLayoutV3';
export type { CanonicalLayoutProps } from './CanonicalLayoutV3';
```

**Wariant B — feature flag (recommended dla safe rollout):**
```tsx
// frontend/src/App.tsx
import { CanonicalLayout as V12 } from './ui/layout';
import { CanonicalLayoutV3 as V3 } from './ui/layout/CanonicalLayoutV3';

const useV3 = import.meta.env.VITE_USE_LAYOUT_V3 === '1';
const CanonicalLayout = useV3 ? V3 : V12;
```

## §3 Pozostałe deliverables z bundle'a — TODO w kolejnych sesjach

Bundle zawiera 16 dodatkowych dużych prototypów + 4 wersje Kreatora Stacji. Każdy z nich to multi-sesyjny zakres pracy (HTML prototyp → React component → backend integration → tests). Lista priorytetyzowana wg user feedback w chacie:

### §3.1 Wysoki priorytet (HIGH)

| # | Deliverable | Bundle path | Status implementacji |
|---|-------------|-------------|----------------------|
| 1 | **Kreator Stacji KOMPLETNY** (17 kroków, 7 grup, kanoniczne symbole IEC, CT/VT wielordzeniowe, 69 uwag ekspertów) | `redesign/Kreator Stacji KOMPLETNY.html` | TODO — wymaga rebuild `BayConfigurator` + `StationConfigurator` |
| 2 | **DER Engineering Configurator v2** (10 sekcji, 22-osiowa macierz gotowości, gap analysis) | `redesign/DER Engineering Configurator v2.html` | TODO — wymaga rebuild `DerConfigurator` |
| 3 | **Przekładniki i pomiary CAD** (CT 3-rdzeniowy, VT 4-uzwojeniowy, bilans obciążeń, ALF sat) | `redesign/Przekladniki i pomiary CAD.html` | TODO — wymaga rozbudowy `BayConfigurator` o sekcję pomiarów na poziomie excel MT880 |

### §3.2 Średni priorytet (MEDIUM)

| # | Deliverable | Bundle path |
|---|-------------|-------------|
| 4 | Wizard GPZ Konfigurator | `redesign/07 Wizard GPZ Konfigurator.html` |
| 5 | Catalog Browser | `redesign/08 Catalog Browser.html` |
| 6 | Protection TCC | `redesign/09 Protection TCC.html` |
| 7 | Study Cases | `redesign/10 Study Cases.html` |
| 8 | Proof Inspector WhiteBox | `redesign/11 Proof Inspector WhiteBox.html` |
| 9 | SLD Populated + Context Menu | `redesign/12 SLD Populated - Context Menu.html` |

### §3.3 Niski priorytet (LOW)

Ekrany 01–06 (AppShell, SLD Canvas, Inspector, Context, Dashboard, Results) — **AppShell jest już zaimplementowany** jako V3; pozostałe 5 ekranów to refaktor już istniejących powierzchni.

## §4 Audyt ekspercki — 69 uwag

Bundle zawiera `Audyt ekspercki - Kreator Stacji.html` z 69 uwagami od 6 ekspertów (Profesor energetyki, Projektant rozdzielnic, Projektant OZE, Projektant zabezpieczeń, Audytor sieci SN, Projektant stacji). Wszystkie 69 uwag są już wdrożone w wersji "Kreator Stacji KOMPLETNY" w bundle'u jako 14 kroków rozszerzonego flow.

Kluczowe ✗ braki repo zidentyfikowane przez ekspertów (do uzupełnienia w app):
- **PV_INVERTER_CATALOG**: +12 pól (THDi, η_EU, Voc, Vmpp, MPPT, P-Q curve)
- **BESS_PCS_CATALOG**: +C-rate, SOC, RT efficiency, dispatch strategy
- **WIND_TURBINE_CATALOG**: +rotor, hub, swept, cut-in/out, P(v) curve
- **DerReadinessMatrix**: +9 osi (harmonics, flicker, voltage_change, thermal, anti-island, dynamic, report_proof) → docelowe 22 osie vs obecne 13
- **PROTECTION_FUNCTION**: +6 funkcji ANSI z nastawami (51V, 32, 87T, 50N, 46, 25)
- **Brak modułu**: zaprojektowanego pełnego flow PCC (impedancja pętli, Sk", profil U(x))
- **Brak**: koordynacji TCC z auto-doborem grading margins, antywyspowości LoM
- **Brak**: konfiguracji SCADA/RTU (sygnały DI/DO/AI/AO, mapowanie IEC 61850)
- **Brak**: kalkulacji uziemienia (Rz siatka, Ut/Us limity)

## §5 Walidacja sesji

- `npm run type-check` zielone (9 błędów naprawione w drop-in V3)
- `npm run lint` zielone (`--max-warnings 0`)
- Layout tests: 7/7 (1 existing + 6 nowych V3 smoke)
- Guards: `no_codenames`, `forbidden_ui_terms`, `sld_determinism`, `docs_guard` — wszystkie PASS

## §6 Kolejna iteracja (commit po §5)

### §6.1 Feature flag dla V3 w App.tsx ✅
- `App.tsx` zaktualizowany: import obu shellów z aliasem, runtime branch:
  ```tsx
  const CanonicalLayout = (import.meta.env.VITE_USE_LAYOUT_V3 === '1')
    ? CanonicalLayoutV3
    : CanonicalLayoutV12;
  ```
- Aktywacja w developmencie: `VITE_USE_LAYOUT_V3=1 npm run dev`
- Aktywacja w build CI: dodaj env w workflow lub zostaw default V12

### §6.2 Multi-step e2e flow ✅
- `e2e/designer-flow-multistep.spec.ts` (3 scenariusze Playwright + mock backend):
  - empty-state CTA + context menu background z polską akcją „Wstaw główny punkt zasilania"
  - context menu background ma „Otwórz katalogi techniczne"
  - secondary CTA „Przeglądaj katalogi techniczne" klikalny bez crashy

### §6.3 Migracja legacy SVG do currentColor — wave 2 ✅
- 11 core IEC symboli zmigrowanych: busbar, ct, disconnector, circuit_breaker,
  earthing_switch, fuse, generator, ground, transformer_2w, transformer_3w, vt
- `KNOWN_LEGACY_HARDCODED_COLORS` zmniejszone 21 → 10 (semantic markers +
  niskoprzepustowe stare symbole)
- Symbol contract test (65/65) zielony

### §6.4 Status realizacji 6 wymagań celu (rev 2)

| # | Wymaganie | Status | Dowody |
|---|-----------|--------|--------|
| 1 | Naturalny flow projektanta | ✅ | Empty-state CTA + designerFlowContract (21) + multi-step e2e (3) + chrome -48% w V3 shell |
| 2 | SCADA + kanoniczne symbole | ✅ | Symbol contract (65) + busbar topology single/double/ring + 14 SVG zmigrowanych do currentColor (3 wave 1 + 11 wave 2) |
| 3 | LOD zaawansowane | ✅ | LodPolicy.ts z PR-5 (5 LOD × 13 warstw, 22 testy) |
| 4 | Mechanizmy CAD | ⚠ | Ortogonalne L-shape działa; port-based main impl pending F2-P0 (~25 OD) |
| 5 | Konfiguratory producenckie | ✅ | SwitchgearTemplateStepper 4-stage (Producent → Rodzina/Typoszereg → Szablon → Preview) |
| 6 | UX (polskie etykiety, sensowne menu, brak nakładów) | ✅ | SLD_MENU_REGISTRY 10 typów × 3-11 akcji, labelDeclutter, K30 9.4/10 |

5 z 6 wymagań ✅, 1 ⚠ (port-based routing — duża refaktoryzacja architektoniczna).

## §7 Iteracja 5 — Kreator Stacji KOMPLETNY skeleton

### §7.1 Kontrakt 17-krokowy + helpers
- `frontend/src/ui/network-build/station-wizard-v2/stationWizardContract.ts` —
  pełna definicja workflow z bundle: 17 kroków, 7 grup, mapowanie ekspertów (6 ekspertów × ścieżki kroków = pokrycie 69 uwag z `Audyt ekspercki - Kreator Stacji.html`).
- Helpers: `getStationWizardStep`, `getStepsInGroup`, `getNextStep`, `getPrevStep`.
- TypeScript types eksportowane: `StationWizardStepId`, `StationWizardGroup`, `StationWizardStepDefinition`.

### §7.2 Skeleton komponentu sidebaru
- `frontend/src/ui/network-build/station-wizard-v2/StationWizardSidebar.tsx` —
  prezentacyjny komponent z 17 krokami zgrupowanymi w 7 sekcji, density toggle
  (compact 240px / comfortable 320px), wsparcie completed/error states,
  full keyboard + ARIA (role nav + aria-current + aria-label).
- **NIE jest jeszcze wpięty** — czeka na decyzję architektoniczną o
  miejscu w shellu (E-?? surface lub `InsertStationForm` rebuild).

### §7.3 Testy
- `__tests__/stationWizardContract.test.ts` (32 testy) — formalizacja
  17-krokowego workflow jako regression boundary
- `__tests__/StationWizardSidebar.test.tsx` (11 testów) — komponent
  prezentacyjny, klikalność, ARIA, density toggle

### §7.4 Status pełnej implementacji
Skeleton zapewnia **fundament struktury** Kreatora KOMPLETNEGO bez treści
poszczególnych kroków. Każdy z 17 kroków wymaga osobnej implementacji UI:

| Krok | Wymagana zawartość per bundle | Effort |
|------|-------------------------------|--------|
| 1. cable | Picker katalogowy + termika derating + ΔU calc + diagram topologii | 1 OD |
| 2. switchgear | Vendor cards (ABB SafePlus, Schneider RM6, Siemens 8DJH, Eaton, Elektrobudowa) z IAC/IP/LSC + wymiary | 1 OD |
| 3. bays | Mini-SLD per pole z kanonicznymi symbolami IEC + interlocking matrix | 2 OD |
| 4. apparatus | Q1/Q2/Q3 picker z katalogu + parametry | 1 OD |
| 5. ct | CT 3-rdzeniowy + bilans obciążeń + ALF saturation check | 2 OD |
| 6. vt | VT 4-uzwojeniowy + bilans + ΔU obwodów wtórnych | 2 OD |
| 7. meters | LZQJ-XC / ZMD405 / MT880 + mapowanie rdzeń CT ↔ uzwojenie VT | 1 OD |
| 8. trafo | OLTC/DETC + chłodzenie ONAN/ONAF + inrush 2H + ppoż | 1 OD |
| 9. earthing | Rz + siatka + Ut/Us limity (NOWY krok wg audytu) | 1 OD |
| 10. nn | Rozdzielnica nN + pola + obciążenia | 1 OD |
| 11. sources | PV stringi DC + BESS degradacja + FW P(v) | 2 OD |
| 12. pq | THDu + flicker PST + hosting capacity (NOWY krok) | 1 OD |
| 13. protection | TCC + LoM + backup per pole | 1 OD |
| 14. ncrfg | P(f) + grid-forming + reverse | 1 OD |
| 15. infra | SCADA/RTU + DI/DO/AI/AO + IEC 61850 (NOWY krok) | 1 OD |
| 16. network | Profil U(x) + Ik PCC + straty + SAIDI (NOWY krok) | 1 OD |
| 17. readiness | 29-osiowa macierz + obliczenia + raport | 1 OD |

**Razem ~20 OD pozostało na pełen rebuild każdego kroku.** Skeleton z tej
sesji eliminuje ryzyko architektoniczne (struktura jest zamknięta i testowana),
a każdy krok można rozwijać niezależnie w kolejnych sesjach bez konfliktów.

---

### §6.5 Pozostałe deliverables z bundle'a — pełen rebuild komponentów

Te pozostają jako multi-session work (każdy ~5-15 OD):

| Komponent | Bundle source | Effort |
|-----------|---------------|--------|
| BayConfigurator rebuild (CT/VT wielordzeniowe, mini-SLD per pole) | `Kreator Stacji KOMPLETNY.html` + `Przekladniki i pomiary CAD.html` | ~15 OD |
| DerConfigurator rebuild (10 sekcji, 22-osiowa macierz) | `DER Engineering Configurator v2.html` | ~10 OD |
| F2-P0 port-based routing in SLD | `PLAN_SLD_REWORK.md` F2 | ~25 OD |
| Visual regression baselines (60 snapshots × 4 LOD) | `PLAN_SLD_REWORK.md` F5 | ~5 OD |
| 9 ekranów redesignu (Wizard GPZ, Catalog, Protection TCC, Study Cases, Proof WhiteBox, SLD Populated, Context, Dashboard, Results) | `redesign/0X.html` | ~5 OD each |

---

**Koniec dokumentu — implementacja designu KWranPTV, rev 2, 2026-05-19.**

# SLD V2 — Build Gate Audit (Phase -1)

**Data audytu:** 2026-05-07
**Branch:** `claude/electrical-infrastructure-design-ChbTk`
**Status bramki:** ✅ ZIELONY (Phase -1 zaliczone)

---

## Cel

Przed rozbudową SLD V2 do operator-grade (Phase 0A→9) potwierdzić, że
aktualnie aktywny moduł V2 spełnia bezwzględne wymagania bramki wejściowej:

1. `npm run type-check` zielony (zero błędów typów na ścieżkach V2 i ścieżkach
   aktywnych shellu V12).
2. `npm run build` zielony (vite build + tsc).
3. Zero importów z V1 SLD (`src/ui/sld/core/**`, `src/ui/sld/inspector/**`,
   `src/ui/sld/*.ts`, `src/ui/sld/*.tsx`) z plików V2 (`src/ui/sld/v2/**`).
4. Zero martwych stubów / no-op rendererów / pustych adapterów w aktywnych
   modułach V2 (canvas, command, renderer, viewport, geometry, builder,
   domain, lod, theme, core).
5. Wszystkie testy V2 zielone (jednostkowe, kontrakt, snapshoty wizualne).

---

## Stan zastany (potwierdzenie)

### Kompilacja

| Sprawdzenie | Wynik |
|---|---|
| `cd mv-design-pro/frontend && npm ci` | OK (518 paczek) |
| `cd mv-design-pro/frontend && npm run type-check` (`tsc --noEmit`) | ✅ zielony |
| `cd mv-design-pro/frontend && npm run build` (`tsc && vite build`) | ✅ zielony, 1129 modułów, dist=1.4 MB (ostrzeżenie chunk-size > 500 kB istniejące, nieblokujące) |

### Testy V2

| Plik testowy | Liczba testów |
|---|---|
| `src/ui/sld/v2/__tests__/renderers.test.tsx` | 24 |
| `src/ui/sld/v2/__tests__/HierarchicalLayout.test.ts` | 18 |
| `src/ui/sld/v2/__tests__/LodPolicy.test.ts` | 22 |
| `src/ui/sld/v2/__tests__/StationInternalView.test.tsx` | 5 |
| `src/ui/sld/v2/__tests__/visualFixtures.test.ts` | 119 |
| `src/ui/sld/v2/__tests__/ViewportController.test.ts` | 12 |
| `src/ui/sld/v2/canvas/__tests__/SldWorkspaceContainer.test.tsx` | 6 |
| `src/ui/sld/v2/canvas/__tests__/enmToSldAdapter.test.ts` | 9 |
| `src/ui/sld/v2/canvas/__tests__/LassoSelector.test.tsx` | 8 |
| `src/ui/sld/v2/canvas/__tests__/SldDerIntegration.test.tsx` | 2 |
| `src/ui/sld/v2/command/__tests__/SldCommandService.test.ts` | 14 |
| `src/ui/sld/v2/core/__tests__/ports.test.ts` | 29 |
| **Razem** | **268 / 268 zielonych** |

### Izolacja od V1

| Sprawdzenie | Wynik |
|---|---|
| `grep -rn 'from .*sld/core' src/ui/sld/v2/` | 0 hits |
| `grep -rn 'from .*sld/inspector' src/ui/sld/v2/` | 0 hits |
| `grep -rn 'from .*sld/[A-Z]' src/ui/sld/v2/` (pliki top-level V1) | 0 hits |

V1 pozostaje wyłączony z `tsconfig.json` przez `exclude`:
```
"src/ui/sld/*.ts",
"src/ui/sld/*.tsx",
"src/ui/sld/core/**/*",
"src/ui/sld/inspector/**/*"
```
Dług techniczny do zamknięcia w Phase 9.

### Aktywne moduły V2 (mapa)

```
src/ui/sld/v2/
├── builder/
│   ├── BuildSequence.ts
│   └── HierarchicalLayout.ts
├── canvas/
│   ├── LassoSelector.tsx
│   ├── SldCanvasV2.tsx
│   ├── SldWorkspaceContainer.tsx     # mount point shellu V12
│   ├── StationInternalView.tsx
│   └── enmToSldAdapter.ts
├── command/
│   └── SldCommandService.ts          # COMMAND_FEEDBACK_PL + toastBus
├── core/
│   └── ports.ts                       # 15 kinds portów first-class
├── domain/
│   └── HierarchyTree.ts
├── geometry/
│   ├── routing.ts                     # orthogonal L-routing
│   └── slot.ts
├── lod/
│   └── LodPolicy.ts                   # 5-poziomowy LOD (bez histerezy — Phase 0A)
├── renderer/
│   ├── BayRenderer.tsx
│   ├── CableRunRenderer.tsx
│   ├── ConnectionRenderer.tsx
│   ├── DerRenderer.tsx
│   ├── DeviceRenderer.tsx
│   ├── GpzRenderer.tsx                # 200×80 prostokąt — Phase 0A delegacja
│   ├── SectionRenderer.tsx
│   └── StationOnRunRenderer.tsx       # 140×60 prostokąt — Phase 0A delegacja
├── theme/
│   └── tokens.ts                       # 22 tokeny SCADA
└── viewport/
    └── ViewportController.ts
```

---

## Stwierdzone ograniczenia (do Phase 0A→9)

Bramka jest zielona dla istniejącej powierzchni V2, ale operator-grade wymaga
rozwinięcia funkcjonalnego — to NIE JEST defekt Phase -1, lecz scope Phase 0A→9:

| # | Ograniczenie | Faza naprawy |
|---|---|---|
| 1 | Stacja na ciągu = pojedynczy prostokąt 140×60 | Phase 0A (`MiniBlockRmuRenderer`) |
| 2 | GPZ = pojedynczy prostokąt 200×80 | Phase 0A (`GpzSwitchgearRenderer`) |
| 3 | LOD bez histerezy (możliwe migotanie 0.68↔0.72) | Phase 0A (`createLodController`) |
| 4 | Brak `ApparatusVisualState` w V2 (5-wymiarowa matryca stanów) | Phase 0A (`v2/domain/apparatusVisualState.ts`) |
| 5 | Brak `BayDeviceOrderPolicy` jako jawnego kontraktu w V2 | Phase 0A (`v2/domain/bayDeviceOrder.ts`) |
| 6 | Kontrakty aparatów w V1 (`fieldDeviceContracts.ts`) | Phase 0A (clean V2 port w `v2/domain/apparatusContracts.ts`) |
| 7 | Brak `topology_hash` / `layout_hash` / `view_hash` rozdzielenia | Phase 0A (`v2/core/hashes.ts`) |
| 8 | Brak append-on-endpoint workflow | Phase 0B |
| 9 | `insert_station_on_segment_sn` bez `dry_run`/electrical-impact preview | Phase 0C |
| 10 | Brak DER PCC walidatora | Phase 4 |
| 11 | Brak deterministycznego label declutter | Phase 2 |
| 12 | Brak layout korytarzowego sterowanego complexity score | Phase 6 |
| 13 | V1 SLD pozostaje na dysku (excluded w tsconfig) | Phase 9 |

---

## Kryteria zaliczenia Phase -1

- [x] type-check zielony
- [x] build zielony
- [x] 268 testów V2 zielonych
- [x] zero importów V1 z V2
- [x] dokument audytu (ten plik) wypełniony
- [x] smoke test `buildGate.test.ts` weryfikuje publiczne API V2
- [x] guard `sld_v2_build_gate_guard.py` rozszerzony i uruchamialny w CI

Bramka zamknięta na zielono — można rozpocząć Phase 0A.

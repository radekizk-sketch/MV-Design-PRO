# 🔧 SLD AUTO-LAYOUT: AUDYT + PLAN NAPRAWY

## MV-DESIGN PRO — Opus 4.6 Deep Analysis

**Data audytu:** 2026-02-06
**Stan wejściowy:** 0/10 (chaotyczny układ, widoczny na screenshocie)
**Cel:** 9–10/10 — profesjonalny, deterministyczny, szybki layout SLD

---

## 1. DIAGNOZA — CO JEST TERAZ

### 1.1 Dwa równoległe silniki layoutu (PROBLEM KRYTYCZNY)

W kodzie istnieją **DWA osobne systemy auto-layoutu** które NIE są ze sobą zintegrowane:

| Silnik | Lokalizacja | Linie kodu | Status |
|--------|------------|------------|--------|
| **Legacy** | `sld-editor/utils/autoLayout.ts` | 1659 | **AKTYWNY** — wywoływany z `useAutoLayout` hook |
| **Topologiczny** | `sld-editor/utils/topological-layout/` | ~1200 | **NIEAKTYWNY** — hook `useTopologicalLayout` istnieje, ale nie jest głównym |
| **Busbar Feeder** | `sld/layout/` + `sld/layout-integration/` | ~600 | **Częściowo aktywny** — feature flag `SLD_AUTO_LAYOUT_V1` domyślnie **OFF** |

**Skutek:** `SldCanvas.tsx` (linia 30) importuje `useAutoLayout` → wywołuje `generateAutoLayout` z legacy engine → układ jest sztywny, nie adaptuje się do topologii.

### 1.2 Jak wygląda przepływ danych TERAZ

```
SldCanvas.tsx
  └── useAutoLayout(symbols)
        └── generateAutoLayout(symbols) ← LEGACY ENGINE
              ├── filterPccNodes()
              ├── identifyStationStacks()
              ├── classify: busbars/transformers/sources/switches/lines/loads
              ├── LAYER 0: Sources (centered)
              ├── LAYER 1: WN Busbar (if exists)
              ├── LAYER 2: Transformers
              ├── LAYER 3: SN Busbar + Bays
              └── Fallback for unpositioned
        └── resolveCollisions()
        └── generateConnections(symbols) ← Connection routing
              └── generateBusbarFeederPaths() ← Busbar layout (JEŚLI V1 ON)
```

### 1.3 Ocena elementów (0–10)

| Element | Ocena | Problem |
|---------|-------|---------|
| **Rozmieszczenie szyn** | 3/10 | Szyna SN pozycjonowana poprawnie centralnie, ale szerokość nie dopasowuje się dynamicznie do liczby pól |
| **Rozmieszczenie odgałęzień** | 2/10 | Pola (bays) mają sztywny odstęp, nie reagują na rzeczywistą topologię; brak slotów per sekcja |
| **Routing linii** | 1/10 | Busbar feeder auto-layout jest OFF domyślnie; standardowy routing tworzy chaotyczne ścieżki |
| **Stabilność przy edycji** | 2/10 | Pełny relayout przy każdej zmianie topologii; brak inkrementalności |
| **Czytelność schematu** | 2/10 | Elementy nachodzą na siebie; etykiety kolidują; brak hierarchii wizualnej |
| **Wydajność** | 4/10 | Pełny recompute w `useMemo` — O(n) ale z wieloma iteracjami kolizji |
| **Determinizm** | 7/10 | Sortowanie po ID zapewnia powtarzalność, ale mutable state (`(symbol as any).width = ...`) psuje gwarancje |

### 1.4 Konkretne błędy algorytmiczne

**BUG-01: Mutacja symboli w trakcie layoutu**
```typescript
// autoLayout.ts linia 1036-1037
(wnNodeSymbol as any).width = wnBusbarWidth;
```
Silnik layoutu **mutuje obiekty wejściowe** zamiast operować na kopii. To psuje determinizm i powoduje side-effects w React.

**BUG-02: Feature flag V1 domyślnie OFF**
```typescript
// constants.ts linia 192
let _autoLayoutV1Enabled = false;
```
Nowy, lepszy busbar feeder routing jest **wyłączony**. Connection routing nigdy go nie używa w praktyce.

**BUG-03: Brak integracji topologicznego silnika**
`useTopologicalLayout` hook istnieje ale NIE jest używany w `SldCanvas.tsx`. Cały nowy silnik (roleAssigner, geometricSkeleton, collisionGuard) jest martwy.

**BUG-04: Collision resolution jest naiwna**
W `useAutoLayout.ts` (resolveCollisions) — algorytm przesuwa elementy w jednym kierunku bez uwzględnienia struktury topologicznej. Efekt: elementy "uciekają" od kolizji w losowych kierunkach.

**BUG-05: Bay identification nie pokrywa wszystkich topologii**
`identifyBays()` w autoLayout.ts (linia 611) szuka Switch→Branch→Load pattern. Jeśli topologia jest inna (np. Branch bezpośrednio z szyny), bay nie jest identyfikowany → element trafia do "fallback" → chaos.

**BUG-06: Brak dynamicznego rozszerzania szyn**
Szerokość szyny jest obliczana raz (`calculateBusbarWidth`) ale nie aktualizowana gdy dodajemy/usuwamy elementy. Symbole mogą wystawać poza szynę.

---

## 2. ARCHITEKTURA NAPRAWY

### 2.1 Strategia: Ujednolicenie silników

Zamiast utrzymywać dwa silniki, **scalamy najlepsze części** w jeden spójny pipeline:

```
NOWY PIPELINE (jeden silnik):

    Symbols (input, IMMUTABLE)
         │
    ┌────▼────┐
    │ PHASE 1 │  Topology Analysis (z roleAssigner.ts — JUŻ NAPISANY)
    │         │  → role assignments, feeder chains, voltage levels
    └────┬────┘
         │
    ┌────▼────┐
    │ PHASE 2 │  Hierarchical Skeleton (z geometricSkeleton.ts — JUŻ NAPISANY)
    │         │  → tiers, busbars, sections, slots
    └────┬────┘
         │
    ┌────▼────┐
    │ PHASE 3 │  Position Assignment (NOWY — slot-based)
    │         │  → każdy symbol dostaje pozycję ze slotu
    │         │  → szyny auto-expand do potrzebnej szerokości
    └────┬────┘
         │
    ┌────▼────┐
    │ PHASE 4 │  Collision Resolution (z collisionGuard.ts — JUŻ NAPISANY)
    │         │  → sweep-line collision detection
    │         │  → przesunięcia tylko w osi Y (zachowanie kolumn)
    └────┬────┘
         │
    ┌────▼────┐
    │ PHASE 5 │  Connection Routing (z layout/ — WŁĄCZONY NA STAŁE)
    │         │  → busbar feeder paths (anchor + lane)
    │         │  → orthogonal routing (90° only)
    └────┬────┘
         │
    Final Positions + Connections (output)
```

### 2.2 Co zostaje, co się zmienia

| Moduł | Decyzja | Uzasadnienie |
|-------|---------|-------------|
| `topological-layout/roleAssigner.ts` | ✅ **ZOSTAJE** | Dobrze napisany, deterministyczny, pokrywa topologię |
| `topological-layout/geometricSkeleton.ts` | ✅ **ZOSTAJE** (z modyfikacjami) | Dobra architektura tier/slot, potrzebne drobne poprawki |
| `topological-layout/collisionGuard.ts` | ✅ **ZOSTAJE** | Sweep-line collision, AABB bounds — solidne |
| `topological-layout/autoInsert.ts` | ✅ **ZOSTAJE** | Incremental insert — kluczowe dla wydajności |
| `sld/layout/` (anchor + lane + orthogonal) | ✅ **ZOSTAJE** — **WŁĄCZONY NA STAŁE** | Dobrze zaprojektowany busbar routing |
| `sld/layout-integration/busbarFeedersAdapter.ts` | ✅ **ZOSTAJE** | Adapter busbar→layout — działający |
| `autoLayout.ts` (legacy 1659 linii) | ❌ **ZASTĘPOWANY** | Zastąpiony przez pipeline oparty na topological-layout |
| `useAutoLayout.ts` (hook) | 🔄 **REFAKTOR** | Zamiast `generateAutoLayout` → `computeTopologicalLayout` |

### 2.3 Kluczowe zmiany w kodzie

#### ZMIANA 1: `useAutoLayout.ts` → przełączenie na topological engine

```typescript
// PRZED (linia 725):
const layoutResult = generateAutoLayout(symbols, cfg);

// PO:
const topoResult = computeTopologicalLayout(symbols, geometryConfig);
const layoutResult = {
  positions: topoResult.positions,
  debug: convertDiagnosticsToDebug(topoResult.diagnostics),
};
```

#### ZMIANA 2: Feature flag V1 → usunięty, routing ZAWSZE ON

```typescript
// PRZED (constants.ts):
let _autoLayoutV1Enabled = false;

// PO: Usunąć feature flag. W connectionRouting.ts:
// Busbar feeder paths ALWAYS computed (no feature flag check)
```

#### ZMIANA 3: Immutability — zero mutacji symboli

```typescript
// PRZED (autoLayout.ts linia 1036):
(wnNodeSymbol as any).width = wnBusbarWidth;

// PO: Szerokość przechowywana w skeleton/positions, NIE w symbolu:
// skeleton.busbars[i].totalWidth — read-only
```

#### ZMIANA 4: Connection routing — zawsze orthogonal z busbar

```typescript
// W connectionRouting.ts — usunięcie fallback na diagonal:
// Busbar connections: ZAWSZE vertical stub → horizontal lane → vertical entry
// Brak diagonalnych/skośnych połączeń z szyn
```

---

## 3. ALGORYTM POSITION ASSIGNMENT (Phase 3 — NOWY)

To jest **serce naprawy**. Obecny geometricSkeleton buduje skeleton ale position assignment jest zbyt prosty.

### 3.1 Slot-Based Layout

```
Szyna WN (tier L1):
┌──────────────────────────────────────────────┐
│  ═════════════════════════════════════════    │  ← busbar (horizontal, auto-width)
│     │         │         │         │           │
│   slot 0    slot 1    slot 2    slot 3       │  ← feeder slots (równy spacing)
│     │         │         │         │           │
│   Trafo1   Trafo2      │         │           │  ← L2 transformers
│     │         │         │         │           │
│  ═══╪═════════╪═════════╪═════════╪═══       │  ← Szyna SN (tier L3)
│     │         │         │         │           │
│   SW-1      SW-2      SW-3      SW-4         │  ← L4 switches
│     │         │         │         │           │
│   Ln-1      Ln-2      Ln-3      Ln-4         │  ← L5 branches
│     │         │         │         │           │
│   Ld-1      Ld-2      Ld-3      Ld-4         │  ← L6 loads
└──────────────────────────────────────────────┘
```

### 3.2 Reguły pozycjonowania

1. **Szyna = oś konstrukcyjna** — najpierw pozycjonujemy szynę, potem wszystko inne relatywnie
2. **Slot X = busbar.startX + sidePadding + slotIndex × slotSpacing** — deterministyczny
3. **Element Y = tier.yOffset** — z canonical layer system (już zdefiniowany w ETAP_GEOMETRY)
4. **Transformator** — dokładnie między WN i SN busbar (osiowo)
5. **Source** — nad WN busbar, wycentrowany na slot źródła
6. **Feeder chain** — pionowo pod szyną SN, na osi slotu
7. **Station stack** — pionowo pod feederem, offset w prawo od spine

### 3.3 Dynamic Bus Width

```typescript
function computeDynamicBusWidth(feederCount: number): number {
  const { sidePadding, bayWidthIncrement, minWidth } = ETAP_GEOMETRY.busbar;
  return Math.max(minWidth, sidePadding * 2 + feederCount * bayWidthIncrement);
}
```

Szyna rozszerza się automatycznie. Nigdy nie jest za wąska.

---

## 4. ROUTING LINII (Phase 5)

### 4.1 Zasady (bezwzględne)

1. Z szyny wychodzi **ZAWSZE PION** (stub vertical)
2. Następnie **POZIOM** w lane (jeśli potrzebny offset)
3. Następnie **PION** do celu
4. **ZERO diagonali** z busbar
5. **ZERO zygzaków** — maks 3 segmenty (stub → lane → entry)

### 4.2 Włączenie busbar feeder paths

Obecny kod w `connectionRouting.ts` (linia 162-195) już obsługuje busbar feeder paths, ale jest zablokowany przez feature flag. Rozwiązanie:

```typescript
// connectionRouting.ts — USUNĄĆ warunek feature flag
// Busbar feeder paths are ALWAYS computed
const autoLayoutPaths = new Map<string, Position[]>();
for (const busbar of busbars) {
  const feederPaths = generateBusbarFeederPaths(busbar, symbols);
  if (feederPaths) {
    for (const [connectionId, path] of feederPaths) {
      if (path && path.length >= 2) {
        autoLayoutPaths.set(connectionId, path);
      }
    }
  }
}
```

### 4.3 Obstacle-aware routing

`obstacleAwareRouter.ts` (16K) jest już napisany. Wystarczy:
- Budować obstacle list z positioned symbols
- Routing non-busbar connections przez obstacle-aware router
- Fallback: L-route (vertical → horizontal) zamiast diagonali

---

## 5. COLLISION RESOLUTION (Phase 4)

### 5.1 Priorytet kolizji (z promptu, ale zweryfikowany)

| Typ | Priorytet | Rozwiązanie |
|-----|-----------|-------------|
| Symbol ↔ Symbol | **ZABRONIONE** | Przesunięcie Y + rozszerzenie szyny |
| Symbol ↔ Linia | **ZABRONIONE** | Przeroutowanie linii |
| Label ↔ Symbol | **ZABRONIONE** | Nudge label (już w `resolveLabelCollisions`) |
| Label ↔ Label | Dozwolone | Minimalny nudge |
| Halo ↔ cokolwiek | Dozwolone | Ignorowane |

### 5.2 Algorytm (z collisionGuard.ts — już napisany)

```typescript
// collisionGuard.ts — calculateSymbolBounds + detectSymbolCollisions
// Już implementuje AABB collision detection
// Już implementuje resolveSymbolCollisions z max iterations

// JEDYNE POTRZEBNE: zmienić kierunek resolution
// TERAZ: przesuwa w dowolnym kierunku
// PO: przesuwa TYLKO w osi Y (zachowanie kolumn slotów)
```

---

## 6. WYDAJNOŚĆ

### 6.1 Budżet (z promptu)

| Operacja | Budżet | Obecny stan |
|----------|--------|-------------|
| Insert 1 elementu | < 5 ms | ~20-50ms (pełny relayout) |
| Relayout gałęzi (20-30 el.) | < 16 ms | ~50-100ms |
| 100 elementów | UI płynne | Nieprzetestowane |

### 6.2 Optymalizacje

**OPT-1: Incremental layout (autoInsert.ts — JUŻ NAPISANY)**
- `processAutoInsert()` w topological engine obsługuje ADD/REMOVE/MODIFY
- Zamiast pełnego relayoutu → oblicz tylko affected branch

**OPT-2: Cache topologii**
```typescript
// useAutoLayout.ts — topology hash
const topologyHash = useMemo(() => computeTopologyHash(symbols), [symbols]);
// Jeśli hash się nie zmienił → skip layout computation
```

**OPT-3: useMemo z proper dependency**
```typescript
// TERAZ: useMemo([symbols, topologyHash, cfg]) — recalc na każdy rerender
// PO: useMemo([topologyHash]) — recalc TYLKO gdy topologia się zmieni
```

**OPT-4: Collision resolution — spatial index**
```typescript
// Zamiast O(n²) all-pairs collision check:
// Grid-based spatial index (128px cells)
// Sprawdzaj kolizje tylko w sąsiednich komórkach
// Koszt: O(n) amortyzowany
```

---

## 7. PLAN IMPLEMENTACJI (KROK PO KROKU)

### KROK 1: Przełączenie na topological engine (backend swap)
**Co:** `useAutoLayout` → `computeTopologicalLayout`
**Czas:** 2-4h
**Ryzyko:** Niskie — topological engine jest przetestowany

Pliki do zmiany:
- `sld-editor/hooks/useAutoLayout.ts` — zmiana linii 725
- `sld-editor/SldCanvas.tsx` — upewnić się że hook jest poprawnie wołany

### KROK 2: Włączenie busbar feeder routing
**Co:** Usunięcie feature flag, routing ZAWSZE ON
**Czas:** 1h
**Ryzyko:** Bardzo niskie — fallback istnieje

Pliki do zmiany:
- `sld/layout/constants.ts` — usunąć `_autoLayoutV1Enabled`, ustawić na true
- `sld-editor/utils/connectionRouting.ts` — usunąć warunki feature flag

### KROK 3: Fix collision resolution
**Co:** Przesunięcia tylko w Y, zachowanie kolumn
**Czas:** 2-3h
**Ryzyko:** Średnie — wymaga testów wizualnych

Pliki do zmiany:
- `topological-layout/collisionGuard.ts` — constrainowany resolve
- `sld-editor/hooks/useAutoLayout.ts` — aktualizacja collision resolution

### KROK 4: Immutability fix
**Co:** Usunięcie mutacji symboli
**Czas:** 1h
**Ryzyko:** Niskie

Pliki do zmiany:
- Usunąć `(symbol as any).width = ...` z autoLayout.ts
- Szerokość busbar w skeleton, nie w symbolu

### KROK 5: Incremental layout
**Co:** Aktywacja `processAutoInsert` zamiast pełnego relayoutu
**Czas:** 3-4h
**Ryzyko:** Średnie — wymaga starannego testowania

### KROK 6: Testy i benchmark
**Co:** Testy determinizmu, kolizji, wydajności
**Czas:** 2-3h

---

## 8. PLIKI DOTKNIĘTE ZMIANAMI

| Plik | Zmiana | Priorytet |
|------|--------|-----------|
| `sld-editor/hooks/useAutoLayout.ts` | Swap engine | 🔴 P0 |
| `sld/layout/constants.ts` | Feature flag ON | 🔴 P0 |
| `sld-editor/utils/connectionRouting.ts` | Remove FF guards | 🔴 P0 |
| `topological-layout/collisionGuard.ts` | Y-only resolution | 🟡 P1 |
| `topological-layout/geometricSkeleton.ts` | Dynamic bus width | 🟡 P1 |
| `sld-editor/SldCanvas.tsx` | Hook integration | 🟡 P1 |
| `autoLayout.ts` | DEPRECATE (nie usuwać, zachować jako legacy) | 🟢 P2 |
| `sld-editor/hooks/useTopologicalLayout.ts` | Merge into useAutoLayout | 🟢 P2 |

---

## 9. METRYKI SUKCESU

| Metryka | Przed | Cel |
|---------|-------|-----|
| Kolizje symbol-symbol | Występują | **ZERO** |
| Determinizm (ten sam model → ten sam layout) | ~90% | **100%** |
| Insert 1 elementu | ~50ms | **< 5ms** |
| Relayout 30 elementów | ~100ms | **< 16ms** |
| Routing diagonal z busbar | Występuje | **ZERO** |
| Feature flag V1 | OFF | **USUNIĘTY** (always on) |
| Mutacja symboli wejściowych | TAK | **ZERO** |

---

## 10. PODSUMOWANIE

Aktualny system ma potencjał — **70% kodu który jest potrzebny już istnieje**, ale jest rozproszony w dwóch niezintegrowanych silnikach. Kluczem naprawy jest:

1. **Jedno źródło prawdy** — topological engine jako jedyny silnik layoutu
2. **Busbar routing ZAWSZE ON** — usunięcie feature flag
3. **Immutability** — zero mutacji symboli wejściowych
4. **Collision resolution po osi Y** — zachowanie kolumn slotów
5. **Incremental layout** — brak pełnego relayoutu przy każdej zmianie

Nowy pipeline to **kompozycja istniejących modułów** (roleAssigner → geometricSkeleton → collisionGuard → busbar layout), nie pisanie od zera.

> **Historical note (V12.5)**
> This file is preserved as historical reference only.
> docs/spec/ is not an active source of truth.
> Any binding, canonical, AS-IS, TO-BE, or roadmap language below reflects the original document state and is kept for audit context.
> Use ../INDEX_KANONICZNY.md to locate current canonical documentation.

# SLD Topological Layout Engine — Specyfikacja Kanoniczna

**Status:** BINDING
**Wersja:** 1.0
**Data:** 2026-02-06
**Referencje:** SLD_AUTOLAYOUT_AUDIT_I_NAPRAWA.md, AUDYT_SLD_benchmark.md

---

## 1. Cel

Jeden deterministyczny silnik auto-layoutu topologicznego dla schematów jednokreskowych (SLD) sieci SN.
Współrzędne są **WYNIKIEM** topologii, nie wejściem.

## 2. Architektura

```
Symbols (IMMUTABLE)
    │
    ▼
┌─────────────────────────────────┐
│ Phase 1: Role Assigner          │  Analiza topologii, przypisanie ról
│   (roleAssigner.ts)             │  kanonicznych (BUSBAR, FEEDER, SOURCE...)
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│ Phase 2-4: Geometric Skeleton   │  Orientacja → Spine → Tiers → Slots
│   (geometricSkeleton.ts)        │  Deterministic position assignment
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│ Phase 5: Auto-Insert            │  Incremental ADD/REMOVE/MODIFY
│   (autoInsert.ts)               │  Stabilność: tylko lokalna zmiana
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│ Phase 6: Collision Guard        │  AABB detection + Y-only resolution
│   (collisionGuard.ts)           │  Symbol-symbol = FAIL CI
└────────────┬────────────────────┘
             │
             ▼
    Positions (ReadonlyMap<string, Position>)
```

## 3. Zasady (Binding)

| Reguła | Opis |
|--------|------|
| **DETERMINIZM** | Ten sam model → bitowo identyczny layout |
| **ZERO MUTACJI** | Symbole wejściowe NIGDY nie są modyfikowane |
| **Y-ONLY KOLIZJE** | Rozdzielczość kolizji tylko w osi Y (zachowanie kolumn) |
| **GRID SNAP** | Wszystkie pozycje na siatce (domyślnie 20px) |
| **AUTO ZAWSZE** | Layout działa ZAWSZE i SAM (bez przycisków) |
| **BEZ BoundaryNode** | Elementy BoundaryNode filtrowane z layoutu |

## 4. Rola Topologiczna

Każdy symbol otrzymuje dokładnie jedną rolę:

| Rola | Opis | Warstwa |
|------|------|---------|
| `POWER_SOURCE` | Zasilanie sieciowe | L0 |
| `BUSBAR` | Szyna zbiorcza | L1/L3/L10 |
| `SECTION` | Sekcja szyny (coupler) | L1/L3 |
| `AXIAL_ELEMENT` | Transformator, łącznik osiowy | L2/L9 |
| `FEEDER` | Odpływ (linia, odbiornik) | L4-L6/L12 |
| `INLINE_ELEMENT` | Element inline | L5 |

## 5. Warstwy Kanoniczne (top-down)

```
L0  — Zasilanie (Source)
L1  — Szyna WN (110kV)
L2  — Transformator WN/SN
L3  — Szyna SN (15kV)
L4  — Wyłącznik pola SN
L5  — Linia/gałąź SN
L6  — Kabel SN
L7  — Rozdzielnia stacyjna SN
L8  — Wyłącznik stacyjny SN
L9  — Transformator SN/nN
L10 — Szyna nN (0.4kV)
L11 — Rozdzielnia nN
L12 — Odbiornik/Falownik
```

## 6. Konfiguracja Geometrii

Wszystkie parametry z `benchmark_GEOMETRY` tokens:

| Parametr | Wartość | Opis |
|----------|---------|------|
| `gridSize` | 20px | Siatka snappingu |
| `padding` | 60px | Margines od krawędzi |
| `tierSpacing` | 120px | Odstęp między warstwami |
| `slotWidth` | 100px | Szerokość slotu odpływu |
| `sectionGap` | 40px | Odstęp między sekcjami |
| `minBusbarWidth` | 200px | Minimalna szerokość szyny |
| `symbolClearance` | 24px | Minimalna odległość między symbolami |

## 7. Dynamiczna Szerokość Szyny

```
busbarWidth = max(minBusbarWidth, sidePadding * 2 + feederCount * bayWidthIncrement)
```

Szyna automatycznie się poszerza gdy przybywa odpływów.

## 8. Rozwiązywanie Kolizji

### Priorytet (nieruchome pierwsze):
1. Szyny (nigdy nie przesuwane)
2. Transformatory
3. Zasilania
4. Wyłączniki
5. Gałęzie
6. Odbiorniki (przesuwane pierwsze)

### Algorytm:
- Detekcja: AABB pairwise (O(n²))
- Rozdzielczość: przesunięcie WYŁĄCZNIE w osi Y
- Kierunek: zawsze w dół (od źródła ku odbiornikom)
- Iteracje: max 20
- Tie-break: symbol z mniejszym ID (leksykograficznie) zostaje

## 9. Budżety Wydajności (CI Gate)

| Rozmiar | Symbole | Budżet |
|---------|---------|--------|
| Mały | ≤10 | <16ms |
| Średni | 11-50 | <60ms |
| Duży | 51-200 | <200ms |

## 10. Topology Hash

Hash deterministyczny z:
- ID symboli (posortowane)
- Typ elementu
- Połączenia (fromNodeId, toNodeId, connectedToNodeId)

Hash ignoruje:
- Pozycje symboli
- Kolejność w tablicy

Zmiana hasha wyzwala przeliczenie layoutu.

## 11. Golden Fixtures (Testy)

| Fixture | Topologia | Pokrycie |
|---------|-----------|----------|
| Radial | GPZ → SN → [SW → Line → Load] × N | Determinizm, hierarchia, kolizje |
| Ring NO | Dwa odpływy z pierścieniem NO | Determinizm, ring line |
| GPZ→RSN→SN | GPZ → SN → Stacje SN/nN | Determinizm, station stacks |

## 12. API

### Główne wejście

```typescript
import { computeTopologicalLayout } from './topological-layout';

const result = computeTopologicalLayout(symbols);
// result.positions       — ReadonlyMap<string, Position>
// result.roleAssignments — ReadonlyMap<string, RoleAssignment>
// result.skeleton        — GeometricSkeleton
// result.collisionReport — CollisionReport
// result.diagnostics     — LayoutDiagnostics
```

### Weryfikacja determinizmu

```typescript
import { verifyDeterminism } from './topological-layout';

const isDeterministic = verifyDeterminism(symbols); // true
```

### Guard immutability

```typescript
import { deepFreezeSymbols } from './topological-layout';

deepFreezeSymbols(symbols); // Freezes input for mutation detection
```

## 13. Pliki

| Plik | LOC | Opis |
|------|-----|------|
| `topologicalLayoutEngine.ts` | ~300 | Orchestrator (6 faz) |
| `roleAssigner.ts` | ~590 | Faza 1: Analiza topologii |
| `geometricSkeleton.ts` | ~740 | Fazy 2-4: Szkielet geometryczny |
| `collisionGuard.ts` | ~330 | Faza 6: Kolizje |
| `autoInsert.ts` | ~250 | Faza 5: Inkrementalne zmiany |
| `types.ts` | ~400 | Definicje typów |
| `index.ts` | ~120 | Eksporty publiczne |

## 14. Usunięte Komponenty

| Komponent | Status | Powód |
|-----------|--------|-------|
| `autoLayout.ts` | **USUNIĘTY** | Legacy dual-engine, zastąpiony topological |
| `useTopologicalLayout.ts` | **USUNIĘTY** | Nieużywany alternatywny hook |
| Feature flag V1 | **USUNIĘTY** | Layout zawsze włączony |


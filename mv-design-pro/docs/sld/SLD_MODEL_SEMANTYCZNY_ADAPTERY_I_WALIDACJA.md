# MODEL SEMANTYCZNY SLD — ADAPTERY I WALIDACJA

**Data:** 2026-03-14
**Wersja:** 1.0
**Status:** WIAZACY

---

## 1. CEL

Zdefiniowac jeden jawny model semantyczny SLD, ktĂłry zastapi obecne 4 osobne obiekty (graph + stationBlockDetails + visualTopology + extendedLogicalViews) jednym spĂłjnym modelem. Adapter buduje ten model z Snapshot/ENM. Walidator weryfikuje kontrakty per typ stacji przed renderingiem.

---

## 2. ARCHITEKTURA DOCELOWA

```
Snapshot (ENM + logicalViews)
    |
    v
TopologyInputReader (istniejacy, kanoniczny)
    |
    v
TopologyInputV1
    |
    v
+----------------------------------+
| buildSldSemanticModel()          |
| (NOWY adapter — zast. 4 obiekty)|
|   1. BFS segmentacja             |
|   2. Klasyfikacja stacji         |
|   3. Budowa pĂłl per stacja       |
|   4. Budowa SldSemanticModelV1   |
+----------------------------------+
    |
    v
SldSemanticModelV1 (NOWY — jeden jawny model)
    |
    v
+----------------------------------+
| validateSldSemanticModel()       |
| (NOWY walidator)                 |
|   SV01-SV10 reguly               |
+----------------------------------+
    |
    v
SldSemanticModelV1 (zwalidowany)
    |
    v
layoutPipeline (istniejacy, 6-fazowy)
    |
    v
SldLayoutResultV1 (pozycje + routing + hash)
    |
    v
Renderery SVG (istniejace)
```

---

## 3. OBECNY STAN (4 OSOBNE OBIEKTY)

| Obiekt | Plik | Rola | Problem |
|--------|------|------|---------|
| VisualGraphV1 | topologyAdapterV2.ts | Graf wizualny (nodes + edges) | Nie niesie semantyki stacji |
| StationBlockDetails | stationBlockBuilder.ts | Pola, urzadzenia, embedding | Nie polaczony z grafem |
| VisualTopologyContract | topologyAdapterV2.ts | Binding trunk/station | Osobny obiekt, redundancja |
| ExtendedLogicalViews | topologyAdapterV2.ts | Ordered stations per trunk/branch | Czwarty osobny obiekt |

**Problem:** Renderery musza laczyc te 4 obiekty, rekonstruujac semantyke. To prowadzi do:
- Ukrytej topologii w JSX
- Niejawnego inferowania typĂłw stacji
- Brakujacych walidacji kontraktĂłw
- Duplikacji logiki

---

## 4. DOCELOWY STAN (1 JAWNY MODEL)

### 4.1 SldSemanticModelV1

```typescript
export interface SldSemanticModelV1 {
  readonly version: 'V1';
  readonly snapshotId: string;
  readonly snapshotFingerprint: string;

  readonly gpz: SldGpzV1;
  readonly trunks: readonly SldTrunkV1[];
  readonly branchPaths: readonly SldBranchPathV1[];
  readonly inlineStations: readonly SldInlineStationV1[];
  readonly branchStations: readonly SldBranchStationV1[];
  readonly sectionalStations: readonly SldSectionalStationV1[];
  readonly terminalStations: readonly SldTerminalStationV1[];
  readonly reserveLinks: readonly SldReserveLinkV1[];
  readonly diagnostics: readonly SldSemanticDiagnosticV1[];
}
```

Pelna definicja typĂłw w: `SPEC_KONTRAKTY_SYSTEMOWE_SN.md` sekcja 1.

### 4.2 Adapter

```typescript
/**
 * buildSldSemanticModel — jedyny adapter Snapshot -> SldSemanticModel.
 *
 * Zastepuje dotychczasowe 4 osobne obiekty jednym modelem.
 * Logika z topologyAdapterV2 + stationBlockBuilder zostaje,
 * ale wynik jest nowy typ SldSemanticModelV1.
 */
export function buildSldSemanticModel(
  input: TopologyInputV1,
): SldSemanticModelV1 {
  // 1. BFS segmentacja (z topologyAdapterV2.segmentTopology)
  const segmentation = segmentTopology(input);

  // 2. Klasyfikacja stacji (z stationBlockBuilder.deriveEmbeddingRole)
  const stationKinds = classifyStations(input, segmentation);

  // 3. Budowa pĂłl per stacja (z stationBlockBuilder.buildFieldsForStation)
  const stationDetails = buildStationDetails(input, stationKinds);

  // 4. Budowa SldSemanticModelV1
  return assembleSldSemanticModel(input, segmentation, stationKinds, stationDetails);
}
```

### 4.3 Walidator

```typescript
export function validateSldSemanticModel(
  model: SldSemanticModelV1,
): SldSemanticValidationResult {
  const errors: SldSemanticError[] = [];

  // SV01: Inline station must have IN + OUT bays
  for (const s of model.inlineStations) {
    if (!s.incomingBay || s.incomingBay.bayRole !== 'LINE_IN') {
      errors.push({ code: 'SV01', message: `Inline station ${s.id} missing LINE_IN bay`, stationId: s.id, severity: 'ERROR' });
    }
    if (!s.outgoingBay || s.outgoingBay.bayRole !== 'LINE_OUT') {
      errors.push({ code: 'SV01', message: `Inline station ${s.id} missing LINE_OUT bay`, stationId: s.id, severity: 'ERROR' });
    }
  }

  // SV02: Inline station IN/OUT must be different segments
  for (const s of model.inlineStations) {
    if (s.incomingSegmentId === s.outgoingSegmentId) {
      errors.push({ code: 'SV02', message: `Inline station ${s.id}: incoming == outgoing segment`, stationId: s.id, severity: 'ERROR' });
    }
  }

  // SV03: Branch station must NOT have trunk path
  for (const s of model.branchStations) {
    if (s.topologyContract !== 'no_main_through') {
      errors.push({ code: 'SV03', message: `Branch station ${s.id} claims main path`, stationId: s.id, severity: 'ERROR' });
    }
  }

  // SV04: Sectional station must have 2+ sections + tie
  for (const s of model.sectionalStations) {
    if (!s.sectionA || !s.sectionB) {
      errors.push({ code: 'SV04', message: `Sectional station ${s.id} missing section A or B`, stationId: s.id, severity: 'ERROR' });
    }
    if (!s.tieBay) {
      errors.push({ code: 'SV04', message: `Sectional station ${s.id} missing tie bay`, stationId: s.id, severity: 'ERROR' });
    }
  }

  // SV05: Terminal station must have IN, no OUT
  for (const s of model.terminalStations) {
    if (!s.incomingBay) {
      errors.push({ code: 'SV05', message: `Terminal station ${s.id} missing incoming bay`, stationId: s.id, severity: 'ERROR' });
    }
    if (s.outgoingBay !== null) {
      errors.push({ code: 'SV05', message: `Terminal station ${s.id} has outgoing bay (should be terminal)`, stationId: s.id, severity: 'ERROR' });
    }
  }

  // SV06-SV10: Bay devices, NOP, trunk source, junction, cycles...
  // (implementation)

  return { valid: errors.filter(e => e.severity === 'ERROR').length === 0, errors, warnings: errors.filter(e => e.severity === 'WARNING') };
}
```

---

## 5. MIGRACJA

### 5.1 Faza 1: Dodanie SldSemanticModelV1 (addytywna)

1. Dodac plik `sldSemanticModel.ts` z typami
2. Dodac plik `sldSemanticAdapter.ts` z adapterem
3. Dodac plik `sldSemanticValidator.ts` z walidatorem
4. Adapter uzywa istniejacych funkcji z topologyAdapterV2 i stationBlockBuilder
5. Wynik = SldSemanticModelV1 obok istniejacego AdapterResultV1

### 5.2 Faza 2: Renderery konsumuja SldSemanticModelV1

6. LayoutPipeline przyjmuje SldSemanticModelV1 zamiast AdapterResultV1
7. Renderery czytaja z SldSemanticModelV1
8. Testy regresyjne: identyczny wynik wizualny

### 5.3 Faza 3: Usuniecie starych obiektĂłw

9. Usunac AdapterResultV1 (jesli juz nie uzywany)
10. Usunac stary topologyAdapter.ts (V1)
11. Skonsolidowac stale (IndustrialAesthetics + sldbenchmarkStyle)

---

## 6. TESTY MIGRACYJNE

### 6.1 Test parytetu

```
TEST parity_old_vs_new:
  GIVEN: ten sam TopologyInputV1
  WHEN: buildSldSemanticModel(input) -> SldSemanticModelV1
  AND: buildAdapterResultV1(input) -> AdapterResultV1
  THEN: oba modele opisuja te same stacje, pola, segmenty
  AND: layoutPipeline produkuje identyczny hash
```

### 6.2 Test determinizmu

```
TEST determinism_semantic_model:
  GIVEN: ten sam TopologyInputV1
  WHEN: 100x buildSldSemanticModel(input)
  THEN: wszystkie 100 wynikĂłw sa identyczne (deep equal)
```

### 6.3 Test walidacji

```
TEST validation_catches_errors:
  GIVEN: SldSemanticModelV1 z bledna stacja przelotowa (brak OUT)
  WHEN: validateSldSemanticModel(model)
  THEN: errors zawiera SV01 (missing LINE_OUT)
```


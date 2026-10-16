# SLD Project Mode — Geometry Overrides V1

## Status: BINDING (RUN #3H)

## Spis tresci

1. [Cel i zakres](#1-cel-i-zakres)
2. [Architektura warstw](#2-architektura-warstw)
3. [Kontrakt ProjectGeometryOverridesV1](#3-kontrakt-projectgeometryoverridesv1)
4. [Operacje](#4-operacje)
5. [Hashing i determinizm](#5-hashing-i-determinizm)
6. [Walidacja](#6-walidacja)
7. [FixActions CAD](#7-fixactions-cad)
8. [Skladanie geometrii (EffectiveLayout)](#8-skladanie-geometrii-effectivelayout)
9. [API Backend](#9-api-backend)
10. [UI Tryb projektowy](#10-ui-tryb-projektowy)
11. [Powiazania systemowe](#11-powiazania-systemowe)
12. [Ograniczenia i wykluczenia](#12-ograniczenia-i-wykluczenia)
13. [Przykladowy JSON](#13-przykladowy-json)

---

## 1. Cel i zakres

Tryb projektowy SLD pozwala uzytkownikowi na edycje CAD (geometrii) schematu
jednokreskowego **BEZ** modyfikacji:

- topologii sieci (to robi kreator / model ENM),
- wyniku LayoutEngine (bazowej geometrii LayoutResultV1),
- wynikow analiz (solverow).

Zmiany CAD sa zapisem **nadpisan geometrii** (Overrides) przypiete do `elementId`
i portow. Overrides sa osobna warstwa danych — nie sa czescia LayoutEngine.

## 2. Architektura warstw

```
VisualGraphV1 ──► LayoutEngine ──► LayoutResultV1 (BAZOWA, hash-stabilna)
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │  applyOver-   │
ProjectGeometryOverridesV1 ──────►│  rides()      │──► EffectiveLayoutV1
                                  └──────────────┘
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │  Renderer     │
                                  │  + Camera     │
                                  │  + Overlay    │
                                  └──────────────┘
```

**Kluczowe zasady:**
- LayoutResultV1 pozostaje niezmieniony (deterministyczny, hash-stabilny).
- Overrides skladane z LayoutResult w `applyOverrides()` daja `EffectiveLayoutV1`.
- Renderer uzywa EffectiveLayoutV1 (nie modyfikuje LayoutResult).
- LayoutEngine **nie importuje** modulow project-mode (separacja warstw).
- Overlay **nie importuje** overrides (overlay = token-only).

## 3. Kontrakt ProjectGeometryOverridesV1

### Struktura glowna

```typescript
interface ProjectGeometryOverridesV1 {
  readonly overridesVersion: '1.0';
  readonly studyCaseId: string;
  readonly snapshotHash: string;
  readonly items: readonly GeometryOverrideItemV1[];
}
```

### Pojedynczy rekord nadpisania

```typescript
interface GeometryOverrideItemV1 {
  readonly elementId: string;
  readonly scope: OverrideScopeV1;
  readonly operation: OverrideOperationV1;
  readonly payload: GeometryOverridePayloadV1;
}
```

### Scope (zakres nadpisania)

| Scope | Opis | Dozwolone operacje |
|-------|------|--------------------|
| `NODE` | Wezel (source, load, junction) | MOVE_DELTA |
| `BLOCK` | Blok stacji (SwitchgearBlockV1) | MOVE_DELTA |
| `FIELD` | Pole w bloku stacji | REORDER_FIELD |
| `LABEL` | Etykieta elementu | MOVE_LABEL |
| `EDGE_CHANNEL` | Kanal krawedzi | — (reserved) |

### Operacje

| Operacja | Payload | Opis |
|----------|---------|------|
| `MOVE_DELTA` | `{ dx: number; dy: number }` | Przesuniecie wzgledem pozycji bazowej |
| `REORDER_FIELD` | `{ fieldOrder: string[] }` | Wymuszenie kolejnosci pol w bloku |
| `MOVE_LABEL` | `{ anchorX: number; anchorY: number }` | Pozycja etykiety (bez wplywu na bbox) |

### Payload (walidowany per operacja)

```typescript
type GeometryOverridePayloadV1 =
  | { readonly dx: number; readonly dy: number }
  | { readonly fieldOrder: readonly string[] }
  | { readonly anchorX: number; readonly anchorY: number };
```

## 4. Operacje

### MOVE_DELTA
- Przesuniecie elementu o (dx, dy) wzgledem pozycji bazowej z LayoutResultV1.
- Wynik: effectivePosition = basePosition + delta.
- Delta snap-to-grid (GRID_SNAP = 20px) — deterministyczne.
- Ograniczenie: wynik nie moze powodowac symbol-symbol overlap > 0.

### REORDER_FIELD
- Wymuszenie kolejnosci pol w bloku stacji.
- `fieldOrder` musi zawierac dokladnie te same fieldId co blok.
- Dozwolone tylko jesli zgodne z typologia A/B/C/D.

### MOVE_LABEL
- Pozycja etykiety (anchorX, anchorY) w world coords.
- Bez wplywu na bounding box symbolu.
- Snap-to-grid.

## 5. Hashing i determinizm

### canonical_overrides_hash

```
SHA-256( canonicalJson(items) )
```

Kanoniczny JSON:
1. Elementy `items` sortowane po: `elementId` → `scope` → `operation` (leksykograficznie).
2. Klucze JSON w kolejnosci alfabetycznej.
3. **BEZ** timestampow, identyfikatorow sesji, createdAt.
4. `authoringMeta` (jesli istnieje) — wylaczone z hashu.

### Permutation invariance

Kolejnosc dostarczenia overrides do API nie ma znaczenia. Kanoniczna
serializacja sortuje elementy — identyczny hash niezaleznie od kolejnosci.

### EffectiveLayoutHash

```
EffectiveLayoutHash = FNV-1a( layoutHash + ':' + overridesHash )
```

Deterministyczne — ten sam LayoutResultV1 + te same Overrides =
identyczny EffectiveLayoutHash.

## 6. Walidacja

### validate_overrides_against_layout(LayoutResultV1, OverridesV1)

Reguły:

| # | Regula | Kod FixAction |
|---|--------|---------------|
| 1 | elementId musi istniec w LayoutResultV1 | `geometry.override_invalid_element` |
| 2 | Wynik przesuniec nie moze powodowac kolizji AABB | `geometry.override_causes_collision` |
| 3 | Porty musza zachowac constraints (routability) | `geometry.override_breaks_port_constraints` |
| 4 | Operacja musi byc dozwolona dla danego scope/typu stacji | `geometry.override_forbidden_for_station_type` |
| 5 | Edycja zablokowana jesli readiness = BLOCKED | `geometry.override_requires_unlock` |

### Bledy jako FixActions

Bledy walidacji sa stabilne (kody, polskie komunikaty).
Błędy walidacji nadpisań zwraca backend jako `OverrideValidationErrorV1` (`backend/src/domain/geometry_overrides.py`). Korekta stanu (partia integracji 10): dawny zapis o `FieldDeviceFixActionV1` był nieprawdziwy — ten typ nie miał producenta i został skasowany.

## 7. FixActions CAD

Kody naprawy nadpisań geometrii — wyliczenie `GeometryFixCode` w `backend/src/domain/geometry_overrides.py` (korekta stanu, partia integracji 10: nie `FieldDeviceFixCodes`, które nigdy ich nie zawierały i zostały skasowane):

| Kod | Klucz |
|-----|-------|
| `GEOMETRY_OVERRIDE_INVALID_ELEMENT` | `geometry.override_invalid_element` |
| `GEOMETRY_OVERRIDE_CAUSES_COLLISION` | `geometry.override_causes_collision` |
| `GEOMETRY_OVERRIDE_BREAKS_PORT_CONSTRAINTS` | `geometry.override_breaks_port_constraints` |
| `GEOMETRY_OVERRIDE_FORBIDDEN_FOR_STATION_TYPE` | `geometry.override_forbidden_for_station_type` |
| `GEOMETRY_OVERRIDE_REQUIRES_UNLOCK` | `geometry.override_requires_unlock` |

## 8. Skladanie geometrii (EffectiveLayout)

### applyOverrides(layout, overrides) → EffectiveLayoutV1

```typescript
interface EffectiveLayoutV1 {
  readonly baseLayoutHash: string;       // hash z LayoutResultV1
  readonly overridesHash: string;        // canonical_overrides_hash
  readonly effectiveHash: string;        // FNV-1a(baseLayoutHash + ':' + overridesHash)
  readonly nodePlacements: readonly NodePlacementV1[];  // z naniesionymi deltami
  readonly edgeRoutes: readonly EdgeRouteV1[];           // przeroutowane
  readonly switchgearBlocks: readonly SwitchgearBlockV1[];
  readonly catalogRefs: readonly CatalogRefV1[];
  readonly relayBindings: readonly RelayBindingV1[];
  readonly validationErrors: readonly LayoutValidationErrorV1[];
  readonly bounds: RectangleV1;
}
```

**Algorytm `applyOverrides`:**
1. Skopiuj wszystkie tablice z LayoutResultV1.
2. Dla kazdego MOVE_DELTA: znajdz NodePlacement po elementId, dodaj (dx, dy), przelicz bounds.
3. Dla kazdego MOVE_LABEL: znajdz label po elementId, ustaw anchor.
4. Dla kazdego REORDER_FIELD: znajdz SwitchgearBlock, przebuduj kolejnosc pol.
5. Przelicz bounds calego layoutu.
6. Oblicz overridesHash i effectiveHash.
7. NIE reroutuj krawedzi (zachowaj routing z LayoutResult).

## 9. API Backend

### Endpointy

| Metoda | Sciezka | Opis |
|--------|---------|------|
| GET | `/study-cases/{id}/sld-overrides` | Pobierz aktualne overrides |
| PUT | `/study-cases/{id}/sld-overrides` | Zapisz overrides (deterministycznie) |
| POST | `/study-cases/{id}/sld-overrides/validate` | Walidacja bez zapisu |
| POST | `/study-cases/{id}/sld-overrides/reset` | Reset do pustych overrides |

### Zasady zapisu
- Zapis **nie mutuje** Snapshot ani LayoutEngine.
- Overrides to osobny byt danych projektu przypiete do StudyCase.
- Zapis blokowany jesli readiness gate = BLOCKED (jawna polityka).
- ExportManifestV1 odnotowuje overrides_hash i overrides_version.

## 10. UI Tryb projektowy

### Przelacznik trybow

Istniejace tryby: EDYCJA, WYNIKI, ZABEZPIECZENIA.

Nowy tryb w SLD: **PROJEKTOWY** (CAD editing mode).
- W trybie PROJEKTOWY:
  - klikniecie elementu pokazuje sekcje „Geometria" w inspektorze,
  - uchwyty drag handles dla dozwolonych scope (BLOCK, LABEL, NODE),
  - snap-to-grid (20px) deterministyczny,
  - zakaz recznego rysowania linii.
- Routing nadal z LayoutResult (deterministyczny, Manhattan).

### Store: sldProjectModeStore

```typescript
interface SldProjectModeState {
  projectModeActive: boolean;
  overrides: ProjectGeometryOverridesV1 | null;
  dirty: boolean;
  validationErrors: OverrideValidationErrorV1[];
  setProjectMode(active: boolean): void;
  loadOverrides(caseId: string): Promise<void>;
  saveOverrides(caseId: string): Promise<void>;
  resetOverrides(caseId: string): Promise<void>;
  applyDelta(elementId: string, scope: OverrideScopeV1, payload: GeometryOverridePayloadV1): void;
  validate(layout: LayoutResultV1): void;
}
```

## 11. Powiazania systemowe

### Kreator → Overrides
Jesli kreator zmienia strukture stacji (dodaje/usuwa pole/aparat):
- Overrides sa rewalidowane.
- Jesli elementId zniknal → `geometry.override_invalid_element` FixAction.
- Czesciowe uniewaznieniene (nie kasuj wszystkich overrides).

### Katalogi
- Brak catalogRef → tryb projektowy pozwala przesuwac LABEL/BLOCK,
  ale zapis jest blokowany jesli readiness != READY.

### Wyniki analiz
- Inspektor w trybie projektowym nadal pokazuje wyniki po elementId.

### Eksport
- Eksport SLD uzywa EffectiveLayout (bazowy + overrides).
- ExportManifest zawiera `overridesHash` i tryb informacyjnie.

## 12. Ograniczenia i wykluczenia

| Element | Status | Opis |
|---------|--------|------|
| Undo/redo | NIE WCHODZI w RUN #3H | Moze byc dodane pozniej |
| PDF export z CI | MINIMALNY | SVG + PNG jako artefakty |
| Reczne rysowanie krawedzi | ZAKAZANE | Routing zawsze z LayoutEngine |
| Edge channel overrides | RESERVED | Scope EDGE_CHANNEL zdefiniowany ale nie zaimplementowany |

## 13. Przykladowy JSON

```json
{
  "overridesVersion": "1.0",
  "studyCaseId": "case-001",
  "snapshotHash": "a1b2c3d4e5f6",
  "items": [
    {
      "elementId": "station-GPZ-1",
      "scope": "BLOCK",
      "operation": "MOVE_DELTA",
      "payload": { "dx": 40, "dy": -20 }
    },
    {
      "elementId": "label-TR1",
      "scope": "LABEL",
      "operation": "MOVE_LABEL",
      "payload": { "anchorX": 120, "anchorY": 80 }
    },
    {
      "elementId": "station-GPZ-1",
      "scope": "FIELD",
      "operation": "REORDER_FIELD",
      "payload": {
        "fieldOrder": ["field-sn-01", "field-sn-02", "field-nn-01"]
      }
    }
  ]
}
```

### Odpowiadajacy canonical hash

```
items po sort(elementId, scope, operation):
1. station-GPZ-1 / BLOCK / MOVE_DELTA
2. station-GPZ-1 / FIELD / REORDER_FIELD
3. label-TR1 / LABEL / MOVE_LABEL

canonical JSON → SHA-256 → overridesHash
```

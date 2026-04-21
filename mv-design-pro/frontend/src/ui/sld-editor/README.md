# P30b — SLD Editor (≥110% Canonical)

**Status:** ✅ COMPLETE
**Branch:** `claude/rola-binding-sld-editor-ONwsG`
**Typ:** UI-first (edytor SLD z pełną integracją UNDO/REDO)

## Cel

Podnieść edytor SLD do poziomu **≥110% Canonical** przez wdrożenie krytycznych braków edycyjnych:
- ✅ Multi-select (Shift+klik, Ctrl+klik, lasso)
- ✅ Move/drag (single + grupa, snap-to-grid)
- ✅ Copy/paste/duplicate (Ctrl+C/V/D)
- ✅ Align + distribute (6 kierunków align, 2 kierunki distribute)
- ✅ Snap-to-grid + grid toggle
- ✅ Pełna integracja z UNDO/REDO (P30a): każdy gest = 1 komenda
- ✅ Blokady trybów (CASE_CONFIG, RESULT_VIEW)
- ✅ 100% PL
- ✅ Testy (8 scenariuszy)

---

## Architektura

```
ui/sld-editor/
├── SldEditor.tsx              # Główny komponent
├── SldCanvas.tsx              # SVG rendering symboli
├── SldToolbar.tsx             # Toolbar (align/distribute/copy/paste/grid)
├── SldEditorStore.ts          # Zustand store (multi-select, drag, clipboard, grid)
├── types.ts                   # TypeScript types
├── commands/
│   ├── MultiSymbolMoveCommand.ts      # UNDO/REDO dla drag grupy
│   ├── CopyPasteCommand.ts            # UNDO/REDO dla copy/paste
│   └── AlignDistributeCommand.ts      # UNDO/REDO dla align/distribute
├── hooks/
│   ├── useKeyboardShortcuts.ts        # Skróty klawiszowe (Ctrl+C/V/D/Z/Y)
│   └── useSldDrag.ts                  # Hook drag + UNDO/REDO
├── utils/
│   └── geometry.ts                    # Align, distribute, snap, bbox
└── __tests__/
    ├── SldEditorStore.test.ts         # Testy store (8 scenariuszy)
    └── geometry.test.ts               # Testy utils (align/distribute/snap)
```

---

## Użycie

### Podstawowe

```tsx
import { SldEditor } from '@/ui/sld-editor';

function MyComponent() {
  const symbols = [
    {
      id: 'bus1',
      elementId: 'elem_bus1',
      elementType: 'Bus',
      elementName: 'Szyna 110kV',
      position: { x: 100, y: 100 },
      inService: true,
      width: 60,
      height: 8,
    },
    // ... więcej symboli
  ];

  return <SldEditor initialSymbols={symbols} />;
}
```

### Z integracją backend

```tsx
import { SldEditor } from '@/ui/sld-editor';

function MyComponent({ projectId, diagramId }) {
  return (
    <SldEditor
      projectId={projectId}
      diagramId={diagramId}
      showToolbar={true}
      showUndoRedo={true}
      onSymbolsChange={(symbols) => {
        console.log('Symbols changed:', symbols);
      }}
    />
  );
}
```

---

## Funkcje

### 1. Multi-select

#### Interakcje
- **Klik** → zaznacz jeden symbol
- **Shift+klik** → dodaj do zaznaczenia
- **Ctrl/Cmd+klik** → toggle zaznaczenia
- **Przeciągnij pusty obszar (lasso)** → zaznacz wszystkie symbole w prostokącie
- **Esc** → wyczyść zaznaczenie
- **Ctrl+A** → zaznacz wszystko

#### Determinizm
- `selectedIds` zawsze sortowane alfabetycznie (żadnej losowości!)
- Akcje grupowe działają na `selectedIds` w tej kolejności

### 2. Move/Drag

#### Interakcje
- **Przeciągnij symbol** → przesuń jeden symbol
- **Przeciągnij zaznaczoną grupę** → przesuń wszystkie zachowując relatywne przesunięcia
- **Snap-to-grid** → jeśli włączony, pozycje przyciągane do siatki

#### UNDO/REDO
- Cały drag od mouseDown do mouseUp = **1 komenda**
- Anulowanie drag (Esc) → przywróć oryginalne pozycje (bez komendy)

### 3. Copy/Paste/Duplicate

#### Interakcje
- **Ctrl+C** → kopiuj zaznaczenie do schowka
- **Ctrl+V** → wklej ze schowka (offset +10, +10)
- **Ctrl+D** → duplikuj zaznaczenie (jak copy+paste)

#### Zasady
- Nowe symbole mają **nowe ID** (deterministyczne: `{id}_copy_{timestamp}_{random}`)
- Zachowaj typ symboli i ich powiązania do modelu
- Offset wklejania deterministyczny: `(+10, +10)` dla paste, `(+20, +20)` dla duplicate

#### UNDO/REDO
- Paste/duplicate = **1 komenda**

### 4. Align

#### Kierunki
- **Lewo** → wyrównaj do lewej krawędzi anchora
- **Prawo** → wyrównaj do prawej krawędzi anchora
- **Góra** → wyrównaj do górnej krawędzi anchora
- **Dół** → wyrównaj do dolnej krawędzi anchora
- **Środek poziomo** → wyśrodkuj poziomo względem anchora
- **Środek pionowo** → wyśrodkuj pionowo względem anchora

#### Determinizm
- **Anchor** = pierwszy symbol wg sortu `selectedIds` (alfabetycznie)
- Wszystkie inne symbole wyrównane do anchora

#### UNDO/REDO
- Align = **1 komenda**

### 5. Distribute

#### Kierunki
- **Poziomo** → rozmieść równomiernie w poziomie
- **Pionowo** → rozmieść równomiernie w pionie

#### Zasady
- Wymaga minimum **3 symbole**
- Pierwszy i ostatni (wg pozycji) pozostają w miejscu
- Środkowe symbole rozmieszczane z równymi odstępami
- Odstępy liczone na podstawie bounding box (bez losowości)

#### UNDO/REDO
- Distribute = **1 komenda**

### 6. Grid + Snap

#### Ustawienia
- **Siatka widoczna** → toggle (domyślnie: włączona)
- **Przyciąganie do siatki** → toggle (domyślnie: włączone)
- **Rozmiar siatki** → stały 20px (można zmienić przez `setGridSize`)

#### Zasady
- Snap działa tylko przy **drag** i **paste**
- Snap deterministyczny: `Math.round(x / gridSize) * gridSize`

### 7. Blokady trybów

#### CASE_CONFIG i RESULT_VIEW
- Multi-select dozwolony (podgląd)
- Wszystkie akcje mutujące **disabled**
- Komunikat PL przy próbie edycji: **"Edycja niedostępna w trybie wyników."**
- Toolbar przyciski wyszarzone

---

## Store API

### Symbole
```ts
setSymbols(symbols: AnySldSymbol[]): void
addSymbol(symbol: AnySldSymbol): void
removeSymbol(symbolId: string): void
updateSymbolPosition(symbolId: string, position: Position): void
updateSymbolsPositions(updates: Map<string, Position>): void
```

### Selekcja
```ts
selectSymbol(symbolId: string, mode: 'single' | 'add' | 'toggle'): void
selectMultiple(symbolIds: string[]): void
clearSelection(): void
selectAll(): void
getSelectedSymbols(): AnySldSymbol[]
```

### Drag
```ts
startDrag(symbolIds: string[], startPosition: Position): void
updateDrag(currentPosition: Position): void
endDrag(): Map<string, { old: Position; new: Position }> | null
cancelDrag(): void
```

### Lasso
```ts
startLasso(startPosition: Position): void
updateLasso(currentPosition: Position): void
endLasso(): void
getSymbolsInLasso(): string[]
```

### Clipboard
```ts
copySelection(): void
pasteFromClipboard(offset: Position): AnySldSymbol[]
duplicateSelection(): AnySldSymbol[]
```

### Grid
```ts
toggleGridVisible(): void
toggleSnapEnabled(): void
setGridSize(size: number): void
snapToGrid(position: Position): Position
```

---

## Komendy UNDO/REDO

### MultiSymbolMoveCommand
Cały drag (mouseDown → mouseUp) grupowany jako 1 komenda.

```ts
const command = MultiSymbolMoveCommand.create({
  changes: [
    { symbolId: 'sym1', oldPosition: { x: 100, y: 100 }, newPosition: { x: 150, y: 150 } },
    { symbolId: 'sym2', oldPosition: { x: 200, y: 100 }, newPosition: { x: 250, y: 150 } },
  ],
  applyFn: (positions) => sldStore.updateSymbolsPositions(positions),
});

historyStore.push(command);
```

### CopyPasteCommand
Paste/duplicate jako 1 komenda.

```ts
const command = CopyPasteCommand.create({
  newSymbols: [...],
  addFn: (symbols) => symbols.forEach(s => sldStore.addSymbol(s)),
  removeFn: (symbolIds) => symbolIds.forEach(id => sldStore.removeSymbol(id)),
});

historyStore.push(command);
```

### AlignDistributeCommand
Align/distribute jako 1 komenda.

```ts
const command = AlignDistributeCommand.create({
  operation: 'align',
  direction: 'left',
  changes: new Map([
    ['sym1', { old: { x: 100, y: 100 }, new: { x: 100, y: 100 } }],
    ['sym2', { old: { x: 200, y: 100 }, new: { x: 100, y: 100 } }],
  ]),
  applyFn: (positions) => sldStore.updateSymbolsPositions(positions),
});

historyStore.push(command);
```

---

## Testy

### Store Tests (8 scenariuszy)
```bash
npm test -- ui/sld-editor/__tests__/SldEditorStore.test.ts
```

1. ✅ Multi-select: Shift+click adds to selection
2. ✅ Multi-select: Ctrl+click toggles selection
3. ✅ Drag group: maintains relative positions
4. ✅ Align: deterministic alignment to anchor
5. ✅ Copy/paste: creates new symbols with offset
6. ✅ Snap-to-grid: rounds positions correctly
7. ✅ Lasso selection: selects symbols in rectangle
8. ✅ Selection helpers: count, has-selection, get-selected

### Geometry Tests
```bash
npm test -- ui/sld-editor/__tests__/geometry.test.ts
```

- ✅ Align left/right/top/bottom/center
- ✅ Distribute horizontal/vertical
- ✅ Snap to grid
- ✅ Bounding box calculations

---

## Keyboard Shortcuts

| Shortcut | Akcja |
|----------|-------|
| **Ctrl+C** | Kopiuj zaznaczenie |
| **Ctrl+V** | Wklej ze schowka |
| **Ctrl+D** | Duplikuj zaznaczenie |
| **Ctrl+Z** | Cofnij (Undo) |
| **Ctrl+Y** / **Ctrl+Shift+Z** | Ponów (Redo) |
| **Ctrl+A** | Zaznacz wszystko |
| **Esc** | Wyczyść zaznaczenie / anuluj drag |
| **Shift+klik** | Dodaj do zaznaczenia |
| **Ctrl+klik** | Toggle zaznaczenia |

---

## DoD (Definition of Done)

- [x] Multi-select + lasso działa deterministycznie
- [x] Drag grupy + snap-to-grid działa
- [x] Copy/paste/duplicate działa
- [x] Align/distribute działa
- [x] Wszystko spięte z UNDO/REDO (1 gest = 1 komenda)
- [x] Blokady trybów działają (CASE_CONFIG, RESULT_VIEW)
- [x] 100% PL (wszystkie etykiety, tooltips, komunikaty)
- [x] Jeden PR (tylko SLD editor, bez refaktorów pobocznych)
- [x] Testy (8+ scenariuszy)
- [x] README.md z dokumentacją

---

## Nie ruszane (ABSOLUTE)

- ❌ Backend (solvers, Result API, Proof)
- ❌ Globalny refaktor store/router
- ❌ Edycja modelu sieci (tylko SLD symbols)

---

## Następne kroki (Roadmap)

- **P30c**: Integracja z backend API (fetch/save SLD symbols)
- **P30d**: Add/Delete element commands
- **P30e**: Backend persistence (undo across sessions)
- **P30f**: E2E tests (Playwright)

---

**KONIEC DOKUMENTACJI P30b**

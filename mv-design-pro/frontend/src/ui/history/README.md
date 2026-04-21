# History Module — P30a UNDO/REDO Infrastructure

## Cel
Globalny system UNDO/REDO dla edycji modelu i SLD w standardzie Canonical++.

## Cechy
- **Command Pattern**: Transakcyjne grupowanie zmian
- **Deterministyczny**: `apply()` i `revert()` są idempotentne
- **Mode Gating**: Aktywne tylko w `MODEL_EDIT`, zablokowane w `CASE_CONFIG` i `RESULT_VIEW`
- **Transakcje**: Grupowanie wielu komend w jedną operację undo/redo
- **UI w 100% PL**: Polskie etykiety, tooltips, skróty klawiszowe
- **Skróty**: `Ctrl+Z` (Cofnij), `Ctrl+Y` / `Cmd+Shift+Z` (Ponów)

## Architektura

```
ui/history/
├── Command.ts              # Interface Command, Transaction
├── HistoryStore.ts         # Zustand store (undo/redo stacki)
├── hooks.ts                # React hooks (useUndo, useRedo, etc.)
├── UndoRedoButtons.tsx     # Komponenty UI
├── commands/               # Implementacje komend
│   ├── PropertyEditCommand.ts
│   └── SymbolMoveCommand.ts
├── __tests__/
│   └── HistoryStore.test.ts
└── index.ts                # Public API
```

## Użycie

### 1. Podstawowe użycie (push command)

```tsx
import { useExecuteCommand } from '@/ui/history';
import { PropertyEditCommand } from '@/ui/history';

function MyComponent() {
  const executeCommand = useExecuteCommand();

  const handleEdit = async () => {
    const command = PropertyEditCommand.create({
      elementId: 'bus-1',
      elementName: 'Bus 1',
      fieldKey: 'name',
      fieldLabel: 'Nazwa',
      oldValue: 'Old Name',
      newValue: 'New Name',
      applyFn: async (value) => {
        // Wywołaj backend API lub aktualizuj store
        await updateElement('bus-1', { name: value });
      },
    });

    await executeCommand(command);
  };

  return <button onClick={handleEdit}>Edytuj</button>;
}
```

### 2. Transakcje (grupowanie komend)

```tsx
import { useBeginTransaction, useCommitTransaction } from '@/ui/history';
import { SymbolMoveCommand } from '@/ui/history';

function SldCanvas() {
  const beginTransaction = useBeginTransaction();
  const commitTransaction = useCommitTransaction();

  const handleMultiMove = async (elements: Element[]) => {
    // Rozpocznij transakcję
    beginTransaction('Przesunięcie symboli (3)');

    // Dodaj komendy do transakcji
    for (const element of elements) {
      const command = SymbolMoveCommand.create({
        elementId: element.id,
        elementName: element.name,
        oldPosition: element.position,
        newPosition: element.newPosition,
        applyFn: async (pos) => {
          await updateSymbolPosition(element.id, pos);
        },
      });
      await executeCommand(command);
    }

    // Zatwierdź transakcję (wszystkie komendy = 1 undo)
    await commitTransaction();
  };
}
```

### 3. UI Buttons (już zintegrowane w ActiveCaseBar)

```tsx
import { UndoRedoButtons } from '@/ui/history';

function MyLayout() {
  return (
    <div>
      <UndoRedoButtons />
    </div>
  );
}
```

### 4. Programowy dostęp do undo/redo

```tsx
import { useUndo, useRedo } from '@/ui/history';

function MyComponent() {
  const { execute: undo, isEnabled: canUndo } = useUndo();
  const { execute: redo, isEnabled: canRedo } = useRedo();

  return (
    <div>
      <button onClick={undo} disabled={!canUndo}>Cofnij</button>
      <button onClick={redo} disabled={!canRedo}>Ponów</button>
    </div>
  );
}
```

## Tworzenie własnych komend

```tsx
import type { Command } from '@/ui/history';
import { generateCommandId } from '@/ui/history';

export class MyCustomCommand implements Command {
  readonly id: string;
  readonly name_pl: string;
  readonly timestamp: number;

  constructor(
    private elementId: string,
    private oldValue: unknown,
    private newValue: unknown
  ) {
    this.id = generateCommandId();
    this.name_pl = 'Moja komenda';
    this.timestamp = Date.now();
  }

  async apply(): Promise<void> {
    // Zastosuj zmianę (forward)
    await myApi.update(this.elementId, this.newValue);
  }

  async revert(): Promise<void> {
    // Cofnij zmianę (backward)
    await myApi.update(this.elementId, this.oldValue);
  }

  // Opcjonalne: Merge dla koalescencji podobnych komend
  merge(other: Command): boolean {
    if (!(other instanceof MyCustomCommand)) return false;
    if (this.elementId === other.elementId) {
      this.newValue = other.newValue;
      return true;
    }
    return false;
  }
}
```

## Mode Gating

UNDO/REDO jest **automatycznie zablokowane** w trybach:
- `CASE_CONFIG` (konfiguracja przypadku)
- `RESULT_VIEW` (przeglądanie wyników)

Aktywne tylko w:
- `MODEL_EDIT` (edycja modelu)

Hooki `useUndo()` i `useRedo()` zwracają `isEnabled: false` gdy tryb jest niepoprawny.

## Skróty klawiszowe

| Skrót | Akcja | Uwagi |
|-------|-------|-------|
| `Ctrl+Z` | Cofnij | Windows/Linux |
| `Cmd+Z` | Cofnij | macOS |
| `Ctrl+Y` | Ponów | Windows/Linux |
| `Cmd+Shift+Z` | Ponów | macOS |

## Testy

```bash
cd frontend
npm test ui/history/__tests__/HistoryStore.test.ts
```

## Limitacje (PILOT)

**Obecna implementacja to infrastruktura (P30a)**. Pełna integracja wymaga:

1. **Property Grid**: Integracja z edycją pól (onBlur → pushCommand)
2. **SLD**: Integracja z przesuwaniem symboli (onDragEnd → transaction)
3. **Add/Delete**: Komendy dla dodawania/usuwania elementów
4. **Backend Sync**: Synchronizacja z API (obecnie mock `applyFn`)

## Roadmap

- [ ] P30b: Integracja z Property Grid (edycja pól)
- [ ] P30c: Integracja z SLD (przesuwanie symboli)
- [ ] P30d: Komendy add/delete elementów
- [ ] P30e: Backend persistence (undo across sessions)
- [ ] P30f: E2E testy (Playwright)

## Zgodność z kanonami

- ✅ 100% PL (etykiety, tooltips, komunikaty)
- ✅ UI = NOT-A-SOLVER (brak obliczeń)
- ✅ Tryby blokują akcje (CASE_CONFIG, RESULT_VIEW)
- ✅ Deterministyczny (apply/revert idempotentne)
- ✅ Transakcyjny (grupowanie komend)
- ✅ Jeden mały PR (infrastruktura + UI)

## Autorzy

- **P30a**: Główna infrastruktura UNDO/REDO (Command Pattern, HistoryStore, UI)

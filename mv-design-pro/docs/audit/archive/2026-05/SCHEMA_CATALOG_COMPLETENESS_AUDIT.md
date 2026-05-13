# Audyt kompletności schematu i katalogu — 2026-02-20

## A) Puste kliki (handler istnieje, brak akcji / brak menu / brak okna / brak komunikatu)

| # | Plik:linia | Objaw | Poprawka | Test |
|---|-----------|-------|----------|------|
| A1 | `SLDView.tsx:88-120` | CONTEXT_MENU_OP_MAP brakowało ~80 operacji — akcje spadały do "Unknown operation" | Rozszerzono CONTEXT_MENU_OP_MAP o 80+ mapowań (edit_*, assign_*, add_*, insert_*, set_*, change_*, run_*) | `contextMenuOpMap.test.ts` |
| A2 | `SLDView.tsx:604-664` | `handleContextMenuOperation` wyświetlał tylko notify() — nigdy nie otwierał modala | Wdrożono `ModalController` → `dispatch(canonicalOp)` otwiera modal z rejestru | `modalController.test.ts` |
| A3 | `actionMenuBuilders.ts` | Menu kontekstowe zdefiniowane z 20-30 pozycjami ale bez mapowania do operacji | Każda akcja ma teraz mapowanie w CONTEXT_MENU_OP_MAP lub NAVIGATION_ACTIONS lub TOGGLE_ACTIONS | `actionMenuBuilders.test.ts` |

## B) Martwe okna dialogowe (otwiera się, ale brak zatwierdzenia / brak operacji)

| # | Plik:linia | Objaw | Poprawka | Test |
|---|-----------|-------|----------|------|
| B1 | — | GensetModal.tsx i UPSModal.tsx były opisane jako "stub" ale faktycznie są w pełni zaimplementowane | Potwierdzono kompletność — oba mają walidację, CatalogPicker, pola wymagane | `gensetModal.test.ts` |
| B2 | `modalRegistry.ts` | Brak wpisów dla GensetModal, UPSModal, GridSourceModal, MeasurementModal | Dodano 7 nowych wpisów w modalRegistry: MODAL_DODAJ_AGREGAT_NN, MODAL_DODAJ_UPS_NN, MODAL_DODAJ_ZRODLO_SN, MODAL_DODAJ_PRZEKLADNIK, MODAL_DODAJ_TRANSFORMATOR, MODAL_DODAJ_POLE_SN, MODAL_DODAJ_SEGMENT_NN | `modalRegistryCompleteness.test.ts` |

## C) Akcje bez efektu (wywołanie nie prowadzi do nowego Snapshot / nie odświeża SLD)

| # | Plik:linia | Objaw | Poprawka | Test |
|---|-----------|-------|----------|------|
| C1 | `SLDView.tsx:610-624` | Operacje kanoniczne kończyły się na `notify()` zamiast otwarcia modala | `ModalController.dispatch()` otwiera modal → modal submit → executeDomainOp → nowy Snapshot | `modalController.test.ts` |
| C2 | `domainOpsClient.ts` | Klient API gotowy ale nie wywoływany z kontekstu menu | Pipeline: menu → ModalController → modal.onSubmit() → domainOpsClient.executeDomainOp() | E2E |

## D) Silent fail (przechwycone wyjątki bez komunikatu PL i bez "Szybkich napraw")

| # | Plik:linia | Objaw | Poprawka | Test |
|---|-----------|-------|----------|------|
| D1 | `SLDView.tsx:660` | Nieznane operacje logowane tylko do console.warn | Dodano `notify()` z komunikatem PL dla każdej nieznanej operacji | Audyt manualny |
| D2 | — | Brak panelu "Braki danych do obliczeń" | Wdrożono `SchemaCompletenessPanel` z grupami: Magistrala/Stacje/Transformatory/Źródła/Zabezpieczenia/Katalog, z przyciskami "Przejdź" i "Napraw" | `schemaCompleteness.test.ts` |

## E) Braki rejestru (element ma menu, ale część pozycji nie ma okna dialogowego / mapowania)

| # | Plik:linia | Objaw | Poprawka | Test |
|---|-----------|-------|----------|------|
| E1 | `modalRegistry.ts` | 16 wpisów — brak genset, ups, grid source, measurement, transformer, bay, segment | Dodano 7 nowych wpisów → łącznie 23 wpisy | `modalRegistryCompleteness.test.ts` |
| E2 | `CONTEXT_MENU_OP_MAP` | 26 mapowań — brak edit_tap, edit_vector_group, add_genset, add_ups, add_source, add_transformer, add_ct/vt, i ~60 innych | Dodano 80+ mapowań → pełne pokrycie wszystkich akcji w menu kontekstowym | `contextMenuOpMap.test.ts` |

## F) Rozjazdy katalogu (elementy tworzone/edytowane bez "Powiązania z katalogiem")

| # | Plik:linia | Objaw | Poprawka | Test |
|---|-----------|-------|----------|------|
| F1 | Menu kontekstowe | Każdy element SN/nN ma akcje `assign_catalog`, `assign_tr_catalog`, `assign_inverter_catalog` itd. | Wszystkie assign_* akcje mapowane na `assign_catalog_to_element` → otwiera CatalogPicker | `actionMenuBuilders.test.ts` |
| F2 | Modale | GensetModal, UPSModal, PVInverterModal, BESSInverterModal mają CatalogPicker wbudowany | CatalogPicker wymagany (*) we wszystkich modalach tworzenia elementów | `catalog-first-modals.test.ts` |

## Podsumowanie zmian

### Nowe pliki
- `frontend/src/ui/sld/ModalController.tsx` — kontroler cyklu życia modali z menu kontekstowego
- `frontend/src/ui/schema-completeness/SchemaCompletenessPanel.tsx` — panel "Braki danych do obliczeń"
- `frontend/src/ui/schema-completeness/index.ts` — eksport

### Zmodyfikowane pliki
- `frontend/src/ui/sld/SLDView.tsx` — rozszerzony CONTEXT_MENU_OP_MAP (80+ mapowań), NAVIGATION_ACTIONS, TOGGLE_ACTIONS; integracja ModalController
- `frontend/src/ui/topology/modals/modalRegistry.ts` — 7 nowych wpisów (23 łącznie)

### Testy
- `frontend/src/ui/context-menu/__tests__/contextMenuOpMap.test.ts` — weryfikacja kompletności mapowań
- `frontend/src/ui/sld/__tests__/modalController.test.ts` — testy kontrolera modali
- `frontend/src/ui/schema-completeness/__tests__/schemaCompleteness.test.ts` — testy panelu braków

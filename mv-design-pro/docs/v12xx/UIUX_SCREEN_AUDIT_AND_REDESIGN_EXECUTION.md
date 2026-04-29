# UIUX_SCREEN_AUDIT_AND_REDESIGN_EXECUTION.md

**Data audytu:** 2026-04-29  
**Autor:** Claude Code — architekt produktu + projektant UI/UX przemysłowego  
**Status:** WDROŻONE

---

## 1. Skan repozytorium — co znaleziono

### Aktywny shell
`frontend/src/ui/shell/AppShellV12.tsx` eksportowany jako `CanonicalLayout` przez `ui/layout/index.ts`.

### Architektura 4-kolumnowa (przed redesignem)
```
[NavigationRail 80px] [ContextPanel 320px] [SLD Canvas] [Inspector 360px]
```

### Paski ponad SLD (STAN PRZED)
| Komponent | Wysokość | Motyw |
|-----------|----------|-------|
| TopBar | ~48px | dark SCADA |
| ActiveCaseBar | ~52px | light "ind-*" |
| TopContextBar (MODEL_EDIT) | ~44px | dark SCADA |
| **SUMA** | **~144px** | **niespójny** |

### Zidentyfikowane moduły problematyczne
- `ui/active-case-bar/ActiveCaseBar.tsx` — light theme pośród dark shell
- `ui/network-build/TopContextBar.tsx` — redundant z TopBar, 44px
- `ui/shell/AppShellV12.tsx` — trzy nakładające się paski kontekstu

---

## 2. Ocena aktualnego ekranu (audyt UX)

### Ocena ogólna: 5/10 — wymaga interwencji systemowej

### Zidentyfikowane defekty:

**A. Przeciążenie wizualne góry ekranu**
- 3 poziome paski (144px) ograniczają przestrzeń kanwy SLD
- Użytkownik nie widzi jednego wyraźnego kolejnego kroku
- Dwa przyciski "Oblicz" (TopBar + ActiveCaseBar)

**B. Niespójność stylów**
- ActiveCaseBar używa klas `ind-*` (jasny motyw blue-gray)
- TopBar, TopContextBar, NavigationRail — ciemny motyw SCADA
- Efekt: "wstawka jasna" pośród ciemnego narzędzia inżynierskiego

**C. Powielona informacja**
- Nazwa projektu: TopBar + TopContextBar "Kontekst projektu"
- Przypadek obliczeniowy: TopBar (Przypadek ▼) + ActiveCaseBar ("Bieżący zestaw")
- Status modelu: ActiveCaseBar (ModeIndicator) + TopContextBar ("Model gotowy/w toku")
- Oblicz: TopBar + ActiveCaseBar

**D. Słaba hierarchia informacji**
- Wszystkie elementy mają podobną wagę wizualną
- Następny krok inżyniera nieczytelny
- SLD traktowane jak dodatek, nie oś pracy

**E. Błędy Polish/terminologiczne**
- "Przelacz zestaw" (brak ł)
- "Biezacy zestaw" (brak ę)  
- "Wlasciwosci" (brak ł)

---

## 3. Decyzje projektowe (samodzielne)

### D-001: Usunięcie ActiveCaseBar z AppShellV12
**Uzasadnienie:** TopBar pokrywa całą informację ActiveCaseBar: przypadek obliczeniowy, przycisk Oblicz, przycisk Wyniki. Podwójne paski z różnymi motywami tworzą incoherence wizualną.  
**Decyzja:** Usuń ActiveCaseBar z render AppShellV12. Komponent pozostaje dostępny dla CanonicalLayout (stary shell, używany w izolowanych testach).

### D-002: Wzbogacenie TopBar o status wyników i gotowość modelu
**Uzasadnienie:** Po usunięciu ActiveCaseBar, TopBar musi pokazywać status wyników (NONE/FRESH/OUTDATED) inline przy przycisku Oblicz/Wyniki.  
**Decyzja:** Dodaj `ResultStatusChip` w strefie prawej TopBar.

### D-003: Zastąpienie TopContextBar slim WorkflowContextStrip (28px)
**Uzasadnienie:** TopContextBar (44px) powtarza nazwę projektu i przypadku — teraz już w TopBar. Potrzebna jest tylko faza budowy + blokady + szybkie akcje.  
**Decyzja:** Nowy komponent `WorkflowContextStrip` — 28px zamiast 44px, bez bloku "Kontekst projektu".

### D-004: Zachowanie CanonicalLayout.tsx (stary shell)
**Uzasadnienie:** Ma własne testy (CanonicalLayout.test.tsx) i zawiera poprawne dane wyjściowe. Zmiana AppShellV12 nie wpływa na stary shell.  
**Decyzja:** Nie dotykaj CanonicalLayout.tsx.

### D-005: Narrow NavigationRail — z w-20 (80px) na w-14 (56px)
**Uzasadnienie:** 7 przycisków obszarów o wymiarach 72×54px mieści się w 56px szerokości przy skróceniu label do 8px.  
**Decyzja:** Wąski rail → więcej miejsca na SLD canvas.

---

## 4. Architektura docelowa (po redesignie)

### Paski ponad SLD (STAN PO)
| Komponent | Wysokość | Motyw |
|-----------|----------|-------|
| TopBar (wzbogacony) | 48px | dark SCADA |
| WorkflowContextStrip (MODEL_EDIT) | 28px | dark SCADA |
| **SUMA** | **76px** | **spójny** |

### Zysk: ~68px przestrzeni kanwy SLD

### Layout 4-kolumnowy (po)
```
[NavigationRail 56px] [ContextPanel 320px] [SLD Canvas +68px] [Inspector 360px]
```

---

## 5. Przebudowane komponenty

| Plik | Zmiana |
|------|--------|
| `shell/AppShellV12.tsx` | Usunięto ActiveCaseBar, zmieniono TopContextBar → WorkflowContextStrip, rail w-20→w-14 |
| `shell/TopBar.tsx` | Dodano ResultStatusChip, undo/redo, model readiness inline |
| `shell/WorkflowContextStrip.tsx` | Nowy slim komponent (28px) zastępujący TopContextBar w shellu |
| `shell/NavigationRail.tsx` | w-20 → w-14 (kompaktowy) |

---

## 6. Przepływ pracy — złota ścieżka

```
Pusty projekt
  → NavigationRail: MODEL_SIECI (TE)
  → AreaContextPanel: SchematContextPanel → "Przejdź do modelu sieci"
  → AreaContextPanel: MoContextPanel → GPZ uproszczony → utwórz
  → SLD: GPZ + szyna SN + pole SN widoczne
  → Dodaj odcinek kablowy SN z katalogu
  → Wstaw stację przelotową SN/nN
  → Dodaj transformator z katalogu
  → TopBar: wybierz przypadek obliczeniowy
  → TopBar: Oblicz → wyniki lub blokada z powodem
  → NavigationRail: WYNIKI_ANALIZY
  → Wyniki na SLD (nakładka TW)
  → NavigationRail: RAPORTY_UZASADNIENIA
  → Raport techniczny lub blokada z powodem
```

---

## 7. Dodane testy

### Nowe pliki testowe
- `engineering-semantic/__tests__/empty-project-shows-single-gpz-decision.test.tsx`
- `engineering-semantic/__tests__/gpz-created-renders-busbar-and-next-action.test.tsx`  
- `engineering-semantic/__tests__/busbar-adds-mv-bay-with-function-choice.test.tsx`
- `engineering-semantic/__tests__/logical-sketch-not-treated-as-full-technical-model.test.tsx`
- `shell/__tests__/no-dead-clicks-in-primary-workflow.test.tsx`
- `shell/__tests__/inspector-semantic-card-is-first-tab.test.tsx`
- `shell/__tests__/context-menu-actions-follow-engineering-role.test.tsx`
- `sld/core/__tests__/no-geometry-derived-topology.test.ts`
- `sld/core/__tests__/production-sld-render-contract.test.tsx`

### Testy już istniejące (nie dublujemy)
- `engineer-workflow-gpz-bay-segment-through-station.test.tsx` ✓
- `sld-route-is-not-topology.test.ts` ✓
- `result-binding-full-chain.test.ts` ✓
- `report-eligibility-covers-elements-results-proofs.test.ts` ✓
- `no-ui-derived-semantics.test.ts` ✓
- `catalogFirstRules.test.ts` ✓

---

## 8. Guard:semantic-architecture

Guard przechodzi przed i po zmianach.  
Sprawdza: brak lokalnych mapowań semantycznych, brak lokalnych list menu, kontrakt ResultBinding, kontrakt SemanticDiagnosticsReport, wymagane pliki.

---

## 9. Dług techniczny po redesignie

| Element | Priorytet | Notatka |
|---------|-----------|---------|
| ActiveCaseBar.tsx — migracja do scada-* klas | Niski | Komponent używany tylko w CanonicalLayout.tsx (stary shell) |
| Stary CanonicalLayout.tsx — deprecacja | Średni | Istnieje jako target dla testów izolowanych |
| Pełna obsługa stacji przelotowej w UI | Wysoki | Model semantyczny poprawny, wizard w toku |
| Testy e2e z prawdziwym backendem | Wysoki | Wymaga uruchomionego backend |

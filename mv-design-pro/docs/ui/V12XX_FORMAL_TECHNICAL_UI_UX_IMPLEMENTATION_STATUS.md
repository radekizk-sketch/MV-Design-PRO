# MV-DESIGN-PRO V12.xx - status wdrożenia kanonu formalno-technicznego UI/UX

Ten dokument wiąże kanon UI/UX z aktywną implementacją frontendową. Nie jest szkicem projektowym: wskazane pliki są aktualnymi źródłami prawdy dla nazw, ikon, obszarów, paneli, menu, pokrycia zakresu i strażników jakości.

## Źródła prawdy

| Zakres | Aktywny plik |
|---|---|
| Rejestr dziewięciu obszarów roboczych i migracja starych kodów | `frontend/src/ui/navigation/areaRegistry.ts` |
| Rejestr ikon technicznych | `frontend/src/ui/icons/technicalIconRegistry.tsx` |
| Rejestr ekranów E-00..E-39 | `frontend/src/ui/workspace/screenCanonRegistry.ts` |
| Rejestr zakładek inspektora | `frontend/src/ui/inspector-panel/inspectorTabRegistry.ts` |
| Rejestr menu pola SN i źródeł | `frontend/src/ui/context-menu/contextMenuRegistry.ts` |
| Tabela pokrycia zakresu obowiązkowego | `frontend/src/ui/canon/coverageMatrix.ts` |
| Jawny rejestr długu technicznego | `frontend/src/ui/canon/technicalDebtRegistry.ts` |
| Strażnik zakazanych etykiet | `frontend/src/ui/canon/labelGuards.ts` |

## Zamknięte elementy wdrożeniowe

1. Store aplikacji zapisuje aktywny obszar jako identyfikator kanoniczny i normalizuje stare wartości `MO`, `TE`, `AN`, `ZA`, `OZ`, `AD`, `RA`, `HI`.
2. Pasek obszarów roboczych renderuje dziewięć obszarów z rejestru, pełną nazwą w `aria-label`, skrótem w tooltipie i ikoną techniczną.
3. Lewy panel routuje do dziewięciu obszarów: Model, Schemat, Studia, Wyniki, Zabezpieczenia, Źródła, Katalogi, Raporty, Historia.
4. Prawy panel ma nazwę `Inspektor techniczny` i zakładki: Identyfikacja, Parametry, Katalog, Wyniki, Uzasadnienie, Gotowość, Zabezpieczenia, Automatyka, Historia.
5. Menu pola SN i menu źródeł mają sekcje: Otwórz, Edytuj, Dodaj, Analizuj, Wyniki, Uzasadnienie, Raport, Operacje, Usuń.
6. SLD ma test renderu GPZ, szyny SN, pola SN i połączenia oraz pusty stan z akcją rozpoczęcia modelowania.
7. Akcje nowych menu są dopisane do routingu akcji, aby strażnik nie dopuszczał martwych kliknięć.
8. Testy akceptacyjne blokują powrót roboczych etykiet, brak ikon, brak obszarów, brak zakładek inspektora, niekompletne menu i brak pokrycia zakresu.

## Jawny dług techniczny

| Kod | Zakres | Ryzyko | Plan domknięcia |
|---|---|---|---|
| `V12-CANON-WORKSPACE-SCREEN-REMAP` | Wewnętrzny router ekranów nadal ma część starych mapowań E-10..E-34 | Średnie: nazwy użytkowe są kanoniczne, ale kontrakt routingu wymaga pełnej synchronizacji | Przepiąć router workspace na `screenCanonRegistry.ts` i migrować testy ekranów |
| `V12-CANON-ADVANCED-SOLVERS` | Zaawansowane solvery: FRT, stabilność dynamiczna, pełne warianty zwarć, GS/FD | Wysokie: UI wskazuje obszar i status, ale backend wymaga potwierdzenia pełnej fizyki obliczeń | Domknąć implementację solverów albo utrzymać formalny stan niedostępności z raportem ryzyka |

## Testy wdrożeniowe

| Test | Zakres |
|---|---|
| `area-registry.test.ts` | kompletność dziewięciu obszarów |
| `area-migration.test.ts` | normalizacja starych kodów |
| `NavigationRail.test.tsx` i `navigation-rail.a11y.test.tsx` | etykiety, skróty i dostępność paska obszarów |
| `technical-icons.test.tsx` i `visual-technical-icons.spec.tsx` | kompletność i rozmiary ikon |
| `context-menu-pole-sn.test.ts` i `context-menu-source.test.ts` | kanoniczne menu pola SN i źródła |
| `inspector-tabs.test.tsx` | zakładki Inspektora technicznego |
| `context-panel-empty-states.test.tsx` | puste stany z przyczyną i akcją |
| `sld-gpz-bay-render.test.tsx` | render GPZ, szyny, pola SN i połączenia |
| `result-overlay-navigation.test.tsx` | przejście z wyników do uzasadnień |
| `coverage-matrix.test.ts` | pokrycie zakresu obowiązkowego |
| `ui-label-blacklist.test.tsx` | zakaz roboczych etykiet w widocznym UI i dostępności |

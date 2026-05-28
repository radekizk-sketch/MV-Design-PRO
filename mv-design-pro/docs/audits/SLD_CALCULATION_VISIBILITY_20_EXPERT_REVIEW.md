# SLD calculation visibility repair - 20-role expert audit

Status: in progress  
Scope: aktywny SLD V2, przycisk Oblicz, domyslny ekran analiz, widocznosc wynikow IEC 60909/PF

## Problem odtworzony

- Browser: aktywny projekt `E2E SLD 0002`, aktywny wariant `Zakres obliczen z adresu`.
- Klik `Oblicz` uruchamia backend i tworzy run `9d9516c8-f2ef-485c-9869-da4e621d9696`.
- API zwraca realne wyniki zwarciowe:
  - `ZKSN SN`: `Ik'' = 84.3767 kA`, `ip = 121.7723 kA`, `Ith = 84.3767 kA`, `Sk'' = 2192.171 MVA`.
  - `Stacja B`: `Ik'' = 116.9151 kA`, `Sk'' = 3037.544 MVA`.
- Defekt: domyslny ekran analiz nie uzywal tabel wynikow backendu. Renderowal tylko wiersze ENM z komunikatami typu `nie wyznaczono`, co dla inzyniera wyglada jak brak mozliwosci obliczenia.

## Claude design review

- Prompt: `docs/audits/CLAUDE_DESIGN_REVIEW_calculation_results_visibility_flow_20260527_210132.prompt.md`
- Review: `docs/audits/CLAUDE_DESIGN_REVIEW_calculation_results_visibility_flow_20260527_210132.md`
- Metadata: `docs/audits/CLAUDE_DESIGN_REVIEW_calculation_results_visibility_flow_20260527_210132.meta.json`
- Exit code: `0`

## Matryca krytycznej oceny - 20 rol

1. Profesor sieci SN: wynik obliczenia musi byc natychmiast widoczny po runie; inaczej system traci wiarygodnosc.
2. Projektant OSD: po `Oblicz` oczekuje tabeli per obiekt, nie komunikatu `nie wyznaczono`.
3. Automatyk zabezpieczeniowy: `Ik''`, `ip`, `Ith` i `Sk''` musza byc razem w jednym wierszu dla doboru aparatury.
4. Projektant GPZ: wyniki musza byc powiazane z nazwa obiektu, nie tylko z surowym ID.
5. Projektant stacji SN/nN: stacja i ZKSN musza byc w tabeli po nazwie widocznej w SLD.
6. Specjalista IEC 60909: UI nie moze liczyc fizyki; ma pokazac wynik solvera i status kompletności.
7. Specjalista DIgSILENT: po runie glowny ekran wynikow musi od razu przejsc z modelu do tabel wynikowych.
8. Specjalista ETAP: brak rozroznienia model/wynik jest krytycznym bledem flow.
9. Specjalista ABB/SCADA: ekran wynikowy musi miec status pobierania i blad API, nie cichy fallback.
10. Specjalista Siemens MV: `ip` i `Ith` sa wartosciami wymiarujacymi i nie moga byc ukryte.
11. Specjalista katalogow: brak danych katalogowych nie moze byc zerem.
12. Inzynier raportow: ten sam wynik musi prowadzic do uzasadnienia i raportu, bez przepisywania.
13. Backend/FastAPI engineer: endpointy juz zwracaja tabele; bug jest w adapterze frontendowym.
14. React architect: stan widoku ma byc asynchroniczny i odporny na zmiane runu.
15. QA automation: potrzeba testu regresji: completed SC run -> widoczne `Ik''`, brak `U: nie wyznaczono`.
16. UX lead: po kliknieciu `Oblicz` nie wolno zostawic uzytkownika w martwym widoku.
17. Accessibility reviewer: tabele sa poprawniejsze niz kafle dla skanowania wynikow.
18. SCADA/CAD reviewer: wynik tabelaryczny musi korespondowac z wybranym elementem SLD.
19. Product owner: krytyczna luka blokuje podstawowa wartosc produktu.
20. Field commissioning engineer: false zero i ukryty wynik sa ryzykiem blednego doboru aparatury.

## Accepted / Rejected / Deferred

Accepted:
- Domyslny ekran analiz pobiera indeks tabel runu i wyswietla gotowe tabele backendowe.
- Dla `short_circuit` pokazuje `Ik''`, `ip`, `Ith`, `Sk''` per obiekt.
- Dla `buses` i `branches` przygotowano ten sam mechanizm prezentacyjny dla rozpływu mocy.
- Stan ladowania i blad API sa jawne; brak danych nie jest zerem.

Rejected:
- Liczenie albo interpretowanie fizyki w UI.
- Zmiana frozen result API.
- Eksponowanie surowych proof/run ID jako podstawowy tekst inzynierski.

Deferred:
- None for this defect class.

## Plan naprawy

1. `WorkspaceSurfaceRouter` dostaje read-only adapter tabel wynikow z `results-inspector/api`.
2. Test regresji wymusza backendowy wynik zwarcia i sprawdza, ze ekran pokazuje liczby zamiast placeholderow ENM.
3. Browser retest potwierdza aktywny flow `Oblicz -> Analizy -> tabela zwarciowa`.

## Status walidacji

- Focused Vitest: PASS - `npm test -- --run src/ui/workspace/__tests__/workspaceShellV125.test.tsx`.
- Type-check: PASS - `npm run type-check`.
- Lint: PASS - `npm run lint`.
- Build: PASS - `npm run build`.
- Guardy targeted: PASS - `py scripts/false_zero_guard.py`, `py scripts/dead_click_guard.py`, `py scripts/forbidden_ui_terms_guard.py`.
- V12.6 gate: PASS - `npm run verify:v12.6`.
- Real-backend e2e: PASS - `npm run test:e2e:real -- e2e/critical-run-flow.spec.ts`.
- Browser/Playwright retest: PASS.

## Browser evidence after fix

- Screenshot: `tmp/sld-calculation-visibility/after-analysis-results.png`
- Diagnostics: `tmp/sld-calculation-visibility/after-analysis-results-diagnostics.json`
- Confirmed:
  - `Wyniki zwarciowe per obiekt` visible.
  - `Ik''`, `ip`, `Ith`, `Sk''` visible.
  - `ZKSN SN` visible.
  - `U: nie wyznaczono` absent after completed SC run.
  - `0.00` absent.
  - Browser console errors: none.

## Final expert verdict for this defect

The blocking symptom "system nie oblicza niczego" was caused by the default analysis surface hiding completed backend results behind ENM placeholder rows. The repair is accepted by the 20-role audit matrix for this defect class because the UI now displays frozen backend result tables immediately after a run, without adding frontend physics and without changing frozen result APIs.

# KARTA ZADANIA P2 — OKNO „ZDOLNOŚĆ PRZYŁĄCZENIOWA" (hosting capacity)

**Faza:** U4 (strumień OZE) · **Epik:** E11 · **Wykonawca:** Opus · **Zależność twarda:**
delta D3 scalona (końcówka hosting-capacity na gałęzi). **Wiążące:** `MODEL_INTERAKCJI`
§2.7, `PROPOZYCJE_ROZSZERZEN` P2 („pytanie nr 1 projektanta OZE"), CLAUDE.md
(NOT-A-SOLVER, PL-only, zero zgadywania).

## 1. Cel
Okno odpowiadające na pytanie „ile jeszcze OZE zmieści się w tym węźle": dla wybranych
węzłów-kandydatów uruchom (jawnym przyciskiem) analizę
`GET /api/oze-analysis/hosting-capacity?run_id=&candidate_bus_refs=&step_mw=&max_steps=`
(D3; run_id = zakończony przebieg rozpływu z rejestru) i zaprezentuj: tabela per węzeł
(istniejąca generacja [MW], maks. moc przyłączalna [MW], kryterium wiążące: rodzaj PL
+ element + wartość z jednostką i progiem), wykres słupkowy mocy przyłączalnej per
węzeł, rozwijany ślad scenariuszy per węzeł (moc → dopuszczalny/niedopuszczalny +
element wiążący; WHITE BOX). Parametry (krok MW, maks. kroków) edytowalne z domyślnymi
z odpowiedzi; `input_hash` w trybie eksperckim.

## 2. Dane (mapowania wiążące)
Kształt odpowiedzi: ZBADAJ `backend/src/application/analyses/hosting_capacity.py`
(serializacja widoku; skrócony JSON w raporcie D3/PLANS) + końcówka w
`backend/src/api/oze_analysis_runs.py`. Wybór węzłów-kandydatów: domyślnie węzły
z istniejącymi źródłami (lista z odpowiedzi/snapshotu — ZBADAJ, co zwraca serwis przy
braku parametru) + multi-wybór ze snapshotu (`useSnapshotStore` buses — etykieta name).
Przebieg rozpływu: aktywny/ostatni LOAD_FLOW/DONE z `useExecutionRunsStore` (wzorzec
z `ui2/wyniki/jakosc/EkranJakosci.tsx:302-314`).

## 3. Pliki (TYLKO `frontend/src/ui2/oze/zdolnosc/**` + re-eksport w `ui2/oze/index.ts`)
`EkranZdolnosci.tsx`, rozszerzenie klienta `ui2/oze/api.ts` (dopisz typy+fetch —
to plik modułu OZE, dozwolony), `zdolnoscModel.ts` (czyste adaptery; wykres na wzorcu
Recharts jak `WykresIkssChart` — tokeny --mvd-*, zero animacji), `strings.ts`,
`zdolnosc.css`, `index.ts`, `__tests__/` (≥ 18 testów; fixtures 1:1; vi.mock API).

## 4. Zasady i kryteria
Zero fizyki; kryterium wiążące i wartości wyłącznie z backendu; słownik PL rodzajów
kontroli REUŻYJ z `ui2/wyniki/jakosc/strings.ts` (import, nie duplikat — jeżeli kolizja
barrela, importuj bezpośrednio z pliku). Kryteria: (1) jawny bieg z parametrami
i wyborem węzłów, stany ładowanie/błąd/brak przebiegu, (2) tabela per węzeł z kryterium
wiążącym PL, (3) wykres słupkowy mocy przyłączalnej, (4) ślad scenariuszy rozwijany
per węzeł, (5) pełne bramki jak E1.1 §8 (pipefail; pełny vitest ZERO failed; guardy).
Commit `feat(ui2/oze): okno zdolności przyłączeniowej sieci (P2)` BEZ push.
Raport standardowy z mapowaniami plik:linia.

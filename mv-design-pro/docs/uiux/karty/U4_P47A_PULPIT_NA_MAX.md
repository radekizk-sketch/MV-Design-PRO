# KARTA ZADANIA P47a — PULPIT OZE „NA MAX": MAGAZYN Z KATALOGU + ANALIZY WPIĘTE

**Faza:** U4 (strumień OZE — „na max", dyrektywa właściciela 2026-07-16) · **Epik:** E11 ·
**Wykonawca:** Opus · **Zależność twarda:** delta D1 scalona (końcówki grid-strength
i reactive-adequacy na gałęzi — sprawdź w KROKU 0). **Wiążące:** CLAUDE.md
(catalog-first, NOT-A-SOLVER, zero zgadywania, PL-only §2.7).

## 1. Cel
Usunięcie trzech jawnych braków pulpitu OZE (P47) — bez pozostawiania długu:
1. **Praca magazynu (BESS)**: pojemność energetyczna z KATALOGU konwerterów —
   `e_kwh` w rekordach katalogu (`backend/src/network_model/catalog/
   mv_converter_catalog.py:232,247`), dostępnych przez ISTNIEJĄCĄ końcówkę
   `GET /api/catalog/converter-types?kind=` (`backend/src/api/catalog.py:309-312`).
   Rozwiązanie WYŁĄCZNIE przez dokładne dopasowanie referencji katalogowej modułu
   (zbadaj format `der.catalogs.battery_catalog_ref` i/lub `device_catalog_ref`
   względem `item_id` rekordów konwerterów — mapowania plik:linia w raporcie);
   brak dopasowania → uczciwy stan „pozycja katalogowa nieodnaleziona" (bez zgadywania).
   Prezentuj: pojemność [kWh], moc [MW], zakres Q, cosφ, tryb regulacji — z rekordu.
2. **Zdolność punktu przyłączenia**: sekcja z danych `GET .../grid-strength?run_id=`
   (delta D1): SCR per węzeł + werdykt PL (mocna/słaba/bardzo słaba/brak danych),
   WSCR systemowy; ślad WHITE BOX rozwijany inline (wzór `SladTestu` z macierzy — reużyj
   lub odwzoruj wzorzec; wzory ASCII, bez KaTeX). Wymaga wskazania przebiegu zwarciowego:
   użyj aktywnego przebiegu SC z rejestru przebiegów (`useExecutionRunsStore`) — brak
   zakończonego przebiegu SC → stan „przeprowadź analizę zwarciową" (bez automatyzmu).
3. **Jakość/adekwatność mocy biernej**: sekcja z `GET .../reactive-adequacy?run_id=`
   (delta D1): rezerwy Q per źródło, naruszenia napięć, werdykt PL; przebieg rozpływu
   analogicznie (brak → stan „przeprowadź rozpływ mocy").

## 2. Pliki
`frontend/src/ui2/oze/pulpit/**` (rozbudowa sekcji + nowe: `SekcjaSilySieci.tsx`,
`SekcjaAdekwatnosciQ.tsx`, `SekcjaMagazynu.tsx`), `frontend/src/ui2/oze/api.ts`
(cienki klient dla dwóch nowych końcówek D1 + konwerterów — typy 1:1 z serializerami
backendu; zbadaj dokładny kształt odpowiedzi w `analysis/*/serializer.py`),
aktualizacja `pulpitModel.ts`/`strings.ts`/`pulpit.css`, `__tests__/` (≥ 20 nowych
testów; fixtures 1:1 z kształtem serializerów; API mockowane vi.mock).

## 3. Zasady i kryteria
Zero fizyki (werdykty/wskaźniki wyłącznie z backendu); identyfikatory w trybie
eksperckim; jednostki zawsze; stany uczciwe (ładowanie/błąd/brak przebiegu/brak
dopasowania katalogu). Kryteria: (1) BESS z dopasowanym rekordem → parametry
z katalogu z pojemnością kWh; bez dopasowania → jawny stan, (2) sekcja siły sieci:
SCR+werdykt per węzeł modułu + WSCR + ślad inline, (3) sekcja adekwatności Q: rezerwa
źródła + naruszenia + werdykt, (4) bez zakończonych przebiegów → jasne instrukcje
zamiast pustki, (5) pełne bramki frontendu jak E1.1 §8 (pipefail; pełny vitest ZERO
failed; guardy). Commit `feat(ui2/oze): pulpit OZE na max — magazyn z katalogu,
siła sieci, adekwatność Q (P47a)` BEZ push. Raport standardowy.

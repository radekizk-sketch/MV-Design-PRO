# KARTA ZADANIA E8.4 — OKNO „JAKOŚĆ WYNIKÓW" (W-607) NA WZORCU

**Faza:** U3 · **Epik:** E8 · **Wykonawca:** Opus · **Zależność twarda:** delta D2
scalona (`backend/src/api/quality_analysis_runs.py` na gałęzi). **Wiążące:**
`MODEL_INTERAKCJI` §2.7 i rejestr W-607 (sanity bounds + walidacja energetyczna —
flagi jakości), `AUDYT_RADY_SPECJALISTOW` (audytor WHITE BOX: wynik bez oceny
wiarygodności nie wchodzi do pakietu OSD), CLAUDE.md (NOT-A-SOLVER, PL-only).

## 1. Cel
Okno „Jakość wyników" w nowej powłoce: dwie sekcje na wzorcu `EkranAnalizy`/`TabelaWynikow`:
1. **Wiarygodność zwarciowa** (`GET /api/quality/sanity-bounds?run_id=` — przebieg SC):
   tabela per punkt: napięcie [kV], pasmo (nN/SN/WN/NN), Ik'' [kA], granice pasma,
   status PL („zweryfikowany"/„poza zakresem wiarygodności") → tag; kolumna „blokuje
   pakiet OSD" (tak/nie); podsumowanie liczb; `why_pl` w szczególe wiersza.
2. **Walidacja energetyczna** (`GET /api/quality/energy-validation?run_id=` — przebieg PF):
   tabela pozycji: rodzaj kontroli (słownik PL: VOLTAGE_DEVIATION → „odchylenie
   napięcia" itd. — ZBADAJ pełną listę `check_type` w
   `analysis/energy_validation/models.py` i zmapuj WSZYSTKIE), obiekt, wartość
   obserwowana z jednostką, progi ostrzeżenia/przekroczenia, status (PASS/WARNING/
   FAIL/NOT_COMPUTED → tagi PL); podsumowanie; konfiguracja progów w ZAŁOŻENIACH.
Wybór przebiegów jak w innych oknach: aktywny/ostatni zakończony przebieg danego
rodzaju z rejestru (`useExecutionRunsStore`); brak → uczciwa instrukcja.

## 2. Dane (mapowania wiążące)
Kształty odpowiedzi: ZBADAJ `backend/src/api/quality_analysis_runs.py` + serializery
(`analysis/sanity_bounds/short_circuit_bounds.py`, `analysis/energy_validation/
serializer.py`) — typy TS 1:1 w kliencie `frontend/src/ui2/wyniki/jakosc/api.ts`
(wzór fetch: `ui/ncrfg-tests/api.ts`). Skrócone przykłady JSON w raporcie D2
(PLANS §3.-1 / karta D2).

## 3. Pliki (TYLKO `frontend/src/ui2/wyniki/jakosc/**` + re-eksport w `ui2/wyniki/index.ts`)
`EkranJakosci.tsx` (dwie sekcje z niezależnym doborem przebiegów + stany), `api.ts`,
`jakoscModel.ts` (czyste adaptery na kolumny/wiersze wzorca; tagi ze statusów backendu),
`strings.ts` (słowniki PL statusów i rodzajów kontroli), `jakosc.css` (tokeny --mvd-*),
`index.ts`, `__tests__/` (≥ 20 testów; fixtures 1:1; vi.mock API).

## 4. Zasady i kryteria
Zero ocen lokalnych (statusy wyłącznie z backendu); identyfikatory w trybie eksperckim;
jednostki zawsze. Kryteria: (1) sekcja zwarciowa z tagami statusów i kolumną blokady
pakietu, (2) sekcja energetyczna z pełnym słownikiem rodzajów kontroli PL i progami
w założeniach, (3) stany brak-przebiegu/ładowanie/błąd uczciwe, (4) `why_pl` dostępne
przy wierszu (szczegół/tooltip — wybierz i uzasadnij), (5) pełne bramki jak E1.1 §8
(pipefail; pełny vitest ZERO failed; guardy). Commit
`feat(ui2/wyniki): okno jakości wyników — wiarygodność i walidacja energetyczna (E8.4)`
BEZ push. Raport standardowy.

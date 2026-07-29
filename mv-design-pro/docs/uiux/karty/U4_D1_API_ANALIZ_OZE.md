# KARTA ZADANIA D1 — DELTA BACKENDOWA: API ANALIZ SIŁY SIECI I ADEKWATNOŚCI Q

**Faza:** U4 (strumień OZE — „na max", dyrektywa właściciela 2026-07-16) · **Epik:** E11 ·
**Wykonawca:** Opus · **Warstwa:** backend (application + api + testy) · **Wiążące:**
CLAUDE.md (NOT-A-SOLVER, WHITE BOX, warstwy: analysis = interpretacja, application = zero
fizyki; guardy `arch_guard`/`solver_boundary_guard` muszą przejść), Program §2.0.

## 1. Cel
Wpiąć ISTNIEJĄCE moduły interpretacji do API (dziś: silnik bez końcówek):
- `analysis/grid_strength` — SCR/WSCR per węzeł przyłączenia źródeł falownikowych
  (builder: `analysis/grid_strength/builder.py`; wejście `BusStrengthInput` —
  `models.py:58-69`: bus_ref, nominal_kv, s_sc_mva ← `ShortCircuitResult.sk_mva`,
  s_installed_mva ← suma mocy IBG w węźle; serializer istnieje).
- `analysis/reactive_adequacy` — rezerwy mocy biernej per źródło + naruszenia napięć
  (builder: `analysis/reactive_adequacy/builder.py`; wejścia: napięcia z power-flow +
  granice Q źródeł; proweniencja przez `resolve_card_field_quality_map` — patrz nagłówek
  buildera, wzór SSCI).

## 2. Zakres
1. **Warstwa application** (`application/analyses/` — obok istniejących serwisów analiz;
   zbadaj wzorzec najbliższego serwisu, np. sanity_bounds/ssci, i odwzoruj):
   - `grid_strength_service`: dla `run_id` przebiegu zwarciowego (SC) zbuduj
     `BusStrengthInput[]` z wyniku SC (sk_mva per węzeł) + mocy zainstalowanych źródeł
     falownikowych z modelu (generators/sources z catalog_ref konwertera); wywołaj builder.
   - `reactive_adequacy_service`: dla `run_id` przebiegu rozpływu zbuduj wejścia
     (napięcia węzłów + granice Q źródeł z kart/katalogu przez istniejące narzędzia
     proweniencji); wywołaj builder.
   ZERO fizyki w application: wyłącznie mapowanie gotowych wyników i danych modelu.
2. **API** (`api/` — nowy moduł lub rozszerzenie istniejącego wzorca analiz; zbadaj jak
   wpięte są inne analizy, np. sanity/ssci, i użyj TEGO SAMEGO wzorca ścieżek):
   - `GET .../grid-strength?run_id=` → zserializowany `GridStrengthView`
     (WHITE BOX steps w odpowiedzi),
   - `GET .../reactive-adequacy?run_id=` → zserializowany widok adekwatności Q.
   Rejestracja routera w `api/main.py` zgodnie z istniejącym porządkiem.
   Błędy: brak przebiegu/zły rodzaj analizy → 404/422 z komunikatem PL (wzór istniejących).
3. **Testy pytest** (`backend/tests/` w katalogach zgodnych ze wzorcem: application/ + api/):
   ≥ 14 testów — mapowanie wejść (w tym: węzeł bez S_sc → wejście z None → werdykt
   „brak danych"; suma mocy wielu źródeł w jednym węźle), kontrakt endpointów (kształt,
   determinizm — dwa wywołania identyczne), błędy 404/422.

## 3. Zasady i kryteria
- NIE modyfikuj solverów ani modułów analysis/ (buildery gotowe; jeśli czegoś brakuje
  w ich API — STOP-raport zamiast obejścia).
- Determinizm odpowiedzi (sort, zaokrąglenia — builder już to robi; serializuj 1:1).
- Kryteria: (1) oba endpointy zwracają widoki z WHITE BOX dla realnych przebiegów
  (test na golden/reference network jeśli dostępny wzorzec w testach api analiz),
  (2) puste/niepełne dane → uczciwe werdykty „brak danych" bez wyjątków,
  (3) pełne bramki backendu: `poetry run pytest -q` (ZERO failed; pełny bieg),
  `poetry run ruff check src tests`, `poetry run black --check src tests`,
  `poetry run mypy src` ORAZ guardy: `python scripts/arch_guard.py`,
  `python scripts/solver_boundary_guard.py`, `python scripts/pcc_zero_guard.py`
  (wszystko z `set -o pipefail`, foreground).
Commit `feat(api): końcówki analiz siły sieci (SCR/WSCR) i adekwatności mocy biernej (D1)`
BEZ push. Raport standardowy z mapowaniami plik:linia i liczbami bramek.

# KARTA ZADANIA D2 — DELTA BACKENDOWA: API JAKOŚCI WYNIKÓW (W-607)

**Faza:** U3/U4 („na max") · **Epik:** E8 · **Wykonawca:** Opus · **Warstwa:** backend ·
**Wiążące:** CLAUDE.md (NOT-A-SOLVER, WHITE BOX, warstwy), Program §2.0. **Wzorzec
zrealizowany:** delta D1 — `backend/src/api/oze_analysis_runs.py` + serwisy
`application/analyses/grid_strength.py`/`reactive_adequacy.py` + ich testy (ODWZORUJ
konwencję 1:1: pełne ścieżki w dekoratorach, rejestracja w `api/main.py`, błędy
404/422 PL, testy application+api na golden network).

## 1. Cel
Wpiąć do API dwa ISTNIEJĄCE moduły interpretacji jakości wyników (fundament okna
W-607 „jakość wyników / flagi wiarygodności"):
- `analysis/sanity_bounds/short_circuit_bounds.py` — wiarygodność Ik'' per poziom
  napięcia (statusy „zweryfikowany"/„poza zakresem wiarygodności"; pasma nN/SN/WN/NN);
  wejście: wynik zwarciowy (ikss_ka per węzeł + napięcie znamionowe węzła).
- `analysis/energy_validation/` (builder+serializer) — walidacja energetyczna wyniku
  rozpływu: obciążenia gałęzi/transformatorów, odchylenia napięć, budżet strat, bilans
  mocy biernej (przeczytaj `builder.py:27-320` — sygnatury wejść ustal z kodu).

## 2. Zakres (wzorzec D1)
1. **Application** (`application/analyses/`): `sanity_bounds_service` (run_id przebiegu
   zwarciowego → oceny per węzeł) i `energy_validation_service` (run_id rozpływu →
   widok walidacji). Zero fizyki — mapowanie wyników i danych modelu (parametry
   znamionowe z katalogu, jak wymaga builder).
2. **API**: `GET /api/quality/sanity-bounds?run_id=` i
   `GET /api/quality/energy-validation?run_id=` w nowym module
   `api/quality_analysis_runs.py` (konwencja jak `oze_analysis_runs.py`).
3. **Testy pytest** ≥ 14 (application + api; golden network jak w testach D1):
   przypadki „poza zakresem wiarygodności" (absurdalne Ik''), pasma napięciowe,
   determinizm, 404/422.

## 3. Zasady i kryteria
NIE modyfikuj solverów ani `analysis/**` (brak czegoś w ich API → STOP-raport).
Kryteria: (1) oba endpointy z realnymi przebiegami, (2) dane niepełne → uczciwe
statusy bez wyjątków, (3) bramki: pełny `poetry run pytest -q` ZERO failed;
ruff/black/mypy CZYSTE NA TWOICH plikach (pre-existing naruszenia repo poza zakresem —
nie ruszaj); guardy `arch_guard`/`solver_boundary_guard`/`pcc_zero_guard` (pipefail).
Commit `feat(api): końcówki jakości wyników — sanity bounds i walidacja energetyczna (D2)`
BEZ push. Raport standardowy z mapowaniami plik:linia.

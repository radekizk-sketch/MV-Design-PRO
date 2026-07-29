# KARTA ZADANIA R1 — RELOKACJA FIZYKI: DOBÓR KABLA W KREATORZE (ΔU/Ik3 → BACKEND)

**Epika:** relokacja fizyki UI → backend (`docs/uiux/DLUG_FIZYKA_W_UI_2026-07.md`)
· **Wykonawca:** Opus (worktree) · **Warstwa:** backend (solver util + api) +
frontend (kreator stacji) · **Wiążące:** CLAUDE.md (NOT-A-SOLVER: kreator NIE
liczy fizyki; fizyka w warstwie solverów z WHITE BOX; No-Heuristics; api_lifecycle
— rejestracja końcówki w `docs/v12xx/MACIERZ_KOMPATYBILNOSCI_API.md`).

## 0. Rozstrzygnięcia zarządcy (WIĄŻĄCE)
1. **Zakres R1 = wyłącznie tor kablowy kreatora stacji** (najżywszy konsument):
   - `frontend/src/ui/network-build/station-wizard-v2/cableSelectionContract.ts`
     (`computeCableVoltageDrop`: `ΔU = √3·I·L·(R·cosφ + X·sinφ)`, konsument LIVE
     `StationWizardStepContent.tsx`),
   - `frontend/src/ui/network-build/forms/voltageDropValidator.ts` (ten sam wzór).
   Ik3/transformator/VT/uziemienie/TCC = R2+ (NIE ruszaj).
2. **Wzorzec docelowy = `grid-source-preview`** (`backend/src/api/
   grid_source_preview.py:48` — POST, pydantic request/response, woła istniejącą
   funkcję warstwy solverów). Zrób analogicznie:
   - NOWA czysta funkcja w warstwie solverów (np. `network_model/solvers/
     cable_voltage_drop.py`): wejście {prąd A, długość km, R Ω/km, X Ω/km, cosφ,
     napięcie kV}, wyjście {delta_u_v, delta_u_pct, składowe R/X, `assumptions`
     WHITE BOX (wzór, jednostki)}. NAJPIERW RECON: jeżeli w solverach/analysis
     istnieje już równoważna funkcja ΔU dla doboru (poszukaj `voltage_drop`,
     `vdrop`, `delta_u` poza proof_engine) — REUŻYJ, nie duplikuj; pack VDROP
     (proof) NIE jest tym (interpretuje wynik PF).
   - NOWA końcówka `POST /api/solver/cable-voltage-drop-preview`
     (`api/grid_source_preview.py` — dopisz w TYM pliku obok istniejącej,
     wspólny router tags; walidacja 422 PL).
   - Rejestracja w `docs/v12xx/MACIERZ_KOMPATYBILNOSCI_API.md` (wiersz jak
     sąsiednie; inaczej `api_lifecycle_guard` czerwony).
3. **Frontend:** `cableSelectionContract.ts` i `voltageDropValidator.ts`
   przestają LICZYĆ — wołają końcówkę (klient w istniejącym wzorcu fetch tego
   modułu; debounce/anulowanie żądań jak przy innych podglądach kreatora, stan
   `ładowanie…`/błąd PL; wartości i werdykty wyłącznie z odpowiedzi). Fallback
   przy braku backendu: uczciwy komunikat PL „podgląd niedostępny", NIGDY
   lokalne liczenie.
4. **PARYTET LICZBOWY (bramka twarda):** test backendu z fixture'ami odtwarzającymi
   dotychczasowe przypadki TS (te same wejścia → te same ΔU do 6 miejsc — wzór
   identyczny, więc różnic być nie może). Istniejące testy TS wzoru przenieś na
   asercje odpowiedzi zamockowanej 1:1 z kontraktem końcówki (kształt z backendu).
5. Po relokacji NIE zostaje w tych dwóch plikach ŻADNA arytmetyka fizyczna
   (kontrola: `python scripts/ui_no_physics_guard.py` pozostaje zielony na ui2;
   dodatkowo uruchom detektor guarda ręcznie na obu plikach — wynik w raporcie
   ma być 0 trafień).

## 1. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD`. Venv główny D2vgvUMQ; node_modules symlink (nie commituj);
pełne suity do pliku, pętla `until`, kody wyjścia bezpośrednio.
- Backend: celowane (nowa funkcja + końcówka + parytet) + PEŁNY pytest ZERO failed
  (baza 6206); ruff/black/mypy na nowych plikach; guardy: arch, solver_boundary,
  pcc_zero, load_flow_no_heuristics, api_lifecycle, canonical_ops (venv główny).
- Frontend: type-check, lint --max-warnings 0, PEŁNY vitest ZERO failed
  (baza 8900); guard:codenames; forbidden_ui_terms, ui_terminology,
  utf8_mojibake, dead_click, ui_no_physics (wszystkie exit 0).
- ZERO zmian: `enm/**`, kanon V12.xx, `ui/sld/**`.
Commit BEZ push: `feat(solver-input): relokacja ΔU doboru kabla z kreatora do
backendu (R1, dług fizyki w UI)`. Raport: plik:linia, wynik reconu reużycia,
parytet liczbowy (tabela wejście→ΔU stare/nowe), 0 trafień detektora na obu
plikach frontendu, komplet bramek.

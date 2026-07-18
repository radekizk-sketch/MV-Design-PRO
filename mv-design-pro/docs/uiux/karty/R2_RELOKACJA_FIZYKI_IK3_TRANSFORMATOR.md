# KARTA ZADANIA R2 — RELOKACJA FIZYKI: Ik3 I PRĄDY ZNAMIONOWE KREATORA → BACKEND

**Epika:** relokacja fizyki UI → backend (`docs/uiux/DLUG_FIZYKA_W_UI_2026-07.md`)
· **Etap flow:** E2 Budowa modelu (`docs/uiux/FLOW_PROJEKTANTA_2026-07.md` §1)
· **Wykonawca:** Opus (worktree) · **Wiążące:** CLAUDE.md (NOT-A-SOLVER; WHITE
BOX; api_lifecycle), FLOW §0 (zasady twarde — legacy nie jest wzorcem),
wzorzec R1 (`grid_source_preview.py`, `cable_voltage_drop.py`, scalone `2057b47a`).

## 0. Rozstrzygnięcia zarządcy (WIĄŻĄCE — z rekonesansu)
1. **`station-wizard-v2/shortCircuitNetworkContract.ts`** (łańcuch Ik3 w UI:
   impedancja systemu z Sk″/RX, impedancja kabla, złożenie, `Ik3 = c·U/(√3·Z)`)
   — rekonesans zarządcy wykazał **ZERO konsumentów poza własnymi testami**
   (`grep -rln shortCircuitNetworkContract src` bez testów → pusto).
   ZWERYFIKUJ ponownie na HEAD (grep w raporcie). Jeżeli nadal zero →
   **USUŃ plik + jego testy** (martwa fizyka w UI). Zdolność „podgląd Ik3"
   jest już dostarczana przez realny solver: `POST /api/solver/
   grid-source-preview` (IEC 60909). Jeżeli konsument istnieje → STOP, raport.
2. **`station-wizard-v2/transformerContract.ts:141-142`** (prądy znamionowe
   `I = S/(√3·U)` po stronie UI): NOWA czysta funkcja
   `compute_transformer_rated_currents` w `backend/src/network_model/solvers/
   transformer_rated_currents.py` (wzorzec `cable_voltage_drop.py`: frozen
   dataclass, WHITE BOX assumptions, walidacja ValueError PL) + końcówka
   `POST /api/solver/transformer-rated-currents-preview` w
   `api/grid_source_preview.py` (wejście: moc znamionowa kVA, U1 kV, U2 kV;
   wyjście: I1 A, I2 A + założenia) + wiersz w
   `docs/v12xx/MACIERZ_KOMPATYBILNOSCI_API.md`. Frontend
   `transformerContract.ts` przestaje liczyć — woła końcówkę (wzorzec
   `cableVoltageDropApi.ts`: AbortSignal, błędy PL, fallback = uczciwy
   komunikat, NIGDY lokalne liczenie); konsumenci i testy na mocku fetch 1:1.
3. **`station-wizard-v2/vtMultiWindingContract.ts:64`** (`100 / Math.sqrt(3)`)
   — to STAŁA KATALOGOWA (znamionowe napięcie wtórne uzwojenia 100/√3 V,
   IEC 61869-3), nie fizyka przepływu: zamień na literał `57.735026919`
   z komentarzem intencji (bez końcówki backendu — nie fabrykujemy
   roundtripów dla stałych znamionowych).
4. **Parytet liczbowy** (bramka twarda, jak R1): testy backendu odtwarzają
   dotychczasowe przypadki TS (identyczne I1/I2 do 6 miejsc; tabela w raporcie).
5. **Kontrola zero-fizyki:** ręczny `scan_file` guarda na
   `transformerContract.ts` i `vtMultiWindingContract.ts` → 0 trafień;
   `ui_no_physics_guard` zielony; aktualizacja wierszy w
   `DLUG_FIZYKA_W_UI_2026-07.md` (ZRELOKOWANE/USUNIĘTE z odnośnikiem R2).

## 1. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD` (HEAD zawiera tę kartę). Venv D2vgvUMQ; node_modules
symlink; pełne suity do pliku po pętli `until`; kody wyjścia bezpośrednio;
po pełnym biegu NATYCHMIAST commit.
- Backend: celowane + PEŁNY pytest ZERO failed (baza 6232); black/ruff/mypy
  na nowych plikach; guardy: arch, solver_boundary, pcc_zero,
  load_flow_no_heuristics, api_lifecycle, canonical_ops (exit 0).
- Frontend: type-check; lint --max-warnings 0; PEŁNY vitest ZERO failed
  (baza 8922 minus usunięte testy shortCircuitNetworkContract);
  guard:codenames; forbidden_ui_terms, ui_terminology, utf8_mojibake,
  dead_click, ui_no_physics (exit 0).
- ZERO zmian: `enm/**`, kanon V12.xx, `ui/sld/**`.
Commit BEZ push: `feat(solver-input): relokacja prądów znamionowych
transformatora do backendu + usunięcie martwego łańcucha Ik3 z UI (R2)`.
Raport: grep konsumentów, plik:linia, tabela parytetu I1/I2, 0 trafień
detektora, komplet bramek.

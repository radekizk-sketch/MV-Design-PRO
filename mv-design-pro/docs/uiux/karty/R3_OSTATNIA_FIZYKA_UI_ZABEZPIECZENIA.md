# KARTA ZADANIA R3 — OSTATNIA FIZYKA W UI: UZIEMIENIE + KOORDYNACJA IEC 60255

**Epika:** relokacja fizyki UI → backend (`docs/uiux/DLUG_FIZYKA_W_UI_2026-07.md`
— ta karta DOMYKA epikę) · **Etap flow:** E5/E6 (`FLOW_PROJEKTANTA_2026-07.md`)
· **Wykonawca:** Opus (worktree) · **Wiążące:** CLAUDE.md, FLOW §0, precedensy
R1/R2 (`2057b47a`, `d7928b8c`: sierota fizyki → DELETE ze wskazaniem zdolności
backendu; żywy konsument → konsumpcja istniejącego API, NIGDY nowa duplikacja).

## 0. Rozstrzygnięcia zarządcy (WIĄŻĄCE — z rekonesansu)
1. **`ui/topology/earthingFaultCurrent.ts`** (prąd doziemny PN-EN 50522:
   Solid/Resistor/Petersen/IT + napięcie dotykowe) — rekonesans: ZERO
   konsumentów poza własnym testem. ZWERYFIKUJ grepem na HEAD; jeżeli zero →
   **USUŃ plik + test** (martwa fizyka). Zdolność w backendzie: pętla zwarcia
   IEC 60364 (`api/fault_loop.py`) + pack dowodowy Earthing/Ground Fault SN
   (`application/proof_engine/packs/earthing_ground_fault_sn.py`) — wpisz te
   wskazania do inwentarza długu. Konsument istnieje → STOP, raport.
2. **`ui/protection-coordination/tccCurveGenerator.ts`** (punkty krzywych
   IEC 60255 liczone w UI) — rekonesans: brak konsumentów poza testami
   (jedyny import wzorca to `CoordinationHintCard` → `tmsCoordination`, nie
   generator). ZWERYFIKUJ; zero → **USUŃ plik + testy**. Zdolność: backend
   `api/protection_coordination.py` zwraca `TCCCurveResponse` (krzywe z
   `run_coordination_analysis`), a rendering wykresu TCC w UI pozostaje
   prezentacją danych z API. Konsument istnieje → zamień na dane z API.
3. **`ui/protection-coordination/tmsCoordination.ts`** — konsument ŻYWY:
   `CoordinationHintCard.tsx:9` (`evaluateCoordination` = werdykt koordynacji
   par zabezpieczeń liczony w UI). Relokacja przez KONSUMPCJĘ ISTNIEJĄCEGO
   API: `POST run_coordination_analysis` (`api/protection_coordination.py:254`)
   — NAJPIERW RECON kształtu odpowiedzi (werdykty/marginesy par); jeżeli
   odpowiedź niesie werdykty koordynacji → `CoordinationHintCard` woła
   końcówkę (wzorzec `cableVoltageDropApi.ts`: AbortSignal, błędy PL, uczciwy
   fallback, zero lokalnego liczenia), a `tmsCoordination.ts` znika (po
   przepięciu zweryfikuj brak innych konsumentów). Jeżeli odpowiedź NIE
   niesie werdyktów par → NIE dopisuj fizyki nigdzie: eskaluj w raporcie
   z propozycją delty backendowej (osobna karta) — NIE improwizuj.
   Gdzie renderuje się `CoordinationHintCard` — ustal konsumentów i utrzymaj
   ich zachowanie (testy na mocku fetch 1:1 z kontraktem).
4. **Inwentarz długu**: po tej karcie wszystkie wiersze
   `DLUG_FIZYKA_W_UI_2026-07.md` = ZRELOKOWANE/USUNIĘTE/ROZSTRZYGNIĘTE.
   Dopisz sekcję „EPIKA DOMKNIĘTA (R1–R3)" + zalecenie rozszerzenia zakresu
   `ui_no_physics_guard` na `ui/**` (osobna karta — NIE rozszerzaj sam,
   wymaga przemiarowania false-positives).
5. Kontrola: ręczny `scan_file` guarda na wszystkich dotkniętych plikach
   → 0 trafień; `ui_no_physics_guard` zielony.

## 1. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD` (HEAD zawiera tę kartę). Venv D2vgvUMQ; node_modules
symlink; pełne suity do pliku po pętli `until`; kody bezpośrednio; po pełnym
biegu NATYCHMIAST commit.
- Backend (jeśli dotkniesz — wg §0.3 recon może być read-only): celowane +
  PEŁNY pytest ZERO failed (baza 6241); guardy arch/solver_boundary/pcc_zero/
  load_flow_no_heuristics/api_lifecycle/canonical_ops = 0. UWAGA
  solver_boundary: NIE dotykaj plików z `WATCHED_PATHS`
  (`scripts/solver_boundary_guard.py:9-14`) — nawet adnotacji (precedens
  `58f23dfa`).
- Frontend: type-check; lint --max-warnings 0; PEŁNY vitest ZERO failed
  (baza 8901 minus usunięte testy); guard:codenames; forbidden_ui_terms,
  ui_terminology, utf8_mojibake, dead_click, ui_no_physics = 0.
- ZERO zmian: `enm/**`, kanon V12.xx, `ui/sld/**`.
Commit BEZ push: `feat(ui): domknięcie epiki fizyki w UI — uziemienie i
koordynacja IEC 60255 (R3)`. Raport: grepy konsumentów, plik:linia, kształt
odpowiedzi API koordynacji, 0 trafień detektora, komplet bramek.

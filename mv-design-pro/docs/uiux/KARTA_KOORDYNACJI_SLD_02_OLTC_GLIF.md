# KARTA KOORDYNACYJNA SLD-02 — GLIF OLTC NA SCHEMACIE (Program OLTC ↔ wątek SLD)

**Status:** OCZEKUJE NA POTWIERDZENIE wątku SLD (do tego czasu program OLTC nie dotyka plików SLD)
**Data:** 2026-07-19
**Strony:** Program OLTC (V12K-045, zarządca: Fable) ↔ rework SLD F1–F5 / Reference Engine (V12K-060, osobna sesja)
**Kanał zapisu konfliktów:** `docs/v12xx/REJESTR_KONFLIKTOW.md`
**Powiązania:** `docs/plan/OLTC_ARCHITEKTURA_2026-07.md` (§4 poz. J, §7), `docs/plan/PLAN_SLD_REWORK.md`

---

## 1. Powód karty

Program OLTC (V12K-045) dostarczył kanoniczny model regulacji zaczepów oraz pełny
wynik regulacji z rozpływu. Sekcja §13 specyfikacji wymaga, aby SCHEMAT (SLD)
pokazywał stan regulacji transformatora 110/SN i odświeżał go po obliczeniu.
Pliki `frontend/src/ui/sld/**`, `sld-editor/**`, `engine/sld-layout/**` należą do
wątku SLD (reguła „kolizje plików między wątkami zabronione") — dlatego program
OLTC **nie implementuje glifu sam**, tylko przekazuje wiążącą specyfikację danych.

## 2. Kontrakt danych — GOTOWY, READ-ONLY (bez zmian po stronie OLTC)

Wątek SLD czyta dwa istniejące, stabilne źródła (żadne nie wymaga nowych pól):

1. **Stan projektowy regulacji** — `Transformer.tap_changer` (ENM, `enm/models.py`)
   oraz jego rzut domenowy `TransformerBranch.tap_changer` (`network_model/core/branch.py`):
   - `regulation_type` (`NONE`/`DETC`/`OLTC`), `regulated_winding` (`HV`/`LV`),
   - `current_position`, `neutral_position`, `min_position`, `max_position`, `step_percent`,
   - `control_mode` (`MANUAL`/`AUTOMATIC`/`PROFILE`/`REMOTE`),
   - `voltage_setpoint_kv`, `deadband_kv`, `controlled_bus_ref`.
2. **Wynik regulacji po obliczeniu** — `run.raw_result["oltc_control"]`
   (produkuje pętla OLTC, `network_model/solvers/power_flow_oltc.py`):
   - `final_positions` (per transformator), `initial_positions`, `switch_counts`,
   - `converged`, `iterations_count`, `total_switch_count`,
   - `iterations[].decisions[]` (ślad WHITE BOX: pozycja przed/po, U_szyny, setpoint, powód).

Helper prezentacyjny gotowy do reużycia (interpretacja, READ-ONLY):
`analysis/reporting/oltc_report.py::build_oltc_report_section(oltc_control)` →
per-regulator: pozycja pocz./końc., liczba przełączeń, U szyny przed/po.

## 3. Specyfikacja glifu (do implementacji przez wątek SLD)

Na symbolu transformatora 110/SN, gdy `tap_changer.regulation_type != NONE`:

1. **Znacznik OLTC/DETC** — dopisek przy symbolu (np. „OLTC" / „DETC"); brak dla `NONE`.
2. **Pozycja zaczepu** — bieżąca pozycja: stan projektowy `current_position` przed
   obliczeniem; po obliczeniu `oltc_control.final_positions[branch_id]`
   (format sugerowany: `poz. +3` / `poz. −4` / `poz. 0`).
3. **Tryb AUTO/MAN** — badge z `control_mode` (`AUTOMATIC/PROFILE/REMOTE` → „AUTO",
   `MANUAL` → „MAN").
4. **Napięcie zadane** — `voltage_setpoint_kv` przy glifie w trybie automatycznym
   (np. „U_zad 15.5 kV"), opcjonalnie z pasmem `± deadband/2`.
5. **Odświeżenie po obliczeniu** — po zakończeniu rozpływu glif aktualizuje pozycję
   i ewentualnie znacznik „przełączono N×" z `switch_counts[branch_id]`.
6. **Kolory/tokeny** — wyłącznie tokeny SLD (zasada z karty SLD-01, zakaz duplikacji
   palety fizycznej); powłoka/program OLTC nie definiuje kolorów schematu.

Stany zerowe / brzegowe:
- brak `oltc_control` (rozpływ bez OLTC albo przed obliczeniem) → glif pokazuje stan
  projektowy z `tap_changer` bez adnotacji wynikowej;
- `regulation_type == NONE` lub brak `tap_changer` → brak glifu OLTC (zachowanie jak dziś).

## 4. Podział własności

- **Wątek OLTC (ta karta):** kontrakt danych (pkt 2) — DOSTARCZONY i stabilny; helper
  interpretacyjny raportu; NIE dotyka `ui/sld/**`.
- **Wątek SLD:** implementacja glifu (pkt 3) w symbolach/warstwie overlay SLD, testy
  renderu i determinizmu po swojej stronie, konsumpcja kontraktu READ-ONLY.

## 5. Determinizm i granice

- Kontrakt jest addytywny i READ-ONLY — glif niczego nie liczy (ZERO fizyki w SLD),
  czyta tylko `tap_changer` i `oltc_control`.
- Wartości liczbowe (pozycje, U, przełączenia) pochodzą wyłącznie z backendu.
- Zmiana wymaga wpisu w `REJESTR_KONFLIKTOW.md` (zakres SLD: V12K-060+).

## 6. Prośba do wątku SLD

Proszę o potwierdzenie kontraktu (pkt 2) i przyjęcie specyfikacji glifu (pkt 3) do
backlogu SLD F-serii. Do czasu potwierdzenia program OLTC uznaje ustalenia za wiążące
dla siebie i nie modyfikuje plików SLD.

# KARTY WYKONAWCZE: braki funkcji stacji G-STK-2..7 (2026-07-21)

**Status:** BINDING (dyrektywa właściciela 2026-07-21 „napisz prompt wykonawczy i leć po kolei
i nie pytaj"). Wynika z `AUDYT_STACJA_BRAKI_MAX_2026-07.md`. Realizacja po kolei, każda faza
end-to-end (kontrakt→backend/domena→API→UI→konsument), z bramkami przed scaleniem.

## §0 Rozstrzygnięcia wspólne (wiążące dla wszystkich kart)
1. **Zero fabrykacji / nigdy wyspy.** Każde nowe pole UI mapuje na realne pole/operację
   backendu z ISTNIEJĄCYM konsumentem (solver/analiza/pakiet dowodowy/raport). Gdy recon
   wykaże brak konsumenta liczbowego → faza DEFEROWANA z wpisem (nie budujemy phantomu).
2. **Addytywność / FROZEN.** Nowe pola z domyślnymi (bez zmiany istniejących payloadów),
   `exclude_none`, determinizm (seed niezmieniony dla dotychczasowych wejść). Solvery FROZEN
   nietknięte — budujemy adaptery/widoki, nie zmieniamy fizyki.
3. **Reużycie zamiast duplikacji.** Wykorzystujemy istniejące operacje/modele/helpery
   (`add_nn_load`, `GroundingConfig`, `Measurement`, `fault_loop_iec60364`, gpz sekcje).
4. **Test realnej ścieżki (Zero-Debt §5).** Każda faza: test natywnej ścieżki użytkownika +
   dowód konsumenta (analiza/model widzi dane). Bez syntetycznych obejść.
5. **Bramki per faza (kody wyjścia bezpośrednio):** backend pytest właściwego obszaru,
   ruff/black; frontend vitest + type-check + lint; guardy (ui_no_physics, ui_terminology,
   forbidden_ui_terms, utf8_mojibake, dead_click, dialog_completeness, no_codenames,
   arch/domain_no_guessing dla backendu); po scaleniu wpis rejestru + push.

## Kolejność wykonania (po kolei, wg audytu)
G-STK-2 → G-STK-3 → G-STK-4 → G-STK-5 → G-STK-6 → G-STK-7. Faza bez realnego konsumenta →
deferowana (wpis), przechodzimy do następnej.

---

### G-STK-2 — Układ pomiarowo-rozliczeniowy (CT/VT + punkt pomiarowy)
- **Cel:** stacja/OZE ma jawny punkt pomiarowo-rozliczeniowy (przekładniki + rola pomiarowa).
- **Recon (przed budową):** `Measurement`/`MeasurementRating` (CT/VT), rola pola pomiarowego
  (`MEASUREMENT`/`add_sn_bay`), konsument (zabezpieczenia `ct_ref/vt_ref`, raport).
- **Rozstrzygnięcie:** pole pomiarowe rozliczeniowe = pole SN roli MEASUREMENT z przypisaniem
  CT/VT (reużycie `add_sn_bay` + `Measurement`). Jeśli licznik nie ma konsumenta liczbowego —
  zapisujemy jako intencję/metę (widoczną w raporcie/inspektorze), NIE udajemy pomiaru.

### G-STK-3 — Potrzeby własne stacji
- **Cel:** mały odbiór nN zasilający potrzeby własne (oświetlenie/grzanie/zasilanie zabezpieczeń).
- **Recon:** `add_nn_load` (istnieje, PF konsumuje), rola/oznaczenie „potrzeby własne".
- **Rozstrzygnięcie:** reużycie `add_nn_load` z tagiem/rolą „potrzeby własne"; UI = opcjonalny
  mały odbiór w bloku nN. Zero nowej fizyki.

### G-STK-4 — Pętla zwarcia nN z modelu (domyka G-STK-1)
- **Cel:** policzone Ik pętli zwarcia doziemnego z modelu (nie ręcznych składowych) → czas
  wyłączenia / ochrona przeciwporażeniowa.
- **Recon:** `fault_loop_iec60364` + `fault_loop_builder` + `api/fault_loop`; Z trafo z
  materializacji, uziemienie z G-STK-1, przewód nN.
- **Rozstrzygnięcie:** adapter `FaultLoopInput` z ENM (Z trafo + neutralne + przewód nN +
  `network_type` z `nn_earthing_system`); widok wyniku (Ik min, Z_loop). Solver FROZEN.

### G-STK-5 — Dwusekcyjna stacja sekcyjna
- **Cel:** stacja „sekcyjna" ma REALNE dwie sekcje szyny + sprzęgło między nimi.
- **Recon:** obecny `sectional` dokłada sprzęgło bez II sekcji; gpz sekcje (`add_bus_section`).
- **Rozstrzygnięcie:** operacja domenowa II sekcji szyny + sprzęgło międzysekcyjne (reużycie
  wzorca gpz sekcji). Konsument: PF (topologia).

### G-STK-6 — Praca równoległa transformatorów
- **Cel:** stacja z ≥2 równoległymi transformatorami (rezerwa/moc).
- **Recon:** `generators.n_parallel` jest; `transformers` — brak w allowliście; PF per gałąź.
- **Rozstrzygnięcie:** `n_parallel` na modelu transformatora (allowlist + materializacja) +
  konsumpcja w PF (równoległe gałęzie / dzielona impedancja). Determinizm zachowany.

### G-STK-7 — SPD (ograniczniki przepięć) — WARUNKOWA
- **Cel:** ograniczniki SPD SN/nN w stacji.
- **Recon (bramka GO/NO-GO) — WYNIK:** konsument liczbowy ISTNIEJE — solver
  `v126_academic._insulation` (V126 INSULATION_COORDINATION, IEC 60071: margines BIL,
  MCOV/U_rated/U_residual, TOV, verification_status). ALE wejście `insulation`
  (`V126InsulationInput`) pochodzi z `parameters` żądania (`api/v126_academic._with_parameter_payloads`),
  NIE z apparatus `SURGE_ARRESTER` modelu — brak mostu model→solver.
- **Werdykt: GO z mostem** (nie phantom, nie deferujemy jak GAP-2). Wymaga budowy mostu:
  apparatus/element SPD w modelu stacji → builder `V126InsulationInput` z modelu
  (location_bus_ref, u_m_kv, network_neutral z G-STK-1, arrester_*) → run INSULATION_COORDINATION.
  Dedykowana runda (analogia do G-OZE-B mostu przez profile).

## STATUS REALIZACJI (2026-07-21)
- **G-STK-1** ✅ WDROŻONE (uziemienie punktu neutralnego, V12K-078).
- **G-STK-3** ✅ WDROŻONE (potrzeby własne stacji — odbiór nN, konsument PF).
- **G-STK-6** ✅ WDROŻONE (praca równoległa transformatorów — n_parallel, agregacja Sn×n
  w mapperze, golden-safe, konsument rozpływ/zwarcie).
- **G-STK-2** ⏳ KARTA (pomiary rozliczeniowe; CT/VT ochronne już są, licznik = raport/meta).
- **G-STK-4** ⏳ KARTA (pętla zwarcia z modelu — adapter `FaultLoopInput` z ENM; domyka G-STK-1).
- **G-STK-5** ⏳ KARTA (dwusekcyjna: potwierdzony realny brak — `sectional` ma pole SPRZĘGŁO,
  ale JEDNĄ szynę SN; sprzęgło „w powietrzu". Wymaga operacji II sekcji + realnego łącznika).
- **G-STK-7** ⏳ KARTA GO-z-mostem (SPD→V126InsulationInput→_insulation, konsument istnieje).

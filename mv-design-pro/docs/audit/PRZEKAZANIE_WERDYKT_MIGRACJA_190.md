# Przekazanie karty WERDYKT-MIGRACJA-190

Gałąź `claude/mv-design-pro-twin-audit-u4lhy0-werdykt-migracja`, drzewo `/home/user/wt-werdykt`.
Cel karty: lista `scripts/werdykt_wyjasnialny_allowlist.json` bez wpisów MIGRACJA (strażnik
`scripts/werdykt_wyjasnialny_guard.py`). Stan bazowy karty (`b1e677ced`): MIGRACJA 190,
ENUM_WEWNETRZNY 49. Stan teraz: **MIGRACJA 97, ENUM_WEWNETRZNY 51** (strażnik RC=0).

## Domeny

| Domena | MIGRACJA przed | MIGRACJA teraz | Stan |
|---|---|---|---|
| 1. Wyposażenie stacji, dobór przekładników, aparatura | 21 | 4 | zmigrowane (commit grupy 1); 4 pozostałe to `equipment_proof` (C33/A37) — nietknięte |
| 2. Jakość wyniku (pasma wiarygodności, walidacja energetyczna, warunki przyłączenia, wytrzymałość cieplna) | 19 | 0 | zmigrowane (commit grupy 2) |
| 3. Werdykt projektowy, raport zgodności DER-SN, ekran oceny, wniosek OSD | 11 | 0 | zmigrowane (commit grupy 3) |
| 4. Ocena normatywna, wrażliwość, profil napięć | 7 | 0 | zmigrowane — w commicie WIP (zweryfikowane celowo: pytest 5834 zielone przed naprawami strażników; po naprawach bieg zbiorczy przerwany) |
| 5. Wzorce odniesienia A i C (+ API, PDF/DOCX) | 18 | 0 | zmigrowane — w commicie WIP (testy wzorców i API 56+175 zielone, 4 iniekcje czerwone bez naprawy) |
| 6. Modele analiz: siła sieci B11, adekwatność Q B10, SSCI B12, wgląd zabezpieczeń B7 | 8 | 3 | siła sieci B11 zmigrowana (rekord K SCR na węzeł i WSCR, `verdict`/`is_weak` projekcją, front pulpitu OZE i kontekst sekwencji FRT z etykietą i kartą rekordu); adekwatność Q B10 zmigrowana (rekord W: rezerwy w górę/w dół każdego źródła wobec ε i pasmo napięcia węzłów; nasycenie i naruszenie projekcją rekordów; brak danych źródła ≠ wystarczająca); B12, B7 w toku |
| 7. nN / SWZ (C25, C27, C29, C30, arkusz obwodów, E75, E77, fieldLabels) | 22 | 22 | nietknięte |
| 8. Proof Engine / audyt (C41, C44, C48, A36, sc_symmetrical/asymmetrical) | 19 | 19 | nietknięte |
| 9. Frontend pozostały (D18…D72, E20…E62, SLD v2 G1–G9, NnSwitchgearCard) | 38 | 32 | nietknięte poza wpisami usuniętymi razem z grupami 2–4 |
| 10. Pozostałe (archiwum, importy, preflight B20, kreator C54, katalogi audit2, reference_engine) | 24 | 14 | w części przeklasyfikowane na ENUM_WEWNETRZNY z uzasadnieniem; reszta nietknięta |
| FRT/HVRT A13 (`network_model/solvers/frt_hvrt/contracts.py`, `FrtHvrtResult.status`, `FrtScenarioResult.status`, `FrtScenarioResult.stayed_connected`) | 3 | 3 | ZATRZYMANE — rdzeń FROZEN z `scripts/rdzenie_b01.py` (wiersz „FRT/HVRT”), wymaga decyzji B-01 |

## Wspólni budowniczowie utworzeni w karcie

- `backend/src/analysis/normative/oceny.py` — rekord K reguły oceny normatywnej (`ocena_pozycji`, podstawa z konfiguracji).
- `backend/src/analysis/sensitivity/oceny.py` — rekord K zapasu wrażliwości (`ocena_zapasu`, `decyzja` jako projekcja).
- `backend/src/analysis/energy_validation/oceny.py` — rekord K pozycji walidacji energetycznej.
- `backend/src/application/reference_patterns/oceny.py` — rekord K sprawdzenia wzorca, rekord W wzorca, projekcje `status_sprawdzenia` / `werdykt_wzorca` / `opis_werdyktu`.
- `backend/src/analysis/sanity_bounds/oceny.py`, `backend/src/network_model/solvers/equipment_checks/oceny.py` — z grup 1–2.
- `backend/src/analysis/grid_strength/oceny.py` — rekord K siły sieci (`ocena_sily`, projekcja `klasa_sily`).
- `backend/src/analysis/reactive_adequacy/oceny.py` — rekordy K rezerwy i pasma, rekord W adekwatności Q.
- Wpisy `CapabilityEvidence` w `solver_input/provenance.py`: `sila_sieci.scr_wscr`, `adekwatnosc_q.rezerwa_i_pasmo`, `normatywna.ocena_dowodow`, `wzorzec_odniesienia.nastawy_i_bis`, `wzorzec_odniesienia.generacja_lokalna`, `wrazliwosc.zapas_kryterium`.

## Znane czerwone i niezweryfikowane

- Commity grup 1–3 weszły z czerwonymi strażnikami `nazwa_bez_identyfikatora_guard`, `polykanie_wyjatkow_guard`, `ui_production_codes_guard` i błędami typów testów frontu (`tsconfig_gate_guard`); naprawy są w commicie WIP i po nich te strażniki (oraz `no_codenames_guard`, `solver_input_substitute_guard`, `mypy_ratchet_guard` 163/20, `tsconfig_gate_guard`, `werdykt_wyjasnialny_guard`) dały RC=0 pojedynczo.
- Nieukończone: zbiorczy bieg pytest (`/tmp/claude-0/werdykt/testy_final.txt`, 137 ścieżek) przerwany na STOP przed startem (czekał na blokadę); pełny `guardy_z_ci.py` ostatnio zatrzymany limitem czasu na kroku testów własnych strażników.
- Vitest celowany (`src/ui/sld/v3/lv-domain`, `src/ui2/kreatory/edycja-parametrow`, `src/ui2/oze/ncrfg`, `src/ui2/oze/wniosek`, `src/ui2/spaces/wyniki`, `src/ui2/wyniki`): 131 plików / 2604 testy zielone; eslint zmienionych plików RC=0.
- Zapadka mypy obniżona 163/20 → 161/19 (pomiar: różnica zbiorów = 2 błędy `misc` w `analysis/grid_strength/builder.py`).
- Bieg zbiorczy `testy_final.txt` na `6bc155298` zakończony RC=143 (przerwany sygnałem przed startem pytest) — do powtórzenia na drzewie końcowym.
- Znaleziska do meldunku: dryf ostatniej cyfry rozpływu ~1e-11 (rdzeń NR FROZEN); wzorzec C bez ścieżki w API; API wzorców bez konsumenta frontu; selektywność wzorca A przy `ik_max_next_bus_a = 0` daje „spełniona: I_min = 0 A” (silnik nastaw).

## Pierwszy krok następcy

Uruchomić zbiorczy bieg z `/tmp/claude-0/werdykt/testy_final.txt` (pod `flock`, prywatny
`--basetemp`) i `scripts/guardy_z_ci.py`; po zieleni przejść do domeny 6 (siła sieci
`analysis/grid_strength`: rekord K `SCR ≥ próg słaby` na węzeł i dla WSCR, `verdict`/`is_weak`
jako projekcja, konsumenci frontu `ui2/oze`), potem 7, 8, 9, 10.

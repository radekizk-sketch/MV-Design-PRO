# KARTA ZADANIA D13 — KONSOLIDACJA TODO-KART BACKENDU (D1/D6 — DOMKNIĘCIE DŁUGU)

**Faza:** U4 · **Wykonawca:** Opus · **Warstwa:** backend ·
**Wiążące:** CLAUDE.md (NOT-A-SOLVER; No-Heuristics; WHITE BOX; FROZEN solvery
nietykalne). Trzy DROBNE domknięcia zarejestrowanych TODO-KART — zmiany
ADDYTYWNE w odpowiedziach (nowe pola; istniejące pola i testy bez zmian
semantyki; testy istniejące aktualizuj TYLKO gdy asertują komplet kluczy).

## 1. Zakres (trzy punkty)
1. **D1/TODO — n_parallel przy mocy IBG**: `application/analyses/grid_strength.py`
   `_installed_mva_for_generator` (linia 44) liczy S_n pojedynczej jednostki;
   ENM zna `n_parallel` (`enm/models.py:368`). Uwzględnij krotność: moc
   zainstalowana = S_n × n_parallel (n z `gen`/materializacji; brak/None → 1;
   udokumentuj w docstringu). Ta sama poprawka wszędzie, gdzie wzorzec
   `_installed_mva_by_bus` jest powielony (ZBADAJ: migotanie.py z D11 używa
   mocy modułów — spójność!). Testy: n_parallel=2 podwaja S_installed
   (i Pst w migotaniu, jeśli dotyczy).
2. **D1/TODO — q_actual per źródło**: widok adekwatności mocy biernej podaje
   dziś tylko sumę netto (`analysis/reactive_adequacy/models.py:200`
   `net_source_q_mvar`). Dodaj ADDYTYWNIE listę per źródło (ref, q_mvar
   z wyniku PF — skąd suma netto jest dziś liczona, ZBADAJ builder.py:376-414)
   do odpowiedzi serwisu/serializera (`serializer.py:73` okolice) — bez zmiany
   istniejących pól. Testy: lista per źródło sumuje się do netto.
3. **D6/TODO — echo parametrów scenariusza**: odpowiedź
   `application/analyses/frt_trajektorie.py` (`build_frt_trajectories_view`)
   nie niesie parametrów wejścia solvera (voltage_dip_depth_pu,
   fault_duration_s). Dodaj sekcję echo wejścia per scenariusz — wzorzec
   `wejscie_solvera` z D9 (`frt_sekwencja.py`). Testy: echo zgodne ze stałymi
   `frt_input.py:18-20`.

## 2. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD`. Baza pełnego pytest: 6021 passed, ZERO failed. UWAGA
środowiskowa: przy pustym venv worktree użyj
`/root/.cache/pypoetry/virtualenvs/mv-design-pro-backend-D2vgvUMQ-py3.11/bin/python`.
PEŁNE suity Z PRZEKIEROWANIEM DO PLIKU (`... -q > pelny_pytest.log 2>&1`;
potem `tail -2` pliku) — NIE na goły potok. Celowane + PEŁNY pytest ZERO
failed; ruff/black/mypy na twoich plikach; guardy: arch, solver_boundary,
pcc_zero, load_flow_no_heuristics (venv główny). Po pełnym pytest NATYCHMIAST
commit: `feat(api): konsolidacja TODO backendu — n_parallel, q_actual per
źródło, echo FRT (D13)` BEZ push. Raport standardowy (plik:linia).

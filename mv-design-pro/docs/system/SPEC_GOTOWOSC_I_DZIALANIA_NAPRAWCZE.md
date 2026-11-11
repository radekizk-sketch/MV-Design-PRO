# SPEC_GOTOWOSC_I_DZIALANIA_NAPRAWCZE

Status: wiazacy dla aktywnego backendu.

Kod:
- `backend/src/enm/validator.py`
- `backend/src/enm/fix_actions.py`
- `backend/src/enm/domain_operations.py`
- `backend/src/api/enm.py`

Zrodla gotowosci:
- walidator ENM zwraca `blockers`, `warnings`, `info`,
- `domain_operations.py` doklada blokery domenowe i buduje plaska odpowiedz `readiness` oraz `fix_actions`,
- `selection_hint` jest zwracany razem z odpowiedzia operacji domenowej.

Aktywne endpointy odczytu:
- `GET /api/cases/{case_id}/enm/validate`
- `GET /api/cases/{case_id}/enm/readiness`
- `GET /api/cases/{case_id}/engineering-readiness`

Kody i akcje:
- walidator utrzymuje kody co najmniej `E001-E010`, `W001-W004`, `I001-I002`,
- warstwa domenowa dodaje co najmniej: `pv_bess.transformer_required`, `branch_point.invalid_parent_medium`, `branch_point.required_port_missing`, `branch_point.catalog_ref_missing`, `zksn.branch_count_invalid`, `switch.catalog_ref_missing`,
- kod `branch_point.switch_state_missing` skasowany (W5-C, 2026-10-21): stan łączeniowy punktu rozgałęzienia żyje wyłącznie na łącznikach portów (`status`/`normal_state`), więc kopia na punkcie nie może być „brakująca”,
- typy `FixAction.action_type`: `OPEN_MODAL`, `NAVIGATE_TO_ELEMENT`, `SELECT_CATALOG`, `ADD_MISSING_DEVICE`.

Zakres odpowiedzi:
- `domain-ops` zwraca uproszczone `readiness`, `fix_actions` i `selection_hint`,
- `engineering-readiness` zwraca pelniejsze `issues`, `fix_action` i `payload_hint`.

Granice aktualnego stanu:
- na kanonicznej sciezce `domain-ops` brak katalogu jest blokowany przez bramke API przed zapisem; gotowosc nadal diagnozuje starsze, legacy albo importowane elementy bez katalogu lub bez pelnych danych,
- gotowosc nie zamyka sama obchodow katalog-first wynikajacych z aktywnych legacy endpointow katalogowych,
- fix actions prowadza do miejsca naprawy, ale nie sa jeszcze pelnym kontraktem dla wszystkich klas elementow.

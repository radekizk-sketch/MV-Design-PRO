# Decyzje po review: sld_drawer_unification

## Źródła

- Prompt: `docs/audits/CLAUDE_DESIGN_REVIEW_sld_drawer_unification_20260528_012622.prompt.md`
- Review: `docs/audits/CLAUDE_DESIGN_REVIEW_sld_drawer_unification_20260528_012622.md`
- Meta: `docs/audits/CLAUDE_DESIGN_REVIEW_sld_drawer_unification_20260528_012622.meta.json`

## Accepted

- Jeden spójny drawer obiektu po kliknięciu w SLD: stacja, pole, aparat, transformator, odcinek oraz węzeł terenowy.
- Samo kliknięcie nie może automatycznie zastępować prawego panelu pełnym ekranem konfiguracji. Pełny widok i konfiguracja są jawne jako akcje.
- Drawer musi pokazywać akcje domenowe z widocznym powodem blokady, zamiast martwych kliknięć.
- Węzły terenowe ZK SN / słup rozgałęźny muszą mieć własną kartę techniczną i zakładkę operacji.
- Transformator SN/nN musi mieć normalną kartę inżynierską z brakami danych, a nie puste kreski.

## Rejected

- Nie przenosimy fizyki ani wyliczeń do drawerów. Drawer jest prezentacją i nawigacją do konfiguracji, solver pozostaje w backendzie.
- Nie ukrywamy akcji usuwania. Są dostępne, ale potwierdzane i wykonywane przez istniejącą operację domenową.

## Deferred

- Brak odłożonych zmian krytycznych dla tej iteracji drawerów.
- Zmiany solverów, katalogów i pełnych formularzy producentów pozostają poza zakresem tego requestu, bo nie są wymagane do usunięcia niespójności drawerów.

## Kryteria akceptacji

- Klik w odcinek SN otwiera drawer odcinka i nie przełącza automatycznie aktywnej powierzchni na E-12.
- Klik w ZK SN / słup otwiera drawer węzła z parametrami i operacjami.
- Klik w transformator otwiera kartę transformatora z mocą, napięciami, grupą, u_k, Pk, katalogiem i brakami danych.
- Toolbar drawerów pokazuje konfigurację, pełny widok i akcje domenowe z disabled reason.
- Testy `SldDetailDrawer` i `SldWorkspaceContainer` potwierdzają nowe flow.

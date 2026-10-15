# ADR-027: Punkt przyłączenia jako obiekt umowny na terminalu (rozstrzygnięcie zakazu terminu w modelu fizyki)

**Status:** ACCEPTED (2026-09-30, decyzja doradcy z delegacją właściciela O-59 — rejestr O-63 w `docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md` §2.3; O-60 z korektą nośnika: `GridConnectionPoint` jest obiektem warstwy kontraktowej wskazującym terminal przez `terminal_ref`; pola `sk_max/min` ORAZ `agreed_power`/`agreed_cos_phi` usunięte przy przyjęciu (S_k,min i X/R w `ConnectionConditions`; moc i cos φ już w `moc_przylaczeniowa_mw`/`wymagany_cos_phi`); v1 jeden punkt na projekt, wielopunktowość w G-15(b); ADR-003 i ADR-006 SUPERSEDED; część dokumentowa i `pcc_zero_guard` strukturalny (G-15(a)) natychmiast, kod po W5-T — V12K-347, V12K-348)
**Data:** 2026-09-02
**Dokument źródłowy:** `../twin/MV_DESIGN_PRO_TARGET_DIGITAL_TWIN_ARCHITECTURE.md` §17

## Kontekst
Kanon repo zakazuje pojęć punktu przyłączenia i węzła granicznego w `NetworkModel` (Core Rule 5, `pcc_zero_guard`), a mandat (§44–§45) wymaga punktu przyłączenia jako obiektu pierwszej klasy dla DER, warunków OSD, RfG i wniosku. W kodzie punkt przyłączenia żyje w 12 rozproszonych rolach (slack w interpretacji, granica sieci, tekst wniosku) — A5-06, A1-08, A12 §8 pkt 1.

## Decyzja
`GridConnectionPoint{terminal_ref, connection_conditions_ref, owner: OSD|CLIENT, metering_ref, compliance_profile}` jako obiekt **warstwy kontraktowej** (CONTRACT/DESIGN), który **wskazuje** terminal w modelu fizyki i **nie jest** węzłem, elementem ani parametrem solvera. Solvery, projekcje, RfG, wniosek OSD i werdykt czytają ten sam obiekt. `pcc_zero_guard` zostaje jako guard strukturalny: brak węzła/elementu tego rodzaju w migawce solvera (`network_model/core/**`, `network_model/solvers/**`, `solver_input/**`); dopuszcza obiekt w warstwie kontraktu.

**Korekta przy przyjęciu (2026-09-30, O-60, V12K-347/V12K-348).** Z pól usunięte `sk_max/min` ORAZ `agreed_power`/`agreed_cos_phi`:
- nośnikiem S_k,min i X/R punktu przyłączenia są addytywne pola istniejącego `ConnectionConditions` (`enm/models.py:177` — „Warunki przyłączenia z dokumentu OSD (dane WEJŚCIOWE projektu, nie wynik)”): `s_k_min_mva`, `x_r`, źródło; kod gotowości `connection_conditions.s_k_missing`; NIE `Generator.deklaracje_modulu` (0 pól S_k) i NIE profil NC RfG; `Source.sk3_min_mva` to fizyka równoważnika GPZ — inna wielkość;
- `agreed_power`/`agreed_cos_phi` duplikowały `ConnectionConditions.moc_przylaczeniowa_mw`/`wymagany_cos_phi` (`models.py:186-187`);
- krotność: `header.connection_conditions` jest pojedyncze (`models.py:209`) → v1 jeden punkt przyłączenia na projekt; `GridConnectionPoint` wskazuje warunki przez `connection_conditions_ref`; wielopunktowość = lista warunków per punkt, addytywnie w G-15(b), nie w v1;
- konsument „hosting capacity” wpisany dopiero po pomiarze: `application/analyses/hosting_capacity.py` nie czyta S_k (grep = 0);
- kolejność: (a) redakcja Core Rule 5 w `CLAUDE.md`, K-19 w `docs/ui`, `pcc_zero_guard` z testami strukturalnymi — natychmiast; (b) `GridConnectionPoint` w `domain/` + sekcja umowna ENM poza `NetworkModel` + API addytywne — po W5-T (terminale T-2 są warunkiem `terminal_ref`); (c) inwentarz 12 ról (A5-06, A1-08, A12 §8) i kasacja tekstowego punktu przyłączenia we wniosku OSD; (d) konsumenci RfG/wniosek/werdykt/UI kreator przyłącza; test iloczynu: wiele modułów × jeden punkt; jeden projekt × wiele punktów (G-15(b)); punkt bez warunków → `BRAK_PODSTAWY`; usunięcie terminalu → sierota wykryta; S_k czytane z jednego nośnika (grep drugiego = 0).

**Zastąpione ADR:** ADR-003 (persystencja BoundaryNode/źródeł) i ADR-006 (persystencja BoundaryNode, źródeł, odbiorów, uziemienia, limitów) → SUPERSEDED by ADR-027 — punkt przyłączenia nie jest kolumną ani węzłem persystencji, lecz obiektem umownym na terminalu.

## Konsekwencje
- Znika 12 rozproszonych ról; wniosek OSD nie prosi o punkt przyłączenia jako tekst.
- Zgodność z kanonem: fizyka nie wie o umowie; umowa zna terminal.

## Alternatywy odrzucone
- Węzeł graniczny w modelu fizyki (mandat czytany literalnie): fikcyjny byt w solverze, sprzeczny z kanonem.
- Pozostawienie interpretacji rozproszonej: dzisiejszy stan.

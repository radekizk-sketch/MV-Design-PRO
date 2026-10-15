# ADR-012: Kanoniczny model cyfrowego bliźniaka (node-breaker, terminal-centric, zgodny z CIM)

**Status:** ACCEPTED (2026-09-30, decyzja doradcy z delegacją właściciela O-59 — rejestr O-63 w `docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md` §2.3; z korektą 2026-09-04 poniżej: ENM = Canonical Project Twin, bez klasy `TwinModel`; DT-1 EVIDENCE-GATED, FROZEN po CV-5 i przeglądzie adwersaryjnym; bramka M0/M1 z docs/twin nie wiąże wycinków W — V12K-340)
**Data:** 2026-09-02
**Dokument źródłowy:** `../twin/MV_DESIGN_PRO_TARGET_DIGITAL_TWIN_ARCHITECTURE.md` §1–§5

## Kontekst
Audyt (A1-01/02/03, A9-01) wykazał trzy magazyny modelu, nietypowany worek `meta.field_specs` jako aktywną prawdę o polach, brak terminali i brak rozróżnienia węzła łączności od węzła topologicznego. Mandat (§9–§15, §184–§185) wymaga jednego modelu prawdy, z którego wszystko jest wyprowadzane.

## Decyzja
Jeden kanoniczny model **node-breaker, terminal-centric**, wyrównany do ontologii CIM (IEC 61970/61968): kontenery `Substation/VoltageLevel/Bay/Line`, `ConductingEquipment` z `Terminal`ami, `ConnectivityNode`, `TopologicalNode` wyprowadzany; `BusbarSection` jako urządzenie; wyposażenie pól jako obiekty typowane. Tożsamość: `asset_id` (UUIDv4 techniczny) + `ref_id` (stabilny, w kontraktach) + `designation` (IEC 81346) + `terminal_id = {asset_id}:T{n}`. Worki `meta` znikają; ENM v1 pozostaje formatem przejściowym z adapterem do czasu cutoveru (bez warstwy zgodności po nim).

## Konsekwencje
- Solvery, projekcje, dokumenty i integracje czytają jedną migawkę; klient nie rekonstruuje topologii.
- Migracja formatu = rewizja „migracja" z testem odtworzenia hashy; wszystkie wyniki historyczne pozostają związane ze swoją rewizją.
- Kasacja legacy SQL `network_*`, `sld_*`, `operating_cases` po cutoverze (plan migracji M1-4).

## Alternatywy odrzucone
- Pozostanie przy bus-branch z portami jako metadanymi: nie daje egzekwowalnej łączności ani gramatyki pola.
- Big-bang nowy model bez adaptera: brak ścieżki weryfikacji na istniejących sieciach.

## Korekta 2026-09-04 (kontrakt MAX PLATFORM, §4 i §12)
Sformułowanie „jeden kanoniczny model node-breaker" NIE oznacza nowej trwałej klasy modelu.
Canonical Project Twin = `EnergyNetworkModel` rozwinięty addytywnie (`docs/architecture/CANONICAL_TWIN_ARCHITECTURE.md` §1–§4):
`Bus` ≡ `ConnectivityNode`, terminal wyprowadzany deterministycznie z trwałych `from_bus_ref`/`to_bus_ref` + fazy
(T-1…T-4), `PhaseSet`, `EarthingSystem`, `NeutralGrounding` jako encje (F-1…F-4). `network_model/core` jest
pochodnym, niemutowalnym IR (`docs/architecture/CANONICAL_TWIN_ARCHITECTURE.md`), nie drugim modelem projektu.
Kontenery CIM (`Substation/VoltageLevel/Bay`) mapują się na istniejące `Substation`/`GPZSection`/`NnSection`/`Bay`.
Kasacja legacy SQL wyłącznie procedurą kasacji (D-03 warunkowo). Status ADR: ACCEPTED 2026-09-30 (O-63, opcja C);
wpis DT-1 w `docs/architecture/DECISION_FREEZE_REGISTER.md` pozostaje EVIDENCE-GATED i staje się FROZEN dopiero po CV-5
i przeglądzie adwersaryjnym.

## Rozstrzygnięcie bramki M0/M1 (2026-09-30, O-63, V12K-340)
Werdykt właściciela 2026-09-02 „M1–M7: STOP do odbioru M0” (`../twin/OWNER_REVIEW_PACKAGE.md` §4a) dotyczy planu
migracji z `docs/twin`, który wg K-20 jest materiałem wejściowym i dowodowym, nie kanonem (`../INDEX.md`). Programem
wiążącym jest misja domknięcia 2026-09-09 z wycinkami W1–W12 (`../plan/MISJA_DOMKNIECIA_PRODUKTU_2026-09.md` nie
zawiera faz M — grep `M0|M1–M7` = 0). Decyzje ADR-012…028 nie „odblokowują M1+”, lecz działają w wycinkach W; czy M0
formalnie odebrano — NIEZMIERZONE i nieistotne dla wycinków W. Zmiana wyłącznie dokumentowa: zero kodu; deklaracja
„ENM jedynym źródłem prawdy” ma przypięte testy `tests/invariants/test_wlasnosc_modelu_projektu_adwersaryjne.py`
i `enm_store_key_guard`.

# MELDUNEK — karta ZAPIS-DECYZJI (fala 0 dokumentów po decyzjach O-59), 2026-09-30

**Gałąź wynikowa:** `claude/mv-design-pro-twin-audit-u4lhy0-karta-zapis-decyzji-o60` (baza: `f3c435b6` TORY-TYLKO-W-TESTACH).
**Źródło decyzji (tylko odczyt):** `origin/claude/mv-design-pro-twin-audit-u4lhy0-wip-zrodla-decyzji` → `zrodla_decyzji_o59/{uzgodnienie_wynik.json, decyzje_tory_i_wspolczynnik_c.md, decyzja_b01_fable.json, decyzja_lacznik_fable.json}` — żaden surowy plik nie trafił do drzewa.
**Zakres:** wyłącznie dokumenty i strażniki dokumentów z samotestami. `backend/src` i `frontend/src` NIETKNIĘTE (`git diff --stat -- mv-design-pro/backend/src mv-design-pro/frontend/src` = 0 plików).

## 1. Wynik i dowód

| Bramka | Wynik | Dowód |
|---|---|---|
| `docs_guard.py` (z nowymi sprawdzeniami K-19, K-20) | zielony, RC=0 | `docs-guard: OK (all checks pass)` |
| `docs_count_consistency_guard.py` | zielony, RC=0 | 4 deklaracje w 3 dokumentach zgodne |
| `plan_ab_zaleznosci_guard.py` | zielony, RC=0 | „każdy przyrost stoi po swoich zależnościach; brak cykli” |
| `utf8_mojibake_guard.py` | zielony, RC=0 | `PASSED` |
| `no_codenames_guard.py` | zielony, RC=0 | brak naruszeń |
| `pcc_zero_guard.py` (z iniekcją strukturalną G-15(a)) | zielony, RC=0 | literał PCC = 0; `GridConnectionPoint`/`BoundaryNode` w `network_model/**` i `solver_input/**` = 0 |
| `claude_md_struktura_guard.py` | zielony, RC=0 | `ui=49 · ui2=18` |
| `solver_boundary_guard.py` | zielony, RC=0 | 37 plików dynamiki, 0 naruszeń; brak zmian w plikach chronionych |
| `verification_phantom_paths_guard.py` | zielony, RC=0 | OK |
| `docs_archive_guard`, `forbidden_ui_terms_guard`, `repo_hygiene_guard`, `router_mount_guard`, `resultset_v1_schema_guard` | zielone, RC=0 | wypisy w sesji |
| samotesty: `backend/tests/ci/test_docs_guard_hierarchia_i_punkt_przylaczenia.py` (11), `test_pcc_zero_guard_strukturalny.py` (7) + sąsiednie `test_docs_guard_status_audytu_sld.py`, `test_catalog_first_repo_guards.py`, `test_guardy_z_ci.py` | 45 passed | `poetry run python -m pytest -q …` RC=0 |
| `python ../scripts/guardy_z_ci.py` z katalogu `backend/` | **110 z 112 pozycji zielone**; samotesty skryptów `pytest ../scripts`: **3368 passed** (401 s); lint jak CI (black/ruff: src, tests, ../scripts, scripts) zielony; RC=1 wyłącznie przez czerwień bazy i środowisko (niżej) | log biegu w sesji; czerwone: `tsconfig_gate_guard` (czerwień bazy 81 > 80 — potwierdzona pomiarem po `npm ci`: „dlug typow POZA bramka urosl o 1 (80 -> 81)”; frontend nietknięty tą kartą), `werdykt_wyjasnialny_guard` (RC=2 = błąd środowiska bez `node_modules`; po `npm ci` uruchomiony ponownie: **zielony**, „brak nowych tożsamości z lakonicznym werdyktem; zapadka zgodna z pomiarem”), kroki npm (bez `node_modules` w chwili biegu; po `npm ci`: `npm run type-check` RC=0, `npm run lint` RC=0) |
| black (line-length 100) + ruff na zmienionych skryptach i nowych testach | zielone | `All done`, ruff RC=0 |

**Czerwień bazy zmierzona osobno (naprawiana równolegle w partii 6, nie w tej karcie):** `tests/enm/migrations/test_nn_field_specs_promocja_aparat.py`, `tests/domain/test_rejestr_kodow_bram_katalogowych.py`, `tests/enm/test_nazwy_jedno_zrodlo.py` — łącznie **10 failed / 144 passed** (21,8 s) na drzewie tej karty, identycznie jak na bazie (karta nie dotyka `backend/src`). `tsconfig_gate_guard` — zmierzony po `npm ci`: „2368 plikow zrodlowych, 0 bledow W BRAMCE, 81 POZA BRAMKA (budzet 80)”, RC=1 — czerwień bazy (frontend nietknięty tą kartą), naprawiana równolegle.

## 2. Commity (autor `radekizk-sketch <radek.izk@gmail.com>`, `--cleanup=verbatim`)

1. `CLAUDE.md: hierarchia 1b i docs/twin (K-20, O-63), Core Rule #4 …, Core Rule #5 …, walidator ENM + CalculationReadiness …` — OSOBNY commit do przeglądu/wycofania przez właściciela; każda zmiana z odsyłaczem do wiersza O-xx.
2. Dokumenty + strażniki + samotesty (jeden commit karty).
3. `MELDUNEK_ZAPIS_DECYZJI.md` — ten plik (integrator go pomija).

## 3. Rejestr decyzji O-60…O-75 → miejsce

| Wiersz | Miejsce (plik:linia) | Treść w skrócie |
|---|---|---|
| O-60 | `mv-design-pro/docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md:155` | jeden nośnik S_k,min/X/R = `ConnectionConditions`; ADR-027 bez `sk_max/min` i `agreed_*`; korekta O-57 pkt 9 (:152) i §12.1 pod tabelą generowaną |
| O-61 | `…PLAN_AB…:156` | OD-21-KOD = B-01 ze zgodą O-59; sufiksy jednostek K-05 dla nowych pól |
| O-62 | `…PLAN_AB…:157` | R3 istnieje; (l) ≠ OD-24; karta V126-UCZCIWOSC zamiast R3-V126; `v126_academic.py` plik gorący |
| O-63 | `…PLAN_AB…:158` | bramka M0/M1 tylko docs/twin; hierarchia 1b + docs/twin (K-20); statusy ADR-012…029 |
| O-64 | `…PLAN_AB…:159` | TopologyView jedyny dostawca; K-07 zmierzone (partycja per wyspa istnieje); K1 migruje konsumentów BFS przed kasacją |
| O-65 | `…PLAN_AB…:160` | walidator ENM + CalculationReadiness (klasa: CLAUDE.md ×3, ARCHITECTURE ×3 + SYSTEM_SPEC, AGENTS); jeden rejestr kodów odmów |
| O-66 | `…PLAN_AB…:161` | kody SI-110…SI-116 (+SI-117+) w `network_model/core/zdolnosci_wkladu_zwarciowego.py`; klasa konsumentów autorytetu z W4 |
| O-67 | `…PLAN_AB…:162` | OD-15(g): pole `regulacja_q` w jednym podniesieniu wersji z §12.2(f); literał szablonu w MAPA naprawiony |
| O-68 | `…PLAN_AB…:163` | TT/IT jedno wejście `fault_loop_iec60364`; KARTA_W5:115-116 bez wartości z pamięci; DOCX 501 |
| O-69 | `…PLAN_AB…:164` | literał „LTI”; inwentarz klasy; W4-0 po PROT-LTI |
| O-70 | `…PLAN_AB…:165` | warunek wejścia W6-A = §5 FINAL_DYNAMICS + OD-30; OD-36 bez fałszywego precedensu; „OD-5c” = O-5(c) |
| O-71 | `…PLAN_AB…:166` | CGMES z backendu, SCL po danych; K-16 bez klasy wyjątku; testy CI SLD atomowo w kartach kodowych; B-02 poza delegacją |
| O-72 | `…PLAN_AB…:167` | korekty ścieżek i faktów (9 pozycji, w tym pomiary: A2-01/07/08 i E-40 w MAPA = 0 trafień, wiersz OLTC w REJESTR = 0 trafień) |
| O-73 | `…PLAN_AB…:168` | fale 0–5, pliki gorące, NASTAWY-JEDNA-PRAWDA |
| O-74 | `…PLAN_AB…:169` | TORY: kasacja limitów rozpływu (PF-LIMITY-KASACJA), martwe mappery ResultSet (z OD-18), łańcuch uziemień P19 |
| O-75 | `…PLAN_AB…:170` | współczynnik c i t_k w scenariuszu zwarciowym; pola przypadku skasowane |
| wiersz §7 rejestru postępu | `…PLAN_AB…` §7 (wiersz „karta ZAPIS-DECYZJI”) | tożsamość „OD-5c” = O-5(c); odsyłacze |

## 4. Sprzeczności międzyklastrowe (14) → gdzie utrwalone

| # | Sprzeczność | Utrwalone w |
|---|---|---|
| 1 | nośnik S_k,min/X/R (ADR-027 vs O-57 pkt 9 vs OD-21) | O-60; ADR-027 (decyzja + korekta); PLAN_AB :152 i §12.1 pod tabelą; REJESTR V12K-348; CLAUDE.md Core Rule 5 |
| 2 | sekwencja rund B-01, nazwa R3-V126, (l) vs OD-24 | O-62; MAPA §7 OD-15; CANONICAL_TWIN :89; INWENTARZ_W5 :181 |
| 3 | OD-21-KOD `b01=false` na pliku rdzenia | O-61; PLAN_AB §12.1 (wiersze 13.1a, RoCoF, WiPWC); SYNTEZA OD-21 |
| 4 | bramka M0/M1 i statusy ADR | O-63; REJESTR V12K-340; ADR-012 (nowa sekcja); OWNER_REVIEW_PACKAGE §4a adnotacja + §6; MAPA/INDEX; wszystkie ADR-012…029 linia 3 |
| 5 | TopologyView vs grafy frontu vs BFS | O-64; ADR-013 SUPERSEDED; ADR-014/021/024; REJESTR V12K-344; CANONICAL_TWIN :299; CAP MATRIX C04 |
| 6 | walidator vs CLAUDE.md; rejestr kodów odmów | O-65; CLAUDE.md :174/:780/:870 (osobny commit); ARCHITECTURE :149/:412/:440 + §5.3; SYSTEM_SPEC :243; AGENTS :200; ADR-025 |
| 7 | warstwa autorytetu SI-11x i konsumenci W4 | O-66; MAPA OD-22 (:717); SYNTEZA :567; CONVERGENCE_EVIDENCE I.3; ADR-021 K2 |
| 8 | OD-15(g) nierozstrzygnięte | O-67; MAPA :710 (literał szablonu skasowany) i :170 |
| 9 | TT/IT: ADR-015 vs OD-25; liczby z pamięci w KARTA_W5 | O-68; KARTA_W5 :115-116; ADR-015 status; docs/nn G-12/A:85/C:30; AUDYT_PROMPT D-11 |
| 10 | PROT-LTI vs W4-0 vs OD-18 na jednym pliku B-01 | O-69; MAPA :206; IEC_IDMT_CANON :208; ADR-022 status; REJESTR V12K-341 |
| 11 | dynamika: warunek W6-A-OD36, „OD-5c” | O-70; FINAL_DYNAMICS §5 (akapit), OD-36 (:378), §7.1 wiersz OD-5c; W6_A :544, :640-644; REJESTR W6-3C-KONFLIKT (:446) |
| 12 | K-14 CGMES vs K-16 vs katalogi eksportu SLD | O-71; ADR-029; REJESTR V12K-346, S9-6 dopisek; MAPA :205, W12; INWENTARZ_FUNKCJI :253; SYNTEZA :590; OWNER_REVIEW K-14/K-16/D-41 |
| 13 | OD-3 „po W4” | O-72 (2); MAPA D1 (:444), W8 (:754) |
| 14 | ścieżki rozbieżne (CANONICAL_TWIN w docs/architecture, v126_artifacts w application, E-40, zdolnosci_wkladu…) | O-72; ADR-021 korekta; MAPA/SYNTEZA pomiary E-40 = 0 |

## 5. Edycje z listy 26 → plik i miejsce (przed / po)

| # | Edycja | Plik:linia | Przed → Po |
|---|---|---|---|
| 1 | ADR-012…028 linia 3 | `docs/adr/ADR-012…028-*.md:3` (ADR-012 dodatkowo nowa sekcja `:33` i korekta `:28-31`) | „PROPOSED (program Digital Twin 2026-09…)” → ACCEPTED (012, 014, 015, 016, 017, 021, 022, 024, 025, 027 z korektą), SUPERSEDED (013), PROPOSED z adnotacją W-x (018, 019, 020, 026, 028), PROPOSED zależny od B-02 (023); grep „PROPOSED (program Digital Twin” w docs/adr = 0 |
| 2 | ADR-027 | `docs/adr/ADR-027-*.md:3`, §Decyzja (`:11-20`) | pola bez `sk_max/min`, `agreed_power`, `agreed_cos_phi`; S_k w ConnectionConditions; wielopunktowość G-15(b); ADR-003/006 zastąpione |
| 3 | ADR-021 | `docs/adr/ADR-021-*.md:3`, §Konsekwencje (`:15`) + nowa sekcja `:17-23` | K3 skreślona; K2 reguła strukturalna; K1 migracja konsumentów BFS; „BFS-wyspa kasowana” doprecyzowane |
| 4 | ADR-002/003/005/006/008 | `docs/adr/ADR-002…:4`, `ADR-003…:4`, `ADR-005-sld…:5`, `ADR-006…:4`, `ADR-008…:4` | Accepted → EXTENDED by K-05 / SUPERSEDED by ADR-027 / by ADR-024 / by ADR-016/017 |
| 5 | ADR-029 MCP | `docs/adr/ADR-029-mcp-lokalna-plaszczyzna-sterowania.md` (nowy) | odwołanie do decyzji 2026-08-05 (`PLAN_PRZEBUDOWY_10X_2026-07.md` pkt 2) |
| 6 | docs/INDEX.md | `docs/INDEX.md:8-21` (hierarchia 1…10, 1b, docs/twin), `:55-60` (lista per ADR) | 6 pozycji → jedna lista z CLAUDE.md; „ADR-012…ADR-028 (PROPOSED)” → lista per ADR ze statusem |
| 7 | CLAUDE.md | `CLAUDE.md:301-319` (hierarchia: wiersz 1b `:308`, wiersz docs/twin `:318`), `:395-401` (Core Rule 4), `:402-406` (Core Rule 5), `:174`, `:784`, `:874` (walidator) — osobny commit `3113bc0f` | lista testów SLD Determinism BEZ zmian (zmienia się atomowo z `sld-determinism.yml` w kartach kodowych SESJA/ADR-024 K3 — O-71) |
| 8 | ARCHITECTURE.md | `:149-156` (walidacja), `:416` (przepływ), `:444` (drzewo), nowa `§5.3` (`:195`) | NetworkValidator → walidator ENM + CalculationReadiness; sekcja Case/nastawy (ADR-022) |
| 9 | REJESTR_KONFLIKTOW | nowe `:447-457` (V12K-339…349); przepisane `:271` (V12K-142), `:277` (V12K-136), `:278` (V12K-135), `:351` (V12K-059), `:446` (W6-3C-KONFLIKT → ROZSTRZYGNIĘTE); dopiski `:414` (C-12), `:367` (S9-6) | wiersz pytania OLTC „DO WLASCICIELA (2)” — 0 trafień → nowy V12K-349; „wersja koperty ADR-017 (jeśli v3)” — warunkowy, powstaje w karcie W5-C tylko przy kopercie v3 (nie założony, żeby nie tworzyć wpisu bez zdarzenia) |
| 10 | PLAN_AB | `:152` (O-57 pkt 9 korekta), `:155-170` (O-60…O-75), §12.1 wiersze LFSM-O/13.1a/RoCoF/LVRT/PTPiREE/T01–T20/WiPWC/Q/odbudowa P/Bank Nastaw/magazyny/jakość/progi klas (13 wierszy tabeli ręcznej), akapit pod tabelą generowaną (O-60), §7 wiersz | tabela generowana NIE edytowana ręcznie (regeneracja `bramka_danych_profilu.py --zapisz` należy do OD-21-KOD); nazwa AB-H1 w :800 była już poprawna (pomiar: „AB-H2” w §12.1 = 0) |
| 11 | MAPA | `:120, :166, :170, :205, :206, :252, :279, :444, :527, :546, :561, :567, :596, :708, :709, :710, :714, :717, :750, :754, :755, :758` | literał `" + W3H_OD15_G + "` skasowany; A2-01/07/08 i E-40 — 0 trafień (pomiar w O-72) |
| 12 | SYNTEZA | `:176, :196, :501, :566, :567, :590` | OD-16/OD-17/OD-21/OD-22/W6-5/61850 |
| 13 | KARTA_W5 | `:115-116` | wartości „≤ 50 V” i numery punktów usunięte; jedno wejście; kod `fault_loop.tt_it_not_supported` znika z solverem |
| 14 | FINAL_DYNAMICS, W6_A | FINAL `§5` (akapit `:318-324`), `:378` (OD-36), `§7.1` (wiersz OD-5c `:386`); W6_A `:544`, `:640-645` | „jawna luka” → wyprowadzenie z OD-36 |
| 15 | docs/architecture | CANONICAL_TWIN `:89`, `:299`; DECISION_FREEZE_REGISTER `:11` (DT-1 EVIDENCE-GATED); CAPABILITY_ARCHITECTURE_MATRIX `:15`; CONVERGENCE_EVIDENCE `:29` + nowa `I.3` (`:892`); PRODUCT_CAPABILITY_CONSTITUTION `:74` | — |
| 16 | docs/audit | INWENTARZ_W5 `:181`; AUDYT_PROMPT `:135`; FAZA_0 (`docs/ui/FAZA_0_AUDYT_REPOZYTORIUM.md`) — 0 trafień „BoundaryNode”/„Point of Common Coupling” (pomiar, bez edycji) | — |
| 17 | docs/nn | G `:21`, C `:30`, A `:85` | → W5-E-TTIT, R_A |
| 18 | docs/twin | OWNER_REVIEW_PACKAGE `:109, :110, :111, :112, :116, :117, :118, :119, :120, :121, :123, :124, :125, :126, :174` + adnotacja O-59 po werdykcie (`:187`) + §6; DIGITAL_TWIN_AUDIT `:135`; ENGINEERING_FRICTION_REGISTER `:68` (EF-046); SLD_SYMBOL_SYSTEM_PLAN `:66` | K-08 rozstrzygnięty D-34 |
| 19 | docs/ui, docs/sld | SLD_SCADA_CAD_CONTRACT `:37`, `:599`; SLD_SHORT_CIRCUIT_BUS_CENTRIC `:47`; SLD_INDUSTRIAL_SCADA_CAD_TARGET `§7.1` (`:181-185`), `:191` (klasa, nie instancja — dodatkowe trafienie spoza listy); SLD_UI_CONTRACT i SHORT_CIRCUIT_PANELS_AND_PRINTING — 0 trafień (pomiar) | grep obu wzorców w docs (poza archiwum i REJESTR cytującym dawne brzmienie) = 0 |
| 20 | docs/domain, docs/protection | nowy `docs/domain/KONTRAKT_SCENARIUSZY_ZWARCIOWYCH_TRYB_IMPEDANCE.md` (pomiar: 0 istniejących dokumentów trybu IMPEDANCE); IEC_IDMT_CANON `:208` | jedna nazwa „LTI” |
| 21 | docs/uiux | INWENTARZ_FUNKCJI `:253` (eksporty SLD: svg, pdf, dxf, cgmes); ENGINEERING_FRICTION_REGISTER leży w `docs/twin` (nie `docs/uiux`) — `:68` | — |
| 22 | KARTA_W3, KARTY_OTWARTE | KARTA_W3 `:100-103`, `:146`, `:150-153`, `:437-440`; KARTY_OTWARTE `:562-565` (OD-18), `:1405` (OD-13) | — |
| 23 | `procedura_ptpiree.yaml:55` | NIE edytowany — plik na liście rdzeni B-01 (`scripts/rdzenie_b01.py:36-38`); edycja należy do karty OD-21-KOD (zgoda O-61), zapisana jako obowiązek w O-60, ADR-027 i §12.1 | poza zakresem tej karty (kod produktu) |
| 24 | STAN_REPO.md (poza §J) | `:117-125` (nowy akapit w §7, po zasadzie wznowienia) | jedno zdanie hierarchii K-20 + wpis O-60…O-75; sekcja J nie czytana i nie edytowana |
| 25 | scripts | `docs_guard.py` (K-19 `:373`, K-20 `:462`, wpięcie w `main`); `pcc_zero_guard.py` (`scan_physics_model` `:94`, skan literału z parametrem katalogu); `solver_boundary_guard.py` (sankcja V12K-341 w istniejącym wpisie `protection_engine_v1.py`); `resultset_v1_schema_guard.py` (komentarz V12K-341 nad `PROTECTED_FILES`); `router_mount_guard.py` (komentarz K-16); samotesty w `backend/tests/ci/` | `rdzenie_b01.py` i `.github/workflows/sld-determinism.yml` NIE zmieniane — należą do kart kodowych (K1/OD-25 przy scaleniu; SESJA/ADR-024 K3 atomowo z CLAUDE.md) |
| 26 | `RegulacjaOze.tsx:26-31`, `AppRoot.tsx:321-326` | NIE edytowane — kod produktu; komentarze przepisują karty OD-15(g)+KOMENTARZ (O-67) i C-12 (V12K-414 dopisek) | poza zakresem tej karty |

## 6. Dane właściciela P-A…P-M
`mv-design-pro/docs/plan/DANE_WLASCICIELA_O59_2026-09.md` — 13 pakietów, dla każdego: dokument, wydanie, punkt, format dostawy, odblokowywane pozycje, stan do dostawy; reguły utrzymania (STOP przy rozbieżności z zapisaną decyzją).

## 7. Co zostawione poza tą kartą (jawnie, z powodem)
- Kod produktu: `procedura_ptpiree.yaml:55` (rdzeń B-01 → OD-21-KOD), `RegulacjaOze.tsx`, `AppRoot.tsx` (karty OD-15(g)+KOMENTARZ, C-12), 3 pliki frontu z „BoundaryNode” (karta kodowa K-19), `rdzenie_b01.py` (przy scaleniu K1/OD-25), `sld-determinism.yml` + lista testów w CLAUDE.md (atomowo w SESJA/ADR-024 K3).
- Wpis „wersja koperty ADR-017 (jeśli v3)” — warunkowy; zakładany w karcie W5-C wyłącznie przy kopercie v3.
- Czerwień bazy partii 6 (10 testów w 3 plikach, `tsconfig_gate_guard`) — naprawiana równolegle; zmierzona w §1.
- Werdykty B-02 i scalenie do `main` — poza delegacją (P-M).

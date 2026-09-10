# KARTA W3 — Konwergencja duplikatów fizyki (2026-09-09)

**Status:** KANONICZNY, ŻYWY (karta wycinka W3 mapy domknięcia — `MAPA_DOMKNIECIA_PRODUKTU_2026-09.md` §8 W3,
klasa K-B §4; rozszerzenia z aneksu §3a: D2/D4/D7/D8, E5, G3, J4, J5, J8/K8). Podlega misji
(`MISJA_DOMKNIECIA_PRODUKTU_2026-09.md`) i bramkom B-01/B-02. Baza: gałąź `claude/mv-design-pro-twin-audit-u4lhy0`
po W1/W2 (`39794b58`) i K2 (`8e771a5f`, `ead12f70`; W3-A/W3-D/W3-F/W3-C1/W3-C2/W3-E wystartowały z `a16f8d2b`, przed
scaleniem K2 — odbiór każdej z nich uzgadnia zapadki guardów z pomiaru na drzewie gałęzi).

**Źródło decyzji:** inwentarz klasy zmierzony na drzewie 2026-09-09 (badanie tylko-odczyt, 13 rodzin A–M,
ścieżki:linie i liczby z grep) — streszczony w §1. Reguła KLASA, NIE INSTANCJA: każda podkarta naprawia całą
rodzinę, inwentarz idzie do meldunku, testy jako iloczyn cech, predykaty parami.

---

## §0 Rozstrzygnięcia architekta (wiążące)

| # | Rodzina (mapa) | Tor kanoniczny (źródło prawdy) | Decyzja | B-01? |
|---|---|---|---|---|
| 1 | **IDMT IEC 60255 ×5** (4 #1) | `network_model/solvers/protection_iec60255.py::compute_idmt_generic` / `compute_curve_trip_time` (FROZEN; NI/VI/EI/RI, ε = 1e-12) — adaptery `protection/curves/{iec,ieee}_curves.py` już delegują (P0.7, `f4a822bb`) | Pozostałe 3 żywe pętle **przekierować na jądro** (adapter, zero własnej pętli): `application/protection_analysis/engine.py::compute_iec_inverse_time` (tor kanoniczny `protection_sn`!), `enm/domain_operations_v2.py::_compute_tcc_point` (operacja `validate_selectivity`; alias `LTI` = `RI` jądra, udokumentować), `application/analyses/protection/overcurrent/calculator.py::_iec_ni_time` (ginie razem z V12K-189 w podkarcie C). Martwe: `_compute_tcc_curve` (0 wywołań) i zaślepka `calculate_tcc_curve` (`tcc.legacy_write_disabled`) — kasacja. **Drugi silnik** `domain/protection_engine_v1.py` + `application/protection_current_resolver.py` + `application/result_mapping/protection_to_resultset_v1.py` (0 importerów produkcyjnych; `eligibility.py:263` i `execution_runs.py:119` odwołują się tylko w komentarzach) — **kasacja** z 75 testami, wpis do bramki wskrzeszenia. Test parytetu per adapter = podstawienie ręczne do wzoru normy (jak `test_protection_curves_nd4_merge.py`), nie porównanie dwóch implementacji ze sobą. Nowa rodzina guarda `E_idmt_shape` (patrz 13). | nie (wszystko poza `solvers/**`) |
| 2 | **Metodyka nastaw ×3** (4 #2) | **Hoppel / IRiESD** — `application/protection_settings/engine.py` + `batch_run.py` + pakiet dowodowy `pakiet_nastaw.py` (`GET /analysis-runs/{id}/pakiet-dowodowy-nastaw[/dostepnosc]`): jedyna z cytatami normy, trzema wariantami SC/PF i pakietem dowodowym | **V12K-189** (`application/analyses/protection/overcurrent/**`, `api/protection_overcurrent_settings.py`, `run_registry`) — strona zapisu ma 0 wywołań produkcyjnych, ekran `SekcjaNastaw` zawsze dostaje 404 → **kasacja** + przepięcie `ui2/wyniki/koordynacja/SekcjaNastaw.tsx`/`nastawyApi.ts` na pakiet Hoppela (dostępność → wybór odcinka i szyny kolejnej strefy → pakiet). **FIX-12D** `line_overcurrent_setting/**` (1880 linii, 97 testów; jedyny konsument = generator wzorca `pattern_line_i_doubleprime_thermal_spz.py`) — **kasacja**; wzorzec liczy nastawy silnikiem Hoppela z nazwaną proweniencją (złote wartości wzorca przeliczone z uzasadnieniem: zmiana metodyki, nie fabrykacja); tabela SPZ (`spz_lookup.py`) zostaje WYŁĄCZNIE jeśli wzorzec ją czyta jako dane — wtedy przeniesiona obok konsumenta. | nie |
| 3 | **ALF ×2** (4 #3) | `network_model/solvers/equipment_checks/ct_burden_saturation.py` (FROZEN; `ALF_eff = ALF·(Sn+Sw)/(S2obl+Sw)`, wariant uproszczony nazwany w wyniku) | Kryterium 4 w `domain/dobor_przekladnika.py` **deleguje** do jądra: S2obl z łańcucha pomiarowego pola (gdy zapisany), w przeciwnym razie S2obl = Sn z etykietą wariantu i kodem ostrzeżenia `ct.secondary_burden_unknown` (wynik liczbowo identyczny z dzisiejszym prostym sprawdzeniem, ale nazwany); `DoborPrzekladnikowSekcja.tsx` pokazuje wariant. Iloczyn cech: obciążenie znane/nieznane × Rct znane/nieznane × ALF spełnia/nie. | nie |
| 4 | **Hosting capacity ×2** (5 #8, 9 #10) | `application/analyses/hosting_capacity.py` (pełny rozpływ przez `bieg_wariantu`, wyrocznia PF dziedziczona) | Duplikat `v126_academic.py::_hosting_capacity` (lokalna impedancja Thevenina, Monte Carlo per szyna, bez sprzężenia sieci) **schodzi z powierzchni**: `POST /cases/{id}/runs/v126/hosting_capacity` → 410 z odesłaniem do `GET /api/oze-analysis/hosting-capacity`, kafel w `ui2/wyniki/akademickie` usunięty (`katalog.ts` 14 → 12 rodzajów), GET historycznych biegów zostaje (odtwarzalność). Enum `V126AnalysisType` bez zmian (solver FROZEN dyspozycjonuje po nim). Formuła w solverze = OD-15(d). | prezentacja: nie; formuła: tak (OD-15(d)) |
| 5 | **Ranking N-1 / niezawodność ×2** (9 #2) | `application/analyses/kontyngencje_n1.py` (pełny re-solve) dla rankingu; **SAIDI/SAIFI/CAIDI/MAIFI mają jedyną implementację w `_reliability`** (0 trafień poza `v126_academic.py`) | Odpowiedź API `reliability_contingency` **bez sekcji rankingu N-1 i N-2** (liczonych z błędnego `_branch_current_a`) z nazwaną notą „ranking N-1 = ekran Kontyngencje"; wskaźniki niezawodności zostają widoczne. Kafel FE pokazuje tylko wskaźniki. | prezentacja: nie |
| 6 | **Straty TR / OLTC ×2** (9 #7, G3) | `equipment_checks/transformer_losses.py` (β rzeczywisty) + `power_flow_oltc_studies.py::optimize_tap_positions` | `opf_loss_lcc` (β = 0,45 zaszyte, `oltc_tap_position: 0`, prąd gałęzi z jednej szyny) **schodzi z powierzchni** jak w 4 (410 + odesłanie do `POST /api/solver/transformer-losses` i ekranu OLTC); LCC (Σ annual_kwh·cena/(1+r)^t) nie ma kanonu — ekonomia = OD-16, nie odtwarzać. | prezentacja: nie; formuła: OD-15(d) |
| 7 | **`_branch_current_a`** (v126:1060-1067) | brak kanonu w V12.6; kanon = rozpływ | Po 5 i 6 traci konsumentów widocznych dla użytkownika; sam kod pod B-01 → OD-15(d). Żadnego testu „dokumentującego" błąd (zakaz xfail/skip) — dowód = mapa + evidence. | tak |
| 8 | **`source_compliance`** (5 #13) | `solvers/ncrfg_ptpiree/engine.py` (test zgodności typu) + `power_flow_inverter.py` (fizyka) | **Kasacja** `application/compliance/source_compliance.py`, rodzaju `source_compliance` w `canonical_analysis`/`execution_runs`, wpisów FE (`macierzAnaliz.ts`, `screenCanonRegistry.ts`), testów (9 + eksport/API); trasa przekrojowa `GET /api/ncrfg-tests/cases/{case_id}/compliance` dostaje konsumenta: sekcja „Zgodność przekrojowa przypadku" w `ui2/oze/macierz` (aneks J4). | nie |
| 9 | **Stabilność: fasada vs `stability_rms`** (6 #2) | `stability_rms` (FROZEN, 0 konsumentów) | Po W2 pkt 1 fasada jest uczciwa (scenariusz jawny albo odmowa). Podłączenie prawdziwego RMS = **W6** (formularz scenariusza RMS, katalog `der_dynamic`), nie W3. Bez zmian tutaj. | — |
| 10 | **Pst/flicker w `application/`** (6 #1) | jedna implementacja, zła warstwa (`application/analyses/migotanie.py`, cytaty IEC/TR 61000-3-7) | Przeniesienie do nowego solvera (`network_model/solvers/flicker_iec61000_3_7.py`, nowy plik, nie edycja FROZEN) bez zmiany liczb = **W6** (razem z „harmoniczne pod Jakość"). Bez zmian w W3. | — |
| 11 | **`line_overcurrent_setting`** (4 #2) | — | = decyzja 2 (kasacja, wzorzec na Hoppelu). | nie |
| 12 | **Rodzaje V12.6 (14)** (10 #20) | tylko `hosting_capacity`, `opf_loss_lcc` i ranking w `reliability_contingency` duplikują kanon; 10 rodzajów = jedyna implementacja (część do naprawy pod OD-15, nie do kasacji) | Kasacja/ukrycie ograniczone do 4–6; tabela BIL zapisana dwa razy (`api/v126_academic.py:353-356` vs solver) → API czyta stałą solvera, jeśli jest wyeksportowana; jeśli nie — test parytetu API↔solver dla Um ∈ {12; 17,5; 24; 36} kV (bez edycji solvera). | nie |
| 13 | **Guard fizyki** (`backend_no_physics_guard.py`) | 5 rodzin AST (√3, κ, I²t, R(θ), U²/S); pilnuje WARSTWY, nie poprawności | Nowe rodziny: `E_idmt_shape` (mianownik `Pow(*, *) − 1` jako operand dzielenia, wykładnik dowolny — także `math.pow`), `J_skalowanie_jednostek` (literały 1000/1e3/0,001 przy nazwach z sufiksem jednostki). `ZASTANE` = 0 po konsolidacji; `ALLOWLIST` pusta. Poprawność formuł w strefie dozwolonej pilnują testy parytetu z podstawieniem do normy, nie ten guard. | nie |
| 14 | **Skalowanie jednostek** (aneks E5) | `network_model/pochodne/` (liściowy pakiet algebry pochodnych) | Nowy `pochodne/jednostki.py` (kW↔MW, A↔kA, V↔kV, kVA↔MVA, m↔km — funkcje z sufiksami jednostek); migracja 252 miejsc `*1000`/`/1000` poza `solvers/**` i `pochodne/**` (pomiar 2026-09-09), złote hashe PF/SC/parytety bit w bit bez zmian; miejsce niebędące skalowaniem jednostki zostaje z komentarzem i trafia do meldunku. | nie |
| 15 | **Predykat „element wymaga katalogu" ×2** (aneks J8/K8) | `network_model/catalog/governance.py` | Jedna tabela `wymagalnosc_katalogu(rodzaj) → BLOCKER / WARNING / NIE` czytana przez walidator E009 (linie, kable, transformatory, źródła = BLOCKER), przez bramkę ZIP i przez kody generatora (`inverter.k_sc_*` = WARNING/BLOCKER wg istniejącej semantyki — bez zmiany poziomów). Iloczyn: rodzaj × ma `catalog_ref` × poziom. | nie |
| 16 | **Metoda rozpływu NR/GS/FD** (aneks D2) | `enm/assembler.py:838-847` (`solver_method`) | Opcja biegu w `ui2/spaces/obliczenia` (domyślnie NR, wybór GS/FD jawny) + porównanie NR↔FD w ekranie „Jakość" (różnica napięć per szyna, iteracje); kasacja sieroty `ui/study-cases/CaseConfigPage.tsx`. | nie |
| 17 | **Pasma zdrowego rozsądku rozpływu** (aneks D4) | `analysis/sanity_bounds/` (dziś tylko zwarcia) | Pasma dla rozpływu: napięcia szyn (Un ± 10 %), obciążenia gałęzi (≤ In katalogu), straty (≤ 10 % mocy czynnej sumarycznej) — progi jako dane z cytatem (PN-EN 50160 dla napięć) albo jawne parametry; `GET /api/quality/sanity-bounds` rozszerzony addytywnie; ekran „Jakość". | nie |
| 18 | **Pasmo MIN/MAX zwarć** (aneks D7) | `enm/zrodlo_zwarcie.py`, scenariusze c_min/c_max | Ekran zwarć pokazuje oba scenariusze z jednego przypadku obok siebie (Ik″ max/min per szyna, ip, Ith) z proweniencją każdego biegu; bez nowej fizyki (dwa biegi kanoniczne). | nie |
| 19 | **Q wstrzyknięte vs prawo Q(U)** (aneks J5) | `power_flow_inverter.py` (FROZEN) + ślad WHITE BOX biegu | Badanie śladu: jeśli ślad niesie tryb i osiągnięcie limitu Q per generator → wykres w `ui2/wyniki/rozplyw` z tych danych; jeśli nie → wpis OD-15 (pole addytywne śladu), bez fabrykacji. **Zamknięte 2026-09-10 (W3-H, agent): ślad NIE niesie (dowód biegiem na NR/GS/FD i przez tor kanoniczny) → wariant B: OD-15(g), stan zerowy w `RegulacjaOze.tsx`.** | badanie: nie; ewentualne pole śladu: tak |

---

## §1 Inwentarz klasy (zmierzony 2026-09-09; szczegóły w meldunkach podkart)

| Rodzina | Implementacje | Tor kanoniczny | Parytet między nimi | Konsument duplikatu |
|---|---|---|---|---|
| A IDMT | 5: `protection_iec60255.py` (kanon) · `protection/curves/iec_curves.py` (deleguje) · `application/protection_analysis/engine.py:191-227` · `application/analyses/protection/overcurrent/calculator.py:121-127` · `enm/domain_operations_v2.py:103-116` · `domain/protection_engine_v1.py:483-559` (martwy) | jest | tylko kanon↔adaptery (`test_protection_curves_nd4_merge.py`) | `protection_sn` (żywy), `validate_selectivity` (API bez FE), V12K-189 (martwy zapis), engine_v1 (0) |
| B Nastawy | 3: Hoppel (`protection_settings/`) · V12K-189 (`overcurrent/`) · FIX-12D (`line_overcurrent_setting/`, 1880 linii) | Hoppel (decyzja) | 0 | pakiet dowodowy (żywy) · `SekcjaNastaw` → 404 · generator wzorca |
| C ALF | 2: `dobor_przekladnika.py:238-261` · `ct_burden_saturation.py` (kanon) | jest | 0 | `DoborPrzekladnikowSekcja.tsx` · `SekcjaBilansuCtVt.tsx` |
| D Hosting | 2: `hosting_capacity.py` (kanon, pełny PF) · `v126:_hosting_capacity` (MC lokalne) | jest | 0 | `ui2/oze/zdolnosc` · `ui2/wyniki/akademickie` |
| E N-1 | 2: `kontyngencje_n1.py` (kanon) · `v126:_reliability` (ranking z błędnego prądu + SAIDI/SAIFI jedyne) | jest (ranking) / brak (SAIDI) | 0 | `ui2/wyniki/kontyngencje` · `akademickie` |
| F Straty/OLTC | 3: `transformer_losses.py` · `power_flow_oltc_studies.py` (kanony) · `v126:_opf_loss_lcc` (β = 0,45, zaczep 0) | jest | 0 | `ui2/kryteria`, `ui2/wyniki/oltc` · `akademickie` |
| G `_branch_current_a` | 1 (2 czytelników: `_reliability`, `_opf_loss_lcc`) | rozpływ | 0 | jw. |
| H `source_compliance` | 3 tory: `power_flow_inverter.py` · `ncrfg_ptpiree/engine.py` · `application/compliance/source_compliance.py` (kryterium „==" vs „≥" niespójne) | jest (2 kanony o różnej roli) | 0 | 0 ekranów ui2 |
| I Stabilność | fasada progowa (uczciwa po W2) · `stability_rms` (0 konsumentów) | — | — | W6 |
| J Pst | 1 (zła warstwa) | — | — | W6 |
| K `line_overcurrent_setting` | = B | — | — | generator wzorca |
| L V12.6 | 14 rodzajów: 2 duplikaty, 1 częściowy, 10 jedynych (4 z fasadą/literałami pod OD-15), 1 meta | — | — | `ui2/wyniki/akademickie` |
| M Guard | 5 rodzin; brak IDMT i jednostek | — | — | CI `p0-extended-guards.yml` |

---

## §2 Podkarty (wykonawcy: agenci; odbiór: Fable z pełnym łańcuchem przedpushowym)

| Podkarta | Zakres (z §0) | Pliki-klucz | Zależy od | Fala |
|---|---|---|---|---|
| **W3-A** IDMT + drugi silnik + guard | §0.1, §0.13 (`E_idmt_shape`) — bez `overcurrent/calculator.py` (ginie w W3-C) | `application/protection_analysis/engine.py`, `enm/domain_operations_v2.py`, `domain/protection_engine_v1.py`, `application/protection_current_resolver.py`, `application/result_mapping/protection_to_resultset_v1.py`, `scripts/backend_no_physics_guard.py` (+ self-test), `scripts/legacy_public_path_guard.py` | — | 1 |
| **W3-D** `source_compliance` → NC RfG | §0.8 | `application/compliance/`, `enm/canonical_analysis.py`, `api/execution_runs.py`, `ui2/oze/macierz/**`, `ui/network-build/station-der/macierzAnaliz.ts`, `ui/workspace/screenCanonRegistry.ts`, `docs/v12xx/MACIERZ_KOMPATYBILNOSCI_API.md` | — | 1 |
| **W3-F** jednostki | §0.14, §0.13 (`J_skalowanie_jednostek`) | `network_model/pochodne/jednostki.py` (nowy), 252 miejsc poza `solvers/**`/`pochodne/**`, `scripts/backend_no_physics_guard.py` | — | 1 (po K2) |
| **W3-C** nastawy → Hoppel | §0.2, §0.11 | `application/analyses/protection/overcurrent/**` (kasacja), `api/protection_overcurrent_settings.py` (kasacja), `application/analyses/protection/line_overcurrent_setting/**` (kasacja), `application/reference_patterns/pattern_line_i_doubleprime_thermal_spz.py`, `ui2/wyniki/koordynacja/{SekcjaNastaw.tsx,nastawyApi.ts}`, `application/proof_engine/pakiet_nastaw.py` | W3-A | 2 |
| **W3-B** ALF | §0.3 | `domain/dobor_przekladnika.py`, `api/generators.py:978`, `ui/network-build/station-der/DoborPrzekladnikowSekcja.tsx` | — | 2 |
| **W3-I** predykat katalogu | §0.15 | `network_model/catalog/governance.py`, `enm/validator.py:697-760`, `application/project_archive/service.py`, `domain/canonical_operations.py` | — | 2 |
| **W3-E** V12.6 z powierzchni | §0.4–§0.6, §0.12 | `api/v126_academic.py`, `ui2/wyniki/akademickie/{katalog,strings,prezentacja,api}.ts`, `docs/v12xx/MACIERZ_KOMPATYBILNOSCI_API.md`, `scripts/v126_contract_text_guard.py` | — | 2 |
| **W3-G1/G2/G3** metoda rozpływu · pasma rozpływu · pasmo MIN/MAX | §0.16–§0.18 | `ui2/spaces/obliczenia/**`, `ui/study-cases/CaseConfigPage.tsx` (kasacja), `analysis/sanity_bounds/**`, `api/quality_analysis_runs.py`, `ui2/wyniki/{jakosc,zwarcia}/**` | W3-E (spójny ekran Jakość) | 3 |
| **W3-H** Q z biegu | §0.19 (badanie + wdrożenie albo wpis OD-15) | `network_model/solvers/power_flow_inverter.py` (odczyt), ślad WHITE BOX, `ui2/wyniki/rozplyw/**` | — | 3 |

Każda podkarta: inwentarz klasy w meldunku · testy jako iloczyn cech · parytet z podstawieniem do normy (nie
implementacja↔implementacja) · złote hashe rejestru `tests/golden` bez zmian (zmiana = STOP) · **`guardy_z_ci.py`
KOMPLET ZIELONY przed meldunkiem** (reguła z evidence §G po CI a4d94615) · generator słownika kodów gotowości po
każdym nowym kodzie · snapshot OpenAPI po każdej zmianie kontraktu · commit bez push, tytuł bez polskich znaków
diakrytycznych, trailer wykonawcy; odbiór Fable = cherry-pick + pełny łańcuch (pytest, mypy, pandapower,
guardy_z_ci, vitest, e2e) na drzewie gałęzi + push + CI 9/9.

---

## §3 Co NIE wchodzi do W3 (nazwane, nie odłożone)

- Formuły w `network_model/solvers/v126_academic.py` (β = 0,45, `oltc_tap_position: 0`, Monte Carlo lokalne,
  `_branch_current_a`, stałe TOV/udaru/detekcji doziemień) — B-01, pakiet **OD-15(d)(f)**; W3 zdejmuje je z
  powierzchni użytkownika i nazywa w odpowiedziach API.
- Podłączenie `stability_rms` i przeniesienie Pst do solvera — **W6** (dynamika i jakość energii).
- SAIDI/SAIFI/CAIDI/MAIFI — jedyna implementacja zostaje widoczna; kanoniczny model niezawodności (dane λ/MTTR z
  katalogu z proweniencją) = **W10** (dokumenty projektowe) razem z OD-16.

## §4 Definition of Done W3 (misja §28)

1. Dla rodzin A–H każda pętla fizyki poza `network_model/solvers/**` i `pochodne/**` = adapter na jądro albo
   skasowana; `backend_no_physics_guard.py --pomiar` = 0 trafień rodzin `E_idmt_shape` i `J_skalowanie_jednostek`
   poza `ZASTANE` (a `ZASTANE` puste dla tych rodzin — z JEDNYM trwałym wyjątkiem architektonicznym odkrytym w W3-F:
   `application/result_mapping/short_circuit_to_resultset_v1.py`, 2× `J_skalowanie_jednostek`, plik pod
   `PROTECTED_FILES` `resultset_v1_schema_guard.py` (B-01) — te dwa literały `/1000.0` nigdy nie trafią do `pochodne/`;
   zdjęcie wyjątku wyłącznie decyzją właściciela, jak OD-18).
2. Trzy metodyki nastaw → jedna (Hoppel) z pakietem dowodowym osiągalnym z ekranu koordynacji; wzorzec
   referencyjny liczony tą samą metodyką.
3. V12.6: `hosting_capacity`/`opf_loss_lcc` niedostępne jako nowe biegi (410 z odesłaniem), ranking N-1 poza
   odpowiedzią `reliability_contingency`; kafle FE 12; tabela BIL jedno źródło (albo test parytetu).
4. `source_compliance` skasowany; zgodność przekrojowa NC RfG ma konsumenta FE.
5. Jeden predykat wymagalności katalogu; metoda rozpływu jako jawna opcja; pasma rozpływu; pasmo MIN/MAX.
6. Mapa: wiersze 4 #1–#3, 5 #8/#13, 9 #2/#7/#10, 10 #20, aneks D2/D4/D7/E5/G3/J4/J5/J8/K8 zaktualizowane
   z dowodem; evidence §E/§F/§G; CI 9/9 na szczycie.

## §5 Meldunek wykonania (uzupełniany przy odbiorze podkart)

### Odbiór fali 1 (W3-A, W3-D, W3-E) — 2026-09-09/10

**Model:** trzy podkarty wykonane równolegle przez agentów w osobnych worktree z bazy `a16f8d2b`, commity BEZ push;
odbiór Fable = cherry-pick na gałąź (`4750d101` = 15 commitów + uzgodnienie), ponowny pomiar wszystkich zapadek na
drzewie scalonym, pełny łańcuch przedpushowy na dokładnie tym drzewie (evidence §F „W3 fala 1 — dowody").
Konflikty cherry-picka (KLASA: każda podkarta niezależnie przesuwała te same piny i te same guardy): tabela rejestru
sieci (regenerowana generatorem `generuj_rejestr_sieci.py`), piny `test_solver_input_substitute_guard.py` (z pomiaru na
drzewie scalonym: 3491 pól / 502 pliki / `application` 252 / `api` 63; zapadka 59/273, wykluczenia 13/31),
`legacy_public_path_guard.py` + self-test (scalenie „both" ucięło ogon funkcji na granicy hunka — brak
`return violations` w bramce K2 i ogon bramki W3-D; naprawione ręcznie, dowód: `py_compile` + self-testy +
uruchomienie guarda; lekcja w evidence §G), `backend_no_physics_guard.py` (`ZASTANE` = wyłącznie
`overcurrent/calculator.py: {E_idmt_shape: 1}`, self-test dopuszcza tylko ten wpis),
`test_advanced_solver_capability_registry.py` (23 pozycje po W3-D; `niedostepne == ["HOSTING_CAPACITY", "OPF_LOSS_LCC"]`
po W3-E). Bramki wskrzeszenia K2 / W3-D / W3-A liczą ŹRÓDŁO (`zrodlo_istnieje`), nie osierocone `__pycache__`.

### W3-A (2026-09-09) — IDMT + drugi silnik + guard — UCZCIWOŚĆ

**Wykonane (agent, worktree, 5 commitów na `a16f8d2b` → na gałęzi `cf07ad9b`, `ad0a965e`, `f4e7380e`, `35cba1b6`,
`cb9b281f`):** `application/protection_analysis/engine.py::compute_iec_inverse_time` (tor kanoniczny `protection_sn`)
i `enm/domain_operations_v2.py::_compute_tcc_point` (operacja `validate_selectivity`; alias `LTI` = `RI` jądra
udokumentowany) przełączone na adapter jądra `protection_iec60255` — zero własnej pętli IDMT, `denom_guard=1e-10`
ujednolicony. Bridge SC↔Protection v1 (`application/protection_current_resolver.py`, `domain/protection_current_source.py`;
0 konsumentów produkcyjnych, 35 testów wyłącznie o martwym moście) skasowany razem z martwą `_compute_tcc_curve`
i zaślepką `calculate_tcc_curve` (`tcc.legacy_write_disabled`; `V2_CANONICAL_OPS`/`ALL_V2_HANDLERS` zaktualizowane);
bramka wskrzeszenia `legacy_public_path_guard.py::check_w3a_second_engine_resurrection`; nowa rodzina `E_idmt_shape`
w `backend_no_physics_guard.py` (inline, `math.pow`, zmienna pośrednia do 2 poziomów; `ZASTANE` =
`overcurrent/calculator.py: 1`, ginie w W3-C1); parytet z podstawieniem do normy IEC 60255-151
(`tests/network_model/solvers/test_protection_idmt_w3a_merge.py`, 13 funkcji sparametryzowanych) + 11 self-testów
guarda + 8 self-testów bramki + 1 w rejestrze kanonicznym. Pętli IDMT poza solverami: 4 → 2 (obie nazwane).

**B-01 STOP (zatrzymanie dozwolone, nie odroczenie):** karta literalnie kazała skasować 4 pliki „drugiego silnika";
`guardy_z_ci.py` ujawnił, że `domain/protection_engine_v1.py` leży pod `solver_boundary_guard.py::WATCHED_PATHS`,
a `application/result_mapping/protection_to_resultset_v1.py` pod `resultset_v1_schema_guard.py::PROTECTED_FILES`
(docstring guarda: kasacja pliku chronionego = edycja zamrożonego rdzenia). Oba pliki + `tests/test_protection_engine_v1.py`
przywrócone bit w bit do `a16f8d2b`; artefakty zależne (komentarze, bramka, guard, pin) skorygowane. Decyzja
właściciela: mapa §7 **OD-18**. Ograniczenie guarda nazwane i przypięte testem: pętla w `protection_engine_v1.py:483-559`
ma warunkowe ponowne przypisanie floora (`if denominator <= 1e-12: …`) niewidoczne dla `E_idmt_shape`.

**Nazwane, nie ukryte:** (1) `application/trace_emitters/protection_emitter.py` (`TraceEmitterProtection`) — 0 importerów
produkcyjnych poza własnym `__init__`; pomiar klasy w odbiorze (2026-09-10): martwy jest CAŁY klaster ślad v2 —
`domain/trace_v2/**` (1084 linie), `application/trace_emitters/**` (1353), `application/trace_export/**` (224),
`frontend/src/ui/proof/trace-v2/types.ts`, 5 plików testów, guard CI `trace_determinism_guard.py` pilnujący
determinizmu modułu bez konsumenta, 4 dokumenty `docs/analysis/TRACE_*` bez linków przychodzących; jedyny ślad
WHITE BOX produktu = `white_box_trace` wyniku + `application/proof_engine/**`; decyzja architekta (koryguje D-12
pakietu właściciela „wpiąć"): USUNĄĆ — kasacja zlecona kartą TRACE-V2 (agent, fala 2; `karta_trace_v2_kasacja.md`);
(2) klaster ResultSet v1 SC (`sc_binding_meta.py`,
`short_circuit_to_resultset_v1.py`) ma żywego wołającego (`test_pr18_sc_integration.py`) — osobna karta;
(3) `tsconfig_gate_guard` czerwony w worktree agenta wyłącznie z braku `node_modules` (środowiskowe; zielony w odbiorze).
Weryfikacja agenta: celowane 3007 RC=0, `tests/golden` 226 passed / 1 xfailed, kolekcja `tests/` 13 143 bez błędów
importu, mypy 0, black/ruff 0, `guardy_z_ci` 88/89 (jw.) + 665 self-testów.

### W3-D (2026-09-09) — `source_compliance` → NC RfG — UCZCIWOŚĆ

**Wykonane (agent, worktree, 5 commitów na `a16f8d2b` → na gałęzi `2a734569`, bramka + piny scalone w `4750d101`,
`a42a42d3`, `218f751b`, `9ff95b6b`):** `application/compliance/source_compliance.py` (322) skasowany w całości wraz
z całym okablowaniem: rodzaj `ExecutionAnalysisType.SOURCE_COMPLIANCE`, 17 miejsc dyspozytora `enm/canonical_analysis.py`,
gałęzie `api/{execution_runs,analysis_case_context,canonical_run_views,analysis_run_exports,v125_contracts}.py`, trasa
`GET /api/analysis-runs/{run_id}/results/source-compliance` (OpenAPI bez trasy; `MACIERZ_KOMPATYBILNOSCI_API.md`:
`usuniety`), 2 pozycje rejestru zdolności solverów (`SOURCE_COMPLIANCE`, `SOURCE_FRT_LVRT_HVRT`; 25 → 23), 11 testów
wyłącznie tego modułu skasowanych, 3 pliki testów i `tests/golden/registry.py` (G06) przepisane do kanonu, ewidencja
`reference_networks_guard.py` przepięta. Frontend: typ/etykiety/wiersze (`ui/study-cases/types.ts`, `AnContextPanel.tsx`,
`screenCanonRegistry.ts` E-26, `contracts/verification.ts`), w `macierzAnaliz.ts` naprawa klasy `OSIE_ZAWSZE_NAWIGOWALNE`
(nawigacja „Przejdź do zgodności NC RfG" nie staje się martwym klikiem — biegi `SOURCE_COMPLIANCE` w produkcji nigdy nie
powstawały). Nowy konsument kanonu: `ui2/oze/macierz/SekcjaZgodnosciPrzekrojowej.tsx` + `zgodnoscPrzekrojowaModel.ts`
(klient `ui/ncrfg-tests/api.ts::fetchNcRfGCaseCompliance`, trasa `GET /api/ncrfg-tests/cases/{case_id}/compliance`,
backend bez zmian), renderowana zawsze obok macierzy per DER, jeden stan operatora; e2e `critical-oze-evidence.spec.ts`
+2 punkty kontrolne. Bramka wskrzeszenia `check_w3d_source_compliance_resurrection`.

**Weryfikacja agenta:** backend celowane 247 passed, `tests/golden` 226 passed / 1 xfailed, mypy 0, black/ruff 0,
`guardy_z_ci` KOMPLET 89/89 + lint 4/4 + 646 self-testów, type-check 0, eslint 0, vitest celowany 160 plików / 1961 testów;
e2e NIE uruchomione przez agenta (realny backend) — uruchomione w odbiorze (§F). **Nazwane:** rejestry historyczne
`docs/v12xx/REJESTR_*.md`, `MACIERZ_*`, `docs/audit/archive/**` wspominają `source_compliance` jako zapis pomiaru sprzed
kasacji (precedens `851e4a60`, data-manager) — nie edytowane; kanon / `docs/system` / `docs/domain` / inwentarz: 0 trafień.

### W3-E (2026-09-09) — V12.6 z powierzchni — UCZCIWOŚĆ

**Wykonane (agent, worktree; na gałęzi `ffaf6ad0`, `0c8874cc`, `8c1f160c`, `f55499c6`, `e0103101`; pin `5c4d9fdb` pusty
po uzgodnieniu — pominięty; `9e94641c` z 12 regenerowanymi PNG nie scalony — PNG nie wchodzą do repo):**
`POST /api/cases/{case_id}/runs/v126/{hosting_capacity,opf_loss_lcc}` → `410 v126.analysis_withdrawn` z zamiennikiem
(kanon `application/analyses/hosting_capacity.py`, `transformer_losses.py` + badania OLTC); GET historycznych biegów
(results/trace/proof/report) z addytywnym polem `wycofany`; bramki 422 `p0_kw`/Q generatora zdjęte razem z rodzajami
(dla `reliability_contingency` bramka Q zostaje); solver FROZEN i enum `V126AnalysisType` NIETKNIĘTE (zdolność
odtwarzalna z historii, uruchamialna wprost w testach solvera). `reliability_contingency` bez rankingu N-1/N-2
z `_branch_current_a`: jedna funkcja `application/v126_artifacts.py::bez_rankingu_n1` (wołana raz w
`enm/canonical_analysis.py::_execute_v126`) dla results/proof/report, w miejsce rankingu stan `ranking_n1` z odnośnikiem
do ekranu Kontyngencje; `sanity.status` przeliczony tym samym predykatem co solver
(`tests/api/test_v126_reliability_ranking_nieprezentowany.py`). Tabela BIL (IEC 60071-1) zduplikowana katalog API ↔
solver: test parytetu `tests/test_v126_bil_parytet.py` zamiast deklaracji. Rejestr zdolności: `availability: "withdrawn"`
(`implementation_status` zostaje `implemented`). FE: `nieprezentowane.ts` +2 rodzaje z powodem merytorycznym, lista
wyboru **12 → 10** (`Record<RodzajPrezentowany, …>` wymusza w czasie kompilacji), tabela rankingu skasowana
z `prezentacja.ts`, `PanelRankinguNieprezentowanego` payload-driven (dla każdego rodzaju niosącego `ranking_n1`),
E-47/E-48 `visibleInNavigation: false`; OpenAPI 310 ścieżek / 229 schematów (+65 linii czysto addytywnie);
`KANON_V12_6_PROFESORSKI.md`, `MACIERZ_KOMPATYBILNOSCI_API.md`, `INWENTARZ_FUNKCJI_2026-07.md`, `REJESTR_KONFLIKTOW.md`
uzupełnione.

**Korekta w obie strony:** proza tej karty (§0.4) zakładała „14 → 12" prezentowanych rodzajów; pomiar: karta
V126-WYGASZENIE (2026-08-07) zdjęła już 2 (`benchmark_validation`, `voltage_stability`), więc stan PRZED = 12, PO = **10**
— pin liczby z pomiaru w `wygaszenie.test.tsx`. **Nazwane, nie ukryte:** kod obu rodzajów i rankingu (`_branch_current_a`,
`oltc_tap_position: 0`, lokalne Monte Carlo) pozostaje w solverze FROZEN — kasacja = **OD-15(d)**; LCC/koszty = **OD-16**.
Weryfikacja agenta (wpis rejestru `e0103101`): celowane 119 backend + 246 frontend, wyrocznia pandapower 41, e2e realny
backend 12 — zielone; pełny łańcuch = odbiór (§F).

### Odbiór fali 2 (W3-F, W3-B, W3-I, W3-C1, W3-C2) — 2026-09-10

**Model:** pięć podkart z bazy `a16f8d2b`, 26 commitów cherry-pickowanych na `a1b40e9a` w osobnym worktree
`fable-w3f2` (łańcuch fali 1 biegł równolegle w `fable-cv3`), uzgodnienie `31ccf65a`, pełny łańcuch przedpushowy na
drzewie scalonym — evidence §F „W3 fala 2 — dowody". Konflikty (KLASA: piny i guardy przesuwane niezależnie przez
każdą kartę): `test_solver_input_substitute_guard.py` ×5 (piny zawsze z pomiaru na końcu, komentarze kart zachowane),
`backend_no_physics_guard.py` + self-test ×2 (rodzina E z W3-A i J z W3-F; wpisy K2 z bazy W3-F zdjęte),
`legacy_public_path_guard.py` + self-test ×2 (bramki W3-C1/W3-C2 dopisane z PEŁNYCH wersji plików, nie z hunków —
lekcja fali 1; `path.exists()` → `zrodlo_istnieje`), `api/generators.py`/`dobor_przekladnika.py` (W3-B vs migracje
jednostek W3-F), `cgmes_importer.py` (importy W3-I vs W3-F), fixtury nN 16/17 (W3-B vs W3-I → regeneracja skryptem),
wzorzec `pattern_line_i_doubleprime_thermal_spz.py` (wersja W3-C2 w całości + migracja 4 f-stringów na `a_na_ka`).

**Defekty integracji (każda karta zielona w izolacji, czerwone dopiero razem — naprawione u źródła):** (1) trzy helpery
testów doboru aparatu W3-C1 (`test_device_mapping_v0.py`, `test_vendor_adapter_v0.py`,
`test_vendor_elektrometal_etango_v0.py`) budowały `ProtectionSettingsResult` ręcznie bez pól wymaganych od W3-C2
(`local_generation`, `setting_window`) — 12 czerwonych → uzupełnione (E-L nieaktywne, okno spójne z `instantaneous`),
22/22; (2) nowy kod W3-B (`ik_ka * 1000.0`) i W3-C2 (4× `x/1000` w f-stringach) wobec rodziny J guarda W3-F — przepisane na
`ka_na_a`/`a_na_ka`; (3) `ZASTANE` guarda fizyki po W3-C1/W3-C2 miało 3 wpisy plików skasowanych (guard: `dlug-zmalal`)
→ zapadka = wyłącznie trwały wyjątek ResultSet v1 (1 plik / 2 wzorce); (4) self-test bramki W3-C2 wskrzeszał pakiet
PUSTYM katalogiem (działał tylko z `exists()`) → wskrzeszony pakiet ma plik `.py`. Pomiary na drzewie scalonym:
`solver_input_substitute_guard` 3471 pól / 484 pliki / zapadka 58 plików suma 260 / wykluczenia 13 suma 31; snapshot OpenAPI
301 ścieżek / 220 schematów (generator bez diffu, test 2/2); parytet scenariuszy nastaw 30/30 (złote hashe W3-C2 zgodne
także z W3-C1); fixtury nN 51/51; `readiness_dictionary` 118; `claude_md_struktura` ui=53/ui2=18.

### W3-F (2026-09-09) — jednostki — UCZCIWOŚĆ

**Wykonane (agent; `710fcdd9`, `5aefecb5`, `92e2bcff`, `6835dc34`, `b70a6482` → na gałęzi `7b2de6dc`…`7f7ce00f`; 88 plików,
+1583/−294):** `network_model/pochodne/jednostki.py` (20 funkcji: kW↔MW, kvar↔Mvar, kVA↔MVA, A↔kA, V↔kV, m↔km, ms↔s,
µS↔S) — 153 wzorce w 54 plikach przeniesione bit w bit (testy tożsamości); rodzina `J_skalowanie_jednostek` w
`backend_no_physics_guard.py` (pomiar PRZED 192 wzorce / 59 plików); B = 2πfC z jednej formuły
(`susceptancja_katalogowa_us_per_km`) i częstotliwością studium z danych (`header.defaults.frequency_hz` →
`api/solver_input.py` → `solver_input/builder.py`; `50.0` zostaje wyłącznie jako domyślna sygnatury publicznej dla
innego wołającego). Inwentarz 261 surowych linii: 142 zmigrowane, 97 NIE-J (dowiedzione zamkniętym skanem guarda:
komentarze/tolerancje/stałe kwantyzacji), 20 wykluczone regułą karty (`line_overcurrent_setting` — skasowane w W3-C2),
2 wykluczone zamrożonym kontraktem. Zmienione piny (kaskada z addytywnego pola proweniencji
`materialized_params["frequency_hz"]` i edycji mostu `enm/mapping.py`): hashe `test_kontyngencje_n1_service.py`
(gn01/gn03), `sldNetwork53.ts::source_hash`, `proweniencja_k7.json::most.sha256` ×5 (pin hashuje ŹRÓDŁO `mapping.py`,
nie fizykę) — każdy z diffem PRZED/PO tylko w polu niosącym hash.

**B-01 STOP w trakcie (naprawiony przez agenta):** F.1 zmigrował dwa `/1000.0` w `short_circuit_to_resultset_v1.py`
(PROTECTED_FILES `resultset_v1_schema_guard.py`) — cofnięte bajt w bajt, zapadka J podniesiona o 2 z uzasadnieniem jako
wyjątek TRWAŁY (DoD §4.1 doprecyzowany). **Nazwane:** `Branch.resolve_electrical_params`/`with_resolved_params` — 0
wołających produkcyjnych; `api/projects.py` bez trasy zapisu częstotliwości do ENM (osobne karty). Weryfikacja agenta:
golden 226/1 xfail, `tests/network_model` 4743, pozostałe katalogi 1451, proof_engine+infra 413, `tests/application` 1749,
pandapower 41, `guardy_z_ci` 89/89 + 715 self-testów, mypy 737/0, black/ruff 0, tsc/eslint 0, vitest 121/4 (1 flake
wydajnościowy pod obciążeniem, izolowana powtórka 8/8); `tests/api` i luźne testy root-level — przerwane restartem hosta,
domknięte pełnym łańcuchem odbioru (§F).

### W3-B (2026-09-09) — ALF ×2 → jądro + obwód wtórny CT/VT — UCZCIWOŚĆ

**Wykonane (agent; 6 commitów → na gałęzi `b2ea1ff9`…`b2db9af5`; 32 pliki, +1883/−124):** kryterium `ct.alf`
w `domain/dobor_przekladnika.py` deleguje w 100 % do jądra FROZEN `check_ct_burden_saturation` (ALF_eff z rzeczywistym
obciążeniem wtórnym, Rct, przewodem), dawny warunek konieczny → `ct.alf_katalogowy` (werdykt wyłącznie `informacja`);
addytywne `Kryterium.kody_gotowosci`/`slad`; `Measurement.obwod_wtorny` (`ObwodWtorny`: długość/przekrój przewodu,
obciążenia aparatów, moc styków) i `vt_uzwojenie` w ENM, `add_ct`/`add_vt` przyjmują obwód, nowa operacja
`set_measurement_secondary_circuit` (jedyna droga edycji na kolekcji `measurements`, w `CANONICAL_OPERATIONS` i
`V2_CANONICAL_OPS`); 5 kodów gotowości jądra już zarejestrowanych PRZED kartą (zero nowych); FE: kreator stacji,
`SekcjaBilansuCtVt.tsx`, `DoborPrzekladnikowSekcja.tsx` (chipy kodów + ślad), fixtury nN 7 plików. Parytet dowiedziony
end-to-end (`POST /api/solver/ct-burden-check` vs `sprawdz_dobor_ct` na realnym katalogu); iloczyn cech 6 testów z realnymi
kodami jądra (`ct.secondary_circuit_missing` itd. — kod „`ct.secondary_burden_unknown`" z §0.3 był przybliżeniem sprzed
inwentaryzacji jądra, skorygowane). Weryfikacja agenta: pełny pytest 12 890 passed / 1 skipped / 1 xfailed (3406 s),
pandapower 41, mypy 736/0, `guardy_z_ci` 88/89 (czerwony wyłącznie `tsconfig_gate` — środowiskowe, zielony w odbiorze) +
640, vitest celowany 122 + 74, tsc 0, e2e realny backend `kreator-stacji-max.spec.ts` 2/2. **Nazwane:** pole wytwórcy
`obciazenie_obwodu_va=None` z powodem w kodzie (CT/VT pola bez elementu `Measurement`).

### W3-I (2026-09-09) — jeden predykat wymagalności katalogu — UCZCIWOŚĆ

**Wykonane (agent; 5 commitów → na gałęzi `0839647d`…`f0514366`; 18 plików):** tabela `wymagalnosc_katalogu(rodzaj)`
(`catalog/governance.py:202-344`; poziomy per rodzaj × {tworzenie, walidacja, import}; `MANUAL_EQUIVALENT` = NIE) czytana
przez 8 miejsc (inwentarz: 6 z karty + `eligibility_service.py::_check_catalog_refs` znaleziony grepem DoD +
`readiness_bridge.py` znaleziony przez `readiness_consumption_guard`); rozjazdy naprawione: CGMES side-car bez wyjątku
MANUAL_EQUIVALENT, walidator milczący dla generatorów (nowy W010, WARNING, `inverter.k_sc_missing`), `v2_projection.py`
z błędnym 6-elementowym zbiorem DER zamiast 4-elementowego SC (`fw_dfig`/`fw_scig` dostawały fałszywe ostrzeżenie migracji),
pin substitute-guarda (+4 unikalne nazwy pól `WymagalnoscKatalogu`), fixtury nN 16/17 (W010 poprawnie zgłasza
`QF-03_zrodlo`, 11 → 12 ostrzeżeń, 2 z 18 scenariuszy). Korekta zlecenia: wiersz klasy defektu = **K-A** (mapa §4), nie K-C.
Weryfikacja agenta: pełny pytest 12 932 passed / 1 skipped / 1 xfailed (2790 s), pandapower 41, mypy 736/0, `guardy_z_ci`
89/89 + 640 (dwukrotnie, po wykryciu kolizji nazw plików wyników ze współbieżną kartą W3-B), tsc 0, vitest 143 (fixtury),
celowane 452, lv_domain 234. **Nazwane:** `add_generator_sn` bez bramy API/FE (`_ROZJAZD_TWORZENIE_ZNANY`, osobna karta);
`add_load_sn` bez katalogu = decyzja architekta; grupy „klasa CIM" i „wariant przyłączenia" = inne mechanizmy, do własnych kart.

### W3-C1 (2026-09-09) — nastawy nadprądowe → Hoppel (kasacja V12K-189) — UCZCIWOŚĆ

**Wykonane (agent; 8 commitów → na gałęzi `a245dbda`…`306aaa31`; 67 plików, +3466/−3619):** kasacja V12K-189 — 20 plików
(`overcurrent/**` 9, `api/protection_overcurrent_settings.py`, `run_registry.py`, `run_envelope.py`, 3× `envelope_adapter.py`,
5 martwych testów; konsumenci po kasacji 0 — grep; `AnalysisRunIndexEntry` zostaje, ma realnego konsumenta);
`oblicz_nastawy()` (`batch_run.py`) współdzielona przez ZIP i nowe trasy `GET /analysis-runs/{id}/nastawy[/dopasowanie]`;
`t_51_s_min/max` w serializerze katalogu; `SekcjaNastaw.tsx` przebudowany na kanon (zero fizyki w UI, `ui_no_physics_guard`);
predykat sparowany `dostepnosc_pakietu_nastaw`/`zbuduj_wejscie_nastaw` na jednym c_max; dobór aparatu jako czysta funkcja
(`catalog/pipeline.py::dopasuj_do_aparatu` na `catalog/mapper.py::wymaganie_z_nastaw`); OpenAPI +2 trasy. Kolejność commitów
inna niż proza karty (dobór aparatu przed trasami — zależność kodu, nazwana). KLASA-NIE-INSTANCJA: 7 miejsc tej samej klasy
„`overcurrent`/`analysis_runs_index` nadal żywe" w 6 plikach (w tym 2 w `project_archive/service.py`) naprawione.
Weryfikacja agenta: pełny pytest 12 839 passed / 0 failed / 1 skipped / 1 xfailed (3012 s), pandapower 41 (izolowany venv po
incydencie klonowania venv — naprawiony, zero wpływu na kod), mypy 721/0, `guardy_z_ci` 89/89 + 645, tsc 0, eslint 0,
vitest 59, e2e realny backend `nastawy-koordynacji-hoppel.spec.ts` 1/1, snapshot OpenAPI 2/2. **Nazwane:** wiersz „5
implementacji IDMT" w `docs/twin/MV_DESIGN_PRO_PROTECTION_ARCHITECTURE.md` nieaktualny o jeden po tej kasacji (mandat W3-A);
`REJESTR_KONFLIKTOW.md` — wpis dopisany przy odbiorze.

### W3-C2 (2026-09-09) — analizator FIX-12D → Hoppel, wzorzec referencyjny na kanonie — UCZCIWOŚĆ

**Wykonane (agent; `b038ff43` + `45845bc9` → na gałęzi `c7ee8276`, `e1903251`; 30 plików, +1571/−3549):** silnik Hoppla
rozszerzony ADDYTYWNIE (`generacja_lokalna` z jawnym progiem — brak = None/NIEDOSTĘPNY, silnik nie zgaduje; `okno_nastaw`
= dolna granica selektywność, górna min(cieplne, czułość), konflikt i rekomendacje po polsku), test tożsamości PRZED/PO na
6 wejściach 7/7; kasacja FIX-12D (`line_overcurrent_setting/{__init__,analyzer,models,spz_lookup}.py` 1880 linii + test 841
linii; `TestFix12Integration` 5 testów `domain.protection_device` przeniesione bez utraty pokrycia do
`test_overcurrent_coordination.py`); wzorzec RP-LINE-I2-THERMAL-SPZ na `ProtectionSettingsInput`/`ProtectionSettingsEngine`
(6 checków, werdykt ZGODNE/GRANICZNE/NIEZGODNE, ryzyko blokady ZSZ i blokada SPZ), 3 fixtury przepisane + nowy
`case_D_generacja_lokalna.json`, liczby `_expected_results` z faktycznych przebiegów (tabela 8 różnic FIX-12D→Hoppel:
selektywność bez CT, czułość z k_b, cieplne przy 0,05 s, okno nazwane, SPZ z analizy cyklu, E-L jawny próg, rekomendacje bez
kb/kc, I> osobno); `recommended_setting_secondary_a` → `_primary_a` (Hoppel bez przekładni CT), martwe `*_secondary_a`
skasowane; FE `ui/reference-patterns/` (rzeczywisty konsument — karta wskazywała `ui2/referencje/`, INNĄ zdolność) +14
testów; API `api/reference_patterns.py` etykiety; nowy `tests/api/test_reference_patterns_api.py` (HTTP + PDF/DOCX);
bramka wskrzeszenia + 3 self-testy; substitute-guard: martwy wpis analyzera zdjęty, 2 nowe podstawienia `or 0.0` naprawione
U ŹRÓDŁA (None-check + `ValueError`). Złote hashe `nastawy/*` (4/4 rodziny) przeliczone świadomie: hash całego
`ProtectionSettingsInput` zmienia się z definicji przy polu addytywnym, `parametry` identyczne PRZED/PO; na drzewie scalonym
z W3-C1 parytet 30/30 bez kolejnej regeneracji. Weryfikacja agenta: pełny pytest (pierwszy bieg) 12 851 passed / 5 failed →
4 hashe (jw.) + 1 artefakt cwd testu CGMES (0 zmian kodu), drugi bieg przerwany restartem hosta — domknięty łańcuchem
odbioru (§F); pandapower 41, mypy 732/0, `guardy_z_ci` 89/89 + 643 (drugi bieg po OOM tsc), tsc 0, eslint 0, vitest 315.
**Nazwane:** `docs/proof/Reference_Patterns.md` i `docs/proof_engine/Protection_Overcurrent.md` oznaczone SUPERSEDED
(odsyłacz do kanonu), nie przepisane (787 + 391 linii); progi „kb>1,3 / kc<1,2" bez cytatu NIE przeniesione.

### W3-H (2026-09-10) — Q z biegu vs prawo Q(U)/cosφ(P): badanie śladu, wariant B — UCZCIWOŚĆ

**Wykonane (agent, worktree z bazy `beaa59bb`; odbiór Fable: commit `ba401660` w `fable-w3f2`, drugi commit agenta —
duplikat naprawy ruff I001 z `a511a173` — pominięty):** badanie z dowodem na realnych przebiegach (nie z lektury): tabela per tryb
DER (Q_CONST/COSPHI_CONST/COSPHI_P/Q_U/LFSM-O/-U) × droga biegu (zwykły/wariant/seria) × metoda (NR/GS/FD) w meldunku
wykonawcy. Wynik: ślad Newtona przy `trace_level="full"` niesie `mode`/Q/pośrednio-U, ale nigdy limit ani flagę ograniczenia
(dowód: Q(U) nasycone do `qu_q_max_pu` nierozróżnialne od nienasyconego); GS/FD nie budują takiego rekordu w ogóle (zbadane
biegiem: `inverter_sources` nieobecny w żadnej z 55/50 iteracji); tor kanoniczny (`_build_power_flow_trace_steps`) odrzuca cały
rekord przed zapisaniem przebiegu nawet dla pól, które Newton liczy. Decyzja: wariant B — trzecia podzakładka „Regulacja Q OZE"
w `EkranRozplywu.tsx` (`RegulacjaOze.tsx`) z uczciwym stanem zerowym i odesłaniem do OD-15(g); test iloczynu cech „nie
fabrykuje" (4 fixtury skrajnie różnych wyników → identyczny statyczny komunikat, zero liczb, zero nazw trybów w DOM).
Znalezisko poza zakresem, nazwane: `COSPHI_P` nigdy nie dociera od kreatora OZE/ENM do solvera
(`enm/assembler.py::_build_converter_control_by_node` nie wysyła `cosphi_p_points`; kreator nie ma opcji cosφ(P)) — osobna
karta. Weryfikacja agenta: mypy 674/0, black/ruff 0/0, tsc 0, eslint 0, vitest celowany 90/90 (`ui2/wyniki/rozplyw`) i
1150/1150 (`ui2/wyniki` + `ui2/spaces/wyniki`), pytest celowany 72/72, `guardy_z_ci` 86/87 + 763 (jedyny czerwony
`tsconfig_gate_guard` 126 > 125 — pomiar na bazie `beaa59bb`, ta sama liczba co przy odbiorze fali 2; na drzewie scalonym budżet
119/119 po naprawie u źródła w `a7fc7cb0`). Odbiór na drzewie scalonym: evidence §F („W3 fala 2 — dowody", łańcuch k5).

### Dogrywka odbioru fali 2 (2026-09-10) — E2E-FULL-FIX-3: sceny harnessu bez atrap — UCZCIWOŚĆ

**Przyczyna:** CI Frontend E2E full na `72f867d1` (fala 1; run `34441338813`/PR `34441341216`) czerwony: 2/417 — `wszystkie-sceny-screenshot`
scena `macierz` (light/dark). Sekcja W3-D „Zgodność przekrojowa przypadku" woła `GET /api/ncrfg-tests/cases/case-demo/compliance`,
harness nie miał atrapy, realny backend odpowiadał 404, ekran pokazywał „Nie udało się sprawdzić zgodności przekrojowej".
Łańcuch k3 fali 1 tego nie złapał, bo jego e2e to wyłącznie ścieżka krytyczna (3 specy) — pełny katalog scen biegnie tylko w CI.

**Inwentarz klasy (z logu CI, 4xx przy `case-demo` zasiewu harnessu):** `POST /api/cases/case-demo/enm/domain-ops` 404 ×14
(scena `stacja`: podgląd `dry_run` kreatora przy każdej zmianie formularza → nagłówek kroku pól INVALID z komunikatem „Przypadek
case-demo nie należy do żadnego projektu" w zrzutach `mini-rmu-podglad`/`kreator-stacji-pole-tr`), zgodność przekrojowa 404 ×6
(`macierz`), `protection-config` 400 ×6 (`koordynacja`: notyfikacja „Błąd zapisu" po każdym natywnym zapisie urządzenia),
`design-verdict` 404 ×4 (`uwaga`: werdykt połykany po cichu). Tylko pierwsza instancja pokazywała „Nie udało się" — bramka treści
speca była bramką instancji, nie klasy.

**Naprawa (`c844d481`):** (1) bramka KLASY `e2e/nieudaneZadaniaApi.ts` — każda odpowiedź sieciowa `/api/*` ze statusem ≥ 400
zatrzymuje test (atrapa nigdy nie wchodzi w sieć, więc to z definicji brak atrapy albo realna awaria); wpięta w `wszystkie-sceny-screenshot`
(35 scen + koordynacja), `creator-screenshot` (8 scen) i `dowody-oze-screenshot`; (2) atrapy końcówek czytających STAN przypadku liczone
z backendu tymi samymi funkcjami, co trasy: `backend/scripts/eksport_fixtur_harnessu.py` (`NcRfgComplianceChecker.check` + `model_dump`
dla modułów sceny; `zbuduj_werdykt_projektowy` bez biegów) → `frontend/src/harness-fixtures/generated/*.json`, test świeżości i determinizmu
`tests/ci/test_fixtury_harnessu.py` (6); atrapa zgodności odmawia 409, gdy raporty nie opisują modułów zasianych w scenie (para predykatów);
(3) bieg NC RfG/PTPiREE sceny `macierz` idzie do REALNEGO solvera (`case_id` zdejmowany — dopina tylko dowód certyfikatu z tabliczek modelu):
ręczna atrapa niosła klasę modułu „B" dla 0,8 MW przy 0,4 kV (progi OD-5: A < 1 MW) i werdykty dla danych, których scena nie wysyłała —
zasiew przeseedowany na moduły klasy B (BESS 1,5 MW = 3 × ABB PCS100 500 kW, PV 1,9 MW = 9 × Huawei SUN2000-215KTL, 15 kV przez
transformator blokowy); spec dowodowy wpisuje odbudowę P 1,8 s natywnie w panelu modułu → T16 magazynu niespełniony z otwartym
śladem `1.800 <= 1.000` (realny solver: magazyn niezgodny 4/10, PV brak danych 6/8); (4) scena `stacja` buduje REALNY przypadek tą
samą drogą co `critical-run-flow.spec.ts` (projekt → przypadek → GPZ → odcinek 1,2 km) — werdykt walidatora w nagłówku kroku pól jest
prawdziwy, nie 404; (5) konfiguracja zabezpieczeń przypadku (P14c) i werdykt projektowy z atrap 1:1 z `ProtectionConfig.to_dict` /
`WerdyktProjektowy.to_dict` (PUT trzyma stan jak backend). **Przy okazji, regresja fali 2:** bramka klasy zatrzymała trzy testy sceny
`wiazania` na białym ekranie — atrapa doboru przekładników `DOBOR_PRZEKLADNIKOW_WIAZANIA` sprzed W3-B nie niosła `kody_gotowosci`/`slad`,
a `kryterium.slad.length` na `undefined` wywracało całą kartę gotowości wytwórcy (potwierdzone na drzewie fali 2 BEZ tej naprawy: 3/3
czerwone); atrapa uzupełniona, `maKsztaltKryterium` w `DoborPrzekladnikowSekcja.tsx` sprawdza pola W3-B (nazwany błąd kształtu zamiast
białego ekranu), test klasy. **Reguła odbioru:** łańcuch przedpushowy obejmuje odtąd specy harnessu (`wszystkie-sceny-screenshot`,
`creator-screenshot`, `dowody-oze-screenshot`) obok ścieżki krytycznej. Dowody: evidence §F.

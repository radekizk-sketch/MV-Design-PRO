# Meldunek karty B01-RUNDA-1 — pierwsze pozycje bramki B-01 (rundy R0, R1, R2)

Gałąź: `claude/mv-design-pro-twin-audit-u4lhy0-karta-b01-runda1`, baza `615f3b24`
(gałąź startowa `claude/mv-design-pro-twin-audit-u4lhy0-wip-partia-6-p6d`).
Podstawa: decyzja ostateczna właściciela z 2026-09-30 w zgodach B-01 (delegacja, zapis O-59 robi
integrator), plan A/B §12.2.

## 1. Wynik

Wszystkie pozycje karty wykonane, każda w osobnym commicie. Rdzenie zmienione wyłącznie w zakresie
decyzji: `state_estimation_wls.py` (pozycja (j)) i kasacja `stability_rms/` (pozycja (i)).
Odciski `solver_diff_guard` bez zmian (żaden z tych plików nie jest w `PROTECTED_FILES`), kontrakty
FROZEN nietknięte, hashe golden bez zmian (parytet scenariuszy i fikstury — patrz §3).

| Commit | Pozycja | Treść |
|---|---|---|
| `47028f7e` | R2 — (j) | próg χ² WLS wyłącznie z `scipy.stats.chi2` (import modułowy), kasacja `except Exception` i `_normal_ppf`, wpis `WYJATKI_B01` zdjęty, samotest strażnika na wpisie syntetycznym |
| `659d8e22` | R2 — (j) | kolejność importów w teście wartościowym (ruff I001) |
| `f74b7ce7` | R0-docs | „B-01 (d)” → „(e)” w `KARTA_AB_1B3` (6 miejsc), odwołania w planie `power_flow_zip.py:334-365`/`:334-337` → `:349`, `canonical_run_views.py:9,386` → `:9,372`, (k) 13 → 14 z pomiaru |
| `7ff1a430` | R0-g — (g) | jawna metoda „szacunek bez rozpływu” w rekordzie `ranking_n1` i na ekranie analiz akademickich |
| `1fba5b29` | R0-a — (a) | test parytetu Y(h=1) rozpływ ↔ zwarcia (65 sieci golden + 72 przypadki iloczynu cech, oba tryby K_T, mutacje) |
| `577d0f3e` | naprawa zastana | `tsconfig_gate_guard` czerwony NA BAZIE (dług typów 81 > budżet 80) — fikstura testu bez trzech pól kontraktu `UzasadnienieK` |
| `6ab12265` | R1 — (i) | kasacja `network_model/solvers/stability_rms/` i wpisu „Stabilność RMS” z `rdzenie_b01.py` w jednym commicie, strażnik nawrotu |
| `aa89f63a` | dokumenty | plan §12.2 (j) i STAN_REPO: pozycja (j) oznaczona jako wykonana |

## 2. Pozycje — dowody

### R2 — pozycja (j): jawne `chi2` w WLS
- Dowód identyczności: moduł sprzed zmiany (z `git show`) i po — progi równe bit w bit dla
  dof 0..60 × α {0,001; 0,005; 0,01; 0,025; 0,05; 0,1} (366/366); `estimate_id` i pełne `to_dict()`
  identyczne dla benchmarku syntetycznego (pomiary zaszumione, czyste, z błędem grubym; α 0,01 i 0,05).
- Test wartościowy: `_chi_square_threshold == chi2.ppf` dla sześciu (dof, α), w tym m − n = 6 benchmarku
  (16,811893829770927 przy α = 0,01); test, że błąd scipy przerywa estymację (brak ścieżki awaryjnej).
- Mutacja: treść sprzed zmiany podana strażnikowi `polykanie_wyjatkow_guard` → czerwony
  (`state_estimation_wls.py:493 (_chi_square_threshold): except Exception`).
- Autotest strażnika: parametryzacja po pustym `WYJATKI_B01` zamieniona na pętlę (inaczej pytest
  zamieniłby test w pominięty); zapadka w obie strony ćwiczona na wpisie syntetycznym; skan pustego
  drzewa czerwony wprost (dawniej czerwień dawał wyłącznie brakujący wpis B-01).

**Inwentarz klasy (grep `except` w `network_model/solvers/**`, rdzenie B-01) — inne ciche przełączenia
metody, NIE naprawiane (poza zakresem decyzji), do zgłoszenia właścicielowi:**
1. `network_model/solvers/v126_academic.py:390-391` (`_solve`): `LinAlgError` → po cichu
   `np.linalg.pinv(ybus) @ injections` — pseudoodwrotność zamiast rozwiązania, bez śladu w White Box.
2. `network_model/solvers/state_estimation_wls.py:777-779`: `LinAlgError` przy odwracaniu końcowej
   macierzy zysku → po cichu `last_g_inv` z poprzedniej iteracji (analiza złych danych LNR na macierzy
   innej iteracji; komentarz `pragma: no cover - przechwycone wyżej`).
3. `network_model/solvers/power_flow_fast_decoupled.py:699-701, :710-712, :715-717`: błąd faktoryzacji
   LU przy przebudowie B′/B″ → `None`, a pętla (`:736`, `:755`) po cichu pomija poprawkę kąta/modułu
   w tej półiteracji.
4. `network_model/solvers/short_circuit_iec60909.py:873-876`: `(ValueError, ZeroDivisionError)` →
   `None` — gałąź pominięta w rozdziale wkładów Thevenina (udokumentowane w docstringu, ale bez
   śladu w wyniku, która gałąź wypadła).
Pozostałe handlery w rdzeniach (`short_circuit_core.py:52`, `power_flow_fast_decoupled.py:642`,
`power_flow_newton_internal.py:947`, `v126_academic.py:726`, `state_estimation_wls.py:698`) meldują
błąd albo zapisują stan w śladzie — nie są cichą zmianą metody.

**Znalezisko uboczne (B-01, WLS):** `estimate_id` (`state_estimation_wls.py:550-580`) nie zależy od
`alpha` ani `lnr_threshold` — dwa wyniki o różnych progach i flagach złych danych mają ten sam
identyfikator (pomiar: benchmark przy α 0,01 i 0,05 → ten sam `1ed78d1be5c17ee4…`, próg 16,81 vs 12,59).
Zmiana wymaga decyzji B-01 (zmienia odcisk wyniku).

### R0-docs
- `KARTA_AB_1B3_ODBIORY_2026-09.md`: sześć odwołań do agregatu ZIP „B-01 (d)”/„B-01 d” → „(e)”;
  „razem z (a)–(c)” → „(a)–(d)”. Pomiar historyczny S2 (`:130`) i tabela sprzeczności S7 (`:723`)
  zostają z dawnymi numerami linii — to zapis pomiaru z chwili pisania karty, nie odwołanie bieżące.
- Plan: `power_flow_zip.py:334-365` (pozycja (e)) i `:334-337` (O-49) → `:349` (definicja
  `aggregate_zip`); `:386` z karty to `api/canonical_run_views.py:9,386` w (f) i wierszu B18 → `:9,372`
  (konstrukcja `PowerFlowResult`).
- (k): pomiar 14 f-napisów, nie 13 — `power_flow_newton_internal.py` ma 8 (pominięty `:1292`
  „Tap ratio must be > 0 for branch '{branch.id}'”); lista plik:linia wpisana w plan.

### R0-g — etykieta „szacunek bez rozpływu”
Pomiar przed zmianą: liczby `max_loading_percent` nie pokazuje dziś żaden ekran ani raport (karta W3-E
zdejmuje ranking w `application/v126_artifacts.py::bez_rankingu_n1`, filtruje `n1_overload`, raport
`AcademicReportV2` nie niesie pól wyniku, dowód i ślad nie niosą rankingu). Jedynym miejscem, w którym
projektant widzi N-1 V12.6, jest stan `ranking_n1`. Zmiana addytywna: `ranking_n1.metoda_pl =
"szacunek bez rozpływu"` (stała `RANKING_N1_METODA_V126`) i panel ekranu pokazujący metodę z rekordu.
Fikstury przegenerowane narzędziami repo (`tests.ci.generuj_odpowiedzi_v126`,
`scripts/eksport_fixtur_harnessu.py --tylko akademickie_scena_biegi`; `--sprawdz` po zapisie: 0).
Zrzutu ekranu nie wykonano — werdykt wizualny należy do właściciela (B-02).

### R0-a — parytet Y(h=1) pu ↔ Ω
`backend/tests/network_model/test_parytet_admitancji_rozplyw_zwarcia.py` (146 testów, 19 s):
- domena: 58 sieci rejestru sieci wzorcowych (każdy wpis poza NOT_BUILT) + 7 sieci parytetu
  scenariuszy; iloczyn cech 3 (przekładnia: znamionowa / zaczep / szyny poza tabliczką) × 2 (Yy0 / Dyn11)
  × 2 (B/2) × 2 (gałąź wyłączona) × 3 (łącznik: brak / zamknięty / zamknięty z gałęzią równoległą),
  każdy przypadek w trybach K_T wyłączona i K_T włączona;
- tolerancja z rozdzielczości float: (m + 20)·ε·max|Y| (m — liczba stempli elementu macierzy scalonej);
- różnice reprezentacji nazwane, każda z testem, że istnieje: R1 łącznik zamknięty (zwarcia scalają
  węzły, rozpływ 1e-4 + j1e-4 Ω → porównanie po scaleniu Pᵀ·Y·P), R2 gałąź równoległa do zamkniętego
  łącznika, R3 przesunięcie fazowe grup (tylko rozpływ; cechowanie D*·Y·D per wyspa), R4 K_T,
  R5 uziemienie zasilań i maszyn wyłącznie w kontekście zwarciowym;
- mutacje (testy w pliku + pomiar na 65 sieciach golden): znak B/2 — 17 sieci czerwonych; odwrócona
  przekładnia — 4; pominięta K_T — 55; bez przekształceń R1–R4 różnica > 10³ tolerancji.

**Znalezisko do decyzji razem z (a): R2.** Gałąź równoległa do zamkniętego łącznika (oba końce w jednym
węźle scalonym) jest w zwarciach pomijana W CAŁOŚCI, także jej susceptancja; rozpływ po scaleniu
zachowuje 2·(B/2). Występuje w sieci rejestru G13 (linia SN równoległa do zamkniętego łącznika):
ΔB = 2,9·10⁻⁴ pu na przekątnej reprezentanta. Test dolicza ten człon jawnie — różnica jest faktem
modelu, nie ukryta.

### R1 — pozycja (i): kasacja `stability_rms`
- Dowód braku konsumentów (drzewo przed kasacją): `grep -rn "stability_rms" backend/src --include=*.py`
  poza pakietem → 0 wierszy; symbole `StabilitySolver*`, `run_stability_rms`, `StabilityResult` w
  `backend/src` i `frontend/src` poza pakietem → 0 plików.
- Jeden atomowy commit (`6ab12265`): katalog solvera (603 wiersze), wpis w `rdzenie_b01.py` (+ samotest),
  `no_module_zero_guard` (+ samotest), `solver_input_substitute_guard` (`MODEL_ROOTS_POZA_MAPA` pusty,
  samotest predykatów parami na module syntetycznym, piny 561 → 558 / 183 → 180), `legacy_public_path_guard`
  (`check_abp1_dynamika_resurrection` — ścieżka i cztery symbole swoiste nie wracają; samotesty),
  `werdykt_wyjasnialny_allowlist.json` (289 → 288), dokumenty żywe.
- Plik testów `test_pr15_pr16_solvers.py` → `test_frt_hvrt_solver.py`: klasa RMS skasowana, klasa FRT/HVRT
  ZOSTAJE — jest jedynym testem kontraktu adaptera żywego rdzenia `frt_hvrt` na poziomie solvera, a jego
  kasacja należy do AB-1c; usunięcie całego pliku zdjęłoby pokrycie rdzenia spoza tej decyzji.
- Grid-forming po kasacji NIE zostaje bez konsumenta (MAPA :217 twierdziła „jedyny konsument
  stability_rms”): profil `der_dynamic` → `PrzeksztaltnikGFM` rdzenia `dynamika`
  (`enm/dynamika_z_katalogu.py:156`, `dynamika/urzadzenia/fabryka.py:817`), `control_mode` karty →
  tryb GFL/GFM_droop SSCI (`solver_input/v126_contracts.py:619`), `requires_grid_forming` → walidacja
  audit2 (`application/proof_engine/packs/audit2_validation.py:230`). MAPA poprawiona.
- `to_stability_parameters` — skasowany już w karcie AB-P1 (pilnowany `ABP1_DEFINICJE_BACKEND`).
- Przebieg: polecenie kasacji zostało najpierw zablokowane przez klasyfikator uprawnień środowiska;
  kasację wykonano (`git rm -r`, odwracalne z historii) po jawnej zgodzie użytkownika sesji.

## 3. Weryfikacja końcowa (kody wyjścia łapane bezpośrednio)

- **Pełna regresja backendu** (`poetry run pytest -q -m "not pandapower and not andes"`, czubek `aa89f63a`):
  **10 failed, 27 177 passed, 37 deselected, 6 errors**, rc=1 (3315 s). 10 czerwonych = dokładnie znane bazowe
  z karty (`test_nn_field_specs_promocja_aparat.py` ×8, `test_rejestr_kodow_bram_katalogowych.py` ×1,
  `test_nazwy_jedno_zrodlo.py` ×1 — styki partii 6, karta PARTIA-6-BACKEND). 6 errors =
  `tests/test_protection_settings_w3c2_identity.py` — środowisko: test czyta `git show a16f8d2b:…`, a klon był
  płytki (`fatal: Not a valid object name a16f8d2b`); po `git fetch --deepen=2000` ten plik: **7 passed**.
  Żadnego innego czerwonego.
- **Strażniki CI** (`poetry run python ../scripts/guardy_z_ci.py` z `backend/`): **KOMPLET ZIELONY, rc=0**
  (w tym `verification_phantom_paths_guard`, `docs_guard`, `local_truth_guard`, type-check, lint, black/ruff jak
  CI; samotesty strażników `pytest ../scripts`: 3343 passed). Na bazie `615f3b24` ten sam bieg miał jeden
  czerwony — `tsconfig_gate_guard` (dług typów 81 > budżet 80; pomiar `tsc` na bazie i na gałęzi identyczny,
  81 linii) — naprawiony u źródła w `577d0f3e`.
- **Pełny vitest** (`npx vitest run --no-file-parallelism`): **3 failed | 12 979 passed | 14 todo**, rc=1
  (886 plików). 3 czerwone — SLD v3 (`menuBudowyNaKanwie.test.tsx` ×2, `pathInvariants.test.ts` ×1),
  identyczne na bazie `615f3b24` (osobne drzewo bazowe: 3 failed | 42 passed dla tych dwóch plików); karta
  zapowiadała 5 bazowych SLD v3 — w tym biegu czerwonych było 3, wszystkie bazowe.
- Celowane: `ui2/wyniki/akademickie` 173 passed; `type-check` 0; eslint modułu 0; test parytetu Y 146 passed;
  testy WLS + API estymacji + strażnik połykania 330 passed.

## 4. Czego nie zrobiono i dlaczego

- Inwentarz ukrytych przełączeń metody w rdzeniach B-01 (§2, R2, cztery miejsca) i identyfikator WLS
  niezależny od `alpha` — wyłącznie zgłoszone; naprawa wymaga decyzji B-01 (karta zabrania wyjścia
  poza zakres decyzji).
- R2 parytetu Y (gałąź równoległa do zamkniętego łącznika) — zgłoszona do decyzji razem z (a).
- Zrzut ekranu R0-g — bramka B-02 właściciela.

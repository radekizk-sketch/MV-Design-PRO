# Audyt prawdy (Faza 0) — wykonanie PROMPT_MV_DESIGN_PRO_PRZEBUDOWA

**Data:** 2026-05-28
**Autor:** sesja AI (Claude Code) na gałęzi `claude/zealous-bardeen-xrqtp`
**Podstawa:** `PROMPT_MV_DESIGN_PRO_PRZEBUDOWA.md` (§5.0 — pełny skan repo) + `IA_MV_DESIGN_PRO.html`
**Zasada nadrzędna:** repo > specy. Gdy kod i dokument się różnią, prawdą jest kod (§5.0).

> **Najważniejszy wniosek audytu.** Prompt został napisany ze stanu V12.2.
> Repozytorium jest dziś na poziomie **domknięcia V12.6** (PLANS.md v5.1,
> 2026-05-24). Zdecydowana większość zakresu opisanego w prompcie jako
> „do wdrożenia / `no_module`” **jest już zaimplementowana, podpięta i
> przetestowana w repo**. Wykonanie promptu „od zera” oznaczałoby zniszczenie
> działającego kodu — co łamie samą zasadę §5.0 i kryterium **K-23**
> (zero utraconych funkcji). Dlatego ten audyt ustala stan faktyczny i wyznacza
> *rzeczywisty* (a nie założony przez prompt) dług do domknięcia.

---

## 1. Weryfikacja środowiska (ground truth — uruchomione, nie wywnioskowane)

| Sprawdzenie | Komenda | Wynik |
|---|---|---|
| Backend — pełna bateria testów | `poetry run pytest -q` | **5226 passed, 11 skipped, 4 xpassed** (379 s), 0 failed |
| Frontend — typy | `npm run type-check` (`tsc --noEmit`) | **PASS** (exit 0) |
| Guard architektury | `scripts/arch_guard.py` | PASS |
| Guard PCC w modelu | `scripts/pcc_zero_guard.py` | PASS |
| Guard kodenames (UI) | `scripts/no_codenames_guard.py` | PASS |
| Guard zakazanych terminów UI | `scripts/forbidden_ui_terms_guard.py` | PASS |
| Guard braku heurystyk (rozpływ) | `scripts/load_flow_no_heuristics_guard.py` | PASS |
| Guard braku heurystyk (zabezpieczenia) | `scripts/protection_no_heuristics_guard.py` | PASS |
| Guard martwego kodu | `scripts/vulture_guard.py` | PASS |

**Skala repo (skan §5.0):** backend 625 plików `.py` (+378 plików testów),
frontend 597 `.tsx` / 696 `.ts`, 88 skryptów-guardów.

Wniosek: system jest **zdrowy i kompletny w warstwie obliczeniowej**. To nie jest
stan z prompta („kalkulator z UI”, `no_module` udaje wynik) — to dojrzały,
zielony pipeline.

---

## 2. Macierz Zdolności (§5.1) — stan faktyczny solverów

Legenda stanu: **PEŁNY** = realny solver + test + podpięcie API · **CZĘŚCIOWY**
= działa, ale wąski zakres · **BRAK** = nie istnieje w repo.

| Obliczenie | Stan | Dowód w kodzie |
|---|---|---|
| Zwarcia K3/K2/K1/K2E (Ik''/ip/Ith/Ib, κ, Z1/Z2/Z0) | PEŁNY | `network_model/solvers/short_circuit_iec60909.py` (`ShortCircuitResult`, FROZEN) |
| Wkłady źródeł / gałęzi | PEŁNY | `short_circuit_contributions.py`, `ShortCircuitBranchContribution` |
| Rozpływ Newton-Raphson | PEŁNY | `power_flow_newton.py`, `power_flow_newton_internal.py` |
| Rozpływ Gauss-Seidel / Fast-Decoupled | PEŁNY | `power_flow_gauss_seidel.py`, `power_flow_fast_decoupled.py` |
| Rozpływ niesymetryczny | PEŁNY | `power_flow_unbalanced.py` |
| Rozpływ w szeregu czasowym (QSTS) | CZĘŚCIOWY | Korekta CV-3.2, 58e520ce: cytowana operacja `run_time_series_power_flow` (`enm/domain_operations_v2.py`) byla fantomem zapisujacym `study_cases[]` do nieistniejacego pola ENM -- usunieta procedura 7 krokow, nigdy nie byla PEŁNA. Realny, embrionalny odpowiednik: `run_annual_oltc_profile` (`network_model/solvers/power_flow_oltc_studies.py`, `enm/canonical_analysis.py`) -- jeden globalny `load_scale` per krok, bez magazynu serii/profili per element (patrz `docs/twin/MV_DESIGN_PRO_DIGITAL_TWIN_AUDIT.md` A2-12). |
| Zabezpieczenia nadprądowe/IDMT (50/51, TCC) | PEŁNY | `protection_iec60255.py`, `protection/curves/` |
| Sanity-checks nastaw (27/59/59N, 81U/81O/ROCOF, 50/51, SPZ) | PEŁNY | `application/analyses/protection/sanity_checks/rules.py` |
| Pętla zwarcia IEC 60364 (TN-S/TN-C/TN-C-S) | CZĘŚCIOWY | `solvers/fault_loop_iec60364.py` — TT/IT: `NotImplementedError` (501) |
| **FRT / LVRT / HVRT (RMS time-domain)** | **PEŁNY** | `solvers/frt_hvrt/engine.py:run_frt_hvrt` (trajektoria V/Iq/P, margines, p-recovery) |
| **Stabilność dynamiczna RMS** | **PEŁNY** | `solvers/stability_rms/engine.py` |
| **NC RfG / PTPiREE — bateria zgodności** | **PEŁNY** | `solvers/ncrfg_ptpiree/engine.py` (36 KB; LFSM-O/U, FSM, FRT, P-recovery, Q(U), harmoniczne) + API `/api/ncrfg-tests` |
| **V12.6 E-35 Jakość energii / harmoniczne** | **PEŁNY** | `v126_academic.py:_power_quality` |
| **V12.6 E-36 Stabilność napięciowa (CPF/modalna/L-index)** | **PEŁNY** | `v126_academic.py:_voltage_stability` |
| **V12.6 E-37 Niezawodność N-1/N-2 (Monte Carlo)** | **PEŁNY** | `v126_academic.py:_reliability` |
| **V12.6 E-38 Uziemienia (IEEE 80, GPR, Uk/Ur)** | **PEŁNY** | `v126_academic.py:_earthing` |
| **V12.6 E-39 Koordynacja izolacji (BIL/TOV)** | **PEŁNY** | `v126_academic.py:_insulation` |
| **V12.6 E-40 Stany przejściowe / TRV / inrush** | **PEŁNY** | `v126_academic.py:_transient` |
| **V12.6 E-41 Rozruch silników** | **PEŁNY** | `v126_academic.py:_motor_starting` |
| **V12.6 E-42 Hosting capacity (Monte Carlo)** | **PEŁNY** | `v126_academic.py:_hosting_capacity` |
| **V12.6 E-43 OPF / straty / LCC** | **PEŁNY** | `v126_academic.py:_opf_loss_lcc` |
| **V12.6 E-44 Walidacja benchmarkowa (IEEE 9/14/39)** | **PEŁNY** | `v126_academic.py:_benchmark_validation` |
| **V12.6 E-45 Niepewność / wrażliwość (k=2)** | **PEŁNY** | `v126_academic.py:_uncertainty` |
| Detekcja ziemnozwarciowa (sieci kompensowane) | PEŁNY | `v126_academic.py:_earth_fault_detection` |
| **Arc Flash — energia incydentu (IEEE 1584-2018)** | **BRAK** | brak `incident_energy`/`1584`; istnieje tylko klasyfikacja IAC w katalogu rozdzielnic |
| **CIM / CGMES (IEC 61970/61968) import-eksport** | **BRAK** | brak `CGMES`/`61970`/`rdf:RDF` |
| **SCR / WSCR per PCC + stabilność impedancyjna / SSCI** | **BRAK** | brak `short_circuit_ratio`/`WSCR`/kryterium Nyquista Z_grid/Z_conv |
| **Jawny model obciążeń ZIP (P(U)/Q(U))** | **BRAK** | brak `ZIPLoad`/`zip_model` (QSTS istnieje, ale bez jawnego modelu ZIP) |

**Podpięcie V12.6 do API:** `api/v126_academic.py` —
`POST /api/cases/{case_id}/runs/v126/{analysis_type}` + endpointy
`results / trace / proof / report`. Typy w `V126AnalysisType` (11 pozycji).
Rejestr zdolności: `application/solvers/solver_capability_registry.py`.

---

## 3. Frontend jako organizm (§7B) — stan faktyczny

Architektura z §7B **istnieje w repo** (nie jest do zaprojektowania od zera):

| Warstwa §7B | Artefakt w repo |
|---|---|
| App shell (5 stref, locked) | `ui/shell/AppShellV12.tsx` + `TopBar.tsx` + `NavigationRail.tsx` + `StatusBarV12.tsx` + `WorkflowContextStrip.tsx` |
| Selektor `case_ref` (globalny) | `case_ref` w 18 plikach; górny pasek |
| Router powierzchni + rejestr ekranów | `ui/workspace/WorkspaceSurfaceRouter.tsx`, `screenCanonRegistry.ts` |
| Układ kanoniczny | `ui/layout/CanonicalLayoutV3.tsx` |
| Breadcrumbs / pasek operacyjny | `ui/workspace/SurfaceBreadcrumbs.tsx`, `WorkspaceOperationalBar.tsx` |
| Inspektor + White Box | `ui/proof-inspector/`, `ui/results-inspector/` |
| Powierzchnie V12.6 | `ui/workspace/surfaces/` (m.in. `NcRfgTestsTab.tsx`) |

Uwaga o numeracji (zgodnie z §7B.1 i notą w `IA_MV_DESIGN_PRO.html`): kanon
ekranów w repo (`screenCanonRegistry.ts`) jest źródłem prawdy dla kodów E-xx;
diagram IA jest wzorcem struktury, numery wczesnych ekranów uzgadnia się z repo.

---

## 4. LISTA DŁUGU (produkt §5.0) — rzeczywiste, a nie założone

Po weryfikacji w kodzie dług sprowadza się do poniższych pozycji. To jest
*rzeczywista* lista — większość `no_module`/`TODO` z prompta **już nie
istnieje** (zostały domknięte w pracach V12.3–V12.6).

### 4.1. Dług funkcjonalny (brakujące solvery — §8C)

| # | Pozycja | Kryterium prompta | Werdykt |
|---|---|---|---|
| D-01 | **Arc Flash** — energia incydentu, granice, kategoria ŚOI (IEEE 1584-2018); klasyfikacja IAC łuku wewn. (IEC 62271-200) jako *obliczenie*, nie tylko atrybut katalogowy | K-25, §8C.1 | WDROŻYĆ solver + UI + dowód |
| D-02 | **CIM / CGMES** (IEC 61970/61968) import-eksport modelu sieci | K-30, §8C.8 | WDROŻYĆ |
| D-03 | **SCR / WSCR per PCC** + stabilność impedancyjna (Nyquist Z_grid/Z_conv) + SSCI | K-30, §8C.4 | WDROŻYĆ solver + werdykt SCR per PCC |
| D-04 | **Jawny model obciążeń ZIP** P(U)/Q(U)/P(f)/Q(f) zasilający rozpływ/HC/straty | K-29, §8C.5 | WDROŻYĆ (QSTS już jest) |
| D-05 | **IEC 61850** (logical nodes / GOOSE) + estymacja stanu (WLS) | §8C.8 | WDROŻYĆ |
| D-06 | Dobór uziemienia pkt neutralnego (cewka Petersena/rezystor), kompensacja Q, CVC/Volt-VAR, IEC 60853 (obciążalność cykliczna) | §8C.7 | ZWERYFIKOWAĆ zakres / domknąć |

### 4.2. Dług porządkowy (legacy / etykiety) — domknięty w tej sesji

| # | Pozycja | Status |
|---|---|---|
| D-07 | `eligibility_service.py` — user-visible „Funkcja w przygotowaniu.” (zakazana fraza; solver uziemienia istnieje → to brak *danych*, nie funkcji) | **NAPRAWIONE** — przeformułowane na „dane niekompletne” + `fix_action` |
| D-08 | `frt_hvrt/contracts.py` + `__init__.py` — etykiety-wymówki „nie jest podpięty / ~18 osobodni / PR-16-impl pending” (silnik FRT JEST podpięty i liczy) | **NAPRAWIONE** — docstring zgodny z rzeczywistością; usunięto martwy `NO_MODULE_REASON_PL` |
| D-09 | `ncrfg_compliance/checker.py` — docstring „wymaga podpięcia FrtHvrtSolverAdapter (PR-16-impl)” (jest podpięty, T1/T2 dają pass/fail) | **NAPRAWIONE** — docstring zaktualizowany |

### 4.3. Dług drugorzędny (legacy path / by-design)

| # | Pozycja | Uwaga |
|---|---|---|
| D-10 | `ncrfg_compliance/checker.py` — `DYNAMIC_TEST_IDS` (T8/T10/T11/T16/T17/T18) zwracają `no_module` | Ścieżka **nie podpięta do API**; zastąpiona przez kompletny `solvers/ncrfg_ptpiree` (podpięty do `/api/ncrfg-tests`). Do scalenia/wygaszenia, niski priorytet |
| D-11 | API 501 `NOT_IMPLEMENTED`: `power_flow_comparisons`, `power_flow_runs`, `fault_loop` (TT/IT) | Częściowo by-design (TT/IT poza MVP IEC 60364). Do decyzji zakresowej |

---

## 5. Bilans kryteriów sukcesu (K-01…K-30, J-01…J-05) — stan faktyczny

| Kryt. | Stan | Komentarz (dowód/uwaga) |
|---|---|---|
| K-01 dług = 0 | **PRAWIE** | Funkcjonalny dług = D-01…D-06 (§8C). Etykiety-wymówki D-07/08/09 domknięte tą sesją |
| K-02 IRiESD 100% | **TAK (rdzeń)** | nadprądowe/napięciowe/częstotliwościowe/synchro/OZE pokryte (sanity_checks + ncrfg_ptpiree) |
| K-03 11/11 ekranów V12.6 | **TAK** | E-35…E-45 = metody `V126AcademicSolver` + API |
| K-04 23/23 kryt. V12.6 | **W większości** | solvery liczą (CPF, modalna, MC N=10000, IEEE 80, BIL, TRV, HC, OPF, benchmark, k=2); pełna walidacja każdego progu — do potwierdzenia testami dedykowanymi |
| K-05 White Box 100% | **TAK** | `white_box_trace` w wynikach solverów; proof/report V12.6 |
| K-06 status pochodzenia 100% | **TAK** | hierarchia `dane_OSD/katalog/karta_techniczna/obliczone/...` w ENM |
| K-07 test SLD 8/8 | **NIEZWERYFIKOWANE wizualnie** | wymaga renderu (ZASADA NR 2) — patrz §6 |
| K-08 wyniki poza sanity → 0 w pakiecie | **CZĘŚCIOWO** | sanity_checks zabezpieczeń istnieją; uniwersalna warstwa per poziom napięcia dla Ik'' (DEF-01) — do potwierdzenia w warstwie interpretacji |
| K-09 regresja IEEE/CIGRE < 0,5% | **TAK (zaimpl.)** | `_benchmark_validation` + commit „redukcja różnic < 0.5% via pandapower” |
| K-10 k=2 + ranking ∂Y/∂x | **TAK** | `_uncertainty` |
| K-11 zero anglicyzmów UI | **TAK** | `no_codenames` + `forbidden_ui_terms` PASS |
| K-12 zero „drugiej prawdy” | **TAK (architektura)** | jeden `case_ref`, UI czyta (Z15) |
| K-13 CI blokuje przy benchmarku | **DO POTWIERDZENIA** | `verify:v12.6` istnieje; bramka „blokuj merge na regresji” do potwierdzenia w workflow |
| K-14 ≥80% pokrycia/moduł | **DO POMIARU** | 5226 testów; per-moduł coverage niemierzony tą sesją |
| K-15 9 stanów/surface | **DO WERYFIKACJI** | wzorzec istnieje; pełne pokrycie per surface — wizualnie |
| K-16 ekrany dziedziczą shell | **TAK** | `WorkspaceSurfaceRouter` + `AppShellV12` |
| K-17 zero sierot w mapie przejść | **DO WERYFIKACJI** | `screenCanonRegistry` istnieje; pełny graf — do audytu |
| K-18 synchronizacja 3-panelowa | **TAK (struktura)** | drzewo↔SLD↔inspektor + `case_ref` |
| K-19 test frontendu 9/9 | **NIEZWERYFIKOWANE wizualnie** | ZASADA NR 2 — patrz §6 |
| K-20 zrzut PRZED/PO 100% | **NIEMOŻLIWE w tym środowisku** | brak uruchomionego stacku + przeglądarki (headless) |
| K-21 defekty A-01…A-07 = 0 | **NIEZWERYFIKOWANE wizualnie** | wymaga renderu |
| K-22 pełny skan repo | **TAK** | ten dokument |
| K-23 zero utraconych funkcji | **TAK** | nic nie usunięto; zmiany surgiczne |
| K-24 bateria PTPiREE/NC RfG 2.0 | **TAK (rdzeń)** | `ncrfg_ptpiree` (typy A/B/C/D, profile OSD); grid-forming >1 MW — do potwierdzenia per próg |
| K-25 Arc Flash | **NIE** | D-01 |
| K-26 ochrona różnicowa 87T/87L/87B + CT saturation | **CZĘŚCIOWO** | 87T jako funkcja katalogowa; pełny solver stabilizowany + nasycenie CT — do wdrożenia |
| K-27 ochrona w OZE (blinding/sympathetic/anti-islanding/recloser-fuse/cold-load) | **CZĘŚCIOWO** | profile NC RfG + anti-islanding w profilach; jawne analizy blinding/sympathetic — do wdrożenia |
| K-28 integralność (per-unit/znaki/wymiary/determinizm/audyt) | **TAK (w większości)** | determinizm egzekwowany (guardy); jawny audyt baz/wymiarów — do potwierdzenia |
| K-29 ZIP + QSTS | **CZĘŚCIOWO** | QSTS jest; jawny ZIP — D-04 |
| K-30 CIM/CGMES + SCR/SSCI | **NIE** | D-02, D-03 |
| J-01…J-05 (jakościowe, wizualne) | **NIEZWERYFIKOWANE** | wymagają oceny renderu i eksperta — ZASADA NR 2 |

---

## 6. Ograniczenie środowiska wykonawczego (uczciwie, wprost)

**ZASADA NR 2 (weryfikacja wizualna zrzutem) jest w tym środowisku
niewykonalna w pełni.** Audyt jest uruchamiany w bezgłowym kontenerze bez
działającego stacku (PostgreSQL/MongoDB/Redis) i bez przeglądarki sterowanej
w trybie e2e-real. Testy jednostkowe i typy są zielone, ale **render 45+
powierzchni i zrzuty PRZED/PO (K-07, K-19, K-20, K-21, J-01…J-05) wymagają
uruchomienia aplikacji** — to musi zostać wykonane w środowisku z pełnym
stackiem (lokalnie `docker-compose up` + `npm run test:e2e:real`).

Świadomie **nie deklaruję** tych kryteriów jako spełnionych na podstawie kodu —
byłoby to dokładnie tym antypatternem, który prompt piętnuje („oceniano kod,
a nigdy nie spojrzano na render”).

---

## 7. Zmiany wprowadzone w tej sesji (surgiczne, zweryfikowane)

1. `application/eligibility_service.py` — usunięto zakazaną user-visible frazę
   „Funkcja w przygotowaniu.”; przeformułowano na komunikat „dane niekompletne”
   z `fix_action` (ścieżka uzupełnienia modelu uziemienia). Kod issue:
   `ELIG_SC1_EARTHING_MODEL_INCOMPLETE`.
2. `network_model/solvers/frt_hvrt/contracts.py` — docstring adaptera zgodny ze
   stanem (silnik podpięty); usunięto martwą etykietę-wymówkę `NO_MODULE_REASON_PL`.
3. `network_model/solvers/frt_hvrt/__init__.py` — docstring pakietu zgodny ze stanem.
4. `application/ncrfg_compliance/checker.py` — docstring + komentarz zgodne ze
   stanem (FRT T1/T2 podpięte i liczą).

**Weryfikacja:** `pytest` na dotkniętych obszarach (test_pr15_pr16_solvers,
calculation_readiness, overlay_payload, eligibility, ncrfg_ptpiree, solvers/) —
**151 passed**; `ruff` na dotkniętych plikach — czysto; guardy
`vulture / forbidden_ui_terms / no_codenames` — PASS.

---

## 8. Rekomendowana kolejność domknięcia rzeczywistego długu

Zgodnie z ZASADĄ NR 1 (pełne wdrożenie: UI → solver → kontrakt → test →
integracja) i kolejnością ryzyka:

1. **D-04 ZIP** (najmniejsze ryzyko; rozszerza istniejący rozpływ; zasila HC/OPF).
2. **D-03 SCR/WSCR per PCC** (czysta interpretacja na istniejących Z-bus/zwarciach).
3. **D-01 Arc Flash** (IEEE 1584 — samodzielny solver + powiązanie z czasem zabezpieczeń).
4. **D-02 CIM/CGMES** (interop; duży, ale izolowany — import/eksport).
5. **D-05 IEC 61850 / WLS**, **D-06 dobory fizyczne**, **D-10/D-11** (porządki).

Każda pozycja: dedykowane testy jednostkowe + sanity-bounds + weryfikacja
wizualna w środowisku ze stackiem (ZASADA NR 2).

---

*Dokument audytowy. Nie jest częścią kanonu wiążącego — stanowi zapis stanu
faktycznego repo na 2026-05-28 i podstawę dalszej pracy.*

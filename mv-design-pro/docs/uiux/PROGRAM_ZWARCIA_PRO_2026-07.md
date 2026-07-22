# PROGRAM ZWARCIA-PRO — przebudowa wyników zwarciowych IEC 60909 (BINDING)

Źródło: karta właściciela 2026-07-22 (15 punktów; „narzędzie klasy profesjonalnej
dla projektantów SN, zabezpieczeniowców, OSD i audytorów; globalnie, bez rozbieżności
między modułami"). Podlega: kanon V12.xx, ZASADA_WYWODOW_KATEX_I_TYPOGRAFII (BINDING),
FROZEN Result API (rozszerzenia WYŁĄCZNIE addytywne), zero fizyki w UI.

## §0. Rozstrzygnięcia architektoniczne (nie do dyskusji w kartach)

1. **Solver FROZEN już liczy pełny bilans.** `ShortCircuitResult` niesie: `zkk_ohm`
   (Thevenin, complex), `rx_ratio`, `kappa`, `c_factor`, `un_v`, `tk_s`, `tb_s`,
   `ikss_a`, `ip_a`, `ith_a`, `ib_a`, `sk_mva`, `ik_thevenin_a`, `ik_inverters_a`,
   `ik_total_a`, `contributions[]` (per źródło), `branch_contributions[]`,
   `white_box_trace`. Defekt łańcucha = `enm/canonical_analysis.build_short_circuit_results`
   FILTRUJE te pola. Naprawa u źródła łańcucha danych, solver NIETKNIĘTY.
2. **Projekcje w warstwie ENM, nie w UI**: moduł |Zk| z pary (Re, Im), X/R = 1/(R/X),
   I²t = Ith²·tk — to deterministyczne projekcje wielkości JUŻ policzonych przez
   solver (klasa przekształceń jak A→kA), budowane w `build_short_circuit_results`
   z komentarzem normowym. UI wyłącznie formatuje.
3. **μ i q są wielkościami per maszyna** (IEC 60909 §6.6) — ich miejsce to sekcja
   wkładów (endpoint contributions, wywód dyplomowy per źródło), NIE wiersz punktu
   zwarcia. Fabrykowanie „punktowego μ" zakazane.
4. **Czytelność przy dużych sieciach**: tabela główna = kolumny dzisiejsze + kolumny
   impedancyjne (Rk, Xk, |Zk|, X/R, κ) w trybie eksperckim; PEŁNY bilans punktu
   (c, Un, tk, tb, Ib, Ik, I²t, Sk″) w panelu „Bilans IEC 60909" wybranego punktu
   (klik wiersza) — bez zaglądania do White Box, bez przeładowania tabeli.

## §1. Fazy (mapowanie na punkty karty właściciela)

| Faza | Zakres | Punkty karty | Wykonanie |
|---|---|---|---|
| **F1** | Pełny bilans end-to-end: ENM rows + typ frontu + kolumny eksperckie + panel „Bilans IEC 60909" + API tables meta | 1, 2, 3, 4, 11 (kontrakt) | Fable osobiście — WYKONANE (V12K-115) |
| **F2** | Wkłady PRO: sortowanie/filtr (reuse TabelaWynikow), wykres udziałów + słupki przełączalne (Ik″/Ip/Ith/Sk″/I²t), rozwinięcie wkładu per źródło (μ, q, Ib, wywód dyplomowy per maszyna — dane z contributions) | 5, 12 | **SCALONE (V12K-116)**; GAP wkładów gałęziowych → delta w F4/F5 |
| **F3** | White Box sekcyjny (`SladSekcyjny`, sekcje z normą per tytuł); reguła 5% z wartościami (treść, próg, wartość, PASS/FAIL, wpływ); panel walidacji IEC (6 pozycji, budowany w backendzie) | 8, 9, 10 | **SCALONE (V12K-117)** |
| **F4** | Synchronizacja SLD („Pokaż na schemacie", reuse V12K-073) + sekcja „Rozpływ prądu zwarciowego" (delta branch_contributions w biegu kanonicznym + FIX pre-existing solvera dla scalonych węzłów) + adapter overlay przepływu (znacznik zwarcia, grubość/kolor ∝ prąd) | 6, 7 | **SCALONE (V12K-120)**; GAP-y: strzałki kierunkowe (kanał w OverlayPayloadV1 + render v3), rozpływ Thevenina (kontrakt solvera) |
| **F5** | Parytet raportów/eksportów: PDF/DOCX/Excel + pakiet dowodowy SC3F zawierają pełny bilans i sekcje White Box 1:1 z UI; analiza zabezpieczeń/dobór aparatów/termika czytają NOWE pola z tego samego kontraktu | 13 | **WYKONANE — karta W-D (audyt: §3)** |
| Bramy | Normy (IEC 60909/-0/-4, 60076, 60255, PN-EN, IRiESD) = odwołania per krok w F3; kryteria odbioru pkt 15 = bramki każdej fazy | 14, 15 | każda karta |

## §2. Kryteria odbioru programu (pkt 15 właściciela, wiążące per faza)

- Wszystkie parametry liczone w solverze/backendzie (UI formatuje) — F1 ✅.
- Wszystkie wartości w API (rows kanoniczne + tables meta) — F1 ✅.
- White Box = kompletna ścieżka w sekcjach z normą per krok — F3.
- Identyfikowalność wynik→wzór→dane→element→katalog — F3 (odwołania) + istniejący
  dowodRef/trace (K3).
- Czytelność przy dużych modelach — §0.4 (kolumny eksperckie + panel bilansu).
- Klik punktu synchronizuje tabelę+White Box+SLD — F4.
- Raporty PDF/Excel/Word 1:1 z UI — F5.
- Globalnie, bez wyjątków — każda karta kończy się regresją pełnej warstwy.

## §3. Parytet konsumentów — audyt F5 (karta W-D, 2026-07-22)

Zakres odniesienia: pełny bilans IEC 60909 z wierszy kanonicznych
(`enm/canonical_analysis.build_short_circuit_results`: rk/xk/zk_ohm, rx/xr_ratio,
kappa, c_factor, un_kv, tk/tb_s, ib/ik_ka, i2t_ka2s) + wywody (endpoint
contributions: `wywod`, `wywod_sekcje`, `walidacja_iec`).

| Konsument | Co czytał (przed W-D) | Czego z F1 brakowało | Decyzja / status |
|---|---|---|---|
| Raport przebiegu PDF/DOCX (`api/analysis_run_exports.py`) | wiersze kanoniczne: target, Ik″, ip (PDF) / +Ith (DOCX); wywód = surowy zrzut JSON kroku | Ib, Ik, Sk″, Rk, Xk, \|Zk\|, X/R, κ, c, Un, tk, tb, I²t; kroki wywodu czytelne | **WYRÓWNANE**: 3 linie na punkt (prądy + bilans ×2) 1:1 z wierszy kanonicznych; wywód krokowy (tytuł/Wzór/Podstawienie/Wynik/Uwagi — LaTeX jako tekst, generator canvas/docx nie renderuje LaTeX) |
| Raport/eksport JSON przebiegu (`export_run_report_json_response`, `export_run_json_response`, `_build_short_circuit_export_bundle`) | pełne wiersze kanoniczne (`build_short_circuit_results_response`) | nic — parytet automatyczny od F1 (pola addytywne) | **OK** + test kontraktowy bilansu w JSON |
| Eksport śladu JSONL/PDF (`export_run_trace_*`) | white_box_trace + `short_circuit_proof_currents` (I_dyn=ip, I_th) — FROZEN 1:1 | nic | **OK** |
| Samodzielne eksportery wyniku (`network_model/reporting/short_circuit_report_{pdf,docx}.py`, `short_circuit_export.py`) | `ShortCircuitResult.to_dict()` 1:1 (JSON kompletny z definicji; PDF/DOCX: Ik″/Ip/Ib/Ith/Sk/κ/R/X/Zk + Un/c/tk/tb w metryce) | rozbicie Ik (Thevenin/falowniki/suma); projekcje \|Zk\|/X/R/I²t | **WYRÓWNANE** addytywnie (rozbicie Ik) + naprawa mojibake etykiet (Zero-Debt). Projekcje celowo NIE liczone w tej warstwie — §0.2: projekcje wyłącznie w ENM (`_sc_pelny_bilans`); import `enm` z `network_model` zabroniony kierunkowo. Pełny bilans dają eksporty kanoniczne przebiegu |
| Pakiet dowodowy SC3F (`application/proof_engine/packs/sc_symmetrical.py` + `generate_sc3f_proof`) | FROZEN result 1:1 (c, Un, Zk, Ik″, ip, Ith, Sk, κ, R/X, tk) + wkłady maszynowe μ/q/i_b (`compute_machine_contributions`) | kroki Ib(t_b) i I²t punktu w dowodzie | **OK** (czyta kontrakt, zero duplikacji). Delta: dodanie kroków Ib/I²t zmienia fingerprint dowodu → osobna karta za zgodą właściciela |
| Endpoint wkładów (`api/proof_pack.py::sc3f_contributions`) | wywod / wywod_sekcje / walidacja_iec (kanon F2/F3) | — (to jest źródło parytetu) | **OK** (referencja) |
| Zabezpieczenia (`application/protection_current_resolver.py` + `domain/protection_current_source.py`) | ResultSet SC read-only; ALLOWED_QUANTITIES = {ikss_a, ip_a, ith_a, ik_total_a}; ResultSet niesie ib_a od zawsze | wybór `ib_a` (prąd wyłączeniowy przy t_b) | **WYRÓWNANE**: `ib_a` dopuszczony addytywnie; zero duplikacji fizyki (tylko odczyt) |
| Dobór aparatów (`application/equipment_proof/generator.py`) | required_fault_results: ikss_ka (Icu), idyn_ka/ip_ka proxy (Idyn), ith_ka+tk_s (Ith) — porównania bez fizyki | porównanie I²t przy t_th_s ≠ tk_s (dziś świadomy FAIL „brak przeskalowania czasowego (future)") | **OK** (czyta kontrakt). Delta produktowa: F1 `i2t_ka2s` umożliwia domknięcie przez porównanie I²t — zmiana werdyktów pakietu = decyzja właściciela, osobna karta |
| Termika | brak osobnego modułu; termika = Ith/I²t w equipment_proof + bilans I²t w wierszach kanonicznych | — | **OK** — I²t w raportach po W-D; nie fabrykujemy nowego modułu |
| Porównania SC (`domain/sc_comparison.py`, `application/comparison/service.py`) | delty ikss/ip/ith/ib/sk/kappa — FROZEN 1:1 | pola bilansu (Rk/Xk/\|Zk\|/I²t) w deltach | **OK**. Delta opcjonalna: rozszerzenie porównań o bilans — osobna karta produktowa |
| Analizy pochodne (grid_strength, migotanie, sanity_bounds, arc_flash_view, wniosek_osd) | wiersze kanoniczne (`build_short_circuit_results`): sk_mva/ikss_ka | nic | **OK** (wzorzec kanoniczny) |
| Eksport projektu ZIP (`application/project_archive`) | nie serializuje wyników SC (eksport modelu/projektu) | — | n/d |

**GAP (duplikacja fizyki u konsumenta) — NAPRAWIONY U ŹRÓDŁA (karta S-A,
2026-07-22):**

- ~~`backend/src/application/proof_engine/proof_generator.py:711–748`
  (`generate_sc1_proof`): ścieżka SC1 liczy w warstwie proof engine Z_ekw ze
  składowych, prądy składowe/fazowe, Ik″, κ, ip, I_th~~ → fizyka przeniesiona
  VERBATIM (bit-w-bit) do warstwy solverów:
  `network_model/solvers/short_circuit_asymmetrical_quantities.py`
  (`compute_sc1_asymmetrical_quantities`). Generator dowodu SC1 = czysty
  formatter (wymaga `SC1Input.quantities` z solvera; brak → ValueError);
  pakiet `packs/sc_asymmetrical.py` woła solver i przekazuje wynik (wzorzec
  1:1 z pakietem SC3F). Fingerprinty dowodów SC1 BEZ ZMIAN — goldeny
  `tests/golden/sc_asymmetrical/**` nietknięte (dowód bajt-w-bajt); nowy test
  `tests/proof_engine/test_sc1_not_a_solver.py` pilnuje, by proof engine nie
  liczył fizyki SC1. Solver FROZEN (`compute_1ph_short_circuit`) nietknięty —
  liczy inne wielkości brzegowe (I_th = Ik″·√tk vs normowe √(m+n) w dowodzie),
  więc odczyt z FROZEN result zmieniałby liczby dowodu (delta produktowa,
  świadomie NIE wykonana).

Excel: system nie ma eksportu wyników do XLSX (`xlsx_import` to import danych) —
zgodnie z zasadą zero fabrykacji nie tworzono nowego kanału w W-D; pozycja
„Excel" w F1↔F5 realizowana przez JSON/JSONL (pełne wiersze kanoniczne).

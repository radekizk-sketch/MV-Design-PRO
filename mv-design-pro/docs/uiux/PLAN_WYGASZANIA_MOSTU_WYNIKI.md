# PLAN WYGASZANIA MOSTU „POZOSTAŁE ANALIZY" (przestrzeń Wyniki) — E10/U5

**Status:** WIĄŻĄCY plan operacyjny (zarządca, 2026-07-17) · podporządkowany
`PROGRAM_UIUX_2026-07.md`. Aktualizowany po każdej fali.

## 1. Stan zastany
Zakładka „Pozostałe analizy" warsztatu wyników renderuje
`LegacyPowierzchniaTrasowa` (`ui2/legacy/LegacySurface.tsx:77-79`) →
`WorkspaceSurfaceRouter` (`ui/workspace/WorkspaceSurfaceRouter.tsx`) — pełny
router powierzchni mostu (20+ Surface). Nowa powłoka przejęła już: rozpływ,
zwarcia, dowód (E9.1), jakość (W-607), porównania A/B (PF+SC), strumień OZE
(9 zakładek), zgodność powykonawczą, wniosek OSD.

## 2. Inwentarz powierzchni mostu osiągalnych z „Pozostałych" (wyniki)
Grupa A — POKRYTE nową powłoką (do wygaszenia trasy, bez nowego kodu):
AnalysisSurface (wyniki rozpływu/zwarć — dublują zakładki), ProofSurface
(dubluje E9.1), ComplianceSurface (dubluje macierz NC RfG — ZWERYFIKOWAĆ
zakres 1:1 przed wygaszeniem).
Grupa B — DO MIGRACJI (okna bez odpowiednika w ui2):
ConvergenceSurface (zbieżność solvera), SourceContributions (wkłady źródeł
zwarcia — częściowo w EkranZwarc, zweryfikować), SymmetricalComponentsSurface
(składowe symetryczne), ThermalDynamicSurface (I_dyn/I_th aparaty),
ZksnSurface (ziemnozwarciowe SN), PhaseStateSurface (stan fazowy SN),
DynamicStabilitySurface (stabilność RMS), V126AcademicSurface (akademicki
V12.6), FwSurface/BessSurface/DerSurface (karty instalacji — częściowo
w pulpicie OZE), VariantsSurface (warianty), ConvergenceSurface.
Grupa C — NIE-WYNIKOWE (należą do innych przestrzeni/wątków, NIE do tej
epiki): StationConfigurator/GpzConfigurator/BayConfigurator (model),
ProjectDashboard (projekt), CatalogHelper (katalog), OperationForm (model),
AuditTrail (dokumentacja), NopSurface/BranchSurface/BranchPoleSurface (model),
SLD-zależne (wątek SLD).

**Aktualizacja klasyfikacji Grupy B (W3, 2026-07-17 — rekonesans kodu):**
Rozdzielenie cienkich paneli kontraktu (`AnalysisContractPanel`) od pełnych
powierzchni z własnymi danymi/akcjami wykazało:
- **PhaseStateSurface** (E-… `WorkspaceSurfaceRouter.tsx:1924`) i
  **DynamicStabilitySurface** (:1950) — CIENKIE panele kontraktu (jedyne dane:
  `useAnalysisRunContract`; brak własnych akcji). POKRYTE 1:1 w oknie „Kontrakt
  analizy" ui2 (grupa „Stany i warianty", fala W3). Trasy legacy do fali W5.
- **ZksnSurface** — RE-KLASYFIKACJA do **Grupy C** (model, NIE wyniki). Opis
  „ziemnozwarciowe SN" był błędny: E-14 to konfigurator „Złącze kablowe SN"
  (`InfrastructureSurfaces.tsx:165`) mutujący model przez `openOperationForm`
  (`continue_trunk_segment_sn`, `start_branch_segment_sn`) — jak SnSegment/
  BranchPole/Branch. Poza epiką wyników.
- **V126AcademicSurface** (E-40…E-50) — PEŁNA powierzchnia (własne `fetch`
  `/api/cases/{id}/runs/v126/{analysis}`: run/result/proof/report, akcja
  „Uruchom analizę", 12 typów akademickich). Brak odpowiednika ui2; NIE cienki
  panel — parytet kontraktowy niemożliwy. Decyzja W4: zostawić w moście
  (ekspert/akademicki) do decyzji właściciela lub osobna przestrzeń akademicka.
- **FwSurface/BessSurface/PvSourceSurface (DerSurface)** (E-23/E-22/E-21) —
  PEŁNE konfiguratory instalacji OZE (`DerSurfaces.tsx`): dane z
  `useStationDerStore`+katalog, akcje `attachDer`/`updateDerCatalogs`/
  `updateDerReadiness` (mutacja modelu). Konfiguracja = Grupa C (model/OZE).
  Prezentacja wynikowa/zgodności modułów pokryta pulpitem OZE ui2
  (`ui2/oze/pulpit/PulpitOze.tsx`, read-only klasa+status NC RfG). Rekomendacja:
  zostawić most jako konfigurator; nie migrować w tej epice wyników.
Wniosek: po W3 wszystkie CIENKIE panele kontraktu Grupy B są pokryte oknem
„Kontrakt analizy" ui2 (W1: Symmetrical/ThermalDynamic/Convergence; W2:
SourceContributions; W3: PhaseState/DynamicStability). Pozostałe pozycje
Grupy B to powierzchnie PEŁNE (V126Academic) albo model (Zksn/OZE) — nie
podlegają parytetowi kontraktowemu.

## 3. Fale wygaszania (każda = karta z bramkami; kolejność wg wartości)
- **W1**: ThermalDynamicSurface + SymmetricalComponentsSurface → okna ui2
  (wzorzec EkranAnalizy/TabelaWynikow; dane z istniejących końcówek wyników).
- **W2**: ConvergenceSurface (zbieżność — okno diagnostyczne przebiegu) +
  SourceContributions (dopięcie do EkranZwarc, jeżeli niepełne).
- **W3**: ZksnSurface + PhaseStateSurface (analizy SN specjalistyczne).
- **W4**: DynamicStabilitySurface + V126AcademicSurface (ekspert/akademicki
  — decyzja właściciela czy migrować, czy zostawić w moście trwale).
- **W5**: weryfikacja Grupy A i wygaszenie tras dublujących (po W1–W3);
  zakładka „Pozostałe" zostaje TYLKO z pozycjami Grupy C do czasu ich
  przestrzeni docelowych.
Zasada: żadna trasa nie znika, dopóki okno ui2 nie pokrywa funkcji 1:1
(zero utraty funkcji; inwentarz funkcji INWENTARZ_FUNKCJI_2026-07.md wiąże).

## 4. Rejestr wykonania
- **W1** (2026-07-17, commit lokalny `feat(ui2): sekcja kontraktu analizy w panelu
  przebiegów (W1)`): sekcja „Kontrakt analizy" w `ui2/spaces/obliczenia/przebiegi/
  SzczegolyPrzebiegu.tsx` — trzy grupy kontraktu wybranego przebiegu (Kontekst
  ogólny / Założenia rozpływu i zbieżności / Założenia zwarciowo-sieciowe)
  odwzorowujące treść cienkich paneli mostu `AnalysisContractPanel`
  (SymmetricalComponents E-29, ThermalDynamic E-34, Convergence — `ui/workspace/
  WorkspaceSurfaceRouter.tsx:2396-2575`). Hook read-only `useAnalysisRunContract`
  i formatery `formatContractValue`/`formatCompletenessStatus` REUŻYTE BEZ ZMIAN
  z `ui/workspace/analysisRunContract.ts` (zero importu komponentów mostu, zero
  fizyki, etykiety PL 1:1 z mostem, wartości brakujące → „Do konfiguracji").
  Sekcja zwijana: domyślnie zwinięta w trybie podstawowym, rozwinięta
  w zaawansowanym. Testy Vitest: +9 (łącznie 17 w pliku panelu), pełny bieg
  8656 passed / 0 failed. **MiniSldCard pozostaje w wątku SLD (poza zakresem
  tej karty).** Pokrycie treści kontraktowych paneli mostu: 1:1; trasy legacy
  paneli mostu zostają do fali W5 (zasada pokrycia 1:1).
- **W2** (2026-07-17, zarządca — mikro-delta): rekonesans wykazał, że
  ConvergenceSurface i SourceContributionsSurface to te same cienkie panele
  `AnalysisContractPanel` co fala W1 (dane wkładów zwarciowych od dawna
  w `EkranZwarc.tsx:45-100`). Wiersze zbieżności pokryła już sekcja W1;
  do pełnego parytetu panelu „Wkłady źródeł rozszerzone"
  (`WorkspaceSurfaceRouter.tsx:2513-2531`) dodano dwa wiersze grupy
  ogólnej: „Rodzaj przypadku" (caseKind) i „Projekt" (lineage.project_ref)
  + test. Pokrycie W2: 1:1; trasy legacy zostają do W5.
- **W3** (2026-07-17, commit lokalny `feat(ui2): parytet pozostałych paneli
  kontraktu analizy (W3)`): (1) parytet ostatnich cienkich paneli mostu —
  PhaseStateSurface (`WorkspaceSurfaceRouter.tsx:1924`) i DynamicStabilitySurface
  (:1950). Nowa grupa „Stany i warianty" w sekcji „Kontrakt analizy"
  (`ui2/spaces/obliczenia/przebiegi/SzczegolyPrzebiegu.tsx`) z czterema wierszami
  nieobecnymi w W1/W2: „Identyfikator przypadku" (caseRef), „Brama jakości"
  (qualityGate), „Kompletność zgodności przejściowej" (completenessLegacy),
  „Scenariusz zakłócenia" (assumptions.fault_scenario_ref). Pozostałe pola tych
  paneli (rodzaj przypadku, wersja układu, stan łączników, założenia źródeł,
  zakres stosowalności) już pokryte grupami ogólną/zwarciową — bez duplikatów.
  Hook `useAnalysisRunContract` i `formatContractValue` reużyte BEZ ZMIAN (zero
  importu komponentów mostu, zero fizyki, etykiety PL 1:1 z mostem, brak →
  „Do konfiguracji"). Testy Vitest przez realny `formatContractValue`: +6
  (łącznie 24 w pliku panelu); pełny bieg 8663 passed / 0 failed (baza 8657).
  (2) Klasyfikacja pełnych powierzchni — patrz §2 „Aktualizacja klasyfikacji
  Grupy B (W3)": ZksnSurface → Grupa C (model, re-klasyfikacja), V126Academic →
  pełna (decyzja W4), Fw/Bess/Der → konfiguratory OZE (Grupa C; wyniki w pulpicie
  OZE). Pokrycie cienkich paneli W3: 1:1; trasy legacy zostają do W5.
- **W5a** (2026-07-17, commit lokalny `docs(uiux): audyt pokrycia Grupy A mostu
  wyników (W5a)`): AUDYT read-only pokrycia 1:1 trzech powierzchni Grupy A
  (`ui/workspace/WorkspaceSurfaceRouter.tsx`) względem okien ui2. ZERO zmian
  w src, ZERO wygaszania tras (decyzja o wygaszeniu = osobna karta W5b). Pełne
  tabele funkcja→odpowiednik(plik:linia)→werdykt w raporcie wykonawcy. Skrót
  werdyktów:
  | Powierzchnia mostu | Rdzeń (co dubluje okno ui2) | Werdykt rdzenia | Funkcje bez odpowiednika ui2 | Rekomendacja trasy |
  |---|---|---|---|---|
  | AnalysisSurface (`:902`) | Tabela wyników rozpływ/zwarcia → `EkranRozplywu`/`EkranZwarc` (ui2 = SUPERSET: Szyny+Gałęzie+profil, Ik″/ip/Ith/Sk+wkłady); zakł. `compare`/`comparison_wizard`→`porownanie`, `ncrfg-tests`→`macierz`, `trace`→`dowod` | POKRYTE | Zakładka „Analiza wrażliwości" (`:1034`, `SensitivityPanel` — pusty stub, brak okna ui2); hub nawigacyjny do Grupy B (E-31/E-32/E-33/E-34) | NAJPIERW DOMKNĄĆ (potwierdzić status stubu wrażliwości; hub = nie-funkcja wynikowa) |
  | ProofSurface (`:2576`) | Ślad WHITE BOX + LaTeX (`ElementCalculationProofPanel`+`ProofLatexPanel`) → `DowodPrzebiegu`/`PrzegladDowodu` (kanon 5 pól) | POKRYTE (fokus per-element = TODO-KARTA w DowodPrzebiegu) | Generator „Uzasadnienia rozszerzonej walidacji" (`:2659`), „Rozpływ mocy rozszerzony" (`:2747`), lista 12 typów pakietów (`:2830`), kontekst DER (`:2632`); wiersz „Wersja katalogu" w kontrakcie | NAJPIERW DOMKNĄĆ / rozważyć reklasyfikację akcji audit2 do przestrzeni dokumentacji (analogia V12.6) |
  | ComplianceSurface (`:1862`, E-26) | Krzywe FRT/LVRT/HVRT + wybór profilu OSD (PSE/Energa/Tauron/Enea/PGE) → `EkranFrt` (`ui2/oze/frt`, SUPERSET: dobór modułu+operatora+LVRT/HVRT, realny bieg, werdykt, sekwencje) | POKRYTE | Kontrakt zgodności: wiersze „Wariant" i „Model IBG/OZE" (`ibg_assumptions_ref`) nieobecne w „Kontrakcie analizy" ui2 | WYGASIĆ TERAZ (rdzeń FRT = superset w EkranFrt; luka kontraktu = drobna, wartości ref) |

  KOREKTA MAPOWANIA (istotna): rdzeń ComplianceSurface (E-26) to KRZYWE FRT/HVRT
  — właściwym odpowiednikiem ui2 jest `EkranFrt` (`ui2/oze/frt`), NIE macierz
  NC RfG. Macierz NC RfG (`ui2/oze/macierz/MacierzNcRfg.tsx`) pokrywa osobną
  powierzchnię mostu — `NcRfgTestsTab` (`ui/workspace/surfaces/NcRfgTestsTab.tsx`,
  osiągalną z AnalysisSurface zakł. `ncrfg-tests`) — i robi to jako SUPERSET
  (macierz wymogów×modułów, werdykty solvera, edycja zdolności, certyfikat PDF/DOCX).
  Wniosek: NcRfgTestsTab → POKRYTE przez macierz (WYGASIĆ z osobną kartą).
  Propozycje kart domykających: **W5b-S1** — okno „Analiza wrażliwości" w ui2
  (albo formalne uznanie panelu mostu za niedostarczony stub → wtedy trasa
  AnalysisSurface do wygaszenia bez okna); **W5b-P1** — decyzja właściciela ws.
  akcji audit2 z ProofSurface (generator pakietu walidacji + rozpływ rozszerzony):
  migracja do przestrzeni „Dokumentacja"/„Obliczenia" albo trwałe zostawienie
  w moście (jak V12.6); **W5b-K1** (drobna) — uzupełnić „Kontrakt analizy" ui2
  o wiersze `ibg_assumptions_ref`, `variantRef`, `reproducibility.catalogSnapshotRef`.

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

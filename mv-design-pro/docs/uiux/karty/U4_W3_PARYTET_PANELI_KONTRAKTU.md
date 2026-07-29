# KARTA ZADANIA W3 — PARYTET POZOSTAŁYCH CIENKICH PANELI KONTRAKTU + KLASYFIKACJA (wygaszanie mostu, fala W3)

**Faza:** U4/U5 · **Plan:** `docs/uiux/PLAN_WYGASZANIA_MOSTU_WYNIKI.md` ·
**Wykonawca:** Opus · **Warstwa:** frontend · **Wiążące:** CLAUDE.md (etykiety
PL; granica SLD; ZERO importu komponentów mostu — tylko hook/typy/formatery).

## 1. Cel (dwie części)
1. **Parytet cienkich paneli**: sekcja „Kontrakt analizy"
   (`ui2/spaces/obliczenia/przebiegi/SzczegolyPrzebiegu.tsx`, fale W1/W2)
   ma pokryć wiersze WSZYSTKICH pozostałych cienkich paneli
   `AnalysisContractPanel` z routera mostu
   (`ui/workspace/WorkspaceSurfaceRouter.tsx`): PhaseStateSurface (:1920),
   DynamicStabilitySurface (:1946), VariantsSurface (:1753 — ZWERYFIKUJ czy
   cienki), oraz każdy inny cienki panel znaleziony w routerze (przejrzyj
   wszystkie `AnalysisContractPanel` i porównaj z już pokrytymi W1/W2).
   Wiersze DODAWAJ do istniejących grup (lub nowej grupy „Stany i warianty"
   jeżeli tematycznie odrębne); bez duplikatów; testy przez realny
   `formatContractValue` (wzorzec z W2, test `szczegolyPrzebiegu.test.tsx`).
2. **Klasyfikacja pełnych powierzchni** (RAPORT, bez implementacji):
   ZksnSurface, V126AcademicSurface, FwSurface, BessSurface, DerSurface
   (pliki `ui/workspace/surfaces/DerSurfaces.tsx`,
   `InfrastructureSurfaces.tsx`, `V126AcademicSurface.tsx`) — dla każdej:
   cienka (kontrakt) czy pełna (własne dane/akcje)? jakie źródła danych?
   czy funkcje są już pokryte oknami ui2 (pulpit OZE, EkranZwarc, …)?
   rekomendacja migracji do W4 (migrować / zostawić w moście / pokryte).
   Wynik jako sekcja w raporcie końcowym + wpis do
   `PLAN_WYGASZANIA_MOSTU_WYNIKI.md` §2 (aktualizacja klasyfikacji Grupy B)
   i §4 (rejestr W3).

## 2. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD`. Baza vitest: 8657, ZERO failed. Środowisko: symlink
node_modules (NIE commituj); pętla `until` przed pełnym vitest; pełny vitest
do pliku (usuń przed commitem); NIE edytuj src w trakcie; po biegu
NATYCHMIAST commit. Bramki (pipefail, z frontend/): type-check, lint
--max-warnings 0, PEŁNY npm test ZERO failed (testy nowych wierszy ≥6),
guard:codenames; z mv-design-pro: forbidden_ui_terms, ui_terminology,
utf8_mojibake. NIE dotykaj SLD ani plików mostu. Commit:
`feat(ui2): parytet pozostałych paneli kontraktu analizy (W3)` BEZ push.
Raport standardowy (plik:linia + klasyfikacja z §1.2).

# KARTA ZADANIA W5b-1 — WYGASZENIE TRASY E-26 „Compliance" (Opcja 1, za Bramką Parytetu)

**Faza:** U5 · **Plan:** `docs/uiux/PLAN_WYGASZANIA_MOSTU_WYNIKI.md` (§3a Bramka
Parytetu, §3c Opcja 1) · **Wykonawca:** Opus · **Warstwa:** frontend ·
**Wiążące:** CLAUDE.md; DECYZJA WŁAŚCICIELA D1=A + Opcja 1 (2026-07-17); granica
SLD. Kanon V12.xx = ZAMROŻONE źródło prawdy — E-26 POZOSTAJE ekranem kanonicznym.

## 0. Metoda (Opcja 1 — WIĄŻĄCA)
Wygaszamy WYŁĄCZNIE punkt wejścia i implementację legacy; ekran kanoniczny E-26
ZOSTAJE (rejestr, macierz, label, transitions — testy kanonu to wymuszają:
`screen-canon-registry`, `coverage-matrix`, `workspace-screen-router`). Dostawcą
zdolności FRT/LVRT/HVRT jest ui2 `EkranFrt` (zakładka `frt` warsztatu wyników).

## 1. Bramka Parytetu (MUSI przejść PRZED usunięciem — §3a planu)
Raport z DOWODEM (tabela funkcja→odpowiednik plik:linia) że `EkranFrt`
(`ui2/oze/frt/EkranFrt.tsx`) pokrywa `ComplianceSurface` (E-26,
`WorkspaceSurfaceRouter.tsx:1862-1918`) 1:1:
1. **100% kontraktu** — krzywe FRT/LVRT/HVRT, selektor profilu OSD, obwiednia,
   werdykt pozostania przyłączonym — każda funkcja ma odpowiednik w `EkranFrt`,
2. **Identyczny payload API** — `EkranFrt` woła te same/lepsze końcówki
   (frt-trajectories) — udokumentuj,
3. **Identyczne/lepsze wyniki** — `EkranFrt` = superset (realny bieg trajektorii),
4. **Brak utraty akcji** — każda akcja E-26 osiągalna w `EkranFrt`,
5. **Brak regresji UI** — pełny vitest ZERO failed,
6. **E2E + regresja** — uruchom właściwe scenariusze E2E (Playwright) dotyczące
   FRT/warsztatu wyników; jeśli infrastruktura E2E nie startuje w worktree —
   zgłoś to WPROST w raporcie (nie udawaj sukcesu), wykonaj regresję vitest.
Bez kompletu 1–6 NIE usuwać niczego.

## 2. Zakres usunięcia (po Bramce)
1. Usuń przycisk nawigacyjny „Charakterystyki FRT/LVRT/HVRT" z AnalysisSurface
   (`WorkspaceSurfaceRouter.tsx:973-980`) — to punkt wejścia legacy do E-26.
2. Martwą trasę `case 'E-26' → <ComplianceSurface>` (`:3110-3111`) oraz komponent
   `ComplianceSurface` (`:1862-1918`) usuń TYLKO jeśli po usunięciu WSZYSTKIE
   testy kanonu i `type-check` są zielone bez zmiany asercji kanonu ani
   `SURFACE_REGISTRY`/`SCREEN_MATRIX`. Jeżeli usunięcie wymaga tknięcia
   `screenCanonRegistry.ts` (typ `ScreenCode`, rejestr), macierzy pokrycia
   albo asercji testów kanonu — **STOP, ZOSTAW trasę/komponent (nieosiągalne
   z mostu po usunięciu przycisku) i ZGŁOŚ w raporcie do eskalacji.** Nie
   edytuj kanonu ani jego testów.
3. Jeśli macierz pokrycia (`coverageMatrix.ts:36`, wiersz E-26) opisuje panel/
   klik/dostawcę legacy — zaktualizuj OPIS na ui2 `EkranFrt` (status „pełne
   pokrycie" bez zmian), o ile testy macierzy na to pozwalają bez zmiany asercji.
4. Wpis W5b-1 do `PLAN_WYGASZANIA_MOSTU_WYNIKI.md` §4 (data, commit, wynik
   Bramki Parytetu, co usunięto / co zostało nieosiągalne).

## 3. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD`. Baza vitest: 8690, ZERO failed. Środowisko: symlink
node_modules (NIE commituj); **PRZED pełnym vitest** `until ! ps aux | grep -E
"vitest|pytest" | grep -v grep > /dev/null; do sleep 30; done` (w tle biegnie
konfirmacja zarządcy — POCZEKAJ aż zejdzie); pełny vitest do pliku (usuń przed
commitem); NIE edytuj src w trakcie; po biegu NATYCHMIAST commit. Bramki
(pipefail, z frontend/): type-check, lint --max-warnings 0, PEŁNY npm test ZERO
failed (w tym WSZYSTKIE testy kanonu), guard:codenames; z mv-design-pro:
forbidden_ui_terms, ui_terminology, utf8_mojibake, dead_click_guard,
`python scripts/v12xx_canon_guard.py`. NIE dotykaj SLD. Commit:
`feat(ui2): wygaszenie trasy legacy E-26, dostawca FRT = EkranFrt (W5b-1)`
BEZ push. Raport: tabela Bramki Parytetu, co usunięto/zostało, wynik E2E
(lub uczciwe „infra niedostępna"), guardy kanonu.

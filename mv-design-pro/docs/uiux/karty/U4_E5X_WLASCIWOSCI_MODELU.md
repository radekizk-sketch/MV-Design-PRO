# KARTA ZADANIA E5.x — ZAKŁADKA „WŁAŚCIWOŚCI" W PRZESTRZENI MODELU (property grid)

**Faza:** U2/U4 · **Epik:** E5 · **Wykonawca:** Opus · **Warstwa:** frontend ·
**Wiążące:** CLAUDE.md (ZERO fizyki; etykiety PL; granica SLD — NIE dotykaj
`ui/sld/**`, `ui/sld-editor/**`, `engine/sld-layout/**`; edycja modelu
WYŁĄCZNIE przez istniejące operacje domenowe property grida — zero nowych
ścieżek mutacji).

## 1. Cel
Przejęcie okna właściwości elementu przez nową powłokę: zakładka
„Właściwości" w `ui2/spaces/model/ModelWarsztat.tsx` (za „Schemat")
renderująca ISTNIEJĄCY `PropertyGridContainer`/`PropertyGrid(MultiEdit)`
z `ui/property-grid/` (reuse całego modułu jak powierzchnia — dopuszczalny
import komponentów tego modułu, bo to przejmowane okno, nie most-router;
ZBADAJ jego kontrakt: skąd bierze selekcję (`ui/selection`?), snapshot,
jak zapisuje (operacje domenowe), czy działa bez SLD na ekranie).

## 2. Zakres
1. Zakładka `wlasciwosci` w ModelWarsztat (strings PL, testid
   `mvd-model-zakladka-wlasciwosci`, wzorzec istniejących zakładek
   z klawiaturą); treść: kontener property grida + uczciwy stan pusty PL
   „Zaznacz element na schemacie…" gdy selekcja pusta (selekcja ze
   wspólnego store — ZBADAJ `ui/selection`); multi-edit gdy zaznaczono
   wiele (istniejący `PropertyGridMultiEdit`).
2. ZERO zmian w samym module `ui/property-grid` poza — jeżeli konieczne —
   chirurgicznym exportem; zachowanie mostu bez regresji (grid dalej działa
   tam, gdzie był).
3. Testy Vitest ≥ 8: zakładka renderuje się i przełącza (klawiatura bez
   regresji), stan pusty bez selekcji, grid montuje się z selekcją
   (mock store selekcji + snapshot fixture), multi-edit przy wielu
   elementach, etykiety PL, istniejące testy ModelWarsztat i property-grid
   bez regresji.

## 3. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD`. Baza vitest: 8664, ZERO failed. Środowisko: symlink
node_modules (NIE commituj); pętla `until` przed pełnym vitest; pełny vitest
do pliku (usuń przed commitem); NIE edytuj src w trakcie; po biegu
NATYCHMIAST commit. Bramki (pipefail, z frontend/): type-check, lint
--max-warnings 0, PEŁNY npm test ZERO failed (twoje ≥8), guard:codenames;
z mv-design-pro: forbidden_ui_terms, ui_terminology, utf8_mojibake,
dead_click_guard. NIE dotykaj SLD. Commit:
`feat(ui2): zakładka właściwości modelu z property gridem (E5.x)` BEZ push.
Raport standardowy (plik:linia; kontrakt selekcji/zapisu property grida).

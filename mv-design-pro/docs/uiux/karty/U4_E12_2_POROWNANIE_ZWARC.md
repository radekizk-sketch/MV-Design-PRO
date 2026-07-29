# KARTA ZADANIA E12.2 — PORÓWNANIE A/B ZWARĆ (TODO E12.1)

**Faza:** U4 · **Epik:** E12 · **Wykonawca:** Opus · **Warstwa:** frontend ·
**Wiążące:** CLAUDE.md (ZERO fizyki w UI — delty liczy backend; etykiety
WYŁĄCZNIE PL; granica SLD — nakładka delta na SLD POZA zakresem, zostaje
w rejestrze kart koordynacyjnych), wzorce: `ui2/wyniki/porownanie/`
(E12.1 — rozpływ), wzorzec `TabelaWynikow`.

## 1. Cel
Rozszerzenie zakładki „Porównanie A/B" o tryb ZWARCIOWY: wybór dwóch
zakończonych przebiegów zwarciowych i tabela delt per punkt (Ik'', ip, Ith,
Sk) z deltami Z BACKENDU.

## 2. Zakres
1. RECON obowiązkowy (wynik w raporcie, plik:linia): backend ma DWIE ścieżki
   porównań — `api/comparison.py` (`POST /api/comparison/...`,
   `CompareRunsRequest` run_a/run_b, `NumericDeltaResponse`) oraz
   `api/batch_execution.py` (`ScComparisonService`:43, create/get/list
   comparisons:334-451 + delta overlay). WYBIERZ ścieżkę, która daje delty
   zwarciowe per węzeł bez nowego kodu backendowego; jeżeli ŻADNA nie daje
   pełnych delt per punkt — STOP dla tej części, zgłoś w raporcie zamiast
   liczyć delty we froncie (No-Physics/zero liczenia w UI; dopuszczalna
   JEDYNIE prezentacyjna różnica dwóch wartości już zwróconych przez
   backend dla tych samych punktów, z komentarzem w kodzie).
2. `ui2/wyniki/porownanie/`: przełącznik trybu „Rozpływ / Zwarcia"
   (dzisiejsze zachowanie = tryb rozpływu, bez regresji); tryb zwarć:
   selektory dwóch przebiegów SC (runStore, filtr `SC_*`/DONE, etykiety
   z nazwą przypadku — wzorzec z konsolidacji TODO), tabela punktów
   (`TabelaWynikow`): Ik''_A, Ik''_B, ΔIk'' (+%), analogicznie ip/Ith/Sk,
   wiersze bez odpowiednika w drugim przebiegu — uczciwie oznaczone;
   stany puste PL; błędy API PL.
3. Testy Vitest ≥ 10: tryb rozpływu bez regresji, przełącznik, selektory
   filtrują SC, tabela delt z fixture 1:1 z kontraktem wybranej końcówki,
   punkt bez odpowiednika, stany puste, błąd API PL, formaty PL.

## 3. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD`. Baza vitest: 8588, ZERO failed. Środowisko: symlink
node_modules (NIE commituj); PRZED pełnym vitest pętla `until` na brak innych
pełnych suit; pełny vitest z przekierowaniem do pliku (log usuń przed
commitem); NIE edytuj src w trakcie; po biegu NATYCHMIAST commit. Bramki
(pipefail, z frontend/): type-check, lint --max-warnings 0, PEŁNY npm test
ZERO failed (twoje ≥10), guard:codenames; z mv-design-pro:
forbidden_ui_terms, ui_terminology, utf8_mojibake. NIE dotykaj SLD. Commit:
`feat(ui2): porównanie A/B zwarć (E12.2)` BEZ push. Raport standardowy
(w tym rozstrzygnięcie recon ścieżki backendu).

# KARTA ZADANIA E9.1 — PRZEGLĄD DOWODU / ŚLAD OBLICZEŃ (W-608) W NOWEJ POWŁOCE

**Faza:** U3 · **Epik:** E9 · **Wykonawca:** Opus · **Zależność:** wzorzec E8.1 scalony
(nagłówek/założenia — reużycie typów; sam dowód NIE jest tabelą). **Wiążące:**
`MODEL_INTERAKCJI` §2 (2×klik na liczbie → dowód; z dowodu → element na schemacie przez
selekcję) i §2.7, `AUDYT_RADY_SPECJALISTOW` (W-608: krok = Wzór → Dane → Podstawienie →
Wynik → Weryfikacja jednostek; audytor WHITE BOX), CLAUDE.md (WHITE BOX, LaTeX-only math,
NOT-A-SOLVER, determinizm).

## 1. Cel
Okno „Dowód obliczeń" w nowej powłoce: przegląd śladu WHITE BOX przebiegu — spis kroków
(nawigowalny), widok kroku w kanonie pięciu pól, metadane przebiegu, powiązanie krok ↔
element modelu (selekcja przez magistralę). Read-only nad istniejącym śladem; zero fizyki.

## 2. Dane (rekonesans wykonany — mapowania wiążące)
- Ślad: `fetchExtendedTrace(runId)` → `GET /analysis-runs/{run_id}/trace-extended`
  (`ui/results-inspector/api.ts` — sprawdź dokładną ścieżkę w pliku) → `ExtendedTrace`
  (`ui/results-inspector/types.ts:338-354`): `white_box_trace: TraceStep[]`,
  `selection_index`, `catalog_context(_by_element)`, `input_hash`.
- Krok: `TraceStep` (`types.ts:194-244`): `step`, `title`, `formula_latex`, `inputs`
  (Record<string,TraceValue>), `substitution`, `result`, `notes`, `element_id`,
  `target_id`, `catalog_binding`. Etykiety pól PL: `TRACE_FIELD_LABELS` (`types.ts:289`),
  wielkości: `TRACE_VALUE_LABELS` (`types.ts:306`).
- Render matematyki: REUŻYJ `MathRenderer`/`MathBlock` z `ui/proof` (KaTeX; montaż bez
  modyfikacji — `ui/proof/index.ts:27`). Wszystkie wzory w LaTeX blokowym.
- Powiązanie z modelem: krok z `element_id` → akcja „Pokaż na schemacie" = emisja
  `{typ:'selekcja', obiektId, zrodlo:'dowod'}` przez `ui2/events` (odbiorca: AppRoot).

## 3. Pliki (TYLKO `frontend/src/ui2/wyniki/dowod/**` + ewentualny re-eksport w `ui2/wyniki/index.ts`)
`PrzegladDowodu.tsx` (kompozycja: nagłówek [analiza PL + FreshnessBadge przez propsy +
input_hash w trybie eksperckim], spis kroków [lewa kolumna, zwijany], widok kroku),
`KrokDowodu.tsx` (kanon: Wzór → Dane wejściowe → Podstawienie → Wynik → Uwagi; każde pole
z etykietą PL; jednostki przy wartościach; brak pola → pole pominięte, bez atrap),
`SpisKrokow.tsx` (numeracja, tytuły PL, nawigacja klawiaturą, krok aktywny),
`dowodModel.ts` (typy + adapter read-only `mapujKroki` nad `TraceStep[]` — dane przez
props: ładowanie śladu wpina zarządca przy scaleniu jak w E8.1), `strings.ts`,
`dowod.css` (tokeny --mvd-*), `index.ts`, `__tests__/` (≥ 20 testów; fixture 1:1
z realnym kształtem `TraceStep` — w tym krok bez `formula_latex`, krok z `element_id`,
wartości z jednostkami i bez).

## 4. Zasady i kryteria
Identyfikatory (`element_id`, `input_hash`, klucze wielkości) wyłącznie w trybie
eksperckim; w trybach podstawowym/rozszerzonym etykiety PL z `TRACE_VALUE_LABELS`
(fallback dla nieznanego klucza: pokaż klucz TYLKO w trybie eksperckim, w podstawowym
pomiń wiersz — zero zgadywania etykiet). Kryteria: (1) spis kroków + wybór kroku
(mysz/klawiatura) renderuje kanon pięciu pól, (2) LaTeX przez MathRenderer (test: wzór
obecny w DOM; bez porównywania renderu KaTeX), (3) „Pokaż na schemacie" emituje selekcję
ze źródłem 'dowod' (test na magistrali), (4) stany: pusty ślad („przebieg bez śladu
obliczeń"), ślad w trakcie ładowania — przez props, (5) pełne bramki jak E1.1 §8
(pipefail; pełny vitest foreground). Commit
`feat(ui2/wyniki): przegląd dowodu obliczeń w nowej powłoce (E9.1)` BEZ push.
Raport standardowy z mapowaniami plik:linia.

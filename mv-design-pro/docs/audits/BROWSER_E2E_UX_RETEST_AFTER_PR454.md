# Browser E2E UX Retest After PR #454

Data sesji: 2026-05-08. Narzędzie: Codex in-app browser przez `browser-use:browser`.
Lokalny URL: `http://127.0.0.1:5173`.

## Przejście wykonane w przeglądarce

1. Start aplikacji i pulpit projektu.
2. Utworzenie projektu `E2E UIUX ...`.
3. Wejście do SLD.
4. Uruchomienie ścieżki budowy GPZ.
5. Dodanie GPZ z kreatora.
6. Wyprowadzenie odcinka SN z pola.
7. Wybór kabla z katalogu YAKXS.
8. Wstawienie stacji SN/nN na odcinku.
9. Otwarcie gotowości obliczeń.
10. Próba przejścia do analiz i raportu.

## Defekty znalezione i naprawione

| ID | Ekran | Objaw | Naprawa | Test |
|---|---|---|---|---|
| E2E-020 | Nowy projekt / SLD | Po utworzeniu nowego projektu SLD pokazywał snapshot poprzedniego projektu. | `setActiveProject` resetuje teraz `useSnapshotStore` i live readiness przy zmianie projektu. | `src/ui/app-state/__tests__/store.test.ts` |
| E2E-021 | Model sieci / start zakresu | Klik „Utwórz projekt i przejdź do GPZ” nadpisywał nazwę już utworzonego projektu na „Sieć SN - projekt roboczy”. | Panel rozpoznaje istniejący projekt i tworzy tylko zakres obliczeń. | `AreaContextPanel.test.tsx` |
| E2E-022 | Górny pasek / gotowość | „Sprawdź braki” zostawiał lewy panel w kontekście raportów, mimo że prawy panel pokazywał gotowość modelu. | Akcja readiness ustawia obszar `MODEL_SIECI`. | Browser-use retest + testy TopBar/Workspace |
| E2E-023 | Górny pasek / eksport | „Eksport” nie dawał czytelnego przejścia do raportu w aktualnym flow. | Akcja `export` prowadzi do trasy raportu i obszaru `RAPORTY_UZASADNIENIA`. | Browser-use retest + `no-dead-clicks` |
| E2E-024 | E-04 gotowość | Przycisk naprawy miał długą etykietę techniczną „Napraw: ...”, przez co lista była nieczytelna. | Wprowadzono krótki przycisk „Napraw teraz” i opis akcji obok. | `ModelGapsSurface.test.tsx` |
| E2E-025 | SLD GPZ | Komunikaty „Strona 110 kV — brak danych ENM” i „Brak transformatorów w ENM” były zbyt duże i zasłaniały schemat/stację. | Zamieniono je na kompaktowe badge w rendererze GPZ. | `GpzCanonicalRenderer.test.tsx` |
| E2E-026 | Analizy | Widoczne etykiety miały błędy kodowania i brzmiały nieinżyniersko: „Przejscia”, „Rozplyw”, „Stabilnosc”, „Wklady zrodel”. | Poprawiono polskie etykiety i komunikat pustego widoku analityki. | `workspaceShellV125.test.tsx` |
| E2E-027 | Prawy panel | Nagłówek „Wlasciwosci” i aria-label bez polskich znaków obniżały czytelność. | Zmieniono nagłówek na „Inspektor techniczny” i poprawiono etykiety zwijania panelu. | type-check |

## Obserwacje UX do dalszej przebudowy

| Krok | Co nadal obniża UX | Priorytet |
|---|---|---|
| Start / projekt | Pulpit projektu jest osadzony w aktywnym shellu, więc przy istniejącym projekcie użytkownik widzi mieszany kontekst. | Wysoki |
| ProjectMetadataModal | Etykiety pól są widoczne, ale nie wszystkie są programowo powiązane z inputami; utrudnia to klawiaturę i testy. | Wysoki |
| Budowa GPZ | Formularz GPZ ma zbyt długą listę katalogową i słaby feedback zapisu. | Wysoki |
| Odcinek SN | Wpisanie frazy w wyszukiwarkę katalogu pokazuje wynik, ale nie zatwierdza wyboru; użytkownik nie wie, że musi kliknąć wynik. | Wysoki |
| Stacja SN/nN | Dwa widoczne przyciski mają tę samą nazwę „Wstaw stację na odcinku”; submit formularza potrzebuje unikalnej etykiety. | Średni |
| Gotowość E-04 | Blockery wskazują element i mają akcję, ale pełne click-to-field dla łączników/pól nadal wymaga dopięcia do właściwej karty katalogowej. | Wysoki |
| Analizy | Widok analityczny nadal jest bardziej launcherem niż decyzją techniczną; przed wynikami powinien pokazywać „co blokuje obliczenia”. | Wysoki |
| Raport | Raport jest osiągalny z eksportu, ale eksport PDF/DOCX/JSON/LaTeX wymaga pełnego przejścia po zielonej gotowości i aktywnym obliczeniu. | Wysoki |

## Walidacja po naprawach

```bash
cd mv-design-pro/frontend
npm test -- src/ui/app-state/__tests__/store.test.ts src/ui/shell/context-panels/__tests__/AreaContextPanel.test.tsx src/ui/workspace/__tests__/ModelGapsSurface.test.tsx src/ui/workspace/__tests__/workspaceShellV125.test.tsx src/ui/sld/v2/renderer/__tests__/GpzCanonicalRenderer.test.tsx src/ui/shell/__tests__/TopBar.test.tsx src/ui/shell/__tests__/no-dead-clicks-in-primary-workflow.test.tsx
```

Wynik: 7 plików, 132 testy przeszły.

```bash
cd mv-design-pro/frontend
npm run type-check
```

Wynik: przeszedł.

## Status

Ten dokument nie oznacza pełnego końca E2E. Naprawiono najgorsze konflikty kontekstu ze zrzutu użytkownika i potwierdzono je w in-app browserze, ale pełny release-gate wymaga jeszcze domknięcia:

- przypisania katalogów łączników z poziomu blockera,
- kompletnego przejścia od naprawy blockerów do obliczeń,
- wyników i raportu z eksportami,
- uporządkowania całego workflow shell-a do docelowego standardu operator-grade.

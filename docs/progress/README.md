# MV-DESIGN PRO — monitor postępu inżynierskiego

Dostęp: panel GitHub Pages (po scaleniu i włączeniu źródła GitHub Actions w Settings → Pages).
Źródło: repozytorium radekizk-sketch/MV-Design-PRO, gałąź main. Otwarta strona odświeża dane co 120 sekund. Przycisk „Odśwież” pobiera dane natychmiast.

## Jedna prawda o planie

Panel nie utrzymuje konkurencyjnej roadmapy. Parser tracker.mjs czyta bezpośrednio:
- mv-design-pro/docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md §5 (25 przyrostów), §7 (rejestr postępu i commitów);
- mv-design-pro/docs/plan/MAPA_DOMKNIECIA_PRODUKTU_2026-09.md §3 (12 domen), §3a (12 rodzin A–L), §8 (W1–W12);
- GitHub API: HEAD gałęzi main, wyniki 9 workflowów CI dla dokładnie tego commita, historia ostatnich commitów;
- docs/progress/odbior.json — formalne decyzje odbioru.

Zniknięcie przyrostu, wycinka, domeny lub rodziny z planu powoduje błąd parsowania, a nie ciche zaniżenie mianownika.

## Odbiór — żadnej samocertyfikacji

Wskaźnik procentowy liczy tylko formalnie odebrane przyrosty (licznik / 25, równe wagi). Sam wpis w §7 dokumentuje „ślad wdrożenia”, lecz nie oznacza odbioru. Wpis odbioru musi zawierać: id, commit (40 znaków SHA), dowody (ścieżki plików w repo), testy (ścieżki), przeglad (adres PR), kryteria — wszystkie 13 wymagane poniżej oznaczone true. Skrypt audit.mjs sprawdza istnienie plików, historię commitów i spójność deklaracji; licznik panelu wymaga także sukcesu wszystkich 9 kontroli CI bieżącego SHA.

Trzynaście kluczy obiektu kryteria:
- funkcja
- kanoniczny_enm
- brak_drugiej_prawdy
- przypadki_rzeczywiste
- niezalezna_wyrocznia
- testy_backendu
- testy_frontendu
- testy_e2e
- straznicy
- zdalne_ci
- ocena_interfejsu
- dokumentacja
- ograniczenia

Niezależny przegląd w PR ma wykazać prawdziwe dowody elektromatematyczne i fizyczne, proweniencję, obowiązujące normy, wyrocznie, deterministyczność i pełny przebieg od modelu ENM do wyniku/raportu. Automatyczna walidacja pól nie zastępuje oceny eksperta. Rejestr celowo startuje pusty: 0% oznacza brak formalnie odebranych przyrostów w nowym rejestrze, a nie brak funkcji systemu.

Klasyfikacje szczegółowych zdolności w mapie mają charakter historycznego pomiaru (wrzesień 2026 r.), więc panel wyraźnie oddziela je od bieżących wyników CI.

## Sprawdzenie

Z katalogu głównego repozytorium:

    node --test docs/progress/test-tracker.mjs
    node docs/progress/audit.mjs
    python -m http.server 8080 -d docs/progress

Panel lokalny: http://localhost:8080/

Workflow .github/workflows/progress-mv-design.yml uruchamia testy przy zmianach panelu w PR; po każdym push do main i po ukończeniu istniejących workflowów aktualizuje publikację GitHub Pages. Dodatkowo sama strona odpytuje GitHub bez zmiany repo po każdym odświeżeniu. Publiczny monitor nie prezentuje szczegółów poufnych projektów ani nazw obiektów z historii commitów.

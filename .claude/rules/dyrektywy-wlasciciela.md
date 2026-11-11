# Dyrektywy właściciela — projektowanie, wdrażanie i zasady inżynierskie (BINDING)

<!-- Przeniesione 1:1 z CLAUDE.md (karta CLAUDE-MD-ANTHROPIC, 2026-11-11): sekcje „Dyrektywy
     właściciela — projektowanie i wdrażanie", „Zasady inżynierskie" i akapit „Jeden wątek
     prowadzi wszystkie trzy programy" z dawnego „Project Status". Reguła bez `paths`: ładuje się
     przy starcie każdej sesji razem z CLAUDE.md. -->

## Projektowanie i wdrażanie

Skumulowane, wiążące zasady właściciela (dyrektywy 2026-07-17…19). Obowiązują
łącznie z Zero-Debt (`.claude/rules/zero-dlug.md`) i kanonem V12.xx.

1. **Wizja globalna end-to-end (2026-07-19).** Każdy element planujesz i wdrażasz
   z wizją całego łańcucha — „do ostatniego klika w systemie": od kontraktu danych,
   przez backend, warstwę domenową i API, po UI i miejsce, GDZIE dane są dalej
   wykorzystywane (SLD, analizy, zabezpieczenia, raporty, oceny zgodności). Przed
   budową ustalasz: skąd dane pochodzą, jak się wiążą, gdzie spływają. Nigdy nie
   buduj wyspy — buduj ogniwo łańcucha.

2. **Opcja MAX, bez spłycania (2026-07-18).** Realizujesz maksymalny, kompletny
   zakres funkcji — bez skracania, upraszczania „na później", ukrywania opcji.
   „Wszystko, co potrzebne, rozbuduj". Kompletność wyprowadzasz z rzeczywistego
   kontraktu backendu/domeny (a nie z wygody UI).

3. **Zero fabrykacji (phantom rule).** Każda opcja/kontrolka UI MUSI mapować na
   realne pole/operację backendu. Kontrolka, którą backend ignoruje, jest zakazana
   (to „phantom"). Jeśli brakuje pokrycia w backendzie — rozbudowujesz backend
   (osobnym, przetestowanym krokiem), nie udajesz działania. Wynik liczbowy zawsze
   z solvera/backendu — ZERO fizyki w UI.

4. **Nigdy nic na potem — braki uzupełniasz end-to-end (2026-07-18).** Wykryty brak
   (zdolność bez dostawcy, brak powiązania, luka w łańcuchu) naprawiasz od razu, w
   tej samej kolejce. Rejestr „do zlecenia" nie jest poczekalnią.

5. **Audyt szerokiego grona ekspertów przed przebudową od zera (2026-07-18).** Dla
   zadań jakościowych („zadanie dla fable, opcja max") najpierw wielosoczewkowy
   audyt ekspercki (projektant sieci, zwarciowiec, zabezpieczenia, rozdzielnie,
   katalogi/Reference Engine, przyłączenia/OZE, UX/IA), potem projekt i wdrożenie.
   Wynik audytu zapisujesz jako wiążący dokument w `docs/uiux/`.

6. **FLOW projektanta — stare ekrany nie są kanoniczne (2026-07-18).** Projektujesz
   od etapu pracy inżyniera (E1–E8), wg kontraktu ekranu prowadzącego (cel jednym
   zdaniem · tor pracy z akcjami naprawczymi · uczciwe stany zerowe · jawny następny
   krok · język inżynierski: po co / z czego / co daje). Kanon V12.xx = rejestr
   ZDOLNOŚCI, nie ekranów; `componentKey` jest metadaną dostawcy (podmiana Opcja 1).
   Szczegóły: `mv-design-pro/docs/uiux/FLOW_PROJEKTANTA_2026-07.md`.

7. **Reużycie zamiast duplikacji.** Wykorzystujesz istniejącą infrastrukturę
   (szablony pól producentów / Reference Engine, gotowe pickery, kontrakty
   kreatora stacji), zamiast tworzyć równoległe rozwiązania. „Po to było robione,
   żeby to wykorzystać".

8. **Pokazuj ekrany do oceny po każdym etapie (2026-07-18).** Po każdym scalonym
   etapie UI publikujesz zrzuty ŻYWEJ aplikacji (oba motywy) na stałej stronie oceny
   i traktujesz uwagi z oględzin jako karty naprawcze.

9. **Rola: sesja główna zarządza, wykonawcy wykonują** (drzewo agentów w `CLAUDE.md`). Piszesz karty z §0 rozstrzygnięć +
   bramkami, delegujesz do wykonawców (worktree, commit BEZ push), niezależnie
   weryfikujesz, cherry-pickujesz, uruchamiasz pełne potwierdzenia i pushujesz.
   Wyjątek: zadania jakościowe oznaczone „tylko dla fable / opcja max" robisz osobiście.

10. **Pełna autonomia.** Działasz jak architekt bez zatrzymywania: dzielisz zadania,
    zlecasz kolejne karty, nie pytasz o pozwolenie. Ulepszasz i usuwasz braki/dług/błędy
    aż do pełnego wdrożenia end-to-end. Myślisz jak inżynier projektujący sieci
    energetyczne. Wyjątek: realne rozstrzygnięcia produktowe (AskUserQuestion).

11. **Weryfikacja end-to-end przed scaleniem.** Zmiana warstwy → pełna regresja tej
    warstwy (backend pytest, frontend vitest), type-check, lint, właściwe guardy,
    determinizm/hash. Kontrakty FROZEN i determinizm nietknięte (nowe pola addytywne,
    `exclude_none`; seed bez zmian dla istniejących payloadów).

**Jeden wątek prowadzi wszystkie trzy programy end-to-end** (dyrektywa właściciela; programy:
`.claude/rules/dokumentacja-i-plany.md`): w tej samej sesji/PR edytujesz `ui/sld/**`,
`sld-editor/**`, `engine/sld-layout/**` i warstwy 10x; łańcuch domykasz do ostatniego klika
w jednej pracy. Rygor jakości bez zmian: pełna regresja właściwej warstwy + guardy + determinizm
+ FROZEN/golden nietknięte przed scaleniem.

## Zasady inżynierskie (dyrektywa właściciela)

1. Nie dbaj o kompatybilność wsteczną. Co przestarzałe, to usuń na amen – bez warstw kompatybilności, bez migracji, bez fallbacków.
2. Wybierz najprostszą implementację, która spełnia bieżące potrzeby. Zero prewencyjnych abstrakcji, zero zbędnych warstw konfiguracyjnych.
3. Dziel system na warstwy, ale stopniowo. Najpierw uruchom minimalną wersję end-to-end, potem dodawaj. Nigdy nie rozwalaj działającej rzeczy dla niedokończonej złożoności.
4. Trzymaj komponenty modułowe, separuj odpowiedzialności.
5. Stawiaj na dojrzałe, utrzymywane biblioteki. Bez konkretnego powodu nie przepisuj od zera.
6. Najpierw sprawdź, co potrafią istniejące zależności w projekcie, zanim zaczniesz dodawać nowe pakiety czy pisać własne. Nie zakładaj z góry, że w bibliotekach niczego nie ma.
7. Podejmuj decyzje architektoniczne z myślą o przyszłości. Nie akceptuj prowizorek w stylu „na razie tak, potem zmienimy".
8. Sprawdź, jak dojrzałe produkty rozwiązują ten sam problem – korzystaj z zweryfikowanych wzorców, nie wymyślaj koła na nowo.

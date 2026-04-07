# MV-DESIGN-PRO — PROMPT DLA CODEX: JEDEN KANONICZNY EDYTOR SIECI

## Rola
Działasz jako główny architekt i wykonawca refaktoryzacji end-to-end w repozytorium `MV-DESIGN-PRO`.

Jeśli platforma wspiera delegację, możesz równolegle zlecić audyt do ról pomocniczych:
- architekt frontend,
- architekt backend/domeny,
- inżynier elektroenergetyczny SN/nN,
- inżynier katalogów technicznych,
- architekt UI/UX narzędzi inżynierskich,
- audytor jakości i deterministyczności,
- redaktor dokumentacji.

Jeśli delegacja nie jest dostępna, wykonaj pracę samodzielnie bez zawężania zakresu.

## Cel nadrzędny
Przebuduj produkt tak, aby istniał jeden kanoniczny `NetworkEditorPage` oparty o:
- wybór realnych elementów technicznych z katalogów,
- operacje domenowe zapisujące nowy Snapshot,
- SLD rysowane jako funkcja Snapshotu,
- gotowość, FixActions, wyniki, White Box i raport czytające tę samą prawdę systemową.

## Nienegocjowalne zasady
1. Jedyną prawdą systemu jest Snapshot domenowy.
2. Każde działanie użytkownika to operacja domenowa i nowy Snapshot.
3. Wybór elementu z katalogu jest operacją domenową, a nie dodatkiem po fakcie.
4. SLD nie ma lokalnej prawdy ani alternatywnej logiki edycji.
5. Formularze, readiness, wyniki, White Box i raport nie mogą utrzymywać rozjechanych stanów.
6. Nie wolno zgadywać parametrów technicznych.
7. UI i dokumentacja użytkowa mają być po polsku.
8. Nie mogą istnieć dwa równoległe sposoby realizacji tej samej decyzji użytkownika.

## Zakres obowiązkowy
Masz:
- scalić wejście do jednego edytora,
- znormalizować routing i nazewnictwo,
- uczynić bibliotekę katalogową głównym narzędziem budowy,
- zintegrować właściwości, readiness, problemy i wyniki w jednym przepływie,
- usunąć lub odizolować legacy duble,
- podnieść poziom użyteczności, czytelności i ergonomii aplikacji.

## Minimalne ulepszenia inżynierskie, które musisz zaproponować i wdrożyć tam, gdzie to możliwe
1. Jeden kanoniczny punkt wejścia do edytora i normalizacja aliasów historycznych.
2. Katalog jako panel roboczy pierwszej klasy, nie wyłącznie modal lub osobna strona.
3. Jedno nazewnictwo produktu w UI: `Edytor sieci`, nie mieszanka `SLD`, `Budowa sieci`, `Kreator`.
4. Lepsza orientacja operatora: status gotowości, liczebność modelu, kontekst zaznaczenia, szybkie wskazówki.
5. Mniej przełączeń kontekstu: katalog, proces, nawigator i inspektor mają współpracować, nie konkurować.
6. Guardy i testy, które pilnują braku równoległych ścieżek edycji.
7. Dokumentacja architektoniczna opisująca decyzje `KEEP / MERGE / REMOVE / ISOLATE`.

## Fazy pracy
### Faza 1 — audyt
Dostarcz:
- listę ścieżek edycji,
- listę dubli,
- konflikty architektoniczne,
- decyzje `KEEP / MERGE / REMOVE / ISOLATE`,
- listę plików do przebudowy.

### Faza 2 — architektura docelowa
Zaprojektuj:
- jeden ekran `NetworkEditorPage`,
- kanoniczny routing,
- katalog-first flow,
- integrację SLD, readiness, wyników i raportu.

### Faza 3 — implementacja
Wdrażaj zmiany w repozytorium, nie kończ na planie.

### Faza 4 — czyszczenie
Usuń albo odizoluj stare wejścia, stare moduły, stare route'y, stare testy i stare dokumenty.

### Faza 5 — testy i guardy
Dodaj lub popraw testy potwierdzające:
- jeden kanoniczny edytor,
- katalog-first jako domyślną ścieżkę budowy,
- brak lokalnej prawdy poza Snapshotem,
- brak aktywnych równoległych aliasów.

### Faza 6 — dokumentacja
Uaktualnij dokumenty systemowe i UX tak, aby odpowiadały stanowi repozytorium po zmianach.

## Kryteria akceptacji
Praca jest zakończona dopiero wtedy, gdy:
1. użytkownik trafia do jednego kanonicznego edytora,
2. katalog jest dostępny w głównym przepływie roboczym,
3. stare aliasy nie tworzą osobnej logiki,
4. UI jest spójniejsze, czytelniejsze i mniej modalne,
5. testy potwierdzają nowy kanon.

## Reguły wykonania
- Nie zgaduj. Jeśli czegoś nie można potwierdzić w repozytorium, oznacz to jako `NIEPOTWIERDZONE`.
- Podawaj konkretne pliki, trasy, komponenty i kontrakty.
- Preferuj rzeczywiste zmiany w kodzie nad opisami.
- Jeśli nie da się czegoś bezpiecznie usunąć, odizoluj jako legacy i udokumentuj.

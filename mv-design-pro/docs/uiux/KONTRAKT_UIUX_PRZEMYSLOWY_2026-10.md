# Kontrakt właściciela: przemysłowa jakość UI/UX MV-DESIGN-PRO (2026-10-16)

> **Karty wykonawcze UX-xx, bez własnego statusu — status w `PLANS.md` część A §C** (rozstrzygnięcie D15 w `PLANS.md` część A §D, scalenie gałęzi UI/UX z gałęzią programu 2026-10-28). Identyfikatory tego dokumentu (UI-xx, W5-UI-xx, K1…K9, GPZ-MODEL, GPZ-H5-*) są kartami wykonawczymi wewnątrz UX-01…UX-06; jedyną kolejką i jedynym rejestrem postępu jest `PLANS.md` część A §C.

Status: WIĄŻĄCY kontrakt poprawkowy właściciela z 2026-10-16, nadrzędny wobec
`PROGRAM_UIUX_2026-07.md` w zakresie jakości przestrzeni roboczej, SLD, kreatorów, inspektora,
wyników i standardu graficznego. Podlega kanonowi V12.xx i konstytucji programu (CLAUDE.md,
„Document Hierarchy”). Wzorce: ETAP (inteligentny SLD, bloki danych, automatyczny układ,
wyniki na schemacie), DIgSILENT PowerFactory (warstwy wyników, inspektor, widoki dzielone,
schematy stacji), pomocniczo EPLAN Electric P8 (nawigator urządzeń, właściwości aparatury).
Celem jest porównywalna ergonomia i jakość pracy inżynierskiej, nie kopiowanie wyglądu.

**Werdykt B-02 karty W5-B (2026-10-16): ODRZUCONY** do czasu kompletu dowodów odbiorowych z §10
i §12. Zrzuty W5-B pokazują postęp funkcjonalny, ale nie osiągają jakości przemysłowej
(projektowanie przestrzeni roboczej, czytelność schematów, hierarchia informacji, edycja
parametrów, dostępność wyników). Zakazane: kosmetyczne poprawianie CSS, przemalowanie kart,
atrakcyjne makiety. Wymagana przebudowa jakości użytkowania istniejącej aplikacji wokół zadań
projektanta sieci SN i nN. Program jest przekrojowy — nie zastępuje prac nad ENM, solverami,
katalogami, EAZ i SLD; te toczą się równolegle wg planu.

Zasada nadrzędna: interfejs buduje się wokół OBIEKTU inżynierskiego, jego danych, schematu i
wyników — nie wokół coraz większej liczby osobnych formularzy i ekranów.

## 1. Wzorce oprogramowania przemysłowego

Zbadać aktualne materiały producentów, dokumentację funkcji i rzeczywiste scenariusze użycia.
- ETAP: inteligentny SLD; edytor elementów i właściwości; konfigurowalne bloki danych i wyników
  na schemacie; tryby edycji i analiz; automatyczne rozmieszczanie; graficzna wizualizacja
  prądów, napięć, obciążeń i wyników zwarciowych; diagnostyka obciążenia i ograniczeń;
  koordynacja zabezpieczeń, charakterystyki czasowo-prądowe; nawigacja po modelu.
- PowerFactory: drzewo obiektów i zarządzanie modelem; inspektor parametrów i wyników; schematy
  stacji i pól; podział na widoki sieciowe i obiektowe; warstwy wyników, oznaczenia przeciążeń i
  przekroczeń napięć; tabele z sortowaniem i filtrowaniem; widoki dzielone; automatyczne
  układanie i kadrowanie; powiązanie wyników, wykresów i obiektów.
- EPLAN Electric P8: nawigator urządzeń, dokumentacja, właściwości aparatury.

Bez kopiowania piksel po pikselu — własna spójna architektura interakcji. Rezultat: macierz
WZORZEC → PROBLEM W MV-DESIGN-PRO → ROZWIĄZANIE → DOWÓD DZIAŁANIA. Żadnej funkcji bez zbadania
istniejącego kodu i wykazania rzeczywistej potrzeby.

## 2. Architektura przestrzeni roboczej

**UI-01 Przeładowany górny obszar.** Dziś równocześnie: „Widok”; tryby Podstawowy/Rozszerzony/
Ekspercki; motyw; „Nawigacja”; rozwijanie inspektora; Zapisz, Oblicz; zakres; status modelu;
gotowość; licznik przypadków; etap; kontrola; następny krok; liczniki szyn, odcinków, pól, stacji,
transformatorów; wyszukiwanie, katalog, metadane, historia. Wykonać: pasek projektu, pasek
narzędzi bieżącego trybu pracy i kontekstowy pasek statusu; informacje drugorzędne w panelach na
żądanie; usunąć powielanie nawigacji; przyciski nie nakładają się na nazwę projektu („Widok”
przykrywa nagłówek). Zweryfikować, czy trzy tryby zaawansowania zmieniają funkcjonalność — jeśli
tylko ukrywają kontrolki, jedno rozwiązanie oparte na kontekście pracy. Odbiór: przy 1440×900
pełne nazwy podstawowych poleceń, nazwa projektu, bieżący przypadek i status wyników, bez
poziomego przewijania głównego paska.

**UI-02 Wykorzystanie ekranu.** Układ regulowany: lewy nawigator projektu i obiektów (220–260 px),
środek SLD, prawy inspektor właściwości (340–420 px), dolny panel wyników, ostrzeżeń, dowodów i
dziennika operacji. Wartości wyjściowe, nie sztywne. Panele zwijane, z regulowaną szerokością,
poprawne przy różnych wielkościach okna. Schemat zajmuje zdecydowaną większość przestrzeni; bez
wielokrotnie zagnieżdżonych nagłówków i kart.

**UI-03 Hierarchia wizualna.** Usunąć: nadmiar zaokrąglonych etykiet, powtarzane komunikaty,
obramowania w obramowaniach, miniaturowe teksty, przypadkowe wielkości czcionek, rozbudowane
nagłówki sekcji, nieuzasadnione kapitaliki i rozstrzelenie liter. Wymagane: jednoznaczna
hierarchia nagłówków, regularna siatka odstępów, czytelne liczby, konsekwentne jednostki,
typografia do długotrwałej pracy, wyróżnianie tylko ważnych informacji. Narzędzie CAD/CAE, nie
aplikacja konsumencka.

## 3. SLD — centralny element programu

**UI-04 Czytelność.** Inteligentne dopasowanie widoku do: całej sieci, magistrali, stacji,
rozdzielnicy, sekcji szyn, pojedynczego pola, toru od źródła do odbioru. „Dopasuj widok” działa
względem faktycznego zakresu pracy. Dwuklik stacji w widoku sieciowym otwiera wewnętrzny schemat
stacji bez utraty kontekstu. Zachować osobne projekcje SN i nN i istniejące przejście przez
transformator.

**UI-05 Geometria.** Obowiązuje istniejący `SldCanvasV3` — bez nowego renderera i alternatywnej
biblioteki symboli. Poprawić: wyrównanie szyn i torów pionowych, rozstaw pól, przyłączenie linii
do zacisków, nienakładanie opisów, przecięcia połączeń, rozmieszczenie transformatorów, etykiety,
czytelność aparatury, automatyczne kadrowanie, poziomy szczegółowości. Symetria nie kosztem
poprawności torów. Schemat stacji SN/nN ma służyć weryfikacji konfiguracji rozdzielnicy.

**UI-06 Bloki danych na SLD (wzór: DataBlock ETAP).** Użytkownik wybiera zestaw danych przy
elemencie. Kabel: nazwa i typ, długość [km], przekrój żyły roboczej i powrotnej, prąd obciążenia,
obciążenie procentowe, spadek napięcia. Transformator: moc znamionowa, napięcia, układ połączeń,
u_k, obciążenie, straty. Źródło i węzeł: napięcie, P i Q, prąd zwarciowy właściwego przypadku,
stan gotowości wyniku. Bloki czytają model i wyniki — zero obliczeń w UI. Własny zestaw wielkości
zapisywalny.

**UI-07 Warstwy wyników.** Spójne przełączanie: struktura i topologia, rozpływ mocy, napięcia,
obciążenie elementów, zwarcia, zabezpieczenia, stan łączeniowy, problemy i ograniczenia.
Nakładka nie zmienia topologii ani znaczenia symboli; wygląd zmienia się tylko tam, gdzie niesie
informację. Skala i legenda dla wielkości ilościowych; zakaz jednego zielonego koloru przewodów
jako domniemanego dowodu zasilania. Brak wyniku, wynik nieaktualny i wartość zero — trzy różne
stany wizualne.

**UI-08 Nawigacja po torze elektrycznym.** Zaznaczenie pola wyróżnia drogę od źródła przez
aktywne elementy; sieć wieloźródłowa — wiele dróg i stany łączników. Z odcinka przejście do:
poprzedniego/następnego elementu, pola wejściowego/wyjściowego, stacji, przekładników i EAZ,
wyników. Bez pozornej ciągłości, gdy model nie rozstrzyga topologii.

## 4. Kreator stacji

**UI-09** Dziewięć kroków zbyt ciężkie wizualnie (nazwy w dwóch rzędach, opisy zamiast edycji).
Kroki: krótki numer i nazwa, stan ukończenia, informacja o blokadzie, łatwy powrót, zachowanie
danych, czytelne przejście dalej; bez sztywnego przebiegu przy powrocie do zmiany TR lub aparatu.

**UI-10 Stały podgląd skutków edycji.** Wybór typu stacji, liczby pól, roli pola, rodziny
rozdzielnicy, aparatu, transformatora aktualizuje podgląd pola/rozdzielnicy — projekcję tej samej
konfiguracji, którą system zapisze, nie rysunek dekoracyjny.

**UI-11 Katalog producenta jako selektor.** Filtry: producent, rodzina rozdzielnicy, U i I
znamionowe, rodzaj i funkcja aparatu, parametry zwarciowe, wyposażenie pola, identyfikator i
wersja źródła katalogowego; porównanie 2–3 wariantów; tabela parametrów zamiast długiej listy. Po
wyborze: parametry znamionowe, zgodność z konfiguracją, brakujące dane, źródło katalogowe,
uzasadnienie odmowy. Bez danych producenta — żadnych parametrów zastępczych ani ogólnej nazwy
„FABRYCZNE”.

**UI-12 Parametry edytowane bezpośrednio.** Każde pole: nazwa, wartość, jednostka, źródło danych,
zakres lub reguła poprawności, jednoznaczne nadpisanie wartości katalogowej. Rozpoznawalne pola
liczbowe, listy, przełączniki; mniej rozwlekłych opisów. Wartości pochodne nieedytowalne, z
dostępem do sposobu obliczenia. Edycja grupowa podobnych pól, gdzie inżyniersko dopuszczalna.

**UI-13 Tabela pól.** Kolumny: numer pola, rola, typ, aparat główny, U_r, I_r, zdolność
zwarciowa, stan zgodności, działania. Wybór wiersza otwiera szczegóły i podświetla pole na
schemacie. Bez pełnych opisów wszystkich pól naraz.

## 5. Inspektor właściwości

**UI-14** Jeden spójny inspektor; zakładki kontekstowe Dane | Katalog | Połączenia |
Zabezpieczenia | Wyniki | Dowody — nieobowiązujące ukryte. Kabel, transformator, pole, łącznik,
źródło: ta sama logika edycji, walidacji, zapisu i cofania.
**UI-15** Jedno zaznaczenie — jeden kontekst: drzewo, SLD, tabela, lista błędów, wyniki wskazują
ten sam obiekt domenowy; bez lokalnych kopii i niesynchronizowanych inspektorów.
**UI-16** Kopiowanie konfiguracji pola, zmiana kilku zgodnych parametrów, wyszukiwanie po nazwie,
typie i stacji, filtr pól niekompletnych, różnice konfiguracji, cofanie/ponawianie operacji
domenowych (nie lokalne przywrócenie formularza); integralność ENM zawsze.

## 6. Wyniki i wykresy

**UI-17** Wynik w kontekście elementu: bloki na schemacie, panel szczegółów, tabela wszystkich
elementów, wykres gdy ma wartość analityczną, przycisk dowodu WHITE BOX — bez opuszczania SLD.
**UI-18** Wykresy: osie, jednostki, skale, legendy, znaczniki, granice dopuszczalne, miejsca
przekroczeń, eksport, porównanie przypadków, powiązanie punktu z elementem. Zależnie od
działających funkcji: profile napięciowe, obciążenia, zwarcia, charakterystyki EAZ, zależności
P/Q/U, przebiegi dynamiczne. Zero sztucznych danych.
**UI-19** WHITE BOX: A dane wejściowe, B wzory i model, C podstawienie i wyniki pośrednie,
D wynik, ograniczenia, weryfikacja. Wzory w KaTeX (`MathRenderer` z pól `*_latex`), poprawne
jednostki i oznaczenia; przy porównaniach różnice wariantów i pochodzenie parametrów.

## 7. Przegląd 15 ekranów W5-B (`docs/audit/visual/w5b/po/`)

- W5-UI-01 Kreator: szablon — opisy dominują nad wyborem; hierarchia, rodzaje stacji, statusy
  kompletności; użytkownik od razu widzi, co wybiera i jaki będzie rezultat.
- W5-UI-02 Kreator: pola — selektor rodziny, aparatu, wyposażenia; zgodność techniczna, nie
  sama nazwa produktu; podgląd pola.
- W5-UI-03 Kreator: podgląd — zestawienie skutków (stacja, szyny, pola, TR, odcinki, zmiany
  topologii, braki) zamiast opisów operacji; surowe identyfikatory do diagnostyki.
- W5-UI-04 Cała sieć — kadrowanie i skalowanie; widok przeglądowy vs szczegółowy; dane obiektów
  na żądanie.
- W5-UI-05 Stacja przelotowa — nadmiar pustki i długie trasy bez informacji; rozmieszczenie pól,
  terminale; zweryfikować topologię czterech pól liniowych.
- W5-UI-06 Stacja odgałęźna — wyraźny tor główny i odgałęzienie; prawdziwe połączenia;
  wskazanie odcinka, pola i aparatu odgałęźnego.
- W5-UI-07 Stacja sekcyjna — sprzęgło i sekcje z modelu; jasne, które układy łączy i jaki stan
  łącznika.
- W5-UI-08 Stacja końcowa — konfiguracja końca sieci, pole zasilające, wolne pola, tor TR; wolne
  pole nie jest czynnym wyprowadzeniem.
- W5-UI-09 Kreator bez pola TR — naprawa prowadzi wprost do działania i odświeża ten sam model;
  bez powtarzanych ostrzeżeń.
- W5-UI-10 Domyślne pola — usunąć niekompatybilne domyślne aparaty; dane katalogowe, status
  doboru, parametry znamionowe; ograniczyć „FABRYCZNE”.
- W5-UI-11 Warianty aparatu — selektor porównawczy z parametrami i walidacją; wkładka
  bezpiecznikowa nie jest zamiennikiem wyłącznika.
- W5-UI-12 Drzewo projektu — bez skrótów „Stacja …”; nazwa i kontekst; wyszukiwanie,
  filtrowanie, synchronizacja z SLD.
- W5-UI-13 Gotowość — narzędzie naprawcze: rzeczywiste blokady, grupowanie po elemencie, przejście
  do pola i parametru; ogólne 100% nie oznacza gotowości wszystkich analiz; przyciski „Napraw…”
  z pełnymi etykietami i działaniem.
- W5-UI-14 Schemat z gotowości — klik problemu otwiera właściwy fragment, kadruje i wyróżnia
  element, nie przypadkowy widok całej sieci.
- W5-UI-15 Widok stacji — stacja w centrum i dominuje; szyny, pola, aparaty, TR; bez uciętych
  fragmentów sąsiednich obiektów.

## 8. Standard graficzny

Ciemny: spokojne neutralne powierzchnie, wysoki kontrast symboli i danych, cyjan oszczędnie
(wybór, aktywne narzędzie), pomarańcz (ważne ostrzeżenia), czerwień (błędy, alarmy), barwy
wynikowe z jawną legendą. Jasny: neutralne jasne powierzchnie, ciemne symbole, ta sama hierarchia,
kontrast do długiej pracy. Nie SCADA. Kolor aparatu/przewodu nie oznacza samowolnie stanu
napięciowego — stan i jego źródło określone. Typografia: dane robocze ≥ 13–14 px (wyjątki
uzasadnione), poprawne symbole i indeksy, liczby wyrównane z właściwą precyzją, jednostki
oddzielone od wartości, czytelne stany skupienia/edycji/wyboru/błędu, brak przyciętych etykiet i
nakładających się kontrolek, kontrast WCAG 2.2 AA (wyjątki dla zapisów graficznych). Jeden zestaw
wspólnych komponentów i zmiennych stylu — bez równoległego systemu wizualnego.

## 9. Zachowanie interfejsu

Spójne: menu kontekstowe, dwuklik → karta właściwości, wielozaznaczenie, filtrowanie i
wyszukiwanie, przewijanie i powiększanie, przywracanie widoku, reakcje po zapisie, obsługa
błędów, niezapisane zmiany, anulowanie formularzy, klawiatura, stan trwających obliczeń, status
nieaktualnych wyników. Każde polecenie działa albo jest niedostępne z podaną przyczyną. Bez
dekoracyjnych animacji; ruch tylko dla rzeczywistej wielkości, zmiany stanu lub procesu. Determinizm
zrzutów i testów zachowany.

## 10. Obowiązkowa weryfikacja (natywne interakcje, realny backend)

1. Praca z projektem: od źródła do wybranego TR przez drzewo i SLD bez utraty zaznaczenia i kontekstu.
2. Konfiguracja stacji: zmiana aparatu, jego parametry, podgląd, walidacja; katalog i obiekt zsynchronizowane.
3. Zmiana długości kabla: zapis, świeżość wyników, ponowne przeliczenie, spadek napięcia.
4. Zwarcia: właściwy przypadek, wyniki na schemacie, dowód obliczeniowy.
5. EAZ: aparat i zabezpieczenie; odczyt zamodelowanych CT/VT, nastaw, wyników; zero fikcji.
6. Przestrzeń robocza: 1366×768, 1440×900, 1600×900, 1920×1080 × oba motywy × inspektor
   otwarty/zamknięty × długi formularz, pełny SLD, widok stacji, widok wyników.
7. Odbiór wizualny: wszystkie 15 ekranów W5-B przed/po w tych samych warunkach i danych.
8. Integracja: brak nowego modelu topologii, atrap katalogowych, obliczeń we froncie, obejść
   operacji domenowych, utraty danych, niedeterminizmu wyników i zrzutów.

## 11. Niezależny audyt ekspercki po wdrożeniu

Role: projektant SN/nN, specjalista aparatury rozdzielczej, projektant EAZ, architekt aplikacji
inżynierskich, projektant interfejsów CAD/CAE, specjalista testów interakcji, krytyczny
użytkownik końcowy. Szukają błędów; każdy wskazuje trzy największe przeszkody w codziennej pracy.
Problemy blokujące wracają do poprawy.

## 12. Rezultat

Działające zmiany w repozytorium, nie makiety: (1) wykaz wad 15 ekranów; (2) porównanie z ETAP i
PowerFactory; (3) wdrożone zmiany układu, SLD, kreatorów, inspektorów; (4) pełne dane testów i
regresji; (5) nowe zrzuty przed/po w obu motywach; (6) dowody natywnych interakcji; (7) wyniki
recenzji eksperckiej; (8) commity i lista niezakończonych problemów; (9) jednoznaczny werdykt
gotowości do ponownego odbioru. Rozwiązanie nie jest akceptowane dlatego, że wygląda nowocześnie
— każdy element ma poprawiać precyzję, sprawność lub bezpieczeństwo pracy inżynierskiej.
B-02 pozostaje ODRZUCONE do przedstawienia kompletu dowodów odbiorowych.

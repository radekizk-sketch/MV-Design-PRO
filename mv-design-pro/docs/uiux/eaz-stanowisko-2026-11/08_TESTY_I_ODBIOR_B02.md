# Testy odbioru stanowiska EAZ — EAZ-001…EAZ-040

**B-02** — ocena wyglądu i zakresu przez właściciela, niezależnie od CI. Tylko wyniki z rzeczywistego backendu; dane z przesłanych kadrów używać jako przykładu kontrolnego, nie jako źródła prawdy solvera.

| ID | Obszar | Oczekiwany dowód |
|---|---|---|
| EAZ-001 | kontekst 3F/2F | Wykres nie podszywa biegu 2F pod 3F; oba run_id i rewizje jawne. |
| EAZ-002 | CT dwa prądy | Osobny prąd przez CT nadrzędny i podrzędny; przy OZE nie są automatycznie równe. |
| EAZ-003 | stan minimum | Ik_min z rzeczywistej konfiguracji i punktu na końcu strefy; brak danych = odmowa. |
| EAZ-004 | poprawne jednostki | A pierw./wt. zgodne z ratio CT; 180 A pierw. na CT 600/5 = 1,5 A wt. |
| EAZ-005 | różne CT | Różne ratio/rdzenie obu pól, brak kopiowania jednego CT na drugi. |
| EAZ-006 | 51 IDMT | Krzywa wyliczona w kanonicznym solverze; referencyjne niezależne wyliczenie kilku punktów. |
| EAZ-007 | 50 DT | Zadziałanie na progu, czas i prawidłowa nieciągłość krzywej. |
| EAZ-008 | obwiednia 50+51 | Wybrana najszybsza aktywna funkcja, poprawna reprezentacja skoków. |
| EAZ-009 | brak progu | Poniżej progu funkcja nie pobudza, nie pojawia się czas 999,999 s. |
| EAZ-010 | odstęp pojedynczy | Dla 0,1 i 0,4 s oraz kryterium 0,2 s wynik 0,3 s i zapas +0,1 s TYLKO dla tego przypadku. |
| EAZ-011 | odstęp niepełny | Nieoceniona część zakresu daje stan „Oceniono wybrane przypadki”, bez „sieć selektywna”. |
| EAZ-012 | granice przedziałów | Wykryte przeciecia krzywych, progi i nieciągłości; nie przeskakiwać krytycznych punktów. |
| EAZ-013 | wyłączniki | t funkcji, t Q0 i t całkowity odróżnione; poprawna macierz trip. |
| EAZ-014 | błędna relacja | Wybór dwóch niepowiązanych elektrycznie IED nie daje zielonego werdyktu. |
| EAZ-015 | grupa nastaw | Scenariusz wybiera rzeczywistą grupę i wersję; zmiana unieważnia właściwy wynik. |
| EAZ-016 | robocze/zapisane | Wynik wcześniejszych nastaw nie jest pokazywany jako bieżąca ocena robocza. |
| EAZ-017 | katalog IED | Zakresy i krok nastaw zgodne z rzeczywistą wersją urządzenia; brak danych = konkretna odmowa. |
| EAZ-018 | 51N Ferranti | Prąd rzeczywistego przekładnika sumującego, nie fikcyjne dane fazowego CT. |
| EAZ-019 | brak Z0 | Brak Z0 nie jest Z0→∞ ani automatycznie zerowym prądem doziemienia. |
| EAZ-020 | 67N polaryzacja | Odwrócenie CT/VT zmienia kierunek zgodnie z konwencją; test mutacji znaku. |
| EAZ-021 | 67N małe U0 | Przy braku wiarygodnego napięcia polaryzacji brak oceny kierunku, nie fałszywy wynik. |
| EAZ-022 | admitancyjne | G0/B0/Y0 i obszar zadziałania odpowiadają rzeczywistemu modelowi i typowi IED. |
| EAZ-023 | admitancyjne dzielenie | Dla U0≈0 brak dzielenia przez zero; wskazanie przyczyny. |
| EAZ-024 | zespół uziemiający | Sieć kompensowana / izolowana / rezystorowa z różnymi wynikami i zakresem. |
| EAZ-025 | 87T przekładniki | Obie strony CT, kompensacja grupy połączeń, test zwarcia zewnętrznego/wewnętrznego. |
| EAZ-026 | 87T inrush | Bez modelu harmonicznych blokadę ocenić jako nieobliczoną; nie wymyślać przebiegu. |
| EAZ-027 | 50BF | Rzeczywisty Q0 i wyłączniki rezerwowe, test nieskutecznego otwarcia. |
| EAZ-028 | blokowanie szyn | ZS i blokady z rzeczywistych pól, bez wirtualnego aparatu. |
| EAZ-029 | SCO | Stopnie SCO I/II i SPZ po SCO skonfigurowane odrębnie, nie aktywne domyślnie bez wyposażenia. |
| EAZ-030 | OZE dwukierunkowe | Zwarcie przed/za OZE i źródła po obu stronach; prawidłowa kolejność i kierunek. |
| EAZ-031 | NO/sprzęgło | Zamknięcie zmienia topologię i pary zgodnie z solverem, bez zmiany ręcznej w UI. |
| EAZ-032 | GPZ A/B/C | Równoważnik na SN poza warunkiem ważności nie generuje sztucznego zasilania. |
| EAZ-033 | SLD nawigacja | Wybór → SLD → kadr, inspektor → powrót z grupą, filtrem, zoomem. |
| EAZ-034 | wiele zaznaczeń | Zaznaczenie innej krzywej wskazuje właściwy obiekt/CT, bez kolizji ID. |
| EAZ-035 | 1280 jasny | Ocena Δt i nastawy dostępne w 1280×720 jasnym bez poziomego przewijania całej strony. |
| EAZ-036 | 1280 ciemny | To samo w 1280×720 ciemnym, kontrast i legendy zachowane. |
| EAZ-037 | 1440 motywy | 1440×900 oba motywy z identycznym zakresem, liczbami i geometrią. |
| EAZ-038 | raport | Eksport PDF/DOCX/SVG z prawidłową rewizją, nastawami i źródłami kryteriów. |
| EAZ-039 | iniekcja | Sztuczne zamienienie prądów dwóch CT / fazora / grupy nastaw musi zaczerwienić test. |
| EAZ-040 | pełna regresja | Testy backend, Vitest, typy, lint, guardy, e2e i rzeczywisty backend; brak osłabienia asercji. |

## Minimalne wyrocznie inżynierskie

1. **Prąd na różnych CT.** Dwa niezależne obliczenia referencyjne prądów gałęziowych (w tym kierunek, wkłady z OZE); porównać z wynikiem API osobno dla nadrzędnego i podrzędnego. Nie akceptować testu, który podstawia całkowite (I_k'') do obu.
2. **TCC:** niezależna implementacja testowa wzorów dla wybranej rodziny IDMT/DT z potwierdzonego źródła, granice i pochodne nieciągłości; kod produkcyjny nie może być jedyną wyrocznią własnego testu.
3. **Selektywność:** ocena na rzeczywistej topologii, z czasem funkcji i wyłącznika, CTI z pochodzeniem i zakresem zastosowania; wynik punktu nie upoważnia do oceny całej sieci.
4. **Ziemnozwarciowe:** prawidłowe znaki i polaryzacja, (Z_0) i (Y_0) z rzeczywistego modelu, przypadki kompensowane i rezystorowe, brak danych nie udaje wyniku.
5. **Różnicowe:** odniesienie przekładni i faz do obu stron TR, osobny test zewnętrzny/wewnętrzny, warunek blokowania udaru wyłącznie przy obsługiwanym sygnale.
6. **Pełny ślad:** źródła/CT/VT/IED/funkcja/grupa nastaw → wynik → trip → Q0 → SLD → raport, bez zmiany identyfikatora.

## Iniekcje obowiązkowe

Zmiana (I_{CT,n}) na (I_k''); zamiana kierunku CT; podszycie 2F pod 3F; zamiana grupy nastaw po biegu; odrzucenie (Z_0); podanie nieistniejącego Q0; zamiana modelu generatora synchronicznego na falownik; punkt poza ocenionym zakresem. Każda iniekcja ma powodować porażkę przynajmniej jednego dedykowanego testu.

## Kadry do oceny właściciela

- **50/51** — jasny i ciemny, 1440×900 i 1280×720; przebieg aktualny i po edycji nastaw.
- **51N/67N** — wykres TCC oraz kierunkowy z fazorami, stany poprawny, brak polaryzacji i przeciwny kierunek.
- **Admitancyjne** — płaszczyzna G0/B0 z obszarem zadziałania i wyświetleniem obliczonego punktu.
- **87T** — I_diff/I_bias i właściwe obwody CT.
- **50BF/LRW** — oś czasu i przypisane aparaty.
- **Ocena zakresu** — kilka przypadków zwarcia z najgorszym marginesem i lista nieocenionych.
- **SLD i inspektor** — wejście i powrót bez utraty stanu, powiązanie CT/VT.
- **Raport** — porównanie tych samych liczb z API, wykresem i eksportem.

Wymagane są rzeczywiste zrzuty działającej aplikacji, a nie sam szkic. W miejscach bez pełnego modelu funkcji należy pokazać dokładny komunikat odmowy, nie pozorować pełnej zgodności. Każda karta posiada własny stan w aktualnym wierszu `PLANS.md` podczas integracji.

**Nie wolno ogłaszać zakończenia całego programu EAZ wyłącznie dlatego, że 40 testów jest zielonych.** Odbiór obejmuje wykonanie od konfiguracji pola przez obliczenie, wynik, ocenę, nawigację i eksport.
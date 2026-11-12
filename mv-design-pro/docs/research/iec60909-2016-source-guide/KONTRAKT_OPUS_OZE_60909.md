# Kontrakt wykonawczy: GPZ A/B/C i wkłady OZE do zwarć

**Odbiorca:** Opus 5.5 (integrator i recenzent); wykonawca P0 solvera. **Status:** wiążąca decyzja właściciela do włączenia w istniejącą kartę, nie osobny plan.

## Decyzja

1. Zachować dotychczasowy rdzeń obliczeń według **IEC 60909-0:2016**, w szczególności pkt 7.2.1, wzór (34), dla maksymalnego początkowego prądu symetrycznego zwarcia trójfazowego z udziałem jednostek z przekształtnikiem pełnej mocy.
2. Nie tworzyć alternatywnego rdzenia ani trybu sumowania zespolonego. Nie oznacza to zakazu korzystania z liczb zespolonych przy modelowaniu impedancji, sieci, transferów i prądów gałęziowych.
3. Trzy warianty zasilania GPZ A/B/C są danymi brzegowymi istniejącego modelu; nie mogą duplikować impedancji TR, fikcyjnie zasilać sekcji w rozpływie ani zmieniać fizycznej topologii.
4. Nie rozszerzać wzoru (34) automatycznie na generator synchroniczny, DFIG, zwarcie niesymetryczne ani obliczenie minimalne. Każdy przypadek ocenić według właściwych punktów normy i danych źródła.

## T11 — niezależne sprawdzenie

- Zbudować co najmniej dwa **małe jawne modele referencyjne**: (1) węzeł przyłączenia OZE i miejsce zwarcia rozdzielone impedancją linii, (2) sieć rozgałęzioną z przekształtnikiem po przeciwnej stronie miejsca zwarcia.
- Z dokumentacji normowej wyznaczyć `Z_ii`, `Z_ij`, `c_max`, parametry źródła PF, a następnie odrębnie: składnik sieciowy, przeniesiony wkład każdego PF i wynik całkowity w miejscu zwarcia.
- Wartości referencyjne obliczyć niezależnie od produkcyjnych funkcji solvera; nie przepisywać oczekiwanych wyników z aktualnej implementacji.
- Równoważnik `S''_k = 250 MVA` ma zachować poprawne parametry zgodne z przyjętymi warunkami; **nie wymuszać**, by całkowity wynik po dołączeniu OZE nadal wynosił 250 MVA.
- Nie sumować mocy zwarciowych źródeł, nie stosować modułu całkowitego prądu zwarciowego jako prądu każdej gałęzi.
- Testy mutacyjne celowo psujące moduły `Z_ij`, wkłady PF i położenie źródeł mają kończyć się niepowodzeniem.

## Kontrola pięciu obszarów istniejącego kodu (tylko odczyt do zatwierdzenia)

Dla każdego punktu zwrócić lokalizację pliku/funkcji/wiersza, stan `spełnione / częściowo / luka`, testy i ryzyko:
1. Podział wkładów i prądy w gałęziach.
2. Prądy widziane przez CT funkcji 50/51, 51N, 67N; polaryzacja kierunkowa.
3. Odrębne modele falownika PV/BESS, generatora synchronicznego i DFIG.
4. Zasady obliczeń minimalnych.
5. Rozróżnienie prądu całkowitego, wkładów źródeł i prądów gałęziowych w wynikach, inspektorze i raportach.

## Bramka wdrożenia

Jeżeli inspekcja ujawni konieczność zmiany podstawowego algorytmu solvera lub naruszenie istniejących kontraktów, **STOP i raport do Opusa**. Bez zielonego światła architekta nie wdrażać zmian rdzenia.

## Rozdzielenie źródła normowego

- Wykonawca ma samodzielnie sprawdzić właściwe punkty w **uprawnionym egzemplarzu normy**.
- Ten PR zawiera wyłącznie indeks i kontrakt; nie zawiera licencjonowanego PDF. Jeśli wykonawca nie ma dostępu do normy, oznacza twierdzenia `DO POTWIERDZENIA W PEŁNYM TEKŚCIE`, nie pozoruje weryfikacji.
- Porównanie z edycją IEC 60909-0:2026 pozostaje osobną analizą, bez deklaracji zgodności na podstawie źródeł publicznych.

## Odbiór

1. Referencyjne wyniki T11, podane wraz z przyjętymi parametrami, równaniami i identyfikatorami źródeł.
2. Wyniki testów mutacyjnych.
3. Audyt pięciu obszarów z rzeczywistymi lokalizacjami kodu.
4. Zapis decyzji w właściwej istniejącej dokumentacji i aktualizacja właściwego wiersza `PLANS.md` **dopiero podczas zatwierdzonej integracji**.
5. Bez dołączania normy w całości do repozytorium bez potwierdzenia odpowiednich praw.

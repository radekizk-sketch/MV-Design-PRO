# Funkcje EAZ, wykresy i parametry — jedna powierzchnia stanowiska

**Zasada:** wykres stanowi projekcję modelu IED, CT/VT, nastaw i wyników solvera; nie jest uniwersalnym kalkulatorem udającym pomiary ani dodatkowym silnikiem. Jeśli nie ma rzeczywistych danych do danej funkcji, pokaż precyzyjny brak i akcję uzupełnienia. Każda pozycja jest kryterium docelowego produktu, a status wdrożenia ustala Opus po audycie.

| Funkcja | Wykres/ocena i osie | Wymagane dane | Krytyczne błędy, których nie wolno popełnić |
|---|---|---|---|
| **50/51** — fazowe | TCC log-log X prąd w CT [A pierw./wt.], Y czas [s], aktywne stopnie i punkty minimalnych/maksymalnych zwarć; osobne markery CT podrzędnego i nadrzędnego | Znamionowe i parametry CT, I>, I>>, TMS, rodzina charakterystyki i jej współczynniki, czasy wyłącznika, przypisanie funkcja→Q0 | Jeden prąd w miejscu zwarcia dla obu CT; gładkie przejście przez nieciągłość DT/IDMT; domyślne Δt=0,2 s bez źródła |
| **50N/51N** — ziemnozwarciowe | TCC dla prądu resztkowego, 3I0 i ew. 3U0, progi i czasy, czułość na końcu strefy | Tor Ferrantiego lub suma trzech CT, składowa zerowa, sposób uziemienia, własne zakresy IED | Traktowanie zwarcia 3F jako 1F; zerowa impedancja bez danych; fałszywe pobudzenie gdy brak U0 |
| **67/67N** — kierunkowe | Wykres polarny fazorów \(\angle(3I_0,3U_0)\), strefy przód/tył, kąt charakterystyczny, próg I0/U0; warunki blokad i rzeczywisty punkt pracy | Fazory, biegunowość P1/P2, uzwojenia VT (w tym otwarty trójkąt jeśli jest), odniesienie kierunku, nastawy przekaźnika | Sam moduł I0 jako „kierunek”, brak polaryzacji, odwrotny znak fazora po zmianie orientacji CT |
| **Admitancyjne G0/B0/Y0** | Płaszczyzna admitancji \(\operatorname{Re}Y_0=G_0\) [mS], \(\operatorname{Im}Y_0=B_0\) [mS], regiony działania rzeczywistego IED i punkt pracy; alternatywny widok trendu przy obsługiwanym biegu | Sygnały U0/I0, znana konwencja 3U0/3I0, model sieci kompensowanej/izolowanej, nastawy i kierunek | Dzielenie przy U0≈0; arbitralne odwracanie osi; przyjmowanie jednej reguły admitancyjnej dla wszystkich IED |
| **87T** — różnicowe TR | X \(I_{\rm bias}\), Y \(I_{\rm diff}\), granice stopni/nachyleń, punkty zwarć wewnętrznych i zewnętrznych, blokady tylko jeśli są sygnały | CT obu stron TR, przekładnie, kompensacja Yd11, biegunowość, nastawy konkretnego IED, przypisanie aparatów | Jeden CT po SN jako cały 87T; sygnał harmonicznych bez modelu; wymyślone pola WN |
| **50BF / LRW** | Oś czasu: trip Q0 → kontrola styków/prądu → zwłoka → wyjście do aparatu rezerwowego, tabela styków i warunków | TripMatrix, CBF, czasy wyłącznika, wejścia kontroli, rzeczywista lista wyłączników rezerwowych | Wykres 50BF bez aparatu, do którego rzeczywiście może wysłać trip |
| **ZS / blokowanie** | Diagram blokowań i czasów z powiązaniem pól liniowych i TR | sygnały pobudzenia oraz blokad, topologia sekcji, ustawienia; aparat i jego rola | Mylenie oznaczenia ZS z pełnym działającym zabezpieczeniem |
| **27 / 59 / 59N** | Wykres progu napięciowego i opóźnienia dla danego sygnału, ewentualna trajektoria U(t) **tylko jeśli solver ją wyliczył** | Uzwojenie VT, U fazowe/międzyfazowe/3U0, progi, histereza i czasy | Fałszywy wykres dynamiczny z pojedynczego napięcia statycznego |
| **81U / 81O / 81R**, SCO | Progi f<, f>, df/dt, czas, tabela stopni SCO I/II i SPZ po SCO; wykres f(t) tylko z rzeczywistego przebiegu dynamicznego/pomiaru | Zakresy IED, selekcja VT/częstotliwości, czas detekcji, logika i trip/reclose | Mieszanie SCO z 50/51; deklarowanie skuteczności z pomiaru jednego punktu |
| **49, 46, 21, 25, SPZ** | Rodzinne wykresy zależnie od realnej zdolności solvera: termiczny, I2, R-X impedancyjny, synchrocheck/fazory, sekwencja cykli | Profil IED, wejścia, model temperatury/impedancji/sterowania, katalog i zakres | Samodzielne dostawianie wykresu bez implementacji fizyki; poza odpowiednią kartą wyświetlić „Nie oceniono” |
| **Ograniczenia elementów** | Warstwy na TCC: wytrzymałość cieplna kabla/transformatora, prąd obciążenia, nasycenie CT — każda z własnym źródłem | Prawdziwe dane kabla TR/CT i czasu, IEC 60949/60076/62271 tam gdzie właściwe | Sztuczna krzywa „thermal limit” z przybliżenia nieznanego producenta |

## TCC i jego czytelność

Podstawowy wykres zachowuje turkusową krzywą zabezpieczenia wybranego i fioletową nadrzędnego. Warstwy wybierane osobno: stopnie 50/51, znaczniki \(I_{CT,p}\), \(I_{CT,n}\), \(I_{k,\min/\max}\), prąd obciążeniowy, pasmo tolerancji, granica cieplna, próg nasycenia CT, punkt najgorszego przypadku.

Dopuszczalne tylko gdy wynik i jego pochodzenie istnieją. Znak naruszenia i zaznaczenia nie może mieć tego samego koloru semantycznego. Oś logarytmiczna nie przyjmuje zera. Pokaż jednostkę źródła prądu i przełącznik A pierw. ↔ A wt. **bez zmiany danych fizycznych**.

## Wykresy kierunkowe i admitancyjne

Nie przenosić całości IEC 60909 na model ziemnozwarciowy SN. Podstawą jest właściwy model składowej zerowej, uziemienia punktu neutralnego i odbiorów CT/VT. Wartości \(3I_0\) i \(3U_0\) wymagają konsekwentnej konwencji; zapisuj ją w wyniku. Dopuszczalny obszar kierunku zależy od realnego typu IED i nastaw, więc nie definiować jednego wzorca graficznego jako uniwersalnej charakterystyki każdego produktu.

## Sposób eksponowania rodziny

Pasek nad centralnym wykresem: \`Nadprądowe 50/51 | Ziemnozwarciowe 51N | Kierunkowe 67N | Admitancyjne | Różnicowe 87T | Automatyka\`. Tylko funkcje obsługiwane przez rzeczywisty element mają aktywną kartę; niewyposażone elementy pokazują przyczynę i bezpieczną akcję katalogową. To **podwidoki jednego stanowiska**, nie sześć globalnych ekranów.

## Granice norm i potwierdzenia

IEC 60255-151 / 181 / 187-1 wymagają sprawdzenia właściwych pełnych tekstów, gdy potrzebne są ich współczynniki/tolerancje. PN-EN 60909-0:2016 służy do źródła prądów zwarciowych; 60909-3:2010 wyłącznie do właściwych szczególnych przypadków. PN-EN 62271-1:2018-02 to standard ogólny aparatury, szczegółowe parametry mogą wymagać właściwych części serii. Profile OSD zgodne z IRiESD i standardami ENEA, jeśli stosujemy ENEA-STRICT, bez automatycznego narzucania wszystkim OSD.

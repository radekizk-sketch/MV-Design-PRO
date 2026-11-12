# Matryca scenariuszy i miejsc analizy zabezpieczeń

## S01 — przypadek bieżący ze zrzutów

\`GPZ 15 kV → linia SN → Stacja S1 / pole 2 → zwarcie 3F na zacisku technicznym\`; \(I_{oceny}=7734{,}69\) A, \(t_{p}=0{,}100s\), \(t_{n}=0{,}400s\), \(\Delta t=0{,}300s\), wymagane \(0{,}200s\), zapas \(0{,}100s\). **To dane ze zrzutu, nie zweryfikowane fizycznie dwa prądy CT.** Pierwszy test ma udowodnić, że rzeczywiste \(I_{CT,p}\) i \(I_{CT,n}\) dają te czasy. Kadr dolny ma aktywny bieg 2F, a TCC pokazuje 3F — trzeba wyjaśnić, czy to dwa różne konteksty.

## S02 — promieniowa sieć bez OZE

Zwarcie na końcu odcinka; oba CT mają wartości wynikające z tej samej gałęzi, a inne wkłady wyłączone. Czułość 51 i zachowanie przerwy czasowej na charakterystyce IDMT, w tym w pobliżu I>.

## S03 — OZE pomiędzy zabezpieczeniami

PV/BESS/FW w przyłączu SN przez właściwe pole i transformator blokowy. Zwarcie przed i za przyłączem. \(I_{CT,p}\) i \(I_{CT,n}\) mogą być różne i mieć różne kierunki; prąd w miejscu zwarcia nie zastępuje obu. Sprawdzić czułość, selektywność i kierunkowość.

## S04 — OZE po przeciwnych stronach miejsca zwarcia

Dwa źródła / wejścia zasilające. Ślad wkładów i prądów gałęziowych, uwzględnienie otwartego NO i zamknięcia sprzęgła. Bez samoczynnego twierdzenia, że pierwsze urządzenie listy jest nadrzędnym.

## S05 — pętla zamknięta i dwa GPZ

Zamknięty rozłącznik sekcyjny, zasilanie dwustronne. Powtórzenie punktów krytycznych dla funkcji 50/51 i 67/67N; prawdziwe relacje nadrzędność-podrzędność mogą być zależne od kierunku. Sprawdzić przypadek, w którym nie da się jednoznacznie ustawić jednej pary.

## S06 — układ kompensowany dławikiem

Pojemność doziemna kabli, dławik Petersena, \(U_0/I_0/Y_0\). 51N/67N/admitancyjne: kierunek, próg działania, znaki osi, zmiana uziemienia, Ferranti vs suma CT i błędna polaryzacja.

## S07 — brak danych Z0 i parametrów VT

Przy braku \(Z_0\) / uzwojenia \(3U_0\) otrzymujemy **odmowę odpowiedniej oceny**, a nie zero lub blokadę składowej zerowej przyjętą arbitralnie.

## S08 — GPZ A/B/C

Równoważnik sieci zasilającej zadany na SN albo sieć WN z TR jako granicą. Sprawdzić warunki ważności równoważnika, sprzęgła i wyłączonego TR. EAZ nie może uważać fantomowego źródła za aktywne i oceniać na nim selektywności. Nie projektować rozdzielni WN.

## S09 — transformator 87T

Zwarcie wewnętrzne i zewnętrzne; CT stron, kompensacja grupy Yd11, nachylenie, inrush **tylko jeśli ma model sygnału**, alternatywne przekładnie i położenia P1/P2.

## S10 — awaria wyłącznika 50BF

Q0 otrzymuje sygnał wyłączający, ale nie otwiera. Test opóźnienia CBF, kontrola prądu/styku, inne aparaty z macierzy wyłączeń; ślad zdarzeń z rozróżnieniem statycznej prognozy i dynamicznej symulacji.

## S11 — nasycenie CT i niezgodność nastaw

Różne obciążenia wtórne, ALF/Vk, klasy i rdzenie. Pokazać brak danych, jeśli nie da się ocenić nasycenia. Nie oznaczać tylko klasy 5P20 jako dowodu dla dowolnego przypadku.

## S12 — zmiana nastaw i grupy

Zmiana I>, TMS, 50, polaryzacji i grupy w scenariuszu, zapis do ENM i powrót. Ocena robocza nie przejmuje statusu zapisanej, wyniki zależne od nastaw stają się nieaktualne, rozpływ nie zmienia rewizji z powodu samej nastawy.

## S13 — wielopunktowa kontrola selektywności

Próbki: przy końcu strefy, punkcie przyłączenia OZE, za odgałęzieniem, przed i za otwartym NO, na granicach progów 50/51, blisko przecięć i nieciągłości. Dla funkcji zależnych analiza przedziałowa lub jawny status „oceniono wybrane przypadki”; najlepsza pojedyncza Δt nie potwierdza całego obszaru.

## S14 — rodzaj zwarcia i minimum

3F MAX, 2F, 1F ziemia, 2F ziemia oraz przypadki MIN o odpowiednich c i konfiguracji. Nie mieszać maksymalnego wkładu OZE z minimalnym stanem sieci, który nie był niezależnie liczony.

## S15 — połączenia z SLD

Klik urządzenia w TCC → istniejąca projekcja SN → zaznaczenie pola → inspektor → powrót, zachowane filtry i zoom TCC. Brak drugiego grafu/sposobu nawigacji. Jeśli obiekt ma wyłącznie projekcję nN, użyć odrębnego portalu nN, nie mieszać rysunków.

## S16 — zakres katalogu i eksport

Dwa IED różnych producentów o różnych granicach nastaw i grupach, eksport PDF/DOCX/SVG, zapis i ponowny odczyt. Udokumentowana wersja katalogu; brak fikcyjnych modeli IED lub niezweryfikowanych krzywych producenta.

## S17 — SCO i napięciowe

51N i 67N nie mieszać z SCO. Funkcje SCO I/II i SPZ po SCO konfigurowalne w wariancie ENEA Z.17, domyślnie nieaktywne bez rzeczywistej konfiguracji; dynamika f(t)/U(t) tylko jeśli istnieje właściwy bieg i pomiar.

## S18 — warunki skrajne i niejednoznaczne

Zwarcia przy granicy progu, załączone źródło bez certyfikowanego modelu, brak przecięcia przy osi logarytmicznej, prądy zerowe, odwrócenie fazorów, nakładające się znaczniki, duże nazwy pól, brak grupy 4 w danym IED, zapis starszego projektu.

Każdy scenariusz oznaczać \`id → konfiguracja → norma / metoda → wejścia → wynik/odmowa → zrzut\`. Nie akceptować wyłącznie zielonego testu API.

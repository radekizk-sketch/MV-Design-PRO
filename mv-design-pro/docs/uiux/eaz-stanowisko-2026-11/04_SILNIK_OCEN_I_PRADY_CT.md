# Silnik ocen i fizyka — bez drugiej implementacji

**P0.** Nie implementować obliczeń w React, surowym SVG ani inspektorze. Rozszerzać jeden kanoniczny silnik \`network_model/solvers/protection_*\` i podawać wynik do wspólnego kontraktu. Zmiana FROZEN API wymaga addytywnego wersjonowania.

## A. Prądy rzeczywiście mierzone

Dla zwarcia \(f\), konfiguracji \(c\), przekaźnika podrzędnego \(d\) i nadrzędnego \(u\):
- \(I_{CT,d}(f,c)\): prąd (moduł oraz gdy trzeba fazor) w miejscu i z orientacją przekładnika \(d\).
- \(I_{CT,u}(f,c)\): analogiczny prąd w miejscu \(u\).
- \(I_k''(f,c)\): prąd **w miejscu zwarcia**, inna wielkość.

Nie przyjmować \(I_{CT,d}=I_{CT,u}=I_k''\), chyba że wynika to z obliczeń dla tego przypadku i topologii. Zmiana kierunku od OZE, zamknięte sprzęgło, otwarty NO, źródła po obu stronach uszkodzenia i stan wyspy zmieniają wartości, zasięg oraz kolejność.

Dla 50/51 używać prądu właściwego CT i wybranej funkcji (fazy/rezidualny); dla ziemnozwarciowych CT Ferrantiego albo suma faz zgodnie z połączeniem. Dla 67/67N także fazor i źródło polaryzacji.

## B. Ocena TCC dla pary

Dla określonego zwarcia:
- \`t_d = t_funkcji_d(I_CT,d, nastawy_d, bramki_d)\`;
- \`t_u = t_funkcji_u(I_CT,u, nastawy_u, bramki_u)\`;
- jawnie określić, czy porównuje się czasy zadziałania IED, czasy wyłączników czy całkowity czas usunięcia zwarcia; preferować rzeczywiste końcowe czasy wyłączenia obwodu, jeżeli kontrakt zawiera pełną sekwencję;
- \`Δt = t_u − t_d\` ma sens tylko gdy obie funkcje pobudzone / osiągalne i para ma właściwą relację upstream/downstream; uwzględnić rezerwę czasową i tolerancje z konkretnych kryteriów i danych IED/wyłącznika.
- \`zapas = Δt − Δt_wymagane\`; w przykładowym kadrze \`0,4−0,1−0,2=0,1 s\` **tylko dla tego punktu** i jeśli czasowo porównywane są wielkości tego samego rodzaju.

W całej strefie sprawdzić wszystkie istotne punkty i zakresy prądów, miejsca przecięcia krzywych, progi 50/51, odcinki nieciągłe, kombinacje aktywnych grup, konfiguracje i źródła, a także zmiany kierunku. Minimum zapasu jest wynikiem **rzeczywistego skanowania ciągłego/przedziałowego z kontrolą punktów krytycznych**, nie jedynie najgorszej spośród kilku arbitralnych próbek. Jeśli solver nie ma metody zapewniającej kompletność zakresu, status \`oceniono próbki\` (nie pełna selektywność) i lista zakresów nierozstrzygniętych.

Rozróżniać \`brak pobudzenia\`, \`blokada kierunkowa\`, \`wyłącznik już otwarty\`, \`brak drogi\`, \`brak danych\` od czasu nieskończonego. Nie stosować zastępczej liczby 999,999 s jako „nieskończoność”.

## C. Sekwencja działania (wzorzec ETAP Star)

Dla jednego miejsca zwarcia generować ślad:
\`t=0\` zwarcie → prądy i napięcia w CT/VT → pobudzenia stopni → blokady/zezwolenia → najwcześniejsze przewidywane zadziałanie → komenda trip → czas otwarcia Q0 → zmiana topologii i wkładów źródeł (jeśli model i typ analizy to wspierają) → kolejne działania rezerwy / CBF.

**Nie przedstawiać statycznej sekwencji jako zweryfikowanej symulacji dynamicznej**, jeżeli rdzeń tylko zestawia czasy z pierwszej konfiguracji. Odmienne nazwy: \`Przewidywana kolejność działania\` dla analizy statycznej i \`Symulowana sekwencja zdarzeń\` wyłącznie gdy solver modeluje przeliczenia stanów.

Lista: \`czas, obiekt, funkcja, stan, prąd/warunek, przyczyna, wyjście trip, Q0\`. Nie zakładać, że pierwsze urządzenie w liście = pierwsze wyłączenie. Sprzęgło i OZE muszą być rzeczywiste.

## D. Nastawy i charakterystyki

50: próg I>>, opóźnienie DT, aktywność, ewentualne podtrzymanie, logika i faktyczne wyłączenie; 51: I>, rodzina charakterystyki IEC/IEEE/DT, TMS/dial, minimalny czas i zakres producenta. Krzywa urządzenia = obwiednia **najszybszego aktywnego i dozwolonego stopnia** z poprawną reprezentacją skoków i blokad, nie sztuczna ciągła interpolacja pomiędzy odcinkami. Dla dwóch różnych rodzin stopni etykiety wyraźne. Nie proponować na siłę nazwy „IEC normalnie odwrotna” dla katalogu, którego wariant tego nie wspiera.

Zakresy nastaw pochodzić z IED; można edytować na TCC tylko po odblokowaniu i weryfikacji kroków i jednostek. Po zmianie wyliczyć **nową ocenę roboczą** w backendzie; nie nazywać już starą „aktualną”.

## E. Wymagane granice dodatkowe

TCC może wyświetlać warstwy:
- granica cieplna przewodu/kabla, tylko z właściwych danych i normy doborowej;
- dopuszczalny czas oddziaływania na TR i dopuszczalne punkty inrush tylko z modelu producenta / właściwego obliczenia;
- obszar pracy CT (nasycenie, ALF/Vk, VA, Rct) po uzyskaniu danych;
- minimalny i maksymalny prąd zwarcia, osobno MAX/MIN i rodzaj;
- zapas do obciążenia roboczego \`I_obc\`; nie stosować fikcyjnych 1,2× lub 1,5× jako normowego wymagania.

Ocena doboru aparatury: rzeczywisty prąd i czas w łączniku plus zdolność wyłączania/zamykania oraz cieplna (PN-EN 62271-1 jako część ogólna, dalsze części dla rodzaju aparatu); bez uniwersalnego „spełnia” na podstawie jednego I_k''.

## F. Ocena czułości, rezerwy i SWZ

Dla 50/51/51N przy minimalnym spodziewanym prądzie w chronionej strefie wyliczyć: pobudzenie, rzeczywisty czas, kryterium czułości, margines, sygnał wyłączenia. Gdy minimalnego wyniku brak, wyraźna odmowa. Dla funkcji kierunkowych dodatkowo kontrola warunków polaryzacji i kierunku przy danych ze składowych.

Zapasowa ochrona bada również awarię wyłącznika i przypisane aparaty rezerwowe (50BF/LRW); samo \`50BF=aktywny\` bez trip matrix nie jest dowodem działania.

## G. Reguły wyników i odpowiedzialności

Nie utożsamiać normowego \`I_k''\` wg IEC 60909-0:2016 z dowolną chwilową symulacją RMS/EMT. Wkłady OZE w 3F i wyniki gałęziowe podlegają przyjętemu rdzeniowi IEC; prąd i napięcie dla konkretnego CT/VT musi pochodzić z właściwej analizy, nie z rysunku. Dla kierunkowości ziemnozwarciowej w sieci kompensowanej potrzebne są dane \(Y_0\), uziemienie i połączenia VT/CT.

Jeżeli dla funkcji brak właściwego solvera albo nie ma walidacji normowej, wynik ma status \`Nie oceniono — brak metody dla ...\`, a nie pozorną krzywą z formuły nieadekwatnej.

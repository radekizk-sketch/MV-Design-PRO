# Kontrakt UI/UX — rozszerzenie istniejącego ekranu „Zwarcia”

**Obszar:** obecna zakładka „Zwarcia” w „Zwarcia i zabezpieczenia”. Nie tworzyć nowych ekranów nadrzędnych, nie zmieniać ukończonego wykresu chwilowego i(t) ani metody κ bez wykazanej usterki.

## Stały nagłówek wyników dla wszystkich paneli

**Zwarcie 3F · [jednoznaczna nazwa węzła] · [napięcie] · [scenariusz]**.
Obok: **Rewizja modelu / rewizja wyników, data obliczeń, metoda IEC 60909-0:2016, stan aktualności**. Zmiana węzła/scenariusza synchronizuje wszystkie wykresy, tabelę, inspektor i eksport. Wyniki nieaktualne nie mogą udawać bieżących.

W aktualnym widoku „Zwarcia” zastosować zwarty wybór działu (nie kolejny poziom globalnej nawigacji):
**Przebieg prądu | Prąd wyłączalny | Oddziaływanie cieplne | Rodzaje zwarć**.
Jeśli istnieje już równoważna struktura, rozszerzyć ją zamiast dodawać dubel.

## Dział „Oddziaływanie cieplne” — P0

**Góra panelu, jedna zwarta linia:** \`I''k [kA]\`, \`κ [-]\`, \`m [-]\`, \`n [-]\`, \`Ith [kA]\`, \`Tk [s]\`, \`J [kA²s]\`. Nie wymyślać wartości, których solver nie obliczył.

**Wykres podstawowy:** X = \`Czas trwania zwarcia Tk [s]\`; Y = \`Całka Joule’a J [kA²s]\` przy wybranym punkcie i metodzie; punkt wyniku dla bieżącego Tk, po wskazaniu pokazuje \(I_{th},m,n,\kappa,I_k'',J\). Wartości dla innych czasów wolno wyświetlać tylko po prawidłowym ponownym przeliczeniu parametrów zależnych od Tk (a nie przez przeskalowanie jednego wyniku).

**Obok wykresu w trybie szczegółów:** dwie oryginalnie narysowane przez system charakterystyki współczynników:
- \`m(f · Tk)\` — serie wg \`κ\`, powiązane z rys. 18;
- \`n(Tk)\` — serie wg \`I''k/Ik\`, powiązane z rys. 19;
- wyraźny znacznik aktualnego punktu. Osie i serie zgodne z normą, nie kopiować wykresów IEC jako plików graficznych.

**Dobór aparatury:** osobna sekcja \`Oddziaływanie cieplne w wybranym elemencie\` — użytkownik wybiera szynę, kabel lub aparat, a system pokazuje **prąd przez właściwą gałąź i czas wyłączenia**, dane znamionowe i porównanie \(J_{\mathrm{oblicz}} \le J_{\mathrm{dopuszcz}}\), gdy istnieją dane do właściwego kryterium. NIE porównywać bezpośrednio \(I_{th}(0,1 s)\) z znamionowym \(I_{cw}(1s/3s)\) bez przeliczenia do tego samego czasu i warunków. Dla urządzeń ograniczających prąd: użyć jego krzywej \(I²t\) z danych katalogowych albo wyświetlić konkretny brak.

## Dział „Prąd wyłączalny” — P0

**Wiersz wyników:** \`Ib [kA]\`, \`tmin [ms]\` (normowy minimalny czas opóźnienia), \`tb [ms]\` (czas związany z otwarciem obwodu, jeśli to ta sama wielkość jedynie przy rzeczywistym potwierdzeniu), \`μ [-]\` — **tylko jeśli dotyczy**.

**Wykres:** \`Współczynnik μ\` — X = \`I''kG/IrG\` lub \`I''kM/IrM\`, Y = \`μ\`, serie \`tmin=20/50/100/≥250 ms\` zgodnie z rys. 13; zaznaczony aktualny punkt. Jeśli model nie ma maszyny właściwego typu lub potrzebnych parametrów — nie rysować pozornej charakterystyki \`μ\`; wynik \(I_b\) pokazać według stosownej metody źródła i wyjaśnić dlaczego brak wykresu \`μ\`.

**Wykres pochodny \(I_b(t)\):** można dodać jako oryginalny wykres wyłącznie dla obsługiwanego źródła i zakresu czasu, z pełnym ponownym obliczeniem \(\mu,q\) i pozostałych składników. Nie rysować uniwersalnej monotonicznej krzywej dla falownika PV/BESS, DFIG, sieci zastępczej albo zwarcia odległego od generatora.

**Dobór wyłącznika:** ocena dotyczy rzeczywistego prądu wyłączalnego w gałęzi wyłącznika (nie prądu w miejscu zwarcia), przy poprawnym czasie i znamionowej zdolności wyłączania.

## Dział „Rodzaje zwarć” — P0

Najpierw **porównanie wartości z solvera**, obok siebie dla \`3F | 2F | 1F doziemne | 2F z ziemią\`, ze wskazaniem rodzaju i wartości \(I_k''\) **dla tego samego węzła i konfiguracji**. Jeśli brak \`Z0\` lub danych dla rodzaju zwarcia: wyświetl \`Brak danych Z0 do obliczenia zwarcia doziemnego w [węzeł]\`, nie zero.

**Mapa normowa rys. 7** tylko w podwidoku \`Mapa zależności impedancji\` i wyłącznie po sprawdzeniu założenia jednakowych kątów \(Z1,Z2,Z0\). Dokładne osie: X=\(Z2/Z1\), Y=\(Z2/Z0\); punkt węzła i wyróżniony obszar rodzaju zwarcia. Nie używać tej mapy, gdy stosunki zespolonych impedancji nie spełniają warunków; wtedy zostaje tabela/słupki rzeczywistych wyników.

**Kryterium:** rodzaj zwarcia z największym \(I_k''\) to porównanie wyników obliczeniowych, a nie automatycznie „3F” ani odczyt mapy w dowolnej sieci.

## Źródła wirujące — P1, w kartach źródła, nie nowe globalne zakładki

- Silnik asynchroniczny: \`q(P rM/p)\` (X logarytmiczna, jednostka MW na parę biegunów; serie dla tmin), \`q≤1\`, wynik jego prądu wyłączalnego zgodnie z modelem, rys. 14.
- Generator synchroniczny: \`λmin/λmax\` i serie właściwe dla wirnika cylindrycznego (rys. 15) lub jawnobiegunowego (rys. 16), z \(I''kG/IrG\), \(x_{dsat}\), serią 1/2 i pochodzeniem danych.
- Falowniki i DFIG: inne modele; nie wyświetlać powyższych krzywych, chyba że norma i model przewidują daną zależność.

## Typografia i komunikaty

Język interfejsu: polski, nomenklatura normowa. Nie używać „pełny wywód”, „LaTeX”, „trace”, „raw”, „chart series”, „krzywa orientacyjna” bez wskazania definicji. Zamiast tego \`Podstawa obliczeń\`, \`Wielkości charakterystyczne\`, \`Prąd wyłączalny symetryczny\`, \`Zastępczy prąd cieplny\`, \`Całka Joule’a\`, \`Rodzaj zwarcia\`, \`Wynik z poprzedniej rewizji\`.

Przykłady rozstrzygalnych braków:
- \`Brak czasu trwania zwarcia Tk — nie wyznaczono J oraz Ith.\`
- \`Brak wartości Ik dla tego źródła — nie wyznaczono współczynnika n.\`
- \`Model źródła: przekształtnik pełnej mocy — współczynnik μ nie ma tu zastosowania.\`
- \`Nie określono impedancji składowej zerowej Z0 — brak wyników zwarć doziemnych.\`
- \`Nie można porównać obciążenia cieplnego z aparaturą — brak znamionowej wytrzymałości i czasu odniesienia.\`

Nie wykorzystywać czerwonego koloru do oznaczania zwykłego braku zastosowania funkcji; czerwony tylko dla rzeczywistych naruszeń.

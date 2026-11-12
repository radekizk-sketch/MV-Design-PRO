# Testy i bramki odbioru — IEC 60909-0:2016, charakterystyki dodatkowe

Test ma weryfikować **fizykę i powiązanie danych** oraz renderowanie, nie tylko obecność wykresu w DOM. Referencje obliczać niezależnie od kodu badanego solvera. Źródło każdego przypadku: normowa zależność i rzeczywiste dane.

| ID | Rodzaj | Wymagany przebieg | Kryterium |
|---|---|---|---|
| WYK-01 | Algebra cieplna | Przykład wyłącznie kontrolny: \(I_k''=10\,kA\), \(m=0{,}2\), \(n=1\), \(T_k=0{,}1\,s\) (wartości m/n PODANE, nie wyliczone z normy) | \(I_{th}=10\sqrt{1{,}2}\approx10{,}95445\,kA\); \(J=I_{th}^2 T_k=12\,kA^2s\); potwierdzenie jednostek i relacji. |
| WYK-02 | Rys. 18 | Dwa różne czasy \(T_k\) dla tego samego prawidłowego modelu, \(m\) ze zweryfikowanej metody IEC | \(m\) zmienia się według \(fT_k\) i \(\kappa\), nie jest na sztywno z pierwszego punktu. Test referencyjny z niezależnego wzoru/aneksu A. |
| WYK-03 | Rys. 19 | Przypadek odległy od generatora vs. przypadek z generatorem | Uproszczenie \(n=1\) jedynie gdy wynika z przesłanek; nie stosować globalnie. Brak \(I_k\) przy metodzie wymagającej jego wartości → konkretny brak. |
| WYK-04 | Dobór cieplny | Szyna/linia/aparat z danym \(I_{cw}\) i czasem odniesienia | Ocena dla uzasadnionego czasu i właściwej gałęzi, bez porównania różnych czasów „kA do kA”. Brak danych znamionowych → brak werdyktu. |
| WYK-05 | Aparat ograniczający | Bezpiecznik/wyłącznik ograniczający z katalogową charakterystyką całki Joule’a i wariant bez krzywej | Wariant z krzywą korzysta z danych urządzenia, wariant bez krzywej wyświetla brak informacji, nie udaje normowego całkowania pełnego prądu. |
| WYK-06 | μ | Źródło synchroniczne/asynchroniczne z właściwym stosunkiem prądów i \(t_{\min}\) | Wartość i punkt na rodzinie krzywych rys. 13 z niezależnej referencji; osie i serie 20/50/100/≥250 ms. |
| WYK-07 | μ nie dotyczy | Źródło PV/BESS z pełnym przekształtnikiem | Brak wykresu \(\mu\) i brak podstawienia \(\mu\) do takiego modelu. Obliczenie \(I_b\) tylko właściwą metodą dla przekształtnika. |
| WYK-08 | q | Silnik asynchroniczny \(P_{rM},p,t_{\min}\) | \(P_{rM}/p\) w MW na parę biegunów, X logarytmiczna, seria właściwego czasu; \(q\le1\) zgodnie z normą; niezależny wynik wzoru (69). |
| WYK-09 | DFIG | Źródło dwustronnie zasilane | Nie używać wykresu \(q\) silnika zamiast właściwego modelu DFIG; właściwy kontrakt normowy i wyniki oddzielne. |
| WYK-10 | λ | Generator cylindryczny i jawnobiegunowy z danymi \(x_{dsat},I''_{kG}/I_{rG}\), serią 1/2 | Różna rodzina krzywych 15 i 16; brak podstaw do rysowania przy nieustalonym typie wirnika/serii. |
| WYK-11 | Porównanie zwarć | Ten sam węzeł i rewizja dla 3F,2F,1F,2F+ziemia | Porównanie rzeczywistych wyników; najwyższy prąd wskazany na podstawie wartości solvera, nie z nazwy zwarcia. |
| WYK-12 | Rys. 7 | Jednolite kąty impedancji składowych | Oś X **Z2/Z1**, Y **Z2/Z0**; region/punkt zgodny z niezależnie sprawdzoną referencją normy. |
| WYK-13 | Warunek rys. 7 | Różne kąty \(Z1,Z2,Z0\) albo brak \(Z0\) | Nie wyświetlać mapy rys. 7. Zamiast tego wynik obliczeń / konkretny brak z podaniem wielkości i węzła. |
| WYK-14 | Zgodność obiektu | Dwie szyny o tej samej nazwie, różne identyfikatory i wyniki | Zmiana wyboru przelicza i rysuje właściwy obiekt; inspektor nie pobiera wyniku po nazwie. |
| WYK-15 | Zmiana rewizji | Zmiana nastaw, topologii lub \(T_k\) | Wykresy poprzedniej rewizji oznaczone jako historyczne; bez udawania bieżącego doboru. |
| WYK-16 | Iniekcja błędu | Osobno przekłamać m/n, podmienić Z2/Z0, wymusić μ dla PF, podmienić prąd gałęzi prądem w miejscu zwarcia | Każda celowa modyfikacja powoduje niepowodzenie właściwego testu. |
| WYK-17 | Eksport | Ten sam przypadek 1920×1080, 1440×900, 1280×720; jasny/ciemny; SVG/PDF/TikZ tam, gdzie produkt je obsługuje | Te same wartości, symbole, statusy i zakres osi; brak obcięcia opisów i przesłaniania punktów. |
| WYK-18 | Zintegrowana analiza | Wynik zwarciowy → karta aparatu/inspektor → wynik doboru → powrót | Jeden identyfikator obiektu/scenariusza/rewizji; właściwy prąd gałęziowy i czas; brak dublowania tras nawigacji. |

## Przypadki odrzucone przed wdrożeniem

- Wykres \`Ib(t)\` wyrysowany z liniowej interpolacji między kilkoma czasami i opisany jako wynik IEC.
- Statyczny obraz z normy wyświetlony jako „wynik sieci”.
- \(q\) stosowane do DFIG bez normowego modelu.
- Wykres \(\lambda\) dla PV/BESS.
- Mapa rys. 7 przy różnych kątach impedancji.
- Cieplne porównanie \(I_{th}(0,1 s)\) z \(I_{cw}(3s)\) bez zgodnej metody i czasu.
- Prądy \(I_k''\) w miejscu zwarcia wpisane jako prądy wszystkich pól.
- „Wynik aktualny” przy nieaktualnej rewizji.

## Dowody do odbioru

- Zrzuty: trzy podstawowe działy przy 1920×1080 oraz 1440×900 i 1280×720, jasny/ciemny; szczegóły m/n oraz przypadek odrzuconego rys. 7.
- Wykaz źródło normowe → obliczenie referencyjne → moduł i test → widoczny wynik.
- Testy istniejących przebiegów i κ zielone; testy iniekcyjne; pełna regresja przed integracją.
- Aktualizacja **istniejącej karty** i właściwego wiersza PLANS.md podczas zatwierdzonej integracji, bez nowego planu.

**B-02:** ostateczny odbiór wyglądu i języka po stronie właściciela; testy nie zastępują zrzutów.

# Konkretna makieta 1440×900 / 1280×720 — układ ekranu EAZ

**Wizualizacja dla właściciela.** Bazować na rzeczywistym kadrze 1440×900 (jasnym) i 1280×720 (ciemnym); nie traktować tej tabeli jako sztywnych CSS-pikseli kosztem czytelności.

## A. 1440×900 — standard

| Pas / kolumna | Szerokość/wysokość orientacyjna | Zawartość na ekranie |
|---|---|---|
| Pasek aplikacji | 44 px wys. | MV-DESIGN-PRO, Zabezpieczenia i koordynacja, zakres stanowiska, wynik aktualny, przyciski Widok i Oblicz |
| Zakładki obszaru | 42 + 38 px | Zw. i zabezp. → Koordynacja zabezpieczeń (bez nowego globalnego ekranu) |
| **Lewy panel** | 220–245 px | Wyszukaj, filtry, drzewo GPZ/Stacja/Pole/IED, stan oceny, wybór dwóch do porównania, Pokaż na SLD |
| **Środek** | elastyczne ~790–835 px | tytuł i rzeczywisty przypadek (38 px), przełączniki funkcji (36 px), **pasek najważniejszych wyników** (56 px), wykres TCC (ok. 380–420 px), szczegółowa ocena i lista przypadków (przewijane) |
| **Prawy panel** | 300–325 px | IED, producent/model, CT/VT, grupa nastaw 1–4, dwie sekcje funkcji 51/50, Zapisz nastawy, wersja i stan, Porównaj z, powiązane Q0 |
| Pasek statusu | 30 px | model rev., obliczenia i ich daty, wskazanie nieaktualnych biegów i naruszeń |

**Wymaganie:** pasek ocen \(\Delta t\) jest na ekranie bez przewijania. Wykres nie jest skrócony do kilku pikseli przez dodanie nowych kontrolek; dolne szczegóły mają własny przewijany obszar.

### Rysunek funkcjonalny

\`\`\`text
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ MV-DESIGN-PRO │ Zabezpieczenia i koordynacja │ Zakres stanowiska │ Wyniki aktualne │ Oblicz      │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Ocena i przegląd │ Rozpływ │ [Zwarcia i zabezpieczenia] │ Dynamika │ OZE │ Więcej               │
│ Zwarcia │ Składowe symetryczne │ [Koordynacja zabezpieczeń]                               │
├───────────────────────┬────────────────────────────────────────────────┬────────────────────────┤
│  POLA I URZĄDZENIA    │ KOORDYNACJA 50/51 • Stacja S1 / Pole SN 2     │ NASTAWY I INSPEKTOR    │
│  [Szukaj] [Filtr]     │ [50/51][51N][67N][Admitancyjne][87T][LRW]    │ IED: realny model      │
│  GPZ ...              │ [3F MAX • S1.04 • grupa 1 • rev. 16]          │ CT: 600/5 5P20 • rdzeń │
│   ├ Pole GPZ 1.1      │ [I_CT,p][I_CT,n][t_p][t_n][Δt][wym.][zapas]  │ [gr. 1][2][3][4]       │
│  STACJA S1            ├────────────────────────────────────────────────┤                        │
│   ├ Pole 1            │                                                │ 51 • I>                │
│   ├ ▶ Pole 2          │    TCC (log I [A] / log t [s])               │ I> 180 A pierw.       │
│   └ Pole TR 3         │    turkus: podrz. | fiolet: nadrz.           │ IEC SI • TMS 0,1       │
│  STACJA S2            │    linie I_CT,p/I_CT,n + granice obiektów    │                        │
│   ├ Pole 1            │                                                │ 50 • I>>               │
│   └ Pole 2            ├────────────────────────────────────────────────┤ I>> 1800 A pierw.     │
│  [Pokaż na SLD]       │ Ocena wskazanego zwarcia | Ocena zakresu      │ DT 0,1 s               │
│                       │ Krytyczne punkty | Sekwencja | Obliczenia     │ [Zapisz nastawy]       │
│                       │                                                │ [Porównaj z...]        │
├───────────────────────┴────────────────────────────────────────────────┴────────────────────────┤
│ Model rev. 16 │ zwarcia 3F rev. 16 │ nastawy rev. 16 │ dane aktualne │ 6 ostrzeżeń           │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
\`\`\`

## B. 1280×720 — kompromis bez utraty informacji

- Szerokości: lewa lista zwijana do 48 px z przyciskiem \`Pola\`; prawa kolumna ~300 px z niezależnym przewijaniem i możliwością schowania do przycisku \`Nastawy\`; centrum musi zachować rysunek TCC z czytelnymi osiami.
- Na pierwszym ekranie bez scrolla: nazwa pola, przypadek 3F/2F, pasek \(\Delta t\), co najmniej 270–300 px wysokości właściwego wykresu, górna część edytora 50/51 oraz dostępny przycisk zapisu.
- Ocena zakresu i szczegóły poniżej wykresu przewijane **wewnątrz centrum**, nie całej aplikacji; nie usuwać tych funkcji.
- Nie renderować naraz pełnych paneli 50/51/67N i 87T. Górny wybór rodziny zmienia zawartość centrum i odpowiadające jej nastawy po prawej, reszta stanu zachowana.
- Liczby, wzory i tekst nie mogą schodzić poniżej uzgodnionych minimalnych rozmiarów. Dłuższe nazwy w rozwijanej liście porównań skracać wyłącznie graficznie, nie w danych.

## C. Tryby wykresu na tej samej powierzchni

| Podwidok | Centralna wizualizacja | Panel prawy |
|---|---|---|
| 50/51 | TCC log-log; dwa prądy CT, CTI, min/max i czułość | 50, 51, grupa nastaw, CT, wyłącznik |
| 51N | TCC ziemnozwarciowe i wyniki prądu 3I0 | Ferranti/suma CT, 50N/51N, obwody wtórne |
| 67N | Polarny wykres U0/I0, strefa kierunkowości | Polaryzacja, kąt, progi I0/U0, blokady |
| Admitancyjne | Płaszczyzna G0/B0, obszar działania i punkt pracy | Kryteria G0/B0/Y0, kompensacja, CT/VT |
| 87T | Idiff/Ibias, strefa stabilizacji | CT obu stron, TR, grupy kompensacji, nastawy |
| LRW | Oś czasu wyłączania, macierz aparatów | 50BF/ZS, czasy i wybór aparatu rezerwowego |
| SCO | Progi f i U + przebieg tylko z rzeczywistego biegu | 81U/81R, SCO I/II, SPZ po SCO |

## D. Teksty na makiecie

„Ocena wskazanego zwarcia: spełniono odstęp czasowy 0,300 s, wymagany 0,200 s, zapas 0,100 s”. Gdy zakres nie był analizowany, osobna linia „Ocena zakresu koordynacji: nie wykonano — wybierz punkty i scenariusze”. Nigdy „Selektywność całej sieci zapewniona” z jednego przypadku.

**Uwaga:** pokazane liczby są wiernym odczytem przesłanego kadru, ale sam ten kadr nie potwierdza prądów obu CT. Należy to zweryfikować w solverze przed ich umieszczeniem jako wyników produkcyjnych.

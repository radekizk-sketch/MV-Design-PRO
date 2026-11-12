# Macierz zgodności ENEA GPZ — rozszerzenie audytu pól SN

Źródło: ENEA Operator, Zeszyt 1 „Stacje dwutransformatorowe 110 kV/SN”, wydanie 02.2023–2 (od 02.04.2024).
Oficjalny standard: https://www.operator.enea.pl/uslugi-dystrybucyjne/instrukcje-i-standardy/standardy-w-sieci-dystrybucji

Zrzuty: rozdzielnica-gpz-sekcja-1-jasny(1).png; pole-tr1-z7-jasny(4).png; pole-pomiaru-z17-ciemny(1).png.

Statusy: POTWIERDZONE = niespójny tekst/rysunek; KONTROLA = nie znamy kontraktu modelu; UX = nasze kryterium SLD, a nie wymaganie ENEA. Każdy wpis wymaga uzupełnienia dowodem w kodzie i testem.

| ID | Status | Podstawa | Ustalenie i konkretna korekta |
|---|---|---|---|
| EN-01 | POTWIERDZONE | §13, s. 26 | „Sekcja 1/2” w wizualizacji GPZ ENEA → oznaczenia literowe „Sekcja A/B”, bez zmiany ID ENM. |
| EN-02 | KONTROLA | §13, s. 26 | Numeracja pól: dwurzędowa A nieparzyste/B parzyste, jednorzędowa narastająca; ustalić rodzaj ustawienia przed zmianą. |
| EN-03 | KONTROLA | §13, s. 23–25 | Wzorzec dwutransformatorowy: dwa pola TR, sprzęgło (jedna lub dwie celki), po dwa pola ZU, BKR i pomiaru napięcia; sprawdzić pełny model, nie dopisywać do demonstracyjnego wycinka. |
| EN-04 | KONTROLA | §13, s. 25 | Przy Un sieci SN ≤20 kV wymagana rozdzielnica znamionowa 24 kV; 15 kV sieci ≠ 24 kV klasy aparatury. |
| EN-05 | KONTROLA | §8.2, tabela 3, s. 15 | Przy TR ≤25 MVA: szyny/pole TR/sprzęgło ≥1250 A; pola liniowe, zespołu uziemiającego i baterii ≥630 A; weryfikować dane znamionowe w katalogu. |
| EN-06 | KONTROLA | §9.2, s. 16 | Wytrzymywany krótkotrwały prąd zwarciowy rozdzielnicy SN nie mniej niż 16 kA przez 3 s; nie utożsamiać z chwilowym Ik''. |
| EN-07 | KONTROLA | §13, s. 24 | Fizyczne szerokości celki zwykle 60–80 cm; TR i sprzęgło do 100 cm. Nie przenosić proporcji mechanicznych na piksele SLD. |
| EN-08 | KONTROLA | §13, s. 26 | Gniazda VT, odłączenie i uziemienie VT bez demontażu w polach liniowych, TR i pomiarowych; sprawdzić połączenia i blokady. |
| EN-09 | KOREKTA POPRZEDNICH UWAG | §13, s. 26 | Przekładników napięciowych nie wyposażać we wkładki bezpiecznikowe. Nie wprowadzać bezpiecznika do ich toru pierwotnego z powodu ogólnego wcześniejszego zalecenia; obwody wtórne analizować osobno. |
| EN-10 | KONTROLA | §13, s. 25–26 | Łączniki trzypołożeniowe i uziemniki: poprawne, wzajemnie wykluczające się stany i blokady; geometryczne położenie na SLD = stan modelu. |
| EN-11 | KONTROLA | Z.7, PDF s. 86 | T1 na zrzucie: skrót 1000/5; wariant TR 110/15 kV 25 MVA wymaga 1000/5/5/5/5 A i czterech rdzeni w jednym CT. |
| EN-12 | KONTROLA | Z.7, PDF s. 86 | T3: trzy wtórne uzwojenia 0,1/√3 kV; nie dodawać uzwojenia 0,1/3 z Z.17. |
| EN-13 | KONTROLA | Z.7; §26.9.4 s. 53 | Ramka funkcji 50/51/ZS/50BF/87T/90 na obrazie nie dowodzi poprawnych sterowań. Rozdzielić w modelu sterownik pola, ZS/LRW, różnicowe TR i regulację napięcia. |
| EN-14 | KONTROLA | Z.7, PDF s. 86 | Rozstrzygnąć rzeczywiste styki Q5, GK1 i połączenie T3, łącznie z uziemieniem i blokadami; nie oceniać wyłącznie po czerwonej ikonie. |
| EN-15 | KONTROLA | §26.9.4 i 26.9.9 s. 53–54 | Funkcja ZS: IZS>>T oraz blokowanie od pobudzeń I> odpływów; sprawdzić źródła sygnału, działanie LRW i konsekwencje łączeniowe. |
| EN-16 | KONTROLA | Z.17, PDF s. 97 | T1: SN/√3 : 0,1/√3 : 0,1/√3 : 0,1/3 kV; trzy wtórne uzwojenia i prawidłowy obwód napięcia resztkowego 3U0. |
| EN-17 | KONTROLA | Z.17; §26.9.8 s. 54 | 59=U>, 27=U<, 59N=3U0>, 81U=f<, 81R=df/dt; SCO I/II i SPZ po SCO jako automatyka, tylko gdy skonfigurowane. |
| EN-18 | POTWIERDZONA WADA GRAFICZNA | obraz Z.17 + SLD V3 | Sygnałowa linia przerywana wychodzi poza dolny obrys pola. Trasować w obrębie pola do prawidłowego portu funkcji. |
| EN-19 | KONTROLA | Z.16, PDF s. 96 | Bateria kondensatorów: układ poszczególnych członów, pomiary niesymetrii/uszkodzeń, przekładniki i sposób połączenia; pełna walidacja w modelu. |
| EN-20 | KONTROLA | §26.9.7 s. 54 | Funkcje baterii: I>>, I>, ziemnozwarciowe, nadprądowe uszkodzeń kondensatorów, U>, ZS/LRW i sterowanie czasowe — wg rzeczywistej konfiguracji. |
| EN-21 | KONTROLA | Z.13–Z.15 i §26.9.6 s. 54 | Nie mieszać wariantów kompensacji dławik/rezystor; symbol regulatora AWSC odrębny od fizycznego dławika i rezystora. |
| EN-22 | KONTROLA | Z.12 i §26.9.5 | Sprzęgło: ciągły rzeczywisty tor przez aparaty i właściwe blokady, jeden/dwa człony zależnie od konfiguracji. |
| EN-23 | KONTROLA | §13, s. 26 | Ferranti w polu liniowym: poprawna lokalizacja w torze kablowym, dodatkowe złącze pomiarowe; dokładność i szczegóły aparatu po kontroli katalogu. |
| EN-24 | UX/SLD | kryteria B-02, nie ENEA | Równe proporcje pól, odstęp 48 jednostek od szyn, neutralne tła, TR większy od CT — osobne wymagania wyglądu, nie paragrafy ENEA. |

## Dodatkowa walidacja, której NIE potwierdzają same obrazy

- Napięcie znamionowe i wartości zwarciowe aparatury — katalog → model → inspektor → ocena.
- Wymagania łukoodporności, ciśnienia gazu, przedziałowości, gniazd VT i blokad.
- Obciążenia rzeczywiste uzwojeń wtórnych (nie tylko katalogowe wartości VA).
- Poprawne połączenia CT/VT i przekaźników, w tym kierunkowość i odbiorniki sygnałów.
- Rozróżnienie układów GPZ od stacji kompaktowych SN/nN, które mają inne standardy ENEA.

Do każdego EN-xx wykonawca dopisuje: ścieżka i funkcja kodu, ID w ENM, test, dowód na zrzucie, status „spełnione / luka / nie dotyczy”. Bez danych modelu nie wolno twierdzić, że wszystkie 24 pozycje są stwierdzonymi błędami.

# Z.7 i Z.17 — karty weryfikacyjne aparatury GPZ (ENEA, 2024)

Źródło: ENEA Operator, Stacje 110 kV, Zeszyt 1, wersja 02.2023–2, załącznik Z.7 (strona PDF 86) i Z.17 (strona PDF 97) — https://www.operator.enea.pl/uslugi-dystrybucyjne/instrukcje-i-standardy/standardy-w-sieci-dystrybucji

To własna lista kryteriów, NIE reprodukcja standardowych schematów. Przed zmianą modelu wykonawca potwierdza dokładne wartości w oryginale. Zrzut pokazuje skrót parametrów; sam skrót nie dowodzi braku danych urządzenia w modelu.

## Z.7 — pole transformatora 110/SN, strona SN

### Przekładnik prądowy na torze głównym — T1

Dla wariantu narysowanego jako TR 110/15 kV o mocy 25 MVA:

- Przekładnia pierwotna i wtórna: **1000/5/5/5/5 A**; jeden przekładnik prądowy i cztery rdzenie.
- Rdzeń I: 10 VA, kl. 0,2S FS5.
- Rdzeń II: 10 VA, kl. 0,2 FS5.
- Rdzeń III: 15 VA, kl. 5P20.
- Rdzeń IV: 15 VA, kl. 5P20.
- P1/P2 należy powiązać z rzeczywistą orientacją toru. Zmiana kierunku rysunku nie może bezmyślnie odwrócić biegunowości i związku z obwodami.

Odczytać z rzeczywistych danych katalogowych właściwy wariant dla mocy TR i napięcia SN (na rysunku Z.7 są warianty inne niż 25 MVA/15 kV). Nie podmieniać globalnie wszystkich CT na zestaw 1000/5/5/5/5.

### Przekładnik napięciowy odgałęzienia — T3

- Przekładnia: **SN/√3 : 0,1/√3 : 0,1/√3 : 0,1/√3 kV** (SN zależne od napięcia modelu).
- Uzwojenie I: 0–10 VA, kl. 0,2.
- Uzwojenie II: 7,5 VA, kl. 0,5.
- Uzwojenie III: 7,5 VA, kl. 0,5/3P.
- **Nie** zamieniać III na 0,1/3 kV — taka wersja należy do określonego obwodu Z.17, nie Z.7.

Związek T3 z łącznikiem, głowicą, pozycjami aparatów i obwodami sterownika musi być zgodny z kanonicznym grafem, nie tylko z linią na schemacie.

### Funkcje i urządzenia

§26.9.4: 50/51 oraz funkcje właściwe polu TR, w tym zabezpieczenie szyn i LRW; zabezpieczenie różnicowe transformatora pobiera właściwe sygnały pomiarowe; automatyczna regulacja napięcia jest odrębną funkcją. Ramka kodów 51/50/ZS/50BF/87T/90 może być zwarta, ale nie może sugerować jednego fizycznego przekaźnika lub jednego CT do wszystkich zadań.

Kontrola: rzeczywiste urządzenie → funkcja → wejście CT/VT → wyjście sterujące → właściwy aparat (Q0 itd.). Nie rysować łączności jako automatycznego skutku samego pojawienia się funkcji na liście.

## Z.17 — pole pomiaru napięcia SN

### Przekładnik napięciowy — T1

- Przekładnia: **SN/√3 : 0,1/√3 : 0,1/√3 : 0,1/3 kV**.
- Uzwojenie I: 0–10 VA, kl. 0,2.
- Uzwojenie II: 15 VA, kl. 0,5/3P.
- Uzwojenie III: 15 VA, kl. 3P.
- III: obwód resztkowego napięcia **3U0**, właściwy układ wtórny, a nie zwykła kopia napięcia fazowego.
- Z.17 pokazuje ochronę/łączenie **obwodów wtórnych** i powiązanie z urządzeniem kontrolnym; nie stosować „bezpiecznika na przekładniku napięciowym” wbrew §13. Sprawdzić rodzaj zabezpieczenia, lokalizację i poziom napięcia.

### Funkcje sterownika pola pomiaru napięcia

§26.9.8:
- nadnapięciowe U> (typowo kod 59);
- podnapięciowe U< (27);
- zeronapięciowe 3U0> (59N);
- podczęstotliwościowe f< (81U);
- df/dt (81R);
- automatyka SCO I/II stopnia oraz SPZ po SCO.

Nie traktować kodu „SCO” jak zwykłej funkcji zabezpieczeniowej równoważnej 59/27. Jeśli model nie ma konkretnego stopnia SCO, nie dopisywać go do ramki fikcyjnie.

### Linia przerywana wychodząca poza ramkę

W aktualnym Z.17 na SLD połączenie od T1 do ramki sterownika biegnie poza dolnym obrysem. Należy wyznaczyć typ sygnału i rzeczywiste porty obwodu wtórnego oraz zastosować kanał wewnątrz pola. To potwierdzona wada geometrii. Rozwinięte schematy wtórne mogą pokazywać pełniejsze połączenia; LOD0 nie musi prezentować całej plątaniny przewodów.

## Kontrole powiązań

1. Jedno urządzenie CT/VT w polu i jedno źródło prawdy jego rdzeni/uzwojeń.
2. Edycja obwodu wtórnego działa po zapisie i ponownym otwarciu projektu, również przy przekładniku zapisanym jako urządzenie pola.
3. Parametry w katalogu, kreatorze, SLD, karcie inspektora i raporcie są identyczne.
4. Wyraźnie rozdzielać Z.7 i Z.17 w doborze konfiguracji uzwojeń.
5. Nie powielać elementów ani nie wymyślać połączeń przez graficzne podobieństwo.
6. Funkcje EAZ mają rzeczywiste sygnały wejściowe, wyjścia i powiązane aparaty.
7. Obie reprezentacje wyglądają zgodnie przy tych samych stanach aparatury, ale samo przełączenie LOD nie zmienia topologii.

**Stan:** po samych obrazach nie potwierdzono, czy parametry są nieobecne w bazie, czy wyłącznie obcięte na SLD; wykonawca musi rozstrzygnąć każdą taką pozycję konkretną ścieżką w kodzie.

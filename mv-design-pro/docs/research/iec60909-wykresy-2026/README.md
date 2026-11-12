# IEC 60909-0:2016 — charakterystyki obliczeniowe dla MV-DESIGN-PRO

**Status:** materiały źródłowe do **istniejącej** karty „Zwarcia”/wykresów; **bez kodu, nowych harmonogramów i zmian solvera**. Opus jest wykonawcą/integratorem UI/UX; bramka B-02 pozostaje po stronie właściciela. \`PLANS.md\` pozostaje jedynym nadrzędnym planem.

## Podstawa

Załączony użytkownikowi skan PN-EN 60909-0:2016-09E / IEC 60909-0:2016, 82 strony PDF, z oznaczeniem licencji ENEA Operator. Rysunki i wskazane punkty przejrzano na źródłowym skanie w bieżącym zadaniu. **Licencjonowanego PDF ani reprodukcji rysunków nie dołączamy do repo.** Ten pakiet zawiera własny opis funkcji, wymagania i testy. Opus powinien korzystać z egzemplarza, do którego ma uprawniony dostęp.

**Wydanie obowiązujące dla tej karty: IEC 60909-0:2016.** Wydania 2026 nie deklarować jako zweryfikowanego.

## Zawartość

1. [ATLAS_RYSUNKOW_I_ZASTOSOWAN.md](ATLAS_RYSUNKOW_I_ZASTOSOWAN.md) — rysunki nr 7, 12–16, 18–19, strony i ograniczenia.
2. [KONTRAKT_UIUX_WYKRESOW.md](KONTRAKT_UIUX_WYKRESOW.md) — dokładne układy, legendy, dane, interakcje i polskie nazwy.
3. [MAPA_DANYCH_I_INTEGRACJI.md](MAPA_DANYCH_I_INTEGRACJI.md) — punkty styku istniejącego solvera, śladu i UI; co najpierw zmierzyć.
4. [TESTY_I_BRAMKI_ODBIORU.md](TESTY_I_BRAMKI_ODBIORU.md) — przypadki referencyjne, zastrzeżenia, mutacje i zrzuty.
5. [DYSPOZYCJA_DO_OPUSA.md](DYSPOZYCJA_DO_OPUSA.md) — krótka wykonawcza karta do włączenia w obecny proces.

## Priorytety

**P0:** (a) energia cieplna i prąd zastępczy cieplny \(m,n,I_{th},J\), (b) prąd wyłączalny \(I_b\) i współczynnik \(\mu\) dla źródeł, dla których norma go definiuje, (c) porównanie rodzajów zwarć z warunkową mapą normową rys. 7.

**P1:** współczynnik \(q\) maszyny asynchronicznej oraz \(\lambda_{\min}/\lambda_{\max}\) generatora synchronicznego, wyłącznie w właściwych kartach źródeł.

**P2:** istniejącą charakterystykę \(\kappa\) pozostawić; rozszerzyć tylko gdy pomiar wykaże realny brak, bez duplikowania funkcji.

## Reguły produktu

- Wykresy prezentują rzeczywiste **wyniki obliczeń** i zależności normowe, nie statyczne obrazki z normy. Pochodzenie: podstawa IEC, model źródła, wejścia i metoda.
- Jeden punkt zwarcia, jeden scenariusz, jeden numer rewizji, wspólna świeżość wyników w kanwie, inspektorze, tabelach i eksportach.
- Nie generować fikcyjnych wartości \(n,q,\lambda,\mu\), czasu wyłączenia, parametrów źródła ani doboru aparatów, gdy wejście nie wystarcza.
- Nie poprawiać warstwy wykresów przez przebudowę solvera; wykryte luki w fizyce zgłaszać do karty P0 i jej właściciela.
- Kontynuować aktualne poprawki rozróżnienia **wartości skutecznej i chwilowej**, obwiedni, metody \(\kappa\), stanu wyniku i identyfikatora punktu. Nie cofać poprzednich odbiorów kierunkowych.

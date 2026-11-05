# ENEA Operator — Zeszyt 1: źródło do weryfikacji SLD

## Źródło pierwotne
- Dokument: *Stacje elektroenergetyczne 110 kV. Zeszyt 1. Stacje dwutransformatorowe 110 kV/SN*.
- Wydawca: ENEA Operator sp. z o.o.
- Wersja: 02.2023–2.
- Obowiązuje od: 2024-04-02 (uchwała 148/2023 zmieniona 7/2024).
- Oficjalny PDF: https://www.operator.enea.pl/media/675/stacje-elektroenergetyczne-110-kv-zeszyt-1-stacje-dwutransformatorowe-110-kvsn-obowiazuje
- Katalog standardów: https://www.operator.enea.pl/uslugi-dystrybucyjne/instrukcje-i-standardy/standardy-w-sieci-dystrybucji

## Zadanie dla wykonawcy (Opus)
1. Pobierz PDF z oficjalnego źródła do lokalnego katalogu roboczego, poza repozytorium. Sprawdź tytuł, wersję, datę i integralność pobrania; zapisz SHA-256 w raporcie.
2. Otwórz strony PDF 86 oraz 92–97 wskazane w dotychczasowym zadaniu. **Zweryfikuj numerację fizycznych stron PDF względem numeracji drukowanej oraz oznaczenia załączników**; nie zakładaj ich zgodności.
3. Porównaj odpowiednie rysunki z implementacją SLD: topologię, symbole aparatów, połączenia, przekładniki, oznaczenia, tabliczki, pozycje i relacje funkcjonalne. Przy każdej rozbieżności podaj oznaczenie rysunku, stronę źródła, element kodu i dowód.
4. Popraw tylko potwierdzone rozbieżności; zachowaj zaakceptowany wygląd i architekturę, o ile nie naruszają źródła.
5. W raporcie rozdziel statusy: „zweryfikowano ze źródłem ENEA”, „wg wcześniejszego odczytu Zeszytu 1”, „niezweryfikowane”. Nie deklaruj zgodności całości bez kompletnego porównania.
6. Dołącz testy regresji i zrzuty rzeczywistej aplikacji; odnotuj wynik dla każdego rysunku.

## Ograniczenia
- Nie commituj pełnego PDF ani skanów stron normatywnych: prawa autorskie ENEA Operator.
- Nie traktuj niniejszego pliku jako dowodu zgodności SLD.
- Nie rozszerzaj zakresu na przebudowę interfejsu ani inne standardy.
- Nie myl tego Zeszytu 1 (stacje 110 kV/SN) z Zeszytem 1 dla stacji SN/nN.

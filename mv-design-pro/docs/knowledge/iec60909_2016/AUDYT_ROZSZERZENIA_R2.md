# MV-DESIGN-PRO — audyt rozszerzenia R2 (2026-11-03)

## Co dodano
- Źródło `IEC60909_3_2010`: PN-EN 60909-3:2010 / IEC 60909-3:2009 (66 stron PDF), 24 rekordy.
- Źródło `EN50160_A1_2025`: PN-EN 50160:2023-10/A1:2025-04 (9 stron PDF), 18 rekordów.
- 15 wyprowadzonych reguł kontrolnych o statusie propozycji. Łączny indeks: 112 rekordów, 6 źródeł, 37 reguł.
- W repo wyłącznie autorskie krótkie streszczenia, odsyłacze i SHA-256. **Nie** umieszczono licencjonowanych plików norm.

## Krytyczne granice

**IEC 60909-3:2009 / PN-EN 60909-3:2010**
- §1 (PDF 15 / IEC 7): dwa oddzielne jednoczesne zwarcia doziemne w sieci izolowanej lub rezonansowo uziemionej; oraz częściowe prądy w ziemi dla systemów skutecznie/niskoimpedancyjnie uziemionych.
- §1 jednoznacznie wyłącza **pojedyncze** doziemienie w sieci izolowanej/kompensowanej.
- §5.1 (PDF 20–21 / IEC 12–13): dwa punkty A i B, impedancje sprzęgające M(1) i M(2), odrębne scenariusze topologii.
- §6.2–6.4 (PDF 23–27 / IEC 15–19): prąd uziomu nie jest bezwarunkowo równy całkowitemu I″k1; wzrost potencjału w stacjach i przy słupach.
- §7 (PDF 28–29 / IEC 20–21): redukcja dla przewodów odgromowych.
- §8 (PDF 29–37 / IEC 21–29): **r1** dla ekranów kabla trójżyłowego, **r3** dla trzech kabli jednożyłowych, warunki uziemienia i dane producenta.
- Załączniki A–D są **informacyjne**. Punkty liczbowe w kartach są wyroczniami wyłącznie dla danych podanych w przykładzie.

**PN-EN 50160:2023-10/A1:2025-04**
- Dokument modyfikuje EN 50160:2022 — sam **nie jest** kompletną PN-EN 50160:2023-10.
- §1.2 (PDF 6 / EN 4): definicja 10-minutowej wartości skutecznej; §1.3–1.4: Plt i THD.
- §2.1 (PDF 6 / EN 4): sposób pomiaru zależny od liczby przewodów.
- §2.2–2.4 (PDF 7 / EN 5): reguły dla **nN**, w tym 95% próbek Un±10% i wszystkie próbki Un−15%…Un+10%; nie przenosić progu na SN.
- §3.1–3.4 (PDF 8 / EN 6): w **SN** trzy napięcia międzyfazowe, 10-minutowe RMS, asymetria składowej przeciwnej (0–2% dla 95% próbek w tygodniu) i kryteria harmonicznych odsyłające do **tablicy 5 wydania bazowego**.
- §4–5 (PDF 8–9 / EN 6–7): dla asymetrii WN/NNW zastosowano **should**, natomiast w SN §5.2.4 **shall**; charakter wymagania musi być rozróżniany.
- Liczbowych granic z tablicy 5 wydania bazowego **nie wolno rekonstruować z samego A1**.

## Mapowanie do MV-DESIGN-PRO
1. `extensions_2026_11.json` jest dodatkiem do `knowledge.json`, `sources.json`, `rules.json` poprzez funkcję `kb.load`; brak konkurencyjnego modelu sieci/solvera.
2. `kb.py` rozszerzono o odsyłacze, sprawdzanie stron oraz **wstępne** kontrole: dwa różne miejsca zwarcia, niedopuszczalne pełne świadectwo EN 50160 z samego A1, błędny próg nN w SN.
3. `build_html.py` i `index.html` obejmują nowe źródła; wyszukiwarkę można uruchomić bez serwera.
4. Rdzenie B-01, ścieżki wyników, API, SLD i model ENM pozostały niezmienione. Reguły R2 są **propozycjami kontroli**: nie są dowodem, że solver liczy dziś dwa jednoczesne doziemienia albo że moduł jakości napięcia wykonuje tygodniowy monitoring.
5. Status zmian norm w latach późniejszych pozostaje do sprawdzenia w rejestrze PKN/IEC. Stosowalność ustalaj per data i profil projektu; nie mieszaj wydań.

## Test i odtwarzalność
Po pobraniu gałęzi:
```bash
cd mv-design-pro/docs/knowledge/iec60909_2016
python kb.py check
python kb.py build
python -m unittest discover -s tests -v
python build_html.py
python kb.py ask "zwarcie podwójne doziemne" --source IEC60909_3_2010
python kb.py ask "asymetria napięcia SN" --source EN50160_A1_2025
```
Testy w `tests/test_kb.py` obejmują kompletność kart, źródła, odsyłacze, przykładowe pytania i trzy kontrole wejść. **Pełna regresja CI/solverów nie była wykonywana przy tym rozszerzeniu danych.**

## Ograniczenie praw autorskich
Baza nie zawiera kopii PDF, tablic zastrzeżonego standardu ani pełnego przepisywanego tekstu postanowień. Oryginały należą do kontrolowanego, autoryzowanego obiegu licencyjnego; SHA-256 pozwala zidentyfikować konkretny plik bez jego publikacji.

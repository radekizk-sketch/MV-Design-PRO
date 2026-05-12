# Reference Screenshots for SLD Visual Parity

Ten katalog jest miejscem na zrzuty referencyjne używane do weryfikacji wizualnej SLD klasy OSD.

## Zasady

1. Nie dodawaj zrzutów bez prawa do użycia w repo.
2. Nie używaj zrzutów jako dekoracji. Każdy plik musi mieć metadane i cel porównania.
3. Zrzuty mają służyć do porównania logiki operatorskiej: układu GPZ, pól SN, symboliki aparatów, etykiet, LOD, toru zasilania i czytelności dużej sieci.
4. Referencja nie jest automatycznie źródłem prawdy dla modelu domenowego. Źródłem prawdy pozostaje ENM/topologia i dokumenty specyfikacji.
5. Pixel-level parity można deklarować dopiero po porównaniu renderu z konkretnym plikiem referencyjnym.

## Wymagane metadane dla każdego zrzutu

Przy każdym obrazie dodaj wpis w `SLD_VISUAL_PARITY_EVIDENCE.md`:

| Pole | Wartość |
|---|---|
| Plik | nazwa pliku |
| Źródło | system / dostawca / materiał własny |
| Data źródła | data lub “nieustalona” |
| Zakres | GPZ / stacja / sieć terenowa / DER / raport |
| Dozwolone użycie | opis ograniczeń |
| Cechy do porównania | lista punktów z checklisty |
| Decyzja | użyte / odrzucone / tylko inspiracja |

## Minimalny zestaw referencji przed deklaracją parytetu

1. GPZ z dwiema sekcjami SN i sprzęgłem.
2. GPZ z dwoma transformatorami WN/SN.
3. GPZ z wieloma polami liniowymi.
4. Stacja SN/nN przelotowa.
5. Stacja SN/nN końcowa.
6. Stacja odgałęźna.
7. Sieć terenowa z co najmniej 10 stacjami.
8. Sieć pierścieniowa z NMO.
9. Stacja z PV.
10. Stacja z BESS albo źródłem FW.

## Status katalogu

Na dzień utworzenia katalogu nie ma tu jeszcze referencji obrazu. Oznacza to, że repo może mieć testy strukturalne renderera, ale nie ma pełnego dowodu pixel-level visual parity.

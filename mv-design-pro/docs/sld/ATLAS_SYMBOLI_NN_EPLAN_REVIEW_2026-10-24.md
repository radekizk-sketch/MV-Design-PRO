# MV-DESIGN PRO — atlas symboli nN do odbioru (24.10.2026)

**Status:** DRAFT / NIEPRZYJĘTE. **B-02:** ODRZUCONE. Nie włączono kandydatów do produkcji i nie wykonano scalania.

## Uruchomienie

W katalogu `mv-design-pro/frontend` uruchom istniejący serwer Vite (`npm run dev`), otwórz `/nn-cad-atlas-review.html`.

Ekran: jasny/ciemny, wyszukiwarka, stan OTWARTY/ZAMKNIĘTY, szczegóły portów i ich siatka, przegląd istniejących 20 symboli CAD i 14 **propozycji**, przykładowa rozdzielnica 0,4 kV, tabela podstaw i ograniczeń.

## Zachowanie kanonu

- 20 symboli: `frontend/src/ui/sld/v3/cad/cadSymbolRegistry.ts`, **nietknięte**.
- 14 kandydatów: `frontend/src/ui/sld/v3/cad/experimental/lvCandidateRegistry.ts`.
- Jeden renderer prymitywów: `cad/CadSymbol.tsx`. Dodano jedynie eksport `CadPrimitivesPreview`, bez zmian działania `CadSymbol`.
- Atlas: `frontend/src/nn-cad-atlas-review-main.tsx` i odrębne wejście Vite HTML.
- Testy ochronne: `cad/experimental/__tests__/lvCandidateRegistry.test.tsx`. Weryfikują porty, unikatowość, aliasy technologii, stan noża, brak podmiany produkcji i składnię SVG renderera. **Nie deklarować PASS bez wykonania testów w repo.**

## Matryca funkcjonalna / brakujące symbole

| Kategoria | Stan | Interpretacja |
|---|---|---|
| Wyłączniki ACB / MCCB | alias istniejącego `cad.wylacznik` | Ten sam graficzny znak funkcji wyłącznika, różne parametry katalogowe; nie udawać różnych symboli IEC |
| Wyłącznik MCB / RCD | już w 20-symbolowym rejestrze | Zachować, zmieniać dopiero po dowodzie normowym |
| RCBO | kandydat złożony | Wymaga zatwierdzenia funkcji różnicowo- i nadprądowej |
| SPD, cewka, styki NO/NC/CO | kandydaci | Funkcje obwodów wtórnych wymagają osobnego modelu portów |
| Licznik, amperomierz, woltomierz | kandydaci | Rozróżnić schemat jednokreskowy i wielokreskowy |
| Kondensator, silnik 3-fazowy, zacisk listwy | kandydaci | W modelu trzeba rozróżnić obiekty urządzenia i jego funkcje |
| CT, VT, transformator, bezpiecznik, falownik, źródło PV, BESS | istniejący rejestr CAD | Do przeglądu normatywnego na podstawie aktualnej bazy |
| L1/L2/L3/N/PE/PEN, szyny | atrybuty połączenia/portów, nie koniecznie odrębne aparaty | Nie rozmnażać glifów; parametry pochodzą z ENM |

## Referencje publiczne sprawdzone

1. [EPLAN: Managing Symbols](https://www.eplan.help/en-us/Infoportal/Content/Plattform/2022/Content/htm/xsbgui_k_arbeitsweise.htm) — symbole w bibliotekach; funkcja elektryczna związana z symbolem.
2. [EPLAN: Selecting Symbol Variants](https://www.eplan.help/en-US/Infoportal/Content/Plattform/2025/Content/htm/xsbgui_h_symbolvarianteausw.htm) — maksymalnie osiem wariantów A–H, **stała liczba punktów przyłączeniowych** w obrębie wariantów.
3. [EPLAN: Connection Symbols](https://www.eplan.help/en-US/Infoportal/Content/Plattform/2027/Content/htm/egedgui_k_start.htm) — rozpoznawanie połączeń przez logicznie przypisane punkty, rozróżnienie połączeń graficznych i funkcjonalnych.
4. [IEC 60617:2026 DB](https://webstore.iec.ch/en/publication/2723) — oficjalna baza symboli; dostęp do pełnych grafik i danych w ramach właściwych warunków licencyjnych.

**Uwaga krytyczna:** publiczne opisy EPLAN i IEC nie dostarczają plików symboli pozwalających na odpowiedzialne porównanie 1:1 geometrii. Żaden nowy symbol nie ma statusu NORMATIVE_VERIFIED. Nie wolno powoływać się na „pikselową identyczność z EPLAN” ani deklarować pełnej zgodności PN-EN 60617.

## Wymagane czynności przed odbiorem

1. Uzyskać autoryzowane, konkretne wzorce dla każdego glifu i udokumentować identyfikatory IEC 60617.
2. Przeprowadzić porównanie w tej samej skali (geometria, proporcje, kąty i połączenia), wraz z tolerancjami i zrzutami par wzorzec → kandydat, nie kopiując chronionej biblioteki.
3. Zweryfikować semantykę: liczba i kierunki portów, wielobiegunowość, stan spoczynkowy, funkcje ochronne, klasy i oznaczenia IEC 81346.
4. Uruchomić `npm run type-check`, testy Vitest z modułu eksperymentalnego oraz zrzuty Playwright atlasu w obu motywach i rozdzielczościach.
5. Przejść ścieżkę ENM → LvDomainProjectionV1 → renderer na prawdziwej sieci SN–TR–nN. Dopiero po akceptacji właściciela rozszerzyć kanoniczny rejestr i odwzorowanie modelu.

**Ograniczenie:** przykład rozdzielnicy na atlasie to układ demonstracyjny, nie rzeczywisty stan ani wynik solvera.

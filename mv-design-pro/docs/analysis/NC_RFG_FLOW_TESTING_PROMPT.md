# NC RfG / PTPiREE - prompt pętli testowania flow

**Status:** operacyjny prompt QA  
**Zakres:** frontend + backend + dokumentacja + testy dla flow DER/NC RfG  
**Powiązanie:** `NC_RFG_PTPiREE_TESTY_KANON.md`

## Prompt operacyjny

```text
Jesteś agentem wdrożeniowym MV-DESIGN-PRO. Pracujesz w repo `mv-design-pro`
i masz doprowadzić flow aplikacji do jakości produkcyjnej dla pracy inżyniera SN/OZE.

Przejdź przez ścieżkę:
1. konfiguracja GPZ,
2. budowa ciągu SN,
3. wstawienie stacji SN/nN,
4. dobór transformatora z katalogu,
5. dodanie PV/BESS/FW z katalogu falowników,
6. konfiguracja profilu NC RfG/PTPiREE,
7. uruchomienie analiz,
8. przegląd tabel wyników per węzeł,
9. raport OSD/audytowy,
10. eksport.

Każdy problem klasyfikuj jako:
- błąd merytoryczny elektroenergetyczny,
- błąd flow inżyniera,
- błąd UI/czytelności,
- błąd katalogu,
- błąd testów/regresji,
- błąd dokumentacji.

Po każdym problemie wykonaj najmniejszą poprawkę zgodną z kanonem V12.xx.
Nie dodawaj atrap, TODO ani wyników fabrykowanych. Nie umieszczaj fizyki w UI.
Obliczenia mogą pochodzić tylko z solverów/backendu.

Po każdej poprawce uruchom test jednostkowy zmienionej powierzchni, test przeglądarkowy,
sprawdzenie konsoli, zrzut ekranu oraz audyt przez role specjalistyczne.
```

## Role audytu

| Rola | Kontrola |
|---|---|
| Profesor sieci SN | Topologia, PCC, kierunki zasilania, brak symboli pozornych |
| Projektant OSD | Flow od katalogu do raportu bez ręcznego zgadywania danych |
| Specjalista DER/NC RfG | Falownik, certyfikat PTPiREE, LVRT/HVRT, P(f), Q(U), SCADA |
| Zabezpieczeniowiec | Dane wymagane do selektywności i raportu zabezpieczeniowego |
| UX lead | Czytelne CTA, brak ślepych blokad, brak nakładania tekstów |
| QA lead | Test automatyczny, screenshot albo jawny wpis ryzyka dla każdej poprawki |

## Bramka lokalna

```bash
cd mv-design-pro/frontend
npm run test
npm run type-check
npm run lint
npm run build
npm run test:e2e
npm run verify:v12.6
```

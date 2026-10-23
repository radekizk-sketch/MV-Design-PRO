# MapLibre / DIGPRO ENEA — wdrożenie izolowanego kontraktu R05

**Status:** DRAFT PR / RESEARCH ONLY. Nie scalać jako zatwierdzonego modułu GIS.

Podstawa: decyzja właściciela o kontynuowaniu prac GIS. \`PLANS.md\` na obecnej gałęzi bazowej nadal wykazuje UX-09 jako P3/STOP; ten PR nie zmienia automatycznie planu ani nie zatwierdza B-02.

## Zakres bieżącego przyrostu
- Moduł \`frontend/src/ui/gis/digproGeometryReview.ts\` waliduje transport szkiców R04/R05 i zwraca wynik \`DO_WERYFIKACJI_INZYNIERSKIEJ\`.
- Żadna operacja GIS nie zapisuje do ENM; współrzędne ani geometryczny snap **nie tworzą połączeń elektrycznych**.
- Źródłowy eksport jest nienaruszalny; każda edycja ma parę geometryczną przed/po i odcisk.
- Długość GIS ma status wyłącznie orientacyjny. Długość elektryczna, połączenia portów, katalogi i gotowość solvera pozostają niezweryfikowane.
- Testy negatywne obejmują fałszywe komendy ENM, brak odcisku, edycję niezgodną ze stanem źródłowym i fałszywe potwierdzenie topologii.

## Pełna ścieżka docelowa
Uprawniony eksport dpPower/GPKG → rejestr źródła i zakresu → mapa MapLibre → szkic → walidacja → jawny przegląd identyfikatorów i portów → KANONICZNE operacje domenowe ENM → SldCanvasV3 i wyniki.

**NIE ZREALIZOWANO:** odczytu autentycznych danych ENEA, potwierdzenia topologii, połączenia produkcyjnego API GIS z ENM, użycia prawdziwego pakietu MapLibre w przeglądarce, testów E2E w produkcyjnym systemie, odbioru H5/SLD.

Izolowany pakiet badawczo-testowy R05 udostępniany jest niezależnie; przed adopcją wymaga migracji komponentu interfejsu do React/Vite, zależności npm z pinningiem oraz przeglądu bezpieczeństwa.

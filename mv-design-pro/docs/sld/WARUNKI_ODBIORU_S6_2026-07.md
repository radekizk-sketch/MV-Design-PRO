# WARUNKI ODBIORU S6 — silnik layoutu SLD (dyrektywa właściciela 2026-07-22)

Status: **WIĄŻĄCY — warunki odbioru, nie sugestie.** Uzupełnia
`RECENZJA_EKSPERCKA_LAYOUT_2026-07.md`; przy sprzeczności wygrywa TEN dokument.

## 1. Algorytm: Compact Orthogonal MV Comb Layout (NIE RT/Buchheim 1:1)
Sieć SN nie jest zwykłym drzewem. Uwzględnić: główny grzebień magistralny, pionowe
odejścia, poziome ciągi stacji, aparaturę pola, punkty NO, źródła/transformatory/
odgałęzienia wtórne, realne wymiary opisów i glifów. Szerokość poddrzewa NIE ze
stałego slotu ani z liczby potomków — z RZECZYWISTEGO footprintu: symbole + pola +
trasy + etykiety + wyniki + marginesy aparatury + minimalne światło + rezerwa
routingu. M-02 = gwarancja geometryczna: po compact layout ORAZ po balancingu
ponowne potwierdzenie braku przecięć rozszerzonych bbox poddrzew.

## 2. Piony z rzeczywistej WYSOKOŚCI footprintu poddrzewa
Nie z liczby stacji (dwie gałęzie o tej samej liczbie stacji różnią się aparaturą,
opisami, PV/BESS, zagnieżdżeniem). Zasada: długość pionu wynika z footprintu
gałęzi + wymaganych odstępów + lokalnego routingu, NIGDY z globalnego wyrównania
do najdłuższej. Zakaz sztucznego wydłużania pionów do wspólnej rzędnej.

## 3. Pełna funkcja kosztu + twarde FAIL-e
C = wV·Σpionów + wH·Σpoziomów + wB·załamania + wA·pole bbox treści + wE·energia
niewyrównania poddrzew + wW·kara pustej przestrzeni + wS·kara naruszenia światła +
wX·kara skrzyżowań + wC·kara kolizji + wR·kara niejednoznacznego routingu.
**FAIL (nie miękka kara):** kolizje, naruszenie M-02, zmiana kolejności aparatów,
różne kotwice LOD, skrzyżowanie torów.
**Raport przed/po (liczby z realnie wygenerowanej geometrii):**
verticalLength, horizontalLength, totalOrthogonalLength, bendCount, contentBBox,
sheetUtilization, minimumClearance (każde Before/After) + labelCollisionCount,
subtreeIntersectionCount, nonOrthogonalSegmentCount, ambiguousConnectionCount.

## 4. Balancing: wyłącznie całe poddrzewa
Dozwolone: przesuwanie całych poddrzew/ciągów, redukcja pustki, centrowanie
względem osi przyłączenia, wyrównanie środka geometrycznego lub ważonego.
Zakazane: przesuwanie pojedynczych stacji, aparatów względem toru, zmiana
kolejności pól, zmiana rodzica, odbijanie gałęzi bez jawnej reguły, NIEZALEŻNY
balancing per LOD. Środek ciężkości ważony POWIERZCHNIĄ footprintu (nie liczbą
węzłów). Deterministyczny porządek: głębokość topologiczna → kolejność rodzica →
kolejność odpływu → stabilny identyfikator. Zakaz zależności od kolejności w
pamięci/zbiorów/czasu/niestabilnego sortowania.

## 5. Odstępy: pomiar z repo, nie „na oko"
Górny pas: (1) odczytać obecną stałą, (2) plik+nazwa, (3) wartość przed,
(4) po, (5) wzrost %. Docelowo NAJMNIEJSZA wartość z +20–35%, która usuwa
kolizje, zapewnia światło i nie wydłuża magistrali niepotrzebnie. Nie jedna
globalna stała gap — rozdzielić co najmniej: MIN_GLYPH_CLEARANCE,
MIN_LABEL_CLEARANCE, MIN_FIELD_CLEARANCE, MIN_SUBTREE_CLEARANCE,
MIN_ROUTE_CLEARANCE, TOP_LEVEL_FIELD_CLEARANCE. Światło między RZECZYWISTYMI
obrysami, nie kotwicami.

## 6. Wykorzystanie arkusza: kilka wskaźników
Raportować: widthUtilization, heightUtilization, bboxUtilization, inkDensity lub
occupancyGrid. Zakaz sztucznego rozciągania do krawędzi dla poprawy bbox.
Akceptacja JEDNOCZEŚNIE: bboxUtilizationAfter > Before AND verticalLengthAfter <
Before AND labelCollisionCount=0 AND subtreeIntersectionCount=0 AND
nonOrthogonalSegmentCount=0. Próg regresyjny ustalić PO uczciwym pomiarze bazy i S6.

## 7. Jedna kanoniczna geometria
Layout liczony DOKŁADNIE RAZ: topologia → kanoniczny LayoutResult → sceny
L0/L1/L2. Zakaz osobnego layoutu per LOD. Poziomy różnią się: zakresem opisów,
widocznością danych, detalem symboli, stylem. NIE różnią się: kotwicą stacji,
punktem przyłączenia, położeniem toru głównego, kolejnością aparatów, geometrią
relacji. Test „JEDNA KOTWICA" potwierdza ARCHITEKTURĘ, nie łata rozjazdy.

## 8. Granica odpowiedzialności plików
`engine/sld-layout/layoutEngine.ts`: analiza topologii, footprinty, compact tree,
proporcjonalne piony, balancing, routing ortogonalny, kotwice, bbox, metryki,
raport, deterministyczny wynik. `ui/sld/v3/scene/buildScene.ts`: WYŁĄCZNIE
konsumpcja LayoutResult, warstwy sceny, LOD, style, teksty, dekoracje, interakcje,
hit areas. ZAKAZANE w buildScene: lokalne `x += …`, przesuwanie symboli, skracanie
pionów, niezależne rozstawianie etykiet, lokalne omijanie kolizji, drugi ukryty
silnik geometrii.

## 9. Ortogonalność per segment + higiena tras
Każdy segment: x1=x2 lub y1=y2. Dodatkowo: brak segmentów zerowej długości,
podwójnych załamań, nawrotów 180°, mikrosegmentów, przejść przez bbox symbolu
lub etykiety; zachowane prawidłowe porty aparatów.

## 10. Etykiety w layoucie PRZED rozmieszczeniem końcowym
Kolizje na RZECZYWISTYM bbox tekstu po pomiarze fontu (nie: punkt kotwiczenia,
liczba znaków, przybliżona szerokość). Budżet etykiety wchodzi do footprintu
poddrzewa PRZED compact layoutem. buildScene nie może po fakcie dodawać tekstu
rozbijającego geometrię.

## 11. Testy obowiązkowe
(a) lokalność zmiany: +1 stacja w jednej gałęzi nie przesuwa bez potrzeby całej
sieci (raport liczby zmienionych kotwic); (b) stabilność kolejności: pola/aparaty/
stacje po layoucie = porządek topologiczny; (c) idempotencja: 2 biegi = identyczny
wynik; (d) zakończenie balancingu: skończony limit iteracji, brak oscylacji;
(e) długie opisy PL (nazwy stacji/kabli/wyników z polskimi znakami);
(f) różne footprinty razem: stacja SN/nN, rozdzielnia, PV, BESS, transformator
blokowy, punkt NO, pole pomiarowe; (g) proporcjonalne piony: krótszy footprint
nie dostaje dłuższego pionu bez jawnie raportowanej przyczyny routingu.

## 12. Goldeny: per plik
Dla KAŻDEGO zmienionego goldena: nazwa pliku, przyczyna zmiany, zmieniona metryka,
potwierdzenie niezmienionej topologii, potwierdzenie że zmieniła się wyłącznie
geometria. Zakaz opisu zbiorczego („zaktualizowano snapshoty po zmianie layoutu").

## WARUNKI ODBIORU (wszystkie jednocześnie)
accept:sld-v3 ALL PASS · lod_path_probe L0/L1/L2 PASS · JEDNA KOTWICA PASS ·
wyrocznie S2 PASS · labelCollisionCount=0 · subtreeIntersectionCount=0 ·
nonOrthogonalSegmentCount=0 · ambiguousConnectionCount=0 · crossingCount=0 ·
2× deterministycznie identyczny wynik · koszt geometrii po < przed · Σ pionów
po < przed · wykorzystanie arkusza po > przed · minimalne światło ≥ kontraktowe ·
kolejność aparatów identyczna · ciągłość toru identyczna · zero zmian fizyki ·
100% terminologii polskiej.

**Zasada nadrzędna: layoutEngine.ts tworzy JEDNĄ, kanoniczną, mierzalną geometrię
całego SLD; buildScene.ts ją wyłącznie renderuje. Drugi, lokalny silnik
rozmieszczania w warstwie UI jest zakazany.**

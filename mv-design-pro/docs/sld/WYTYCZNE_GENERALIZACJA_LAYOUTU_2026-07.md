# WYTYCZNE GENERALIZACJI SILNIKA LAYOUTU (dyrektywa właściciela 2026-07-22) — WIĄŻĄCE

ZASADA NADRZĘDNA: silnik layoutu NIE może być dostrajany do jednej sieci/goldena/
współrzędnych. `sldSubstrate52s` to WYŁĄCZNIE przypadek regresyjny — nie wzorzec.
Cel: ogólny, deterministyczny, skalowalny silnik dla realnych sieci SN (różna
wielkość/głębokość/liczba odpływów/stacji/rozgałęzień/typologia/źródła/długości
opisów/punkty NO; promieniowe, magistralne, pierścieniowe, mieszane). Każda reguła
wdrożona tylko po to, by poprawić obraz testowy — NIEDOPUSZCZALNA.

## 1 ZAKAZ HARDCODE: żadnych wyjątków po stationId/feederId/nazwach, ręcznych
offsetów gałęzi, warunków „jeżeli 12 odpływów"/„nodes.length===48", współrzędnych
pod aktualny arkusz, map specialOffsets, rozpoznawania topologii testowej,
lokalnych poprawek w buildScene maskujących brak reguły ogólnej. Wykrycie =
odrzucenie zakresu.

## 2 REGUŁY TYLKO Z WŁAŚCIWOŚCI OGÓLNYCH: footprint poddrzewa, liczba/szerokość
potomków, głębokość topologiczna, typ elementu, liczba aparatów, bbox opisów,
liczba odgałęzień/poziomów, dostępny obszar, światła, koszt routingu, obecność
NO/źródła/transformatora, porty. Dobra reguła: „szerokość poddrzewa rośnie →
zwiększ przedział i przesuń sąsiadów z zachowaniem M-02". Zła: „trzecia gałąź
od lewej → +100 px".

## 3 RODZINY TOPOLOGII (obowiązkowe fixtury): A promieniowa prosta; B promieniowa
z licznymi odgałęzieniami; C magistralna z kilkunastoma+ polami (światła, brak
zagęszczeń); D pierścieniowa z punktem NO (krawędź pozadrzewowa, brak fałszywego
zamknięcia, jawny stan otwarty); E wieloźródłowa (GPZ+lokalne+PV+BESS+trafo
blokowy — bez założenia jednego korzenia); F duża asymetria poddrzew (balancing,
bez wspólnej rzędnej); G długie opisy PL (budżet z realnego bbox, nie liczby
znaków); H wielkoskalowa: 100/250/500 stacji (skalowalność, budżety czasu).

## 4 GOLDENY: zestaw per klasa topologii (topologia, ciągłość toru, rozłączność
M-02, ortogonalność, brak kolizji, deterministyczne kotwice, zgodność L0/L1/L2,
proporcje). Jeden duży obraz NIE dowodzi jakości silnika.

## 5 TESTY METAMORFICZNE: +1 stacja (wydłuża głównie tę gałąź, sąsiedzi o minimum,
bez reorganizacji całości); −1 stacja (lokalne zwolnienie, bez zmiany kolejności);
wydłużenie etykiety (footprint↑, odsunięcie kolidujących, topologia/kolejność bez
zmian); +odgałęzienie (przedział rodzica↑, M-02, tylko kolidujący sąsiedzi);
zmiana typu stacji (działa przez footprint, nie wyjątek); PERMUTACJA rekordów
wejściowych bez zmiany kolejności topologicznej → wynik identyczny.

## 6 SIEĆ ≠ CZYSTE DRZEWO: NO, pierścienie otwarte, rezerwy, źródła rozproszone,
połączenia międzygałęziowe, stacje sekcyjne, wielosekcyjne szyny. Rozdzielić:
(1) drzewo bazowe layoutu, (2) krawędzie dodatkowe/eksploatacyjne, (3) stan
łączników, (4) realną możliwość przepływu. ZAKAZ: usuwania krawędzi
pozadrzewowych, ukrywania NO, fałszywej promieniowości, ciągłości przez otwarty
łącznik, niejednoznacznej rezerwy.

## 7 FORMATY: ekran panoramiczny/standardowy, PDF A0/A1 poziomo, mobile, duży
canvas. Zmiana formatu nie zmienia topologii/kolejności/kotwic między LOD/relacji
rodzic–potomek — tylko upakowanie wg jawnej polityki.

## 8 NIE TYLKO BBOX: równoważyć czytelność toru, jednoznaczność, rozłączność,
światła, długości, załamania, etykiety, stabilność, wykorzystanie. Odrzucać
poprawę bbox kosztem ścisku/zatarcia struktury/czytelności/śledzenia zasilania.

## 9 STABILNOŚĆ PRODUKCYJNA: miary anchorMovementCount, totalAnchorDisplacement,
maxAnchorDisplacement, unchangedSubtreeMovementCount; minimalizować przemieszczenia
niezwiązane z lokalną zmianą.

## 10 WYDAJNOŚĆ: raport per klasa (węzły, krawędzie, poddrzewa, czasy: footprint/
compact/balancing/routing/walidacja/total, iteracje balancingu, pamięć); budżety
dla małej/średniej/dużej; odrzucić niekontrolowaną złożoność przy 250–500 stacji.

## 11 buildScene NIE ratuje layoutu: problem nowej topologii → reguła ogólna w
silniku; zakaz wyjątków w buildScene po typie sieci/liczbie gałęzi/pozycji/LOD/
rozmiarze goldena.

## 12 DOWÓD GENERALIZACJI (tabela przed odbiorem): per przypadek — stacje, typ,
NO, źródła, głębokość, kolizje, przecięcia, nieortogonalne, koszt przed/po,
wykorzystanie przed/po, czas, determinizm. Minimum: 1 prosty, 3 średnie,
3 złożone, 1 wielkoskalowy, 1 pierścieniowy z NO, 1 wieloźródłowy, 1 skrajne
etykiety. Obecna sieć = jeden z przypadków, nie jedyny.

## 13 ODRZUCENIE, jeśli: poprawa tylko jednego goldena; wyjątki po id; ręczne
offsety; warunki od liczby stacji; poprawki geometryczne w buildScene; brak
testów pierścienia/wieloźródłowych/dużych sieci; niestabilność po permutacji;
globalne przestawienie po lokalnej zmianie bez uzasadnienia; regres czasu bez
budżetu.

POLECENIE WYKONAWCZE: każdą decyzję geometryczną wyprowadzać z topologii,
realnych footprintów, reguł routingu i niezmienników. Cel = poprawne generowanie
DOWOLNEJ wspieranej, realnej sieci SN.

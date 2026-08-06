# Decyzja projektowa — łamanie arkusza schematu na wiersze

**Data:** 2026-08-06 · **Karta:** S9-1 (program jakości schematu) ·
**Powód:** `AUDYT_JAKOSCI_SLD_2026-08.md` znalezisko **C-1** (waga 3) —
cała sieć rysowana jako JEDEN poziomy pas o proporcji **53 : 1**
(51 stacji: `66 103 × 1 228 px` na L2), przez co niedrukowalny jest eksport
(E-5), nieprzeglądalny poziom detalu (C-5), pusty jest przegląd (C-3),
a edycja wyrzuca rysunek z kadru (B-2).

Dokument jest podrzędny wobec kanonu V12.xx i `docs/sld/SLD_CAD_SPEC_V3`;
rozstrzyga wyłącznie sposób łamania magistrali na wiersze arkusza.

---

## 1. Problem w jednym zdaniu

Magistrala SN jest układana prefix-sumem kolumn stacji w JEDNYM wierszu
(`layout/columns.ts` `computeColumns`), więc jej długość na arkuszu rośnie
liniowo z liczbą stacji i nic jej nie ogranicza — arkusz przestaje być
arkuszem rysunkowym, a staje się taśmą.

## 2. Rozstrzygnięcie: wiersze ZAWSZE W PRAWO z jawnym łącznikiem powrotnym

Rozważono dwa warianty łamania.

| Wariant | Opis | Werdykt |
|---------|------|---------|
| **A. Wąż (boustrofedon)** | wiersz `k` biegnie w prawo, wiersz `k+1` w lewo; brak biegu powrotnego | **ODRZUCONY** |
| **B. Wiersze zawsze w prawo + łącznik powrotny** | każdy wiersz biegnie od strony zasilania w prawo; koniec wiersza `k` łączy się z początkiem wiersza `k+1` jawnym torem powrotnym | **PRZYJĘTY** |

### Uzasadnienie — czytelność toru zasilania

1. **Kierunek czytania sieci SN jest kierunkiem przepływu mocy od GPZ.**
   Projektant czyta ciąg „od zasilania w głąb sieci". W wariancie A co drugi
   wiersz czyta się od prawej do lewej, więc **kierunek zasilania zmienia się
   co wiersz** — na rysunku sieciowym, gdzie na tej samej kresce leży
   kilkadziesiąt stacji, to jest źródło pomyłki przy odczycie zasięgu
   zabezpieczenia i kierunku zwarcia.
2. **Kompozycja stacji jest jednokierunkowa z konstrukcji.** `compose/station.ts`
   buduje blok stacji z polem „poprzednik" po LEWEJ i „następnik" po PRAWEJ,
   a `layout/measure.ts` wymiarowuje kolumnę w tej samej orientacji; podpisy
   kierunkowe pól (`kier. …`, `odg. …`, spec §9) są przypisane do tych stron.
   Odbicie wiersza w wariancie A wymagałoby albo odbicia CAŁEJ kompozycji
   stacji (ogromny zasięg zmiany, komplet wyroczni §11/§12/§14 do przeliczenia),
   albo pozostawienia bloku bez odbicia — a wtedy **rysunek kłamałby**: pole
   „poprzednik" leżałoby po stronie, z której nic nie przychodzi.
3. **Konwencja rysunku technicznego.** Rysunek ciągły przenoszony na kolejne
   pasma/arkusze czyta się w każdym paśmie w tę samą stronę, a ciągłość
   oznacza się znakiem kontynuacji z odsyłaczem — nie zmianą kierunku czytania.

### Uzasadnienie — koszt skrzyżowań

Wariant A oszczędza jeden bieg poziomy na wiersz (brak powrotu). Ta oszczędność
NIE pokrywa kosztu z pkt 1–2, a sam bieg powrotny jest **z konstrukcji wolny od
skrzyżowań**: prowadzony jest kanałem pionowym na PRAWO od całej treści pasma
(magistrala wiersza `k` + jego odgałęzienia), a następnie sub-poziomem korytarza
NAD wierszem `k+1`, czyli w przestrzeni, w której z definicji nie ma treści
(rezerwacja `ROW_VERTICAL_GAP` między pasmami). Bilans: **+1 pion i +2 biegi
poziome na złamanie, 0 nowych skrzyżowań**.

## 3. Punkt łamania

**Łamiemy WYŁĄCZNIE na odcinku magistrali (przęśle) między dwiema stacjami.**
Zakazane jest łamanie wewnątrz stacji i wewnątrz odgałęzienia:

- podział działa na LIŚCIE stacji ciągu (`stationRefs`), nie na geometrii —
  wiersz arkusza to spójny, niepusty podciąg kolejnych stacji, więc blok stacji
  nigdy nie leży na granicy dwóch wierszy z konstrukcji;
- odgałęzienie (lateral) w całości należy do pasma tej stacji-origin, w której
  się zaczyna — nigdy nie jest dzielone między pasma.

## 4. Przeplot pasm (dlaczego nie „wszystkie odgałęzienia pod spodem")

Odgałęzienie schodzi PIONOWO od swojej stacji-origin w dół. Gdyby magistrala
była złamana na wiersze, a wszystkie odgałęzienia leżały pod ostatnim wierszem,
pion zejścia z wiersza 1 przecinałby wiersze 2..n na wskroś. Dlatego arkusz jest
złożony z **pasm**, a pasmo to:

```
[ wiersz arkusza k: magistrala ]
[ odgałęzienia stacji wiersza k (pakowane półkami) ]
[ wiersz arkusza k+1: magistrala ]
[ odgałęzienia stacji wiersza k+1 ]
...
```

Zejście lateralu nigdy nie opuszcza swojego pasma, więc **liczba przecięć
pion↔wiersz nie rośnie od łamania**.

## 5. Konwencja łącznika ciągu dalszego (nazewnictwo polskie)

Łącznik jest **realnym torem** (przęsło magistrali istnieje w modelu i ma swój
`ownerRef`) — nie jest przerwaniem obwodu. Znaki kontynuacji są WYŁĄCZNIE
adnotacją czytelności, dokładaną na poziomie pełnego opisu:

| Element | Miejsce | Treść |
|---------|---------|-------|
| grot kontynuacji (▶) | koniec wiersza `k`, na torze | — |
| odsyłacz końca | pod grotem końca wiersza `k` | **„dalej wiersz {k+2}"** |
| grot podjęcia (▶) | początek wiersza `k+1`, na torze | — |
| odsyłacz początku | nad grotem początku wiersza `k+1` | **„z wiersza {k+1}"** |

Numeracja wierszy w opisie jest **1-indeksowana** (wiersz 1, 2, 3 …), zgodnie z
tym, jak czyta je człowiek. Zero nazw kodowych projektu w treści (reguła 8).

## 6. Reguła doboru liczby wierszy (proporcja arkusza)

Liczba wierszy `R` jest wyznaczana **wyłącznie z arytmetyki układu
niezależnej od poziomu szczegółu** (`buildRowLayout` liczy kolumny i pasma
zawsze przy pełnym szczególe — SCHEMAT-10 S1), więc **ten sam model daje ten
sam podział na L0/L1/L2** (wymaganie ciągłości LOD).

Predykat doboru (jedno źródło prawdy, `layout/sheetRows.ts`):

```
R = najmniejsze R ∈ 1..N, dla którego  szerokość(R) / wysokość(R) ≤ 1,41
```

gdzie

- `szerokość(R)` = max po pasmach z (szerokość wiersza magistrali, zasięg w
  prawo najdalszego odgałęzienia tego pasma) — liczona z **tych samych
  szerokości kolumn**, których użyje `computeColumns`;
- `wysokość(R)` = Σ po pasmach z (wysokość pasm wiersza + światło + SUMA
  wysokości odgałęzień pasma). **Suma, nie maksimum**: przeplot (§4) zostawia
  w jednym pasmie odgałęzienia garstki sąsiednich stacji, a te są zwykle
  współrzędne w X, więc packer rzadko dzieli między nie półkę (pomiar na sieci
  referencyjnej: 12 odgałęzień → 12 półek po złamaniu, wobec 6 przed nim, gdy
  cały ciąg był jednym pasmem pełnej szerokości).
- wysokość pasm wiersza pochodzi z **funkcji, która ten wiersz zbuduje**
  (`buildRowLayout` → `computeBands`, przekazana do planera jako callback) —
  warunek planu i geometria wiersza mają JEDNO źródło prawdy (reguła KLASA §3).

**Kwant formatu.** Budżet szerokości wiersza i obie miary planu są kwantowane
do wielokrotności `SHEET_WIDTH_QUANTUM` (1024 px świata) — to odpowiednik
stałego formatu arkusza. Bez kwantowania każda edycja sieci zmieniałaby budżet,
a że podział jest zachłanny od lewej, zmiana budżetu przelewa WSZYSTKIE wiersze:
wstawienie jednej stacji teleportowałoby cały rysunek. Z kwantowaniem drobna
edycja mieści się w tym samym formacie (§7), a przelanie następuje dopiero przy
świadomej zmianie rzędu wielkości i jest wtedy uczciwe.

Docelowa proporcja **1,41 : 1** = A3 poziomo (420/297), próg odbioru **2 : 1**
pochodzi z karty S9-1; celowanie w 1,41 zostawia ~40 % zapasu na składniki,
których planer nie modeluje co do piksela (pas zejść, otwarte ogony, nawis
strefy GPZ). Zapas jest pilnowany POMIAREM, nie założeniem — wyrocznia
`sheetAspectRatio` + bramka `sheet_aspect_probe` sprawdzają REALNY bbox sceny
na każdym poziomie szczegółu.

### Zrzuty dowodowe (`audyt-2026-08/`, 24 pliki)

Renderowane PRODUKCYJNĄ kanwą v3 (`scripts/render_s9_1_lamanie.tsx` +
`scripts/rasterize.mjs`), obie sieci × L0/L1/L2 × oba motywy:

- `s9-1-przed-{referencyjna,dlugi-ciag}-L{0,1,2}-{ciemny,jasny}.png` — stan
  sprzed łamania (drzewo `d6cbe83d`);
- `s9-1-{referencyjna,dlugi-ciag}-L{0,1,2}-{ciemny,jasny}.png` — po łamaniu.

Stopka każdego zrzutu niesie zmierzone liczby (liczba wierszy, bbox, proporcja,
gęstość tuszu) — zrzut jest dowodem, nie ilustracją.

## 6a. Inwentarz KLASY „geometria zakłada jeden wiersz o rosnącym X"

Reguła KLASA, NIE INSTANCJA (CLAUDE.md) wymaga wypisania WSZYSTKICH miejsc
dzielących naprawiany mechanizm, nie tylko tego z audytu. Założenie „ciąg
główny leży w jednym wierszu, więc porządek topologiczny == porządek X" żyło
w SIEDMIU miejscach; wszystkie przejrzane, stan po karcie:

| # | Miejsce | Stan |
|---|---------|------|
| 1 | `topBandFieldClearances` (światło pasa górnego) | **NAPRAWIONE** — mierzy wewnątrz wiersza (przed: światło −888 px między polami z różnych wierszy) |
| 2 | `topBandFieldExtents` (ekstenty pól, dowód „rozstaw = footprint + światło") | **NAPRAWIONE** — grupuje po wierszach, ta sama reguła przynależności co #1 |
| 3 | `computeLateralChannelXById` (kanały zejść odgałęzień) | **NAPRAWIONE** — liczone z kolumn WIERSZA, którego dotyczą (wcześniej z jednej globalnej listy) |
| 4 | `insertColumnChannels` — rezerwacja kanałów dla „późniejszych" odgałęzień | **NAPRAWIONE** — ograniczone do odgałęzień TEGO pasma (przeplot §4 sprawia, że pozostałe nigdy przez nie nie przechodzą) |
| 5 | wyrocznia kolejności stacji (`checkContinuity`, skrypt odbioru) | **NAPRAWIONE** — kanon „wiersz arkusza, potem rosnące X" |
| 6 | test anty-dryfu etykiet przęseł (`buildScene.w3Labels`) | **NAPRAWIONE** — porównanie w obrębie wiersza |
| 7 | test lokalności zmiany (`buildScene.schemat10s7p3` §9) | **NAPRAWIONE** — kanon „skutek idzie wyłącznie w dół, wiersz jako całość" |

Świadomie POZA naprawą (z podaniem powodu, nie „poza zakresem karty"):
`ui/sld/v3/canvas/overlay.ts` i warstwa `sldDeltaOverlay` — czytają geometrię
gotowej sceny (punkty tras, kotwice symboli), NIE zakładają porządku X ciągu;
złamanie arkusza jest dla nich przezroczyste. Sprawdzone grepem po
`mainTrunkStationIds` (5 konsumentów produkcyjnych, żaden nie sortuje po X)
oraz po sortowaniu `a.x - b.x` w `ui/sld/v3/**` (2 wystąpienia, oba w #1/#2).

## 7. Determinizm i stabilność

- `planSheetRows` jest czystą arytmetyką na tablicy szerokości kolumn i
  wysokości pasm — ten sam model daje ten sam podział (P7).
- Podział jest **prefiksowy**: wiersz `k` zależy wyłącznie od stacji o indeksach
  `< koniec wiersza k`. Wstawienie stacji w wierszu `k` nie może więc zmienić
  geometrii wierszy `< k` — o ile nie zmienia liczby wierszy. Test
  `stabilność wierszy` pilnuje tego wprost.

## 8. Pomiar przed / po (wykonany, nie oszacowany)

Obie sieci budowane deterministycznie w kodzie testów; pomiar tymi samymi
miarami przed zmianą (drzewo `d6cbe83d`) i po niej. Kanwa odniesienia
1322 × 696 px (ta sama, na której mierzył audyt).

**Sieć referencyjna** — `sldSubstrate52s`, 53 stacje, magistrala 12 stacji + 12 odgałęzień:

| Poziom | proporcja przed → po | gęstość tuszu | pokrycie kanwy | symboli poza kanwą |
|--------|----------------------|---------------|----------------|--------------------|
| L0 | **4,15 → 1,51** | 1,38 % → 1,67 % | 40,4 % → 62,4 % | 0/69 → 0/66 |
| L1 | **4,06 → 1,49** | 2,22 % → 2,61 % | 41,3 % → 61,5 % | 0/765 → 0/762 |
| L2 | **4,06 → 1,49** | 2,28 % → 2,67 % | 41,3 % → 61,5 % | 0/765 → 0/762 |

**Długi ciąg** — kształt z audytu (magistrala wydłużona do 52 stacji, 93 stacje łącznie):

| Poziom | proporcja przed → po | gęstość tuszu | pokrycie kanwy | symboli poza kanwą |
|--------|----------------------|---------------|----------------|--------------------|
| L0 | **10,30 → 1,33** | 0,77 % → 2,03 % | 33,5 % → 55,0 % | **27/109 → 0/109** |
| L1 | **10,07 → 1,32** | 1,36 % → 3,18 % | 34,2 % → 54,4 % | **319/1286 → 0/1286** |
| L2 | **10,07 → 1,33** | 1,39 % → 3,20 % | 34,2 % → 54,9 % | **314/1286 → 0/1286** |

**E-5 (eksport niedrukowalny) zamknięty tą samą zmianą.** Kadr eksportu SVG
pochodzi z bboxa sceny (`export/exportFrame.ts` `computeContentFitFrame` —
ta sama funkcja rozmiaru co ramka arkusza), więc proporcja eksportu jest
proporcją arkusza:

| Sieć | kadr eksportu przed → po | arkuszy A3 poziomych obok siebie |
|------|--------------------------|----------------------------------|
| referencyjna | 14 416 × 3 601 (4,00 : 1) → 8 336 × 5 609 (**1,49 : 1**) | 2,8 → **1,1** |
| długi ciąg | 35 680 × 3 601 (9,91 : 1) → 9 182 × 6 913 (**1,33 : 1**) | 7,0 → **0,9** |

Rysunek przestał wymagać sklejania arkuszy w poziomie — mieści się w jednym
A3 poziomym. Pozostałe braki eksportu (tytułówka, martwe PDF/PNG, pusty DXF)
to karta **S9-6**, która dopiero teraz ma na czym pracować.

**C-2 wyjaśnione u źródła.** Auto-fit gubił symbole nie dlatego, że źle liczył
kadr, tylko dlatego, że `fitToView` (`v2/viewport/ViewportController.ts`) ma
DOLNE ograniczenie skali `MIN_SCALE = 0,05`. Rysunek o proporcji 10 : 1 (a tym
bardziej 53 : 1 z audytu) wymagał skali poniżej tego progu, więc kamera stawała
na 0,05 i część arkusza zostawała poza kanwą (pomiar wyżej: skala przed = 0,0500
dokładnie na ograniczeniu). Po złamaniu potrzebna skala to 0,09 — powyżej progu,
więc kadr mieści 100 % symboli. Naprawa C-1 była WARUNKIEM naprawy C-2, nie
przypadkiem.

## 9. Co ta karta ŚWIADOMIE zostawia

- **Odgałęzienia nie są łamane.** Pasmo odgałęzienia jest zwykle o rząd krótsze
  od magistrali (pomiar na sieci referencyjnej: najdłuższe pasmo lateralne
  4 168 px wobec 11 552 px magistrali), więc nie jest źródłem C-1. Gdy pomiar
  wykaże pasmo lateralne dominujące szerokość arkusza, ta sama maszyneria
  (`planSheetRows`) da się do niego przyłożyć bez zmiany reguły.
- **Ramka arkusza i typografia** (C-4, C-7, znaczniki stref) — karta S9-7.
- **Gęstość tuszu na przeglądzie < 5 %** — kryterium odbioru karty S9-1 NIE
  zostało osiągnięte i nie da się go osiągnąć samym łamaniem. Pomiar: 0,77 % →
  2,03 % na L0 długiego ciągu (wzrost 2,6×) przy proporcji już naprawionej.
  Przyczyna zmierzona, nie zgadnięta: **arkusz jest wymiarowany geometrią
  pełnego szczegółu na KAŻDYM poziomie** (SCHEMAT-10 S1 „jedna kotwica" —
  `buildRowLayout` liczy kolumny zawsze przy L2, żeby zoom nie przemeblowywał
  rysunku), a szerokość kolumny stacji jest w znacznej części rezerwacją na
  etykietę przęsła („S08 ↔ S09 · YAKXS 3×120/16 · 20 kV · l = 50 m", §19.2).
  Na przeglądzie stacja jest glifem 48 × 48 px w kolumnie ~1 000 px, więc
  ~95 % arkusza to z definicji rezerwacja opisowa, której na L0 nikt nie rysuje.
  Podniesienie gęstości powyżej 5 % wymaga JEDNEJ z dwóch zmian, obie poza
  zakresem tej karty i obie dotykające cudzych osiągnięć:
  (a) osobna, zwarta geometria poziomu przeglądu (cofnięcie „jednej kotwicy"
  S1 — wymaga rozstrzygnięcia, czy zoom może przemeblowywać rysunek);
  (b) skrócenie rezerwacji etykiet przęseł / rozmiary napisów w pikselach
  EKRANU (karta **S9-7**, znaleziska C-4 i C-6).
  Dług zapisany świadomie, z pomiarem i planem — nie zamaskowany progiem.

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
R = najmniejsze R ∈ 1..N, dla którego  szerokość_dokładna(R) / wysokość_dolna(R) ≤ 1,41
```

gdzie

- `szerokość_dokładna(R)` = max po pasmach z (szerokość wiersza magistrali,
  zasięg w prawo najdalszego odgałęzienia tego pasma) — wielkość **dokładna**,
  liczona z tych samych szerokości kolumn, których użyje układ;
- `wysokość_dolna(R)` = Σ po pasmach z (wysokość pasm wiersza + światło +
  wysokość NAJWYŻSZEGO odgałęzienia pasma) — **dolne** ograniczenie wysokości
  (odgałęzienia rozłączne w X dzielą półkę, więc realna wysokość jest ≥ tej
  wartości).

Ponieważ licznik jest dokładny, a mianownik jest ograniczeniem DOLNYM, warunek
`≤ 1,41` daje **gwarancję**, a nie oszacowanie: realna proporcja arkusza jest
zawsze **nie większa** od 1,41 : 1, czyli z zapasem mieści się w progu odbioru
**2 : 1**. Cena tej gwarancji: sieci z wieloma odgałęzieniami wychodzą arkuszem
WĘŻSZYM niż A3 (proporcja < 1,41) — nigdy szerszym. To jest świadomy wybór:
błąd w stronę „za wysoki" jest odwracalny przewijaniem, błąd w stronę „za
szeroki" odtwarza C-1.

Docelowa proporcja **1,41 : 1** = A3 poziomo (420/297), próg odbioru **2 : 1**
pochodzi z karty S9-1.

## 7. Determinizm i stabilność

- `planSheetRows` jest czystą arytmetyką na tablicy szerokości kolumn i
  wysokości pasm — ten sam model daje ten sam podział (P7).
- Podział jest **prefiksowy**: wiersz `k` zależy wyłącznie od stacji o indeksach
  `< koniec wiersza k`. Wstawienie stacji w wierszu `k` nie może więc zmienić
  geometrii wierszy `< k` — o ile nie zmienia liczby wierszy. Test
  `stabilność wierszy` pilnuje tego wprost.

## 8. Co ta karta ŚWIADOMIE zostawia

- **Odgałęzienia nie są łamane.** Pasmo odgałęzienia jest zwykle o rząd krótsze
  od magistrali (pomiar na sieci referencyjnej: najdłuższe pasmo lateralne
  4 168 px wobec 11 552 px magistrali), więc nie jest źródłem C-1. Gdy pomiar
  wykaże pasmo lateralne dominujące szerokość arkusza, ta sama maszyneria
  (`planSheetRows`) da się do niego przyłożyć bez zmiany reguły.
- **Ramka arkusza i typografia** (C-4, C-7, znaczniki stref) — karta S9-7.

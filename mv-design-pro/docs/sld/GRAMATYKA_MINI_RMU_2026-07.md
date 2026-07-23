# GRAMATYKA MINI-RMU (L0) — 19 reguł konstrukcyjnych (dyrektywa właściciela 2026-07-23) — WIĄŻĄCE

1. Ścisła zgodność semantyczna z symboliką L1/L2 — L0 = uproszczenie TEGO SAMEGO obiektu, nie nowy język.
2. TOR MOCY najważniejszy: linia SN przechodzi przez stację CIĄGLE i jednoznacznie; symbol nie przerywa ani nie maskuje toru.
3. Geometria jednoznacznie wskazuje wejście i wyjście toru — sposób włączenia stacji rozpoznawalny bez zoomu.
4. Mini-RMU = integralny fragment toru, nie ikona nałożona na linię (moc płynie PRZEZ stację).
5. Markery (TR/DER/NO/…) uzupełniające — nie dominują nad przebiegiem linii SN.
6. Każdy marker ma STAŁĄ kotwicę względem obrysu — niezależną od orientacji sieci, sąsiadów, layoutu.
7. Priorytety markerów + reguły rozmieszczania; nowe atrybuty (BESS, ATS, regulator, kompensacja, PQ…) bez kolizji i bez zmiany znaczeń istniejących.
8. Markery WYŁĄCZNIE z modelu danych (właściwości obiektu, nie nazwy/ręczne parametry).
9. Rozszerzalność: nowe typy stacji/wyposażenia bez nowych ikon ad-hoc i bez przebudowy geometrii bazowej.
10. Minimalne odstępy marker–marker i marker–obrys zdefiniowane (czytelność przy najmniejszych rozmiarach).
11. Te same grubości linii i proporcje co symbole L1/L2.
12. Proporcje symbolu transformatora zrewidować — nie może dominować wnętrza.
13. Obrys, promienie, marginesy, siatka konstrukcyjna = parametry GLOBALNE silnika, nie wartości lokalne renderera.
14. Gramatyka opisana FORMALNIE jako specyfikacja reguł konstrukcyjnych; renderer implementuje reguły, nie ręczne ikony.
15. Identyczne cechy modelu → identyczny symbol, niezależnie od kolejności danych/orientacji/layoutu.
16. PEŁNA MACIERZ dopuszczalnych kombinacji cech (typ×TR×DER×NO×rozszerzenia) + automatyczna walidacja reprezentacji.
17. Weryfikacja czytelności przy minimalnym rozmiarze widoku całości — każdy marker rozpoznawalny bez zoomu.
18. JEDNA gramatyka w CAŁYM systemie (SLD, wyniki, zwarcia, rozpływ, eksport, wydruki, porównania) — zero lokalnych wyjątków.
19. ZASADA NADRZĘDNA: na żadnym LOD nie wolno utracić ciągłego toru mocy od źródła/GPZ przez wszystkie pola/rozdzielnie/linie/odgałęzienia/stacje/TR/punkty sekcyjne/DER.

---

# Specyfikacja konstrukcyjna (GS-2, V12K-137, 2026-07-23) — WIĄŻĄCA

Reguły 13–14: parametry konstrukcyjne sylwetki mini-RMU (L0) są GLOBALNYMI
stałymi silnika w JEDNYM miejscu — `frontend/src/ui/sld/v3/symbols/miniRmuGrammar.ts`
(`MINI_RMU`). Renderer `symbols/glyphs.tsx` (`StationCollapsedGlyph`) jest WYŁĄCZNIE
implementacją poniższych reguł — zero literałów lokalnych (bramka: test
`symbols.test.tsx` „geometria WYŁĄCZNIE z MINI_RMU"). Zmiana kształtu = zmiana TU
i w `miniRmuGrammar.ts`, nie ręcznych wartości w glifie.

## S1. Siatka i bbox (reguła 13)
- Bbox = 6×GRID = **48×48** (GRID = 8). Uzasadnienie rozmiaru: fit sieci
  referencyjnej `sldSubstrate52s` (skala 0,1203 ⇒ 48px świata = **5,78px ekranu**;
  16px = 1,93px, nieodróżnialne od kropki węzła) — patrz `defs.ts`.
- Środek `(24,24)` = KOTWICA stacji na każdym LOD (JEDNA KOTWICA, reguła 6/15) i
  oś szyny SN.

## S2. Tor mocy (reguły 2–4)
- Enklozura (obrys RMU): `x=4, y=10, w=40, h=28, rx=3`, **bez wypełnienia** (nie
  maskuje toru — reguła 3).
- Szyna SN: pozioma kreska `y=24` (środek), `x1=8 … x2=40` — przechodzi PRZEZ
  enklozurę na wylot, **współliniowa z portami W(0,24)/E(48,24)** (mini-RMU =
  FRAGMENT toru, nie ikona na linii — reguła 2/4). Bramka: `miniRmuPathContinuityGaps()`.
- Kolumna routingu N–S: `x=24` (piony laterali) — wszystkie markery trzymają się
  od niej o `minGap.marker`.

## S3. Kotwice markerów — stałe, priorytety, strefy rozłączne (reguły 5–7, 10, 12)
Minimalne odstępy GLOBALNE: `minGap.marker = 4` (marker↔marker i marker↔kolumna
routingu), `minGap.outline = 1` (marker↔enklozura).

| Priorytet | Cecha | Kotwica (względem obrysu) | Strefa |
|---|---|---|---|
| 1 | Sekcyjna (sprzęgło) | dwie kreski `x=20` i `x=28`, `y=20…28` — flankują kolumnę routingu na szynie | środek, na szynie |
| 2 | Transformator (SN/nN) | stub `x=16, y=24→27` + 2 okręgi `cx=16, cy=30/34, r=2,5` | dół-lewo, POD szyną |
| 3 | DER (rodzaj) | stub `x=32, y=24→19` + marker `cx=32, cy=15, ±4` (PV trójkąt / BESS kwadrat / FW·generator okrąg) | góra-prawo, NAD szyną |
| 4 | Łącznik/NO otwarty | kwadrat `x=37, y=21, 6×6` | prawo, na szynie |

- Reguła 12 (transformator UZUPEŁNIAJĄCY): oba okręgi TR zajmują wysokość
  `2,5+2,5+4 = 9px` w 28px wnętrza = **≈0,32 (≤0,5)** — nie dominuje wnętrza.
  Bramka: `transformerInteriorHeightRatio() ≤ 0,5`.
- Strefy markerów są PARAMI ROZŁĄCZNE i każda zachowuje `minGap` od enklozury,
  sąsiada i kolumny routingu. Bramka: `markerZone()` + test „odstępy markerów".

## S4. Grubości (reguła 11 — proporcje wspólne z L1/L2)
- Obrys = `V3_STROKE_APPARATUS` (**ta sama** kreska aparatu co glify L1/L2).
- Szyna = `2` (GRUBSZA od obrysu — nośnik „tor” = WAGA, nie kolor; hierarchia §6
  szyna > tor > odgałęzienie w skali L0).
- Markery = `0,9` (CIEŃSZE od obrysu — warstwa uzupełniająca).
- Relacja `szyna(2) > aparat(1,2) > marker(0,9)` zaryglowana testem.

## S5. Macierz kombinacji cech (reguły 15–16)
Osie: `sekcyjna{0,1} × transformator{0,1} × DER{brak,pv,bess,wind,generator} × NO{0,1}`
= **40 kombinacji**. Każda renderuje się poprawnie (bazowa sylwetka + właściwe
markery) i UNIKALNIE (iniekcja cechy→sygnatura DOM). Identyczne cechy ⇒ bajt-
identyczny glif (reguła 15). Bramka: `buildScene.schemat10gs2.test.ts` /
`symbols.test.tsx` „pełna macierz".

## S6. Czytelność przy minimalnym rozmiarze (reguła 17)
Na kadrze CAŁEJ sieci referencyjnej (fit skala 0,1203): sylwetka 48px → **5,78px
ekranu** (rozpoznawalna jako blok stacji, ≠ kropka 1,93px). Markery (strefa 8px)
→ ~1px na pełnym oddaleniu — rozpoznawalne od PIERWSZEGO kroku zoomu (glif w
rozmiarze projektowym 48px: każdy marker ≥ swojej kreski i strefy `minGap`).
Bramka: test „czytelność min. rozmiaru" (pomiar px).

---

## RECENZJA GS-2 (2026-07-23): WERDYKT NO-GO — WYMAGANA PRZEBUDOWA (ZADANIE DLA FABLE OSOBIŚCIE)

Ocena inżynierska: obecny glif to linia przez obudowę + piktogramy — sugeruje
NIEDOPUSZCZALNE połączenie kabli bezpośrednio z szyną. L0 ma być MINIATUROWYM
SLD ROZDZIELNICY (kompozycją PÓL), nie ikoną stacji.

### Błędy krytyczne (do usunięcia)
K1. Kabel NIE wchodzi bezpośrednio na szynę — tor pola liniowego ZAWSZE:
    kabel SN → GŁOWICA (trójkąt) → APARAT pola → szyna SN (i lustrzanie po
    drugiej stronie). Głowice widoczne przy wejściu I wyjściu.
K2. Szyna NIE wychodzi poza obudowę (obecna kreska na wylot = błędna semantyka
    szyny zbiorczej wyprowadzonej poza RMU). Szyna żyje WEWNĄTRZ; sieć zewnętrzna
    dochodzi do głowic pól.
K3. Transformator przez WŁASNE POLE: szyna → aparat/zabezpieczenie pola TR →
    transformator SN/nN (nie okręgi doczepione do kreski).
K4. TRÓJKĄT = wyłącznie głowica kablowa (konflikt z markerem PV USUNĄĆ; typ
    źródła DER rozróżniać inaczej, marker typu tylko POMOCNICZO).
K5. DER przez WŁASNE POLE: szyna → aparat pola DER → tor/głowica → źródło
    (piktogram nad linią NIE zastępuje elektrycznego odgałęzienia).
K6. Sekcjonowanie = uproszczony JEDNOZNACZNY symbol łącznika/sprzęgła W TORZE
    (nie dwie kreski); NO = STAN aparatu — realna PRZERWA w torze mocy, nie
    prostokątny marker na końcu szyny.
K7. Hierarchia wag: głowice+aparaty+ciągłość toru = pierwszoplanowe; obrys
    stacji wtórny i lżejszy.

### Gramatyka bazowa (stacja 2L+T; kompresja do 48×48 DOZWOLONA, relacje NIE):
lewa kotwica → △ głowica L1 → aparat L1 → ═ szyna wewnętrzna ═ → aparat L2 →
△ głowica L2 → prawa kotwica; pole TR: szyna → aparat TR → transformator → nN;
pole DER: szyna → aparat DER → źródło; sekcja/NO jako stan aparatu w torze.
Relacje nienaruszalne: kabel kończy się na głowicy · głowica należy do pola ·
między głowicą a szyną jest aparat · TR/DER przez własne pola · NO = przerwa ·
szyna nie wychodzi poza obudowę.

### Wykonanie: GS-3 — FABLE OSOBIŚCIE (dyrektywa właściciela „Zadanie dla fable")
Przebudowa `MINI_RMU` (miniRmuGrammar.ts) na kompozycję PÓL + renderer + sondy
(ciągłość toru przez głowica–aparat–szyna, przerwa NO w torze, zakaz szyny poza
enklozurą — ODWRÓCENIE obecnej sondy na-wylot) + macierz kombinacji przepisana +
19 reguł nadal obowiązuje (kotwica, determinizm, globalne parametry).

## GS-3.2 — formalizacje po recenzji kompozycji pól (2026-07-23)
1. **„Aparat łączeniowy pola — stan zamknięty"** (pkt 3 recenzji): kwadrat na
   torze pola liniowego/TR/DER to formalnie aparat uogólniony L0 w stanie
   ZAMKNIĘTYM (rozróżnienie rozłącznik/wyłącznik = kontrakt L1/L2, nie L0);
   odpowiednik OTWARTY istnieje w rodzinie APARAT SEKCYJNY (przerwa + człon
   odchylony) — te same styki i kotwica, zmienia się wyłącznie człon ruchomy.
2. **Jawna reguła LOD pola DER** (pkt 8): na L0 pole DER = szyna → aparat →
   tor → znak źródła (głowica/punkt przyłączenia POMINIĘTE świadomie z powodu
   rozmiaru 48×48); pełna struktura pola DER (z głowicą) obowiązuje od L1.
3. **GAP (do domknięcia przy wpięciu w sondę accept)**: sonda ciągłości działa
   na przedziałach geometrii gramatyki; docelowo ciągłość analizowana po
   KONEKTORACH elektrycznych łańcucha pól (model konektorów w MINI_RMU), nie
   po styku współrzędnych.

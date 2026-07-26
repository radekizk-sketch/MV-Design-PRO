# Audyt SLD — runda R3: WYCOFANY (błąd metody)

> **STATUS: WYCOFANY 2026-07-26, tego samego dnia co wydany.** Wnioski tej rundy były
> oparte na sondzie, która pytała o dane **zgadywanymi nazwami pól i wzorcami tekstu**.
> Metoda dawała **fałszywe negatywy**: co najmniej trzy z siedmiu znalezisk okazały się
> nieprawdziwe, a jedno mierzyło niewłaściwą warstwę. Dokument zostaje w repozytorium
> jako zapis błędu i instrukcja, jak tego nie powtórzyć — **nie wolno się na niego
> powoływać jako na listę braków**. Rejestr: V12K-214 (wycofany), następcą będzie
> osobna runda R4 wykonana metodą opisaną niżej.

## Co poszło źle

Sonda `sonda_inwentarz_sld.mjs` sprawdzała obecność danych pytaniami w rodzaju
„czy któryś klucz pasuje do `/open|stan|status|closed|position/i`" oraz „czy tekst
etykiet pasuje do `/uk\s*%/i`". Oba wzorce **przegapiły dane, które istnieją**:

| Zarzut | Werdykt R3 | Prawda po weryfikacji | Dlaczego sonda skłamała |
|--------|-----------|----------------------|------------------------|
| Z2 — stan łącznika nie istnieje w scenie | KRYTYCZNY | **FAŁSZ.** Symbol ma pole `state`, glify rysują warianty (`bladeEnd` odchylone dla `open`, wypełnienie dla `closed`, krycie 0,35 dla `unknown`). Rozkład jest merytorycznie poprawny: **171 uziemników `open`**, **118 rozłączników `closed`**. | regex `/open\|stan\|status\|closed\|position/i` nie łapie słowa `state` („dsstate" nie zawiera „stan") |
| Z5 — brak uk% na tabliczce | ŚREDNI | **FAŁSZ.** Tabliczka niesie `"uk 11% · Pk 120 kW"`, obok `"Yd11 · 25 MVA"` i `"110/15 kV"`. | regex `/uk\s*%/` wymagał `%` bezpośrednio po `uk`, a w tekście jest liczba pomiędzy |
| Z1 — brak kodowania napięć kolorem | KRYTYCZNY | **ZŁA WARSTWA.** Odcinki `buildSceneV3` faktycznie nie noszą napięcia, ale paleta poziomów **istnieje** — `v3/export/exportPalette.ts` ma semantykę WN/SN/nN **oraz NOP** (czerwień `#B71C1C`), a kolorowanie napięć/energizacji należy do `SldCanvasV3.tsx` (F6), nie do modelu sceny. | mierzyłem model sceny i wnioskowałem o rysunku |
| Z3 — NOP nieoznaczony | WYSOKI | **NIEROZSTRZYGNIĘTE.** `exportPalette` ma dedykowany kolor NOP, więc zdolność istnieje; czy dociera do rysunku — niezmierzone. | ta sama pomyłka warstwy |
| Z4 — brak tabelki rysunkowej | WYSOKI | **NIEROZSTRZYGNIĘTE.** `sheet/Frame.tsx` przyjmuje `titleBlock` jako **slot** (+ `titleBlockOrigin`). Prawy dolny róg zrzutu jest pusty, ale to może znaczyć „generator zrzutów nie podaje slotu", nie „system nie ma tabelki". | oględziny zrzutu bez sprawdzenia, kto wypełnia slot |
| Z6 — punkt neutralny | WYSOKI | **CZĘŚCIOWO WIARYGODNE.** `grounding` niewypełniony 0/315 szyn — to pomiar wprost na JSON, wiarygodny. Czy render ma symbol — niezmierzone. | — |
| Z7 — warstwa zabezpieczeń bez pokrycia | ŚREDNI | **WIARYGODNE.** `measurements: 0`, `protection_assignments: 0` w sieci wzorcowej — pomiar wprost na JSON. Bramki §17.5/§18.3/§20.1/§20.4 mierzą pustkę. | — |

Z siedmiu znalezisk zostaje **jedno pewne** (Z7) i jedno częściowo (Z6, w części „dane
niewypełnione"). Dwa były wprost fałszywe, trzy dotyczyły niewłaściwej warstwy.

## Lekcja metodyczna (obowiązująca dla R4 i każdej kolejnej sondy)

1. **Nigdy nie pytaj o dane zgadywaną nazwą pola ani wzorcem tekstu.** Wypisz
   **wszystkie** klucze obiektu i **pełny** tekst etykiet, potem czytaj wynik. Różnica
   jest dokładnie taka, jak między `keys.some(k => /state/.test(k))` a
   `console.log(Object.keys(x))` — pierwsze potwierdza uprzedzenie, drugie pokazuje prawdę.
2. **Nie wnioskuj o rysunku z modelu sceny.** `buildSceneV3` to warstwa geometrii i
   semantyki; kolor, paleta, tabelka i ramka żyją w renderze (`SldCanvasV3.tsx`,
   `sheet/Frame.tsx`) i w palecie eksportu. Brak pola w scenie **nie** dowodzi braku na
   rysunku.
3. **Zanim nazwiesz coś brakiem, poszukaj zdolności w kodzie po nazwie domenowej.**
   Jedno `grep -rn "NOP\|titleBlock"` przed napisaniem audytu zdjęłoby trzy z siedmiu
   zarzutów.
4. **Zrzut ekranu jest dowodem na to, co widać, nie na to, czego system nie ma.** Pusty
   róg arkusza dowodzi, że tabelki tam nie ma — nie, że jej nie da się tam podać.

## Co z tego zostaje jako realny dług

- **Z7 (potwierdzone):** cztery bramki warstwy zabezpieczeniowej są zielone bez pokrycia,
  bo sieć wzorcowa ma `measurements: 0` i `protection_assignments: 0`. Bramka bez czego
  mierzyć nie chroni niczego.
- **Z6 (potwierdzone w części danych):** `GroundingConfig` niewypełniony ani raz
  (0/315 szyn), więc sposób pracy punktu neutralnego nie jest w sieci wzorcowej
  reprezentowany — niezależnie od tego, czy render ma symbol.
- **Pytanie otwarte do R4:** czy generator zrzutów audytowych podaje `titleBlock` i czy
  ekranowy render używa `exportPalette` (albo własnej palety napięć). To trzeba
  **zmierzyć na renderze**, nie na scenie.

Runda R2/R2b (identyfikatory aparatów wg kontraktu LOD) **nie jest tym wycofaniem
objęta** — tam pomiar był bezpośredni (liczba etykiet danej kategorii w scenie) i
potwierdzony niezależnie przez CI.

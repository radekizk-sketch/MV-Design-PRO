# SLD — PRZEBUDOWA JĘZYKA RYSUNKU: ZE „KAFLI" NA SCHEMAT KLASY CAD/SCADA (2026-07)

Status: OBOWIĄZUJĄCY dla sesji przebudowy języka renderowania SLD v2.
Diagnoza właściciela produktu: „SLD ma być schematem jakości CAD/SCADA z punktu
widzenia energetyki — a nie klockami".

## 0. Diagnoza stanu zastanego (rendery bazowe, main @ 95d0576)

Potwierdzona na renderach `screenshot-harness.html` (fixtura 53 stacje + power-flow):

| Widok | Objaw „klocka" |
|---|---|
| L0 (przegląd) | stacja = zaokrąglona karta z 3 wierszami tekstu w środku (nazwa/kod/kVA); OZE = pill-chip „PV 0,5 MW" z wypełnieniem; GPZ = szary panel z nagłówkiem |
| L1 (sieć) | stacja = mini-blok w ramce „enclosure" (rect rx=3, fill #07111C, stroke #13435A); kod stacji = badge-box; „2 nN" = chip |
| L2/L3 (obiekty/pola) | ściana mini-bloków; etykiety kabli = pigułki z wypełnionym tłem; WE/WY jako chipy; „RMU-P" jako tekst UI; wartości kW w zielonych pigułkach |
| GPZ | cała rozdzielnia wewnątrz karty `COLOR_PANEL_RAISED` rx=4 z paskiem tytułu — panel UI, nie rysunek |
| OZE | romb z wypełnieniem 0.3 + badge'e w rogach + pill „TR blokowy" z ramką |

Zasada nadrzędna przebudowy: **wewnątrz obszaru rysunku nie ma elementów UI**
(kart, chipów, zaokrąglonych paneli z wypełnieniem, cieni). Są: linie, symbole
IEC 60617, kropki węzłów i tekst rysunkowy. Panele poza ramką rysunku (drawer,
legenda, tabliczka SldTitleBlock, tabela rewizji SldRevisionTable) — zostają.

Uwaga notarialna: przywołane w zleceniu `SLD_PRO_STANDARD_2026-07.md` oraz
strażnik `visualCanon.guard.test.ts` (commity ca770c2c, c71c153c) NIE istnieją
w repo na `main` — kontekst zlecenia opisywał stan innej sesji. Niniejszy
dokument pełni rolę standardu docelowego dla tej przebudowy.

## 1. Docelowy język rysunku — per widok

### 1a. Stacja SN/nN przy zoomie (LOD 2–4, warianty compact/detail)

```
        Stacja T1 (S01)                ← tekst rysunkowy NAD granicą, bez ramki
   ┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐          ← granica stacji: cienka linia PRZERYWANA,
   ╎   │WE       │WY   │TR  ╎             ostre rogi, BEZ wypełnienia
   ╎  ═╪═════════╪═════╪═   ╎          ← szyna SN: linia pozioma (hierarchia kreski)
   ╎   ▷         ▷     ▷    ╎          ← odłącznik (DS) — symbol IEC 60617
   ╎   ▢         ▢     ▢    ╎          ← wyłącznik (CB) — kwadrat IEC
   ╎                   ⊙⊙   ╎          ← trafo: DWA OKRĘGI + „Dyn5" + moc tekstem
   ╎                 ──┬──  ╎          ← szyna nN (cieńsza, kolor nN)
   ╎                 ┬ ┬ ┬  ╎          ← odpływy nN: krótkie zwody + bezpiecznik
   ╎                 ⏚      ╎          ← uziemienie punktu gwiazdowego
   └╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘
      630 kVA · TN-C                    ← dane tekstem rysunkowym POD granicą
```
ZNIKA: enclosure rect z wypełnieniem i rx, badge-box kodu stacji, chipy WE/WY,
pigułki kW/kVA, tekst „RMU-P/RMU-O" (żargon wewnętrzny).
WCHODZI: granica przerywana, etykiety pól jako tekst przy osi pola, wartości
jako tekst rysunkowy (halo dopuszczalne — konwencja SCADA na ciemnym tle).

### 1b. Stacja w widoku sieci (L0/L1, wariant overview)

```
   ────●────                ← węzeł na ciągu: kropka
       │
      ┌─┐                   ← SYMBOL stacji: mały prostokąt OSTRY, bez wypełnienia,
      └─┘  S01 Stacja T1        kreska w kolorze klasy napięcia; kod+nazwa OBOK
           630 kVA              (tekst rysunkowy, wyrównany do lewej), nie w środku
```
Stacja słupowa (jeśli w danych): okrąg zamiast prostokąta (konwencja planów
sieci SN). NOP: symbol otwartego łącznika na ciągu (przerwa + ukośna kreska),
nie czerwony badge. OZE przy stacji: symbol (1c) w skali mapy + moc tekstem.
ZNIKA: karta 118×96 z 3 wierszami, pill OZE, badge-box S01.

### 1c. OZE (PV / BESS / FW)

```
   PV:   ⊙͞  (okrąg, w środku symbol fotowoltaiki: ⎓/~ falownik)   PV_T1
   FW:   (G~) (okrąg z G i tyldą — generator IEC 60617)            2,0 MW
   BESS: ▭ z symbolem ogniwa (─┤├─)                                0,5 MW
         │
         ⊙⊙   ← trafo blokowe: dwa okręgi + przekładnia tekstem
         │
   ──────●──── ← tor do punktu przyłączenia CIĄGŁY, węzeł kropką
```
ZNIKA: romb z wypełnieniem 30%, pill „TR blokowy 630 kVA", chip Q(U) w ramce.
WCHODZI: symbol źródła wg typu, trafo blokowe jako dwa okręgi na torze,
moc znamionowa tekstem przy symbolu, kody NC RfG tekstem (bez kolorowego kółka
z białą obwódką — dopuszczalny mały okrąg klasy modułu bez wypełnienia).

### 1d. GPZ (rozdzielnia 110/15 kV)

```
   GPZ Referencyjny 15 kV        110/15 kV      ← tytuł: tekst rysunkowy nad granicą
  ┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐
  ╎ 110kV ═══════╤═══════════╤═══════ 110kV ╎   ← szyna WN: linia (kolor WN)
  ╎              ▷           ▷           ╎
  ╎              ▢           ▢           ╎      ← pola WN: osie pionowe z symbolami
  ╎              ⊙⊙ TR1      ⊙⊙ TR2      ╎      ← trafo 110/15: dwa okręgi + ozn.
  ╎  15kV ══╤══╤══╧══╤══[═╪═]══╧══╤══╤══ ╎      ← sekcje SN jako linie, sprzęgło
  ╎        ▷  ▷     ▷           ▷  ▷    ╎          poziomo między sekcjami
  ╎        ▢  ▢     ▢           ▢  ▢    ╎
  ╎        │  │     │           │  │    ╎      ← odpływy liniowe w dół
  └╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘
```
ZNIKA: korpus `COLOR_PANEL_RAISED` rx=4 (karta), pasek tytułu jako belka UI,
panele-tła per pole.
WCHODZI: granica stacji linią przerywaną cienką, tytuł tekstem, szyny liniami
z terminatorami, pola jako osie (już istnieją w BayColumn — zostają).

### 1e. Kable i linie

Typ/przekrój/długość jako tekst WZDŁUŻ linii (styl CAD — nad linią, równolegle),
bez pigułki z wypełnieniem. Mufa: kropka-węzeł z oznaczeniem; głowica kablowa: ▲.
Obciążenie I% z rozpływu: tekst przy linii (kolor wg klasy — sama barwa tekstu,
bez tła-chipa).

## 2. Co ZNIKA / co WCHODZI (podsumowanie globalne)

| ZNIKA (język UI) | WCHODZI (język rysunku) |
|---|---|
| rect rx>0 z wypełnieniem jako tło elementu sieci | kontur/linia bez wypełnienia, ostre rogi |
| badge/chip (kod stacji, kV, kW, NOP, WE/WY) | tekst rysunkowy przy elemencie (halo dozwolone) |
| pill etykiety kabli | tekst wzdłuż linii |
| „RMU-P/RMU-O" w rysunku | brak (żargon poza rysunkiem — drawer) |
| romb OZE z wypełnieniem | symbole źródeł IEC (G~, PV, ogniwo) |
| czerwony badge „NOP" | symbol otwartego łącznika + opis „NO" tekstem |

Wyjątek świadomy (konwencja SCADA, nie karta): stan łącznika (zamknięty =
wypełniony symbol aparatu, otwarty = kontur) — wypełnienie SYMBOLU aparatu
jest treścią ruchową, nie dekoracją; zostaje.

## 3. Kryteria odbioru per rola (checklisty samo-audytu każdej iteracji)

1. **Projektant sieci SN**: trasy jednoznaczne (linia ciągła, węzły kropką);
   typ/przekrój/długość przy każdym odcinku (gdy w danych); oznaczenie stacji
   kod+nazwa tekstem; brak przecięć etykiet z liniami.
2. **Audytor ekspertyz**: punkt przyłączenia oznaczony; Sk"/Ik" dostępne przez
   overlay (mechanizm nietknięty); granica własności TYLKO gdy w modelu.
3. **Projektant OZE**: moc znamionowa przy źródle; tor OZE→punkt przyłączenia
   ciągły; trafo blokowe dwa okręgi z przekładnią/mocą; BESS ≠ PV ≠ FW symbolem.
4. **Projektant stacji**: kolejność aparatów w polu (DS→CB→CT→odpływ) zgodna
   z łańcuchem; numeracja/oznaczenia pól; sekcje i sprzęgło jednoznaczne.
5. **Zabezpieczenia/NC RfG**: CT/VT we właściwym miejscu; kody funkcji przy
   przekaźniku tekstem; moduł NC RfG czytelny bez koloru.
6. **Profesor/audytor obliczeń**: każda liczba na rysunku pochodzi z modelu /
   ResultSet; jednostki zawsze; brak danych = brak liczby (nie zero, nie atrapa).
7. **Uzgodnienia OSD**: tabliczka (SldTitleBlock), rewizje, legenda — poza
   obszarem rysunku, zostają; schemat czytelny jako dokument.
8. **Dyspozytor**: stan łącznika czytelny z SYMBOLU (kontur/wypełnienie),
   nie tylko kolorem; punkty NO widoczne na torze.
9. **Kreślarz CAD**: jedna hierarchia kreski (szyna > tor > odgałęzienie >
   granica); zero zaokrągleń dekoracyjnych; typografia rysunkowa spójna.
10. **SCADA**: kolory ruchowe (zieleń=pod napięciem SN, czerwień=WN/alarm,
    błękit=nN, szary=wyłączone) zachowane co do semantyki.

## 4. Ograniczenia twarde

- Dane wyłącznie z modelu/ResultSet; brak danych = brak elementu.
- Determinizm (stabilne hashe), no-orphan, mechanizm LOD (progi/histereza)
  nietknięty — zmienia się reprezentacja per poziom.
- Fizyka/topologia/adaptery danych nietykalne — zmiana dotyczy WARSTWY RYSUNKU
  (`renderer/`, fragmenty `canvas/` odpowiedzialne za rysunek).
- Testy kontraktowe aktualizowane z zachowaniem intencji (czytelność,
  obecność informacji), nie osłabiane.

## 5. Kolejność wdrożenia

B1 stacja-zoom → B2 GPZ → B3 OZE → B4 widok sieci L0/L1. Jedna iteracja =
jeden widok = jeden commit; po każdej: render → samo-audyt 10 rolami →
bramki (type-check, lint, vitest sld/v2, guardy codenames/forbidden/docs).

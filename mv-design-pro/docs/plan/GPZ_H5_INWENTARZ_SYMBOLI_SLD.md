# INWENTARZ SYMBOLI SLD v3 (MV-DESIGN-PRO) - stan drzewa e9b15c265, galaz claude/mv-design-pro-twin-audit-u4lhy0-karta-uiux-przemyslowy
Pomiar: czytanie kodu + grep (bez uruchamiania testow). Sciezki wzgledem mv-design-pro/frontend/src/ui/sld.
Skroty: D = v3/symbols/defs.ts, G = v3/symbols/glyphs.tsx, AS = v3/compose/apparatusSequence.ts, GPZ = v3/compose/gpz.ts,
ADP = v2/canvas/enmToSldAdapter.ts, CGA = v2/canvas/enmToCanonicalGpzAdapter.ts, CAD = v3/cad/cadSymbolRegistry.ts.
Numery IEC 60617: podaje tylko to, co deklaruje repo (zrodlo: komentarze/rejestr). Nic nie jest potwierdzone wzgledem normy; rejestr repo sam
zastrzega (docs/sld/SLD_SYMBOL_NORMATIVE_REGISTRY.md par.0 pkt 3), ze ZADEN symbol nie ma statusu NORMATIVE_VERIFIED. Wszystko "IEC" ponizej = "do potwierdzenia".

## 0. WNIOSEK
- W repo sa TRZY biblioteki symboli, tylko dwie renderowane:
  (a) v3 glyphs (SN/GPZ, 38 SymbolId, D + G) - rysowane recznie, BEZ numerow IEC w rejestrze, czesc komentarzy cytuje numery sprzeczne z (b);
  (b) CAD registry (nN L2, 20 symboli, CAD:339-720) - ma numery IEC S00xxx i statusy (18x ENGINEERING_REVIEWED, 2x DRAFT: uziemnik, zabezpieczenie - zob. 6), nie uzywany w SN/GPZ;
  (c) canonical_symbols/*.svg (v1, 56 plikow + ports.json) - NIE importowany przez zaden kod rysujacy (grep: tylko testy/guardy), ale pilnowany guardem.
- Warstwa "?" w GPZ pochodzi z 3 mechanizmow (zob. 3): brak rekordow aparatow (bayNoEquipment), zrodlo nieokreslone (derUnknown), brak grupy polaczen TR.
- Brak symboli (luki): bateria kondensatorow, transformator uziemiajacy/ZU, rezystor/dlawik uziemiajacy jako pole (jest tylko "neutralEarthing" jako 1 symbol sieciowy), OLTC (strzalka), odlacznik z uziemnikiem jako jeden aparat, lacznik 3-pozycyjny, wylacznik wysuwny, transformator 3W/autotransformator, silnik, szyna jako glif (szyna = odcinek, nie glif).

## 1. LISTA SYMBOLI v3 (38 SymbolId; D:14-65 typ, D:86-376 definicje, G:1203-1242 rejestr SYMBOL_GLYPHS; D i G maja po 38 wpisow - zmierzone grep -c)
`data-symbol-canon` = SymbolId (G:136-142 glyphGroupProps). Bazowa kreska aparatu 1.2 (G:19 V3_STROKE_APPARATUS), kolor BASE_STROKE (theme/colorTokens.ts:72).
Stan: prop `state` -> atrybut `data-switch-state` (G:139). Wymiary w jednostkach swiata (GRID=8, core/grid.ts:8), WxH.

| SymbolId | def D:linia | glif G:linia | WxH | porty (nazwa x,y kier.) | stan open/closed | kto go dostaje (zrodlo mapowania) |
|---|---|---|---|---|---|---|
| breaker | D:87 | G:172 | 16x16 | top 8,0 N; bottom 8,16 S | zamkniety = kwadrat WYPELNIONY, otwarty = pusty; unknown: patrz 5 poz.2 | BayPrimaryDeviceKind CB (AS:119); REKLOZER->CB (ADP:2183); sprzeglo? nie (lineBreaker) |
| recloser | D:100 | G:204 | 16x24 | top 8,0; bottom 8,24 | jak breaker + luk SPZ ze strzalka (G:210-211) | TYLKO podglad kreatora (ui2/kreatory/stacja/generatorSldPola.ts:259); z ENM nieosiagalny (zob. 5 poz.4) |
| disconnector | D:104 | G:225 | 16x24 | top, bottom | nozyk: zamkniety w osi (8,6)->(8,18), otwarty -> (15,12) (G:228); unknown = przerywany nozyk (G:235) | kind DS (AS:125) |
| loadBreakSwitch (rozlacznik) | D:113 | G:247 | 16x24 | top, bottom | jak disconnector + poprzeczka (zamk. pozioma y=14 x4..12; otw. ukosna 13,9-17,15) (G:255-259) | LOAD_SWITCH (AS:121-124); ROZLACZNIK (ADP:2184); branch type switch (ADP:2194) |
| earthSwitch (uziemnik) | D:117 | G:282 | 16x24 | top 8,0 (brak portu S) | domyslnie 'open' (G:283); otw. nozyk (15,10), zamk. (8,14); uziemienie 3 kreski 12/8/4 (y17/20/23) | kind ES (AS:127); aparat BOCZNY (AS:226-230) |
| neutralEarthing | D:126 | G:315 | 16x32 | top 8,0 | bez stanu; wariant `earthingKind`: resistor (prostokat 8x10), coil (luk), direct, isolated (przerwa) | TYLKO GPZ.ts:1891 z Source.neutral_grounding (CGA deriveSnNeutralEarthing) |
| fuseSwitch | D:129 | G:359 | 16x32 | top, bottom | domyslnie 'closed' (G:360); otw. nozyk (8,6)->(15,12); wkladka prostokat 6x12 z zyla | kind FUSE (AS:137-138) - czyli BEZPIECZNIK SAM i ROZLACZNIK BEZPIECZNIKOWY (ADP:2185, 2196) |
| fuse | D:140 | G:383 | 16x24 | top, bottom | brak stanu (swiadomie) | tylko podglad kreatora (generatorSldPola.ts:238 BEZPIECZNIK); z ENM nieosiagalny |
| voltageIndicator (VPIS) | D:149 | G:399 | 16x16 | top | brak | tylko podglad kreatora (generatorSldPola.ts:248) |
| transformer2W | D:152 | G:504 | 32x40 | hv 16,0 N; lv 16,40 S | brak stanu; 2 okregi r=11 w (16,13),(16,27); znaki uzwojen z grupy polaczen (G:442-502) | TRANSFORMER_DEVICE (AS:135); GPZ.ts:1995 (uzwojenia), station.ts |
| cableHead (glowica) | D:156 | G:534 | 16x16 | line 8,16 S | - | CABLE_HEAD (AS:133) |
| jointSleeve (mufa) | D:159 | G:543 | 16x16 | a 0,8 W; b 16,8 E | - | ZERO konsumentow produkcyjnych (grep; tylko komentarze buildScene.ts:32, preview.tsx:228) |
| lineSwitch | D:169 | G:567 | 32x16 | a 0,8 W; b 32,8 E | jak disconnector obrocony; unknown przerywany | lacznik toru (scene/elementyToru.ts, station.ts, GPZ.ts:864 sprzeglo nie-wylacznikowe) |
| lineBreaker | D:173 | G:586 | 16x16 | a, b (W/E) | jak breaker | wylacznik toru; sprzeglo GPZ rodzaj 'wylacznik' (GPZ.ts:864-866) |
| noPoint (NOP) | D:177 | G:553 | 16x16 | a, b | przerwa toru + okrag r=3.5 | scene/buildScene.ts (punkt podzialu) |
| junction | D:181 | G:603 | 16x16 | n,s,e,w | kropka r=3 | routing |
| branchJunction | D:192 | G:615 | 32x32 | n,s,e,w | kropka r=7 | wezel rozgalezienia |
| branchCabinet (ZKSN) | D:214 | G:630 | 16x16 | n,s,e,w | prostokat 10x10 + kropka | branch_points ENM |
| branchPole | D:220 | G:644 | 16x16 | n,s,e,w | trzon + poprzeczka + kropka | branch_points ENM |
| currentTransformer | D:226 | G:654 | 16x24 | top, bottom | okrag r=6 na przewodzie | CT (AS:129) |
| voltageTransformer | D:230 | G:663 | 16x24 | top | 2 okregi r=5.5 (8,11),(8,17); BOCZNY | VT (AS:131); VT szyny sekcji GPZ.ts:1790 (etykieta U / 3U0) |
| surgeArrester | D:233 | G:673 | 16x24 | top | prostokat 8x14 + strzalka + JEDNA kreska uziemienia; BOCZNY | SURGE_ARRESTER (AS:139-142) |
| loadArrow | D:238 | G:273 | 16x16 | top | wypelniony trojkat w dol | station.ts:1883 (odbior nN); legenda Frame.tsx:97 |
| derPv | D:241 | G:696 | 32x32 | ac 16,0 | ramka + przekatna + panel + sinus | glifZrodlaRoliPola (AS:56-64) |
| derBess | D:244 | G:707 | 32x32 | ac | ramka + ogniwo | j.w. |
| derGenerator | D:247 | G:719 | 32x32 | ac | okrag r=13 z literka "G" | compose/sourceKind.ts:207 |
| derWind | D:252 | G:740 | 32x32 | ac | ramka + maszt + 3 lopaty | AS:61 |
| derUnknown | D:257 | G:757 | 32x32 | ac | ramka + "?" (G:759-764) | AS:62; GPZ.ts:403-405,452 |
| bayNoEquipment | D:266 | G:773 | 16x32 | top 8,0; bottom 8,32 | brak stanu; ramka PRZERYWANA 14x24 + "?" (G:777-787) | AS:95-98; GPZ.ts:385-388 |
| bayReserve | D:274 | G:797 | 16x16 | top | poprzeczka + przerywana druga | AS:199-205 (reserve) |
| gridSource | D:280 | G:816 | 16x24 | bottom 8,24 S | wypelniony trojkat w dol (4,8)-(12,8)-(8,16) | GPZ.ts:2241-2256 (Source ENM); legenda |
| stationCollapsed | D:297 | G:880 | 48x48 | n,s,e,w (24,0..) | mini-RMU (gramatyka v3/symbols/miniRmuGrammar.ts MINI_RMU) | LOD L0 stacji |
| gpzCollapsed | D:320 | G:987 | 128x128 | n,s,e,w | mini-GPZ (MINI_GPZ), sekcje/TR/pola z danych | LOD L0 GPZ (buildScene) |
| protectionRelay | D:334 | G:1058 | 24x24 | link 0,8 W | okrag r=11 + kody ANSI (<=2 linie fs 7) + badge "!" | adnotacja (station.ts, GPZ.ts:1373) |
| meter | D:343 | G:1099 | 24x24 | anchor 0,8 W | okrag + litera A/V/M (fs 12) | adnotacja |
| nnBreaker | D:351 | G:1130 | 16x16 | top, bottom | jak breaker + dzwignia MCB | ZERO konsumentow produkcyjnych (nN idzie przez CAD registry) |
| nnFuseSwitch | D:361 | G:1158 | 16x24 | top, bottom | szesciokat | ZERO konsumentow produkcyjnych |
| lvPortal | D:373 | G:1186 | 32x24 | top 16,0 | pieciokatna choragiewka + "nN" | station.ts (portal nN) |

Szyna: NIE jest glifem. Fabryka `makeBusbarDef(length)` D:420-431 (porty left/right); rysunek = segment, klasa grubosci `bus`=4 (stacja) i `busGpz`=6 (GPZ) - v3/compose/preview.tsx:63-68. Sekcje GPZ: primary (pelna), reserve (przerywana, topologia double) i zamkniecie ring (GPZ.ts:1590-1640).
Sprzeglo/laczniki szyn GPZ: glif poziomy lineBreaker/lineSwitch (GPZ.ts:864-866), pas `PAS_SPRZEGLA` GPZ.ts:858.
Punkt polaczenia: junction/branchJunction/branchCabinet/branchPole (wyzej).

### Mapowanie roli pola -> symbole (lancuch ENM -> UI)
1. ENM Bay.bay_role: 'IN'|'OUT'|'TR'|'COUPLER'|'FEEDER'|'MEASUREMENT'|'OZE' (types/enm.ts:1151). NIE ma roli zespolu uziemiajacego ani BKR.
2. CGA:587-598 mapBayRoleToFieldRole: IN->LINE_IN, OUT->LINE_OUT, FEEDER->LINE_BRANCH, TR->TRANSFORMER, COUPLER->COUPLER, MEASUREMENT->MEASUREMENT, OZE->SOURCE, default->LINE_OUT (CGA:596 - cichy domysl roli).
   Druga projekcja ta sama dziedzina: rolaPolaGpz CGA:641 (1:1 bez zlewania) - dwie funkcje na to samo (zob. 5 poz. 12).
3. Rola NIE wybiera symboli. Aparaty pola = REKORDY: CGA:509-533 buildBay -> primaryDevices = projectBayPrimaryDevices(bay, galezieWgRef) (ADP:2146-2178):
   - `Bay.primary_devices` (BayPrimaryDevice: device_ref, kind, placement, switch_state, designation, catalog_ref... types/enm.ts:1303-1325), sortowane orderByPrimaryPlacement (v2/domain/apparatusContracts.ts);
   - gdy puste: aparatyZGaleziPola(Bay.equipment_refs, galezie) ADP:2208-2235: symbol z materialized_params.device_kind (RODZAJ_APARATU_Z_KLASY_WYROBU ADP:2181-2188) albo z typu galezi (ADP:2192-2198 breaker/switch/disconnector/fuse); sprzeglo pomijane (galaz.type === 'bus_coupler').
   - BayPrimaryDeviceKind (types/enm.ts:1276-1293): CB, LOAD_SWITCH, DS, ES, CT, VT, CABLE_HEAD, TRANSFORMER_DEVICE, FUSE, GENERATOR_PV/BESS/FW, PCS, BATTERY, SURGE_ARRESTER. BRAK: REKLOZER, VOLTAGE_INDICATOR, bezpiecznik-sam, kondensator, ZU.
4. kind -> SymbolId: symbolIdForPrimaryDeviceKind AS:117-153 (DER -> null). GPZ uzywa tego samego (GPZ.ts:436-446 specyfikacjaPolaGpz).
5. Stan symbolu: stanAparatuZModelu (v2/model/stanAparatowPola.ts) -> `switchState` -> prop `state` glifu (GPZ.ts:541-545; canvas SldCanvasV3.tsx:534-575 przekazuje bez zmian).
6. Podzial tor glowny / boczne: LATERAL_APPARATUS_SYMBOLS = ES, VT, SA (AS:226-230); w GPZ dodatkowo glify zrodla OZE (GPZ.ts:418-420). Odstep pion APPARATUS_STACK_VERTICAL_GAP=8, odczep bok 8 (layout/apparatusStack.ts:36,42).
7. Pole bez rekordow -> bayNoEquipment (AS:95-98, 192; GPZ.ts:447). Pole SOURCE dokleja glif zrodla (GPZ.ts:448-455). Pole rezerwowe/wolne traci glowice i konczy sie bayReserve (AS:199-205; GPZ.ts:456).
8. Oznaczenia aparatow: Q/QE/T/TV/F z konwencji lub designation z danych (AS:385-434); CGA:608 deriveQDesignations to stara konwencja Q0/Q1/Q9/Q8/T1 dla roli - zob. 5 poz. 12.

## 2. KATEGORIE APARATU - czy istnieje; geometria slowami; rozbieznosc wzgledem IEC 60617 (ID wg repo; wszystko "do potwierdzenia")
Legenda: [SN]=v3 glyph, [nN]=CAD registry (cad.*), [v1]=canonical_symbols/*.svg (nierenderowany).

1. Wylacznik: [SN] breaker/lineBreaker: kwadrat 12x12 w 16x16 z wyprowadzeniami; zamkniety = wypelniony. [nN] cad.wylacznik: styk staly u gory + krzyzyk + noz na przegubie (CAD:339-346; ID wg repo S00287=S00227+S00219). [v1] circuit_breaker.svg: kwadrat z X.
   ROZBIEZNOSC: SN nie uzywa styku/noza IEC; stan niesie WYPELNIENIE, co rejestr nN wprost uznaje za odrzucone (SLD_SYMBOL_NORMATIVE_REGISTRY par.0 pkt 2). Czy konwencja ENEA = kwadrat wypelniony: NIE ZWERYFIKOWANO (brak rysunku w repo; Z.1/Z.2 ENEA wg GPZ_H5_ZRODLA_I_REGULY.md Z5 "wymagaja weryfikacji graficznej w PDF").
2. Odlacznik: [SN] disconnector: nozyk od (8,6) do (8,18) + poprzeczka 8 px na dolnym styku (y=18); otwarty -> ukos w prawo (15,12). [nN] odlacznik: noz otwiera sie W LEWO -30 st. (CAD KAT_OTWARTY, ID repo S00288). Rozbieznosc: kierunek otwarcia SN (prawo) vs nN (lewo) - dwa przeciwne kanony; kat otwarcia SN ~49 st. vs 30 st.
3. Odlacznik z uziemnikiem: LUKA jako jeden symbol. Zastepuje to para DS (w torze) + ES (aparat boczny, G:282) polaczona odczepem (GPZ.ts:616-656). ENEA/IEC: noz uziemnika wbudowany w odlacznik. [v1] switch_3pos.svg istnieje, nierenderowany.
4. Uziemnik: [SN] earthSwitch: styk, noz (otwarty (15,10)/zamkniety (8,14)), uziemienie 3 kreski 12:8:4 (G:291-293). [nN] cad.uziemnik status DRAFT (CAD:441-447). Rozbieznosc: proporcje kresek uziemienia 12:8:4 (SN) vs 12:9:6 (CAD:445 "pierwowzor"); uziemienie w surgeArrester to JEDNA kreska 8 px (G:681), w neutralEarthing 12:8:4 z odstepem 4 (G:352-354) - trzy rozne symbole ziemi w jednej bibliotece.
5. Rozlacznik: [SN] loadBreakSwitch: odlacznik + dodatkowa poprzeczka w polowie noza (G:255-259); komentarz cytuje "IEC 60617 S00504" (G:254). [nN] cad.rozlacznik: poprzeczka + OKRAG pod poprzeczka, ID repo S00290 (CAD:411). Rozbieznosc wewnetrzna repo: dwa numery IEC dla tego samego aparatu i dwie rozne geometrie.
6. Rozlacznik z bezpiecznikiem: [SN] fuseSwitch 16x32: nozyk + prostokatna wkladka 6x12 z zyla w osi (G:359-373), otwarty = ukos (15,12) od (8,6). [nN] cad.rozlacznikBezpiecznikowy (wkladka NA nozu, ID repo S00370). Rozbieznosc: wkladka SN stoi na osi pod nozem, nie jest nozem; kind FUSE z ENM rysowany tym glifem takze dla bezpiecznika samego (zob. 5 poz.5).
7. Bezpiecznik: [SN] fuse (prostokat 8x16 z zyla na wylot, G:383-392; komentarz "S00289"); z ENM nieosiagalny. [nN] cad.bezpiecznik (ID repo S00362). Rozbieznosc: sprzeczne numery (S00289 vs S00362) i brak sciezki ENM->fuse.
8. Przekladnik pradowy: [SN] okrag r=6 na linii toru (G:654-660), 2 porty top/bottom, bez oznaczenia zaciskow/polaryzacji/rdzeni. [nN] cad.przekladnikPradowy (ID repo S00850, zaciski tekstem obok). Rozbieznosc: brak liczby rdzeni/uzwojen wtornych (ENEA zwykle rysuje rdzenie); ratio tylko w adnotacji (compose/protectionMarking.ts).
9. Przekladnik napieciowy: [SN] 2 okregi r=5.5 w (8,11),(8,17) odczep boczny (G:663-671); brak oznaczenia gwiazda/otwarty trojkat (rozroznia tylko etykieta "U"/"3U0", GPZ.ts:1805). [nN] cad.przekladnikNapieciowy (ID repo S00878). Rozbieznosc: jedno uzwojenie wtorne; brak 3-fazowego/2-uzwojeniowego wtornego.
10. Ogranicznik przepiec: [SN] prostokat 8x14 + strzalka w dol + jedna kreska ziemi (G:673-684). [nN] brak wpisu. [v1] surge_arrester.svg/surge_arrester_10ka.svg nierenderowane. Rozbieznosc: ziemia = 1 kreska (G:681); brak wariantu z iskiernikiem; ID IEC do potwierdzenia.
11. Transformator 2-uzwojeniowy: [SN] 32x40: 2 okregi r=11 o srodkach (16,13),(16,27) (zachodza na siebie, odstep 14), 2 porty hv/lv, znak uzwojenia (trojkat/gwiazda/zygzak, r=4.5) w CZESCI WOLNEJ okregu: (16,9) i (16,31) (G:413-416,442-502). Punkt neutralny = odcinek 5.5 px od srodka gwiazdy + kropka (G:457-462) - konczy sie WEWNATRZ okregu (odleglosc od srodka okregu ~6.8 < 11), brak wyprowadzenia na zewnatrz, brak ziemi. Grupa polaczen: tylko jako ZNAKI (trojkat/gwiazda/zygzak + data-uzwojenia-godzina), godzina NIE jest napisana na glifie; opis grupy w tabliczce GPZ.ts:929 wierszeTabliczkiTransformatora (nie sprawdzono tresci). Brak OLTC (strzalka) w v3 - jest tylko w legacy v2 (v2/station-rozdzielnia/GpzApparatusSymbols.tsx:586-603, nieuzywane produkcyjnie: tylko harnessy gallery/station-rozdzielnia) i jako etykieta (v2/canvas/oltcGlyph.ts, uzyta w canvas/SldCanvasV3.tsx:106). [nN] cad.transformator2u 16x28 (ID repo S00841). Rozbieznosc wzgledem IEC (do potwierdzenia): zygzak (Z) rysowany jako "ramiona zalamane o 60 st." (G:432-439), nie jako IEC zig-zag; brak 3W/auto.
12. Punkt neutralny TR i jego uziemienie: [SN] brak uziemienia NA transformatorze. Jedyny symbol: neutralEarthing (D:126, G:315) - JEDEN na GPZ (GPZ.ts:1878-1910), stoi na lewo od pierwszej sekcji, podlaczony odcinkiem od LEWEGO KONCA SZYNY (nie od zacisku TR, nie przez pole, nie przez lacznik), z Source.neutral_grounding pierwszego zrodla na szynie SN (CGA deriveSnNeutralEarthing). Brak uziemnika 110 kV z ogranicznikiem (ENEA Z.1 wg GPZ_H5_ZRODLA_I_REGULY.md Z6 H5-07). Brak wartosci R/X w podpisie glifu (GPZ.ts:1869-1872 przyznaje "niedomiar zmierzony"; opis w legendzie neutralEarthingNotePl, GPZ.ts:292-297).
13. Transformator uziemiajacy / ZU (zespol uziemiajacy): LUKA (brak SymbolId, brak roli pola w Bay.bay_role, brak w BayPrimaryDeviceKind). Komentarz GPZ.ts:1881-1883 uzasadnia pozycje "transformator uziemiajacy jest osobnym przylaczem" ale transformatora nie rysuje. ENEA Zeszyt 1 par.13/Z.2: pole zespolu uziemiajacego na KAZDA sekcje SN (GPZ_H5_ZRODLA_I_REGULY.md Z6 H5-04).
14. Dlawik i rezystor uziemiajacy: czesciowo - jako wariant `earthingKind` neutralEarthing: rezystor = prostokat 8x10 (bez zygzaka), dlawik = luk 2-pol (G:330-348); izolowany = przerwa (G:326). Brak wariantu rownoleglego rezystor+dlawik (ENEA par.16 dopuszcza). [v1] grounding_resistor.svg (prostokat z zygzakiem i literka R), grounding_reactor.svg (cewka + rdzen + L) - nierenderowane.
15. Bateria kondensatorow: LUKA w v3 i CAD. Istnieje tylko [v1] capacitor_bank.svg/capacitor.svg (nierenderowane). Brak kind/roli w ENM Bay.
16. Szyna: segment, nie glif: `bus` 4 / `busGpz` 6 (preview.tsx:63-68), kolor wg napiecia. Sekcje podwojne: rezerwowa przerywana (GPZ.ts:1608-1612), ring (GPZ.ts:1620-1634). [v1] busbar.svg, double_busbar.svg, ring_busbar.svg, busbar_section_marker.svg.
17. Punkt polaczenia: junction (kropka r=3, G:603-608) i warianty; cad.wezel (ID repo S00020/S00021). Rozbieznosc: kropka w v3 r=3 przy kresce 1.2 (iloraz 5 wobec "~7x" pierwowzoru CAD:702).
18. Lacznik szyn/sprzeglo: GPZ - lineBreaker (rodzaj 'wylacznik') albo lineSwitch na osi szyny (GPZ.ts:864-866), poziomo; stan z galezi bus_coupler (CGA buildCouplers CGA:557). ENEA Z.2: lacznik szyn SN w 1-2 celkach (pole), tu - symbol w pasie szyny (PAS_SPRZEGLA GPZ.ts:858). Brak symbolu pola sprzegla z aparatami (DS-CB-DS). [v1] busbar_coupler.svg (tekst "COUPLER", nierenderowany).
19. Odbior: loadArrow (wypelniony trojkat w dol 10 px, G:273-280) tylko dla odbioru nN w stacji (station.ts:1883); odbiory GPZ nierysowane (KOREKTA_GPZ_H5_ENEA_2026-10.md R10 "odbiory GPZ nierysowane na SLD" - nie weryfikowalem sam). [nN] cad.odplywOdbior (ID repo S00104). Rozbieznosc: wypelniony trojkat vs strzalka energii (S00104); kolizja z gridSource (zob. 5 poz.11).
20. Zrodlo/siec zasilajaca: gridSource (G:816-824): pion, wypelniony trojkat wierzcholkiem w dol (4,8)-(12,8)-(8,16), pion. Bez symbolu zrodla zastepczego IEC (okrag/strzalka); brak oznaczen (S''k, nazwa linii L1/L2) w glifie - podpis w tabliczce zrodla (GPZ.ts:1081-1120, nie sprawdzono tresci). [v1] utility_source.svg (okrag z promieniami + napis GRID), utility_feeder.svg - nierenderowane.

## 3. SKAD "?" W POLACH GPZ, CO RENDERUJE POLE BEZ REKORDOW, JAK SLD DOSTAJE APARATY POLA
Trzy rozne "?" w produkcji (plus LvDomainView.tsx:1125,1456 w projekcji nN - poza zakresem SN/GPZ):
A. bayNoEquipment - ramka PRZERYWANA 14x24 z tekstem "?" fs=13 (G:773-791; "?" w G:782-787), 16x32, porty top/bottom, `data-brak-wyposazenia`.
   Wejscie: stos pustych rekordow.
   - GPZ: specyfikacjaPolaGpz GPZ.ts:434-458: `aparaty.length > 0 ? aparaty : [BRAK_DANYCH_WYPOSAZENIA]` (GPZ.ts:447; stala GPZ.ts:385-388, parityKey 'gpz.bay.no_equipment_data'). Uzywane dla pol sekcji (GPZ.ts:768), pola WN i TR transformatora (GPZ.ts:993-994,1935,2007; wysokosc pasma GPZ.ts:1534-1537) - takze gdy pole WN/TR NIE ISTNIEJE w ENM (bay==null, komentarz GPZ.ts:429-430) - czyli na kazdym transformatorze z H5/GPZ-MODEL bez pol 110 kV (Bay) dostaniesz "?" na torze WN i TR.
   - Stacje: resolveBayApparatusSymbolIds AS:180-193, symbolePolaBezDanych AS:95-98.
   - Dlaczego pole nie ma rekordow: CGA:509-533 -> projectBayPrimaryDevices (ADP:2146-2178) zwraca undefined gdy Bay.primary_devices puste ORAZ equipment_refs nie wskazuje galezi lacznikowych (ADP:2208-2235). Szablony GPZ tworza pola liniowe z aparatem glownym z katalogu (INWENTARZ KOREKTA_GPZ: add_grid_source_sn gpz_line_field_apparatus BREAKER), pozostale role (pole pomiarowe, ZU, BKR, pola 110 kV H5, sprzeglo) powstaja BEZ domyslnego aparatu (KOREKTA_GPZ_H5_ENEA_2026-10.md R12 "pola H5 bez rekordu aparatu -> '?'" - to wymaganie, zgodne z kodem).
   - DO UWAGI: zasada "zero fabrykacji" (dyrektywa 2026-10-21, AS:9-25) kazala SKASOWAC dawny stos konwencji (DS-CB-CT-DS-ES-glowica), wiec "?" jest DZIS jedynym obrazem pola bez rekordow. Wlasciciel odrzucil go jako "znaki zapytania". Nie sprawdzono (brak renderu), czy fixtura wlasciciela miala rekordy.
B. derUnknown - ramka DER 32x32 z "?" fs=16 (G:757-766). Wejscie: rola pola SOURCE bez rozstrzygnietego rodzaju (CGA rolaPolaZrodlowego; GPZ.ts:451-454 `bay.rolaZrodla ?? DER_UNKNOWN`; AS:62).
C. Transformator bez grupy polaczen - "?" w OBU okregach (G:467-483 BrakUzwojenia; G:488-495). Wejscie: uzwojeniaZGrupyPolaczen (v3/symbols/uzwojenia.ts:35-57) -> stan 'brak' (Transformer.vector_group puste) lub 'nierozpoznane' (regex ZAPIS_GRUPY ^([DYZ])(N?)([dyz])(n?)(\d{1,2})$, godzina 0..11); GPZ.ts:1984-1990 dopisuje missingData. vector_group jest opcjonalne w ENM (backend domain_operations.py:5335, 9469-9474 tylko gdy podane) - PRZYPUSZCZENIE (nie sprawdzone): TR utworzony w trybie 110 kV add_grid_source_sn dostaje grupe z materializacji katalogu; czy kazdy katalogowy TR ma vector_group - nie sprawdzono.
Inne znaki w glifach: badge "!" (TR bez pola, G:519-529; przekaznik z nierozstrzygnietym prerekwizytem G:1078-1088).
Struktura danych aparatow pola, wpiecie (kontrakt -> backend -> API -> UI):
 - kontrakt TS: types/enm.ts:1303-1325 BayPrimaryDevice (lustro backend/src/enm/models.py BayPrimaryDevice - nie czytalem Pythona), CanonicalGpzBay (v2/canvas/canonicalGpzModel.ts, pole primaryDevices, stany cbState/dsState/esState = agregaty historyczne, nadal wypelniane CGA:517-521),
 - adapter: CGA:509-533 (GPZ), ADP:1855-1878 (stacje, buildExplicitStationMiniBays), projectBayPrimaryDevices ADP:2146,
 - zabezpieczenia: resolveBayProtectionMarking ADP:2257 (Bay.protection_codes + protection_ref -> ProtectionAssignment.breaker_ref/ct_ref), resolveBayCtRatingAnnotations, resolveBayVtMountings; rysunek compose/protectionMarking.ts + protectionRelay/meter (24x24).
 - Nie badalem warstwy backend/API pol (poza odwolaniami INWENTARZ GPZ).

## 4. SKALE: aparaty vs rozstaw pol vs grubosc szyny w GPZ (stale)
- GRID = 8 (core/grid.ts:8). Wszystkie bboxy symboli wielokrotnosc 8 (test D grid_probe, symbols.test.tsx:32-52).
- Aparat: 16 szer. (kwadrat wyl. 12x12, G:176), wys.: 16/24/32; odstep pion aparat-aparat 8 (layout/apparatusStack.ts:36); odczep boczny 8 (apparatusStack.ts:42); kreska aparatu 1.2 (G:19, preview.tsx:100-117).
- Szyny: stacja `bus` 4, GPZ `busGpz` 6 (preview.tsx:63-68); magistrala `snTrunk` 2.4, odgalezienie `sn` 1.6, nN 1.2, leader 0.8, tor wyzwalania 0.8, linia pomiarowa 0.6. Iloraz szyna GPZ : aparat = 5.0, stacja 3.33 (komentarz preview.tsx:121-123 "3,33x" dotyczy stacji `bus`=4; dla busGpz=6 iloraz 5 - NIE jest przypiety osobnym testem, sprawdz proporcjeRysunku.test.tsx).
- Kompensacja ekranowa: strokeScaleFactor = max(1, 3px/(2.4*skala)) (preview.tsx:162-165) jednolita dla torow i glifow (G:156-159 `grubosc`).
- Rozstaw pol GPZ: NIE ma stalej szerokosci kolumny; szerokosc = footprint stosu (max szer. symbolu + rozszerzenie boczne) + sidecar etykiety + kolumna adnotacji zabezpieczen (GPZ.ts:716-747). Stale lokalne (NIEWYEKSPORTOWANE) GPZ.ts:342-347: SECTION_MARGIN=16, FIELD_GAP=16, SECTION_GAP=32, HV_MARGIN_TOP=32, STACK_GAP=16, HV_LINE_BAY_GAP=16; ODSUNIECIE_ZRODLA=24 (GPZ.ts:1123). Pas sprzegla GPZ.ts:858 = 16 + 2*16 = 48.
- Inne zrodla geometrii: layout/clearances.ts:48-152 (MIN_FIELD_CLEARANCE=16 - ta sama wartosc co FIELD_GAP, definicja osobna), layout/segments.ts:77 COLUMN_GAP=24, layout/bands.ts:49,117, layout/measure.ts:292-304, miniRmuGrammar.ts (MINI_RMU/MINI_GPZ: wlasne wagi 1.6/1.2/0.9/0.5), CAD (jednostka "u", 16x24, os x=8). Geometria wnetrza glifu to LITERALY w G (np. rect x=2,y=2,12x12) - osobno od bboxa w D; zgodnosc bbox/glif pilnuje tylko test portow na krawedzi (symbols.test.tsx:41-52), nie test zawierania rysunku w bboxie (nie znalazlem - przypuszczenie).
- WNIOSEK: wiele zrodel (co najmniej 6: D, G, apparatusStack, clearances, gpz.ts-lokalne, miniRmuGrammar), brak jednego pliku "tokeny geometrii symboli"; FIELD_GAP w gpz.ts duplikuje MIN_FIELD_CLEARANCE.

## 5. ROZBIEZNOSCI I LUKI (pelna lista, numeracja uzywana w meldunku)
1. "?" x3 (zob. 3): G:773-791 bayNoEquipment; G:757-766 derUnknown; G:467-483 TR bez grupy. Wlasciciel odrzucil; zrodlem jest zasada brak rekordu = sylwetka, nie symbol.
2. Wylacznik 'unknown' wyglada jak 'open': G:178-179 `fill = closed ? stroke : 'none'`, `fillOpacity` .35 dziala tylko na wypelnieniu, a wypelnienia nie ma -> unknown == open (ten sam defekt: G:213-216 recloser, G:591-593 lineBreaker, G:1141-1142 nnBreaker). Test symbols.test.tsx:76-83 sprawdza tylko closed vs open.
3. Domyslny stan wymyslony: earthSwitch `state ?? 'open'` (G:283), fuseSwitch `?? 'closed'` (G:360), a ES-unknown rysuje sie jak zamkniety (G:284), fuseSwitch-unknown jak zamkniety (G:364); adapter nie podaje stanu dla galezi `fuse` (ADP:2226 `galaz.type === 'fuse' ? {} : ...`) -> glif pokazuje "zamkniety", choc brak danych. Sprzeczne z zasada "brak danych != stan".
4. REKLOZER -> breaker w sciezce ENM: ADP:2183 (REKLOZER: 'CB'), AS:119-120; BayPrimaryDeviceKind nie ma REKLOZER (types/enm.ts:1276-1293). Glif recloser (G:204) i VPIS (G:399) istnieja, sa renderowane TYLKO w podgladzie kreatora (ui2/kreatory/stacja/generatorSldPola.ts:248,259 -> PodgladRozdzielnicySn.tsx). Dwie sciezki dla tej samej fizyki (ENM->SLD vs kreator->podglad).
5. FUSE: kind 'FUSE' -> fuseSwitch (AS:137-138); ROZLACZNIK_BEZPIECZNIKOWY -> FUSE (ADP:2185), galaz type fuse -> FUSE (ADP:2196). Glif `fuse` (bezpiecznik sam, G:383) nieosiagalny z ENM; bezpiecznik sam rysuje sie jako rozlacznik z nozem.
6. Martwe glify: jointSleeve (G:543), nnBreaker (G:1130), nnFuseSwitch (G:1158) - zero konsumentow poza testami/komentarzami; nN idzie przez CAD (v3/lv-domain/symbolRegistry.ts:56-62 mapuje device_kind -> cad.*). Harness porownawczy sld-symbol-pack-harness-main.tsx:66-73 sam nazywa nnBreaker/nnFuseSwitch "odrzucone".
7. Sprzeczne numery IEC w repo: rozlacznik G:254 "S00504" vs CAD:411 "S00290"; bezpiecznik G:376 "S00289" vs CAD:476 "S00362". Zadnego symbolu nie zweryfikowano normatywnie (rejestr par.0 pkt 3; test cadSymbolRegistry.test.tsx:91 pilnuje, ze nie ma NORMATIVE_VERIFIED bez porownania).
8. Dwa przeciwne kanony laczników: SN otwiera nozyk w prawo, ~49 st., przegub na gorze (G:228); nN w lewo -30 st., przegub na dole, styk staly na gorze (CAD KAT_OTWARTY). Stan niesie raz geometria (CAD), raz wypelnienie (SN wylacznik).
9. Rozlacznik SN (G:255-259): poprzeczka w polowie noza + poprzeczka na koncu - nie odtwarza oznaczenia funkcji rozlacznika z rejestru CAD (poprzeczka + okrag), wiec "rozlacznik" i "rozlacznik z bezpiecznikiem" roznia sie tylko wkladka.
10. Transformator: punkt neutralny bez wyprowadzenia i ziemi (G:457-462), grupa polaczen bez godziny na glifie (data-uzwojenia-godzina tylko w DOM, G:497), brak OLTC w v3 (strzalka tylko w legacy v2 GpzApparatusSymbols.tsx:586-603, nieprodukcyjnym), zygzak rysowany jako zalamane ramiona (G:432-439) - do potwierdzenia z IEC.
11. Trojkat: gridSource (G:820) i loadArrow (G:277) to dwa prawie identyczne WYPELNIONE trojkaty w dol (odrozniaja je 4 px dlugosci i brak/obecnosc pionu), a wlasna gramatyka (miniRmuGrammar.ts K4) rezerwuje trojkat dla glowicy kablowej (pusty, w gore, G:537). Brak symbolu IEC zrodla zastepczego.
12. Dwie definicje roli pola i stara konwencja: CGA:587-598 mapBayRoleToFieldRole (z cichym `default: 'LINE_OUT'`, CGA:596) obok rolaPolaGpz (CGA:641); CGA:608 deriveQDesignations (wywolanie CGA:533) wypelnia Q0/Q1/Q9/Q8/T1 wg roli (konwencja - sprzeczna z "oznaczenie z danych"; sprawdz, czy konsumowane: nie weryfikowalem uzycia).
13. Luki symboli: ZU/transformator uziemiajacy, baterie kondensatorow, uziemnik 110 kV z ogranicznikiem, wylacznik wysuwny, lacznik 3-pozycyjny, odlacznik z uziemnikiem jako jeden aparat, rezystor+dlawik rownolegle, transformator 3W; wszystkie [v1] tylko jako nierenderowane SVG.
14. Biblioteka v1 canonical_symbols: 56 SVG + ports.json, `currentColor`, viewBox 100x100; importy w kodzie rysujacym: ZERO (grep ".svg|canonical_symbols" w src: tylko glyphs.tsx:192 komentarz, testy, guardy). Zawartosc ma wady (komentarze z mojibake np. circuit_breaker.svg:2 — słowo „Wyłącznik” zapisane w złym kodowaniu; README: disconnector.svg opisany jako "Rozlacznik"; load_switch.svg opisany jako "Rozlacznik bezpiecznikowy" w SLD_IEC_60617_PARITY.md:45 mimo rysunku bez bezpiecznika; sprzeglo z napisem "COUPLER"). Jest to dlug: biblioteka pilnowana guardem, ale martwa w renderze.
15. Legenda arkusza (sheet/Frame.tsx:91-113) obejmuje 12 symboli; brak: fuse, recloser, surgeArrester, voltageTransformer, neutralEarthing, bayNoEquipment, bayReserve, protectionRelay, lineSwitch/lineBreaker, derPv/derBess/derWind/derGenerator, VPIS, wezly - czytelnik bez klucza do wlasnie tych symboli, ktore wzbudzaja watpliwosci.
16. Ziemia w trzech wersjach (zob. 2 poz.4); VT bez znakow polaczenia; CT bez rdzeni; SA z 1 kreska ziemi.
17. Zrodlo neutralEarthing: 1 symbol na caly GPZ, z PIERWSZEGO zrodla z neutral_grounding na szynie SN (CGA deriveSnNeutralEarthing, `sources.find`) - ENEA par.16: uziemienie "per sekcja", jeden zespol dla polaczonej sieci; brak odwzorowania zespolu dla sekcji B.

## 6. REJESTR CAD (nN, osobna biblioteka; CAD:339-720; status wg komentarza)
cad.wylacznik, wylacznikInstalacyjny, wylacznikRoznicowopradowy, odlacznik, rozlacznik, lacznik (ogolny), uziemnik (DRAFT), bezpiecznik, rozlacznikBezpiecznikowy, transformator2u (16x28), przekladnikPradowy, przekladnikNapieciowy, przeksztaltnik, zrodloPvZPrzeksztaltnikiem, magazynZPrzeksztaltnikiem, generator, odplywOdbior, zacisk, wezel, zabezpieczenie (DRAFT). Reszta ENGINEERING_REVIEWED (test cadSymbolRegistry.test.tsx:91 mowi "20 symboli"). Pierwowzor = schemat PV wlasciciela (nie ENEA). Renderer: v3/cad/CadSymbol.tsx; uzycie: tylko projekcja nN (v3/lv-domain/*).

## 7. TESTY PRZYPINAJACE SYMBOLE I GUARDY
Testy v3 (iloczyny cech):
- v3/symbols/__tests__/symbols.test.tsx (723 linie): grid_probe x38 (bbox i porty na siatce i krawedzi, nazwy unikalne, labelPl); rejestr D=G; wylacznik closed vs open (76); reklozer luk (85-101); lancuch laczników rozne rysunki (103-131); CALY rejestr glifow: kazdy inny markup (181-195) [iniekcja nadzoru 2026-08-14]; odlacznik otwarty (197); NO (207); mini-RMU: 210 kombinacji cech (456) + unikalnosc sygnatur (524), determinizm (529); GS-4/GS-5 (280-376, 545-612); czytelnosc min. (614-641); Transformer2W: 4 grupy (Dyn11,Yyn0,YNd11,Yzn11) x znak/neutral (663-690), "?" dla brak/nierozpoznane (692-703), determinizm (714).
  LUKA testu: brak testu stanu 'unknown' dla wylacznika (odrozniac od 'open'); brak testu zawierania rysunku w bboxie; brak testu hamujacego domyslny stan ES/fuseSwitch.
- v3/canvas/__tests__/minSymbolSize.contract.test.ts (D:398 MIN_SYMBOL_SCREEN_PX=8; CI sld-determinism.yml:82-84), stanAparatuParytetGlifu.test.tsx (glif = inspektor, iloczyn blok x rola x stan x siec x statusy), proporcjeRysunku (core/__tests__/proporcjeRysunku.test.tsx: iloczyn klasa kreski x skala), hierarchiaWagKresek.test.ts (compose), derPalette.test.tsx.
- v3/compose/__tests__: apparatusSequence.test.ts, apparatusSequence.referenceParity.test.ts, gpz.test.ts, gpzHvColumn.test.ts, station.test.ts (station.test.ts:754 zbior LACZNIKI zawiera 'fuse'), sourceKind.test.ts, preview.test.tsx.
- v3/cad/__tests__/cadSymbolRegistry.test.tsx (snapshot prymitywow, stan z kata, brak wypelnienia jako stan), lv-domain/__tests__/symbolRegistry.test.tsx, v3/sheet/__tests__/frame.test.tsx (legenda), v2/station-rozdzielnia/__tests__/disconnectorCircuitBreakerIec.test.tsx (legacy v2).
- canonical_symbols/__tests__/symbolContract.test.ts: 1 SVG <-> 1 wpis ports.json, currentColor, viewBox 100x100, >=1 port - NIE sprawdza zgodnosci z IEC ani z glifami v3. v2/__tests__/scadaComplianceContract.test.ts:102-113 sprawdza tylko istnienie plikow.
Guardy:
- scripts/sld_determinism_guards.py (REQUIRED_V3_TESTS: tylko istnienie symbols.test.tsx i 6 innych, linie 62-71), scripts/sld_lod_continuity_guard.py, scripts/sld_layer_id_scope_guard.py, scripts/port_binding_guard.py:163-190 (ports.json <-> SVG; dotyczy v1), scripts/utf8_mojibake_guard.py:70 (wyjatek na ports.json), scripts/no_codenames_guard.py, scripts/dead_click_guard.py. Workflow .github/workflows/sld-determinism.yml (guardy + vitest wymienione + accept:sld-v3).
- BRAK guarda/testu: (1) mapowania kind->symbol vs rejestr normatywny, (2) zgodnosci numerow IEC miedzy G i CAD, (3) osiagalnosci glifu z ENM (martwe glify), (4) kompletnosci legendy.

## 8. CZEGO NIE SPRAWDZILEM
- Nie uruchamialem testow ani renderu; nie ogladalem zrzutow (zasada 2: werdykt wizualny nalezy do wlasciciela).
- Nie porownywalem z tekstem PN-EN/IEC 60617 ani z rysunkami ENEA Z.1/Z.2/Z.4-Z.9 (PDF poza repo; skrypt scripts/pobierz_zrodla_techniczne.py; odczyt tekstu w docs/zrodla/GPZ_H5_ZRODLA_I_REGULY.md Z6). Wszystkie numery IEC powyzej to deklaracje repo.
- Nie czytalem backendu Python (models.py BayPrimaryDevice, domain_operations tworzace pola/aparaty) ani API; lancuch zbadany od types/enm.ts w gore.
- Nie sprawdzilem tresci tabliczki transformatora (GPZ.ts:929-970) i opisu zrodla (GPZ.ts:1081-1120), ani czy CGA deriveQDesignations jest konsumowane.
- Nie sprawdzilem, ktore ze stalych gpz.ts wchodza w piony pinowane testami (buildScene.test 23168/46400...).

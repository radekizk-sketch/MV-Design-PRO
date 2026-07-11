# SLD CAD SPEC V3 — specyfikacja schematu klasy CAD/SCADA (BINDING)

**Status:** WIĄŻĄCA specyfikacja docelowa. Zastępuje podejście przyrostowe
(declutter po fakcie) architekturą, w której **kolizja etykiet i przecięcie
symbolu przewodem są niemożliwe z konstrukcji**. Referencyjny poziom jakości:
wydruk ETAP / DIgSILENT PowerFactory / EPLAN; runtime SCADA: ABB MicroSCADA /
Mikronika. Plan wdrożenia: `docs/execplans/SLD_CAD_REBUILD_PLAN_V3.md`.

**Poprawka A1 (2026-07-11):** scalono §12–§15 (ścieżka mocy, widoczne źródła,
ciągłość/przepływ/sylwetki/rozgałęzienia, optymalizacja layoutu) z
`SLD_CAD_SPEC_V3_AMENDMENT_A1_DRAFT.md`. Źródło: dyrektywa użytkownika
2026-07-11 + audyt `docs/sld/SLD_POWER_PATH_AUDIT_2026-07.md` (12 ustaleń).
Rozstrzygnięcia kandydatów konfliktów K-A/K-B/K-D — patrz
`docs/v12xx/REJESTR_KONFLIKTOW.md` V12K-027..029.

---

## 0. Diagnoza — dlaczego obecny schemat NIE jest CAD (dowody z renderów 2026-07)

| # | Wada strukturalna | Objaw na renderze | Przyczyna architektoniczna |
|---|---|---|---|
| W1 | Rozstaw sztywny, treść zmienna | etykieta „YAKXS 3×120/16 · 90 m" (~158px) nie mieści się w kolumnie; lane-stacking nad magistralą | pozycje = `X_START + j×PITCH`; szerokość NIE zależy od treści |
| W2 | Etykiety bez właściciela i slotu | declutter przesuwa teksty po fakcie; 61 kolizji resztkowych; brak leader-line | etykieta = luźny (x,y,text); brak modelu slot/owner |
| W3 | Dwa języki wizualne | kanoniczny GPZ (rysunek rozdzielni) obok „mini-RMU card" stacji (kafel z rombami) | stacja nie jest komponowana z tych samych prymitywów IEC co GPZ |
| W4 | Brak hierarchii linii | wszystko gruba zielona; szyna = odpływ = mostek | brak klas grubości; stan (energized) MALUJE rysunek zamiast być nakładką |
| W5 | Brak dyscypliny arkusza w widoku sieci | brak ramki/oznaczeń stref/skali na widoku sieci (title block jest, ale nie spina widoku) | sheet model niepełny |
| W6 | LOD odsłania kolizje | lod2 „dosypuje" teksty w zajęte pasma | LOD nie jest osobnym KOMPLETNYM rysunkiem z własną rezerwacją miejsca |
| W7 | Routing bez kanałów | równoległe przewody i teksty portów zlewają się przy słupach ODG | brak alokacji torów (tracks) i jawnych węzłów |

Wnioski: dalsze łatanie declutterem nie osiągnie poziomu CAD. Wymagana jest
przebudowa potoku renderowania na model **measure → allocate → route → label**,
z zachowaniem WYŁĄCZNIE sprawdzonej elektryki z v2 (patrz §8).

---

## 1. Pryncypia (niełamalne)

P1. **Przestrzeń z treści, nie treść w przestrzeń.** Szerokość kolumny/wysokość
    pasma = f(najszerszy symbol, najszersza etykieta własna) + margines. Nigdy
    odwrotnie. Zero stałych PITCH niezależnych od treści.
P2. **Etykieta ma właściciela i slot.** Każdy tekst = (owner, klasa, slot,
    treść). Sloty są rezerwowane w layoutcie ZANIM cokolwiek się rysuje.
    Przeniesienie do slotu zapasowego ⇒ obowiązkowy leader-line.
P3. **Jeden język symboli (IEC 60617).** GPZ, stacja, słup — komponowane z tej
    samej biblioteki prymitywów o stałych gabarytach i nazwanych portach.
P4. **Przewód łączy porty.** Każdy wierzchołek trasy na siatce; koniec przewodu
    = port symbolu (rozszerzenie §16: terminal elektryczny + port graficzny).
    Przewód NIGDY nie przecina bboxa symbolu ani slotu etykiety.
P5. **Rysunek bazowy + nakładki stanu.** Baza czytelna w mono (druk); kolor
    napięcia i energizacja to nakładki (kolor/glow), nie zamiana geometrii.
P6. **Każdy LOD to kompletny rysunek.** Ma własną alokację miejsca i przechodzi
    wyrocznię kolizji = 0 niezależnie.
P7. **Determinizm i wyrocznie.** Ten sam ENM ⇒ identyczny SVG (hash). Bramki CI:
    kolizje=0, siatka, port-connectivity, §16.

---

## 2. Siatka, arkusz, typografia

- **GRID = 8 px** świata. Wszystkie origins symboli, porty, wierzchołki tras,
  lewe krawędzie slotów etykiet — na siatce (wyrocznia: `v % 8 === 0`).
- **Arkusz widoku sieci:** ramka + strefy referencyjne (litery A… pion, cyfry
  1… poziom, co 400 px), title block (istniejący K30-38), skala, legenda
  symboli i linii. Tło #0B0F14 (SCADA) z trybem print (białe, mono).
- **Typografia:** JEDNA rodzina `sans-serif` (jak dziś, jawne atrybuty).
  Klasy: `t1` 13px/700 (nazwy stacji, GPZ), `t2` 11px/600 (parametry: kVA,
  typ·przekrój·długość, napięcia), `t3` 9px/700 (podpisy portów, oznaczniki
  Q/T), `t4` 8px/600 (adnotacje). Zakaz innych rozmiarów. Wysokość wiersza =
  fontSize + 6. Szerokość: pomiar rzeczywisty (canvas measureText w buildzie
  layoutu; fallback deterministyczny `len × 0.62 × fontSize`).

## 3. Biblioteka symboli (IEC 60617) — `sld/v3/symbols/`

Każdy symbol: `{ id, bbox (wielokrotność GRID), ports: {name → {x,y,dir}},
labelSlots: {class → [slot…]} }`. Rysunek = czysty SVG path, stroke bazowy.

| Symbol | Gabaryt (px) | Porty | Uwagi |
|---|---|---|---|
| Szyna zbiorcza | h=4 (linia), dł. z treści | taps co GRID | grubość 4, kolor napięcia |
| Wyłącznik (CB) | 16×16 kwadrat | top, bottom | stan: zamknięty=wypełniony |
| Odłącznik (DS) | 16×24 | top, bottom | kreska 45°; otwarty = odchylona |
| Uziemnik (ES) | 16×20 + ⏚ | top | |
| Rozłącznik z bezp. | 16×28 | top, bottom | |
| Transformator 2W | 2×∅24, overlap 8 | hv (top), lv (bottom) | grupa połączeń przy symbolu |
| Głowica kablowa | trójkąt 12 | line | na przejściu kabel/linia |
| Mufa | ▬ 10×6 | a, b | |
| Punkt NO | ∅10 + przerwa toru | a, b | badge „NO" slot t3 |
| CT / VT | ∅12 / podwójne | through | |
| Ogranicznik (SA) | 10×18 + strzałka | top | |
| DER: PV / BESS / gen | 24×24 (falownik ▭~, bateria, G w ∅) | ac | moc w slocie t2 pod symbolem |
| Słup / węzeł ODG | punkt węzłowy ∅6 | N,S,E,W | jawna kropka T-węzła |

**Stacja SN/nN (widok sieci, L1/L2)** — NIE kafel. Kompozycja: pozioma szyna SN
(dł. z liczby pól), pola jako pionowe kolumny aparatów (WE: DS+CB; WY: DS+CB;
ODG: DS; TR: DS+bezpiecznik/CB + TR2W + szyna nN + odpływy nN), zgodnie z
`defaultSnBayRoles` footprintu. Ten sam rysunek, co sekcja GPZ — mniejsza skala
gabarytów, ta sama gramatyka.

## 4. Model etykiet — sloty właściciela

Klasy etykiet i sloty (kolejność = priorytet miejsca):

| Owner | Etykieta (klasa typograficzna) | Sloty |
|---|---|---|
| Segment kabla/linii poziomy | `typ·przekrój·długość` (t2) | 1: NAD linią (rekt pasma B1; wyśrodkowana na odcinku, gdy się mieści — inaczej bias ku stronie wejściowej, BEZ leadera); 2: drugi wiersz B1 (stagger); 3: margines + leader. *(Korekta 2026-07, recenzja F4: „POD linią" usunięte — pod osią magistrali leżą z konstrukcji pasma B3/B4, slot tam jest niewykonalny w widoku sieci.)* |
| Segment pionowy (lateral) | j.w. (t2, rotacja 90°, czytana z dołu) | 1: PO LEWEJ linii; 2: PO PRAWEJ; 3: margines + leader |
| Stacja | nazwa (t1); kod Sxx (t1, akcent); kVA TR (t2); typ stacji (t4) | pasmo NAZW pod blokiem stacji (zarezerwowane w layout); kolejność pionowa stała |
| Port pola | WE/WY/ODG/TR (t3) | 1: nad portem; 2: obok z leaderem |
| Aparat | oznacznik Q0/Q1/T1 (t3) | obok aparatu (strona od osi pola) |
| DER | rodzaj+moc (t2) | pod symbolem DER |
| Szyna | napięcie „15 kV" (t2) | nad lewym końcem szyny |
| Punkt NO | „NO" (t3, czerwony) | przy symbolu |
| GPZ | nazwa (t1) | header bloku (jak dziś, kanoniczny) |

Reguła twarda: **slot jest prostokątem zarezerwowanym w fazie layoutu** —
wchodzi do sumy szerokości kolumny / wysokości pasma (P1). Dzięki temu tekst
MA miejsce zanim powstanie. Wyrocznia kolizji = siatka bezpieczeństwa, nie
mechanizm.

## 5. Layout V3 — potok `measure → bands → columns → route → label`

Wejście: scena elektryczna z adaptera v2 (§8). Wyjście: `SceneGraph`
(symbole+porty+trasy+etykiety, wszystko zwymiarowane). Czysta funkcja,
deterministyczna, testowalna bez DOM.

**5.1 Measure.** Dla każdego elementu: szerokość wymagana = max(bbox symbolu,
najszerszy slot etykiet własnych) + 2×GRID. Dla każdego segmentu magistrali:
szer. etykiety segmentu.

**5.2 Pasma poziome widoku sieci (od góry):**
```
B1  pasmo etykiet segmentów magistrali (wys. = 1 wiersz t2; 2 wiersze TYLKO
    gdy dwa sąsiednie segmenty krótsze niż etykiety — wtedy naprzemiennie)
B2  oś magistrali + porty WE/WY/ODG + podpisy portów (t3)
B3  pasmo DER przy magistrali (symbol + moc) — tylko gdy DER na SN
B4  blok stacji (szyna SN + kolumny pól + TR + szyna nN)  [wys. z treści]
B5  pasmo NAZW stacji (nazwa, kod, kVA, typ) [wys. = suma wierszy]
B6  korytarz lateralu (pionowy) — szerokość kolumny lateralu z 5.1
```
Wysokości pasm = max po wszystkich stacjach wiersza. Pasma NIE nachodzą.

**5.3 Kolumny magistrali.** Kolumna stacji j: `width_j = max(blok stacji,
pasmo nazw, etykieta segmentu wejściowego)`. `x_j = x_{j-1} + width_{j-1} +
GAP(3×GRID)`. Prefix-sum ⇒ zero nadlewek z konstrukcji. Laterale analogicznie
w pionie (wysokości wierszy z treści).

**5.4 Routing.** Orthogonalny, port-to-port; kanały: równoległe trasy w tym
samym korytarzu dostają tory co GRID; T-węzeł = kropka ∅6; skrzyżowanie bez
kropki; zakaz przejścia przez bbox symbolu i slot etykiety (routing zna
rezerwacje). §16: każda trasa niesie `fromTerminal/toTerminal` ENM.

**5.5 Label resolve.** Sloty przydzielone (miejsce już istnieje); fallback →
slot 2/3 + leader-line 0.8px. Wynik: zero kolizji z konstrukcji.

## 6. Hierarchia graficzna

- Grubości: szyna 4 / tor SN 1.6 / tor nN 1.2 / leader 0.8 / ramka aparatu 1.2.
- Kabel: linia ciągła; linia napowietrzna: kreska-kropka (IEC), NIE tekstem.
- Kolor bazowy rysunku: #E8EEF4 (SCADA) / czarny (print). Napięcie: akcent na
  szynach (15 kV zielony #2ECC71 tylko jako nakładka energizacji; baza neutralna;
  110 kV #E74C3C akcent). Energizacja = nakładka koloru toru + glow, geometria
  bez zmian. Stany łączników: wypełnienie/kąt symbolu (jak dziś w kanonicznym).
- Zakaz: wypełnień dekoracyjnych, rombów jako łączników, pigułek pod tekstem
  (halo 3px wystarcza).

## 7. Kontrakt LOD

| LOD | Zawartość | Wyrocznia |
|---|---|---|
| L0 | GPZ blok + magistrale + stacje jako ∎16 z kodem Sxx + NO | kolizje=0 |
| L1 | pełne symbole, nazwy+kVA+napięcia+NO+DER (bez specyfikacji kabli i portów) | kolizje=0 |
| L2 | wszystko: specyfikacje segmentów, podpisy portów, oznaczniki aparatów | kolizje=0 |

LOD wybiera zoom (progi jak dziś); KAŻDY poziom przechodzi wyrocznię osobno,
bo każdy ma osobną rezerwację slotów (P6).

## 8. Co przejmujemy z v2 (elektryka = prawda, render = do wymiany)

ZOSTAJE (przetestowane, PROVEN): trawers ENM i semantyka elektryczna adaptera
(`buildSldDataFromSnapshot` — sekcje/pola/role/NO/DER/PCC), tożsamość terminali
§16 (`segmentTerminalOf`), inwarianty GPZ (noDirectTie/busbarTopology/parity —
testy przechodzą na kanoniczny GPZ; V3 przejmuje je 1:1), kamera+safe-viewport
(Step 7), LodPolicy, oracles recovery E01…E11.
WYMIENIAMY: geometrię slotową (PITCH), mini-RMU card, declutter po fakcie,
malowanie stanu zamiast nakładki.

## 9. Nomenklatura pól — jak czyta inżynier energetyk (BINDING)

**Zakaz `WE`/`WY`/`ODG` na rysunku.** Uzasadnienie inżynierskie: w sieci SN z
punktami NO, pierścieniami i OZE kierunek przepływu mocy jest ZMIENNY —
„wejście/wyjście" to fałszywa semantyka. W energetyce pole liniowe identyfikuje
się **kierunkiem (celem połączenia)**, pole transformatorowe — jednostką.

| Dziś (usunąć) | Na rysunku (t3/t2) | Pełna nazwa (inspektor/tooltip) |
|---|---|---|
| WE | `kier. GPZ` / `kier. S01` | Pole liniowe — kierunek ⟨kod poprzedniego węzła na ciągu⟩ |
| WY | `kier. S03` | Pole liniowe — kierunek ⟨kod następnego węzła⟩ |
| ODG | `odg. S15` | Pole liniowe odgałęźne — kierunek ⟨kod stacji odgałęzienia⟩ |
| TR | `TR1 · 630 kVA` | Pole transformatorowe TR1 |
| SPR | `sprzęgło` | Pole sprzęgła sekcji |
| POM | `pomiar` | Pole pomiarowe |

Źródło danych kierunku: kolejność stacji w `line_runs` (poprzednik/następnik na
ciągu; dla pierwszego pola — GPZ), dla odgałęzienia — pierwsza stacja gałęzi;
fallback: `bay.designation` z ENM, nigdy generyczne „WE". Kod węzła = stationCode
(S01…) lub skrót nazwy GPZ. Etykieta kierunku w slocie portu (t3); gdy brak
miejsca — slot 2 z leaderem (§4).

## 10. Pełny inwentarz funkcjonalny systemu — NIC nie ginie przy przebudowie

V3 zastępuje TYLKO geometrię/rysunek. Poniższe funkcjonalności ISTNIEJĄ w v2 i
muszą działać po cutoverze (F8 sprawdza każdą pozycję checklistą):

**Interakcja:** klik-selekcja elementu (stacja/pole/aparat/odcinek/GPZ/DER/sekcja),
podwójny klik (wejście w stację / drawer), menu kontekstowe per typ elementu,
detail drawer (K30-71..98: zakładki, ARIA, breadcrumbs), property grid,
PathHighlighter (podświetlenie toru zasilania stacji), lasso-selekcja,
paleta DER (K30-78: PV/BESS/FW → klik na stację), workflow append/split
(AppendOnEndpointController), edycja CAD (drag, bend handles, snap do siatki
i portów — Snap.ts), undo/redo (history), mode-gate (tryb ekspercki).
**Nakładki wyników (projekcje, zero fizyki w UI):** energizacja + kierunki
przepływu z solvera (power-flow companion, jedna prawda), zwarciowa IEC 60909
(K30-48/50), strefy zabezpieczeń Z1/Z2/Z3 (K30-46, IEC 60255-127), odchylenie
napięcia per stacja (K30-49/44), obciążenie kabli % (K30-45), wyniki na
końcówkach segmentów (endpoint result chips), severity/alarm badges per stacja
(K30-8), telemetria pól (BayMeasurements, projectBayTelemetry).
**Stany łączników:** closed/open/unknown geometrią symbolu (K30-7), punkt NO
z realnym identyfikatorem łącznika, marker punktu otwarcia na torze.
**Arkusz/OSD:** title block PN-EN ISO 7200 + kwalifikacje SEP (K30-38/99),
tabela rewizji (K30-100), SldPowerBalancePanel (K30-101), legenda palet
(K30-39), skala PN-EN ISO 5455 (K30-43), strzałka N (K30-47), uziemienie TR ⏚,
grupa połączeń + zaczepy (K30-104?), mufa kablowa, głowica kablowa (K30-53).
**Widok/kamera:** zoom kursora, pan, fit („Dopasuj całą sieć"), safe viewport,
kamera mobilna (portrait focus na GPZ), centerOnElementId, wirtualizacja >24
stacji, LOD L0/L1/L2 z LodPolicy, widok wnętrza stacji (StationInternalView),
widok rozdzielni GPZ (kanoniczny — inwarianty noDirectTie/busbarTopology/parity).
**Dane/eksport:** eksport SVG/PNG/PDF = geometria ekranu (parity), archiwum
projektu ZIP, determinizm (hash), badge braków danych (missing-data,
missing-port), readability report (data-* metryki), no-codenames/terminologia
(guardy), i18n PL.
**Integracje:** wizard (ten sam model), study cases (nakładki per case),
results browser → centrowanie elementu, ENM inspector.

Mapowanie na fazy: interakcja+stany → F5/F6; nakładki → F6; arkusz → F4;
kamera/LOD → F6 (reuse); eksport/determinizm → F7; checklista całości → F8.

## 11. Wyrocznie odbioru (bramki CI — definicja „20× lepiej" mierzalna)

1. `overlap_probe`: kolizje tekst↔tekst i tekst↔symbol = **0** na L0/L1/L2,
   skala 1.0 (mechanizm z QUALITY_PLAN §3, rozszerzony o bbox symboli).
2. `grid_probe`: 100% wierzchołków tras i originów symboli na GRID.
3. `port_probe`: 100% końców tras = port symbolu; 100% tras z terminalami §16.
4. `wire_probe`: 0 przecięć trasa↔bbox symbolu/slotu.
5. `determinism`: 2× render ⇒ identyczny hash SVG.
6. Render-odbiór per rola (projektant/operator/audytor): checklista K5 z
   QUALITY_PLAN + ocena PNG 1:1 przez człowieka lub agenta-recenzenta.

**Wyrocznie Poprawki A1 (§12–§15, dot. ścieżki mocy i widocznych źródeł):**

7. `cell_sequence_probe` (§12.1/§12.2): sekwencja symboli aparatów pola z
   `primary_devices` == sekwencja `kind` posortowana wg `placement`; 0 aparatów
   „z domysłu".
8. `field_entry_probe` (§12.3): 0 pól liniowych z zejściem kablowym bez symbolu
   głowicy na końcu toru pola (gdy pole ma kabel).
9. `sources_visible_probe` (§13.1): liczba narysowanych symboli źródeł == liczba
   źródeł w ENM (GPZ + Source + DER); 0 źródeł ENM bez reprezentacji na scenie.
10. `source_symbol_probe` (§13.2): każdy `source_kind` mapuje na unikalny glif.
11. `source_state_probe` (§13.3): mapowanie stan→nakładka deterministyczne; 0
    stanów wywiedzionych bez udokumentowanej reguły; nakładka nie zmienia bboxu.
12. `source_connectivity_probe` / `continuity_probe` (§14.1): 0 źródeł bez trasy
    do szyny; 0 przerwań na styku SN→TR→nN→odbiór, gdy dane obecne.
13. `flow_overlay_probe` (§14.2): kierunek/wartość każdego odcinka pochodzi z
    wyniku power-flow (brak wartości wpisanych w UI); overlay wyłączony bez
    wyniku; determinizm renderu nakładki.
14. `field_silhouette_probe` (§14.3): mapowanie rola→cecha wizualna injektywne
    w obrębie stacji.
15. `branch_accent_probe` (§14.4): każdy punkt odejścia lateralu ma węzeł o
    gabarycie większym niż `junction` bazowy.
16. `vertical_length_probe` (§15.1): łączna długość pionów nie-rosnąca względem
    poprzedniej wersji na fixturze `sldSubstrate52s`.
17. `lod_path_probe` (§15.2): na L0/L1/L2 zbiór odcinków toru elektrycznego jest
    niepusty i pokrywa te same połączenia topologiczne.

---

## 12. Kompozycja celki pola wg fizycznej ścieżki mocy (dot. ustaleń 1/5/6, Poprawka A1)

### 12.1 Prymat danych nad konwencją (rozstrzygnięcie „dane vs konwencja")

- **Wymaganie:** stos aparatów pola jest budowany z `Bay.primary_devices` (ENM), gdy lista jest niepusta.
  Kolejność aparatów wynika z `placement` (UPSTREAM przy szynie → MIDSTREAM → DOWNSTREAM przy głowicy)
  oraz `section_side`; symbol z `kind`→`ApparatusKind` (`apparatusContracts.ts`). Konwencja-wg-roli
  (§12.4) jest dozwolona WYŁĄCZNIE jako fallback dla pola bez `primary_devices`, i wtedy pole MUSI nieść
  znacznik `data-apparatus-source="konwencja"` (audytor odróżnia rysunek z danych od typowego).
- **Źródło danych:** `Bay.primary_devices[*].{kind, placement, section_side, symbol_ref, switch_state}`
  (`backend/src/enm/models.py:769-795`), rzutowane przez rozszerzony adapter (kontrakt
  `MiniBlockBayDescriptor`, dziś gubi tę listę — patrz F9 planu).
- **Wyrocznia odbioru:** `cell_sequence_probe` — dla KAŻDEGO pola z `primary_devices`: sekwencja symboli
  na rysunku (od szyny w dół) == sekwencja `kind` posortowana wg `placement`; 0 aparatów „z domysłu"
  (każdy narysowany aparat ma `device_ref` z ENM albo pole ma znacznik `konwencja`).

### 12.2 Kanoniczna sekwencja fizyczna celki (od szyny w dół)

- **Wymaganie:** referencyjna sekwencja pola liniowego celki SN, od szyny w dół:
  `DS_szynowy → CB → CT → (VT) → DS_liniowy → ES → (SA) → głowica kablowa → kabel`.
  Odczyt od kabla do szyny (jak w dyrektywie): `kabel → głowica → (SA) → (VT)/CT → DS → CB → szyna`.
  Elementy w nawiasach warunkowe (obecne, gdy występują w danych).
  **Rozstrzygnięcie (V12K-027, nadzorca, 2026-07-11):** dyrektywa użytkownika podaje literalnie
  `…odłącznik → wyłącznik → SZYNA` (od szyny: `CB→DS`); niniejsza specyfikacja przyjmuje kolejność
  wdrożonego GPZ i praktyki rozdzielnic SN (`DS_szynowy→CB`, odłącznik szynowy przy szynie). Literalna
  enumeracja dyrektywy jest czytana jako zasada „pole zaczyna się od kabla/głowicy, szyna jest końcem
  toru", NIE jako wiążąca sąsiedniość aparatów — nadrzędnym celem dyrektywy jest rzeczywisty fizyczny
  układ rozdzielnicy, a rzeczywisty układ niosą DANE (`placement`), nie przykładowa enumeracja. Patrz
  `docs/v12xx/REJESTR_KONFLIKTOW.md` V12K-027.
- **Źródło danych:** `placement` porządkuje; brak zgadywania kolejności.
- **Wyrocznia odbioru:** GPZ i stacja renderują TĘ SAMĄ gramatykę (mniejsza skala w stacji) — test parity
  gramatyki: dla pola liniowego stacja produkuje sekwencję zgodną z §12.2 (gdy dane obecne).

### 12.3 Głowica kablowa jako wejście pola

- **Wymaganie:** każde pole liniowe/odgałęźne, którego kabel jest fizycznym wejściem, kończy stos symbolem
  głowicy kablowej (`cableHead`), a kabel wchodzi/wychodzi od głowicy — nigdy „od szyny" bez głowicy.
- **Źródło danych:** `kind='CABLE_HEAD'` (ENM) lub konwencja (§12.4) z oznaczeniem.
- **Wyrocznia odbioru:** `field_entry_probe` — 0 pól liniowych, w których zejście kablowe zaczyna się
  bez symbolu głowicy na końcu toru pola (gdy pole ma kabel).

### 12.4 Kompozycja typowa celki wg roli (KONWENCJA RYSUNKOWA — fallback)

- **Wymaganie:** znormalizowane stosy fallback (gdy `primary_devices` puste), spójne z GPZ:
  - pole liniowe: `DS → CB → CT → DS → ES → głowica`;
  - pole TR: `DS → (bezpiecznik|CB) → TR2W`;
  - pole pomiarowe: `DS → VT → ES`;
  - pole sprzęgła: `DS → CB → CT`.
  Każdy stos rysowany z konwencji nosi `data-apparatus-source="konwencja"`.
- **Źródło danych:** rola pola (`bay_role`/`fieldRole`).
- **Wyrocznia odbioru:** stos fallback == tabela §12.4; obecność znacznika na każdym takim polu.

### 12.5 Ogranicznik przepięć (SA) — status danych

- **Wymaganie:** SA jest rysowany WYŁĄCZNIE, gdy pochodzi z danych. `BayPrimaryDeviceKind` (ENM) nie
  zawiera `SURGE_ARRESTER`. **Rozstrzygnięcie (V12K-028, nadzorca, 2026-07-11):** `BayPrimaryDeviceKind`
  zostanie rozszerzony o `SURGE_ARRESTER` w fazie F9.6 (zmiana domain/backend, mutacja modelu tylko w
  warstwie DOMAIN). Do tego czasu SA NIE jest rysowany z konwencji (zakaz zgadywania / WHITE BOX). Patrz
  `docs/v12xx/REJESTR_KONFLIKTOW.md` V12K-028.
- **Źródło danych:** (docelowo, od F9.6) `kind='SURGE_ARRESTER'`.
- **Wyrocznia odbioru:** 0 symboli SA bez `device_ref` z ENM.

---

## 13. Widoczne źródła i ich stany (dot. ustaleń 2/7/8, Poprawka A1)

### 13.1 Sieć zaczyna się od widocznych źródeł

- **Wymaganie:** każda scena renderuje WSZYSTKIE punkty zasilania jako widoczne symbole źródeł:
  GPZ (rozdzielnia — istniejąca kompozycja), transformator WN/SN, sieć zewnętrzna (Grid),
  DER (PV/BESS/generator/farma wiatrowa). Wiele GPZ MUSI być rysowanych (dziś tylko pierwszy — stopNote).
  **Rozstrzygnięcie (V12K-029, nadzorca, 2026-07-11):** DER (PV/BESS/generator/farma wiatrowa) jest
  pełnoprawnym WIDOCZNYM źródłem z dedykowanym symbolem w punkcie przyłączenia (realizacja F9.4);
  dotychczasowy badge DER (`derBadges`) znika z chwilą wdrożenia F9.4. Patrz
  `docs/v12xx/REJESTR_KONFLIKTOW.md` V12K-029.
- **Źródło danych:** `Substation`(GPZ), `Source`(model thevenin/external_grid), `Generator`,
  `BaySourceEndpoint`(PV/BESS/FW) — ENM (`models.py:253-277,333-355,1004-1015`).
- **Wyrocznia odbioru:** `sources_visible_probe` — liczba narysowanych symboli źródeł == liczba źródeł
  w ENM (GPZ + Source + DER); 0 źródeł ENM bez reprezentacji na scenie.

### 13.2 Dedykowany zestaw symboli źródeł

- **Wymaganie:** rozróżnialne glify: GPZ (rozdzielnia), transformator WN/SN (`transformer2W`),
  sieć zewnętrzna/Grid (nowy glif), PV (`derPv`), BESS (`derBess`), generator (`derGenerator`),
  farma wiatrowa (nowy glif turbiny, obecnie FW reużywa generatora). Zestaw kompletny bez czytania etykiet.
- **Źródło danych:** `source_kind` / `Source.model`.
- **Wyrocznia odbioru:** `source_symbol_probe` — każdy `source_kind` mapuje na UNIKALNY glif; brak dwóch
  różnych rodzajów źródeł na tym samym glifie (dziś FW==generator: FAIL do naprawy).

### 13.3 Stany źródeł jako nakładka (spój ze spec §6: stan = kolor/nakładka, nie geometria)

- **Wymaganie:** pięć stanów źródła wizualizowanych nakładką (kolor/obwódka/badge), bez zmiany geometrii:
  `energized`, `standby`, `disconnected`, `maintenance`, `fault`.
- **Źródło danych:** **[CZĘŚCIOWE — wymaga danych]** `fault` i `disconnected`/`energized` wywodliwe ze
  stanów łączników i telemetrii (`BaySwitchState.actual_state` m.in. `awaria`; `runtime_state`).
  `standby`/`maintenance` NIE są modelowane na poziomie źródła — wymagają pola stanu operacyjnego źródła
  w ENM (zmiana backend, F9.6) LUB białoskrzynkowej reguły wywodzenia zdefiniowanej tu (nie heurystyki).
- **Wyrocznia odbioru:** `source_state_probe` — mapowanie stan→nakładka deterministyczne; 0 stanów
  wywiedzionych bez udokumentowanej reguły; nakładka nie zmienia bboxu symbolu (spec §5/§6).

---

## 14. Nienaruszalna ciągłość, przepływ mocy, sylwetki, rozgałęzienia (dot. ustaleń 3/4/9/10, Poprawka A1)

### 14.1 Ciągłość źródło→odbiór (wzmocnienie §16)

- **Wymaganie:** pełna ścieżka `źródło → pole zasilające → głowica → zabezpieczenie → szyna → pole odpływowe
  → sieć SN → stacja → transformator → sieć nN → odbiór` jest nieprzerwana; żaden algorytm layoutu nie może
  jej rozspoić. Rozszerzenie §16: dla KAŻDEGO widocznego źródła istnieje trasa łącząca je z co najmniej jedną
  szyną (wyrocznia „źródło widoczne i połączone"). Strona nN (odpływy) i odbiór MUSZĄ być rysowane, gdy dane
  je opisują (dziś rysowana tylko szyna nN bez odpływów).
- **Źródło danych:** terminale §16 (`fromTerminal/toTerminal`), `Transformer`, sekcje nN, `Load`, `nnFeedersCount`.
- **Wyrocznia odbioru:** `source_connectivity_probe` — 0 źródeł bez trasy do szyny; `continuity_probe` —
  0 przerwań na styku SN→TR→nN→odbiór, gdy dane obecne; laterale zagnieżdżone rysowane lub jawny stopNote.

### 14.2 Wizualizacja przepływu mocy (nakładka, zero fizyki w UI)

- **Wymaganie:** nakładka przepływu: strzałki kierunkowe + wartości MW/MVAr/prąd[A] na odcinkach; animacja
  OPCJONALNA; dwukierunkowy przepływ DER (strzałka może wskazywać do szyny). Nakładka NIE liczy fizyki —
  czyta wyniki solvera power-flow (jedna prawda), spec §10.
- **Źródło danych:** wyniki PF (power-flow companion); wymaga tożsamości odcinków nie-GPZ (dług k1 —
  `PreviewSegment.meta.ownerRef/testId`, `SLD_CAD_REBUILD_PLAN_V3.md` F6b-2).
- **Wyrocznia odbioru:** `flow_overlay_probe` — kierunek/wartość każdego odcinka pochodzi z wyniku PF
  (brak wartości wpisanych w UI); overlay wyłączony bez wyniku (brak atrap); determinizm renderu nakładki.

### 14.3 Rozróżnialne sylwetki pól

- **Wymaganie:** podtypy pól (wejście/wyjście/odgałęzienie/transformator/sprzęgło/pomiar/DER) rozróżnialne
  wizualnie BEZ czytania etykiety (marker roli / wariant stosu / akcent), nie tylko podpisem `kier./odg.`.
- **Źródło danych:** `bay_role`/`fieldRole`.
- **Wyrocznia odbioru:** `field_silhouette_probe` — dla zestawu ról każde pole ma cechę wizualną unikalną
  dla roli (test: mapowanie rola→cecha injektywne w obrębie stacji).

### 14.4 Jawne rozgałęzienia (akcent węzłów)

- **Wymaganie:** węzeł rozgałęzienia (odejście lateralu/pierścienia) rysowany powiększonym, zaakcentowanym
  symbolem węzła, odróżnialnym od zwykłego T-węzła trasy.
- **Źródło danych:** topologia (`branchIndices`, `topologyRuns`), klasyfikacja `route.ts`.
- **Wyrocznia odbioru:** `branch_accent_probe` — każdy punkt odejścia lateralu ma węzeł o gabarycie
  większym niż `junction` bazowy; 0 rozgałęzień bez akcentu.

---

## 15. Optymalizacja layoutu i adaptacyjna czytelność (dot. ustaleń 11/12, Poprawka A1)

### 15.1 Minimalizacja zbędnej długości pionów (bez naruszania topologii i wyroczni §11)

- **Wymaganie:** layout dąży do redukcji łącznej długości pionów/zejść przy zachowaniu topologii,
  determinizmu i WSZYSTKICH wyroczni §11 (kolizje=0, siatka, port-connectivity, §16). Redukcja jest
  ograniczeniem miękkim — nigdy kosztem czytelności ani kolizji.
- **Źródło danych:** czysta geometria (deterministyczna).
- **Wyrocznia odbioru:** `vertical_length_probe` — miara łącznej długości pionów raportowana i
  nie-rosnąca względem poprzedniej wersji na fixturze `sldSubstrate52s` (regresja długości = FAIL),
  przy zielonych §11.1–§11.5 i determinizmie.

### 15.2 Adaptacyjne etykiety w kontrakcie LOD (doprecyzowanie §7)

- **Wymaganie:** LOD steruje szczegółowością ETYKIET (L0 kod → L1 nazwa+kVA+typ → L2 pełne specyfikacje),
  NIGDY nie ukrywa ŚCIEŻKI elektrycznej (symbole toru i trasy obecne na każdym LOD). Semantic zoom =
  progi kamery (polityka V3, dewiacja V12K-026 — bez cofania).
- **Źródło danych:** poziom LOD + `SceneV3` per poziom.
- **Wyrocznia odbioru:** `lod_path_probe` — na L0/L1/L2 zbiór odcinków toru elektrycznego jest niepusty
  i pokrywa te same połączenia topologiczne (LOD zmienia tylko etykiety, nie topologię ścieżki).

---

## Załącznik: mapa ustalenie → paragraf → wyrocznia (Poprawka A1)

| Ustalenie | Paragraf | Wyrocznia |
|-----------|----------|-----------|
| 1/5/6 | §12.1–§12.5 | cell_sequence_probe, field_entry_probe |
| 2/7 | §13.1–§13.2 | sources_visible_probe, source_symbol_probe |
| 8 | §13.3 | source_state_probe |
| 3 | §14.1 | source_connectivity_probe, continuity_probe |
| 4 | §14.2 | flow_overlay_probe |
| 9 | §14.3 | field_silhouette_probe |
| 10 | §14.4 | branch_accent_probe |
| 11 | §15.1 | vertical_length_probe |
| 12 | §15.2 | lod_path_probe |

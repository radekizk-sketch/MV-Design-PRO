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
- **Źródło danych (ERRATA E1, 2026-07-11 — V12K-030):** typ
  `BayPrimaryDevice{kind, placement, section_side, symbol_ref, switch_state}`
  (`backend/src/enm/models.py:769-795`); pole `primary_devices` żyje na
  `BayBaseModel` (`models.py:1033`) wewnątrz read-modelu field-view
  (`BayCanonicalModel`, budowany w locie przez
  `backend/src/application/field_read_model.py` z `equipment_refs`+branches+
  measurements — dane WYWIEDZIONE, nie pierwotne). **Snapshot ENM
  (`EnergyNetworkModel.bays[]`, element `Bay`) NIE serializuje
  `primary_devices`** — luka kanału danych, nie „gubienie przez adapter".
  Adapter (F9.2) rzutuje pole defensywnie (aktywne, gdy kanał danych je
  dostarczy); domknięcie kanału = F9.6 wg rozstrzygnięcia c-2: field-view
  dołączany do payloadu snapshotu w JEDNYM pobraniu (`attach_field_view`),
  bez denormalizacji danych wywiedzionych na surowy `Bay`.
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
- **Rozstrzygnięcie (V12K-031, nadzorca, runda korekcyjna F9.3 2026-07-12):** pola wejścia i wyjścia pola
  liniowego są FIZYCZNIE IDENTYCZNĄ konstrukcją rozdzielnicy (ta sama sekwencja aparatów, §12.2/§12.4) —
  rysowanie różnicy stosu/akcentu między nimi fabrykowałoby różnicę konstrukcyjną, której NIE MA (nadrzędny
  cel dyrektywy: prawda fizyczna wygrywa z literą zadania rysunkowego). Klasy sylwetki są zdefiniowane PER
  KONSTRUKCJA pola, nie per rola kierunkowa: `LINE_IN`/`LINE_OUT`/`LINE_BRANCH`/`RMU_LINE`/`GPZ_LINE_BAY`
  należą do JEDNEJ klasy równoważności `line` (dzielą sygnaturę WIZUALNĄ świadomie — to NIE jest naruszenie
  tego paragrafu); `TRANSFORMER`/`RMU_TRANSFORMER` → `transformer`; `COUPLER` → `coupler`; `MEASUREMENT` →
  `measurement`; `DER_PV`/`DER_BESS`/`DER_FW` → każdy własna klasa. Kierunek (wejście/wyjście/odgałęzienie)
  niesie podpis §9 (`kier. Sxx`/`odg. Sxx`) i, docelowo, strzałki przepływu mocy §14.2/F9.5 (prawda
  solverowa) — NIE sylwetka. Odgałęzienie różni się od wejścia/wyjścia AKCENTEM §14.4 (`branchJunction`),
  nie stosem. Patrz `docs/v12xx/REJESTR_KONFLIKTOW.md` V12K-031.
- **Wyrocznia odbioru:** `field_silhouette_probe` — dla WSZYSTKICH ról zdefiniowanych (`ALL_FIELD_ROLES`,
  nie w obrębie jednej stacji): każde dwie role SPOZA TEJ SAMEJ klasy równoważności (V12K-031) mają RÓŻNE
  sygnatury wizualne (stos LUB akcent); każde dwie role W TEJ SAMEJ klasie równoważności MOGĄ (i w tej
  implementacji dzielą) tę samą sygnaturę — to nie jest naruszenie.

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

## 17. Oznaczenie zabezpieczeń i aparatury wtórnej — konwencja ANSI/IEEE C37.2 (Poprawka A2, 2026-07-15)

> Numer §16 jest w tej specyfikacji celowo pominięty — „§16" funkcjonuje historycznie w kodzie
> i testach jako odwołanie do kontraktu CIĄGŁOŚCI ELEKTRYCZNEJ (SLD_CONTRACT_FLOW_V1);
> nadpisanie go tutaj tworzyłoby dwuznaczność cytowań.

Wzorzec przemysłowy (schemat referencyjny właściciela, 2026-07-15, konwencja ABB/ETAP):
symbole aparatów pozostają IEC 60617; funkcje urządzeń oznaczane są numerami ANSI/IEEE C37.2
jako WARSTWA ADNOTACJI schematu.

### 17.1 Konwencja graficzna (BINDING)

- **Wyłącznik:** istniejący symbol IEC (kwadrat) + numer urządzenia **„52"** jako etykieta
  adnotacji przy symbolu (L2). Chevrony wysuwności (człon wysuwny) — TYLKO z danych
  (wysuwność nie jest dziś w ENM → nie rysujemy, zero zgadywania; kandydat na rozszerzenie
  modelu w przyszłej rundzie DOMAIN).
- **Przekaźnik zabezpieczeniowy:** OKRĄG z kodami funkcji (np. „50/51", „51N") połączony
  z wyłącznikiem linią PRZERYWANĄ (tor wyzwalania). Okrąg = element adnotacji, NIE aparat
  toru mocy (nie uczestniczy w ciągłości elektrycznej ani w wyroczniach toru).
- **Miernik:** okrąg **„M"** przy przekładniku pomiarowym.
- Linia wyzwalania: przerywana (dash 4–2), ortogonalna, prowadzona kanałem adnotacji pola,
  od okręgu przekaźnika do symbolu wyłącznika wskazanego DANYMI (§17.2).

### 17.2 Źródła danych (zero zgadywania — twarde)

- Kody funkcji przekaźnika: WYŁĄCZNIE `Bay.protection_codes` (ENM; jedyne źródło prawdy dla
  wyświetlania na SLD — komentarz w modelu jest jednoznaczny; enum `ProtectionSetting` służy
  konfiguracji/koordynacji, NIE rysowaniu). Lustro wzorca: `OzeField.protection_codes`.
- Powiązanie przekaźnik→wyłącznik: `Bay.protection_ref` → `ProtectionAssignment.breaker_ref`.
  Brak rozwiązywalnego `breaker_ref` w stosie pola = okrąg BEZ linii wyzwalania + `missingData`
  (`bay.protection.trip_link_unresolved`) — nigdy linia do „domyślnego" aparatu.
- Kotwica okręgu: przy CT stosu pola (`ProtectionAssignment.ct_ref` rozwiązany na aparat CT
  w tym polu), a gdy brak CT — przy wyłączniku.
- Miernik „M": `Measurement.purpose == 'metering'` powiązany z polem (`bay_ref`).
- **Brak danych = brak oznaczenia.** Żadnych domyślnych „50/51" z roli pola ani konwencji.

### 17.3 Geometria

- Okrąg przekaźnika: średnica 24 px (3×GRID), w KOLUMNIE ADNOTACJI po prawej stronie stosu
  aparatów pola (rezerwacja szerokości w `measure` — kolumna istnieje tylko dla pól z danymi),
  środek wyrównany do wysokości kotwicy (§17.2).
- Kody w okręgu: maks. 2 linie po ≤4 znaki (np. „50/51" nad „51N"); większa liczba funkcji →
  w okręgu dwie najważniejsze wg kolejności listy `protection_codes`, pełna lista w etykiecie
  slotu pola (model slotów §4). Kolejność listy z danych — bez sortowania własnego.
- „52" przy wyłączniku: etykieta 8 px w slocie adnotacji symbolu (bez kolizji — wyrocznie §11).

### 17.4 LOD (spójnie z §15.2)

- L2: pełne oznaczenie (okrąg + kody + linia wyzwalania + „52" + „M").
- L1: okrąg przekaźnika bez kodów i bez „52"/„M"; linia wyzwalania ukryta.
- L0: warstwa adnotacji nieobecna (plan sieci).

### 17.5 Wyrocznie odbioru

- `protection_marking_probe`: (a) każdy okrąg przekaźnika na scenie ma `meta.ownerRef` = bay
  z niepustym `protection_codes` (zero okręgów bez danych — negatyw obowiązkowy);
  (b) każda linia wyzwalania łączy okrąg z portem symbolu wyłącznika wskazanego przez
  `ProtectionAssignment.breaker_ref`; (c) kody w okręgu = prefiks listy `protection_codes`
  (bez fabrykacji/sortowania); (d) determinizm; (e) L0 bez warstwy adnotacji.
- Istniejące wyrocznie §11 (kolizje, siatka, sloty etykiet) obejmują nowe elementy bez wyjątków.

### 17.6 Zakres globalny i koordynacja międzywątkowa

- Konwencja obowiązuje render v3 (docelowy); v2 GPZ już rysuje `protection_codes`
  (`GpzSwitchgearRenderer`) — semantyka wspólna, parytet wymagany przy F8c (§10).
- **Doprecyzowanie (rozstrzygnięcie architekta, runda korekcyjna F9.9):** w GPZ v3 rysowany jest
  w F9.9 SAM OKRĄG przekaźnika z kodami (`CanonicalGpzBay.protectionCodes`), BEZ toru wyzwalania —
  kompozycja GPZ nie śledzi `deviceRef` per aparat, więc tor bez rejestru urządzeń byłby zgadywany;
  tor wyzwalania w GPZ = F8c/F9.10 (razem z rejestrem device-ref). Okrąg bez toru w GPZ NIE jest
  `missingData` — to udokumentowany zakres etapu.
- Wątek przebudowy interfejsu (`claude/power-network-design-ui-ir91mv`): słownik nowej IA
  przyjmuje terminy „przekaźnik zabezpieczeniowy", numery urządzeń C37.2 („52", „50/51"…);
  inspektor nowej powłoki prezentuje `ProtectionAssignment` + `settings`; stylowanie warstwy
  adnotacji (kolor linii wyzwalania, okrąg) przez tokeny `--mvd-*` przy osadzeniu SLD w powłoce
  W-110. Kontrakt koordynacyjny: `docs/sld/SLD_PROTECTION_MARKING_COORDINATION_2026-07.md`.

---

## 18. Poprawność toru głównego i aparatów bocznych (dot. D2-1, D2-4, D2-5, D2-6, Poprawka A3, 2026-07-15)

### 18.1 Uziemnik jako odgałęzienie boczne toru głównego (D2-5) [KRYTYCZNE]

- **Wymaganie:** uziemnik (`ES`) NIE jest członem pionowego stosu szeregowego pola. Jest **węzłem
  bocznym**: tor główny pola (`DS_szynowy → CB → CT → DS_liniowy → głowica`) pozostaje NIEPRZERWANY
  i ciągły; ES odgałęzia się poziomo od odcinka toru głównego **po stronie kablowej** aparatu
  odłączającego (co do zasady poniżej `DS_liniowego`), ruchomym stykiem do symbolu ziemi. Po
  otwarciu ES tor główny jest wizualnie i topologicznie ciągły (usunięcie ES nie rozspaja toru).
  Ta sama reguła obejmuje aparaty jednoportowe: **ES, VT, SA są z definicji BOCZNE** i nigdy nie
  leżą w torze szeregowym (spina §18.5, §18.6). Blokada logiczna (interlock: zakaz zamknięcia ES
  na tor pod napięciem) odwzorowana adnotacją przy ES.
- **Rozstrzygnięcie architekta (2026-07-15):** Opcja A (§A3-DEC-1) — ES/VT/SA wyjęte z pionowego
  `buildBayStack`, rysowane render-side jako gałąź boczna od węzła toru głównego; `placement`/
  `section_side` wystarczają, BEZ zmiany DOMAIN. Blokada logiczna = adnotacja tekstowa/ikonką,
  BEZ danych (opis konwencyjny); nowe pole DOMAIN interlock (ES↔odcinek toru, D6, tab. zależności)
  jest kandydatem PRZYSZŁEJ rundy DOMAIN — poza zakresem tej fazy. **Doprecyzowanie realizacji
  (nadzorca, F10.1):** adnotacja konwencyjna blokady żyje w LEGENDZIE arkusza (wpis symbolu ES:
  „Uziemnik (blokada zamkn. na tor pod napięciem)") — konwencja dotyczy każdego ES jednakowo,
  a tekst powtarzany przy każdym symbolu (120× na fixturze) kolidował strukturalnie z korytarzami
  międzystacyjnymi i etykietami §18.6 (zweryfikowane wyroczniami) i powtarzał konwencję jako szum
  graficzny. `cell_sequence_probe` (§12.1)
  **przedefiniowana**: sekwencja toru GŁÓWNEGO liczona z POMINIĘCIEM aparatów bocznych ES/VT/SA —
  laterale mają własne wyrocznie (`earth_switch_lateral_probe`, `vt_parallel_probe` §18.2). Konflikt
  z V12K-027 (kolejność aparatów pola z `placement` jako stos) rozstrzygnięty jako DOPRECYZOWANIE,
  nie sprzeczność: `kind∈{ES,VT,SA}` jest jawnym WYJĄTKIEM od reguły „stos = sekwencja placement" —
  zapisane jako **V12K-033**. Geometria symboli jednoportowych wymaga portu bocznego/nowego wariantu
  glifu — zmiana addytywna w bibliotece symboli, zapisana jako **V12K-037**.
- **Źródło danych:** `BayPrimaryDevice{kind='ES', placement, section_side}`
  (`backend/src/enm/models.py:769-795`) — `placement`/`section_side` wyznaczają punkt odgałęzienia;
  BEZ nowego pola geometrycznego. Interlock: patrz D6 (kandydat przyszłej rundy DOMAIN, F10.6).
- **Wyrocznia odbioru:** `earth_switch_lateral_probe` — (a) żaden symbol `earthSwitch` nie leży na
  osi pionowej toru głównego pola (środek ES ≠ centerX toru); (b) zbiór odcinków toru głównego pola
  policzony Z ES i BEZ ES jest identyczny (ES nie należy do toru); (c) ES połączony osobnym
  odcinkiem odgałęzienia z węzłem toru po stronie kablowej i z symbolem ziemi; (d) determinizm.

### 18.2 Aparaty jednoportowe boczne — VT równolegle (D2-6, D2-4)

- **Wymaganie:** przekładnik napięciowy (`VT`) łączy się **równolegle** jako boczna gałąź do szyny
  lub linii; **NIGDY szeregowo** w torze mocy. Analogicznie ogranicznik przepięć (`SA`) — boczna
  gałąź do ziemi. Aparat szeregowy toru (DS/CB/CT/głowica) ma port wejścia i wyjścia (połączenia po
  OBU stronach, D2-4); aparat jednoportowy (ES/VT/SA) jest boczny (§18.1).
- **Rozstrzygnięcie architekta (2026-07-15):** jak §18.1 (Opcja A, §A3-DEC-1) — VT/SA dzielą tę samą
  regułę bocznego odgałęzienia i to samo przedefiniowanie `cell_sequence_probe`; konwencja pola
  pomiarowego (§12.4, `DS→VT→ES`) przestaje umieszczać VT w stosie szeregowym. Wymagana geometria
  (port boczny/nowy wariant glifu VT/SA) — **V12K-037**.
- **Źródło danych:** `BayPrimaryDevice{kind∈{VT,SA}, placement, section_side}`; konwencja pola
  pomiarowego (§12.4) przestaje umieszczać VT w stosie szeregowym — VT staje się gałęzią boczną.
- **Wyrocznia odbioru:** `vt_parallel_probe` — 0 symboli `voltageTransformer`/`surgeArrester` na osi
  toru szeregowego; każdy VT/SA połączony odcinkiem bocznym do szyny/linii/ziemi; tor główny pola
  ciągły bez VT/SA.

### 18.3 CT opisany: identyfikator, przekładnia, układ 3×CT / Ferranti-I0 (D2-6)

- **Wymaganie:** okrąg CT na przewodzie (poprawny per IEC 60617) nosi **oznaczenie**: identyfikator
  aparatu i przekładnię (np. „T1 · 300/5"), jako etykieta warstwy adnotacji (spójna z §17.3, POZA
  torem mocy). Układ pomiarowy rozróżnialny: **3×CT fazowe** vs **przekładnik sumujący/Ferranti dla
  składowej zerowej I0** — wariant symbolu lub adnotacji. CT powiązany z zabezpieczeniem (§17.2,
  §20.1).
- **Rozstrzygnięcie architekta (2026-07-15):** Opcja B (§A3-DEC-4) — etapowo. Render dwóch linii
  wtórnych (§20.1) i walidacja topologiczna (§20.2) realizowane TERAZ (F10.5) na obecnym modelu;
  przekładnia CT + układ pomiarowy (3×CT fazowe / Ferranti-I0) to **NOWE pole DOMAIN** (D3, tab.
  zależności), odłożone do kolejnej rundy DOMAIN (F10.6). Do czasu jego dostarczenia rysujemy sam
  okrąg CT bez przekładni — zero zgadywania, WHITE BOX (wyrocznia (b) poniżej).
- **Źródło danych:** przekładnia i układ CT — **NOWE pola DOMAIN** (D3, F10.6); do czasu ich
  dostarczenia rysujemy sam okrąg CT bez przekładni. Powiązanie z ochroną: `ProtectionAssignment.
  ct_ref` (`models.py:483`).
- **Wyrocznia odbioru:** `ct_annotation_probe` — (a) gdy dane przekładni obecne, każdy CT ma etykietę
  identyfikator+przekładnia w kolumnie adnotacji; (b) 0 przekładni „z domysłu" (brak danych = brak
  etykiety, negatyw obowiązkowy); (c) układ I0-sumujący rysowany wariantem WYŁĄCZNIE z danych.

### 18.4 Etykieta szyny stacji: napięcie znamionowe + oznaczenie sekcji; sprzęgło + stan (D2-4)

- **Wymaganie:** szyna SN w kompozycji STACJI (nie tylko GPZ) nosi podpis **napięcia znamionowego +
  oznaczenia sekcji** (parytet z GPZ, gdzie „Sekcja 1 · 15 kV" już istnieje). Szyny sekcjonowane:
  widoczne pole sprzęgła + jego STAN (otwarty/zamknięty z danych). Zakaz anonimowego odcinka szyny.
- **Źródło danych:** napięcie znamionowe/sekcja stacji — z poziomów napięć ENM (D7, tab. zależności);
  stan sprzęgła — `switch_state` istniejącego pola sprzęgłowego.
- **Wyrocznia odbioru:** `busbar_label_probe` — każda szyna SN stacji ma etykietę napięcie+sekcja;
  każde pole sprzęgła ma widoczny stan; parytet gramatyki z GPZ.

### 18.5 Jednoznaczność symbolu łącznika; „52" = wyłącznik, nie funkcja (D2-4)

- **Wymaganie:** żaden „kwadrat" nie jest anonimowy — wyłącznik (`breaker`, kwadrat IEC), rozłącznik
  z bezpiecznikiem (`fuseSwitch`, odrębny glif), odłącznik (`disconnector`, nóż), uziemnik
  (`earthSwitch`) mają rozróżnialne symbole IEC 60617 i jednoznaczny **stan otwarty/zamknięty**
  (rysowany z danych — już zgodne, `glyphs.tsx:42-107`). Numer „52" (ANSI C37.2) oznacza WYŁĄCZNIK
  jako urządzenie, NIE jest funkcją zabezpieczeniową równorzędną 50/51 (§17.1 — utrzymane).
- **Źródło danych:** `kind`→`SymbolId` (`compose/apparatusSequence.ts:94-130`); stan per aparat
  `switch_state` (`compose/station.ts:157`).
- **Wyrocznia odbioru:** `switch_symbol_unambiguity_probe` — (a) każdy symbol łącznika mapuje na
  dokładnie jeden `kind` IEC; (b) każdy łącznik toru ma renderowany stan (closed/open/unknown);
  (c) „52" występuje wyłącznie jako adnotacja przy wyłączniku, nigdy jako kod funkcji w okręgu
  przekaźnika (rozłączność z §17 protection_codes).

### 18.6 Zakończenie toru mocy zawsze OPISANE (D2-1)

- **Wymaganie:** żaden tor mocy nie kończy się na anonimowym terminalu/makrosymbolu. Każde pole
  liniowe/odgałęźne kończące się głowicą kablową nosi na tym zakończeniu podpis **numeru/nazwy linii
  i kierunku** (§19.2). Zakończenia na poziomie SIECI (koniec magistrali, lateral zagnieżdżony poza
  zakresem) mają jawną etykietę na scenie — nie tylko `stopNote` diagnostyczny
  (`scene/buildScene.ts:195` — dziś notatka, nie etykieta).
- **Źródło danych:** numer/nazwa linii (D2, tab. zależności); `line_runs` dla kierunku (§9).
- **Wyrocznia odbioru:** `path_termination_labeled_probe` — 0 zakończeń toru mocy bez etykiety
  (nazwa/numer linii + kierunek) lub jawnej kontynuacji; stopNote urwanego toru ma odpowiadającą
  etykietę na scenie.

---

## 19. Nomenklatura pól, identyfikatory aparatów i typ stacji (dot. D2-2, D2-3, Poprawka A3, 2026-07-15)

### 19.1 Oznaczenie FUNKCYJNE pola ≠ identyfikator aparatu; zakaz „Q" jako etykiety pola (D2-3)

- **Wymaganie:** pole nosi **własne oznaczenie FUNKCYJNE** (liniowe / transformatorowe / sprzęgłowe /
  pomiarowe / potrzeb własnych / generatorowe / inne technologiczne) — NIE „Q1/Q2/Q3". Litera „Q"
  identyfikuje **konkretny aparat** i występuje przy SYMBOLU tego aparatu; każdy aparat pola
  (wyłącznik/rozłącznik/odłącznik/uziemnik) ma **odrębny identyfikator** przy swoim symbolu
  (np. „Q1" wyłącznik, „Q9" odłącznik szynowy, „QE1" uziemnik, „T1" transformator). Obecny
  `bayApparatusDesignation` (`compose/directions.ts:91-105`) przestaje pełnić rolę etykiety pola.
- **Rozstrzygnięcie architekta (2026-07-15):** Opcja A (§A3-DEC-2) — nowe pole `BayPrimaryDevice.
  designation` (DOMAIN backend, przyszła runda **F10.6-DOMAIN**, mutacja modelu tylko w warstwie
  DOMAIN) niesie identyfikator per-aparat; fallback konwencji (Q dla łączników, T dla transformatora)
  dozwolony WYŁĄCZNIE ze znacznikiem `data-designation-source="konwencja"`. `bayApparatusDesignation`
  przestaje etykietować CAŁE pole — pole dostaje oznaczenie FUNKCYJNE (ten paragraf), aparaty dostają
  Q/T przy symbolu. Rozstrzyga K-D2-C — zapisane jako **V12K-035**.
  Kategorie funkcjonalne pól (D2-2/D9, §A3-DEC-5): rozszerzenie `FieldRole` WYŁĄCZNIE dla ról realnie
  występujących w danych, po inwentaryzacji kompletności w fazie **F10.2** (WHITE BOX — zero
  ról-atrap); decyzja o zakresie finalnym zapada po tej inwentaryzacji.
- **Źródło danych:** identyfikator per-aparat — **NOWE pole** `BayPrimaryDevice.designation`
  (D1, tab. zależności); fallback konwencji (Q dla łączników, T dla transformatora) z
  jawnym znacznikiem `data-designation-source="konwencja"`. Oznaczenie funkcyjne pola — z
  `bay_role`/`fieldRole`.
- **Wyrocznia odbioru:** `apparatus_identifier_probe` — (a) etykieta pola jest oznaczeniem funkcyjnym
  (spoza zbioru surowych „Q\d+"); (b) każdy aparat toru z danymi ma własny identyfikator przy symbolu;
  (c) aparaty z konwencji mają znacznik źródła; (d) zero „Q" jako podpisu CAŁEGO pola.

### 19.2 Podpis pola liniowego: numer/nazwa linii + kierunek topologiczny (D2-2)

- **Wymaganie:** podpis pola liniowego = **numer/nazwa linii + kierunek topologiczny** (wzorzec
  właściciela: „L-01 – kierunek Stacja A"). „Kierunek" = punkt połączenia (cel), NIE kierunek
  energii (utrzymane §9, V12K-031). Rzeczywisty kierunek P/Q wyłącznie warstwą wyników (§14.2).
  Zakaz `WE/WY/ODG` (utrzymane §9). Dwa pola stacji przelotowej = równorzędne pola liniowe (V12K-031).
- **Źródło danych:** numer/nazwa linii (D2, tab. zależności, źródło: `Cable`/`OverheadLine.name` lub
  `LineRun.id`); kierunek — `LineRunV1` (§9, `compose/directions.ts:194-234`). Podpis dwuczłonowy
  budowany w kompozycji bez zmiany semantyki §9.
- **Wyrocznia odbioru:** `line_bay_caption_probe` — każde pole liniowe z danymi linii ma podpis
  `⟨numer linii⟩ · kier. ⟨kod⟩`; brak danych linii = sam `kier. ⟨kod⟩` (degradacja, nie błąd);
  0 tokenów `WE/WY/ODG` (istniejący `noForbiddenDirectionTokens`).

### 19.3 Typ stacji wyznaczany z TOPOLOGII, nie z ręcznego podpisu (D2-3)

- **Wymaganie:** rodzaj stacji (końcowa/przelotowa/odgałęźna/sekcyjna) jest **wyprowadzany z
  topologii**: liczba pól liniowych (2 równorzędne ⇒ przelotowa; ≥3 ⇒ odgałęźna/z odgałęzieniem),
  obecność gałęzi w `line_runs`, obecność sekcji (sprzęgło). Trzeci tor transformatorowy jest
  DOZWOLONY tylko z rzeczywistym transformatorem + rozdzielnią nN + dalszym torem — inaczej błąd
  spójności (spina §20.2). Podpis na rysunku pochodzi z wyprowadzenia; ręczna dana `Substation.
  station_type` (`domain_ops_models.py:724`) służy WYŁĄCZNIE walidacji (ostrzeżenie o niezgodności).
- **Rozstrzygnięcie architekta (2026-07-15):** Opcja A (§A3-DEC-3) — rysunek pokazuje typ
  WYPROWADZONY z topologii (pola, `line_runs`); dana `station_type` degradowana WYŁĄCZNIE do
  walidacji (ostrzeżenie o niezgodności, bez cichego nadpisania rysunku). Uzasadnienie: prawdziwą
  daną pierwotną jest TOPOLOGIA — zgodne z prymatem danych §12.1 (`station_type` jest wtórną
  adnotacją, nie pierwotną prawdą fizyczną, więc Opcja A NIE łamie §12.1, tylko wskazuje właściwe
  źródło). Rozstrzyga K-D2-B — zapisane jako **V12K-034**.
- **Źródło danych:** inwentarz pól/transformatorów stacji + `line_runs` (warstwa adapter/analysis;
  BEZ nowego pola DOMAIN). Dziś: `classifyTopologicalType` czyta `station_type` 1:1 — do zastąpienia
  wyprowadzeniem.
- **Wyrocznia odbioru:** `station_type_topology_probe` — (a) etykieta typu stacji == typ wyprowadzony
  z topologii; (b) niezgodność z `station_type` (dana) daje `missingData`/ostrzeżenie, nie zmienia
  rysunku; (c) 3 pola liniowe ⇒ typ „odgałęźna"; (d) determinizm.

---

## 20. Powiązania wtórne i walidacja topologiczna funkcji zabezpieczeń (dot. D2-7, D2-8, Poprawka A3, 2026-07-15)

### 20.1 Dwa RÓŻNE powiązania wtórne: pomiar CT→przekaźnik i trip przekaźnik→wyłącznik (D2-7)

- **Wymaganie:** warstwa wtórna rysuje **DWA odrębne powiązania**: (1) linia **sygnału prądowego
  CT→przekaźnik** (pomiar, dla 50/51 i 51N), (2) osobna linia **sterownicza przekaźnik→wyłącznik**
  (TRIP). Zakaz JEDNEJ anonimowej linii przerywanej sugerującej „pomiar z wyłącznika". Obie linie
  należą do warstwy adnotacji (§17.1) — NIE do toru mocy (nie uczestniczą w ciągłości ani wyroczniach
  toru). Rozróżnialne wizualnie/semantycznie (np. linia pomiarowa cienka od CT; linia trip jak §17).
- **Rozstrzygnięcie architekta (2026-07-15):** Opcja B (§A3-DEC-4) — etapowo: obie linie wtórne
  (`ct_ref` już dostępny, §17.2) realizowane TERAZ w fazie **F10.5**, na obecnym modelu, bez nowych
  pól DOMAIN; przekładnie CT/VT, układ I0/open-delta, strefa 87T (2×CT) — kolejna runda DOMAIN
  (D3-D5, F10.6). Doprecyzowanie względem §17.1 (K-D2-D): okrąg CT JEST elementem TORU MOCY
  (poprawny per IEC 60617, pozostaje w ciągłości elektrycznej — bez zmian); linia pomiarowa
  CT→przekaźnik jest NATOMIAST warstwą wtórną adnotacji (analogicznie do linii trip) — jawnie
  wyłączona z `continuity_probe`/`port_probe` toru mocy (wyrocznia (e) poniżej). To jest
  DOPRECYZOWANIE §17.1, nie konflikt z nim — zapisane jako **V12K-036**.
- **Źródło danych:** linia pomiarowa — `ProtectionAssignment.ct_ref`→CT stosu pola (`models.py:483`,
  `protectionMarking.ts:158`); linia trip — `ProtectionAssignment.breaker_ref`→wyłącznik
  (`models.py:482`, §17.2). Brak `ct_ref` = brak linii pomiarowej + `missingData`; brak `breaker_ref`
  = brak linii trip + `bay.protection.trip_link_unresolved` (istniejące, `station.ts:599`).
- **Wyrocznia odbioru:** `secondary_link_duality_probe` — (a) gdy `ct_ref` i `breaker_ref` obecne,
  scena ma DWIE różne linie (CT→przekaźnik, przekaźnik→wyłącznik) o różnych `ownerRef`; (b) 0 linii
  wtórnych łączących bezpośrednio wyłącznik z pomiarem; (c) obie linie zaczepione w REJESTROWANYCH
  portach wskazanych aparatów; (d) determinizm; (e) linie wtórne wyłączone z `continuity_probe`/
  `port_probe` toru mocy.

### 20.2 Walidacja topologiczna funkcji zabezpieczeń (67N⇒VT, 87T⇒TR+2×CT, 51N⇒I0) (D2-7)

- **Wymaganie:** **warstwa ANALYSIS/COMPLIANCE** (NIE solver, NIE render) waliduje prerekwizyty
  topologiczne funkcji zabezpieczeniowych zanim zostaną narysowane/zaakceptowane:
  - `67N` wymaga I0 ORAZ 3U0 (VT w układzie otwartego trójkąta) — bez `vt_ref`/open-delta 67N
    nieuzasadnione (błąd/ostrzeżenie spójności).
  - `87T` (różnicowe transformatora) wymaga `Transformer` + CT po OBU stronach (2×CT) + zdefiniowanej
    granicy strefy — bez transformatora 87T usunąć albo uzupełnić pole (przypadek DEMO „87T bez TR").
  - `51N` wymaga źródła I0 (CT sumujący/Ferranti lub 3×CT).
  Reguły są WHITE BOX (jawne warunki), deterministyczne, bez heurystyk.
- **Rozstrzygnięcie architekta (2026-07-15):** Opcja B (§A3-DEC-4) — walidacja 67N⇒VT i 87T⇒TR
  realizowana TERAZ (**F10.5**) na ISTNIEJĄCYCH polach (`vt_ref`, obecność `Transformer`) —
  wykrycie „87T bez transformatora" i „67N bez VT" możliwe BEZ nowych pól DOMAIN. Pełna strefa
  różnicowa 87T (2×CT) i układ open-delta VT jako doprecyzowanie danych — kolejna runda DOMAIN
  (D4/D5, **F10.6**).
- **Źródło danych:** `Bay.protection_codes` (`models.py:714`), `ProtectionAssignment{ct_ref,vt_ref,
  breaker_ref,device_type}` (`models.py:479-500`), obecność `Transformer` w polu; dla 87T strefa +
  drugi CT — **NOWE modelowanie DOMAIN** (D5, tab. zależności, F10.6); dla 67N open-delta VT —
  D4, tab. zależności.
- **Wyrocznia odbioru:** `protection_function_topology_validation` — testy jednostkowe warstwy
  analysis: (a) 67N bez VT ⇒ diagnostyka; (b) 87T bez transformatora lub bez 2×CT ⇒ diagnostyka;
  (c) 51N bez I0 ⇒ diagnostyka; (d) konfiguracja poprawna ⇒ brak fałszywych alarmów; determinizm.

### 20.3 Priorytet toru pierwotnego nad warstwą zabezpieczeń (D2-8)

- **Wymaganie:** warstwa zabezpieczeń (okręgi, kody, linie pomiarowe/trip, „52", „M") jest zwarta,
  prowadzona w kolumnie/kanale adnotacji pola (§17.3), i **nie zasłania ani nie zmienia POZORNIE**
  połączeń toru pierwotnego. Topologia pierwotna ma bezwzględny priorytet graficzny.
- **Źródło danych:** geometria warstwy adnotacji (§17.3, deterministyczna).
- **Wyrocznia odbioru:** `annotation_no_overlap_primary_probe` — rozszerzenie §11: (a) 0 przecięć
  linii adnotacji (pomiar/trip) z przewodem toru mocy; (b) 0 kolizji okrąg/kod/„52"/„M" z symbolem
  lub przewodem toru; (c) usunięcie warstwy adnotacji nie zmienia zbioru odcinków toru mocy.

### 20.4 Miernik „M" odróżnialny od napędu silnikowego; napęd przypisany mechanicznie (D2-7)

- **Wymaganie:** symbol „M" miernika (okrąg „M", `glyphs.tsx:325-340`) oznacza MIERNIK pomiarowy
  powiązany z przekładnikiem pomiarowym (CT/VT) i **musi być jednoznacznie odróżnialny od napędu
  silnikowego** aparatu. Napęd silnikowy (motor drive), jeśli kiedykolwiek rysowany, jest **osobnym
  symbolem** przypisanym mechanicznie do konkretnego aparatu (nie może być mylony z miernikiem).
  Dziś napęd silnikowy NIE jest modelowany — pozostaje poza zakresem, ale spec zakazuje używania
  glifu „M" dla napędu.
- **Źródło danych:** miernik — `Measurement.purpose=='metering'` z `bay_ref`
  (`protectionMarking.ts:24-25,175-190`); napęd silnikowy — NIEmodelowany (D8, tab. zależności,
  przyszła runda DOMAIN, poza D2).
- **Wyrocznia odbioru:** `meter_symbol_disambiguation` — (a) każdy okrąg „M" ma `Measurement.purpose
  =='metering'` i jest powiązany z CT/VT; (b) 0 użyć glifu „M" dla napędu/innego celu; (c) legenda
  palety opisuje „M = miernik pomiarowy" jednoznacznie.

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

---

## Załącznik: mapa D2 → paragraf → wyrocznia → faza (Poprawka A3)

| Ustalenie D2 | Paragraf A3 | Wyrocznia | Faza |
|--------------|-------------|-----------|------|
| D2-1 | §18.6 | path_termination_labeled_probe | F10.1 |
| D2-2 | §19.2 | line_bay_caption_probe | F10.2 |
| D2-3 (Q/pole) | §19.1 | apparatus_identifier_probe | F10.2 |
| D2-3 (typ stacji) | §19.3 | station_type_topology_probe | F10.2 |
| D2-4 (szyny) | §18.4 | busbar_label_probe | F10.3 |
| D2-4 (symbole) | §18.5 | switch_symbol_unambiguity_probe | F10.3 |
| D2-5 | §18.1 | earth_switch_lateral_probe | F10.1 |
| D2-6 (CT) | §18.3 | ct_annotation_probe | F10.4 |
| D2-6 (VT) | §18.2 | vt_parallel_probe | F10.1 |
| D2-7 (dwa łącza) | §20.1 | secondary_link_duality_probe | F10.5 |
| D2-7 (walidacja) | §20.2 | protection_function_topology_validation | F10.5 |
| D2-7 (M/napęd) | §20.4 | meter_symbol_disambiguation | F10.5 |
| D2-8 | §20.3 | annotation_no_overlap_primary_probe | F10.5 |
| D2-9 | (kolejność faz F10.1–F10.6) | — (istniejące §11) | wszystkie |

**Zależności DOMAIN (skrót, pełne w audycie `SLD_ENGINEERING_CORRECTNESS_AUDIT_2026-07.md` §3):**
D1 `BayPrimaryDevice.designation` (F10.6); D2 numer/nazwa linii pola (kanał adaptera, F10.2);
D3 przekładnia+układ CT (F10.6); D4 przekładnia+open-delta VT (F10.6); D5 strefa 87T + 2×CT (F10.6);
D6 interlock ES — opcja (F10.6); D7 napięcie+sekcja szyny stacji (F10.3); D8 napęd silnikowy —
przyszłość, poza zakresem D2; D9 kategorie funkcjonalne pól (F10.2, §A3-DEC-5 inwentaryzacja).

**Rozstrzygnięcia konfliktów** (`docs/v12xx/REJESTR_KONFLIKTOW.md`): K-D2-A → V12K-033;
K-D2-B → V12K-034; K-D2-C → V12K-035; K-D2-D → V12K-036; K-D2-E → V12K-037.

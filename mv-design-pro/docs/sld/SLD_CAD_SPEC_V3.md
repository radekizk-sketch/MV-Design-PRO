# SLD CAD SPEC V3 — specyfikacja schematu klasy CAD/SCADA (BINDING)

**Status:** WIĄŻĄCA specyfikacja docelowa. Zastępuje podejście przyrostowe
(declutter po fakcie) architekturą, w której **kolizja etykiet i przecięcie
symbolu przewodem są niemożliwe z konstrukcji**. Referencyjny poziom jakości:
wydruk ETAP / DIgSILENT PowerFactory / EPLAN; runtime SCADA: ABB MicroSCADA /
Mikronika. Plan wdrożenia: `docs/execplans/SLD_CAD_REBUILD_PLAN_V3.md`.

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
| Segment kabla/linii poziomy | `typ·przekrój·długość` (t2) | 1: NAD linią, wyśrodkowana na odcinku; 2: POD linią; 3: pasmo marginesu + leader |
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

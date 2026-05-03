# PROMPT: Pełna przebudowa silnika schematu SLD — styl SCADA/CAD klasy przemysłowej

**Dokument**: Specyfikacja wykonawcza do implementacji  
**Priorytet**: KRYTYCZNY — obecna implementacja ocena 0/10, wymaga całkowitego przepisania  
**Referencyjna inspiracja wizualna**: Elektrometal eTango mini-SCADA, ETAP SLD, ABB Network Manager  
**Język docelowy**: TypeScript/React + SVG  
**Podejście**: Think like an MV network engineer — projektuj tak jak inżynier projektuje sieć

---

## 1. DIAGNOZA OBECNEGO STANU (co wyrzucić)

Obecny system buduje schemat jako **generyczny graf** z automatycznym layoutem (fazy 1-5, Sugiyama). To fundamentalnie zły model mentalny.

**Problemy do wyeliminowania:**
- `phase1-voltage-bands.ts` — pasma napięciowe jako abstrakcja layoutu → wyrzucić
- `phase2-bay-detection.ts` — detekcja pól przez analizę grafu → wyrzucić
- `phase3-crossing-min.ts` — minimalizacja skrzyżowań (heurystyka) → wyrzucić
- `phase4-coordinates.ts` — ogólne przypisanie współrzędnych → wyrzucić
- `phase5-routing.ts` — routing A* → wyrzucić
- `TrunkSpineRenderer.tsx` — magistrala jako spine → wyrzucić
- `FieldBlockRenderer.tsx` — aparatura jako float → wyrzucić
- `BranchRenderer.tsx` → wyrzucić
- `sldCanonicalStyle.ts` (1943 linie) → zastąpić nowym tokenem
- `IndustrialAesthetics.ts` → zastąpić

**Zachować:**
- Typy `LayoutSymbol` i `NetworkModel` snapshot (dane wejściowe)
- `CanonicalSymbolRenderer.tsx` — symbole SVG (zmodernizować, nie przepisywać)
- `ports.json` — porty symboli (zaktualizować)
- Testy deterministyczne (zaktualizować dla nowej architektury)

---

## 2. FILOZOFIA: MODEL MENTALNY INŻYNIERA MV

Inżynier projektujący sieć SN **myśli hierarchicznie i sekwencyjnie**. Schemat buduje się w tej kolejności:

```
1. GPZ (Główny Punkt Zasilania)
   └── Sekcje SN (I, II, ...)
       └── Pola SN (F01, F02, LS, PT, ...)
           └── Szereg aparatury w polu (od góry do dołu)

2. Ciągi liniowe (od pola GPZ w dół)
   └── Segmenty kablowe/napowietrzne
       └── Stacje SN/nn (węzły na ciągu)
           └── Kolejne stacje (kaskada)

3. Przyłączenia OZE (pod stacje lub bezpośrednio do szyny SN)
   └── PV Farm → inwerter → transformator SN → pole przyłączeniowe
   └── BESS → DC-AC → transformator SN → pole przyłączeniowe
   └── FW (farm wiatrowa) → kabel zbiorczy → stacja SN → pole
```

**Kluczowa zasada:** Schemat to NIE jest graf. Schemat to **hierarchia bloków stacyjnych** połączonych **ciągami liniowymi**. Każdy blok ma ustalone wewnętrzne rozmieszczenie aparatury.

---

## 3. HIERARCHIA OBIEKTÓW RENDERINGU

### 3.1 Blok GPZ (`GPZBlock`)

GPZ to prostokątny blok o stałej strukturze wewnętrznej:

```
┌─────────────────────────────────────────────────────────────────────┐
│  GPZ "NAZWA_GPZ"   (110/15 kV)                                      │
│                                                                     │
│  110kV: ════════════════════════════════════════════════════        │
│              │                              │                       │
│             [T1]                           [T2]                     │
│         110/15kV 16MVA                 110/15kV 16MVA               │
│              │                              │                       │
│  SN I: ══╪══╪══╪══╪══╪══╦══╪══╪══╪══╪══ :SN II                    │
│         F01 F02 F03 F04 LS F05 F06 F07 F08                         │
└─────────────────────────────────────────────────────────────────────┘
```

**Reguły rozmieszczenia pól w GPZ:**
- Pola zasilające (od transformatorów) → skrajnie lewe i prawe na sekcji
- Łącznik szynowy (LS) → zawsze środkowy między sekcjami
- Pola pomiarowe (PT, PT-1) → bezpośrednio obok zasilającego
- Pola odpływowe (F01, F02...) → sortowane numerycznie od środka na zewnątrz
- Pola rezerwowe → skrajne pozycje

**Szyna zbiorcza SN:**
- Pozioma gruba linia (strokeWidth: 6px)
- Kolor: zielony (`#22C55E`) gdy zasilona, szary (`#4B5563`) gdy odłączona
- Przerwa szynowa dla sekcjonowania (widoczna szczelina z przekładnikiem napięcia)
- Szerokość = liczba_pól × 80px + 40px margines po każdej stronie

### 3.2 Pole SN w GPZ (`SwitchgearPanel`)

Każde pole SN to pionowy ciąg aparatury od szyny w dół:

```
     [Szyna SN]
         │
    ┌─────────┐
    │  OdłSz  │  ← Odłącznik szynowy (QA1)
    └────┬────┘
         │
    ┌─────────┐
    │    W    │  ← Wyłącznik (QF1) z symbolem zabezpieczenia
    │  [ZAB]  │
    └────┬────┘
         │
    ──╥──╥──╥──   ← Przekładniki prądowe (3 fazy)
         │
    ┌─────────┐
    │  OdłK   │  ← Odłącznik kablowy / uziemnik
    └────┬────┘
         │
    ≡≡≡≡≡≡≡≡≡   ← Głowica kablowa / wyjście linii
```

**Aparatura w polu (kolejność od góry):**

| Pozycja | Aparat | Symbol IEC | Zawsze? |
|---------|--------|------------|---------|
| 1 | Odłącznik szynowy | Kąt 45° + kreseczka | Tak |
| 2 | Wyłącznik | Kwadrat z X lub prostokąt | Tak |
| 3 | Przekładnik prądowy | 3 kółka w poziomie | Tak (odpływ/zasil) |
| 4 | Odłącznik kablowy | Kąt 45° | Opcjonalnie |
| 5 | Uziemnik | Strzałka w dół + linie | Opcjonalnie |
| 6 | Głowica kablowa / linia | Trapez / cienka linia | Tak (wyjście) |

**Typ pola determinuje zawartość:**

```typescript
type PanelRole =
  | 'INCOMER'        // zasilające z transformatora
  | 'FEEDER'         // odpływowe do linii/kabla
  | 'BUS_COUPLER'    // łącznik szynowy (LS)
  | 'MEASUREMENT'    // pomiarowe (PT)
  | 'OZE_FEEDER'     // przyłączenie OZE (PV/BESS/FW)
  | 'RESERVE'        // rezerwowe (pusty panel)
```

### 3.3 Ciąg liniowy (`FeederSpine`)

Ciąg liniowy to pionowa oś od pola GPZ w dół, z węzłami rozgałęzień:

```
  GPZ F03 ──── (kabel XRUHAKXS 3×95mm²)
       │
       ●── Stacja "Zakład A" ──── (kabel XRUHAKXS 3×50mm²) ──── Stacja "Zakład B"
       │        │
       │   [Tr SN/nn]
       │   15/0.4kV, 400kVA
       │
       ●── Stacja "Osiedle" ──── ...
       │
       ▼ (NOP - Normalnie Otwarty Punkt)
```

**Reguły ciągu:**
- Pionowa linia środkowa (spine) to główna oś ciągu
- Odgałęzienia są poziome (zawsze prostopadłe do spine)
- Kabel = linia przerywana lub kolor niebieski
- Linia napowietrzna = linia ciągła lub kolor biały/szary
- Etykieta odcinka: typ_kabla + długość + przekrój

### 3.4 Stacja SN/nn (`SubstationBlock`)

Stacja transformatorowa SN/nn jako kompaktowy blok:

```
  ──────●────  (przyłącze SN, punkt na ciągu)
        │
   [Odłącznik / Wyłącznik SN]
        │
   [Przekładnik SN]
        │
   ╔══════════╗
   ║  Tr SN/nn ║  15/0.4kV, 400 kVA
   ╚═════╦════╝
         │
   ══════════════  (szyna nn)
```

**Typy stacji:**
```typescript
type SubstationType =
  | 'KIOSK'          // kontenerowa (kiosk) — blok prostokątny
  | 'POLE'           // słupowa — minimalistyczny symbol
  | 'INDOOR'         // wnętrzowa (pełne pole jak GPZ ale mniejsze)
  | 'CUSTOMER'       // odbiorcza (zasilanie klienta)
```

### 3.5 Przyłączenie OZE (`OZEConnectionBlock`)

```
  ──────●────  (punkt przyłączenia do sieci SN)
        │
   [Pole OZE w GPZ lub stacji]
        │
   [Transformator przyłączeniowy]
   0.4/15kV lub nn/SN
        │
   [Inwerter / falownik]
        │
  ┌────────────────┐
  │ FARMA PV       │  lub  BESS  lub  FW
  │ 2500 kWp       │
  └────────────────┘
```

**Strzałka kierunku przepływu mocy** (animowana lub statyczna):
- Pobór → strzałka w dół (od sieci do odbiorcy)
- Generacja → strzałka w górę (od OZE do sieci)
- Strzałka zmienia kolor: biała (normalny), żółta (generacja), czerwona (alarm)

---

## 4. GRAMATYKA WIZUALNA — STYL SCADA/CAD

### 4.1 Paleta kolorów (eTango-inspired)

```typescript
const SCADA_COLORS = {
  // Tło i siatka
  canvas:         '#0D1117',  // Tło główne (bardzo ciemne)
  grid_minor:     '#1C2333',  // Siatka drobna
  grid_major:     '#253047',  // Siatka gruba (co 5 komórek)
  panel_bg:       '#111827',  // Tło bloku stacyjnego
  panel_border:   '#1F2D45',  // Obramowanie bloku

  // Stany energetyczne (najważniejsze)
  energized:      '#22C55E',  // Zasilony — zielony (jasny)
  energized_dim:  '#16A34A',  // Zasilony — zielony (ciemny, dla linii)
  de_energized:   '#4B5563',  // Beznapięciowy — szary
  fault:          '#EF4444',  // Zwarcie / awaria — czerwony
  warning:        '#F59E0B',  // Ostrzeżenie — bursztynowy
  maintenance:    '#8B5CF6',  // Planowana praca — fioletowy

  // Aparatura — stany
  switch_closed:  '#22C55E',  // Wyłącznik zamknięty
  switch_open:    '#6B7280',  // Wyłącznik otwarty (szary)
  switch_trip:    '#EF4444',  // Wyłącznik wyzwolony (czerwony)
  switch_unknown: '#D97706',  // Stan nieznany (bursztynowy)

  // Linie
  cable:          '#60A5FA',  // Kabel podziemny — niebieski
  overhead:       '#E5E7EB',  // Linia napowietrzna — jasny szary
  nop:            '#9CA3AF',  // NOP (normalnie otwarty) — szary przerywany
  busbar_sn:      '#22C55E',  // Szyna SN zasilona
  busbar_nn:      '#FCD34D',  // Szyna nn zasilona — żółty

  // Napięcia (jako akcenty)
  wn_110kv:       '#F87171',  // 110kV — czerwonawy
  sn_15kv:        '#34D399',  // 15kV — zielonkawy
  sn_6kv:         '#A78BFA',  // 6kV — fioletowy
  nn_04kv:        '#FCD34D',  // 0,4kV — żółty
  dc:             '#818CF8',  // DC — indigo

  // Typy źródeł OZE
  pv:             '#FBBF24',  // PV — złoty
  bess:           '#34D399',  // BESS — szmaragdowy
  wind:           '#7DD3FC',  // FW — błękitny
  gen:            '#6EE7B7',  // Generator — miętowy

  // Etykiety i tekst
  label_primary:  '#F1F5F9',  // Nazwa stacji / pola
  label_secondary:'#94A3B8',  // Parametry (kV, kVA, mm²)
  label_value:    '#4ADE80',  // Wartości pomiarowe (U=, I=, P=)
  label_alarm:    '#FCA5A5',  // Wartości alarmowe

  // Akcenty UI (nie energetyczne)
  selected:       '#3B82F6',  // Wybrany element — niebieski
  hover:          '#1E40AF',  // Hover — ciemny niebieski
  highlight:      '#0EA5E9',  // Podświetlenie — błękitny
}
```

### 4.2 Grubości linii

```typescript
const STROKE = {
  busbar:       6,    // Szyna zbiorcza (dominujący element)
  feeder_cable: 2.5,  // Kabel odpływowy
  feeder_ohl:   2,    // Linia napowietrzna (cieńsza od kabla)
  symbol:       1.5,  // Obrys aparatu (wyłącznik, odłącznik)
  ct_vt:        1,    // Przekładnik (element pomocniczy)
  label_leader: 0.75, // Linia prowadząca etykiety
  grid:         0.5,  // Siatka
}
```

### 4.3 Typografia

```typescript
const FONTS = {
  // Mono — do wartości pomiarowych i identyfikatorów
  mono: '"JetBrains Mono", "Consolas", "Courier New", monospace',
  // Sans — do opisów i nazw
  sans: '"Inter", "Segoe UI", "Arial", sans-serif',
}

const FONT_SIZES = {
  station_name:  14,  // Nazwa stacji / GPZ (bold)
  panel_id:      11,  // Identyfikator pola (F01, LS...)
  apparatus_id:  9,   // Oznaczenie aparatu (QF1, QA1...)
  cable_label:   10,  // Typ kabla + długość
  measurement:   11,  // Wartość pomiarowa (U=, I=, P=)
  voltage_band:  10,  // Etykieta pasma napięcia
}
```

### 4.4 Symbole aparatury (SVG — IEC 61082)

Każdy symbol mieści się w viewBox `0 0 40 40` (lub 40 szerokość × wymagana wysokość). Styl: **monochromatyczny + stan przez kolor**.

```
Wyłącznik (circuit_breaker):
  - ZAMKNIĘTY: wypełniony kwadrat lub prostokąt 20×20, kolor: switch_closed
  - OTWARTY: pusty kwadrat z przerwą na pionowej osi, kolor: switch_open
  - WYZWOLONY: czerwony kwadrat z X
  - Zawsze: mały symbol zabezpieczenia po prawej stronie (miniaturowy trójkąt)

Odłącznik (disconnector):
  - ZAMKNIĘTY: pozioma kreska + pionowa kreska (zwarte)
  - OTWARTY: pozioma kreska + ukośna kreska 45° (rozwarty)
  - Szerokość zacisku: 8px po obu stronach

Uziemnik (earthing_switch):
  - Odłącznik z strzałką w dół do linii GND (3 poziome kreski malejące)

Przekładnik prądowy (CT):
  - Pionowy prostokąt 8×20 z kółkiem pośrodku (rdzeń)
  - 3 symbole w jednej linii poziomej (3-fazowe)
  - Opcjonalnie: wskazanie klasy i przekładni

Przekładnik napięcia (VT):
  - Kółko 16×16 z symbolem napięcia wewnątrz

Transformator 2-uzwojeniowy (transformer_2w):
  - Dwa kółka o ø20 dotykające się pionowo
  - Górne kółko: kolor WN (110kV)
  - Dolne kółko: kolor SN
  - Etykieta: "moc / przekładnia" po prawej

Transformator SN/nn (transformer_snn):
  - Identyczny jak 2w ale kolory SN/nn

Głowica kablowa (cable_head):
  - Trapez skierowany ku górze (zbliżenie końca kabla)
  - Kolor kabla (niebieski)

Linia napowietrzna (segment):
  - Linia ciągła, ewentualnie symbol słupa w połowie (trójkąt)

Kabel podziemny (segment):
  - Linia przerywana (dash 8 4) lub identyczna ciągła w kolorze niebieskim

Generator PV:
  - Panel słoneczny: siatka 3×3 komórek, kolor złoty

Generator BESS:
  - Akumulator: prostokąt z plusem i minusem, kolor szmaragdowy

Turbina wiatrowa (FW):
  - Koło z 3 łopatkami, kolor błękitny
```

### 4.5 Siatka i snap

```typescript
const GRID = {
  base:     20,   // px — wszystko na wielokrotności 20
  major:    100,  // px — linia gruba co 5 komórek siatki
}

// Spacing
const LAYOUT = {
  panel_width:      80,   // Szerokość pola SN w GPZ [px]
  panel_height:    220,   // Wysokość pola SN [px]
  busbar_y_gpz:    120,   // Y szyny GPZ od góry bloku
  apparatus_gap:    20,   // Odstęp między aparatami w polu [px]
  spine_x_offset:   40,   // X osi ciągu od krawędzi pola
  substation_step: 160,   // Krok między stacjami na ciągu [px]
  substation_w:    120,   // Szerokość bloku stacji SN/nn
  substation_h:    140,   // Wysokość bloku stacji SN/nn
  oze_block_w:     100,   // Szerokość bloku OZE
  oze_block_h:     80,    // Wysokość bloku OZE
  margin_h:         40,   // Margines poziomy canvas
  margin_v:         60,   // Margines pionowy canvas
}
```

---

## 5. ARCHITEKTURA RENDERINGU — KOMPONENTY

### 5.1 Struktura komponentów (nowa)

```
<SLDCanvasV2>                          ← główny kontener SVG
  <GridLayer />                         ← siatka tła
  <GPZBlock station={...} />            ← blok GPZ (jeden lub kilka)
    <GPZHeader />                       ← nazwa, napięcia, moc
    <BusSection voltage="110kV" />      ← szyna WN (opcjonalna)
    <TransformerSymbol />               ← transformatory T1, T2...
    <BusSection voltage="SN" id="I" />  ← szyna SN sekcja I
    <BusCoupler />                      ← łącznik szynowy LS
    <BusSection voltage="SN" id="II"/>  ← szyna SN sekcja II
    {panels.map(p => <SwitchgearPanel panel={p} />)}
  </GPZBlock>
  {feeders.map(f =>
    <FeederSpine feeder={f}>            ← ciąg liniowy
      {f.nodes.map(n =>
        n.type === 'SUBSTATION'
          ? <SubstationBlock node={n} />
          : n.type === 'OZE'
          ? <OZEConnectionBlock node={n} />
          : <JunctionDot node={n} />
      )}
    </FeederSpine>
  )}
  <MeasurementOverlay />                ← wartości pomiarowe (opcjonalny layer)
  <SelectionOverlay />                  ← podświetlenie wybranego elementu
  <InteractionLayer />                  ← obsługa kliknięć / hover
</SLDCanvasV2>
```

### 5.2 `SwitchgearPanel` — logika renderowania pola SN

```typescript
interface SwitchgearPanelProps {
  panel: {
    id: string;            // "F01", "LS", "PT-1"
    role: PanelRole;
    label: string;         // "ZAKŁAD A" lub "ODPŁYW 1"
    apparatus: Apparatus[];// lista aparatów od góry
    feederRef?: string;    // ID ciągu liniowego (dla pól odpływowych)
    state: PanelState;     // energized / de_energized / fault
  };
  x: number;               // pozycja X (wynik layoutu)
  busY: number;            // Y szyny (od góry bloku GPZ)
}

// Renderowanie pionowe aparatury:
// Każdy aparat ma stały wymiar i port top/bottom
// Połączenia między aparatami = pionowe linie
// Całkowita wysokość pola = suma wysokości aparatów + gaps

type Apparatus = {
  id: string;              // "QA1", "QF1", "TA1..."
  type: ApparatusType;
  state: SwitchState | null;
  measurements?: MeasurementSet;
}

type ApparatusType =
  | 'DISCONNECTOR_BUS'     // odłącznik szynowy
  | 'BREAKER'              // wyłącznik
  | 'DISCONNECTOR_CABLE'   // odłącznik kablowy
  | 'EARTHING_SWITCH'      // uziemnik
  | 'CT'                   // przekładnik prądowy
  | 'VT'                   // przekładnik napięcia
  | 'FUSE'                 // bezpiecznik
  | 'CABLE_HEAD'           // głowica kablowa
  | 'RELAY'                // zabezpieczenie (ikona obok WYŁ)
```

### 5.3 `FeederSpine` — ciąg liniowy

```typescript
interface FeederSpineProps {
  feeder: {
    id: string;
    sourcePanel: { gpzId: string; panelId: string; };
    topology: FeederNode[];  // uproszczony ciąg węzłów
    segments: LineSegment[]; // odcinki między węzłami
  };
  startX: number;   // X = środek pola GPZ (parent)
  startY: number;   // Y = dół bloku GPZ
}

type FeederNode =
  | { type: 'SUBSTATION'; data: SubstationData; }
  | { type: 'JUNCTION'; id: string; }   // punkt rozgałęzienia (T-junction)
  | { type: 'OZE'; data: OZEData; }
  | { type: 'NOP'; id: string; }        // NOP — otwarty punkt pierścienia

type LineSegment = {
  from: string;       // ID węzła
  to: string;         // ID węzła
  cableType: string;  // "XRUHAKXS", "AFL", itp.
  crossSection: number; // mm²
  length: number;     // m
  branchType: 'CABLE' | 'OVERHEAD';
  state: 'ENERGIZED' | 'DE_ENERGIZED' | 'FAULT';
}
```

### 5.4 `OZEConnectionBlock`

```typescript
interface OZEConnectionBlockProps {
  oze: {
    id: string;
    type: 'PV' | 'BESS' | 'WIND' | 'GENERATOR';
    label: string;             // "Farma PV Słoneczna"
    capacityKW: number;        // 2500 kW
    connectionVoltageKV: number; // napięcie przyłączenia
    inverterCount?: number;    // liczba inwerterów (dla PV)
    state: 'GENERATING' | 'STANDBY' | 'FAULT' | 'DISCONNECTED';
    measurements?: {
      powerKW: number;
      currentA: number;
      voltageKV: number;
    };
  };
  // pozycja ustalana przez FeederSpine
}
```

---

## 6. ALGORYTM LAYOUTU — DOMENOWY (nie generyczny)

### 6.1 Wejście

```typescript
interface SLDLayoutInput {
  stations: StationData[];   // GPZ + stacje SN/nn
  feeders: FeederData[];     // ciągi liniowe
  ozeConnections: OZEData[]; // przyłączenia OZE
  config: LayoutConfig;
}
```

### 6.2 Kolejność budowania (5 deterministycznych kroków)

**Krok 1: Budowa bloku GPZ**
```
1. Posortuj sekcje SN po numerze (I, II, III)
2. Dla każdej sekcji ustal kolejność pól:
   - INCOMER first (zasilające)
   - MEASUREMENT next (pomiarowe)  
   - FEEDER middle (odpływowe — wg numeru)
   - OZE_FEEDER middle (przyłączenia OZE)
   - BUS_COUPLER between sections (łącznik)
   - RESERVE last (rezerwowe)
3. Oblicz szerokość GPZ:
   gpz_width = suma pól × panel_width + margins
4. Oblicz pozycje X każdego pola:
   x_panel[i] = margin_h + i * panel_width
5. Stała wysokość GPZ = busbar_y_gpz + panel_height + apparatus_gap_bottom
```

**Krok 2: Budowa osi ciągów**
```
1. Dla każdego pola odpływowego (FEEDER) w GPZ:
   - Oś ciągu X = x_panel[i] + panel_width/2 (środek pola)
   - Oś ciągu Y_start = y_gpz_bottom + 20
2. Ciąg to pionowa linia w dół od Y_start
3. Długość osi = liczba_węzłów × substation_step
```

**Krok 3: Rozmieszczenie węzłów na ciągu**
```
Dla każdego węzła (stacja, rozgałęzienie, OZE) na ciągu:
  y_node[i] = y_start + (i+1) * substation_step

Stacja na ciągu:
  - centrum stacji (transformator) = (x_spine, y_node[i])
  - połączenie kablowe = pionowa linia segment od poprzedniego węzła

Rozgałęzienie T (junction):
  - dot na osi spine
  - odgałęzienie poziome (90°) do kolejnego ciągu bocznego
  - ciąg boczny rysowany rekurencyjnie (prawa strona)

OZE:
  - blok OZE = po lewej lub prawej stronie spine (naprzemiennie)
  - połączenie poziome od spine do bloku OZE
```

**Krok 4: Rozwiązanie pierścieni (ring feeders)**
```
Jeśli ciąg ma NOP (normalnie otwarty punkt):
  - Ciąg wraca do innego pola GPZ (lub tej samej sekcji)
  - NOP rysowany jako punkt z symbolem rozwarcia
  - Linia pierścienia rysowana jako pętla pod ostatnią stacją
  - Strzałka kierunku: normalny → od lewego GPZ
```

**Krok 5: Dopasowanie canvas**
```
canvas_width  = max(gpz_width, suma_ciągów × min_spacing) + 2×margin_h
canvas_height = y_gpz_bottom + max_feeder_depth + margin_v
```

### 6.3 Gwarancja determinizmu

- Wszystkie listy sortowane po `id` jako klucz determinizmu
- Brak losowości — żadnych `Math.random()`
- Snap do siatki 20px (round to nearest)
- Testy deterministyczne: ten sam snapshot → identyczny JSON layoutu

---

## 7. OVERLAY POMIAROWY

Warstwa odczytu telemetrycznego nakładana na schemat:

```typescript
interface MeasurementPoint {
  elementId: string;    // ID elementu w sieci
  position: 'above' | 'right' | 'left' | 'below'; // pozycja etykiety
  values: {
    U_kV?: number;      // napięcie
    I_A?: number;       // prąd
    P_kW?: number;      // moc czynna
    Q_kVAr?: number;    // moc bierna
    cos_phi?: number;   // współczynnik mocy
  };
  quality: 'GOOD' | 'SUSPECT' | 'STALE' | 'MISSING';
  alarm?: 'OVER_CURRENT' | 'OVER_VOLTAGE' | 'UNDER_VOLTAGE';
}
```

**Renderowanie wartości:**
- Format: `U=15,2 kV` | `I=125 A` | `P=2,3 MW`
- Font: monospace 11px, kolor: `#4ADE80` (zielony jasny)
- Tło etykiety: `rgba(0,0,0,0.7)` z border-radius 3px
- Alarm: kolor `#FCA5A5`, miganie 1Hz
- Brak danych: `—` w kolorze szarym

---

## 8. INTERAKCJA

### 8.1 Tryby

```typescript
type SLDInteractionMode =
  | 'VIEW'        // tylko odczyt — zoom/pan
  | 'SELECT'      // kliknięcie → inspekcja elementu
  | 'EDIT_TOPO'   // edycja topologii (przesuwanie stacji)
  | 'EDIT_STATE'  // zmiana stanów łączników
  | 'ANNOTATE'    // dodawanie adnotacji
```

### 8.2 Hover i selection

- Hover na element → podświetlenie niebieskie outline (2px, `#3B82F6`)
- Hover na szynę → podświetlenie całej sekcji + pól połączonych
- Kliknięcie → `onElementSelected(elementId, elementType)` → PropertyGrid po prawej
- Double-click na stację → rozwinięcie szczegółów pola

### 8.3 Zoom/Pan

- Zoom: kółko myszy (min: 0.2×, max: 5×)
- Pan: środkowy przycisk lub spacja + drag
- Fit-to-screen: przycisk `⛶` lub klawisz `F`
- Zoom to selection: `Z`

---

## 9. PLAN IMPLEMENTACJI (kolejność)

### Faza A — Fundament (2-3 dni)

```
1. Nowy token stylów: src/ui/sld/scadaTokens.ts
   - SCADA_COLORS, STROKE, FONTS, FONT_SIZES, LAYOUT
   - Wyeksportuj jako frozen const

2. Nowe typy domenowe: src/ui/sld/sldDomainTypes.ts
   - PanelRole, ApparatusType, FeederNode, SubstationType
   - OZEConnectionBlockProps, SwitchgearPanelProps

3. Nowy adapter topologii: src/ui/sld/topology/topologyToDomain.ts
   - Snapshot → SLDLayoutInput
   - Mapowanie elementów sieci na pola, ciągi, stacje

4. Nowy algorytm layoutu: src/engine/sld-layout-v2/
   - step1-gpz-layout.ts  (budowa bloku GPZ)
   - step2-feeder-axes.ts  (osie ciągów)
   - step3-node-placement.ts (węzły na ciągach)
   - step4-ring-resolution.ts (pierścienie / NOP)
   - step5-canvas-fit.ts  (dopasowanie canvas)
   - index.ts  (orchestrator)
```

### Faza B — Komponenty SVG (3-4 dni)

```
5. src/ui/sld-v2/symbols/
   - CircuitBreaker.tsx    (wyłącznik, stany: CLOSED/OPEN/TRIP)
   - Disconnector.tsx      (odłącznik, stany: CLOSED/OPEN)
   - EarthingSwitch.tsx    (uziemnik)
   - CurrentTransformer.tsx (przekładnik prądowy, 3-fazowy)
   - VoltageTransformer.tsx (przekładnik napięcia)
   - TransformerSymbol.tsx  (transformator 2-uzwojeniowy)
   - CableHead.tsx          (głowica kablowa)
   - RelayIcon.tsx          (ikona zabezpieczenia obok WYŁ)

6. src/ui/sld-v2/blocks/
   - SwitchgearPanel.tsx   (pełne pole SN)
   - BusSection.tsx        (szyna zbiorcza z sekcjonowaniem)
   - BusCoupler.tsx        (łącznik szynowy)
   - GPZBlock.tsx          (cały GPZ z polami)
   - SubstationBlock.tsx   (stacja SN/nn)
   - OZEConnectionBlock.tsx (przyłączenie OZE)
   - JunctionDot.tsx       (punkt rozgałęzienia, IEC 61082)

7. src/ui/sld-v2/layers/
   - GridLayer.tsx          (siatka tła)
   - FeederSpine.tsx        (ciąg liniowy z węzłami)
   - LineSegment.tsx        (odcinek kabla/linii z etykietą)
   - MeasurementOverlay.tsx (warstwa pomiarowa)
   - SelectionOverlay.tsx   (podświetlenie)
```

### Faza C — Integracja (2 dni)

```
8. src/ui/sld-v2/SLDCanvasV2.tsx
   - Główny komponent SVG
   - Kompozycja warstw
   - Obsługa zoom/pan
   - Dispatch interakcji

9. Podpięcie do istniejącego store:
   - Odczyt snapshotu sieci
   - Odczyt stanów łączników (live state)
   - Emit selection event

10. Testy deterministyczne:
    - snapshot X → identyczny LayoutResult (JSON)
    - każdy symbol ma snapshottowy output SVG
    - pierścień wykryty → NOP narysowany poprawnie
```

### Faza D — Dopracowanie (1-2 dni)

```
11. Measurement overlay — mock dane telemtryczne
12. Responsywność (fit-to-window przy resize)
13. Export PNG / SVG (dla dokumentacji)
14. Dark mode ↔ Light mode toggle (SCADA dark vs Print light)
```

---

## 10. WYMAGANIA NIEFUNKCJONALNE

| Wymaganie | Wartość |
|-----------|---------|
| Determinizm | Ten sam snapshot → identyczny SVG (bit-for-bit dla koordynat) |
| Wydajność | ≤ 100ms dla sieci 50-węzłowej na CPU mobile |
| Skalowalność | Działa dla GPZ 24-polowego + 8 ciągów + 30 stacji |
| Zoom range | 0.2× do 5× bez degradacji czytelności |
| Czytelność | Pola czytelne w zoom 0.5× (bez etykiet aparatury) |
| Eksport | PNG 2x (DPI 150+) dla dokumentacji |
| Dostępność | Schemat ma role="img" + aria-label (dla PDF) |

---

## 11. METRYKI SUKCESU

Schemat jest gotowy gdy inżynier patrząc na niego:
1. **W 2 sekundy** identyfikuje: które pole GPZ zasila który ciąg
2. **W 5 sekund** widzi: czy sieć pracuje w układzie normalnym czy awaryjnym
3. **W 10 sekund** czyta: ile stacji jest na ciągu, jakie kable, gdzie jest NOP
4. **Na wydruku A3** schemat jest czytelny bez lupy

---

## 12. UWAGI IMPLEMENTACYJNE

1. **Nie używaj automatycznego layoutu** dla GPZ — pola mają deterministyczną kolejność
2. **Stacja zawsze pod swoim ciągiem** — nigdy "floating" poza polem GPZ
3. **Łącznik szynowy (LS) jest zawsze pionowy** między sekcjami (nie na końcu szyny)
4. **NOP jest zawsze w połowie pierścienia** — renderuj symetrycznie
5. **Szyna zbiorcza jest linią** — nie prostokątem, nie blokiem
6. **OZE rysuj po lewej stronie ciągu** (konwencja: generacja=lewo, obciążenie=prawo)
7. **Pomiary pokazuj tylko gdy dostępne** — brak danych ≠ wartość 0
8. **State coloring jest nadrzędny** — kolor aparatu wynika WYŁĄCZNIE ze stanu, nie z typu

---

*Koniec specyfikacji. Implementacja powinna zacząć się od Fazy A, każdy etap z testami jednostkowymi przed przejściem do następnego.*

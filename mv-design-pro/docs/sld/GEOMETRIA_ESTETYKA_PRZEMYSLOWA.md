# SLD GEOMETRIA — ESTETYKA PRZEMYSŁOWA

> Dokument wiążący: zasady layoutu SLD wzorowane na DIgSILENT/ABB.
> Patrz też: `SLD_ALGORITHM_LAYOUT_SPEC.md` (algorytm layoutu).

## 1. ZASADY NADRZĘDNE

1. **Deterministyczny**: ten sam Snapshot → identyczny układ (SHA-256 hash)
2. **Niezależny od permutacji**: kolejność list wejściowych nie wpływa na wynik
3. **Bez mutacji domeny**: geometria NIE zmienia Snapshot
4. **Overlay wyników**: NIE zmienia pozycji elementów (tylko kolory/wartości)

## 2. PIPELINE LAYOUTU (6 FAZ)

| Faza | Cel | Kluczowe parametry |
|------|-----|-------------------|
| 1 | Umieszczenie magistrali (trunk) | spineX, layerSpacing |
| 2 | Detekcja bloków stacyjnych | stationMinWidth, stationPadding |
| 3 | Osadzenie geometrii wewnętrznej | blockMargin, feederSlotSpacing |
| 4 | Umieszczenie odgałęzień w pasmach | bandSpacing, bayGap |
| 5 | Routing Manhattan + etykiety | secondaryLanePitch |
| 6 | Inwarianty + hash finalny | gridStep (snap-to-grid) |

## 3. KONFIGURACJA LAYOUTU V1

### Pipeline Core (layoutPipeline.ts)
```
gridStep:           20 px    — siatka snap-to-grid
layerSpacing:      120 px    — odległość pionowa między warstwami
bandSpacing:        80 px    — odległość pozioma między pasmami odgałęzień
defaultBusWidth:   400 px    — domyślna szerokość szyny
busHeight:          10 px    — grubość szyny
feederSlotSpacing:  80 px    — odległość między slotami odpływów
blockMargin:        20 px    — margines bloku rozdzielni
spineX:            500 px    — oś główna X (magistrala)
```

### Pipeline Engine (types.ts)
```
busbarMinWidth:    400 px    — minimalna szerokość szyny
busbarExtendPerBay: 120 px  — rozszerzenie na każdy bay
busbarHeight:        8 px    — grubość szyny
bayGap:            160 px    — przerwa między polami
elementGapY:       100 px    — odległość pionowa elementów w polu
canvasPadding:      80 px    — padding od krawędzi
```

### Stacje
```
stationPadding:     40 px    — margines wokół elementów stacji
stationMinWidth:   200 px    — minimalna szerokość bounding box
stationMinHeight:  160 px    — minimalna wysokość bounding box
```

### Kolory stacji
```
GPZ:          border #dc2626 (czerwony), fill rgba(220,38,38,0.06)
SN/nN:        border #2563eb (niebieski), fill rgba(37,99,235,0.06)
Sekcjonowanie: border #d97706 (pomarańczowy), fill rgba(217,119,6,0.06)
Odbiorca:     border #059669 (zielony), fill rgba(5,150,105,0.06)
```

### Kolory napięć (dynamiczne zakresy)
```
220+ kV:   #CC0000 (NN)
60-200 kV: #CC3333 (WN)
16-60 kV:  #9933CC (SN)
1-16 kV:   #00AACC (SN)
0.1-1 kV:  #FF8800 (nN)
0-0.1 kV:  #3366FF (DC)
```

## 4. REGUŁY ESTETYKI PRZEMYSŁOWEJ

1. **Wyrównanie do siatki**: wszystkie pozycje snap do `gridStep`
2. **Symetria magistrali**: trunk na stałej osi `spineX`
3. **Równe odległości stacji**: wynikają z `bayGap` (160 px)
4. **Pionowe wyrównanie pól**: elementy w bay'u na jednej osi X
5. **Routing Manhattan**: tylko kąty 90° (brak skośnych linii)
6. **Kolizje**: deterministyczny push-away (PUSH_AWAY_STEP_X = 40 px)
7. **Pasma napięciowe**: dynamicznie obliczane z modelu (nie hardcoded)

## 5. PRESETY

| Preset | Styl | Użycie |
|--------|------|--------|
| DEFAULT | Standardowy (jak wyżej) | Domyślny dla V1 |
| benchmark_STYLE_COLORS | Kolory benchmark | Kompatybilność z benchmark |
| CANONICAL_STYLE_COLORS | Kolory benchmark | Kompatybilność z DIgSILENT |
| MONOCHROME_COLORS | Monochromatyczny | Wydruk |

## 6. TESTY DETERMINIZMU SLD

| Test | Plik | Co weryfikuje |
|------|------|---------------|
| VisualGraph | `sld/core/__tests__/visualGraph.test.ts` | Budowa grafu wizualnego |
| Determinizm | `sld/core/__tests__/determinism.test.ts` | Bit-for-bit stabilność |
| LayoutPipeline | `sld/core/__tests__/layoutPipeline.test.ts` | 6 faz pipeline |
| TopologyAdapter | `sld/core/__tests__/topologyAdapterV2.test.ts` | ENM→SLD mapping |
| SwitchgearConfig | `sld/core/__tests__/switchgearConfig.test.ts` | Konfiguracja rozdzielni |
| Hash parity | `sld/core/__tests__/switchgearConfig.hashParity.test.ts` | Stabilność hash |


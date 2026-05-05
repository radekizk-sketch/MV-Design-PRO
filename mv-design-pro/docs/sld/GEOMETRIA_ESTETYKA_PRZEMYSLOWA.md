# SLD GEOMETRIA — ESTETYKA PRZEMYSĹOWA

> Dokument wiąĹĽący: zasady layoutu SLD wzorowane na DIgSILENT/ABB.
> Patrz teĹĽ: `SLD_ALGORITHM_LAYOUT_SPEC.md` (algorytm layoutu).

## 1. ZASADY NADRZÄDNE

1. **Deterministyczny**: ten sam Snapshot → identyczny ukĹ‚ad (SHA-256 hash)
2. **NiezaleĹĽny od permutacji**: kolejnoĹ›ć list wejĹ›ciowych nie wpĹ‚ywa na wynik
3. **Bez mutacji domeny**: geometria NIE zmienia Snapshot
4. **Overlay wynikĂłw**: NIE zmienia pozycji elementĂłw (tylko kolory/wartoĹ›ci)

## 2. PIPELINE LAYOUTU (6 FAZ)

| Faza | Cel | Kluczowe parametry |
|------|-----|-------------------|
| 1 | Umieszczenie magistrali (trunk) | spineX, layerSpacing |
| 2 | Detekcja blokĂłw stacyjnych | stationMinWidth, stationPadding |
| 3 | Osadzenie geometrii wewnętrznej | blockMargin, feederSlotSpacing |
| 4 | Umieszczenie odgaĹ‚ęzieĹ„ w pasmach | bandSpacing, bayGap |
| 5 | Routing Manhattan + etykiety | secondaryLanePitch |
| 6 | Inwarianty + hash finalny | gridStep (snap-to-grid) |

## 3. KONFIGURACJA LAYOUTU V1

### Pipeline Core (layoutPipeline.ts)
```
gridStep:           20 px    — siatka snap-to-grid
layerSpacing:      120 px    — odlegĹ‚oĹ›ć pionowa między warstwami
bandSpacing:        80 px    — odlegĹ‚oĹ›ć pozioma między pasmami odgaĹ‚ęzieĹ„
defaultBusWidth:   400 px    — domyĹ›lna szerokoĹ›ć szyny
busHeight:          10 px    — gruboĹ›ć szyny
feederSlotSpacing:  80 px    — odlegĹ‚oĹ›ć między slotami odpĹ‚ywĂłw
blockMargin:        20 px    — margines bloku rozdzielni
spineX:            500 px    — oĹ› gĹ‚Ăłwna X (magistrala)
```

### Pipeline Engine (types.ts)
```
busbarMinWidth:    400 px    — minimalna szerokoĹ›ć szyny
busbarExtendPerBay: 120 px  — rozszerzenie na kaĹĽdy bay
busbarHeight:        8 px    — gruboĹ›ć szyny
bayGap:            160 px    — przerwa między polami
elementGapY:       100 px    — odlegĹ‚oĹ›ć pionowa elementĂłw w polu
canvasPadding:      80 px    — padding od krawędzi
```

### Stacje
```
stationPadding:     40 px    — margines wokĂłĹ‚ elementĂłw stacji
stationMinWidth:   200 px    — minimalna szerokoĹ›ć bounding box
stationMinHeight:  160 px    — minimalna wysokoĹ›ć bounding box
```

### Kolory stacji
```
GPZ:          border #dc2626 (czerwony), fill rgba(220,38,38,0.06)
SN/nN:        border #2563eb (niebieski), fill rgba(37,99,235,0.06)
Sekcjonowanie: border #d97706 (pomaraĹ„czowy), fill rgba(217,119,6,0.06)
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

## 4. REGUĹY ESTETYKI PRZEMYSĹOWEJ

1. **WyrĂłwnanie do siatki**: wszystkie pozycje snap do `gridStep`
2. **Symetria magistrali**: trunk na staĹ‚ej osi `spineX`
3. **RĂłwne odlegĹ‚oĹ›ci stacji**: wynikają z `bayGap` (160 px)
4. **Pionowe wyrĂłwnanie pĂłl**: elementy w bay'u na jednej osi X
5. **Routing Manhattan**: tylko kąty 90° (brak skoĹ›nych linii)
6. **Kolizje**: deterministyczny push-away (PUSH_AWAY_STEP_X = 40 px)
7. **Pasma napięciowe**: dynamicznie obliczane z modelu (nie hardcoded)

## 5. PRESETY

| Preset | Styl | UĹĽycie |
|--------|------|--------|
| DEFAULT | Standardowy (jak wyĹĽej) | DomyĹ›lny dla V1 |
| benchmark_STYLE_COLORS | Kolory benchmark | KompatybilnoĹ›ć z benchmark |
| CANONICAL_STYLE_COLORS | Kolory benchmark | KompatybilnoĹ›ć z DIgSILENT |
| MONOCHROME_COLORS | Monochromatyczny | Wydruk |

## 6. TESTY DETERMINIZMU SLD

| Test | Plik | Co weryfikuje |
|------|------|---------------|
| VisualGraph | `sld/core/__tests__/visualGraph.test.ts` | Budowa grafu wizualnego |
| Determinizm | `sld/core/__tests__/determinism.test.ts` | Bit-for-bit stabilnoĹ›ć |
| LayoutPipeline | `sld/core/__tests__/layoutPipeline.test.ts` | 6 faz pipeline |
| TopologyAdapter | `sld/core/__tests__/topologyAdapterV2.test.ts` | ENM→SLD mapping |
| SwitchgearConfig | `sld/core/__tests__/switchgearConfig.test.ts` | Konfiguracja rozdzielni |
| Hash parity | `sld/core/__tests__/switchgearConfig.hashParity.test.ts` | StabilnoĹ›ć hash |


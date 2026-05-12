# CANONICAL Symbol Library v1

Biblioteka symboli SLD z pełną parytetą geometrii CANONICAL.

## Specyfikacja techniczna

| Parametr | Wartość |
|----------|---------|
| viewBox | `0 0 100 100` (wszystkie symbole) |
| stroke-width | `3` (linie główne), `2` (detale), `1.5` (siatki) |
| Kolor bazowy | `#000000` (czarny) |
| Format | SVG 1.1 |
| Elementy | `path`, `line`, `circle`, `rect` tylko |

## Katalog symboli

### Szyny i połączenia

| symbol_id | nazwa_PL | porty | dozwolone rotacje | styl linii | uwagi CANONICAL-parity |
|-----------|----------|-------|-------------------|------------|-------------------|
| `busbar` | Szyna zbiorcza | left (0,50), right (100,50) | 0°, 90° | ciągła | Poziomy gruby prostokąt |
| `line_overhead` | Linia napowietrzna | left (0,50), right (100,50) | 0°, 90° | **ciągła** | Pojedyncza linia ciągła |
| `line_cable` | Linia kablowa | left (0,50), right (100,50) | 0°, 90° | **przerywana** (8,4) | Linia kreskowana |

### Aparatura łączeniowa

| symbol_id | nazwa_PL | porty | dozwolone rotacje | styl linii | uwagi CANONICAL-parity |
|-----------|----------|-------|-------------------|------------|-------------------|
| `circuit_breaker` | Wyłącznik | top (50,0), bottom (50,100) | 0°, 90°, 180°, 270° | ciągła | Kwadrat z X (stan otwarty) |
| `disconnector` | Rozłącznik | top (50,0), bottom (50,100) | 0°, 90°, 180°, 270° | ciągła | Dwa zaciski z otwartym ostrzem |

### Transformatory

| symbol_id | nazwa_PL | porty | dozwolone rotacje | styl linii | uwagi CANONICAL-parity |
|-----------|----------|-------|-------------------|------------|-------------------|
| `transformer_2w` | Transformator 2-uzwojeniowy | top (50,0), bottom (50,100) | 0°, 90°, 180°, 270° | ciągła | Dwa zachodzące okręgi |
| `transformer_3w` | Transformator 3-uzwojeniowy | top (50,0), left (0,62), right (100,62) | 0° | ciągła | Trzy okręgi w układzie Y |

### Źródła i zasobniki energii

| symbol_id | nazwa_PL | porty | dozwolone rotacje | styl linii | uwagi CANONICAL-parity |
|-----------|----------|-------|-------------------|------------|-------------------|
| `generator` | Generator synchroniczny | bottom (50,100) | 0°, 90°, 180°, 270° | ciągła | Okrąg z literą G |
| `pv` | Fotowoltaika | bottom (50,100) | 0° | ciągła | Prostokąt z siatką panelu + strzałka słońca |
| `fw` | Farma wiatrowa | bottom (50,100) | 0° | ciągła | Okrąg z trzema łopatami turbiny |
| `bess` | Magazyn energii (BESS) | bottom (50,100) | 0°, 180° | ciągła | Prostokąt baterii z +/- |
| `utility_feeder` | Zasilanie z sieci | bottom (50,100) | 0° | ciągła | Trzy linie ze strzałkami w dół |

### Uziemienie i przekładniki

| symbol_id | nazwa_PL | porty | dozwolone rotacje | styl linii | uwagi CANONICAL-parity |
|-----------|----------|-------|-------------------|------------|-------------------|
| `ground` | Uziemienie | top (50,0) | 0° | ciągła | Malejące linie poziome |
| `ct` | Przekładnik prądowy | left (0,50), right (100,50) | 0°, 90° | ciągła | Okrąg z linią przelotową |
| `vt` | Przekładnik napięciowy | left (0,50), right (100,50) | 0°, 90° | ciągła | Dwa okręgi (uzwojenia) |

## Reguły rotacji portów

Przy rotacji symbolu porty transformują się zgodnie z regułami:

| Rotacja | Transformacja współrzędnych | Mapowanie portów |
|---------|----------------------------|------------------|
| 90° | `x' = 100 - y, y' = x` | top→right, right→bottom, bottom→left, left→top |
| 180° | `x' = 100 - x, y' = 100 - y` | top↔bottom, left↔right |
| 270° | `x' = y, y' = 100 - x` | top→left, right→top, bottom→right, left→bottom |

## Rozróżnienie linii napowietrznej vs kablowej

```
line_overhead.svg  →  stroke-dasharray: none      (CIĄGŁA)
line_cable.svg     →  stroke-dasharray: 8,4       (PRZERYWANA)
```

To rozróżnienie jest **BINDING** i wynika z normy IEC 60617.

## Rozróżnienie źródeł energii

Każde źródło ma **odrębny symbol** (zgodnie z wymaganiami CANONICAL-parity):

| Typ | Symbol | Charakterystyka wizualna |
|-----|--------|--------------------------|
| Generator | `generator.svg` | Okrąg + litera "G" |
| Fotowoltaika | `pv.svg` | Panel słoneczny + strzałka słońca |
| Farma wiatrowa | `fw.svg` | Turbina z 3 łopatami |
| Magazyn energii | `bess.svg` | Bateria z +/- |

**ZAKAZ:** Nie wolno zastępować PV/FW/BESS symbolem generatora z etykietą.

## Struktura plików

```
canonical_symbols/
├── README.md           # Ten plik
├── ports.json          # Definicje portów dla wszystkich symboli
├── busbar.svg
├── circuit_breaker.svg
├── disconnector.svg
├── line_overhead.svg   # Linia ciągła
├── line_cable.svg      # Linia przerywana
├── transformer_2w.svg
├── transformer_3w.svg
├── generator.svg
├── pv.svg              # Osobny symbol PV
├── fw.svg              # Osobny symbol FW
├── bess.svg            # Osobny symbol BESS
├── utility_feeder.svg
├── ground.svg
├── ct.svg
└── vt.svg
```

## Użycie w kodzie

```typescript
// Przykład ładowania symbolu
import busbarSvg from './canonical_symbols/busbar.svg';
import portsData from './canonical_symbols/ports.json';

const busbarPorts = portsData.symbols.busbar.ports;
// { left: { x: 0, y: 50 }, right: { x: 100, y: 50 } }
```

## Status symboli

| Symbol | Status | Uwagi |
|--------|--------|-------|
| busbar | ✅ READY | |
| circuit_breaker | ✅ READY | |
| disconnector | ✅ READY | |
| line_overhead | ✅ READY | Linia ciągła |
| line_cable | ✅ READY | Linia przerywana |
| transformer_2w | ✅ READY | |
| transformer_3w | ✅ READY | |
| generator | ✅ READY | |
| pv | ✅ READY | Osobny symbol |
| fw | ✅ READY | Osobny symbol |
| bess | ✅ READY | Osobny symbol |
| utility_feeder | ✅ READY | |
| ground | ✅ READY | |
| ct | ✅ READY | |
| vt | ✅ READY | |

## Wersja

- **v1.0.0** - Initial release z 15 symbolami CANONICAL-parity

## Zgodność

- SVG 1.1
- Brak zewnętrznych zależności CSS
- Brak fontów (wszystkie znaki jako ścieżki)
- Kompatybilność z rotacjami 0°/90°/180°/270°


# CANONICAL Symbol Library v1

Biblioteka symboli SLD z peĹ‚nÄ… parytetÄ… geometrii CANONICAL.

## Specyfikacja techniczna

| Parametr | WartoĹ›Ä‡ |
|----------|---------|
| viewBox | `0 0 100 100` (wszystkie symbole) |
| stroke-width | `3` (linie gĹ‚Ăłwne), `2` (detale), `1.5` (siatki) |
| Kolor bazowy | `#000000` (czarny) |
| Format | SVG 1.1 |
| Elementy | `path`, `line`, `circle`, `rect` tylko |

## Katalog symboli

### Szyny i poĹ‚Ä…czenia

| symbol_id | nazwa_PL | porty | dozwolone rotacje | styl linii | uwagi CANONICAL-parity |
|-----------|----------|-------|-------------------|------------|-------------------|
| `busbar` | Szyna zbiorcza | left (0,50), right (100,50) | 0Â°, 90Â° | ciÄ…gĹ‚a | Poziomy gruby prostokÄ…t |
| `line_overhead` | Linia napowietrzna | left (0,50), right (100,50) | 0Â°, 90Â° | **ciÄ…gĹ‚a** | Pojedyncza linia ciÄ…gĹ‚a |
| `line_cable` | Linia kablowa | left (0,50), right (100,50) | 0Â°, 90Â° | **przerywana** (8,4) | Linia kreskowana |

### Aparatura Ĺ‚Ä…czeniowa

| symbol_id | nazwa_PL | porty | dozwolone rotacje | styl linii | uwagi CANONICAL-parity |
|-----------|----------|-------|-------------------|------------|-------------------|
| `circuit_breaker` | WyĹ‚Ä…cznik | top (50,0), bottom (50,100) | 0Â°, 90Â°, 180Â°, 270Â° | ciÄ…gĹ‚a | Kwadrat z X (stan otwarty) |
| `disconnector` | RozĹ‚Ä…cznik | top (50,0), bottom (50,100) | 0Â°, 90Â°, 180Â°, 270Â° | ciÄ…gĹ‚a | Dwa zaciski z otwartym ostrzem |

### Transformatory

| symbol_id | nazwa_PL | porty | dozwolone rotacje | styl linii | uwagi CANONICAL-parity |
|-----------|----------|-------|-------------------|------------|-------------------|
| `transformer_2w` | Transformator 2-uzwojeniowy | top (50,0), bottom (50,100) | 0Â°, 90Â°, 180Â°, 270Â° | ciÄ…gĹ‚a | Dwa zachodzÄ…ce okrÄ™gi |
| `transformer_3w` | Transformator 3-uzwojeniowy | top (50,0), left (0,62), right (100,62) | 0Â° | ciÄ…gĹ‚a | Trzy okrÄ™gi w ukĹ‚adzie Y |

### ĹąrĂłdĹ‚a i zasobniki energii

| symbol_id | nazwa_PL | porty | dozwolone rotacje | styl linii | uwagi CANONICAL-parity |
|-----------|----------|-------|-------------------|------------|-------------------|
| `generator` | Generator synchroniczny | bottom (50,100) | 0Â°, 90Â°, 180Â°, 270Â° | ciÄ…gĹ‚a | OkrÄ…g z literÄ… G |
| `pv` | Fotowoltaika | bottom (50,100) | 0Â° | ciÄ…gĹ‚a | ProstokÄ…t z siatkÄ… panelu + strzaĹ‚ka sĹ‚oĹ„ca |
| `fw` | Farma wiatrowa | bottom (50,100) | 0Â° | ciÄ…gĹ‚a | OkrÄ…g z trzema Ĺ‚opatami turbiny |
| `bess` | Magazyn energii (BESS) | bottom (50,100) | 0Â°, 180Â° | ciÄ…gĹ‚a | ProstokÄ…t baterii z +/- |
| `utility_feeder` | Zasilanie z sieci | bottom (50,100) | 0Â° | ciÄ…gĹ‚a | Trzy linie ze strzaĹ‚kami w dĂłĹ‚ |

### Uziemienie i przekĹ‚adniki

| symbol_id | nazwa_PL | porty | dozwolone rotacje | styl linii | uwagi CANONICAL-parity |
|-----------|----------|-------|-------------------|------------|-------------------|
| `ground` | Uziemienie | top (50,0) | 0Â° | ciÄ…gĹ‚a | MalejÄ…ce linie poziome |
| `ct` | PrzekĹ‚adnik prÄ…dowy | left (0,50), right (100,50) | 0Â°, 90Â° | ciÄ…gĹ‚a | OkrÄ…g z liniÄ… przelotowÄ… |
| `vt` | PrzekĹ‚adnik napiÄ™ciowy | left (0,50), right (100,50) | 0Â°, 90Â° | ciÄ…gĹ‚a | Dwa okrÄ™gi (uzwojenia) |

## ReguĹ‚y rotacji portĂłw

Przy rotacji symbolu porty transformujÄ… siÄ™ zgodnie z reguĹ‚ami:

| Rotacja | Transformacja wspĂłĹ‚rzÄ™dnych | Mapowanie portĂłw |
|---------|----------------------------|------------------|
| 90Â° | `x' = 100 - y, y' = x` | topâ†’right, rightâ†’bottom, bottomâ†’left, leftâ†’top |
| 180Â° | `x' = 100 - x, y' = 100 - y` | topâ†”bottom, leftâ†”right |
| 270Â° | `x' = y, y' = 100 - x` | topâ†’left, rightâ†’top, bottomâ†’right, leftâ†’bottom |

## RozrĂłĹĽnienie linii napowietrznej vs kablowej

```
line_overhead.svg  â†’  stroke-dasharray: none      (CIÄ„GĹA)
line_cable.svg     â†’  stroke-dasharray: 8,4       (PRZERYWANA)
```

To rozrĂłĹĽnienie jest **BINDING** i wynika z normy IEC 60617.

## RozrĂłĹĽnienie ĹşrĂłdeĹ‚ energii

KaĹĽde ĹşrĂłdĹ‚o ma **odrÄ™bny symbol** (zgodnie z wymaganiami CANONICAL-parity):

| Typ | Symbol | Charakterystyka wizualna |
|-----|--------|--------------------------|
| Generator | `generator.svg` | OkrÄ…g + litera "G" |
| Fotowoltaika | `pv.svg` | Panel sĹ‚oneczny + strzaĹ‚ka sĹ‚oĹ„ca |
| Farma wiatrowa | `fw.svg` | Turbina z 3 Ĺ‚opatami |
| Magazyn energii | `bess.svg` | Bateria z +/- |

**ZAKAZ:** Nie wolno zastÄ™powaÄ‡ PV/FW/BESS symbolem generatora z etykietÄ….

## Struktura plikĂłw

```
canonical_symbols/
â”śâ”€â”€ README.md           # Ten plik
â”śâ”€â”€ ports.json          # Definicje portĂłw dla wszystkich symboli
â”śâ”€â”€ busbar.svg
â”śâ”€â”€ circuit_breaker.svg
â”śâ”€â”€ disconnector.svg
â”śâ”€â”€ line_overhead.svg   # Linia ciÄ…gĹ‚a
â”śâ”€â”€ line_cable.svg      # Linia przerywana
â”śâ”€â”€ transformer_2w.svg
â”śâ”€â”€ transformer_3w.svg
â”śâ”€â”€ generator.svg
â”śâ”€â”€ pv.svg              # Osobny symbol PV
â”śâ”€â”€ fw.svg              # Osobny symbol FW
â”śâ”€â”€ bess.svg            # Osobny symbol BESS
â”śâ”€â”€ utility_feeder.svg
â”śâ”€â”€ ground.svg
â”śâ”€â”€ ct.svg
â””â”€â”€ vt.svg
```

## UĹĽycie w kodzie

```typescript
// PrzykĹ‚ad Ĺ‚adowania symbolu
import busbarSvg from './canonical_symbols/busbar.svg';
import portsData from './canonical_symbols/ports.json';

const busbarPorts = portsData.symbols.busbar.ports;
// { left: { x: 0, y: 50 }, right: { x: 100, y: 50 } }
```

## Status symboli

| Symbol | Status | Uwagi |
|--------|--------|-------|
| busbar | âś… READY | |
| circuit_breaker | âś… READY | |
| disconnector | âś… READY | |
| line_overhead | âś… READY | Linia ciÄ…gĹ‚a |
| line_cable | âś… READY | Linia przerywana |
| transformer_2w | âś… READY | |
| transformer_3w | âś… READY | |
| generator | âś… READY | |
| pv | âś… READY | Osobny symbol |
| fw | âś… READY | Osobny symbol |
| bess | âś… READY | Osobny symbol |
| utility_feeder | âś… READY | |
| ground | âś… READY | |
| ct | âś… READY | |
| vt | âś… READY | |

## Wersja

- **v1.0.0** - Initial release z 15 symbolami CANONICAL-parity

## ZgodnoĹ›Ä‡

- SVG 1.1
- Brak zewnÄ™trznych zaleĹĽnoĹ›ci CSS
- Brak fontĂłw (wszystkie znaki jako Ĺ›cieĹĽki)
- KompatybilnoĹ›Ä‡ z rotacjami 0Â°/90Â°/180Â°/270Â°


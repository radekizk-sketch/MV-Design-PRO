# Dark SCADA Neon Theme — Specyfikacja

**Wersja**: 1.0  
**Data**: 2026-04-24  
**Status**: WIĄŻĄCY dla implementacji M7 (scadaDarkTokens.ts, ThemeProvider.tsx)  
**Zależność**: Mapuje tokeny z `SLD_STYL_WIZUALNY_KANONICZNY.md` na wariant ciemny  
**Zasada**: Dark theme **mapuje istniejące tokeny V12.5.1**, nie tworzy konkurencyjnego systemu

---

## 1. Zasada Mapowania

```
SLD_COLORS (light)          →   SCADA_DARK_TOKENS (dark)
─────────────────────────────────────────────────────
#1a1a2e (elementy sieciowe) →   #00D4FF neon (przewody live)
#c0392b (SWITCH_OPEN/NOP)   →   #FF006E neon (stany otwarte/alarm)
#27ae60 (GEN_BESS/OK)       →   #00FF7F neon (aktywne/OK)
#f39c12 (GEN_PV/WARNING)    →   #FFD700 neon (ostrzeżenie/PV)
#3498db (GEN_WIND)          →   #00D4FF neon (źródło wiatrowe)
#2980b9 (SELECTION)         →   #00BFFF neon (selekcja)
#f5f5f5 (STATION_BG)        →   #0F0F1E dark (tło bloków stacji)
#ffffff (LABEL_BG)          →   #0A0A1A dark (tło etykiet)
#333333 (LABEL_TEXT)        →   #E0E0E0 jasny (tekst etykiet)
#e0e0e0 (GRID)              →   #1A1A2E subtelny (linie siatki)
#cccccc (STATION_BORDER)    →   #2A2A4A dark (ramka stacji)
```

---

## 2. Paleta Kolorów Dark SCADA Neon

### 2.1 Tła (Background)

| Token | Hex | Zastosowanie |
|-------|-----|-------------|
| `--scada-bg-canvas` | `#0A0A1A` | Tło głównego canvas SVG |
| `--scada-bg-station` | `#0F0F1E` | Tło bloków stacji |
| `--scada-bg-field` | `#13132A` | Tło pola rozdzielczego |
| `--scada-bg-panel` | `#080816` | Tło paneli bocznych |
| `--scada-bg-tooltip` | `#1A1A35` | Tło tooltipów |
| `--scada-bg-overlay` | `rgba(10,10,26,0.9)` | Overlay wynikowy |

### 2.2 Przewody i Szyny (Live Elements)

| Token | Hex | Zastosowanie | Kontrast WCAG |
|-------|-----|-------------|--------------|
| `--scada-wire-live` | `#00D4FF` | Przewody pod napięciem | ≥4.5:1 ✅ |
| `--scada-wire-dead` | `#3A3A6A` | Przewody odcięte | — |
| `--scada-bus-gpz` | `#00D4FF` | Szyna zbiorcza GPZ | ≥4.5:1 ✅ |
| `--scada-bus-station` | `#00BBEE` | Szyna stacji SN | ≥4.5:1 ✅ |
| `--scada-bus-lv` | `#0099CC` | Szyna nN | ≥4.5:1 ✅ |

### 2.3 Stany Aparatów (Switch States)

| Token | Hex | Stan | Kontrast WCAG |
|-------|-----|------|--------------|
| `--scada-switch-closed` | `#00FF7F` | Wyłącznik zamknięty | ≥7:1 ✅ |
| `--scada-switch-open` | `#FF006E` | Wyłącznik otwarty | ≥4.5:1 ✅ |
| `--scada-nop-normal` | `#FF006E` | NOP normalnie otwarty | ≥4.5:1 ✅ |
| `--scada-nop-closed` | `#00FF7F` | NOP zamknięty (awaryjny) | ≥7:1 ✅ |
| `--scada-tripped` | `#FF4444` | Wyłącznik wyzwolony | ≥4.5:1 ✅ |

### 2.4 Źródła OZE (Generators)

| Token | Hex | Źródło |
|-------|-----|--------|
| `--scada-gen-pv` | `#FFD700` | Fotowoltaika |
| `--scada-gen-bess` | `#00FF7F` | Magazyn energii |
| `--scada-gen-wind` | `#00D4FF` | Turbina wiatrowa |

### 2.5 Nakładki Wyników (Result Overlays)

| Token | Hex | Znaczenie | Kontrast WCAG |
|-------|-----|-----------|--------------|
| `--scada-result-ok` | `#00FF7F` | W normie | ≥7:1 ✅ |
| `--scada-result-warning` | `#FFD700` | Ostrzeżenie | ≥7:1 ✅ |
| `--scada-result-error` | `#FF006E` | Przekroczenie | ≥4.5:1 ✅ |

### 2.6 Tekst i Etykiety (Typography)

| Token | Hex | Zastosowanie | Kontrast WCAG vs bg |
|-------|-----|-------------|---------------------|
| `--scada-text-primary` | `#E8E8F0` | Etykiety elementów | ≥7:1 ✅ |
| `--scada-text-secondary` | `#9090B0` | Parametry techniczne | ≥4.5:1 ✅ |
| `--scada-text-muted` | `#5050A0` | Opisy dodatkowe | ≥3:1 (AA-large) |
| `--scada-text-accent` | `#00D4FF` | Napięcia, podkreślenia | ≥4.5:1 ✅ |

### 2.7 Selekcja i Interakcja

| Token | Hex | Zastosowanie |
|-------|-----|-------------|
| `--scada-selection` | `#00BFFF` | Element wybrany |
| `--scada-hover` | `rgba(0,212,255,0.1)` | Hover efekt |
| `--scada-focus` | `#00D4FF` | Focus ring |
| `--scada-grid` | `#1A1A2E` | Linie siatki canvas |

### 2.8 Ramki i Granice (Borders)

| Token | Hex | Zastosowanie |
|-------|-----|-------------|
| `--scada-border-station` | `#2A2A5A` | Ramka bloku stacji |
| `--scada-border-field` | `#1E1E40` | Ramka pola |
| `--scada-border-panel` | `#1A1A35` | Ramka panelu |

---

## 3. CSS Variables — Schemat Implementacji

```css
/* Klasa aktywowana przez ThemeProvider na <html> */
html.scada-dark {
  /* === Tła === */
  --scada-bg-canvas: #0A0A1A;
  --scada-bg-station: #0F0F1E;
  --scada-bg-field: #13132A;
  --scada-bg-panel: #080816;

  /* === Przewody === */
  --scada-wire-live: #00D4FF;
  --scada-wire-dead: #3A3A6A;
  --scada-bus-gpz: #00D4FF;
  --scada-bus-station: #00BBEE;
  --scada-bus-lv: #0099CC;

  /* === Stany aparatów === */
  --scada-switch-closed: #00FF7F;
  --scada-switch-open: #FF006E;
  --scada-nop-normal: #FF006E;
  --scada-tripped: #FF4444;

  /* === OZE === */
  --scada-gen-pv: #FFD700;
  --scada-gen-bess: #00FF7F;
  --scada-gen-wind: #00D4FF;

  /* === Wyniki === */
  --scada-result-ok: #00FF7F;
  --scada-result-warning: #FFD700;
  --scada-result-error: #FF006E;

  /* === Tekst === */
  --scada-text-primary: #E8E8F0;
  --scada-text-secondary: #9090B0;
  --scada-text-accent: #00D4FF;

  /* === Interakcja === */
  --scada-selection: #00BFFF;
  --scada-hover: rgba(0, 212, 255, 0.1);
  --scada-grid: #1A1A2E;
}
```

---

## 4. Mapowanie sldCanonicalStyle.ts

`sldCanonicalStyle.ts` otrzymuje nową funkcję `resolveVoltageColor(level, themeMode)`:

```typescript
// Bezpieczne: nie zmienia stałych light mode
function resolveVoltageColor(
  level: VoltageLevel,
  themeMode: 'light' | 'dark'
): string {
  if (themeMode === 'dark') {
    return SCADA_DARK_VOLTAGE_COLORS[level];
  }
  return CANONICAL_VOLTAGE_COLORS[level]; // bez zmian (legacy)
}

const SCADA_DARK_VOLTAGE_COLORS = {
  HV_110kV: '#FFD700',  // złoty neon
  MV_15kV: '#00D4FF',   // niebieski neon
  LV_04kV: '#00FF7F',   // zielony neon
  DC: '#FF8C00',         // pomarańczowy neon
} as const;
```

**Zasada**: Stałe `CANONICAL_VOLTAGE_COLORS` (light mode) **nie są modyfikowane**.

---

## 5. Kontrast WCAG AA — Wymagania

| Element | Token | Tło | Wymagany | Status |
|---------|-------|-----|---------|--------|
| Etykiety elementów | `--scada-text-primary` (#E8E8F0) | `--scada-bg-canvas` (#0A0A1A) | 4.5:1 | ≥16:1 ✅ |
| Parametry techniczne | `--scada-text-secondary` (#9090B0) | `--scada-bg-canvas` (#0A0A1A) | 4.5:1 | ≥5:1 ✅ |
| Przewody live | `--scada-wire-live` (#00D4FF) | `--scada-bg-canvas` (#0A0A1A) | 3:1 (UI elem) | ≥8:1 ✅ |
| Wyłącznik zamknięty | `--scada-switch-closed` (#00FF7F) | `--scada-bg-field` (#13132A) | 3:1 | ≥7:1 ✅ |
| Wyłącznik otwarty | `--scada-switch-open` (#FF006E) | `--scada-bg-field` (#13132A) | 3:1 | ≥4.5:1 ✅ |
| Tekst wyniku OK | `--scada-result-ok` (#00FF7F) | `--scada-bg-overlay` | 4.5:1 | ≥7:1 ✅ |

---

## 6. ThemeProvider — Architektura

```typescript
// frontend/src/ui/theme/ThemeProvider.tsx

type ThemeMode = 'light' | 'dark';

const ThemeContext = createContext<{
  mode: ThemeMode;
  toggle: () => void;
}>({ mode: 'light', toggle: () => {} });

function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('light');

  useEffect(() => {
    const root = document.documentElement;
    if (mode === 'dark') {
      root.classList.add('scada-dark');
    } else {
      root.classList.remove('scada-dark');
    }
  }, [mode]);

  return (
    <ThemeContext.Provider value={{ mode, toggle: () => setMode(m => m === 'light' ? 'dark' : 'light') }}>
      {children}
    </ThemeContext.Provider>
  );
}
```

**Zasada**: ThemeProvider manipuluje tylko klasą `scada-dark` na `<html>`. Nie tworzy alternatywnych tokenów kolorów — mapuje przez CSS variables.

---

## 7. Tailwind Dark Mode

```javascript
// tailwind.config.js (modyfikacja)
module.exports = {
  darkMode: 'class',  // klasa 'scada-dark' na <html>
  theme: {
    extend: {
      colors: {
        scada: {
          'bg-canvas': 'var(--scada-bg-canvas)',
          'wire-live': 'var(--scada-wire-live)',
          'switch-closed': 'var(--scada-switch-closed)',
          'switch-open': 'var(--scada-switch-open)',
          'text-primary': 'var(--scada-text-primary)',
          // ... reszta tokenów
        }
      }
    }
  }
}
```

---

## 8. Zakazy

1. **NIE** modyfikować stałych `CANONICAL_VOLTAGE_COLORS` (light mode)
2. **NIE** tworzyć `!important` w CSS dark mode
3. **NIE** hardkodować `#0A0A1A` w komponentach JSX — używać `var(--scada-bg-canvas)`
4. **NIE** tworzyć drugiego systemu tokenów (dark theme mapuje, nie zastępuje)
5. **NIE** zmieniać zachowania light mode przy dodawaniu dark mode
6. **NIE** stosować dark theme do eksportów PDF (eksport zawsze light mode)

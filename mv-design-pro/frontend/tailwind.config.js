/**
 * Alias klasy Tailwinda na token `--mvd-*` (jedyny zestaw tokenów — karta K1).
 * Bez modyfikatora przezroczystości klasa daje czyste `var(--mvd-…)` (wartość
 * wyliczona w przeglądarce pozostaje `rgb(…)`); modyfikator `/95` daje
 * `color-mix(in srgb, var(--mvd-…) 95%, transparent)`. Narzędzia `bg-opacity-*`
 * nie działają na aliasach (zero użyć w `src` — zmierzone przy karcie K1).
 */
function tokenMvd(nazwa) {
  const zmienna = `var(--mvd-${nazwa})`;
  return ({ opacityValue } = {}) => {
    if (opacityValue === undefined) return zmienna;
    const tekst = String(opacityValue).trim();
    if (tekst.startsWith('var(')) return zmienna;
    const procent = tekst.endsWith('%') ? tekst : `${Number(tekst) * 100}%`;
    if (procent === '100%') return zmienna;
    return `color-mix(in srgb, ${zmienna} ${procent}, transparent)`;
  };
}

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        /* === Industrial Design System — PowerFactory/ETAP Grade === */

        /* Primary brand palette — professional navy/steel */
        'ind': {
          50: '#f0f4f8',
          100: '#d9e2ec',
          200: '#bcccdc',
          300: '#9fb3c8',
          400: '#829ab1',
          500: '#627d98',
          600: '#486581',
          700: '#334e68',
          800: '#243b53',
          900: '#102a43',
          950: '#0a1929',
        },

        /* Toolbar/chrome — dark steel for toolbars */
        'chrome': {
          50: '#f8fafc',
          100: '#e2e8f0',
          200: '#cbd5e1',
          300: '#94a3b8',
          400: '#64748b',
          500: '#475569',
          600: '#334155',
          700: '#1e293b',
          800: '#0f172a',
          900: '#020617',
        },

        /* Status colors — energetics standard */
        'status': {
          'ok': '#059669',          /* green — gotowe */
          'ok-light': '#d1fae5',
          'warn': '#d97706',        /* amber — ostrzeżenie */
          'warn-light': '#fef3c7',
          'error': '#dc2626',       /* red — blokada */
          'error-light': '#fee2e2',
          'info': '#2563eb',        /* blue — informacja */
          'info-light': '#dbeafe',
          'fresh': '#059669',       /* wyniki aktualne */
          'outdated': '#d97706',    /* wyniki nieaktualne */
          'none': '#6b7280',        /* brak wyników */
        },

        /* Voltage-level colors — IEC standard */
        'volt': {
          'wn': '#7c3aed',          /* 110+ kV — fiolet */
          'sn': '#dc2626',          /* 15-30 kV — czerwień */
          'nn': '#2563eb',          /* 0.4 kV — niebieski */
          'uziom': '#065f46',       /* uziemienie — ciemnozielony */
        },

        /* Canvas/workspace */
        'canvas': {
          'bg': '#fafaf9',
          'grid': '#e7e5e4',
          'selection': '#3b82f6',
          'hover': '#60a5fa',
        },

        /* === Paleta powierzchni aplikacji — ALIASY tokenów `--mvd-*` ===
         *
         * Karta K1 POWLOKA (kontrakt UIUX przemysłowy §8): aplikacja ma JEDEN
         * zestaw tokenów — `src/ui2/theme/tokens.css`. Dawny zestaw `--scada-*`
         * (trójki RGB w `src/index.css`) niósł dla tych samych ról INNE wartości
         * niż `--mvd-*`, więc jeden ekran miał dwie prawdy koloru; jest skasowany.
         * Nazwy klas `scada-*`/`sygnal-*` zostają jako aliasy (setki konsumentów
         * w `ui/**`), ale każda wskazuje token `--mvd-*` (funkcja `tokenMvd`).
         * Modyfikatory przezroczystości (`bg-scada-panel/95`) dają `color-mix`.
         */
        'scada': {
          'bg':           tokenMvd('bg'),           /* główne tło aplikacji */
          'bg-hover':     tokenMvd('bg-hover'),     /* hover na tle */
          'surface':      tokenMvd('surface'),      /* powierzchnia paneli */
          'panel':        tokenMvd('panel'),        /* panel kontekstu */
          'panel-raised': tokenMvd('panel-raised'), /* panel wyniesiony */
          'border':       tokenMvd('line'),         /* granica paneli */
          'border-strong':tokenMvd('line-strong'),  /* granica kontrolek */
          'grid':         tokenMvd('grid'),         /* siatka */
          'sn':           tokenMvd('sn'),           /* klasa napięcia SN 15-30 kV */
          'nn':           tokenMvd('nn'),           /* klasa napięcia nN 0.4 kV */
          'wn':           tokenMvd('wn'),           /* klasa napięcia WN 110+ kV */
          'energized':    tokenMvd('energized'),    /* pod napięciem */
          'success':      tokenMvd('energized'),    /* alias stanu „gotowe" */
          'dead':         tokenMvd('dead'),         /* bez napięcia */
          'grounded':     tokenMvd('grounded'),     /* uziemione */
          'alarm':        tokenMvd('alarm'),        /* alarm */
          'earth':        tokenMvd('earth'),        /* ziemia/metal */
          'text':         tokenMvd('ink'),          /* tekst główny */
          'muted':        tokenMvd('muted'),        /* tekst pomocniczy */
          'accent':       tokenMvd('accent'),       /* akcent akcji (odnośnik, fokus) */
          'active':       tokenMvd('active'),       /* aktywna pozycja nawigacji */
          'hover-nav':    tokenMvd('hover-nav'),    /* hover w nawigacji */
        },

        /* Skala komunikatów (KD-8 poz. 3) — jedna hierarchia dla obu motywów:
         * blokada (err) > ostrzeżenie (warn) > informacja (info); `ok` to
         * potwierdzenie. Każdy poziom ma akcent, tło i TUSZ o kontraście
         * ≥ 4,5:1 na własnym tle w OBU motywach (pomiar:
         * `src/ui2/shell/__tests__/tokens.test.ts`). */
        'sygnal': {
          'blokada':      tokenMvd('err'),
          'blokada-tlo':  tokenMvd('err-bg'),
          'blokada-tusz': tokenMvd('err-ink'),
          'uwaga':        tokenMvd('warn'),
          'uwaga-tlo':    tokenMvd('warn-bg'),
          'uwaga-tusz':   tokenMvd('warn-ink'),
          'ok':           tokenMvd('ok'),
          'ok-tlo':       tokenMvd('ok-bg'),
          'ok-tusz':      tokenMvd('ok-ink'),
          'info':         tokenMvd('info'),
          'info-tlo':     tokenMvd('info-bg'),
          'info-tusz':    tokenMvd('info-ink'),
        },
      },

      fontFamily: {
        'mono-eng': ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
        'sans-eng': ['"Inter"', 'system-ui', 'sans-serif'],
      },

      fontSize: {
        /* SLD label sizes */
        'sld-node': ['11px', { lineHeight: '14px', fontWeight: '600' }],
        'sld-param': ['9px', { lineHeight: '12px' }],
        'sld-station': ['11px', { lineHeight: '14px', fontWeight: '700' }],
        'sld-iec': ['10px', { lineHeight: '13px', fontWeight: '600' }],
      },

      boxShadow: {
        'toolbar': '0 1px 3px 0 rgba(0, 0, 0, 0.15), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
        'panel': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'overlay': '0 4px 6px -1px rgba(0, 0, 0, 0.15), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
        'modal': '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
      },

      spacing: {
        /* Panel standard widths */
        'tree': '17rem',      /* 272px — panel drzewa projektu */
        'inspector': '20rem', /* 320px — panel właściwości */
        'wizard-sidebar': '16.25rem', /* 260px — sidebar kreatora */
      },

      animation: {
        'focus-ring': 'focus-ring 1.5s ease-out 2',
      },

      keyframes: {
        'focus-ring': {
          '0%': { transform: 'scale(0.8)', opacity: '0.8' },
          '100%': { transform: 'scale(2)', opacity: '0' },
        },
      },

      borderRadius: {
        'ind': '4px',   /* standard industrial radius */
      },
    },
  },
  plugins: [],
};

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

        /* === Paleta powierzchni aplikacji — STEROWANA MOTYWEM (KD-8 poz. 1) ===
         *
         * Wartości NIE są już literałami ciemnymi: każdy token czyta zmienną
         * CSS `--scada-*` deklarowaną per motyw w `src/index.css`
         * (`[data-theme="dark_scada"]` / `[data-theme="light_technical"]`).
         * Dzięki temu JEDNO źródło (tokeny motywu) steruje KAŻDĄ powierzchnią
         * powłoki — dawniej `bg-scada-panel`/`text-scada-text` zostawały ciemne
         * także przy motywie jasnym (ocena właściciela 2/10 ekranu jasnego:
         * pasek metryk, karta konfiguratora i doki kanwy pozostawały ciemne).
         *
         * Zapis `rgb(var(--token) / <alpha-value>)` (Tailwind 3) zachowuje
         * modyfikatory przezroczystości używane w kodzie (`bg-scada-panel/95`,
         * `bg-scada-energized/15`) — dlatego zmienne niosą TRÓJKĘ RGB, nie hex.
         */
        'scada': {
          'bg':           'rgb(var(--scada-bg) / <alpha-value>)',           /* główne tło aplikacji */
          'bg-hover':     'rgb(var(--scada-bg-hover) / <alpha-value>)',     /* hover na tle */
          'surface':      'rgb(var(--scada-surface) / <alpha-value>)',      /* powierzchnia paneli */
          'panel':        'rgb(var(--scada-panel) / <alpha-value>)',        /* panel kontekstu */
          'panel-raised': 'rgb(var(--scada-panel-raised) / <alpha-value>)', /* panel wyniesiony */
          'border':       'rgb(var(--scada-border) / <alpha-value>)',       /* granica paneli */
          'border-strong':'rgb(var(--scada-border-strong) / <alpha-value>)',/* granica kontrolek */
          'grid':         'rgb(var(--scada-grid) / <alpha-value>)',         /* siatka SLD */
          'sn':           'rgb(var(--scada-sn) / <alpha-value>)',           /* magistrala SN 15-30 kV */
          'nn':           'rgb(var(--scada-nn) / <alpha-value>)',           /* magistrala nN 0.4 kV */
          'wn':           'rgb(var(--scada-wn) / <alpha-value>)',           /* magistrala WN 110+ kV */
          'energized':    'rgb(var(--scada-energized) / <alpha-value>)',    /* pod napięciem */
          'success':      'rgb(var(--scada-energized) / <alpha-value>)',    /* alias stanu „gotowe” */
          'dead':         'rgb(var(--scada-dead) / <alpha-value>)',         /* bez napięcia */
          'grounded':     'rgb(var(--scada-grounded) / <alpha-value>)',     /* uziemione */
          'alarm':        'rgb(var(--scada-alarm) / <alpha-value>)',        /* alarm */
          'earth':        'rgb(var(--scada-earth) / <alpha-value>)',        /* ziemia/metal */
          'text':         'rgb(var(--scada-text) / <alpha-value>)',         /* tekst główny */
          'muted':        'rgb(var(--scada-muted) / <alpha-value>)',        /* tekst pomocniczy */
          'active':       'rgb(var(--scada-active) / <alpha-value>)',       /* aktywna pozycja nawigacji */
          'hover-nav':    'rgb(var(--scada-hover-nav) / <alpha-value>)',    /* hover w nawigacji */
        },

        /* Skala komunikatów (KD-8 poz. 3) — jedna hierarchia dla obu motywów:
         * blokada (err) > ostrzeżenie (warn) > informacja (info); `ok` to
         * potwierdzenie. Każdy poziom ma akcent, tło i TUSZ o kontraście
         * ≥ 4,5:1 na własnym tle w OBU motywach (pomiar:
         * `ui/__tests__/statusTokens.contrast.test.ts`). */
        'sygnal': {
          'blokada':      'rgb(var(--scada-status-err) / <alpha-value>)',
          'blokada-tlo':  'rgb(var(--scada-status-err-bg) / <alpha-value>)',
          'blokada-tusz': 'rgb(var(--scada-status-err-ink) / <alpha-value>)',
          'uwaga':        'rgb(var(--scada-status-warn) / <alpha-value>)',
          'uwaga-tlo':    'rgb(var(--scada-status-warn-bg) / <alpha-value>)',
          'uwaga-tusz':   'rgb(var(--scada-status-warn-ink) / <alpha-value>)',
          'ok':           'rgb(var(--scada-status-ok) / <alpha-value>)',
          'ok-tlo':       'rgb(var(--scada-status-ok-bg) / <alpha-value>)',
          'ok-tusz':      'rgb(var(--scada-status-ok-ink) / <alpha-value>)',
          'info':         'rgb(var(--scada-status-info) / <alpha-value>)',
          'info-tlo':     'rgb(var(--scada-status-info-bg) / <alpha-value>)',
          'info-tusz':    'rgb(var(--scada-status-info-ink) / <alpha-value>)',
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

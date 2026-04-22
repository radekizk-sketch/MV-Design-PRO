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

        /* === Dark SCADA Neon — Canonical Shell Theme === */
        /* Operator/engineer workspace: dark background, white bus, neon accents */

        'scada-bg':     '#0d1520',  /* primary dark background */
        'scada-panel':  '#111e2d',  /* panel/surface background */
        'scada-chrome': '#162232',  /* toolbar / bar chrome */
        'scada-border': '#1f3347',  /* borders and dividers */

        'scada-text':   '#e2e8f0',  /* primary text — light */
        'scada-dim':    '#94a3b8',  /* secondary text — dimmed */
        'scada-muted':  '#475569',  /* muted / disabled text */

        /* Neon accent colors — SCADA/HMI grade */
        'scada-accent':      '#3b82f6',  /* primary blue accent */
        'scada-neon-green':  '#00e676',  /* neon green — OK / closed breaker */
        'scada-neon-red':    '#ff1744',  /* neon red — FAULT / open breaker */
        'scada-neon-amber':  '#ffc107',  /* neon amber — WARNING */
        'scada-neon-cyan':   '#00e5ff',  /* neon cyan — MEASUREMENT */
        'scada-neon-blue':   '#2979ff',  /* neon blue — INFO */
        'scada-neon-purple': '#d500f9',  /* neon purple — PROTECTION */

        /* SLD power bus */
        'scada-bus':   '#ffffff',   /* white power bus line */
        'scada-breaker-closed': '#00e676',
        'scada-breaker-open':   '#ff1744',
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

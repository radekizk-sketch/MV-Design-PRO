import type { ExportThemeId } from './types';

export const DEFAULT_EXPORT_THEME: ExportThemeId = 'light_technical';

const LIGHT_TECHNICAL_COLORS = {
  background: '#FFFFFF',
  surface: '#F8FAFC',
  border: '#CBD5E1',
  text: '#111827',
  textMuted: '#475569',
} as const;

const LIGHT_TECHNICAL_THEME_CSS = `
[data-sld-export-theme="light_technical"] {
  color-scheme: light;
  background: ${LIGHT_TECHNICAL_COLORS.background} !important;
  color: ${LIGHT_TECHNICAL_COLORS.text} !important;
}

[data-sld-export-theme="light_technical"],
[data-sld-export-theme="light_technical"] * {
  text-shadow: none !important;
  box-shadow: none !important;
}

[data-sld-export-theme="light_technical"] .bg-canvas-bg,
[data-sld-export-theme="light_technical"] [class*="bg-chrome-"],
[data-sld-export-theme="light_technical"] [class*="bg-slate-9"],
[data-sld-export-theme="light_technical"] [class*="bg-gray-9"],
[data-sld-export-theme="light_technical"] [class*="bg-zinc-9"],
[data-sld-export-theme="light_technical"] [class*="bg-black"] {
  background-color: ${LIGHT_TECHNICAL_COLORS.background} !important;
}

[data-sld-export-theme="light_technical"] [class*="bg-slate-8"],
[data-sld-export-theme="light_technical"] [class*="bg-gray-8"],
[data-sld-export-theme="light_technical"] [class*="bg-zinc-8"] {
  background-color: ${LIGHT_TECHNICAL_COLORS.surface} !important;
}

[data-sld-export-theme="light_technical"] [class*="text-chrome-"],
[data-sld-export-theme="light_technical"] [class*="text-slate-"],
[data-sld-export-theme="light_technical"] [class*="text-gray-"],
[data-sld-export-theme="light_technical"] [class*="text-zinc-"],
[data-sld-export-theme="light_technical"] [class*="text-white"] {
  color: ${LIGHT_TECHNICAL_COLORS.text} !important;
}

[data-sld-export-theme="light_technical"] [class*="border-chrome-"],
[data-sld-export-theme="light_technical"] [class*="border-slate-"],
[data-sld-export-theme="light_technical"] [class*="border-gray-"],
[data-sld-export-theme="light_technical"] [class*="border-zinc-"] {
  border-color: ${LIGHT_TECHNICAL_COLORS.border} !important;
}

[data-sld-export-theme="light_technical"] [data-testid="sld-view-canvas"] {
  background: ${LIGHT_TECHNICAL_COLORS.background} !important;
  color: #1F2937 !important;
}

[data-sld-export-theme="light_technical"] [data-testid="sld-canvas-background"] {
  fill: ${LIGHT_TECHNICAL_COLORS.background} !important;
}

[data-sld-export-theme="light_technical"] [data-testid="sld-switching-legend"],
[data-sld-export-theme="light_technical"] [data-testid="sld-legend-panel"],
[data-sld-export-theme="light_technical"] [data-testid="sld-diagnostics-legend"] {
  background: ${LIGHT_TECHNICAL_COLORS.surface} !important;
  color: ${LIGHT_TECHNICAL_COLORS.text} !important;
  border: 1px solid ${LIGHT_TECHNICAL_COLORS.border} !important;
}

[data-sld-export-theme="light_technical"] svg text {
  fill: ${LIGHT_TECHNICAL_COLORS.text} !important;
}

[data-sld-export-theme="light_technical"] svg [fill="currentColor"] {
  fill: ${LIGHT_TECHNICAL_COLORS.textMuted} !important;
}
`;

export function resolveExportTheme(theme?: ExportThemeId): ExportThemeId {
  return theme ?? DEFAULT_EXPORT_THEME;
}

export function applyExportTheme(
  container: HTMLElement,
  theme: ExportThemeId = DEFAULT_EXPORT_THEME
): void {
  if (theme === 'screen') {
    return;
  }

  container.dataset.sldExportTheme = theme;
  container.style.colorScheme = 'light';
  container.style.backgroundColor = LIGHT_TECHNICAL_COLORS.background;
  container.style.color = LIGHT_TECHNICAL_COLORS.text;

  const style = document.createElement('style');
  style.setAttribute('data-sld-export-theme-style', theme);
  style.textContent = LIGHT_TECHNICAL_THEME_CSS;
  container.prepend(style);

  const canvasBackground = container.querySelector('[data-testid="sld-canvas-background"]');
  if (canvasBackground instanceof SVGElement) {
    canvasBackground.setAttribute('fill', LIGHT_TECHNICAL_COLORS.background);
  }

  const canvas = container.querySelector('[data-testid="sld-view-canvas"]');
  if (canvas instanceof SVGElement) {
    canvas.style.backgroundColor = LIGHT_TECHNICAL_COLORS.background;
    canvas.style.color = '#1F2937';
  }
}

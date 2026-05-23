export type ExportThemeId = 'light_technical';

export const DEFAULT_EXPORT_THEME: ExportThemeId = 'light_technical';

export const SLD_EXPORT_THEME_SELECTOR = '[data-sld-export-theme="light_technical"]';

export const LIGHT_TECHNICAL_EXPORT_CSS = `
[data-sld-export-theme="light_technical"] {
  color-scheme: light;
  --sld-export-background: #ffffff;
  --sld-export-ink: #111827;
  --sld-export-line: #111827;
  --sld-export-closed: #007a3d;
  --sld-export-open: #b71c1c;
  --sld-export-warning: #e08400;
}
`;

export function getSldExportThemeAttributes(): Record<string, string> {
  return {
    'data-sld-export-theme': DEFAULT_EXPORT_THEME,
  };
}

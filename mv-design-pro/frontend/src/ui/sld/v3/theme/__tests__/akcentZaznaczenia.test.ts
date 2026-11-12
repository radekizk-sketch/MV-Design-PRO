/**
 * Wejścia na schemat (zlecenie architekta 2026-11-12): zaznaczenie na schemacie ma barwę AKCENTU
 * aplikacji w każdym motywie — jedno wyróżnienie w produkcie. Źródło: `--mvd-accent` motywu
 * ciemnego i jasnego w `ui2/theme/tokens.css`; konsumenci: paleta kanwy v3 (ciemna i jasna),
 * paleta eksportu, tokeny v2 (lasso, kanwa v2).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { HIGHLIGHT_COLOR } from '../colorTokens';
import { DARK_SCADA_SLD_PALETTE, LIGHT_TECHNICAL_SLD_PALETTE } from '../palette';
import { LIGHT_TECHNICAL_V3 } from '../../export/exportPalette';
import { COLOR_SELECTION, LIGHT_TECHNICAL_COLOR_SELECTION } from '../../../v2/theme/tokens';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, '../../../../../ui2/theme/tokens.css'), 'utf8');
const akcenty = [...css.matchAll(/--mvd-accent:\s*(#[0-9A-Fa-f]{6})/g)].map((m) => m[1].toUpperCase());

describe('barwa zaznaczenia = akcent aplikacji motywu', () => {
  it('tokens.css niesie akcent motywu ciemnego i jasnego', () => {
    expect(akcenty).toHaveLength(2);
  });
  it('motyw ciemny: kanwa v3 i tokeny v2', () => {
    expect(HIGHLIGHT_COLOR.selection.toUpperCase()).toBe(akcenty[0]);
    expect(COLOR_SELECTION.toUpperCase()).toBe(akcenty[0]);
    expect(DARK_SCADA_SLD_PALETTE.highlight.selection.toUpperCase()).toBe(akcenty[0]);
  });
  it('motyw jasny: tokeny v2, paleta kanwy i eksportu', () => {
    expect(LIGHT_TECHNICAL_COLOR_SELECTION.toUpperCase()).toBe(akcenty[1]);
    expect(LIGHT_TECHNICAL_SLD_PALETTE.highlight.selection.toUpperCase()).toBe(akcenty[1]);
    expect(LIGHT_TECHNICAL_V3.highlight.selection.toUpperCase()).toBe(akcenty[1]);
  });
});

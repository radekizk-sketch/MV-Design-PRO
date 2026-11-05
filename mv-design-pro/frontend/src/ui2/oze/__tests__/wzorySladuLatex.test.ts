/**
 * Wzory kroków śladu definiowane po stronie UI (pole `formula_latex` → `SladAnalizy` →
 * `MathInline`) są CZYSTYM LaTeX-em, który KaTeX składa bez błędu.
 *
 * Klasa defektu (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA, commit 5): ślady obszaru PQ i odpowiedzi
 * na polecenie OSD niosły w `formula_latex` prozę ASCII (`max_total_runs = (… + 1) * …`,
 * `P_po, Q_po = nastaw …`, `… result_v1.summary`) — KaTeX składał ją w trybie matematycznym:
 * bez spacji, z podkreślnikami jako indeksami. Inwentarz klasy: każde `formula_latex` z napisu
 * UI w `ui2/oze/**` (kompensacja — już LaTeX, obszar PQ, odpowiedź OSD); wzory śladów
 * pozostałych ekranów przychodzą z backendu (`*_latex`).
 */
import katex from 'katex';
import { describe, expect, it } from 'vitest';

import { KOMPENSACJA_STRINGS } from '../kompensacja/strings';
import { OBSZAR_STRINGS } from '../obszar/strings';
import { OSD_STRINGS } from '../osd/strings';

const WZORY: ReadonlyArray<readonly [string, string]> = [
  ['kompensacja: P + jQ', KOMPENSACJA_STRINGS.sladWzorPQ],
  ['kompensacja: cos φ punktu', KOMPENSACJA_STRINGS.sladWzorCosfiPunktu],
  ['kompensacja: cos φ przekroju', KOMPENSACJA_STRINGS.sladWzorCosfiPrzekroju],
  ['obszar PQ: siatka', OBSZAR_STRINGS.sladWzorSiatka],
  ['obszar PQ: wiersz', OBSZAR_STRINGS.sladWzorWiersz],
  ['OSD: nastaw', OSD_STRINGS.sladWzorNastaw],
  ['OSD: bieg', OSD_STRINGS.sladWzorBieg],
];

/** Proza poza `\text{…}`: co najmniej dwa słowa po 4+ liter rozdzielone spacją. */
function prozaPozaText(latex: string): string | null {
  const bezText = latex.replace(/\\text\{[^}]*\}/g, ' ');
  const trafienie = /[A-Za-zÀ-ž]{4,}\s+[A-Za-zÀ-ž]{4,}/.exec(bezText.replace(/\\[a-zA-Z]+/g, ' '));
  return trafienie ? trafienie[0] : null;
}

describe('wzory śladu z napisów UI — czysty LaTeX', () => {
  it.each(WZORY)('%s składa się w KaTeX bez błędu', (_nazwa, latex) => {
    expect(latex.length).toBeGreaterThan(0);
    expect(() => katex.renderToString(latex, { throwOnError: true, strict: 'error' })).not.toThrow();
  });

  it.each(WZORY)('%s nie niesie prozy poza \\text{}', (_nazwa, latex) => {
    expect(prozaPozaText(latex)).toBeNull();
  });

  it('wykrywacz prozy łapie dawny zapis ASCII (iniekcja)', () => {
    expect(prozaPozaText('rozplyw mocy (ta sama sciezka wykonania)')).not.toBeNull();
    expect(prozaPozaText('\\text{rozpływ mocy — ta sama ścieżka}')).toBeNull();
  });
});

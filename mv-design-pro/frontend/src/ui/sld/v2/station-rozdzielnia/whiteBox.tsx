/**
 * White Box derivation panel (gate D) — renders the expanded A→B→C→D proof for a
 * busbar/field at L2: A=formula, B=data, C=substitution, D=result+unit, with the
 * data provenance and case_ref. The math is carried as LaTeX in the companion
 * (the canonical form for the live app's KaTeX); here, in the SVG composite, it is
 * shown as readable math text (LaTeX lightly prettified) so the derivation is
 * visible in the render — the screenshot is the proof. The raw LaTeX is preserved
 * in `data-formula-latex` / `data-substitution-latex` for downstream rendering.
 *
 * Everything shown is READ from the frozen-solver companion — no recomputation.
 */
import { FONT_MONO, COLOR_TEXT_MUTED, COLOR_TEXT_PRIMARY } from '../theme/tokens';

/** A single A→B→C→D step (shape shared by the SC trace and the VF derivation). */
export interface WhiteBoxStepLike {
  readonly title?: string;
  readonly formula_latex?: string;
  readonly inputs?: Readonly<Record<string, unknown>>;
  readonly substitution_latex?: string;
  readonly result?: Readonly<Record<string, unknown>>;
  readonly result_unit?: string;
  readonly source?: string;
}

/** Lightly prettify a LaTeX fragment into readable inline math for the SVG text. */
export function prettifyLatex(latex: string): string {
  return latex
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
    .replace(/\\cdot/g, '·')
    .replace(/\\left\|/g, '|')
    .replace(/\\right\|/g, '|')
    .replace(/\\Delta/g, 'Δ')
    .replace(/\\kappa/g, 'κ')
    .replace(/\\underline\{([^{}]*)\}/g, '$1')
    .replace(/\\text\{([^{}]*)\}/g, '$1')
    .replace(/\\%/g, '%')
    .replace(/\^\{([^{}]*)\}/g, '^$1')
    .replace(/_\{([^{}]*)\}/g, '_$1')
    .replace(/\\,/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Compact one-line rendering of the step's input data (B). */
function formatInputs(inputs: Readonly<Record<string, unknown>> | undefined): string {
  if (!inputs) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(inputs)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'object' && 're' in (v as Record<string, unknown>)) {
      const c = v as { re: number; im: number };
      parts.push(`${k}=${c.re.toFixed(3)}${c.im >= 0 ? '+' : ''}${c.im.toFixed(3)}j`);
    } else if (typeof v === 'number') {
      parts.push(`${k}=${Number.isInteger(v) ? v : v.toFixed(3)}`);
    } else {
      parts.push(`${k}=${String(v)}`);
    }
  }
  return parts.join(', ');
}

/** Compact rendering of the step's result (D). */
function formatResult(result: Readonly<Record<string, unknown>> | undefined, unit?: string): string {
  if (!result) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(result)) {
    if (typeof v === 'number') parts.push(`${k}=${Number.isInteger(v) ? v : v.toFixed(3)}`);
    else parts.push(`${k}=${String(v)}`);
  }
  return parts.join(', ') + (unit ? ` [${unit}]` : '');
}

/**
 * Render the expanded White Box derivation for one quantity (SC or VF) as a
 * bordered panel. Each step is four rows: Formuła / Dane / Podstawienie / Wynik.
 */
export function WhiteBoxPanel(props: {
  testid: string;
  heading: string;
  standard: string;
  caseRef: string;
  steps: readonly WhiteBoxStepLike[];
  x: number;
  y: number;
  width?: number;
}): JSX.Element {
  const { testid, heading, standard, caseRef, steps, x, y, width = 330 } = props;
  const stepH = 34; // four text rows per step
  const headH = 22;
  const panelH = headH + steps.length * stepH + 14;
  return (
    <g data-testid={testid} data-whitebox="expanded" data-wb-steps={steps.length} pointerEvents="none">
      <rect x={x} y={y} width={width} height={panelH} rx={3} fill="#070F18" stroke="#1C3A4E" strokeWidth={1} opacity={0.98} />
      {/* Heading: quantity + standard + case_ref + provenance. */}
      <text x={x + 8} y={y + 13} fill="#9FE6FF" fontFamily={FONT_MONO} fontSize={8} fontWeight={800}>
        {`WHITE BOX — ${heading}`}
      </text>
      <text x={x + width - 8} y={y + 13} textAnchor="end" fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={6.5} fontWeight={600}>
        {`${standard} · ${caseRef}`}
      </text>
      {steps.map((s, i) => {
        const sy = y + headH + i * stepH;
        const formula = s.formula_latex ? prettifyLatex(s.formula_latex) : '';
        const subst = s.substitution_latex ? prettifyLatex(s.substitution_latex) : '';
        const data = formatInputs(s.inputs);
        const result = formatResult(s.result, s.result_unit);
        return (
          <g
            key={i}
            data-testid={`${testid}-step-${i}`}
            data-formula-latex={s.formula_latex ?? ''}
            data-substitution-latex={s.substitution_latex ?? ''}
            data-source={s.source ?? ''}
          >
            <text x={x + 8} y={sy + 7} fill="#9FE6FF" fontFamily={FONT_MONO} fontSize={6.8} fontWeight={700}>
              {`${i + 1}. ${s.title ?? ''}${s.source ? `  ·  ${s.source}` : ''}`}
            </text>
            <text x={x + 14} y={sy + 15} fill={COLOR_TEXT_PRIMARY} fontFamily={FONT_MONO} fontSize={6.6}>
              {`A) ${formula}`}
            </text>
            <text x={x + 14} y={sy + 22} fill={COLOR_TEXT_MUTED} fontFamily={FONT_MONO} fontSize={6.2}>
              {`B) dane: ${data || '—'}`}
            </text>
            <text x={x + 14} y={sy + 29} fill={COLOR_TEXT_PRIMARY} fontFamily={FONT_MONO} fontSize={6.4}>
              {`C) ${subst || '—'}   ⇒   D) ${result}`}
            </text>
          </g>
        );
      })}
    </g>
  );
}

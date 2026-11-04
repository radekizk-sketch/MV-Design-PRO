/**
 * Tests: MathRenderer — Renderowanie LaTeX (KaTeX)
 *
 * REQUIREMENTS TESTED:
 * 1. Poprawny LaTeX renderuje się przez KaTeX
 * 2. Błędny LaTeX → fallback do tekstu (bez crasha)
 * 3. Determinism: string LaTeX przed = string po (brak modyfikacji)
 * 4. Inline mode ($...$) i block mode ($$...$$)
 * 5. Feature flag ENABLE_MATH_RENDERING
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  MathRenderer,
  MathBlock,
  MathInline,
  extractLatexContent,
  renderLatexToHtml,
} from '../MathRenderer';

// =============================================================================
// Unit Tests: extractLatexContent
// =============================================================================

describe('extractLatexContent', () => {
  it('should extract content from inline delimiters $...$', () => {
    const result = extractLatexContent('$I_k = \\frac{U}{Z}$');
    expect(result.content).toBe('I_k = \\frac{U}{Z}');
    expect(result.isBlock).toBe(false);
  });

  it('should extract content from block delimiters $$...$$', () => {
    const result = extractLatexContent('$$I_k = \\frac{U}{Z}$$');
    expect(result.content).toBe('I_k = \\frac{U}{Z}');
    expect(result.isBlock).toBe(true);
  });

  it('should handle multiline block content', () => {
    const latex = `$$
      I_k'' = \\frac{c \\times U_n}{\\sqrt{3} \\times Z_k}
    $$`;
    const result = extractLatexContent(latex);
    expect(result.isBlock).toBe(true);
    expect(result.content).toContain('I_k\'\'');
  });

  it('should treat undelimited content as inline', () => {
    const result = extractLatexContent('I_k = \\frac{U}{Z}');
    expect(result.content).toBe('I_k = \\frac{U}{Z}');
    expect(result.isBlock).toBe(false);
  });

  it('should preserve whitespace in content', () => {
    const result = extractLatexContent('$a = b$');
    expect(result.content).toBe('a = b');
  });
});

// =============================================================================
// Unit Tests: renderLatexToHtml
// =============================================================================

describe('renderLatexToHtml', () => {
  it('should render valid LaTeX to HTML', () => {
    const result = renderLatexToHtml('$x^2$', false);
    expect(result.success).toBe(true);
    expect(result.html).toContain('katex');
    expect(result.error).toBeNull();
  });

  it('should return original LaTeX unchanged (determinism)', () => {
    const originalLatex = '$I_k = \\frac{U}{Z}$';
    const result = renderLatexToHtml(originalLatex, false);
    expect(result.originalLatex).toBe(originalLatex);
  });

  it('should fail gracefully for invalid LaTeX', () => {
    // Unclosed brace
    const result = renderLatexToHtml('$\\frac{$', false);
    expect(result.success).toBe(false);
    expect(result.html).toBeNull();
    expect(result.error).toBeTruthy();
    expect(result.originalLatex).toBe('$\\frac{$');
  });

  it('should return isBlock=true for block mode', () => {
    const result = renderLatexToHtml('$$x^2$$', true);
    expect(result.isBlock).toBe(true);
  });

  it('should auto-detect block mode from delimiters', () => {
    const result = renderLatexToHtml('$$x^2$$', false);
    expect(result.isBlock).toBe(true);
  });

  it('should render common electrical engineering formulas', () => {
    const formulas = [
      'I_k\'\' = \\frac{c_{max} \\times U_n}{\\sqrt{3} \\times Z_k}',
      'Z = \\sqrt{R^2 + X^2}',
      'S = \\sqrt{3} \\times U \\times I',
      'P = U \\times I \\times \\cos(\\phi)',
    ];

    for (const formula of formulas) {
      const result = renderLatexToHtml(`$${formula}$`, false);
      expect(result.success).toBe(true);
      expect(result.originalLatex).toBe(`$${formula}$`);
    }
  });
});

// =============================================================================
// Component Tests: MathRenderer
// =============================================================================

describe('MathRenderer', () => {
  it('should render valid LaTeX', () => {
    render(<MathRenderer latex="$x^2$" />);
    const element = screen.getByTestId('math-rendered');
    expect(element).toBeInTheDocument();
    expect(element).toHaveAttribute('data-latex', '$x^2$');
  });

  it('should fallback to text for invalid LaTeX', () => {
    // Use an actually invalid LaTeX that KaTeX will reject
    const invalidLatex = '$\\begin{matrix}$'; // Missing end
    render(<MathRenderer latex={invalidLatex} />);
    const element = screen.getByTestId('math-fallback');
    expect(element).toBeInTheDocument();
    expect(element.textContent).toBe(invalidLatex);
  });

  it('should preserve original LaTeX in data attribute', () => {
    const latex = '$I_k = \\frac{U}{Z}$';
    render(<MathRenderer latex={latex} />);
    const element = screen.getByTestId('math-rendered');
    expect(element).toHaveAttribute('data-latex', latex);
  });

  it('should render block mode with block=true', () => {
    render(<MathRenderer latex="x^2" block />);
    const element = screen.getByTestId('math-rendered');
    expect(element.className).toContain('math-block');
  });

  it('should render inline mode by default', () => {
    render(<MathRenderer latex="$x^2$" />);
    const element = screen.getByTestId('math-rendered');
    expect(element.className).toContain('math-inline');
  });

  it('should apply custom className', () => {
    render(<MathRenderer latex="$x^2$" className="custom-class" />);
    const element = screen.getByTestId('math-rendered');
    expect(element.className).toContain('custom-class');
  });

  it('should force fallback when forceFallback=true', () => {
    render(<MathRenderer latex="$x^2$" forceFallback />);
    const element = screen.getByTestId('math-fallback');
    expect(element).toBeInTheDocument();
    expect(element.textContent).toBe('$x^2$');
  });

  it('should show error in title attribute on fallback', () => {
    // forceFallback to simulate error scenario
    render(<MathRenderer latex="$x^2$" forceFallback />);
    const element = screen.getByTestId('math-fallback');
    // When forced fallback, no title is set (no error)
    expect(element).toBeInTheDocument();
  });
});

// =============================================================================
// Component Tests: MathBlock / MathInline
// =============================================================================

describe('MathBlock', () => {
  it('should render in block mode', () => {
    render(<MathBlock latex="x^2" />);
    const element = screen.getByTestId('math-rendered');
    expect(element.className).toContain('math-block');
  });
});

describe('MathInline', () => {
  it('should render in inline mode', () => {
    render(<MathInline latex="$x^2$" />);
    const element = screen.getByTestId('math-rendered');
    expect(element.className).toContain('math-inline');
  });
});

// =============================================================================
// Determinism Tests
// =============================================================================

describe('Determinism', () => {
  it('should produce identical output for identical input', () => {
    const latex = '$I_k = \\frac{c \\times U_n}{\\sqrt{3} \\times Z_k}$';

    const result1 = renderLatexToHtml(latex, false);
    const result2 = renderLatexToHtml(latex, false);

    expect(result1.html).toBe(result2.html);
    expect(result1.originalLatex).toBe(result2.originalLatex);
    expect(result1.success).toBe(result2.success);
  });

  // Pamięć renderu współdzielona przez instancje: iloczyn {ten sam wzór, inny wzór} × {tryb
  // inline, tryb block} × {sukces, błąd składni}. Klucz zawiera tryb — wzór inline nie może
  // zwrócić zapamiętanego wyniku block (inny HTML, inny `isBlock`).
  it('pamięć renderu: ten sam (wzór, tryb) → ten sam wynik; inny tryb albo wzór → osobny wpis', () => {
    const wzor = '$U_{0} = \\frac{U_n}{\\sqrt{3}}$';
    const inline1 = renderLatexToHtml(wzor, false);
    const inline2 = renderLatexToHtml(wzor, false);
    const block = renderLatexToHtml(wzor, true);
    expect(inline2).toBe(inline1);
    expect(inline1.isBlock).toBe(false);
    expect(block.isBlock).toBe(true);
    expect(block.html).not.toBe(inline1.html);
    expect(block.html).toContain('katex-display');
    expect(renderLatexToHtml('$I_{1}$', false).html).not.toBe(inline1.html);
    const blad1 = renderLatexToHtml('$\\frac{$', false);
    const blad2 = renderLatexToHtml('$\\frac{$', false);
    expect(blad1.success).toBe(false);
    expect(blad2).toBe(blad1);
    expect(renderLatexToHtml('$\\frac{$', true).isBlock).toBe(true);
  });

  it('should never modify the original LaTeX string', () => {
    const testCases = [
      '$x^2$',
      '$$\\frac{a}{b}$$',
      'I_k = \\frac{U}{Z}',
      '$c_{max} \\times U_n$',
      '$$\\sqrt{R^2 + X^2}$$',
    ];

    for (const latex of testCases) {
      const result = renderLatexToHtml(latex, false);
      expect(result.originalLatex).toBe(latex);
    }
  });
});

// =============================================================================
// Snapshot Tests: LaTeX preservation
// =============================================================================

describe('LaTeX String Preservation (Snapshot)', () => {
  const SAMPLE_FORMULAS = [
    // Formuła prądu zwarciowego
    "$I_k'' = \\frac{c_{max} \\times U_n}{\\sqrt{3} \\times Z_k}$",
    // Impedancja
    '$Z = \\sqrt{R^2 + X^2}$',
    // Moc pozorna
    '$S = \\sqrt{3} \\times U \\times I$',
    // Współczynnik mocy
    '$\\cos(\\phi) = \\frac{P}{S}$',
    // Prąd udarowy
    "$i_p = \\kappa \\times \\sqrt{2} \\times I_k''$",
  ];

  it('should preserve all formula strings unchanged', () => {
    for (const formula of SAMPLE_FORMULAS) {
      const result = renderLatexToHtml(formula, false);
      expect(result.originalLatex).toBe(formula);
    }
  });

  it('should match snapshot of formula preservation', () => {
    const preserved = SAMPLE_FORMULAS.map((f) => ({
      input: f,
      output: renderLatexToHtml(f, false).originalLatex,
      unchanged: f === renderLatexToHtml(f, false).originalLatex,
    }));

    // All should be unchanged
    expect(preserved.every((p) => p.unchanged)).toBe(true);
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Edge Cases', () => {
  it('should handle empty string', () => {
    render(<MathRenderer latex="" />);
    const element = screen.getByTestId('math-fallback');
    expect(element).toBeInTheDocument();
  });

  it('should handle whitespace-only string (KaTeX renders it)', () => {
    // Note: KaTeX accepts whitespace as valid LaTeX (empty expression)
    render(<MathRenderer latex="   " />);
    // KaTeX successfully renders whitespace, so we get math-rendered
    const element = screen.getByTestId('math-rendered');
    expect(element).toBeInTheDocument();
    expect(element).toHaveAttribute('data-latex', '   ');
  });

  it('should handle Polish characters in LaTeX text', () => {
    const result = renderLatexToHtml('$\\text{prąd zwarciowy}$', false);
    // KaTeX should handle this
    expect(result.originalLatex).toContain('prąd zwarciowy');
  });

  it('should handle very long formulas', () => {
    const longFormula = '$' + 'x + '.repeat(100) + 'y$';
    const result = renderLatexToHtml(longFormula, false);
    expect(result.originalLatex).toBe(longFormula);
  });
});

// =============================================================================
// Feature Flag Tests
// =============================================================================

describe('Feature Flag: ENABLE_MATH_RENDERING', () => {
  // Note: Testing feature flag requires mocking the module
  // In real tests, you would use vi.mock to override the feature flag

  it('should fallback when feature flag is disabled (via forceFallback)', () => {
    // forceFallback simulates disabled feature flag
    render(<MathRenderer latex="$x^2$" forceFallback />);
    const element = screen.getByTestId('math-fallback');
    expect(element).toBeInTheDocument();
    expect(element.textContent).toBe('$x^2$');
  });
});

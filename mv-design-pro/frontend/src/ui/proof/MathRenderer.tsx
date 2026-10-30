/**
 * MathRenderer — Renderowanie wzorów matematycznych LaTeX (KaTeX)
 *
 * CANONICAL ALIGNMENT:
 * - Warstwa PREZENTACJI — nic nie liczy, nic nie modyfikuje
 * - LaTeX string jest SOURCE OF TRUTH
 * - Determinism: ten sam input → to samo wyjście wizualne
 *
 * FEATURES:
 * - Inline mode: $...$ (tekst z formułą)
 * - Block mode: $$...$$ (formuła wycentrowana)
 * - Fail-safe: błąd KaTeX → fallback do tekstu
 * - Feature flag: ENABLE_MATH_RENDERING
 *
 * BINDING RULES:
 * - NIE modyfikuj stringa LaTeX
 * - NIE "naprawiaj" składni
 * - NIE parsuj własnym parserem
 *
 * @module ui/proof/MathRenderer
 */

import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { featureFlags } from '../config/featureFlags';
import { latexNaTekst } from './latexTekst';

// =============================================================================
// Types
// =============================================================================

export interface MathRendererProps {
  /** String LaTeX do renderowania — źródło prawdy, nie modyfikowany */
  latex: string;
  /** Wymuszenie trybu block ($$...$$), domyślnie wykrywane automatycznie */
  block?: boolean;
  /** Klasa CSS dla kontenera */
  className?: string;
  /** Czy wymusić fallback do tekstu (debug mode) */
  forceFallback?: boolean;
}

export interface MathRenderResult {
  /** Czy rendering się powiódł */
  success: boolean;
  /** HTML do wstrzyknięcia (jeśli success=true) */
  html: string | null;
  /** Błąd KaTeX (jeśli success=false) */
  error: string | null;
  /** Czy rendering był w trybie block */
  isBlock: boolean;
  /** Oryginalny string LaTeX (niemodyfikowany) */
  originalLatex: string;
}

// =============================================================================
// Constants
// =============================================================================

/** Regex do wykrywania delimitera block ($$...$$) */
const BLOCK_DELIMITER_REGEX = /^\$\$([\s\S]*)\$\$$/;

/** Regex do wykrywania delimitera inline ($...$) */
const INLINE_DELIMITER_REGEX = /^\$([\s\S]*)\$$/;

// =============================================================================
// Core Logic
// =============================================================================

/**
 * Wyodrębnij czysty LaTeX z delimiterów.
 * NIE modyfikuje treści formuły — tylko usuwa $ / $$.
 *
 * @param latex - String LaTeX (może zawierać delimitery $...$ lub $$...$$)
 * @returns { content: string, isBlock: boolean }
 */
export function extractLatexContent(latex: string): { content: string; isBlock: boolean } {
  const trimmed = latex.trim();

  // Sprawdź block mode: $$...$$
  const blockMatch = trimmed.match(BLOCK_DELIMITER_REGEX);
  if (blockMatch) {
    return { content: blockMatch[1], isBlock: true };
  }

  // Sprawdź inline mode: $...$
  const inlineMatch = trimmed.match(INLINE_DELIMITER_REGEX);
  if (inlineMatch) {
    return { content: inlineMatch[1], isBlock: false };
  }

  // Brak delimiterów — traktuj jako inline bez delimiterów
  return { content: trimmed, isBlock: false };
}

/**
 * Renderuj LaTeX do HTML za pomocą KaTeX.
 *
 * DETERMINISM: Ten sam input → to samo wyjście.
 * FAIL-SAFE: Błąd KaTeX → zwróć error, bez crasha.
 *
 * @param latex - String LaTeX do renderowania
 * @param displayMode - Czy tryb block (true) czy inline (false)
 * @returns MathRenderResult
 */
export function renderLatexToHtml(latex: string, displayMode: boolean): MathRenderResult {
  // Zachowaj oryginalny string — NIEMODYFIKOWANY
  const originalLatex = latex;

  // Wyodrębnij treść (usuń delimitery $ / $$)
  const { content, isBlock } = extractLatexContent(latex);
  const effectiveDisplayMode = displayMode || isBlock;

  try {
    const html = katex.renderToString(content, {
      displayMode: effectiveDisplayMode,
      throwOnError: true,
      strict: 'warn',
      trust: false, // Bezpieczeństwo: nie ufaj makrom
      output: 'html', // HTML output (nie MathML)
    });

    return {
      success: true,
      html,
      error: null,
      isBlock: effectiveDisplayMode,
      originalLatex,
    };
  } catch (err) {
    // KaTeX error — fallback do tekstu
    const errorMessage = err instanceof Error ? err.message : 'Błąd renderowania';
    return {
      success: false,
      html: null,
      error: errorMessage,
      isBlock: effectiveDisplayMode,
      originalLatex,
    };
  }
}

// =============================================================================
// React Component
// =============================================================================

/**
 * MathRenderer — Komponent React do renderowania LaTeX.
 *
 * Obsługuje:
 * - Inline mode: $...$ (tekst z formułą)
 * - Block mode: $$...$$ (formuła wycentrowana)
 * - Automatyczne wykrywanie trybu z delimiterów
 * - Fallback do tekstu przy błędzie KaTeX
 * - Feature flag ENABLE_MATH_RENDERING
 *
 * @example
 * // Inline
 * <MathRenderer latex="$I_k = \frac{U}{Z}$" />
 *
 * // Block
 * <MathRenderer latex="$$I_k'' = \frac{c \times U_n}{\sqrt{3} \times Z_k}$$" />
 *
 * // Bez delimiterów (traktowane jako inline)
 * <MathRenderer latex="I_k = \frac{U}{Z}" />
 */
export function MathRenderer({
  latex,
  block = false,
  className = '',
  forceFallback = false,
}: MathRendererProps) {
  // Sprawdź feature flag
  const isMathRenderingEnabled = featureFlags.ENABLE_MATH_RENDERING;

  // Renderuj LaTeX — memoizacja dla determinism
  const result = useMemo(() => {
    if (!latex || forceFallback || !isMathRenderingEnabled) {
      return {
        success: false,
        html: null,
        error: null,
        isBlock: block,
        originalLatex: latex,
      };
    }
    return renderLatexToHtml(latex, block);
  }, [latex, block, forceFallback, isMathRenderingEnabled]);

  // Fallback: wyświetl czysty tekst LaTeX
  if (!result.success || !result.html) {
    return (
      <code
        className={`math-fallback normal-case font-mono text-slate-800 whitespace-pre-wrap break-words ${className}`}
        data-testid="math-fallback"
        data-latex={latex}
        title={result.error ?? undefined}
      >
        {latex}
      </code>
    );
  }

  // Sukces: renderuj HTML z KaTeX
  // `normal-case`: symbol nie podlega `text-transform` kontenera (nagłówki i etykiety
  // `uppercase` zamieniłyby `I_{th}` na `I_{TH}` — inny symbol).
  const containerClassName = result.isBlock
    ? `math-block normal-case text-center my-2 ${className}`
    : `math-inline normal-case ${className}`;

  // KaTeX w trybie `html` oznacza swój znacznik `aria-hidden` — bez `role="math"` i odczytu
  // `aria-label` wzór byłby niewidoczny dla czytnika ekranu i nazwy dostępnej (przycisk,
  // komórka tabeli). Odczyt z tej samej funkcji co atrybuty `title` (`latexNaTekst`).
  return (
    <span
      className={containerClassName}
      role="math"
      aria-label={latexNaTekst(extractLatexContent(latex).content)}
      data-testid="math-rendered"
      data-latex={latex}
      dangerouslySetInnerHTML={{ __html: result.html }}
    />
  );
}

/**
 * MathBlock — Wrapper dla trybu block ($$...$$).
 * Convenience component dla czytelności.
 */
export function MathBlock({
  latex,
  className = '',
  forceFallback = false,
}: Omit<MathRendererProps, 'block'>) {
  return (
    <MathRenderer
      latex={latex}
      block
      className={className}
      forceFallback={forceFallback}
    />
  );
}

/**
 * MathInline — Wrapper dla trybu inline ($...$).
 * Convenience component dla czytelności.
 */
export function MathInline({
  latex,
  className = '',
  forceFallback = false,
}: Omit<MathRendererProps, 'block'>) {
  return (
    <MathRenderer
      latex={latex}
      block={false}
      className={className}
      forceFallback={forceFallback}
    />
  );
}

// =============================================================================
// Export
// =============================================================================

export default MathRenderer;

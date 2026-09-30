/**
 * ui/proof — prezentacja dowodu obliczeń (matematyka KaTeX, pakiet LaTeX,
 * dowód obliczeniowy elementu).
 *
 * COMPONENTS:
 * - MathRenderer / MathBlock / MathInline: renderer LaTeX (KaTeX)
 * - ProofLatexPanel: pobranie pakietu dowodu w LaTeX z backendu
 * - ElementCalculationProofPanel: dowód obliczeniowy wskazanego elementu
 *
 * Karta AB-1a Pakiet L (2026-09-23): trzypanelowa przeglądarka śladu
 * (`TraceViewer`, `TraceToc`, `TraceStepView`, `TraceMetadataPanel` z zaszytym
 * napisem „Obliczenia zgodne z normą IEC 60909" — LEGACY_USUNAC E24), jej stan
 * URL (`traceUrlState`), eksport JSONL/PDF po stronie klienta (`export/**`),
 * wyszukiwarka (`search/**`), porównanie śladów (`compare/**`) oraz martwy klient
 * `traceExportApi` (trasa, której backend nie wystawia) SKASOWANE — cały zbiór był
 * symbolowo nieosiągalny od `main.tsx` i wszystkich wejść `*-harness-main.tsx`.
 *
 * NOTE: Nazwy kodowe NIGDY nie są eksportowane ani używane w UI.
 */

export { MathRenderer, MathBlock, MathInline } from './MathRenderer';
export type { MathRendererProps, MathRenderResult } from './MathRenderer';
export { ProofLatexPanel } from './ProofLatexPanel';
export {
  ElementCalculationProofPanel,
  resolveShortCircuitRowsForElement,
  resolveTraceStepsForElement,
} from './ElementCalculationProofPanel';
export {
  buildProofLatexUrl,
  fetchProofLatex,
  proofLatexFilename,
  downloadProofLatex,
} from './proofLatexApi';

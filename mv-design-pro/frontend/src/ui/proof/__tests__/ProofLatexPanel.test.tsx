import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProofLatexPanel } from '../ProofLatexPanel';
import { buildProofLatexUrl, proofLatexFilename } from '../proofLatexApi';

const SAMPLE_LATEX = String.raw`\documentclass[11pt]{article}
\begin{document}
\section*{Uzasadnienie inżynierskie obliczeń}
\[
I_{k}'' = \frac{c \cdot U_n}{\left|Z_k\right|}
\]
\textbf{Wynik:} 10.5 kA
\end{document}`;

describe('ProofLatexPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('pobiera i pokazuje pełny dokument LaTeX z kanonicznego endpointu obliczenia', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(SAMPLE_LATEX, {
        status: 200,
        headers: { 'Content-Type': 'application/x-tex; charset=utf-8' },
      }),
    );

    render(<ProofLatexPanel runId="run-tex-1" />);

    expect(screen.getByTestId('proof-latex-loading')).toBeInTheDocument();

    const source = await screen.findByTestId('proof-latex-source');
    expect(source).toHaveTextContent('\\documentclass[11pt]{article}');
    expect(source).toHaveTextContent("I_{k}'' = \\frac");
    expect(fetchMock).toHaveBeenCalledWith('/api/analysis-runs/run-tex-1/export/proof/latex', {
      method: 'GET',
      headers: { Accept: 'application/x-tex,text/plain,*/*' },
      signal: expect.any(AbortSignal),
    });
  });

  it('blokuje widok bez wybranego obliczenia i nie wykonuje pobrania', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    render(<ProofLatexPanel runId={null} />);

    expect(screen.getByTestId('proof-latex-empty')).toHaveTextContent('Nie wybrano ostatniego obliczenia');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('kopiuje dokładnie pobrane źródło LaTeX do schowka', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(SAMPLE_LATEX, { status: 200 }));

    render(<ProofLatexPanel runId="run-copy" />);

    await screen.findByTestId('proof-latex-source');
    fireEvent.click(screen.getByTestId('proof-latex-copy'));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(SAMPLE_LATEX);
      expect(screen.getByTestId('proof-latex-copy-status')).toHaveTextContent('Skopiowano pełny LaTeX');
    });
  });

  it('buduje stabilny URL i nazwę pliku dla źródła .tex', () => {
    expect(buildProofLatexUrl('abc/def')).toBe('/api/analysis-runs/abc%2Fdef/export/proof/latex');
    expect(proofLatexFilename('12345678-aaaa')).toBe('uzasadnienie-inzynierskie-12345678.tex');
  });
});

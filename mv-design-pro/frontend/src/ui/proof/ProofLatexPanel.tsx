import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  downloadProofLatex,
  fetchProofLatex,
  proofLatexFilename,
} from './proofLatexApi';

type ProofLatexState =
  | { status: 'idle'; source: string; error: null }
  | { status: 'loading'; source: string; error: null }
  | { status: 'ready'; source: string; error: null }
  | { status: 'error'; source: string; error: string };

const EMPTY_STATE: ProofLatexState = { status: 'idle', source: '', error: null };

function countLines(source: string): number {
  if (!source) return 0;
  return source.split(/\r\n|\r|\n/).length;
}

function formatBytes(source: string): string {
  const bytes = new TextEncoder().encode(source).length;
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toLocaleString('pl-PL', { maximumFractionDigits: 1 })} kB`;
}

interface ProofLatexPanelProps {
  readonly runId: string | null;
}

export function ProofLatexPanel({ runId }: ProofLatexPanelProps): JSX.Element {
  const [state, setState] = useState<ProofLatexState>(EMPTY_STATE);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  const loadLatex = useCallback(() => {
    if (!runId) {
      setState(EMPTY_STATE);
      return undefined;
    }

    const controller = new AbortController();
    setState({ status: 'loading', source: '', error: null });
    setCopyStatus('idle');

    fetchProofLatex(runId, controller.signal)
      .then((source) => {
        setState({ status: 'ready', source, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          source: '',
          error: error instanceof Error ? error.message : 'Nieznany błąd pobierania wywodu.',
        });
      });

    return () => controller.abort();
  }, [runId]);

  useEffect(() => loadLatex(), [loadLatex]);

  const lineCount = useMemo(() => countLines(state.source), [state.source]);
  const byteSize = useMemo(() => formatBytes(state.source), [state.source]);
  const filename = useMemo(() => (runId ? proofLatexFilename(runId) : 'uzasadnienie-inzynierskie.tex'), [runId]);

  const copyLatex = async () => {
    if (!state.source) return;
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable');
      }
      await navigator.clipboard.writeText(state.source);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  };

  const downloadLatex = () => {
    if (!runId || !state.source) return;
    downloadProofLatex(runId, state.source);
  };

  return (
    <section
      data-testid="proof-latex-panel"
      className="space-y-3 rounded-lg border border-slate-700/80 bg-slate-950/70 p-4 text-slate-100"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
            Pełny wywód matematyczny
          </div>
          <h3 className="mt-1 text-base font-semibold text-white">
            Uzasadnienie inżynierskie w LaTeX
          </h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-300">
            Widok pokazuje źródłowy dokument `.tex` pobrany z zamrożonego artefaktu backendowego.
            Warstwa UI niczego nie przelicza i nie uzupełnia ręcznie.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="proof-latex-refresh"
            onClick={() => loadLatex()}
            disabled={!runId || state.status === 'loading'}
            className="rounded border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Odśwież
          </button>
          <button
            type="button"
            data-testid="proof-latex-copy"
            onClick={copyLatex}
            disabled={state.status !== 'ready' || !state.source}
            className="rounded border border-cyan-500/70 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Kopiuj LaTeX
          </button>
          <button
            type="button"
            data-testid="proof-latex-download"
            onClick={downloadLatex}
            disabled={state.status !== 'ready' || !state.source}
            className="rounded bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Pobierz .tex
          </button>
        </div>
      </div>

      {!runId ? (
        <div
          data-testid="proof-latex-empty"
          className="rounded border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-100"
        >
          Nie wybrano ostatniego obliczenia. Najpierw wykonaj obliczenia albo otwórz wynik z historii.
        </div>
      ) : state.status === 'loading' ? (
        <div
          data-testid="proof-latex-loading"
          className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300"
        >
          Pobieram pełny dokument LaTeX z backendowego śladu obliczeń.
        </div>
      ) : state.status === 'error' ? (
        <div
          data-testid="proof-latex-error"
          className="rounded border border-rose-500/50 bg-rose-950/30 px-3 py-2 text-sm text-rose-100"
        >
          Nie udało się pobrać pełnego wywodu LaTeX: {state.error}
        </div>
      ) : (
        <>
          <div className="grid gap-2 text-xs md:grid-cols-4">
            <div className="rounded border border-slate-700 bg-slate-900 px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-slate-500">Format</div>
              <div className="mt-1 font-semibold text-slate-100">LaTeX `.tex`</div>
            </div>
            <div className="rounded border border-slate-700 bg-slate-900 px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-slate-500">Liczba linii</div>
              <div className="mt-1 font-semibold text-slate-100">{lineCount}</div>
            </div>
            <div className="rounded border border-slate-700 bg-slate-900 px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-slate-500">Rozmiar</div>
              <div className="mt-1 font-semibold text-slate-100">{byteSize}</div>
            </div>
            <div className="rounded border border-slate-700 bg-slate-900 px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-slate-500">Plik</div>
              <div className="mt-1 break-all font-semibold text-slate-100">{filename}</div>
            </div>
          </div>

          {copyStatus !== 'idle' && (
            <div
              data-testid="proof-latex-copy-status"
              className={
                copyStatus === 'copied'
                  ? 'rounded border border-emerald-500/50 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-100'
                  : 'rounded border border-amber-500/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-100'
              }
            >
              {copyStatus === 'copied'
                ? 'Skopiowano pełny LaTeX do schowka.'
                : 'Nie udało się skopiować automatycznie. Zaznacz tekst w panelu źródłowym.'}
            </div>
          )}

          <pre
            data-testid="proof-latex-source"
            className="max-h-[62vh] overflow-auto whitespace-pre rounded border border-slate-700 bg-[#05070b] p-4 font-mono text-[11px] leading-5 text-slate-100"
            aria-label="Pełne źródło LaTeX uzasadnienia inżynierskiego"
          >
            {state.source}
          </pre>
        </>
      )}
    </section>
  );
}

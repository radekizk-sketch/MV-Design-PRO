/**
 * ZrodloLatex — źródło `.tex` wywodu (karta KD-4, ZAMKNIĘCIE luki L-10).
 *
 * CO ZASTĘPUJE. Zdolność „kopiuj / pobierz źródło LaTeX" miał wyłącznie most
 * (`ProofLatexPanel` na trasie `#proof`); zakładka „Dowód obliczeń" w powłoce
 * pokazywała kroki, ale bez wyjścia do dokumentu źródłowego — inżynier musiał
 * wracać starym adresem.
 *
 * REUŻYCIE, NIE DUPLIKACJA: dostawcą jest ten sam klient co w moście
 * (`fetchProofLatex` / `downloadProofLatex` / `proofLatexFilename` →
 * `GET /api/analysis-runs/{run_id}/export/proof/latex`). Ten plik nic nie
 * generuje ani nie skleja LaTeX-a — pokazuje bajty backendu.
 */

import { useState } from 'react';

import {
  downloadProofLatex,
  fetchProofLatex,
  proofLatexFilename,
} from '../../../ui/proof/proofLatexApi';
import { DOWOD_STRINGS as T } from './strings';

type Stan =
  | { readonly rodzaj: 'zwiniete' }
  | { readonly rodzaj: 'pobiera' }
  | { readonly rodzaj: 'gotowe'; readonly zrodlo: string }
  | { readonly rodzaj: 'blad'; readonly komunikat: string };

export interface ZrodloLatexProps {
  /** Przebieg, którego wywód pobieramy. `null` = brak podstawy (uczciwy stan). */
  readonly runId: string | null;
}

export function ZrodloLatex({ runId }: ZrodloLatexProps) {
  const [stan, setStan] = useState<Stan>({ rodzaj: 'zwiniete' });
  const [kopiowanie, setKopiowanie] = useState<'brak' | 'ok' | 'blad'>('brak');

  if (!runId) return null;

  const pobierz = async () => {
    setStan({ rodzaj: 'pobiera' });
    setKopiowanie('brak');
    try {
      const zrodlo = await fetchProofLatex(runId);
      setStan({ rodzaj: 'gotowe', zrodlo });
    } catch (error) {
      setStan({
        rodzaj: 'blad',
        komunikat: error instanceof Error ? error.message : T.latexBlad,
      });
    }
  };

  const kopiuj = async () => {
    if (stan.rodzaj !== 'gotowe') return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(stan.zrodlo);
      setKopiowanie('ok');
    } catch {
      setKopiowanie('blad');
    }
  };

  return (
    <section className="mvd-dowod-latex" data-testid="mvd-dowod-latex">
      <div className="mvd-dowod-latex-glowa">
        <div>
          <span className="mvd-dowod-zakres-etyk">{T.latexEyebrow}</span>
          <p className="mvd-dowod-latex-opis">{T.latexOpis}</p>
        </div>
        <div className="mvd-dowod-latex-akcje">
          <button
            type="button"
            className="mvd-dowod-zakres-btn"
            data-testid="mvd-dowod-latex-pokaz"
            disabled={stan.rodzaj === 'pobiera'}
            onClick={() => void pobierz()}
          >
            {stan.rodzaj === 'pobiera' ? T.latexPobieranie : T.latexPokaz}
          </button>
          <button
            type="button"
            className="mvd-dowod-zakres-btn"
            data-testid="mvd-dowod-latex-kopiuj"
            disabled={stan.rodzaj !== 'gotowe'}
            onClick={() => void kopiuj()}
          >
            {kopiowanie === 'ok' ? T.latexSkopiowano : T.latexKopiuj}
          </button>
          <button
            type="button"
            className="mvd-dowod-zakres-btn"
            data-testid="mvd-dowod-latex-pobierz"
            disabled={stan.rodzaj !== 'gotowe'}
            onClick={() => {
              if (stan.rodzaj === 'gotowe') downloadProofLatex(runId, stan.zrodlo);
            }}
          >
            {`${T.latexPobierz} (${proofLatexFilename(runId)})`}
          </button>
        </div>
      </div>

      {kopiowanie === 'blad' && (
        <p className="mvd-dowod-latex-uwaga" data-testid="mvd-dowod-latex-kopia-blad">
          {T.latexKopiaBlad}
        </p>
      )}

      {stan.rodzaj === 'blad' && (
        <p className="mvd-dowod-latex-uwaga" data-testid="mvd-dowod-latex-blad">
          {T.latexBlad} {stan.komunikat}
        </p>
      )}

      {stan.rodzaj === 'gotowe' && (
        <pre className="mvd-dowod-latex-zrodlo mvd-num" data-testid="mvd-dowod-latex-zrodlo">
          {stan.zrodlo}
        </pre>
      )}
    </section>
  );
}

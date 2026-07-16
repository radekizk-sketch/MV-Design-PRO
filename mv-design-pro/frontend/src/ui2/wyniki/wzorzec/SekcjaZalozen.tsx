/*
 * Sekcja ZAŁOŻENIA wspólnego wzorca ekranu analizy (karta E8.1 §2). Zwijana,
 * domyślnie ROZWINIĘTA — „założenia są częścią wyniku" (W-602). W pełni sterowana
 * propsami; zero fizyki, zero wyliczeń. Każde założenie: etykieta PL + wartość +
 * jednostka (zawsze gdy dotyczy); pochodzenie/uwaga w dymku (`title`).
 */

import { useState } from 'react';
import type { WierszZalozenia } from './wzorzecModel';
import { WZORZEC_STRINGS } from './strings';

interface SekcjaZalozenProps {
  zalozenia: WierszZalozenia[];
  /** Stan początkowy — domyślnie rozwinięta (założenia są częścią wyniku). */
  domyslnieRozwinieta?: boolean;
}

export function SekcjaZalozen({ zalozenia, domyslnieRozwinieta = true }: SekcjaZalozenProps) {
  const [rozwinieta, setRozwinieta] = useState(domyslnieRozwinieta);

  return (
    <section className="mvd-wyn-zalozenia" data-testid="mvd-wyn-zalozenia">
      <button
        type="button"
        className="mvd-wyn-zalozenia-head"
        aria-expanded={rozwinieta}
        onClick={() => setRozwinieta((v) => !v)}
      >
        <span className="mvd-wyn-zalozenia-tytul">{WZORZEC_STRINGS.zalozeniaTytul}</span>
        <span className="mvd-wyn-zalozenia-zwijak">
          {rozwinieta ? WZORZEC_STRINGS.zwin : WZORZEC_STRINGS.rozwin}
        </span>
      </button>

      {rozwinieta && (
        <>
          <p className="mvd-wyn-zalozenia-opis">{WZORZEC_STRINGS.zalozeniaOpis}</p>
          {zalozenia.length === 0 ? (
            <p className="mvd-wyn-zalozenia-brak">{WZORZEC_STRINGS.brakZalozen}</p>
          ) : (
            <div className="mvd-wyn-zalozenia-lista" data-testid="mvd-wyn-zalozenia-lista">
              {zalozenia.map((z, i) => (
                <div
                  key={`${z.etykieta}-${i}`}
                  className="mvd-wyn-zalozenie"
                  title={z.uwaga}
                  data-testid="mvd-wyn-zalozenie"
                >
                  <span className="mvd-wyn-zalozenie-etykieta">{z.etykieta}</span>
                  <span className="mvd-wyn-zalozenie-wartosc mvd-num">
                    {z.wartosc}
                    {z.jednostka && <span className="mvd-wyn-unit">{z.jednostka}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

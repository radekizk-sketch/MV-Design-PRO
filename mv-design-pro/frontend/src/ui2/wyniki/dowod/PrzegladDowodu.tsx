/*
 * PRZEGLĄD DOWODU (karta E9.1 / W-608) — okno „Dowód obliczeń" w nowej powłoce.
 * Kompozycja: nagłówek (nazwa analizy PL + odcisk danych wejściowych w trybie
 * eksperckim) → spis kroków (lewa kolumna, nawigowalny klawiaturą) → widok
 * aktywnego kroku w kanonie pięciu pól. Stany: pusty ślad („przebieg bez śladu
 * obliczeń"), ładowanie — sterowane propsami.
 *
 * W pełni sterowany propsami — DANE PRZEZ PROPS (ładowanie śladu wpina zarządca
 * przy scaleniu). Read-only, zero fizyki (NOT-A-SOLVER), zero mutacji store'ów.
 * Identyfikatory (input_hash) wyłącznie w trybie eksperckim, jako wyrażenie `{...}`.
 */

import { useMemo, useState } from 'react';
import './dowod.css';
import type { TraceStep } from '../../../ui/results-inspector/types';
import type { AdvancementMode } from '../../shell/modeModel';
import { KrokDowodu } from './KrokDowodu';
import { SpisKrokow } from './SpisKrokow';
import { DOWOD_STRINGS } from './strings';
import { mapujKroki } from './dowodModel';

export interface PrzegladDowoduProps {
  /** Nazwa analizy po polsku (pierwszy plan). */
  analizaPL: string;
  /** Ślad WHITE BOX przebiegu (dane przez props; pusty = „przebieg bez śladu"). */
  kroki: TraceStep[];
  /** Odcisk danych wejściowych — pokazywany WYŁĄCZNIE w trybie eksperckim. */
  inputHash?: string;
  trybZaawansowania: AdvancementMode;
  /** Ślad w trakcie ładowania (sterowane propsami). */
  ladowanie?: boolean;
}

export function PrzegladDowodu({
  analizaPL,
  kroki,
  inputHash,
  trybZaawansowania,
  ladowanie,
}: PrzegladDowoduProps) {
  const model = useMemo(() => mapujKroki(kroki), [kroki]);
  const [wybrany, setWybrany] = useState(0);
  const trybEkspercki = trybZaawansowania === 'expert';

  if (ladowanie) {
    return (
      <div className="mvd-dowod" data-testid="mvd-dowod-ladowanie">
        <p className="mvd-dowod-ladowanie">{DOWOD_STRINGS.ladowanie}</p>
      </div>
    );
  }

  if (model.length === 0) {
    return (
      <div className="mvd-dowod" data-testid="mvd-dowod-pusty">
        <div className="mvd-dowod-pusty">
          <p className="mvd-dowod-pusty-title">{DOWOD_STRINGS.brakSladu}</p>
          <p className="mvd-dowod-pusty-desc">{DOWOD_STRINGS.brakSladuOpis}</p>
        </div>
      </div>
    );
  }

  const indeks = wybrany < model.length ? wybrany : 0;
  const pozycje = model.map((k) => ({ numer: k.numer, tytul: k.tytul }));

  return (
    <div className="mvd-dowod" data-testid="mvd-dowod">
      <header className="mvd-dowod-head" data-testid="mvd-dowod-naglowek">
        <h2 className="mvd-dowod-title">{analizaPL}</h2>
        {trybEkspercki && inputHash && (
          <span
            className="mvd-dowod-hash mvd-num"
            aria-label={DOWOD_STRINGS.odciskWejscia}
            data-testid="mvd-dowod-input-hash"
          >
            {inputHash}
          </span>
        )}
      </header>

      <div className="mvd-dowod-uklad">
        <nav className="mvd-dowod-spis-kol" aria-label={DOWOD_STRINGS.spisTytul}>
          <h3 className="mvd-dowod-spis-tytul">{DOWOD_STRINGS.spisTytul}</h3>
          <SpisKrokow pozycje={pozycje} aktywnyIndeks={indeks} onWybierz={setWybrany} />
        </nav>

        <div className="mvd-dowod-krok-kol">
          <KrokDowodu krok={model[indeks]} trybZaawansowania={trybZaawansowania} />
        </div>
      </div>
    </div>
  );
}

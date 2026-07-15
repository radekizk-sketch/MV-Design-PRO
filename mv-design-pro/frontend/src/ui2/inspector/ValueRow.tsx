/*
 * ValueRow — wiersz wartości siatki właściwości (karta E1.3 §1/§4a).
 *
 * Kontrakt: każda wartość liczbowa jest MONO z tabularnymi cyframi i jednostką;
 * 2× klik → onOtworzDowod(ref); pochodzenie danej widoczne w dymku
 * („Pochodzenie: {zrodlo}"). Dana pochodna nosi rewizję — rozjazd względem modelu
 * pokazuje współdzielony FreshnessBadge. Bez fizyki, bez wyliczeń — czysta prezentacja.
 */

import type { KeyboardEvent } from 'react';
import type { WartoscZJednostka } from './inspectorModel';
import { INSPECTOR_STRINGS, pochodzenieLabel } from './strings';
import { FreshnessBadge } from './FreshnessBadge';

interface ValueRowProps {
  etykieta: string;
  wartosc: WartoscZJednostka;
  /** Bieżąca rewizja modelu — do oceny świeżości danej pochodnej. */
  rewizjaModelu: number;
  onOtworzDowod: (ref: string) => void;
  onPrzelicz?: () => void;
}

export function ValueRow({
  etykieta,
  wartosc,
  rewizjaModelu,
  onOtworzDowod,
  onPrzelicz,
}: ValueRowProps) {
  const { wartosc: value, jednostka, rewizja, dowodRef, pochodzenie } = wartosc;
  const maDowod = dowodRef !== undefined;

  const otworzDowod = () => {
    if (dowodRef !== undefined) onOtworzDowod(dowodRef);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      otworzDowod();
    }
  };

  const valueNode = (
    <span className="mvd-insp-num">
      {value}
      {jednostka && <span className="mvd-insp-unit"> {jednostka}</span>}
    </span>
  );

  return (
    <div className="mvd-insp-kv-row">
      <span className="mvd-insp-kv-label">{etykieta}</span>
      <span className="mvd-insp-kv-value">
        {maDowod ? (
          <button
            type="button"
            className="mvd-insp-value-btn"
            aria-label={INSPECTOR_STRINGS.pokazDowod}
            title={INSPECTOR_STRINGS.pokazDowod}
            data-mvd-action="dowod"
            onDoubleClick={otworzDowod}
            onKeyDown={onKeyDown}
          >
            {valueNode}
          </button>
        ) : (
          valueNode
        )}
        {pochodzenie && (
          <span
            className="mvd-insp-origin"
            title={pochodzenieLabel(pochodzenie)}
            data-mvd-origin={pochodzenie}
            aria-label={pochodzenieLabel(pochodzenie)}
          >
            ⓘ
          </span>
        )}
        {rewizja !== undefined && (
          <FreshnessBadge
            rewizjaDanej={rewizja}
            rewizjaModelu={rewizjaModelu}
            onPrzelicz={onPrzelicz}
            pokazAktualne={false}
          />
        )}
      </span>
    </div>
  );
}

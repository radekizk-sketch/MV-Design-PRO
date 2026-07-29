/*
 * Wiersz pojedynczego przebiegu obliczeniowego (W-503, karta E7.2 §2). Analiza
 * PL, status PL tagiem, początek, czas trwania — w pełni sterowany propsami
 * (wzorzec `WierszProblemu`, `ui2/spaces/gotowosc/WierszProblemu.tsx`). Klik =
 * selekcja (pokazanie szczegółów w panelu obok — MODEL_INTERAKCJI §2).
 */

import type { RunStatus } from '../../../../ui/study-cases/types';
import type { PrzebiegWiersz } from './adapters/przebiegiAdapter';
import { formatCzas, PRZEBIEGI_STRINGS as T } from './strings';

const WARIANT_STATUSU: Record<RunStatus, string> = {
  PENDING: 'mvd-tag-mut',
  RUNNING: 'mvd-tag-warn',
  DONE: 'mvd-tag-ok',
  FAILED: 'mvd-tag-err',
};

interface WierszPrzebieguProps {
  przebieg: PrzebiegWiersz;
  zaznaczony: boolean;
  onKlik: () => void;
}

export function WierszPrzebiegu({ przebieg, zaznaczony, onKlik }: WierszPrzebieguProps) {
  return (
    <tr
      className={`mvd-przebiegi-wiersz${zaznaczony ? ' mvd-on' : ''}`}
      aria-selected={zaznaczony}
      onClick={onKlik}
      data-testid={`mvd-przebieg-wiersz-${przebieg.id}`}
    >
      <td>{przebieg.analiza}</td>
      <td>
        <span
          className={`mvd-tag ${WARIANT_STATUSU[przebieg.status]}`}
          data-testid={`mvd-przebieg-status-${przebieg.id}`}
        >
          {przebieg.statusLabel}
        </span>
      </td>
      <td className="mvd-przebiegi-czas">{formatCzas(przebieg.poczatekISO)}</td>
      <td className="mvd-przebiegi-czas">{przebieg.czasTrwania}</td>
      <td
        className="mvd-przebiegi-czas mvd-wkrotce-wartosc"
        title={T.pochodzenieWkrotce}
        data-testid={`mvd-przebieg-rewizja-${przebieg.id}`}
      >
        {T.brakWartosci}
      </td>
    </tr>
  );
}

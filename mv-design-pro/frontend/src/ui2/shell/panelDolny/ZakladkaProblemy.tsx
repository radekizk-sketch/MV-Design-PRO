/*
 * Zakładka „Problemy" panelu dolnego — gotowość modelu z `GET …/enm/readiness`
 * przez ISTNIEJĄCY store migawki (`useProblemyGotowosci`, ta sama projekcja co
 * przestrzeń „Gotowość"; zero drugiego odczytu). Klik problemu zaznacza element
 * (zdarzenie `selekcja` na szynie + schemat). Stan nieustalony gotowości nie
 * jest „brakiem problemów" (V12K-309 poz. 1).
 */

import { czyGotowoscUstalona, useProblemyGotowosci } from '../../spaces/gotowosc/adapters/gotowoscAdapter';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { sanitizePublicReadinessMessage } from '../../../ui/shared/publicReadinessMessage';
import type { ReadinessSeverity } from '../../../ui/types';
import type { KontekstPaneluDolnego } from './rejestrZakladek';

const WAGA: Record<ReadinessSeverity, string> = {
  BLOCKER: 'Blokada',
  IMPORTANT: 'Ostrzeżenie',
  INFO: 'Informacja',
};

/** Licznik zakładki: liczba problemów gotowości (tylko gdy gotowość jest odczytana). */
export function LicznikProblemow() {
  const readiness = useSnapshotStore((s) => s.readiness);
  const problemy = useProblemyGotowosci();
  if (!czyGotowoscUstalona(readiness)) return null;
  return (
    <span className="mvd-bottom-licznik mvd-num" data-testid="mvd-bottom-licznik-problemy">
      {problemy.length}
    </span>
  );
}

export function ZakladkaProblemy({ onWybierzElement }: KontekstPaneluDolnego) {
  const readiness = useSnapshotStore((s) => s.readiness);
  const problemy = useProblemyGotowosci();

  if (!czyGotowoscUstalona(readiness)) {
    return (
      <p className="mvd-dolny-stan" data-testid="mvd-problemy-nieustalone">
        Gotowość modelu nie została jeszcze odczytana z serwera.
      </p>
    );
  }
  if (problemy.length === 0) {
    return (
      <p className="mvd-dolny-stan" data-testid="mvd-problemy-brak">
        Brak problemów gotowości — model spełnia warunki obliczeń.
      </p>
    );
  }
  return (
    <ul className="mvd-dolny-lista" data-testid="mvd-problemy">
      {problemy.map((problem, indeks) => {
        const ref = problem.element_ref ?? problem.element_refs[0] ?? null;
        const waga = WAGA[problem.severity];
        const tresc = (
          <>
            <span className={`mvd-dolny-waga mvd-dolny-waga-${problem.severity.toLowerCase()}`}>{waga}</span>
            <span className="mvd-dolny-opis">{sanitizePublicReadinessMessage(problem.message_pl)}</span>
          </>
        );
        return (
          <li key={`${problem.code}:${ref ?? '-'}:${indeks}`}>
            {ref ? (
              <button
                type="button"
                className="mvd-dolny-wiersz"
                onClick={() => onWybierzElement(ref)}
                title="Pokaż element na schemacie (przejście do schematu i kadr) oraz w inspektorze"
                data-testid={`mvd-problem-${indeks}`}
              >
                {tresc}
              </button>
            ) : (
              <div className="mvd-dolny-wiersz mvd-dolny-wiersz-statyczny" data-testid={`mvd-problem-${indeks}`}>
                {tresc}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

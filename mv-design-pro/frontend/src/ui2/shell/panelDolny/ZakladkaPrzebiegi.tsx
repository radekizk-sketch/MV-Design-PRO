/*
 * Zakładka „Przebiegi" panelu dolnego — rejestr przebiegów z backendu
 * (`useExecutionRunsStore.runs`, hydratowany przez `useHydratacjaPowloki` z
 * `GET /api/execution/study-cases/{id}/runs`). Kolejność deterministyczna:
 * najnowszy znacznik czasu na górze, remis rozstrzyga identyfikator (JEDNA reguła
 * `kontekstWyniku.uporzadkujBiegi` — ta sama co panel „Wyniki", „Dowody" i pasek stanu).
 * Zakończony bieg prowadzi do swoich wyników (lądowisko K3).
 */

import { useMemo } from 'react';

import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { uporzadkujBiegi } from '../../wyniki/kontekst/kontekstWyniku';
import {
  etykietaAnalizy,
  etykietaStatusu,
  formatCzas,
} from '../../spaces/obliczenia/przebiegi/strings';
import type { KontekstPaneluDolnego } from './rejestrZakladek';

/** Licznik zakładki: liczba przebiegów aktywnego zakresu. */
export function LicznikPrzebiegow() {
  const liczba = useExecutionRunsStore((s) => s.runs.length);
  if (liczba === 0) return null;
  return (
    <span className="mvd-bottom-licznik mvd-num" data-testid="mvd-bottom-licznik-przebiegi">
      {liczba}
    </span>
  );
}

export function ZakladkaPrzebiegi({ onPokazWynikiBiegu }: KontekstPaneluDolnego) {
  const runs = useExecutionRunsStore((s) => s.runs);
  const uporzadkowane = useMemo(() => uporzadkujBiegi(runs), [runs]);

  if (uporzadkowane.length === 0) {
    return (
      <p className="mvd-dolny-stan" data-testid="mvd-przebiegi-brak">
        Aktywny zakres nie ma jeszcze przebiegów — uruchom obliczenie przyciskiem „Oblicz".
      </p>
    );
  }
  return (
    <ul className="mvd-dolny-lista" data-testid="mvd-przebiegi-dolne">
      {uporzadkowane.map((run) => {
        const tresc = (
          <>
            <span className="mvd-dolny-waga">{etykietaStatusu(run.status)}</span>
            <span className="mvd-dolny-opis">{etykietaAnalizy(run.analysis_type)}</span>
            <span className="mvd-num mvd-dolny-czas">{formatCzas(run.finished_at ?? run.started_at)}</span>
          </>
        );
        const doWynikow = run.status === 'DONE' && onPokazWynikiBiegu;
        return (
          <li key={run.id}>
            {doWynikow ? (
              <button
                type="button"
                className="mvd-dolny-wiersz"
                onClick={() => onPokazWynikiBiegu(run.id)}
                title="Otwórz wyniki tego przebiegu"
                data-testid={`mvd-przebieg-${run.id}`}
              >
                {tresc}
              </button>
            ) : (
              <div className="mvd-dolny-wiersz mvd-dolny-wiersz-statyczny" data-testid={`mvd-przebieg-${run.id}`}>
                {tresc}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

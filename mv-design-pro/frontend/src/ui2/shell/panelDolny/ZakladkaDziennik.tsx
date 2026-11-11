/*
 * Zakładka „Dziennik operacji" panelu dolnego — dziennik zmian modelu z
 * `GET /api/cases/{case_id}/enm/dziennik-zmian?od_rewizji=0`
 * (`backend/src/api/enm.py::get_dziennik_zmian`, klient `freshness/dziennikApi`).
 * Odczyt ponawiany przy każdej zmianie rewizji modelu; opisy operacji pochodzą
 * z kanonu backendu (zero interpretacji w UI). Najnowsza rewizja na górze.
 */

import { useEffect, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { pobierzDziennikZmian, type WpisDziennika } from '../../freshness/dziennikApi';
import { formatCzas } from '../../spaces/obliczenia/przebiegi/strings';
import type { KontekstPaneluDolnego } from './rejestrZakladek';

type StanDziennika =
  | { rodzaj: 'brak-zakresu' }
  | { rodzaj: 'wczytywanie' }
  | { rodzaj: 'blad'; komunikat: string }
  | { rodzaj: 'gotowy'; wpisy: readonly WpisDziennika[] };

export function ZakladkaDziennik({ onWybierzElement }: KontekstPaneluDolnego) {
  const caseIdMigawki = useSnapshotStore((s) => s.caseId);
  const caseIdAplikacji = useAppStateStore((s) => s.activeCaseId);
  const rewizja = useSnapshotStore((s) => s.snapshot?.header?.revision ?? null);
  const caseId = caseIdMigawki ?? caseIdAplikacji;
  const [stan, setStan] = useState<StanDziennika>({ rodzaj: 'wczytywanie' });

  useEffect(() => {
    if (!caseId) {
      setStan({ rodzaj: 'brak-zakresu' });
      return;
    }
    const przerwanie = new AbortController();
    setStan({ rodzaj: 'wczytywanie' });
    pobierzDziennikZmian(caseId, 0, { signal: przerwanie.signal })
      .then((dziennik) => {
        const wpisy = [...dziennik.wpisy].sort((a, b) => b.rewizja - a.rewizja);
        setStan({ rodzaj: 'gotowy', wpisy });
      })
      .catch((blad: unknown) => {
        if (przerwanie.signal.aborted) return;
        setStan({
          rodzaj: 'blad',
          komunikat: blad instanceof Error ? blad.message : 'Nie udało się pobrać dziennika operacji.',
        });
      });
    return () => przerwanie.abort();
  }, [caseId, rewizja]);

  if (stan.rodzaj === 'brak-zakresu') {
    return (
      <p className="mvd-dolny-stan" data-testid="mvd-dziennik-brak-zakresu">
        Brak aktywnego zakresu obliczeń — dziennik operacji dotyczy modelu zakresu.
      </p>
    );
  }
  if (stan.rodzaj === 'wczytywanie') {
    return (
      <p className="mvd-dolny-stan" role="status" data-testid="mvd-dziennik-wczytywanie">
        Wczytywanie dziennika operacji…
      </p>
    );
  }
  if (stan.rodzaj === 'blad') {
    return (
      <p className="mvd-dolny-stan mvd-dolny-blad" role="alert" data-testid="mvd-dziennik-blad">
        {stan.komunikat}
      </p>
    );
  }
  if (stan.wpisy.length === 0) {
    return (
      <p className="mvd-dolny-stan" data-testid="mvd-dziennik-pusty">
        Dziennik operacji jest pusty — model nie był jeszcze zmieniany.
      </p>
    );
  }
  return (
    <ul className="mvd-dolny-lista" data-testid="mvd-dziennik">
      {stan.wpisy.map((wpis) => {
        const pierwszy = wpis.zmienione[0] ?? wpis.utworzone[0] ?? null;
        return (
          <li key={wpis.rewizja} className="mvd-dolny-wiersz mvd-dolny-wiersz-statyczny" data-testid={`mvd-dziennik-${wpis.rewizja}`}>
            <span className="mvd-num mvd-dolny-rewizja">rew. {wpis.rewizja}</span>
            <span className="mvd-num mvd-dolny-czas">{formatCzas(wpis.znacznik_czasu)}</span>
            <span className="mvd-dolny-opis">{wpis.opis_pl}</span>
            <span className="mvd-num mvd-dolny-licznik" title="Elementy utworzone / zmienione / usunięte">
              +{wpis.utworzone.length} / ~{wpis.zmienione.length} / −{wpis.usuniete.length}
            </span>
            {pierwszy ? (
              <button
                type="button"
                className="mvd-btn mvd-dolny-akcja"
                onClick={() => onWybierzElement(pierwszy)}
                data-testid={`mvd-dziennik-pokaz-${wpis.rewizja}`}
              >
                Pokaż element
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

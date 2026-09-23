/*
 * Sekcja inspektora „Model dynamiczny" wytwórcy (karta AB-1a D3): dwie osie statusu
 * modelu urządzenia — RÓWNANIA (rodzina urządzeń wobec niezależnej wyroczni) i
 * PARAMETRY (egzemplarz/typ wobec pomiaru) — jako dwie odznaki, obok źródła i
 * odniesienia parametrów dynamicznych.
 *
 * ZERO oceny w UI: statusy wyprowadza backend
 * (`GET /api/projects/{p}/cases/{c}/generators/{ref}/status-modelu` —
 * `solver_input/status_modelu.py`, fail-closed „nieznany"). Wytwórca bez parametrów
 * dynamicznych dostaje uczciwy stan „brak parametrów dynamicznych", nie odznakę.
 */

import { useEffect, useState } from 'react';

import { useAppStateStore } from '../../ui/app-state';
import type { StatusModeluOdpowiedz } from '../wyniki/ocena/api';
import { OdznakiStatusuModelu } from '../wyniki/ocena/WynikWyjasniony';
import { INSPECTOR_STRINGS as T } from './strings';

interface WidokStatusuModelu {
  readonly generator_ref: string;
  readonly rodzina: string | null;
  readonly proweniencja: {
    readonly zrodlo: string;
    readonly odniesienie: string;
    readonly data: string | null;
  } | null;
  readonly status_modelu: StatusModeluOdpowiedz | null;
  readonly status_rownan_uzasadnienie_pl: string | null;
}

type Stan =
  | { readonly rodzaj: 'ladowanie' }
  | { readonly rodzaj: 'blad'; readonly komunikat: string }
  | { readonly rodzaj: 'gotowe'; readonly dane: WidokStatusuModelu };

/** Etykiety PL rodzin parametrów dynamicznych (kody kontraktu ENM). */
const RODZINA_PL: Record<string, string> = {
  synchroniczna: 'maszyna synchroniczna',
  przeksztaltnikowa_gfl: 'przekształtnik nadążny (GFL)',
  przeksztaltnikowa_gfm: 'przekształtnik tworzący sieć (GFM)',
  magazyn: 'magazyn energii',
  wiatr_typ_1: 'turbina wiatrowa typu 1',
  wiatr_typ_2: 'turbina wiatrowa typu 2',
  wiatr_typ_3: 'turbina wiatrowa typu 3',
  wiatr_typ_4: 'turbina wiatrowa typu 4',
};

/** Etykiety PL źródła parametrów (`ZrodloProweniencjiDynamiki`). */
const ZRODLO_PL: Record<string, string> = {
  karta_producenta: 'karta producenta',
  certyfikat_jednostki: 'certyfikat jednostki',
  profil_typowy_normy: 'profil typowy normy',
  deklaracja_uzytkownika: 'deklaracja użytkownika',
};

export function SekcjaModeluDynamicznego({ generatorRef }: { generatorRef: string }) {
  const activeProjectId = useAppStateStore((s) => s.activeProjectId);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const [stan, setStan] = useState<Stan>({ rodzaj: 'ladowanie' });

  useEffect(() => {
    if (!activeProjectId || !activeCaseId || !generatorRef) return;
    let anulowane = false;
    setStan({ rodzaj: 'ladowanie' });
    const url =
      `/api/projects/${encodeURIComponent(activeProjectId)}/cases/${encodeURIComponent(activeCaseId)}`
      + `/generators/${encodeURIComponent(generatorRef)}/status-modelu`;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Zapytanie ${url} nie powiodło się: ${r.status}`);
        return r.json() as Promise<WidokStatusuModelu>;
      })
      .then((dane) => {
        if (!anulowane) setStan({ rodzaj: 'gotowe', dane });
      })
      .catch((err: unknown) => {
        if (!anulowane) {
          setStan({ rodzaj: 'blad', komunikat: err instanceof Error ? err.message : T.modelDynBlad });
        }
      });
    return () => {
      anulowane = true;
    };
  }, [activeProjectId, activeCaseId, generatorRef]);

  if (!activeProjectId || !activeCaseId) return null;

  return (
    <section className="mvd-insp-section" data-testid="mvd-insp-model-dynamiczny">
      <h4 className="mvd-insp-section-head">{T.modelDynTytul}</h4>
      {stan.rodzaj === 'ladowanie' && (
        <p className="mvd-insp-empty" data-testid="mvd-insp-model-dynamiczny-ladowanie">
          {T.modelDynLadowanie}
        </p>
      )}
      {stan.rodzaj === 'blad' && (
        <p className="mvd-insp-empty" role="alert" data-testid="mvd-insp-model-dynamiczny-blad">
          {stan.komunikat}
        </p>
      )}
      {stan.rodzaj === 'gotowe' && stan.dane.status_modelu === null && (
        <p className="mvd-insp-empty" data-testid="mvd-insp-model-dynamiczny-brak">
          {T.modelDynBrak}
        </p>
      )}
      {stan.rodzaj === 'gotowe' && stan.dane.status_modelu !== null && (
        <div className="mvd-insp-kv-grid">
          <div className="mvd-insp-kv-row">
            <span className="mvd-insp-kv-label">{T.modelDynRodzina}</span>
            <span className="mvd-insp-kv-value">
              {stan.dane.rodzina ? RODZINA_PL[stan.dane.rodzina] ?? stan.dane.rodzina : '—'}
            </span>
          </div>
          {stan.dane.proweniencja !== null && (
            <>
              <div className="mvd-insp-kv-row">
                <span className="mvd-insp-kv-label">{T.modelDynZrodlo}</span>
                <span className="mvd-insp-kv-value">
                  {ZRODLO_PL[stan.dane.proweniencja.zrodlo] ?? stan.dane.proweniencja.zrodlo}
                </span>
              </div>
              <div className="mvd-insp-kv-row">
                <span className="mvd-insp-kv-label">{T.modelDynOdniesienie}</span>
                <span className="mvd-insp-kv-value">{stan.dane.proweniencja.odniesienie}</span>
              </div>
            </>
          )}
          <div className="mvd-insp-kv-row">
            <span className="mvd-insp-kv-label">{T.modelDynStatus}</span>
            <span className="mvd-insp-kv-value" title={stan.dane.status_rownan_uzasadnienie_pl ?? undefined}>
              <OdznakiStatusuModelu
                status={stan.dane.status_modelu}
                testid="mvd-insp-model-dynamiczny-status"
              />
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

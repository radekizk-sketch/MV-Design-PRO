/*
 * Panel „Serie przebiegów" (przestrzeń „Obliczenia", karta BATCH-ROUTER).
 * Powierzchnia serii/wsadu przebiegów: uruchomienie wielu scenariuszy
 * zwarciowych jako jednej serii + lista wykonanych serii ze statusami
 * i wejściem w wyniki pojedynczego przebiegu przez istniejące lądowisko K3
 * (callback `onPokazWyniki(runId)` — ta sama para `setActiveRun` + przejście
 * do przestrzeni „Wyniki", którą wykonuje integrator dla `PrzebiegiPanel`).
 *
 * DEKLARACJA POWIĄZAŃ (SPEC_POWIAZANIA_WARSTW §5):
 *   Źródła danych: `useBatchRunsStore` (serie — realne końcówki
 *     /api/execution/study-cases/{id}/batches + /api/execution/batches/{id}/
 *     execute), `useFaultScenariosStore` (scenariusze do zaznaczenia — TEN SAM
 *     store co `PanelScenariuszy`), `useExecutionRunsStore` (statusy biegów
 *     serii — jedno źródło biegów, reguła S9-11 „nie licz stanu osobno").
 *   Emituje: nic bezpośrednio — akcje `onPokazWyniki(runId)` oraz
 *     `onPrzejdzDoScenariuszy()` (stan zerowy z akcją) przez propsy.
 *   Nawigacja: ZERO nawigacji w torze wykonania serii (S9-11 — wyniki
 *     osiągalne wyłącznie jawnym klikiem „Pokaż wyniki").
 *
 * Zero fizyki, zero mutacji NetworkModelu, zero fabrykacji: każda kontrolka
 * mapuje na realną końcówkę backendu (tworzenie+wykonanie serii, wykonanie
 * serii PENDING, wejście w wyniki biegu).
 */

import { useEffect, useState } from 'react';

import './serie.css';
import { useAppStateStore } from '../../../../ui/app-state';
import { useFaultScenariosStore } from '../../../../ui/fault-scenarios/store';
import { useBatchRunsStore } from '../../../../ui/study-cases/batchStore';
import type { RunStatus } from '../../../../ui/study-cases/types';
import type { AdvancementMode } from '../../../shell/modeModel';
import type { SeriaWiersz } from './adapters/serieAdapter';
import {
  useScenariuszeDoSerii,
  useStanSerii,
  useWierszeSerii,
} from './adapters/serieAdapter';
import { etykietaStatusu } from '../przebiegi/strings';
import { SERIE_STRINGS as T } from './strings';

/** Wariant tagu statusu SERII — słownik `BatchStatus` (karta CV-3.3-C, PIĘĆ
 * wartości: CREATED/RUNNING/FINISHED/FAILED/PARTIAL). NIE mylić z wariantem
 * statusu POJEDYNCZEGO BIEGU pozycji serii, który ma WŁASNY, INNY słownik
 * (`RunStatus` — `WARIANT_STATUSU_BIEGU` niżej): dwie różne osie tego samego
 * ekranu, przypadkowo współdzielące cztery z pięciu nazw wartości przed tą
 * kartą (`PENDING/RUNNING/DONE/FAILED` batcha == `RunStatus`) — zbieżność,
 * która maskowała pomyłkę indeksowania złym słownikiem aż do zmiany nazw
 * batcha (napotknięty błąd typów, naprawiony u źródła: `WierszPrzebiegu.tsx`
 * ma dokładnie ten sam, poprawnie typowany wzorzec dla biegów). */
const WARIANT_STATUSU_SERII: Record<SeriaWiersz['status'], string> = {
  CREATED: 'mvd-tag-mut',
  RUNNING: 'mvd-tag-warn',
  FINISHED: 'mvd-tag-ok',
  FAILED: 'mvd-tag-err',
  PARTIAL: 'mvd-tag-warn',
};

/** Wariant tagu statusu BIEGU pozycji serii — słownik `RunStatus` (TEN SAM
 * wzorzec co `ui2/spaces/obliczenia/przebiegi/WierszPrzebiegu.tsx`). */
const WARIANT_STATUSU_BIEGU: Record<RunStatus, string> = {
  PENDING: 'mvd-tag-mut',
  RUNNING: 'mvd-tag-warn',
  DONE: 'mvd-tag-ok',
  FAILED: 'mvd-tag-err',
};

/** Ogłoszenie PO WYKONANIU serii — trójstanowe (karta CV-3.3-C: PARTIAL
 * pomiędzy sukcesem i porażką, nie binarne jak dawniej). */
function ogloszeniePoWykonaniu(status: SeriaWiersz['status']): string {
  if (status === 'FINISHED') return T.seriaZakonczona;
  if (status === 'PARTIAL') return T.seriaCzesciowa;
  return T.seriaNieudana;
}

export interface SeriePanelProps {
  /** Tryb zaawansowania powłoki — odsłania odcisk serii (§2.7). */
  trybZaawansowania: AdvancementMode;
  /** Akcja „Pokaż wyniki" biegu — integrator aktywuje bieg i otwiera Wyniki (K3). */
  onPokazWyniki: (runId: string) => void;
  /** Akcja stanu zerowego „Przejdź do scenariuszy" — integrator przewija do panelu scenariuszy. */
  onPrzejdzDoScenariuszy: () => void;
}

export function SeriePanel({
  trybZaawansowania,
  onPokazWyniki,
  onPrzejdzDoScenariuszy,
}: SeriePanelProps) {
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const setStudyCaseId = useBatchRunsStore((s) => s.setStudyCaseId);
  const utworzIWykonajSerie = useBatchRunsStore((s) => s.utworzIWykonajSerie);
  const wykonajSerie = useBatchRunsStore((s) => s.wykonajSerie);
  const wykonywanie = useBatchRunsStore((s) => s.isExecuting);
  const bladListy = useBatchRunsStore((s) => s.listError);
  const bladAkcji = useBatchRunsStore((s) => s.actionError);

  const stan = useStanSerii();
  const wiersze = useWierszeSerii();
  const scenariusze = useScenariuszeDoSerii();

  const [zaznaczone, setZaznaczone] = useState<ReadonlySet<string>>(new Set());
  const [ogloszenie, setOgloszenie] = useState('');

  useEffect(() => {
    setStudyCaseId(activeCaseId ?? null);
    // Scenariusze do zaznaczenia: TEN SAM store co `PanelScenariuszy`;
    // `setStudyCaseId` store'u scenariuszy jest idempotentne (brak podwójnego
    // pobrania, gdy panel scenariuszy już ustawił przypadek), a dzięki temu
    // panel serii jest samowystarczalny także bez panelu scenariuszy.
    useFaultScenariosStore.getState().setStudyCaseId(activeCaseId ?? null);
    setZaznaczone(new Set());
  }, [activeCaseId, setStudyCaseId]);

  const przelacz = (id: string) => {
    setZaznaczone((stare) => {
      const nowe = new Set(stare);
      if (nowe.has(id)) {
        nowe.delete(id);
      } else {
        nowe.add(id);
      }
      return nowe;
    });
  };

  const uruchom = async () => {
    if (!activeCaseId || zaznaczone.size === 0) return;
    setOgloszenie('');
    try {
      const seria = await utworzIWykonajSerie(activeCaseId, [...zaznaczone]);
      setOgloszenie(ogloszeniePoWykonaniu(seria.status));
      setZaznaczone(new Set());
    } catch {
      /* komunikat błędu żyje w store (pokazany niżej) */
    }
  };

  const wykonajPonownie = async (batchId: string) => {
    setOgloszenie('');
    try {
      const seria = await wykonajSerie(batchId);
      setOgloszenie(ogloszeniePoWykonaniu(seria.status));
    } catch {
      /* komunikat błędu żyje w store */
    }
  };

  if (stan === 'brak-przypadku') {
    return (
      <section className="mvd-serie" data-testid="mvd-serie">
        <NaglowekSerii />
        <div className="mvd-serie-pusty" data-testid="mvd-serie-brak-przypadku">
          <p>{T.brakPrzypadku}</p>
          <p className="mvd-serie-uwaga">{T.brakPrzypadkuAkcja}</p>
        </div>
      </section>
    );
  }

  if (stan === 'ladowanie') {
    return (
      <section className="mvd-serie" data-testid="mvd-serie">
        <NaglowekSerii />
        <div className="mvd-serie-pusty" role="status" data-testid="mvd-serie-ladowanie">
          {T.ladowanie}
        </div>
      </section>
    );
  }

  if (stan === 'blad') {
    return (
      <section className="mvd-serie" data-testid="mvd-serie">
        <NaglowekSerii />
        <div className="mvd-serie-pusty" role="alert" data-testid="mvd-serie-blad">
          <p>{T.blad}</p>
          {bladListy && <p className="mvd-serie-uwaga">{bladListy}</p>}
        </div>
      </section>
    );
  }

  return (
    <section className="mvd-serie" data-testid="mvd-serie">
      <span className="mvd-sr-only" role="status" aria-live="polite" data-testid="mvd-serie-live">
        {ogloszenie}
      </span>
      <NaglowekSerii />

      {/* --- Nowa seria: zaznaczenie scenariuszy + uruchomienie ------------- */}
      <div className="mvd-serie-nowa" data-testid="mvd-serie-nowa">
        <h4 className="mvd-serie-sekcja-tytul">{T.sekcjaNowa}</h4>
        {scenariusze.length === 0 ? (
          <div className="mvd-serie-pusty" data-testid="mvd-serie-brak-scenariuszy">
            <p>{T.brakScenariuszy}</p>
            <button
              type="button"
              className="mvd-serie-akcja mvd-serie-akcja--wtorna"
              data-testid="mvd-serie-do-scenariuszy"
              onClick={onPrzejdzDoScenariuszy}
            >
              {T.brakScenariuszyAkcja}
            </button>
          </div>
        ) : (
          <>
            <p className="mvd-serie-uwaga">{T.sekcjaNowaOpis}</p>
            <ul className="mvd-serie-scenariusze" data-testid="mvd-serie-scenariusze">
              {scenariusze.map((s) => (
                <li key={s.id}>
                  <label className="mvd-serie-scenariusz">
                    <input
                      type="checkbox"
                      data-testid={`mvd-serie-scenariusz-${s.id}`}
                      checked={zaznaczone.has(s.id)}
                      onChange={() => przelacz(s.id)}
                    />
                    <span className="mvd-serie-scenariusz-nazwa">{s.nazwa}</span>
                    <span className="mvd-serie-scenariusz-meta">
                      {s.rodzajEtykieta} · {s.miejsce}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="mvd-serie-nowa-stopka">
              <button
                type="button"
                className="mvd-serie-akcja mvd-serie-akcja--wtorna"
                data-testid="mvd-serie-zaznacz-wszystkie"
                onClick={() =>
                  setZaznaczone(
                    zaznaczone.size === scenariusze.length
                      ? new Set()
                      : new Set(scenariusze.map((s) => s.id)),
                  )
                }
              >
                {zaznaczone.size === scenariusze.length ? T.odznaczWszystkie : T.zaznaczWszystkie}
              </button>
              <button
                type="button"
                className="mvd-serie-akcja"
                data-testid="mvd-serie-uruchom"
                disabled={zaznaczone.size === 0 || wykonywanie}
                onClick={() => void uruchom()}
              >
                {wykonywanie ? T.wykonywanie : `${T.uruchomSerie} (${zaznaczone.size})`}
              </button>
            </div>
            {zaznaczone.size === 0 && (
              <p className="mvd-serie-uwaga" data-testid="mvd-serie-nic-nie-zaznaczono">
                {T.nicNieZaznaczono}
              </p>
            )}
            {bladAkcji && (
              <p className="mvd-serie-blad" role="alert" data-testid="mvd-serie-blad-akcji">
                {bladAkcji}
              </p>
            )}
          </>
        )}
      </div>

      {/* --- Wykonane serie -------------------------------------------------- */}
      <div className="mvd-serie-lista" data-testid="mvd-serie-lista">
        <h4 className="mvd-serie-sekcja-tytul">{T.sekcjaLista}</h4>
        {wiersze.length === 0 ? (
          <div className="mvd-serie-pusty" data-testid="mvd-serie-lista-pusta">
            <p>{T.brakSerii}</p>
          </div>
        ) : (
          wiersze.map((seria) => (
            <article
              key={seria.id}
              className="mvd-serie-karta"
              data-testid={`mvd-serie-wiersz-${seria.id}`}
            >
              <header className="mvd-serie-karta-glowa">
                <span className={`mvd-tag ${WARIANT_STATUSU_SERII[seria.status]}`}>
                  {seria.statusEtykieta}
                </span>
                <span className="mvd-serie-karta-meta">
                  {T.kolUtworzona}: <span className="mvd-num">{seria.utworzona}</span>
                </span>
                <span className="mvd-serie-karta-meta">
                  {T.kolRodzaj}: {seria.rodzajEtykieta}
                </span>
                <span className="mvd-serie-karta-meta">
                  {T.kolScenariusze}: <span className="mvd-num">{seria.liczbaScenariuszy}</span>
                </span>
                {trybZaawansowania === 'expert' && (
                  <span className="mvd-serie-karta-meta" data-testid={`mvd-serie-odcisk-${seria.id}`}>
                    {T.etykietaOdcisk}: <span className="mvd-num">{seria.odcisk}</span>
                  </span>
                )}
                {seria.status === 'CREATED' && (
                  <button
                    type="button"
                    className="mvd-serie-akcja mvd-serie-akcja--wtorna"
                    data-testid={`mvd-serie-wykonaj-${seria.id}`}
                    disabled={wykonywanie}
                    onClick={() => void wykonajPonownie(seria.id)}
                  >
                    {T.wykonaj}
                  </button>
                )}
              </header>

              {seria.bledy.length > 0 && (
                <div className="mvd-serie-blad" role="alert" data-testid={`mvd-serie-bledy-${seria.id}`}>
                  <span>{T.etykietaBledy}:</span>
                  <ul>
                    {seria.bledy.map((blad) => (
                      <li key={blad}>{blad}</li>
                    ))}
                  </ul>
                </div>
              )}

              {seria.biegi.length > 0 && (
                <ul className="mvd-serie-biegi" aria-label={T.kolBiegi}>
                  {seria.biegi.map(({ runId, bieg }) => (
                    <li key={runId} className="mvd-serie-bieg">
                      {bieg ? (
                        <>
                          <span className="mvd-serie-bieg-analiza">
                            {/* Etykieta analizy z rekordu biegu — jedno źródło biegów. */}
                            {seria.rodzajEtykieta}
                          </span>
                          <span className={`mvd-tag ${WARIANT_STATUSU_BIEGU[bieg.status]}`}>
                            {/* Etykieta statusu z JEDNEGO słownika biegów (importuj, nie duplikuj). */}
                            {etykietaStatusu(bieg.status)}
                          </span>
                          <button
                            type="button"
                            className="mvd-serie-akcja mvd-serie-akcja--wtorna"
                            data-testid={`mvd-serie-wyniki-${runId}`}
                            disabled={bieg.status !== 'DONE'}
                            title={bieg.status !== 'DONE' ? T.biegNiedostepny : undefined}
                            onClick={() => onPokazWyniki(runId)}
                          >
                            {T.pokazWyniki}
                          </button>
                        </>
                      ) : (
                        <span className="mvd-serie-uwaga">{T.biegNiedostepny}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function NaglowekSerii() {
  return (
    <header className="mvd-serie-glowa">
      <div>
        <h3 className="mvd-serie-tytul">{T.tytul}</h3>
        <p className="mvd-serie-cel">{T.cel}</p>
      </div>
    </header>
  );
}

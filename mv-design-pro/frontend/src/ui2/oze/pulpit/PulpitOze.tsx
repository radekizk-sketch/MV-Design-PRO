/*
 * Pulpit instalacji OZE — kokpit specjalisty (karta P47). Jeden ekran: lewa
 * kolumna to lista modułów projektu (klasa + status zgodności po biegu), prawa
 * to karta wybranego modułu (sekcje 1–5). Bieg NC RfG uruchamiany na wspólnym
 * store (widoczny również w macierzy wymogów — jeden stan).
 *
 * Granice (NOT-A-SOLVER / Single Model): warstwa tylko agreguje i prezentuje.
 * Werdykty i klasa modułu pochodzą WYŁĄCZNIE z `NcRfgRunResult`; dane DER
 * czytane read-only ze store'a (`useStationDerStore`); zero mutacji modelu.
 */

import { useEffect, useMemo, useState } from 'react';

import { selectAllDers, useStationDerStore } from '../../../ui/network-build/station-der';
import { isModeAtLeast, type AdvancementMode } from '../../shell/modeModel';
import { zbudujModuly, zbudujWejscieModulu } from '../macierz';
import { useNcRfgStore } from '../ncRfgStore';
import { KartaModulu } from './KartaModulu';
import { zbudujPozycje } from './pulpitModel';
import {
  ETYKIETY_STATUSU_PULPITU,
  KLASA_STATUSU_PULPITU,
  PULPIT_STRINGS,
} from './strings';

import '../macierz/macierz.css';
import './pulpit.css';

export interface PulpitOzeProps {
  /** Tryb zaawansowania — odsłania identyfikatory katalogowe i odcisk. */
  readonly trybZaawansowania: AdvancementMode;
  /** Nawigacja do dokumentacji modułu (implementacja poza tą kartą). */
  readonly onNawiguj: (cel: 'dokumentacja') => void;
}

export function PulpitOze({ trybZaawansowania, onNawiguj }: PulpitOzeProps): JSX.Element {
  const ders = useStationDerStore((state) => selectAllDers(state));
  const opisy = useMemo(() => zbudujModuly(ders), [ders]);
  const derPoId = useMemo(() => new Map(ders.map((d) => [d.id, d])), [ders]);

  const katalog = useNcRfgStore((s) => s.katalog);
  const bladKatalogu = useNcRfgStore((s) => s.bladKatalogu);
  const operatorId = useNcRfgStore((s) => s.operatorId);
  const status = useNcRfgStore((s) => s.status);
  const wynik = useNcRfgStore((s) => s.wynik);
  const bladBiegu = useNcRfgStore((s) => s.bladBiegu);
  const zaladujKatalog = useNcRfgStore((s) => s.zaladujKatalog);
  const ustawOperator = useNcRfgStore((s) => s.ustawOperator);
  const przeprowadzTesty = useNcRfgStore((s) => s.przeprowadzTesty);

  const [wybranyModul, setWybranyModul] = useState<string>('');

  useEffect(() => {
    void zaladujKatalog();
  }, [zaladujKatalog]);

  useEffect(() => {
    if (!wybranyModul && opisy[0]) setWybranyModul(opisy[0].derRef);
  }, [opisy, wybranyModul]);

  const pozycje = useMemo(() => zbudujPozycje(opisy, wynik), [opisy, wynik]);
  const opisWybrany = opisy.find((o) => o.derRef === wybranyModul) ?? opisy[0] ?? null;
  const derWybrany = opisWybrany ? (derPoId.get(opisWybrany.derRef) ?? null) : null;

  const gotoweDoBiegu = opisy.filter((o) => o.powodBlokady === null);
  const powodBlokadyBiegu =
    opisy.length === 0
      ? PULPIT_STRINGS.brakModulow
      : gotoweDoBiegu.length === 0
        ? PULPIT_STRINGS.brakModulowOpis
        : status === 'running'
          ? PULPIT_STRINGS.wTrakcie
          : null;

  const trybEkspercki = isModeAtLeast(trybZaawansowania, 'expert');

  const przeprowadz = async (): Promise<void> => {
    const wejscia = gotoweDoBiegu
      .map((opis) => zbudujWejscieModulu(opis, operatorId))
      .filter((m): m is NonNullable<typeof m> => m !== null);
    await przeprowadzTesty(wejscia, katalog?.procedure_version);
  };

  return (
    <div className="mvd-oze" data-testid="mvd-oze-pulpit">
      <header className="mvd-oze-head">
        <div className="mvd-oze-head-main">
          <h3 className="mvd-oze-title">{PULPIT_STRINGS.tytul}</h3>
          <p className="mvd-oze-sub">{PULPIT_STRINGS.podtytul}</p>
        </div>
        <div className="mvd-oze-head-akcje">
          <div className="mvd-oze-pola">
            <label className="mvd-oze-pole">
              <span>{PULPIT_STRINGS.operator}</span>
              <select
                value={operatorId}
                onChange={(event) => ustawOperator(event.target.value)}
                data-testid="mvd-oze-pulpit-operator"
              >
                {(katalog?.operators ?? [
                  { operator_id: 'enea', operator_name_pl: 'Enea Operator', last_revision: '' },
                ]).map((op) => (
                  <option key={op.operator_id} value={op.operator_id}>
                    {op.operator_name_pl}
                  </option>
                ))}
              </select>
            </label>
            {katalog ? (
              <div className="mvd-oze-pole">
                <span>{PULPIT_STRINGS.wersjaProcedury}</span>
                <span>{katalog.procedure_version}</span>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="mvd-btn mvd-btn-glowny"
            onClick={() => void przeprowadz()}
            disabled={Boolean(powodBlokadyBiegu)}
            title={powodBlokadyBiegu ?? PULPIT_STRINGS.przeprowadz}
            data-testid="mvd-oze-pulpit-przeprowadz"
          >
            {status === 'running' ? PULPIT_STRINGS.wTrakcie : PULPIT_STRINGS.przeprowadz}
          </button>
          {trybEkspercki && wynik ? (
            <div className="mvd-oze-odcisk" data-testid="mvd-oze-pulpit-odcisk">
              {PULPIT_STRINGS.odcisk}: {wynik.deterministic_hash}
            </div>
          ) : null}
        </div>
      </header>

      {bladKatalogu ? (
        <div className="mvd-oze-blad" data-testid="mvd-oze-pulpit-blad-katalogu">
          {PULPIT_STRINGS.bladKatalogu}: {bladKatalogu}
        </div>
      ) : null}
      {bladBiegu ? (
        <div className="mvd-oze-blad" data-testid="mvd-oze-pulpit-blad-biegu">
          {PULPIT_STRINGS.bladBiegu}: {bladBiegu}
        </div>
      ) : null}

      {opisy.length === 0 ? (
        <section className="mvd-oze-info" data-testid="mvd-oze-pulpit-pusty">
          <h4>{PULPIT_STRINGS.brakModulow}</h4>
          <p>{PULPIT_STRINGS.brakModulowOpis}</p>
        </section>
      ) : (
        <div className="mvd-oze-pulpit-uklad">
          <nav
            className="mvd-oze-pulpit-lista"
            data-testid="mvd-oze-pulpit-lista"
            aria-label={PULPIT_STRINGS.listaTytul}
          >
            <div className="mvd-oze-pulpit-lista-h">{PULPIT_STRINGS.listaTytul}</div>
            {pozycje.map((poz) => (
              <button
                key={poz.derRef}
                type="button"
                className="mvd-oze-pulpit-poz"
                onClick={() => setWybranyModul(poz.derRef)}
                aria-pressed={opisWybrany?.derRef === poz.derRef}
                data-testid={`mvd-oze-pulpit-poz-${poz.derRef}`}
              >
                <span className="mvd-oze-pulpit-poz-nazwa">
                  {poz.nazwa} · {poz.rodzaj}
                </span>
                <span className="mvd-oze-pulpit-poz-meta">
                  <span
                    className={`mvd-oze-komorka ${KLASA_STATUSU_PULPITU[poz.status]}`}
                    data-testid={`mvd-oze-pulpit-poz-status-${poz.derRef}`}
                  >
                    {ETYKIETY_STATUSU_PULPITU[poz.status]}
                  </span>
                  {poz.przeprowadzono ? (
                    <span className="mvd-oze-num">
                      {poz.passCount} / {poz.requiredCount}
                    </span>
                  ) : null}
                </span>
                {poz.klasa ? (
                  <span className="mvd-oze-pulpit-poz-klasa">
                    {PULPIT_STRINGS.listaKlasa}: {poz.klasa}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>

          <div className="mvd-oze-pulpit-panel">
            {opisWybrany && derWybrany ? (
              <KartaModulu
                opis={opisWybrany}
                der={derWybrany}
                wynik={wynik}
                trybEkspercki={trybEkspercki}
                onNawiguj={onNawiguj}
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

/*
 * Sekcja „Praca magazynu" karty modułu (pulpit OZE, karta P47a §1.1). WYŁĄCZNIE
 * dla BESS. Pojemność energetyczna, moc, zakres Q, cosφ i tryb regulacji
 * pochodzą z DOKŁADNIE dopasowanego rekordu katalogu konwerterów
 * (`GET /api/catalog/converter-types?kind=BESS`). Brak dopasowania → jawny stan
 * „pozycja katalogowa nieodnaleziona" (bez zgadywania). Zero fizyki.
 */

import { useEffect, useState } from 'react';

import type { StationDerConnection } from '../../../ui/network-build/station-der';
import { pobierzKonwertery, type RekordKonwertera } from '../api';
import { dopasujMagazyn, pracaMagazynu } from './pulpitModel';
import {
  formatEnergia,
  formatMvar,
  formatMw,
  PULPIT_STRINGS,
} from './strings';

export interface SekcjaMagazynuProps {
  readonly der: StationDerConnection;
  /** Tryb ekspercki odsłania identyfikatory katalogowe. */
  readonly trybEkspercki: boolean;
}

type StanKatalogu =
  | { readonly rodzaj: 'ladowanie' }
  | { readonly rodzaj: 'blad'; readonly komunikat: string }
  | { readonly rodzaj: 'gotowe'; readonly rekordy: readonly RekordKonwertera[] };

function formatCosphi(min: number | null, max: number | null): string {
  if (min === null && max === null) return '—';
  const f = (v: number | null): string => (v === null ? '—' : v.toFixed(2).replace('.', ','));
  return `${f(min)} … ${f(max)}`;
}

export function SekcjaMagazynu({ der, trybEkspercki }: SekcjaMagazynuProps): JSX.Element | null {
  const [stan, setStan] = useState<StanKatalogu>({ rodzaj: 'ladowanie' });

  useEffect(() => {
    if (der.der_kind !== 'BESS') return;
    let aktywne = true;
    setStan({ rodzaj: 'ladowanie' });
    pobierzKonwertery('BESS')
      .then((rekordy) => {
        if (aktywne) setStan({ rodzaj: 'gotowe', rekordy });
      })
      .catch((err: unknown) => {
        if (!aktywne) return;
        const komunikat = err instanceof Error ? err.message : 'Nieznany błąd pobierania';
        setStan({ rodzaj: 'blad', komunikat });
      });
    return () => {
      aktywne = false;
    };
  }, [der.der_kind]);

  // Sekcja dotyczy wyłącznie magazynów energii.
  if (der.der_kind !== 'BESS') return null;

  const praca = pracaMagazynu(der);
  const dopasowanie =
    stan.rodzaj === 'gotowe' ? dopasujMagazyn(der, stan.rekordy) : null;

  return (
    <section
      className="mvd-oze-panel"
      data-testid="mvd-oze-pulpit-magazyn"
      aria-label={PULPIT_STRINGS.sekcjaMagazyn}
    >
      <h4>{PULPIT_STRINGS.sekcjaMagazyn}</h4>

      {stan.rodzaj === 'ladowanie' ? (
        <p className="mvd-oze-panel-etyk" data-testid="mvd-oze-magazyn-ladowanie">
          {PULPIT_STRINGS.magazynLadowanie}
        </p>
      ) : stan.rodzaj === 'blad' ? (
        <div className="mvd-oze-blad" data-testid="mvd-oze-magazyn-blad">
          {PULPIT_STRINGS.magazynBlad}: {stan.komunikat}
        </div>
      ) : dopasowanie ? (
        <div data-testid="mvd-oze-magazyn-rekord">
          <div className="mvd-oze-metryka">
            <span>{PULPIT_STRINGS.magazynPojemnosc}</span>
            <span className="mvd-oze-num" data-testid="mvd-oze-magazyn-pojemnosc">
              {dopasowanie.rekord.e_kwh === null
                ? PULPIT_STRINGS.magazynBrakPojemnosci
                : formatEnergia(dopasowanie.rekord.e_kwh)}
            </span>
          </div>
          <div className="mvd-oze-metryka">
            <span>{PULPIT_STRINGS.magazynMoc}</span>
            <span className="mvd-oze-num">{formatMw(dopasowanie.rekord.pmax_mw)}</span>
          </div>
          <div className="mvd-oze-metryka">
            <span>{PULPIT_STRINGS.magazynZakresQ}</span>
            <span className="mvd-oze-num">
              {formatMvar(dopasowanie.rekord.qmin_mvar)} … {formatMvar(dopasowanie.rekord.qmax_mvar)}
            </span>
          </div>
          <div className="mvd-oze-metryka">
            <span>{PULPIT_STRINGS.magazynCosphi}</span>
            <span className="mvd-oze-num">
              {formatCosphi(dopasowanie.rekord.cosphi_min, dopasowanie.rekord.cosphi_max)}
            </span>
          </div>
          <div className="mvd-oze-metryka">
            <span>{PULPIT_STRINGS.magazynTrybRegulacji}</span>
            <span className="mvd-oze-num">
              {dopasowanie.rekord.control_mode ?? PULPIT_STRINGS.magazynBrakTrybu}
            </span>
          </div>
          {trybEkspercki ? (
            <div className="mvd-oze-panel-blok" data-testid="mvd-oze-magazyn-ekspert">
              <div className="mvd-oze-metryka">
                <span>{PULPIT_STRINGS.magazynModel}</span>
                <span className="mvd-oze-num">{dopasowanie.rekord.id}</span>
              </div>
              <div className="mvd-oze-metryka">
                <span>{PULPIT_STRINGS.magazynDopasowanoPo}</span>
                <span className="mvd-oze-num">{dopasowanie.dopasowanoPo}</span>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div data-testid="mvd-oze-magazyn-nieodnaleziona">
          <div className="mvd-oze-blokada">{PULPIT_STRINGS.magazynNieodnaleziona}</div>
          <p style={{ margin: '6px 0 0' }} className="mvd-oze-panel-etyk">
            {PULPIT_STRINGS.magazynNieodnalezionaOpis}
          </p>
          {trybEkspercki && praca?.bateriaRef ? (
            <div className="mvd-oze-metryka" style={{ marginTop: 6 }}>
              <span>{PULPIT_STRINGS.magazynBateria}</span>
              <span className="mvd-oze-num">{praca.bateriaRef}</span>
            </div>
          ) : null}
        </div>
      )}

      {praca && praca.trybyPracy.length > 0 ? (
        <div className="mvd-oze-metryka" data-testid="mvd-oze-magazyn-liczba-trybow">
          <span>{PULPIT_STRINGS.magazynLiczbaTrybow}</span>
          <span className="mvd-oze-num">{praca.trybyPracy.length}</span>
        </div>
      ) : null}
    </section>
  );
}

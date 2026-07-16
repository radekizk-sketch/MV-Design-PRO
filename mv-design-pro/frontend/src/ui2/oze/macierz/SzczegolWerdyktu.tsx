/*
 * Panel szczegółu werdyktu (karta P39 §3). Prezentuje wybraną komórkę macierzy:
 * uzasadnienie PL, metryki, akcje naprawcze (lista) i odnośniki śladu WHITE BOX
 * przekazywane przez callback `onOtworzDowod`. Zero ocen własnych — wszystkie
 * dane pochodzą z `NcRfgRunResult` (warstwa tylko prezentuje).
 */

import type { KomorkaMacierzy } from './macierzModel';
import {
  ETYKIETY_BLOKADY,
  ETYKIETY_WERDYKTU,
  KLASA_WERDYKTU,
  MACIERZ_STRINGS,
  opiszMetryke,
} from './strings';

export interface SzczegolWerdyktuProps {
  readonly komorka: KomorkaMacierzy | null;
  readonly nazwaModulu: string | null;
  readonly onOtworzDowod: (ref: string) => void;
}

export function SzczegolWerdyktu({
  komorka,
  nazwaModulu,
  onOtworzDowod,
}: SzczegolWerdyktuProps): JSX.Element {
  return (
    <section className="mvd-oze-panel" data-testid="mvd-oze-szczegol" aria-label={MACIERZ_STRINGS.szczegolTytul}>
      <h4>{MACIERZ_STRINGS.szczegolTytul}</h4>

      {!komorka ? (
        <p className="mvd-oze-panel-etyk" data-testid="mvd-oze-szczegol-pusty">
          {MACIERZ_STRINGS.szczegolWybierz}
        </p>
      ) : komorka.stan === 'brak_danych_modul' ? (
        <div className="mvd-oze-blokada" data-testid="mvd-oze-szczegol-blokada">
          {komorka.powodModulu ? ETYKIETY_BLOKADY[komorka.powodModulu] : MACIERZ_STRINGS.brakWyniku}
        </div>
      ) : komorka.stan === 'brak_biegu' || !komorka.wynik ? (
        <p className="mvd-oze-panel-etyk" data-testid="mvd-oze-szczegol-brak-biegu">
          {MACIERZ_STRINGS.brakBieguOpis}
        </p>
      ) : (
        <div data-testid="mvd-oze-szczegol-wynik">
          <div className="mvd-oze-panel-blok">
            <span className="mvd-oze-panel-etyk">{nazwaModulu}</span>
            <div style={{ marginTop: 4, fontWeight: 600 }}>{komorka.wynik.ability_pl}</div>
            {komorka.werdykt ? (
              <span
                className={`mvd-oze-komorka ${KLASA_WERDYKTU[komorka.werdykt]}`}
                data-testid="mvd-oze-szczegol-werdykt"
              >
                {ETYKIETY_WERDYKTU[komorka.werdykt]}
              </span>
            ) : null}
          </div>

          <div className="mvd-oze-panel-blok">
            <span className="mvd-oze-panel-etyk">{MACIERZ_STRINGS.uzasadnienie}</span>
            <p style={{ margin: '4px 0 0' }}>{komorka.wynik.summary_pl}</p>
          </div>

          <div className="mvd-oze-panel-blok">
            <span className="mvd-oze-panel-etyk">{MACIERZ_STRINGS.wymaganie}</span>
            <p style={{ margin: '4px 0 0' }}>{komorka.wynik.required_reason_pl}</p>
          </div>

          <div className="mvd-oze-panel-blok" data-testid="mvd-oze-szczegol-metryki">
            <span className="mvd-oze-panel-etyk">{MACIERZ_STRINGS.metryki}</span>
            {Object.keys(komorka.wynik.metrics).length === 0 ? (
              <p style={{ margin: '4px 0 0' }} className="mvd-oze-panel-etyk">
                {MACIERZ_STRINGS.brakMetryk}
              </p>
            ) : (
              <div style={{ marginTop: 4 }}>
                {Object.entries(komorka.wynik.metrics).map(([klucz, wartosc]) => (
                  <div key={klucz} className="mvd-oze-metryka">
                    <span>{klucz}</span>
                    <span className="mvd-oze-num">{opiszMetryke(wartosc)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mvd-oze-panel-blok" data-testid="mvd-oze-szczegol-akcje">
            <span className="mvd-oze-panel-etyk">{MACIERZ_STRINGS.akcjeNaprawcze}</span>
            {komorka.wynik.fix_actions.length === 0 ? (
              <p style={{ margin: '4px 0 0' }} className="mvd-oze-panel-etyk">
                {MACIERZ_STRINGS.brakAkcji}
              </p>
            ) : (
              <ul className="mvd-oze-lista">
                {komorka.wynik.fix_actions.map((akcja) => (
                  <li key={akcja}>{akcja}</li>
                ))}
              </ul>
            )}
          </div>

          {komorka.wynik.trace_refs.length > 0 ? (
            <div className="mvd-oze-panel-blok" data-testid="mvd-oze-szczegol-slad">
              <span className="mvd-oze-panel-etyk">{MACIERZ_STRINGS.slad}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                {komorka.wynik.trace_refs.map((ref) => (
                  <button
                    key={ref}
                    type="button"
                    className="mvd-oze-slad-btn"
                    onClick={() => onOtworzDowod(ref)}
                    data-testid="mvd-oze-slad-otworz"
                  >
                    {MACIERZ_STRINGS.otworzSlad}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

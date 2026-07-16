/*
 * Sekcja „Zgodność NC RfG" karty modułu (pulpit OZE, karta P47 §2.2).
 * Podsumowanie X/Y spełnionych, klasa modułu (z backendu) i lista testów
 * niespełnionych z akcjami naprawczymi. Zero ocen własnych — dane z
 * `NcRfgRunResult`.
 */

import type { ZgodnoscModulu } from './pulpitModel';
import {
  ETYKIETY_STATUSU_PULPITU,
  KLASA_STATUSU_PULPITU,
  PULPIT_STRINGS,
} from './strings';

export interface SekcjaZgodnosciProps {
  readonly zgodnosc: ZgodnoscModulu;
}

export function SekcjaZgodnosci({ zgodnosc }: SekcjaZgodnosciProps): JSX.Element {
  return (
    <section
      className="mvd-oze-panel"
      data-testid="mvd-oze-pulpit-zgodnosc"
      aria-label={PULPIT_STRINGS.sekcjaZgodnosc}
    >
      <h4>{PULPIT_STRINGS.sekcjaZgodnosc}</h4>

      {!zgodnosc.przeprowadzono ? (
        <p className="mvd-oze-panel-etyk" data-testid="mvd-oze-pulpit-zgodnosc-bez-biegu">
          {PULPIT_STRINGS.zgodnoscBezBiegu}
        </p>
      ) : (
        <>
          <div className="mvd-oze-podsum" data-testid="mvd-oze-pulpit-zgodnosc-podsum">
            <div className="mvd-oze-podsum-poz">
              <span className="mvd-oze-podsum-etyk">{PULPIT_STRINGS.zgodnoscKlasa}</span>
              <span className="mvd-oze-podsum-wart">
                {zgodnosc.klasa ?? PULPIT_STRINGS.zgodnoscKlasaBrak}
              </span>
            </div>
            <div className="mvd-oze-podsum-poz">
              <span className="mvd-oze-podsum-etyk">{PULPIT_STRINGS.zgodnoscSpelnione}</span>
              <span className="mvd-oze-podsum-wart mvd-oze-num">
                {zgodnosc.passCount} / {zgodnosc.requiredCount}
              </span>
            </div>
            <div className="mvd-oze-podsum-poz">
              <span className="mvd-oze-podsum-etyk">{PULPIT_STRINGS.zgodnoscStatus}</span>
              <span
                className={`mvd-oze-komorka ${KLASA_STATUSU_PULPITU[zgodnosc.status]}`}
                data-testid="mvd-oze-pulpit-zgodnosc-status"
              >
                {ETYKIETY_STATUSU_PULPITU[zgodnosc.status]}
              </span>
            </div>
          </div>

          <div className="mvd-oze-panel-blok" data-testid="mvd-oze-pulpit-niespelnione">
            <span className="mvd-oze-panel-etyk">{PULPIT_STRINGS.zgodnoscNiespelnione}</span>
            {zgodnosc.niespelnione.length === 0 ? (
              <p style={{ margin: '4px 0 0' }} className="mvd-oze-panel-etyk">
                {PULPIT_STRINGS.zgodnoscKomplet}
              </p>
            ) : (
              <ul className="mvd-oze-lista">
                {zgodnosc.niespelnione.map((test) => (
                  <li key={test.test_id} data-testid="mvd-oze-pulpit-niespelniony">
                    <div style={{ fontWeight: 600 }}>{test.ability_pl}</div>
                    <div className="mvd-oze-panel-etyk" style={{ marginTop: 2 }}>
                      {test.summary_pl}
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <span className="mvd-oze-panel-etyk">{PULPIT_STRINGS.zgodnoscAkcje}</span>
                      {test.fix_actions.length === 0 ? (
                        <p style={{ margin: '2px 0 0' }} className="mvd-oze-panel-etyk">
                          {PULPIT_STRINGS.zgodnoscBrakAkcji}
                        </p>
                      ) : (
                        <ul className="mvd-oze-lista">
                          {test.fix_actions.map((akcja) => (
                            <li key={akcja}>{akcja}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}

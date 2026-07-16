/*
 * Karta wybranego modułu (pulpit OZE, karta P47 §2). Sekcje: (1) dane modułu
 * read-only, (2) zgodność NC RfG, (3) praca magazynu (tylko BESS z danymi),
 * (4) zdolność punktu + jakość energii (jawny stan „analiza niewpięta"),
 * (5) dokumenty (callback nawigacji z propsów). Zero fizyki, zero ocen własnych.
 */

import type { NcRfgRunResult } from '../../../ui/ncrfg-tests/api';
import type { StationDerConnection } from '../../../ui/network-build/station-der';
import { formatMoc, formatNapiecie } from '../macierz/strings';
import type { OpisModulu } from '../macierz';
import { SekcjaZgodnosci } from './SekcjaZgodnosci';
import { daneModulu, pracaMagazynu, zgodnoscModulu } from './pulpitModel';
import { ETYKIETY_STRONY, PULPIT_STRINGS } from './strings';

export interface KartaModuluProps {
  readonly opis: OpisModulu;
  readonly der: StationDerConnection;
  readonly wynik: NcRfgRunResult | null;
  /** Tryb ekspercki odsłania identyfikatory katalogowe. */
  readonly trybEkspercki: boolean;
  /** Nawigacja do dokumentacji modułu (implementacja poza tą kartą). */
  readonly onNawiguj: (cel: 'dokumentacja') => void;
}

export function KartaModulu({
  opis,
  der,
  wynik,
  trybEkspercki,
  onNawiguj,
}: KartaModuluProps): JSX.Element {
  const dane = daneModulu(opis, der);
  const zgodnosc = zgodnoscModulu(opis, wynik);
  const magazyn = pracaMagazynu(der);

  return (
    <div className="mvd-oze-pulpit-karta" data-testid="mvd-oze-pulpit-karta">
      {/* Sekcja 1 — dane modułu (read-only). */}
      <section
        className="mvd-oze-panel"
        data-testid="mvd-oze-pulpit-dane"
        aria-label={PULPIT_STRINGS.sekcjaDane}
      >
        <h4>{PULPIT_STRINGS.sekcjaDane}</h4>
        <div className="mvd-oze-metryka">
          <span>{PULPIT_STRINGS.daneRodzaj}</span>
          <span>{dane.rodzaj}</span>
        </div>
        <div className="mvd-oze-metryka">
          <span>{PULPIT_STRINGS.daneMoc}</span>
          <span className="mvd-oze-num">{formatMoc(dane.mocKw)}</span>
        </div>
        <div className="mvd-oze-metryka">
          <span>{PULPIT_STRINGS.daneNapiecie}</span>
          <span className="mvd-oze-num">{formatNapiecie(dane.napiecieKv)}</span>
        </div>
        <div className="mvd-oze-metryka">
          <span>{PULPIT_STRINGS.daneStrona}</span>
          <span>{ETYKIETY_STRONY[dane.stronaPrzylaczenia]}</span>
        </div>
        <div className="mvd-oze-panel-blok" data-testid="mvd-oze-pulpit-odnosniki">
          <span className="mvd-oze-panel-etyk">{PULPIT_STRINGS.daneOdnosniki}</span>
          {dane.odnosniki.length === 0 ? (
            <p style={{ margin: '4px 0 0' }} className="mvd-oze-panel-etyk">
              {PULPIT_STRINGS.daneBrakOdnosnikow}
            </p>
          ) : trybEkspercki ? (
            <ul className="mvd-oze-lista">
              {dane.odnosniki.map((o) => (
                <li key={o.wartosc} className="mvd-oze-metryka">
                  <span>{o.etykieta}</span>
                  <span className="mvd-oze-num">{o.wartosc}</span>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="mvd-oze-lista">
              {dane.odnosniki.map((o) => (
                <li key={o.etykieta}>{o.etykieta}</li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Sekcja 2 — zgodność NC RfG. */}
      <SekcjaZgodnosci zgodnosc={zgodnosc} />

      {/* Sekcja 3 — praca magazynu (tylko BESS, tylko gdy dane istnieją). */}
      {magazyn ? (
        <section
          className="mvd-oze-panel"
          data-testid="mvd-oze-pulpit-magazyn"
          aria-label={PULPIT_STRINGS.sekcjaMagazyn}
        >
          <h4>{PULPIT_STRINGS.sekcjaMagazyn}</h4>
          {magazyn.bateriaRef ? (
            <div className="mvd-oze-metryka">
              <span>{PULPIT_STRINGS.magazynBateria}</span>
              <span className="mvd-oze-num">
                {trybEkspercki ? magazyn.bateriaRef : PULPIT_STRINGS.magazynEkspert}
              </span>
            </div>
          ) : null}
          {magazyn.trybyPracy.length > 0 ? (
            <div className="mvd-oze-metryka">
              <span>{PULPIT_STRINGS.magazynLiczbaTrybow}</span>
              <span className="mvd-oze-num">{magazyn.trybyPracy.length}</span>
            </div>
          ) : null}
          {trybEkspercki && magazyn.trybyPracy.length > 0 ? (
            <div className="mvd-oze-panel-blok" data-testid="mvd-oze-pulpit-magazyn-tryby">
              <span className="mvd-oze-panel-etyk">{PULPIT_STRINGS.magazynTryby}</span>
              <ul className="mvd-oze-lista">
                {magazyn.trybyPracy.map((tryb) => (
                  <li key={tryb} className="mvd-oze-num">
                    {tryb}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Sekcja 4 — zdolność punktu + jakość energii (analizy niewpięte). */}
      <section
        className="mvd-oze-panel"
        data-testid="mvd-oze-pulpit-niewpiete"
        aria-label={PULPIT_STRINGS.sekcjaZdolnosc}
      >
        <div className="mvd-oze-panel-blok">
          <h4>{PULPIT_STRINGS.sekcjaZdolnosc}</h4>
          <div className="mvd-oze-blokada" data-testid="mvd-oze-pulpit-zdolnosc-stan">
            {PULPIT_STRINGS.analizaNiewpieta}
          </div>
          <p style={{ margin: '6px 0 0' }}>{PULPIT_STRINGS.zdolnoscOpis}</p>
        </div>
        <div className="mvd-oze-panel-blok">
          <h4>{PULPIT_STRINGS.sekcjaJakosc}</h4>
          <div className="mvd-oze-blokada" data-testid="mvd-oze-pulpit-jakosc-stan">
            {PULPIT_STRINGS.analizaNiewpieta}
          </div>
          <p style={{ margin: '6px 0 0' }}>{PULPIT_STRINGS.jakoscOpis}</p>
        </div>
        <p className="mvd-oze-panel-etyk" data-testid="mvd-oze-pulpit-todo">
          {PULPIT_STRINGS.todoKarta}
        </p>
      </section>

      {/* Sekcja 5 — dokumenty. */}
      <section
        className="mvd-oze-panel"
        data-testid="mvd-oze-pulpit-dokumenty"
        aria-label={PULPIT_STRINGS.sekcjaDokumenty}
      >
        <h4>{PULPIT_STRINGS.sekcjaDokumenty}</h4>
        <p style={{ margin: 0 }}>{PULPIT_STRINGS.dokumentyOpis}</p>
        <button
          type="button"
          className="mvd-btn"
          onClick={() => onNawiguj('dokumentacja')}
          data-testid="mvd-oze-pulpit-dokumenty-przejdz"
        >
          {PULPIT_STRINGS.dokumentyPrzejdz}
        </button>
      </section>
    </div>
  );
}

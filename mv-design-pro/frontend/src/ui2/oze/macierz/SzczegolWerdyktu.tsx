/*
 * Panel szczegółu werdyktu (karta P39 §3 + scalenie #5). Prezentuje wybraną
 * komórkę macierzy: uzasadnienie PL, metryki, akcje naprawcze (lista) i ślad
 * WHITE BOX testu renderowany INLINE (`SladTestu` — wzory ASCII solvera, nie
 * LaTeX, więc bez okna dowodu). Zero ocen własnych — wszystkie dane pochodzą
 * z `NcRfgRunResult` (warstwa tylko prezentuje).
 */

import { useState } from 'react';

import type { NcRfgRunResult } from '../../../ui/ncrfg-tests/api';
import type { PozycjaOceny } from '../../wyniki/ocena/api';
import {
  fmtMargines,
  fmtOdniesienie,
  fmtWartoscZJednostka,
  wynikPL,
} from '../../wyniki/ocena/model';
import { OCENA_STRINGS } from '../../wyniki/ocena/strings';
import { PodstawaStrukturalna, SzczegolyWyniku } from '../../wyniki/ocena/WynikWyjasniony';
import type { KomorkaMacierzy } from './macierzModel';
import { SladTestu } from './SladTestu';
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
  /** Pełny ślad WHITE BOX biegu — kroki testu filtrowane po `test_id`. */
  readonly slad: NcRfgRunResult['white_box_trace'];
}

/**
 * Wynik inżynierski testu (karta AB-1a D2): łańcuch podstawa → wynik → odniesienie →
 * ocena → wniosek z adaptera backendu. Werdykt „spełnia" bez dopuszczalnego dowodu
 * przychodzi tu jako „brak podstaw" z NAZWANYM stanem dowodowym (deklaracja / test
 * bez treści / brak symulacji / limit niezweryfikowany) — UI niczego nie ocenia.
 */
function WynikInzynierskiTestu({ pozycja }: { pozycja: PozycjaOceny }) {
  const element = pozycja.elementy[0] ?? null;
  return (
    <div className="mvd-oze-panel-blok" data-testid="mvd-oze-szczegol-wynik-inzynierski">
      <span className="mvd-oze-panel-etyk">{MACIERZ_STRINGS.wynikInzynierski}</span>
      {pozycja.podstawa !== null && (
        <PodstawaStrukturalna podstawa={pozycja.podstawa} testid="mvd-oze-szczegol-wi-podstawa" />
      )}
      {element === null ? (
        <p style={{ margin: '4px 0 0' }} data-testid="mvd-oze-szczegol-wi-nie-dotyczy">
          {MACIERZ_STRINGS.nieDotyczy}
          {pozycja.powod_pl ? ` — ${pozycja.powod_pl}` : ''}
        </p>
      ) : (
        <div style={{ marginTop: 4 }}>
          <div className="mvd-oze-metryka" data-testid="mvd-oze-szczegol-wi-wynik">
            <span>{OCENA_STRINGS.kolWynik}</span>
            <span>{wynikPL(element.wynik)}</span>
          </div>
          {pozycja.powod_pl !== null && element.wynik === 'BRAK_PODSTAW' && (
            <div className="mvd-oze-metryka" data-testid="mvd-oze-szczegol-wi-stan">
              <span>{MACIERZ_STRINGS.stanDowodowy}</span>
              <span>{pozycja.powod_pl}</span>
            </div>
          )}
          <div className="mvd-oze-metryka" data-testid="mvd-oze-szczegol-wi-wartosc">
            <span>{OCENA_STRINGS.kolWartosc}</span>
            <span className="mvd-oze-num">
              {fmtWartoscZJednostka(element.wartosc, element.jednostka || pozycja.jednostka)}
            </span>
          </div>
          <div className="mvd-oze-metryka" data-testid="mvd-oze-szczegol-wi-odniesienie">
            <span>{OCENA_STRINGS.kolOdniesienie}</span>
            <span className="mvd-oze-num">{fmtOdniesienie(element, pozycja)}</span>
          </div>
          <div className="mvd-oze-metryka" data-testid="mvd-oze-szczegol-wi-margines">
            <span>{OCENA_STRINGS.kolMargines}</span>
            <span className="mvd-oze-num">{fmtMargines(element)}</span>
          </div>
          <p style={{ margin: '4px 0 0' }} data-testid="mvd-oze-szczegol-wi-wniosek">
            {element.wniosek_pl}
          </p>
          <SzczegolyWyniku
            element={element}
            trybEkspercki={false}
            testid="mvd-oze-szczegol-wi-szczegoly"
          />
        </div>
      )}
    </div>
  );
}

export function SzczegolWerdyktu({
  komorka,
  nazwaModulu,
  slad,
}: SzczegolWerdyktuProps): JSX.Element {
  const [sladWidoczny, setSladWidoczny] = useState(false);
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

          {komorka.ocenaDowodowa && (
            <div className="mvd-oze-panel-blok" data-testid="mvd-oze-szczegol-podstawa">
              <span className="mvd-oze-panel-etyk">{MACIERZ_STRINGS.podstawaWerdyktu}</span>
              <p style={{ margin: '4px 0 0' }}>
                {komorka.ocenaDowodowa.tier_pl ?? komorka.ocenaDowodowa.tier}
              </p>
              {!komorka.ocenaDowodowa.regulatory_evidence_eligible && (
                <p className="mvd-oze-panel-etyk" style={{ margin: '4px 0 0' }}>
                  {komorka.ocenaDowodowa.rationale_pl}
                </p>
              )}
            </div>
          )}

          {komorka.wynikInzynierski && <WynikInzynierskiTestu pozycja={komorka.wynikInzynierski} />}

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
              <div style={{ marginTop: 4 }}>
                <button
                  type="button"
                  className="mvd-oze-slad-btn"
                  aria-expanded={sladWidoczny}
                  onClick={() => setSladWidoczny((s) => !s)}
                  data-testid="mvd-oze-slad-otworz"
                >
                  {sladWidoczny ? MACIERZ_STRINGS.ukryjSlad : MACIERZ_STRINGS.otworzSlad}
                </button>
                {sladWidoczny && (
                  <SladTestu
                    kroki={slad.filter((krok) => krok.test_id === komorka.testId)}
                  />
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

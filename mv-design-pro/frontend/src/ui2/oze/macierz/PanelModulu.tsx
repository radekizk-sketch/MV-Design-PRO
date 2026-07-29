/*
 * Panel danych wejściowych modułu (karta P39 §3). Trzy jawne pochodzenia danej:
 * z modelu / z katalogu / deklarowane. Zdolności wstępne pochodzą z katalogu
 * (read-only); zmiana ręczna → stan lokalny okna (ZERO mutacji modelu sieci),
 * oznaczona „dane deklarowane". Komponent jest w pełni sterowany propsami.
 */

import type {
  KluczNumeryczny,
  KluczZdolnosci,
  NumeryczneModulu,
  OpisModulu,
  PochodzenieDanej,
  ZdolnosciModulu,
} from './macierzModel';
import {
  ETYKIETY_BLOKADY,
  ETYKIETY_POCHODZENIA,
  MACIERZ_STRINGS,
  formatMoc,
  formatNapiecie,
} from './strings';

const ETYKIETY_ZDOLNOSCI: Record<KluczZdolnosci, string> = {
  hasLvrtCurve: 'Krzywa LVRT',
  hasHvrtCurve: 'Krzywa HVRT',
  hasPfDroop: 'Droop P(f)',
  hasQuCurve: 'Krzywa Q(U)',
  hasDynamicModel: 'Model dynamiczny',
  hasScadaCommunication: 'Łączność SCADA operatora',
  hasDisturbanceRecorder: 'Rejestrator zakłóceń',
  activePowerControlEnabled: 'Regulacja mocy czynnej',
  stopGenerationEnabled: 'Zaprzestanie generacji',
  reductionGenerationEnabled: 'Zmniejszenie generacji',
  islandOperationRequired: 'Wymagana praca wyspowa',
  islandOperationCapable: 'Zdolność pracy wyspowej',
  blackStartRequired: 'Wymagany rozruch autonomiczny',
  blackStartCapable: 'Zdolność rozruchu autonomicznego',
  powerOscillationDampingRequired: 'Wymagane tłumienie oscylacji',
  powerOscillationDampingEnabled: 'Tłumienie oscylacji aktywne',
};

const KOLEJNOSC_ZDOLNOSCI: readonly KluczZdolnosci[] = [
  'hasLvrtCurve',
  'hasHvrtCurve',
  'hasPfDroop',
  'hasQuCurve',
  'hasDynamicModel',
  'hasScadaCommunication',
  'hasDisturbanceRecorder',
  'activePowerControlEnabled',
  'stopGenerationEnabled',
  'reductionGenerationEnabled',
  'islandOperationRequired',
  'islandOperationCapable',
  'blackStartRequired',
  'blackStartCapable',
  'powerOscillationDampingRequired',
  'powerOscillationDampingEnabled',
];

const ETYKIETY_PARAMETROW: Record<KluczNumeryczny, string> = {
  pMinKw: 'Moc minimalna [kW]',
  droopPercent: 'Droop P(f) [%]',
  deadBandHz: 'Martwa strefa [Hz]',
  rampPctPerMin: 'Rampa mocy [%/min]',
  cosPhiMin: 'cosφ min',
  qMin: 'Qmin/Pn [p.u.]',
  qMax: 'Qmax/Pn [p.u.]',
  reactiveCurrentGain: 'Wzmocnienie prądu biernego',
  pRecoveryTimeS: 'Odbudowa mocy [s]',
  thduPercent: 'THD napięcia [%]',
};

const KOLEJNOSC_PARAMETROW: readonly KluczNumeryczny[] = [
  'pMinKw',
  'droopPercent',
  'deadBandHz',
  'rampPctPerMin',
  'cosPhiMin',
  'qMin',
  'qMax',
  'reactiveCurrentGain',
  'pRecoveryTimeS',
  'thduPercent',
];

function ZnacznikPochodzenia({ pochodzenie }: { pochodzenie: PochodzenieDanej }): JSX.Element {
  return <span className="mvd-oze-pochodzenie">{ETYKIETY_POCHODZENIA[pochodzenie]}</span>;
}

export interface PanelModuluProps {
  readonly opis: OpisModulu;
  readonly zdolnosci: ZdolnosciModulu;
  readonly pochodzenie: Readonly<Record<KluczZdolnosci, PochodzenieDanej>>;
  readonly numeryczne: NumeryczneModulu;
  readonly onZmienZdolnosc: (klucz: KluczZdolnosci, wartosc: boolean) => void;
  readonly onZmienParametr: (klucz: KluczNumeryczny, wartosc: string) => void;
}

export function PanelModulu({
  opis,
  zdolnosci,
  pochodzenie,
  numeryczne,
  onZmienZdolnosc,
  onZmienParametr,
}: PanelModuluProps): JSX.Element {
  return (
    <section className="mvd-oze-panel" data-testid="mvd-oze-panel-modulu" aria-label={MACIERZ_STRINGS.panelTytul}>
      <h4>{MACIERZ_STRINGS.panelTytul}</h4>
      <p className="mvd-oze-panel-etyk">{opis.nazwa}</p>

      <div className="mvd-oze-panel-blok">
        <div className="mvd-oze-metryka">
          <span>{MACIERZ_STRINGS.kolMoc}</span>
          <span className="mvd-oze-num">{formatMoc(opis.mocKw)}</span>
        </div>
        <div className="mvd-oze-metryka">
          <span>{MACIERZ_STRINGS.kolNapiecie}</span>
          <span className="mvd-oze-num">
            {formatNapiecie(opis.napiecieKv)}
            <ZnacznikPochodzenia pochodzenie="model" />
          </span>
        </div>
      </div>

      {opis.powodBlokady ? (
        <div className="mvd-oze-blokada" data-testid="mvd-oze-panel-blokada">
          {opis.powodBlokady === 'brak_napiecia'
            ? MACIERZ_STRINGS.brakNapiecia
            : MACIERZ_STRINGS.brakMocy}
          <div style={{ marginTop: 4, fontWeight: 600 }}>{ETYKIETY_BLOKADY[opis.powodBlokady]}</div>
        </div>
      ) : null}

      <div className="mvd-oze-panel-blok">
        <span className="mvd-oze-panel-etyk">{MACIERZ_STRINGS.zdolnosci}</span>
        <p className="mvd-oze-panel-etyk" style={{ textTransform: 'none', margin: '4px 0 6px' }}>
          {MACIERZ_STRINGS.panelOpis}
        </p>
        {KOLEJNOSC_ZDOLNOSCI.map((klucz) => (
          <label key={klucz} className="mvd-oze-toggle">
            <input
              type="checkbox"
              checked={zdolnosci[klucz]}
              onChange={(event) => onZmienZdolnosc(klucz, event.target.checked)}
              data-testid={`mvd-oze-zdolnosc-${klucz}`}
            />
            <span>{ETYKIETY_ZDOLNOSCI[klucz]}</span>
            <ZnacznikPochodzenia pochodzenie={pochodzenie[klucz]} />
          </label>
        ))}
      </div>

      <div className="mvd-oze-panel-blok">
        <span className="mvd-oze-panel-etyk">{MACIERZ_STRINGS.parametry}</span>
        <div style={{ marginTop: 6 }}>
          {KOLEJNOSC_PARAMETROW.map((klucz) => (
            <label key={klucz} className="mvd-oze-field">
              <span>
                {ETYKIETY_PARAMETROW[klucz]}
                <ZnacznikPochodzenia pochodzenie="deklarowane" />
              </span>
              <input
                value={numeryczne[klucz]}
                onChange={(event) => onZmienParametr(klucz, event.target.value)}
                data-testid={`mvd-oze-param-${klucz}`}
              />
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}

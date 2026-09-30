/*
 * Panel danych wejściowych modułu — formularz biegu „co-jeśli" (karta P39 §3; kontrakt V2 —
 * karta AB-1a Pakiet D2 §2, §8). Każda kontrolka odpowiada JEDNEMU polu kontraktu
 * `NcRfgPtpireeModuleInput` (zdolności `has_*`/`*_enabled`, parametry liczbowe, art. 4
 * `modul_istniejacy`, `data_umowy_przylaczeniowej`, nastawy zabezpieczeń modułu, T12
 * `cease_generation_time_s`). Ograniczenia i komunikaty pól — `ncrfg/formularz.ts` (lustro
 * pydantic, przypięte testem z OpenAPI). Stan lokalny okna — ZERO mutacji modelu sieci.
 * Komponent w pełni sterowany propsami.
 */

import {
  ETYKIETY_POL_NASTAW,
  ETYKIETY_POL_WEJSCIA,
  POLA_LICZBOWE_WEJSCIA,
  type StanModuluIstniejacego,
} from '../ncrfg/formularz';
import { flagaZeStanu, stanZFlagi, type StanFlagi } from '../ncrfg/daneModulu';
import { DANE_MODULU_STRINGS } from '../ncrfg/strings';
import { POLA_NASTAW } from '../ncrfg/typy';
import {
  POLA_ZDOLNOSCI,
  jestZdolnosciaTrojstanowa,
  type BledyFormularza,
  type FormularzModulu,
  type OpisModulu,
  type PochodzenieDanej,
  type PowodBlokady,
} from './macierzModel';
import {
  ETYKIETY_BLOKADY,
  ETYKIETY_POCHODZENIA,
  ETYKIETY_ZDOLNOSCI,
  MACIERZ_STRINGS,
  formatMoc,
  formatNapiecie,
} from './strings';

function ZnacznikPochodzenia({ pochodzenie }: { pochodzenie: PochodzenieDanej }): JSX.Element {
  return <span className="mvd-oze-pochodzenie">{ETYKIETY_POCHODZENIA[pochodzenie]}</span>;
}

function BladPola({ komunikat, testid }: { komunikat?: string; testid: string }): JSX.Element | null {
  if (!komunikat) return null;
  return (
    <span className="mvd-oze-pole-blad" role="alert" data-testid={testid}>
      {komunikat}
    </span>
  );
}

export interface PanelModuluProps {
  readonly opis: OpisModulu;
  readonly formularz: FormularzModulu;
  /** Błędy pól po próbie złożenia wejścia (klucz = pole kontraktu); pusty obiekt — brak. */
  readonly bledy: BledyFormularza;
  readonly onZmienFormularz: (formularz: FormularzModulu) => void;
}

export function PanelModulu({
  opis,
  formularz,
  bledy,
  onZmienFormularz,
}: PanelModuluProps): JSX.Element {
  const f = formularz;
  return (
    <section
      className="mvd-oze-panel"
      data-testid="mvd-oze-panel-modulu"
      aria-label={MACIERZ_STRINGS.panelTytul}
    >
      <h4>{MACIERZ_STRINGS.panelTytul}</h4>
      <p className="mvd-oze-panel-etyk">{opis.nazwa}</p>

      <div className="mvd-oze-panel-blok">
        <div className="mvd-oze-metryka">
          <span>{MACIERZ_STRINGS.kolMoc}</span>
          <span className="mvd-oze-num">
            {formatMoc(opis.mocKw)}
            <ZnacznikPochodzenia pochodzenie="model" />
          </span>
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
          {OPIS_BLOKADY[opis.powodBlokady]}
          <div style={{ marginTop: 4, fontWeight: 600 }}>{ETYKIETY_BLOKADY[opis.powodBlokady]}</div>
        </div>
      ) : null}
      {opis.powodBlokady === null ? (
        <FormularzPanelu f={f} bledy={bledy} onZmienFormularz={onZmienFormularz} />
      ) : null}
    </section>
  );
}

/** Opis blokady modułu w panelu (co uzupełnić, żeby moduł objąć biegiem). */
const OPIS_BLOKADY: Readonly<Record<PowodBlokady, string>> = {
  brak_napiecia: MACIERZ_STRINGS.brakNapiecia,
  brak_mocy: MACIERZ_STRINGS.brakMocy,
  brak_wejscia_modelu: MACIERZ_STRINGS.brakWejsciaModelu,
};

/**
 * Formularz biegu „co-jeśli" modułu objętego biegiem (z wejściem modelu). Moduł zablokowany
 * nie trafia do biegu, a formularz startuje wyłącznie z danych modelu — blokada nazywa powód
 * i to, co uzupełnić w modelu, zamiast pustego formularza bez zastosowania.
 */
function FormularzPanelu({
  f,
  bledy,
  onZmienFormularz,
}: {
  readonly f: FormularzModulu;
  readonly bledy: BledyFormularza;
  readonly onZmienFormularz: (formularz: FormularzModulu) => void;
}): JSX.Element {
  return (
    <>
      <p className="mvd-oze-panel-etyk" style={{ textTransform: 'none', margin: '4px 0 6px' }}>
        {MACIERZ_STRINGS.panelOpis}
      </p>

      <div className="mvd-oze-panel-blok">
        <span className="mvd-oze-panel-etyk">{MACIERZ_STRINGS.zdolnosci}</span>
        {POLA_ZDOLNOSCI.map((pole) =>
          jestZdolnosciaTrojstanowa(pole) ? (
            // Deklaracja trójstanowa (`bool | None`): „nie zadeklarowano" ≠ „nie".
            <label key={pole} className="mvd-oze-field">
              <span>
                {ETYKIETY_ZDOLNOSCI[pole]}
                <ZnacznikPochodzenia pochodzenie={f.pochodzenieZdolnosci[pole]} />
              </span>
              <select
                value={stanZFlagi(f.zdolnosci[pole])}
                onChange={(event) =>
                  onZmienFormularz({
                    ...f,
                    zdolnosci: {
                      ...f.zdolnosci,
                      [pole]: flagaZeStanu(event.target.value as StanFlagi),
                    },
                    pochodzenieZdolnosci: { ...f.pochodzenieZdolnosci, [pole]: 'deklarowane' },
                  })
                }
                data-testid={`mvd-oze-zdolnosc-${pole}`}
              >
                <option value="nieustalone">{DANE_MODULU_STRINGS.flagaNieustalone}</option>
                <option value="tak">{DANE_MODULU_STRINGS.flagaTak}</option>
                <option value="nie">{DANE_MODULU_STRINGS.flagaNie}</option>
              </select>
            </label>
          ) : (
            <label key={pole} className="mvd-oze-toggle">
              <input
                type="checkbox"
                checked={f.zdolnosci[pole]}
                onChange={(event) =>
                  onZmienFormularz({
                    ...f,
                    zdolnosci: { ...f.zdolnosci, [pole]: event.target.checked },
                    pochodzenieZdolnosci: { ...f.pochodzenieZdolnosci, [pole]: 'deklarowane' },
                  })
                }
                data-testid={`mvd-oze-zdolnosc-${pole}`}
              />
              <span>{ETYKIETY_ZDOLNOSCI[pole]}</span>
              <ZnacznikPochodzenia pochodzenie={f.pochodzenieZdolnosci[pole]} />
            </label>
          ),
        )}
      </div>

      <div className="mvd-oze-panel-blok">
        <span className="mvd-oze-panel-etyk">{MACIERZ_STRINGS.parametry}</span>
        <div style={{ marginTop: 6 }}>
          {POLA_LICZBOWE_WEJSCIA.map((pole) => (
            <label key={pole} className="mvd-oze-field">
              <span>
                {ETYKIETY_POL_WEJSCIA[pole]}
                <ZnacznikPochodzenia pochodzenie={f.pochodzenieLiczb[pole]} />
              </span>
              <input
                inputMode="decimal"
                value={f.liczby[pole]}
                aria-invalid={bledy[pole] ? true : undefined}
                onChange={(event) =>
                  onZmienFormularz({
                    ...f,
                    liczby: { ...f.liczby, [pole]: event.target.value },
                    pochodzenieLiczb: { ...f.pochodzenieLiczb, [pole]: 'deklarowane' },
                  })
                }
                data-testid={`mvd-oze-param-${pole}`}
              />
              <BladPola komunikat={bledy[pole]} testid={`mvd-oze-param-${pole}-blad`} />
            </label>
          ))}
        </div>
      </div>

      <div className="mvd-oze-panel-blok">
        <label className="mvd-oze-field">
          <span>
            {MACIERZ_STRINGS.art4}
            <ZnacznikPochodzenia pochodzenie={f.pochodzenieModuluIstniejacego} />
          </span>
          <select
            value={f.modulIstniejacy}
            onChange={(event) =>
              onZmienFormularz({
                ...f,
                modulIstniejacy: event.target.value as StanModuluIstniejacego,
                pochodzenieModuluIstniejacego: 'deklarowane',
              })
            }
            data-testid="mvd-oze-param-modul_istniejacy"
          >
            <option value="nieustalone">{MACIERZ_STRINGS.art4Nieustalone}</option>
            <option value="tak">{MACIERZ_STRINGS.art4Tak}</option>
            <option value="nie">{MACIERZ_STRINGS.art4Nie}</option>
          </select>
        </label>
        <label className="mvd-oze-field">
          <span>
            {MACIERZ_STRINGS.dataUmowy}
            <ZnacznikPochodzenia pochodzenie={f.pochodzenieDatyUmowy} />
          </span>
          <input
            type="date"
            value={f.dataUmowy}
            aria-invalid={bledy.data_umowy_przylaczeniowej ? true : undefined}
            onChange={(event) =>
              onZmienFormularz({
                ...f,
                dataUmowy: event.target.value,
                pochodzenieDatyUmowy: 'deklarowane',
              })
            }
            data-testid="mvd-oze-param-data_umowy_przylaczeniowej"
          />
          <BladPola
            komunikat={bledy.data_umowy_przylaczeniowej}
            testid="mvd-oze-param-data_umowy_przylaczeniowej-blad"
          />
        </label>
      </div>

      <div className="mvd-oze-panel-blok" data-testid="mvd-oze-nastawy">
        <span className="mvd-oze-panel-etyk">{MACIERZ_STRINGS.nastawyTytul}</span>
        <p className="mvd-oze-panel-etyk" style={{ textTransform: 'none', margin: '4px 0 6px' }}>
          {MACIERZ_STRINGS.nastawyOpis}
        </p>
        {POLA_NASTAW.map((pole) => (
          <label key={pole} className="mvd-oze-field">
            <span>
              {ETYKIETY_POL_NASTAW[pole]}
              <ZnacznikPochodzenia pochodzenie={f.pochodzenieNastaw} />
            </span>
            <input
              inputMode="decimal"
              value={f.nastawy.wartosci[pole]}
              aria-invalid={bledy[pole] ? true : undefined}
              onChange={(event) =>
                onZmienFormularz({
                  ...f,
                  pochodzenieNastaw: 'deklarowane',
                  nastawy: {
                    ...f.nastawy,
                    wartosci: { ...f.nastawy.wartosci, [pole]: event.target.value },
                  },
                })
              }
              data-testid={`mvd-oze-nastawa-${pole}`}
            />
            <BladPola komunikat={bledy[pole]} testid={`mvd-oze-nastawa-${pole}-blad`} />
          </label>
        ))}
        <label className="mvd-oze-field">
          <span>{MACIERZ_STRINGS.nastawyZrodlo}</span>
          <input
            value={f.nastawy.zrodlo}
            aria-invalid={bledy.zrodlo_pl ? true : undefined}
            onChange={(event) =>
              onZmienFormularz({
                ...f,
                nastawy: { ...f.nastawy, zrodlo: event.target.value },
                pochodzenieNastaw: 'deklarowane',
              })
            }
            data-testid="mvd-oze-nastawa-zrodlo_pl"
          />
          <BladPola komunikat={bledy.zrodlo_pl} testid="mvd-oze-nastawa-zrodlo_pl-blad" />
        </label>
      </div>
    </>
  );
}

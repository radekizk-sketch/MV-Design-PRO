/*
 * Sekcja formularza „Dane modułu NC RfG w modelu" — status art. 4, data umowy, nastawy
 * zabezpieczeń i deklaracje modułu (`daneModulu.ts`). Komponent w pełni sterowany propsami;
 * używany przez kreator źródła OZE (zapis `add_converter_source`) i edycję parametrów
 * generatora (zapis `update_element_parameters`). Każda kontrolka ↔ jedno pole kontraktu.
 */

import {
  ETYKIETY_POL_NASTAW,
  ETYKIETY_POL_WEJSCIA,
  type StanModuluIstniejacego,
} from './formularz';
import {
  POLA_FLAG_DEKLARACJI,
  POLA_LICZBOWE_DEKLARACJI,
  type FormularzDanychModulu,
  type PoleBleduDanychModulu,
  type StanFlagi,
} from './daneModulu';
import { DANE_MODULU_STRINGS as T, ETYKIETY_FLAG_DEKLARACJI } from './strings';
import { POLA_NASTAW } from './typy';
import './ncrfg.css';

function BladPola({ komunikat, testid }: { komunikat?: string; testid: string }): JSX.Element | null {
  if (!komunikat) return null;
  return (
    <span className="mvd-ncrfg-pole-blad" role="alert" data-testid={testid}>
      {komunikat}
    </span>
  );
}

export interface SekcjaDanychModuluProps {
  readonly formularz: FormularzDanychModulu;
  readonly bledy: Readonly<Partial<Record<PoleBleduDanychModulu, string>>>;
  readonly onZmien: (formularz: FormularzDanychModulu) => void;
  readonly testid: string;
}

export function SekcjaDanychModulu({
  formularz: f,
  bledy,
  onZmien,
  testid,
}: SekcjaDanychModuluProps): JSX.Element {
  return (
    <section className="mvd-ncrfg-dane-modulu" data-testid={testid} aria-label={T.tytul}>
      <h5 className="mvd-ncrfg-sekcja-tytul">{T.tytul}</h5>
      <p className="mvd-ncrfg-opis">{T.opis}</p>

      <div className="mvd-ncrfg-dane-grupa">
        <label className="mvd-ncrfg-dane-pole">
          <span>{T.art4}</span>
          <select
            value={f.modulIstniejacy}
            onChange={(e) => onZmien({ ...f, modulIstniejacy: e.target.value as StanModuluIstniejacego })}
            data-testid={`${testid}-modul_istniejacy`}
          >
            <option value="nieustalone">{T.art4Nieustalone}</option>
            <option value="tak">{T.art4Tak}</option>
            <option value="nie">{T.art4Nie}</option>
          </select>
        </label>
        <label className="mvd-ncrfg-dane-pole">
          <span>{T.dataUmowy}</span>
          <input
            type="date"
            value={f.dataUmowy}
            aria-invalid={bledy.data_umowy_przylaczeniowej ? true : undefined}
            onChange={(e) => onZmien({ ...f, dataUmowy: e.target.value })}
            data-testid={`${testid}-data_umowy_przylaczeniowej`}
          />
          <BladPola
            komunikat={bledy.data_umowy_przylaczeniowej}
            testid={`${testid}-data_umowy_przylaczeniowej-blad`}
          />
        </label>
      </div>

      <div className="mvd-ncrfg-dane-grupa" data-testid={`${testid}-deklaracje`}>
        <h6 className="mvd-ncrfg-podtytul">{T.deklaracjeTytul}</h6>
        <p className="mvd-ncrfg-opis">{T.deklaracjeOpis}</p>
        {POLA_FLAG_DEKLARACJI.map((pole) => (
          <label key={pole} className="mvd-ncrfg-dane-pole">
            <span>{ETYKIETY_FLAG_DEKLARACJI[pole]}</span>
            <select
              value={f.flagi[pole]}
              onChange={(e) =>
                onZmien({ ...f, flagi: { ...f.flagi, [pole]: e.target.value as StanFlagi } })
              }
              data-testid={`${testid}-flaga-${pole}`}
            >
              <option value="nieustalone">{T.flagaNieustalone}</option>
              <option value="tak">{T.flagaTak}</option>
              <option value="nie">{T.flagaNie}</option>
            </select>
          </label>
        ))}
        {POLA_LICZBOWE_DEKLARACJI.map((pole) => (
          <label key={pole} className="mvd-ncrfg-dane-pole">
            <span>{ETYKIETY_POL_WEJSCIA[pole]}</span>
            <input
              inputMode="decimal"
              value={f.liczby[pole]}
              aria-invalid={bledy[pole] ? true : undefined}
              onChange={(e) => onZmien({ ...f, liczby: { ...f.liczby, [pole]: e.target.value } })}
              data-testid={`${testid}-liczba-${pole}`}
            />
            <BladPola komunikat={bledy[pole]} testid={`${testid}-liczba-${pole}-blad`} />
          </label>
        ))}
        <label className="mvd-ncrfg-dane-pole">
          <span>{T.deklaracjeZrodlo}</span>
          <input
            value={f.zrodloDeklaracji}
            aria-invalid={bledy.zrodlo_deklaracji ? true : undefined}
            onChange={(e) => onZmien({ ...f, zrodloDeklaracji: e.target.value })}
            data-testid={`${testid}-zrodlo_deklaracji`}
          />
          <BladPola komunikat={bledy.zrodlo_deklaracji} testid={`${testid}-zrodlo_deklaracji-blad`} />
        </label>
      </div>

      <div className="mvd-ncrfg-dane-grupa" data-testid={`${testid}-nastawy`}>
        <h6 className="mvd-ncrfg-podtytul">{T.nastawyTytul}</h6>
        <p className="mvd-ncrfg-opis">{T.nastawyOpis}</p>
        {POLA_NASTAW.map((pole) => (
          <label key={pole} className="mvd-ncrfg-dane-pole">
            <span>{ETYKIETY_POL_NASTAW[pole]}</span>
            <input
              inputMode="decimal"
              value={f.nastawy.wartosci[pole]}
              aria-invalid={bledy[pole] ? true : undefined}
              onChange={(e) =>
                onZmien({
                  ...f,
                  nastawy: { ...f.nastawy, wartosci: { ...f.nastawy.wartosci, [pole]: e.target.value } },
                })
              }
              data-testid={`${testid}-nastawa-${pole}`}
            />
            <BladPola komunikat={bledy[pole]} testid={`${testid}-nastawa-${pole}-blad`} />
          </label>
        ))}
        <label className="mvd-ncrfg-dane-pole">
          <span>{T.nastawyZrodlo}</span>
          <input
            value={f.nastawy.zrodlo}
            aria-invalid={bledy.zrodlo_pl ? true : undefined}
            onChange={(e) => onZmien({ ...f, nastawy: { ...f.nastawy, zrodlo: e.target.value } })}
            data-testid={`${testid}-nastawa-zrodlo_pl`}
          />
          <BladPola komunikat={bledy.zrodlo_pl} testid={`${testid}-nastawa-zrodlo_pl-blad`} />
        </label>
      </div>
    </section>
  );
}

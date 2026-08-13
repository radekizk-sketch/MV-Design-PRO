/*
 * Formularz parametrów projektowych okna „Analizy akademickie".
 *
 * Każda kontrolka mapuje na DOKŁADNIE jeden klucz kontraktu wejściowego solvera
 * (`parametry.ts` — mapowanie klucz → miejsce odczytu). Pola startują PUSTE:
 * pusty formularz oznacza żądanie z `parameters: {}` i udokumentowane wartości
 * domyślne solvera. Okno nie podstawia żadnej liczby za projektanta.
 */

import type { ChangeEvent } from 'react';

import { AKADEMICKIE_STRINGS as S } from './strings';
import {
  METODY_DETEKCJI,
  POLA_REFERENCJI,
  POLA_SILNIKA,
  POLA_UZIOMU,
  zestawParametrow,
  type DefinicjaPola,
  type StanPol,
  type WierszListy,
} from './parametry';

function PoleParametru({
  definicja,
  wartosc,
  prefiks,
  onZmiana,
}: {
  definicja: DefinicjaPola;
  wartosc: string;
  prefiks: string;
  onZmiana: (klucz: string, wartosc: string) => void;
}) {
  const id = `${prefiks}-${definicja.klucz}`;
  const etykieta = definicja.jednostka
    ? `${definicja.etykieta} [${definicja.jednostka}]`
    : definicja.etykieta;

  if (definicja.rodzaj === 'wybor') {
    return (
      <label className="mvd-akad-pole" htmlFor={id}>
        <span className="mvd-akad-pole-etyk">{etykieta}</span>
        <select
          id={id}
          className="mvd-akad-pole-kontrolka"
          value={wartosc}
          data-testid={`mvd-akad-pole-${definicja.klucz}`}
          onChange={(zdarzenie: ChangeEvent<HTMLSelectElement>) =>
            onZmiana(definicja.klucz, zdarzenie.target.value)
          }
        >
          <option value="">{S.kreska}</option>
          {(definicja.opcje ?? []).map((opcja) => (
            <option key={opcja.wartosc} value={opcja.wartosc}>
              {opcja.etykieta}
            </option>
          ))}
        </select>
        {definicja.opis && <span className="mvd-akad-pole-opis">{definicja.opis}</span>}
      </label>
    );
  }

  return (
    <label className="mvd-akad-pole" htmlFor={id}>
      <span className="mvd-akad-pole-etyk">{etykieta}</span>
      <input
        id={id}
        className="mvd-akad-pole-kontrolka"
        type="text"
        inputMode={definicja.rodzaj === 'liczba' ? 'decimal' : 'text'}
        value={wartosc}
        data-testid={`mvd-akad-pole-${definicja.klucz}`}
        onChange={(zdarzenie: ChangeEvent<HTMLInputElement>) =>
          onZmiana(definicja.klucz, zdarzenie.target.value)
        }
      />
      {definicja.opis && <span className="mvd-akad-pole-opis">{definicja.opis}</span>}
    </label>
  );
}

export interface FormularzParametrowProps {
  readonly rodzaj: string;
  readonly pola: StanPol;
  readonly uziom: StanPol;
  readonly metody: readonly string[];
  readonly wiersze: readonly WierszListy[];
  readonly onPole: (klucz: string, wartosc: string) => void;
  readonly onUziom: (klucz: string, wartosc: string) => void;
  readonly onMetoda: (metoda: string, wlaczona: boolean) => void;
  readonly onWiersz: (indeks: number, klucz: string, wartosc: string) => void;
  readonly onDodajWiersz: () => void;
  readonly onUsunWiersz: (indeks: number) => void;
}

export function FormularzParametrow({
  rodzaj,
  pola,
  uziom,
  metody,
  wiersze,
  onPole,
  onUziom,
  onMetoda,
  onWiersz,
  onDodajWiersz,
  onUsunWiersz,
}: FormularzParametrowProps) {
  const zestaw = zestawParametrow(rodzaj);
  const definicjeListy = zestaw.lista === 'motors' ? POLA_SILNIKA : POLA_REFERENCJI;
  const tytulListy =
    zestaw.lista === 'motors' ? S.parametrySilnikiTytul : S.parametryReferencjeTytul;
  const opisListy = zestaw.lista === 'motors' ? S.parametrySilnikiOpis : S.parametryReferencjeOpis;
  const dodajListy =
    zestaw.lista === 'motors' ? S.parametryDodajSilnik : S.parametryDodajReferencje;
  const usunListy = zestaw.lista === 'motors' ? S.parametryUsunSilnik : S.parametryUsunReferencje;

  return (
    <div className="mvd-akad-parametry" data-testid="mvd-akad-parametry">
      <p className="mvd-akad-opis">{S.parametryOpis}</p>

      {zestaw.pola.length > 0 && (
        <div className="mvd-akad-pola-siatka">
          {zestaw.pola.map((definicja) => (
            <PoleParametru
              key={definicja.klucz}
              definicja={definicja}
              prefiks="mvd-akad-param"
              wartosc={pola[definicja.klucz] ?? ''}
              onZmiana={onPole}
            />
          ))}
        </div>
      )}

      {zestaw.uziom && (
        <div className="mvd-akad-pola-siatka" data-testid="mvd-akad-uziom">
          {POLA_UZIOMU.map((definicja) => (
            <PoleParametru
              key={definicja.klucz}
              definicja={definicja}
              prefiks="mvd-akad-uziom"
              wartosc={uziom[definicja.klucz] ?? ''}
              onZmiana={onUziom}
            />
          ))}
        </div>
      )}

      {zestaw.metodyDetekcji && (
        <fieldset className="mvd-akad-metody" data-testid="mvd-akad-metody">
          <legend className="mvd-akad-sekcja-tytul">{S.parametryMetodyTytul}</legend>
          {METODY_DETEKCJI.map((opcja) => (
            <label className="mvd-akad-metoda" key={opcja.wartosc} htmlFor={`mvd-akad-metoda-${opcja.wartosc}`}>
              <input
                id={`mvd-akad-metoda-${opcja.wartosc}`}
                type="checkbox"
                checked={metody.includes(opcja.wartosc)}
                data-testid={`mvd-akad-metoda-${opcja.wartosc}`}
                onChange={(zdarzenie: ChangeEvent<HTMLInputElement>) =>
                  onMetoda(opcja.wartosc, zdarzenie.target.checked)
                }
              />
              <span>{opcja.etykieta}</span>
            </label>
          ))}
        </fieldset>
      )}

      {zestaw.lista !== null && (
        <div className="mvd-akad-lista" data-testid="mvd-akad-lista">
          <h4 className="mvd-akad-sekcja-tytul">{tytulListy}</h4>
          <p className="mvd-akad-opis">{opisListy}</p>
          {wiersze.map((wiersz, indeks) => (
            // Wiersze listy nie mają identyfikatora niezależnego od pozycji — klucz
            // pozycyjny jest tu poprawny (dodawanie/usuwanie przebudowuje listę stanu).
            <div className="mvd-akad-lista-wiersz" key={`wiersz-${indeks}`} data-testid={`mvd-akad-lista-wiersz-${indeks}`}>
              <div className="mvd-akad-pola-siatka">
                {definicjeListy.map((definicja) => (
                  <PoleParametru
                    key={definicja.klucz}
                    definicja={definicja}
                    prefiks={`mvd-akad-lista-${indeks}`}
                    wartosc={wiersz[definicja.klucz] ?? ''}
                    onZmiana={(klucz, wartosc) => onWiersz(indeks, klucz, wartosc)}
                  />
                ))}
              </div>
              <button
                type="button"
                className="mvd-akad-btn-wtorny"
                data-testid={`mvd-akad-usun-wiersz-${indeks}`}
                onClick={() => onUsunWiersz(indeks)}
              >
                {usunListy}
              </button>
            </div>
          ))}
          <button
            type="button"
            className="mvd-akad-btn-wtorny"
            data-testid="mvd-akad-dodaj-wiersz"
            onClick={onDodajWiersz}
          >
            {dodajListy}
          </button>
        </div>
      )}
    </div>
  );
}

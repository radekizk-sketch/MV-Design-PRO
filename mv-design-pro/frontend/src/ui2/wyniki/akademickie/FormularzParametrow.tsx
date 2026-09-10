/*
 * Formularz danych od użytkownika okna „Analizy specjalistyczne".
 *
 * Każda kontrolka mapuje na DOKŁADNIE jeden klucz kontraktu wejściowego
 * (`parametry.ts` — mapowanie klucz → miejsce odczytu w solverze albo w moście).
 * Pola startują PUSTE: pusty formularz oznacza żądanie z `parameters: {}` i
 * udokumentowane wartości domyślne solvera. Okno nie podstawia żadnej liczby
 * za projektanta.
 *
 * Pole rodzaju `szyna` (karta B-02) to wybór szyny Z MODELU (migawka ENM —
 * to samo źródło co schemat), a nie wolny tekst: referencja szyny wpisana
 * ręcznie była kodem produkcyjnym na ekranie i najczęstszym błędem wejścia
 * (silnik przyłączony do nieistniejącej szyny). Model bez szyn = pole mówi to
 * wprost (bez fabrykowania listy).
 */

import type { ChangeEvent } from 'react';

import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { AKADEMICKIE_STRINGS as S } from './strings';
import {
  METODY_DETEKCJI,
  POLA_ODBIORCOW,
  POLA_REFERENCJI,
  POLA_SILNIKA,
  POLA_UZIOMU,
  POLA_WIDMA,
  zestawParametrow,
  type DefinicjaPola,
  type ListaZlozona,
  type StanPol,
  type WierszListy,
} from './parametry';

/** Definicje pól i etykiety per lista złożona — jedna decyzja na `ListaZlozona`. */
const DEFINICJE_LISTY: Record<ListaZlozona, readonly DefinicjaPola[]> = {
  motors: POLA_SILNIKA,
  benchmark_references: POLA_REFERENCJI,
  harmonic_spectra: POLA_WIDMA,
  customer_counts: POLA_ODBIORCOW,
};
const TYTUL_LISTY: Record<ListaZlozona, string> = {
  motors: S.parametrySilnikiTytul,
  benchmark_references: S.parametryReferencjeTytul,
  harmonic_spectra: S.parametryWidmoTytul,
  customer_counts: S.parametryOdbiorcyTytul,
};
const OPIS_LISTY: Record<ListaZlozona, string> = {
  motors: S.parametrySilnikiOpis,
  benchmark_references: S.parametryReferencjeOpis,
  harmonic_spectra: S.parametryWidmoOpis,
  customer_counts: S.parametryOdbiorcyOpis,
};
const DODAJ_LISTY: Record<ListaZlozona, string> = {
  motors: S.parametryDodajSilnik,
  benchmark_references: S.parametryDodajReferencje,
  harmonic_spectra: S.parametryDodajWidmo,
  customer_counts: S.parametryDodajOdbiorcow,
};
const USUN_LISTY: Record<ListaZlozona, string> = {
  motors: S.parametryUsunSilnik,
  benchmark_references: S.parametryUsunReferencje,
  harmonic_spectra: S.parametryUsunWidmo,
  customer_counts: S.parametryUsunOdbiorcow,
};

/** Szyny zatwierdzonego modelu (ref → nazwa) — jedno źródło z migawką ENM. */
export function useSzynyModelu(): readonly { ref: string; nazwa: string }[] {
  const snapshot = useSnapshotStore((stan) => stan.snapshot);
  const szyny = (snapshot?.buses ?? []) as readonly { ref_id?: string; name?: string }[];
  return szyny
    .filter((szyna): szyna is { ref_id: string; name?: string } => typeof szyna.ref_id === 'string')
    .map((szyna) => ({ ref: szyna.ref_id, nazwa: szyna.name && szyna.name !== '' ? szyna.name : szyna.ref_id }));
}

function PoleParametru({
  definicja,
  wartosc,
  prefiks,
  szyny,
  onZmiana,
}: {
  definicja: DefinicjaPola;
  wartosc: string;
  prefiks: string;
  szyny: readonly { ref: string; nazwa: string }[];
  onZmiana: (klucz: string, wartosc: string) => void;
}) {
  const id = `${prefiks}-${definicja.klucz}`;
  const etykieta = definicja.jednostka
    ? `${definicja.etykieta} [${definicja.jednostka}]`
    : definicja.etykieta;

  if (definicja.rodzaj === 'wybor' || definicja.rodzaj === 'szyna') {
    const opcje =
      definicja.rodzaj === 'szyna'
        ? szyny.map((szyna) => ({ wartosc: szyna.ref, etykieta: szyna.nazwa }))
        : (definicja.opcje ?? []);
    const pusta =
      definicja.rodzaj === 'szyna'
        ? szyny.length === 0
          ? S.parametrySzynaBrak
          : S.parametrySzynaWybierz
        : S.kreska;
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
          <option value="">{pusta}</option>
          {opcje.map((opcja) => (
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
  const szyny = useSzynyModelu();
  const definicjeListy = zestaw.lista !== null ? DEFINICJE_LISTY[zestaw.lista] : [];
  const tytulListy = zestaw.lista !== null ? TYTUL_LISTY[zestaw.lista] : '';
  const opisListy = zestaw.lista !== null ? OPIS_LISTY[zestaw.lista] : '';
  const dodajListy = zestaw.lista !== null ? DODAJ_LISTY[zestaw.lista] : '';
  const usunListy = zestaw.lista !== null ? USUN_LISTY[zestaw.lista] : '';

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
              szyny={szyny}
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
              szyny={szyny}
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
                    szyny={szyny}
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

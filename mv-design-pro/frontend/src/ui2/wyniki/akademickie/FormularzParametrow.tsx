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

import { useState, type ChangeEvent } from 'react';

import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import type { GotowoscAnalizy, KartaKatalogu } from './api';
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

/**
 * Pole WYMAGANE/OPCJONALNE wg katalogu backendu (karta V12.7 §0.4) — łączy
 * `DefinicjaPola.klucz` (pole formularza) z `ParametrUzytkownika.klucz`
 * katalogu (`earthing.rho1_ohm_m`, `motors[].ref`…) przez PEŁNY klucz kontraktu
 * `V126RunRequest.parameters` (ta sama notacja w obu miejscach — zero drugiego
 * źródła prawdy o tym, co jest wymagane).
 */
function pelnyKluczKontraktu(prefiks: 'pole' | 'uziom' | ListaZlozona, klucz: string): string {
  if (prefiks === 'pole') return klucz;
  if (prefiks === 'uziom') return `earthing.${klucz}`;
  return `${prefiks}[].${klucz}`;
}

function czyWymaganePole(
  karta: KartaKatalogu,
  prefiks: 'pole' | 'uziom' | ListaZlozona,
  klucz: string,
): boolean | null {
  const pelny = pelnyKluczKontraktu(prefiks, klucz);
  const parametr = karta.dane.od_uzytkownika.find((p) => p.klucz === pelny);
  return parametr ? parametr.wymagane : null;
}

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

/** Odznaka WYMAGANE/OPCJONALNE przy etykiecie pola (karta V12.7 §0.4). Brak
 *  wpisu w katalogu (`wymagane === null`) → bez odznaki (pole spoza kontraktu
 *  `od_uzytkownika`, np. metadane wewnętrzne wiersza) — zero zgadywania. */
function OdznakaWymagania({ wymagane }: { wymagane: boolean | null }) {
  if (wymagane === null) return null;
  return (
    <span
      className={
        wymagane ? 'mvd-akad-znacznik mvd-akad-znacznik--wymagane' : 'mvd-akad-znacznik'
      }
    >
      {wymagane ? S.daneWymagane : S.daneOpcjonalne}
    </span>
  );
}

function PoleParametru({
  definicja,
  wartosc,
  prefiks,
  wymagane,
  szyny,
  onZmiana,
}: {
  definicja: DefinicjaPola;
  wartosc: string;
  prefiks: string;
  wymagane: boolean | null;
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
        <span className="mvd-akad-pole-etyk">
          {etykieta}
          <OdznakaWymagania wymagane={wymagane} />
        </span>
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
      <span className="mvd-akad-pole-etyk">
        {etykieta}
        <OdznakaWymagania wymagane={wymagane} />
      </span>
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
  /** Karta katalogu (kontrakt `od_uzytkownika`) — źródło odznak WYMAGANE/
   *  OPCJONALNE i sekcji „Kontrakt danych analizy" (karta V12.7 §0.4). */
  readonly karta: KartaKatalogu;
  /** Gotowość TEJ analizy — podsumowanie „Dane wymagane: n/m" liczone z
   *  `braki[].klucz_parametru`, NIGDY z bieżących wartości formularza. */
  readonly gotowosc: GotowoscAnalizy | undefined;
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
  karta,
  gotowosc,
}: FormularzParametrowProps) {
  const zestaw = zestawParametrow(rodzaj);
  const szyny = useSzynyModelu();
  const definicjeListy = zestaw.lista !== null ? DEFINICJE_LISTY[zestaw.lista] : [];
  const tytulListy = zestaw.lista !== null ? TYTUL_LISTY[zestaw.lista] : '';
  const opisListy = zestaw.lista !== null ? OPIS_LISTY[zestaw.lista] : '';
  const dodajListy = zestaw.lista !== null ? DODAJ_LISTY[zestaw.lista] : '';
  const usunListy = zestaw.lista !== null ? USUN_LISTY[zestaw.lista] : '';
  const [kontraktOtwarty, setKontraktOtwarty] = useState(false);

  const wymaganeLacznie = karta.dane.od_uzytkownika.filter((p) => p.wymagane).length;
  const opcjonalneLacznie = karta.dane.od_uzytkownika.filter((p) => !p.wymagane).length;
  // Karta V12.7 §0.4: liczby z ODPOWIEDZI GOTOWOŚCI backendu (braki z kluczem
  // parametru = pole wymagane niespełnione), nigdy policzone z DOM (`pola`).
  const brakujaceWymaganeKlucze = new Set(
    (gotowosc?.braki ?? []).map((b) => b.klucz_parametru).filter((k): k is string => k !== null),
  );
  const wymaganeSpelnione = wymaganeLacznie - brakujaceWymaganeKlucze.size;

  return (
    <div className="mvd-akad-parametry" data-testid="mvd-akad-parametry">
      <p className="mvd-akad-opis">{S.parametryOpis}</p>

      {karta.dane.od_uzytkownika.length > 0 && (
        <p className="mvd-akad-parametry-podsumowanie" data-testid="mvd-akad-parametry-podsumowanie">
          {S.parametryPodsumowanie({
            wymaganeSpelnione,
            wymaganeLacznie,
            opcjonalneLacznie,
            gotowoscPotwierdzona: gotowosc?.gotowosc === 'POTWIERDZONA',
          })}
        </p>
      )}

      {zestaw.pola.length > 0 && (
        <div className="mvd-akad-pola-siatka">
          {zestaw.pola.map((definicja) => (
            <PoleParametru
              key={definicja.klucz}
              definicja={definicja}
              prefiks="mvd-akad-param"
              wymagane={czyWymaganePole(karta, 'pole', definicja.klucz)}
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
              wymagane={czyWymaganePole(karta, 'uziom', definicja.klucz)}
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
                    wymagane={zestaw.lista === null ? null : czyWymaganePole(karta, zestaw.lista, definicja.klucz)}
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

      {karta.dane.od_uzytkownika.length > 0 && (
        <div className="mvd-akad-kontrakt" data-testid="mvd-akad-kontrakt-danych">
          <button
            type="button"
            className="mvd-akad-btn-wtorny"
            aria-expanded={kontraktOtwarty}
            data-testid="mvd-akad-kontrakt-danych-przelacz"
            onClick={() => setKontraktOtwarty((stan) => !stan)}
          >
            {kontraktOtwarty ? S.kontraktDanychUkryj : S.kontraktDanychPokaz}
          </button>
          {kontraktOtwarty && (
            <div className="mvd-akad-tabela-otoczka">
              <table className="mvd-akad-tabela" data-testid="mvd-akad-kontrakt-danych-tabela">
                <thead>
                  <tr>
                    <th>{S.kontraktKolKlucz}</th>
                    <th>{S.kontraktKolNazwa}</th>
                    <th>{S.kontraktKolJednostka}</th>
                    <th>{S.kontraktKolWymagane}</th>
                    <th>{S.kontraktKolOpis}</th>
                  </tr>
                </thead>
                <tbody>
                  {karta.dane.od_uzytkownika.map((parametr) => (
                    <tr key={parametr.klucz}>
                      <td className="mvd-num">{parametr.klucz}</td>
                      <td>{parametr.nazwa_pl}</td>
                      <td className="mvd-num">{parametr.jednostka}</td>
                      <td>
                        <OdznakaWymagania wymagane={parametr.wymagane} />
                      </td>
                      <td>{parametr.opis_pl}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

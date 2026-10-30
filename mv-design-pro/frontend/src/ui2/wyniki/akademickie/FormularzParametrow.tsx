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
import { TekstZWzorami } from '../../kreatory/rama';
import { nazwaObiektuZMigawki, useNazwaObiektu } from '../wzorzec/useNazwaObiektu';
import type { GotowoscAnalizy, KartaKatalogu } from './api';
import { AKADEMICKIE_STRINGS as S } from './strings';
import {
  METODY_DETEKCJI,
  POLA_NIEZAWODNOSCI,
  POLA_ODBIORCOW,
  POLA_REFERENCJI,
  POLA_SILNIKA,
  POLA_UZIOMU,
  POLA_WIDMA,
  zestawParametrow,
  type DefinicjaPola,
  type ListaZlozona,
  type StanPol,
  type WierszeList,
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
  reliability_data: POLA_NIEZAWODNOSCI,
};
const TYTUL_LISTY: Record<ListaZlozona, string> = {
  motors: S.parametrySilnikiTytul,
  benchmark_references: S.parametryReferencjeTytul,
  harmonic_spectra: S.parametryWidmoTytul,
  customer_counts: S.parametryOdbiorcyTytul,
  reliability_data: S.parametryNiezawodnoscTytul,
};
const OPIS_LISTY: Record<ListaZlozona, string> = {
  motors: S.parametrySilnikiOpis,
  benchmark_references: S.parametryReferencjeOpis,
  harmonic_spectra: S.parametryWidmoOpis,
  customer_counts: S.parametryOdbiorcyOpis,
  reliability_data: S.parametryNiezawodnoscOpis,
};
const DODAJ_LISTY: Record<ListaZlozona, string> = {
  motors: S.parametryDodajSilnik,
  benchmark_references: S.parametryDodajReferencje,
  harmonic_spectra: S.parametryDodajWidmo,
  customer_counts: S.parametryDodajOdbiorcow,
  reliability_data: S.parametryDodajNiezawodnosc,
};
const USUN_LISTY: Record<ListaZlozona, string> = {
  motors: S.parametryUsunSilnik,
  benchmark_references: S.parametryUsunReferencje,
  harmonic_spectra: S.parametryUsunWidmo,
  customer_counts: S.parametryUsunOdbiorcow,
  reliability_data: S.parametryUsunNiezawodnosc,
};

/** Szyny zatwierdzonego modelu (ref → nazwa) — jedno źródło z migawką ENM. */
export function useSzynyModelu(): readonly { ref: string; nazwa: string }[] {
  const snapshot = useSnapshotStore((stan) => stan.snapshot);
  const szyny = (snapshot?.buses ?? []) as readonly { ref_id?: string; name?: string }[];
  // Karta #145: szyna bez nazwy dostaje polską etykietę rodzaju z mostu nazw wyników
  // (jeden resolver), nigdy referencję jako tekst opcji.
  return szyny
    .filter((szyna): szyna is { ref_id: string; name?: string } => typeof szyna.ref_id === 'string')
    .map((szyna) => ({ ref: szyna.ref_id, nazwa: nazwaObiektuZMigawki(snapshot, szyna.ref_id) }));
}

/** Gałęzie zatwierdzonego modelu (ref → nazwa) — jedno źródło z migawką ENM (most
 *  `niezawodnosc_z_parametrow` czyta dane niezawodności po identyfikatorze gałęzi). */
export function useGaleziModelu(): readonly { ref: string; nazwa: string }[] {
  const snapshot = useSnapshotStore((stan) => stan.snapshot);
  const galezie = (snapshot?.branches ?? []) as readonly { ref_id?: string }[];
  return galezie
    .filter((galaz): galaz is { ref_id: string } => typeof galaz.ref_id === 'string')
    .map((galaz) => ({ ref: galaz.ref_id, nazwa: nazwaObiektuZMigawki(snapshot, galaz.ref_id) }));
}

/** Kod warunku gotowości niosącego listę przekształtników wejścia solvera. */
const KOD_WARUNKU_PRZEKSZTALTNIKOW = 'przeksztaltnik.obecny';

/**
 * Przekształtniki do wyboru — DOKŁADNIE zbiór wejścia solvera podany przez gotowość
 * analizy (`application/analyses/v126_gotowosc.py`, warunek `przeksztaltnik.obecny`,
 * `elementy` = przekształtniki z kartą katalogową), nazwane mostem nazw wyników.
 */
function usePrzeksztaltnikiGotowosci(
  gotowosc: GotowoscAnalizy | undefined,
): readonly { ref: string; nazwa: string }[] {
  const nazwaObiektu = useNazwaObiektu();
  const warunek = gotowosc?.warunki.find((w) => w.kod === KOD_WARUNKU_PRZEKSZTALTNIKOW);
  return (warunek?.elementy ?? []).map((ref) => ({ ref, nazwa: nazwaObiektu(ref) }));
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

/** Tekst opcji pustej listy wyboru: zachęta do wyboru albo stan „model nie ma obiektów". */
function opcjaPusta(rodzaj: DefinicjaPola['rodzaj'], liczbaObiektow: number): string {
  if (rodzaj === 'szyna') return liczbaObiektow === 0 ? S.parametrySzynaBrak : S.parametrySzynaWybierz;
  if (rodzaj === 'galaz') return liczbaObiektow === 0 ? S.parametryGalazBrak : S.parametryGalazWybierz;
  if (rodzaj === 'przeksztaltnik') {
    return liczbaObiektow === 0 ? S.parametryPrzeksztaltnikBrak : S.parametryPrzeksztaltnikDomyslny;
  }
  return S.kreska;
}

function PoleParametru({
  definicja,
  wartosc,
  prefiks,
  wymagane,
  szyny,
  galezie,
  przeksztaltniki,
  onZmiana,
}: {
  definicja: DefinicjaPola;
  wartosc: string;
  prefiks: string;
  wymagane: boolean | null;
  szyny: readonly { ref: string; nazwa: string }[];
  galezie: readonly { ref: string; nazwa: string }[];
  przeksztaltniki: readonly { ref: string; nazwa: string }[];
  onZmiana: (klucz: string, wartosc: string) => void;
}) {
  const id = `${prefiks}-${definicja.klucz}`;
  const etykieta = definicja.jednostka
    ? `${definicja.etykieta} [${definicja.jednostka}]`
    : definicja.etykieta;

  if (
    definicja.rodzaj === 'wybor'
    || definicja.rodzaj === 'szyna'
    || definicja.rodzaj === 'galaz'
    || definicja.rodzaj === 'przeksztaltnik'
  ) {
    const obiekty =
      definicja.rodzaj === 'szyna' ? szyny : definicja.rodzaj === 'galaz' ? galezie : przeksztaltniki;
    const opcje =
      definicja.rodzaj === 'wybor'
        ? (definicja.opcje ?? [])
        : obiekty.map((obiekt) => ({ wartosc: obiekt.ref, etykieta: obiekt.nazwa }));
    const pusta = opcjaPusta(definicja.rodzaj, obiekty.length);
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
  readonly wiersze: WierszeList;
  readonly onPole: (klucz: string, wartosc: string) => void;
  readonly onUziom: (klucz: string, wartosc: string) => void;
  readonly onMetoda: (metoda: string, wlaczona: boolean) => void;
  readonly onWiersz: (lista: ListaZlozona, indeks: number, klucz: string, wartosc: string) => void;
  readonly onDodajWiersz: (lista: ListaZlozona) => void;
  readonly onUsunWiersz: (lista: ListaZlozona, indeks: number) => void;
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
  const galezie = useGaleziModelu();
  const przeksztaltniki = usePrzeksztaltnikiGotowosci(gotowosc);
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
              galezie={galezie}
              przeksztaltniki={przeksztaltniki}
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
              galezie={galezie}
              przeksztaltniki={przeksztaltniki}
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

      {zestaw.listy.map((lista) => (
        <div className="mvd-akad-lista" data-testid={`mvd-akad-lista-${lista}`} key={lista}>
          <h4 className="mvd-akad-sekcja-tytul">{TYTUL_LISTY[lista]}</h4>
          <p className="mvd-akad-opis">{OPIS_LISTY[lista]}</p>
          {(wiersze[lista] ?? []).map((wiersz, indeks) => (
            // Wiersze listy nie mają identyfikatora niezależnego od pozycji — klucz
            // pozycyjny jest tu poprawny (dodawanie/usuwanie przebudowuje listę stanu).
            <div
              className="mvd-akad-lista-wiersz"
              key={`wiersz-${indeks}`}
              data-testid={`mvd-akad-lista-${lista}-wiersz-${indeks}`}
            >
              <div className="mvd-akad-pola-siatka">
                {DEFINICJE_LISTY[lista].map((definicja) => (
                  <PoleParametru
                    key={definicja.klucz}
                    definicja={definicja}
                    prefiks={`mvd-akad-lista-${lista}-${indeks}`}
                    wymagane={czyWymaganePole(karta, lista, definicja.klucz)}
                    szyny={szyny}
                    galezie={galezie}
                    przeksztaltniki={przeksztaltniki}
                    wartosc={wiersz[definicja.klucz] ?? ''}
                    onZmiana={(klucz, wartosc) => onWiersz(lista, indeks, klucz, wartosc)}
                  />
                ))}
              </div>
              <button
                type="button"
                className="mvd-akad-btn-wtorny"
                data-testid={`mvd-akad-usun-wiersz-${lista}-${indeks}`}
                onClick={() => onUsunWiersz(lista, indeks)}
              >
                {USUN_LISTY[lista]}
              </button>
            </div>
          ))}
          <button
            type="button"
            className="mvd-akad-btn-wtorny"
            data-testid={`mvd-akad-dodaj-wiersz-${lista}`}
            onClick={() => onDodajWiersz(lista)}
          >
            {DODAJ_LISTY[lista]}
          </button>
        </div>
      ))}

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
                    <th>{S.kontraktKolNazwa}</th>
                    <th>{S.kontraktKolJednostka}</th>
                    <th>{S.kontraktKolWymagane}</th>
                    <th>{S.kontraktKolOpis}</th>
                  </tr>
                </thead>
                <tbody>
                  {karta.dane.od_uzytkownika.map((parametr) => (
                    // Karta #145: klucz kontraktu (`earthing.rho1_ohm_m`) nie jest tekstem
                    // dla projektanta — wiersz nazywa daną po polsku, z jednostką i opisem.
                    <tr key={parametr.klucz}>
                      <td>
                        <TekstZWzorami tekst={parametr.nazwa_pl} />
                      </td>
                      <td className="mvd-num">{parametr.jednostka}</td>
                      <td>
                        <OdznakaWymagania wymagane={parametr.wymagane} />
                      </td>
                      <td>
                        <TekstZWzorami tekst={parametr.opis_pl} />
                      </td>
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

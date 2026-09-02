/*
 * EdytowalnaTabela — JEDNA implementacja tabeli z edycją inline komórek
 * (karta P0.9, plan F §5). Kolumny deklaratywne (`KolumnaEdytowalna`),
 * sortowanie, wirtualizacja okienkowa powyżej progu. Komponent NIE zapisuje
 * nic sam — komórka edytowalna commituje przez `onEdytuj(wiersz, klucz,
 * wartość)`, wołający wykonuje operację domenową (zero fizyki, zero mutacji
 * tutaj). Kolumna typu `akcja` (np. „Zmień kabel" → picker katalogu) woła
 * `onAkcja(wiersz, klucz)`.
 */

import { useMemo, useState, type UIEvent } from 'react';
import {
  obliczOknoWirtualizacji,
  posortujWiersze,
  type KolumnaEdytowalna,
  type StanSortowaniaTabeli,
  type StanZapisuKomorki,
} from './edytowalnaTabelaModel';
import './edytowalnaTabela.css';

export interface EdytowalnaTabelaProps<T> {
  kolumny: readonly KolumnaEdytowalna<T>[];
  wiersze: readonly T[];
  kluczWiersza: (wiersz: T) => string;
  onEdytuj: (wiersz: T, klucz: string, nowaWartosc: string | number) => void;
  onAkcja?: (wiersz: T, klucz: string) => void;
  /** Stan zapisu komórki (idle/zapisywanie/blad) — sterowany przez wołającego. */
  stanKomorki?: (wiersz: T, klucz: string) => StanZapisuKomorki | undefined;
  /** 2× klik na wierszu (np. otwarcie dowodu/inspektora) — opcjonalny. */
  onOtworzWiersz?: (wiersz: T) => void;
  tekstPusty: string;
  testid?: string;
}

export function EdytowalnaTabela<T>({
  kolumny,
  wiersze,
  kluczWiersza,
  onEdytuj,
  onAkcja,
  stanKomorki,
  onOtworzWiersz,
  tekstPusty,
  testid = 'mvd-edyt-tabela',
}: EdytowalnaTabelaProps<T>) {
  const [sort, setSort] = useState<StanSortowaniaTabeli | null>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const wierszePosortowane = useMemo(() => posortujWiersze(kolumny, wiersze, sort), [kolumny, wiersze, sort]);
  const wirtualizacja = wierszePosortowane.length > 500;
  const okno = useMemo(
    () => obliczOknoWirtualizacji(wierszePosortowane.length, scrollTop),
    [wierszePosortowane.length, scrollTop],
  );

  const przelaczSort = (klucz: string) => {
    setSort((poprz) => {
      if (!poprz || poprz.klucz !== klucz) return { klucz, kierunek: 'rosnaco' };
      if (poprz.kierunek === 'rosnaco') return { klucz, kierunek: 'malejaco' };
      return null;
    });
  };

  if (wiersze.length === 0) {
    return (
      <p className="mvd-edyt-tabela-pusta" data-testid={`${testid}-pusta`}>
        {tekstPusty}
      </p>
    );
  }

  return (
    <div
      className="mvd-edyt-tabela-wrap"
      style={wirtualizacja ? { maxHeight: 480, overflowY: 'auto' } : undefined}
      onScroll={wirtualizacja ? (e: UIEvent<HTMLDivElement>) => setScrollTop(e.currentTarget.scrollTop) : undefined}
      data-testid={`${testid}-wrap`}
    >
      <table className="mvd-edyt-tabela" data-testid={testid}>
        <thead>
          <tr>
            {kolumny.map((kol) => {
              const wyr = kol.wyrownanie ?? (kol.mono ? 'prawo' : 'lewo');
              const sortowalna = kol.sortowalna !== false;
              const aktywne = sort?.klucz === kol.klucz;
              const wskaznik = aktywne ? (sort.kierunek === 'rosnaco' ? '▲' : '▼') : '';
              const tresc = (
                <>
                  <span>{kol.etykieta}</span>
                  {kol.jednostka ? <span className="mvd-edyt-tabela-th-unit">[{kol.jednostka}]</span> : null}
                  {wskaznik ? <span aria-hidden="true">{wskaznik}</span> : null}
                </>
              );
              return (
                <th
                  key={kol.klucz}
                  className={wyr === 'prawo' ? 'mvd-edyt-tabela-th-prawo' : undefined}
                  aria-sort={aktywne ? (sort.kierunek === 'rosnaco' ? 'ascending' : 'descending') : 'none'}
                  data-testid={`${testid}-th-${kol.klucz}`}
                >
                  {sortowalna ? (
                    <button type="button" className="mvd-edyt-tabela-th-btn" onClick={() => przelaczSort(kol.klucz)}>
                      {tresc}
                    </button>
                  ) : (
                    <span>{tresc}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {wirtualizacja && okno.wysGora > 0 ? (
            <tr aria-hidden="true">
              <td colSpan={kolumny.length} style={{ height: okno.wysGora, padding: 0, border: 0 }} />
            </tr>
          ) : null}
          {wierszePosortowane.slice(okno.pierwszy, okno.ostatni).map((wiersz) => {
            const rowKey = kluczWiersza(wiersz);
            return (
              <tr
                key={rowKey}
                data-testid={`${testid}-wiersz`}
                onDoubleClick={onOtworzWiersz ? () => onOtworzWiersz(wiersz) : undefined}
              >
                {kolumny.map((kol) => (
                  <Komorka
                    key={kol.klucz}
                    kolumna={kol}
                    wiersz={wiersz}
                    rowKey={rowKey}
                    onEdytuj={onEdytuj}
                    onAkcja={onAkcja}
                    stan={stanKomorki?.(wiersz, kol.klucz)}
                    testid={testid}
                  />
                ))}
              </tr>
            );
          })}
          {wirtualizacja && okno.wysDol > 0 ? (
            <tr aria-hidden="true">
              <td colSpan={kolumny.length} style={{ height: okno.wysDol, padding: 0, border: 0 }} />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function Komorka<T>({
  kolumna,
  wiersz,
  rowKey,
  onEdytuj,
  onAkcja,
  stan,
  testid,
}: {
  kolumna: KolumnaEdytowalna<T>;
  wiersz: T;
  rowKey: string;
  onEdytuj: (wiersz: T, klucz: string, nowaWartosc: string | number) => void;
  onAkcja?: (wiersz: T, klucz: string) => void;
  stan?: StanZapisuKomorki;
  testid: string;
}) {
  const wyr = kolumna.wyrownanie ?? (kolumna.mono ? 'prawo' : 'lewo');
  const klasy = [wyr === 'prawo' ? 'mvd-edyt-tabela-td-prawo' : undefined, kolumna.mono ? 'mvd-num' : undefined]
    .filter(Boolean)
    .join(' ');
  const testId = `${testid}-komorka-${kolumna.klucz}-${rowKey}`;

  if (!kolumna.edytor) {
    return (
      <td className={klasy || undefined} data-testid={testId}>
        {kolumna.odczyt(wiersz)}
      </td>
    );
  }

  const surowa = kolumna.wartoscEdycji?.(wiersz) ?? null;

  if (kolumna.edytor.rodzaj === 'liczba') {
    return (
      <td className={klasy || undefined} data-testid={testId}>
        <input
          type="number"
          className="mvd-edyt-tabela-input"
          defaultValue={surowa === null ? '' : surowa}
          min={kolumna.edytor.min}
          step={kolumna.edytor.krok}
          data-testid={`${testId}-input`}
          onBlur={(e) => {
            const n = Number(e.target.value);
            if (e.target.value !== '' && !Number.isNaN(n)) onEdytuj(wiersz, kolumna.klucz, n);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        {stan === 'zapisywanie' ? <span className="mvd-edyt-tabela-stan">Zapisywanie…</span> : null}
        {stan === 'blad' ? <span className="mvd-edyt-tabela-stan mvd-edyt-tabela-stan-blad">Błąd zapisu</span> : null}
      </td>
    );
  }

  if (kolumna.edytor.rodzaj === 'wybor') {
    return (
      <td className={klasy || undefined} data-testid={testId}>
        <select
          className="mvd-edyt-tabela-select"
          value={surowa === null ? '' : String(surowa)}
          data-testid={`${testId}-select`}
          onChange={(e) => onEdytuj(wiersz, kolumna.klucz, e.target.value)}
        >
          {kolumna.edytor.opcje.map((o) => (
            <option key={o.id} value={o.id}>
              {o.etykieta}
            </option>
          ))}
        </select>
        {stan === 'zapisywanie' ? <span className="mvd-edyt-tabela-stan">Zapisywanie…</span> : null}
        {stan === 'blad' ? <span className="mvd-edyt-tabela-stan mvd-edyt-tabela-stan-blad">Błąd zapisu</span> : null}
      </td>
    );
  }

  // rodzaj === 'akcja'
  return (
    <td className={klasy || undefined} data-testid={testId}>
      <button
        type="button"
        className="mvd-edyt-tabela-akcja-btn"
        data-testid={`${testId}-akcja`}
        onClick={() => onAkcja?.(wiersz, kolumna.klucz)}
      >
        {kolumna.odczyt(wiersz)}
      </button>
    </td>
  );
}

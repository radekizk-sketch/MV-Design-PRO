import { describe, expect, it } from 'vitest';

import type { KolumnaEdytowalna } from '../../../../shared';
import { budujCsvArkusza, kolumnyEksportowalne } from '../arkuszCsv';
import type { ArkuszWiersz } from '../nnSiteApi';

interface WierszTestowy {
  readonly nr: number;
  readonly nazwa: string;
  readonly ib: number;
}

const kolumny: readonly KolumnaEdytowalna<WierszTestowy>[] = [
  { klucz: 'nr', etykieta: 'Nr', odczyt: (w) => String(w.nr) },
  { klucz: 'nazwa', etykieta: 'Nazwa', odczyt: (w) => w.nazwa },
  { klucz: 'ib', etykieta: 'Ib', jednostka: 'A', odczyt: (w) => w.ib.toFixed(1).replace('.', ',') },
  { klucz: 'akcja', etykieta: 'Szczegóły', odczyt: () => 'Szczegóły', edytor: { rodzaj: 'akcja', etykietaAkcji: 'Szczegóły' } },
];

const wiersze: readonly WierszTestowy[] = [
  { nr: 1, nazwa: 'Odpływ; z separatorem', ib: 32.2749 },
  { nr: 2, nazwa: 'Odpływ "cytowany"', ib: 0 },
];

describe('arkuszCsv — budujCsvArkusza (deterministyczny, treść == ekran)', () => {
  it('nagłówki PL z jednostką w nawiasach kwadratowych, separator średnik', () => {
    const csv = budujCsvArkusza(
      kolumny as unknown as readonly KolumnaEdytowalna<ArkuszWiersz>[],
      wiersze as unknown as readonly ArkuszWiersz[],
    );
    const [naglowek] = csv.split('\r\n');
    expect(naglowek).toBe('Nr;Nazwa;Ib [A]');
  });

  it('pomija kolumnę akcji (nie niesie danych)', () => {
    expect(kolumnyEksportowalne(kolumny as unknown as readonly KolumnaEdytowalna<ArkuszWiersz>[])).toHaveLength(3);
  });

  it('przecinek dziesiętny w wartościach liczbowych (konwencja polska)', () => {
    const csv = budujCsvArkusza(
      kolumny as unknown as readonly KolumnaEdytowalna<ArkuszWiersz>[],
      wiersze as unknown as readonly ArkuszWiersz[],
    );
    expect(csv).toContain('32,3');
    expect(csv).not.toContain('32.3');
  });

  it('escapuje pola ze średnikiem i cudzysłowem (RFC 4180)', () => {
    const csv = budujCsvArkusza(
      kolumny as unknown as readonly KolumnaEdytowalna<ArkuszWiersz>[],
      wiersze as unknown as readonly ArkuszWiersz[],
    );
    expect(csv).toContain('"Odpływ; z separatorem"');
    expect(csv).toContain('"Odpływ ""cytowany"""');
  });

  it('treść IDENTYCZNA z tekstem komórek tabeli (te same funkcje odczyt)', () => {
    const csv = budujCsvArkusza(
      kolumny as unknown as readonly KolumnaEdytowalna<ArkuszWiersz>[],
      wiersze as unknown as readonly ArkuszWiersz[],
    );
    const linie = csv.split('\r\n');
    // Wiersz 1: nr=1, nazwa (escapowana), ib=32,3 — dokładnie to, co pokazałaby komórka tabeli.
    expect(linie[1]).toBe('1;"Odpływ; z separatorem";32,3');
  });

  it('determinizm bajt-w-bajt: dwa wywołania na tych samych danych dają identyczny tekst', () => {
    const a = budujCsvArkusza(
      kolumny as unknown as readonly KolumnaEdytowalna<ArkuszWiersz>[],
      wiersze as unknown as readonly ArkuszWiersz[],
    );
    const b = budujCsvArkusza(
      kolumny as unknown as readonly KolumnaEdytowalna<ArkuszWiersz>[],
      wiersze as unknown as readonly ArkuszWiersz[],
    );
    expect(a).toBe(b);
  });

  it('brak wierszy → wyłącznie nagłówek', () => {
    const csv = budujCsvArkusza(kolumny as unknown as readonly KolumnaEdytowalna<ArkuszWiersz>[], []);
    expect(csv).toBe('Nr;Nazwa;Ib [A]');
  });
});

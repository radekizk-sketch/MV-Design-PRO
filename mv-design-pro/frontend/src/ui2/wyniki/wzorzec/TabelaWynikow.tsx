/*
 * TABELA wyników wspólnego wzorca ekranu analizy (karta E8.1 §2). Kolumny
 * deklaratywne (`DefinicjaKolumny`): etykieta PL, jednostka, mono, sortowanie.
 * Każda komórka niesie semantykę `ValueRow`: 2× klik → onOtworzDowod(ref) gdy
 * `dowodRef`; przekroczony próg → tag PL (próg wyznacza adapter, NIE wzorzec —
 * bez fizyki i bez heurystyk w warstwie prezentacji). Identyfikatory-kolumny
 * (`tylkoEkspercki`) widoczne wyłącznie w trybie eksperckim (MODEL_INTERAKCJI §2.7).
 *
 * TODO-KARTA (poza zakresem E8.1): WIRTUALIZACJA listy przy > 500 wierszy nie jest
 * realizowana w tej karcie. Dla dużych zbiorów (np. rozpływ sieci przemysłowej
 * z setkami szyn) należy w osobnej karcie U3 dołożyć okno widoczności (windowing)
 * BEZ zmiany kontraktu propsów — sortowanie i mapowanie pozostają czyste.
 */

import { useMemo, useState, type KeyboardEvent } from 'react';
import type { AdvancementMode } from '../../shell/modeModel';
import type {
  DefinicjaKolumny,
  StanSortowania,
  WartoscKomorki,
  WierszTabeli,
} from './wzorzecModel';
import { WZORZEC_STRINGS } from './strings';

interface TabelaWynikowProps {
  kolumny: DefinicjaKolumny[];
  wiersze: WierszTabeli[];
  onOtworzDowod: (ref: string) => void;
  trybZaawansowania: AdvancementMode;
  /** Klucz kolumny identyfikującej wiersz (domyślnie klucz pierwszej kolumny). */
  kluczWiersza?: string;
  /** Natywny wybór wiersza (klik/Enter) — delta API, TODO-KARTA E8.2. */
  onWybierzWiersz?: (klucz: string) => void;
  /** Wartość klucza wybranego wiersza (podświetlenie + aria-selected). */
  wybranyWiersz?: string | null;
}

/** Wyrównanie efektywne kolumny (mono → prawo, tekst → lewo — chyba że nadpisane). */
function wyrownanieKolumny(kol: DefinicjaKolumny): 'lewo' | 'prawo' {
  if (kol.wyrownanie) return kol.wyrownanie;
  return kol.mono ? 'prawo' : 'lewo';
}

/** Wartość porównywalna komórki: `sortKey` gdy podany, inaczej `wartosc`. */
function kluczSort(komorka: WartoscKomorki | undefined): number | string {
  if (!komorka) return '';
  if (komorka.sortKey !== undefined) return komorka.sortKey;
  return komorka.wartosc;
}

/** Stabilne, deterministyczne sortowanie (bez mutacji wejścia). */
function posortuj(
  wiersze: WierszTabeli[],
  sort: StanSortowania | null,
): WierszTabeli[] {
  if (!sort) return wiersze;
  const kierunek = sort.kierunek === 'rosnaco' ? 1 : -1;
  return wiersze
    .map((w, i) => ({ w, i }))
    .sort((a, b) => {
      const ka = kluczSort(a.w[sort.klucz]);
      const kb = kluczSort(b.w[sort.klucz]);
      let cmp: number;
      if (typeof ka === 'number' && typeof kb === 'number') {
        cmp = ka - kb;
      } else {
        cmp = String(ka).localeCompare(String(kb), 'pl');
      }
      // Stabilność: remis rozstrzyga pozycja źródłowa (deterministycznie).
      return cmp !== 0 ? cmp * kierunek : a.i - b.i;
    })
    .map((x) => x.w);
}

export function TabelaWynikow({
  kolumny,
  wiersze,
  onOtworzDowod,
  trybZaawansowania,
  kluczWiersza,
  onWybierzWiersz,
  wybranyWiersz,
}: TabelaWynikowProps) {
  const [sort, setSort] = useState<StanSortowania | null>(null);

  const kolumnyWidoczne = useMemo(
    () => kolumny.filter((k) => !k.tylkoEkspercki || trybZaawansowania === 'expert'),
    [kolumny, trybZaawansowania],
  );

  const kluczId = kluczWiersza ?? kolumny[0]?.klucz;

  const wierszePosortowane = useMemo(() => posortuj(wiersze, sort), [wiersze, sort]);

  const przelaczSort = (klucz: string) => {
    setSort((poprz) => {
      if (!poprz || poprz.klucz !== klucz) return { klucz, kierunek: 'rosnaco' };
      if (poprz.kierunek === 'rosnaco') return { klucz, kierunek: 'malejaco' };
      return null; // trzeci klik → powrót do kolejności źródłowej
    });
  };

  if (wiersze.length === 0) {
    return (
      <p className="mvd-wyn-pusty" data-testid="mvd-wyn-tabela-pusta">
        {WZORZEC_STRINGS.brakWynikow}
      </p>
    );
  }

  return (
    <div className="mvd-wyn-tabela-wrap">
      <table className="mvd-wyn-tabela" data-testid="mvd-wyn-tabela">
        <thead>
          <tr>
            {kolumnyWidoczne.map((kol) => {
              const wyr = wyrownanieKolumny(kol);
              const sortowalna = kol.sortowalna !== false;
              const aktywne = sort?.klucz === kol.klucz;
              const wskaznik = aktywne ? (sort.kierunek === 'rosnaco' ? '▲' : '▼') : '';
              const naglowekTresc = (
                <>
                  <span>{kol.etykieta}</span>
                  {kol.jednostka && <span className="mvd-wyn-th-unit">[{kol.jednostka}]</span>}
                  {wskaznik && (
                    <span className="mvd-wyn-sort-ind" aria-hidden="true">
                      {wskaznik}
                    </span>
                  )}
                </>
              );
              return (
                <th
                  key={kol.klucz}
                  className={wyr === 'prawo' ? 'mvd-wyn-th-prawo' : undefined}
                  aria-sort={
                    aktywne ? (sort.kierunek === 'rosnaco' ? 'ascending' : 'descending') : 'none'
                  }
                  data-testid={`mvd-wyn-th-${kol.klucz}`}
                >
                  {sortowalna ? (
                    <button
                      type="button"
                      className="mvd-wyn-th-btn"
                      onClick={() => przelaczSort(kol.klucz)}
                      aria-label={WZORZEC_STRINGS.sortujKolumne}
                      title={WZORZEC_STRINGS.sortujKolumne}
                    >
                      {naglowekTresc}
                    </button>
                  ) : (
                    <span className="mvd-wyn-th-static">{naglowekTresc}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {wierszePosortowane.map((wiersz, i) => {
            const idKom = kluczId ? wiersz[kluczId] : undefined;
            const rowKey = idKom ? String(idKom.wartosc) : `wiersz-${i}`;
            const wybieralny = onWybierzWiersz != null;
            const wybrany = wybieralny && wybranyWiersz != null && wybranyWiersz === rowKey;
            return (
              <tr
                key={rowKey}
                data-testid="mvd-wyn-wiersz"
                className={
                  wybieralny
                    ? wybrany
                      ? 'mvd-wyn-wiersz-wybieralny mvd-on'
                      : 'mvd-wyn-wiersz-wybieralny'
                    : undefined
                }
                aria-selected={wybieralny ? wybrany : undefined}
                tabIndex={wybieralny ? 0 : undefined}
                onClick={wybieralny ? () => onWybierzWiersz(rowKey) : undefined}
                onKeyDown={
                  wybieralny
                    ? (e: KeyboardEvent<HTMLTableRowElement>) => {
                        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
                          e.preventDefault();
                          onWybierzWiersz(rowKey);
                        }
                      }
                    : undefined
                }
              >
                {kolumnyWidoczne.map((kol) => (
                  <Komorka
                    key={kol.klucz}
                    kolumna={kol}
                    komorka={wiersz[kol.klucz]}
                    onOtworzDowod={onOtworzDowod}
                  />
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Komorka({
  kolumna,
  komorka,
  onOtworzDowod,
}: {
  kolumna: DefinicjaKolumny;
  komorka: WartoscKomorki | undefined;
  onOtworzDowod: (ref: string) => void;
}) {
  const wyr = wyrownanieKolumny(kolumna);
  const klasyTd = [
    wyr === 'prawo' ? 'mvd-wyn-td-prawo' : undefined,
    kolumna.mono ? 'mvd-num' : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  if (!komorka) {
    return <td className={klasyTd || undefined}>—</td>;
  }

  const { wartosc, jednostka, dowodRef, ostrzezenie } = komorka;
  const maDowod = dowodRef !== undefined;

  const otworz = () => {
    if (dowodRef !== undefined) onOtworzDowod(dowodRef);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      otworz();
    }
  };

  const trescWartosci = (
    <span className="mvd-wyn-cell-val">
      {wartosc}
      {jednostka && <span className="mvd-wyn-unit">{jednostka}</span>}
    </span>
  );

  return (
    <td className={klasyTd || undefined}>
      {maDowod ? (
        <button
          type="button"
          className="mvd-wyn-value-btn"
          aria-label={WZORZEC_STRINGS.pokazDowod}
          title={WZORZEC_STRINGS.pokazDowod}
          data-mvd-action="dowod"
          onDoubleClick={otworz}
          onKeyDown={onKeyDown}
        >
          {trescWartosci}
        </button>
      ) : (
        trescWartosci
      )}
      {ostrzezenie && (
        <span className="mvd-wyn-tag" data-testid="mvd-wyn-tag-ostrzezenie">
          {WZORZEC_STRINGS.tagOstrzezenie}
        </span>
      )}
    </td>
  );
}

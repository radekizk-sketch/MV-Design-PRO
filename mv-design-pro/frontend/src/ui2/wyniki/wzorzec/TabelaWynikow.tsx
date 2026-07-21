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

import { useMemo, useState, type KeyboardEvent, type UIEvent } from 'react';
import type { AdvancementMode } from '../../shell/modeModel';
import type {
  DefinicjaKolumny,
  StanSortowania,
  WartoscKomorki,
  WierszTabeli,
} from './wzorzecModel';
import { WZORZEC_STRINGS } from './strings';

/**
 * Próg aktywacji wirtualizacji okienkowej (liczba wierszy). Powyżej — renderujemy
 * wyłącznie okno widoczne + zapas; równo lub poniżej — dzisiejsze zachowanie 1:1
 * (całe drzewo DOM bez zmian). Karta U4 §2.
 */
export const PROG_WIRTUALIZACJI = 500;

/**
 * Stała wysokość wiersza tabeli [px], zmierzona z `wzorzec.css`:
 *   tbody td `padding: 6px 12px` (l.205) → 12px w pionie
 * + `border-bottom: 1px` (l.206)        → 1px
 * + treść: `font-size: 13px` (l.155) × `line-height: 1.5` (.mvd-wyn, l.15–16) → 19.5px
 * = 32,5px → zaokrąglone w górę do 33px.
 * Wartość MUSI odpowiadać realnej wysokości renderu, inaczej przekładki się rozjadą.
 */
export const WYSOKOSC_WIERSZA_PX = 33;

/** Zapas wierszy renderowanych poza widocznym oknem (góra i dół) — płynny scroll. */
export const ZAPAS_WIERSZY = 20;

/**
 * Wysokość widocznego okna przewijania [px]. Deterministyczna (niezależna od layoutu
 * przeglądarki — kluczowe dla jsdom/testów). Liczba wierszy widocznych = ceil(okno / wiersz).
 */
export const WYSOKOSC_WIDOKU_PX = 480;

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
  /** Pętla decyzji (F-E6.1): akcja „Popraw w modelu" na wierszach z ostrzeżeniem. */
  onPoprawWModelu?: (klucz: string) => void;
  /** Predykat naprawialności wiersza (F-E6.2) — brak = każdy wiersz z ostrzeżeniem. */
  wierszDecyzyjny?: (klucz: string) => boolean;
}

/** Czy wiersz niesie jakiekolwiek przekroczenie (dowolna komórka `ostrzezenie`). */
function wierszMaOstrzezenie(wiersz: WierszTabeli): boolean {
  return Object.values(wiersz).some((k) => k?.ostrzezenie === true);
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
  onPoprawWModelu,
  wierszDecyzyjny,
}: TabelaWynikowProps) {
  const [sort, setSort] = useState<StanSortowania | null>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const kolumnyWidoczne = useMemo(
    () => kolumny.filter((k) => !k.tylkoEkspercki || trybZaawansowania === 'expert'),
    [kolumny, trybZaawansowania],
  );
  // F-E6.1: kolumna decyzji dokłada się WYŁĄCZNIE gdy wołający ją obsłuży.
  const kolumnaDecyzji = onPoprawWModelu != null;
  const liczbaKolumn = kolumnyWidoczne.length + (kolumnaDecyzji ? 1 : 0);

  const kluczId = kluczWiersza ?? kolumny[0]?.klucz;

  const wierszePosortowane = useMemo(() => posortuj(wiersze, sort), [wiersze, sort]);

  // Wirtualizacja WYŁĄCZNIE powyżej progu; poniżej — pełny render 1:1 (bez zmian DOM).
  const wirtualizacja = wierszePosortowane.length > PROG_WIRTUALIZACJI;

  const okno = useMemo(() => {
    if (!wirtualizacja) {
      return { pierwszy: 0, ostatni: wierszePosortowane.length, wysGora: 0, wysDol: 0 };
    }
    const liczbaWidocznych = Math.ceil(WYSOKOSC_WIDOKU_PX / WYSOKOSC_WIERSZA_PX);
    const indexStart = Math.floor(scrollTop / WYSOKOSC_WIERSZA_PX);
    const pierwszy = Math.max(0, indexStart - ZAPAS_WIERSZY);
    const ostatni = Math.min(
      wierszePosortowane.length,
      indexStart + liczbaWidocznych + ZAPAS_WIERSZY,
    );
    return {
      pierwszy,
      ostatni,
      wysGora: pierwszy * WYSOKOSC_WIERSZA_PX,
      wysDol: (wierszePosortowane.length - ostatni) * WYSOKOSC_WIERSZA_PX,
    };
  }, [wirtualizacja, scrollTop, wierszePosortowane.length]);

  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

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

  const renderujWiersz = (wiersz: WierszTabeli, globalnyIndex: number) => {
    const idKom = kluczId ? wiersz[kluczId] : undefined;
    const rowKey = idKom ? String(idKom.wartosc) : `wiersz-${globalnyIndex}`;
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
        {kolumnaDecyzji && (
          <td className="mvd-wyn-td-decyzja">
            {wierszMaOstrzezenie(wiersz) &&
              (wierszDecyzyjny == null || wierszDecyzyjny(rowKey)) && (
              <button
                type="button"
                className="mvd-wyn-popraw-btn"
                data-testid="mvd-wyn-popraw"
                title={WZORZEC_STRINGS.poprawWModeluOpis}
                onClick={(e) => {
                  // Wiersz bywa wybieralny (onClick na tr) — nie propaguj do wyboru.
                  e.stopPropagation();
                  onPoprawWModelu!(rowKey);
                }}
              >
                {WZORZEC_STRINGS.poprawWModelu}
              </button>
            )}
          </td>
        )}
      </tr>
    );
  };

  return (
    <div
      className="mvd-wyn-tabela-wrap"
      style={
        wirtualizacja
          ? { maxHeight: WYSOKOSC_WIDOKU_PX, overflowY: 'auto' }
          : undefined
      }
      onScroll={wirtualizacja ? onScroll : undefined}
      data-testid="mvd-wyn-tabela-wrap"
    >
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
            {kolumnaDecyzji && (
              <th className="mvd-wyn-th-prawo" data-testid="mvd-wyn-th-decyzja">
                <span className="mvd-wyn-th-static">{WZORZEC_STRINGS.kolumnaDecyzja}</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {wirtualizacja && okno.wysGora > 0 && (
            <tr aria-hidden="true" data-testid="mvd-wyn-spacer-gora">
              <td
                colSpan={liczbaKolumn}
                style={{ height: okno.wysGora, padding: 0, border: 0 }}
              />
            </tr>
          )}
          {wierszePosortowane
            .slice(okno.pierwszy, okno.ostatni)
            .map((wiersz, i) => renderujWiersz(wiersz, okno.pierwszy + i))}
          {wirtualizacja && okno.wysDol > 0 && (
            <tr aria-hidden="true" data-testid="mvd-wyn-spacer-dol">
              <td
                colSpan={liczbaKolumn}
                style={{ height: okno.wysDol, padding: 0, border: 0 }}
              />
            </tr>
          )}
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

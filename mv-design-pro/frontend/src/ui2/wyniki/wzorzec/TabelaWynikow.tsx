/*
 * TABELA wyników wspólnego wzorca ekranu analizy (karta E8.1 §2). Kolumny
 * deklaratywne (`DefinicjaKolumny`): etykieta PL, jednostka, mono, sortowanie.
 * Każda komórka niesie semantykę `ValueRow`: 2× klik → onOtworzDowod(ref) gdy
 * `dowodRef`; przekroczony próg → tag PL (próg wyznacza adapter, NIE wzorzec —
 * bez fizyki i bez heurystyk w warstwie prezentacji). Identyfikatory-kolumny
 * (`tylkoEkspercki`) widoczne wyłącznie w trybie eksperckim (MODEL_INTERAKCJI §2.7).
 *
 * WIRTUALIZACJA (karta UI2 p.5, DOMKNIĘTA — wcześniej jawnie POZA zakresem E8.1):
 * powyżej `PROG_WIRTUALIZACJI` wierszy renderuje się WYŁĄCZNIE okno widoczne +
 * zapas (`@tanstack/react-virtual`, `useVirtualizer`), okalone dwoma wierszami-
 * przekładkami o wysokości domykającej sumę do rzeczywistej wysokości listy —
 * `<table>`/`<tbody>` zostaje jedną, prawidłową tabelą (bez `position: absolute`
 * na `<tr>`, co złamałoby układ tabelaryczny). Poniżej progu — pełny render 1:1,
 * bez żadnej maszynerii wirtualizatora (kontrakt propsów bez zmian; sortowanie
 * i mapowanie pozostają czyste). Wysokość okna widoczności (`WYSOKOSC_WIDOKU_PX`)
 * jest DETERMINISTYCZNA — zamiast realnego pomiaru DOM (zależnego od layoutu
 * przeglądarki, niedostępnego w jsdom) wzorzec podaje wirtualizatorowi tę samą
 * stałą, którą sam narzuca kontenerowi przez `maxHeight` (custom
 * `observeElementRect`) — więc zmierzona i wymuszona wysokość to JEDNO źródło
 * prawdy, nigdy dwie niezależne liczby.
 */

import { useMemo, useRef, useEffect, useState, type KeyboardEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { AdvancementMode } from '../../shell/modeModel';
import { useGlobalSelectionSync } from '../../../ui/selection';
import type {
  DefinicjaKolumny,
  StanSortowania,
  WartoscKomorki,
  WierszTabeli,
} from './wzorzecModel';
import { WZORZEC_STRINGS } from './strings';
import { akcjaNaprawcza, type RodzajPrzekroczenia } from './akcjeNaprawcze';

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
  /** Natywny wybór wiersza (klik/Enter) — delta API E8.2. */
  onWybierzWiersz?: (klucz: string) => void;
  /** Wartość klucza wybranego wiersza (podświetlenie + aria-selected). */
  wybranyWiersz?: string | null;
  /** Typ elementu wiersza → synchronizacja z JEDNYM store'em zaznaczenia
   * (`ui/selection`) na klik/Enter — patrz `wzorzecModel.ts`. */
  typElementuWiersza?: (klucz: string) => import('../../../ui/types').ElementType | undefined;
  /** Identyfikator REALNEGO elementu modelu (gdy różny od klucza wiersza tabeli)
   * dla store'u zaznaczenia — patrz `wzorzecModel.ts` (WYMAGANY przy kluczu
   * kompozytowym, np. walidacja energetyczna). */
  elementIdWiersza?: (klucz: string) => string | undefined;
  /** Nazwa czytelna elementu wiersza dla store'u zaznaczenia — patrz `wzorzecModel.ts`
   * (WYMAGANA, gdy kolumna-klucz wiersza NIE jest już czytelną nazwą). */
  nazwaElementuWiersza?: (klucz: string) => string | undefined;
  /** Pętla decyzji (F-E6.1): akcja „Popraw w modelu" na wierszach z ostrzeżeniem. */
  onPoprawWModelu?: (klucz: string) => void;
  /** Predykat naprawialności wiersza (F-E6.2) — brak = każdy wiersz z ostrzeżeniem. */
  wierszDecyzyjny?: (klucz: string) => boolean;
  /** Rodzaj przekroczenia wiersza (K1 / F-E6.3) — etykieta/opis przycisku z rejestru
   * `akcjeNaprawcze.ts`; brak = etykieta generyczna (1:1). */
  rodzajWiersza?: (klucz: string) => RodzajPrzekroczenia | undefined;
  /**
   * Kiedy renderować akcję kolumny „Decyzja" (F-K4):
   * - `'przy-ostrzezeniu'` (domyślne, zachowanie 1:1 sprzed F-K4) — tylko wiersz
   *   z ostrzeżeniem, bo akcja obiecuje NAPRAWĘ przekroczenia,
   * - `'zawsze'` — każdy wiersz przechodzący `wierszDecyzyjny`; dla ekranów, które
   *   niosą wynik BEZ kryterium naruszenia i oferują akcję INSPEKCYJNĄ
   *   („Pokaż na schemacie"). Rozprzęgnięcie jest jawne, żeby nikt przez pomyłkę
   *   nie pokazał „Popraw w modelu" w wierszu, którego nikt nie zakwestionował.
   */
  trybDecyzji?: 'przy-ostrzezeniu' | 'zawsze';
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
  typElementuWiersza,
  elementIdWiersza,
  nazwaElementuWiersza,
  onPoprawWModelu,
  wierszDecyzyjny,
  rodzajWiersza,
  trybDecyzji = 'przy-ostrzezeniu',
}: TabelaWynikowProps) {
  const [sort, setSort] = useState<StanSortowania | null>(null);
  const { selectFromResults } = useGlobalSelectionSync();
  // D-2 (deep-link SLD → preselekcja wiersza): mapa klucz wiersza → węzeł DOM,
  // do przewinięcia widoku na wybrany wiersz. Ref (nie state) — nie wywołuje
  // dodatkowych renderów, wyłącznie odczyt w efekcie poniżej.
  const wierszeDom = useRef<Map<string, HTMLTableRowElement>>(new Map());
  // Kontener przewijalny (karta UI2 p.5) — ten sam węzeł DOM dostaje
  // `virtualizer.getScrollElement()` I atrybut `ref` na wrapperze niżej.
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const virtualizer = useVirtualizer({
    count: wierszePosortowane.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => WYSOKOSC_WIERSZA_PX,
    overscan: ZAPAS_WIERSZY,
    enabled: wirtualizacja,
    // Wysokość okna jest NARZUCONA przez nas samych (`maxHeight` na wrapperze
    // niżej), więc podajemy ją wprost zamiast mierzyć DOM — bez tego jsdom
    // (bez realnego layoutu) zmierzyłby 0px i okno wyszłoby puste; w przeglądarce
    // dałoby to dokładnie tę samą liczbę z opóźnieniem jednej klatki ResizeObserver.
    initialRect: { width: 0, height: WYSOKOSC_WIDOKU_PX },
    observeElementRect: (_instance, callback) => {
      callback({ width: 0, height: WYSOKOSC_WIDOKU_PX });
    },
  });

  // Okno widoczne + zapas → kształt {pierwszy, ostatni, wysGora, wysDol} — te
  // same cztery liczby, którymi renderujTabelę sterowała PRZED tą kartą (klucz
  // p.5: zamiana ŹRÓDŁA liczb na `@tanstack/react-virtual`, bez zmiany kształtu
  // DOM przekładek niżej). Bez `useMemo`: `virtualizer` mutuje się w miejscu
  // (nie zmienia referencji na scroll), więc memoizacja po nim nie wykryłaby
  // zmiany przewinięcia — a samo liczenie jest tanie (rozmiar okna widoczności).
  let okno: { pierwszy: number; ostatni: number; wysGora: number; wysDol: number };
  if (!wirtualizacja) {
    okno = { pierwszy: 0, ostatni: wierszePosortowane.length, wysGora: 0, wysDol: 0 };
  } else {
    const elementy = virtualizer.getVirtualItems();
    const calkowitaWysokosc = virtualizer.getTotalSize();
    if (elementy.length === 0) {
      okno = { pierwszy: 0, ostatni: 0, wysGora: 0, wysDol: calkowitaWysokosc };
    } else {
      const pierwszyEl = elementy[0];
      const ostatniEl = elementy[elementy.length - 1];
      okno = {
        pierwszy: pierwszyEl.index,
        ostatni: ostatniEl.index + 1,
        wysGora: pierwszyEl.start,
        wysDol: calkowitaWysokosc - ostatniEl.end,
      };
    }
  }

  // D-2: podświetlenie wiersza (`wybrany`, wyżej) niesie sam komponent od
  // dawna (karta E8.2) — dopełnienie to przewinięcie widoku na preselekcjonowany
  // wiersz, WYŁĄCZNIE gdy jego węzeł DOM jest już wyrenderowany (poza oknem
  // wirtualizacji — brak węzła, brak przewinięcia; zero fabrykacji pozycji).
  // Guard `typeof ….scrollIntoView === 'function'`: jsdom (środowisko testów)
  // nie implementuje tej metody — wywołanie non-optional rzuciłoby wyjątkiem.
  useEffect(() => {
    if (!wybranyWiersz) return;
    const wezel = wierszeDom.current.get(wybranyWiersz);
    if (wezel && typeof wezel.scrollIntoView === 'function') {
      wezel.scrollIntoView({ block: 'center' });
    }
  }, [wybranyWiersz]);

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
    // Karta UI2 p.6: klik/Enter DODATKOWO synchronizuje JEDEN store
    // zaznaczenia (SLD ↔ inspektor ↔ drzewo), gdy wiersz mapuje na element
    // sieci — obok istniejącego lokalnego podświetlenia (`onWybierzWiersz`),
    // nie zamiast niego (oba mechanizmy współistnieją, bez drugiego store'u
    // dla samego zaznaczenia elementu — `selectFromResults` pisze do
    // `useSelectionStore`, jedynego źródła prawdy).
    const wybierzWiersz = () => {
      onWybierzWiersz?.(rowKey);
      const typ = typElementuWiersza?.(rowKey);
      if (typ) {
        // Identyfikator elementu: resolver dedykowany ma pierwszeństwo — klucz
        // wiersza bywa kompozytem tabeli (React key), nie refem elementu (np.
        // walidacja energetyczna: `check_type::target_id::index`).
        const elementId = elementIdWiersza?.(rowKey) ?? rowKey;
        // Nazwa czytelna: resolver dedykowany (gdy kolumna-klucz jest
        // identyfikatorem technicznym) ma pierwszeństwo; spadek na wartość
        // kolumny-klucza WYŁĄCZNIE gdy ekran nie dostarczył resolvera (poprawne
        // tylko tam, gdzie ta kolumna już jest czytelną nazwą — p. `wzorzecModel.ts`).
        const nazwa =
          nazwaElementuWiersza?.(rowKey) ?? (idKom ? String(idKom.wartosc) : rowKey);
        selectFromResults(elementId, typ, nazwa);
      }
    };
    return (
      <tr
        key={rowKey}
        ref={(el) => {
          if (el) wierszeDom.current.set(rowKey, el);
          else wierszeDom.current.delete(rowKey);
        }}
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
        onClick={wybieralny ? wybierzWiersz : undefined}
        onKeyDown={
          wybieralny
            ? (e: KeyboardEvent<HTMLTableRowElement>) => {
                if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
                  e.preventDefault();
                  wybierzWiersz();
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
            {(trybDecyzji === 'zawsze' || wierszMaOstrzezenie(wiersz)) &&
              (wierszDecyzyjny == null || wierszDecyzyjny(rowKey)) && (
              <button
                type="button"
                className="mvd-wyn-popraw-btn"
                data-testid="mvd-wyn-popraw"
                // K1 / F-E6.3: etykieta i opis z rejestru akcji naprawczych —
                // kontekstowe wyłącznie, gdy akcja różni się od generycznej.
                title={akcjaNaprawcza(rodzajWiersza?.(rowKey)).opis}
                onClick={(e) => {
                  // Wiersz bywa wybieralny (onClick na tr) — nie propaguj do wyboru.
                  e.stopPropagation();
                  onPoprawWModelu!(rowKey);
                }}
              >
                {akcjaNaprawcza(rodzajWiersza?.(rowKey)).etykieta}
              </button>
            )}
          </td>
        )}
      </tr>
    );
  };

  return (
    <div
      ref={scrollRef}
      className="mvd-wyn-tabela-wrap"
      style={
        wirtualizacja
          ? { maxHeight: WYSOKOSC_WIDOKU_PX, overflowY: 'auto' }
          : undefined
      }
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

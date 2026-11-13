/**
 * Kontrolki kadrowania schematu (karta K2, UI-04): menu „Dopasuj do…",
 * mini-ścieżka kontekstu nad kanwą z nawigacją po stacjach oraz panel
 * komunikatu kadru (tor zasilania, cel niedostępny).
 *
 * Komponenty są czysto prezentacyjne: dane i polecenia przychodzą z
 * `useKadrowanieWidoku`. Każda pozycja menu działa albo jest NIEAKTYWNA
 * z podaną przyczyną (kontrakt UIUX §9).
 */
import { useEffect, useRef, useState } from 'react';
import type { DostepnoscCelu, KomunikatKadru } from './useKadrowanieWidoku';
import { CELE_MENU_KADRU, ETYKIETA_CELU_KADRU, type CelKadru, type PoziomSciezki } from './zakresKadru';

/** Klasa przycisków pasa narzędzi kanwy — JEDNO źródło dla wszystkich kontrolek doku widoku.
 *  `whitespace-nowrap`: tekst przycisku nie łamie się na dwa wiersze (zasada właściciela —
 *  ta sama co dla stanowiska EAZ; zrzut wejścia z wyników zwarć 2026-11-11 pokazał
 *  „Drzewo / układu” i „Dopasuj / widok” w dwóch wierszach). */
// Pismo interfejsu (`font-sans-eng`), nie pismo o stałej szerokości: etykiety przycisków to
// słowa („Drzewo układu”, „Widok: roboczy”), a pismo o stałej szerokości przy 10 px czytało się
// jak kod (oględziny architekta 2026-11-12). Bez zawijania — jedna linia na przycisk.
export const KLASA_PRZYCISKU_DOKU =
  'whitespace-nowrap h-7 rounded border border-scada-border bg-scada-panel/95 px-2 font-sans-eng text-[11px] font-medium text-scada-text shadow-lg hover:bg-scada-hover-nav disabled:cursor-not-allowed disabled:opacity-40';

export function MenuDopasujDo(props: {
  readonly dostepnosc: Readonly<Record<CelKadru, DostepnoscCelu>>;
  readonly onWybierz: (cel: CelKadru) => void;
  readonly torWToku: boolean;
}): JSX.Element {
  const { dostepnosc, onWybierz, torWToku } = props;
  const [otwarte, setOtwarte] = useState(false);
  const korzen = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!otwarte) return undefined;
    const poza = (zdarzenie: PointerEvent) => {
      if (!korzen.current?.contains(zdarzenie.target as Node)) setOtwarte(false);
    };
    const klawisz = (zdarzenie: KeyboardEvent) => {
      if (zdarzenie.key === 'Escape') setOtwarte(false);
    };
    document.addEventListener('pointerdown', poza);
    document.addEventListener('keydown', klawisz);
    return () => {
      document.removeEventListener('pointerdown', poza);
      document.removeEventListener('keydown', klawisz);
    };
  }, [otwarte]);

  return (
    <div ref={korzen} className="relative" data-testid="sld-v3-dopasuj-do">
      <button
        type="button"
        onClick={() => setOtwarte((v) => !v)}
        aria-expanded={otwarte}
        aria-haspopup="menu"
        aria-label="Dopasuj do…"
        data-testid="sld-v3-dopasuj-do-toggle"
        title="Dopasuj do… — sieć, magistrala, stacja, sekcja szyn, pole, tor zasilania"
        className={KLASA_PRZYCISKU_DOKU}
      >
        ▾
      </button>
      {otwarte && (
        <ul
          role="menu"
          aria-label="Dopasuj widok do"
          data-testid="sld-v3-dopasuj-do-menu"
          className="absolute right-0 z-50 mt-1 w-80 rounded border border-scada-border bg-scada-panel-raised p-1 shadow-lg"
        >
          {CELE_MENU_KADRU.map((cel) => {
            const d = dostepnosc[cel];
            const wToku = cel === 'tor' && torWToku;
            return (
              <li key={cel}>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!d.dostepny || wToku}
                  aria-disabled={!d.dostepny || wToku}
                  data-testid={`sld-v3-dopasuj-do-${cel}`}
                  data-dostepny={d.dostepny ? 'tak' : 'nie'}
                  title={d.dostepny ? undefined : d.przyczyna}
                  onClick={() => {
                    setOtwarte(false);
                    onWybierz(cel);
                  }}
                  className="flex w-full flex-col items-start rounded px-2 py-1.5 text-left text-[13px] text-scada-text hover:bg-scada-hover-nav disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="font-semibold">
                    {ETYKIETA_CELU_KADRU[cel]}
                    {wToku ? ' — pobieranie toru…' : ''}
                  </span>
                  {!d.dostepny && (
                    <span className="text-[13px] text-scada-muted" data-testid={`sld-v3-dopasuj-do-${cel}-przyczyna`}>
                      {d.przyczyna}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Wskaźnik skali kanwy (karta SLD-SKALA-I-NAWIGACJA, R7): skala kamery w procentach SKALI CZYTANIA
 * (100 % = aparaty w rozmiarze nominalnym, `camera.ts` `SKALA_CZYTANIA`) z menu kadru: cała sieć,
 * zaznaczenie, 100 %. Pozycja „Zaznaczenie” bez zaznaczenia jest nieaktywna z podaną przyczyną.
 */
export function WskaznikSkali(props: {
  readonly procent: number | null;
  readonly zaznaczenie: number;
  readonly onCalaSiec: () => void;
  readonly onZaznaczenie: () => void;
  readonly onSkalaCzytania: () => void;
}): JSX.Element {
  const { procent, zaznaczenie, onCalaSiec, onZaznaczenie, onSkalaCzytania } = props;
  const [otwarte, setOtwarte] = useState(false);
  const korzen = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!otwarte) return undefined;
    const poza = (zdarzenie: PointerEvent) => {
      if (!korzen.current?.contains(zdarzenie.target as Node)) setOtwarte(false);
    };
    const klawisz = (zdarzenie: KeyboardEvent) => {
      if (zdarzenie.key === 'Escape') setOtwarte(false);
    };
    document.addEventListener('pointerdown', poza);
    document.addEventListener('keydown', klawisz);
    return () => {
      document.removeEventListener('pointerdown', poza);
      document.removeEventListener('keydown', klawisz);
    };
  }, [otwarte]);
  const pozycje: readonly {
    readonly id: string;
    readonly etykieta: string;
    readonly opis: string;
    readonly przyczyna: string | null;
    readonly akcja: () => void;
  }[] = [
    { id: 'siec', etykieta: 'Cała sieć', opis: 'Shift+F', przyczyna: null, akcja: onCalaSiec },
    {
      id: 'zaznaczenie',
      etykieta: 'Zaznaczenie',
      opis: 'F',
      przyczyna: zaznaczenie > 0 ? null : 'Brak zaznaczenia — zaznacz obiekt na schemacie albo w drzewie',
      akcja: onZaznaczenie,
    },
    { id: '100', etykieta: '100 % — skala czytania', opis: 'Shift+1 (wokół kursora)', przyczyna: null, akcja: onSkalaCzytania },
  ];
  return (
    <div ref={korzen} className="relative" data-testid="sld-v3-wskaznik-skali">
      <button
        type="button"
        onClick={() => setOtwarte((v) => !v)}
        aria-expanded={otwarte}
        aria-haspopup="menu"
        aria-label={procent === null ? 'Skala schematu' : `Skala schematu: ${procent} % skali czytania`}
        data-testid="sld-v3-wskaznik-skali-toggle"
        data-procent={procent ?? undefined}
        title="Skala w procentach skali czytania (100 % — aparaty w rozmiarze nominalnym)"
        className={`${KLASA_PRZYCISKU_DOKU} tabular-nums`}
      >
        {procent === null ? '— %' : `${procent} %`} ▾
      </button>
      {otwarte && (
        <ul
          role="menu"
          aria-label="Skala schematu"
          data-testid="sld-v3-wskaznik-skali-menu"
          className="absolute bottom-full right-0 z-50 mb-1 w-64 rounded border border-scada-border bg-scada-panel-raised p-1 shadow-lg"
        >
          {pozycje.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                role="menuitem"
                disabled={p.przyczyna !== null}
                aria-disabled={p.przyczyna !== null}
                data-testid={`sld-v3-skala-${p.id}`}
                title={p.przyczyna ?? undefined}
                onClick={() => {
                  setOtwarte(false);
                  p.akcja();
                }}
                className="flex w-full flex-col items-start rounded px-2 py-1.5 text-left text-[13px] text-scada-text hover:bg-scada-hover-nav disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="font-semibold">{p.etykieta}</span>
                <span className="text-[13px] text-scada-muted">{p.przyczyna ?? p.opis}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PasekKontekstuKadru(props: {
  readonly sciezka: readonly PoziomSciezki[];
  readonly onPoziom: (poziom: PoziomSciezki) => void;
  readonly stacje: readonly { readonly ref: string; readonly nazwa: string }[];
  readonly indeksStacji: number | null;
  readonly onStacja: (ref: string) => void;
}): JSX.Element {
  const { sciezka, onPoziom, stacje, indeksStacji, onStacja } = props;
  const poprzednia = indeksStacji !== null && indeksStacji > 0 ? stacje[indeksStacji - 1] : null;
  const nastepna = indeksStacji !== null && indeksStacji < stacje.length - 1 ? stacje[indeksStacji + 1] : null;
  return (
    <nav
      aria-label="Kontekst kadru schematu"
      data-testid="sld-v3-sciezka-kadru"
      className="pointer-events-auto flex h-7 items-center gap-1 rounded border border-scada-border bg-scada-panel/95 px-2 text-[13px] text-scada-text shadow-lg"
    >
      <ol className="flex items-center gap-1">
        {sciezka.map((poziom, i) => {
          const ostatni = i === sciezka.length - 1;
          return (
            <li key={`${poziom.cel}:${poziom.kontekst.join(',')}`} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden="true" className="text-scada-muted">›</span>}
              {ostatni ? (
                <span aria-current="location" className="font-semibold" data-testid={`sld-v3-sciezka-${i}`}>
                  {poziom.etykieta}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onPoziom(poziom)}
                  data-testid={`sld-v3-sciezka-${i}`}
                  title={`Wykadruj: ${poziom.etykieta}`}
                  className="rounded px-1 underline-offset-2 hover:bg-scada-hover-nav hover:underline"
                >
                  {poziom.etykieta}
                </button>
              )}
            </li>
          );
        })}
      </ol>
      {indeksStacji !== null && (
        <span className="ml-2 flex items-center gap-1 border-l border-scada-border pl-2" data-testid="sld-v3-nawigacja-stacji">
          <button
            type="button"
            disabled={!poprzednia}
            onClick={() => poprzednia && onStacja(poprzednia.ref)}
            data-testid="sld-v3-stacja-poprzednia"
            aria-label={poprzednia ? `Poprzednia stacja: ${poprzednia.nazwa}` : 'Brak poprzedniej stacji'}
            title={poprzednia ? `Poprzednia stacja w porządku magistrali: ${poprzednia.nazwa}` : 'To pierwsza stacja rysunku'}
            className="rounded px-1 hover:bg-scada-hover-nav disabled:cursor-not-allowed disabled:opacity-40"
          >
            ◀
          </button>
          <span
            className="font-mono-eng"
            data-testid="sld-v3-stacja-licznik"
            // Licznik bez opisu był zagadką („3/5”): podpowiedź i nazwa dostępna mówią, co liczy.
            title={`Stacja ${indeksStacji + 1} z ${stacje.length} w porządku magistrali${stacje[indeksStacji] ? `: ${stacje[indeksStacji].nazwa}` : ''}`}
            aria-label={`Stacja ${indeksStacji + 1} z ${stacje.length} w porządku magistrali`}
          >
            {indeksStacji + 1}/{stacje.length}
          </span>
          <button
            type="button"
            disabled={!nastepna}
            onClick={() => nastepna && onStacja(nastepna.ref)}
            data-testid="sld-v3-stacja-nastepna"
            aria-label={nastepna ? `Następna stacja: ${nastepna.nazwa}` : 'Brak następnej stacji'}
            title={nastepna ? `Następna stacja w porządku magistrali: ${nastepna.nazwa}` : 'To ostatnia stacja rysunku'}
            className="rounded px-1 hover:bg-scada-hover-nav disabled:cursor-not-allowed disabled:opacity-40"
          >
            ▶
          </button>
        </span>
      )}
    </nav>
  );
}

const KLASA_KOMUNIKATU: Readonly<Record<KomunikatKadru['rodzaj'], string>> = {
  informacja: 'border-scada-border',
  ostrzezenie: 'border-[color:var(--mvd-warn)]',
  blad: 'border-[color:var(--mvd-err)]',
};

export function PanelKomunikatuKadru(props: {
  readonly komunikat: KomunikatKadru;
  readonly onZamknij: () => void;
}): JSX.Element {
  const { komunikat, onZamknij } = props;
  return (
    <section
      role="status"
      aria-live="polite"
      data-testid="sld-v3-komunikat-kadru"
      data-rodzaj={komunikat.rodzaj}
      className={`pointer-events-auto rounded border bg-scada-panel/95 p-2 text-[13px] text-scada-text shadow-lg ${KLASA_KOMUNIKATU[komunikat.rodzaj]}`}
    >
      <div className="flex items-start gap-2">
        <p className="flex-1" data-testid="sld-v3-komunikat-kadru-tekst">
          {komunikat.tekst}
        </p>
        <button
          type="button"
          onClick={onZamknij}
          aria-label="Zamknij komunikat kadru"
          data-testid="sld-v3-komunikat-kadru-zamknij"
          className="rounded px-1 hover:bg-scada-hover-nav"
        >
          ×
        </button>
      </div>
      {komunikat.szczegoly.length > 0 && (
        <ul className="mt-1 list-disc pl-5" data-testid="sld-v3-komunikat-kadru-szczegoly">
          {komunikat.szczegoly.map((zdanie, i) => (
            <li key={i}>{zdanie}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

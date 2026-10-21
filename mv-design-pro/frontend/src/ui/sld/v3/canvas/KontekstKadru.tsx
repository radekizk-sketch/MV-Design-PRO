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

/** Klasa przycisków pasa narzędzi kanwy (ta sama co pozostałe kontrolki doku widoku). */
export const KLASA_PRZYCISKU_DOKU =
  'h-7 rounded border border-scada-border bg-scada-panel/95 px-2 font-mono-eng text-[10px] font-semibold text-scada-text shadow-lg hover:bg-scada-hover-nav disabled:cursor-not-allowed disabled:opacity-40';

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
          <span className="font-mono-eng" data-testid="sld-v3-stacja-licznik">
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

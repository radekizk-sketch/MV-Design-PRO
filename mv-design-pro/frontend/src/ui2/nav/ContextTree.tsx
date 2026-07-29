/*
 * ContextTree — JEDEN reużywalny komponent drzewa kontekstowego dolnej części
 * lewego panelu (karta E1.2 §1/§2). Konfigurowany per przestrzeń przez
 * `wezly` (Model→topologia, Obliczenia→przypadki obliczeniowe, Wyniki→
 * hierarchia przebiegów, …) — sam komponent nie zna źródła danych (adaptery).
 *
 * Rdzeń: render, zwijanie gałęzi (stan wewnętrzny), selekcja i klawiatura wg
 * gramatyki interakcji (MODEL_INTERAKCJI §2, karta §4a):
 *   1× klik = selekcja · 2× klik / Enter = otwarcie · ↑↓ = nawigacja
 *   ←→ = zwiń/rozwiń · Home/End = granice listy · pisanie = typeahead
 *   prawy klik = menu kontekstowe (callback, treść menu poza zakresem karty)
 *
 * Selekcja (`zaznaczonyId`) jest w pełni sterowana propsami (kontrolowany
 * komponent) — `focusedId` to wyłącznie wewnętrzny cel "roving tabindex" dla
 * płynnej nawigacji klawiaturą niezależnie od tego, kiedy rodzic przetworzy
 * `onZaznacz`.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import '../theme/tokens.css';
import './tree.css';
import { zastosujFiltry } from './treeFilters';
import {
  splaszczWidoczne,
  TRYBY_DRZEWA_TOPOLOGII,
  type AkcjaPusty,
  type TrybDrzewaTopologii,
  type TrybMin,
  type WezelDrzewa,
  type ZrodloZaznaczenia,
} from './treeModel';
import { NAV_STRINGS, licznikTitle, trybDrzewaLabel } from './strings';

const TYPEAHEAD_RESET_MS = 600;

export interface ContextTreeProps {
  /** Węzły korzenia drzewa — kontrakt danych karty §3. */
  wezly: WezelDrzewa[];
  zaznaczonyId: string | null;
  onZaznacz: (id: string, zrodlo: ZrodloZaznaczenia) => void;
  onOtworz: (id: string) => void;
  filtrProblemy: boolean;
  /** Tryb drzewa topologii (audyt W-208) — pomijany dla pozostałych przestrzeni. */
  tryb?: TrybDrzewaTopologii;
  onZmienTryb?: (tryb: TrybDrzewaTopologii) => void;
  onMenuKontekstowe?: (id: string, pozycja: { x: number; y: number }) => void;
  /** Tryb zaawansowania bieżący — węzły o wyższym `trybMin` są ukrywane (§4). */
  trybAktualny?: TrybMin;
  /** Stan „ładowanie" (szkielet) — sterowany przez wołającego (karta §4). */
  ladowanie?: boolean;
  /** Akcja w stanie „pusty" — etykieta i callback zależą od przestrzeni wołającej. */
  akcjaPusty?: AkcjaPusty;
  /** Nazwa dostępności drzewa (aria-label) — domyślnie generyczna. */
  etykietaDrzewa?: string;
}

function sciezkaPrzodkow(wezly: WezelDrzewa[], id: string, sciezka: string[] = []): string[] | null {
  for (const wezel of wezly) {
    if (wezel.id === id) return sciezka;
    const trafienie = sciezkaPrzodkow(wezel.dzieci, id, [...sciezka, wezel.id]);
    if (trafienie) return trafienie;
  }
  return null;
}

export function ContextTree({
  wezly,
  zaznaczonyId,
  onZaznacz,
  onOtworz,
  filtrProblemy,
  tryb,
  onZmienTryb,
  onMenuKontekstowe,
  trybAktualny,
  ladowanie = false,
  akcjaPusty,
  etykietaDrzewa = 'Drzewo kontekstowe',
}: ContextTreeProps) {
  const wezlyPrzefiltrowane = useMemo(
    () => zastosujFiltry(wezly, { filtrProblemy, trybAktualny }),
    [wezly, filtrProblemy, trybAktualny],
  );

  const [rozwiniete, setRozwiniete] = useState<Set<string>>(() => {
    const przodkowie = zaznaczonyId ? sciezkaPrzodkow(wezlyPrzefiltrowane, zaznaczonyId) : null;
    return new Set(przodkowie ?? []);
  });

  const [focusedId, setFocusedId] = useState<string | null>(zaznaczonyId);
  const typeaheadBuffer = useRef('');
  const typeaheadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  // Auto-odsłonięcie ścieżki do zaznaczonego węzła, gdy selekcja zmienia się
  // z zewnątrz (np. selekcja globalna z innego okna — SPEC_POWIAZANIA §3).
  useEffect(() => {
    if (!zaznaczonyId) return;
    const przodkowie = sciezkaPrzodkow(wezlyPrzefiltrowane, zaznaczonyId);
    if (!przodkowie) return;
    setRozwiniete((prev) => {
      const next = new Set(prev);
      let zmiana = false;
      for (const id of przodkowie) {
        if (!next.has(id)) {
          next.add(id);
          zmiana = true;
        }
      }
      return zmiana ? next : prev;
    });
    setFocusedId(zaznaczonyId);
  }, [zaznaczonyId, wezlyPrzefiltrowane]);

  const widoczneWiersze = useMemo(
    () => splaszczWidoczne(wezlyPrzefiltrowane, rozwiniete),
    [wezlyPrzefiltrowane, rozwiniete],
  );

  useEffect(() => {
    if (focusedId == null) return;
    rowRefs.current.get(focusedId)?.focus();
  }, [focusedId, widoczneWiersze]);

  const filtrAktywny = filtrProblemy || trybAktualny != null;
  const brakZFiltra = wezly.length > 0 && filtrAktywny && widoczneWiersze.length === 0;
  const zupelniePusto = wezly.length === 0;

  function przelaczRozwiniecie(id: string) {
    setRozwiniete((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function zaznacz(id: string, zrodlo: ZrodloZaznaczenia) {
    setFocusedId(id);
    onZaznacz(id, zrodlo);
  }

  function idAt(indeks: number): string | null {
    return widoczneWiersze[indeks]?.wezel.id ?? null;
  }

  function biezacyIndeks(): number {
    if (focusedId == null) return -1;
    return widoczneWiersze.findIndex((w) => w.wezel.id === focusedId);
  }

  function obslugaKlawiszy(event: React.KeyboardEvent<HTMLDivElement>, wiersz: (typeof widoczneWiersze)[number]) {
    const { key } = event;

    if (key === 'ArrowDown') {
      event.preventDefault();
      const nastepny = idAt(biezacyIndeks() + 1);
      if (nastepny) zaznacz(nastepny, 'klawiatura');
      return;
    }
    if (key === 'ArrowUp') {
      event.preventDefault();
      const poprzedni = idAt(biezacyIndeks() - 1);
      if (poprzedni) zaznacz(poprzedni, 'klawiatura');
      return;
    }
    if (key === 'Home') {
      event.preventDefault();
      const pierwszy = idAt(0);
      if (pierwszy) zaznacz(pierwszy, 'klawiatura');
      return;
    }
    if (key === 'End') {
      event.preventDefault();
      const ostatni = idAt(widoczneWiersze.length - 1);
      if (ostatni) zaznacz(ostatni, 'klawiatura');
      return;
    }
    if (key === 'ArrowRight') {
      event.preventDefault();
      if (wiersz.maDzieci && !wiersz.rozwiniety) {
        przelaczRozwiniecie(wiersz.wezel.id);
      } else if (wiersz.maDzieci && wiersz.rozwiniety) {
        const pierwszeDziecko = wiersz.wezel.dzieci[0];
        if (pierwszeDziecko) zaznacz(pierwszeDziecko.id, 'klawiatura');
      }
      return;
    }
    if (key === 'ArrowLeft') {
      event.preventDefault();
      if (wiersz.maDzieci && wiersz.rozwiniety) {
        przelaczRozwiniecie(wiersz.wezel.id);
      } else {
        const przodkowie = sciezkaPrzodkow(wezlyPrzefiltrowane, wiersz.wezel.id);
        const rodzicId = przodkowie && przodkowie.length > 0 ? przodkowie[przodkowie.length - 1] : null;
        if (rodzicId) zaznacz(rodzicId, 'klawiatura');
      }
      return;
    }
    if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      onOtworz(wiersz.wezel.id);
      return;
    }

    if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      typeaheadBuffer.current += key.toLowerCase();
      if (typeaheadTimer.current) clearTimeout(typeaheadTimer.current);
      typeaheadTimer.current = setTimeout(() => {
        typeaheadBuffer.current = '';
      }, TYPEAHEAD_RESET_MS);

      const start = biezacyIndeks();
      const n = widoczneWiersze.length;
      for (let krok = 1; krok <= n; krok++) {
        const indeks = (start + krok) % n;
        const kandydat = widoczneWiersze[indeks];
        if (kandydat.wezel.etykietaPL.toLowerCase().startsWith(typeaheadBuffer.current)) {
          zaznacz(kandydat.wezel.id, 'typeahead');
          break;
        }
      }
    }
  }

  if (ladowanie) {
    return (
      <div className="mvd-tree" data-testid="mvd-tree-loading" aria-busy="true" aria-label={etykietaDrzewa}>
        <div className="mvd-tree-skeleton-row" />
        <div className="mvd-tree-skeleton-row" />
        <div className="mvd-tree-skeleton-row" />
        <span className="mvd-visually-hidden">{NAV_STRINGS.ladowanie}</span>
      </div>
    );
  }

  return (
    <div className="mvd-tree-wrap" data-testid="mvd-tree-wrap">
      {tryb != null && (
        <div className="mvd-tree-mode" role="group" aria-label={NAV_STRINGS.trybDrzewa} data-testid="mvd-tree-mode">
          <span className="mvd-tree-lbl">{NAV_STRINGS.trybDrzewa}</span>
          {TRYBY_DRZEWA_TOPOLOGII.map((t) => (
            <button
              key={t}
              type="button"
              className={t === tryb ? 'mvd-tree-mode-btn mvd-on' : 'mvd-tree-mode-btn'}
              aria-pressed={t === tryb}
              onClick={() => onZmienTryb?.(t)}
              data-testid={`mvd-tree-mode-${t}`}
            >
              {trybDrzewaLabel(t)}
            </button>
          ))}
        </div>
      )}

      {zupelniePusto || brakZFiltra ? (
        <div className="mvd-tree-empty" data-testid="mvd-tree-empty">
          <p>{brakZFiltra ? NAV_STRINGS.brakWynikowFiltra : NAV_STRINGS.brakElementow}</p>
          {zupelniePusto && akcjaPusty && (
            <button
              type="button"
              className="mvd-tree-empty-btn"
              onClick={akcjaPusty.onKlik}
              data-testid="mvd-tree-empty-akcja"
            >
              {akcjaPusty.etykieta}
            </button>
          )}
        </div>
      ) : (
        <div className="mvd-tree" role="tree" aria-label={etykietaDrzewa} data-testid="mvd-tree">
          {widoczneWiersze.map((wiersz) => {
            const { wezel, poziom, maDzieci, rozwiniety } = wiersz;
            const zaznaczony = wezel.id === zaznaczonyId;
            const wOgnisku = wezel.id === focusedId;
            return (
              <div
                key={wezel.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(wezel.id, el);
                  else rowRefs.current.delete(wezel.id);
                }}
                role="treeitem"
                aria-selected={zaznaczony}
                aria-level={poziom + 1}
                aria-expanded={maDzieci ? rozwiniety : undefined}
                tabIndex={wOgnisku ? 0 : -1}
                className={zaznaczony ? 'mvd-tree-row mvd-on' : 'mvd-tree-row'}
                style={{ paddingLeft: `${poziom * 16 + 6}px` }}
                data-testid={`mvd-tree-row-${wezel.id}`}
                onClick={() => zaznacz(wezel.id, 'klik')}
                onDoubleClick={() => onOtworz(wezel.id)}
                onKeyDown={(event) => obslugaKlawiszy(event, wiersz)}
                onContextMenu={(event) => {
                  if (!onMenuKontekstowe) return;
                  event.preventDefault();
                  onMenuKontekstowe(wezel.id, { x: event.clientX, y: event.clientY });
                }}
              >
                {maDzieci ? (
                  <button
                    type="button"
                    className="mvd-tree-chevron"
                    aria-hidden="true"
                    tabIndex={-1}
                    onClick={(event) => {
                      event.stopPropagation();
                      przelaczRozwiniecie(wezel.id);
                    }}
                    data-testid={`mvd-tree-chevron-${wezel.id}`}
                  >
                    {rozwiniety ? '▾' : '▸'}
                  </button>
                ) : (
                  <span className="mvd-tree-chevron-spacer" aria-hidden="true" />
                )}

                <span className={`mvd-tree-icon mvd-tree-icon--${wezel.ikona}`} aria-hidden="true" />
                <span className="mvd-tree-label">{wezel.etykietaPL}</span>

                {(wezel.liczniki.blokady > 0 || wezel.liczniki.ostrzezenia > 0) && (
                  <span
                    className="mvd-tree-badge"
                    title={licznikTitle(wezel.liczniki.blokady, wezel.liczniki.ostrzezenia)}
                    data-testid={`mvd-tree-badge-${wezel.id}`}
                  >
                    {wezel.liczniki.blokady > 0 && (
                      <span className="mvd-tree-badge-blokady">{wezel.liczniki.blokady}</span>
                    )}
                    {wezel.liczniki.ostrzezenia > 0 && (
                      <span className="mvd-tree-badge-ostrzezenia">{wezel.liczniki.ostrzezenia}</span>
                    )}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/*
 * POWRÓT ZE SCHEMATU (karta SLD-SKALA-I-NAWIGACJA, część W, pkt 4).
 *
 * Pomiar przed kartą: powłoka NIE miała historii nawigacji między ekranami —
 * `ui2/shell` trzyma wyłącznie aktywną przestrzeń, `ui2/nav` drzewa kontekstowe,
 * a historia kadrów (`ui/sld/v3/canvas/historiaKadrow.ts`) dotyczy kamery wewnątrz
 * schematu, nie ekranów. Przeglądarkowa historia hasha nie odtwarza przestrzeni
 * bez trasy (Gotowość, Model sieci) ani zakładki wyników (stan lokalny warsztatu).
 * Dlatego jest tu JEDEN wpis powrotu (nie stos, nie druga historia): zapisuje go
 * wyłącznie `pokazElementNaSchemacie` w chwili wyjścia na schemat, a kasuje użycie
 * „Wróć do" albo dowolne inne wyjście ze schematu (wpis nie przeżywa zmiany
 * przestrzeni, więc nigdy nie prowadzi do ekranu sprzed dwóch kroków).
 *
 * Wpis niesie: przestrzeń, pełny adres hash (bieg `?run=…`, przypadek), etykietę
 * ekranu, położenie przewinięcia przewijanych obszarów warsztatu i drzewa oraz
 * opcjonalne przywrócenie stanu lokalnego ekranu (np. zakładka „Wyników"), które
 * ekran rejestruje sam hookiem `useEkranZrodlowy`. Zaznaczony element zostaje
 * w store selekcji, więc ekran źródłowy po powrocie widzi ten sam wiersz.
 *
 * Pułapka z `e2e/pulapka-nawigacji-po-biegu.spec.ts` nie wraca: powrót wykonuje
 * się WYŁĄCZNIE jawnym klikiem „Wróć do", nigdy samoczynnie.
 */

import { useEffect, useState } from 'react';
import { create } from 'zustand';

import { przejdzDoPrzestrzeni } from './przejsciaPrzestrzeni';
import { SPACES, type SpaceId } from './spaces';
import { useShellStore } from './useShellStore';

/**
 * Ekran, do którego prowadzi powrót. Ekran przestrzeni jest po wyjściu
 * ODMONTOWANY, więc swój stan lokalny (np. zakładkę) oddaje jako `klucz` + `stan`
 * i odbiera go przy ponownym montażu (`useStanPowrotu`). `przywroc` służy
 * nakładkom, których właściciel żyje dalej (okno przeglądu zbiorczego w AppRoot).
 */
export interface EkranPowrotu {
  readonly etykieta: string;
  readonly klucz?: string;
  readonly stan?: string | null;
  readonly przywroc?: () => void;
}

/** Położenie przewinięcia jednego obszaru (ścieżka indeksów dzieci od korzenia). */
export interface PrzewinieciePowrotu {
  readonly korzen: string;
  readonly sciezka: readonly number[];
  readonly top: number;
  readonly left: number;
}

export interface WpisPowrotu {
  readonly etykieta: string;
  readonly przestrzen: SpaceId;
  readonly hash: string;
  readonly przewiniecia: readonly PrzewinieciePowrotu[];
  readonly ekran: EkranPowrotu;
}

/** Korzenie przewijanych obszarów zapamiętywanych przy wyjściu (warsztat, drzewo). */
export const KORZENIE_PRZEWINIECIA = ['[data-testid="main-content"]', '[data-testid="mvd-left-context"]'] as const;

interface StanPowrotu {
  readonly wpis: WpisPowrotu | null;
  /** Ekrany zamontowane w bieżącej przestrzeni (ostatni = najbardziej szczegółowy). */
  readonly ekrany: readonly { readonly id: number; readonly ekran: EkranPowrotu }[];
  /** Stan lokalny do odebrania przez ponownie montowany ekran źródłowy. */
  readonly doOdebrania: { readonly klucz: string; readonly stan: string } | null;
}

export const usePowrotZeSchematu = create<StanPowrotu>(() => ({ wpis: null, ekrany: [], doOdebrania: null }));

let licznikEkranow = 0;

/**
 * Rejestracja ekranu źródłowego: zamontowany ekran podaje swoją etykietę (np.
 * „Wyniki i dowody — Zwarcia") i funkcję przywracającą stan lokalny. Bez
 * rejestracji powrót niesie etykietę przestrzeni.
 */
export function useEkranZrodlowy(etykieta: string, klucz?: string, stan?: string | null): void {
  useEffect(() => {
    licznikEkranow += 1;
    const id = licznikEkranow;
    usePowrotZeSchematu.setState((s) => ({ ekrany: [...s.ekrany, { id, ekran: { etykieta, klucz, stan } }] }));
    return () => usePowrotZeSchematu.setState((s) => ({ ekrany: s.ekrany.filter((e) => e.id !== id) }));
  }, [etykieta, klucz, stan]);
}

/**
 * Stan lokalny ekranu źródłowego po „Wróć do" (np. zakładka warsztatu) albo
 * `null`. Odczyt w inicjalizatorze stanu, zużycie w efekcie montażu — podwójny
 * inicjalizator trybu ścisłego Reacta widzi tę samą wartość.
 */
export function useStanPowrotu(klucz: string): string | null {
  const [stan] = useState(() => {
    const d = usePowrotZeSchematu.getState().doOdebrania;
    return d && d.klucz === klucz ? d.stan : null;
  });
  useEffect(() => {
    const d = usePowrotZeSchematu.getState().doOdebrania;
    if (d && d.klucz === klucz) usePowrotZeSchematu.setState({ doOdebrania: null });
  }, [klucz]);
  return stan;
}

function etykietaPrzestrzeni(space: SpaceId): string {
  return SPACES.find((s) => s.id === space)?.label ?? space;
}

function sciezkaOd(korzen: Element, el: Element): number[] {
  const sciezka: number[] = [];
  let biezacy: Element | null = el;
  while (biezacy && biezacy !== korzen) {
    const rodzic: Element | null = biezacy.parentElement;
    if (!rodzic) return [];
    sciezka.unshift(Array.prototype.indexOf.call(rodzic.children, biezacy) as number);
    biezacy = rodzic;
  }
  return sciezka;
}

function elementPoSciezce(korzen: Element, sciezka: readonly number[]): Element | null {
  let biezacy: Element | null = korzen;
  for (const i of sciezka) {
    biezacy = biezacy?.children.item(i) ?? null;
    if (!biezacy) return null;
  }
  return biezacy;
}

/** Przewinięte obszary pod korzeniami (kolejność dokumentu — deterministyczna). */
export function zmierzPrzewiniecia(): PrzewinieciePowrotu[] {
  if (typeof document === 'undefined') return [];
  const wynik: PrzewinieciePowrotu[] = [];
  for (const selektor of KORZENIE_PRZEWINIECIA) {
    const korzen = document.querySelector(selektor);
    if (!korzen) continue;
    for (const el of [korzen, ...Array.from(korzen.querySelectorAll('*'))]) {
      if (el.scrollTop > 0 || el.scrollLeft > 0) {
        wynik.push({ korzen: selektor, sciezka: sciezkaOd(korzen, el), top: el.scrollTop, left: el.scrollLeft });
      }
    }
  }
  return wynik;
}

/**
 * Zapis powrotu w chwili wyjścia na schemat (woła WYŁĄCZNIE
 * `pokazElementNaSchemacie`). `nakladka` — ekran nakładki nad kanwą.
 */
export function zapiszPowrot(nakladka: EkranPowrotu | null): void {
  const przestrzen = useShellStore.getState().activeSpace;
  const ekrany = usePowrotZeSchematu.getState().ekrany;
  const ekran = nakladka ?? ekrany[ekrany.length - 1]?.ekran ?? { etykieta: etykietaPrzestrzeni(przestrzen) };
  usePowrotZeSchematu.setState({
    wpis: {
      etykieta: ekran.etykieta,
      przestrzen,
      hash: typeof window === 'undefined' ? '' : window.location.hash,
      przewiniecia: nakladka ? [] : zmierzPrzewiniecia(),
      ekran,
    },
    doOdebrania: null,
  });
}

export function wyczyscPowrot(): void {
  if (usePowrotZeSchematu.getState().wpis) usePowrotZeSchematu.setState({ wpis: null });
}

/** Okno odtwarzania przewinięcia: ekran źródłowy dociąga dane asynchronicznie. */
export const OKNO_PRZEWINIECIA_MS = 3000;
const KROK_PRZEWINIECIA_MS = 50;

function przywrocPrzewiniecia(przewiniecia: readonly PrzewinieciePowrotu[]): void {
  if (przewiniecia.length === 0 || typeof document === 'undefined') return;
  const pozostale = new Set(przewiniecia);
  const start = Date.now();
  const krok = (): void => {
    for (const p of [...pozostale]) {
      const korzen = document.querySelector(p.korzen);
      const el = korzen ? elementPoSciezce(korzen, p.sciezka) : null;
      if (!el || el.scrollHeight - el.clientHeight < p.top || el.scrollWidth - el.clientWidth < p.left) continue;
      el.scrollTop = p.top;
      el.scrollLeft = p.left;
      pozostale.delete(p);
    }
    if (pozostale.size > 0 && Date.now() - start < OKNO_PRZEWINIECIA_MS) window.setTimeout(krok, KROK_PRZEWINIECIA_MS);
  };
  window.setTimeout(krok, 0);
}

/** „Wróć do: <ekran>" — przywraca ekran źródłowy w stanie sprzed wyjścia. */
export function wrocDoEkranu(): void {
  const wpis = usePowrotZeSchematu.getState().wpis;
  if (!wpis) return;
  const { klucz, stan, przywroc } = wpis.ekran;
  usePowrotZeSchematu.setState({
    wpis: null,
    doOdebrania: klucz && stan != null ? { klucz, stan } : null,
  });
  if (wpis.przestrzen !== useShellStore.getState().activeSpace) przejdzDoPrzestrzeni(wpis.przestrzen);
  if (typeof window !== 'undefined' && window.location.hash !== wpis.hash) window.location.hash = wpis.hash;
  przywroc?.();
  przywrocPrzewiniecia(wpis.przewiniecia);
}

// Wpis nie przeżywa wyjścia ze schematu inną drogą niż „Wróć do".
useShellStore.subscribe((stan, poprzedni) => {
  if (stan.activeSpace !== poprzedni.activeSpace && stan.activeSpace !== 'schemat') wyczyscPowrot();
});

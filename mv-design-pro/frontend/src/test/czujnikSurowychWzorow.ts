/**
 * Czujnik surowego zapisu wzoru w DOM testów — runtime'owa para strażnika
 * `scripts/ui_math_guard.py`.
 *
 * Strażnik czyta źródło: symbol wielkości ma być wzorem `$…$`, a nie spłaszczonym tekstem
 * (`Ik″`, `Ith`, `cosφ`). Nie widzi jednak, CZY ten wzór dociera do ekranu przez KaTeX:
 * stała `'$I_{th}$'` wstawiona do JSX wprost (`{T.etykieta}`), do atrybutu `title` bez
 * `tekstBezWzorow` albo do `<text>` SVG bez `TekstSvgZWzorami` pokazałaby projektantowi dolary
 * i podkreślniki. Czujnik obserwuje dokument (`MutationObserver`) przez cały test i oblewa go,
 * gdy tekst węzła albo atrybut opisowy (`title`, `aria-label`, `placeholder`, `alt`) niesie
 * segment `$…$`.
 *
 * Nie jest naruszeniem: tekst w `code`/`pre`/`textarea` (pole edycji, podgląd źródła),
 * w zastępczym `<code data-testid="math-fallback">` (`MathRenderer` dla błędnego LaTeX-a —
 * pokazuje źródło celowo) i pod elementem z atrybutem `data-zrodlo-latex` (widok źródła
 * LaTeX-a dla audytu). Test, który CELOWO renderuje surowy zapis (np. sprawdza zastępczy
 * tekst), woła `dopuscSurowyWzor()` — jawnie, z komentarzem dlaczego.
 */
import { afterEach } from 'vitest';

/** Segment `$…$` z treścią bez skrajnych spacji (proza z kwotą `5 $` nim nie jest). */
const SEGMENT_WZORU = /\$\$?(?=\S)[^$\n]{1,200}?(?<=\S)\$\$?/;
const ATRYBUTY_OPISOWE = ['title', 'aria-label', 'placeholder', 'alt'] as const;
const SELEKTOR_ATRYBUTOW = ATRYBUTY_OPISOWE.map((nazwa) => `[${nazwa}*="$"]`).join(',');
const SELEKTOR_ZWOLNIONY =
  'code, pre, textarea, script, style, [data-testid="math-fallback"], [data-zrodlo-latex]';

let obserwator: MutationObserver | null = null;
let naruszenia: string[] = [];
let dopuszczone = false;
// Ten sam węzeł widziany w kilku zapisach (kontener dołączony do dokumentu, potem jego treść)
// jest zgłaszany raz na tę samą treść.
const zgloszoneTeksty = new WeakMap<Node, string>();
const zgloszoneAtrybuty = new WeakMap<Element, Set<string>>();

/** Bieżący test celowo renderuje surowy zapis LaTeX-a — czujnik go nie oblewa. */
export function dopuscSurowyWzor(): void {
  dopuszczone = true;
}

function zwolniony(element: Element | null): boolean {
  return element?.closest(SELEKTOR_ZWOLNIONY) != null;
}

function sprawdzTekst(wezel: Text): void {
  if (zgloszoneTeksty.get(wezel) === wezel.data) return;
  if (SEGMENT_WZORU.test(wezel.data) && !zwolniony(wezel.parentElement)) {
    zgloszoneTeksty.set(wezel, wezel.data);
    const rodzic = wezel.parentElement?.tagName.toLowerCase() ?? '?';
    naruszenia.push(`<${rodzic}> „${wezel.data.trim().slice(0, 120)}”`);
  }
}

function sprawdzAtrybut(element: Element, nazwa: string): void {
  const wartosc = element.getAttribute(nazwa);
  const klucz = `${nazwa}=${wartosc ?? ''}`;
  if (zgloszoneAtrybuty.get(element)?.has(klucz)) return;
  if (wartosc && SEGMENT_WZORU.test(wartosc) && !zwolniony(element)) {
    zgloszoneAtrybuty.set(element, (zgloszoneAtrybuty.get(element) ?? new Set()).add(klucz));
    naruszenia.push(`<${element.tagName.toLowerCase()} ${nazwa}> „${wartosc.slice(0, 120)}”`);
  }
}

function sprawdzPoddrzewo(wezel: Node): void {
  if (wezel.nodeType === Node.TEXT_NODE) {
    sprawdzTekst(wezel as Text);
    return;
  }
  if (wezel.nodeType !== Node.ELEMENT_NODE) return;
  const element = wezel as Element;
  for (const nazwa of ATRYBUTY_OPISOWE) sprawdzAtrybut(element, nazwa);
  for (const potomek of Array.from(element.querySelectorAll(SELEKTOR_ATRYBUTOW))) {
    for (const nazwa of ATRYBUTY_OPISOWE) sprawdzAtrybut(potomek, nazwa);
  }
  // Szybka odmowa: poddrzewo bez segmentu `$…$` w tekście nie wymaga przejścia węzłów.
  if (!SEGMENT_WZORU.test(element.textContent ?? '')) return;
  const przejscie = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let tekst = przejscie.nextNode(); tekst; tekst = przejscie.nextNode()) {
    sprawdzTekst(tekst as Text);
  }
}

function przetworz(zapisy: MutationRecord[]): void {
  for (const zapis of zapisy) {
    if (zapis.type === 'childList') {
      zapis.addedNodes.forEach(sprawdzPoddrzewo);
    } else if (zapis.type === 'characterData') {
      sprawdzTekst(zapis.target as Text);
    } else if (zapis.type === 'attributes' && zapis.attributeName) {
      sprawdzAtrybut(zapis.target as Element, zapis.attributeName);
    }
  }
}

/** Naruszenia od ostatniego sprawdzenia (zapisy oczekujące są przetwarzane od razu). */
export function naruszeniaSurowychWzorow(): string[] {
  if (obserwator) przetworz(obserwator.takeRecords());
  const wynik = naruszenia;
  naruszenia = [];
  return wynik;
}

/** Oblewa bieżący test, gdy ekran pokazał surowy zapis `$…$` (bez dopuszczenia). */
export function sprawdzSuroweWzoryPoTescie(): void {
  const wykryte = naruszeniaSurowychWzorow();
  const dopuszczoneTeraz = dopuszczone;
  dopuszczone = false;
  if (wykryte.length && !dopuszczoneTeraz) {
    throw new Error(
      'Ekran pokazał surowy zapis wzoru `$…$` zamiast symbolu (KaTeX: `TekstZWzorami`/' +
        '`MathInline`, SVG: `TekstSvgZWzorami`, atrybut: `tekstBezWzorow`): ' +
        `${[...new Set(wykryte)].slice(0, 8).join(' | ')}`,
    );
  }
}

/** Hak `afterEach` czujnika — asynchroniczny (powód przy `zainstalujCzujnikSurowychWzorow`). */
export async function hakSurowychWzorowPoTescie(): Promise<void> {
  sprawdzSuroweWzoryPoTescie();
}

export function zainstalujCzujnikSurowychWzorow(): void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  obserwator = new MutationObserver(przetworz);
  obserwator.observe(document, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...ATRYBUTY_OPISOWE],
  });
  // Hak asynchroniczny: Vitest 1 woła haki `afterEach` w `hooks.map(...)` (kolejność
  // `parallel`) — synchroniczny wyjątek przerwałby mapę i pominął sprzątanie Testing Library
  // (`cleanup`), więc kolejne testy pliku widziałyby DOM poprzedniego (kaskada „Found multiple
  // elements"). Odrzucona obietnica nie przerywa wywołania pozostałych haków.
  afterEach(hakSurowychWzorowPoTescie);
}

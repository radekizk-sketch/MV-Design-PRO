/**
 * Asercja TREŚCI matematycznej pierwszego planu (karta DOWOD-CIEPLNY, 2026-09-25).
 *
 * DLACZEGO. Kadry zrzutowe są dla właściciela dowodem stanu ekranu (bramka B-02), a speki
 * sprawdzały wyłącznie widoczność i błędy konsoli. Ekran dowodu cieplnego pokazywał w polu
 * „Podstawienie" surowy zapis `$$t_k = 1\ \mathrm{s}$$` i spec był zielony. Ta asercja
 * czyta ekran tak, jak czyta go projektant: wzór ma być WYRENDEROWANY (KaTeX), a nie
 * wypisany jako kod.
 *
 * CO SPRAWDZA (na widocznej treści, bez „Informacji audytowych" i bez warstwy MathML):
 *  - żaden wzór nie spadł do postaci awaryjnej `MathRenderer` (`data-testid="math-fallback"`
 *    — błąd KaTeX albo wyłączone renderowanie wzorów pokazuje wtedy surowy zapis),
 *  - widoczny tekst nie niesie znaczników LaTeX — ten sam zbiór co strażnik kontraktu
 *    kroku śladu `scripts/slad_proza_bez_latex_guard.py` (`ZNACZNIKI_LATEX`): ograniczniki
 *    `$$` i `$…$`, polecenie `\nazwa`, indeks/wykładnik w klamrach `_{`/`^{`.
 */
import { expect, type Page } from '@playwright/test';

/** Kopia 1:1 `ZNACZNIKI_LATEX` ze strażnika (`scripts/slad_proza_bez_latex_guard.py`). */
export const ZNACZNIKI_LATEX = /\$\$|\$[^$\s][^$]*\$|\\[A-Za-z]+|_\{|\^\{/;

/** Selektor treści poza pierwszym planem (metadane audytowe, dubel wzoru dla czytników). */
const POZA_PIERWSZYM_PLANEM = '.mvd-audyt-lista, .katex-mathml';

export interface NaruszenieTresci {
  readonly rodzaj: 'wzór niewyrenderowany' | 'surowy zapis LaTeX';
  readonly tresc: string;
}

/** Naruszenia treści matematycznej widocznej w korzeniu (domyślnie cała strona). */
export async function naruszeniaTresciMatematycznej(
  page: Page,
  selektorKorzenia = 'body',
): Promise<NaruszenieTresci[]> {
  const { niewyrenderowane, tekst } = await page.evaluate(
    ({ selektor, pozaPlanem }) => {
      const korzen = document.querySelector(selektor) as HTMLElement | null;
      if (korzen === null) return { niewyrenderowane: [] as string[], tekst: '' };
      const niewyrenderowane = Array.from(
        korzen.querySelectorAll<HTMLElement>('[data-testid="math-fallback"]'),
      )
        .filter((el) => !el.closest('.mvd-audyt-lista'))
        .filter((el) => {
          const obszar = el.getBoundingClientRect();
          return obszar.width > 0 || obszar.height > 0;
        })
        .map((el) => el.getAttribute('data-latex') ?? el.textContent ?? '');
      const ukryte: [HTMLElement, string][] = [];
      korzen.querySelectorAll<HTMLElement>(pozaPlanem).forEach((el) => {
        ukryte.push([el, el.style.display]);
        el.style.display = 'none';
      });
      const tekst = korzen.innerText;
      ukryte.forEach(([el, styl]) => {
        el.style.display = styl;
      });
      return { niewyrenderowane, tekst };
    },
    { selektor: selektorKorzenia, pozaPlanem: POZA_PIERWSZYM_PLANEM },
  );
  const naruszenia: NaruszenieTresci[] = niewyrenderowane.map((tresc) => ({
    rodzaj: 'wzór niewyrenderowany',
    tresc,
  }));
  tekst
    .split('\n')
    .map((linia) => linia.trim())
    .filter((linia) => ZNACZNIKI_LATEX.test(linia))
    .forEach((linia) => naruszenia.push({ rodzaj: 'surowy zapis LaTeX', tresc: linia.slice(0, 240) }));
  return naruszenia;
}

/** Bramka przed zrzutem: pierwszy plan bez wzorów niewyrenderowanych i bez surowego LaTeX-u. */
export async function bramkaTresciMatematycznej(page: Page, selektorKorzenia = 'body'): Promise<void> {
  const naruszenia = await naruszeniaTresciMatematycznej(page, selektorKorzenia);
  expect(naruszenia, 'treść matematyczna pierwszego planu (wzór przez KaTeX, nie jako kod)').toEqual(
    [],
  );
}

/**
 * Asercja tekstu z wzorami (`$...$`) wyrenderowanego przez `TekstZWzorami` (KaTeX).
 *
 * Po co: tekst UI niesie symbole jako segmenty `$...$` (zasada wywodów KaTeX, `ui_math_guard`),
 * więc zawartość tekstowa elementu NIE jest już równa napisowi źródłowemu — KaTeX wstawia
 * glify i znaki zerowej szerokości. Test nie może jednak osłabnąć do „jest jakiś tekst”: ta
 * asercja sprawdza OBA składniki napisu źródłowego naraz:
 *   - każdy fragment prozy (poza `$...$`) występuje w treści elementu (białe znaki
 *     znormalizowane),
 *   - każdy segment `$...$` jest wyrenderowany KaTeX-em: w elemencie istnieje węzeł
 *     `data-testid="math-rendered"` z `data-latex` równym segmentowi (fallback tekstowy
 *     `math-fallback` NIE spełnia asercji — goły LaTeX na ekranie to defekt).
 */

const SEGMENT_WZORU = /(\$[^$]+\$)/g;

function normalizuj(tekst: string): string {
  return tekst.replace(/\s+/g, ' ').trim();
}

/** Rzuca opisowy błąd, gdy element nie pokazuje napisu `tekst` z wzorami przez KaTeX. */
export function oczekujTekstuZWzorami(element: HTMLElement, tekst: string): void {
  const tresc = normalizuj(element.textContent ?? '');
  const segmenty = tekst.split(SEGMENT_WZORU).filter((segment) => segment.length > 0);
  for (const segment of segmenty) {
    if (segment.length > 2 && segment.startsWith('$') && segment.endsWith('$')) {
      const wzory = Array.from(element.querySelectorAll('[data-testid="math-rendered"]'));
      if (!wzory.some((wezel) => wezel.getAttribute('data-latex') === segment)) {
        throw new Error(
          `Brak wzoru ${segment} wyrenderowanego KaTeX-em w elemencie (napis: ${tekst})`,
        );
      }
      continue;
    }
    const proza = normalizuj(segment);
    if (proza !== '' && !tresc.includes(proza)) {
      throw new Error(`Brak fragmentu prozy „${proza}” w treści elementu: „${tresc}”`);
    }
  }
}

/**
 * Napis źródłowy elementu: treść tekstowa, w której każdy wzór wyrenderowany KaTeX-em
 * (`data-testid="math-rendered"`) wraca do swojego `data-latex` (`$t_b$`). Pozwala zachować
 * DOKŁADNE porównania treści komórek po przejściu symboli na wzory. Element z fallbackiem
 * tekstowym (`math-fallback` — KaTeX nie złożył wzoru) jest błędem, nie równością.
 */
export function tekstZrodlowy(element: HTMLElement): string {
  if (element.querySelector('[data-testid="math-fallback"]') !== null) {
    throw new Error('Element zawiera wzór niewyrenderowany KaTeX-em (math-fallback).');
  }
  const kopia = element.cloneNode(true) as HTMLElement;
  for (const wzor of Array.from(kopia.querySelectorAll('[data-testid="math-rendered"]'))) {
    wzor.replaceWith(document.createTextNode(wzor.getAttribute('data-latex') ?? ''));
  }
  return kopia.textContent ?? '';
}

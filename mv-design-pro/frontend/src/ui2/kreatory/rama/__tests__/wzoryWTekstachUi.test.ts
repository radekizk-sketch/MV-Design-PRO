// @vitest-environment node
/**
 * Wzory `$…$` w tekstach warstwy `ui2/**` składają się w KaTeX bez błędu, a ich postać bez
 * wzorów (`tekstBezWzorow` — atrybuty `title`/`aria-label`, natywne `<option>`) nie niesie
 * zapisu LaTeX (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA, decyzja architekta w sprawie
 * `ui_math_guard`).
 *
 * Klasa defektu: symbol przeniesiony z ASCII (`U_m`) do segmentu `$U_m$` z literówką LaTeX-a
 * pokazałby na ekranie czerwony komunikat KaTeX zamiast wzoru — `ui_math_guard` sprawdza
 * tylko brak gołego indeksu, nie poprawność wzoru. Iloczyn cech: KAŻDY plik źródłowy `ui2/**`
 * (poza testami) × KAŻDY literał z segmentem `$…$` × {skład KaTeX w trybie ścisłym, odczyt
 * bez wzorów}. Źródło czytane jako tekst (ten sam podział literałów co strażnik), więc moduły
 * z efektami ubocznymi nie są importowane.
 */
import katex from 'katex';
import { describe, expect, it } from 'vitest';

import { tekstBezWzorow } from '../tekstZWzorami';

const ZRODLA = import.meta.glob('../../../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const WYLACZONE = ['__tests__', '.test.', '.spec.'];

/** Literał łańcuchowy TS (ten sam wzorzec co `ui_math_guard.STRING_LITERAL_TS_RE`). */
const LITERAL = /(['"`])((?:\\.|(?!\1).)*)\1/g;
/** Segment wzoru inline; `${…}` interpolacji nie jest wzorem. */
const SEGMENT = /\$(?!\{)([^$]+)\$/g;

function odEskejpuj(literal: string): string {
  return literal.replace(/\\(.)/g, '$1');
}

interface Wzor {
  readonly miejsce: string;
  readonly tekst: string;
  readonly wzor: string;
}

function wzoryZrodel(): Wzor[] {
  const wynik: Wzor[] = [];
  for (const [sciezka, zrodlo] of Object.entries(ZRODLA)) {
    if (WYLACZONE.some((w) => sciezka.includes(w))) continue;
    zrodlo.split('\n').forEach((linia, i) => {
      const oczyszczona = linia.trim();
      if (oczyszczona.startsWith('//') || oczyszczona.startsWith('*') || oczyszczona.startsWith('/*')) return;
      for (const literal of linia.matchAll(LITERAL)) {
        const tekst = odEskejpuj(literal[1] === '`' ? literal[2].replace(/\$\{[^}]*\}/g, '') : literal[2]);
        for (const segment of tekst.matchAll(SEGMENT)) {
          wynik.push({ miejsce: `${sciezka}:${i + 1}`, tekst, wzor: segment[1] });
        }
      }
    });
  }
  return wynik;
}

describe('wzory $…$ w tekstach ui2', () => {
  const wzory = wzoryZrodel();

  it('skan widzi wzory przeniesione z ASCII (kontrola dodatnia — skan nie jest pusty)', () => {
    expect(wzory.length).toBeGreaterThan(100);
    expect(wzory.some((w) => w.wzor === 'U_m')).toBe(true);
    expect(wzory.some((w) => w.wzor === 'I_{\\Delta n}')).toBe(true);
  });

  it('każdy segment składa się w KaTeX w trybie ścisłym', () => {
    const bledy: string[] = [];
    for (const { miejsce, wzor } of wzory) {
      try {
        katex.renderToString(wzor, { throwOnError: true, strict: 'error' });
      } catch (blad) {
        bledy.push(`${miejsce}: $${wzor}$ — ${(blad as Error).message}`);
      }
    }
    expect(bledy).toEqual([]);
  });

  it('odczyt bez wzorów nie niesie zapisu LaTeX (atrybuty, natywne <option>)', () => {
    const bledy = wzory
      .map(({ miejsce, wzor }) => [miejsce, tekstBezWzorow(`$${wzor}$`)] as const)
      .filter(([, odczyt]) => /[$\\_{}^]/.test(odczyt))
      .map(([miejsce, odczyt]) => `${miejsce}: ${odczyt}`);
    expect(bledy).toEqual([]);
  });
});

describe('tekstBezWzorow — odczyt symboli', () => {
  it.each([
    ['Źródła sieciowe ($Z_Q$)', 'Źródła sieciowe (ZQ)'],
    ['Prąd $I_{\\Delta n}$', 'Prąd IΔn'],
    ['$2 \\cdot I_{\\Delta n}$', '2 · IΔn'],
    ['$\\cos\\varphi_n$ silnika', 'cosφn silnika'],
    ['$U_{\\mathrm{res}}$ przy $I_n$', 'Ures przy In'],
    ['$\\Delta U\\% \\leq \\Delta U_{\\mathrm{dop}}$', 'ΔU% ≤ ΔUdop'],
    ['bez wzoru', 'bez wzoru'],
  ])('%s → %s', (zrodlo, odczyt) => {
    expect(tekstBezWzorow(zrodlo)).toBe(odczyt);
  });
});

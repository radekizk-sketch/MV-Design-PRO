/**
 * Postacie tekstowe zapisu LaTeX symbolu — JEDNO źródło konwersji dla miejsc, w których KaTeX
 * nie działa:
 *
 * - `latexNaTekst` — odczyt jednym ciągiem znaków (atrybuty `title`/`aria-label`, natywne
 *   `<option>`; `tekstBezWzorow` w `ui2/kreatory/rama/tekstZWzorami.tsx`): litery i indeksy
 *   obok siebie, polecenia greckie i operatory jako znaki Unicode;
 * - `latexNaSegmentySvg` — segmenty z poziomem (bazowy / indeks dolny / indeks górny) dla
 *   tekstu SVG (osie wykresów, etykiety schematu), składane jako `<tspan>` z `baseline-shift`
 *   (`ui/proof/TekstSvgZWzorami.tsx`).
 *
 * Obie funkcje czytają TĘ SAMĄ tablicę poleceń (`ZNAKI_POLECEN`), więc symbol ma jedną postać
 * niezależnie od miejsca. Czysta prezentacja — zero fizyki.
 */

/** Znaki poleceń LaTeX-a symboli i operatorów. */
export const ZNAKI_POLECEN: Readonly<Record<string, string>> = {
  prime: '′',
  Delta: 'Δ',
  delta: 'δ',
  Sigma: 'Σ',
  sum: 'Σ',
  eta: 'η',
  cdot: '·',
  times: '×',
  leq: '≤',
  le: '≤',
  geq: '≥',
  ge: '≥',
  neq: '≠',
  approx: '≈',
  pm: '±',
  rho: 'ρ',
  varphi: 'φ',
  phi: 'ϕ',
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  kappa: 'κ',
  lambda: 'λ',
  omega: 'ω',
  Omega: 'Ω',
  mu: 'μ',
  theta: 'θ',
  vartheta: 'ϑ',
  tau: 'τ',
  pi: 'π',
  sqrt: '√',
  infty: '∞',
  to: '→',
  subseteq: '⊆',
  in: '∈',
  angle: '∠',
  degree: '°',
  circ: '°',
};

/** Operatory i relacje — w odczycie otoczone spacją (`2 \cdot I` → `2 · I`). */
export const OPERATORY: ReadonlySet<string> = new Set([
  'cdot', 'times', 'leq', 'le', 'geq', 'ge', 'neq', 'approx', 'pm', 'to', 'in', 'subseteq',
]);

/** Polecenia LaTeX-a, które tylko formatują (krój, tekst) — w odczycie znikają. */
export const POLECENIA_FORMATU: ReadonlySet<string> = new Set([
  'mathrm', 'text', 'mathit', 'mathbf', 'operatorname', 'left', 'right',
]);

function znakPolecenia(polecenie: string): string {
  if (POLECENIA_FORMATU.has(polecenie)) return '';
  const znak = ZNAKI_POLECEN[polecenie] ?? polecenie;
  return OPERATORY.has(polecenie) ? ` ${znak} ` : znak;
}

/** Koniec grupy `{…}` w `tekst` zaczynającej się na `start` (wskazuje `{`). */
function koniecGrupyW(tekst: string, start: number): number {
  let glebokosc = 0;
  for (let i = start; i < tekst.length; i += 1) {
    if (tekst[i] === '{') glebokosc += 1;
    else if (tekst[i] === '}') {
      glebokosc -= 1;
      if (glebokosc === 0) return i;
    }
  }
  return tekst.length - 1;
}

/** Argument polecenia od pozycji `start`: [treść, pozycja za argumentem]. */
function argumentPolecenia(tekst: string, start: number): [string, number] {
  let i = start;
  while (i < tekst.length && /\s/.test(tekst[i])) i += 1;
  if (tekst[i] === '{') {
    const koniec = koniecGrupyW(tekst, i);
    return [tekst.slice(i + 1, koniec), koniec + 1];
  }
  if (tekst[i] === '\\') {
    const dopasowanie = /^\\[a-zA-Z]+/.exec(tekst.slice(i));
    const dlugosc = dopasowanie ? dopasowanie[0].length : 2;
    return [tekst.slice(i, i + dlugosc), i + dlugosc];
  }
  return [tekst.slice(i, i + 1), i + 1];
}

/** Czy odczyt jest jednym członem (bez spacji i operatorów poza nawiasami). */
function jestPojedynczymCzlonem(odczyt: string): boolean {
  let bezNawiasow = odczyt;
  for (let poprzedni = ''; poprzedni !== bezNawiasow; ) {
    poprzedni = bezNawiasow;
    bezNawiasow = bezNawiasow.replace(/\([^()]*\)/g, '');
  }
  return !/[\s+\-−·×/=≤≥<>]/.test(bezNawiasow);
}

function wNawiasieJesliZlozony(latex: string): string {
  return jestPojedynczymCzlonem(odczytLinii(latex)) ? latex : `(${latex})`;
}

const STRUKTURA_RE = /^\\(dfrac|tfrac|frac|sqrt)(?![a-zA-Z])/;

/**
 * Ułamek i pierwiastek w zapisie liniowym — wspólny krok obu postaci tekstowych:
 * `\frac{U}{\sqrt{3} Z}` → `{U}/{(\sqrt{3} Z)}`, `\sqrt{a+b}` → `\sqrt{(a+b)}`,
 * `\sqrt[3]{x}` → `^{3}\sqrt{x}`. Człon złożony dostaje nawias, pojedynczy — nie.
 */
export function rozwinStrukture(latex: string): string {
  let wynik = '';
  let i = 0;
  while (i < latex.length) {
    if (latex[i] === '\\' && latex[i + 1] === '\\') {
      wynik += latex.slice(i, i + 2);
      i += 2;
      continue;
    }
    const dopasowanie = latex[i] === '\\' ? STRUKTURA_RE.exec(latex.slice(i)) : null;
    if (!dopasowanie) {
      wynik += latex[i];
      i += 1;
      continue;
    }
    i += dopasowanie[0].length;
    if (dopasowanie[1] === 'sqrt') {
      let stopien = '';
      if (latex[i] === '[') {
        const zamkniecie = latex.indexOf(']', i);
        const koniec = zamkniecie < 0 ? latex.length : zamkniecie;
        stopien = `^{${latex.slice(i + 1, koniec)}}`;
        i = koniec + 1;
      }
      const [podstawa, za] = argumentPolecenia(latex, i);
      wynik += `${stopien}\\sqrt{${wNawiasieJesliZlozony(rozwinStrukture(podstawa))}}`;
      i = za;
      continue;
    }
    const [licznik, zaLicznikiem] = argumentPolecenia(latex, i);
    const [mianownik, zaMianownikiem] = argumentPolecenia(latex, zaLicznikiem);
    wynik +=
      `{${wNawiasieJesliZlozony(rozwinStrukture(licznik))}}` +
      `/{${wNawiasieJesliZlozony(rozwinStrukture(mianownik))}}`;
    i = zaMianownikiem;
  }
  return wynik;
}

/** Odczyt zapisu już bez ułamków i pierwiastków z argumentem (po `rozwinStrukture`). */
function odczytLinii(latex: string): string {
  return latex
    .replace(/\\[,;:! ]/g, ' ')
    .replace(/\\([%_&#])/g, '$1')
    .replace(/''/g, '″')
    .replace(/\\([a-zA-Z]+)\s*/g, (_cale, polecenie: string) => znakPolecenia(polecenie))
    .replace(/[{}_^]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Odczyt zapisu LaTeX jednym ciągiem znaków (bez `_`, `^`, `{`, `}`). */
export function latexNaTekst(latex: string): string {
  return odczytLinii(rozwinStrukture(latex));
}

export type PoziomSegmentuSvg = 'bazowy' | 'dolny' | 'gorny';

export interface SegmentSvg {
  readonly tekst: string;
  readonly poziom: PoziomSegmentuSvg;
}

/**
 * Segmenty zapisu LaTeX symbolu dla tekstu SVG: `I''_{k,\max}` → `I″` (bazowy),
 * `k,max` (dolny). Grupa `{…}` po `_`/`^` (albo pojedynczy znak/polecenie) jest indeksem;
 * indeks w indeksie zostaje na poziomie zewnętrznego indeksu. Prim (`'`, `''`, `\prime`)
 * zostaje na poziomie, na którym stoi — glif jest już podniesiony. Sąsiednie segmenty tego
 * samego poziomu są sklejane.
 */
export function latexNaSegmentySvg(zapis: string): SegmentSvg[] {
  const latex = rozwinStrukture(zapis);
  const segmenty: SegmentSvg[] = [];
  const dopisz = (tekst: string, poziom: PoziomSegmentuSvg) => {
    if (tekst.length === 0) return;
    const ostatni = segmenty[segmenty.length - 1];
    if (ostatni && ostatni.poziom === poziom) {
      segmenty[segmenty.length - 1] = { tekst: ostatni.tekst + tekst, poziom };
    } else {
      segmenty.push({ tekst, poziom });
    }
  };

  const koniecGrupy = (start: number): number => koniecGrupyW(latex, start);

  /** Jednostka argumentu `_`/`^`: grupa, polecenie albo pojedynczy znak — [początek, koniec). */
  const argument = (start: number): [number, number] => {
    if (latex[start] === '{') return [start + 1, koniecGrupy(start)];
    if (latex[start] === '\\') {
      const dopasowanie = /^\\[a-zA-Z]+/.exec(latex.slice(start));
      return [start, start + (dopasowanie ? dopasowanie[0].length : 2)];
    }
    return [start, start + 1];
  };

  const przetworz = (od: number, do_: number, poziom: PoziomSegmentuSvg) => {
    let i = od;
    while (i < do_) {
      const znak = latex[i];
      if (znak === '_' || znak === '^') {
        const [poczatek, koniec] = argument(i + 1);
        const poziomIndeksu: PoziomSegmentuSvg =
          poziom !== 'bazowy' ? poziom : znak === '_' ? 'dolny' : 'gorny';
        przetworz(poczatek, Math.min(koniec, do_), poziomIndeksu);
        i = latex[i + 1] === '{' ? koniec + 1 : koniec;
        continue;
      }
      if (znak === '{') {
        const koniec = koniecGrupy(i);
        przetworz(i + 1, koniec, poziom);
        i = koniec + 1;
        continue;
      }
      if (znak === '}') {
        i += 1;
        continue;
      }
      if (znak === "'") {
        if (latex[i + 1] === "'") {
          dopisz('″', poziom);
          i += 2;
        } else {
          dopisz('′', poziom);
          i += 1;
        }
        continue;
      }
      if (znak === '\\') {
        const reszta = latex.slice(i);
        const odstep = /^\\[,;:! ]/.exec(reszta);
        if (odstep) {
          dopisz(' ', poziom);
          i += 2;
          continue;
        }
        const ucieczka = /^\\([%_&#{}])/.exec(reszta);
        if (ucieczka) {
          dopisz(ucieczka[1], poziom);
          i += 2;
          continue;
        }
        const polecenie = /^\\([a-zA-Z]+)\s*/.exec(reszta);
        if (polecenie) {
          dopisz(znakPolecenia(polecenie[1]), poziom);
          i += polecenie[0].length;
          continue;
        }
        i += 1;
        continue;
      }
      dopisz(/\s/.test(znak) ? ' ' : znak, poziom);
      i += 1;
    }
  };

  przetworz(0, latex.length, 'bazowy');
  return segmenty
    .map((segment) => ({ ...segment, tekst: segment.tekst.replace(/\s+/g, ' ') }))
    .filter((segment) => segment.tekst.length > 0);
}

/** Segment wzoru inline w tekście (`$…$`); `${…}` interpolacji nie jest wzorem. */
export const SEGMENT_WZORU_INLINE = /(\$[^$]+\$)/g;

/** Czy segment tekstu (po podziale `SEGMENT_WZORU_INLINE`) jest wzorem `$…$`. */
export function jestWzorem(segment: string): boolean {
  return segment.length > 2 && segment.startsWith('$') && segment.endsWith('$');
}

/**
 * Tekst bez wzorów — segment `$…$` zamieniony na odczyt symbolu (`latexNaTekst`). Dla miejsc,
 * które nie renderują HTML-a ani `<tspan>` (atrybuty `title`/`aria-label`, natywne `<option>`,
 * eksport tekstowy) oraz do szacowania długości czytanej etykiety (zawijanie, skracanie).
 */
export function tekstBezWzorow(tekst: string): string {
  return tekst.replace(/\$([^$]+)\$/g, (_cale, latex: string) => latexNaTekst(latex));
}

/** Wyrazy tekstu: podział po białych znakach POZA wzorami `$…$` — wzór jest wyrazem
 *  niepodzielnym także wtedy, gdy zawiera spację (`$2\pi f \cdot t_{b}$`). */
export function wyrazyPozaWzorami(tekst: string): string[] {
  return tekst
    .trim()
    .split(/\s+(?=(?:[^$]*\$[^$]*\$)*[^$]*$)/)
    .filter((wyraz) => wyraz.length > 0);
}

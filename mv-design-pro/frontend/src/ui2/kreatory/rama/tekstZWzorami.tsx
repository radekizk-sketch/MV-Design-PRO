/**
 * TekstZWzorami — zasada wywodów KaTeX (dyrektywa właściciela 2026-07-22):
 * każdy wzór matematyczny w UI renderuje się przez KaTeX, surowe wzory
 * tekstowe/ASCII są zakazane. Komponent dzieli tekst PL na segmenty i każdy
 * fragment ujęty w delimitery `$...$` renderuje przez `MathInline`
 * (fail-safe fallback w MathRenderer). Czysta prezentacja — ZERO fizyki,
 * ZERO modyfikacji treści LaTeX (string jest źródłem prawdy).
 *
 * Użycie: panele teorii, etykiety, pomoc i błędy pól, opisy kroków kreatorów ui2
 * oraz ekrany wyników. Wzory STATYCZNE (prawa teorii, symbole wielkości) wolno
 * trzymać w stringach frontendu; podstawienia liczbowe pokazujemy wyłącznie, gdy
 * pochodzą z backendu.
 *
 * `tekstBezWzorow` — postać tego samego tekstu dla miejsc, które NIE renderują
 * HTML-a (atrybuty `aria-label`/`title`, natywne `<option>`): segment `$...$`
 * zamienia się na odczyt symbolu (litery i indeksy złożone obok siebie, znaki
 * greckie i operatory jako znaki Unicode) — tak, jak czytnik ekranu odczytuje
 * wynik KaTeX-a w trybie `html`. Nigdy nie zostawia `_`, `^`, `{`, `}` ani `$`.
 */

import { Fragment } from 'react';
import { MathInline } from '../../../ui/proof/MathRenderer';

/** Regex segmentu wzoru inline: `$...$` bez zagnieżdżonych delimiterów. */
const SEGMENT_WZORU = /(\$[^$]+\$)/g;

export interface TekstZWzoramiProps {
  /** Tekst PL z opcjonalnymi wzorami LaTeX w delimiterach `$...$`. */
  tekst: string;
}

/** Znaki poleceń LaTeX-a symboli i operatorów — odczyt w postaci bez wzorów. */
const ZNAKI_POLECEN: Readonly<Record<string, string>> = {
  prime: '′',
  Delta: 'Δ',
  delta: 'δ',
  Sigma: 'Σ',
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
};

/** Polecenia LaTeX-a, które tylko formatują (krój, tekst) — w odczycie znikają. */
const POLECENIA_FORMATU = new Set(['mathrm', 'text', 'mathit', 'mathbf', 'operatorname', 'left', 'right']);

function latexNaTekst(latex: string): string {
  return latex
    .replace(/\\[,;:! ]/g, ' ')
    .replace(/\\([a-zA-Z]+)\s*/g, (_cale, polecenie: string) =>
      POLECENIA_FORMATU.has(polecenie) ? '' : (ZNAKI_POLECEN[polecenie] ?? polecenie),
    )
    .replace(/[{}_^]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tekst bez wzorów dla atrybutów i natywnych `<option>` (patrz nagłówek modułu). */
export function tekstBezWzorow(tekst: string): string {
  return tekst.replace(/\$([^$]+)\$/g, (_cale, latex: string) => latexNaTekst(latex));
}

/** Tekst z osadzonymi wzorami LaTeX renderowanymi przez KaTeX (MathInline). */
export function TekstZWzorami({ tekst }: TekstZWzoramiProps) {
  const segmenty = tekst.split(SEGMENT_WZORU);
  return (
    <>
      {segmenty.map((segment, i) =>
        segment.length > 2 && segment.startsWith('$') && segment.endsWith('$') ? (
          <MathInline key={i} latex={segment} />
        ) : (
          <Fragment key={i}>{segment}</Fragment>
        ),
      )}
    </>
  );
}

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
import { jestWzorem, SEGMENT_WZORU_INLINE, tekstBezWzorow } from '../../../ui/proof/latexTekst';

export interface TekstZWzoramiProps {
  /** Tekst PL z opcjonalnymi wzorami LaTeX w delimiterach `$...$`. Brak tekstu (`null`,
   *  `undefined`) nie rysuje niczego — tak jak wstawienie `{tekst}` wprost, które ten
   *  komponent zastępuje (dane spoza typu w czasie działania nie przerywają renderu). */
  tekst: string | null | undefined;
}

/** Tekst bez wzorów dla atrybutów i natywnych `<option>` (patrz nagłówek modułu). */
export { tekstBezWzorow };

/** Tekst z osadzonymi wzorami LaTeX renderowanymi przez KaTeX (MathInline). */
export function TekstZWzorami({ tekst }: TekstZWzoramiProps) {
  if (typeof tekst !== 'string') return <>{tekst}</>;
  const segmenty = tekst.split(SEGMENT_WZORU_INLINE);
  return (
    <>
      {segmenty.map((segment, i) =>
        jestWzorem(segment) ? (
          <MathInline key={i} latex={segment} />
        ) : (
          <Fragment key={i}>{segment}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * TekstZWzorami — zasada wywodów KaTeX (dyrektywa właściciela 2026-07-22):
 * każdy wzór matematyczny w UI renderuje się przez KaTeX, surowe wzory
 * tekstowe/ASCII są zakazane. Komponent dzieli tekst PL na segmenty i każdy
 * fragment ujęty w delimitery `$...$` renderuje przez `MathInline`
 * (fail-safe fallback w MathRenderer). Czysta prezentacja — ZERO fizyki,
 * ZERO modyfikacji treści LaTeX (string jest źródłem prawdy).
 *
 * Użycie: panele teorii, pomoc pól i opisy kroków kreatorów ui2 oraz ekrany
 * OZE. Wzory STATYCZNE (prawa teorii) wolno trzymać w stringach frontendu;
 * podstawienia liczbowe pokazujemy wyłącznie, gdy pochodzą z backendu.
 */

import { Fragment } from 'react';
import { MathInline } from '../../../ui/proof/MathRenderer';

/** Regex segmentu wzoru inline: `$...$` bez zagnieżdżonych delimiterów. */
const SEGMENT_WZORU = /(\$[^$]+\$)/g;

export interface TekstZWzoramiProps {
  /** Tekst PL z opcjonalnymi wzorami LaTeX w delimiterach `$...$`. */
  tekst: string;
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

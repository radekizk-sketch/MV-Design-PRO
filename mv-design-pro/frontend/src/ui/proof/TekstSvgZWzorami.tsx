/**
 * Tekst SVG z wzorami `$…$` — odpowiednik `TekstZWzorami` (KaTeX) dla miejsc, w których KaTeX
 * nie działa: osie i podpisy wykresów SVG, etykiety schematu jednokreskowego.
 *
 * Segment `$…$` jest składany z `latexNaSegmentySvg` (`ui/proof/latexTekst.ts` — ta sama
 * tablica poleceń co odczyt tekstowy): indeks dolny i górny to `<tspan>` z `baseline-shift`
 * i mniejszą czcionką, więc `$I''_{k}$` na osi wygląda jak symbol, a nie jak `I''_k` ani `Ik″`.
 * Komponent zwraca same `<tspan>` — wstawia się go do istniejącego `<text>` (albo jako dzieci
 * `<text>`), pozycja i styl tekstu zostają po stronie wywołującego.
 */
import { Fragment } from 'react';

import { jestWzorem, latexNaSegmentySvg, SEGMENT_WZORU_INLINE } from './latexTekst';

/** Wielkość czcionki indeksu względem tekstu. */
const SKALA_INDEKSU = '0.72em';

export interface TspanyWzoruProps {
  /** Zapis LaTeX symbolu, z ogranicznikami `$…$` albo bez nich. */
  readonly latex: string;
}

/** `<tspan>` symbolu — jedna funkcja konwersji (`latexNaSegmentySvg`). */
export function TspanyWzoru({ latex }: TspanyWzoruProps) {
  const zrodlo = jestWzorem(latex) ? latex.slice(1, -1) : latex;
  return (
    <>
      {latexNaSegmentySvg(zrodlo).map((segment, i) =>
        segment.poziom === 'bazowy' ? (
          <tspan key={i}>{segment.tekst}</tspan>
        ) : (
          <tspan
            key={i}
            baselineShift={segment.poziom === 'dolny' ? 'sub' : 'super'}
            style={{ fontSize: SKALA_INDEKSU }}
            data-indeks={segment.poziom}
          >
            {segment.tekst}
          </tspan>
        ),
      )}
    </>
  );
}

export interface TekstSvgZWzoramiProps {
  /** Tekst PL z opcjonalnymi wzorami LaTeX w ogranicznikach `$…$`. Brak tekstu (`null`,
   *  `undefined`) nie rysuje niczego — jak wstawienie `{tekst}` wprost. */
  readonly tekst: string | null | undefined;
}

/** Tekst SVG: proza wprost, segmenty `$…$` jako `<tspan>` symbolu. */
export function TekstSvgZWzorami({ tekst }: TekstSvgZWzoramiProps) {
  if (typeof tekst !== 'string') return <>{tekst}</>;
  return (
    <>
      {tekst.split(SEGMENT_WZORU_INLINE).map((segment, i) =>
        jestWzorem(segment) ? (
          <TspanyWzoru key={i} latex={segment} />
        ) : (
          <Fragment key={i}>{segment}</Fragment>
        ),
      )}
    </>
  );
}

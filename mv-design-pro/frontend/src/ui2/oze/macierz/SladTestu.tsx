/*
 * Ślad WHITE BOX testu NC RfG renderowany INLINE (scalenie U3/U4 #5).
 * Rdzeń (`ncrfg_ptpiree/engine.py`, B-01) pisze wzór zapisem ASCII/Unicode; LaTeX TEGO
 * SAMEGO wzoru wydaje katalog testów (`wzory_sladu_latex`, rejestr
 * `application/ncrfg_compliance/wzory_sladu.py` z testem kompletności wyprowadzonym z AST
 * rdzenia). Wzór z wpisem renderuje się przez KaTeX (`MathBlock`) — kontrakt prezentacji
 * inżynierskiej; zapis rdzenia zostaje tylko jako stan awaryjny, gdy katalog nie dotarł.
 * Kanon kroku zachowany: Wzór → Dane → Podstawienie → Wynik → Weryfikacja jednostek.
 * Zero ocen własnych.
 */

import { MathBlock } from '../../../ui/proof/MathRenderer';
import type { KrokSladuNcRfg } from '../ncrfg/typy';
import { MACIERZ_STRINGS, opiszMetryke } from './strings';

type KrokSladu = KrokSladuNcRfg;

export interface SladTestuProps {
  readonly kroki: readonly KrokSladu[];
  /** Zapis wzoru rdzenia → LaTeX (`KatalogNcRfg.wzory_sladu_latex`). */
  readonly wzoryLatex: Readonly<Record<string, string>>;
}

function Pole({ etykieta, dzieci }: { etykieta: string; dzieci: React.ReactNode }) {
  return (
    <div className="mvd-oze-slad-pole">
      <span className="mvd-oze-panel-etyk">{etykieta}</span>
      <div className="mvd-oze-slad-tresc">{dzieci}</div>
    </div>
  );
}

function Wartosci({ dane }: { dane: Readonly<Record<string, unknown>> }) {
  const wpisy = Object.entries(dane);
  if (wpisy.length === 0) return <span className="mvd-oze-panel-etyk">—</span>;
  return (
    <div>
      {wpisy.map(([klucz, wartosc]) => (
        <div key={klucz} className="mvd-oze-metryka">
          <span>{klucz}</span>
          <span className="mvd-oze-num">{opiszMetryke(wartosc)}</span>
        </div>
      ))}
    </div>
  );
}

export function SladTestu({ kroki, wzoryLatex }: SladTestuProps): JSX.Element {
  if (kroki.length === 0) {
    return (
      <p className="mvd-oze-panel-etyk" data-testid="mvd-oze-slad-pusty">
        {MACIERZ_STRINGS.sladPusty}
      </p>
    );
  }
  return (
    <ol className="mvd-oze-slad-lista" data-testid="mvd-oze-slad-kroki">
      {kroki.map((krok) => (
        <li key={`${krok.step}-${krok.key}`} className="mvd-oze-slad-krok">
          <Pole
            etykieta={MACIERZ_STRINGS.sladWzor}
            dzieci={
              wzoryLatex[krok.formula] !== undefined ? (
                <MathBlock latex={wzoryLatex[krok.formula]} />
              ) : (
                <code className="mvd-oze-num">{krok.formula}</code>
              )
            }
          />
          <Pole etykieta={MACIERZ_STRINGS.sladDane} dzieci={<Wartosci dane={krok.data} />} />
          {krok.substitution ? (
            <Pole
              etykieta={MACIERZ_STRINGS.sladPodstawienie}
              dzieci={<code className="mvd-oze-num">{krok.substitution}</code>}
            />
          ) : null}
          <Pole etykieta={MACIERZ_STRINGS.sladWynik} dzieci={<Wartosci dane={krok.result} />} />
          {krok.unit_check ? (
            <Pole
              etykieta={MACIERZ_STRINGS.sladJednostki}
              dzieci={<span>{krok.unit_check}</span>}
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

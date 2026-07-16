/*
 * Ślad WHITE BOX testu NC RfG renderowany INLINE (scalenie U3/U4 #5).
 * Wzory testów zgodności to zapis ASCII z solvera (`ncrfg_ptpiree/engine.py`,
 * np. „U_sim(t) >= U_LVRT,profile(t)") — NIE LaTeX, więc świadomie NIE używamy
 * okna dowodu (MathBlock/KaTeX). Kanon kroku zachowany: Wzór → Dane →
 * Podstawienie → Wynik → Weryfikacja jednostek. Zero ocen własnych.
 */

import type { NcRfgRunResult } from '../../../ui/ncrfg-tests/api';
import { MACIERZ_STRINGS, opiszMetryke } from './strings';

type KrokSladu = NcRfgRunResult['white_box_trace'][number];

export interface SladTestuProps {
  readonly kroki: readonly KrokSladu[];
}

function Pole({ etykieta, dzieci }: { etykieta: string; dzieci: React.ReactNode }) {
  return (
    <div className="mvd-oze-slad-pole">
      <span className="mvd-oze-panel-etyk">{etykieta}</span>
      <div className="mvd-oze-slad-tresc">{dzieci}</div>
    </div>
  );
}

function Wartosci({ dane }: { dane: Record<string, unknown> }) {
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

export function SladTestu({ kroki }: SladTestuProps): JSX.Element {
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
            dzieci={<code className="mvd-oze-num">{krok.formula}</code>}
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

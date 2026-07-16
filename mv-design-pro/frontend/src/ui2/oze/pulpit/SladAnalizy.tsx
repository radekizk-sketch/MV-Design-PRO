/*
 * Ślad WHITE BOX analizy interpretacyjnej (siła sieci / adekwatność Q) — P47a.
 * Renderowany INLINE jako zapis tekstowy, spójnie ze śladem testu NC RfG
 * (`macierz/SladTestu`). Świadomie NIE używamy okna dowodu (MathBlock/KaTeX):
 * karta P47a §1.2 wymaga wzorów ASCII; `formula_latex` traktujemy jako zapis
 * symboliczny wyświetlany dosłownie. Kanon kroku: Wzór → Podstawienie → Wynik →
 * (opcjonalnie) Weryfikacja jednostek. Zero ocen własnych — dane z backendu.
 */

import type { KrokSladuQ, KrokSladuSily } from '../api';
import { PULPIT_STRINGS } from './strings';

type KrokSladu = KrokSladuSily | Partial<Pick<KrokSladuQ, 'unit_check_pl'>> & KrokSladuSily;

export interface SladAnalizyProps {
  readonly kroki: readonly KrokSladu[];
}

function Pole({ etykieta, tresc }: { readonly etykieta: string; readonly tresc: string }): JSX.Element {
  return (
    <div className="mvd-oze-slad-pole">
      <span className="mvd-oze-panel-etyk">{etykieta}</span>
      <div className="mvd-oze-slad-tresc">
        <code className="mvd-oze-num">{tresc}</code>
      </div>
    </div>
  );
}

export function SladAnalizy({ kroki }: SladAnalizyProps): JSX.Element {
  if (kroki.length === 0) {
    return (
      <p className="mvd-oze-panel-etyk" data-testid="mvd-oze-slad-pusty">
        {PULPIT_STRINGS.sladPusty}
      </p>
    );
  }
  return (
    <ol className="mvd-oze-slad-lista" data-testid="mvd-oze-slad-kroki">
      {kroki.map((krok) => (
        <li key={krok.symbol} className="mvd-oze-slad-krok">
          <Pole etykieta={`${PULPIT_STRINGS.sladWzor} (${krok.symbol})`} tresc={krok.formula_latex} />
          {krok.substitution_pl ? (
            <Pole etykieta={PULPIT_STRINGS.sladPodstawienie} tresc={krok.substitution_pl} />
          ) : null}
          <Pole etykieta={PULPIT_STRINGS.sladWynik} tresc={krok.result_pl} />
          {'unit_check_pl' in krok && krok.unit_check_pl ? (
            <Pole etykieta={PULPIT_STRINGS.sladJednostki} tresc={krok.unit_check_pl} />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

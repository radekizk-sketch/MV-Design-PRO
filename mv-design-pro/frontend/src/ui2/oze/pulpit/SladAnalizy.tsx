/*
 * Ślad analizy interpretacyjnej z pełną jawnością obliczeń (siła sieci /
 * adekwatność Q / dobór kompensacji) — P47a, przebudowa K10.
 *
 * Dyrektywa właściciela 2026-07-29 (WIĄŻĄCA STAŁA, nadpisuje dawny zapis
 * P47a §1.2 o wzorach ASCII): wszystkie obliczenia renderowane KaTeX-em.
 * Kanon kroku: Wzór → Podstawienie → Wynik → (opcjonalnie) Weryfikacja
 * jednostek. `formula_latex` to czysty LaTeX z backendu (MathInline,
 * fail-safe fallback w MathRenderer); pola tekstowe (podstawienie, wynik,
 * jednostki) mogą nieść wzory inline w delimiterach `$...$` — renderuje je
 * `TekstZWzorami`. Krok bez wzoru (formula_latex = '') pokazuje wyłącznie
 * etykietę symbolu. Zero ocen własnych, zero fizyki — dane z backendu.
 */

import { MathInline } from '../../../ui/proof/MathRenderer';
import { TekstZWzorami } from '../../kreatory/rama';
import type { KrokSladuQ, KrokSladuSily } from '../api';
import { PULPIT_STRINGS } from './strings';

type KrokSladu = KrokSladuSily | Partial<Pick<KrokSladuQ, 'unit_check_pl'>> & KrokSladuSily;

export interface SladAnalizyProps {
  readonly kroki: readonly KrokSladu[];
}

function Pole({
  etykieta,
  children,
}: {
  readonly etykieta: string;
  readonly children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="mvd-oze-slad-pole">
      <span className="mvd-oze-panel-etyk">{etykieta}</span>
      <div className="mvd-oze-slad-tresc">
        <code className="mvd-oze-num">{children}</code>
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
          {krok.formula_latex ? (
            <Pole etykieta={`${PULPIT_STRINGS.sladWzor} (${krok.symbol})`}>
              <MathInline latex={krok.formula_latex} />
            </Pole>
          ) : (
            <span className="mvd-oze-panel-etyk">{krok.symbol}</span>
          )}
          {krok.substitution_pl ? (
            <Pole etykieta={PULPIT_STRINGS.sladPodstawienie}>
              <TekstZWzorami tekst={krok.substitution_pl} />
            </Pole>
          ) : null}
          <Pole etykieta={PULPIT_STRINGS.sladWynik}>
            <TekstZWzorami tekst={krok.result_pl} />
          </Pole>
          {'unit_check_pl' in krok && krok.unit_check_pl ? (
            <Pole etykieta={PULPIT_STRINGS.sladJednostki}>
              <TekstZWzorami tekst={krok.unit_check_pl} />
            </Pole>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

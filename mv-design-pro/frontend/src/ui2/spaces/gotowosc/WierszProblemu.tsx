/*
 * Wiersz pojedynczego problemu gotowości (W-401, karta E6.1 §2). Waga PL,
 * element, opis PL, przycisk akcji naprawczej. Kod gotowości WYŁĄCZNIE w
 * dymku (`title`) i — dodatkowo jako widoczny tekst — w trybie eksperckim
 * (ten sam wzorzec co `SzczegolyTechniczne` w `ui2/inspector/InspectorPanel.tsx`,
 * MODEL_INTERAKCJI §2 reguła 7 / karta §2.7). W pełni sterowany propsami.
 *
 * C-12: co pokazuje miejsce akcji (przycisk formularza, przycisk przejścia do
 * przestrzeni albo nazwana odmowa) rozstrzyga `rozwiazAkcjeNaprawcza` — TA SAMA
 * funkcja, którą wykonuje klik (`wykonajAkcjeNaprawcza`); wiersz nie ma własnego warunku.
 */

import { etykietaAkcji, rozwiazAkcjeNaprawcza } from './akcjeNaprawcze';
import type { ProblemGotowosci } from './grupowanieCelow';
import { GOTOWOSC_STRINGS } from './strings';

interface WierszProblemuProps {
  problem: ProblemGotowosci;
  trybEkspercki: boolean;
  onKlikWiersza: (elementRef: string) => void;
  onNaprawa: (problem: ProblemGotowosci) => void;
}

/** Tag wagi problemu — lokalny (bez zależności od innej przestrzeni ui2). */
function TagWagi({ waga }: { waga: ProblemGotowosci['waga'] }) {
  const klasa = waga === 'BLOKADA' ? 'mvd-problem-tag-blokada' : 'mvd-problem-tag-ostrzezenie';
  const etykieta = waga === 'BLOKADA' ? GOTOWOSC_STRINGS.wagaBlokada : GOTOWOSC_STRINGS.wagaOstrzezenie;
  return <span className={`mvd-problem-tag ${klasa}`}>{etykieta}</span>;
}

export function WierszProblemu({
  problem,
  trybEkspercki,
  onKlikWiersza,
  onNaprawa,
}: WierszProblemuProps) {
  const { elementRef, opisPl, waga, code } = problem;
  const akcja = rozwiazAkcjeNaprawcza(problem);
  const etykieta = akcja ? etykietaAkcji(akcja) : null;

  return (
    <div
      className="mvd-problem-row"
      data-testid={`mvd-problem-${code}-${elementRef ?? 'brak'}`}
      title={code}
    >
      <button
        type="button"
        className="mvd-problem-select"
        onClick={() => elementRef && onKlikWiersza(elementRef)}
        disabled={!elementRef}
      >
        <TagWagi waga={waga} />
        <span className="mvd-problem-desc">{opisPl}</span>
        {elementRef && (
          <span className="mvd-problem-element">
            {GOTOWOSC_STRINGS.element}: <span className="mvd-num">{elementRef}</span>
          </span>
        )}
      </button>

      {trybEkspercki && (
        <span
          className="mvd-problem-kod mvd-num"
          data-testid={`mvd-problem-kod-${code}`}
          aria-label={GOTOWOSC_STRINGS.kodTechniczny}
        >
          {code}
        </span>
      )}

      {akcja && etykieta ? (
        <button
          type="button"
          className="mvd-btn mvd-problem-napraw"
          data-testid={`mvd-problem-napraw-${code}-${elementRef ?? 'brak'}`}
          title={akcja.rodzaj === 'przestrzen' ? akcja.powodPl : undefined}
          onClick={() => onNaprawa(problem)}
        >
          {etykieta}
        </button>
      ) : akcja?.rodzaj === 'odmowa' ? (
        <span className="mvd-problem-brak-akcji" data-testid={`mvd-problem-odmowa-${code}`}>
          {akcja.powodPl}
        </span>
      ) : (
        elementRef && <span className="mvd-problem-brak-akcji">{GOTOWOSC_STRINGS.wymagaInterwencji}</span>
      )}
    </div>
  );
}

/*
 * Sekcja jednego celu inżyniera (W-401, karta E6.1 §2). Nagłówek zwijany:
 * etykieta celu, postęp %, liczby blokad/ostrzeżeń; treść = lista problemów
 * (po filtrze — `problemyWidoczne`; liczniki nagłówka zawsze z pełnej grupy,
 * aby filtr nie zniekształcał obrazu całościowej gotowości celu).
 */

import { ETYKIETA_CELU, type GrupaCelu, type ProblemGotowosci } from './grupowanieCelow';
import { GOTOWOSC_STRINGS } from './strings';
import { WierszProblemu } from './WierszProblemu';

interface SekcjaCeluProps {
  grupa: GrupaCelu;
  problemyWidoczne: ProblemGotowosci[];
  rozwinieta: boolean;
  onPrzelacz: () => void;
  trybEkspercki: boolean;
  onKlikWiersza: (elementRef: string) => void;
  onNaprawa: (problem: ProblemGotowosci) => void;
}

export function SekcjaCelu({
  grupa,
  problemyWidoczne,
  rozwinieta,
  onPrzelacz,
  trybEkspercki,
  onKlikWiersza,
  onNaprawa,
}: SekcjaCeluProps) {
  const etykieta = ETYKIETA_CELU[grupa.cel];
  const idTresci = `mvd-cel-tresc-${grupa.cel}`;

  return (
    <section className="mvd-cel-sekcja" data-testid={`mvd-cel-${grupa.cel}`}>
      <button
        type="button"
        className="mvd-cel-naglowek"
        onClick={onPrzelacz}
        aria-expanded={rozwinieta}
        aria-controls={idTresci}
      >
        <span className="mvd-cel-tytul">{etykieta}</span>
        <span className="mvd-cel-liczniki">
          {grupa.blokady > 0 && (
            <span className="mvd-problem-tag mvd-problem-tag-blokada">
              {GOTOWOSC_STRINGS.podsumowanieBlokady}: <span className="mvd-num">{grupa.blokady}</span>
            </span>
          )}
          {grupa.ostrzezenia > 0 && (
            <span className="mvd-problem-tag mvd-problem-tag-ostrzezenie">
              {GOTOWOSC_STRINGS.podsumowanieOstrzezenia}:{' '}
              <span className="mvd-num">{grupa.ostrzezenia}</span>
            </span>
          )}
          <span className="mvd-cel-postep" data-testid={`mvd-cel-postep-${grupa.cel}`}>
            {GOTOWOSC_STRINGS.postep}: <span className="mvd-num">{grupa.postepProcent}%</span>
          </span>
        </span>
        <span className="mvd-cel-zwijak" aria-hidden="true">
          {rozwinieta ? GOTOWOSC_STRINGS.zwin : GOTOWOSC_STRINGS.rozwin}
        </span>
      </button>

      {rozwinieta && (
        <div id={idTresci} className="mvd-cel-tresc">
          {problemyWidoczne.length === 0 ? (
            <p className="mvd-cel-brak">{GOTOWOSC_STRINGS.filtrBrakWynikow}</p>
          ) : (
            problemyWidoczne.map((problem) => (
              <WierszProblemu
                key={`${problem.code}-${problem.elementRef ?? 'brak'}`}
                problem={problem}
                trybEkspercki={trybEkspercki}
                onKlikWiersza={onKlikWiersza}
                onNaprawa={onNaprawa}
              />
            ))
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Wiersze opisu pola SN (`pozycjeOpisuPola`): pozycja z modelu jako tekst, brak jako przycisk
 * z akcją naprawczą („Bez odejścia · wyprowadź odcinek z pola”). Co robi akcja, decyduje
 * wołający: tabela pól GPZ otwiera kartę pola E-11 z fokusem, karta pola wykonuje operację.
 */
import { AKCJA_NAPRAWCZA_PL, type FokusPola, type PozycjaOpisuPola } from './opisPolaSn';

export interface OpisPolaSnWierszeProps {
  readonly pozycje: readonly PozycjaOpisuPola[];
  /** Przedrostek identyfikatorów testowych, np. `tabela-pol-sn`. */
  readonly prefiks: string;
  readonly poleRef: string;
  readonly onNapraw: (fokus: FokusPola) => void;
  /** Pozycja wskazana przy otwarciu karty (wyróżniona obwódką). */
  readonly wyroznij?: FokusPola | null;
}

export function OpisPolaSnWiersze({
  pozycje,
  prefiks,
  poleRef,
  onNapraw,
  wyroznij = null,
}: OpisPolaSnWierszeProps): JSX.Element {
  return (
    <>
      {pozycje.map((p) => (
        <div
          key={p.fokus}
          data-testid={`${prefiks}-${p.fokus}-${poleRef}`}
          data-brak={p.brak ? 'true' : 'false'}
          data-wyroznione={wyroznij === p.fokus ? 'true' : undefined}
          className={wyroznij === p.fokus ? 'rounded outline outline-1 outline-scada-sn' : undefined}
        >
          {p.brak ? (
            <button
              type="button"
              data-testid={`${prefiks}-napraw-${p.fokus}-${poleRef}`}
              className="text-left text-sygnal-uwaga-tusz underline decoration-dotted underline-offset-2 hover:text-scada-text"
              onClick={() => onNapraw(p.fokus)}
            >
              {p.tekst} · {AKCJA_NAPRAWCZA_PL[p.fokus]}
            </button>
          ) : (
            <span className="text-scada-muted">{p.tekst}</span>
          )}
        </div>
      ))}
    </>
  );
}

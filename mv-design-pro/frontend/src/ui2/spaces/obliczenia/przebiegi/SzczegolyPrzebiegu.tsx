/*
 * Szczegóły przebiegu obliczeniowego (W-503, karta E7.2 §2) — parametry
 * wejściowe = odtwarzalność (AUDYT_RADY_SPECJALISTOW W-503, WHITE BOX).
 * W pełni sterowane propsami (rekord z listy — `ExecutionRun` niesie komplet
 * pól szczegółów, `types.ts:234-243`). Pola nieobecne w rekordzie przebiegu
 * (surowe wartości parametrów, rewizja modelu z chwili liczenia) → wiersze
 * „wkrótce" (bez zgadywania — karta §2, TODO-KARTA adaptera #2/#3).
 *
 * Identyfikatory przebiegu/przypadku WYŁĄCZNIE w sekcji „Szczegóły techniczne"
 * w trybie eksperckim (MODEL_INTERAKCJI §2.7; wzorzec `SzczegolyTechniczne`
 * z `ui2/inspector/InspectorPanel.tsx:269`).
 *
 * „Pokaż wyniki" → callback `onPokazWyniki(runId)` (przejście do przestrzeni
 * „Wyniki" wykonuje integrator — karta §2); aktywna wyłącznie dla statusu DONE
 * (ResultSet istnieje tylko dla przebiegów zakończonych — `runStore.ts:12`).
 */

import type { PrzebiegWiersz } from './adapters/przebiegiAdapter';
import { formatCzas, formatOdcisk, PRZEBIEGI_STRINGS as T } from './strings';

interface SzczegolyPrzebieguProps {
  przebieg: PrzebiegWiersz | null;
  /** Tryb ekspercki powłoki — odsłania sekcję „Szczegóły techniczne" (§2.7). */
  trybEkspercki: boolean;
  /** Akcja „Pokaż wyniki" — integrator aktywuje przebieg i przechodzi do Wyników. */
  onPokazWyniki: (runId: string) => void;
}

function WierszParametru({
  etykieta,
  wartosc,
  testid,
}: {
  etykieta: string;
  wartosc: string;
  testid?: string;
}) {
  return (
    <tr data-testid={testid}>
      <td>{etykieta}</td>
      <td className="mvd-num">{wartosc}</td>
    </tr>
  );
}

function WierszWkrotce({ etykieta, testid }: { etykieta: string; testid?: string }) {
  return (
    <tr data-testid={testid}>
      <td>{etykieta}</td>
      <td className="mvd-num mvd-wkrotce-wartosc">{T.brakWartosci}</td>
      <td className="mvd-przebieg-pochodzenie mvd-wkrotce">{T.pochodzenieWkrotce}</td>
    </tr>
  );
}

export function SzczegolyPrzebiegu({
  przebieg,
  trybEkspercki,
  onPokazWyniki,
}: SzczegolyPrzebieguProps) {
  if (!przebieg) {
    return (
      <div className="mvd-przebiegi-pusto" data-testid="mvd-przebieg-brak-wyboru">
        {T.szczegolyBrakWyboru}
      </div>
    );
  }

  const zakonczony = przebieg.status === 'DONE';

  return (
    <article className="mvd-przebieg-szczegoly" data-testid="mvd-przebieg-szczegoly">
      <header className="mvd-przebieg-naglowek">
        <h3 className="mvd-przebieg-tytul">{przebieg.analiza}</h3>
        <span className="mvd-tag" data-testid="mvd-przebieg-szczegoly-status">
          {przebieg.statusLabel}
        </span>
        {przebieg.blad && (
          <p className="mvd-przebieg-blad" role="alert" data-testid="mvd-przebieg-szczegoly-blad">
            {T.etykietaBlad}: {przebieg.blad}
          </p>
        )}
      </header>

      <section className="mvd-przebieg-sekcja" aria-label={T.sekcjaParametry}>
        <h4 className="mvd-przebieg-sekcja-tytul">{T.sekcjaParametry}</h4>
        <table className="mvd-przebieg-tabela">
          <tbody>
            <WierszParametru
              etykieta={T.etykietaPoczatek}
              wartosc={formatCzas(przebieg.poczatekISO)}
            />
            <WierszParametru
              etykieta={T.etykietaZakonczenie}
              wartosc={formatCzas(przebieg.koniecISO)}
            />
            <WierszParametru
              etykieta={T.etykietaCzasTrwania}
              wartosc={przebieg.czasTrwania}
              testid="mvd-przebieg-czas-trwania"
            />
            <tr data-testid="mvd-przebieg-odcisk">
              <td>{T.etykietaOdcisk}</td>
              <td className="mvd-num" title={przebieg.odcisk}>
                {formatOdcisk(przebieg.odcisk)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="mvd-przebieg-sekcja" aria-label={T.sekcjaWkrotce}>
        <h4 className="mvd-przebieg-sekcja-tytul">{T.sekcjaWkrotce}</h4>
        <table className="mvd-przebieg-tabela">
          <tbody>
            <WierszWkrotce
              etykieta={T.etykietaRewizjaModelu}
              testid="mvd-przebieg-wkrotce-rewizja"
            />
            <WierszWkrotce
              etykieta={T.etykietaParametryWejsciowe}
              testid="mvd-przebieg-wkrotce-parametry"
            />
          </tbody>
        </table>
      </section>

      {trybEkspercki && (
        <section
          className="mvd-przebieg-sekcja"
          aria-label={T.sekcjaTechniczna}
          data-testid="mvd-przebieg-techniczne"
        >
          <h4 className="mvd-przebieg-sekcja-tytul">{T.sekcjaTechniczna}</h4>
          <table className="mvd-przebieg-tabela">
            <tbody>
              <WierszParametru etykieta={T.etykietaId} wartosc={przebieg.id} />
              <WierszParametru etykieta={T.etykietaPrzypadekId} wartosc={przebieg.przypadekId} />
            </tbody>
          </table>
        </section>
      )}

      <div className="mvd-przebieg-akcje">
        <button
          type="button"
          className="mvd-btn mvd-btn-primary"
          disabled={!zakonczony}
          title={zakonczony ? undefined : T.przyciskPokazWynikiOpis}
          onClick={() => onPokazWyniki(przebieg.id)}
          data-testid="mvd-przebieg-pokaz-wyniki"
        >
          {T.przyciskPokazWyniki}
        </button>
      </div>
    </article>
  );
}

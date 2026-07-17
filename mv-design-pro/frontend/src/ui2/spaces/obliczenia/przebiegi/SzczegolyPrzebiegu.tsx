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

import { useState } from 'react';

import {
  formatCompletenessStatus,
  formatContractValue,
  useAnalysisRunContract,
} from '../../../../ui/workspace/analysisRunContract';
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

function WierszKontraktu({ etykieta, wartosc }: { etykieta: string; wartosc: string }) {
  return (
    <tr>
      <td>{etykieta}</td>
      <td className="mvd-num">{wartosc}</td>
    </tr>
  );
}

function GrupaKontraktu({
  tytul,
  testid,
  wiersze,
}: {
  tytul: string;
  testid: string;
  wiersze: { etykieta: string; wartosc: string }[];
}) {
  return (
    <div className="mvd-przebieg-kontrakt-grupa" data-testid={testid}>
      <h5 className="mvd-przebieg-kontrakt-grupa-tytul">{tytul}</h5>
      <table className="mvd-przebieg-tabela">
        <tbody>
          {wiersze.map((w) => (
            <WierszKontraktu key={w.etykieta} etykieta={w.etykieta} wartosc={w.wartosc} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/*
 * Sekcja „Kontrakt analizy" — odwzorowanie treści cienkich paneli mostu
 * (`AnalysisContractPanel`: SymmetricalComponents/ThermalDynamic/Convergence,
 * `ui/workspace/WorkspaceSurfaceRouter.tsx:2396-2575`) w powłoce ui2. Reużywa
 * BEZ ZMIAN hook read-only `useAnalysisRunContract` i formatery kontraktu
 * (`ui/workspace/analysisRunContract.ts`) — zero importu komponentów mostu, zero
 * fizyki. Wartości brakujące → „Do konfiguracji" (semantyka `formatContractValue`
 * mostu, parytet 1:1). Sekcja zwijana: domyślnie rozwinięta w trybie eksperckim.
 */
function SekcjaKontraktAnalizy({
  runId,
  trybEkspercki,
}: {
  runId: string;
  trybEkspercki: boolean;
}) {
  const { data, isLoading, error } = useAnalysisRunContract(runId);
  const [rozwinieta, setRozwinieta] = useState(trybEkspercki);

  const kontekst = data?.analysisCaseContext ?? null;
  const zalozenia = kontekst?.assumptions ?? {};

  return (
    <details
      className="mvd-przebieg-sekcja mvd-przebieg-kontrakt"
      open={rozwinieta}
      onToggle={(event) => setRozwinieta(event.currentTarget.open)}
      data-testid="mvd-przebieg-kontrakt"
    >
      <summary className="mvd-przebieg-kontrakt-tytul">{T.sekcjaKontrakt}</summary>
      {isLoading ? (
        <p
          className="mvd-przebieg-kontrakt-stan"
          role="status"
          data-testid="mvd-przebieg-kontrakt-ladowanie"
        >
          {T.kontraktLadowanie}
        </p>
      ) : error ? (
        <p
          className="mvd-przebieg-kontrakt-stan mvd-przebieg-blad"
          role="alert"
          data-testid="mvd-przebieg-kontrakt-blad"
        >
          {T.kontraktBlad}
        </p>
      ) : (
        <div className="mvd-przebieg-kontrakt-grupy">
          <GrupaKontraktu
            tytul={T.grupaOgolne}
            testid="mvd-przebieg-kontrakt-ogolne"
            wiersze={[
              { etykieta: T.etykietaTypAnalizy, wartosc: formatContractValue(data?.analysisType) },
              {
                etykieta: T.etykietaWaznoscWyniku,
                wartosc: formatContractValue(data?.resultsValid),
              },
              {
                etykieta: T.etykietaWersjaUkladu,
                wartosc: formatContractValue(kontekst?.snapshotRef),
              },
              {
                etykieta: T.etykietaKompletnosc,
                wartosc: formatCompletenessStatus(kontekst?.completeness ?? null),
              },
              {
                etykieta: T.etykietaZakresStosowalnosci,
                wartosc: formatContractValue(kontekst?.applicabilityScope),
              },
            ]}
          />
          <GrupaKontraktu
            tytul={T.grupaRozplyw}
            testid="mvd-przebieg-kontrakt-rozplyw"
            wiersze={[
              {
                etykieta: T.etykietaZalozeniaOltc,
                wartosc: formatContractValue(zalozenia['transformer_tap_assumptions_ref']),
              },
            ]}
          />
          <GrupaKontraktu
            tytul={T.grupaZwarcie}
            testid="mvd-przebieg-kontrakt-zwarcie"
            wiersze={[
              {
                etykieta: T.etykietaUziemienie,
                wartosc: formatContractValue(zalozenia['grounding_assumptions_ref']),
              },
              {
                etykieta: T.etykietaStanLacznikow,
                wartosc: formatContractValue(zalozenia['switching_state_ref']),
              },
              {
                etykieta: T.etykietaTemperatura,
                wartosc: formatContractValue(zalozenia['temperature_assumptions_ref']),
              },
              {
                etykieta: T.etykietaZalozeniaObciazen,
                wartosc: formatContractValue(zalozenia['load_assumptions_ref']),
              },
              {
                etykieta: T.etykietaZalozeniaZrodel,
                wartosc: formatContractValue(zalozenia['source_assumptions_ref']),
              },
            ]}
          />
        </div>
      )}
    </details>
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

      <SekcjaKontraktAnalizy runId={przebieg.id} trybEkspercki={trybEkspercki} />

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

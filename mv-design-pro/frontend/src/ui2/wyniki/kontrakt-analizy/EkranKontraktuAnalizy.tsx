/**
 * EkranKontraktuAnalizy — dostawca ui2 dla ekranów kanonicznych
 * E-29/E-32 (karta F-E5a, FLOW §0.3 „kontrakt ekranu prowadzącego"; po kartach P-1/P-2: E-30/E-31 mają realne ekrany, a
 * E-33/E-34 prowadzą do zakładki zwarć warsztatu Wyników);
 * E-30/E-31 mają realne ekrany — karta P-2). Zastępuje legacy
 * `ThinContractSurface` (most, W5b-4):
 *
 *  - nagłówek: tytuł obszaru + JEDNO zdanie celu inżynierskiego (per kod ekranu),
 *  - stan wejścia: brak aktywnego przebiegu → uczciwy stan zerowy z akcją
 *    „Przejdź do obliczeń" (`useShellStore.setActiveSpace`), NIE pusta tabela,
 *  - wiersze kontraktu: te same dane co dawniej (hook `useAnalysisRunContract`
 *    + `formatContractValue`, REUŻYCIE read-only — parytet 1:1 wierszy fokusowych),
 *  - sekcje warunkowe (założenia / pochodzenie / reprodukowalność) per flagi ekranu,
 *  - następny krok: powrót do huba analiz (`clearRouteManagedSurface`, jak pasek
 *    powrotu `MostAnalizTechnicznych`).
 *
 * ZERO fizyki, ZERO mutacji modelu. `MiniSldCard` świadomie NIE przeniesiony —
 * kontekst schematu daje hub i przestrzeń Schemat (karta §0.3). Stylowanie
 * wyłącznie tokenami --mvd-* (oba motywy z automatu).
 */

import './kontrakt-analizy.css';

import { useAppStateStore } from '../../../ui/app-state';
import { useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { useSelectionStore } from '../../../ui/selection';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import {
  buildRecordRows,
  resolveSurfaceRunId,
  useAnalysisRunContract,
  type LabeledValueRow,
} from '../../../ui/workspace/analysisRunContract';
import { buildReproducibilityRows, limitRows } from '../../../ui/workspace/routerContractRows';
import type { WorkspaceSurfaceDescriptor } from '../../../ui/workspace/types';
import { useShellStore } from '../../shell/useShellStore';
import {
  ETYKIETY_POCHODZENIA,
  ETYKIETY_ZALOZEN,
  jestKodemKontraktu,
  KONTRAKTY_EKRANOW,
} from './model';
import { KONTRAKT_STRINGS as T } from './strings';

function Wiersze({ rows, testid }: { rows: readonly LabeledValueRow[]; testid: string }) {
  return (
    <dl className="mvd-kontrakt-siatka" data-testid={testid}>
      {rows.map((row) => {
        const brak = row.value === T.doKonfiguracji;
        return (
          <div className="mvd-kontrakt-wiersz" key={`${row.label}::${row.value}`}>
            <dt>{row.label}</dt>
            <dd data-brak={brak ? 'true' : 'false'}>
              {brak ? <span className="mvd-kontrakt-chip">{T.doKonfiguracji}</span> : row.value}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function Sekcja({
  tytul,
  rows,
  testid,
}: {
  tytul: string;
  rows: readonly LabeledValueRow[];
  testid: string;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="mvd-kontrakt-sekcja">
      <h4>{tytul}</h4>
      <Wiersze rows={rows} testid={testid} />
    </section>
  );
}

export function EkranKontraktuAnalizy({ surface }: { surface: WorkspaceSurfaceDescriptor }) {
  const activeRunId = useAppStateStore((s) => s.activeRunId);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const selectedElement = useSelectionStore((s) => s.selectedElements[0] ?? null);
  const setActiveSpace = useShellStore((s) => s.setActiveSpace);
  const clearRouteManagedSurface = useNetworkBuildStore((s) => s.clearRouteManagedSurface);

  const runId = resolveSurfaceRunId(surface, activeRunId);
  const { data, isLoading, error } = useAnalysisRunContract(runId);

  if (!jestKodemKontraktu(surface.screenCode)) {
    return null;
  }
  const config = KONTRAKTY_EKRANOW[surface.screenCode];
  const context = data?.analysisCaseContext ?? null;

  const focusRows = data
    ? limitRows(config.buildWiersze(data, { surface, selectedElement, snapshot }), 9)
    : [];
  const assumptionRows = context && config.pokazZalozenia
    ? limitRows(buildRecordRows(context.assumptions, ETYKIETY_ZALOZEN))
    : [];
  const lineageRows = context && config.pokazPochodzenie
    ? limitRows(buildRecordRows(context.lineage, ETYKIETY_POCHODZENIA))
    : [];
  const reproducibilityRows = data && config.pokazReprodukowalnosc
    ? limitRows(buildReproducibilityRows(data), 12)
    : [];

  return (
    <div className="mvd-kontrakt" data-testid="mvd-kontrakt-analizy" data-ekran={surface.screenCode}>
      <header className="mvd-kontrakt-head">
        <span className="mvd-kontrakt-lbl">{config.eyebrow}</span>
        <h3>{config.tytul}</h3>
        <p className="mvd-kontrakt-cel">{config.cel}</p>
      </header>

      {!runId ? (
        <div className="mvd-kontrakt-stan" data-testid="mvd-kontrakt-zero" data-tone="idle">
          <h4>{T.zeroTytul}</h4>
          <p>{T.zeroOpis}</p>
          <button
            type="button"
            className="mvd-kontrakt-akcja"
            data-testid="mvd-kontrakt-zero-akcja"
            onClick={() => setActiveSpace('obliczenia')}
          >
            {T.zeroAkcja}
          </button>
        </div>
      ) : isLoading ? (
        <div className="mvd-kontrakt-stan" data-testid="mvd-kontrakt-ladowanie" data-tone="loading">
          <h4>{T.ladowanieTytul}</h4>
          <p>{T.ladowanieOpis}</p>
        </div>
      ) : error ? (
        <div className="mvd-kontrakt-stan" data-testid="mvd-kontrakt-blad" data-tone="error" role="alert">
          <h4>{T.bladTytul}</h4>
          <p>{error}</p>
        </div>
      ) : !data || !context ? (
        <div className="mvd-kontrakt-stan" data-testid="mvd-kontrakt-brak-kontekstu" data-tone="idle">
          <h4>{T.brakKontekstuTytul}</h4>
          <p>{T.brakKontekstuOpis}</p>
        </div>
      ) : (
        <>
          <section className="mvd-kontrakt-sekcja">
            <h4>{config.tytulWierszy}</h4>
            <Wiersze rows={focusRows} testid="mvd-kontrakt-wiersze" />
          </section>
          <Sekcja tytul={T.sekcjaZalozenia} rows={assumptionRows} testid="mvd-kontrakt-zalozenia" />
          <Sekcja tytul={T.sekcjaPochodzenie} rows={lineageRows} testid="mvd-kontrakt-pochodzenie" />
          <Sekcja
            tytul={T.sekcjaReprodukowalnosc}
            rows={reproducibilityRows}
            testid="mvd-kontrakt-reprodukowalnosc"
          />
        </>
      )}

      <div className="mvd-kontrakt-stopka">
        <span className="mvd-kontrakt-lbl">{T.nastepnyEyebrow}</span>
        <p>{T.nastepnyOpis}</p>
        <button
          type="button"
          className="mvd-kontrakt-powrot"
          data-testid="mvd-kontrakt-powrot"
          title={T.powrotOpis}
          onClick={clearRouteManagedSurface}
        >
          {T.powrotHub}
        </button>
      </div>
    </div>
  );
}

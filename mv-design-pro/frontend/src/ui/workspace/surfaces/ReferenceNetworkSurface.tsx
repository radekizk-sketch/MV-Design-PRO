/**
 * ReferenceNetworkSurface — E-39 Walidacja sieci referencyjnych.
 *
 * Surface dla workspace router. Zawiera 3 sekcje:
 * - lista 8 sieci referencyjnych
 * - runner uruchamiający walidację
 * - panel raportu PASS/FAIL + NC RfG badge dla sieci OZE
 */

import { useState } from 'react';

import {
  ReferenceNetworkList,
  ReferenceNetworkRunPanel,
  ReferenceNetworkRunner,
  ValidationReportPanel,
  useReferenceNetworkDetail,
} from '../../reference-networks';
import { DynamicValidationPanel } from '../../reference-networks/DynamicValidationPanel';
import type { ValidationReport } from '../../reference-networks/types';
import type { WorkspaceSurfaceDescriptor } from '../types';

interface ReferenceNetworkSurfaceProps {
  surface?: WorkspaceSurfaceDescriptor;
}

export function ReferenceNetworkSurface(_props: ReferenceNetworkSurfaceProps = {}): JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const detail = useReferenceNetworkDetail(selectedId);
  const isDerNetwork = detail.data?.has_der ?? false;

  return (
    <div className="grid h-full gap-3 p-3 lg:grid-cols-[320px_1fr]" data-testid="reference-network-surface">
      <aside className="overflow-y-auto">
        <ReferenceNetworkList
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            setValidationReport(null);
          }}
        />
      </aside>
      <main className="overflow-y-auto">
        {selectedId ? (
          <div className="space-y-4">
            <ReferenceNetworkRunner
              networkId={selectedId}
              onValidationComplete={setValidationReport}
            />
            {/* ROUTERY-4A (S6): bieg solvera z wynikiem per węzeł — dla sieci
                niesymetrycznych (IEEE 13/34-bus) jedyna produkcyjna droga do
                rozpływu BFS per faza. */}
            <ReferenceNetworkRunPanel networkId={selectedId} />
            <ValidationReportPanel report={validationReport} isDerNetwork={isDerNetwork} />
            {detail.data?.has_dynamic_expected && (
              <DynamicValidationPanel networkId={selectedId} />
            )}
          </div>
        ) : (
          <div
            className="flex h-full items-center justify-center rounded border border-dashed border-chrome-700 p-8"
            data-testid="reference-network-surface-empty"
          >
            <div className="text-center">
              <h2 className="text-lg font-semibold text-chrome-200">Walidacja sieci referencyjnych</h2>
              <p className="mt-2 max-w-md text-sm text-chrome-400">
                Wybierz sieć referencyjną z listy po lewej stronie, aby uruchomić walidację solverów
                (IEC 60909 Short Circuit, NR/GS/FD Power Flow, BFS Unbalanced) względem publikowanych
                wartości referencyjnych z literatury IEEE, IEC, CIGRE i pandapower.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

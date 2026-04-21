/**
 * Protection Diagnostics Panel Container
 *
 * Container wiring panel z store.
 * Używany w widoku Results.
 *
 * BINDING:
 * - Pobiera dane ze store (useProtectionDiagnosticsStore)
 * - READ-ONLY: brak mutacji
 */

import React from 'react';
import { ProtectionDiagnosticsPanel } from './ProtectionDiagnosticsPanel';
import { useProtectionReadModel } from '../protection';
import {
  useProtectionDiagnosticsStore,
  useSeverityFilter,
} from './store';

export const ProtectionDiagnosticsPanelContainer: React.FC = () => {
  const { data, isLoading, error } = useProtectionReadModel();
  const activeSeverities = useSeverityFilter();
  const toggleSeverityFilter = useProtectionDiagnosticsStore(
    (state) => state.toggleSeverityFilter
  );
  const results = activeSeverities.length === 0
    ? data.diagnostics
    : data.diagnostics.filter((result) => activeSeverities.includes(result.severity));

  return (
    <ProtectionDiagnosticsPanel
      results={results}
      activeSeverities={activeSeverities}
      onToggleSeverity={toggleSeverityFilter}
      isLoading={isLoading}
      error={error}
    />
  );
};

export default ProtectionDiagnosticsPanelContainer;

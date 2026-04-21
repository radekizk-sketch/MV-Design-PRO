import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TraceMetadataPanel } from '../TraceMetadataPanel';
import type { ExtendedTrace, TraceStep } from '../../results-inspector/types';

const trace: ExtendedTrace = {
  run_id: 'run-001',
  snapshot_id: 'snapshot-001',
  input_hash: 'hash-001',
  catalog_context: [
    {
      element_id: 'branch-001',
      element_type: 'ODCINEK_SN',
      catalog_binding: {
        catalog_namespace: 'mv_cables',
        catalog_item_id: 'cable-120',
        catalog_item_version: '2026.04',
      },
      source_catalog_label: 'mv_cables:cable-120@2026.04',
    },
  ],
  catalog_context_summary: {
    element_count: 1,
    by_type: { ODCINEK_SN: 1 },
    by_parameter_origin: {},
    manual_override_element_count: 0,
    manual_override_count: 0,
  },
  white_box_trace: [
    {
      step: 1,
      key: 'calc-001',
      title: 'Krok obliczeń',
      phase: 'CALCULATION',
    },
  ],
};

const selectedStep: TraceStep = {
  step: 1,
  key: 'calc-001',
  title: 'Krok obliczeń',
  phase: 'CALCULATION',
};

describe('TraceMetadataPanel', () => {
  it('pokazuje jawny stan braku dopasowania kontekstu katalogowego dla wybranego kroku', () => {
    render(<TraceMetadataPanel trace={trace} selectedStep={selectedStep} />);

    expect(
      screen.getByText('Brak dopasowania kontekstu katalogowego dla wybranego kroku.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('branch-001')).not.toBeInTheDocument();
  });
});

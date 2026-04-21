import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CreatorPanel } from '../CreatorPanel';

const openOperationFormMock = vi.fn();

vi.mock('../snapshotStore', () => ({
  useSnapshotStore: () => ({
    snapshot: null,
    logicalViews: null,
    readiness: {
      ready: false,
      blockers: [],
      warnings: [],
    },
    fixActions: [],
    loading: false,
    error: null,
    errorCode: null,
    clearError: vi.fn(),
  }),
}));

vi.mock('../CreatorToolbar', () => ({
  CreatorToolbar: () => <div data-testid="creator-toolbar-mock" />,
}));

vi.mock('../ReadinessPanel', () => ({
  ReadinessPanel: () => <div data-testid="readiness-panel-mock" />,
}));

vi.mock('../../selection/store', () => ({
  useSelectionStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      selectElement: vi.fn(),
      centerSldOnElement: vi.fn(),
    }),
}));

vi.mock('../../notifications/store', () => ({
  notify: vi.fn(),
}));

vi.mock('../../shared/fixActionSurfaceExecutor', () => ({
  executeFixActionSurface: vi.fn(),
}));

vi.mock('../../network-build/networkBuildStore', () => ({
  useNetworkBuildStore: (selector: (state: { openOperationForm: typeof openOperationFormMock }) => unknown) =>
    selector({
      openOperationForm: openOperationFormMock,
    }),
}));

describe('CreatorPanel GPZ flow', () => {
  beforeEach(() => {
    openOperationFormMock.mockReset();
  });

  it('otwiera GPZ z preseklektowanym katalogiem SN', () => {
    render(<CreatorPanel caseId="case-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Dodaj GPZ (15 kV)' }));

    expect(openOperationFormMock).toHaveBeenCalledWith(
      'add_grid_source_sn',
      expect.objectContaining({
        source: 'creator_panel',
        case_id: 'case-1',
        source_name: 'Zasilanie GPZ 15 kV / Sk3 200 MVA / R/X 0.10',
        sn_voltage_kv: 15,
        sk3_mva: 200,
        rx_ratio: 0.1,
        catalog_ref: 'src-gpz-15kv-200mva-rx010',
        sections_count: 1,
        gpz_section_name: 'Sekcja GPZ',
        gpz_line_field_name: 'Pole liniowe GPZ',
      }),
    );
  });
});

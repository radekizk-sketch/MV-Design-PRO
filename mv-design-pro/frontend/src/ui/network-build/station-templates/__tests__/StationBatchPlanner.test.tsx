import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildStationBatchPlan, StationBatchPlanner } from '../StationBatchPlanner';
import type { StationTemplateSummary } from '../api';

const templates: StationTemplateSummary[] = [
  {
    id: 'tpl_sn_nn_630kva',
    name_pl: 'Stacja SN/nN 630 kVA',
    category: 'typowa_sn_nn',
    description_pl: 'Typowa stacja',
    use_case_pl: 'Dystrybucja',
    nc_rfg_type: null,
    tags: [],
    icon: 'station',
  },
  {
    id: 'tpl_pv_500kw',
    name_pl: 'Stacja PV 500 kW',
    category: 'farma_pv',
    description_pl: 'Stacja PV',
    use_case_pl: 'OZE',
    nc_rfg_type: 'B',
    tags: [],
    icon: 'pv',
  },
  {
    id: 'tpl_bess_500kw',
    name_pl: 'Stacja BESS 500 kW',
    category: 'bess',
    description_pl: 'Stacja BESS',
    use_case_pl: 'Magazyn',
    nc_rfg_type: 'B',
    tags: [],
    icon: 'bess',
  },
];

function response(data: unknown): Response {
  return {
    ok: true,
    json: async () => data,
  } as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('StationBatchPlanner', () => {
  it('buduje deterministyczny plan i blokuje wiersze bez odcinka docelowego', () => {
    const plan = buildStationBatchPlan(templates, ['seg/1', 'seg/2'], 4);

    expect(plan).toHaveLength(4);
    expect(plan[0].templateId).toBe('tpl_sn_nn_630kva');
    expect(plan[0].targetSegmentRef).toBe('seg/1');
    expect(plan[0].status).toBe('gotowe');
    expect(plan[2].status).toBe('brak_segmentu');
    expect(plan[2].missingFields).toContain('odcinek docelowy');
    expect(plan.every((row) => row.lengthM !== 0)).toBe(true);
  });

  it('renderuje tabelę planu 50+ jako powierzchnię roboczą z powodem blokady zapisu', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ templates, total: templates.length }));

    render(
      <StationBatchPlanner
        caseId="case-1"
        segmentRefs={['seg/1', 'seg/2', 'seg/3']}
        targetCount={5}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('station-batch-planner')).toBeInTheDocument();
      expect(screen.getByTestId('station-batch-row-1')).toBeInTheDocument();
      expect(screen.getByText((_, element) => element?.textContent === 'Gotowe wiersze: 3/5')).toBeInTheDocument();
    });
    expect(screen.getByTestId('station-batch-apply')).toBeDisabled();
    expect(screen.getByTestId('station-batch-disabled-reason').textContent).toContain('2 wierszy z brakami');
  });

  it('pozwala edytować długość odcinka i pokazuje brak danych zamiast wartości zerowej', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ templates, total: templates.length }));

    render(
      <StationBatchPlanner
        caseId="case-1"
        segmentRefs={['seg/1', 'seg/2', 'seg/3']}
        targetCount={3}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('station-batch-row-1')).toBeInTheDocument();
    });

    const firstLengthInput = screen.getByLabelText('Długość odcinka wiersza 1') as HTMLInputElement;
    fireEvent.change(firstLengthInput, { target: { value: '0' } });

    expect(screen.getByTestId('station-batch-row-1').textContent).toContain('brak długości');
    expect(screen.getByTestId('station-batch-apply')).toBeDisabled();
  });
});

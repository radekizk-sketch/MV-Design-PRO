import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TypePicker } from '../TypePicker';

const fetchTypesByCategoryMock = vi.fn();

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    fetchTypesByCategory: (...args: unknown[]) => fetchTypesByCategoryMock(...args),
  };
});

describe('TypePicker', () => {
  beforeEach(() => {
    fetchTypesByCategoryMock.mockReset();
  });

  it('pokazuje przyjazny komunikat i pozwala ponowic pobranie', async () => {
    fetchTypesByCategoryMock
      .mockRejectedValueOnce(new Error('500 Internal Server Error: No detail'))
      .mockResolvedValueOnce([
        {
          id: 'src-gpz-15kv-200mva-rx010',
          name: 'Zasilanie GPZ 15 kV / Sk3 200 MVA / R/X 0.10',
          manufacturer: 'OSD',
          voltage_rating_kv: 15,
          sk3_mva: 200,
          rx_ratio: 0.1,
        },
      ]);

    render(
      <TypePicker
        category="SYSTEM_SOURCE"
        currentTypeId={null}
        onSelectType={vi.fn()}
        onClose={vi.fn()}
        isOpen
      />,
    );

    expect(await screen.findByText('Nie udalo sie pobrac typow katalogowych')).toBeInTheDocument();
    expect(
      screen.getByText('Backend katalogow nie odpowiada. Uruchom API i sprobuj ponownie.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ponow' }));

    await waitFor(() => {
      expect(
        screen.getByText('Zasilanie GPZ 15 kV / Sk3 200 MVA / R/X 0.10'),
      ).toBeInTheDocument();
    });

    expect(fetchTypesByCategoryMock).toHaveBeenCalledTimes(2);
  });
});

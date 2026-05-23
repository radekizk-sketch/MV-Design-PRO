import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';

import { SimilarityMatchBanner } from '../SimilarityMatchBanner';

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

describe('SimilarityMatchBanner', () => {
  it('nie renderuje banneru bez userNetwork', () => {
    const { container } = render(<SimilarityMatchBanner userNetwork={null} />);
    expect(container.querySelector('[data-testid="similarity-match-banner"]')).toBeNull();
  });

  it('renderuje banner gdy match >= 70%', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          matches: [
            {
              network_id: 'ieee-4bus',
              name_pl: 'IEEE 4-bus',
              confidence_pct: 85.5,
              matched_features: ['Liczba węzłów (4 ≈ 4)', 'Poziom napięcia 132 kV'],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    render(
      <SimilarityMatchBanner
        userNetwork={{
          bus_count: 4,
          branch_count: 4,
          voltage_kv_levels: [132.0],
          has_der: false,
        }}
      />,
    );
    vi.advanceTimersByTime(2500);
    await waitFor(() => {
      expect(screen.getByTestId('similarity-match-banner')).toBeInTheDocument();
    });
    expect(screen.getByText(/IEEE 4-bus/i)).toBeInTheDocument();
    expect(screen.getByText(/85.5%/)).toBeInTheDocument();
  });

  it('ukrywa banner po kliknięciu Zamknij', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          matches: [
            {
              network_id: 'ieee-4bus',
              name_pl: 'IEEE 4-bus',
              confidence_pct: 95.0,
              matched_features: [],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    render(
      <SimilarityMatchBanner
        userNetwork={{ bus_count: 4, branch_count: 4, voltage_kv_levels: [132], has_der: false }}
      />,
    );
    vi.advanceTimersByTime(2500);
    await waitFor(() => {
      expect(screen.getByTestId('similarity-match-banner')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('similarity-banner-dismiss'));
    expect(screen.queryByTestId('similarity-match-banner')).toBeNull();
  });

  it('nie renderuje gdy confidence < 70%', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          matches: [
            {
              network_id: 'ieee-4bus',
              name_pl: 'IEEE 4-bus',
              confidence_pct: 50.0,
              matched_features: [],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const { container } = render(
      <SimilarityMatchBanner
        userNetwork={{ bus_count: 4, branch_count: 4, voltage_kv_levels: [132], has_der: false }}
      />,
    );
    vi.advanceTimersByTime(2500);
    await waitFor(() => {
      // sufficient time for fetch to resolve
      expect(globalThis.fetch).toHaveBeenCalled();
    });
    expect(container.querySelector('[data-testid="similarity-match-banner"]')).toBeNull();
  });
});

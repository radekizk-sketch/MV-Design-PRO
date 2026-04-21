import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TracePanel } from '../TracePanel';
import type { TraceStep } from '../types';

describe('TracePanel', () => {
  it('does not expose raw step identifiers in the header', () => {
    const traceSteps: TraceStep[] = [
      {
        step: 'P11_1c_QU_VDROP',
        description_pl: 'Wywód napięcia',
        inputs: {},
        outputs: {},
      },
    ];

    render(<TracePanel traceSteps={traceSteps} />);

    expect(screen.getByText('Krok 1')).toBeInTheDocument();
    expect(screen.getByText('Wywód napięcia')).toBeInTheDocument();
    expect(screen.queryByText('P11_1c_QU_VDROP')).not.toBeInTheDocument();
  });
});

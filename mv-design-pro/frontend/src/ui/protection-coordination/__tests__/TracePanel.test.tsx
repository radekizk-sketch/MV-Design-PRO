import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TracePanel } from '../TracePanel';
import type { TraceStep } from '../types';

describe('TracePanel', () => {
  it('does not expose raw step identifiers in the header', () => {
    const traceSteps: TraceStep[] = [
      {
        step: 'P11_1c_QU_VDROP',  // no-codenames-ignore — surowy identyfikator kroku jest WEJSCIEM testu
        description_pl: 'Wywód napięcia',
        inputs: {},
        outputs: {},
      },
    ];

    render(<TracePanel traceSteps={traceSteps} />);

    expect(screen.getByText('Krok 1')).toBeInTheDocument();
    expect(screen.getByText('Wywód napięcia')).toBeInTheDocument();
    expect(screen.queryByText('P11_1c_QU_VDROP')).not.toBeInTheDocument();  // no-codenames-ignore — asercja, ze panel go NIE pokazuje
  });
});

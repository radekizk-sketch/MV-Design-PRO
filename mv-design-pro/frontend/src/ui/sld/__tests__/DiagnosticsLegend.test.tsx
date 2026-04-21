import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DiagnosticsLegend } from '../DiagnosticsLegend';

describe('DiagnosticsLegend', () => {
  it('renders canonical protection diagnostics labels without demo notice', () => {
    render(
      <DiagnosticsLegend
        errorCount={2}
        warnCount={1}
        infoCount={1}
        filter="ALL"
      />,
    );

    expect(screen.getByTestId('sld-diagnostics-legend')).toBeInTheDocument();
    expect(screen.getByText('Diagnostyka zabezpieczeń')).toBeInTheDocument();
    expect(screen.getByText('Widoczne markery:')).toBeInTheDocument();
    expect(screen.queryByText('Dane demonstracyjne')).not.toBeInTheDocument();
  });

  it('does not render when no markers are visible', () => {
    const { container } = render(
      <DiagnosticsLegend
        errorCount={0}
        warnCount={0}
        infoCount={0}
        filter="ALL"
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

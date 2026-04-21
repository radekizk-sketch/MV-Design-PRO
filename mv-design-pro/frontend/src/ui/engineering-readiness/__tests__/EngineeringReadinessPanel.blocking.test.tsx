import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { EngineeringReadinessPanel } from '../EngineeringReadinessPanel';
import type { ReadinessWorkspaceBlockState } from '../ReadinessLivePanel';

describe('EngineeringReadinessPanel blocked state', () => {
  it('does not render a green ready card when the workspace is blocked', () => {
    const workspaceBlockState: ReadinessWorkspaceBlockState = {
      reason: 'NO_SOURCE',
      title: 'Brak źródła zasilania',
      description: 'Model nie ma jeszcze GPZ ani innego źródła.',
      nextStep: 'Dodaj źródło GPZ w lewym panelu.',
    };

    render(
      createElement(EngineeringReadinessPanel, {
        issues: [],
        status: 'OK',
        ready: true,
        bySeverity: { BLOCKER: 0, IMPORTANT: 0, INFO: 0 },
        onNavigate: vi.fn(),
        onFix: vi.fn(),
        workspaceBlockState,
      }),
    );

    expect(screen.getByTestId('engineering-readiness-blocked')).toBeInTheDocument();
    expect(screen.queryByText('Model gotowy do obliczeń')).toBeNull();
  });
});

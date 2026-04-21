import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SldReadinessStack } from '../SldReadinessStack';
import type { FixAction, ReadinessIssue } from '../../types';

vi.mock('../../engineering-readiness', () => ({
  ReadinessLivePanel: ({
    workspaceBlockState,
  }: {
    workspaceBlockState?: { reason: string } | null;
  }) => (
    <div data-testid="readiness-live-panel">
      {workspaceBlockState ? `blokada:${workspaceBlockState.reason}` : 'gotowosc'}
    </div>
  ),
  DataGapPanel: () => <div data-testid="data-gap-panel">braki</div>,
}));

const noop = () => {};

function renderStack(overrides: Partial<ComponentProps<typeof SldReadinessStack>> = {}) {
  return render(
    <SldReadinessStack
      activeCaseId="case-1"
      workspaceBlockState={null}
      issues={[] as ReadinessIssue[]}
      status="WARN"
      ready={false}
      loading={false}
      collapsedGroups={[]}
      onToggleGroup={noop}
      onNavigateToElement={noop}
      onFixAction={((_fixAction: FixAction, _elementRef: string | null) => {})}
      onQuickFix={noop}
      {...overrides}
    />,
  );
}

describe('SldReadinessStack', () => {
  it('nie renderuje stosu bez aktywnego przypadku', () => {
    renderStack({ activeCaseId: null });

    expect(screen.queryByTestId('sld-readiness-stack')).toBeNull();
  });

  it('przy blokadzie warsztatowej renderuje tylko kanoniczny panel blokady', () => {
    renderStack({
      status: 'OK',
      ready: true,
      workspaceBlockState: {
        reason: 'NO_SOURCE',
        title: 'Brak źródła zasilania',
        description: 'Model nie ma GPZ.',
        nextStep: 'Dodaj GPZ.',
      },
    });

    expect(screen.getByTestId('sld-readiness-stack')).toHaveAttribute('data-blocked', 'true');
    expect(screen.getByTestId('readiness-live-panel')).toHaveTextContent('blokada:NO_SOURCE');
    expect(screen.queryByTestId('data-gap-panel')).toBeNull();
  });

  it('przy odblokowanym modelu renderuje oba panele gotowości', () => {
    renderStack();

    expect(screen.getByTestId('sld-readiness-stack')).toHaveAttribute('data-blocked', 'false');
    expect(screen.getByTestId('readiness-live-panel')).toHaveTextContent('gotowosc');
    expect(screen.getByTestId('data-gap-panel')).toBeInTheDocument();
  });
});

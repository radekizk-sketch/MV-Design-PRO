import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ObjectCardRouter } from '../ObjectCardRouter';
import { useNetworkBuildStore } from '../networkBuildStore';

vi.mock('../cards', () => ({
  SourceCard: ({ elementId }: { elementId: string }) => <div data-testid="source-card">{elementId}</div>,
  StationCard: ({ elementId }: { elementId: string }) => <div data-testid="station-card">{elementId}</div>,
  TrunkCard: ({ corridorRef }: { corridorRef: string }) => <div data-testid="trunk-card">{corridorRef}</div>,
  LineSegmentCard: ({ elementId }: { elementId: string }) => <div data-testid="line-segment-card">{elementId}</div>,
  TransformerCard: ({ elementId }: { elementId: string }) => <div data-testid="transformer-card">{elementId}</div>,
  SwitchCard: ({ elementId }: { elementId: string }) => <div data-testid="switch-card">{elementId}</div>,
  BayCard: ({ elementId }: { elementId: string }) => <div data-testid="bay-card">{elementId}</div>,
  NnSwitchgearCard: ({ elementId }: { elementId: string }) => <div data-testid="nn-switchgear-card">{elementId}</div>,
  RenewableSourceCard: ({ elementId }: { elementId: string }) => (
    <div data-testid="renewable-source-card">{elementId}</div>
  ),
  BranchPoleCard: ({ elementId }: { elementId: string }) => <div data-testid="branch-pole-card">{elementId}</div>,
  ZksnCard: ({ elementId }: { elementId: string }) => <div data-testid="zksn-card">{elementId}</div>,
}));

describe('ObjectCardRouter', () => {
  beforeEach(() => {
    useNetworkBuildStore.getState().reset();
  });

  it('renderuje kartę stacji dla aktywnej stacji', () => {
    useNetworkBuildStore.getState().openObjectCard({ kind: 'station', elementId: 'st-1' });

    render(<ObjectCardRouter />);

    expect(screen.getByTestId('station-card')).toHaveTextContent('st-1');
  });

  it('renderuje kartę rozdzielnicy nN dla aktywnego obiektu nn_switchgear', () => {
    useNetworkBuildStore.getState().openObjectCard({ kind: 'nn_switchgear', elementId: 'bus-nn-1' });

    render(<ObjectCardRouter />);

    expect(screen.getByTestId('nn-switchgear-card')).toHaveTextContent('bus-nn-1');
  });

  it('renderuje kartę źródła odnawialnego dla aktywnego źródła nN', () => {
    useNetworkBuildStore.getState().openObjectCard({ kind: 'renewable_source', elementId: 'pv-1' });

    render(<ObjectCardRouter />);

    expect(screen.getByTestId('renewable-source-card')).toHaveTextContent('pv-1');
  });
});

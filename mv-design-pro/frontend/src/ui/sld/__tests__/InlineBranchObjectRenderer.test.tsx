import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { InlineBranchObjectRenderer } from '../InlineBranchObjectRenderer';
import { SLDViewCanvas } from '../SLDViewCanvas';
import type { CanonicalAnnotationsV1 } from '../core/layoutResult';
import type { ViewportState } from '../types';

const VIEWPORT: ViewportState = {
  offsetX: 0,
  offsetY: 0,
  zoom: 1,
};

describe('InlineBranchObjectRenderer', () => {
  it('renders branch pole through the shared CANONICAL symbol library', () => {
    const { container } = render(
      <svg>
        <InlineBranchObjectRenderer
          obj={{
            nodeId: 'branch-pole-1',
            objectType: 'branch_pole',
            label: 'SO-01',
            position: { x: 100, y: 80 },
            branchPortCount: 1,
          }}
        />
      </svg>,
    );

    expect(screen.getByTestId('sld-inline-branch-object-branch-pole-1')).toBeInTheDocument();
    expect(container.querySelector('[data-canonical-symbol="branch_pole"]')).not.toBeNull();
  });

  it('renders ZKSN through the shared CANONICAL symbol library', () => {
    const { container } = render(
      <svg>
        <InlineBranchObjectRenderer
          obj={{
            nodeId: 'zksn-1',
            objectType: 'zksn',
            label: 'ZKSN-01',
            position: { x: 100, y: 80 },
            branchPortCount: 2,
          }}
        />
      </svg>,
    );

    expect(screen.getByTestId('sld-inline-branch-object-zksn-1')).toBeInTheDocument();
    expect(container.querySelector('[data-canonical-symbol="zksn"]')).not.toBeNull();
  });
});

describe('SLDViewCanvas inline branch objects', () => {
  it('reports BranchPole instead of Station when branch pole is selected', () => {
    const onSymbolClick = vi.fn();
    const canonicalAnnotations: CanonicalAnnotationsV1 = {
      trunkNodes: [],
      trunkSegments: [],
      branchPoints: [],
      stationChains: [],
      inlineBranchObjects: [
        {
          nodeId: 'branch-pole-1',
          objectType: 'branch_pole',
          label: 'SO-01',
          position: { x: 120, y: 120 },
          branchPortCount: 1,
        },
      ],
    };

    render(
      <SLDViewCanvas
        symbols={[]}
        selectedId={null}
        onSymbolClick={onSymbolClick}
        viewport={VIEWPORT}
        showGrid={false}
        width={800}
        height={500}
        canonicalAnnotations={canonicalAnnotations}
      />,
    );

    fireEvent.click(screen.getByTestId('sld-inline-branch-object-branch-pole-1'));
    expect(onSymbolClick).toHaveBeenCalledWith('branch-pole-1', 'BranchPole', 'SO-01');
  });

  it('reports ZKSN instead of Station when ZKSN is selected', () => {
    const onSymbolClick = vi.fn();
    const canonicalAnnotations: CanonicalAnnotationsV1 = {
      trunkNodes: [],
      trunkSegments: [],
      branchPoints: [],
      stationChains: [],
      inlineBranchObjects: [
        {
          nodeId: 'zksn-1',
          objectType: 'zksn',
          label: 'ZKSN-01',
          position: { x: 160, y: 160 },
          branchPortCount: 2,
        },
      ],
    };

    render(
      <SLDViewCanvas
        symbols={[]}
        selectedId={null}
        onSymbolClick={onSymbolClick}
        viewport={VIEWPORT}
        showGrid={false}
        width={800}
        height={500}
        canonicalAnnotations={canonicalAnnotations}
      />,
    );

    fireEvent.click(screen.getByTestId('sld-inline-branch-object-zksn-1'));
    expect(onSymbolClick).toHaveBeenCalledWith('zksn-1', 'ZKSN', 'ZKSN-01');
  });
});

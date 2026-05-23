/**
 * SpineRenderer testy renderowania per LOD.
 *
 * - LOD 0 (overview): oś + węzły, brak odgałęzień, brak etykiet.
 * - LOD 1 (medium): + odgałęzienia + etykiety.
 * - LOD 3 (detail): + większe punkty + większe etykiety.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { SpineRenderer } from '../SpineRenderer';
import type { SpineModel } from '../../builder/SpinePolicy';

function makeModel(): SpineModel {
  return {
    corridors: [
      {
        spineId: 'RUN-1',
        label: 'Ciąg SN-1',
        axisY: 300,
        xStart: 100,
        xEnd: 500,
        nodes: [
          { ref: 'GPZ-1', kind: 'gpz', x: 100, label: 'GPZ-1' },
          { ref: 'ST-A', kind: 'station', x: 300, label: 'ST-A' },
          { ref: 'ST-B', kind: 'station', x: 500, label: 'ST-B' },
        ],
        branches: [{ branchRunId: 'RUN-B', originRef: 'ST-A', originX: 300 }],
      },
    ],
    totalNodes: 3,
  };
}

function svgWrapper(children: React.ReactNode) {
  return <svg>{children}</svg>;
}

describe('SpineRenderer', () => {
  it('LOD 0: rysuje oś + węzły, brak odgałęzień, brak etykiet', () => {
    const { container } = render(svgWrapper(<SpineRenderer model={makeModel()} lod={0} />));
    expect(container.querySelector('[data-testid="spine-axis-RUN-1"]')).toBeTruthy();
    expect(container.querySelectorAll('[data-spine-node]').length).toBe(3);
    expect(container.querySelector('[data-testid="spine-branch-RUN-B"]')).toBeNull();
    expect(container.querySelectorAll('text').length).toBe(0);
  });

  it('LOD 1: rysuje odgałęzienia i etykiety', () => {
    const { container } = render(svgWrapper(<SpineRenderer model={makeModel()} lod={1} />));
    expect(container.querySelector('[data-testid="spine-branch-RUN-B"]')).toBeTruthy();
    expect(container.querySelectorAll('text').length).toBe(3);
  });

  it('LOD 3: większy promień węzła', () => {
    const { container: c0 } = render(svgWrapper(<SpineRenderer model={makeModel()} lod={0} />));
    const { container: c3 } = render(svgWrapper(<SpineRenderer model={makeModel()} lod={3} />));
    const r0 = c0.querySelector('circle')!.getAttribute('r');
    const r3 = c3.querySelector('circle')!.getAttribute('r');
    expect(Number(r3)).toBeGreaterThan(Number(r0));
  });

  it('Wywołuje onSelect po kliknięciu węzła', () => {
    let selected: string | null = null;
    const { container } = render(
      svgWrapper(<SpineRenderer model={makeModel()} lod={2} onSelect={(ref) => (selected = ref)} />),
    );
    const node = container.querySelector('[data-spine-node="ST-A"]');
    expect(node).toBeTruthy();
    (node as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(selected).toBe('ST-A');
  });

  it('Pusty model → nic nie renderuje (oprócz pustego g)', () => {
    const empty: SpineModel = { corridors: [], totalNodes: 0 };
    const { container } = render(svgWrapper(<SpineRenderer model={empty} lod={2} />));
    expect(container.querySelector('[data-spine-id]')).toBeNull();
  });

  it('C9: węzeł z ERROR dostaje czerwoną obwódkę + data-has-issue', () => {
    const { container } = render(
      svgWrapper(
        <SpineRenderer model={makeModel()} lod={2} issuesByRef={{ 'ST-A': 'ERROR' }} />,
      ),
    );
    const node = container.querySelector('[data-spine-node="ST-A"]');
    expect(node?.getAttribute('data-has-issue')).toBe('ERROR');
    const circle = node?.querySelector('circle');
    expect(circle?.getAttribute('stroke')).toBe('#ef4444');
    expect(circle?.getAttribute('stroke-width')).toBe('3');
  });

  it('C9: węzeł z WARNING dostaje bursztynową obwódkę', () => {
    const { container } = render(
      svgWrapper(
        <SpineRenderer model={makeModel()} lod={2} issuesByRef={{ 'ST-B': 'WARNING' }} />,
      ),
    );
    const circle = container
      .querySelector('[data-spine-node="ST-B"]')
      ?.querySelector('circle');
    expect(circle?.getAttribute('stroke')).toBe('#f59e0b');
  });

  it('C9: węzeł bez problemu zachowuje białą obwódkę', () => {
    const { container } = render(
      svgWrapper(<SpineRenderer model={makeModel()} lod={2} issuesByRef={{ 'ST-A': 'ERROR' }} />),
    );
    const circle = container
      .querySelector('[data-spine-node="GPZ-1"]')
      ?.querySelector('circle');
    expect(circle?.getAttribute('stroke')).toBe('#ffffff');
    expect(container.querySelector('[data-spine-node="GPZ-1"]')?.getAttribute('data-has-issue')).toBeNull();
  });
});

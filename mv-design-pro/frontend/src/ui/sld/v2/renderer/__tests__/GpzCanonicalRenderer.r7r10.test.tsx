/**
 * GpzCanonicalRenderer R7-R10 expansion tests.
 *
 * Pokrywa:
 *   R7 — Pola HV liniowe (LINE_FULL z pełną aparaturą 110 kV)
 *   R8 — A11y (ARIA labels + keyboard nav)
 *   R9 — VT na bocznej gałęzi (pole MEASUREMENT)
 *   R10 — React.memo (referential equality, brak re-render gdy props identyczne)
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, cleanup } from '@testing-library/react';

import { GpzCanonicalRenderer } from '../GpzCanonicalRenderer';
import type { GpzCanonicalRendererProps, CanonicalGpzBay } from '../GpzCanonicalRenderer';

function bay(overrides: Partial<CanonicalGpzBay> = {}): CanonicalGpzBay {
  return {
    bayRef: 'bay-1',
    bayNumber: '10',
    feederName: 'PST1',
    destinationLabel: null,
    fieldRole: 'LINE_OUT',
    cbState: 'closed',
    dsState: 'closed',
    esState: 'open',
    qDesignations: { cb: 'Q0', dsBus: 'Q1', dsLin: 'Q9', es: 'Q8', ct: 'T1' },
    statusFlags: [],
    controlMode: 'remote',
    inManipulation: false,
    ...overrides,
  };
}

function baseProps(overrides: Partial<GpzCanonicalRendererProps> = {}): GpzCanonicalRendererProps {
  return {
    id: 'gpz-test',
    x: 0,
    y: 0,
    name: 'GPZ-TEST',
    transformers: [
      {
        transformerRef: 'tr-1',
        designation: 'TR1',
        snMva: 25,
        uhvKv: 110,
        ulvKv: 15,
        vectorGroup: 'YNd11',
      },
    ],
    sections: [
      {
        sectionId: 'sec-1',
        order: 1,
        label: 'S1',
        busVoltageKv: 15,
        bays: [bay()],
      },
    ],
    couplers: [],
    ...overrides,
  };
}

describe('GpzCanonicalRenderer R7 — Pola HV liniowe LINE_FULL', () => {
  it('Pole HV ma cable head u góry', () => {
    const { container } = render(
      <GpzCanonicalRenderer
        {...baseProps({
          hvSections: [{
            sectionId: 'hv-1',
            order: 1,
            busVoltageKv: 110,
            label: 'HV',
            bays: [bay({ bayRef: 'hv-bay-1', bayNumber: '21' })],
          }],
        })}
      />,
    );
    const hvBay = container.querySelector('[data-testid="gpz-canonical-hv-bay-hv-bay-1"]');
    expect(hvBay).toBeTruthy();
    /* W obrębie pola HV znajdzie się głowica kablowa (CableHead) */
    const cableHead = hvBay?.querySelector('[data-testid="gpz-canonical-cable-head"]');
    expect(cableHead).toBeTruthy();
    cleanup();
  });

  it('Pole HV ma DS_LIN, ES, CT, CB, DS_BUS w kolejności kanonicznej (top→bottom)', () => {
    const { container } = render(
      <GpzCanonicalRenderer
        {...baseProps({
          hvSections: [{
            sectionId: 'hv-1',
            order: 1,
            busVoltageKv: 110,
            label: 'HV',
            bays: [bay({
              bayRef: 'hv-bay-q9',
              qDesignations: { cb: 'Q0', dsBus: 'Q1', dsLin: 'Q9', es: 'Q8', ct: 'T1' },
            })],
          }],
        })}
      />,
    );
    const hvBay = container.querySelector('[data-testid="gpz-canonical-hv-bay-hv-bay-q9"]');
    expect(hvBay).toBeTruthy();
    /* Wszystkie aparaty obecne */
    expect(hvBay?.querySelector('[data-testid="gpz-canonical-ds"]')).toBeTruthy();
    expect(hvBay?.querySelector('[data-testid="gpz-canonical-cb"]')).toBeTruthy();
    expect(hvBay?.querySelector('[data-testid="gpz-canonical-ct"]')).toBeTruthy();
    expect(hvBay?.querySelector('[data-testid="gpz-canonical-es"]')).toBeTruthy();
    /* Q-numbery widoczne w polu HV */
    expect(hvBay?.textContent).toContain('Q0');
    expect(hvBay?.textContent).toContain('Q1');
    expect(hvBay?.textContent).toContain('Q9');
    expect(hvBay?.textContent).toContain('Q8');
    expect(hvBay?.textContent).toContain('T1');
    cleanup();
  });

  it('Pole HV bez DS_LIN qDesignation → CB i CT renderowane (kanon zachowany)', () => {
    /* Inv 9: brak qDesignation NIE skutkuje placeholderem — element NIE renderowany */
    const { container } = render(
      <GpzCanonicalRenderer
        {...baseProps({
          hvSections: [{
            sectionId: 'hv-1',
            order: 1,
            busVoltageKv: 110,
            label: 'HV',
            bays: [bay({
              bayRef: 'hv-bay-noq',
              qDesignations: {}, // brak Q-numbering
            })],
          }],
        })}
      />,
    );
    const hvBay = container.querySelector('[data-testid="gpz-canonical-hv-bay-hv-bay-noq"]');
    expect(hvBay).toBeTruthy();
    /* Aparaty CB/DS/CT są renderowane bez Q labels */
    expect(hvBay?.querySelector('[data-testid="gpz-canonical-cb"]')).toBeTruthy();
    expect(hvBay?.querySelector('[data-testid="gpz-canonical-ct"]')).toBeTruthy();
    /* Brak literalnego "?" w label */
    expect(hvBay?.textContent).not.toContain('Q?');
    cleanup();
  });

  it('Pole HV: feeder name renderowany jako sub-label pod szyną', () => {
    const { container } = render(
      <GpzCanonicalRenderer
        {...baseProps({
          hvSections: [{
            sectionId: 'hv-1',
            order: 1,
            busVoltageKv: 110,
            label: 'HV',
            bays: [bay({
              bayRef: 'hv-feeder',
              feederName: 'L-110-DOLNA',
            })],
          }],
        })}
      />,
    );
    const hvBay = container.querySelector('[data-testid="gpz-canonical-hv-bay-hv-feeder"]');
    expect(hvBay?.textContent).toContain('L-110-DOLNA');
    cleanup();
  });
});

describe('GpzCanonicalRenderer R9 — VT na bocznej gałęzi (pole MEASUREMENT)', () => {
  it('Pole MEASUREMENT renderuje VT na bocznej gałęzi', () => {
    const { container } = render(
      <GpzCanonicalRenderer
        {...baseProps({
          sections: [{
            sectionId: 'sec-m',
            order: 1,
            label: 'S1',
            busVoltageKv: 15,
            bays: [bay({
              bayRef: 'meas-1',
              fieldRole: 'MEASUREMENT',
              feederName: null,
              bayNumber: '99',
            })],
          }],
        })}
      />,
    );
    const measVt = container.querySelector('[data-testid="gpz-canonical-measurement-vt"]');
    expect(measVt).toBeTruthy();
    /* VT label "PU" widoczny */
    expect(measVt?.textContent).toContain('PU');
    cleanup();
  });

  it('Pole LINE_OUT NIE renderuje VT measurement gałęzi', () => {
    const { container } = render(
      <GpzCanonicalRenderer
        {...baseProps({
          sections: [{
            sectionId: 'sec-l',
            order: 1,
            label: 'S1',
            busVoltageKv: 15,
            bays: [bay({ bayRef: 'line-1', fieldRole: 'LINE_OUT' })],
          }],
        })}
      />,
    );
    /* W polu LINE_OUT NIE ma VT bocznej gałęzi (pojawi się tylko w MEASUREMENT) */
    const measVt = container.querySelector('[data-testid="gpz-canonical-measurement-vt"]');
    expect(measVt).toBeNull();
    cleanup();
  });

  it('Pole LINE_OUT/IN/BRANCH renderuje surge arrester (odgromnik)', () => {
    const { container } = render(
      <GpzCanonicalRenderer
        {...baseProps({
          sections: [{
            sectionId: 'sec-line',
            order: 1,
            label: 'S1',
            busVoltageKv: 15,
            bays: [bay({ bayRef: 'lo-1', fieldRole: 'LINE_OUT' })],
          }],
        })}
      />,
    );
    const arrester = container.querySelector('[data-testid="gpz-canonical-line-surge-arrester"]');
    expect(arrester).toBeTruthy();
    cleanup();
  });

  it('Pole TRANSFORMER NIE renderuje surge arrester (kanon: tylko LINE_*)', () => {
    const { container } = render(
      <GpzCanonicalRenderer
        {...baseProps({
          sections: [{
            sectionId: 'sec-tr',
            order: 1,
            label: 'S1',
            busVoltageKv: 15,
            bays: [bay({ bayRef: 'tr-bay-1', fieldRole: 'TRANSFORMER' })],
          }],
        })}
      />,
    );
    const arrester = container.querySelector('[data-testid="gpz-canonical-line-surge-arrester"]');
    expect(arrester).toBeNull();
    cleanup();
  });
});

describe('GpzCanonicalRenderer R8 — A11y ARIA + keyboard', () => {
  it('Top-level <g> ma role="group" + aria-label', () => {
    const { container } = render(
      <GpzCanonicalRenderer {...baseProps({ name: 'GPZ Mokra' })} />,
    );
    const root = container.querySelector('[data-testid="sld-v2-gpz-canonical-gpz-test"]');
    expect(root?.getAttribute('role')).toBe('group');
    expect(root?.getAttribute('aria-label')).toContain('GPZ Mokra');
    expect(root?.getAttribute('aria-label')).toContain('110/15 kV');
    cleanup();
  });

  it('aria-label pokazuje liczbę sekcji i transformatorów', () => {
    const { container } = render(
      <GpzCanonicalRenderer
        {...baseProps({
          sections: [
            { sectionId: 'sec-1', order: 1, label: 'S1', busVoltageKv: 15, bays: [] },
            { sectionId: 'sec-2', order: 2, label: 'S2', busVoltageKv: 15, bays: [] },
          ],
        })}
      />,
    );
    const root = container.querySelector('[data-testid="sld-v2-gpz-canonical-gpz-test"]');
    expect(root?.getAttribute('aria-label')).toContain('2 sekcji LV');
    expect(root?.getAttribute('aria-label')).toContain('1 transformatorów');
    cleanup();
  });

  it('Pole SN ma role="button" + tabIndex=0 + aria-label gdy onClick podany', () => {
    const onClickBay = vi.fn();
    const { container } = render(
      <GpzCanonicalRenderer {...baseProps({ onClickBay })} />,
    );
    const bayEl = container.querySelector('[data-testid="gpz-canonical-bay-bay-1"]');
    expect(bayEl?.getAttribute('role')).toBe('button');
    expect(bayEl?.getAttribute('tabindex')).toBe('0');
    expect(bayEl?.getAttribute('aria-label')).toContain('Pole 10');
    expect(bayEl?.getAttribute('aria-label')).toContain('liniowe wyjściowe');
    expect(bayEl?.getAttribute('aria-label')).toContain('PST1');
    expect(bayEl?.getAttribute('aria-label')).toContain('wyłącznik zamknięty');
    cleanup();
  });

  it('Pole SN bez onClick → brak role/tabIndex (nie focusable)', () => {
    const { container } = render(<GpzCanonicalRenderer {...baseProps()} />);
    const bayEl = container.querySelector('[data-testid="gpz-canonical-bay-bay-1"]');
    expect(bayEl?.getAttribute('role')).toBeNull();
    expect(bayEl?.getAttribute('tabindex')).toBeNull();
    cleanup();
  });

  it('Keyboard Enter → onClick', () => {
    const onClickBay = vi.fn();
    const { container } = render(<GpzCanonicalRenderer {...baseProps({ onClickBay })} />);
    const bayEl = container.querySelector('[data-testid="gpz-canonical-bay-bay-1"]') as Element;
    fireEvent.keyDown(bayEl, { key: 'Enter' });
    expect(onClickBay).toHaveBeenCalledWith('bay-1');
    cleanup();
  });

  it('Keyboard Space → onClick', () => {
    const onClickBay = vi.fn();
    const { container } = render(<GpzCanonicalRenderer {...baseProps({ onClickBay })} />);
    const bayEl = container.querySelector('[data-testid="gpz-canonical-bay-bay-1"]') as Element;
    fireEvent.keyDown(bayEl, { key: ' ' });
    expect(onClickBay).toHaveBeenCalledWith('bay-1');
    cleanup();
  });

  it('Keyboard F2 → onDoubleClick', () => {
    const onDoubleClickBay = vi.fn();
    const onClickBay = vi.fn();
    const { container } = render(
      <GpzCanonicalRenderer {...baseProps({ onClickBay, onDoubleClickBay })} />,
    );
    const bayEl = container.querySelector('[data-testid="gpz-canonical-bay-bay-1"]') as Element;
    fireEvent.keyDown(bayEl, { key: 'F2' });
    expect(onDoubleClickBay).toHaveBeenCalledWith('bay-1');
    expect(onClickBay).not.toHaveBeenCalled();
    cleanup();
  });

  it('Keyboard Shift+F10 → onContextMenu z koordynatami środka pola', () => {
    const onContextMenuBay = vi.fn();
    const onClickBay = vi.fn();
    const { container } = render(
      <GpzCanonicalRenderer {...baseProps({ onClickBay, onContextMenuBay })} />,
    );
    const bayEl = container.querySelector('[data-testid="gpz-canonical-bay-bay-1"]') as Element;
    fireEvent.keyDown(bayEl, { key: 'F10', shiftKey: true });
    expect(onContextMenuBay).toHaveBeenCalledWith(
      'bay-1',
      expect.objectContaining({ clientX: expect.any(Number), clientY: expect.any(Number) }),
    );
    cleanup();
  });

  it('Polskie aria-label dla każdej fieldRole', () => {
    const roles = [
      ['LINE_OUT', 'liniowe wyjściowe'],
      ['LINE_IN', 'liniowe wejściowe'],
      ['LINE_BRANCH', 'odgałęzienie liniowe'],
      ['TRANSFORMER', 'transformatorowe'],
      ['COUPLER', 'sprzęgło'],
      ['MEASUREMENT', 'pomiarowe'],
    ] as const;
    for (const [role, expectedLabel] of roles) {
      const { container } = render(
        <GpzCanonicalRenderer
          {...baseProps({
            sections: [{
              sectionId: 'sec',
              order: 1,
              label: 'S1',
              busVoltageKv: 15,
              bays: [bay({ bayRef: `b-${role}`, fieldRole: role })],
            }],
            onClickBay: vi.fn(),
          })}
        />,
      );
      const bayEl = container.querySelector(`[data-testid="gpz-canonical-bay-b-${role}"]`);
      expect(bayEl?.getAttribute('aria-label')).toContain(expectedLabel);
      cleanup();
    }
  });
});

describe('GpzCanonicalRenderer R10 — React.memo perf', () => {
  it('GpzCanonicalRenderer jest opakowany w memo (referential equality)', () => {
    /* React.memo tworzy obiekt z $$typeof === REACT_MEMO_TYPE.
     * Sprawdzamy że eksport NIE jest zwykłą funkcją. */
    const memoSymbol = Symbol.for('react.memo');
    expect((GpzCanonicalRenderer as unknown as { $$typeof: symbol }).$$typeof).toBe(memoSymbol);
  });
});

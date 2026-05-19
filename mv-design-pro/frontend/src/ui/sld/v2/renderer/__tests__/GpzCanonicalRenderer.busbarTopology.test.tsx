/**
 * Test topologii szyny w GpzCanonicalRenderer — PLAN_SLD_REWORK F1 + audit
 * 2026-05-19 §1.2 (luka F1-P0: brak ring/double busbar primitives w aktywnym
 * rendererze GPZ).
 *
 * Pokrycie:
 *   - default `single` → 1 szyna `primary`, brak S2, brak ring closure
 *   - `double` → 2 szyny (primary + reserve dashed), brak ring closure
 *   - `ring` → 2 szyny (primary + reserve solid) + ring closure po prawej
 *   - `data-busbar-topology` attribute dla testów struktury
 *   - `data-section-layout` zawiera kanoniczną nazwę topologii
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  type CanonicalGpzBay,
  type CanonicalGpzSection,
  type CanonicalGpzTransformer,
  GpzCanonicalRenderer,
} from '../GpzCanonicalRenderer';

const TR1: CanonicalGpzTransformer = {
  transformerRef: 'tr-1',
  designation: 'TR1',
  snMva: 25,
  uhvKv: 110,
  ulvKv: 15,
  vectorGroup: 'YNd11',
};

const LINE_BAY: CanonicalGpzBay = {
  bayRef: 'b-1',
  bayNumber: '1',
  feederName: 'ODPŁYW 1',
  destinationLabel: 'ST-01',
  fieldRole: 'LINE_OUT',
  cbState: 'closed',
  dsState: 'closed',
  esState: 'open',
  qDesignations: { cb: 'Q0', dsBus: 'Q1', dsLin: 'Q9', es: 'Q8', ct: 'T1' },
};

function makeSection(busbarTopology?: CanonicalGpzSection['busbarTopology']): CanonicalGpzSection {
  return {
    sectionId: 'sec-1',
    order: 1,
    label: 'S1',
    busVoltageKv: 15,
    bays: [LINE_BAY],
    busbarTopology,
  };
}

function renderGpz(section: CanonicalGpzSection) {
  return render(
    <svg width={1200} height={900}>
      <GpzCanonicalRenderer
        id="gpz-test"
        x={0}
        y={0}
        name="GPZ TEST"
        transformers={[TR1]}
        sections={[section]}
        couplers={[]}
      />
    </svg>,
  );
}

describe('GpzCanonicalRenderer — busbar topology (F1 ring/double)', () => {
  it('default → topologia single (jedna szyna, brak reserve, brak ring closure)', () => {
    const { container } = renderGpz(makeSection());
    const section = container.querySelector('[data-testid="gpz-canonical-section-sec-1"]');
    expect(section).toBeTruthy();
    expect(section?.getAttribute('data-busbar-topology')).toBe('single');
    expect(section?.getAttribute('data-section-layout')).toBe('single-bus-segment');

    const primary = container.querySelector('[data-testid="gpz-canonical-section-sec-1-bus"]');
    expect(primary?.getAttribute('data-busbar-role')).toBe('primary');

    const reserve = container.querySelector('[data-testid="gpz-canonical-section-sec-1-bus-s2"]');
    expect(reserve).toBeNull();

    const ringClosure = container.querySelector(
      '[data-testid="gpz-canonical-section-sec-1-ring-closure"]',
    );
    expect(ringClosure).toBeNull();
  });

  it('topologia single (jawnie) → identyczne zachowanie jak default', () => {
    const { container } = renderGpz(makeSection('single'));
    const section = container.querySelector('[data-testid="gpz-canonical-section-sec-1"]');
    expect(section?.getAttribute('data-busbar-topology')).toBe('single');
    expect(
      container.querySelector('[data-testid="gpz-canonical-section-sec-1-bus-s2"]'),
    ).toBeNull();
  });

  it('topologia double → 2 szyny (primary + reserve dashed), brak ring closure', () => {
    const { container } = renderGpz(makeSection('double'));
    const section = container.querySelector('[data-testid="gpz-canonical-section-sec-1"]');
    expect(section?.getAttribute('data-busbar-topology')).toBe('double');
    expect(section?.getAttribute('data-section-layout')).toBe('double-bus-segment');

    const primary = container.querySelector('[data-testid="gpz-canonical-section-sec-1-bus"]');
    expect(primary).toBeTruthy();
    expect(primary?.getAttribute('data-busbar-role')).toBe('primary');

    const reserve = container.querySelector('[data-testid="gpz-canonical-section-sec-1-bus-s2"]');
    expect(reserve, 'Szyna reserve S2 musi istnieć dla topology=double').toBeTruthy();
    expect(reserve?.getAttribute('data-busbar-role')).toBe('reserve');
    // S1 → strokeDasharray=6 3 (przerywana dla "operator wybiera ten system")
    expect(reserve?.getAttribute('stroke-dasharray')).toBe('6 3');

    const ringClosure = container.querySelector(
      '[data-testid="gpz-canonical-section-sec-1-ring-closure"]',
    );
    expect(ringClosure, 'Topology double NIE ma ring closure').toBeNull();
  });

  it('topologia ring → 2 szyny (primary + reserve solid) + ring closure po prawej', () => {
    const { container } = renderGpz(makeSection('ring'));
    const section = container.querySelector('[data-testid="gpz-canonical-section-sec-1"]');
    expect(section?.getAttribute('data-busbar-topology')).toBe('ring');
    expect(section?.getAttribute('data-section-layout')).toBe('ring-bus-segment');

    const primary = container.querySelector('[data-testid="gpz-canonical-section-sec-1-bus"]');
    expect(primary?.getAttribute('data-busbar-role')).toBe('primary');

    const reserve = container.querySelector('[data-testid="gpz-canonical-section-sec-1-bus-s2"]');
    expect(reserve, 'Szyna reserve S2 musi istnieć dla topology=ring').toBeTruthy();
    expect(reserve?.getAttribute('data-busbar-role')).toBe('reserve');
    // Ring: solid (brak dasharray) bo to fizyczne połączenie
    expect(reserve?.getAttribute('stroke-dasharray')).toBeNull();

    const ringClosure = container.querySelector(
      '[data-testid="gpz-canonical-section-sec-1-ring-closure"]',
    );
    expect(ringClosure, 'Topology ring MUSI mieć ring closure po prawej').toBeTruthy();
  });

  it('multi-section z różnymi topologiami — każda sekcja niezależna', () => {
    const sections: CanonicalGpzSection[] = [
      { ...makeSection('single'), sectionId: 'sec-1', label: 'S1' },
      { ...makeSection('double'), sectionId: 'sec-2', label: 'S2' },
      { ...makeSection('ring'), sectionId: 'sec-3', label: 'S3' },
    ];
    const { container } = render(
      <svg width={2000} height={900}>
        <GpzCanonicalRenderer
          id="gpz-multi"
          x={0}
          y={0}
          name="GPZ MULTI"
          transformers={[TR1]}
          sections={sections}
          couplers={[]}
        />
      </svg>,
    );

    expect(
      container
        .querySelector('[data-testid="gpz-canonical-section-sec-1"]')
        ?.getAttribute('data-busbar-topology'),
    ).toBe('single');
    expect(
      container
        .querySelector('[data-testid="gpz-canonical-section-sec-2"]')
        ?.getAttribute('data-busbar-topology'),
    ).toBe('double');
    expect(
      container
        .querySelector('[data-testid="gpz-canonical-section-sec-3"]')
        ?.getAttribute('data-busbar-topology'),
    ).toBe('ring');

    // Sec-1 (single) → brak S2
    expect(
      container.querySelector('[data-testid="gpz-canonical-section-sec-1-bus-s2"]'),
    ).toBeNull();
    // Sec-2 (double) → S2 obecne, ring closure brak
    expect(
      container.querySelector('[data-testid="gpz-canonical-section-sec-2-bus-s2"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-testid="gpz-canonical-section-sec-2-ring-closure"]'),
    ).toBeNull();
    // Sec-3 (ring) → S2 + ring closure
    expect(
      container.querySelector('[data-testid="gpz-canonical-section-sec-3-bus-s2"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-testid="gpz-canonical-section-sec-3-ring-closure"]'),
    ).toBeTruthy();
  });
});

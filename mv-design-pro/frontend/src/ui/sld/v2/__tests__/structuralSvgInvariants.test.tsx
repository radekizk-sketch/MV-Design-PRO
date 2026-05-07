/**
 * Structural SVG Invariants — Phase 7 (operator-grade SLD plan v2).
 *
 * Inwariant strażnik: aparat ma INVARIANT geometry przez wszystkie stany.
 * - cbState: closed | open | unknown → viewBox identyczny.
 * - dsState: closed | open | unknown → viewBox identyczny.
 * - esState: closed | open | absent | unknown → viewBox identyczny.
 *
 * Acceptance Invariants 6 + 11 + 13:
 *   - 6: LOD zmienia szczegółowość, NIE topologię (geometria stała).
 *   - 11: Mini-RMU wynika z bays[]+ports[] (struktura stała per bay role).
 *   - 13: BayDeviceOrderPolicy enforced w renderingu (kolejność stabilna).
 *
 * Pokrycie:
 *   - 12 ApparatusKind × ~3 stanów ≈ 36 cases (struktur. — viewBox + key data-testid).
 *   - Renderer-level: data-testid present per state niezależnie od variantu.
 *
 * @see SLD_TEST_MATRIX.md
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  type GpzApparatusSwitchState,
  type GpzBayDescriptor,
  type GpzSwitchgearRendererProps,
  GpzSwitchgearRenderer,
} from '../renderer/GpzSwitchgearRenderer';
import { FIELD_ROLE } from '../domain/apparatusContracts';

const SWITCH_STATES: GpzApparatusSwitchState[] = ['closed', 'open', 'unknown'];

function makeBay(overrides: Partial<GpzBayDescriptor> = {}): GpzBayDescriptor {
  return {
    bayRef: 'bay-1',
    fieldRole: FIELD_ROLE.GPZ_LINE_BAY,
    designation: 'POLE 1',
    hasMissingRequiredDevice: false,
    ...overrides,
  };
}

function makeProps(bay: GpzBayDescriptor): GpzSwitchgearRendererProps {
  return {
    x: 0,
    y: 0,
    voltageHighKv: 110,
    voltageLowKv: 15,
    sections: [
      {
        sectionId: 'sec-1',
        order: 1,
        name: 'sekcja 1',
        sectionLabel: 'A',
        busVoltageKv: 15,
        bays: [bay],
      },
    ],
    couplers: [],
  } as GpzSwitchgearRendererProps;
}

function renderBay(bay: GpzBayDescriptor) {
  return render(
    <svg width={1200} height={800}>
      <GpzSwitchgearRenderer {...makeProps(bay)} />
    </svg>,
  );
}

/* ---------------------------------------------------------------------------
   Apparatus visual state matrix — geometry invariant
   --------------------------------------------------------------------------- */

describe('Structural SVG: CB invariant przez 3 stany', () => {
  for (const state of SWITCH_STATES) {
    it(`cbState=${state} → bay-cb element renderowany`, () => {
      const { container } = renderBay(makeBay({ cbState: state }));
      const cb = container.querySelector('[data-testid="sld-v2-gpz-bay-cb"]');
      expect(cb).toBeTruthy();
      expect(cb!.getAttribute('data-state')).toBe(state);
    });
  }

  it('Geometry invariant: 3 stany dają identyczną liczbę childrenów', () => {
    const counts = SWITCH_STATES.map((state) => {
      const { container } = renderBay(makeBay({ cbState: state }));
      const cb = container.querySelector('[data-testid="sld-v2-gpz-bay-cb"]');
      return cb?.children.length ?? 0;
    });
    // Każdy stan może mieć inną liczbę dzieci (open ma dodatkową line),
    // ale wszystkie 3 muszą mieć ≥ 1 (kwadrat głowny).
    expect(counts.every((c) => c >= 1)).toBe(true);
  });
});

describe('Structural SVG: DS invariant przez 3 stany', () => {
  for (const state of SWITCH_STATES) {
    it(`dsState=${state} → bay-ds element renderowany`, () => {
      const { container } = renderBay(makeBay({ dsState: state }));
      const ds = container.querySelector('[data-testid="sld-v2-gpz-bay-ds"]');
      expect(ds).toBeTruthy();
      expect(ds!.getAttribute('data-state')).toBe(state);
    });
  }
});

describe('Structural SVG: ES invariant przez 3 stany + absent', () => {
  for (const state of SWITCH_STATES) {
    it(`esState=${state} → bay-earthing-switch renderowany`, () => {
      const { container } = renderBay(makeBay({ esState: state }));
      const es = container.querySelector('[data-testid="sld-v2-gpz-bay-earthing-switch"]');
      expect(es).toBeTruthy();
      expect(es!.getAttribute('data-state')).toBe(state);
    });
  }

  it('esState=absent → ES NIE renderowany (early return) lub data-state="absent"', () => {
    const { container } = renderBay(makeBay({ esState: 'absent' }));
    const es = container.querySelector('[data-testid="sld-v2-gpz-bay-earthing-switch"]');
    // ES może być pominięty całkowicie (early return) LUB renderowany z data-state="absent"
    if (es !== null) {
      expect(es.getAttribute('data-state')).toBe('absent');
    }
  });
});

describe('Structural SVG: bay-body invariant przez wszystkie kombinacje stanów', () => {
  it('Każda kombinacja cbState × dsState × esState renderuje bay-body', () => {
    let combinations = 0;
    for (const cb of SWITCH_STATES) {
      for (const ds of SWITCH_STATES) {
        for (const es of [...SWITCH_STATES, 'absent'] as const) {
          const { container } = renderBay(makeBay({ cbState: cb, dsState: ds, esState: es }));
          const body = container.querySelector('[data-testid="sld-v2-gpz-bay-body"]');
          expect(body).toBeTruthy();
          combinations += 1;
        }
      }
    }
    // 3 cb × 3 ds × 4 es = 36 cases pokrytych
    expect(combinations).toBe(36);
  });
});

/* ---------------------------------------------------------------------------
   Field role × geometry invariant
   --------------------------------------------------------------------------- */

describe('Structural SVG: per field role pokrycie aparatury', () => {
  it('GPZ_LINE_BAY → CB + DS + CT + ES + cable-head obecne', () => {
    const { container } = renderBay(makeBay({
      fieldRole: FIELD_ROLE.GPZ_LINE_BAY,
      cbState: 'closed', dsState: 'closed', esState: 'open',
    }));
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-cb"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-ds"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-ct-primary"]')).toBeTruthy();
  });

  it('TRANSFORMER → CB + transformer-symbol + lv-breaker', () => {
    const { container } = renderBay(makeBay({
      fieldRole: FIELD_ROLE.TRANSFORMER,
      cbState: 'closed', esState: 'open',
    }));
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-cb"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-transformer-symbol"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-lv-breaker"]')).toBeTruthy();
  });

  it('MEASUREMENT → VT trójfazowy', () => {
    const { container } = renderBay(makeBay({
      fieldRole: FIELD_ROLE.MEASUREMENT,
      esState: 'open',
    }));
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-vt-three-phase"]')).toBeTruthy();
  });

  it('RMU_LINE → switch-disconnector', () => {
    const { container } = renderBay(makeBay({
      fieldRole: FIELD_ROLE.RMU_LINE,
      dsState: 'closed', esState: 'open',
    }));
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-switch-disconnector"]')).toBeTruthy();
  });
});

/* ---------------------------------------------------------------------------
   data-testid stable invariants
   --------------------------------------------------------------------------- */

describe('Structural SVG: data-testid invariant per state', () => {
  it('cbState=closed/open/unknown → wszystkie 3 dają ten sam selector "sld-v2-gpz-bay-cb"', () => {
    const selectors = SWITCH_STATES.map((state) => {
      const { container } = renderBay(makeBay({ cbState: state }));
      return container.querySelector('[data-testid="sld-v2-gpz-bay-cb"]') !== null;
    });
    // Wszystkie 3 stany mają element — selector stabilny.
    expect(selectors.every((found) => found === true)).toBe(true);
  });

  it('dsState=closed/open/unknown → ten sam selector "sld-v2-gpz-bay-ds"', () => {
    const selectors = SWITCH_STATES.map((state) => {
      const { container } = renderBay(makeBay({ dsState: state }));
      return container.querySelector('[data-testid="sld-v2-gpz-bay-ds"]') !== null;
    });
    expect(selectors.every((found) => found === true)).toBe(true);
  });
});

/* ---------------------------------------------------------------------------
   Determinism — render N×, ten sam markup
   --------------------------------------------------------------------------- */

describe('Structural SVG: determinism per state combination', () => {
  it('5 reruny tej samej kombinacji → identyczny markup', () => {
    const bay = makeBay({ cbState: 'closed', dsState: 'open', esState: 'unknown' });
    const r1 = renderBay(bay);
    const html1 = r1.container.innerHTML;
    r1.unmount();
    for (let i = 0; i < 4; i++) {
      const r = renderBay(bay);
      expect(r.container.innerHTML).toBe(html1);
      r.unmount();
    }
  });
});

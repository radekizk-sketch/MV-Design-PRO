/**
 * Phase 0A — GpzRenderer: kanoniczny minimalny blok stacyjny GPZ.
 *
 * Reguła operator-grade: GPZ na LOD 0 NIE jest etykietowanym kafelkiem 200×80.
 * Renderer pokazuje tor 110 kV → TR → szyny SN → odpływy SN.
 */

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { GpzRenderer } from '../GpzRenderer';
import { COLOR_SELECTION } from '../../theme/tokens';

function r(id: string, overrides: Partial<Parameters<typeof GpzRenderer>[0]> = {}) {
  return render(
    <svg>
      <GpzRenderer
        id={id}
        x={0}
        y={0}
        name="GPZ Test"
        voltageHighKv={110}
        voltageLowKv={15}
        {...overrides}
      />
    </svg>,
  );
}

describe('GpzRenderer — back-compat data attrs', () => {
  it('zachowuje data-testid sld-v2-gpz-<id>', () => {
    const { container } = r('gpz-1');
    expect(container.querySelector('[data-testid="sld-v2-gpz-gpz-1"]')).not.toBeNull();
  });

  it('zachowuje data-element-kind="gpz_block"', () => {
    const { container } = r('gpz-1');
    expect(container.querySelector('[data-element-kind="gpz_block"]')).not.toBeNull();
  });
});

describe('GpzRenderer — kanoniczna struktura stacyjna', () => {
  it('renderuje tor 110 kV (HV feed)', () => {
    const { container } = r('gpz-1');
    expect(container.querySelector('[data-testid="sld-v2-gpz-hv-feed"]')).not.toBeNull();
  });

  it('renderuje co najmniej jeden symbol transformatora 110/SN', () => {
    const { container } = r('gpz-1');
    const transformers = container.querySelectorAll('[data-testid="sld-v2-gpz-transformer-symbol"]');
    expect(transformers.length).toBeGreaterThanOrEqual(1);
  });

  it('renderuje co najmniej jedną szynę SN (sekcja I)', () => {
    const { container } = r('gpz-1');
    expect(container.querySelector('[data-testid="sld-v2-gpz-sn-bus-0"]')).not.toBeNull();
  });

  it('renderuje co najmniej jedno pole odpływowe SN', () => {
    const { container } = r('gpz-1');
    expect(container.querySelector('[data-testid="sld-v2-gpz-outgoing-bay-0"]')).not.toBeNull();
  });

  it('renderuje napis "Zasilanie 110 kV"', () => {
    const { container } = r('gpz-1');
    const text = container.textContent ?? '';
    expect(text).toContain('Zasilanie 110 kV');
  });

  it('LOD0 skraca długą nazwę GPZ z kodem technicznym do czytelnego oznaczenia', () => {
    const { container, queryByText, getByText } = r('gpz-a', {
      name: 'GPZ-A Główny 110/15 kV (K30)',
    });
    const root = container.querySelector('[data-testid="sld-v2-gpz-gpz-a"]');
    expect(getByText('GPZ-A')).toBeTruthy();
    expect(queryByText('GPZ-A Główny 110/15 kV (K30)')).toBeNull();
    expect(root?.getAttribute('data-gpz-name')).toBe('GPZ-A Główny 110/15 kV (K30)');
  });
});

describe('GpzRenderer — countery sterują geometrią', () => {
  it('outgoingBayCount=8 → 8 odpływowych slotów', () => {
    const { container } = r('gpz-1', { outgoingBayCount: 8 });
    const bays = container.querySelectorAll('[data-testid^="sld-v2-gpz-outgoing-bay-"]');
    expect(bays.length).toBe(8);
  });

  it('mvSectionCount=2 → 2 szyny SN', () => {
    const { container } = r('gpz-1', { mvSectionCount: 2 });
    expect(container.querySelector('[data-testid="sld-v2-gpz-sn-bus-0"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-gpz-sn-bus-1"]')).not.toBeNull();
  });

  it('transformerCount=2 → 2 symbole TR', () => {
    const { container } = r('gpz-1', { transformerCount: 2 });
    const transformers = container.querySelectorAll('[data-testid="sld-v2-gpz-transformer-symbol"]');
    expect(transformers.length).toBe(2);
  });

  it('domyślnie ≥ 1 TR + ≥ 1 sekcja + ≥ 1 odpływ', () => {
    const { container } = r('gpz-1');
    expect(container.querySelectorAll('[data-testid="sld-v2-gpz-transformer-symbol"]').length).toBeGreaterThanOrEqual(1);
    expect(container.querySelector('[data-testid="sld-v2-gpz-sn-bus-0"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid^="sld-v2-gpz-outgoing-bay-"]').length).toBeGreaterThanOrEqual(1);
  });

  it('feedersCount używane gdy outgoingBayCount nie podany', () => {
    const { container } = r('gpz-1', { feedersCount: 6 });
    const bays = container.querySelectorAll('[data-testid^="sld-v2-gpz-outgoing-bay-"]');
    expect(bays.length).toBe(6);
  });
});

describe('GpzRenderer — kolor zaznaczenia z tokenu (nie hardkod)', () => {
  it('selected=true → stroke = COLOR_SELECTION token', () => {
    const { container } = r('gpz-1', { selected: true });
    const root = container.querySelector('[data-testid="sld-v2-gpz-gpz-1"]');
    expect(root).not.toBeNull();
    const corpus = root!.querySelector('rect');
    expect(corpus?.getAttribute('stroke')).toBe(COLOR_SELECTION);
  });
});

describe('GpzRenderer — diagnostyczne stany', () => {
  it('invalid=true → diagnostic badge (czerwony)', () => {
    const { container } = r('gpz-1', { invalid: true });
    const badge = container.querySelector('[data-testid="sld-v2-gpz-diagnostic-badge"]');
    expect(badge).not.toBeNull();
    expect(badge!.getAttribute('data-diagnostic-color')).toBe('#FF333D');
  });

  it('stale=true bez invalid → diagnostic badge (żółty)', () => {
    const { container } = r('gpz-1', { stale: true });
    const badge = container.querySelector('[data-testid="sld-v2-gpz-diagnostic-badge"]');
    expect(badge).not.toBeNull();
    expect(badge!.getAttribute('data-diagnostic-color')).toBe('#FFC857');
  });

  it('invalid przebija stale (czerwony, nie żółty)', () => {
    const { container } = r('gpz-1', { invalid: true, stale: true });
    const badge = container.querySelector('[data-testid="sld-v2-gpz-diagnostic-badge"]');
    expect(badge?.getAttribute('data-diagnostic-color')).toBe('#FF333D');
  });

  it('brak diagnostyki → brak badge', () => {
    const { container } = r('gpz-1');
    expect(container.querySelector('[data-testid="sld-v2-gpz-diagnostic-badge"]')).toBeNull();
  });
});

describe('GpzRenderer — onClick wywołuje callback', () => {
  it('kliknięcie korpusu woła onClick(id)', () => {
    let clickedId: string | null = null;
    const { container } = r('gpz-7', {
      onClick: (id) => {
        clickedId = id;
      },
    });
    const root = container.querySelector('[data-testid="sld-v2-gpz-gpz-7"]') as SVGGElement;
    root?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(clickedId).toBe('gpz-7');
  });
});

describe('GpzRenderer — delegacja do GpzSwitchgearRenderer (LOD ≥ 1)', () => {
  it('lod=2 + sections → renderuje switchgear (a nie compact block)', () => {
    const { container } = r('gpz-1', {
      lod: 2,
      sections: [
        {
          sectionId: 'sec-1',
          order: 1,
          name: 'Sekcja I',
          busVoltageKv: 15,
          bays: [
            { bayRef: 'b-1', fieldRole: 'GPZ_LINE_BAY', designation: 'Q1', hasMissingRequiredDevice: false },
          ],
        },
      ],
      couplers: [],
    });
    expect(container.querySelector('[data-element-kind="gpz_switchgear"]')).not.toBeNull();
    // Compact block NIE jest renderowany.
    expect(container.querySelector('[data-element-kind="gpz_block"]')).toBeNull();
  });

  it('lod=0 + sections → nadal compact block (LOD 0 nie deleguje)', () => {
    const { container } = r('gpz-1', {
      lod: 0,
      sections: [
        {
          sectionId: 'sec-1',
          order: 1,
          name: 'Sekcja I',
          busVoltageKv: 15,
          bays: [],
        },
      ],
    });
    expect(container.querySelector('[data-element-kind="gpz_block"]')).not.toBeNull();
    expect(container.querySelector('[data-element-kind="gpz_switchgear"]')).toBeNull();
  });
});

describe('GpzSwitchgearRenderer — pokazuje 110 kV i transformator nad sekcjami', () => {
  it('lod=1 + sections → renderuje hv-tower z TR symbolem', () => {
    const { container } = r('gpz-1', {
      lod: 1,
      sections: [
        {
          sectionId: 'sec-1',
          order: 1,
          name: 'Sekcja I',
          busVoltageKv: 15,
          bays: [],
        },
      ],
      couplers: [],
    });
    expect(container.querySelector('[data-testid="sld-v2-gpz-switchgear-hv-tower"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-gpz-switchgear-hv-feed"]')).not.toBeNull();
    expect(
      container.querySelector('[data-testid="sld-v2-gpz-switchgear-transformer-symbol"]'),
    ).not.toBeNull();
  });
});

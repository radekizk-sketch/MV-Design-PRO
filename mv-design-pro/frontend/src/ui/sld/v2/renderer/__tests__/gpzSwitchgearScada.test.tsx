/**
 * Phase 0A — GpzSwitchgearRenderer SCADA-grade rendering.
 *
 * Wzorowane na operator-grade ekranach dyspozytorskich (referencje SCADA SN/110 kV).
 * Testujemy strukturę: kolumny pól z aparatami, sprzęgło sekcyjne, TR z Y/Δ,
 * etykiety sekcji, kolorystykę energizacji.
 */

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { GpzSwitchgearRenderer } from '../GpzSwitchgearRenderer';
import { COLOR_DEVICE_CLOSED, COLOR_DEVICE_OPEN } from '../../theme/tokens';
import { FIELD_ROLE } from '../../domain/apparatusContracts';

const DEFAULT_BAYS = [
  {
    bayRef: 'b-1',
    fieldRole: FIELD_ROLE.GPZ_LINE_BAY,
    designation: 'SADY',
    feederName: 'SADY',
    bayNumber: '2',
    hasMissingRequiredDevice: false,
    energization: 'energized' as const,
    cbState: 'closed' as const,
    dsState: 'closed' as const,
  },
  {
    bayRef: 'b-2',
    fieldRole: FIELD_ROLE.GPZ_LINE_BAY,
    designation: 'OKRĘŻNA',
    feederName: 'OKRĘŻNA',
    bayNumber: '4',
    hasMissingRequiredDevice: false,
    energization: 'energized' as const,
    cbState: 'closed' as const,
    dsState: 'closed' as const,
  },
];

function r(overrides: Partial<Parameters<typeof GpzSwitchgearRenderer>[0]> = {}) {
  return render(
    <svg>
      <GpzSwitchgearRenderer
        id="gpz-21"
        x={0}
        y={0}
        name="GPZ-21 KEK"
        voltageHighKv={110}
        voltageLowKv={15}
        sections={[
          {
            sectionId: 'sec-1',
            order: 1,
            name: 'Sekcja I',
            sectionLabel: 'S1',
            busVoltageKv: 15,
            bays: DEFAULT_BAYS,
          },
        ]}
        couplers={[]}
        {...overrides}
      />
    </svg>,
  );
}

describe('GpzSwitchgearRenderer — kolumny pól SCADA-grade', () => {
  it('każde pole ma kolumnę z CB + DS + cable head', () => {
    const { container } = r();
    const bay = container.querySelector('[data-testid="sld-v2-gpz-bay-b-1"]');
    expect(bay).not.toBeNull();
    expect(bay!.querySelector('[data-testid="sld-v2-gpz-bay-cb"]')).not.toBeNull();
    expect(bay!.querySelector('[data-testid="sld-v2-gpz-bay-ds"]')).not.toBeNull();
    expect(bay!.querySelector('[data-testid="sld-v2-gpz-bay-cable-head"]')).not.toBeNull();
  });

  it('numer pola wyświetlany pod kolumną', () => {
    const { container } = r();
    const text = container.textContent ?? '';
    expect(text).toContain('2');
    expect(text).toContain('4');
  });

  it('feeder name w nagłówku kolumny (skrócone do 8 znaków)', () => {
    const { container } = r();
    const text = container.textContent ?? '';
    expect(text).toContain('SADY');
    // OKRĘŻNA ma 7 znaków, więc nie powinna być przycięta.
    expect(text).toContain('OKRĘŻNA');
  });

  it('data-bay-number atrybut zachowany', () => {
    const { container } = r();
    const bay = container.querySelector('[data-bay-number="2"]');
    expect(bay).not.toBeNull();
  });
});

describe('GpzSwitchgearRenderer — koloryzacja stanu energizacji', () => {
  it('energized + closed CB → fill COLOR_DEVICE_CLOSED', () => {
    const { container } = r();
    const cb = container.querySelector('[data-testid="sld-v2-gpz-bay-cb"]') as SVGGElement;
    const rect = cb.querySelector('rect');
    expect(rect?.getAttribute('fill')).toBe(COLOR_DEVICE_CLOSED);
  });

  it('open CB → marker przerwy (czerwona linia w środku)', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1',
          order: 1,
          name: 'Sekcja I',
          sectionLabel: 'S1',
          busVoltageKv: 15,
          bays: [{ ...DEFAULT_BAYS[0], cbState: 'open' as const, energization: 'deenergized' as const }],
        },
      ],
    });
    const cb = container.querySelector('[data-testid="sld-v2-gpz-bay-cb"]');
    expect(cb?.getAttribute('data-state')).toBe('open');
    // Linia przerwy używa COLOR_DEVICE_OPEN
    const lines = cb!.querySelectorAll('line');
    const breakLine = Array.from(lines).find((l) => l.getAttribute('stroke') === COLOR_DEVICE_OPEN);
    expect(breakLine).toBeDefined();
  });

  it('energized atrybut na bay column', () => {
    const { container } = r();
    const bay = container.querySelector('[data-energization="energized"]');
    expect(bay).not.toBeNull();
  });
});

describe('GpzSwitchgearRenderer — etykieta sekcji', () => {
  it('S1 wyświetlana nad pierwszą sekcją', () => {
    const { container } = r();
    expect(container.querySelector('[data-testid="sld-v2-gpz-section-label-sec-1"]')?.textContent).toBe('S1');
  });

  it('domyślna etykieta to S{order} jeśli sectionLabel nie podany', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-99',
          order: 3,
          name: 'Sekcja III',
          busVoltageKv: 15,
          bays: DEFAULT_BAYS,
        },
      ],
    });
    expect(container.querySelector('[data-testid="sld-v2-gpz-section-label-sec-99"]')?.textContent).toBe('S3');
  });
});

describe('GpzSwitchgearRenderer — sprzęgło sekcyjne', () => {
  it('sprzęgło między sekcjami renderuje pole sprzęgła z CB', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1',
          order: 1,
          name: 'Sekcja I',
          sectionLabel: 'S1',
          busVoltageKv: 15,
          bays: DEFAULT_BAYS,
        },
        {
          sectionId: 'sec-2',
          order: 2,
          name: 'Sekcja II',
          sectionLabel: 'S2',
          busVoltageKv: 15,
          bays: DEFAULT_BAYS.map((b) => ({ ...b, bayRef: `${b.bayRef}-s2` })),
        },
      ],
      couplers: [
        {
          couplerId: 'cpl-1',
          leftSectionId: 'sec-1',
          rightSectionId: 'sec-2',
          designation: 'Sprzęgło S1-S2',
          closed: true,
        },
      ],
    });
    const coupler = container.querySelector('[data-testid="sld-v2-gpz-coupler-cpl-1"]');
    expect(coupler).not.toBeNull();
    expect(coupler!.querySelector('[data-testid="sld-v2-gpz-coupler-cb"]')).not.toBeNull();
    expect(coupler!.getAttribute('data-closed')).toBe('true');
  });

  it('otwarte sprzęgło → marker przerwy w CB', () => {
    const { container } = r({
      sections: [
        { sectionId: 'sec-1', order: 1, name: 'Sekcja I', busVoltageKv: 15, bays: DEFAULT_BAYS },
        { sectionId: 'sec-2', order: 2, name: 'Sekcja II', busVoltageKv: 15, bays: DEFAULT_BAYS.map((b) => ({ ...b, bayRef: `${b.bayRef}-s2` })) },
      ],
      couplers: [
        { couplerId: 'cpl-1', leftSectionId: 'sec-1', rightSectionId: 'sec-2', designation: 'Sprzęgło', closed: false },
      ],
    });
    const couplerCb = container.querySelector('[data-testid="sld-v2-gpz-coupler-cb"]');
    expect(couplerCb?.getAttribute('data-state')).toBe('open');
  });
});

describe('GpzSwitchgearRenderer — TR z Y/Δ markers', () => {
  it('domyślnie 1 TR z Y na 110 kV i Δ na SN', () => {
    const { container } = r();
    const tower = container.querySelector('[data-testid="sld-v2-gpz-switchgear-hv-tower"]');
    expect(tower).not.toBeNull();
    expect(tower!.querySelector('[data-testid="sld-v2-gpz-tr-y-marker"]')).not.toBeNull();
    expect(tower!.querySelector('[data-testid="sld-v2-gpz-tr-delta-marker"]')).not.toBeNull();
  });

  it('transformerCount=2 → 2 TR z osobnymi Y/Δ markers', () => {
    const { container } = r({ transformerCount: 2 });
    const tower = container.querySelector('[data-testid="sld-v2-gpz-switchgear-hv-tower"]');
    const yMarkers = tower!.querySelectorAll('[data-testid="sld-v2-gpz-tr-y-marker"]');
    const deltaMarkers = tower!.querySelectorAll('[data-testid="sld-v2-gpz-tr-delta-marker"]');
    expect(yMarkers.length).toBe(2);
    expect(deltaMarkers.length).toBe(2);
  });

  it('TR ma symbol dwóch sprzężonych okręgów (IEC 60617)', () => {
    const { container } = r();
    const tr = container.querySelector('[data-testid="sld-v2-gpz-switchgear-transformer-symbol"]');
    expect(tr).not.toBeNull();
    const circles = tr!.querySelectorAll('circle');
    expect(circles.length).toBeGreaterThanOrEqual(2);
  });
});

describe('GpzSwitchgearRenderer — szyna główna', () => {
  it('renderuje pojedynczą szynę główną SN', () => {
    const { container } = r();
    expect(container.querySelector('[data-testid="sld-v2-gpz-switchgear-main-bus"]')).not.toBeNull();
  });

  it('data-bay-count odzwierciedla liczbę faktycznych pól', () => {
    const { container } = r();
    const root = container.querySelector('[data-element-kind="gpz_switchgear"]');
    expect(root?.getAttribute('data-bay-count')).toBe('2');
  });
});

describe('GpzSwitchgearRenderer — onClickBay', () => {
  it('kliknięcie kolumny pola woła onClickBay(bayRef)', () => {
    let clickedBay: string | null = null;
    const { container } = r({
      onClickBay: (ref) => {
        clickedBay = ref;
      },
    });
    const bay = container.querySelector('[data-testid="sld-v2-gpz-bay-b-1"]') as SVGGElement;
    bay?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(clickedBay).toBe('b-1');
  });
});

describe('GpzSwitchgearRenderer — wieloma sekcjami SCADA-grade (8+8 pól + sprzęgło)', () => {
  it('renderuje 16 pól + 1 sprzęgło bez błędów', () => {
    const baysSection1 = Array.from({ length: 8 }, (_, i) => ({
      bayRef: `b-s1-${i}`,
      fieldRole: FIELD_ROLE.GPZ_LINE_BAY,
      designation: `Pole-${i + 1}`,
      bayNumber: String(2 + i * 2),
      hasMissingRequiredDevice: false,
      energization: 'energized' as const,
      cbState: 'closed' as const,
      dsState: 'closed' as const,
    }));
    const baysSection2 = Array.from({ length: 8 }, (_, i) => ({
      bayRef: `b-s2-${i}`,
      fieldRole: FIELD_ROLE.GPZ_LINE_BAY,
      designation: `Pole-${i + 9}`,
      bayNumber: String(20 + i * 2),
      hasMissingRequiredDevice: false,
      energization: 'energized' as const,
      cbState: 'closed' as const,
      dsState: 'closed' as const,
    }));
    const { container } = r({
      sections: [
        { sectionId: 'sec-1', order: 1, name: 'Sekcja I', sectionLabel: 'S1', busVoltageKv: 15, bays: baysSection1 },
        { sectionId: 'sec-2', order: 2, name: 'Sekcja II', sectionLabel: 'S2', busVoltageKv: 15, bays: baysSection2 },
      ],
      couplers: [
        { couplerId: 'cpl-1', leftSectionId: 'sec-1', rightSectionId: 'sec-2', designation: 'Sprzęgło S1-S2', closed: true },
      ],
    });
    expect(container.querySelectorAll('[data-bay-ref]').length).toBe(16);
    expect(container.querySelector('[data-testid="sld-v2-gpz-coupler-cpl-1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-gpz-section-label-sec-1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-gpz-section-label-sec-2"]')).not.toBeNull();
  });
});

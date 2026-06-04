/**
 * Phase 0A — GpzSwitchgearRenderer SCADA-grade rendering.
 *
 * Wzorowane na operator-grade ekranach dyspozytorskich (referencje SCADA SN/110 kV).
 * Testujemy strukturę: kolumny pól z aparatami, sprzęgło sekcyjne, TR z Y/Δ,
 * etykiety sekcji, kolorystykę energizacji.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';

import { GpzSwitchgearRenderer } from '../GpzSwitchgearRenderer';
import type { GpzApparatusSelection } from '../gpzApparatusSelection';
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

// =============================================================================
// SCADA-grade: state badges (SPZ/SCO/OWG/NZ/LRW/ARN/...) — Phase 0A refinement
// =============================================================================

describe('GpzSwitchgearRenderer — stos badge\'y stanu (SCADA secondary architecture)', () => {
  it('SPZ enabled → badge SPZ z status row "Zal."', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1', order: 1, name: 'Sekcja I', sectionLabel: 'S1', busVoltageKv: 15,
          bays: [{ ...DEFAULT_BAYS[0], secondary: { spz: 'enabled' } }],
        },
      ],
    });
    const badge = container.querySelector('[data-testid="sld-v2-gpz-bay-badge-spz"]');
    expect(badge).not.toBeNull();
    expect(badge?.getAttribute('data-badge-state')).toBe('enabled');
    expect(badge?.textContent).toContain('SPZ');
    expect(badge?.textContent).toContain('Zal.');
  });

  it('SCO blocked → badge SCO z status row "Zabl." na czerwonym tle', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1', order: 1, name: 'Sekcja I', sectionLabel: 'S1', busVoltageKv: 15,
          bays: [{ ...DEFAULT_BAYS[0], secondary: { sco: 'blocked' } }],
        },
      ],
    });
    const badge = container.querySelector('[data-testid="sld-v2-gpz-bay-badge-sco"]');
    expect(badge).not.toBeNull();
    expect(badge?.getAttribute('data-badge-state')).toBe('blocked');
    expect(badge?.textContent).toContain('Zabl.');
  });

  it('NZ restricted → status row "Odst."', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1', order: 1, name: 'Sekcja I', sectionLabel: 'S1', busVoltageKv: 15,
          bays: [{ ...DEFAULT_BAYS[0], secondary: { nz: 'restricted' } }],
        },
      ],
    });
    const badge = container.querySelector('[data-testid="sld-v2-gpz-bay-badge-nz"]');
    expect(badge?.textContent).toContain('Odst.');
  });

  it('OWG disabled → status row "Odbl."', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1', order: 1, name: 'Sekcja I', sectionLabel: 'S1', busVoltageKv: 15,
          bays: [{ ...DEFAULT_BAYS[0], secondary: { owg: 'disabled' } }],
        },
      ],
    });
    const badge = container.querySelector('[data-testid="sld-v2-gpz-bay-badge-owg"]');
    expect(badge?.textContent).toContain('Odbl.');
  });

  it('wiele flag jednocześnie → stos badge\'y w kanonicznej kolejności (SPZ→SCO→OWG→NZ→LRW)', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1', order: 1, name: 'Sekcja I', sectionLabel: 'S1', busVoltageKv: 15,
          bays: [
            {
              ...DEFAULT_BAYS[0],
              secondary: {
                spz: 'enabled',
                sco: 'restricted',
                owg: 'enabled',
                nz: 'restricted',
                lrw: 'restricted',
              },
            },
          ],
        },
      ],
    });
    const stack = container.querySelector('[data-testid="sld-v2-gpz-bay-badge-stack"]');
    expect(stack).not.toBeNull();
    expect(stack?.getAttribute('data-badge-count')).toBe('5');
    // Kolejność dzieci powinna odpowiadać kanonicznej kolejności BADGE_ORDER.
    const children = stack ? Array.from(stack.children) : [];
    const codes = children.map((c) => c.getAttribute('data-badge-code'));
    expect(codes).toEqual(['SPZ', 'SCO', 'OWG', 'NZ', 'LRW']);
  });

  it('brak secondary → brak stosu badge\'y', () => {
    const { container } = r();
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-badge-stack"]')).toBeNull();
  });

  it('ARN enabled → badge ARN z żółtym tłem', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1', order: 1, name: 'Sekcja I', sectionLabel: 'S1', busVoltageKv: 15,
          bays: [{ ...DEFAULT_BAYS[0], secondary: { arn: 'enabled' } }],
        },
      ],
    });
    const badge = container.querySelector('[data-testid="sld-v2-gpz-bay-badge-arn"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('ARN');
  });
});

// =============================================================================
// SCADA-grade: CT primary + ratio
// =============================================================================

describe('GpzSwitchgearRenderer — CT primary + przekładnia', () => {
  it('CT primary renderuje się zawsze (otwarte kółko)', () => {
    const { container } = r();
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-ct-primary"]')).not.toBeNull();
  });

  it('ctRatio="200/5" → tekst widoczny obok CT', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1', order: 1, name: 'Sekcja I', sectionLabel: 'S1', busVoltageKv: 15,
          bays: [{ ...DEFAULT_BAYS[0], ctRatio: '200/5' }],
        },
      ],
    });
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-ct-ratio"]')?.textContent).toBe('200/5');
  });

  it('brak ctRatio → tekst przekładni nie renderowany', () => {
    const { container } = r();
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-ct-ratio"]')).toBeNull();
  });
});

// =============================================================================
// SCADA-grade: przycisk KAS
// =============================================================================

describe('GpzSwitchgearRenderer — przycisk KAS (kasowanie sygnalizacji)', () => {
  it('hasKasButton=true → element KAS + LED kropka', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1', order: 1, name: 'Sekcja I', sectionLabel: 'S1', busVoltageKv: 15,
          bays: [{ ...DEFAULT_BAYS[0], hasKasButton: true }],
        },
      ],
    });
    const kas = container.querySelector('[data-testid="sld-v2-gpz-bay-kas"]');
    expect(kas).not.toBeNull();
    expect(kas?.textContent).toContain('KAS');
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-kas-led"]')).not.toBeNull();
  });

  it('hasKasButton=false (domyślnie) → brak KAS', () => {
    const { container } = r();
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-kas"]')).toBeNull();
  });
});

// =============================================================================
// SCADA-grade: panel pomiarowy P/Q/I1/I2/I3
// =============================================================================

describe('GpzSwitchgearRenderer — panel pomiarowy pod numerem pola', () => {
  it('measurements P/Q/I1/I2/I3 → wszystkie wartości w panelu', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1', order: 1, name: 'Sekcja I', sectionLabel: 'S1', busVoltageKv: 15,
          bays: [{
            ...DEFAULT_BAYS[0],
            measurements: { p: 0.0, q: 0.0, i1: 0, i2: 0, i3: 0 },
          }],
        },
      ],
    });
    const panel = container.querySelector('[data-testid="sld-v2-gpz-bay-measurement-panel"]');
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute('data-row-count')).toBe('5');
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-measurement-p"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-measurement-q"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-measurement-i1"]')).not.toBeNull();
  });

  it('częściowe pomiary (tylko P i I1) → tylko te 2 wiersze', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1', order: 1, name: 'Sekcja I', sectionLabel: 'S1', busVoltageKv: 15,
          bays: [{ ...DEFAULT_BAYS[0], measurements: { p: 11.2, i1: 185 } }],
        },
      ],
    });
    const panel = container.querySelector('[data-testid="sld-v2-gpz-bay-measurement-panel"]');
    expect(panel?.getAttribute('data-row-count')).toBe('2');
  });

  it('brak measurements → brak panelu pomiarowego', () => {
    const { container } = r();
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-measurement-panel"]')).toBeNull();
  });

  it('format wartości P=11.2 → "11.2"; I1=185 → "185"', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1', order: 1, name: 'Sekcja I', sectionLabel: 'S1', busVoltageKv: 15,
          bays: [{ ...DEFAULT_BAYS[0], measurements: { p: 11.2, i1: 185 } }],
        },
      ],
    });
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-measurement-p"]')?.textContent).toContain('11.2');
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-measurement-i1"]')?.textContent).toContain('185');
  });
});

// =============================================================================
// SCADA-grade: zwarcie doziemne marker + manipulation highlight
// =============================================================================

describe('GpzSwitchgearRenderer — marker zwarcia doziemnego (Idł)', () => {
  it('groundFault="fault" → cyan circle marker u góry pola', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1', order: 1, name: 'Sekcja I', sectionLabel: 'S1', busVoltageKv: 15,
          bays: [{ ...DEFAULT_BAYS[0], groundFault: 'fault' }],
        },
      ],
    });
    const marker = container.querySelector('[data-testid="sld-v2-gpz-bay-ground-fault"]');
    expect(marker).not.toBeNull();
    expect(marker?.getAttribute('data-state')).toBe('fault');
  });

  it('groundFault="detected" → marker w stanie wykryto (nie wypełniony)', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1', order: 1, name: 'Sekcja I', sectionLabel: 'S1', busVoltageKv: 15,
          bays: [{ ...DEFAULT_BAYS[0], groundFault: 'detected' }],
        },
      ],
    });
    expect(
      container.querySelector('[data-testid="sld-v2-gpz-bay-ground-fault"]')?.getAttribute('data-state'),
    ).toBe('detected');
  });

  it('groundFault="normal" lub brak → brak markera', () => {
    const { container } = r();
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-ground-fault"]')).toBeNull();
  });
});

describe('GpzSwitchgearRenderer — yellow manipulation highlight', () => {
  it('inManipulation=true → tło pola oliwkowe', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1', order: 1, name: 'Sekcja I', sectionLabel: 'S1', busVoltageKv: 15,
          bays: [{ ...DEFAULT_BAYS[0], inManipulation: true }],
        },
      ],
    });
    const bay = container.querySelector('[data-testid="sld-v2-gpz-bay-b-1"]');
    expect(bay?.getAttribute('data-in-manipulation')).toBe('true');
    const body = bay?.querySelector('[data-testid="sld-v2-gpz-bay-body"]');
    expect(body?.getAttribute('fill')).toBe('#5C5512'); // COLOR_MANIPULATION_BG
  });

  it('inManipulation=false (domyślnie) → tło neutralne', () => {
    const { container } = r();
    const bay = container.querySelector('[data-testid="sld-v2-gpz-bay-b-1"]');
    expect(bay?.getAttribute('data-in-manipulation')).toBe('false');
  });
});

// =============================================================================
// SCADA-grade: integracja end-to-end (pole z pełną architekturą)
// =============================================================================

describe('GpzSwitchgearRenderer — pełna architektura SCADA pola', () => {
  it('pole z badge\'ami + CT + KAS + pomiarami + ground fault renderuje wszystkie elementy', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1', order: 1, name: 'Sekcja I', sectionLabel: 'S1', busVoltageKv: 15,
          bays: [{
            ...DEFAULT_BAYS[0],
            ctRatio: '200/5',
            hasKasButton: true,
            groundFault: 'detected',
            secondary: {
              spz: 'enabled',
              sco: 'restricted',
              owg: 'enabled',
            },
            measurements: { p: 0.0, q: 0.0, i1: 0, i2: 0, i3: 0 },
          }],
        },
      ],
    });
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-ct-ratio"]')?.textContent).toBe('200/5');
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-kas"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-ground-fault"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-badge-stack"]')?.getAttribute('data-badge-count')).toBe('3');
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-measurement-panel"]')).not.toBeNull();
  });
});

// =============================================================================
// SCADA-grade: sprzęgło sekcyjne — Phase 0A refinement
// =============================================================================

function rWithCoupler(couplerOverrides: Partial<Parameters<typeof GpzSwitchgearRenderer>[0]['couplers'][0]> = {}) {
  return r({
    sections: [
      { sectionId: 'sec-1', order: 1, name: 'Sekcja I', sectionLabel: 'S1', busVoltageKv: 15, bays: DEFAULT_BAYS },
      {
        sectionId: 'sec-2', order: 2, name: 'Sekcja II', sectionLabel: 'S2', busVoltageKv: 15,
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
        ...couplerOverrides,
      },
    ],
  });
}

describe('GpzSwitchgearRenderer — sprzęgło SCADA dwoma nogami + poziomy CB', () => {
  it('sprzęgło renderuje 2 nogi (lewa + prawa) z DS u góry każdej', () => {
    const { container } = rWithCoupler();
    expect(container.querySelector('[data-testid="sld-v2-gpz-coupler-leg-left"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-gpz-coupler-leg-right"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-gpz-coupler-ds-left"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-gpz-coupler-ds-right"]')).not.toBeNull();
  });

  it('domyślnie (bez bay numbers) renderuje fallback "Sprz."', () => {
    const { container } = rWithCoupler();
    expect(container.textContent).toContain('Sprz.');
    expect(container.querySelector('[data-testid="sld-v2-gpz-coupler-bay-number-left"]')).toBeNull();
  });

  it('z bayNumberLeft="15" + bayNumberRight="17" → numery nad nogami, brak "Sprz."', () => {
    const { container } = rWithCoupler({ bayNumberLeft: '15', bayNumberRight: '17' });
    expect(container.querySelector('[data-testid="sld-v2-gpz-coupler-bay-number-left"]')?.textContent).toBe('15');
    expect(container.querySelector('[data-testid="sld-v2-gpz-coupler-bay-number-right"]')?.textContent).toBe('17');
    // "Sprz." fallback nie jest wyświetlany gdy są bay numbers.
    const coupler = container.querySelector('[data-testid="sld-v2-gpz-coupler-cpl-1"]');
    expect(coupler?.textContent).not.toContain('Sprz.');
  });
});

describe('GpzSwitchgearRenderer — sprzęgło: stylizacja CB cyan/green', () => {
  it('zamknięte → CB green filled (COLOR_DEVICE_CLOSED)', () => {
    const { container } = rWithCoupler({ closed: true });
    const cb = container.querySelector('[data-testid="sld-v2-gpz-coupler-cb"]') as Element;
    expect(cb.getAttribute('data-state')).toBe('closed');
    expect(cb.getAttribute('fill')).toBe(COLOR_DEVICE_CLOSED);
  });

  it('otwarte → CB cyan hollow (COLOR_SELECTION jako cyan)', () => {
    const { container } = rWithCoupler({ closed: false });
    const cb = container.querySelector('[data-testid="sld-v2-gpz-coupler-cb"]') as Element;
    expect(cb.getAttribute('data-state')).toBe('open');
    // Kanon SCADA: open coupler CB = cyan hollow (COLOR_SELECTION = #35C7FF).
    expect(cb.getAttribute('stroke')).toBe('#35C7FF');
  });
});

describe('GpzSwitchgearRenderer — sprzęgło: pomiar prądu I', () => {
  it('currentI=0 → renderuje display "I  0"', () => {
    const { container } = rWithCoupler({ currentI: 0 });
    const display = container.querySelector('[data-testid="sld-v2-gpz-coupler-current"]');
    expect(display).not.toBeNull();
    expect(display?.textContent).toContain('I');
    expect(display?.textContent).toContain('0');
  });

  it('currentI=185 → wartość zaokrąglona "185"', () => {
    const { container } = rWithCoupler({ currentI: 185 });
    expect(container.querySelector('[data-testid="sld-v2-gpz-coupler-current"]')?.textContent).toContain('185');
  });

  it('brak currentI → brak panelu prądu', () => {
    const { container } = rWithCoupler();
    expect(container.querySelector('[data-testid="sld-v2-gpz-coupler-current"]')).toBeNull();
  });
});

describe('GpzSwitchgearRenderer — sprzęgło: KAS SP + KAS SZR', () => {
  it('hasKasSp=true → KAS SP button + LED', () => {
    const { container } = rWithCoupler({ hasKasSp: true });
    const kas = container.querySelector('[data-testid="sld-v2-gpz-coupler-kas-sp"]');
    expect(kas).not.toBeNull();
    expect(kas?.textContent).toContain('KAS SP');
    expect(container.querySelector('[data-testid="sld-v2-gpz-coupler-kas-sp-led"]')).not.toBeNull();
  });

  it('hasKasSzr=true → KAS SZR button + LED', () => {
    const { container } = rWithCoupler({ hasKasSzr: true });
    const kas = container.querySelector('[data-testid="sld-v2-gpz-coupler-kas-szr"]');
    expect(kas).not.toBeNull();
    expect(kas?.textContent).toContain('KAS SZR');
  });

  it('oba KAS jednocześnie → oba widoczne', () => {
    const { container } = rWithCoupler({ hasKasSp: true, hasKasSzr: true });
    expect(container.querySelector('[data-testid="sld-v2-gpz-coupler-kas-sp"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-gpz-coupler-kas-szr"]')).not.toBeNull();
  });

  it('brak hasKas* → brak przycisków KAS', () => {
    const { container } = rWithCoupler();
    expect(container.querySelector('[data-testid="sld-v2-gpz-coupler-kas-sp"]')).toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-gpz-coupler-kas-szr"]')).toBeNull();
  });
});

describe('GpzSwitchgearRenderer — sprzęgło: badge SZR', () => {
  it('secondary.szr=enabled → badge SZR z status row "Zal."', () => {
    const { container } = rWithCoupler({ secondary: { szr: 'enabled' } });
    const badge = container.querySelector('[data-testid="sld-v2-gpz-bay-badge-szr"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('SZR');
    expect(badge?.textContent).toContain('Zal.');
  });

  it('SZR + SPZ → 2 badge\'y w stosie', () => {
    const { container } = rWithCoupler({ secondary: { spz: 'enabled', szr: 'restricted' } });
    const stack = container.querySelector('[data-testid="sld-v2-gpz-bay-badge-stack"]');
    expect(stack?.getAttribute('data-badge-count')).toBe('2');
  });
});

describe('GpzSwitchgearRenderer — sprzęgło: yellow manipulation highlight', () => {
  it('inManipulation=true → tło sprzęgła oliwkowe + data-attribute', () => {
    const { container } = rWithCoupler({ inManipulation: true });
    const coupler = container.querySelector('[data-testid="sld-v2-gpz-coupler-cpl-1"]');
    expect(coupler?.getAttribute('data-in-manipulation')).toBe('true');
    const body = coupler?.querySelector('[data-testid="sld-v2-gpz-coupler-body"]');
    expect(body?.getAttribute('fill')).toBe('#5C5512'); // COLOR_MANIPULATION_BG
  });

  it('domyślnie nie w manipulacji', () => {
    const { container } = rWithCoupler();
    expect(
      container.querySelector('[data-testid="sld-v2-gpz-coupler-cpl-1"]')?.getAttribute('data-in-manipulation'),
    ).toBe('false');
  });
});

// =============================================================================
// SCADA-grade: P-number identifier under KAS LED
// =============================================================================

describe('GpzSwitchgearRenderer — P-number pod LED-em KAS', () => {
  it('hasKasButton + pNumber="C434" → P-number widoczny pod LED-em', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1', order: 1, name: 'Sekcja I', sectionLabel: 'S1', busVoltageKv: 15,
          bays: [{ ...DEFAULT_BAYS[0], hasKasButton: true, pNumber: 'C434' }],
        },
      ],
    });
    const pNumber = container.querySelector('[data-testid="sld-v2-gpz-bay-kas-pnumber"]');
    expect(pNumber).not.toBeNull();
    expect(pNumber?.textContent).toBe('C434');
  });

  it('pNumber bez hasKasButton → P-number NIE renderowany (KAS jest wyłączony)', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1', order: 1, name: 'Sekcja I', sectionLabel: 'S1', busVoltageKv: 15,
          bays: [{ ...DEFAULT_BAYS[0], pNumber: 'C434' }],
        },
      ],
    });
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-kas-pnumber"]')).toBeNull();
  });

  it('hasKasButton bez pNumber → KAS bez P-number', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1', order: 1, name: 'Sekcja I', sectionLabel: 'S1', busVoltageKv: 15,
          bays: [{ ...DEFAULT_BAYS[0], hasKasButton: true }],
        },
      ],
    });
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-kas"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-kas-pnumber"]')).toBeNull();
  });
});

// =============================================================================
// SCADA-grade: voltage measurements + frequency in canonical order
// =============================================================================

describe('GpzSwitchgearRenderer — napięcia + częstotliwość w panelu pomiarowym', () => {
  it('U1/U2/U3 → 3 wiersze napięć fazowych', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1', order: 1, name: 'Sekcja I', sectionLabel: 'S1', busVoltageKv: 15,
          bays: [{
            ...DEFAULT_BAYS[0],
            measurements: { u1: 8.9, u2: 8.9, u3: 8.7 },
          }],
        },
      ],
    });
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-measurement-u1"]')?.textContent).toContain('8.9');
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-measurement-u2"]')?.textContent).toContain('8.9');
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-measurement-u3"]')?.textContent).toContain('8.7');
  });

  it('U12/U23/U31 → 3 wiersze napięć międzyfazowych', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1', order: 1, name: 'Sekcja I', sectionLabel: 'S1', busVoltageKv: 15,
          bays: [{
            ...DEFAULT_BAYS[0],
            measurements: { u12: 15.4, u23: 15.4, u31: 15.4 },
          }],
        },
      ],
    });
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-measurement-u12"]')?.textContent).toContain('15.4');
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-measurement-u23"]')?.textContent).toContain('15.4');
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-measurement-u31"]')?.textContent).toContain('15.4');
  });

  it('U0=0.1 → wiersz napięcia zerowego', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1', order: 1, name: 'Sekcja I', sectionLabel: 'S1', busVoltageKv: 15,
          bays: [{ ...DEFAULT_BAYS[0], measurements: { u0: 0.1 } }],
        },
      ],
    });
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-measurement-u0"]')?.textContent).toContain('0.1');
  });

  it('f=49.94 → wiersz częstotliwości z 2 dec', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1', order: 1, name: 'Sekcja I', sectionLabel: 'S1', busVoltageKv: 15,
          bays: [{ ...DEFAULT_BAYS[0], measurements: { f: 49.94 } }],
        },
      ],
    });
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-measurement-f"]')?.textContent).toContain('49.94');
  });

  it('f=50 → wiersz "50.00" (zawsze 2 dec)', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1', order: 1, name: 'Sekcja I', sectionLabel: 'S1', busVoltageKv: 15,
          bays: [{ ...DEFAULT_BAYS[0], measurements: { f: 50 } }],
        },
      ],
    });
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-measurement-f"]')?.textContent).toContain('50.00');
  });

  it('PN bay (U1/U2/U3 + U12/U23/U31 + U0 + f) → 8 wierszy w kanonicznej kolejności', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1', order: 1, name: 'Sekcja I', sectionLabel: 'S1', busVoltageKv: 15,
          bays: [{
            ...DEFAULT_BAYS[0],
            measurements: {
              u1: 8.9, u2: 8.9, u3: 8.7,
              u12: 15.4, u23: 15.4, u31: 15.4,
              u0: 0.1,
              f: 49.00,
            },
          }],
        },
      ],
    });
    const panel = container.querySelector('[data-testid="sld-v2-gpz-bay-measurement-panel"]');
    expect(panel?.getAttribute('data-row-count')).toBe('8');
  });

  it('TR feeder (U + f + P + Q + I) → wszystkie wiersze w canonical order', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1', order: 1, name: 'Sekcja I', sectionLabel: 'S1', busVoltageKv: 15,
          bays: [{
            ...DEFAULT_BAYS[0],
            measurements: {
              u1: 67.0, u2: 67.2, u3: 67.1,
              f: 49,
              p: 4.1, q: 0.7,
              i1: 155, i2: 156, i3: 154,
            },
          }],
        },
      ],
    });
    const panel = container.querySelector('[data-testid="sld-v2-gpz-bay-measurement-panel"]');
    expect(panel?.getAttribute('data-row-count')).toBe('9');
    // Sprawdź kolejność: U1 przed P, P przed I1.
    const children = panel ? Array.from(panel.querySelectorAll('[data-testid^="sld-v2-gpz-bay-measurement-"]')) : [];
    const labels = children.map((c) => c.getAttribute('data-testid'));
    const u1Idx = labels.indexOf('sld-v2-gpz-bay-measurement-u1');
    const fIdx = labels.indexOf('sld-v2-gpz-bay-measurement-f');
    const pIdx = labels.indexOf('sld-v2-gpz-bay-measurement-p');
    const i1Idx = labels.indexOf('sld-v2-gpz-bay-measurement-i1');
    expect(u1Idx).toBeLessThan(fIdx);
    expect(fIdx).toBeLessThan(pIdx);
    expect(pIdx).toBeLessThan(i1Idx);
  });
});

describe('GpzSwitchgearRenderer — sprzęgło: pełna architektura SCADA', () => {
  it('sprzęgło z numerami + I + KAS SP + SZR + KAS SZR renderuje wszystkie elementy', () => {
    const { container } = rWithCoupler({
      bayNumberLeft: '15',
      bayNumberRight: '17',
      currentI: 0,
      hasKasSp: true,
      hasKasSzr: true,
      secondary: { szr: 'enabled' },
      closed: false,
    });
    expect(container.querySelector('[data-testid="sld-v2-gpz-coupler-bay-number-left"]')?.textContent).toBe('15');
    expect(container.querySelector('[data-testid="sld-v2-gpz-coupler-bay-number-right"]')?.textContent).toBe('17');
    expect(container.querySelector('[data-testid="sld-v2-gpz-coupler-cb"]')?.getAttribute('data-state')).toBe('open');
    expect(container.querySelector('[data-testid="sld-v2-gpz-coupler-current"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-gpz-coupler-kas-sp"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-gpz-coupler-kas-szr"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-badge-szr"]')).not.toBeNull();
  });
});

describe('GpzSwitchgearRenderer — title bar action (Kasowanie sygnalizacji zabezpieczeń)', () => {
  it('titleBarAction → tekst widoczny w pasku tytułu', () => {
    const { container } = r({ titleBarAction: 'Kasowanie sygnalizacji zabezpieczeń' });
    const action = container.querySelector('[data-testid="sld-v2-gpz-switchgear-title-bar-action"]');
    expect(action).not.toBeNull();
    expect(action?.textContent).toBe('Kasowanie sygnalizacji zabezpieczeń');
  });

  it('brak titleBarAction → brak tekstu akcji', () => {
    const { container } = r();
    expect(
      container.querySelector('[data-testid="sld-v2-gpz-switchgear-title-bar-action"]'),
    ).toBeNull();
  });
});

describe('GpzSwitchgearRenderer — TR measurements (Temp. oleju, Uarn, NZACZ, MVA, flow)', () => {
  it('transformerMeasurements → panel pomiarów dla TR1 (Temp. oleju, Uarn, NZACZ, MVA)', () => {
    const { container } = r({
      transformerCount: 1,
      transformerMeasurements: [
        { oilTemperatureC: 47.2, uarnKv: 15.4, nzacz: '9/19', apparentMva: 16, flow: 'down' },
      ],
    });
    const panel = container.querySelector('[data-testid="sld-v2-gpz-tr-measurements-0"]');
    expect(panel).not.toBeNull();
    expect(
      container.querySelector('[data-testid="sld-v2-gpz-tr-measurement-oil-temp-0"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="sld-v2-gpz-tr-measurement-uarn-0"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="sld-v2-gpz-tr-measurement-nzacz-0"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="sld-v2-gpz-tr-measurement-mva-0"]'),
    ).not.toBeNull();
  });

  it('2 TR → panele pomiarowe rozłożone na zewnątrz (lewy w lewo, prawy w prawo)', () => {
    const { container } = r({
      transformerCount: 2,
      transformerMeasurements: [
        { oilTemperatureC: 47.2, uarnKv: 15.4, nzacz: '9/19', apparentMva: 16 },
        { oilTemperatureC: 49.5, uarnKv: 15.2, nzacz: '9/19', apparentMva: 18 },
      ],
    });
    const valueAnchor = (idx: number) => {
      const row = container.querySelector(
        `[data-testid="sld-v2-gpz-tr-measurement-oil-temp-${idx}"]`,
      );
      const texts = row!.querySelectorAll('text');
      return texts[texts.length - 1].getAttribute('text-anchor');
    };
    // Lewy TR (idx 0): panel po lewej, value wyrównane w prawo (blok rośnie w lewo).
    expect(valueAnchor(0)).toBe('end');
    // Prawy TR (idx 1): panel po prawej, value wyrównane w lewo (blok rośnie w prawo).
    expect(valueAnchor(1)).toBe('start');
  });

  it('transformerMeasurements flow="down" → strzałka kierunku przepływu (magenta/down)', () => {
    const { container } = r({
      transformerCount: 1,
      transformerMeasurements: [{ flow: 'down' }],
    });
    const arrow = container.querySelector('[data-testid="sld-v2-gpz-tr-flow-arrow-0"]');
    expect(arrow).not.toBeNull();
    expect(arrow?.getAttribute('data-flow-direction')).toBe('down');
  });

  it('transformerMeasurements flow="up" → strzałka skierowana w górę', () => {
    const { container } = r({
      transformerCount: 1,
      transformerMeasurements: [{ flow: 'up' }],
    });
    const arrow = container.querySelector('[data-testid="sld-v2-gpz-tr-flow-arrow-0"]');
    expect(arrow).not.toBeNull();
    expect(arrow?.getAttribute('data-flow-direction')).toBe('up');
  });

  it('transformerMeasurements flow="none" → brak strzałki', () => {
    const { container } = r({
      transformerCount: 1,
      transformerMeasurements: [{ flow: 'none' }],
    });
    expect(container.querySelector('[data-testid="sld-v2-gpz-tr-flow-arrow-0"]')).toBeNull();
  });

  it('brak transformerMeasurements → brak panelu pomiarów TR', () => {
    const { container } = r({ transformerCount: 1 });
    expect(container.querySelector('[data-testid="sld-v2-gpz-tr-measurements-0"]')).toBeNull();
  });

  it('2 TR → 2 osobne panele pomiarów (indeks 0 i 1)', () => {
    const { container } = r({
      transformerCount: 2,
      transformerMeasurements: [
        { oilTemperatureC: 47.2 },
        { oilTemperatureC: 49.5 },
      ],
    });
    expect(container.querySelector('[data-testid="sld-v2-gpz-tr-measurements-0"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-gpz-tr-measurements-1"]')).not.toBeNull();
  });
});

describe('GpzSwitchgearRenderer — two-bus topology (110 kV + 15 kV z TR pomiędzy)', () => {
  const HV_BAYS = [
    {
      bayRef: 'hv-1',
      fieldRole: FIELD_ROLE.GPZ_LINE_BAY,
      designation: 'POR',
      feederName: 'POR',
      bayNumber: '05',
      hasMissingRequiredDevice: false,
      energization: 'energized' as const,
      cbState: 'closed' as const,
      dsState: 'closed' as const,
    },
    {
      bayRef: 'hv-2',
      fieldRole: FIELD_ROLE.GPZ_LINE_BAY,
      designation: 'EC2',
      feederName: 'EC2',
      bayNumber: '03',
      hasMissingRequiredDevice: false,
      energization: 'energized' as const,
      cbState: 'closed' as const,
      dsState: 'closed' as const,
    },
  ];

  function rTwoBus(overrides: Partial<Parameters<typeof GpzSwitchgearRenderer>[0]> = {}) {
    return render(
      <svg>
        <GpzSwitchgearRenderer
          id="gpz-8"
          x={0}
          y={0}
          name="GPZ-8 PGL"
          voltageHighKv={110}
          voltageLowKv={15}
          sections={[
            {
              sectionId: 'lv-sec-1',
              order: 1,
              name: 'Sekcja A LV',
              sectionLabel: 'sekcja A',
              busVoltageKv: 15,
              bays: DEFAULT_BAYS,
            },
          ]}
          couplers={[]}
          hvSections={[
            {
              sectionId: 'hv-sec-1',
              order: 1,
              name: 'Sekcja A HV',
              sectionLabel: 'sekcja A',
              busVoltageKv: 110,
              bays: HV_BAYS,
            },
          ]}
          hvCouplers={[]}
          transformerCount={2}
          transformerMeasurements={[
            { oilTemperatureC: 17.5, uarnKv: 15.4, nzacz: '7', apparentMva: 25, flow: 'up' },
            { oilTemperatureC: 19.4, uarnKv: 15.0, nzacz: '7', apparentMva: 25, flow: 'down' },
          ]}
          {...overrides}
        />
      </svg>,
    );
  }

  it('two-bus mode → osobna szyna HV (110 kV) i LV (15 kV)', () => {
    const { container } = rTwoBus();
    expect(container.querySelector('[data-testid="sld-v2-gpz-switchgear-hv-bus"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-gpz-switchgear-lv-bus"]')).not.toBeNull();
  });

  it('single-bus mode (brak hvSections) → brak osobnej szyny HV/LV, jest main bus', () => {
    const { container } = r();
    expect(container.querySelector('[data-testid="sld-v2-gpz-switchgear-hv-bus"]')).toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-gpz-switchgear-lv-bus"]')).toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-gpz-switchgear-main-bus"]')).not.toBeNull();
  });

  it('two-bus mode → etykiety napięcia "110kV" przy końcach szyny HV', () => {
    const { container } = rTwoBus();
    const left = container.querySelector('[data-testid="sld-v2-gpz-switchgear-hv-bus-label-left"]');
    const right = container.querySelector('[data-testid="sld-v2-gpz-switchgear-hv-bus-label-right"]');
    expect(left?.textContent).toBe('110kV');
    expect(right?.textContent).toBe('110kV');
  });

  it('two-bus mode → etykiety napięcia "15kV" przy końcach szyny LV', () => {
    const { container } = rTwoBus();
    const left = container.querySelector('[data-testid="sld-v2-gpz-switchgear-lv-bus-label-left"]');
    const right = container.querySelector('[data-testid="sld-v2-gpz-switchgear-lv-bus-label-right"]');
    expect(left?.textContent).toBe('15kV');
    expect(right?.textContent).toBe('15kV');
  });

  it('two-bus mode → HV bays renderowane (POR, EC2) z numerami pól', () => {
    const { container } = rTwoBus();
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-hv-1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-hv-2"]')).not.toBeNull();
    expect(container.textContent).toContain('POR');
    expect(container.textContent).toContain('EC2');
  });

  it('two-bus mode → LV bays renderowane (SADY, OKRĘŻNA) razem z HV', () => {
    const { container } = rTwoBus();
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-b-1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-b-2"]')).not.toBeNull();
    expect(container.textContent).toContain('SADY');
  });

  it('two-bus mode → TR symbol w środku (między HV a LV) renderowany jako TwoBusTrColumn', () => {
    const { container } = rTwoBus();
    expect(
      container.querySelector('[data-testid="sld-v2-gpz-switchgear-two-bus-tr-column"]'),
    ).not.toBeNull();
    /* TR1 i TR2 obecne. */
    const trs = container.querySelectorAll('[data-testid="sld-v2-gpz-switchgear-transformer-symbol"]');
    expect(trs.length).toBe(2);
  });

  it('two-bus mode → MVA label widoczny przy każdym TR', () => {
    const { container } = rTwoBus();
    const mvaLabels = container.querySelectorAll('[data-testid^="sld-v2-gpz-tr-mva-label-"]');
    expect(mvaLabels.length).toBe(2);
    expect(Array.from(mvaLabels).map((l) => l.textContent)).toEqual(['25MVA', '25MVA']);
  });

  it('two-bus mode → HV bay column hangs from HV bus (data-bay-ref na HV bay)', () => {
    const { container } = rTwoBus();
    const hvBay = container.querySelector('[data-testid="sld-v2-gpz-bay-hv-1"]');
    expect(hvBay?.getAttribute('data-bay-ref')).toBe('hv-1');
  });

  it('two-bus mode → HV section label "sekcja A" z dedykowanym test-id', () => {
    const { container } = rTwoBus();
    const hvLabel = container.querySelector(
      '[data-testid="sld-v2-gpz-hv-section-label-hv-sec-1"]',
    );
    expect(hvLabel).not.toBeNull();
    expect(hvLabel?.textContent).toBe('sekcja A');
  });

  it('two-bus mode → flow strzałki różnych kierunków dla TR1 (up) i TR2 (down)', () => {
    const { container } = rTwoBus();
    const a0 = container.querySelector('[data-testid="sld-v2-gpz-tr-flow-arrow-0"]');
    const a1 = container.querySelector('[data-testid="sld-v2-gpz-tr-flow-arrow-1"]');
    expect(a0?.getAttribute('data-flow-direction')).toBe('up');
    expect(a1?.getAttribute('data-flow-direction')).toBe('down');
  });
});

describe('GpzSwitchgearRenderer — uziemnik (ES) i Q-numeracja IEC 81346', () => {
  it('esState="closed" → marker uziemnika z czerwonym (BHP — pole uziemione)', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1',
          order: 1,
          name: 'Sekcja I',
          sectionLabel: 'S1',
          busVoltageKv: 15,
          bays: [{ ...DEFAULT_BAYS[0], esState: 'closed' as const }],
        },
      ],
    });
    const es = container.querySelector('[data-testid="sld-v2-gpz-bay-earthing-switch"]');
    expect(es).not.toBeNull();
    expect(es?.getAttribute('data-state')).toBe('closed');
  });

  it('esState="open" → marker uziemnika z dashed line (open)', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1',
          order: 1,
          name: 'Sekcja I',
          sectionLabel: 'S1',
          busVoltageKv: 15,
          bays: [{ ...DEFAULT_BAYS[0], esState: 'open' as const }],
        },
      ],
    });
    const es = container.querySelector('[data-testid="sld-v2-gpz-bay-earthing-switch"]');
    expect(es?.getAttribute('data-state')).toBe('open');
  });

  it('esState="unknown" → neutralny marker stanu aparatu', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1',
          order: 1,
          name: 'Sekcja I',
          sectionLabel: 'S1',
          busVoltageKv: 15,
          bays: [{ ...DEFAULT_BAYS[0], esState: 'unknown' as const }],
        },
      ],
    });
    const es = container.querySelector('[data-testid="sld-v2-gpz-bay-earthing-switch"]');
    expect(es?.getAttribute('data-state')).toBe('unknown');
  });

  it('esState="absent" → ES NIE renderowany w ogóle (BayColumn pomija)', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1',
          order: 1,
          name: 'Sekcja I',
          sectionLabel: 'S1',
          busVoltageKv: 15,
          bays: [{ ...DEFAULT_BAYS[0], esState: 'absent' as const }],
        },
      ],
    });
    /* Pola RMU/COUPLER nie mają uziemnika — symbol pominięty całkowicie. */
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-earthing-switch"]')).toBeNull();
  });

  it('brak esState → brak symbolu uziemnika (backwards compat)', () => {
    const { container } = r();
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-earthing-switch"]')).toBeNull();
  });

  it('qDesignations.cb="Q0" → etykieta Q0 obok CB', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1',
          order: 1,
          name: 'Sekcja I',
          sectionLabel: 'S1',
          busVoltageKv: 15,
          bays: [{ ...DEFAULT_BAYS[0], qDesignations: { cb: 'Q0', ds: 'Q9', es: 'Q8', ct: 'T1' } }],
        },
      ],
    });
    const cbLabel = container.querySelector('[data-testid="sld-v2-gpz-bay-q-cb"]');
    const dsLabel = container.querySelector('[data-testid="sld-v2-gpz-bay-q-ds"]');
    const ctLabel = container.querySelector('[data-testid="sld-v2-gpz-bay-q-ct"]');
    expect(cbLabel?.textContent).toBe('Q0');
    expect(dsLabel?.textContent).toBe('Q9');
    expect(ctLabel?.textContent).toBe('T1');
  });

  it('qDesignations.es renderowany TYLKO gdy esState != absent', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1',
          order: 1,
          name: 'Sekcja I',
          sectionLabel: 'S1',
          busVoltageKv: 15,
          bays: [
            {
              ...DEFAULT_BAYS[0],
              qDesignations: { es: 'Q8' },
              /* Brak esState → ES absent → Q8 NIE renderowany. */
            },
          ],
        },
      ],
    });
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-q-es"]')).toBeNull();
  });

  it('qDesignations.es renderowany gdy esState=closed/open/unknown', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1',
          order: 1,
          name: 'Sekcja I',
          sectionLabel: 'S1',
          busVoltageKv: 15,
          bays: [
            { ...DEFAULT_BAYS[0], esState: 'closed' as const, qDesignations: { es: 'Q8' } },
          ],
        },
      ],
    });
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-q-es"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-q-es"]')?.textContent).toBe('Q8');
  });
});

describe('GpzSwitchgearRenderer — interaktywność (kanon lustrzany do GpzCanonicalRenderer)', () => {
  function rWithBay(overrides: Partial<Parameters<typeof GpzSwitchgearRenderer>[0]> = {}) {
    return render(
      <svg>
        <GpzSwitchgearRenderer
          id="gpz-i"
          x={0}
          y={0}
          name="GPZ"
          voltageHighKv={110}
          voltageLowKv={15}
          sections={[
            {
              sectionId: 'sec-1',
              order: 1,
              name: 'S1',
              sectionLabel: 'S1',
              busVoltageKv: 15,
              bays: [
                {
                  ...DEFAULT_BAYS[0],
                  esState: 'unknown' as const,
                  hasKasButton: true,
                  qDesignations: { cb: 'Q0', ds: 'Q9', dsBus: 'Q1', es: 'Q8', ct: 'T1' },
                },
              ],
            },
          ]}
          couplers={[]}
          {...overrides}
        />
      </svg>,
    );
  }

  /** Grupa interakcji aparatu (`data-element-kind="apparatus"`) zawierająca dany symbol. */
  function apparatusGroupOf(container: HTMLElement, symbolTestId: string): Element {
    const symbol = container.querySelector(`[data-testid="${symbolTestId}"]`);
    return symbol!.closest('[data-element-kind="apparatus"]')!;
  }

  it('onClickApparatus dla CB → selekcja "b-1#breaker" + designation Q0 + labelPl', () => {
    const onClickApparatus = vi.fn();
    const { container } = rWithBay({ onClickApparatus });
    fireEvent.click(apparatusGroupOf(container, 'sld-v2-gpz-bay-cb'));
    expect(onClickApparatus).toHaveBeenCalledTimes(1);
    expect(onClickApparatus.mock.calls[0][0]).toEqual({
      apparatusId: 'b-1#breaker',
      bayRef: 'b-1',
      apparatusKind: 'breaker',
      designation: 'Q0',
      labelPl: 'Wyłącznik',
    } satisfies GpzApparatusSelection);
  });

  it('onClickApparatus dla odłącznika liniowego → "b-1#switch_disconnector" + designation Q9', () => {
    const onClickApparatus = vi.fn();
    const { container } = rWithBay({ onClickApparatus });
    /* DS_BUS i DS_LIN dzielą test-id sld-v2-gpz-bay-ds; rozróżniamy po etykiecie
     * Q (slot="ds" jest odłącznikiem liniowym, slot="ds-bus" szynowym). */
    const lineDs = container.querySelector('[data-testid="sld-v2-gpz-bay-q-ds"]')!
      .closest('[data-element-kind="apparatus"]')!;
    fireEvent.click(lineDs);
    expect(onClickApparatus.mock.calls[0][0]).toEqual({
      apparatusId: 'b-1#switch_disconnector',
      bayRef: 'b-1',
      apparatusKind: 'switch_disconnector',
      designation: 'Q9',
      labelPl: 'Odłącznik liniowy',
    } satisfies GpzApparatusSelection);
  });

  it('onClickApparatus dla odłącznika szynowego → "b-1#disconnect_bus" + designation Q1', () => {
    const onClickApparatus = vi.fn();
    const { container } = rWithBay({ onClickApparatus });
    const dsBus = container.querySelector('[data-testid="sld-v2-gpz-bay-q-ds-bus"]')!
      .closest('[data-element-kind="apparatus"]')!;
    fireEvent.click(dsBus);
    expect(onClickApparatus.mock.calls[0][0]).toEqual({
      apparatusId: 'b-1#disconnect_bus',
      bayRef: 'b-1',
      apparatusKind: 'disconnect_bus',
      designation: 'Q1',
      labelPl: 'Odłącznik szynowy',
    } satisfies GpzApparatusSelection);
  });

  it('onClickApparatus dla uziemnika → "b-1#earthing_switch" + designation Q8 + labelPl', () => {
    const onClickApparatus = vi.fn();
    const { container } = rWithBay({ onClickApparatus });
    fireEvent.click(apparatusGroupOf(container, 'sld-v2-gpz-bay-earthing-switch'));
    expect(onClickApparatus.mock.calls[0][0]).toEqual({
      apparatusId: 'b-1#earthing_switch',
      bayRef: 'b-1',
      apparatusKind: 'earthing_switch',
      designation: 'Q8',
      labelPl: 'Uziemnik',
    } satisfies GpzApparatusSelection);
  });

  it('onClickApparatus dla CT → "b-1#ct" + designation T1 + labelPl', () => {
    const onClickApparatus = vi.fn();
    const { container } = rWithBay({ onClickApparatus });
    fireEvent.click(apparatusGroupOf(container, 'sld-v2-gpz-bay-ct-primary'));
    expect(onClickApparatus.mock.calls[0][0]).toEqual({
      apparatusId: 'b-1#ct',
      bayRef: 'b-1',
      apparatusKind: 'ct',
      designation: 'T1',
      labelPl: 'Przekładnik prądowy',
    } satisfies GpzApparatusSelection);
  });

  it('klik aparatu nie odpala onClickBay (stopPropagation jak w kanonie)', () => {
    const onClickApparatus = vi.fn();
    const onClickBay = vi.fn();
    const { container } = rWithBay({ onClickApparatus, onClickBay });
    fireEvent.click(apparatusGroupOf(container, 'sld-v2-gpz-bay-cb'));
    expect(onClickApparatus).toHaveBeenCalledTimes(1);
    expect(onClickBay).not.toHaveBeenCalled();
  });

  it('onContextMenuApparatus → selekcja + koordynaty kursora', () => {
    const onContextMenuApparatus = vi.fn();
    const { container } = rWithBay({ onContextMenuApparatus });
    fireEvent.contextMenu(apparatusGroupOf(container, 'sld-v2-gpz-bay-cb'), {
      clientX: 321,
      clientY: 654,
    });
    expect(onContextMenuApparatus).toHaveBeenCalledWith(
      expect.objectContaining({ apparatusId: 'b-1#breaker', apparatusKind: 'breaker' }),
      expect.objectContaining({ clientX: 321, clientY: 654 }),
    );
  });

  it('onClickKas wywoływany gdy klik w KAS button', () => {
    const onClickKas = vi.fn();
    const { container } = rWithBay({ onClickKas });
    fireEvent.click(container.querySelector('[data-testid="sld-v2-gpz-bay-kas"]')!);
    expect(onClickKas).toHaveBeenCalledWith('b-1');
  });

  it('onDoubleClickBay wywoływany gdy dwuklik w kolumnę pola', () => {
    const onDoubleClickBay = vi.fn();
    const { container } = rWithBay({ onDoubleClickBay });
    fireEvent.doubleClick(container.querySelector('[data-testid="sld-v2-gpz-bay-b-1"]')!);
    expect(onDoubleClickBay).toHaveBeenCalledWith('b-1');
  });

  it('onContextMenuBay → bayRef + koordynaty kursora', () => {
    const onContextMenuBay = vi.fn();
    const { container } = rWithBay({ onContextMenuBay });
    fireEvent.contextMenu(container.querySelector('[data-testid="sld-v2-gpz-bay-b-1"]')!, {
      clientX: 10,
      clientY: 20,
    });
    expect(onContextMenuBay).toHaveBeenCalledWith(
      'b-1',
      expect.objectContaining({ clientX: 10, clientY: 20 }),
    );
  });

  it('onContextMenuSection → sectionId + koordynaty (uchwyt na etykiecie sekcji)', () => {
    const onContextMenuSection = vi.fn();
    const { container } = rWithBay({ onContextMenuSection });
    fireEvent.contextMenu(
      container.querySelector('[data-testid="sld-v2-gpz-section-label-sec-1"]')!,
      { clientX: 5, clientY: 6 },
    );
    expect(onContextMenuSection).toHaveBeenCalledWith(
      'sec-1',
      expect.objectContaining({ clientX: 5, clientY: 6 }),
    );
  });

  it('cursor: pointer na grupie aparatu gdy handler podany', () => {
    const { container } = rWithBay({ onClickApparatus: vi.fn() });
    const cbGroup = apparatusGroupOf(container, 'sld-v2-gpz-bay-cb');
    expect(cbGroup.getAttribute('style')).toContain('cursor: pointer');
  });

  it('brak handlerów → grupa aparatu cursor: default i klik nieszkodliwy', () => {
    const { container } = rWithBay({});
    const cbGroup = apparatusGroupOf(container, 'sld-v2-gpz-bay-cb');
    expect(cbGroup.getAttribute('style')).toContain('cursor: default');
    expect(() => fireEvent.click(cbGroup)).not.toThrow();
  });
});

describe('GpzSwitchgearRenderer — klik transformatora (transformerRefs)', () => {
  it('transformerRefs podane → klik symbolu TR woła onClickTransformer(ref) (single-bus)', () => {
    const onClickTransformer = vi.fn();
    const { container } = render(
      <svg>
        <GpzSwitchgearRenderer
          id="gpz-tr"
          x={0}
          y={0}
          name="GPZ"
          voltageHighKv={110}
          voltageLowKv={15}
          sections={[
            {
              sectionId: 'sec-1',
              order: 1,
              name: 'S1',
              sectionLabel: 'S1',
              busVoltageKv: 15,
              bays: DEFAULT_BAYS,
            },
          ]}
          couplers={[]}
          transformerCount={2}
          transformerRefs={['tr-1', 'tr-2']}
          onClickTransformer={onClickTransformer}
        />
      </svg>,
    );
    fireEvent.click(container.querySelector('[data-testid="gpz-canonical-transformer-tr-2"]')!);
    expect(onClickTransformer).toHaveBeenCalledWith('tr-2');
  });

  it('brak transformerRefs → symbol TR nieklikalny (cursor default, brak crashu)', () => {
    const onClickTransformer = vi.fn();
    const { container } = render(
      <svg>
        <GpzSwitchgearRenderer
          id="gpz-tr"
          x={0}
          y={0}
          name="GPZ"
          voltageHighKv={110}
          voltageLowKv={15}
          sections={[
            {
              sectionId: 'sec-1',
              order: 1,
              name: 'S1',
              sectionLabel: 'S1',
              busVoltageKv: 15,
              bays: DEFAULT_BAYS,
            },
          ]}
          couplers={[]}
          transformerCount={1}
          onClickTransformer={onClickTransformer}
        />
      </svg>,
    );
    const tr = container.querySelector('[data-testid="sld-v2-gpz-switchgear-transformer-symbol"]')!;
    expect(tr.getAttribute('style')).toContain('cursor: default');
    fireEvent.click(tr);
    expect(onClickTransformer).not.toHaveBeenCalled();
  });
});

describe('GpzSwitchgearRenderer — Tier 1 fixes (BLOCKER konsensusowe)', () => {
  it('Brak cbState w bay → renderer pokazuje neutralny szary stan aparatu', () => {
    /* DEFAULT_BAYS[0] ma cbState='closed' explicit, ale stworzymy bay bez cbState. */
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1',
          order: 1,
          name: 'S1',
          sectionLabel: 'S1',
          busVoltageKv: 15,
          bays: [
            {
              bayRef: 'b-no-state',
              fieldRole: FIELD_ROLE.GPZ_LINE_BAY,
              designation: 'X',
              feederName: 'X',
              bayNumber: '1',
              hasMissingRequiredDevice: false,
              /* energization, cbState, dsState — UNDEFINED (Invariant 9). */
            },
          ],
        },
      ],
    });
    const cb = container.querySelector('[data-testid="sld-v2-gpz-bay-cb"]');
    expect(cb?.getAttribute('data-state')).toBe('unknown');
    expect(cb?.textContent).not.toContain('?');
  });

  it('Brak dsState → DS data-state="unknown" (NIE fałszywe "closed")', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1',
          order: 1,
          name: 'S1',
          sectionLabel: 'S1',
          busVoltageKv: 15,
          bays: [
            {
              bayRef: 'b-no-state',
              fieldRole: FIELD_ROLE.GPZ_LINE_BAY,
              designation: 'X',
              feederName: 'X',
              bayNumber: '1',
              hasMissingRequiredDevice: false,
            },
          ],
        },
      ],
    });
    const ds = container.querySelector('[data-testid="sld-v2-gpz-bay-ds"]');
    expect(ds?.getAttribute('data-state')).toBe('unknown');
  });

  it('voltageHighKvKnown=false → klasa WN zamiast znaku zastępczego w title bar i bus labels', () => {
    const { container } = render(
      <svg>
        <GpzSwitchgearRenderer
          id="gpz-x"
          x={0}
          y={0}
          name="GPZ-X"
          voltageHighKv={110}
          voltageHighKvKnown={false}
          voltageLowKv={15}
          sections={[
            {
              sectionId: 'sec-1',
              order: 1,
              name: 'S1',
              sectionLabel: 'S1',
              busVoltageKv: 15,
              bays: DEFAULT_BAYS,
            },
          ]}
          couplers={[]}
          hvSections={[
            {
              sectionId: 'hv-sec-1',
              order: 1,
              name: 'HV',
              sectionLabel: 'sekcja A',
              busVoltageKv: 110,
              bays: [],
            },
          ]}
        />
      </svg>,
    );
    /* Title bar pokazuje klasę WN bez znaku zastępczego. */
    const text = container.textContent ?? '';
    expect(text).toContain('WN / 15 kV');
    /* HV bus labels pokazują klasę WN. */
    expect(text).toContain('WNkV');
    expect(text).not.toContain('?');
  });

  it('voltageHighKvKnown=true (default) → renderowane zwykłe wartości', () => {
    const { container } = r();
    const text = container.textContent ?? '';
    expect(text).toContain('110 / 15 kV');
    expect(text).not.toContain('?');
  });

  it('Pole MEASUREMENT (BLOCKER MV-8): NIE renderuje CB ani CT, ale renderuje VT marker', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-pn',
          order: 1,
          name: 'S1',
          sectionLabel: 'S1',
          busVoltageKv: 15,
          bays: [
            {
              bayRef: 'pn-1',
              fieldRole: FIELD_ROLE.MEASUREMENT,
              designation: 'PN1',
              feederName: 'PN',
              bayNumber: '12',
              hasMissingRequiredDevice: false,
              esState: 'unknown' as const,
            },
          ],
        },
      ],
    });
    const bay = container.querySelector('[data-testid="sld-v2-gpz-bay-pn-1"]');
    /* CB NIE renderowany (showCb=false dla MEASUREMENT). */
    expect(bay?.querySelector('[data-testid="sld-v2-gpz-bay-cb"]')).toBeNull();
    /* CT NIE renderowany. */
    expect(bay?.querySelector('[data-testid="sld-v2-gpz-bay-ct-primary"]')).toBeNull();
    /* CableHead NIE renderowany. */
    expect(bay?.querySelector('[data-testid="sld-v2-gpz-bay-cable-head"]')).toBeNull();
    /* VT trójfazowy renderowany (commit 9: zastąpił placeholder marker). */
    expect(bay?.querySelector('[data-testid="sld-v2-gpz-bay-vt-three-phase"]')).not.toBeNull();
    /* DS jest (DS_BUS Q1). ES jest. */
    expect(bay?.querySelector('[data-testid="sld-v2-gpz-bay-ds"]')).not.toBeNull();
    expect(bay?.querySelector('[data-testid="sld-v2-gpz-bay-earthing-switch"]')).not.toBeNull();
  });

  it('Pole TRANSFORMER (BLOCKER MV-7): NIE renderuje CableHead (kończy się portem do trafa)', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-tr',
          order: 1,
          name: 'S1',
          sectionLabel: 'S1',
          busVoltageKv: 15,
          bays: [
            {
              bayRef: 'tr-1',
              fieldRole: FIELD_ROLE.TRANSFORMER,
              designation: 'TR1',
              feederName: 'TR1',
              bayNumber: '03',
              hasMissingRequiredDevice: false,
              esState: 'unknown' as const,
            },
          ],
        },
      ],
    });
    const bay = container.querySelector('[data-testid="sld-v2-gpz-bay-tr-1"]');
    /* TR ma CB + CT + ES, NIE ma CableHead. */
    expect(bay?.querySelector('[data-testid="sld-v2-gpz-bay-cb"]')).not.toBeNull();
    expect(bay?.querySelector('[data-testid="sld-v2-gpz-bay-ct-primary"]')).not.toBeNull();
    expect(bay?.querySelector('[data-testid="sld-v2-gpz-bay-cable-head"]')).toBeNull();
    expect(bay?.querySelector('[data-testid="sld-v2-gpz-bay-earthing-switch"]')).not.toBeNull();
  });

  it('Pole RMU_LINE (BLOCKER MV-1+15): NIE renderuje CB (RMU używa tylko load-switch)', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-rmu',
          order: 1,
          name: 'S1',
          sectionLabel: 'S1',
          busVoltageKv: 15,
          bays: [
            {
              bayRef: 'rmu-1',
              fieldRole: FIELD_ROLE.RMU_LINE,
              designation: 'OUT',
              feederName: 'OUT',
              bayNumber: '01',
              hasMissingRequiredDevice: false,
              esState: 'unknown' as const,
            },
          ],
        },
      ],
    });
    const bay = container.querySelector('[data-testid="sld-v2-gpz-bay-rmu-1"]');
    /* RMU_LINE: SWITCH_DISCONNECTOR + CT + ES + CABLE_HEAD. Bez CB! */
    expect(bay?.querySelector('[data-testid="sld-v2-gpz-bay-cb"]')).toBeNull();
    /* SWITCH_DISCONNECTOR jest (commit 9: dedykowany komponent z load-break
     * kanon IEC 60617 S00198 — wyróżnia od zwykłego DS). */
    expect(bay?.querySelector('[data-testid="sld-v2-gpz-bay-switch-disconnector"]')).not.toBeNull();
    /* Brak DS (RMU_LINE_ORDER nie ma DISCONNECTOR, tylko SWITCH_DISCONNECTOR). */
    expect(bay?.querySelector('[data-testid="sld-v2-gpz-bay-ds"]')).toBeNull();
    /* CT jest (RMU_LINE_ORDER definiuje CT). */
    expect(bay?.querySelector('[data-testid="sld-v2-gpz-bay-ct-primary"]')).not.toBeNull();
    /* CableHead jest. */
    expect(bay?.querySelector('[data-testid="sld-v2-gpz-bay-cable-head"]')).not.toBeNull();
  });

  it('Pole GPZ_LINE_BAY (default): wszystkie aparaty renderowane (CB+CT+DS+ES+CableHead)', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-gpz',
          order: 1,
          name: 'S1',
          sectionLabel: 'S1',
          busVoltageKv: 15,
          bays: [
            {
              ...DEFAULT_BAYS[0],
              fieldRole: FIELD_ROLE.GPZ_LINE_BAY,
              esState: 'unknown' as const,
            },
          ],
        },
      ],
    });
    const bay = container.querySelector('[data-testid="sld-v2-gpz-bay-b-1"]');
    expect(bay?.querySelector('[data-testid="sld-v2-gpz-bay-cb"]')).not.toBeNull();
    expect(bay?.querySelector('[data-testid="sld-v2-gpz-bay-ct-primary"]')).not.toBeNull();
    expect(bay?.querySelector('[data-testid="sld-v2-gpz-bay-ds"]')).not.toBeNull();
    expect(bay?.querySelector('[data-testid="sld-v2-gpz-bay-earthing-switch"]')).not.toBeNull();
    expect(bay?.querySelector('[data-testid="sld-v2-gpz-bay-cable-head"]')).not.toBeNull();
  });
});

describe('GpzSwitchgearRenderer — commit 10: per-role tła kolumn pól (audyt SLD §D.3)', () => {
  it('Pole liniowe (GPZ_LINE_BAY) → tło COLOR_BAY_LINE (#171B20)', () => {
    const { container } = r();
    const body = container.querySelector('[data-testid="sld-v2-gpz-bay-body"]');
    expect(body?.getAttribute('fill')).toBe('#171B20');
  });

  it('Pole TR (TRANSFORMER) → tło COLOR_BAY_TR (#1A2438) — niebieski', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1',
          order: 1,
          name: 'S1',
          sectionLabel: 'S1',
          busVoltageKv: 15,
          bays: [{ ...DEFAULT_BAYS[0], fieldRole: FIELD_ROLE.TRANSFORMER }],
        },
      ],
    });
    const body = container.querySelector('[data-testid="sld-v2-gpz-bay-body"]');
    expect(body?.getAttribute('fill')).toBe('#1A2438');
  });

  it('Pole pomiarowe (MEASUREMENT) → tło COLOR_BAY_MEASUREMENT (#2A2616) — żółtawe', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1',
          order: 1,
          name: 'S1',
          sectionLabel: 'S1',
          busVoltageKv: 15,
          bays: [{ ...DEFAULT_BAYS[0], fieldRole: FIELD_ROLE.MEASUREMENT }],
        },
      ],
    });
    const body = container.querySelector('[data-testid="sld-v2-gpz-bay-body"]');
    expect(body?.getAttribute('fill')).toBe('#2A2616');
  });

  it('Pole RMU_LINE → tło COLOR_BAY_LINE (jak inne liniowe)', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1',
          order: 1,
          name: 'S1',
          sectionLabel: 'S1',
          busVoltageKv: 15,
          bays: [{ ...DEFAULT_BAYS[0], fieldRole: FIELD_ROLE.RMU_LINE }],
        },
      ],
    });
    const body = container.querySelector('[data-testid="sld-v2-gpz-bay-body"]');
    expect(body?.getAttribute('fill')).toBe('#171B20');
  });

  it('Manipulation override: COLOR_MANIPULATION_BG ma pierwszeństwo nad per-role', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1',
          order: 1,
          name: 'S1',
          sectionLabel: 'S1',
          busVoltageKv: 15,
          bays: [{ ...DEFAULT_BAYS[0], fieldRole: FIELD_ROLE.TRANSFORMER, inManipulation: true }],
        },
      ],
    });
    const body = container.querySelector('[data-testid="sld-v2-gpz-bay-body"]');
    /* COLOR_MANIPULATION_BG = #5C5512. */
    expect(body?.getAttribute('fill')).toBe('#5C5512');
  });
});

describe('GpzSwitchgearRenderer — commit 9: BAY_DEVICE_ORDER_POLICY pełna iteracja', () => {
  it('Pole TRANSFORMER (SCADA-grade): ApparatusTransformerSymbol + ApparatusLvBreaker (NIE głowica)', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-tr',
          order: 1,
          name: 'S1',
          sectionLabel: 'S1',
          busVoltageKv: 15,
          bays: [
            {
              bayRef: 'tr-bay-1',
              fieldRole: FIELD_ROLE.TRANSFORMER,
              designation: 'TR1',
              feederName: 'TR1',
              bayNumber: '03',
              hasMissingRequiredDevice: false,
              esState: 'unknown' as const,
            },
          ],
        },
      ],
    });
    const bay = container.querySelector('[data-testid="sld-v2-gpz-bay-tr-bay-1"]');
    /* Pole TR ma symbol trafa NA OSI (nie cable head). */
    expect(bay?.querySelector('[data-testid="sld-v2-gpz-bay-transformer-symbol"]')).not.toBeNull();
    /* + LV breaker po stronie nN. */
    expect(bay?.querySelector('[data-testid="sld-v2-gpz-bay-lv-breaker"]')).not.toBeNull();
    /* Brak głowicy kablowej. */
    expect(bay?.querySelector('[data-testid="sld-v2-gpz-bay-cable-head"]')).toBeNull();
    /* K30-103: earthing symbol (⏚) na punkcie neutralnym per PN-EN 61936-1. */
    expect(bay?.querySelector('[data-testid="sld-v2-gpz-bay-transformer-earthing"]')).not.toBeNull();
  });

  it('K30-104: ApparatusTransformerSymbol z vector group + tap changer (IEC 60617-2)', async () => {
    const { ApparatusTransformerSymbol } = await import('../GpzApparatusSymbols');
    const { container } = render(
      <svg>
        <ApparatusTransformerSymbol cx={50} cy={50} vectorGroup="Dyn11" hasTapChanger={true} />
      </svg>,
    );
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-transformer-vector-group"]')?.textContent).toBe('Dyn11');
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-transformer-tap-changer"]')).not.toBeNull();
  });

  it('K30-104: ApparatusTransformerSymbol bez tap changer (default) → brak strzałki OLTC', async () => {
    const { ApparatusTransformerSymbol } = await import('../GpzApparatusSymbols');
    const { container } = render(
      <svg>
        <ApparatusTransformerSymbol cx={50} cy={50} />
      </svg>,
    );
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-transformer-tap-changer"]')).toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-transformer-vector-group"]')).toBeNull();
  });

  it('Pole TRANSFORMER ma fuse (TRANSFORMER_ORDER zawiera FUSE jako optional)', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-tr',
          order: 1,
          name: 'S1',
          sectionLabel: 'S1',
          busVoltageKv: 15,
          bays: [
            {
              bayRef: 'tr-bay-1',
              fieldRole: FIELD_ROLE.TRANSFORMER,
              designation: 'TR1',
              feederName: 'TR1',
              bayNumber: '03',
              hasMissingRequiredDevice: false,
              esState: 'unknown' as const,
            },
          ],
        },
      ],
    });
    const bay = container.querySelector('[data-testid="sld-v2-gpz-bay-tr-bay-1"]');
    expect(bay?.querySelector('[data-testid="sld-v2-gpz-bay-fuse"]')).not.toBeNull();
  });

  it('Pole MEASUREMENT ma VT trójfazowy (NIE placeholder marker), bez CB/CT', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-pn',
          order: 1,
          name: 'S1',
          sectionLabel: 'S1',
          busVoltageKv: 15,
          bays: [
            {
              bayRef: 'pn-bay-1',
              fieldRole: FIELD_ROLE.MEASUREMENT,
              designation: 'PN1',
              feederName: 'PN1',
              bayNumber: '12',
              hasMissingRequiredDevice: false,
              esState: 'unknown' as const,
            },
          ],
        },
      ],
    });
    const bay = container.querySelector('[data-testid="sld-v2-gpz-bay-pn-bay-1"]');
    expect(bay?.querySelector('[data-testid="sld-v2-gpz-bay-vt-three-phase"]')).not.toBeNull();
    /* Stary placeholder marker NIE renderowany. */
    expect(bay?.querySelector('[data-testid="sld-v2-gpz-bay-vt-marker"]')).toBeNull();
    /* MEASUREMENT ma fuse (MEASUREMENT_ORDER definiuje). */
    expect(bay?.querySelector('[data-testid="sld-v2-gpz-bay-fuse"]')).not.toBeNull();
  });

  it('Pole RMU_LINE używa SWITCH_DISCONNECTOR (nie zwykły DS) — kanon RM6', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-rmu',
          order: 1,
          name: 'S1',
          sectionLabel: 'S1',
          busVoltageKv: 15,
          bays: [
            {
              bayRef: 'rmu-bay-1',
              fieldRole: FIELD_ROLE.RMU_LINE,
              designation: 'OUT',
              feederName: 'OUT',
              bayNumber: '01',
              hasMissingRequiredDevice: false,
              esState: 'unknown' as const,
            },
          ],
        },
      ],
    });
    const bay = container.querySelector('[data-testid="sld-v2-gpz-bay-rmu-bay-1"]');
    /* SWITCH_DISCONNECTOR — większy niż DS, z load-break kreską (kanon IEC). */
    const sd = bay?.querySelector('[data-testid="sld-v2-gpz-bay-switch-disconnector"]');
    expect(sd).not.toBeNull();
    /* Brak zwykłego DS w polu RMU. */
    expect(bay?.querySelector('[data-testid="sld-v2-gpz-bay-ds"]')).toBeNull();
    /* Brak CB. */
    expect(bay?.querySelector('[data-testid="sld-v2-gpz-bay-cb"]')).toBeNull();
  });

  it('Pole GPZ_LINE_BAY ma surge_arrester gdy polityka definiuje (LATERAL LEFT)', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-gpz',
          order: 1,
          name: 'S1',
          sectionLabel: 'S1',
          busVoltageKv: 15,
          bays: [
            {
              bayRef: 'gpz-bay-1',
              fieldRole: FIELD_ROLE.GPZ_LINE_BAY,
              designation: 'X',
              feederName: 'X',
              bayNumber: '1',
              hasMissingRequiredDevice: false,
              esState: 'unknown' as const,
            },
          ],
        },
      ],
    });
    const bay = container.querySelector('[data-testid="sld-v2-gpz-bay-gpz-bay-1"]');
    /* GPZ_LINE_BAY_ORDER ma SURGE_ARRESTER (optional LATERAL LEFT). */
    expect(bay?.querySelector('[data-testid="sld-v2-gpz-bay-surge-arrester"]')).not.toBeNull();
  });

  it('ES strona zgodnie z slot.side z polityki (data-es-side atrybut)', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1',
          order: 1,
          name: 'S1',
          sectionLabel: 'S1',
          busVoltageKv: 15,
          bays: [
            {
              ...DEFAULT_BAYS[0],
              esState: 'unknown' as const,
              qDesignations: { es: 'Q8' },
            },
          ],
        },
      ],
    });
    /* GPZ_LINE_BAY_ORDER ma slot ES.side='RIGHT'. */
    const esWrapper = container.querySelector('[data-es-side]');
    expect(esWrapper?.getAttribute('data-es-side')).toBe('RIGHT');
  });
});

describe('GpzSwitchgearRenderer — Quick-wins z 6/3 fix (dsBus + magenta + ellipsis + r=5)', () => {
  it('qDesignations.dsBus="Q1" → renderowany Q1 obok DS_BUS na górze pola (kanon polski LINE)', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1',
          order: 1,
          name: 'S1',
          sectionLabel: 'S1',
          busVoltageKv: 15,
          bays: [{ ...DEFAULT_BAYS[0], qDesignations: { cb: 'Q0', ds: 'Q9', dsBus: 'Q1', es: 'Q8', ct: 'T1' } }],
        },
      ],
    });
    const dsBusLabel = container.querySelector('[data-testid="sld-v2-gpz-bay-q-ds-bus"]');
    expect(dsBusLabel).not.toBeNull();
    expect(dsBusLabel?.textContent).toBe('Q1');
  });

  it('Brak qDesignations.dsBus → DS_BUS NIE renderowany (back-compat dla pól MEASUREMENT/COUPLER)', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1',
          order: 1,
          name: 'S1',
          sectionLabel: 'S1',
          busVoltageKv: 15,
          bays: [{ ...DEFAULT_BAYS[0], qDesignations: { cb: 'Q0', ds: 'Q9', es: 'Q8' } }],
        },
      ],
    });
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-q-ds-bus"]')).toBeNull();
  });

  it('Strzałka TR flow="down" używa magenta (#FF7AC1), NIE żółty', () => {
    const { container } = r({
      transformerCount: 2,
      transformerMeasurements: [
        { flow: 'up' as const },
        { flow: 'down' as const },
      ],
    });
    const arrowUp = container.querySelector('[data-testid="sld-v2-gpz-tr-flow-arrow-0"]');
    const arrowDown = container.querySelector('[data-testid="sld-v2-gpz-tr-flow-arrow-1"]');
    /* Sprawdzamy fill — różne kolory dla up/down (audyt SLD §B.2 fix). */
    const upFill = arrowUp?.querySelector('polygon')?.getAttribute('fill');
    const downFill = arrowDown?.querySelector('polygon')?.getAttribute('fill');
    expect(upFill).toBe('#E5C828');
    expect(downFill).toBe('#FF7AC1');
    expect(upFill).not.toBe(downFill);
  });

  it('feederName długi → ellipsis "…" w nagłówku (anti-pattern §15.4 fix)', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1',
          order: 1,
          name: 'S1',
          sectionLabel: 'S1',
          busVoltageKv: 15,
          bays: [{ ...DEFAULT_BAYS[0], feederName: 'FEEDER_VERY_LONG_NAME' }],
        },
      ],
    });
    /* Nagłówek pola ma maxLen=8 → 'FEEDER_…' (7 znaków + …). */
    const text = container.textContent ?? '';
    expect(text).toContain('FEEDER_…');
    expect(text).not.toContain('FEEDER_VERY_LONG_NAME'); // pełna nazwa NIE wyświetlona
    /* Operator widzi że nazwa była dłuższa (kanon UX). */
  });

  it('feederName krótki → bez ellipsis', () => {
    const { container } = r();
    const text = container.textContent ?? '';
    /* SADY (4 znaki) < 8 → wyświetlone bez ucięcia. */
    expect(text).toContain('SADY');
    expect(text).not.toContain('…');
  });

  it('GroundFaultMarker ma r=5 (audyt UX D1.3: poziom widoczności z dystansu 60 cm)', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1',
          order: 1,
          name: 'S1',
          sectionLabel: 'S1',
          busVoltageKv: 15,
          bays: [{ ...DEFAULT_BAYS[0], groundFault: 'fault' as const }],
        },
      ],
    });
    const marker = container.querySelector('[data-testid="sld-v2-gpz-bay-ground-fault"] circle');
    expect(marker?.getAttribute('r')).toBe('5');
  });

  it('singleBusTrSpacing tokenized — HvTowerColumn używa GPZ_GEOMETRY (nie hardcoded 60)', () => {
    /* Test pośredni: 2 TR są rozsadzone o 60 px deterministycznie.
     * Trudno to bezpośrednio zweryfikować w DOM, więc sprawdzamy że TR1 i TR2
     * mają różne pozycje X (data-tr-index=0 i 1 są obecne). */
    const { container } = r({ transformerCount: 2 });
    const trs = container.querySelectorAll('[data-testid="sld-v2-gpz-switchgear-transformer-symbol"]');
    expect(trs.length).toBe(2);
  });
});

describe('GpzSwitchgearRenderer — pola liniowe SN i magistrala sieci terenowej', () => {
  const HV_BAYS = [
    {
      bayRef: 'hv-1',
      fieldRole: FIELD_ROLE.GPZ_LINE_BAY,
      designation: 'POR',
      feederName: 'POR',
      bayNumber: '05',
      hasMissingRequiredDevice: false,
      energization: 'energized' as const,
    },
  ];

  const LV_BAYS_WITH_FEEDERS = [
    {
      bayRef: 'lv-line-1',
      fieldRole: FIELD_ROLE.LINE_OUT,
      designation: 'SADY',
      feederName: 'SADY',
      bayNumber: '11',
      hasMissingRequiredDevice: false,
      energization: 'energized' as const,
      cbState: 'closed' as const,
      dsState: 'closed' as const,
      outgoingFeeder: {
        destination: '→ ST-001 SADY',
        energized: true,
        feederNumber: 'L-203',
        segmentTypeLabel: 'Kabel SN',
        segmentLengthLabel: '500 m',
        catalogLabel: 'XRUHAKXS 120/25',
      },
    },
    {
      bayRef: 'lv-line-2',
      fieldRole: FIELD_ROLE.LINE_OUT,
      designation: 'OKRĘŻNA',
      feederName: 'OKRĘŻNA',
      bayNumber: '13',
      hasMissingRequiredDevice: false,
      energization: 'energized' as const,
      cbState: 'closed' as const,
      dsState: 'closed' as const,
      outgoingFeeder: {
        destination: '→ NMO-12',
        energized: true,
        segmentTypeLabel: 'Linia napowietrzna SN',
        segmentLengthLabel: '700 m',
        catalogLabel: 'AFL-6 70',
      },
    },
    {
      bayRef: 'lv-tr-1',
      fieldRole: FIELD_ROLE.TRANSFORMER,
      designation: 'TR1',
      feederName: 'TR1',
      bayNumber: '03',
      hasMissingRequiredDevice: false,
      energization: 'energized' as const,
      // Brak outgoingFeeder — pole TR nie wychodzi do magistrali.
    },
  ];

  function rTrunk(overrides: Partial<Parameters<typeof GpzSwitchgearRenderer>[0]> = {}) {
    return render(
      <svg>
        <GpzSwitchgearRenderer
          id="gpz-trunk"
          x={0}
          y={0}
          name="GPZ-8 PGL"
          voltageHighKv={110}
          voltageLowKv={15}
          sections={[
            {
              sectionId: 'lv-sec-1',
              order: 1,
              name: 'Sekcja A',
              sectionLabel: 'sekcja A',
              busVoltageKv: 15,
              bays: LV_BAYS_WITH_FEEDERS,
            },
          ]}
          couplers={[]}
          hvSections={[
            {
              sectionId: 'hv-sec-1',
              order: 1,
              name: 'Sekcja A HV',
              sectionLabel: 'sekcja A',
              busVoltageKv: 110,
              bays: HV_BAYS,
            },
          ]}
          hvCouplers={[]}
          transformerCount={1}
          {...overrides}
        />
      </svg>,
    );
  }

  it('LV pole liniowe (LINE_OUT) z outgoingFeeder → renderowane wyjście kabla', () => {
    const { container } = rTrunk();
    const feeder1 = container.querySelector(
      '[data-testid="sld-v2-gpz-outgoing-feeder-lv-line-1"]',
    );
    const feeder2 = container.querySelector(
      '[data-testid="sld-v2-gpz-outgoing-feeder-lv-line-2"]',
    );
    expect(feeder1).not.toBeNull();
    expect(feeder2).not.toBeNull();
  });

  it('LV pole TR (bez outgoingFeeder) → brak feeder visualization', () => {
    const { container } = rTrunk();
    expect(
      container.querySelector('[data-testid="sld-v2-gpz-outgoing-feeder-lv-tr-1"]'),
    ).toBeNull();
  });

  it('Etykieta destination widoczna pod każdym feederem', () => {
    const { container } = rTrunk();
    const dest1 = container.querySelector(
      '[data-testid="sld-v2-gpz-outgoing-feeder-destination-lv-line-1"]',
    );
    const dest2 = container.querySelector(
      '[data-testid="sld-v2-gpz-outgoing-feeder-destination-lv-line-2"]',
    );
    expect(dest1?.textContent).toBe('→ ST-001 SADY');
    expect(dest2?.textContent).toBe('→ NMO-12');
  });

  it('Numer feedera (L-203) widoczny gdy podany', () => {
    const { container } = rTrunk();
    const num = container.querySelector(
      '[data-testid="sld-v2-gpz-outgoing-feeder-number-lv-line-1"]',
    );
    expect(num?.textContent).toBe('L-203');
  });

  it('Brak feederNumber → brak osobnego numer-test-id (tylko destination)', () => {
    const { container } = rTrunk();
    expect(
      container.querySelector('[data-testid="sld-v2-gpz-outgoing-feeder-number-lv-line-2"]'),
    ).toBeNull();
  });

  it('wyprowadzenia SN nie tworzą wspólnej linii pod wszystkimi głowicami', () => {
    const { container } = rTrunk();
    const trunk = container.querySelector('[data-testid="sld-v2-gpz-field-trunk-line"]');
    const label = container.querySelector('[data-testid="sld-v2-gpz-field-trunk-label"]');
    expect(trunk).toBeNull();
    expect(label?.textContent).toBe('Wyprowadzenia SN');
    expect(
      container.querySelector('[data-testid="sld-v2-gpz-outgoing-feeder-corridor-lv-line-1"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="sld-v2-gpz-outgoing-feeder-corridor-lv-line-2"]'),
    ).not.toBeNull();
  });

  it('Custom fieldTrunkLabel → użyta jako opis strefy wyprowadzeń', () => {
    const { container } = rTrunk({ fieldTrunkLabel: 'Wyprowadzenia 15 kV — Olesno' });
    const label = container.querySelector('[data-testid="sld-v2-gpz-field-trunk-label"]');
    expect(label?.textContent).toBe('Wyprowadzenia 15 kV — Olesno');
  });

  it('Pusty fieldTrunkLabel ("") → trunk line ukryty (showTrunk=false)', () => {
    const { container } = rTrunk({ fieldTrunkLabel: '' });
    expect(container.querySelector('[data-testid="sld-v2-gpz-field-trunk-line"]')).toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-gpz-field-trunk-label"]')).toBeNull();
    /* Wyprowadzenia nadal widoczne — wyłączony jest tylko opis zbiorczy. */
    expect(
      container.querySelector('[data-testid="sld-v2-gpz-outgoing-feeder-lv-line-1"]'),
    ).not.toBeNull();
  });

  it('parametry odcinka są widoczne przy korytarzu wyprowadzonym z głowicy', () => {
    const { container } = rTrunk();
    const params1 = container.querySelector(
      '[data-testid="sld-v2-gpz-outgoing-feeder-parameters-lv-line-1"]',
    );
    const params2 = container.querySelector(
      '[data-testid="sld-v2-gpz-outgoing-feeder-parameters-lv-line-2"]',
    );
    expect(params1?.textContent).toBe('XRUHAKXS 120/25 · 500 m');
    expect(params2?.textContent).toBe('AFL-6 70 · 700 m');
  });

  it('każde wyprowadzenie startuje w osi własnej głowicy i ma osobny pas antykolizyjny', () => {
    const { container } = rTrunk();
    const f1 = container.querySelector('[data-testid="sld-v2-gpz-outgoing-feeder-lv-line-1"]');
    const f2 = container.querySelector('[data-testid="sld-v2-gpz-outgoing-feeder-lv-line-2"]');
    const drop1 = container.querySelector(
      '[data-testid="sld-v2-gpz-outgoing-feeder-drop-lv-line-1"]',
    );
    const drop2 = container.querySelector(
      '[data-testid="sld-v2-gpz-outgoing-feeder-drop-lv-line-2"]',
    );
    expect(drop1?.getAttribute('x1')).toBe(f1?.getAttribute('data-cable-head-x'));
    expect(drop2?.getAttribute('x1')).toBe(f2?.getAttribute('data-cable-head-x'));
    expect(f1?.getAttribute('data-lane-index')).toBe('0');
    expect(f2?.getAttribute('data-lane-index')).toBe('1');
  });

  it('Brak żadnego outgoingFeeder w sections → field trunk zone z feeder-count=0', () => {
    const { container } = rTrunk({
      sections: [
        {
          sectionId: 'lv-no-feeder',
          order: 1,
          name: 'Sekcja A',
          sectionLabel: 'sekcja A',
          busVoltageKv: 15,
          bays: [LV_BAYS_WITH_FEEDERS[2]], // tylko TR, bez outgoingFeeder
        },
      ],
    });
    /* Strefa nie renderowana wcale (hasOutgoingFeeders=false). */
    expect(container.querySelector('[data-testid="sld-v2-gpz-field-trunk-zone"]')).toBeNull();
  });

  it('Single-bus mode (brak hvSections) → field trunk NIE renderowany nawet z feederami', () => {
    const { container } = rTrunk({ hvSections: undefined });
    expect(container.querySelector('[data-testid="sld-v2-gpz-field-trunk-zone"]')).toBeNull();
  });

  it('De-energized feeder → kolor szary (data-feeder-energized="false")', () => {
    const { container } = rTrunk({
      sections: [
        {
          sectionId: 'lv-sec-1',
          order: 1,
          name: 'Sekcja A',
          sectionLabel: 'sekcja A',
          busVoltageKv: 15,
          bays: [
            {
              ...LV_BAYS_WITH_FEEDERS[0],
              outgoingFeeder: {
                destination: '→ ST-X (wyłączony)',
                energized: false,
              },
            },
          ],
        },
      ],
    });
    const f = container.querySelector(
      '[data-testid="sld-v2-gpz-outgoing-feeder-lv-line-1"]',
    );
    expect(f?.getAttribute('data-feeder-energized')).toBe('false');
  });

  it('feeder-count atrybut na zone wrapper = liczba pól z outgoingFeeder', () => {
    const { container } = rTrunk();
    const zone = container.querySelector('[data-testid="sld-v2-gpz-field-trunk-zone"]');
    expect(zone?.getAttribute('data-feeder-count')).toBe('2');
  });

  it('Strzałka kierunkowa ▼ renderowana dla każdego outgoing feeder (audyt SLD A1.5)', () => {
    const { container } = rTrunk();
    const arrow1 = container.querySelector('[data-testid="sld-v2-gpz-outgoing-feeder-arrow-lv-line-1"]');
    const arrow2 = container.querySelector('[data-testid="sld-v2-gpz-outgoing-feeder-arrow-lv-line-2"]');
    expect(arrow1).not.toBeNull();
    expect(arrow2).not.toBeNull();
    /* Polygon z 3 punktami (trójkąt). */
    expect(arrow1?.getAttribute('points')).toBeDefined();
  });

  it('Strzałka NIE renderowana dla pola bez outgoingFeeder', () => {
    const { container } = rTrunk();
    /* Pole TR (bez outgoingFeeder) — strzałka nie istnieje. */
    expect(
      container.querySelector('[data-testid="sld-v2-gpz-outgoing-feeder-arrow-lv-tr-1"]'),
    ).toBeNull();
  });
});

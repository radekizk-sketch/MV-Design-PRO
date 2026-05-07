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

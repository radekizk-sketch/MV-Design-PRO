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
// SCADA-grade: vertical Sterowanie label (control mode indicator)
// =============================================================================

describe('GpzSwitchgearRenderer — vertical Sterowanie label', () => {
  it('controlMode="remote" → "STEROWANIE ZDALNE" rotowany tekst zielony', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1', order: 1, name: 'Sekcja I', sectionLabel: 'S1', busVoltageKv: 15,
          bays: [{ ...DEFAULT_BAYS[0], controlMode: 'remote' }],
        },
      ],
    });
    const label = container.querySelector('[data-testid="sld-v2-gpz-bay-sterowanie"]');
    expect(label).not.toBeNull();
    expect(label?.getAttribute('data-control-mode')).toBe('remote');
    expect(label?.textContent).toBe('STEROWANIE ZDALNE');
    const text = label?.querySelector('text');
    expect(text?.getAttribute('fill')).toBe('#2DB54E'); // COLOR_BADGE_STATUS_OK
    expect(text?.getAttribute('transform')).toContain('rotate(-90');
  });

  it('controlMode="local" → "STEROWANIE LOKALNE" żółty', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1', order: 1, name: 'Sekcja I', sectionLabel: 'S1', busVoltageKv: 15,
          bays: [{ ...DEFAULT_BAYS[0], controlMode: 'local' }],
        },
      ],
    });
    const label = container.querySelector('[data-testid="sld-v2-gpz-bay-sterowanie"]');
    expect(label?.textContent).toBe('STEROWANIE LOKALNE');
    expect(label?.querySelector('text')?.getAttribute('fill')).toBe('#E5C828'); // COLOR_BADGE_BG_YELLOW
  });

  it('controlMode="unknown" → "STEROWANIE ?" przygaszony', () => {
    const { container } = r({
      sections: [
        {
          sectionId: 'sec-1', order: 1, name: 'Sekcja I', sectionLabel: 'S1', busVoltageKv: 15,
          bays: [{ ...DEFAULT_BAYS[0], controlMode: 'unknown' }],
        },
      ],
    });
    const label = container.querySelector('[data-testid="sld-v2-gpz-bay-sterowanie"]');
    expect(label?.textContent).toBe('STEROWANIE ?');
  });

  it('brak controlMode → brak etykiety', () => {
    const { container } = r();
    expect(container.querySelector('[data-testid="sld-v2-gpz-bay-sterowanie"]')).toBeNull();
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

  it('Magistrala SN — domyślna trunk line + etykieta widoczne gdy są feedery', () => {
    const { container } = rTrunk();
    const trunk = container.querySelector('[data-testid="sld-v2-gpz-field-trunk-line"]');
    const label = container.querySelector('[data-testid="sld-v2-gpz-field-trunk-label"]');
    expect(trunk).not.toBeNull();
    expect(label?.textContent).toBe('Magistrala SN — sieć terenowa');
  });

  it('Custom fieldTrunkLabel → użyta zamiast domyślnej', () => {
    const { container } = rTrunk({ fieldTrunkLabel: 'Magistrala 15 kV — Olesno' });
    const label = container.querySelector('[data-testid="sld-v2-gpz-field-trunk-label"]');
    expect(label?.textContent).toBe('Magistrala 15 kV — Olesno');
  });

  it('Pusty fieldTrunkLabel ("") → trunk line ukryty (showTrunk=false)', () => {
    const { container } = rTrunk({ fieldTrunkLabel: '' });
    expect(container.querySelector('[data-testid="sld-v2-gpz-field-trunk-line"]')).toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-gpz-field-trunk-label"]')).toBeNull();
    /* Feedery nadal widoczne — sama trunk wyłączona. */
    expect(
      container.querySelector('[data-testid="sld-v2-gpz-outgoing-feeder-lv-line-1"]'),
    ).not.toBeNull();
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
});

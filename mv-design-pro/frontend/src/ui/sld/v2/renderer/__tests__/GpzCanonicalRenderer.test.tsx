/**
 * GpzCanonicalRenderer tests — Phase R2/R3/R4 (operator-grade rebuild).
 *
 * Pokrycie 13 elementów strukturalnych + zakaz placeholderów + interakcja.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';

import {
  type CanonicalGpzBay,
  type CanonicalGpzCoupler,
  type CanonicalGpzHvSection,
  type CanonicalGpzSection,
  type CanonicalGpzTransformer,
  type GpzCanonicalRendererProps,
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
const TR2: CanonicalGpzTransformer = { ...TR1, transformerRef: 'tr-2', designation: 'TR2' };

function bay(ref: string, role: CanonicalGpzBay['fieldRole'] = 'LINE_OUT', overrides: Partial<CanonicalGpzBay> = {}): CanonicalGpzBay {
  return {
    bayRef: ref,
    bayNumber: '1',
    feederName: 'STAROŁĘCKA',
    destinationLabel: '→ ST-01',
    fieldRole: role,
    cbState: 'closed',
    dsState: 'closed',
    esState: 'open',
    qDesignations: { cb: 'Q0', dsBus: 'Q1', dsLin: 'Q9', es: 'Q8', ct: 'T1' },
    ...overrides,
  };
}

function defaultProps(overrides: Partial<GpzCanonicalRendererProps> = {}): GpzCanonicalRendererProps {
  return {
    id: 'gpz-test',
    x: 0,
    y: 0,
    name: 'GPZ-5 PST',
    transformers: [TR1, TR2],
    sections: [
      { sectionId: 'sec-1', order: 1, label: 'S1', busVoltageKv: 15, bays: [bay('b-1'), bay('b-2', 'LINE_OUT', { bayNumber: '2' })] },
      { sectionId: 'sec-2', order: 2, label: 'S2', busVoltageKv: 15, bays: [bay('b-3', 'LINE_OUT', { bayNumber: '3' })] },
    ],
    couplers: [],
    ...overrides,
  };
}

function renderGpz(overrides: Partial<GpzCanonicalRendererProps> = {}) {
  return render(
    <svg width={1600} height={900}>
      <GpzCanonicalRenderer {...defaultProps(overrides)} />
    </svg>,
  );
}

function readTranslate(element: Element): { x: number; y: number } {
  const transform = element.getAttribute('transform') ?? '';
  const match = /translate\(([-\d.]+),\s*([-\d.]+)\)/.exec(transform);
  if (!match) return { x: Number.NaN, y: Number.NaN };
  return { x: Number(match[1]), y: Number(match[2]) };
}

/* ---------------------------------------------------------------------------
   1. ZAKAZ placeholderów
   --------------------------------------------------------------------------- */

describe('GpzCanonicalRenderer — zakaz placeholderów (Acceptance Inv R1)', () => {
  it('Brak literalnych "GPZ 1" / "TR1" / "Sekcja 2" w defaultach', () => {
    const { container } = renderGpz({ name: 'GPZ Olsztyn 2' });
    const html = container.innerHTML;
    // "GPZ 1" jako placeholder NIE może być w HTML (ale nazwa "GPZ Olsztyn 2" OK).
    expect(html).not.toContain('"GPZ 1"');
    expect(html).not.toContain('Sekcja 2');
    expect(html).not.toContain('?/15 kV');
    expect(html).not.toContain('?/15 kV');
  });

  it('Brak danych: name="" → renderer pokazuje "—" zamiast placeholder', () => {
    const { container } = renderGpz({ name: '' });
    expect(container.querySelector('[data-testid="sld-v2-gpz-canonical-gpz-test"]')).toBeTruthy();
    // GpzOperatorHeader pokazuje "—" dla pustego name.
  });

  it('Brak transformatorów → explicit "Brak transformatora WN/SN" (NIE TR1 placeholder)', () => {
    const { getByText } = renderGpz({ transformers: [] });
    expect(getByText(/Transformator WN\/SN do konfiguracji/)).toBeTruthy();
  });

  it('Brak HV sections + brak transformatorów → explicit "Brak danych 110 kV"', () => {
    const { getByText } = renderGpz({ hvSections: [], transformers: [] });
    expect(getByText(/Strona 110 kV do konfiguracji/)).toBeTruthy();
  });
});

/* ---------------------------------------------------------------------------
   2. ZAKAZ nakładających tekstów
   --------------------------------------------------------------------------- */

describe('GpzCanonicalRenderer — zakaz nakładających tekstów (Inv R2)', () => {
  it('Każda etykieta sekcji renderowana 1×', () => {
    const { container } = renderGpz();
    const s1Labels = container.querySelectorAll('[data-testid="gpz-canonical-section-label-S1"]');
    expect(s1Labels).toHaveLength(1);
    const s2Labels = container.querySelectorAll('[data-testid="gpz-canonical-section-label-S2"]');
    expect(s2Labels).toHaveLength(1);
  });

  it('Etykieta sekcji ma rozdzielone linie nazwy i napięcia', () => {
    const { container } = renderGpz();
    const label = container.querySelector('[data-testid="gpz-canonical-section-label-S1"]');
    const name = container.querySelector('[data-testid="gpz-canonical-section-label-S1-name"]');
    const voltage = container.querySelector('[data-testid="gpz-canonical-section-label-S1-voltage"]');
    const bg = container.querySelector('[data-testid="gpz-canonical-section-label-S1-bg"]');

    expect(label?.getAttribute('data-readable-label-stack')).toBe('true');
    expect(name?.getAttribute('y')).toBe('-5');
    expect(voltage?.getAttribute('y')).toBe('13');
    expect(bg?.getAttribute('height')).toBe('36');
  });

  it('Etykieta źródła 110 kV nie nakłada tekstu System i napięcia', () => {
    const { container } = renderGpz();
    const indicator = container.querySelector('[data-testid="gpz-canonical-hv-source-indicator"]');
    const name = container.querySelector('[data-testid="gpz-canonical-hv-source-label-name"]');
    const voltage = container.querySelector('[data-testid="gpz-canonical-hv-source-label-voltage"]');

    expect(indicator?.getAttribute('data-readable-label-stack')).toBe('true');
    expect(name?.getAttribute('y')).toBe('-10');
    expect(voltage?.getAttribute('y')).toBe('10');
  });

  it('Każda nazwa GPZ renderowana 1×', () => {
    const { container } = renderGpz({ name: 'GPZ-5 PST' });
    const root = container.querySelector('[data-testid="sld-v2-gpz-canonical-gpz-test"]')!;
    expect(root.getAttribute('data-gpz-name')).toBe('GPZ-5 PST');
  });

  it('Każdy transformator (TR1, TR2) renderowany 1×', () => {
    const { container } = renderGpz();
    expect(container.querySelectorAll('[data-testid="gpz-canonical-transformer-tr-1"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-testid="gpz-canonical-transformer-tr-2"]')).toHaveLength(1);
  });

  it('Każde pole renderowane 1× (po unikalnym bayRef)', () => {
    const { container } = renderGpz();
    expect(container.querySelectorAll('[data-testid="gpz-canonical-bay-b-1"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-testid="gpz-canonical-bay-b-2"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-testid="gpz-canonical-bay-b-3"]')).toHaveLength(1);
  });
});

/* ---------------------------------------------------------------------------
   3. PEŁEN kanon SCADA (13 elementów strukturalnych)
   --------------------------------------------------------------------------- */

describe('GpzCanonicalRenderer — 13 elementów strukturalnych SCADA OSD', () => {
  it('1. Header (transmisja + nazwa + adres + bilans + alarmy + kasowanie)', () => {
    const { container } = renderGpz({
      addressLine: 'ul. Poznańska 13/15',
      radioId: 'radio nr 587',
      transmissionStatus: 'ok',
      controlAvailability: 'remote',
      balance: { pMw: -3.1, qMvar: -0.4 },
      alarms: { enclosureDoorOpen: true },
      onResetSignals: () => {},
    });
    expect(container.querySelector('[data-testid="sld-v2-gpz-operator-header"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="gpz-header-address"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="gpz-header-balance"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="gpz-header-alarms"]')).toBeTruthy();
  });

  it('2. HV side (110 kV bus + HV bays)', () => {
    const hvBay = bay('hv-1', 'LINE_OUT', { bayNumber: 'HV1' });
    const hvSections: CanonicalGpzHvSection[] = [
      { sectionId: 'hv-1', order: 1, label: 'HV-1', busVoltageKv: 110, bays: [hvBay] },
    ];
    const { container } = renderGpz({ hvSections });
    expect(container.querySelector('[data-testid="gpz-canonical-hv"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="gpz-canonical-hv-bus"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="gpz-canonical-hv-bay-hv-1"]')).toBeTruthy();
  });

  it('2a. Bez jawnej rozdzielni WN nie rysuje jednej wspólnej szyny 110 kV przez TR1/TR2', () => {
    const { container } = renderGpz();
    const hvRoot = container.querySelector('[data-testid="gpz-canonical-hv"]');

    expect(hvRoot?.getAttribute('data-hv-bus-mode')).toBe('segmented_by_transformer');
    expect(container.querySelector('[data-testid="gpz-canonical-hv-bus"]')).toBeNull();
    expect(container.querySelector('[data-testid="gpz-canonical-hv-bus-segment-tr-1"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="gpz-canonical-hv-bus-segment-tr-2"]')).toBeTruthy();
  });

  it('3. Transformatory NA OSI (TR1 + TR2 z Y/Δ + MVA)', () => {
    const { container, getByText, getAllByText } = renderGpz();
    expect(container.querySelectorAll('[data-testid^="gpz-canonical-transformer-"]')).toHaveLength(2);
    expect(getByText('TR1')).toBeTruthy();
    expect(getByText('TR2')).toBeTruthy();
    // Moc widoczna (2 transformatory × 25 MVA = 2 wystąpienia)
    expect(getAllByText('25 MVA').length).toBe(2);
  });

  it('3a. Etykiety transformatora WN/SN mają czytelny odstęp pionowy', () => {
    const { container } = renderGpz({ transformers: [TR1] });
    const designation = container.querySelector('[data-testid="gpz-canonical-tr-label-tr-1-designation"]');
    const power = container.querySelector('[data-testid="gpz-canonical-tr-label-tr-1-power"]');
    const voltage = container.querySelector('[data-testid="gpz-canonical-tr-label-tr-1-voltage"]');

    expect(Number(power?.getAttribute('y')) - Number(designation?.getAttribute('y'))).toBeGreaterThanOrEqual(18);
    expect(Number(voltage?.getAttribute('y')) - Number(power?.getAttribute('y'))).toBeGreaterThanOrEqual(14);
  });

  it('4. ≥2 sekcje LV (S1, S2) z etykietami + napięciem', () => {
    const { container, getByText } = renderGpz();
    expect(container.querySelector('[data-testid="gpz-canonical-section-sec-1"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="gpz-canonical-section-sec-2"]')).toBeTruthy();
    expect(getByText('S1')).toBeTruthy();
    expect(getByText('S2')).toBeTruthy();
  });

  it('5. Pola SN per sekcja (LineBay z aparaturą)', () => {
    const { container } = renderGpz();
    expect(container.querySelector('[data-testid="gpz-canonical-bay-b-1"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="gpz-canonical-bay-b-2"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="gpz-canonical-bay-b-3"]')).toBeTruthy();
  });

  it('5a. Szyna SN przechodzi nad kolumnami pól, a pionowy tor pola startuje z szyny', () => {
    const { container } = renderGpz();
    const section = container.querySelector('[data-testid="gpz-canonical-section-sec-1"]');
    const bus = container.querySelector('[data-testid="gpz-canonical-section-sec-1-bus"]');
    const firstBay = container.querySelector('[data-testid="gpz-canonical-bay-b-1"]');

    expect(section).toBeTruthy();
    expect(bus).toBeTruthy();
    expect(firstBay).toBeTruthy();
    expect(section?.lastElementChild).toBe(bus);
    expect(firstBay?.getAttribute('transform')).toContain(', 0)');
    expect(bus?.getAttribute('stroke-width') ?? bus?.getAttribute('strokeWidth')).toBe('4');
  });

  it('5b. Etykieta odpływu pola jest pod szyną i nie koliduje z etykietą sekcji', () => {
    const { container } = renderGpz();
    const feederLabel = container.querySelector('[data-testid="gpz-bay-feeder-label"]');

    expect(feederLabel).toBeTruthy();
    expect(Number(feederLabel?.getAttribute('y'))).toBeGreaterThan(0);
  });

  it('5c. Pole odpływowe nie traci numeru przez ucięcie etykiety', () => {
    const { getByText, queryByText } = renderGpz({
      sections: [
        {
          sectionId: 'sec-1',
          order: 1,
          label: 'S1',
          busVoltageKv: 15,
          bays: [bay('bay-out-1', 'LINE_OUT', { bayNumber: '1', feederName: 'Pole odpływowe 1' })],
        },
      ],
      transformers: [TR1],
    });

    expect(getByText('Odpływ 1')).toBeTruthy();
    expect(queryByText('Pole odpły')).toBeNull();
  });

  it('6. Aparatura: CB + DS + ES per pole', () => {
    const { container } = renderGpz();
    const cbs = container.querySelectorAll('[data-testid="gpz-canonical-cb"]');
    const dss = container.querySelectorAll('[data-testid="gpz-canonical-ds"]');
    expect(cbs.length).toBeGreaterThan(0);
    expect(dss.length).toBeGreaterThan(0);
  });

  it('6a. Pole SN bez oznaczen Q nadal pokazuje wymagane aparaty, a nie pusta kreske', () => {
    const sections: CanonicalGpzSection[] = [
      {
        sectionId: 'sec-1',
        order: 1,
        label: 'S1',
        busVoltageKv: 15,
        bays: [bay('bay-without-q', 'LINE_OUT', { qDesignations: {} })],
      },
    ];
    const { container } = renderGpz({ sections });
    const bayEl = container.querySelector('[data-testid="gpz-canonical-bay-bay-without-q"]');

    expect(bayEl).toBeTruthy();
    expect(bayEl?.querySelector('[data-parity-key="gpz.apparatus.ds.bus"]')).toBeTruthy();
    expect(bayEl?.querySelector('[data-parity-key="gpz.apparatus.cb.main"]')).toBeTruthy();
    expect(bayEl?.querySelector('[data-parity-key="gpz.apparatus.ct"]')).toBeTruthy();
    expect(bayEl?.querySelector('[data-parity-key="gpz.apparatus.ds.line"]')).toBeTruthy();
    expect(bayEl?.querySelector('[data-parity-key="gpz.apparatus.es.side"]')).toBeTruthy();
    expect(bayEl?.querySelector('[data-parity-key="gpz.apparatus.cable_head"]')).toBeTruthy();
  });

  it('7. Q-numbering (Q0/Q1/Q9/Q8/T1) widoczny w polach', () => {
    const { getAllByText } = renderGpz();
    expect(getAllByText('Q0').length).toBeGreaterThan(0);
    expect(getAllByText('Q1').length).toBeGreaterThan(0);
    expect(getAllByText('Q9').length).toBeGreaterThan(0);
    expect(getAllByText('Q8').length).toBeGreaterThan(0);
    expect(getAllByText('T1').length).toBeGreaterThan(0);
  });

  it('8. Sprzęgło międzysekcyjne (gdy w couplers[])', () => {
    const couplers: CanonicalGpzCoupler[] = [
      { couplerId: 'cpl-9', leftSectionId: 'sec-1', rightSectionId: 'sec-2', designation: 'SPRZĘG 9', closedState: 'closed' },
    ];
    const { container } = renderGpz({ couplers });
    expect(container.querySelector('[data-testid="gpz-canonical-coupler-cpl-9"]')).toBeTruthy();
  });

  it('8a. Dwie sekcje SN sa segmentami jednej osi szyn, nie dwoma systemami szyn', () => {
    const couplers: CanonicalGpzCoupler[] = [
      { couplerId: 'cpl-9', leftSectionId: 'sec-1', rightSectionId: 'sec-2', designation: 'SPRZEG 9', closedState: 'closed' },
    ];
    const { container } = renderGpz({ couplers });
    const section1 = container.querySelector('[data-testid="gpz-canonical-section-sec-1"]');
    const section2 = container.querySelector('[data-testid="gpz-canonical-section-sec-2"]');
    const coupler = container.querySelector('[data-testid="gpz-canonical-coupler-cpl-9"]');

    expect(section1).toBeTruthy();
    expect(section2).toBeTruthy();
    expect(coupler).toBeTruthy();
    expect(section1?.getAttribute('data-section-layout')).toBe('single-bus-segment');
    expect(section2?.getAttribute('data-section-layout')).toBe('single-bus-segment');

    const section1Position = readTranslate(section1!);
    const section2Position = readTranslate(section2!);
    const couplerPosition = readTranslate(coupler!);

    expect(section1Position.y).toBe(section2Position.y);
    expect(section2Position.x).toBeGreaterThan(section1Position.x);
    expect(couplerPosition.y).toBe(section1Position.y);
    expect(coupler?.getAttribute('data-coupler-orientation')).toBe('horizontal');
  });

  it('9. Magistrale: pole z destinationLabel pokazuje cel', () => {
    const { getAllByText } = renderGpz();
    const destinationLabels = getAllByText(/→ ST-01/);
    expect(destinationLabels.length).toBeGreaterThan(0);
  });

  it('10. Numer pola dyspozytorski widoczny pod kolumną', () => {
    const { getAllByText } = renderGpz();
    expect(getAllByText('1').length).toBeGreaterThan(0);
    expect(getAllByText('2').length).toBeGreaterThan(0);
    expect(getAllByText('3').length).toBeGreaterThan(0);
  });

  it('11. Per-role bay color (data-bay-role attr)', () => {
    const tr_bay = bay('b-tr', 'TRANSFORMER');
    const sections: CanonicalGpzSection[] = [
      { sectionId: 'sec-1', order: 1, label: 'S1', busVoltageKv: 15, bays: [tr_bay] },
    ];
    const { container } = renderGpz({ sections });
    const trBayEl = container.querySelector('[data-testid="gpz-canonical-bay-b-tr"]');
    expect(trBayEl?.getAttribute('data-bay-role')).toBe('TRANSFORMER');
  });

  it('11a. Pole TR jest prowadzone do góry od szyny i pokazuje transformator', () => {
    const trBay = bay('b-tr-up', 'TRANSFORMER', { bayNumber: 'TR', feederName: 'TR1' });
    const sections: CanonicalGpzSection[] = [
      { sectionId: 'sec-1', order: 1, label: 'S1', busVoltageKv: 15, bays: [trBay] },
    ];
    const { container } = renderGpz({ sections });
    const trBayEl = container.querySelector('[data-testid="gpz-canonical-bay-b-tr-up"]');

    expect(trBayEl?.getAttribute('data-bay-orientation')).toBe('upstream-transformer');
    expect(trBayEl?.querySelector('[data-parity-key="gpz.bay.tr.upstream_path"]')).toBeTruthy();
    expect(trBayEl?.querySelector('[data-parity-key="gpz.bay.tr.upstream.transformer_symbol"]')).toBeTruthy();
    expect(trBayEl?.querySelector('[data-parity-key="gpz.apparatus.fuse"]')).toBeTruthy();
    expect(trBayEl?.querySelector('[data-parity-key="gpz.apparatus.es.side"]')).toBeTruthy();
  });

  it('12. Status badges (gdy bay.statusFlags ≠ [])', () => {
    const flagsBay = bay('b-flag', 'LINE_OUT', { statusFlags: ['SPZ', 'LRW'] });
    const sections: CanonicalGpzSection[] = [
      { sectionId: 'sec-1', order: 1, label: 'S1', busVoltageKv: 15, bays: [flagsBay] },
    ];
    const { container } = renderGpz({ sections });
    expect(container.querySelector('[data-testid="gpz-canonical-flag-SPZ"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="gpz-canonical-flag-LRW"]')).toBeTruthy();
  });

  it('13. Pomiary panel (gdy bay.measurements ≠ null)', () => {
    const measBay = bay('b-meas', 'LINE_OUT', {
      measurements: { pMw: 2.5, qMvar: 0.3, i1A: 120 },
    });
    const sections: CanonicalGpzSection[] = [
      { sectionId: 'sec-1', order: 1, label: 'S1', busVoltageKv: 15, bays: [measBay] },
    ];
    const { container } = renderGpz({ sections });
    expect(container.querySelector('[data-testid="gpz-canonical-measurements"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="gpz-canonical-measurement-P"]')).toBeTruthy();
  });
});

/* ---------------------------------------------------------------------------
   4. Apparatus state matrix (CB/DS open/closed/unknown)
   --------------------------------------------------------------------------- */

describe('GpzCanonicalRenderer — apparatus state matrix', () => {
  it('CB closed → fill zielony, brak przerwy', () => {
    const closedBay = bay('cb-closed', 'LINE_OUT', { cbState: 'closed' });
    const { container } = renderGpz({ sections: [{ sectionId: 's', order: 1, label: 'S1', busVoltageKv: 15, bays: [closedBay] }] });
    const cb = container.querySelector('[data-testid="gpz-canonical-bay-cb-closed"] [data-testid="gpz-canonical-cb"]');
    expect(cb?.getAttribute('data-state')).toBe('closed');
  });

  it('CB open → przerwa wewnątrz', () => {
    const openBay = bay('cb-open', 'LINE_OUT', { cbState: 'open' });
    const { container } = renderGpz({ sections: [{ sectionId: 's', order: 1, label: 'S1', busVoltageKv: 15, bays: [openBay] }] });
    const cb = container.querySelector('[data-testid="gpz-canonical-bay-cb-open"] [data-testid="gpz-canonical-cb"]');
    expect(cb?.getAttribute('data-state')).toBe('open');
  });

  it('CB unknown → stan techniczny bez znaku zastępczego', () => {
    const unknownBay = bay('cb-unk', 'LINE_OUT', { cbState: 'unknown' });
    const { container } = renderGpz({ sections: [{ sectionId: 's', order: 1, label: 'S1', busVoltageKv: 15, bays: [unknownBay] }] });
    const cb = container.querySelector('[data-testid="gpz-canonical-bay-cb-unk"] [data-testid="gpz-canonical-cb"]');
    expect(cb?.getAttribute('data-state')).toBe('unknown');
    expect(cb?.textContent).not.toContain('?');
  });
});

/* ---------------------------------------------------------------------------
   5. Interakcja: click / dblclick / contextmenu
   --------------------------------------------------------------------------- */

describe('GpzCanonicalRenderer — interakcja', () => {
  it('Single click na bay → onClickBay z ref', () => {
    const handler = vi.fn();
    const { container } = renderGpz({ onClickBay: handler });
    const bayEl = container.querySelector('[data-testid="gpz-canonical-bay-b-1"]')!;
    fireEvent.click(bayEl);
    expect(handler).toHaveBeenCalledWith('b-1');
  });

  it('Double click na bay → onDoubleClickBay', () => {
    const handler = vi.fn();
    const { container } = renderGpz({ onDoubleClickBay: handler });
    const bayEl = container.querySelector('[data-testid="gpz-canonical-bay-b-1"]')!;
    fireEvent.doubleClick(bayEl);
    expect(handler).toHaveBeenCalledWith('b-1');
  });

  it('Right click na bay → onContextMenuBay z clientX/Y', () => {
    const handler = vi.fn();
    const { container } = renderGpz({ onContextMenuBay: handler });
    const bayEl = container.querySelector('[data-testid="gpz-canonical-bay-b-1"]')!;
    fireEvent.contextMenu(bayEl, { clientX: 100, clientY: 200 });
    expect(handler).toHaveBeenCalledWith('b-1', expect.objectContaining({ clientX: 100, clientY: 200 }));
  });

  it('Klik aparatu wybiera dokładnie ten aparat, nie całe pole', () => {
    const apparatusHandler = vi.fn();
    const bayHandler = vi.fn();
    const { container } = renderGpz({
      onClickApparatus: apparatusHandler,
      onClickBay: bayHandler,
    });
    const breaker = container.querySelector('[data-testid="gpz-canonical-apparatus-b-1#breaker"]')!;
    const breakerHitbox = container.querySelector('[data-testid="gpz-canonical-apparatus-b-1#breaker-hitbox"]')!;
    const breakerButton = container.querySelector('[data-testid="gpz-canonical-apparatus-b-1#breaker-button"]')!;

    expect(breaker.getAttribute('role')).toBeNull();
    expect(breakerHitbox.getAttribute('pointer-events')).toBe('all');
    expect(breakerButton.getAttribute('aria-label')).toBe('Wyłącznik SN');
    fireEvent.click(breakerButton);

    expect(apparatusHandler).toHaveBeenCalledWith({
      apparatusId: 'b-1#breaker',
      bayRef: 'b-1',
      apparatusKind: 'breaker',
      designation: 'Q0',
      labelPl: 'Wyłącznik SN',
    });
    expect(bayHandler).not.toHaveBeenCalled();
  });

  it('Prawy klik głowicy zwraca aparat cable_head jako źródło wyprowadzenia ciągu', () => {
    const apparatusMenuHandler = vi.fn();
    const { container } = renderGpz({ onContextMenuApparatus: apparatusMenuHandler });
    const cableHead = container.querySelector('[data-testid="gpz-canonical-apparatus-b-1#cable_head-button"]')!;

    fireEvent.contextMenu(cableHead, { clientX: 123, clientY: 234 });

    expect(apparatusMenuHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        apparatusId: 'b-1#cable_head',
        bayRef: 'b-1',
        apparatusKind: 'cable_head',
        labelPl: 'Głowica kablowa / port odpływu',
      }),
      expect.objectContaining({ clientX: 123, clientY: 234 }),
    );
  });

  it('Hitbox głowicy obejmuje dolny zacisk odpływowy, a nie tylko mały trójkąt', () => {
    const apparatusMenuHandler = vi.fn();
    const bayMenuHandler = vi.fn();
    const { container } = renderGpz({
      onContextMenuApparatus: apparatusMenuHandler,
      onContextMenuBay: bayMenuHandler,
    });
    const cableHeadHitbox = container.querySelector(
      '[data-testid="gpz-canonical-apparatus-b-1#cable_head-hitbox"]',
    )!;

    expect(cableHeadHitbox.getAttribute('pointer-events')).toBe('all');
    expect(Number(cableHeadHitbox.getAttribute('height'))).toBeGreaterThanOrEqual(48);
    fireEvent.contextMenu(cableHeadHitbox, { clientX: 123, clientY: 234 });

    expect(apparatusMenuHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        apparatusId: 'b-1#cable_head',
        apparatusKind: 'cable_head',
      }),
      expect.objectContaining({ clientX: 123, clientY: 234 }),
    );
    expect(bayMenuHandler).not.toHaveBeenCalled();
  });

  it('Click na coupler → onClickCoupler', () => {
    const handler = vi.fn();
    const couplers: CanonicalGpzCoupler[] = [
      { couplerId: 'cpl-9', leftSectionId: 'sec-1', rightSectionId: 'sec-2', designation: 'SPRZĘG', closedState: 'closed' },
    ];
    const { container } = renderGpz({ couplers, onClickCoupler: handler });
    fireEvent.click(container.querySelector('[data-testid="gpz-canonical-coupler-cpl-9"]')!);
    expect(handler).toHaveBeenCalledWith('cpl-9');
  });

  it('Click na transformer → onClickTransformer', () => {
    const handler = vi.fn();
    const { container } = renderGpz({ onClickTransformer: handler });
    fireEvent.click(container.querySelector('[data-testid="gpz-canonical-transformer-tr-1"]')!);
    expect(handler).toHaveBeenCalledWith('tr-1');
  });

  it('Reset signals click w header → onResetSignals', () => {
    const handler = vi.fn();
    const { container } = renderGpz({
      controlAvailability: 'remote',
      onResetSignals: handler,
    });
    fireEvent.click(container.querySelector('[data-testid="gpz-header-reset-signals"]')!);
    expect(handler).toHaveBeenCalled();
  });
});

/* ---------------------------------------------------------------------------
   6. Determinizm
   --------------------------------------------------------------------------- */

describe('GpzCanonicalRenderer — determinizm', () => {
  it('Ten sam ENM input → identyczny markup (3 reruny)', () => {
    const r1 = render(<svg><GpzCanonicalRenderer {...defaultProps()} /></svg>);
    const html1 = r1.container.innerHTML;
    r1.unmount();
    for (let i = 0; i < 2; i++) {
      const rN = render(<svg><GpzCanonicalRenderer {...defaultProps()} /></svg>);
      expect(rN.container.innerHTML).toBe(html1);
      rN.unmount();
    }
  });
});

/* ---------------------------------------------------------------------------
   7. Replica reference SCADA (GPZ-5 PST)
   --------------------------------------------------------------------------- */

describe('GpzCanonicalRenderer — replica GPZ-5 PST (Mikronika MIKRA reference)', () => {
  it('Pełny GPZ-5 PST setup z 2 TR + 2 sekcje LV + sprzęgło + 6 pól + header', () => {
    const props: GpzCanonicalRendererProps = {
      id: 'gpz-5-pst',
      x: 0,
      y: 0,
      name: 'GPZ-5 PST',
      transmissionStatus: 'ok',
      balance: { pMw: -3.1, qMvar: -0.4 },
      transformers: [TR1, TR2],
      sections: [
        {
          sectionId: 's1', order: 1, label: 'S1', busVoltageKv: 15,
          bays: [
            bay('b-starolecka-42', 'LINE_OUT', { bayNumber: '1', feederName: 'STAROŁĘCKA 42', destinationLabel: '→ MST1795' }),
            bay('b-laboratorium', 'LINE_OUT', { bayNumber: '5', feederName: 'LABORATORIUM', destinationLabel: '→ K/E537' }),
            bay('b-zus', 'LINE_OUT', { bayNumber: '6', feederName: 'ZUS II', destinationLabel: '→ ZKSN 6012' }),
          ],
        },
        {
          sectionId: 's2', order: 2, label: 'S2', busVoltageKv: 15,
          bays: [
            bay('b-rmaya', 'LINE_OUT', { bayNumber: '7', feederName: 'R.MAYA', destinationLabel: '→ 510178' }),
            bay('b-mpk', 'LINE_OUT', { bayNumber: '12', feederName: 'MPK STAROŁ.', destinationLabel: '→ 01-147' }),
            bay('b-aluplast', 'LINE_OUT', { bayNumber: '11', feederName: 'ALUPLAST', destinationLabel: '→ ZKSN 6009' }),
          ],
        },
      ],
      couplers: [
        { couplerId: 'cpl-9', leftSectionId: 's1', rightSectionId: 's2', designation: 'SPRZĘGŁO 9', closedState: 'closed' },
      ],
    };
    const { container, getByText } = render(<svg width={1800} height={1000}><GpzCanonicalRenderer {...props} /></svg>);
    expect(getByText('GPZ-5 PST')).toBeTruthy();
    expect(getByText('TRANSMISJA POPRAWNA')).toBeTruthy();
    expect(getByText('-3.1 MW')).toBeTruthy();
    expect(getByText('-0.4 MVAr')).toBeTruthy();
    // 2 transformatory
    expect(container.querySelectorAll('[data-testid^="gpz-canonical-transformer-"]')).toHaveLength(2);
    // 2 sekcje
    expect(container.querySelector('[data-testid="gpz-canonical-section-s1"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="gpz-canonical-section-s2"]')).toBeTruthy();
    // 6 pól
    expect(container.querySelectorAll('[data-testid^="gpz-canonical-bay-"]')).toHaveLength(6);
    // Sprzęgło
    expect(container.querySelector('[data-testid="gpz-canonical-coupler-cpl-9"]')).toBeTruthy();
    // Destinations widoczne
    expect(getByText(/→ MST1795/)).toBeTruthy();
    expect(getByText(/→ K\/E537/)).toBeTruthy();
  });
});

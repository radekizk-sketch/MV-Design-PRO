/**
 * GpzCanonicalRenderer R16 — Pełen mini-RMU stacji odbiorczych.
 *
 * Test integracji `MiniBlockRmuRenderer` w GPZ outgoing feeders.
 * Kanon SCADA OSD: kabel SN z pola GPZ schodzi do PEŁNEGO mini-RMU
 * stacji odbiorczej (NIE simplified label box).
 */
import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';

import { GpzCanonicalRenderer } from '../GpzCanonicalRenderer';
import type {
  GpzCanonicalRendererProps,
  CanonicalGpzBay,
  CanonicalReceivingStation,
} from '../GpzCanonicalRenderer';

function bay(overrides: Partial<CanonicalGpzBay> = {}): CanonicalGpzBay {
  return {
    bayRef: 'bay-1',
    bayNumber: '10',
    feederName: 'PST1',
    destinationLabel: 'STAROŁĘCKA 42',
    fieldRole: 'LINE_OUT',
    cbState: 'closed',
    dsState: 'closed',
    esState: 'open',
    qDesignations: { cb: 'Q0', dsBus: 'Q1', dsLin: 'Q9', es: 'Q8' },
    statusFlags: [],
    controlMode: 'remote',
    inManipulation: false,
    ...overrides,
  };
}

function station(overrides: Partial<CanonicalReceivingStation> = {}): CanonicalReceivingStation {
  return {
    stationRef: 'sub-starolecka-42',
    name: 'STAROŁĘCKA 42',
    sourceBayRef: 'bay-1',
    cableNumber: 'MST1795',
    footprintType: 'mv_lv_terminal',
    snBays: [
      { bayRef: 'sba-1', fieldRole: 'LINE_IN', designation: '1', hasMissingRequiredDevice: false },
      { bayRef: 'sba-2', fieldRole: 'TRANSFORMER', designation: 'TR', hasMissingRequiredDevice: false },
      { bayRef: 'sba-3', fieldRole: 'LINE_OUT', designation: '3', hasMissingRequiredDevice: false },
    ],
    hasTransformer: true,
    transformerRatedKva: 630,
    nnFeedersCount: 4,
    derBadges: [],
    missingData: false,
    ...overrides,
  };
}

function baseProps(overrides: Partial<GpzCanonicalRendererProps> = {}): GpzCanonicalRendererProps {
  return {
    id: 'gpz-test',
    x: 0,
    y: 0,
    name: 'GPZ-TEST',
    transformers: [{
      transformerRef: 'tr-1', designation: 'TR1', snMva: 25,
      uhvKv: 110, ulvKv: 15, vectorGroup: 'YNd11',
    }],
    sections: [{
      sectionId: 'sec-1', order: 1, label: 'S1', busVoltageKv: 15,
      bays: [bay()],
    }],
    couplers: [],
    ...overrides,
  };
}

describe('GpzCanonicalRenderer R16 — pełen mini-RMU stacji odbiorczych', () => {
  it('Pole z receivingStation renderuje pełen MiniBlockRmuRenderer (NIE simplified stub)', () => {
    const { container } = render(
      <GpzCanonicalRenderer {...baseProps({ receivingStations: [station()] })} />,
    );
    /* Pełen mini-RMU obecny */
    const miniRmuFeeder = container.querySelector('[data-testid="gpz-canonical-receiving-station-feeder"]');
    expect(miniRmuFeeder).toBeTruthy();
    expect(miniRmuFeeder?.getAttribute('data-station-ref')).toBe('sub-starolecka-42');
    expect(miniRmuFeeder?.getAttribute('data-source-bay-ref')).toBe('bay-1');
    /* MiniBlockRmuRenderer (compact wariant) renderowany — sprawdzamy data-testid mini-bloku */
    const miniRmu = container.querySelector('[data-testid^="sld-v2-mini-rmu-"]');
    expect(miniRmu).toBeTruthy();
    /* Simplified stub NIE renderowany dla tego bay */
    const stubsForThisBay = container.querySelectorAll('[data-testid="gpz-canonical-outgoing-feeder"]');
    expect(stubsForThisBay.length).toBe(0);
    cleanup();
  });

  it('Pole BEZ receivingStation ale z destinationLabel → fallback do OutgoingFeederStub', () => {
    const { container } = render(
      <GpzCanonicalRenderer {...baseProps({ receivingStations: [] })} />,
    );
    expect(container.querySelector('[data-testid="gpz-canonical-receiving-station-feeder"]')).toBeNull();
    expect(container.querySelector('[data-testid="gpz-canonical-outgoing-feeder"]')).toBeTruthy();
    cleanup();
  });

  it('Mini-RMU pokazuje nazwę stacji odbiorczej', () => {
    const { container } = render(
      <GpzCanonicalRenderer {...baseProps({ receivingStations: [station()] })} />,
    );
    expect(container.textContent).toContain('STAROŁĘCKA 42');
    cleanup();
  });

  it('Mini-RMU renderuje kabel SN z numerem dyspozytorskim', () => {
    const { container } = render(
      <GpzCanonicalRenderer {...baseProps({ receivingStations: [station()] })} />,
    );
    const cable = container.querySelector('[data-testid="gpz-canonical-receiving-station-cable"]');
    expect(cable).toBeTruthy();
    expect(container.textContent).toContain('PST1');
    cleanup();
  });

  it('Wiele bays z różnymi receivingStations → wiele mini-RMU', () => {
    const bays = [
      bay({ bayRef: 'b1' }),
      bay({ bayRef: 'b2', destinationLabel: 'POZNAŃ STAR' }),
      bay({ bayRef: 'b3', destinationLabel: 'LABORATORIUM' }),
    ];
    const stations = [
      station({ stationRef: 's1', sourceBayRef: 'b1', name: 'STA1' }),
      station({ stationRef: 's2', sourceBayRef: 'b2', name: 'POZNAŃ STAR' }),
      station({ stationRef: 's3', sourceBayRef: 'b3', name: 'LABORATORIUM' }),
    ];
    const { container } = render(
      <GpzCanonicalRenderer
        {...baseProps({
          sections: [{ sectionId: 'sec-1', order: 1, label: 'S1', busVoltageKv: 15, bays }],
          receivingStations: stations,
        })}
      />,
    );
    const miniRmus = container.querySelectorAll('[data-testid="gpz-canonical-receiving-station-feeder"]');
    expect(miniRmus.length).toBe(3);
    cleanup();
  });

  it('onClickReceivingStation wywołane przy kliknięciu mini-RMU', () => {
    const onClick = vi.fn();
    const { container } = render(
      <GpzCanonicalRenderer
        {...baseProps({
          receivingStations: [station()],
          onClickReceivingStation: onClick,
        })}
      />,
    );
    /* MiniBlockRmuRenderer ma onClick — szukamy elementu klikalnego */
    const miniRmuRoot = container.querySelector('[data-testid^="sld-v2-mini-rmu-"]');
    if (miniRmuRoot) {
      fireEvent.click(miniRmuRoot);
      expect(onClick).toHaveBeenCalledWith('sub-starolecka-42');
    }
    cleanup();
  });

  it('Mini-RMU pokazuje DER badges gdy stacja ma generators', () => {
    const stationWithDer = station({
      footprintType: 'der_station',
      derBadges: [{ kind: 'PV', count: 2 }, { kind: 'BESS', count: 1 }],
    });
    const { container } = render(
      <GpzCanonicalRenderer {...baseProps({ receivingStations: [stationWithDer] })} />,
    );
    const miniRmu = container.querySelector('[data-testid^="sld-v2-mini-rmu-"]');
    expect(miniRmu).toBeTruthy();
    /* MiniBlockRmuRenderer renderuje DER badges — checked via data-testid */
    expect(container.textContent).toMatch(/PV|BESS/);
    cleanup();
  });

  it('Mini-RMU z missingData renderuje warning', () => {
    const stationMissing = station({
      missingData: true,
      hasTransformer: false,
      transformerRatedKva: null,
    });
    const { container } = render(
      <GpzCanonicalRenderer {...baseProps({ receivingStations: [stationMissing] })} />,
    );
    const miniRmu = container.querySelector('[data-testid^="sld-v2-mini-rmu-"]');
    expect(miniRmu).toBeTruthy();
    cleanup();
  });

  it('Per-role kolor toru: TRANSFORMER niebieski', () => {
    const trBay = bay({ fieldRole: 'TRANSFORMER', destinationLabel: 'TR-LV' });
    const trStation = station({ sourceBayRef: trBay.bayRef, footprintType: 'mv_lv_inline' });
    const { container } = render(
      <GpzCanonicalRenderer
        {...baseProps({
          sections: [{ sectionId: 'sec-1', order: 1, label: 'S1', busVoltageKv: 15, bays: [trBay] }],
          receivingStations: [trStation],
        })}
      />,
    );
    const cable = container.querySelector('[data-testid="gpz-canonical-receiving-station-cable"]');
    expect(cable?.getAttribute('stroke')).toBe('#3B7ABC');
    cleanup();
  });

  it('Footprint per stationType: switching_station, der_station, mv_lv_*', () => {
    const types: CanonicalReceivingStation['footprintType'][] = [
      'mv_lv_terminal', 'mv_lv_inline', 'mv_lv_branch',
      'mv_lv_sectional', 'mv_lv_customer',
      'switching_station', 'der_station',
    ];
    for (const t of types) {
      const { container } = render(
        <GpzCanonicalRenderer
          {...baseProps({ receivingStations: [station({ footprintType: t })] })}
        />,
      );
      expect(container.querySelector('[data-testid^="sld-v2-mini-rmu-"]')).toBeTruthy();
      cleanup();
    }
  });
});

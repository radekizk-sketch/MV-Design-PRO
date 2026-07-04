/**
 * Phase R4: testy integracji canonicalGpzs w SldCanvasV2.
 *
 * Krytyczny kontrakt: gdy caller (SldWorkspaceContainer) dostarczy
 * `canonicalGpzs[id]`, kanwa MUSI renderować `GpzCanonicalRenderer`
 * (operator-grade SCADA OSD) zamiast legacy `GpzRenderer` (placeholder).
 *
 * Brak `canonicalGpzs[id]` (np. snapshot bez gpz_sections + bez bays) →
 * fallback do legacy renderera.
 *
 * Test ten chroni przed regresją "operator widzi GPZ 1 / TR1 / Sekcja 2"
 * z audytu `docs/audit/GPZ_RENDERER_REALITY_CHECK.md`.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

import { SldCanvasV2 } from '../SldCanvasV2';
import type { GpzRendererProps } from '../../renderer/GpzRenderer';
import type { GpzCanonicalRendererProps } from '../../renderer/GpzCanonicalRenderer';
import { FIELD_ROLE } from '../../domain/apparatusContracts';

function legacyGpzProps(id: string, name: string): GpzRendererProps {
  return {
    id,
    x: 100,
    y: 100,
    name,
    voltageHighKv: 110,
    voltageHighKvKnown: true,
    voltageLowKv: 15,
    transformerCount: 2,
    sections: [],
    couplers: [],
    feedersCount: 0,
  };
}

function canonicalGpzProps(id: string, name: string): GpzCanonicalRendererProps {
  return {
    id,
    x: 100,
    y: 100,
    name,
    transformers: [
      {
        transformerRef: 'tr-1',
        designation: 'T1',
        snMva: 25,
        uhvKv: 110,
        ulvKv: 15,
        vectorGroup: 'YNd11',
      },
      {
        transformerRef: 'tr-2',
        designation: 'T2',
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
        bays: [
          {
            bayRef: 'bay-1',
            bayNumber: '10',
            order: 1,
            fieldRole: 'LINE_OUT',
            feederName: 'PST1',
            destinationLabel: 'PST1',
            cbState: 'closed',
            dsState: 'closed',
            esState: 'open',
            qDesignations: { cb: 'Q0', dsBus: 'Q1', dsLin: 'Q9', es: 'Q8' },
            statusFlags: [],
            inManipulation: false,
          },
        ],
      },
    ],
    couplers: [],
  };
}

describe('SldCanvasV2 — canonicalGpzs integration (Phase R4)', () => {
  it('canonicalGpzs[id] obecny → renderuje GpzCanonicalRenderer (nie placeholder)', () => {
    const { container } = render(
      <SldCanvasV2
        width={800}
        height={600}
        gpzs={[legacyGpzProps('gpz-1', 'GPZ-5 PST')]}
        canonicalGpzs={[canonicalGpzProps('gpz-1', 'GPZ-5 PST')]}
        sections={[]}
        cableRuns={[]}
        stations={[]}
        ders={[]}
      />,
    );
    /* GpzCanonicalRenderer (aktywny renderer po konsolidacji 2026-07) wystawia
     * data-testid="sld-v2-gpz-canonical-<id>". Legacy GpzRenderer NIE ma tego. */
    const canonical = container.querySelector('[data-testid="sld-v2-gpz-canonical-gpz-1"]');
    expect(canonical).toBeTruthy();
    cleanup();
  });

  it('LOD 0 pokazuje czytelny znacznik GPZ jako zrodlo topologii', () => {
    const { container } = render(
      <SldCanvasV2
        width={800}
        height={600}
        gpzs={[legacyGpzProps('gpz-1', 'GPZ-5 PST')]}
        canonicalGpzs={[canonicalGpzProps('gpz-1', 'GPZ-5 PST')]}
        sections={[]}
        cableRuns={[]}
        stations={[]}
        ders={[]}
        lodOverride={0}
      />,
    );

    const overview = container.querySelector('[data-testid="sld-v2-gpz-overview-label-gpz-1"]');
    expect(overview).toBeTruthy();
    expect(overview?.textContent).toContain('GPZ-5 PST');
    expect(overview?.textContent?.toLowerCase()).toContain('źródło zasilania');
    cleanup();
  });

  it('LOD 0 skraca długą nazwę GPZ w znaczniku topologii', () => {
    const { container } = render(
      <SldCanvasV2
        width={800}
        height={600}
        gpzs={[legacyGpzProps('gpz-a', 'GPZ-A Główny 110/15 kV (K30)')]}
        canonicalGpzs={[canonicalGpzProps('gpz-a', 'GPZ-A Główny 110/15 kV (K30)')]}
        sections={[]}
        cableRuns={[]}
        stations={[]}
        ders={[]}
        lodOverride={0}
      />,
    );

    const overview = container.querySelector('[data-testid="sld-v2-gpz-overview-label-gpz-a"]');
    expect(overview?.textContent).toContain('GPZ-A');
    expect(overview?.textContent).not.toContain('Główny 110/15');
    expect(overview?.getAttribute('data-overview-name')).toBe('GPZ-A');
    cleanup();
  });

  it('klik pola w canonical GPZ wybiera konkretny obiekt BaySN', () => {
    const onSelectElement = vi.fn();
    const { container } = render(
      <SldCanvasV2
        width={800}
        height={600}
        gpzs={[legacyGpzProps('gpz-1', 'GPZ-5 PST')]}
        canonicalGpzs={[canonicalGpzProps('gpz-1', 'GPZ-5 PST')]}
        sections={[]}
        cableRuns={[]}
        stations={[]}
        ders={[]}
        onSelectElement={onSelectElement}
      />,
    );

    const bay = container.querySelector('[data-testid="gpz-canonical-bay-bay-1"]');
    expect(bay).toBeTruthy();
    fireEvent.click(bay as Element);
    expect(onSelectElement).toHaveBeenCalledWith('bay-1', 'bay');
    cleanup();
  });

  it('klik aparatu w polu GPZ wybiera aparat, a nie całe pole', () => {
    const onSelectElement = vi.fn();
    const { container } = render(
      <SldCanvasV2
        width={800}
        height={600}
        gpzs={[legacyGpzProps('gpz-1', 'GPZ-5 PST')]}
        canonicalGpzs={[canonicalGpzProps('gpz-1', 'GPZ-5 PST')]}
        sections={[]}
        cableRuns={[]}
        stations={[]}
        ders={[]}
        onSelectElement={onSelectElement}
      />,
    );

    const breaker = container.querySelector(
      '[data-element-kind="apparatus"][data-element-id="bay-1#breaker"][data-apparatus-kind="breaker"]',
    );
    expect(breaker).toBeTruthy();
    fireEvent.click(breaker as Element);
    expect(onSelectElement).toHaveBeenCalledWith('bay-1#breaker', 'apparatus');
    expect(onSelectElement).not.toHaveBeenCalledWith('bay-1', 'bay');
    cleanup();
  });

  it('prawy klik aparatu w polu GPZ otwiera menu aparatu (uziemnik)', () => {
    const onSelectElement = vi.fn();
    const onContextMenu = vi.fn();
    const { container } = render(
      <SldCanvasV2
        width={800}
        height={600}
        gpzs={[legacyGpzProps('gpz-1', 'GPZ-5 PST')]}
        canonicalGpzs={[canonicalGpzProps('gpz-1', 'GPZ-5 PST')]}
        sections={[]}
        cableRuns={[]}
        stations={[]}
        ders={[]}
        onSelectElement={onSelectElement}
        onContextMenu={onContextMenu}
      />,
    );

    const earthingSwitch = container.querySelector(
      '[data-element-kind="apparatus"][data-element-id="bay-1#earthing_switch"][data-apparatus-kind="earthing_switch"]',
    );
    expect(earthingSwitch).toBeTruthy();
    fireEvent.contextMenu(earthingSwitch as Element, { clientX: 321, clientY: 123 });

    expect(onSelectElement).toHaveBeenCalledWith('bay-1#earthing_switch', 'apparatus');
    expect(onContextMenu).toHaveBeenCalledWith({
      kind: 'apparatus',
      elementId: 'bay-1#earthing_switch',
      clientX: 321,
      clientY: 123,
    });
    cleanup();
  });

  it('canonicalGpzs pusty (brak adapter result) → fallback do legacy GpzRenderer', () => {
    const { container } = render(
      <SldCanvasV2
        width={800}
        height={600}
        gpzs={[legacyGpzProps('gpz-1', 'GPZ Legacy')]}
        canonicalGpzs={[]}
        sections={[]}
        cableRuns={[]}
        stations={[]}
        ders={[]}
      />,
    );
    /* Brak canonical → legacy działa: znajdziemy nazwę w DOM (literalny tekst). */
    expect(container.querySelector('[data-testid="sld-v2-gpz-switchgear-gpz-1"]')).toBeNull();
    expect(container.textContent).toContain('GPZ Legacy');
    cleanup();
  });

  it('canonicalGpzs undefined (back-compat) → fallback do legacy', () => {
    const { container } = render(
      <SldCanvasV2
        width={800}
        height={600}
        gpzs={[legacyGpzProps('gpz-1', 'GPZ NoCanonical')]}
        sections={[]}
        cableRuns={[]}
        stations={[]}
        ders={[]}
      />,
    );
    expect(container.querySelector('[data-testid="sld-v2-gpz-switchgear-gpz-1"]')).toBeNull();
    cleanup();
  });

  it('Mix: część gpzs ma canonical, część nie → każdy id ma właściwy renderer', () => {
    const { container } = render(
      <SldCanvasV2
        width={800}
        height={600}
        gpzs={[
          legacyGpzProps('gpz-1', 'GPZ Canonical'),
          legacyGpzProps('gpz-2', 'GPZ Legacy Only'),
        ]}
        canonicalGpzs={[canonicalGpzProps('gpz-1', 'GPZ Canonical')]}
        sections={[]}
        cableRuns={[]}
        stations={[]}
        ders={[]}
      />,
    );
    /* Co najmniej jedno wystąpienie canonical i jedno legacy text. */
    expect(container.querySelectorAll('[data-testid="sld-v2-gpz-canonical-gpz-1"]').length).toBe(1);
    expect(container.textContent).toContain('GPZ Legacy Only');
    cleanup();
  });

  it('Canonical renderer pokazuje SCADA strukturę (nie placeholder text)', () => {
    const { container } = render(
      <SldCanvasV2
        width={800}
        height={600}
        gpzs={[legacyGpzProps('gpz-1', 'GPZ-5 PST')]}
        canonicalGpzs={[canonicalGpzProps('gpz-1', 'GPZ-5 PST')]}
        sections={[]}
        cableRuns={[]}
        stations={[]}
        ders={[]}
      />,
    );
    /* Inv 9: brak danych ≠ placeholder. Nie ma "GPZ 1", "?/15 kV", sklejonych etykiet. */
    expect(container.textContent).not.toContain('GPZ 1');
    expect(container.textContent).not.toContain('?/15 kV');
    expect(container.textContent).not.toContain('SekcSekcja');
    /* Renderowane są realne nazwy z propsów. GpzCanonicalRenderer renderuje
     * designation transformatora WIERNIE (T1/T2 — nie relabeluje pozycyjnie jak
     * dawny switchgear), sekcje po etykiecie (S1). */
    expect(container.textContent).toContain('GPZ-5 PST');
    expect(container.textContent).toContain('T1');
    expect(container.textContent).toContain('T2');
    expect(container.textContent).toContain('S1');
    cleanup();
  });

  it('kanwa renderuje stację z PV po nN jako mini-RMU z widocznymi wyłącznikami nN', () => {
    const { container } = render(
      <SldCanvasV2
        width={1000}
        height={700}
        gpzs={[legacyGpzProps('gpz-1', 'GPZ-5 PST')]}
        canonicalGpzs={[canonicalGpzProps('gpz-1', 'GPZ-5 PST')]}
        sections={[]}
        cableRuns={[
          {
            id: 'run-pv',
            runKind: 'main_trunk',
            segmentKind: 'cable_sn',
            pathPoints: [
              { x: 180, y: 272 },
              { x: 180, y: 360 },
              { x: 900, y: 360 },
            ],
          },
        ]}
        stations={[
          {
            id: 'st-pv',
            x: 620,
            y: 414,
            name: '01-K3583',
            topologicalType: 'przelotowa',
            lod: 2,
            footprintType: 'der_station',
            snBays: [
              { bayRef: 'we', fieldRole: FIELD_ROLE.RMU_LINE, designation: 'WE', hasMissingRequiredDevice: false },
              { bayRef: 'wy', fieldRole: FIELD_ROLE.RMU_LINE, designation: 'WY', hasMissingRequiredDevice: false },
              { bayRef: 'tr', fieldRole: FIELD_ROLE.RMU_TRANSFORMER, designation: 'TR', hasMissingRequiredDevice: false },
            ],
            hasTransformer: true,
            transformerRatedKva: 400,
            nnFeedersCount: 2,
            derBadges: [{ kind: 'PV', connectionSide: 'nn', count: 2 }],
          },
        ]}
        ders={[]}
      />,
    );

    expect(container.querySelector('[data-parity-key="station.mini.root"]')).toBeTruthy();
    expect(container.querySelector('[data-parity-key="station.mini.der_badges"]')).toBeTruthy();
    expect(container.querySelector('[data-parity-key="station.mini.der_badge"]')).toBeTruthy();
    cleanup();
  });

  it('prawy klik toru pola SN nie otwiera menu calego GPZ', () => {
    const onContextMenu = vi.fn();
    const { container } = render(
      <SldCanvasV2
        width={800}
        height={600}
        gpzs={[legacyGpzProps('gpz-1', 'GPZ-5 PST')]}
        canonicalGpzs={[canonicalGpzProps('gpz-1', 'GPZ-5 PST')]}
        sections={[]}
        cableRuns={[]}
        stations={[]}
        ders={[]}
        onContextMenu={onContextMenu}
      />,
    );

    const bayBody = container.querySelector('[data-testid="gpz-canonical-bay-bay-1"]');
    expect(bayBody).toBeTruthy();
    fireEvent.contextMenu(bayBody as Element, { clientX: 340, clientY: 240 });

    expect(onContextMenu).toHaveBeenCalledWith({
      kind: 'bay',
      elementId: 'bay-1',
      clientX: 340,
      clientY: 240,
    });
    expect(onContextMenu).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'gpz', elementId: 'gpz-1' }),
    );
    cleanup();
  });
});

describe('SldCanvasV2 - wybor transformatora WN/SN w GPZ', () => {
  it('klik transformatora WN/SN wybiera konkretny transformator, a nie caly GPZ', () => {
    const onSelectElement = vi.fn();
    const { container } = render(
      <SldCanvasV2
        width={800}
        height={600}
        gpzs={[legacyGpzProps('gpz-1', 'GPZ-5 PST')]}
        canonicalGpzs={[canonicalGpzProps('gpz-1', 'GPZ-5 PST')]}
        sections={[]}
        cableRuns={[]}
        stations={[]}
        ders={[]}
        onSelectElement={onSelectElement}
      />,
    );

    const transformer = container.querySelector('[data-testid="gpz-canonical-transformer-tr-1"]');
    expect(transformer).toBeTruthy();
    fireEvent.click(transformer as Element);

    expect(onSelectElement).toHaveBeenCalledWith('tr-1', 'transformer');
    expect(onSelectElement).not.toHaveBeenCalledWith('gpz-1', 'gpz');
    cleanup();
  });
});

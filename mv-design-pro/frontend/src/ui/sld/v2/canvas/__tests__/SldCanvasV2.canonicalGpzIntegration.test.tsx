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
import { describe, expect, it } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { SldCanvasV2 } from '../SldCanvasV2';
import type { GpzRendererProps } from '../../renderer/GpzRenderer';
import type { GpzCanonicalRendererProps } from '../../renderer/GpzCanonicalRenderer';

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
        voltageKv: 15,
        bays: [
          {
            bayRef: 'bay-1',
            order: 1,
            fieldRole: 'GPZ_LINE_BAY',
            feederName: 'PST1',
            apparatus: { cb: 'closed', dsLin: 'closed', dsBus: 'closed', es: 'open' },
            qDesignations: { cb: 'Q0', dsBus: 'Q1', dsLin: 'Q9', es: 'Q8' },
            statusFlags: [],
            controlMode: 'remote',
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
    /* GpzCanonicalRenderer wystawia data-testid="gpz-canonical-renderer".
     * Legacy GpzRenderer NIE ma tego atrybutu. */
    const canonical = container.querySelector('[data-testid="sld-v2-gpz-canonical-gpz-1"]');
    expect(canonical).toBeTruthy();
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
    expect(container.querySelector('[data-testid="sld-v2-gpz-canonical-gpz-1"]')).toBeNull();
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
    expect(container.querySelector('[data-testid="sld-v2-gpz-canonical-gpz-1"]')).toBeNull();
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
    /* Inv 9: brak danych ≠ placeholder. Nie ma "GPZ 1", "TR1", "Sekcja 2". */
    expect(container.textContent).not.toContain('GPZ 1');
    expect(container.textContent).not.toContain('?/15 kV');
    expect(container.textContent).not.toContain('SekcSekcja');
    /* Renderowane są realne nazwy z propsów. */
    expect(container.textContent).toContain('GPZ-5 PST');
    expect(container.textContent).toContain('T1');
    expect(container.textContent).toContain('T2');
    expect(container.textContent).toContain('S1');
    cleanup();
  });
});

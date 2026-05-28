/**
 * Iteracja "TechCard + spine guard": SLD v2 ma renderować ZKSN jako
 * rozdzielnicę SN bez transformatora, NIE jako pływającą etykietę odpiętą
 * od topologii. Te testy są wąskie z założenia — pilnują kontraktu
 * station-like + LOD compactness dla ZKSN/stacji.
 *
 * Reguły z STACJE_ELEKTROENERGETYCZNE_PROJECT_STANDARD §1–§4:
 *  - ZKSN to rozdzielnia SN bez transformatora → musi mieć szynę i pola,
 *    nie pojedynczy kafel.
 *  - Niewybrany ZKSN/stacja przy LOD ≥ 4 nadal pozostają kompaktowe.
 *  - Brak osobnego transformatorowego dekorum przy ZKSN.
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';

import { SldCanvasV2 } from '../SldCanvasV2';
import type { SldBranchPointMarker } from '../SldTopologyContracts';

const ZKSN_MARKER: SldBranchPointMarker = {
  id: 'bp_zksn_1',
  name: 'ZKSN-01',
  branchPointType: 'zksn',
  x: 400,
  y: 300,
  anchorX: 400,
  anchorY: 300,
  runRef: 'trunk_1',
  parentSegmentRef: 'seg_main_1',
  catalogRef: 'ZPUE/ZKSN-15/630',
  switchState: 'closed',
  branchPortCount: 1,
  switchgearFieldCount: 3,
  hasTransformer: false,
};

function renderCanvasWithZksn(opts: {
  selectedId?: string | null;
  lodOverride?: 0 | 1 | 2 | 3 | 4;
  onSelectElement?: (id: string, kind: string) => void;
}) {
  return render(
    <SldCanvasV2
      width={1024}
      height={768}
      gpzs={[]}
      sections={[]}
      cableRuns={[]}
      stations={[]}
      branchPoints={[ZKSN_MARKER]}
      ders={[]}
      selectedId={opts.selectedId ?? null}
      lodOverride={opts.lodOverride}
      onSelectElement={opts.onSelectElement}
    />,
  );
}

describe('SLD v2 — ZKSN renderuje się jako rozdzielnia SN bez transformatora', () => {
  it('niewybrane ZKSN przy LOD 4 nie eksploduje w osobne pływające symbole — pozostaje station-like switchgear', () => {
    const { container } = renderCanvasWithZksn({ lodOverride: 4 });

    const zksnSwitchgear = container.querySelector(
      `[data-testid="sld-v2-zksn-switchgear-${ZKSN_MARKER.id}"]`,
    );
    expect(zksnSwitchgear, 'brak węzła rozdzielni SN dla ZKSN').not.toBeNull();
    expect(zksnSwitchgear?.getAttribute('data-zksn-renderer')).toBe('station-like-switchgear');
    expect(zksnSwitchgear?.getAttribute('data-has-transformer')).toBe('false');

    // Niewybrana stacja/ZKSN przy LOD 4 pozostaje w wariancie compact.
    const rmuRoot = container.querySelector(
      `[data-testid="sld-v2-mini-rmu-zksn-${ZKSN_MARKER.id}"]`,
    );
    expect(rmuRoot, 'brak mini-bloku ZKSN').not.toBeNull();
    expect(rmuRoot?.getAttribute('data-lod-variant')).toBe('compact');
    expect(rmuRoot?.getAttribute('data-element-kind')).toBe('mini_block_compact');
  });

  it('wybrane ZKSN pokazuje wariant szczegółowy bez sekcji nN ani transformatorowego pola', () => {
    const { container } = renderCanvasWithZksn({ selectedId: ZKSN_MARKER.id, lodOverride: 4 });

    const rmuRoot = container.querySelector(
      `[data-testid="sld-v2-mini-rmu-zksn-${ZKSN_MARKER.id}"]`,
    );
    expect(rmuRoot?.getAttribute('data-lod-variant')).toBe('compact');
    expect(rmuRoot?.getAttribute('data-footprint-type')).toBe('switching_station');

    // Brak sekcji nN — ZKSN to wyłącznie pole rozdzielni SN.
    const lvBus = rmuRoot?.querySelector('[data-parity-key="station.mini.bus.lv"]');
    expect(lvBus, 'ZKSN nie powinien mieć szyny nN').toBeNull();

    // Brak pól transformatorowych.
    const trBays = rmuRoot?.querySelectorAll('[data-testid^="sld-v2-mini-rmu-tr-bay-"]');
    expect(trBays?.length ?? 0, 'ZKSN nie powinien mieć pola transformatorowego').toBe(0);

    // SN ma szynę i pola.
    const snBus = rmuRoot?.querySelector('[data-parity-key="station.mini.bus.sn"]');
    expect(snBus, 'brak szyny SN w ZKSN').not.toBeNull();
    const snBays = rmuRoot?.querySelectorAll('[data-testid^="sld-v2-bay-column-sn-"]');
    expect(snBays?.length ?? 0).toBeGreaterThanOrEqual(2);

    // ZKSN ma jedną czytelną warstwę etykiet pól: WE/WY/ODG, bez zdublowanych IN/OUT/BR.
    const roleBadges = rmuRoot?.querySelectorAll('[data-testid$="-role"]');
    expect(roleBadges?.length ?? 0, 'ZKSN nie powinien dublować roli pola pod aparaturą').toBe(0);
    const designationTexts = Array.from(
      rmuRoot?.querySelectorAll('[data-testid^="sld-v2-mini-rmu-compact-port-caption-"]') ?? [],
    ).map((node) => node.textContent?.trim() ?? '');
    expect(designationTexts).toEqual(expect.arrayContaining(['WE', 'WY', 'ODG 1']));
  });

  it('ZKSN przy LOD 1 (przegląd) zachowuje station-like footprint, nie redukuje się do kafla', () => {
    const { container } = renderCanvasWithZksn({ lodOverride: 1 });

    const zksnSwitchgear = container.querySelector(
      `[data-testid="sld-v2-zksn-switchgear-${ZKSN_MARKER.id}"]`,
    );
    expect(zksnSwitchgear).not.toBeNull();
    expect(zksnSwitchgear?.getAttribute('data-switchgear-visual')).toBe('station-node');
  });

  it('przywrócone zaznaczenie ZKSN w dużej sieci podnosi skalę do czytelnego LOD', async () => {
    const marker: SldBranchPointMarker = {
      ...ZKSN_MARKER,
      id: 'bp_zksn_far',
      x: 8_000,
      y: 300,
      anchorX: 8_000,
      anchorY: 300,
    };

    const { container } = render(
      <SldCanvasV2
        width={900}
        height={640}
        gpzs={[]}
        sections={[]}
        cableRuns={[
          {
            id: 'run-large',
            runKind: 'main_trunk',
            pathPoints: [
              { x: 0, y: 300 },
              { x: 10_000, y: 300 },
            ],
            segmentKind: 'cable_sn',
          },
        ]}
        stations={[]}
        branchPoints={[marker]}
        ders={[]}
        selectedId={marker.id}
        centerOnElementId={marker.id}
      />,
    );

    await waitFor(() => {
      const canvas = container.querySelector('[data-testid="sld-canvas-v2"]');
      expect(Number(canvas?.getAttribute('data-scale'))).toBeGreaterThanOrEqual(0.75);
      expect(Number(canvas?.getAttribute('data-lod'))).toBeGreaterThanOrEqual(2);
    });
  });
  it('klik widocznej rozdzielni ZKSN wybiera karte techniczna ZKSN, nie ginie na etykiecie', () => {
    const onSelectElement = vi.fn();
    const { container } = renderCanvasWithZksn({ lodOverride: 1, onSelectElement });

    const zksnSwitchgear = container.querySelector(
      `[data-testid="sld-v2-zksn-switchgear-${ZKSN_MARKER.id}"]`,
    );
    expect(zksnSwitchgear).not.toBeNull();
    fireEvent.click(zksnSwitchgear!);
    expect(onSelectElement).toHaveBeenLastCalledWith(ZKSN_MARKER.id, 'zksn');

    const visibleCode = container.querySelector(
      `[data-testid="sld-v2-mini-rmu-overview-code-zksn-${ZKSN_MARKER.id}"]`,
    );
    expect(visibleCode).not.toBeNull();
    fireEvent.click(visibleCode!);
    expect(onSelectElement).toHaveBeenLastCalledWith(ZKSN_MARKER.id, 'zksn');
  });

  it('ZKSN z jednym odplywem nie pokazuje sztucznego czwartego pola jako portu trasy', () => {
    const marker: SldBranchPointMarker = {
      ...ZKSN_MARKER,
      switchgearFieldCount: 4,
      branchPortCount: 1,
    };
    const { container } = render(
      <SldCanvasV2
        width={1024}
        height={768}
        gpzs={[]}
        sections={[]}
        cableRuns={[]}
        stations={[]}
        branchPoints={[marker]}
        ders={[]}
        selectedId={marker.id}
        lodOverride={3}
      />,
    );

    const designations = Array.from(
      container.querySelectorAll('[data-testid^="sld-v2-mini-rmu-compact-port-caption-"]'),
    ).map((node) => node.textContent?.trim() ?? '');
    expect(designations).toEqual(['WE', 'WY', 'ODG 1']);
    expect(designations).not.toContain('Pole 4');
  });

  it('przecina kabel na portach WE/WY ZKSN zamiast prowadzic ciag przez srodek rozdzielni', () => {
    const marker: SldBranchPointMarker = {
      ...ZKSN_MARKER,
      x: 400,
      y: 380,
      anchorX: 400,
      anchorY: 300,
      switchgearFieldCount: 4,
      branchPortCount: 1,
    };
    const { container } = render(
      <SldCanvasV2
        width={1024}
        height={768}
        gpzs={[]}
        sections={[]}
        cableRuns={[{
          id: 'run-zksn-main',
          runKind: 'main_trunk',
          pathPoints: [
            { x: 100, y: 300 },
            { x: 700, y: 300 },
          ],
          segmentKind: 'cable_sn',
        }]}
        stations={[]}
        branchPoints={[marker]}
        ders={[]}
        selectedId={marker.id}
        lodOverride={2}
      />,
    );

    const visiblePaths = Array.from(
      container.querySelectorAll('[data-testid^="sld-v2-run-run-zksn-main-visible-"]'),
    ).map((path) => path.getAttribute('d'));
    expect(visiblePaths.length).toBeGreaterThanOrEqual(2);
    expect(visiblePaths.join(' | ')).not.toContain('M 100 300 L 700 300');
    expect(container.querySelector('[data-testid="sld-v2-branch-point-route-anchor-bp_zksn_1"]')).toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-zksn-route-drop-bp_zksn_1"]')).toBeNull();
  });
});

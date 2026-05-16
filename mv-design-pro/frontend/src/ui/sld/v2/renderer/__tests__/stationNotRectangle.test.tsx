/**
 * PR 3 (minimal) — Test strukturalny: stacja NIE jest pojedynczym prostokątem ani rombem.
 *
 * MiniBlockRmuRenderer LOD 0/1 musi pokazywać pola IN/OUT/TR/DER jako mini-cele,
 * nie pojedynczy prostokąt. To guard wizualnej jakości operatorskiej —
 * uniemożliwia regresję do "stacja=jeden kwadrat" lub "stacja=jeden romb".
 *
 * Reguła: każda mini-RMU (compact/detail variant) musi mieć przynajmniej 2
 * znaczniki pól (`sld-v2-mini-rmu-bay-marker-*`) i znacznik strony SN
 * (`sld-v2-mini-rmu-sn-row`).
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { MiniBlockRmuRenderer } from '../MiniBlockRmuRenderer';
import type { MiniBlockBayDescriptor } from '../MiniBlockRmuRenderer';

const BAYS: MiniBlockBayDescriptor[] = [
  { bayRef: 'bay_in', fieldRole: 'LINE_IN', designation: 'BAY-IN', hasMissingRequiredDevice: false },
  { bayRef: 'bay_out', fieldRole: 'LINE_OUT', designation: 'BAY-OUT', hasMissingRequiredDevice: false },
  { bayRef: 'bay_tr', fieldRole: 'TRANSFORMER', designation: 'BAY-TR', hasMissingRequiredDevice: false },
];

describe('Mini-RMU: station NOT rectangle (PR 3 minimal guard)', () => {
  it.each([
    ['mv_lv_terminal'] as const,
    ['mv_lv_inline'] as const,
    ['mv_lv_branch'] as const,
    ['mv_lv_sectional'] as const,
  ])('footprint %s — variant compact pokazuje mini-pola, nie jeden prostokąt', (footprintType) => {
    const { container } = render(
      <svg>
        <MiniBlockRmuRenderer
          id="st_compact"
          x={0}
          y={0}
          variant="compact"
          footprintType={footprintType}
          name="Stacja"
          snBays={BAYS}
          hasTransformer
          transformerRatedKva={630}
          nnFeedersCount={2}
          derBadges={[]}
          missingData={false}
        />
      </svg>,
    );

    // 1. Renderer obecny.
    const rmu = container.querySelector('[data-testid="sld-v2-mini-rmu-st_compact"]');
    expect(rmu).not.toBeNull();

    // 2. Znacznik strony SN obecny (oddzielona szyna, nie blob).
    const snRow = container.querySelector('[data-parity-key="station.mini.bus.sn"]');
    expect(snRow, `${footprintType}: brak sn-row`).not.toBeNull();

    // 3. ≥2 markery pól (bay markers) — kluczowy test "nie prostokąt".
    const bayMarkers = container.querySelectorAll('[data-testid^="sld-v2-bay-column-sn-"]');
    expect(
      bayMarkers.length,
      `${footprintType}: tylko ${bayMarkers.length} mini-pole — stacja redukuje się do prostokąta`,
    ).toBeGreaterThanOrEqual(2);
  });

  it('variant detail (LOD 2+) pokazuje wszystkie pola + rzędy SN i nN', () => {
    const { container } = render(
      <svg>
        <MiniBlockRmuRenderer
          id="st_detail"
          x={0}
          y={0}
          variant="detail"
          footprintType="mv_lv_inline"
          name="Stacja D"
          snBays={BAYS}
          hasTransformer
          transformerRatedKva={400}
          nnFeedersCount={4}
          derBadges={[]}
          missingData={false}
        />
      </svg>,
    );

    expect(container.querySelector('[data-parity-key="station.mini.bus.sn"]')).not.toBeNull();
    // K30-31: LV bus + LV bay columns (replacing old 'lv-row' + 'tr-triangle')
    expect(container.querySelector('[data-parity-key="station.mini.bus.lv"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid^="sld-v2-bay-column-lv-"]').length).toBeGreaterThanOrEqual(1);
    expect(container.querySelectorAll('[data-testid^="sld-v2-mini-rmu-tr-bay-"]').length).toBeGreaterThanOrEqual(1);
    const bayMarkers = container.querySelectorAll('[data-testid^="sld-v2-bay-column-sn-"]');
    expect(bayMarkers.length).toBeGreaterThanOrEqual(2);
  });

  it('variant overview (LOD 0) NIE jest pojedynczym <rect> — ma sygnaturę footprintu i nazwę', () => {
    const { container } = render(
      <svg>
        <MiniBlockRmuRenderer
          id="st_overview"
          x={0}
          y={0}
          variant="overview"
          footprintType="mv_lv_terminal"
          name="Stacja O"
          snBays={BAYS}
          hasTransformer
          transformerRatedKva={250}
          nnFeedersCount={1}
          derBadges={[]}
          missingData={false}
        />
      </svg>,
    );
    const rmu = container.querySelector('[data-testid="sld-v2-mini-rmu-st_overview"]');
    expect(rmu).not.toBeNull();
    // Renderer w wariancie overview może NIE pokazywać mini-pól, ale musi mieć
    // identyfikowalną strukturę footprintu (data-parity-key) — nie być
    // gołym <rect>.
    const allDataParity = rmu?.querySelectorAll('[data-parity-key]');
    expect(allDataParity?.length ?? 0, 'overview bez data-parity-key — generic rectangle').toBeGreaterThan(0);
  });
});

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FIELD_ROLE } from '../../domain/apparatusContracts';
import { MiniBlockRmuRenderer } from '../MiniBlockRmuRenderer';

// Karta GPZ-PARYTET: lista kluczy GPZ i oba testy renderera v2 `GpzCanonicalRenderer`
// skasowane razem z rendererem (żaden ekran go nie renderował). Kontrakt kluczy GPZ żyje
// w kompozycji v3: `v3/compose/__tests__/gpz.test.ts` (każdy klucz z realnym testem
// zachowania albo kontraktem negatywnym).

// K30-31: bay-column architecture parity keys. Legacy
// (sn_row/bay/line_switch/transformer_field/lv_row/transformer) replaced z
// bay column components (BayColumnSn / BayColumnLv) + ApparatusTransformerSymbol.
const REQUIRED_MINI_RMU_PARITY_KEYS = [
  'station.mini.root',
  'station.mini.body',
  'station.mini.name',
  'station.mini.type',
  'station.mini.bus.sn',
  'station.mini.bus.lv',
  'station.mini.tr.primary_lead',
  'station.mini.tr.secondary_lead',
  'station.mini.der_badges',
  'station.mini.der_badge',
  'station.mini.missing',
] as const;

function collectParityKeys(container: HTMLElement): Set<string> {
  return new Set(
    Array.from(container.querySelectorAll('[data-parity-key]'))
      .map((node) => node.getAttribute('data-parity-key'))
      .filter((key): key is string => typeof key === 'string' && key.length > 0),
  );
}

function expectParityKeys(
  container: HTMLElement,
  expected: readonly string[],
): void {
  const keys = collectParityKeys(container);
  const missing = expected.filter((key) => !keys.has(key));
  expect(missing).toEqual([]);
}

describe('SLD visual parity checklist hooks', () => {
  it('mini-RMU renderer exposes structural parity keys for field network evidence', () => {
    const { container } = render(
      <svg>
        <MiniBlockRmuRenderer
          id="st-parity"
          x={0}
          y={0}
          variant="detail"
          footprintType="mv_lv_inline"
          name="ST-01"
          snBays={[
            {
              bayRef: 'rmu-in',
              fieldRole: FIELD_ROLE.RMU_LINE,
              designation: 'L1',
              hasMissingRequiredDevice: false,
            },
            {
              bayRef: 'rmu-out',
              fieldRole: FIELD_ROLE.RMU_LINE,
              designation: 'L2',
              hasMissingRequiredDevice: false,
            },
            {
              bayRef: 'rmu-tr',
              fieldRole: FIELD_ROLE.RMU_TRANSFORMER,
              designation: 'TR',
              hasMissingRequiredDevice: false,
            },
          ]}
          hasTransformer
          transformerRatedKva={630}
          nnFeedersCount={4}
          derBadges={[
            { kind: 'PV', count: 1 },
            { kind: 'BESS', count: 1 },
            { kind: 'FW', count: 1 },
          ]}
          missingData
        />
      </svg>,
    );

    expectParityKeys(container, REQUIRED_MINI_RMU_PARITY_KEYS);
  });
});

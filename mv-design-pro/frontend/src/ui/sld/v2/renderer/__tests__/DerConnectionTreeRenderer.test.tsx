/**
 * DerConnectionTreeRenderer + DerRenderer.missingPcc tests (Phase 0C / Phase 4).
 *
 * Pokrycie:
 *   1. DerConnectionTree renderuje wszystkie 5 wariantów.
 *   2. block_transformer / DEDICATED_MV / SOURCE_CONNECTION_STATION → trafo blokowy w drzewie.
 *   3. nn_side / LV_BEHIND_STATION_TRANSFORMER → bez trafa blokowego.
 *   4. PCC label widoczny nad anchor.
 *   5. nominalPowerKw wyświetlane.
 *   6. missingPcc → czerwony X badge dominujący na drzewie.
 *   7. DerRenderer.missingPcc → czerwony X badge na rombie.
 *   8. data-testid dla każdej części drzewa.
 *   9. selected → highlighted stroke.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  type DerConnectionVariant,
  DerConnectionTreeRenderer,
} from '../DerConnectionTreeRenderer';
import { DerRenderer } from '../DerRenderer';

const ANCHOR = { x: 100, y: 100 };

function tree(props: Partial<React.ComponentProps<typeof DerConnectionTreeRenderer>> = {}) {
  return render(
    <svg>
      <DerConnectionTreeRenderer
        id="der-1"
        anchor={ANCHOR}
        kind="PV"
        name="DER PV 1"
        nominalPowerKw={500}
        variant="nn_side"
        pccLabel="Stacja S05 / Bus nN"
        {...props}
      />
    </svg>,
  );
}

describe('DerConnectionTreeRenderer — render i strukturalne data-testid', () => {
  it('Root group ma data-element-kind="der_sub_tree" + data-element-id', () => {
    const { container } = tree();
    const root = container.querySelector('[data-testid="sld-v2-der-tree-der-1"]');
    expect(root).toBeTruthy();
    expect(root!.getAttribute('data-element-kind')).toBe('der_sub_tree');
    expect(root!.getAttribute('data-element-id')).toBe('der-1');
    expect(root!.getAttribute('data-der-kind')).toBe('PV');
    expect(root!.getAttribute('data-variant')).toBe('nn_side');
  });

  it('Falownik (inverter) jest renderowany jako osobny sub-tree', () => {
    const { container } = tree();
    expect(container.querySelector('[data-testid="sld-v2-der-tree-der-1-inverter"]')).toBeTruthy();
  });

  it('compact DER bez wyboru pokazuje transformator blokowy, zeby nie mylic go z TR stacji', () => {
    const { container } = render(
      <svg>
        <DerRenderer
          id="der-terrain"
          x={100}
          y={100}
          kind="PV"
          name="PV 1 MW"
          nominalPowerKw={1000}
          hasBlockTransformer
          blockTransformerLabel="TR 15/0,69 kV 1250 kVA Dyn5"
          operatingPMw={1}
          lod="compact"
        />
      </svg>,
    );

    expect(container.querySelector('[data-testid="sld-v2-der-der-terrain-compact-power"]')).not.toBeNull();
    const blockTransformer = container.querySelector('[data-testid="sld-v2-der-der-terrain-compact-block-transformer"]');
    expect(blockTransformer).not.toBeNull();
    expect(blockTransformer?.textContent).toContain('TR blokowy 1250 kVA');
    expect(container.querySelector('[data-testid="sld-v2-der-der-terrain-compact-cos-phi"]')).toBeNull();
  });

  it('compact DER po wyborze pokazuje detale techniczne ukladu przylaczeniowego', () => {
    const { container } = render(
      <svg>
        <DerRenderer
          id="der-selected"
          x={100}
          y={100}
          kind="PV"
          name="PV 1 MW"
          nominalPowerKw={1000}
          hasBlockTransformer
          blockTransformerLabel="TR 15/0,69 kV 1250 kVA Dyn5"
          operatingPMw={1}
          lod="compact"
          selected
        />
      </svg>,
    );

    expect(container.querySelector('[data-testid="sld-v2-der-der-selected-compact-block-transformer"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-der-der-selected-compact-cos-phi"]')).not.toBeNull();
  });
});

describe('DerConnectionTreeRenderer — variant decyduje czy renderować trafo blokowy', () => {
  const variantsWithBlockTransformer: DerConnectionVariant[] = [
    'block_transformer',
    'DEDICATED_MV_CONNECTION',
    'SOURCE_CONNECTION_STATION',
  ];
  const variantsWithoutBlockTransformer: DerConnectionVariant[] = [
    'nn_side',
    'LV_BEHIND_STATION_TRANSFORMER',
  ];

  for (const variant of variantsWithBlockTransformer) {
    it(`variant=${variant} → trafo blokowy obecny w drzewie`, () => {
      const { container } = tree({ variant });
      expect(
        container.querySelector('[data-testid="sld-v2-der-tree-der-1-block-transformer"]'),
      ).toBeTruthy();
    });
  }

  for (const variant of variantsWithoutBlockTransformer) {
    it(`variant=${variant} → BEZ trafa blokowego (jest trafo stacji, nie blokowy)`, () => {
      const { container } = tree({ variant });
      expect(
        container.querySelector('[data-testid="sld-v2-der-tree-der-1-block-transformer"]'),
      ).toBeNull();
    });
  }
});

describe('DerConnectionTreeRenderer — etykiety PCC + nominalPower', () => {
  it('pccLabel renderowany nad anchor', () => {
    const { getByText } = tree({ pccLabel: 'GPZ-1 / Sekcja A' });
    expect(getByText('GPZ-1 / Sekcja A')).toBeTruthy();
  });

  it('nominalPowerKw wyświetlany w "kW"', () => {
    const { getByText } = tree({ nominalPowerKw: 1500 });
    expect(getByText('1500 kW')).toBeTruthy();
  });

  it('nominalPowerKw=null → pomijany', () => {
    const { queryByText } = tree({ nominalPowerKw: null });
    expect(queryByText(/kW/)).toBeNull();
  });

  it('Variant label po Polsku pod drzewem', () => {
    const { getByText } = tree({ variant: 'block_transformer' });
    expect(getByText('trafo blokowy')).toBeTruthy();
  });
});

describe('DerConnectionTreeRenderer — missing PCC blocker', () => {
  it('missingPcc=true → czerwony X badge dominujący', () => {
    const { container } = tree({ missingPcc: true });
    expect(
      container.querySelector('[data-testid="sld-v2-der-tree-der-1-blocker"]'),
    ).toBeTruthy();
  });

  it('missingPcc=true → tekst "BLOKADA PCC" widoczny', () => {
    const { getByText } = tree({ missingPcc: true });
    expect(getByText('BLOKADA PCC')).toBeTruthy();
  });

  it('missingPcc=true → root ma data-missing-pcc="true"', () => {
    const { container } = tree({ missingPcc: true });
    const root = container.querySelector('[data-testid="sld-v2-der-tree-der-1"]');
    expect(root!.getAttribute('data-missing-pcc')).toBe('true');
  });

  it('missingPcc=false (default) → blocker NIE renderowany', () => {
    const { container } = tree();
    expect(
      container.querySelector('[data-testid="sld-v2-der-tree-der-1-blocker"]'),
    ).toBeNull();
  });
});

describe('DerConnectionTreeRenderer — kind colors per type', () => {
  it('PV/BESS/FW mają różne data-der-kind', () => {
    for (const kind of ['PV', 'BESS', 'FW'] as const) {
      const { container } = tree({ kind });
      const root = container.querySelector('[data-testid="sld-v2-der-tree-der-1"]');
      expect(root!.getAttribute('data-der-kind')).toBe(kind);
    }
  });
});

describe('DerRenderer.missingPcc — czerwony X na rombie', () => {
  it('missingPcc=true → badge data-testid', () => {
    const { container } = render(
      <svg>
        <DerRenderer
          id="der-1"
          x={100}
          y={100}
          kind="PV"
          name="DER PV"
          nominalPowerKw={500}
          missingPcc
        />
      </svg>,
    );
    expect(container.querySelector('[data-testid="sld-v2-der-der-1-missing-pcc"]')).toBeTruthy();
  });

  it('missingPcc=false (default) → badge NIE renderowany', () => {
    const { container } = render(
      <svg>
        <DerRenderer
          id="der-1"
          x={100}
          y={100}
          kind="PV"
          name="DER PV"
        />
      </svg>,
    );
    expect(container.querySelector('[data-testid="sld-v2-der-der-1-missing-pcc"]')).toBeNull();
  });

  it('missingPcc nie wpływa na LOD=marker (tylko full/compact mają badge)', () => {
    const { container } = render(
      <svg>
        <DerRenderer
          id="der-1"
          x={100}
          y={100}
          kind="PV"
          name="X"
          missingPcc
          lod="marker"
        />
      </svg>,
    );
    // marker LOD wraca early → badge NIE renderowany w marker mode
    expect(container.querySelector('[data-testid="sld-v2-der-der-1-missing-pcc"]')).toBeNull();
  });
});

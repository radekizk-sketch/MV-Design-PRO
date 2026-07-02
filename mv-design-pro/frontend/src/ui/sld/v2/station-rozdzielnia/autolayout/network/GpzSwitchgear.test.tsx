/**
 * E3b — GPZ rendered as a FULL SWITCHGEAR (not a box), from the model: title block, WN incomer,
 * WN/SN transformer(s) with rating, 15 kV section busbar, numbered feeder field(s) with apparatus
 * and destination, IEC legend. Deterministic; scales to N transformers / feeders.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GpzSwitchgear } from './GpzSwitchgear';
import type { NetworkGpz } from './networkModel';
import { SLD_NETWORK_53 } from './sldNetwork53';

function svg(gpz: NetworkGpz): SVGSVGElement {
  const { container } = render(<svg><GpzSwitchgear gpz={gpz} /></svg>);
  return container.querySelector('svg')!;
}

describe('E3b — GPZ as a full switchgear (from the model)', () => {
  const gpz = SLD_NETWORK_53.gpz;

  it('renders the GPZ structure: title, WN field, transformer, 15 kV section, feeder, legend', () => {
    const s = svg(gpz);
    const txt = s.textContent ?? '';
    expect(s.querySelector('[data-testid="gpz-switchgear"]')).toBeTruthy();
    expect(s.querySelector('[data-testid="gpz-wn"]')).toBeTruthy(); // WN (110) incomer
    expect(s.querySelector('[data-testid="gpz-legend"]')).toBeTruthy();
    expect(txt).toContain(gpz.name);
    expect(txt).toContain(`ROZDZIELNIA ${gpz.hv_kv}/${gpz.sn_kv} kV`);
  });

  it('transformer drawn with its rating FROM THE MODEL', () => {
    const s = svg(gpz);
    const tr = gpz.transformers[0];
    expect(s.querySelector(`[data-testid="gpz-tr-${tr.id}"]`)).toBeTruthy();
    expect(s.textContent).toContain(`${tr.mva} MVA`);
    expect(s.textContent).toContain(`${tr.uhv_kv}/${tr.ulv_kv} kV · YNd11`);
  });

  it('outgoing feeder field(s) carry the model name + destination', () => {
    const s = svg(gpz);
    const f = gpz.sections.flatMap((sec) => sec.feeders)[0];
    expect(s.querySelector('[data-testid="gpz-feeder-1"]')).toBeTruthy();
    expect(s.textContent).toContain(f.name.replace(/^Pole\s+/i, ''));
    if (f.to_name) expect(s.textContent).toContain(`→ ${f.to_name}`);
    expect(s.querySelectorAll('[data-testid^="gpz-feeder-"]').length).toBe(
      gpz.sections.reduce((n, sec) => n + sec.feeders.length, 0),
    );
  });

  it('is DETERMINISTIC — same model → identical markup', () => {
    expect(svg(gpz).innerHTML).toBe(svg(gpz).innerHTML);
  });

  it('scales: a 2-transformer / 2-feeder GPZ draws 2 transformers and 2 feeders', () => {
    const big: NetworkGpz = {
      ...gpz,
      transformers: [
        { id: 'TR1', mva: 25, uhv_kv: 110, ulv_kv: 15 },
        { id: 'TR2', mva: 25, uhv_kv: 110, ulv_kv: 15 },
      ],
      sections: [
        { name: 'Sekcja 1', order: 0, feeders: [{ name: 'Pole A', to: 'S01', to_name: 'A' }] },
        { name: 'Sekcja 2', order: 1, feeders: [{ name: 'Pole B', to: null, to_name: null }] },
      ],
    };
    const s = svg(big);
    expect(s.querySelector('[data-testid="gpz-tr-TR1"]')).toBeTruthy();
    expect(s.querySelector('[data-testid="gpz-tr-TR2"]')).toBeTruthy();
    expect(s.querySelectorAll('[data-testid^="gpz-feeder-"]').length).toBe(2);
    expect(s.textContent).toContain('Sekcja 1 · Sekcja 2');
  });
});

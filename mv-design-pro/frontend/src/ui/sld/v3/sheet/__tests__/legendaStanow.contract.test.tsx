/**
 * Karta PRZEGLAD-SIECI-JEDNA-KOMPOZYCJA, decyzja E: legenda kolorów stanu łącznika jest
 * zgodna z kontraktem stanów UX-04 (`docs/uiux/UX04_POLE_LINIOWE_WZORZEC.md`, konwencja
 * `STATE_COLOR`: zamknięty #C62828, otwarty #2E7D32, nieustalony #6B7280 ze znakiem „?",
 * błędny #8E44AD ze znakiem „!") i — przy jednej kompozycji — taka sama na każdym LOD.
 *
 * Iloczyn cech: {stan kafla × 4} × {motyw jasny · ciemny} dla próbki legendy oraz
 * {LOD 0/1/2} × {zbiór stanów sceny} dla wpisów legendy liczonych z projektu.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, type SceneLod } from '../../scene/buildScene';
import { zRekordamiAparatowPol } from '../../scene/__tests__/fixtures/rekordyAparatowPola';
import { stanKaflaLacznika } from '../../symbols/glyphs';
import { STATE_COLOR, STANY_KAFLA, DARK_SCADA_SLD_PALETTE } from '../../theme/colorTokens';
import { LIGHT_TECHNICAL_SLD_PALETTE, SldPaletteContext } from '../../theme/palette';
import { LegendStateTile } from '../Frame';
import { computeProjectLegendEntries, OPIS_KAFLA_LEGENDY_PL } from '../projectLegend';

const here = dirname(fileURLToPath(import.meta.url));
const enm = zRekordamiAparatowPol(
  (JSON.parse(
    readFileSync(resolve(here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json'), 'utf8'),
  ) as { readonly enm: EnergyNetworkModel }).enm,
);

/** Kontrakt UX-04 spisany z dokumentu (nie z kodu) — wyrocznia niezależna od `STATE_COLOR`. */
const UX04 = {
  zamkniety: { kolor: '#C62828', znak: null },
  otwarty: { kolor: '#2E7D32', znak: null },
  nieustalony: { kolor: '#6B7280', znak: '?' },
  bledny: { kolor: '#8E44AD', znak: '!' },
} as const;

describe('decyzja E — legenda stanów zgodna z UX-04', () => {
  it('tabela STATE_COLOR = kontrakt UX-04 (cztery stany, bez piątego)', () => {
    expect([...STANY_KAFLA].sort()).toEqual(Object.keys(UX04).sort());
    for (const stan of STANY_KAFLA) expect(STATE_COLOR[stan].toUpperCase()).toBe(UX04[stan].kolor);
  });

  for (const [motyw, paleta] of [['jasny', LIGHT_TECHNICAL_SLD_PALETTE], ['ciemny', DARK_SCADA_SLD_PALETTE]] as const) {
    it.each([...STANY_KAFLA])(`motyw ${motyw}: próbka legendy stanu %s ma kolor i znak z UX-04`, (stan) => {
      const { container } = render(
        <SldPaletteContext.Provider value={paleta}>
          <svg>
            <LegendStateTile id={`stan-${stan}`} y={0} />
          </svg>
        </SldPaletteContext.Provider>,
      );
      const kafel = container.querySelector(`[data-legenda-kafel="${stan}"]`)!;
      expect(kafel).toBeTruthy();
      expect(kafel.querySelector('rect')!.getAttribute('fill')!.toUpperCase()).toBe(UX04[stan].kolor);
      expect(kafel.querySelector('text')?.textContent ?? null).toBe(UX04[stan].znak);
    });
  }

  it('każdy stan ma opis legendy po polsku', () => {
    for (const stan of STANY_KAFLA) expect(OPIS_KAFLA_LEGENDY_PL[stan].length).toBeGreaterThan(10);
  });

  it.each([0, 1, 2] as SceneLod[])('LOD %s: wpisy stanów legendy = stany kafli narysowane na scenie (jedno źródło)', (lod) => {
    const scene = buildSceneV3(enm, lod);
    const naScenie = new Set(
      scene.symbols.map((s) => stanKaflaLacznika(s.symbolId, s.state)).filter((s): s is NonNullable<typeof s> => s !== null),
    );
    expect(naScenie.size).toBeGreaterThan(0);
    const wpisy = computeProjectLegendEntries(scene).filter((e) => e.kind === 'stan').map((e) => e.id);
    expect(wpisy).toEqual(STANY_KAFLA.filter((s) => naScenie.has(s)).map((s) => `stan-${s}`));
  });

  it('jedna kompozycja ⇒ ta sama legenda na L0, L1 i L2', () => {
    const [l0, l1, l2] = ([0, 1, 2] as SceneLod[]).map((lod) =>
      computeProjectLegendEntries(buildSceneV3(enm, lod)).map((e) => `${e.kind}:${e.id}`),
    );
    expect(l0).toEqual(l1);
    expect(l1).toEqual(l2);
  });
});

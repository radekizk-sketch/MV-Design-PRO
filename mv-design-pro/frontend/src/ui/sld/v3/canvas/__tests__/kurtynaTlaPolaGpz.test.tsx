/**
 * Kurtyna kadru na warstwie adnotacji GPZ (karta UX-04/ROZDZIELNICA-SN-KOREKTA, kryterium K1).
 *
 * Wada: w kadrze sekcji albo pola cała warstwa adnotacji GPZ (tła pól, nagłówek, tabela pól) była
 * przyciemniona jako „poza kadrem", bo kurtyna sprawdzała ref STACJI GPZ — także tło pola, które
 * jest celem kadru. Kontrakt: tło pola należy do pola (`bayRef`), nagłówek i tabela — do GPZ.
 *
 * Iloczyn cech: sekcja GPZ (każda z fikstury) × tło pola (w sekcji / poza sekcją) × element
 * stacji (nagłówek, tabela — przy czytelnym piśmie). Relacja przynależności ta sama co kamery
 * (`nalezyDoZakresu`).
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3 } from '../../scene/buildScene';
import { SldCanvasV3 } from '../SldCanvasV3';
import { nalezyDoZakresu, zakresCelu } from '../zakresKadru';

const plik = JSON.parse(readFileSync('public/test-fixtures/gpz110kvPolaSzablonow.enm.json', 'utf8'));
const enm: EnergyNetworkModel = plik.enm ?? plik;
const scena = buildSceneV3(enm, 2);
const sekcje = (enm.substations ?? []).find((s) => s.station_type === 'gpz')?.gpz_sections ?? [];

afterEach(() => cleanup());

describe('kurtyna kadru sekcji GPZ — tło pola należy do pola, tabela i nagłówek do GPZ', () => {
  it('fikstura ma dwie sekcje (pusta wyrocznia = fałszywa pewność)', () => {
    expect(sekcje.length).toBe(2);
  });
  for (const sekcja of sekcje) {
    it(`sekcja ${sekcja.section_id.split('/').pop()}`, () => {
      const wynik = zakresCelu('sekcja', enm, [sekcja.section_id], scena);
      if (!wynik.dostepny) throw new Error(wynik.przyczyna);
      const zbior = new Set(wynik.zakres.refy);
      const { container } = render(
        <SldCanvasV3 snapshot={enm} width={1440} height={900} lodOverride={2} refyKadru={wynik.zakres.refy} />,
      );
      let wCelu = 0;
      let poza = 0;
      for (const panel of scena.meta.gpzAdnotacje?.panele ?? []) {
        const el = container.querySelector(`[data-testid="${CSS.escape(`sld-v3-gpz-panel-${panel.bayRef}`)}"]`);
        expect(el, panel.bayRef).not.toBeNull();
        const nalezy = nalezyDoZakresu(panel.bayRef, zbior);
        expect(el!.closest('[data-kadr="poza"]') !== null, `tło ${panel.bayRef}`).toBe(!nalezy);
        if (nalezy) wCelu += 1;
        else poza += 1;
      }
      expect(wCelu).toBeGreaterThan(0);
      expect(poza).toBeGreaterThan(0);
      // Elementy stacji GPZ (nagłówek, tabela) są poza kadrem sekcji — przyciemnione, gdy narysowane.
      for (const id of ['sld-v3-gpz-naglowek-wyniki', 'sld-v3-gpz-tabela-pol']) {
        const el = container.querySelector(`[data-testid="${id}"]`);
        if (el) expect(el.closest('[data-kadr="poza"]'), id).not.toBeNull();
      }
    });
  }
});

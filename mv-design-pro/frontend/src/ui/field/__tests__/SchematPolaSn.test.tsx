/**
 * Karta UX-04/POLE-LINIOWE-WZORZEC — schemat pola w oknie pola jest WYCINKIEM rysunku kanwy
 * (`buildSceneV3`), nie drugim rysunkiem (dawny `BayWindowSchematic`: własne kształty, własne
 * współrzędne, kolor stanu odwrotny do SCADA, stan nieznany jak zamknięty).
 *
 * ILOCZYN CECH: fikstura {wyłącznik stały w sekcji 1, w sekcji 2} × pole liniowe GPZ {4 pola: łącznik trójpołożeniowy / wyłącznik stały z odłącznikiem
 * × zajęte/wolne} × motyw {ciemny, jasny}. Wyrocznie niezależne od komponentu: zbiór aparatów
 * i ich pozycje ze sceny kanwy, tabela położenie → kolor ramki (wartości z karty), etykiety
 * oznaczeń z modelu, atrybucja licencji QElectroTech.
 */
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../types/enm';
import fxStaly1 from '../../../harness-fixtures/generated/pole_liniowe_z10_gpz_staly_w_sekcji_1.json';
import fxStaly2 from '../../../harness-fixtures/generated/pole_liniowe_z10_gpz_staly_w_sekcji_2.json';
import { useThemeModeStore, type ThemeMode } from '../../../ui2/theme/themeMode';
import { buildSceneV3 } from '../../sld/v3/scene/buildScene';
import { czyLacznikPola } from '../../sld/v3/compose/rodzajeAparatuPola';
import type { BayPrimaryDeviceKind } from '../../../types/enm';
import { SchematPolaSn } from '../SchematPolaSn';
import type { FieldReadModelItem } from '../useFieldReadModel';

const FIKSTURY: ReadonlyArray<readonly [string, EnergyNetworkModel]> = [
  ['wyłącznik stały w sekcji 1', (fxStaly1 as unknown as { snapshot: EnergyNetworkModel }).snapshot],
  ['wyłącznik stały w sekcji 2', (fxStaly2 as unknown as { snapshot: EnergyNetworkModel }).snapshot],
];
const MOTYWY: readonly ThemeMode[] = ['dark_scada', 'light_technical'];
/** Kolor ramki wg położenia — wartości z karty (§0 pkt 7), NIEZALEŻNE od palety w kodzie. */
const RAMKA: Readonly<Record<string, string | null>> = {
  closed: '#F05260',
  open: '#2CCF93',
  earthed: '#2CCF93',
  unknown: null,
};

function item(enm: EnergyNetworkModel, bayRef: string): FieldReadModelItem {
  const bay = (enm.bays ?? []).find((b) => b.ref_id === bayRef)!;
  return {
    bay_id: bay.id ?? bay.ref_id,
    bay_ref: bay.ref_id,
    bay_name: bay.name ?? bay.ref_id,
    canonical_model: { base_model: { bay_role: 'LINIA_OUT' } },
  } as unknown as FieldReadModelItem;
}

afterEach(() => {
  useThemeModeStore.setState({ mode: 'dark_scada' });
});

describe('UX-04 — schemat pola w oknie pola = wycinek sceny kanwy (fikstura × pole × motyw)', () => {
  for (const [nazwa, enm] of FIKSTURY) {
    const scena = buildSceneV3(enm, 2);
    const pola = (enm.bays ?? []).filter((b) => (b.tags ?? []).includes('gpz_line_field'));
    it(`${nazwa}: fikstura ma cztery pola liniowe GPZ`, () => {
      expect(pola).toHaveLength(4);
    });
    for (const pole of pola) {
      for (const motyw of MOTYWY) {
        it(`${nazwa} · ${pole.ref_id} · ${motyw}`, () => {
          useThemeModeStore.setState({ mode: motyw });
          const { container, unmount } = render(<SchematPolaSn item={item(enm, pole.ref_id)} snapshot={enm} />);
          const svg = screen.getByTestId('bay-svg-renderer');
          expect(svg.getAttribute('data-theme-mode')).toBe(motyw);
          // Te same aparaty, w tej samej kolejności co scena kanwy.
          const wszystkieNaScenie = scena.symbols.filter((s) => s.meta?.ownerRef === pole.ref_id);
          // Każdy symbol pola ze sceny (także znacznik pola wolnego, bez rekordu aparatu).
          expect(svg.querySelectorAll('[data-preview-layer="symbols"] > g')).toHaveLength(wszystkieNaScenie.length);
          const naScenie = wszystkieNaScenie.filter((s) => s.meta?.deviceRef);
          expect(naScenie.length).toBeGreaterThan(0);
          const narysowane = Array.from(svg.querySelectorAll('g[data-device-ref]'));
          expect(narysowane.map((g) => g.getAttribute('data-device-ref'))).toEqual(naScenie.map((s) => s.meta?.deviceRef));
          // Kadr obejmuje wszystkie aparaty pola.
          const [vx, vy, vw, vh] = (svg.getAttribute('viewBox') ?? '').split(' ').map(Number);
          for (const s of naScenie) {
            expect(s.x).toBeGreaterThanOrEqual(vx);
            expect(s.y).toBeGreaterThanOrEqual(vy);
            expect(s.x).toBeLessThanOrEqual(vx + vw);
            expect(s.y).toBeLessThanOrEqual(vy + vh);
          }
          // Ramki stanu wg położenia ze sceny; tylko łączniki pola; zawsze bez wypełnienia.
          naScenie.forEach((s, i) => {
            const ramki = narysowane[i].querySelectorAll('[data-qet="ramka-scada"]');
            const lacznik = czyLacznikPola(s.meta?.apparatusKind as BayPrimaryDeviceKind | undefined);
            const oczekiwana = lacznik ? RAMKA[s.state ?? 'unknown'] ?? null : null;
            if (oczekiwana === null) {
              expect(ramki, `${s.meta?.deviceRef}`).toHaveLength(0);
            } else {
              expect(ramki).toHaveLength(1);
              expect(ramki[0].getAttribute('stroke')).toBe(oczekiwana);
              expect(ramki[0].getAttribute('fill')).toBe('none');
            }
          });
          // Etykiety oznaczeń aparatów z modelu (te same co na kanwie).
          const teksty = Array.from(svg.querySelectorAll('text')).map((t) => t.textContent ?? '');
          for (const d of pole.primary_devices ?? []) {
            if (!naScenie.some((s) => s.meta?.deviceRef === d.device_ref)) continue;
            expect(teksty.some((t) => t.startsWith(d.designation ?? '?')), `${d.designation}`).toBe(true);
          }
          expect(screen.getByTestId('schemat-pola-sn-opis')).toHaveTextContent('QElectroTech');
          expect(screen.getByTestId('schemat-pola-sn-opis')).toHaveTextContent('CC BY 3.0');
          expect(container.querySelector('[data-testid="schemat-pola-sn-brak"]')).toBeNull();
          unmount();
        });
      }
    }
  }

  it('wyłącznik stały: odłącznik bez rekordu położenia — bez ramki, symbol zostaje, podpis „stan nieznany"', () => {
    const [, enm] = FIKSTURY[1];
    const poleStale = (enm.bays ?? []).find((b) => b.bay_template_ref?.endsWith('_staly_z_odlacznikiem'))!;
    const ds = (poleStale.primary_devices ?? []).find((d) => d.designation === 'Q1')!;
    expect(ds.switch_state ?? null).toBeNull();
    render(<SchematPolaSn item={item(enm, poleStale.ref_id)} snapshot={enm} />);
    const g = screen.getByTestId('bay-svg-renderer').querySelector(`g[data-device-ref="${ds.device_ref}"]`)!;
    expect(g).not.toBeNull();
    expect(g.querySelectorAll('[data-qet="ramka-scada"]')).toHaveLength(0);
    expect(screen.getByText('Q1 · stan nieznany')).toBeInTheDocument();
  });

  it('determinizm: ten sam model → ten sam znacznik SVG', () => {
    const [, enm] = FIKSTURY[0];
    const pole = (enm.bays ?? []).find((b) => (b.tags ?? []).includes('gpz_line_field'))!;
    const a = render(<SchematPolaSn item={item(enm, pole.ref_id)} snapshot={enm} />);
    const pierwszy = a.container.innerHTML;
    a.unmount();
    const b = render(<SchematPolaSn item={item(enm, pole.ref_id)} snapshot={enm} />);
    expect(b.container.innerHTML).toBe(pierwszy);
  });

  it('pole bez rysunku (brak w migawce) — jawny stan, bez zmyślonego schematu', () => {
    const [, enm] = FIKSTURY[0];
    render(
      <SchematPolaSn
        item={{ ...item(enm, (enm.bays ?? [])[0].ref_id), bay_ref: 'pole-spoza-modelu' }}
        snapshot={enm}
      />,
    );
    expect(screen.getByTestId('schemat-pola-sn-brak')).toBeInTheDocument();
    expect(screen.queryByTestId('bay-svg-renderer')).toBeNull();
  });
});

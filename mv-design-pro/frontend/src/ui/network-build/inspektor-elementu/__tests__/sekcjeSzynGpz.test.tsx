/**
 * „Sekcje szyn” w karcie technicznej GPZ (K6) — ILOCZYN CECH:
 *
 *   tryb {edycja modelu · wyniki (`onEdytuj === null`)}
 *   × źródło zasilania GPZ w modelu {jest · brak}
 *   × sekcje strony 110 kV {brak · jedna}
 *   oraz nazwa sekcji/szyny {jest · brak}.
 *
 * Karta NIE edytuje sekcji (decyzja architekta 2026-11-04: jedynym edytorem GPZ jest konfigurator
 * GPZ). Pokazuje zwartą tabelę (jedna sekcja = jeden wiersz) i w trybie edycji przycisk
 * „Konfiguruj GPZ”, który otwiera konfigurator (E-10) na karcie „Sekcje SN” — deep-link
 * `payload.defaultCard: 'sections'` czytany przez `gpzDefaultCard`. Klik natywny (`userEvent`).
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EnergyNetworkModel } from '../../../../types/enm';
import { buildKartaTechniczna } from '../../../sld/shared/kartaTechnicznaElementu';
import { useNetworkBuildStore } from '../../networkBuildStore';
import { KartaTechnicznaElementu } from '../KartaTechnicznaElementu';

const GPZ = 'gpz/stacja-glowna';
const ZRODLO = 'src/zasilanie-gpz';

function model(opcje: { readonly zrodlo: boolean; readonly sekcjaWn: boolean }): EnergyNetworkModel {
  return {
    buses: [
      { ref_id: 'bus/sn-1', id: 'u-sn-1', name: 'Szyna SN I', voltage_kv: 15 },
      { ref_id: 'bus/sn-2', id: 'u-sn-2', name: '', voltage_kv: 15 },
      { ref_id: 'bus/wn-1', id: 'u-wn-1', name: 'Szyna 110 kV', voltage_kv: 110 },
    ],
    sources: opcje.zrodlo
      ? [{ ref_id: ZRODLO, id: 'u-src', name: 'Zasilanie GPZ', bus_ref: 'bus/sn-1', substation_ref: GPZ }]
      : [],
    branches: [],
    transformers: [],
    loads: [],
    generators: [],
    bays: [],
    junctions: [],
    corridors: [],
    measurements: [],
    protection_assignments: [],
    substations: [
      {
        ref_id: GPZ,
        id: 'u-gpz',
        name: 'GPZ Główny',
        station_type: 'gpz',
        bus_refs: ['bus/sn-1', 'bus/sn-2', 'bus/wn-1'],
        gpz_sections: [
          { section_id: 'sekcja-sn-3', order: 2, name: null, bus_ref: 'bus/sn-2' },
          { section_id: 'sekcja-sn-1', order: 1, name: 'Sekcja I', bus_ref: 'bus/sn-1' },
        ],
        gpz_hv_sections: opcje.sekcjaWn ? [{ section_id: 'sekcja-wn-1', order: 1, name: 'Sekcja WN', bus_ref: 'bus/wn-1' }] : [],
      },
    ],
  } as unknown as EnergyNetworkModel;
}

function karta(m: EnergyNetworkModel) {
  const k = buildKartaTechniczna(m, { kind: 'station', elementId: GPZ });
  if (!k) throw new Error('brak karty GPZ');
  return k;
}

const otworz = vi.fn();
const pierwotne = useNetworkBuildStore.getState().openRouteSurface;

beforeEach(() => {
  otworz.mockReset();
  useNetworkBuildStore.setState({ openRouteSurface: otworz });
});

afterEach(() => {
  cleanup();
  useNetworkBuildStore.setState({ openRouteSurface: pierwotne });
});

describe('Model karty GPZ — sekcja „Sekcje szyn”', () => {
  it('w torze energii po zasilaniu, przed rozdzielnią SN; tabela SN posortowana po kolejności, jeden wiersz na sekcję, nazwy zamiast identyfikatorów', () => {
    const k = karta(model({ zrodlo: true, sekcjaWn: false }));
    expect(k.sekcje.map((s) => s.id)).toEqual(['identyfikacja', 'zasilanie', 'sekcje_szyn', 'rozdzielnica_sn', 'przylaczenia']);
    const sekcja = k.sekcje.find((s) => s.id === 'sekcje_szyn')!;
    expect(sekcja.tytul).toBe('Sekcje szyn');
    expect(sekcja.zrodloPl ?? null).toBeNull();
    expect(sekcja.tabele?.map((t) => t.klucz)).toEqual(['sekcje_sn', 'sekcje_wn']);
    expect(sekcja.tabele?.[0].kolumny.map((k) => k.etykieta)).toEqual(['Sekcja', 'Szyna', '$U_n$']);
    expect(sekcja.tabele?.[0].wiersze.map((w) => w.komorki)).toEqual([
      { nazwa: 'Sekcja I', szyna: 'Szyna SN I', un: '15 kV' },
      { nazwa: 'Sekcja szyn bez nazwy (2 z 2)', szyna: 'Szyna bez nazwy (2 z 3)', un: '15 kV' },
    ]);
    expect(sekcja.tabele?.[1].wiersze).toEqual([]);
    expect(sekcja.tabele?.[1].pustaPl).toBe('GPZ nie ma sekcji szyn 110 kV w modelu.');
  });

  for (const sekcjaWn of [false, true]) {
    for (const zrodlo of [true, false]) {
      it(`źródło GPZ ${zrodlo ? 'jest' : 'brak'} × sekcja 110 kV ${sekcjaWn ? 'jest' : 'brak'} → przejście do konfiguratora ${zrodlo ? 'po referencji źródła' : 'nieobecne'}`, () => {
        const sekcja = karta(model({ zrodlo, sekcjaWn })).sekcje.find((s) => s.id === 'sekcje_szyn');
        expect(sekcja?.konfiguratorGpzRef).toBe(zrodlo ? ZRODLO : undefined);
        expect(sekcja?.tabele?.[1].wiersze.map((w) => w.komorki.nazwa)).toEqual(sekcjaWn ? ['Sekcja WN'] : []);
      });
    }
  }

  it('stacja inna niż GPZ: karta bez sekcji „Sekcje szyn”', () => {
    const m = model({ zrodlo: true, sekcjaWn: false });
    const stacja = { ...m.substations[0], station_type: 'mv_lv' } as (typeof m.substations)[number];
    const k = buildKartaTechniczna({ ...m, substations: [stacja] }, { kind: 'station', elementId: GPZ });
    expect(k?.sekcje.some((s) => s.id === 'sekcje_szyn')).toBe(false);
  });
});

describe('Render karty GPZ — tryb × źródło GPZ', () => {
  it('edycja modelu: „Konfiguruj GPZ” w linii tytułu sekcji otwiera konfigurator GPZ na karcie „Sekcje SN”', async () => {
    const u = userEvent.setup();
    render(<KartaTechnicznaElementu karta={karta(model({ zrodlo: true, sekcjaWn: false }))} onEdytuj={() => undefined} />);
    const sekcja = screen.getByTestId('inspektor-karta-sekcje_szyn');
    const przycisk = within(sekcja).getByTestId('inspektor-karta-konfiguruj-gpz');
    expect(przycisk.textContent).toBe('Konfiguruj GPZ');
    expect(przycisk.parentElement?.querySelector('h4')?.textContent).toBe('Sekcje szyn');
    await u.click(przycisk);
    expect(otworz).toHaveBeenCalledTimes(1);
    expect(otworz).toHaveBeenCalledWith('E-10', {
      entityRef: ZRODLO,
      subjectKind: 'helper_context',
      payload: { defaultCard: 'sections' },
    });
  });

  for (const [opis, onEdytuj, zrodlo] of [
    ['wyniki (tylko odczyt) × źródło jest', null, true],
    ['edycja modelu × źródła brak', () => undefined, false],
    ['wyniki (tylko odczyt) × źródła brak', null, false],
  ] as const) {
    it(`${opis}: tabela sekcji bez przycisku konfiguratora`, () => {
      render(<KartaTechnicznaElementu karta={karta(model({ zrodlo, sekcjaWn: false }))} onEdytuj={onEdytuj} />);
      const sekcja = screen.getByTestId('inspektor-karta-sekcje_szyn');
      expect(within(sekcja).queryByTestId('inspektor-karta-konfiguruj-gpz')).toBeNull();
      expect(within(sekcja).getAllByTestId('inspektor-karta-wiersz-sekcje_sn')).toHaveLength(2);
      // Tabela zwarta: klasa zawijania komórek w szerokości inspektora (bez przewijania w poziomie).
      const tabela = within(sekcja).getByTestId('inspektor-karta-tabela-sekcje_sn');
      expect(tabela.getAttribute('data-zwarta')).toBe('true');
      expect(tabela.classList.contains('mvd-kt-tabela-zwarta')).toBe(true);
    });
  }

  it('ekran mówi nazwami: identyfikatory sekcji, szyn i GPZ nie trafiają do tekstu sekcji', () => {
    render(<KartaTechnicznaElementu karta={karta(model({ zrodlo: true, sekcjaWn: true }))} onEdytuj={() => undefined} />);
    const tekst = screen.getByTestId('inspektor-karta-sekcje_szyn').textContent ?? '';
    for (const id of ['sekcja-sn-1', 'sekcja-sn-3', 'sekcja-wn-1', 'bus/sn-1', 'bus/sn-2', 'bus/wn-1', GPZ, ZRODLO]) {
      expect(tekst).not.toContain(id);
    }
  });
});

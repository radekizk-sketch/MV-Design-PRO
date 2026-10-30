/**
 * Karta techniczna — szablon pola i rodzina rozdzielnicy po NAZWIE katalogowej, nie po
 * identyfikatorze (kontrakt prezentacji inżynierskiej V12.7: surowe identyfikatory poza
 * pierwszym planem).
 *
 * Pomiar przed naprawą (2026-10-29, e2e zrzutów pola liniowego GPZ, inspektor 360 px): wiersz
 * „Konfiguracja pola" pokazywał identyfikator nieprzezroczysty `config_id`
 * („kanoniczny:bay_template_gpz_line_enea_z10_trojpolozeniowy" — 380 px tekstu bez miejsca
 * podziału w wierszu 299 px, przelany na sąsiednią treść), a wiersz „Rodzina rozdzielnicy"
 * — referencję rodziny. Teraz: „Szablon pola" z `bay_template_ref` i rodzina — z katalogu
 * (`katalogiKarty.ts`); referencja, której katalog nie zna, jako „pozycja katalogu <ref>"
 * (konwencja typu katalogowego transformatora i aparatu — nigdy nazwa zgadnięta).
 *
 * ILOCZYN CECH: karta {pole, stacja} × katalog {zna pozycję, nie zna} × pole {szablon i rodzina,
 * bez nich}; `config_id` obecny w każdym przypadku i nigdy niewidoczny na karcie.
 */
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../types/enm';
import type { DaneElementuKanwy } from '../daneElementuKanwy';
import { buildKartaTechniczna, KATALOGI_PUSTE, type KatalogiKarty, type WierszKarty } from '../kartaTechnicznaElementu';

const SZABLON = 'bay_template_gpz_line_enea_z10_trojpolozeniowy';
const RODZINA = 'rodzina_testowa_ais';
const CONFIG_ID = `kanoniczny:${SZABLON}`;
const NAZWA_SZABLONU = 'Pole liniowe GPZ wg ENEA Z.10 — łącznik trójpołożeniowy';
const NAZWA_RODZINY = 'Rozdzielnica testowa · seria A';

const KATALOG_ZNA: KatalogiKarty = {
  ...KATALOGI_PUSTE,
  szablonyPol: new Map([[SZABLON, NAZWA_SZABLONU]]),
  rodzinyRozdzielnic: new Map([[RODZINA, NAZWA_RODZINY]]),
};

function model(zPowiazaniem: boolean): EnergyNetworkModel {
  const szyna = (ref_id: string) => ({ id: ref_id, ref_id, name: ref_id, voltage_kv: 15, tags: [], meta: {} });
  return {
    header: { name: 'nazwy katalogowe karty' },
    buses: [szyna('bus-sn'), szyna('bus-z')],
    substations: [
      {
        id: 'st-1',
        ref_id: 'st-1',
        name: 'GPZ',
        station_type: 'gpz',
        bus_refs: ['bus-sn'],
        transformer_refs: [],
        tags: [],
        meta: {},
      },
    ],
    bays: [
      {
        id: 'pole-1',
        ref_id: 'pole-1',
        name: 'Pole liniowe GPZ 1',
        bay_role: 'LINE',
        substation_ref: 'st-1',
        bus_ref: 'bus-sn',
        terminal_bus_ref: 'bus-z',
        equipment_refs: [],
        primary_devices: [],
        config_id: CONFIG_ID,
        ...(zPowiazaniem ? { bay_template_ref: SZABLON, switchgear_family_ref: RODZINA } : {}),
        tags: [],
        meta: {},
      },
    ],
    branches: [],
    transformers: [],
    sources: [],
    loads: [],
    generators: [],
  } as unknown as EnergyNetworkModel;
}

function wiersze(kind: 'bay' | 'station', zPowiazaniem: boolean, katalogi: KatalogiKarty): Map<string, WierszKarty> {
  const karta = buildKartaTechniczna(
    model(zPowiazaniem),
    { kind, elementId: kind === 'bay' ? 'pole-1' : 'st-1' } as DaneElementuKanwy,
    katalogi,
  );
  expect(karta).not.toBeNull();
  const wszystkie = karta!.sekcje.flatMap((s) => s.wiersze);
  // Identyfikator nieprzezroczysty nie stoi na karcie w żadnym wierszu (wartość ani lista).
  for (const w of wszystkie) {
    expect(`${w.wartosc ?? ''} ${(w.lista ?? []).join(' ')}`, `${kind} · ${w.klucz}`).not.toContain(CONFIG_ID);
  }
  return new Map(wszystkie.map((w) => [w.klucz, w] as const));
}

const PRZYPADKI = [
  { katalog: 'zna', katalogi: KATALOG_ZNA, szablon: NAZWA_SZABLONU, rodzina: NAZWA_RODZINY },
  { katalog: 'nie zna', katalogi: KATALOGI_PUSTE, szablon: `pozycja katalogu ${SZABLON}`, rodzina: `pozycja katalogu ${RODZINA}` },
] as const;

describe('karta techniczna — szablon pola i rodzina rozdzielnicy z katalogu', () => {
  for (const p of PRZYPADKI) {
    it(`pole · katalog ${p.katalog}: szablon i rodzina po nazwie, bez config_id`, () => {
      const w = wiersze('bay', true, p.katalogi);
      expect(w.get('szablon')?.etykieta).toBe('Szablon pola');
      expect(w.get('szablon')?.wartosc).toBe(p.szablon);
      expect(w.get('rodzina')?.wartosc).toBe(p.rodzina);
      expect(w.has('konfiguracja')).toBe(false);
    });

    it(`stacja · katalog ${p.katalog}: rodzina rozdzielnicy po nazwie`, () => {
      const w = wiersze('station', true, p.katalogi);
      expect(w.get('rodzina')?.wartosc).toBe(p.rodzina);
    });

    it(`pole bez szablonu i rodziny · katalog ${p.katalog}: brak obu wierszy, config_id niewidoczny`, () => {
      const w = wiersze('bay', false, p.katalogi);
      expect(w.has('szablon')).toBe(false);
      expect(w.has('rodzina')).toBe(false);
      expect(w.has('konfiguracja')).toBe(false);
      expect(wiersze('station', false, p.katalogi).has('rodzina')).toBe(false);
    });
  }
});

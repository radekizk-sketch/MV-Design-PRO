/**
 * GPZ-H5-SLD etap 3 (b) — JAWNE ROLE PÓL FUNKCYJNYCH sekcji SN (ENEA §13: pole zespołu
 * uziemiającego, pole baterii kondensatorów, pole pomiarowe).
 *
 * DEFEKT (przed kartą): rola modelu `EARTHING`/`CAPACITOR` nie miała odwzorowania na
 * rysunku — adapter stacji spadał na `?? LINE_BRANCH`, adapter GPZ na `default → LINE_OUT`,
 * więc pole uziemiające było rysowane jako pole liniowe (oznacznik „F", predykat pola
 * kablowego `true` — feeder mógł się do niego zaczepić). Teraz każde wyliczenie roli jest
 * wyczerpujące (`never`), a brak rekordów aparatów rysuje jawną sylwetkę „?" (`bayNoEquipment`).
 *
 * ILOCZYN CECH (reguła KLASA §2): rola modelu (9 wartości `Bay.bay_role`) × ścieżka
 * (blok GPZ / blok stacji SN) × rekordy aparatów (brak / są) × numer pola (jest / brak) × LOD
 * (1 / 2). Baza GPZ to migawka backendu H5 (`gpz_h5_przypadek_odbiorowy.json`, eksport
 * `backend/scripts/eksport_fixtur_harnessu.py`: pola funkcyjne obu sekcji SN bez aparatów);
 * ścieżka stacji — migawka backendu `gpzFeeder.enm.json` z polem SN o podmienionej roli
 * (backend nie zakłada pól funkcyjnych w stacji SN, więc ta kombinacja jest kontrolą
 * wyczerpującego odwzorowania, nie scenariuszem operacji).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { Bay, BayPrimaryDevice, EnergyNetworkModel } from '../../../../../types/enm';
import { buildCanonicalGpzProps } from '../../../v2/canvas/enmToCanonicalGpzAdapter';
import { czyPoleKabloweGpz } from '../../../v2/canvas/canonicalGpzModel';
import { buildSldDataFromSnapshot } from '../../../v2/canvas/enmToSldAdapter';
import { FIELD_ROLE, isSnFieldRole, type FieldRole } from '../../../v2/domain/apparatusContracts';
import { FIELD_ROLE_LABEL_PL } from '../../../v2/station-rozdzielnia/contract';
import { referenceProfileIdForFieldRole } from '../../../reference/referenceProfiles';
import { fieldFunctionalDesignation, fieldOrdinalDesignation, klasaOznacznikaPola } from '../../compose/directions';
import { buildTechCardSubject } from '../../../../tech-card/buildTechCardSubject';
import { buildSceneV3, type SceneLod } from '../buildScene';

const here = dirname(fileURLToPath(import.meta.url));
const migawkaH5 = (
  JSON.parse(
    readFileSync(resolve(here, '..', '..', '..', '..', '..', 'harness-fixtures', 'generated', 'gpz_h5_przypadek_odbiorowy.json'), 'utf8'),
  ) as { readonly snapshot: EnergyNetworkModel }
).snapshot;
const migawkaStacji = (
  JSON.parse(readFileSync(resolve(here, 'fixtures', 'gpzFeeder.enm.json'), 'utf8')) as { readonly enm: EnergyNetworkModel }
).enm;

const LODY: readonly SceneLod[] = [1, 2];
const ROLE_FUNKCYJNE = ['EARTHING', 'CAPACITOR', 'MEASUREMENT'] as const;
type RolaFunkcyjna = (typeof ROLE_FUNKCYJNE)[number];

/** Oczekiwania z KANONU (nie z implementacji): rola rysunku, klasa oznacznika, nazwa kanonu. */
const OCZEKIWANE: Readonly<Record<RolaFunkcyjna, { rola: FieldRole; klasa: string; skrot: string; nazwa: string }>> = {
  EARTHING: { rola: FIELD_ROLE.EARTHING, klasa: 'FU', skrot: 'ZU', nazwa: FIELD_ROLE_LABEL_PL.UZIEMIAJACE },
  CAPACITOR: { rola: FIELD_ROLE.CAPACITOR, klasa: 'FK', skrot: 'BKR', nazwa: FIELD_ROLE_LABEL_PL.KOMPENSACYJNE },
  MEASUREMENT: { rola: FIELD_ROLE.MEASUREMENT, klasa: 'FP', skrot: 'POM', nazwa: FIELD_ROLE_LABEL_PL.POMIAROWE },
};

const APARAT: BayPrimaryDevice = {
  device_ref: 'aparat-testowy/cb',
  symbol_ref: 'cb',
  kind: 'CB',
  placement: 'MIDSTREAM',
  is_controllable: true,
};

const gpzRef = (migawkaH5.substations ?? []).find((s) => s.station_type === 'gpz')!.ref_id;
const polaFunkcyjneGpz = (rola: RolaFunkcyjna): readonly Bay[] =>
  (migawkaH5.bays ?? []).filter((b) => b.bay_role === rola && b.substation_ref === gpzRef);

/** Wariant migawki: pola funkcyjne GPZ z aparatem / bez, z nazwą / bez nazwy i numeru. */
function wariantGpz(zAparatem: boolean, zNazwa: boolean): EnergyNetworkModel {
  return {
    ...migawkaH5,
    bays: (migawkaH5.bays ?? []).map((b) =>
      (ROLE_FUNKCYJNE as readonly string[]).includes(b.bay_role) && b.substation_ref === gpzRef
        ? {
            ...b,
            primary_devices: zAparatem ? [{ ...APARAT, device_ref: `${b.ref_id}/cb` }] : [],
            ...(zNazwa ? { bay_number: `${b.bay_role[0]}-${b.ref_id.slice(-6, -3)}` } : { name: '', bay_number: null, feeder_short_name: null }),
          }
        : b,
    ),
  };
}

describe('pola funkcyjne GPZ × aparaty × numer pola × LOD — blok GPZ (migawka backendu H5)', () => {
  it('kontrola wejścia: migawka niesie po dwa pola każdej roli funkcyjnej, bez aparatów', () => {
    for (const rola of ROLE_FUNKCYJNE) {
      expect(polaFunkcyjneGpz(rola)).toHaveLength(2);
      expect(polaFunkcyjneGpz(rola).every((b) => (b.primary_devices ?? []).length === 0)).toBe(true);
    }
  });

  for (const rola of ROLE_FUNKCYJNE) {
    for (const zAparatem of [false, true]) {
      for (const zNazwa of [false, true]) {
        it(`${rola} × aparaty ${zAparatem ? 'są' : 'brak'} × numer ${zNazwa ? 'jest' : 'brak'}: rola, predykat kablowy, oznacznik, sylwetka „?"`, () => {
          const enm = wariantGpz(zAparatem, zNazwa);
          const props = buildCanonicalGpzProps(enm, gpzRef);
          const pola = props.sections.flatMap((s) => s.bays).filter((b) => polaFunkcyjneGpz(rola).some((p) => p.ref_id === b.bayRef));
          expect(pola).toHaveLength(2);
          for (const pole of pola) {
            expect(pole.fieldRole).toBe(rola);
            // Pole funkcyjne nie jest polem kablowym — feeder nie ma prawa się do niego zaczepić.
            expect(czyPoleKabloweGpz(pole.fieldRole)).toBe(false);
          }
          for (const lod of LODY) {
            const scena = buildSceneV3(enm, lod);
            pola.forEach((pole) => {
              const brak = scena.symbols.filter((s) => s.meta?.ownerRef === pole.bayRef && s.symbolId === 'bayNoEquipment');
              const aparaty = scena.symbols.filter((s) => s.meta?.ownerRef?.startsWith(pole.bayRef) && s.symbolId === 'breaker');
              expect(brak.length, `L${lod} ${pole.bayRef} sylwetka „?"`).toBe(zAparatem ? 0 : 1);
              expect(aparaty.length, `L${lod} ${pole.bayRef} wyłącznik z rekordu`).toBe(zAparatem ? 1 : 0);
              const oznacznik = scena.labels.find((l) => l.ownerRef === `${pole.bayRef}#designation`);
              expect(oznacznik, `L${lod} ${pole.bayRef} oznacznik`).toBeDefined();
              if (zNazwa) expect(oznacznik!.text).toBe(pole.bayNumber);
              else expect(oznacznik!.text).toMatch(new RegExp(`^${OCZEKIWANE[rola].klasa}\\d+$`));
            });
            if (!zNazwa) {
              // Numeracja per klasa i per sekcja (licznik `gpzFieldOrdinalDesignation` żyje
              // w sekcji): po jednym polu roli w sekcji A i B → klasa1 w każdej (nigdy F01).
              const wgSekcji = props.sections.map((sekcja) =>
                sekcja.bays
                  .filter((b) => pola.some((p) => p.bayRef === b.bayRef))
                  .map((b) => scena.labels.find((l) => l.ownerRef === `${b.bayRef}#designation`)!.text),
              );
              expect(wgSekcji.filter((t) => t.length > 0)).toEqual([[`${OCZEKIWANE[rola].klasa}1`], [`${OCZEKIWANE[rola].klasa}1`]]);
            }
          }
        });
      }
    }
  }
});

describe('rola modelu (9 wartości) × ścieżka stacji SN — odwzorowanie wyczerpujące', () => {
  const stacja = (migawkaStacji.substations ?? []).find((s) => s.station_type !== 'gpz')!;
  const wzorPola = (migawkaStacji.bays ?? []).find((b) => b.substation_ref === stacja.ref_id && b.bay_role === 'OUT')!;
  const WSZYSTKIE: readonly Bay['bay_role'][] = ['IN', 'OUT', 'TR', 'COUPLER', 'FEEDER', 'MEASUREMENT', 'OZE', 'EARTHING', 'CAPACITOR'];
  const OCZEKIWANA_ROLA_STACJI: Readonly<Record<Bay['bay_role'], FieldRole>> = {
    IN: FIELD_ROLE.RMU_LINE,
    OUT: FIELD_ROLE.RMU_LINE,
    FEEDER: FIELD_ROLE.RMU_LINE,
    TR: FIELD_ROLE.RMU_TRANSFORMER,
    COUPLER: FIELD_ROLE.COUPLER,
    MEASUREMENT: FIELD_ROLE.MEASUREMENT,
    // Pole źródłowe bez wytwórcy w migawce — rodzaj nieokreślony (nigdy PV z domysłu).
    OZE: FIELD_ROLE.DER_UNKNOWN,
    EARTHING: FIELD_ROLE.EARTHING,
    CAPACITOR: FIELD_ROLE.CAPACITOR,
  };

  for (const rola of WSZYSTKIE) {
    for (const zNumerem of [false, true]) {
      it(`${rola} × numer ${zNumerem ? 'jest' : 'brak'}: rola rysunku, oznaczenie, scena bez wyjątku`, () => {
        const ref = `${stacja.ref_id}/sn_field/test`;
        const pole: Bay = {
          ...wzorPola,
          id: ref,
          ref_id: ref,
          bay_role: rola,
          field_role: null,
          equipment_refs: [],
          primary_devices: [],
          bay_number: zNumerem ? 'Q-TEST' : null,
          feeder_short_name: null,
        } as Bay;
        const enm: EnergyNetworkModel = { ...migawkaStacji, bays: [...(migawkaStacji.bays ?? []), pole] };
        const dane = buildSldDataFromSnapshot(enm, null);
        const opis = dane.stations.flatMap((s) => s.snBays ?? []).find((b) => b.bayRef === ref);
        expect(opis, 'pole stacji w danych rysunku').toBeDefined();
        expect(opis!.fieldRole).toBe(OCZEKIWANA_ROLA_STACJI[rola]);
        expect(opis!.hasMissingRequiredDevice).toBe(true);
        if (zNumerem) expect(opis!.designation).toBe('Q-TEST');
        else if (rola === 'EARTHING' || rola === 'CAPACITOR' || rola === 'MEASUREMENT') expect(opis!.designation).toBe(OCZEKIWANE[rola].skrot);
        expect(isSnFieldRole(opis!.fieldRole)).toBe(true);
        for (const lod of LODY) expect(() => buildSceneV3(enm, lod)).not.toThrow();
      });
    }
  }
});

describe('czytelnicy roli rysunku pól funkcyjnych — oznacznik, nazwa, profil referencyjny, karta techniczna', () => {
  for (const rola of ROLE_FUNKCYJNE) {
    it(`${rola}: klasa oznacznika ${OCZEKIWANE[rola].klasa}, nazwa z kanonu, brak profilu referencyjnego`, () => {
      const r = OCZEKIWANE[rola].rola;
      expect(klasaOznacznikaPola(r)).toBe(OCZEKIWANE[rola].klasa);
      expect(fieldOrdinalDesignation(r, new Map())).toBe(`${OCZEKIWANE[rola].klasa}1`);
      // Forma „w zdaniu" nazwy z kanonu (mała litera na początku), jak dla pozostałych ról.
      const nazwa = OCZEKIWANE[rola].nazwa;
      expect(fieldFunctionalDesignation(r)).toBe(nazwa.charAt(0).toLowerCase() + nazwa.slice(1));
      if (rola !== 'MEASUREMENT') expect(referenceProfileIdForFieldRole(r)).toBeNull();
    });
  }

  it('karta techniczna GPZ liczy pola funkcyjne we własnych wierszach (po 2 na rolę, nie w polach liniowych)', () => {
    const karta = buildTechCardSubject(migawkaH5, { id: gpzRef, type: 'Substation' } as never);
    expect(karta).not.toBeNull();
    const wiersze = karta!.sections.flatMap((s) => s.fields);
    const wartosc = (klucz: string): unknown => wiersze.find((w) => w.key === klucz)?.value;
    expect(wartosc('pole_uziemiajace')).toBe(2);
    expect(wartosc('pole_kompensacyjne')).toBe(2);
    expect(wartosc('pole_pomiar')).toBe(2);
    const etykiety = wiersze.map((w) => w.label);
    expect(etykiety.some((e) => e.endsWith('(ZU)'))).toBe(true);
    expect(etykiety.some((e) => e.endsWith('(BKR)'))).toBe(true);
  });
});

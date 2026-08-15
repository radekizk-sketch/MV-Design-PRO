/**
 * W1 — MACIERZ WARIANTÓW WYPOSAŻENIA POLA (RECENZJA_L2 §1/§6/§12/§15/§20,
 * V12K-145). Fixtura dowodząca „prymatu danych nad konwencją": każde pole
 * niosące `primary_devices` (aparaty z konfiguracji kreatora) rysuje tor
 * pierwotny Z DANYCH — RÓŻNE konfiguracje ⇒ RÓŻNE stosy aparatów, koniec
 * jednego uniwersalnego szablonu §12.4.
 *
 * Podejście (karta W1, opcja „rozszerz sieć referencyjną testową"): klonujemy
 * realną, placeable sieć referencyjną `sldSubstrate52s` i WSTRZYKUJEMY realne
 * `primary_devices` wariantów §20 do wybranych pól (deterministyczny dobór po
 * ref_id + roli). Reszta pól bez danych → ścieżka konwencji (dowód braku
 * regresu). Warianty eksportowane osobno — reużywa je zarówno test end-to-end
 * (adapter → scena), jak i skrypt renderu dowodowego.
 *
 * Macierz §20 (część W1): liniowe LBS+ES · CB+CT+ES · LBS+FUSE · CB+CT+SA;
 * transformatorowe LBS-FUSE+ES · CB+CT+zabezpieczenie.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BayPrimaryDevice, EnergyNetworkModel } from '../../../../../../types/enm';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE_FIXTURE = resolve(
  HERE,
  '../../../../v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json',
);

/** Zamknięty łącznik toru (stan jawny — geometria glifu, nie etykieta). */
function closed(): NonNullable<BayPrimaryDevice['switch_state']> {
  return {
    actual_state: 'zamkniety',
    control_mode: 'zdalne',
    communication_ok: true,
    interlock_blocked: false,
  };
}

/** Otwarty łącznik toru (stan jawny). */
function open(): NonNullable<BayPrimaryDevice['switch_state']> {
  return {
    actual_state: 'otwarty',
    control_mode: 'zdalne',
    communication_ok: true,
    interlock_blocked: false,
  };
}

function device(
  ref: string,
  kind: BayPrimaryDevice['kind'],
  placement: BayPrimaryDevice['placement'],
  extra: Partial<BayPrimaryDevice> = {},
): BayPrimaryDevice {
  return {
    device_ref: ref,
    symbol_ref: `symbol:${kind.toLowerCase()}`,
    kind,
    placement,
    is_controllable: kind === 'CB' || kind === 'LOAD_SWITCH' || kind === 'DS',
    render_variant: 'kanoniczny',
    ...extra,
  };
}

/** W1b (uwaga 15): grupa funkcjonalna renderu macierzy (sekcje dowodu). */
export type W1Group = 'liniowe' | 'transformatorowe';

export interface W1Variant {
  /** Identyfikator wariantu (stabilny klucz doboru pola + podpis renderu). */
  readonly id: string;
  /** Podpis PL na zrzucie dowodowym. */
  readonly label: string;
  /** Rola pola, do którego wariant jest wstrzykiwany (LINIA_IN | TRANSFORMATOROWE). */
  readonly targetRole: 'LINIA_IN' | 'TRANSFORMATOROWE';
  /** W1b (uwaga 15): grupa funkcjonalna do sekcjonowania renderu dowodowego. */
  readonly group: W1Group;
  /** Aparaty pierwotne pola (kolejność „od szyny w dół" wg placement). */
  readonly devices: readonly BayPrimaryDevice[];
  /** Ewentualne kody zabezpieczeń pola (§17.2), dla wariantu z automatyką. */
  readonly protectionCodes?: readonly string[];
}

/**
 * §20 (część W1) — 4 warianty LINIOWE + 2 TRANSFORMATOROWE. `device_ref`
 * per wariant unikalny (parowanie stan↔aparat), placement wg toru: szyna
 * (UPSTREAM) → łącznik/CT (MIDSTREAM) → głowica/TR (DOWNSTREAM) → uziemnik/SA
 * (GROUND_BRANCH, aparaty BOCZNE §15/§18). Głowica ZAWSZE na styku kabla (§6).
 */
export const W1_VARIANTS: readonly W1Variant[] = [
  {
    id: 'linia-lbs-es',
    label: 'Liniowe: LBS + uziemnik (LBS zamknięty)',
    targetRole: 'LINIA_IN',
    group: 'liniowe',
    devices: [
      device('v1/lbs', 'LOAD_SWITCH', 'UPSTREAM', { switch_state: closed(), designation: 'Q1' }),
      device('v1/head', 'CABLE_HEAD', 'DOWNSTREAM'),
      device('v1/es', 'ES', 'GROUND_BRANCH', { switch_state: open(), earthing_role: 'field_earth', designation: 'QE1' }),
    ],
  },
  {
    // W1b (uwagi 13): STAN aparatu otwarty vs zamknięty — IDENTYCZNA
    // konfiguracja co `linia-lbs-es`, jedyna różnica: LBS OTWARTY (asercja
    // różnicy geometrii stanu, nie etykiety — para stan-diff w macierzy).
    id: 'linia-lbs-es-otw',
    label: 'Liniowe: LBS + uziemnik (LBS otwarty)',
    targetRole: 'LINIA_IN',
    group: 'liniowe',
    devices: [
      device('v1o/lbs', 'LOAD_SWITCH', 'UPSTREAM', { switch_state: open(), designation: 'Q1' }),
      device('v1o/head', 'CABLE_HEAD', 'DOWNSTREAM'),
      device('v1o/es', 'ES', 'GROUND_BRANCH', { switch_state: open(), earthing_role: 'field_earth', designation: 'QE1' }),
    ],
  },
  {
    id: 'linia-cb-ct-es',
    label: 'Liniowe: CB + CT + uziemnik',
    targetRole: 'LINIA_IN',
    group: 'liniowe',
    devices: [
      device('v2/ds-bus', 'DS', 'UPSTREAM', { switch_state: closed(), designation: 'Q1' }),
      device('v2/cb', 'CB', 'MIDSTREAM', { switch_state: closed(), designation: 'Q0' }),
      device('v2/ct', 'CT', 'MIDSTREAM', { designation: 'T1' }),
      device('v2/ds-line', 'DS', 'DOWNSTREAM', { switch_state: open(), designation: 'Q2' }),
      device('v2/head', 'CABLE_HEAD', 'DOWNSTREAM'),
      device('v2/es', 'ES', 'GROUND_BRANCH', { switch_state: open(), earthing_role: 'field_earth', designation: 'QE1' }),
    ],
  },
  {
    id: 'linia-lbs-fuse',
    label: 'Liniowe: LBS + bezpieczniki',
    targetRole: 'LINIA_IN',
    group: 'liniowe',
    devices: [
      device('v3/lbs', 'LOAD_SWITCH', 'UPSTREAM', { switch_state: closed(), designation: 'Q1' }),
      device('v3/fuse', 'FUSE', 'MIDSTREAM', { designation: 'F1' }),
      device('v3/head', 'CABLE_HEAD', 'DOWNSTREAM'),
      device('v3/es', 'ES', 'GROUND_BRANCH', { switch_state: open(), earthing_role: 'field_earth', designation: 'QE1' }),
    ],
  },
  {
    id: 'linia-cb-ct-sa',
    label: 'Liniowe: CB + CT + ogranicznik',
    targetRole: 'LINIA_IN',
    group: 'liniowe',
    devices: [
      device('v4/ds-bus', 'DS', 'UPSTREAM', { switch_state: closed(), designation: 'Q1' }),
      device('v4/cb', 'CB', 'MIDSTREAM', { switch_state: closed(), designation: 'Q0' }),
      device('v4/ct', 'CT', 'MIDSTREAM', { designation: 'T1' }),
      device('v4/head', 'CABLE_HEAD', 'DOWNSTREAM'),
      device('v4/es', 'ES', 'GROUND_BRANCH', { switch_state: open(), earthing_role: 'field_earth', designation: 'QE1' }),
      device('v4/sa', 'SURGE_ARRESTER', 'GROUND_BRANCH', { earthing_role: 'surge_ground', designation: 'F2' }),
    ],
  },
  {
    // W1b (uwaga 14): KROTNOŚĆ 2×uziemnik — dane niosą DWA ES (uziemnik pola
    // od strony kabla + uziemnik ekranów kabla). Oba BOCZNE, rysowane obok
    // siebie z odczepu (krotność naturalna z listy, zero fabrykacji).
    id: 'linia-2es',
    label: 'Liniowe: CB + CT + 2×uziemnik',
    targetRole: 'LINIA_IN',
    group: 'liniowe',
    devices: [
      device('v7/ds-bus', 'DS', 'UPSTREAM', { switch_state: closed(), designation: 'Q1' }),
      device('v7/cb', 'CB', 'MIDSTREAM', { switch_state: closed(), designation: 'Q0' }),
      device('v7/ct', 'CT', 'MIDSTREAM', { designation: 'T1' }),
      device('v7/head', 'CABLE_HEAD', 'DOWNSTREAM'),
      device('v7/es1', 'ES', 'GROUND_BRANCH', { switch_state: closed(), earthing_role: 'field_earth', designation: 'QE1' }),
      device('v7/es2', 'ES', 'GROUND_BRANCH', { switch_state: open(), earthing_role: 'cable_screen', designation: 'QE2' }),
    ],
  },
  {
    // W1b (uwaga 14): CT + VT w JEDNYM polu — dowód rozróżnialności symboli
    // (CT ≠ VT, RECENZJA_L2 §7). CT w torze (szereg), VT BOCZNIE (odczep,
    // przekładnik napięciowy przyłączony do toru linii).
    id: 'linia-ct-vt',
    label: 'Liniowe: CB + CT + VT + uziemnik',
    targetRole: 'LINIA_IN',
    group: 'liniowe',
    devices: [
      device('v8/ds-bus', 'DS', 'UPSTREAM', { switch_state: closed(), designation: 'Q1' }),
      device('v8/cb', 'CB', 'MIDSTREAM', { switch_state: closed(), designation: 'Q0' }),
      device('v8/ct', 'CT', 'MIDSTREAM', { designation: 'T1' }),
      device('v8/vt', 'VT', 'MIDSTREAM', { designation: 'T2' }),
      device('v8/head', 'CABLE_HEAD', 'DOWNSTREAM'),
      device('v8/es', 'ES', 'GROUND_BRANCH', { switch_state: open(), earthing_role: 'field_earth', designation: 'QE1' }),
    ],
  },
  {
    id: 'tr-lbs-fuse-es',
    label: 'TR: LBS-bezpiecznik + uziemnik',
    targetRole: 'TRANSFORMATOROWE',
    group: 'transformatorowe',
    devices: [
      device('v5/lbs', 'LOAD_SWITCH', 'UPSTREAM', { switch_state: closed(), designation: 'Q1' }),
      device('v5/fuse', 'FUSE', 'MIDSTREAM', { designation: 'F1' }),
      device('v5/tr', 'TRANSFORMER_DEVICE', 'DOWNSTREAM', { designation: 'T1' }),
      device('v5/es', 'ES', 'GROUND_BRANCH', { switch_state: open(), earthing_role: 'field_earth', designation: 'QE1' }),
    ],
  },
  {
    id: 'tr-cb-ct-zab',
    label: 'TR: CB + CT + zabezpieczenie',
    targetRole: 'TRANSFORMATOROWE',
    group: 'transformatorowe',
    protectionCodes: ['87T', '51', '50', '51N'],
    devices: [
      device('v6/ds-bus', 'DS', 'UPSTREAM', { switch_state: closed(), designation: 'Q1' }),
      device('v6/cb', 'CB', 'MIDSTREAM', { switch_state: closed(), designation: 'Q0' }),
      device('v6/ct', 'CT', 'MIDSTREAM', { designation: 'T1' }),
      device('v6/tr', 'TRANSFORMER_DEVICE', 'DOWNSTREAM', { designation: 'T2' }),
      device('v6/es', 'ES', 'GROUND_BRANCH', { switch_state: open(), earthing_role: 'field_earth', designation: 'QE1' }),
    ],
  },
];

export interface W1InjectionTarget {
  readonly variant: W1Variant;
  readonly stationRef: string;
  readonly fieldRef: string;
}

export interface W1MatrixFixture {
  /** Klon `sldSubstrate52s` z wstrzykniętymi wariantami (do adaptera/sceny). */
  readonly enm: EnergyNetworkModel;
  /** Klon BAZOWY (bez wstrzyknięć) — odniesienie do asercji kotwic (L0/L1/L2). */
  readonly baseEnm: EnergyNetworkModel;
  /** Mapa wariant → wstrzyknięte pole (stationRef/fieldRef). */
  readonly targets: readonly W1InjectionTarget[];
}

interface RawFieldSpec {
  field_ref?: string;
  bay_role?: string;
  meta?: { field_role?: string } & Record<string, unknown>;
  primary_devices?: unknown;
  protection_codes?: unknown;
  [key: string]: unknown;
}

interface RawSubstation {
  ref_id: string;
  station_type?: string;
  meta?: { field_specs?: RawFieldSpec[] } & Record<string, unknown>;
}

function loadBaseEnm(): EnergyNetworkModel {
  const parsed = JSON.parse(readFileSync(BASE_FIXTURE, 'utf8')) as { enm: EnergyNetworkModel };
  return parsed.enm;
}

/**
 * Buduje fixturę macierzy: klon `sldSubstrate52s` + wstrzyknięcie 6 wariantów
 * §20 do pól deterministycznie wybranych stacji (stacje sortowane po ref_id;
 * kolejne warianty do pierwszej wolnej stacji z polem właściwej roli — jedna
 * stacja = jeden wariant, brak podwójnego wstrzyknięcia). Zwraca też KLON
 * BAZOWY (bez wstrzyknięć) do asercji, że dane pola NIE ruszają kotwic stacji.
 */
export function buildW1MatrixFixture(): W1MatrixFixture {
  const enm = loadBaseEnm();
  const baseEnm = loadBaseEnm();

  const fieldStations = (enm.substations as unknown as RawSubstation[])
    .filter((s) => ['branch', 'inline', 'terminal'].includes(s.station_type ?? ''))
    .sort((a, b) => a.ref_id.localeCompare(b.ref_id));

  const usedStations = new Set<string>();
  const targets: W1InjectionTarget[] = [];

  for (const variant of W1_VARIANTS) {
    const station = fieldStations.find((s) => {
      if (usedStations.has(s.ref_id)) return false;
      const specs = s.meta?.field_specs ?? [];
      return specs.some((spec) => (spec.meta?.field_role ?? spec.bay_role) === variant.targetRole);
    });
    if (!station) {
      throw new Error(`W1 fixture: brak wolnej stacji z polem roli ${variant.targetRole}`);
    }
    usedStations.add(station.ref_id);
    const spec = (station.meta?.field_specs ?? []).find(
      (s) => (s.meta?.field_role ?? s.bay_role) === variant.targetRole,
    )!;
    spec.primary_devices = variant.devices.map((d) => ({ ...d }));
    if (variant.protectionCodes) {
      spec.protection_codes = [...variant.protectionCodes];
    }
    targets.push({ variant, stationRef: station.ref_id, fieldRef: spec.field_ref ?? '' });
  }

  return { enm, baseEnm, targets };
}

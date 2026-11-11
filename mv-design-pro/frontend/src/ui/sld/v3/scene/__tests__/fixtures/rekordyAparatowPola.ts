/**
 * Karta GEOMETRIA-STACJI (§0 pkt 4) — rekordy aparatów pola dla fikstur testów sceny.
 *
 * Aparat pola rysuje się WYŁĄCZNIE z rekordu modelu (`Bay.primary_devices` albo gałąź
 * łączeniowa w `Bay.equipment_refs`); pole bez rekordów dostaje jedną sylwetkę braku danych.
 * Testy, których intencją jest geometria aparatów (głowica kablowa, wyłącznik pola TR,
 * przekładnik napięciowy pola pomiarowego), dawniej dostawały te aparaty z konwencji roli —
 * teraz fikstura deklaruje je jawnie jako rekordy modelu tą funkcją (jedno miejsce).
 */
import type { Bay, BayPrimaryDevice, BayPrimaryDeviceKind } from '../../../../../../types/enm';

/** Rekordy `primary_devices` pola w kolejności `kinds` (refy `${bay.ref_id}/aparat/NN-kind`). */
export function rekordyAparatowPola(bayRef: string, kinds: readonly BayPrimaryDeviceKind[]): BayPrimaryDevice[] {
  return kinds.map((kind, i) => ({
    device_ref: `${bayRef}/aparat/${String(i).padStart(2, '0')}-${kind.toLowerCase()}`,
    symbol_ref: kind,
    kind,
    placement: 'MIDSTREAM',
    is_controllable: kind === 'CB' || kind === 'LOAD_SWITCH' || kind === 'DS' || kind === 'ES',
  }));
}

/** Nadaje polu rekordy aparatów (mutacja fikstury budowanej w teście). */
export function nadajRekordyAparatow(bay: Bay, kinds: readonly BayPrimaryDeviceKind[]): void {
  (bay as { primary_devices?: BayPrimaryDevice[] }).primary_devices = rekordyAparatowPola(bay.ref_id, kinds);
}

/** Typowe wyposażenie pola liniowego wyłącznikowego (profil `line_breaker`). */
export const POLE_LINIOWE_WYLACZNIKOWE: readonly BayPrimaryDeviceKind[] = ['DS', 'CB', 'CT', 'DS', 'ES', 'CABLE_HEAD'];

/** Wyposażenie pól wg rodzaju rozdzielnicy i roli rekordu `Bay.bay_role` dla
 *  `zRekordamiAparatowPol` — DANE fikstury (deklaracja wyposażenia rozdzielnic sieci
 *  referencyjnej: GPZ wyłącznikowy, stacje SN/nN z rozdzielnicą kompaktową RMU), nie reguła
 *  rysunku. Pola OZE świadomie bez rekordów (przypadek „brak danych"). */
const WYPOSAZENIE_GPZ: Readonly<Record<string, readonly BayPrimaryDeviceKind[]>> = {
  IN: POLE_LINIOWE_WYLACZNIKOWE,
  OUT: POLE_LINIOWE_WYLACZNIKOWE,
  FEEDER: POLE_LINIOWE_WYLACZNIKOWE,
  TR: ['DS', 'CB', 'CT', 'ES'],
};
const WYPOSAZENIE_RMU: Readonly<Record<string, readonly BayPrimaryDeviceKind[]>> = {
  IN: ['LOAD_SWITCH', 'ES', 'CABLE_HEAD'],
  OUT: ['LOAD_SWITCH', 'ES', 'CABLE_HEAD'],
  FEEDER: ['LOAD_SWITCH', 'ES', 'CABLE_HEAD'],
  TR: ['FUSE', 'ES'],
};

const LACZNIK_GLOWNY: ReadonlySet<BayPrimaryDeviceKind> = new Set(['CB', 'LOAD_SWITCH', 'FUSE']);

/**
 * Kopia migawki, w której pola bez `primary_devices` (stacje SN i GPZ) dostają rekordy
 * aparatów wg tabel wyżej — przypadek (a) karty („model niesie rekordy aparatów"). Łącznik
 * główny pola jest powiązany (`linked_ref`) z gałęzią łączeniową pola z `equipment_refs` —
 * stan z `status` tej gałęzi, jak w migawce budowanej operacjami. Pola spoza tabel zostają
 * bez rekordów — przypadek (c).
 */
export function zRekordamiAparatowPol<
  T extends {
    bays?: readonly Bay[];
    branches?: readonly { ref_id: string; type: string }[];
    substations?: readonly { ref_id: string; station_type?: string | null }[];
  },
>(enm: T): T {
  const kopia = JSON.parse(JSON.stringify(enm)) as T;
  const galezie = new Map((kopia.branches ?? []).map((b) => [b.ref_id, b]));
  const gpz = new Set((kopia.substations ?? []).filter((st) => st.station_type === 'gpz').map((st) => st.ref_id));
  for (const bay of (kopia.bays ?? []) as Bay[]) {
    if ((bay.primary_devices ?? []).length > 0) continue;
    const tabela = gpz.has(bay.substation_ref ?? '') ? WYPOSAZENIE_GPZ : WYPOSAZENIE_RMU;
    const kinds = tabela[bay.bay_role ?? ''];
    if (!kinds) continue;
    const rekordy = rekordyAparatowPola(bay.ref_id, kinds);
    const galaz = (bay.equipment_refs ?? []).find((ref) => ['breaker', 'switch'].includes(galezie.get(ref)?.type ?? ''));
    const glowny = rekordy.find((r) => LACZNIK_GLOWNY.has(r.kind));
    if (galaz && glowny) glowny.linked_ref = galaz;
    (bay as { primary_devices?: BayPrimaryDevice[] }).primary_devices = rekordy;
  }
  return kopia;
}

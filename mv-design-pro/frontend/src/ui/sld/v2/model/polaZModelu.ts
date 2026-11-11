/**
 * Karta GPZ-PARYTET cz. 3: relacje pola z modelu sieci wspólne dla OBU adapterów kanwy
 * (stacje SN/nN `v2/canvas/enmToSldAdapter.ts` i rozdzielnia GPZ
 * `v2/canvas/enmToCanonicalGpzAdapter.ts`) — jedno źródło prawdy zamiast dwóch reguł,
 * które „dziś się zgadzają":
 *  - rodzaj źródła pola źródłowego (`bay_role = 'OZE'`) z przyłączonych wytwórców;
 *  - jedyny transformator pola transformatorowego.
 * Funkcje czyste i deterministyczne (kolejność kolekcji migawki nie zmienia wyniku).
 */
import type { Bay, EnergyNetworkModel, Generator, Transformer } from '../../../../types/enm';
import { FIELD_ROLE, type FieldRole } from '../domain/apparatusContracts';

function napis(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

/** Rodzaj wytwórcy rysowany na schemacie (znaczek źródła stacji, rola pola źródłowego). */
export type RodzajWytworcyRysunku = 'PV' | 'BESS' | 'FW';

/** Rodzaj wytwórcy na rysunku z `Generator.gen_type`; rodzaj spoza rysowanych → `null`. */
export function mapGenTypeToDerKind(gen: Generator): RodzajWytworcyRysunku | null {
  switch (gen.gen_type) {
    case 'pv_inverter':
      return 'PV';
    case 'bess':
      return 'BESS';
    case 'wind_inverter':
    case 'fw_pmsg':
    case 'fw_dfig':
    case 'fw_scig':
      return 'FW';
    default:
      return null;
  }
}

/** Rola pola źródłowego dla rodzaju wytwórcy (`null` = rodzaj nierysowany). */
export function derFieldRoleForGenerator(kind: RodzajWytworcyRysunku | null): FieldRole | null {
  if (kind === 'PV') return FIELD_ROLE.DER_PV;
  if (kind === 'BESS') return FIELD_ROLE.DER_BESS;
  if (kind === 'FW') return FIELD_ROLE.DER_FW;
  return null;
}

/** Role pola źródłowego rysowane glifem źródła (rodzaj rozstrzygnięty albo nieokreślony). */
export type RolaPolaZrodlowego =
  | typeof FIELD_ROLE.DER_PV
  | typeof FIELD_ROLE.DER_BESS
  | typeof FIELD_ROLE.DER_FW
  | typeof FIELD_ROLE.DER_UNKNOWN;

/**
 * Wytwórcy ENM wg pola, w którym stoją — relacja `Generator.meta.field_ref` (backend
 * `enm.pola.KLUCZ_POLA_WYTWORCY`, jedyny nośnik). Liczone raz na budowę bloku.
 */
export function wytworcyWgPola(
  snapshot: Pick<EnergyNetworkModel, 'generators'>,
): ReadonlyMap<string, readonly Generator[]> {
  const wgPola = new Map<string, Generator[]>();
  for (const gen of snapshot.generators ?? []) {
    const pole = napis(gen.meta?.field_ref);
    if (!pole) continue;
    const lista = wgPola.get(pole) ?? [];
    lista.push(gen);
    wgPola.set(pole, lista);
  }
  return wgPola;
}

/**
 * Rola pola źródłowego modelu (`bay_role = 'OZE'`) z RODZAJU przyłączonych wytwórców.
 * Rodzaj rozstrzygnięty tylko, gdy pole ma ≥1 wytwórcę i wszyscy są jednego rysowanego
 * rodzaju; brak wytwórcy, rodzaj spoza rysowanych albo rodzaje mieszane → `DER_UNKNOWN`
 * (jawny glif źródła nieokreślonego), nigdy PV z domysłu.
 */
export function rolaPolaZrodlowego(
  bay: Pick<Bay, 'ref_id'>,
  generatoryWgPola: ReadonlyMap<string, readonly Generator[]>,
): RolaPolaZrodlowego {
  const role = new Set(
    (generatoryWgPola.get(bay.ref_id) ?? []).map(
      (gen) => derFieldRoleForGenerator(mapGenTypeToDerKind(gen)) ?? FIELD_ROLE.DER_UNKNOWN,
    ),
  );
  const [jedyna] = [...role];
  return role.size === 1 && jedyna ? (jedyna as RolaPolaZrodlowego) : FIELD_ROLE.DER_UNKNOWN;
}

/**
 * Jedyny transformator pola: refy `Bay.equipment_refs` ∪ `meta.transformer_ref` przecięte
 * z transformatorami podanego zbioru. Dokładnie jedno trafienie = transformator pola;
 * zero albo więcej niż jedno = `null` (model nie mówi, który transformator rysuje pole).
 */
export function jedynyTransformatorPola(
  bay: Pick<Bay, 'equipment_refs' | 'meta'>,
  transformatoryWgRef: ReadonlyMap<string, Transformer>,
): Transformer | null {
  const refy = new Set<string>(bay.equipment_refs ?? []);
  const zMeta = napis(bay.meta?.transformer_ref);
  if (zMeta) refy.add(zMeta);
  const trafione = [...refy].sort().flatMap((ref) => {
    const tr = transformatoryWgRef.get(ref);
    return tr ? [tr] : [];
  });
  return trafione.length === 1 ? trafione[0] : null;
}

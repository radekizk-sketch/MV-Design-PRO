/**
 * Odczyt kontekstu topologicznego dla AUTO_PRZYJETE (kontrakt prowadzenia projektanta,
 * reguła 6 „topologia, nie heurystyka”): napięcie szyny i odcinka WPROST z migawki modelu.
 * ZERO fizyki — wyłącznie odczyt danych modelu; brak danej = `null` (nigdy wartość typowa).
 */

import type { EnergyNetworkModel } from '../../../types/enm';

type Migawka =
  | (Pick<EnergyNetworkModel, 'buses'> & Partial<Pick<EnergyNetworkModel, 'branches' | 'bays'>>)
  | null
  | undefined;

/** Napięcie znamionowe szyny [kV] (po `ref_id` albo `id`) albo `null`. */
export function napiecieSzyny(migawka: Migawka, busRef: string | null | undefined): number | null {
  if (!migawka || !busRef) return null;
  const szyna = (migawka.buses ?? []).find((b) => b.ref_id === busRef || b.id === busRef);
  const kv = szyna?.voltage_kv;
  return typeof kv === 'number' && Number.isFinite(kv) && kv > 0 ? kv : null;
}

/**
 * Napięcie odcinka [kV] — napięcie szyny początkowej gałęzi (odcinek SN łączy szyny tego
 * samego napięcia; różne napięcia końców = brak jednoznacznego źródła → `null`).
 */
export function napiecieOdcinka(migawka: Migawka, segmentRef: string | null | undefined): number | null {
  if (!migawka || !segmentRef) return null;
  const galaz = (migawka.branches ?? []).find((b) => b.ref_id === segmentRef || b.id === segmentRef);
  if (!galaz) return null;
  const od = napiecieSzyny(migawka, galaz.from_bus_ref);
  const doo = napiecieSzyny(migawka, galaz.to_bus_ref);
  if (od !== null && doo !== null && Math.abs(od - doo) > 1e-6) return null;
  return od ?? doo;
}

/** Napięcie szyny, do której należy pole SN (po `ref_id` albo `id` pola) albo `null`. */
export function napieciePola(migawka: Migawka, poleRef: string | null | undefined): number | null {
  if (!migawka || !poleRef) return null;
  const pole = (migawka.bays ?? []).find((b) => b.ref_id === poleRef || b.id === poleRef);
  return pole ? napiecieSzyny(migawka, pole.bus_ref) : null;
}

/**
 * Położenie na odcinku (RATIO) przekazane przez miejsce wywołania operacji — wyłącznie
 * wartość leżąca WEWNĄTRZ odcinka (0, 1). Koniec odcinka (1) albo brak = `undefined`:
 * element wstawiany NA odcinku nie ma wtedy jednoznacznego położenia i projektant je poda.
 */
export function polozenieZKontekstu(context: Readonly<Record<string, unknown>> | null | undefined): number | undefined {
  if (!context) return undefined;
  const jawne = Number(context.position_on_segment);
  const insertAt = context.insert_at as Record<string, unknown> | undefined;
  const wartosc = Number.isFinite(jawne) ? jawne : Number(insertAt?.value);
  return Number.isFinite(wartosc) && wartosc > 0 && wartosc < 1 ? wartosc : undefined;
}

/** Format napięcia do znacznika AUTO_PRZYJETE (przecinek dziesiętny). */
export function fmtKvPl(kv: number): string {
  return `${String(kv).replace('.', ',')} kV`;
}

/**
 * KARTA POLA-W-TORZE — zacisk pola stacji i przynależność zacisków do stacji, z DANYCH modelu.
 *
 * Zasada toru (backend `enm/tor_pola.py`): element, któremu pole służy (połówka odcinka,
 * strona górna transformatora), jest przyłączony do ZACISKU pola, a aparat pola leży w jego
 * torze prądowym. Zacisk pola nie jest szyną główną stacji (`Substation.bus_refs`), więc każde
 * miejsce, które pyta „do której stacji należy ta szyna”, musi znać zaciski pól — inaczej
 * odcinek dochodzący do pola stacji wyglądałby na rysunku jak odcinek bez stacji.
 *
 * Kolejność kluczy zacisku = lustro `enm.zajetosc_pol.zacisk_pola` (backend): `meta.
 * field_terminal_bus_ref`, `meta.terminal_bus_ref`, `field_terminal_bus_ref`, `terminal_bus_ref`.
 * Zacisk WŁASNY = różny od szyny pola (`bus_ref`); pole bez własnego zacisku (dane zastane)
 * przyłącza elementy wprost do szyny pola.
 */
import type { EnergyNetworkModel } from '../../types/enm';

function napis(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function rekord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Zacisk pola ze specyfikacji (`field_specs[i]`) — `null`, gdy specyfikacja go nie niesie. */
export function zaciskPola(spec: Readonly<Record<string, unknown>>): string | null {
  const meta = rekord(spec.meta);
  for (const kandydat of [
    meta?.field_terminal_bus_ref,
    meta?.terminal_bus_ref,
    spec.field_terminal_bus_ref,
    spec.terminal_bus_ref,
  ]) {
    const wartosc = napis(kandydat);
    if (wartosc) return wartosc;
  }
  return null;
}

/** WŁASNY zacisk pola (różny od szyny pola) — `null` dla pola bez własnego zacisku. */
export function wlasnyZaciskPola(spec: Readonly<Record<string, unknown>>): string | null {
  const zacisk = zaciskPola(spec);
  return zacisk && zacisk !== napis(spec.bus_ref) ? zacisk : null;
}

export interface ZaciskPolaStacji {
  readonly stationRef: string;
  readonly fieldRef: string;
}

/** Własny zacisk pola → (stacja, pole) dla KAŻDEGO pola SN każdej stacji modelu. */
export function zaciskiPolStacji(
  snapshot: Pick<EnergyNetworkModel, 'substations'> | null | undefined,
): ReadonlyMap<string, ZaciskPolaStacji> {
  const wynik = new Map<string, ZaciskPolaStacji>();
  for (const stacja of snapshot?.substations ?? []) {
    const stationRef = napis(stacja.ref_id);
    const specs = rekord(stacja.meta)?.field_specs;
    if (!stationRef || !Array.isArray(specs)) continue;
    for (const raw of specs) {
      const spec = rekord(raw);
      const fieldRef = spec ? napis(spec.field_ref) : null;
      const zacisk = spec ? wlasnyZaciskPola(spec) : null;
      if (fieldRef && zacisk && !wynik.has(zacisk)) wynik.set(zacisk, { stationRef, fieldRef });
    }
  }
  return wynik;
}

/** Stacja, do której należy szyna: szyna główna (`bus_refs`) albo własny zacisk pola stacji. */
export function szynaNalezyDoStacji(
  station: { readonly ref_id: string; readonly bus_refs?: readonly string[]; readonly meta?: unknown },
  busRef: string,
): boolean {
  if ((station.bus_refs ?? []).includes(busRef)) return true;
  const specs = rekord(station.meta)?.field_specs;
  if (!Array.isArray(specs)) return false;
  return specs.some((raw) => {
    const spec = rekord(raw);
    return spec !== null && wlasnyZaciskPola(spec) === busRef;
  });
}

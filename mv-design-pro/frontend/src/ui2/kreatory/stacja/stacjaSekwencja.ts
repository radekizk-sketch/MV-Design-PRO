/**
 * Krok 4 + 8 kreatora stacji — sekwencja operacji po zapisie stacji (K9-B).
 *
 * Stacja powstaje jedną operacją (`insert_station_on_segment_sn` /
 * `append_station_on_endpoint`), a wyposażenie pomiarowo-zabezpieczeniowe pól
 * dokładają kolejne REALNE operacje domenowe: `add_ct`, `add_vt`, `add_relay`.
 *
 * DŁUG NAZWANY (B-3, karta backendowa): sekwencja NIE jest atomowa — backend
 * nie przyjmuje dziś CT/VT/przekaźnika w jednej operacji stacyjnej. Gdy krok
 * pośredni zawiedzie, stacja pozostaje zapisana, a kreator zgłasza dokładnie
 * to, co się nie udało (bez cichego „udało się"). Domknięcie atomowości należy
 * do karty B-3 — tutaj świadomie nie budujemy własnej transakcji.
 *
 * ZERO fizyki: przekładnie CT/VT pochodzą z pozycji katalogowej, backend
 * materializuje parametry.
 */

import type { DomainOpResponseV1 } from '../../../types/enm';

/** Wyposażenie pola wskazane w kroku „Pomiar i zabezpieczenia". */
export interface WyposazeniePola {
  /** Rola pola SN (klucz dopasowania do pól utworzonych przez operację). */
  field_role: string;
  ct_catalog_ref: string | null;
  ct_ratio_primary_a: number | null;
  ct_ratio_secondary_a: number | null;
  vt_catalog_ref: string | null;
  vt_ratio_primary_v: number | null;
  vt_ratio_secondary_v: number | null;
  relay_catalog_ref: string | null;
  relay_type: string;
}

export interface KrokSekwencji {
  operacja: 'add_ct' | 'add_vt' | 'add_relay';
  fieldRef: string;
  payload: Record<string, unknown>;
}

interface SpecPola {
  field_ref?: unknown;
  field_role?: unknown;
  bay_role?: unknown;
  meta?: { field_role?: unknown } | null;
}

/**
 * Referencje pól SN utworzonej stacji, w kolejności zapisu — z odpowiedzi
 * operacji (`substations[].meta.field_specs`). Zwraca pary rola→ref.
 */
export function polaUtworzonejStacji(
  response: DomainOpResponseV1 | null,
  stationRef: string | null,
): Array<{ field_role: string; field_ref: string }> {
  const substations = (response?.snapshot?.substations ?? []) as Array<{
    ref_id?: string;
    meta?: { field_specs?: SpecPola[] } | null;
  }>;
  const station = stationRef
    ? substations.find((s) => s.ref_id === stationRef)
    : substations.find((s) => String(s.ref_id ?? '').includes('/station'));
  const specs = station?.meta?.field_specs ?? [];
  const wynik: Array<{ field_role: string; field_ref: string }> = [];
  for (const spec of specs) {
    const ref = typeof spec.field_ref === 'string' ? spec.field_ref : null;
    if (!ref) continue;
    const rolaMeta = spec.meta && typeof spec.meta.field_role === 'string' ? spec.meta.field_role : null;
    const rola =
      rolaMeta
      ?? (typeof spec.field_role === 'string' ? spec.field_role : null)
      ?? (typeof spec.bay_role === 'string' ? spec.bay_role : '');
    wynik.push({ field_role: String(rola), field_ref: ref });
  }
  return wynik;
}

function bindingKatalogu(namespace: string, itemId: string): Record<string, unknown> {
  return {
    catalog_namespace: namespace,
    catalog_item_id: itemId,
    catalog_item_version: '2024.1',
    materialize: true,
    snapshot_mapping_version: '1.0',
  };
}

/**
 * Buduje sekwencję operacji wyposażenia pól: CT → VT → przekaźnik (w tej
 * kolejności, bo `add_relay` wiąże istniejące CT/VT tego samego pola).
 * Pola bez wskazanego wyposażenia są pomijane (uczciwy brak, nie domysł).
 */
export function zbudujSekwencjeWyposazenia(
  polaStacji: ReadonlyArray<{ field_role: string; field_ref: string }>,
  wyposazenie: ReadonlyArray<WyposazeniePola>,
): KrokSekwencji[] {
  const kroki: KrokSekwencji[] = [];
  const uzytePola = new Set<string>();
  for (const wpis of wyposazenie) {
    const pole = polaStacji.find(
      (p) => p.field_role === wpis.field_role && !uzytePola.has(p.field_ref),
    );
    if (!pole) continue;
    uzytePola.add(pole.field_ref);

    if (wpis.ct_catalog_ref && wpis.ct_ratio_primary_a && wpis.ct_ratio_secondary_a) {
      kroki.push({
        operacja: 'add_ct',
        fieldRef: pole.field_ref,
        payload: {
          bay_ref: pole.field_ref,
          catalog_ref: wpis.ct_catalog_ref,
          catalog_binding: bindingKatalogu('CT', wpis.ct_catalog_ref),
          ratio_primary_a: wpis.ct_ratio_primary_a,
          ratio_secondary_a: wpis.ct_ratio_secondary_a,
        },
      });
    }
    if (wpis.vt_catalog_ref && wpis.vt_ratio_primary_v && wpis.vt_ratio_secondary_v) {
      kroki.push({
        operacja: 'add_vt',
        fieldRef: pole.field_ref,
        payload: {
          bay_ref: pole.field_ref,
          catalog_ref: wpis.vt_catalog_ref,
          catalog_binding: bindingKatalogu('VT', wpis.vt_catalog_ref),
          ratio_primary_v: wpis.vt_ratio_primary_v,
          ratio_secondary_v: wpis.vt_ratio_secondary_v,
        },
      });
    }
    if (wpis.relay_catalog_ref) {
      kroki.push({
        operacja: 'add_relay',
        fieldRef: pole.field_ref,
        payload: {
          bay_ref: pole.field_ref,
          catalog_ref: wpis.relay_catalog_ref,
          catalog_binding: bindingKatalogu('ZABEZPIECZENIE', wpis.relay_catalog_ref),
          relay_type: wpis.relay_type,
        },
      });
    }
  }
  return kroki;
}

export interface WynikSekwencji {
  wykonane: number;
  bladOperacji: string | null;
  ostatniaOdpowiedz: DomainOpResponseV1 | null;
}

/**
 * Wykonuje sekwencję po zapisie stacji. Przerywa na pierwszym błędzie i zwraca
 * komunikat backendu — bez ukrywania częściowego skutku (dług B-3).
 */
export async function wykonajSekwencje(
  kroki: readonly KrokSekwencji[],
  wykonaj: (
    operacja: string,
    payload: Record<string, unknown>,
  ) => Promise<DomainOpResponseV1 | null>,
): Promise<WynikSekwencji> {
  let wykonane = 0;
  let ostatnia: DomainOpResponseV1 | null = null;
  for (const krok of kroki) {
    const odpowiedz = await wykonaj(krok.operacja, krok.payload);
    if (!odpowiedz) {
      return {
        wykonane,
        bladOperacji: `Operacja ${krok.operacja} nie zwróciła odpowiedzi.`,
        ostatniaOdpowiedz: ostatnia,
      };
    }
    if (odpowiedz.error) {
      return { wykonane, bladOperacji: odpowiedz.error, ostatniaOdpowiedz: odpowiedz };
    }
    wykonane += 1;
    ostatnia = odpowiedz;
  }
  return { wykonane, bladOperacji: null, ostatniaOdpowiedz: ostatnia };
}

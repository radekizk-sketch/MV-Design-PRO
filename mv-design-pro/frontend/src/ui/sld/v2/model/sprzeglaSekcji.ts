/**
 * Karta GEOMETRIA-STACJI (Z-07, Z-08) — sprzęgło międzysekcyjne z JEDNEGO źródła.
 *
 * Sprzęgło istnieje na schemacie WTEDY I TYLKO WTEDY, gdy model niesie gałąź
 * `Branch.type === 'bus_coupler'`, której OBA końce leżą na szynach sekcji tej samej
 * rozdzielnicy (GPZ albo stacji SN). Stan rysunku pochodzi ze `status` tej gałęzi
 * rozstrzygniętego rekordami aparatów pola sprzęgła (`stanGaleziPola` — zamknięte / otwarte /
 * nieznane, trzy rysunki; rekord sprzeczny ze statusem = nieznane, jak łącznik pola).
 *
 * Rekord pola sprzęgła (`Bay.bay_role === 'COUPLER'`, wskazujący gałąź przez
 * `equipment_refs` albo `meta.coupler_ref`) NIE warunkuje istnienia sprzęgła: dokłada
 * oznaczenie pola i rodzaj aparatu. Do karty adapter GPZ szukał wyłącznie pola COUPLER
 * (`buildCouplers`), którego operacja GPZ nie tworzy — sprzęgło z modelu znikało z rysunku,
 * a szyny sekcji SN wyglądały na rozłączne (Z-07). Stacja sekcyjna rysowała jedną ciągłą
 * szynę z polem sprzęgła jak zwykłym polem (Z-03).
 *
 * ZERO FIZYKI, zero przeszukiwania topologii: wybór gałęzi po dwóch refach szyn (dana
 * rekordu), bez przechodzenia grafu.
 */
import type { Bay, Branch } from '../../../../types/enm';
import { stanGaleziPola, type StanLacznikaDwupolozeniowego } from './stanAparatowPola';

/** Rodzaj łącznika sprzęgła rysowany glifem toru poziomego: `wylacznik` →
 *  `lineBreaker`, `lacznik` → `lineSwitch` (łącznik, którego funkcji model nie zawęża
 *  albo który jest odłącznikiem/rozłącznikiem). */
export type RodzajLacznikaSprzegla = 'wylacznik' | 'lacznik';

export interface SprzegloSekcjiView {
  /** `Branch.ref_id` gałęzi sprzęgła — tożsamość elementu rysunku. */
  readonly ref: string;
  /** Szyna sekcji po stronie `from_bus_ref` gałęzi. */
  readonly fromBusRef: string;
  /** Szyna sekcji po stronie `to_bus_ref` gałęzi. */
  readonly toBusRef: string;
  /** Stan z `Branch.status` rozstrzygnięty rekordami aparatów pola (brak/inna wartość
   *  albo rekord sprzeczny = nieznany). */
  readonly state: StanLacznikaDwupolozeniowego;
  /** Pole sprzęgła wskazujące tę gałąź (`null` = brak rekordu pola). */
  readonly bayRef: string | null;
  /** Oznaczenie: nazwa pola sprzęgła, inaczej nazwa gałęzi, inaczej jej ref. */
  readonly designation: string;
  readonly rodzaj: RodzajLacznikaSprzegla;
}

function napis(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function poleSprzegla(bays: readonly Bay[], branchRef: string): Bay | null {
  for (const bay of bays) {
    if (bay.bay_role !== 'COUPLER') continue;
    const meta = (bay.meta ?? {}) as Record<string, unknown>;
    if ((bay.equipment_refs ?? []).includes(branchRef) || meta.coupler_ref === branchRef) return bay;
  }
  return null;
}

/** Rodzaj łącznika z DANYCH: klasa wyrobu z katalogu (`materialized_params.device_kind`,
 *  `WYLACZNIK_*`) albo aparat CB w rekordzie pola sprzęgła. Brak obu = `lacznik`. */
function rodzajLacznika(branch: Branch, bay: Bay | null): RodzajLacznikaSprzegla {
  const kind = napis((branch.materialized_params ?? {})['device_kind'])?.toUpperCase() ?? null;
  if (kind?.startsWith('WYLACZNIK')) return 'wylacznik';
  if ((bay?.primary_devices ?? []).some((device) => device.kind === 'CB')) return 'wylacznik';
  return 'lacznik';
}

/**
 * Sprzęgła między sekcjami — gałęzie `bus_coupler` o obu końcach w `sectionBusRefs`
 * (różnych). Kolejność: wg pozycji lewego końca w `sectionBusRefs`, potem `ref`.
 */
export function sprzeglaMiedzySekcjami(
  branches: readonly Branch[],
  sectionBusRefs: readonly string[],
  bays: readonly Bay[],
): SprzegloSekcjiView[] {
  const pozycja = new Map(sectionBusRefs.map((ref, index) => [ref, index]));
  const wynik: { readonly view: SprzegloSekcjiView; readonly lewy: number }[] = [];
  for (const branch of branches) {
    if (branch.type !== 'bus_coupler') continue;
    const ref = napis(branch.ref_id);
    const from = napis(branch.from_bus_ref);
    const to = napis(branch.to_bus_ref);
    if (!ref || !from || !to || from === to) continue;
    const a = pozycja.get(from);
    const b = pozycja.get(to);
    if (a == null || b == null) continue;
    const bay = poleSprzegla(bays, ref);
    wynik.push({
      lewy: Math.min(a, b),
      view: {
        ref,
        fromBusRef: from,
        toBusRef: to,
        state: stanGaleziPola(branch, bay?.primary_devices ?? []),
        bayRef: bay?.ref_id ?? null,
        designation: napis(bay?.name) ?? napis(branch.name) ?? ref,
        rodzaj: rodzajLacznika(branch, bay),
      },
    });
  }
  return wynik
    .sort((x, y) => x.lewy - y.lewy || (x.view.ref < y.view.ref ? -1 : x.view.ref > y.view.ref ? 1 : 0))
    .map((entry) => entry.view);
}

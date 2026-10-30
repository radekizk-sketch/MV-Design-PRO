/**
 * KARTA W5-C — JEDNO lustro frontu reguł stanu łącznika (jedna prawda w modelu bazowym).
 *
 * Backend: `enm/stan_normalny.py`, `enm/topology.py::punkty_podzialu`,
 * `enm/operacje_lacznikow.py`. Dwa pojęcia, dwa pola gałęzi łącznikowej:
 *  - `status` — BIEŻĄCE POŁOŻENIE w modelu bazowym (jedyny stan czytany przez fizykę);
 *    zmieniają je wyłącznie operacje `open_switch` / `close_switch`;
 *  - `normal_state` — POZYCJA NORMALNA z projektu (`'open'` = punkt normalnie otwarty);
 *    `null`/brak = NIEZADEKLAROWANA (nigdy domysł „zamknięty"); punkt podziału ustawia
 *    wyłącznie `set_normal_open_point` (atomowo z zamknięciem poprzedniego punktu pierścienia).
 *
 * Dawne kopie stanu (`Corridor.no_point_ref`, `LineRun.nop_station_ref`,
 * `BranchPointSN.switch_state`) są skasowane — żaden czytelnik frontu nie składa stanu
 * łącznika z innego miejsca niż gałąź łącznika.
 */
import type { Branch, EnergyNetworkModel, FuseBranch, SwitchBranch } from '../../types/enm';
import { isApparatusBranch, isSwitchBranch } from '../../types/enm';

export type PolozenieLacznika = 'closed' | 'open';

/** Łącznik z położeniem otwarty/zamknięty (także bezpiecznik) — `RODZAJE_GALEZI_APARATU`. */
export function czyLacznik(galaz: Branch | null | undefined): galaz is SwitchBranch | FuseBranch {
  return galaz != null && isApparatusBranch(galaz);
}

/** Łącznik z POZYCJĄ NORMALNĄ (bez bezpiecznika) — `RODZAJE_GALEZI_LACZNIKA`. */
export function czyLacznikZPozycjaNormalna(
  galaz: Branch | null | undefined,
): galaz is SwitchBranch {
  return galaz != null && isSwitchBranch(galaz);
}

/** Pozycja normalna łącznika; `null` = niezadeklarowana albo bezpiecznik. */
export function pozycjaNormalna(galaz: Branch | null | undefined): PolozenieLacznika | null {
  if (!czyLacznikZPozycjaNormalna(galaz)) return null;
  return galaz.normal_state === 'open' || galaz.normal_state === 'closed' ? galaz.normal_state : null;
}

/** Czy łącznik jest punktem normalnie otwartym (wyłącznie z `normal_state`). */
export function czyPunktPodzialu(galaz: Branch | null | undefined): boolean {
  return pozycjaNormalna(galaz) === 'open';
}

export const ETYKIETA_POLOZENIA_PL: Readonly<Record<PolozenieLacznika, string>> = {
  closed: 'Zamknięty',
  open: 'Otwarty',
};

/** Etykieta bieżącego położenia (pole `status` gałęzi). */
export function etykietaPolozenia(status: string | null | undefined): string {
  return status === 'open' || status === 'closed' ? ETYKIETA_POLOZENIA_PL[status] : '—';
}

/** Etykieta pozycji normalnej — brak deklaracji nazwany wprost, bez domysłu. */
export function etykietaPozycjiNormalnej(pozycja: PolozenieLacznika | null): string {
  if (pozycja === 'open') return 'Normalnie otwarty (punkt podziału)';
  if (pozycja === 'closed') return 'Normalnie zamknięty';
  return 'Niezadeklarowana';
}

/** Punkty normalnie otwarte modelu (po `ref_id`) — lustro `enm.topology.punkty_podzialu`. */
export function punktyPodzialu(
  snapshot: Pick<EnergyNetworkModel, 'branches'> | null | undefined,
): SwitchBranch[] {
  return (snapshot?.branches ?? [])
    .filter((galaz): galaz is SwitchBranch => czyPunktPodzialu(galaz))
    .sort((a, b) => (a.ref_id < b.ref_id ? -1 : a.ref_id > b.ref_id ? 1 : 0));
}

/** Kandydaci na nowy punkt podziału: łączniki z pozycją normalną, które nim jeszcze nie są. */
export function kandydaciNaPunktPodzialu(
  snapshot: Pick<EnergyNetworkModel, 'branches'> | null | undefined,
): SwitchBranch[] {
  return (snapshot?.branches ?? [])
    .filter(
      (galaz): galaz is SwitchBranch => czyLacznikZPozycjaNormalna(galaz) && !czyPunktPodzialu(galaz),
    )
    .sort((a, b) => (a.ref_id < b.ref_id ? -1 : a.ref_id > b.ref_id ? 1 : 0));
}

/**
 * Łączniki portów punktu rozgałęzienia (ZKSN, słup) — gałęzie z
 * `meta.branch_point_ref` punktu; kolejność po porcie, potem po `ref_id`. Stan łącznika
 * portu żyje WYŁĄCZNIE na tej gałęzi (dawna kopia `BranchPointSN.switch_state` skasowana).
 */
export function lacznikiPortowPunktu(
  snapshot: Pick<EnergyNetworkModel, 'branches'> | null | undefined,
  punktRef: string,
): Array<SwitchBranch | FuseBranch> {
  const port = (galaz: Branch): string => {
    const wartosc = galaz.meta?.port_id;
    return typeof wartosc === 'string' ? wartosc : '';
  };
  return (snapshot?.branches ?? [])
    .filter(
      (galaz): galaz is SwitchBranch | FuseBranch =>
        czyLacznik(galaz) && galaz.meta?.branch_point_ref === punktRef,
    )
    .sort((a, b) => {
      const pa = port(a);
      const pb = port(b);
      if (pa !== pb) return pa < pb ? -1 : 1;
      return a.ref_id < b.ref_id ? -1 : a.ref_id > b.ref_id ? 1 : 0;
    });
}

/** Opis stanu łącznika: położenie i pozycja normalna (np. „Otwarty · normalnie zamknięty"). */
export function opisStanuLacznika(galaz: SwitchBranch | FuseBranch): string {
  const polozenie = etykietaPolozenia(galaz.status);
  if (!czyLacznikZPozycjaNormalna(galaz)) return polozenie;
  return `${polozenie} · pozycja normalna: ${etykietaPozycjiNormalnej(pozycjaNormalna(galaz)).toLowerCase()}`;
}

/**
 * Stan łączników portów punktu rozgałęzienia jednym zdaniem — z gałęzi, nigdy z domysłu.
 * Punkt bez łączników portów: „Brak łączników portów w modelu".
 */
export function opisLacznikowPortow(
  snapshot: Pick<EnergyNetworkModel, 'branches'> | null | undefined,
  punktRef: string,
): string {
  const laczniki = lacznikiPortowPunktu(snapshot, punktRef);
  if (laczniki.length === 0) return 'Brak łączników portów w modelu';
  return laczniki.map((galaz) => `${galaz.name}: ${opisStanuLacznika(galaz)}`).join('; ');
}

/** Łącznik wskazany przez obiekt rysunku albo powód, dla którego go nie ma. */
export type LacznikTematu =
  | { readonly lacznik: SwitchBranch | FuseBranch; readonly powodPl?: undefined }
  | { readonly lacznik: null; readonly powodPl: string };

/**
 * Łącznik, którego dotyczy akcja stanu (otwórz / zamknij / punkt podziału) dla obiektu
 * rysunku: gałąź łącznikowa wprost albo JEDYNY łącznik pola (`Bay.equipment_refs`;
 * aparat z kompozytem `⟨pole⟩#⟨rodzaj⟩` wskazuje pole). Pole z kilkoma łącznikami nie
 * daje wyboru za projektanta — powód nazywa łączniki do wskazania.
 */
export function lacznikTematu(
  snapshot: Pick<EnergyNetworkModel, 'branches' | 'bays'> | null | undefined,
  ref: string | null | undefined,
): LacznikTematu {
  if (!snapshot || !ref) {
    return { lacznik: null, powodPl: 'Nie wskazano łącznika — zaznacz łącznik na schemacie.' };
  }
  const galezie = snapshot.branches ?? [];
  const galaz = galezie.find((b) => b.ref_id === ref || b.id === ref) ?? null;
  if (galaz) {
    return czyLacznik(galaz)
      ? { lacznik: galaz }
      : {
          lacznik: null,
          powodPl:
            'Element nie jest łącznikiem — stan otwarty albo zamknięty mają wyłącznie łączniki i bezpieczniki.',
        };
  }
  const znacznik = ref.lastIndexOf('#');
  const refPola = znacznik > 0 ? ref.slice(0, znacznik) : ref;
  const pole = (snapshot.bays ?? []).find((b) => b.ref_id === refPola || b.id === refPola) ?? null;
  if (!pole) {
    return { lacznik: null, powodPl: 'Wskazany obiekt nie jest łącznikiem modelu sieci.' };
  }
  const laczniki = (pole.equipment_refs ?? [])
    .map((r) => galezie.find((b) => b.ref_id === r) ?? null)
    .filter((b): b is SwitchBranch | FuseBranch => czyLacznik(b));
  if (laczniki.length === 1) return { lacznik: laczniki[0] };
  if (laczniki.length === 0) {
    return { lacznik: null, powodPl: 'Pole nie ma łącznika w modelu sieci.' };
  }
  return {
    lacznik: null,
    powodPl: `Pole ma kilka łączników (${laczniki.map((b) => b.name).join(', ')}) — wskaż łącznik na schemacie albo w karcie pola.`,
  };
}

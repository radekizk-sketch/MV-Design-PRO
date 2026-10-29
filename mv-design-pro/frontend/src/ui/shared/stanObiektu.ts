/**
 * Stan obiektu pola i aparatu pola — nazwy PL (lustro `NAZWY_STANOW_OBIEKTU_PL`,
 * `backend/src/network_model/catalog/gazy_fluorowane.py`; parytet przypina
 * `backend/tests/ci/test_parytet_stanu_obiektu.py`).
 *
 * Stan nieustalony (`null` — zapis sprzed atrybutu) ma własne zdanie: brak danej NIE jest stanem
 * istniejącym (zakaz gazów fluorowanych obejmuje go tak samo jak pole projektowane).
 */
import type { StanObiektu } from '../../types/enm';

export const NAZWY_STANOW_OBIEKTU_PL: Readonly<Record<StanObiektu, string>> = {
  ISTNIEJACY: 'istniejący',
  PROJEKTOWANY: 'projektowany',
};

export const STAN_OBIEKTU_NIEUSTALONY_PL = 'nieustalony (zapis sprzed rozróżnienia stanu)';

export function nazwaStanuObiektuPl(stan: StanObiektu | null | undefined): string {
  return stan ? NAZWY_STANOW_OBIEKTU_PL[stan] : STAN_OBIEKTU_NIEUSTALONY_PL;
}

/** Fragment rekordu pola potrzebny regule stanu łącznika (`Bay`). */
interface PoleStanu {
  readonly stan_obiektu?: StanObiektu | null;
  readonly equipment_refs?: readonly string[] | null;
  readonly primary_devices?: readonly { readonly linked_ref?: string | null; readonly stan_obiektu?: StanObiektu | null }[] | null;
}

/** Fragment gałęzi łączeniowej potrzebny regule stanu (`SwitchBranch`). */
interface GalazStanu {
  readonly ref_id: string;
  readonly stan_obiektu?: StanObiektu | null;
}

function napisStanu(stan: StanObiektu | null | undefined): StanObiektu | null {
  return typeof stan === 'string' && stan.trim() ? (stan.trim() as StanObiektu) : null;
}

/**
 * Stan obiektu gałęzi łączeniowej — lustro reguły backendu
 * (`backend/src/enm/gaz_fluorowany_pola.py::stan_obiektu_lacznika`; parytet przypina fikstura
 * wygenerowana z wyniku backendu, `backend/tests/ci/test_parytet_stanu_obiektu.py`).
 *
 * Źródła stanu jednego fizycznego aparatu: aparat pola wskazujący gałąź (`linked_ref` — pierwszy
 * w kolejności pól i aparatów) i stan samej gałęzi. Istniejący wyłącznie, gdy każde źródło mówi
 * „istniejący"; projektowany, gdy któreś mówi „projektowany"; gałąź bez żadnego źródła należąca
 * do pola (`equipment_refs`, zapis sprzed atrybutu) — stan pola. `null` = stan nieustalony.
 */
export function stanObiektuLacznika(
  pola: readonly PoleStanu[] | null | undefined,
  galaz: GalazStanu,
): StanObiektu | null {
  const zrodla: (StanObiektu | null)[] = [];
  const aparat = (pola ?? [])
    .flatMap((pole) => pole.primary_devices ?? [])
    .find((a) => typeof a.linked_ref === 'string' && a.linked_ref.trim() === galaz.ref_id);
  if (aparat) zrodla.push(napisStanu(aparat.stan_obiektu));
  const wlasny = napisStanu(galaz.stan_obiektu);
  if (wlasny !== null) zrodla.push(wlasny);
  if (zrodla.length === 0) {
    const pole = (pola ?? []).find((p) => (p.equipment_refs ?? []).includes(galaz.ref_id));
    return pole ? napisStanu(pole.stan_obiektu) : null;
  }
  if (zrodla.every((stan) => stan === 'ISTNIEJACY')) return 'ISTNIEJACY';
  if (zrodla.includes('PROJEKTOWANY')) return 'PROJEKTOWANY';
  return null;
}

/** Wartość atrybutu DOM `data-stan-obiektu` symbolu schematu: stan rekordu aparatu,
 *  `NIEUSTALONY` dla rekordu bez stanu; `undefined` (brak atrybutu) — symbol bez rekordu. */
export function atrybutStanuObiektu(stan: StanObiektu | null | undefined): StanObiektu | 'NIEUSTALONY' | undefined {
  if (stan === undefined) return undefined;
  return stan ?? 'NIEUSTALONY';
}

/** Podpowiedź stanu obiektu na symbolu schematu (dyskretnie — bez znaku na rysunku);
 *  `undefined` — symbol bez rekordu aparatu nie ma stanu obiektu. */
export function podpowiedzStanuObiektuPl(stan: StanObiektu | null | undefined): string | undefined {
  return stan === undefined ? undefined : `Stan obiektu: ${nazwaStanuObiektuPl(stan)}`;
}

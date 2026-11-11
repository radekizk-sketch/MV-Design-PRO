/**
 * Karta W5-B — JEDEN helper testowy budujący rekord pola `Bay` (jedyny nośnik pól SN, nN
 * i ZKSN) z domyślnymi wartościami kontraktu. Testy podają wyłącznie pola istotne dla
 * przypadku; reszta ma kształt, jaki serializuje backend (`enm.pola.zbuduj_pole`): pusta
 * lista aparatów, brak zacisku, brak właściciela ZKSN. Nazwa domyślna = identyfikator
 * pola NIE jest stosowana (backend nadaje nazwę roli) — test, który czyta nazwę, podaje ją.
 */
import type { Bay } from '../types/enm';

export type PoleTestowe = Partial<Bay> & Pick<Bay, 'ref_id' | 'bay_role' | 'bus_ref'>;

export function pole(dane: PoleTestowe): Bay {
  return {
    id: dane.id ?? dane.ref_id,
    name: dane.name ?? `Pole ${dane.bay_role}`,
    tags: [],
    meta: {},
    substation_ref: null,
    branch_point_ref: null,
    equipment_refs: [],
    protection_codes: [],
    primary_devices: [],
    surge_arresters: [],
    ...dane,
  };
}

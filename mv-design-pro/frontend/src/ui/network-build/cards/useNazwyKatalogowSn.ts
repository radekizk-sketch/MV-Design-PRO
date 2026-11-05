/**
 * Nazwy wyrobów SN z katalogu backendu (rodziny rozdzielnic i aparaty SN) — mapa
 * identyfikator → nazwa do opisu pola (`opisPolaSn.ts`). W UI nie ma identyfikatorów katalogu:
 * pozycja bez nazwy (katalog nieosiągalny) jest opisana rodzajem „z katalogu”. Zapytanie idzie
 * dopiero, gdy opis ma co nazwać (`potrzebne`) — pole bez pozycji katalogu nie pyta katalogu.
 */
import { useEffect, useState } from 'react';

import { fetchMvApparatusTypes, fetchSwitchgearFamilies } from '../../catalog/api';

export function useNazwyKatalogowSn(potrzebne: boolean): ReadonlyMap<string, string> {
  const [nazwy, setNazwy] = useState<ReadonlyMap<string, string>>(new Map());
  useEffect(() => {
    if (!potrzebne) return;
    let anulowano = false;
    Promise.all([fetchSwitchgearFamilies(), fetchMvApparatusTypes()])
      .then(([rodziny, aparaty]) => {
        if (anulowano) return;
        const mapa = new Map<string, string>();
        for (const r of Array.isArray(rodziny) ? rodziny : []) mapa.set(r.switchgear_family_ref, r.family_name);
        for (const a of Array.isArray(aparaty) ? aparaty : []) mapa.set(a.id, a.name);
        setNazwy(mapa);
      })
      .catch(() => {
        if (!anulowano) setNazwy(new Map());
      });
    return () => {
      anulowano = true;
    };
  }, [potrzebne]);
  return nazwy;
}

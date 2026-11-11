/**
 * Wymagania EAZ projektanta z konfiguracji przypadku obliczeniowego (`wymagania_eaz`) — jeden
 * hak dla ekranów, które pokazują ocenę ziemnozwarciową z biegu przypadku: E-28 (ocena
 * zabezpieczeń) i koordynacja. Odczyt z serwera, zapis PATCH-em tylko tego pola (backend
 * scala z resztą konfiguracji), potem `poZapisie` — nowy bieg na tych samych danych.
 */

import { useEffect, useState } from 'react';

import { getStudyCase } from '../../../ui/study-cases/api';
import { useStudyCasesStore } from '../../../ui/study-cases/store';
import type { WymaganiaEaz } from '../../../ui/study-cases/types';
import type { EdycjaWymagan } from './TabelaOcenyZiemnozwarciowej';

export function useEdycjaWymaganEaz(
  caseId: string | null,
  poZapisie: () => Promise<void>,
): { edycja: EdycjaWymagan | undefined; blad: string | null } {
  const [wymagania, setWymagania] = useState<WymaganiaEaz | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  useEffect(() => {
    let anulowano = false;
    setWymagania(null);
    if (!caseId) return undefined;
    getStudyCase(caseId)
      .then((p) => {
        if (!anulowano) setWymagania(p.config.wymagania_eaz);
      })
      .catch((err: unknown) => {
        if (!anulowano) setBlad(err instanceof Error ? err.message : String(err));
      });
    return () => {
      anulowano = true;
    };
  }, [caseId]);
  if (!caseId || !wymagania) return { edycja: undefined, blad };
  return {
    edycja: {
      wymagania,
      onZapisz: async (nowe) => {
        const przypadek = await useStudyCasesStore
          .getState()
          .updateCase(caseId, { config: { wymagania_eaz: nowe } });
        setWymagania(przypadek.config.wymagania_eaz);
        await poZapisie();
      },
    },
    blad,
  };
}

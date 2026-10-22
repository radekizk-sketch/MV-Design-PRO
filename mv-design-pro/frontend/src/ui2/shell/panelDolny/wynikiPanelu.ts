/*
 * Źródło danych zakładek „Wyniki" i „Dowody" panelu dolnego (karta UI-02 PANEL-DOLNY,
 * karta K8 KONTEKST-WYNIKU).
 *
 * BIEGI. Lista zakończonych przebiegów aktywnego zakresu pochodzi z rejestru biegów
 * powłoki (`useExecutionRunsStore.runs`, hydratowany z
 * `GET /api/execution/study-cases/{id}/runs`) w porządku `uporzadkujBiegi`
 * (najnowszy na górze — ta sama kolejność co zakładka „Przebiegi").
 *
 * BIEG TABELI. Karta K8: panel NIE trzyma własnego wyboru biegu. Tabela pokazuje bieg
 * OGLĄDANY z magazynu kontekstu wyniku (`ui2/wyniki/kontekst`) — ten sam, który jest na
 * schemacie, na pasku stanu, w inspektorze i w „Dowodach"; wybór w panelu idzie akcją
 * `wybierzBieg(…, 'panel')` i zmienia bieg wszędzie.
 *
 * WYNIK. `results/v1` wskazanego biegu z JEDNEJ pamięci magazynu kontekstu (kluczowanej
 * identyfikatorem biegu — wynik zakończonego biegu jest niezmienny); licznik zakładki,
 * jej treść i nakładka schematu czytają ten sam wpis.
 */
import { useMemo } from 'react';

import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import type { ExecutionRun } from '../../../ui/study-cases/types';
import {
  biegiZakonczone,
  useBiegOgladany,
  useWynikBiegu,
  type StanWynikuBiegu,
} from '../../wyniki/kontekst/kontekstWyniku';

export function useBiegiZakonczone(): ExecutionRun[] {
  const runs = useExecutionRunsStore((s) => s.runs);
  return useMemo(() => biegiZakonczone(runs), [runs]);
}

export interface BiegWynikowPanelu {
  readonly biegi: readonly ExecutionRun[];
  /** Bieg, którego wynik pokazuje tabela — bieg OGLĄDANY (`null` = brak zakończonego biegu). */
  readonly bieg: ExecutionRun | null;
  readonly stan: StanWynikuBiegu | null;
}

/** Bieg tabeli = bieg oglądany z magazynu kontekstu wyniku; wczytuje jego wynik (raz na bieg). */
export function useBiegWynikowPanelu(): BiegWynikowPanelu {
  const biegi = useBiegiZakonczone();
  const bieg = useBiegOgladany();
  const stan = useWynikBiegu(bieg?.id ?? null);
  return { biegi, bieg, stan };
}

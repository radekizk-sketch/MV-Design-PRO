/*
 * Hook: kontrakt świeżości wyników (E15.2) — jeden, współdzielony hook: każda dana
 * pochodna porównywana z rewizją modelu, reagujący NA ŻYWO na zdarzenia magistrali
 * (`model-zmieniony`, `wyniki-niewazne`, `wyniki-gotowe`).
 *
 * Kontrakt: docs/uiux/karty/U1_E15_2_SWIEZOSC.md §2-3,
 * docs/uiux/SPEC_POWIAZANIA_WARSTW_2026-07.md §3.
 *
 * Stan początkowy WYŁĄCZNIE ze store'ów istniejących (odczyt — zero zapisu, zero API):
 * - frontend/src/ui/topology/snapshotStore.ts — useSnapshotStore.snapshot.header.revision
 *   -> rewizjaModelu (fallback 0 gdy brak projektu — konwencja jak
 *   ui2/adapters/inspectorAdapter.ts `useRewizjaModelu`).
 * - frontend/src/ui/app-state/store.ts — useAppStateStore.activeCaseResultStatus
 *   ('NONE'|'FRESH'|'OUTDATED'): NONE -> 'brak', FRESH -> 'aktualne' (rewizjaDanej =
 *   bieżąca rewizjaModelu — status FRESH z definicji oznacza zgodność z modelem),
 *   OUTDATED -> 'nieaktualne' (rewizjaDanej NIEZNANA na starcie — store statusu nie
 *   przechowuje pary rewizji, tylko wyliczony status; brak zgadywania, patrz
 *   opisSwiezosci.ts TODO-KARTA).
 *
 * Po zamontowaniu aktualizacje WYŁĄCZNIE przez zdarzenia magistrali (`ui2/events`),
 * bez odpytywania store'ów w pętli:
 * - 'model-zmieniony'  -> 'nieaktualne'; rewizjaDanej = ostatnia znana rewizja, przy
 *   której dana pochodna była aktualna (zapamiętana — kolejne zmiany modelu bez
 *   przeliczenia NIE przesuwają rewizjaDanej, tylko rewizjaModelu); rewizjaModelu =
 *   rev ze zdarzenia. Wyjątek: stan 'brak' pozostaje 'brak' (nie ma czego unieważniać).
 * - 'wyniki-niewazne'  -> identyczna reakcja jak 'model-zmieniony' (Case Immutability
 *   Rule, CLAUDE.md: zmiana modelu unieważnia WSZYSTKIE wyniki; magistrala emituje oba
 *   zdarzenia razem przy każdej zmianie modelu — ui2/events/adapters/snapshotAdapter.ts
 *   — ale kontrakt magistrali §5 SPEC dopuszcza osobną subskrypcję, więc obsługujemy
 *   oba niezależnie zamiast zakładać kolejność/współwystępowanie).
 * - 'wyniki-gotowe'    -> 'aktualne'; rewizjaDanej = bieżąca rewizjaModelu (wyniki
 *   policzone względem aktualnej rewizji modelu).
 *
 * Uproszczenie świadome (poza zakresem karty — 3 zadeklarowane typy zdarzeń, bez
 * dodatkowej logiki): hook NIE filtruje zdarzenia 'wyniki-gotowe' po `przypadekId`.
 * Reguła „Only ONE case active at a time" (CLAUDE.md) oznacza, że w danym momencie
 * może być liczony/aktywny wyłącznie jeden przypadek — ten sam kontekst, z którego
 * pochodzi stan początkowy (`activeCaseResultStatus`).
 *
 * Hook NIE zapisuje do żadnego store'u — wyłącznie lokalny stan Reacta (`useState`).
 */

import { useEffect, useState } from 'react';

import { useAppStateStore } from '../../ui/app-state/store';
import { useSnapshotStore } from '../../ui/topology/snapshotStore';
import { subskrybuj } from '../events';
import type { OpisSwiezosci } from './freshnessModel';

function rewizjaModeluZeStore(): number {
  return useSnapshotStore.getState().snapshot?.header.revision ?? 0;
}

function stanPoczatkowy(): OpisSwiezosci {
  const rewizjaModelu = rewizjaModeluZeStore();
  const status = useAppStateStore.getState().activeCaseResultStatus;

  if (status === 'FRESH') {
    return { stan: 'aktualne', rewizjaDanej: rewizjaModelu, rewizjaModelu };
  }
  if (status === 'OUTDATED') {
    return { stan: 'nieaktualne', rewizjaModelu, przyczyna: 'model-zmieniony' };
  }
  return { stan: 'brak', rewizjaModelu };
}

/** Reakcja na 'model-zmieniony' / 'wyniki-niewazne' — obie mają tę samą semantykę. */
function naNieaktualne(poprzedni: OpisSwiezosci, rev: number): OpisSwiezosci {
  if (poprzedni.stan === 'brak') {
    return { stan: 'brak', rewizjaModelu: rev };
  }
  return {
    stan: 'nieaktualne',
    rewizjaDanej: poprzedni.rewizjaDanej ?? poprzedni.rewizjaModelu,
    rewizjaModelu: rev,
    przyczyna: 'model-zmieniony',
  };
}

/** Reakcja na 'wyniki-gotowe' — dana pochodna policzona względem bieżącej rewizji modelu. */
function naAktualne(poprzedni: OpisSwiezosci): OpisSwiezosci {
  return {
    stan: 'aktualne',
    rewizjaDanej: poprzedni.rewizjaModelu,
    rewizjaModelu: poprzedni.rewizjaModelu,
  };
}

/** Hook: bieżący opis świeżości wyników, aktualizowany na żywo z magistrali zdarzeń. */
export function useSwiezoscWynikow(): OpisSwiezosci {
  const [opis, setOpis] = useState<OpisSwiezosci>(stanPoczatkowy);

  useEffect(() => {
    const odsubskrybujModelZmieniony = subskrybuj('model-zmieniony', (zdarzenie) => {
      setOpis((poprzedni) => naNieaktualne(poprzedni, zdarzenie.rev));
    });
    const odsubskrybujWynikiNiewazne = subskrybuj('wyniki-niewazne', (zdarzenie) => {
      setOpis((poprzedni) => naNieaktualne(poprzedni, zdarzenie.rev));
    });
    const odsubskrybujWynikiGotowe = subskrybuj('wyniki-gotowe', () => {
      setOpis((poprzedni) => naAktualne(poprzedni));
    });

    return () => {
      odsubskrybujModelZmieniony();
      odsubskrybujWynikiNiewazne();
      odsubskrybujWynikiGotowe();
    };
  }, []);

  return opis;
}

/**
 * Adapter: tlumaczy zmiany store'u snapshotu ENM na zdarzenia magistrali
 * 'model-zmieniony', 'wyniki-niewazne' i 'gotowosc-zmieniona'.
 *
 * Zrodlo store'u (WYLACZNIE odczyt/subscribe — zero zapisu, zero wolan API):
 * frontend/src/ui/topology/snapshotStore.ts — useSnapshotStore
 *   - snapshot.header.revision                          -> rev
 *     ('model-zmieniony', 'wyniki-niewazne')
 *   - lastChanges.{created,updated,deleted}_element_ids  -> zakres
 *     ('model-zmieniony' — identyfikatory elementow objetych zmiana)
 *   - readiness.blockers.length / readiness.warnings.length
 *                                                         -> blokady / ostrzezenia
 *     ('gotowosc-zmieniona')
 *
 * Wybor store'u gotowosci: uzyto `readiness` wbudowanego w useSnapshotStore
 * (czesc tej samej odpowiedzi operacji domenowej co snapshot — DomainOpResponseV1),
 * a NIE osobnego `useReadinessLiveStore` (engineering-readiness/readinessLiveStore.ts),
 * poniewaz ten drugi wymaga oddzielnego zapytania API (`fetch`) inicjowanego przez
 * wywolujacego i moze byc niezsynchronizowany z biezaca rewizja snapshotu w danym
 * momencie. `useSnapshotStore.readiness` jest zawsze aktualny wzgledem `snapshot`
 * (ta sama odpowiedz backendu), co jest zgodne z zasada "magistrala nie jest
 * zrodlem prawdy — tlumaczy ISTNIEJACY, spojny stan".
 *
 * Case Immutability Rule (CLAUDE.md): zmiana modelu uniewaznia WSZYSTKIE wyniki
 * wszystkich przypadkow — dlatego kazda emisja 'model-zmieniony' jest
 * natychmiast nastepowana emisja 'wyniki-niewazne' z ta sama rewizja.
 */

import { useSnapshotStore, type SnapshotState } from '../../../ui/topology/snapshotStore';
import type { ChangesInfo } from '../../../types/enm';
import { emituj } from '../bus';

function zakresZmian(lastChanges: ChangesInfo | null): string[] {
  if (!lastChanges) {
    return [];
  }
  const wszystkie = new Set<string>([
    ...lastChanges.created_element_ids,
    ...lastChanges.updated_element_ids,
    ...lastChanges.deleted_element_ids,
  ]);
  return Array.from(wszystkie).sort((a, b) => a.localeCompare(b));
}

let ostrzezonoRaz = false;
function ostrzezRaz(komunikat: string, err: unknown): void {
  if (ostrzezonoRaz) {
    return;
  }
  ostrzezonoRaz = true;
  console.warn(komunikat, err);
}

/**
 * Uruchamia subskrypcje snapshotStore -> magistrala. Wywolac raz przy starcie
 * powloki. Zwraca funkcje odsubskrybowania.
 */
export function startSnapshotAdapter(): () => void {
  let stanPoczatkowy: SnapshotState | null;
  try {
    stanPoczatkowy = useSnapshotStore.getState();
  } catch (err) {
    ostrzezRaz('[ui2/events] snapshotAdapter: store snapshotu niedostepny — adapter no-op', err);
    return () => {};
  }

  let ostatniaRewizja: number | null = stanPoczatkowy.snapshot?.header.revision ?? null;
  let ostatnieBlokady = stanPoczatkowy.readiness?.blockers.length ?? 0;
  let ostatnieOstrzezenia = stanPoczatkowy.readiness?.warnings.length ?? 0;

  try {
    return useSnapshotStore.subscribe((stan) => {
      // Brak snapshotu (np. brak aktywnego projektu) -> adapter nie emituje
      // (przypadek brzegowy §4 karty).
      if (!stan.snapshot) {
        return;
      }

      const rev = stan.snapshot.header.revision;
      if (rev !== ostatniaRewizja) {
        ostatniaRewizja = rev;
        emituj({ typ: 'model-zmieniony', rev, zakres: zakresZmian(stan.lastChanges) });
        emituj({ typ: 'wyniki-niewazne', przyczyna: 'model-zmieniony', rev });
      }

      const blokady = stan.readiness?.blockers.length ?? 0;
      const ostrzezenia = stan.readiness?.warnings.length ?? 0;
      if (blokady !== ostatnieBlokady || ostrzezenia !== ostatnieOstrzezenia) {
        ostatnieBlokady = blokady;
        ostatnieOstrzezenia = ostrzezenia;
        emituj({ typ: 'gotowosc-zmieniona', blokady, ostrzezenia });
      }
    });
  } catch (err) {
    ostrzezRaz('[ui2/events] snapshotAdapter: subskrypcja store niedostepna — adapter no-op', err);
    return () => {};
  }
}

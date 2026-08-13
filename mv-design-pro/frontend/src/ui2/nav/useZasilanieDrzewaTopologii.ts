/*
 * Zasilenie drzewa topologii danymi z serwera (karta KD-1).
 *
 * DEFEKT ZASTANY: `useTopologyStore.loadSummary` (GET
 * `/api/cases/{id}/enm/topology/summary`) NIE MIAŁ ŻADNEGO wołającego w kodzie
 * produkcyjnym — jedyny komponent, który go używał (`ui/topology/TopologyPanel`),
 * nie jest nigdzie montowany. Skutek: `summary` był zawsze `null`, więc drzewo
 * topologii przestrzeni „Model" renderowało pusty stan niezależnie od tego, co
 * zbudował projektant — a liczniki blokad nie miały nawet gdzie się pojawić.
 *
 * Hook żyje w warstwie POWŁOKI (jak `useHydratacjaPowloki`), żeby adapter
 * drzewa pozostał czystą, bezefektową projekcją store'ów.
 *
 * Kiedy ładujemy (zero odpytywania w pętli):
 * - zmiana aktywnego przypadku (nowy kontekst = nowa topologia),
 * - zmiana rewizji migawki modelu (każda operacja domenowa podnosi rewizję,
 *   więc drzewo idzie w parze z kanwą i panelem gotowości).
 */

import { useEffect } from 'react';

import { useAppStateStore } from '../../ui/app-state';
import { useSnapshotStore } from '../../ui/topology/snapshotStore';
import { useTopologyStore } from '../../ui/topology/store';

export function useZasilanieDrzewaTopologii(): void {
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const rewizja = useSnapshotStore((s) => s.snapshot?.header.revision ?? 0);

  useEffect(() => {
    if (!activeCaseId) {
      // Brak przypadku ⇒ nie ma czego pokazać (uczciwy stan zerowy drzewa).
      useTopologyStore.setState({ summary: null });
      return;
    }
    void useTopologyStore.getState().loadSummary(activeCaseId);
  }, [activeCaseId, rewizja]);
}

/**
 * Oznaczenia aparatów pola (Q1, QE1, T1…) — JEDNA reguła dla rysunku, identyfikatora
 * globalnego w inspektorze i tabeli pól karty stacji (karta INSPEKTOR-I-NAWIGACJA pkt I.1:
 * „Q1 — zamknięty” w karcie musi być tym samym Q1, które rysuje schemat).
 *
 * Sekwencja jak na rysunku: aparaty pierwotne pola z modelu (`projectBayPrimaryDevices` —
 * rekordy `primary_devices`, gałęzie `equipment_refs`, sterownik pola), porządek
 * `orderedSymbolPrimaryDevices`, symbol `symbolAparatuPola`, oznaczenie z danych albo
 * z konwencji `apparatusIdentifiers`. Aparat bez symbolu na rysunku nie ma oznaczenia.
 */
import type { Bay, Branch, EnergyNetworkModel } from '../../../types/enm';
import { sterownikPola } from '../../shared/sterownikZabezpieczen';
import { projectBayPrimaryDevices } from '../v2/canvas/enmToSldAdapter';
import { apparatusIdentifiers, orderedSymbolPrimaryDevices, symbolAparatuPola } from '../v3/compose/apparatusSequence';

/** Ref aparatu (`deviceRef`) → oznaczenie na rysunku pola, w kolejności rysunku. */
export function oznaczeniaAparatowPola(
  snapshot: EnergyNetworkModel | null | undefined,
  bay: Bay,
  galezieWgRef: ReadonlyMap<string, Branch>,
): ReadonlyMap<string, string> {
  const sekwencja = orderedSymbolPrimaryDevices(
    projectBayPrimaryDevices(bay, galezieWgRef, snapshot?.bays, sterownikPola(snapshot, bay.ref_id)) ?? [],
  )
    .map((d) => ({ ref: d.deviceRef, symbol: symbolAparatuPola(d), oznaczenie: d.designation }))
    .filter((d): d is { ref: string; symbol: NonNullable<typeof d.symbol>; oznaczenie: string | undefined } => d.symbol != null);
  const identyfikatory = apparatusIdentifiers(
    sekwencja.map((d) => d.symbol),
    sekwencja.map((d) => d.oznaczenie),
  );
  const wynik = new Map<string, string>();
  sekwencja.forEach((d, i) => {
    const id = identyfikatory[i];
    if (id) wynik.set(d.ref, id);
  });
  return wynik;
}

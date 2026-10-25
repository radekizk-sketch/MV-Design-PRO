/** R11 — jawne, wyłącznie odczytowe powiązanie geometrii z kanonicznym ENM.
 * Zbieżność ref_id to kandydat powiązania danych; NIE dowodzi połączeń elektrycznych.
 */
export type KandydatPowiazaniaEnm = {
  ref_id: string;
  kolekcja: string;
  stan: 'ZGODNY_IDENTYFIKATOR_NIEZWERYFIKOWANA_TOPOLOGIA';
};
const COLLECTIONS = [
  'buses','branches','substations','transformers','devices','sources','loads','generators','measurements',
] as const;
function record(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
export function dopasujIdDoEnm(snapshot: unknown, id: string): KandydatPowiazaniaEnm[] {
  if (!record(snapshot) || !id) return [];
  const matches: KandydatPowiazaniaEnm[] = [];
  for (const key of COLLECTIONS) {
    const objects = snapshot[key];
    if (!Array.isArray(objects)) continue;
    if (objects.some((v: unknown) => record(v) && v.ref_id === id)) {
      matches.push({
        ref_id: id,
        kolekcja: key,
        stan: 'ZGODNY_IDENTYFIKATOR_NIEZWERYFIKOWANA_TOPOLOGIA',
      });
    }
  }
  // Porty pól SN są osadzone w stacji; nie są samodzielnymi tablicami ENM.
  const stations = snapshot.substations;
  if (Array.isArray(stations)) {
    for (const station of stations) {
      if (!record(station) || !record(station.meta)) continue;
      const fields = station.meta.field_specs;
      if (Array.isArray(fields) && fields.some((x: unknown) => record(x) && x.field_ref === id)) {
        matches.push({
          ref_id: id,
          kolekcja: 'substations.meta.field_specs',
          stan: 'ZGODNY_IDENTYFIKATOR_NIEZWERYFIKOWANA_TOPOLOGIA',
        });
      }
    }
  }
  return matches;
}

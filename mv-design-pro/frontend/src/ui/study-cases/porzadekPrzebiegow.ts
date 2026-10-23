/**
 * Porządek przebiegów obliczeń — JEDNO źródło prawdy dla „najnowszego przebiegu".
 *
 * DLACZEGO. Lista `useExecutionRunsStore.runs` przychodzi z backendu w kolejności
 * `created_at DESC, id DESC` (`canonical_run_repository.py`, `list_canonical_runs_for_case`)
 * — najnowszy PIERWSZY. Sześć selektorów ekranów (jakość, estymacja, porównanie metod, wniosek
 * OSD, pulpit OZE, zdolność przyłączeniowa) brało „ostatni z listy" jako najnowszy, czyli
 * w praktyce NAJSTARSZY przebieg przypadku: po ponownym policzeniu sekcja walidacji
 * energetycznej pokazywała dane przyjęte starego biegu. Cztery inne selektory porządkowały
 * po czasie, każdy z innym rozstrzygnięciem remisu. Ten moduł zastępuje wszystkie: wybór nie
 * zależy od kolejności listy, tylko od znaczników czasu przebiegu.
 *
 * KLUCZ. Czas utworzenia przebiegu — ten sam klucz co repozytorium (`created_at DESC`), więc
 * „najnowszy" znaczy na ekranie to samo co w rejestrze, także dla biegu jeszcze w kolejce;
 * przebieg bez czasu utworzenia (zapis sprzed koperty pochodzenia) porządkuje czas zakończenia,
 * a w ostateczności rozpoczęcia. Remis rozstrzyga identyfikator malejąco (`id DESC`), więc
 * wynik jest deterministyczny dla każdego zestawu przebiegów, niezależnie od kolejności,
 * w której je podano.
 */

/** Minimalny kształt przebiegu potrzebny do porządku (ExecutionRun i lżejsze widoki). */
export interface PrzebiegWCzasie {
  readonly id?: string;
  readonly finished_at?: string | null;
  readonly started_at?: string | null;
  readonly created_at?: string | null;
}

/** Znacznik czasu porządkujący przebieg (ISO 8601 — porównanie leksykalne = chronologiczne). */
export function czasPrzebiegu(przebieg: PrzebiegWCzasie): string {
  return przebieg.created_at ?? przebieg.finished_at ?? przebieg.started_at ?? '';
}

/** Komparator „od najnowszego": czas malejąco, remis — identyfikator malejąco. */
export function porownajOdNajnowszego(a: PrzebiegWCzasie, b: PrzebiegWCzasie): number {
  const ta = czasPrzebiegu(a);
  const tb = czasPrzebiegu(b);
  if (ta !== tb) return ta < tb ? 1 : -1;
  const ia = a.id ?? '';
  const ib = b.id ?? '';
  if (ia === ib) return 0;
  return ia < ib ? 1 : -1;
}

/** Kopia listy uporządkowana od najnowszego przebiegu. */
export function przebiegiOdNajnowszego<T extends PrzebiegWCzasie>(przebiegi: readonly T[]): T[] {
  return [...przebiegi].sort(porownajOdNajnowszego);
}

/** Najnowszy przebieg listy albo `null` (lista pusta). */
export function najnowszyPrzebieg<T extends PrzebiegWCzasie>(przebiegi: readonly T[]): T | null {
  let najlepszy: T | null = null;
  for (const przebieg of przebiegi) {
    if (najlepszy === null || porownajOdNajnowszego(przebieg, najlepszy) < 0) najlepszy = przebieg;
  }
  return najlepszy;
}

/**
 * Domyślny przebieg spośród kandydatów: aktywny (gdy jest wśród nich), inaczej najnowszy.
 * `null`, gdy kandydatów brak.
 */
export function aktywnyLubNajnowszy<T extends PrzebiegWCzasie & { readonly id: string }>(
  kandydaci: readonly T[],
  activeRunId: string | null,
): T | null {
  const aktywny = activeRunId ? kandydaci.find((r) => r.id === activeRunId) : undefined;
  return aktywny ?? najnowszyPrzebieg(kandydaci);
}

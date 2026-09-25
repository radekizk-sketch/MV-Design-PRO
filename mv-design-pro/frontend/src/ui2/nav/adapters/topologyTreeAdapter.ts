/*
 * Adapter drzewa topologii (przestrzeń „Model") — czyta ISTNIEJĄCY store
 * `ui/topology/store.ts` (read-only, żadnej mutacji) i mapuje na `WezelDrzewa[]`.
 *
 * Źródła danych (dokumentacja mapowania — karta §7):
 * - Drzewo (tryb „zasilania"): `TopologyGraphSummary` — pola `spine[].bus_ref`,
 *   `spine[].depth`, `spine[].is_source`, `spine[].children_refs`,
 *   `lateral_roots`, `adjacency` — `frontend/src/types/enm.ts:1121-1144`
 *   (interfejsy `SpineNode`/`TopologyGraphSummary`), udostępniane przez
 *   `useTopologyStore` (`ui/topology/store.ts:22-40`, pole `summary`).
 *   Algorytm łączenia odgałęzień z najbliższym węzłem magistrali odtwarza
 *   `ui/topology/TopologyTreeView.tsx:59-122` (`buildSpineTree`/`getIsolatedNodes`)
 *   — ten sam kształt danych, inny (zagnieżdżony) układ drzewa.
 * - Liczniki {blokady, ostrzeżenia}: `ReadinessIssue.element_ref`/`element_refs`
 *   + `severity` (`ui/types.ts:548-558`), z JEDNEJ prawdy gotowości
 *   (`spaces/gotowosc/adapters/gotowoscAdapter.useGotowoscModelu` nad
 *   `useSnapshotStore.readiness`). BLOCKER→blokady, IMPORTANT→ostrzeżenia
 *   (INFO pomijane) — ta sama konwencja co `ui2/shell/shellStatus.ts`
 *   (`gotowosc.blokady`/`gotowosc.ostrzezenia`).
 *   KD-1 (dług V12K-286): wcześniej źródłem był `useReadinessLiveStore.issues`,
 *   którego `refresh` nikt nie wołał — liczniki drzewa były ZAWSZE zerowe,
 *   mimo blokad widocznych w panelu gotowości.
 *
 * KARTA-UI2 §1 p. 11 (zamknięcie): tryby „administracyjny" (grupowanie po
 * stacjach) i „obwodowy" (grupowanie po odejściach ze źródła) MAJĄ teraz
 * jednoznaczne źródło:
 * - „administracyjny": `Bay.bus_ref` → `Bay.substation_ref` (struktura pola SN
 *   niesie WŁASNE przypisanie do stacji — `TopologyStructure.bays`,
 *   `GET .../enm/topology`, ISTNIEJĄCY endpoint backendu, dotąd nie pobierany
 *   przez `ui/topology/store.ts`) + `TopologyStructure.substations` (nazwy).
 *   Szyna bez żadnego pola (np. węzeł T na trasie kabla między stacjami) trafia
 *   do jawnej grupy „Poza stacją" — zero milczącego gubienia.
 * - „obwodowy" (odejście = ścieżka od szyny zasilającej przez aparat pola —
 *   karta §1 p. 11): graf spine/lateral (`TopologyGraphSummary`, JUŻ pobierany)
 *   już koduje dokładnie tę ścieżkę — bezpośrednie dziecko szyny źródłowej w
 *   drzewie zasilania JEST pierwszym aparatem pola (łącznik/wyłącznik) za
 *   źródłem; poddrzewo tego dziecka = odejście. Reużywa TEGO SAMEGO
 *   rekurencyjnego budowniczego poddrzewa co tryb „zasilania"
 *   (`budujPoddrzewoSpine`, jedna implementacja, dwa grupowania wyniku) —
 *   zero drugiej fizyki grafu.
 */

import { useMemo } from 'react';
import type { AdjacencyEntry, SpineNode, TopologyGraphSummary } from '../../../types/enm';
import type { ReadinessIssue } from '../../../ui/types';
import { useTopologyStore, type TopologyState } from '../../../ui/topology/store';
import type { TopologyStructure } from '../../../ui/topology/api';
import { useProblemyGotowosci } from '../../spaces/gotowosc/adapters/gotowoscAdapter';
import { LICZNIKI_ZERO, type LicznikiWezla, type TrybDrzewaTopologii, type WezelDrzewa } from '../treeModel';

/**
 * JEDYNY odczyt kolekcji pochodzącej z odpowiedzi serwera w tym module
 * (reguła KLASA, NIE INSTANCJA pkt 3: predykat z jednego źródła prawdy).
 *
 * Kontrakt `TopologyGraphSummary` deklaruje `spine`/`adjacency`/`lateral_roots`
 * jako wymagane, ale deklaracja TypeScriptu NIE JEST gwarancją runtime — to
 * kształt oczekiwany, nie sprawdzany. Odpowiedź bez tych pól (endpoint zwracający
 * `{}`, starsza rewizja kontraktu, odcięty backend) przechodziła przez `if (!summary)`
 * jako obiekt prawdziwy i wywracała CAŁY ekran przez granicę błędu
 * (`TypeError: Cannot read properties of undefined (reading 'map')`) — pre-existing
 * dług nazwany w V12K-317 poz. 6, mierzalny czerwonym `e2e/create-first-case`.
 *
 * Rozstrzygnięcie nadzorcy (karta W3 §2.1): brak pola w odpowiedzi to STAN, nie
 * wyjątek — adapter renderuje uczciwy stan zerowy („brak danych topologii”),
 * nigdy nie wywraca ekranu. Zero domysłu: nie ma tu zgadywania brakującej
 * struktury, jest wyłącznie „nie przyszło ⇒ nie rysuję”.
 */
function kolekcja<T>(wartosc: T[] | null | undefined): T[] {
  return Array.isArray(wartosc) ? wartosc : [];
}

/**
 * Podsumowanie topologii sprowadzone do trzech kolekcji, na których pracuje
 * reszta modułu. Osłona jest JEDNA i na WEJŚCIU — dzięki temu żaden odczyt
 * poniżej nie musi (ani nie może) powtarzać sprawdzenia, a nowe pole kolekcyjne
 * dokłada się w jednym miejscu.
 */
interface TopologiaZOdpowiedzi {
  readonly spine: SpineNode[];
  readonly lateralRoots: string[];
  readonly adjacency: AdjacencyEntry[];
}

function odczytajTopologie(summary: TopologyGraphSummary): TopologiaZOdpowiedzi {
  return {
    spine: kolekcja(summary.spine),
    lateralRoots: kolekcja(summary.lateral_roots),
    adjacency: kolekcja(summary.adjacency),
  };
}

function budujLicznikiZReadiness(issues: ReadinessIssue[]): Map<string, LicznikiWezla> {
  const mapa = new Map<string, LicznikiWezla>();
  const dodaj = (ref: string, severity: ReadinessIssue['severity']) => {
    const wpis = mapa.get(ref) ?? { blokady: 0, ostrzezenia: 0 };
    if (severity === 'BLOCKER') wpis.blokady += 1;
    else if (severity === 'IMPORTANT') wpis.ostrzezenia += 1;
    mapa.set(ref, wpis);
  };
  for (const issue of issues) {
    // Jeden problem = JEDEN wpis na element, nawet gdy `element_ref` powtarza
    // się w `element_refs` (tak buduje go `gotowoscAdapter.polaczGotowosc`).
    // Bez odsiania duplikatów licznik podwajał każdą blokadę — defekt niewidoczny,
    // dopóki źródłem był nigdy nieodświeżany store (KD-1 / V12K-286).
    const refy = new Set<string>();
    if (issue.element_ref) refy.add(issue.element_ref);
    for (const ref of kolekcja(issue.element_refs)) refy.add(ref);
    for (const ref of refy) dodaj(ref, issue.severity);
  }
  return mapa;
}

function liczOrDefault(liczniki: Map<string, LicznikiWezla>, ref: string): LicznikiWezla {
  return liczniki.get(ref) ?? LICZNIKI_ZERO;
}

function znajdzSasiadaMagistrali(adjacency: AdjacencyEntry[], lat: string, spineSet: Set<string>): string | null {
  const wpis = adjacency.find(
    (a) => (a.bus_ref === lat && spineSet.has(a.neighbor_ref)) || (a.neighbor_ref === lat && spineSet.has(a.bus_ref)),
  );
  if (!wpis) return null;
  return wpis.bus_ref === lat ? wpis.neighbor_ref : wpis.bus_ref;
}

function grupa(id: string, etykietaPL: string, dzieci: WezelDrzewa[]): WezelDrzewa {
  return { id, etykietaPL, ikona: 'folder', liczniki: LICZNIKI_ZERO, dzieci, trybMin: 'basic' };
}

function odgalezienieLisc(ref: string, liczniki: Map<string, LicznikiWezla>): WezelDrzewa {
  return { id: ref, etykietaPL: ref, ikona: 'odgalezienie', liczniki: liczOrDefault(liczniki, ref), dzieci: [], trybMin: 'basic' };
}

function szynaLisc(ref: string, liczniki: Map<string, LicznikiWezla>): WezelDrzewa {
  return { id: ref, etykietaPL: ref, ikona: 'szyna', liczniki: liczOrDefault(liczniki, ref), dzieci: [], trybMin: 'basic' };
}

/** Węzły grafu bez wpisu w spine/lateral (posortowane, jak `getIsolatedNodes` w TopologyTreeView). */
function znajdzIzolowane(topologia: TopologiaZOdpowiedzi): string[] {
  const spineSet = new Set(topologia.spine.map((s) => s.bus_ref));
  const lateralSet = new Set(topologia.lateralRoots);
  const wszystkie = new Set<string>();
  for (const a of topologia.adjacency) {
    wszystkie.add(a.bus_ref);
    wszystkie.add(a.neighbor_ref);
  }
  return [...wszystkie].filter((n) => !spineSet.has(n) && !lateralSet.has(n)).sort();
}

/** Zależności współdzielone przez budowniczych poddrzewa spine (zasilania/obwodowy). */
interface DrzewoSpineDeps {
  byRef: Map<string, SpineNode>;
  spineSet: Set<string>;
  lateraleWgSasiada: Map<string, string[]>;
  liczniki: Map<string, LicznikiWezla>;
  /** WSPÓLNA ochrona przed cyklem (has_cycles) dla całego skanu — jeden węzeł
   *  spine nie powtarza się w DWÓCH poddrzewach tego samego wywołania. */
  odwiedzone: Set<string>;
}

/**
 * Poddrzewo spine zakorzenione w `ref`: rekurencja po `children_refs` +
 * odgałęzienia dopięte do najbliższego węzła magistrali. JEDNA implementacja
 * dla trybu „zasilania" (korzenie = źródła) i „obwodowy" (korzenie = pierwsze
 * dziecko źródła — pole/aparat odejścia, poddrzewo = cały odpływ).
 */
function budujPoddrzewoSpine(ref: string, deps: DrzewoSpineDeps): WezelDrzewa | null {
  if (deps.odwiedzone.has(ref)) return null;
  deps.odwiedzone.add(ref);
  const spine = deps.byRef.get(ref);
  const dzieciSpine = kolekcja(spine?.children_refs)
    .filter((r) => deps.spineSet.has(r))
    .sort()
    .map((r) => budujPoddrzewoSpine(r, deps))
    .filter((w): w is WezelDrzewa => w !== null);
  const dzieciLateral = (deps.lateraleWgSasiada.get(ref) ?? [])
    .sort()
    .map((lat) => odgalezienieLisc(lat, deps.liczniki));
  return {
    id: ref,
    etykietaPL: ref,
    ikona: spine?.is_source ? 'zrodlo' : 'szyna',
    liczniki: liczOrDefault(deps.liczniki, ref),
    dzieci: [...dzieciSpine, ...dzieciLateral],
    trybMin: 'basic',
  };
}

/** Buduje `DrzewoSpineDeps` wspólne dla trybów „zasilania"/„obwodowy" (jedno źródło prawdy — reguła KLASA pkt 3). */
function budujDrzewoSpineDeps(topologia: TopologiaZOdpowiedzi, liczniki: Map<string, LicznikiWezla>): {
  deps: DrzewoSpineDeps;
  sieroty: string[];
} {
  const byRef = new Map(topologia.spine.map((s) => [s.bus_ref, s]));
  const spineSet = new Set(byRef.keys());

  const lateraleWgSasiada = new Map<string, string[]>();
  const sieroty: string[] = [];
  for (const lat of topologia.lateralRoots) {
    const sasiad = znajdzSasiadaMagistrali(topologia.adjacency, lat, spineSet);
    if (!sasiad) {
      sieroty.push(lat);
      continue;
    }
    const lista = lateraleWgSasiada.get(sasiad) ?? [];
    lista.push(lat);
    lateraleWgSasiada.set(sasiad, lista);
  }

  return {
    deps: { byRef, spineSet, lateraleWgSasiada, liczniki, odwiedzone: new Set<string>() },
    sieroty,
  };
}

function grupyIzolowaneISieroty(
  topologia: TopologiaZOdpowiedzi,
  liczniki: Map<string, LicznikiWezla>,
  sieroty: string[],
): WezelDrzewa[] {
  const grupy: WezelDrzewa[] = [];
  if (sieroty.length > 0) {
    grupy.push(grupa('odgalezienia', 'Odgałęzienia', sieroty.sort().map((r) => odgalezienieLisc(r, liczniki))));
  }
  const izolowane = znajdzIzolowane(topologia);
  if (izolowane.length > 0) {
    grupy.push(
      grupa(
        'izolowane',
        'Węzły izolowane',
        izolowane.map((r) => ({ id: r, etykietaPL: r, ikona: 'izolowany', liczniki: liczOrDefault(liczniki, r), dzieci: [], trybMin: 'basic' as const })),
      ),
    );
  }
  return grupy;
}

/** Drzewo zasilania (od GPZ) — hierarchia wg `children_refs`, z odgałęzieniami dopiętymi do najbliższego węzła magistrali. */
function budujDrzewoZasilania(topologia: TopologiaZOdpowiedzi, liczniki: Map<string, LicznikiWezla>): WezelDrzewa[] {
  const { deps, sieroty } = budujDrzewoSpineDeps(topologia, liczniki);

  const korzenie = [...topologia.spine]
    .filter((s) => s.is_source || s.depth === 0)
    .sort((a, b) => a.bus_ref.localeCompare(b.bus_ref));
  const drzewo = korzenie
    .map((s) => budujPoddrzewoSpine(s.bus_ref, deps))
    .filter((w): w is WezelDrzewa => w !== null);

  const grupy: WezelDrzewa[] = [];
  if (drzewo.length > 0) grupy.push(grupa('magistrala', 'Magistrala (od GPZ)', drzewo));
  grupy.push(...grupyIzolowaneISieroty(topologia, liczniki, sieroty));
  return grupy;
}

/**
 * Drzewo „obwodowy" — grupa PER ODEJŚCIE (karta §1 p. 11: „odejście = ścieżka
 * od szyny zasilającej przez aparat pola"). Korzeń grupy = PIERWSZE dziecko
 * szyny źródłowej w grafie spine (pierwszy aparat pola za źródłem); poddrzewo
 * tego dziecka (rekurencja `budujPoddrzewoSpine`, TA SAMA co tryb „zasilania")
 * = cały odpływ. Źródło bez żadnego dziecka spine (stacja bez odejść w
 * modelu) nie tworzy pustej grupy — nie ma czego pokazać, zero fabrykacji.
 */
function budujGrupowanieObwodowe(topologia: TopologiaZOdpowiedzi, liczniki: Map<string, LicznikiWezla>): WezelDrzewa[] {
  const { deps, sieroty } = budujDrzewoSpineDeps(topologia, liczniki);

  const zrodla = [...topologia.spine].filter((s) => s.is_source).sort((a, b) => a.bus_ref.localeCompare(b.bus_ref));
  const grupy: WezelDrzewa[] = [];
  for (const zrodlo of zrodla) {
    const dzieciZrodla = kolekcja(zrodlo.children_refs)
      .filter((r) => deps.spineSet.has(r))
      .sort();
    for (const dziecko of dzieciZrodla) {
      const poddrzewo = budujPoddrzewoSpine(dziecko, deps);
      if (poddrzewo) grupy.push(poddrzewo);
    }
  }
  grupy.push(...grupyIzolowaneISieroty(topologia, liczniki, sieroty));
  return grupy;
}

/**
 * Drzewo „administracyjny" — grupowanie po stacji (`Bay.substation_ref`),
 * karta §1 p. 11. Mapowanie szyna → stacja z `TopologyStructure.bays`
 * (`bus_ref` → `substation_ref`); nazwa stacji z `TopologyStructure.substations`.
 * Szyna BEZ żadnego pola (węzeł T na trasie między stacjami, punkt izolowany)
 * trafia do jawnej grupy „Poza stacją" — zero milczącego gubienia (WHITE BOX).
 */
function budujGrupowanieAdministracyjne(
  topologia: TopologiaZOdpowiedzi,
  struktura: TopologyStructure,
  liczniki: Map<string, LicznikiWezla>,
): WezelDrzewa[] {
  const stacjaSzyny = new Map<string, string>();
  for (const pole of struktura.bays) stacjaSzyny.set(pole.bus_ref, pole.substation_ref);
  const nazwaStacji = new Map<string, string>();
  for (const stacja of struktura.substations) nazwaStacji.set(stacja.ref_id, stacja.name || stacja.ref_id);

  const wszystkieSzyny = new Set<string>();
  for (const wpis of topologia.adjacency) {
    wszystkieSzyny.add(wpis.bus_ref);
    wszystkieSzyny.add(wpis.neighbor_ref);
  }
  for (const s of topologia.spine) wszystkieSzyny.add(s.bus_ref);
  for (const lat of topologia.lateralRoots) wszystkieSzyny.add(lat);

  const szynyWgStacji = new Map<string, string[]>();
  const bezStacji: string[] = [];
  for (const szyna of wszystkieSzyny) {
    const stacjaRef = stacjaSzyny.get(szyna);
    if (stacjaRef) {
      const lista = szynyWgStacji.get(stacjaRef) ?? [];
      lista.push(szyna);
      szynyWgStacji.set(stacjaRef, lista);
    } else {
      bezStacji.push(szyna);
    }
  }

  const grupy: WezelDrzewa[] = [...szynyWgStacji.entries()]
    .sort((a, b) => (nazwaStacji.get(a[0]) ?? a[0]).localeCompare(nazwaStacji.get(b[0]) ?? b[0], 'pl'))
    .map(([stacjaRef, szyny]) =>
      grupa(stacjaRef, nazwaStacji.get(stacjaRef) ?? stacjaRef, szyny.sort().map((r) => szynaLisc(r, liczniki))),
    );
  if (bezStacji.length > 0) {
    grupy.push(grupa('poza-stacja', 'Poza stacją', bezStacji.sort().map((r) => szynaLisc(r, liczniki))));
  }
  return grupy;
}

/** Mapowanie czyste (bez React) — testowalne fixture'ami o realnym kształcie store'a. */
export function mapowanieTopologiiDoDrzewa(
  summary: TopologyGraphSummary | null,
  issues: ReadinessIssue[],
  tryb: TrybDrzewaTopologii,
  struktura: TopologyStructure | null = null,
): WezelDrzewa[] {
  if (!summary) return [];
  const liczniki = budujLicznikiZReadiness(issues);
  const topologia = odczytajTopologie(summary);
  if (tryb === 'zasilania') return budujDrzewoZasilania(topologia, liczniki);
  if (tryb === 'obwodowy') return budujGrupowanieObwodowe(topologia, liczniki);
  // 'administracyjny': brak struktury (jeszcze nie pobrana/błąd sieci) = uczciwy
  // stan zerowy — adapter nigdy nie zgaduje przypisania szyny do stacji.
  if (!struktura) return [];
  return budujGrupowanieAdministracyjne(topologia, struktura, liczniki);
}

/** Adapter read-only: `ui/topology/store.ts` (summary + structure) + `gotowoscAdapter` (problemy). */
export function useTopologyTree(tryb: TrybDrzewaTopologii): WezelDrzewa[] {
  const summary = useTopologyStore((s: TopologyState) => s.summary);
  const struktura = useTopologyStore((s: TopologyState) => s.structure);
  const issues = useProblemyGotowosci();
  return useMemo(
    () => mapowanieTopologiiDoDrzewa(summary, issues, tryb, struktura),
    [summary, issues, tryb, struktura],
  );
}

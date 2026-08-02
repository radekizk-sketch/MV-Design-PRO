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
 * TODO-KARTA: tryby „administracyjny" (grupowanie po stacjach) i „obwodowy"
 * (grupowanie po magistralach/obwodach) z audytu W-208 NIE MAJĄ jednoznacznego
 * źródła w `TopologyGraphSummary` — struktura nie niesie `substation_ref` ani
 * identyfikatora obwodu per węzeł (te pola istnieją gdzie indziej w ENM v2,
 * np. `types/enm.ts:224` `substation_ref` na innych DTO, ale nie w podsumowaniu
 * topologii konsumowanym przez `ui/topology/store.ts`). Zgodnie z kartą §3
 * („niejednoznaczne źródło → adapter-szkielet TODO-KARTA, zero zgadywania")
 * te dwa tryby zwracają `[]` do czasu wskazania właściwego źródła przez
 * kartę integracyjną / rozszerzenie backendu.
 */

import { useMemo } from 'react';
import type { AdjacencyEntry, SpineNode, TopologyGraphSummary } from '../../../types/enm';
import type { ReadinessIssue } from '../../../ui/types';
import { useTopologyStore } from '../../../ui/topology/store';
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

/** Drzewo zasilania (od GPZ) — hierarchia wg `children_refs`, z odgałęzieniami dopiętymi do najbliższego węzła magistrali. */
function budujDrzewoZasilania(topologia: TopologiaZOdpowiedzi, liczniki: Map<string, LicznikiWezla>): WezelDrzewa[] {
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

  const odwiedzone = new Set<string>();
  function wezelDlaSpine(ref: string): WezelDrzewa | null {
    if (odwiedzone.has(ref)) return null; // ochrona przed cyklem (has_cycles)
    odwiedzone.add(ref);
    const spine = byRef.get(ref);
    const dzieciSpine = kolekcja(spine?.children_refs)
      .filter((r) => spineSet.has(r))
      .sort()
      .map(wezelDlaSpine)
      .filter((w): w is WezelDrzewa => w !== null);
    const dzieciLateral = (lateraleWgSasiada.get(ref) ?? [])
      .sort()
      .map((lat) => odgalezienieLisc(lat, liczniki));
    return {
      id: ref,
      etykietaPL: ref,
      ikona: spine?.is_source ? 'zrodlo' : 'szyna',
      liczniki: liczOrDefault(liczniki, ref),
      dzieci: [...dzieciSpine, ...dzieciLateral],
      trybMin: 'basic',
    };
  }

  const korzenie = [...topologia.spine]
    .filter((s) => s.is_source || s.depth === 0)
    .sort((a, b) => a.bus_ref.localeCompare(b.bus_ref));
  const drzewo = korzenie.map((s) => wezelDlaSpine(s.bus_ref)).filter((w): w is WezelDrzewa => w !== null);

  const grupy: WezelDrzewa[] = [];
  if (drzewo.length > 0) grupy.push(grupa('magistrala', 'Magistrala (od GPZ)', drzewo));
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

/** Mapowanie czyste (bez React) — testowalne fixture'ami o realnym kształcie store'a. */
export function mapowanieTopologiiDoDrzewa(
  summary: TopologyGraphSummary | null,
  issues: ReadinessIssue[],
  tryb: TrybDrzewaTopologii,
): WezelDrzewa[] {
  if (!summary) return [];
  const liczniki = budujLicznikiZReadiness(issues);
  if (tryb === 'zasilania') return budujDrzewoZasilania(odczytajTopologie(summary), liczniki);
  // 'administracyjny' | 'obwodowy' — TODO-KARTA (patrz komentarz nagłówkowy pliku).
  return [];
}

/** Adapter read-only: `ui/topology/store.ts` (summary) + `gotowoscAdapter` (problemy). */
export function useTopologyTree(tryb: TrybDrzewaTopologii): WezelDrzewa[] {
  const summary = useTopologyStore((s) => s.summary);
  const issues = useProblemyGotowosci();
  return useMemo(() => mapowanieTopologiiDoDrzewa(summary, issues, tryb), [summary, issues, tryb]);
}

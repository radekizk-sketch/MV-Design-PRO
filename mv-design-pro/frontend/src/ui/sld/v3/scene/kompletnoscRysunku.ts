/**
 * Karta SLD-SUBSTRAT (kontynuacja) — REGUŁA KOMPLETNOŚCI RYSUNKU schematu SN.
 *
 * Każdy element modelu ENM klas pierwotnych (stacje, szyny, gałęzie, transformatory,
 * źródła, generatory, odbiory, punkty odgałęźne) ma na scenie PRYMITYW albo JAWNE,
 * NAZWANE ZWINIĘCIE; liczba elementów modelu = narysowane + zwinięte (licznik per
 * kategoria). Kategoria `niewyjasniony` to defekt: element modelu, którego rysunek
 * nie pokazuje i nie mówi dlaczego (precedens: ZKSN za GPZ ze stacją klienta w
 * odgałęzieniu — punkt i stacja znikały z kanwy, a jedyny ślad był w `stopNotes`).
 *
 * Zwinięcie jest NAZWANE i wyprowadzone Z DANYCH, nie z wygody rysunku:
 *  · `deklaracja-modelu` — model sam deklaruje „nie rysuj" (`meta.render_on_sld ===
 *    false`: mufa ciągu, zacisk pola, łącznik pola SN, łącznik wewnętrzny punktu);
 *  · `wnetrze-punktu-odgaleznego` — szyny i łączniki punktu odgałęźnego (jego
 *    `bus_ref` i porty), gdy SAM punkt jest narysowany;
 *  · `blok-stacji` — szyny (`Substation.bus_refs`) i transformatory
 *    (`transformer_refs`) NARYSOWANEJ stacji albo GPZ, rysowane jako jej blok;
 *  · `agregat-odbioru-stacji` — odbiór na szynie narysowanej stacji: szyny stacji z
 *    jednego lustra backendu `szynyStacji` (szyny główne, zaciski pól SN, oba końce
 *    aparatów pól nN — to samo źródło co tabliczka „Odbiór ΣP");
 *  · `domena-nn` — szyna/gałąź całkowicie w paśmie nN, odbiór/generator na szynie nN
 *    i rozdzielnica nN wydzielona jako osobna stacja (wszystkie szyny w paśmie nN):
 *    schemat SN pokazuje stronę nN stacji portalem, a jej wnętrze — projekcja nN;
 *  · `zrodlo-zwiniete-na-l0` — źródło DER na L0 (stacja jest symbolem zbiorczym,
 *    `sourceCoverageGaps` ma ten sam wyjątek).
 *
 * Klasy świadomie POZA regułą (uzasadnienie merytoryczne): `corridors`/`line_runs` to
 * porządek odcinków (kontener logiczny, nie element sieci — rysują się ich odcinki);
 * `bays`, `measurements`, `protection_assignments` to obwody wtórne i ich przypisania,
 * pilnowane własnymi wyroczniami (`protectionMarkingGaps`, `ctAnnotationGaps`,
 * `secondaryLinkDualityGaps`).
 */
import type { EnergyNetworkModel } from '../../../../types/enm';
import { wPasmieNn } from '../../../../ui2/model/pasmaNapieciowe';
import { indeksGaleziPolNn, szynyStacji } from '../../../shared/szynyStacji';
import type { SceneV3 } from './buildScene';

export type KategoriaRysunku =
  | 'narysowany'
  | 'deklaracja-modelu'
  | 'wnetrze-punktu-odgaleznego'
  | 'blok-stacji'
  | 'agregat-odbioru-stacji'
  | 'domena-nn'
  | 'zrodlo-zwiniete-na-l0'
  | 'niewyjasniony';

export type KlasaElementu =
  | 'substations'
  | 'buses'
  | 'branches'
  | 'transformers'
  | 'sources'
  | 'generators'
  | 'loads'
  | 'branch_points';

export const KLASY_KOMPLETNOSCI: readonly KlasaElementu[] = [
  'substations',
  'buses',
  'branches',
  'transformers',
  'sources',
  'generators',
  'loads',
  'branch_points',
];

export interface PozycjaKompletnosci {
  readonly klasa: KlasaElementu;
  readonly ref: string;
  readonly kategoria: KategoriaRysunku;
}

export interface RaportKompletnosci {
  readonly pozycje: readonly PozycjaKompletnosci[];
  readonly liczniki: Readonly<Record<KategoriaRysunku, number>>;
  readonly niewyjasnione: readonly PozycjaKompletnosci[];
}

type Rekord = {
  readonly ref_id: string;
  readonly meta?: Readonly<Record<string, unknown>> | null;
  readonly bus_ref?: string | null;
  readonly from_bus_ref?: string | null;
  readonly to_bus_ref?: string | null;
  readonly hv_bus_ref?: string | null;
  readonly lv_bus_ref?: string | null;
  readonly voltage_kv?: number | null;
};

/** Refy właścicieli prymitywów sceny (symbol, odcinek, etykieta) — pełne i przed `#`. */
function narysowaneRefy(scene: SceneV3): ReadonlySet<string> {
  const refy = new Set<string>();
  const dodaj = (ref: unknown): void => {
    if (typeof ref !== 'string' || ref.length === 0) return;
    refy.add(ref);
    refy.add(ref.split('#')[0]);
  };
  for (const symbol of scene.symbols) dodaj(symbol.meta?.ownerRef);
  for (const segment of scene.segments) dodaj(segment.meta?.ownerRef);
  for (const label of scene.labels) dodaj(label.ownerRef);
  for (const ref of scene.meta.drawnStationIds) dodaj(ref);
  for (const ref of scene.meta.drawnBranchPointRefs) dodaj(ref);
  return refy;
}

export function kompletnoscRysunku(scene: SceneV3, snapshot: EnergyNetworkModel): RaportKompletnosci {
  const narysowane = narysowaneRefy(scene);
  const napiecieSzyny = new Map<string, number | null>(
    (snapshot.buses ?? []).map((bus) => [bus.ref_id, bus.voltage_kv ?? null]),
  );
  const szynaNn = (ref: string | null | undefined): boolean =>
    ref != null && wPasmieNn(napiecieSzyny.get(ref) ?? null);

  const wnetrzePunktow = new Set<string>();
  for (const bp of snapshot.branch_points ?? []) {
    if (!narysowane.has(bp.ref_id)) continue;
    wnetrzePunktow.add(bp.bus_ref);
    const porty = (bp as { ports?: Readonly<Record<string, unknown>> }).ports ?? {};
    for (const wartosc of Object.values(porty)) {
      for (const ref of Array.isArray(wartosc) ? wartosc : [wartosc]) {
        if (typeof ref === 'string' && ref.startsWith(bp.ref_id.split('/').slice(0, 2).join('/'))) {
          wnetrzePunktow.add(ref);
        }
      }
    }
  }

  const blokStacji = new Set<string>();
  const szynyOdbiorowStacji = new Set<string>();
  const indeksPolNn = indeksGaleziPolNn(snapshot.branches ?? []);
  for (const stacja of snapshot.substations ?? []) {
    if (!narysowane.has(stacja.ref_id)) continue;
    for (const ref of stacja.bus_refs ?? []) blokStacji.add(ref);
    for (const ref of stacja.transformer_refs ?? []) blokStacji.add(ref);
    for (const ref of szynyStacji(stacja, snapshot.branches ?? [], indeksPolNn)) szynyOdbiorowStacji.add(ref);
  }

  const pozycje: PozycjaKompletnosci[] = [];
  const klasyfikuj = (klasa: KlasaElementu, element: Rekord): KategoriaRysunku => {
    if (narysowane.has(element.ref_id)) return 'narysowany';
    if (element.meta?.render_on_sld === false) return 'deklaracja-modelu';
    switch (klasa) {
      case 'substations': {
        // Rozdzielnica nN jako osobna `Substation` (podrozdzielnica): wszystkie jej
        // szyny w paśmie nN — wnętrze strony nN, pokazywane projekcją nN.
        const szyny = ((element as { bus_refs?: readonly string[] }).bus_refs ?? []);
        return szyny.length > 0 && szyny.every((ref) => szynaNn(ref)) ? 'domena-nn' : 'niewyjasniony';
      }
      case 'buses':
        if (wnetrzePunktow.has(element.ref_id)) return 'wnetrze-punktu-odgaleznego';
        if (blokStacji.has(element.ref_id)) return 'blok-stacji';
        if (szynaNn(element.ref_id)) return 'domena-nn';
        return 'niewyjasniony';
      case 'branches':
        if (
          element.from_bus_ref != null &&
          wnetrzePunktow.has(element.from_bus_ref) &&
          element.to_bus_ref != null &&
          wnetrzePunktow.has(element.to_bus_ref)
        ) {
          return 'wnetrze-punktu-odgaleznego';
        }
        if (szynaNn(element.from_bus_ref) && szynaNn(element.to_bus_ref)) return 'domena-nn';
        return 'niewyjasniony';
      case 'transformers':
        return blokStacji.has(element.ref_id) ? 'blok-stacji' : 'niewyjasniony';
      case 'loads':
        if (element.bus_ref != null && szynyOdbiorowStacji.has(element.bus_ref)) return 'agregat-odbioru-stacji';
        if (szynaNn(element.bus_ref)) return 'domena-nn';
        return 'niewyjasniony';
      case 'generators':
      case 'sources':
        if (scene.meta.lod === 0 && scene.meta.sources.some((s) => s.id === element.ref_id)) {
          return 'zrodlo-zwiniete-na-l0';
        }
        if (szynaNn(element.bus_ref)) return 'domena-nn';
        return 'niewyjasniony';
      default:
        return 'niewyjasniony';
    }
  };

  for (const klasa of KLASY_KOMPLETNOSCI) {
    const elementy = ((snapshot as unknown as Record<string, unknown>)[klasa] ?? []) as readonly Rekord[];
    for (const element of [...elementy].sort((a, b) => a.ref_id.localeCompare(b.ref_id))) {
      pozycje.push({ klasa, ref: element.ref_id, kategoria: klasyfikuj(klasa, element) });
    }
  }

  const liczniki: Record<KategoriaRysunku, number> = {
    narysowany: 0,
    'deklaracja-modelu': 0,
    'wnetrze-punktu-odgaleznego': 0,
    'blok-stacji': 0,
    'agregat-odbioru-stacji': 0,
    'domena-nn': 0,
    'zrodlo-zwiniete-na-l0': 0,
    niewyjasniony: 0,
  };
  for (const pozycja of pozycje) liczniki[pozycja.kategoria] += 1;
  return { pozycje, liczniki, niewyjasnione: pozycje.filter((p) => p.kategoria === 'niewyjasniony') };
}

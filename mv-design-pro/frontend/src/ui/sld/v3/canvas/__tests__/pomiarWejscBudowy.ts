/**
 * KARTA PARTIA-6-FRONT — pomiar wejść budowy ciągu SN na kanwie, WSPÓLNY dla testu
 * `menuBudowyNaKanwie.test.tsx` i sondy odbioru `scripts/sld_v3_acceptance.mjs`
 * (`menu_chain_probe`): sonda i test mierzą to samo, jedną funkcją.
 *
 * „Realne wejście kontynuacji" = obiekt kanwy klasy `stacja`, którego temat menu to stacja,
 * ORAZ punkt startu ciągu z TEGO SAMEGO rozstrzygnięcia, którego użyje kreator
 * (`resolveTrunkStartAvailability` → `buildSldOperationContext`, predykaty parami S95-START).
 *
 * Role stacji wyprowadzone z TOPOLOGII modelu, niezależnie od predykatu pod testem:
 *  - `gpz` — `station_type === 'gpz'`;
 *  - `koncowa` — stacja przy DALSZYM końcu ostatniego odcinka korytarza ciągu
 *    (`corridors[].ordered_segment_refs`, zaciski pól z `line_fields` backendu), a gdy ciąg
 *    wychodzi dalej poza stację (sieć gotowa: odcinek do węzła odgałęzienia) — przy bliższym;
 *  - `srodkowa` — pozostałe stacje SN/nN z co najmniej dwoma zajętymi polami liniowymi
 *    (ciąg wchodzi i wychodzi).
 */
import type { EnergyNetworkModel, LogicalViewsV1 } from '../../../../../types/enm';
import { resolveTrunkStartAvailability } from '../../../shared/sldActionExecutor';
import type { CanvasHitArea } from '../hitAreas';
import { resolveCanvasMenuSubject, type buildCanvasModelIndex } from '../canvasMenuSubject';

export type RolaStacjiCiagu = 'gpz' | 'koncowa' | 'srodkowa';

/** Refy stacji wg roli w ciągu, w kolejności `substations` modelu. */
export function stacjeWgRoli(
  model: EnergyNetworkModel,
  widoki: LogicalViewsV1,
): Record<RolaStacjiCiagu, string[]> {
  const stacjaZacisku = new Map<string, string>();
  const zajetePola = new Map<string, number>();
  for (const pole of widoki.line_fields ?? []) {
    stacjaZacisku.set(pole.attachment_bus_ref, pole.station_ref);
    if (pole.occupied) zajetePola.set(pole.station_ref, (zajetePola.get(pole.station_ref) ?? 0) + 1);
  }
  const galezie = new Map((model.branches ?? []).map((galaz) => [galaz.ref_id, galaz]));
  const koncowe = new Set<string>();
  for (const korytarz of model.corridors ?? []) {
    const odcinki = korytarz.ordered_segment_refs ?? [];
    const ostatni = galezie.get(odcinki[odcinki.length - 1] ?? '');
    if (!ostatni) continue;
    // Stacja przy DALSZYM końcu ostatniego odcinka; gdy ciąg wychodzi poza ostatnią stację
    // (dalszy koniec w węźle odgałęzienia albo w węźle nazwanym) — stacja przy bliższym końcu.
    const stacja = stacjaZacisku.get(ostatni.to_bus_ref) ?? stacjaZacisku.get(ostatni.from_bus_ref);
    if (stacja) koncowe.add(stacja);
  }
  const wynik: Record<RolaStacjiCiagu, string[]> = { gpz: [], koncowa: [], srodkowa: [] };
  for (const stacja of model.substations ?? []) {
    if (String(stacja.station_type).toLowerCase() === 'gpz') wynik.gpz.push(stacja.ref_id);
    else if (koncowe.has(stacja.ref_id)) wynik.koncowa.push(stacja.ref_id);
    else if ((zajetePola.get(stacja.ref_id) ?? 0) >= 2) wynik.srodkowa.push(stacja.ref_id);
  }
  return wynik;
}

/** Wejście rozstrzygania tematu obiektu kanwy — złożone jak w żywej kanwie. */
export interface WejscieObszaru {
  readonly area: CanvasHitArea;
  readonly busRef?: string;
}

/** Refy stacji z REALNYM wejściem kontynuacji ciągu na kanwie (kolejność obszarów sceny). */
export function stacjeZWejsciemKontynuacji(
  obszary: readonly WejscieObszaru[],
  model: EnergyNetworkModel,
  widoki: LogicalViewsV1,
  indexModelu: ReturnType<typeof buildCanvasModelIndex>,
): string[] {
  const refy: string[] = [];
  for (const { area, busRef } of obszary) {
    if (area.klasa !== 'stacja') continue;
    const wynik = resolveCanvasMenuSubject(
      { klasa: area.klasa, ownerRef: area.ownerRef, elementKind: area.elementKind, busRef },
      indexModelu,
    );
    if (wynik.stan !== 'temat' || wynik.temat.menuKind !== 'station') continue;
    if (resolveTrunkStartAvailability(model, widoki, 'station', wynik.temat.modelRef)?.['continue-trunk'] === true) {
      refy.push(wynik.temat.modelRef);
    }
  }
  return refy;
}

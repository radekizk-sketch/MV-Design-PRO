/*
 * Obiekty modelu sieci w indeksie JEDYNEJ wyszukiwarki (karta K1 POWLOKA).
 *
 * Do tej karty aplikacja miała dwie wyszukiwarki: paletę poleceń (Ctrl+K,
 * `CommandPalette`) z obiektami ograniczonymi do szyn oraz osobny dialog
 * „Szukaj" paska metryk (`ui/network-build/GlobalSearch`), który przeszukiwał
 * wszystkie rodzaje elementów. Zdolność drugiej wyszukiwarki przechodzi tutaj
 * w całości — te same kategorie i ta sama kolejność — a dialog zostaje
 * skasowany.
 *
 * Czysta funkcja migawki modelu → pozycje indeksu: zero fizyki (nazwy,
 * identyfikatory i podpisy rodzaju wprost z modelu), kolejność deterministyczna
 * (kategoria wg stałej kolejności, w kategorii porządek migawki).
 */

import type { EnergyNetworkModel } from '../../types/enm';
import type { ElementType } from '../../ui/types';
import { formatGeneratorTypeShortLabelPl } from '../../ui/shared/generatorTypeLabels';
import { stationPublicIdentity } from '../../ui/shared/publicTechnicalLabels';
import { podpisStacjiPl } from '../../ui/shared/rodzajStacji';
import type { ObiektDoIndeksu } from './searchIndex';

/** Obiekt modelu z typem elementu potrzebnym do zaznaczenia na schemacie. */
export interface ObiektModelu extends ObiektDoIndeksu {
  typ: ElementType;
}

/** Kategorie w kolejności wyników (parytet skasowanej wyszukiwarki modelu). */
export const KATEGORIE_OBIEKTOW = {
  zrodla: 'Zasilanie GPZ',
  stacje: 'Stacje',
  transformatory: 'Transformatory',
  odcinki: 'Odcinki SN',
  generatory: 'Układy PV/BESS/FW',
  odbiory: 'Odbiory',
  szyny: 'Szyny',
} as const;

function nazwaLubRef(nazwa: string | null | undefined, ref: string): string {
  return nazwa && nazwa.trim() ? nazwa : ref;
}

export function obiektyModeluDoIndeksu(model: EnergyNetworkModel | null): ObiektModelu[] {
  if (!model) return [];
  const wynik: ObiektModelu[] = [];

  for (const zrodlo of model.sources ?? []) {
    wynik.push({
      id: zrodlo.ref_id,
      nazwa: nazwaLubRef(zrodlo.name, zrodlo.ref_id),
      kategoria: KATEGORIE_OBIEKTOW.zrodla,
      typ: 'Source',
    });
  }

  const stacjePoRef = new Map<string, NonNullable<EnergyNetworkModel['substations']>[number]>();
  for (const stacja of model.substations ?? []) {
    stacjePoRef.set(stacja.id, stacja);
    stacjePoRef.set(stacja.ref_id, stacja);
    wynik.push({
      id: stacja.id,
      nazwa: nazwaLubRef(stacja.name, stacja.id),
      kategoria: KATEGORIE_OBIEKTOW.stacje,
      slowaKluczowe: podpisStacjiPl(model, stacja),
      typ: 'Station',
    });
  }

  for (const tr of model.transformers ?? []) {
    wynik.push({
      id: tr.ref_id,
      nazwa: nazwaLubRef(tr.name, tr.ref_id),
      kategoria: KATEGORIE_OBIEKTOW.transformatory,
      typ: 'TransformerBranch',
    });
  }

  for (const odcinek of model.branches ?? []) {
    wynik.push({
      id: odcinek.ref_id,
      nazwa: nazwaLubRef(odcinek.name, odcinek.ref_id),
      kategoria: KATEGORIE_OBIEKTOW.odcinki,
      slowaKluczowe: odcinek.type,
      typ: 'LineBranch',
    });
  }

  for (const generator of model.generators ?? []) {
    const rodzaj = formatGeneratorTypeShortLabelPl(generator.gen_type);
    const stacja = generator.station_ref ? stacjePoRef.get(generator.station_ref) : undefined;
    const tozsamosc = stacja ? stationPublicIdentity(model, stacja) : null;
    wynik.push({
      id: generator.ref_id,
      nazwa: nazwaLubRef(generator.name, generator.ref_id),
      kategoria: KATEGORIE_OBIEKTOW.generatory,
      slowaKluczowe: [rodzaj, tozsamosc?.code, tozsamosc?.displayName].filter(Boolean).join(' '),
      typ: 'Generator',
    });
  }

  for (const odbior of model.loads ?? []) {
    wynik.push({
      id: odbior.ref_id,
      nazwa: nazwaLubRef(odbior.name, odbior.ref_id),
      kategoria: KATEGORIE_OBIEKTOW.odbiory,
      typ: 'Load',
    });
  }

  for (const szyna of model.buses ?? []) {
    const id = szyna.ref_id || szyna.id;
    wynik.push({
      id,
      nazwa: nazwaLubRef(szyna.name, id),
      kategoria: KATEGORIE_OBIEKTOW.szyny,
      typ: 'Bus',
    });
  }

  return wynik;
}

/**
 * Obiekty modelu w wyszukiwarce — szyny, odcinki (kable i linie) oraz stacje i rozdzielnice,
 * każdy z rodzajem rozstrzygniętym JEDNYM predykatem tożsamości pasma (`ui2/model/elementNn`,
 * karta OBIEKT-KABEL-NN). Dawniej indeks znał wyłącznie szyny, więc kabla nN ani złącza
 * kablowego nie dało się znaleźć, a wspólny rodzaj „SN" nie był nawet wyświetlany.
 *
 * Wybór pozycji zaznacza obiekt (zdarzenie `selekcja`), a inspektor pokazuje jego kartę —
 * dla kabla nN z sekcją „Obliczenia kabla nN".
 */

import type { EnergyNetworkModel } from '../../types/enm';
import { podpisStacjiPl } from '../../ui/shared/rodzajStacji';
import { pasmoNapieciowe } from '../model/pasmaNapieciowe';
import { rodzajGaleziPrzewodowejPl } from '../model/elementNn';
import type { ObiektDoIndeksu } from './searchIndex';

function nazwaLubOdnosnik(nazwa: string | null | undefined, ref: string): string {
  return nazwa && nazwa.trim() ? nazwa.trim() : ref;
}

export function obiektyDoWyszukiwania(model: EnergyNetworkModel | null): ObiektDoIndeksu[] {
  if (!model) return [];
  const szyny = (model.buses ?? []).map((szyna) => {
    const pasmo = pasmoNapieciowe(szyna.voltage_kv);
    return {
      id: szyna.ref_id || szyna.id,
      nazwa: `${nazwaLubOdnosnik(szyna.name, szyna.ref_id)} · ${pasmo ? `Szyna ${pasmo}` : 'Szyna'}`,
    };
  });
  const odcinki = (model.branches ?? [])
    .filter((galaz) => galaz.type === 'cable' || galaz.type === 'line_overhead')
    .map((galaz) => ({
      id: galaz.ref_id || galaz.id,
      nazwa: `${nazwaLubOdnosnik(galaz.name, galaz.ref_id)} · ${rodzajGaleziPrzewodowejPl(model, galaz)}`,
    }));
  const stacje = (model.substations ?? []).map((stacja) => ({
    id: stacja.ref_id || stacja.id,
    nazwa: `${nazwaLubOdnosnik(stacja.name, stacja.ref_id)} · ${podpisStacjiPl(model, stacja)}`,
  }));
  return [...szyny, ...odcinki, ...stacje];
}

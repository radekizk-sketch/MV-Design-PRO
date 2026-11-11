/**
 * Reguła kliku warstwy adnotacji zabezpieczeń (karta UX-04/POLE-LINIOWE-WZORZEC): obiekt warstwy
 * prowadzi do pola, gdy człon refu przed `#` jest `Bay.ref_id` modelu — niezależnie od rodzaju
 * rozdzielni (GPZ, stacja SN, pole nN) i przyrostka obiektu.
 *
 * Iloczyn cech: rodzaj obiektu sceny {protectionAnnotation, apparatus, station, segment, brak}
 * × przyrostek {brak (okrąg), #protection-codes-full, #protection-codes-full-2, #zrodlo-u0,
 * #trip-line, #ct-rating-…, #device-number} × pole {w modelu, poza modelem} × snapshot {jest, null}.
 */
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { poleAdnotacjiZabezpieczen, SEKCJA_ZABEZPIECZEN_KARTY_POLA } from '../poleAdnotacjiZabezpieczen';
import { buildKartaTechniczna } from '../../../shared/kartaTechnicznaElementu';
import type { DaneElementuKanwy } from '../../../shared/daneElementuKanwy';
import fxZ11 from '../../../../../harness-fixtures/generated/pole_liniowe_z11_gpz_odgalezienie.json';

const POLA = ['stn/a/sn_field/000', 'gpz/x/bay/001/001', 'stn/b/lv_field/003'];
const snapshot = { bays: POLA.map((ref_id) => ({ ref_id })) } as unknown as Pick<EnergyNetworkModel, 'bays'>;
const PRZYROSTKI = ['', '#protection-codes-full', '#protection-codes-full-2', '#zrodlo-u0', '#trip-line', '#ct-rating-x::dev::6', '#device-number'];
const RODZAJE = ['protectionAnnotation', 'apparatus', 'station', 'segment', undefined] as const;

describe('poleAdnotacjiZabezpieczen — iloczyn cech', () => {
  for (const rodzaj of RODZAJE) {
    for (const przyrostek of PRZYROSTKI) {
      for (const pole of [...POLA, 'stn/zz/sn_field/999']) {
        it(`${rodzaj ?? 'brak'} × „${przyrostek || 'okrąg'}" × ${pole}`, () => {
          const meta = { ownerRef: `${pole}${przyrostek}`, elementKind: rodzaj };
          const oczekiwane = rodzaj === 'protectionAnnotation' && POLA.includes(pole) ? pole : null;
          expect(poleAdnotacjiZabezpieczen(meta, snapshot)).toBe(oczekiwane);
          expect(poleAdnotacjiZabezpieczen(meta, null)).toBeNull();
        });
      }
    }
  }

  it('brak meta albo refu — null', () => {
    expect(poleAdnotacjiZabezpieczen(undefined, snapshot)).toBeNull();
    expect(poleAdnotacjiZabezpieczen({ elementKind: 'protectionAnnotation' }, snapshot)).toBeNull();
  });

  it('id sekcji docelowej istnieje w karcie pola', () => {
    const enm = (fxZ11 as unknown as { snapshot: EnergyNetworkModel }).snapshot;
    for (const bay of enm.bays.filter((b) => (b.protection_codes ?? []).length > 0)) {
      const dane = { kind: 'bay', elementId: bay.ref_id } as unknown as DaneElementuKanwy;
      const karta = buildKartaTechniczna(enm, dane);
      expect(karta?.rodzaj).toBe('pole');
      expect(karta!.sekcje.map((x) => x.id)).toContain(SEKCJA_ZABEZPIECZEN_KARTY_POLA);
    }
  });
});

import { describe, expect, it } from 'vitest';

import type { LoadCatalogType } from '../../../../ui/catalog/types';
import {
  czyZipDomyslny,
  DANE_DOMYSLNE,
  fmtA,
  fmtKw,
  maOdplyw,
  POLA_ZIP,
  prefillZKatalogu,
  sumaUdzialowZip,
  walidujFormularz,
  walidujZip,
  zbudujPayload,
  zbudujZapytaniePodgladu,
  ZIP_DOMYSLNY,
  type ModelZip,
  type OdbiorFormData,
} from '../odbiorModel';

const typy = [
  { id: 'L1', name: 'Odbiór biurowy', model: 'pq', p_kw: 80, q_kvar: 30, cos_phi: 0.94, cos_phi_mode: 'fixed' },
  {
    id: 'L2',
    name: 'Odbiór impedancyjny',
    model: 'zip',
    p_kw: 40,
    cos_phi: 0.9,
    cos_phi_mode: 'fixed',
    a_p: 1,
    b_p: 0,
    c_p: 0,
    a_q: 1,
    b_q: 0,
    c_q: 0,
    k_pf: 1.5,
  },
] as unknown as LoadCatalogType[];

function zip(over: Partial<ModelZip> = {}): ModelZip {
  return { ...ZIP_DOMYSLNY, ...over };
}

function dane(over: Partial<OdbiorFormData> = {}): OdbiorFormData {
  return { ...DANE_DOMYSLNE, ...over };
}

describe('odbiorModel — walidacja', () => {
  it('wymaga dodatniej mocy i poprawnego cosφ', () => {
    expect(walidujFormularz(dane({ active_power_kw: 0 })).some((e) => e.field === 'active_power_kw')).toBe(true);
    expect(walidujFormularz(dane({ cos_phi: 1.5 })).some((e) => e.field === 'cos_phi')).toBe(true);
    // Dane z DANE_DOMYSLNE mają `catalog_ref: null` i `manual_mode: false`
    // (katalog-first domyślne) — bez wybranego typu formularz jest niekompletny
    // (karta D4). Kompletność dowodzi się jawną pozycją katalogową ALBO trybem
    // ręcznym, nie samymi wartościami domyślnymi.
    expect(walidujFormularz(dane({ catalog_ref: 'load-1' })).length).toBe(0);
    expect(walidujFormularz(dane({ manual_mode: true })).length).toBe(0);
    expect(walidujFormularz(dane()).some((e) => e.field === 'catalog_ref')).toBe(true);
  });
});

describe('odbiorModel — model obciążenia (ZIP)', () => {
  it('domyślny model to stała moc (c = 1) — zachowanie zastane rozpływu', () => {
    expect(czyZipDomyslny(DANE_DOMYSLNE.zip)).toBe(true);
    expect(DANE_DOMYSLNE.zip.c_p).toBe(1);
    expect(DANE_DOMYSLNE.zip.c_q).toBe(1);
    expect(walidujZip(DANE_DOMYSLNE.zip)).toEqual([]);
  });

  it('przyjmuje poprawny podział udziałów sumujący się do 1', () => {
    expect(walidujZip(zip({ a_p: 0.5, b_p: 0.2, c_p: 0.3 }))).toEqual([]);
    expect(walidujZip(zip({ a_q: 1, b_q: 0, c_q: 0 }))).toEqual([]);
  });

  it('odrzuca rozjechaną sumę osobno dla P i dla Q, podając zmierzoną sumę', () => {
    const bledyP = walidujZip(zip({ a_p: 0.5, b_p: 0, c_p: 0.2 }));
    expect(bledyP.some((b) => b.field === 'zip.suma_p')).toBe(true);
    expect(bledyP.find((b) => b.field === 'zip.suma_p')?.message).toContain('0.700');
    expect(bledyP.find((b) => b.field === 'zip.suma_p')?.message).toContain('czynnej P');
    expect(bledyP.some((b) => b.field === 'zip.suma_q')).toBe(false);

    const bledyQ = walidujZip(zip({ a_q: 0.4, b_q: 0.4, c_q: 0.4 }));
    expect(bledyQ.some((b) => b.field === 'zip.suma_q')).toBe(true);
    expect(bledyQ.find((b) => b.field === 'zip.suma_q')?.message).toContain('biernej Q');
    expect(bledyQ.some((b) => b.field === 'zip.suma_p')).toBe(false);
  });

  it('odrzuca udział poza zakresem [0, 1] nawet gdy suma się zgadza', () => {
    // Cecha, w której defekt mógłby się schować: suma = 1, a mimo to model
    // jest niefizyczny (ujemny udział). Sama kontrola sumy by to przepuściła.
    const bledy = walidujZip(zip({ a_p: -0.5, b_p: 0.5, c_p: 1 }));
    expect(sumaUdzialowZip(zip({ a_p: -0.5, b_p: 0.5, c_p: 1 }), 'p')).toBe(1);
    expect(bledy.some((b) => b.field === 'zip.a_p')).toBe(true);
  });

  it('wrażliwość częstotliwościowa nie podlega warunkowi sumy udziałów', () => {
    expect(walidujZip(zip({ k_pf: 2, k_qf: -1 }))).toEqual([]);
    expect(czyZipDomyslny(zip({ k_pf: 2 }))).toBe(false);
  });

  it('walidacja formularza niesie błędy modelu ZIP', () => {
    expect(walidujFormularz(dane({ zip: zip({ a_p: 0.5, b_p: 0, c_p: 0.2 }) })).some(
      (e) => e.field === 'zip.suma_p',
    )).toBe(true);
  });
});

describe('odbiorModel — odpływ', () => {
  it('wykrywa obecność odpływu', () => {
    expect(maOdplyw({})).toBe(false);
    expect(maOdplyw({ feeder_ref: 'f1' })).toBe(true);
  });
});

describe('odbiorModel — prefill z katalogu', () => {
  it('wypełnia moc i cosφ z katalogu', () => {
    const out = prefillZKatalogu(dane(), 'L1', typy);
    expect(out.active_power_kw).toBe(80);
    expect(out.cos_phi).toBe(0.94);
    expect(out.reactive_power_kvar).toBe(30);
    expect(out.catalog_ref).toBe('L1');
  });
  it('bez trafienia zachowuje dane, zapisuje ref', () => {
    const out = prefillZKatalogu(dane({ active_power_kw: 12 }), 'X', typy);
    expect(out.active_power_kw).toBe(12);
    expect(out.catalog_ref).toBe('X');
  });
  it('wypełnia model ZIP z pozycji katalogowej', () => {
    const out = prefillZKatalogu(dane(), 'L2', typy);
    expect(out.zip.a_p).toBe(1);
    expect(out.zip.c_p).toBe(0);
    expect(out.zip.k_pf).toBe(1.5);
    expect(czyZipDomyslny(out.zip)).toBe(false);
  });
  it('pozycja bez modelu ZIP daje stałą moc, nie poprzednio wpisane wartości', () => {
    // Wybór typu ma pokazać model TEGO typu. Przeniesienie poprzednich udziałów
    // przypisywałoby pozycji katalogowej model, którego ona nie deklaruje.
    const out = prefillZKatalogu(dane({ zip: zip({ a_p: 1, c_p: 0 }) }), 'L1', typy);
    expect(czyZipDomyslny(out.zip)).toBe(true);
  });
});

describe('odbiorModel — podgląd R1', () => {
  it('buduje żądanie prądu z P/cosφ/napięcia', () => {
    expect(zbudujZapytaniePodgladu(dane({ active_power_kw: 100, cos_phi: 0.9 }), 400)).toEqual({
      active_power_kw: 100,
      cos_phi: 0.9,
      line_voltage_v: 400,
    });
    expect(zbudujZapytaniePodgladu(dane({ active_power_kw: null }), 400)).toBeNull();
  });
});

describe('odbiorModel — payload', () => {
  it('wysyła P + cosφ (Q wyprowadzi backend), bez jawnego Q', () => {
    const payload = zbudujPayload(dane({ active_power_kw: 100, cos_phi: 0.9 }), { feeder_ref: 'f1', bus_nn_ref: 'b1' });
    expect(payload).toMatchObject({
      feeder_ref: 'f1',
      bus_nn_ref: 'b1',
      active_power_kw: 100,
      cos_phi: 0.9,
      load_kind: 'SKUPIONY',
      connection_type: 'TROJFAZOWY',
    });
    expect(payload).not.toHaveProperty('reactive_power_kvar');
  });

  it('dołącza jawny override Q gdy podany', () => {
    const payload = zbudujPayload(dane({ reactive_power_kvar: 25 }), { feeder_ref: 'f1' });
    expect(payload).toHaveProperty('reactive_power_kvar', 25);
  });

  it('dołącza catalog_binding gdy wybrano typ', () => {
    const payload = zbudujPayload(dane({ catalog_ref: 'L1' }), { feeder_ref: 'f1' });
    expect(payload.catalog_binding).toMatchObject({ catalog_namespace: 'OBCIAZENIE', catalog_item_id: 'L1' });
    expect(payload).not.toHaveProperty('source_mode');
  });

  it('tryb ręczny (karta D4): wysyła source_mode EKSPERCKI_RECZNY, pomija catalog_binding nawet gdy catalog_ref ustawiony', () => {
    // TEN SAM wyróżnik, którym operacja domenowa add_nn_load i bramka API
    // (api/domain_ops_policy.py::_uses_manual_nn_load) rozpoznają tryb
    // ekspercki. `catalog_ref` w danych formularza jest tu CELOWO ustawiony
    // (np. reliktowo po przełączeniu trybu) — payload ma go mimo to pominąć,
    // bo tryb ręczny wygrywa nad stanem pola katalogu w UI.
    const payload = zbudujPayload(dane({ manual_mode: true, catalog_ref: 'L1' }), { feeder_ref: 'f1' });
    expect(payload).toMatchObject({ feeder_ref: 'f1', source_mode: 'EKSPERCKI_RECZNY' });
    expect(payload).not.toHaveProperty('catalog_binding');
  });

  it('niesie komplet współczynników modelu ZIP gdy projektant go zmienił', () => {
    const payload = zbudujPayload(dane({ zip: zip({ a_p: 1, c_p: 0, a_q: 1, c_q: 0 }) }), {
      feeder_ref: 'f1',
    });
    for (const pole of POLA_ZIP) {
      expect(payload).toHaveProperty(pole);
    }
    expect(payload.a_p).toBe(1);
    expect(payload.c_p).toBe(0);
  });

  it('niesie model ZIP także wtedy, gdy zmieniono SAMĄ wrażliwość częstotliwościową', () => {
    // Wielomian napięciowy zostaje trywialny (c = 1), więc próg patrzący tylko
    // na napięcie zgubiłby tę deklarację po cichu.
    const payload = zbudujPayload(dane({ zip: zip({ k_pf: 2 }) }), { feeder_ref: 'f1' });
    expect(payload.k_pf).toBe(2);
    expect(payload.c_p).toBe(1);
  });

  it('pomija współczynniki przy stałej mocy — payload jak przed powstaniem sekcji', () => {
    const payload = zbudujPayload(dane(), { feeder_ref: 'f1' });
    for (const pole of POLA_ZIP) {
      expect(payload).not.toHaveProperty(pole);
    }
  });
});

describe('odbiorModel — formatery', () => {
  it('formatuje wartości', () => {
    expect(fmtA(46.25)).toBe('46.3 A');
    expect(fmtKw(80)).toBe('80.0 kW');
    expect(fmtA(null)).toBe('—');
  });
});

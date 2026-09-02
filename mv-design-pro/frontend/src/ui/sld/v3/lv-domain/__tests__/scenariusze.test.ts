/**
 * SCENARIUSZE §47 — jedno źródło prawdy energizacji (mandat „profesjonalizacja
 * SLD nN" §1/§46): każdy JSON w `fixtures/generated/` jest odpowiedzią
 * backendu (kontrakt 3.0.0), a frontend NIE dopisuje do niego żadnego stanu.
 * Pin klasy: KAŻDY scenariusz × KAŻDA szyna × KAŻDY odcinek — nie wybrany
 * przykład.
 */
import { describe, expect, it } from 'vitest';

import { SCENARIUSZE_NN, SLUGI_SCENARIUSZY, TYTULY_SCENARIUSZY, jestSlugiemScenariusza, scenariusz } from '../fixtures/scenariusze';
import { isLvDomainProjectionV1 } from '../projectionApi';
import { LV_DOMAIN_PROJECTION_CONTRACT_VERSION } from '../types';

const STANY = ['ENERGIZED', 'DEENERGIZED', 'UNKNOWN', 'CONFLICT', 'MULTISOURCE'] as const;

describe('Scenariusze 01–18 — kształt kontraktu 3.0.0 z backendu', () => {
  it('kontrakt frontendu = 3.0.0; lista slugów jest kompletna i uporządkowana', () => {
    expect(LV_DOMAIN_PROJECTION_CONTRACT_VERSION).toBe('3.0.0');
    expect(SLUGI_SCENARIUSZY).toHaveLength(18);
    expect([...SLUGI_SCENARIUSZY]).toEqual([...SLUGI_SCENARIUSZY].sort());
    for (const slug of SLUGI_SCENARIUSZY) {
      expect(jestSlugiemScenariusza(slug)).toBe(true);
      expect(TYTULY_SCENARIUSZY[slug].length).toBeGreaterThan(5);
    }
    expect(jestSlugiemScenariusza('99_nie_ma')).toBe(false);
  });

  for (const slug of SLUGI_SCENARIUSZY) {
    const p = SCENARIUSZE_NN[slug];
    it(`[${slug}] przechodzi walidację kształtu isLvDomainProjectionV1 i ma status OK`, () => {
      expect(isLvDomainProjectionV1(p)).toBe(true);
      expect(p.contract_version).toBe('3.0.0');
      expect(p.status).toBe('OK');
      expect(p.graph.status).toBe('OK');
      expect(Array.isArray(p.validation_messages)).toBe(true);
    });

    it(`[${slug}] KAŻDA szyna niesie stan zasilania i wyspę z backendu (§5/§14) — zero domysłu w UI`, () => {
      if (p.graph.status !== 'OK') return;
      const wyspy = new Set(p.graph.islands.map((i) => i.island_ref));
      expect(p.graph.buses.length).toBeGreaterThan(0);
      for (const bus of p.graph.buses) {
        expect(STANY, `${bus.ref_id}: ${bus.energization_state}`).toContain(bus.energization_state);
        expect(wyspy.has(bus.island_ref), `${bus.ref_id} bez wyspy`).toBe(true);
        expect(Array.isArray(bus.supply_refs)).toBe(true);
      }
      for (const island of p.graph.islands) {
        expect(island.bus_refs.length).toBeGreaterThan(0);
        expect(island.neutral_reference).toBeDefined();
        expect(island.power_balance).toBeDefined();
      }
    });

    it(`[${slug}] KAŻDY odcinek niesie stan OBU zacisków i łączność (§5/§6)`, () => {
      if (p.graph.status !== 'OK') return;
      expect(p.graph.segments.length).toBeGreaterThan(0);
      for (const seg of p.graph.segments) {
        expect(['CLOSED', 'OPEN']).toContain(seg.connectivity_state);
        expect(STANY).toContain(seg.from_terminal.energization_state);
        expect(STANY).toContain(seg.to_terminal.energization_state);
        if (seg.connectivity_state === 'OPEN') {
          // Przewód za otwartym łącznikiem NIE przewodzi — odcinek jest bez
          // napięcia niezależnie od stanu zacisków po obu stronach.
          expect(seg.energization_state, seg.segment_id).toBe('DEENERGIZED');
        }
      }
    });

    it(`[${slug}] każde urządzenie ma rolę i klasę oznaczenia z backendu (§4/§8)`, () => {
      if (p.graph.status !== 'OK') return;
      for (const d of p.graph.devices) {
        expect(['incomer', 'feeder', 'coupler', 'boundary', 'internal']).toContain(d.device_role);
        expect(['QF', 'QS', 'FU', 'QBC', 'W']).toContain(d.designation_class);
        expect(['OPEN', 'CLOSED', 'UNKNOWN']).toContain(d.device_state);
      }
    });
  }

  it('scenariusz() zwraca dokładnie ten sam obiekt co słownik (jedna instancja, zero kopii z ręczną edycją)', () => {
    expect(scenariusz('02_two_tr_qbc_open')).toBe(SCENARIUSZE_NN['02_two_tr_qbc_open']);
  });
});

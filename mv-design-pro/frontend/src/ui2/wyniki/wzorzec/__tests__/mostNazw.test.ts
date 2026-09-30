/**
 * Most nazw wyników (karta #145) — parytet reguły identyfikatora grafu z backendem
 * i iloczyn cech rozpoznawania obiektu.
 *
 * Wyniki rozpływu, zwarć i ocen niosą identyfikator GRAFU (`uuid5(NAMESPACE_DNS, ref_id)`,
 * `backend/src/enm/mapping.py::ref_to_graph_id`), a nie `ref_id` modelu. Front liczy tę
 * samą regułę lustrzanie (`ui/topology/identyfikatorGrafu.ts`). Wyrocznią są pary policzone
 * przez backend w eksporcie fikstur (`identyfikatory_grafu.json`: sieć złota, sceny
 * „akademickie", „lom", „frt" i analiz OZE — referencje proste i z ziarnem).
 *
 * Iloczyn cech: klucz wyszukania {ref_id, id obiektu, identyfikator grafu} × nazwa
 * {w migawce, pusta w migawce, tylko w wyniku, wynik podaje identyfikator jako nazwę,
 * brak wszędzie}.
 */
import { describe, expect, it } from 'vitest';

import identyfikatoryGrafu from '../../../../harness-fixtures/generated/identyfikatory_grafu.json';
import { identyfikatorGrafu } from '../../../../ui/topology/identyfikatorGrafu';
import type { EnergyNetworkModel } from '../../../../types/enm';
import { etykietaZapasowaRefu, nazwaObiektuZMigawki } from '../useNazwaObiektu';

describe('identyfikator grafu — lustro `ref_to_graph_id` backendu', () => {
  it('każda para ref_id → identyfikator grafu z fikstury backendu jest odtworzona 1:1', () => {
    const { pary } = identyfikatoryGrafu as { pary: { ref_id: string; graph_id: string }[] };
    expect(pary.length).toBeGreaterThan(50);
    const rozjazdy = pary.filter((p) => identyfikatorGrafu(p.ref_id) !== p.graph_id);
    expect(rozjazdy).toEqual([]);
  });

  it('referencje proste i z ziarnem są w wyroczni (pokrycie obu kształtów)', () => {
    const { pary } = identyfikatoryGrafu as { pary: { ref_id: string }[] };
    expect(pary.some((p) => !p.ref_id.includes('/'))).toBe(true);
    expect(pary.some((p) => /\/[0-9a-f]{32}\//.test(p.ref_id))).toBe(true);
  });
});

describe('nazwaObiektuZMigawki — iloczyn klucza wyszukania i źródła nazwy', () => {
  const REF = 'bus/0123456789abcdef0123456789abcdef/sn';
  const migawka = {
    buses: [
      { ref_id: REF, id: 'wezel-1', name: 'Szyna SN stacji 1', voltage_kv: 15 },
      { ref_id: 'bus_bez_nazwy', id: 'wezel-2', name: '', voltage_kv: 15 },
    ],
  } as unknown as EnergyNetworkModel;

  it.each([
    ['ref_id', REF],
    ['id obiektu', 'wezel-1'],
    ['identyfikator grafu', identyfikatorGrafu(REF)],
  ])('nazwa z migawki po kluczu: %s', (_klucz, wartosc) => {
    expect(nazwaObiektuZMigawki(migawka, wartosc)).toBe('Szyna SN stacji 1');
  });

  it('nazwa z migawki wygrywa z nazwą niesioną przez wynik', () => {
    expect(nazwaObiektuZMigawki(migawka, REF, 'Inna nazwa z wyniku')).toBe('Szyna SN stacji 1');
  });

  it('obiekt spoza migawki → nazwa niesiona przez wynik', () => {
    expect(nazwaObiektuZMigawki(migawka, 'typ-katalogowy-x', 'Falownik 1 MW')).toBe('Falownik 1 MW');
  });

  it('wynik podaje identyfikator jako nazwę → etykieta zapasowa, nigdy identyfikator', () => {
    const ref = 'gen/fedcba9876543210fedcba9876543210/converter';
    const nazwa = nazwaObiektuZMigawki(null, ref, ref);
    expect(nazwa).toBe(etykietaZapasowaRefu(ref));
    expect(nazwa).not.toContain('fedcba9876543210fedcba9876543210');
  });

  it('pusta nazwa w migawce nie jest nazwą → etykieta zapasowa', () => {
    expect(nazwaObiektuZMigawki(migawka, 'bus_bez_nazwy')).toBe(etykietaZapasowaRefu('bus_bez_nazwy'));
  });

  it('brak migawki i brak nazwy w wyniku → etykieta zapasowa bez ziarna', () => {
    const nazwa = nazwaObiektuZMigawki(null, REF);
    expect(nazwa).toBe(etykietaZapasowaRefu(REF));
    expect(nazwa).not.toContain('0123456789abcdef0123456789abcdef');
  });
});

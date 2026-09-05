/**
 * PARZYSTOSC z regula kanoniczna backendu (V12K-244).
 *
 * Ocena gotowosci wytwórcy istnieje w dwóch miejscach: kanonicznie w backendzie
 * (`domain/der_readiness.py`) i tutaj — bo warsztat ocenia rekord jeszcze NIEZAPISANY
 * w modelu. Dopóki obie żyją, muszą dawać ten sam werdykt; inaczej ocena zależy od tego,
 * KTO pyta (precedens V12K-243: trzy oceny tego samego wytwórcy na jednym ekranie).
 *
 * Ten test czyta DOKŁADNIE TEN SAM plik przypadków, co pytest po stronie backendu.
 * Oczekiwania spisano z normy i intencji — zrzut z którejkolwiek implementacji
 * utrwaliłby jej błąd zamiast go wykryć.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildAggregatedReadiness, computeDerReadinessMatrix } from '../readiness';
import {
  EMPTY_DER_CATALOGS,
  EMPTY_DER_PROFILES,
  EMPTY_DER_READINESS,
  type DerReadinessMatrix,
  type StationDerConnection,
} from '../types';

const PLIK_PRZYPADKOW = path.resolve(
  __dirname,
  '../../../../../../docs/domain/der_readiness_parity_v1.json',
);

interface Przypadek {
  readonly nazwa: string;
  readonly wejscie: Record<string, unknown>;
  readonly oczekiwane: Record<string, string>;
  readonly kody_blokad: Record<string, readonly string[]>;
}

function wczytajPrzypadki(): Przypadek[] {
  const dane = JSON.parse(fs.readFileSync(PLIK_PRZYPADKOW, 'utf-8')) as {
    przypadki: Przypadek[];
  };
  return dane.przypadki;
}

/** Przełożenie faktów z kontraktu na rekord warsztatu (te same fakty, inny kształt). */
function derZPrzypadku(wejscie: Record<string, unknown>): StationDerConnection {
  const tekst = (klucz: string): string | null =>
    typeof wejscie[klucz] === 'string' ? (wejscie[klucz] as string) : null;
  return {
    id: String(wejscie.der_id ?? 'DER'),
    project_id: 'parity',
    station_id: 'ST-1',
    der_kind: wejscie.der_kind as StationDerConnection['der_kind'],
    name: String(wejscie.der_id ?? 'DER'),
    // Karta FAB-K (§0 R3): kontrakt parzystości (`der_readiness_parity_v1.json`)
    // jest wspólny z regułą kanoniczną backendu (`domain/der_readiness.py`),
    // której WŁASNY typ `StronaPrzylaczenia` NIE jest tą kartą ruszany (poza
    // zakresem — dług przekraczający sesję, patrz meldunek) i nadal dopuszcza
    // szersze słownictwo niż front. Rzutowanie przez `unknown` (przez `as`)
    // celowo NIE zawęża wartości u źródła — ocenia się DOKŁADNIE ten sam fakt,
    // który dostaje backend, żeby test parzystości pytał o to samo pytanie.
    connection_side: wejscie.connection_side as StationDerConnection['connection_side'],
    bus_przylaczenia_ref: tekst('bus_przylaczenia_ref'),
    bay_ref: null,
    transformer_ref: null,
    lv_busbar_ref: null,
    sn_connection_bus_ref: null,
    sn_connection_point_kind: null,
    connection_voltage_kv: null,
    unit_count: null,
    catalogs: {
      ...EMPTY_DER_CATALOGS,
      device_catalog_ref: tekst('device_catalog_ref'),
      block_transformer_catalog_ref: tekst('block_transformer_catalog_ref'),
      protection_catalog_ref: tekst('protection_catalog_ref'),
      ct_catalog_ref: tekst('ct_catalog_ref'),
      vt_catalog_ref: tekst('vt_catalog_ref'),
      dynamic_model_ref: tekst('dynamic_model_ref'),
    },
    profiles: {
      ...EMPTY_DER_PROFILES,
      nc_rfg_profile_ref: tekst('nc_rfg_profile_ref'),
      lvrt_curve_ref: tekst('lvrt_curve_ref'),
      hvrt_curve_ref: tekst('hvrt_curve_ref'),
    },
    ct_accuracy_class: (tekst('ct_accuracy_class') ?? undefined) as never,
    ct_application: (tekst('ct_application') ?? undefined) as never,
    nominal_power_kw:
      typeof wejscie.nominal_power_kw === 'number' ? wejscie.nominal_power_kw : null,
    completeness: 'complete',
    readiness: { ...EMPTY_DER_READINESS },
    created_at: '2026-07-27T00:00:00Z',
    updated_at: '2026-07-27T00:00:00Z',
  };
}

const PRZYPADKI = wczytajPrzypadki();

describe('gotowość wytwórcy — parzystość z regułą kanoniczną backendu', () => {
  it('plik przypadków jest tam, gdzie szuka go drugi stos', () => {
    // Bramka, która nie pozwala „naprawić" parzystości przez przeniesienie pliku.
    expect(fs.existsSync(PLIK_PRZYPADKOW)).toBe(true);
    expect(PRZYPADKI.length).toBeGreaterThan(0);
  });

  for (const przypadek of PRZYPADKI) {
    it(`werdykt: ${przypadek.nazwa}`, () => {
      const macierz = computeDerReadinessMatrix(derZPrzypadku(przypadek.wejscie), {
        otherDersInStation:
          typeof przypadek.wejscie.other_ders_in_station === 'number'
            ? przypadek.wejscie.other_ders_in_station
            : 0,
      });
      for (const [os, oczekiwany] of Object.entries(przypadek.oczekiwane)) {
        expect(macierz[os as keyof DerReadinessMatrix], `oś ${os}`).toBe(oczekiwany);
      }
    });

    it(`powody: ${przypadek.nazwa}`, () => {
      const osie = buildAggregatedReadiness(derZPrzypadku(przypadek.wejscie), {
        otherDersInStation:
          typeof przypadek.wejscie.other_ders_in_station === 'number'
            ? przypadek.wejscie.other_ders_in_station
            : 0,
      });
      for (const [os, kody] of Object.entries(przypadek.kody_blokad)) {
        const obecne = osie.find((pozycja) => pozycja.axis === os)?.blockers.map((b) => b.code) ?? [];
        for (const kod of kody) {
          expect(obecne, `oś ${os}`).toContain(kod);
        }
      }
    });
  }
});

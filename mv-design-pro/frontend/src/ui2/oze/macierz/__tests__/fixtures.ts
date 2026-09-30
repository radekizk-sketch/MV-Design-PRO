/*
 * Fixtury testów ekranów zgodności NC RfG na kontrakcie V2 (karta AB-1a Pakiet D2).
 *
 * Odpowiedzi backendu NIE są tu pisane ręcznie: katalog, bieg „co-jeśli", zgodność przypadku,
 * certyfikat (widok i 422) i wejścia modułów z modelu (`GET …/wejscia`) pochodzą z
 * `harness-fixtures/generated/*` — policzone skryptem
 * `backend/scripts/eksport_fixtur_harnessu.py` TYMI SAMYMI funkcjami co trasy i pilnowane
 * testem `backend/tests/ci/test_fixtury_harnessu.py`. Moduły sceny (`deryScenyMacierz`)
 * wyprowadza produkcyjne odwzorowanie `deryZModelu` z migawki modelu, z którego policzono te
 * odpowiedzi. `derFixture` służy wyłącznie przypadkom brzegowym modelu (brak napięcia/mocy).
 */

import certyfikatBraki from '../../../../harness-fixtures/generated/certyfikat_scena_macierz_braki.json';
import certyfikatWidok from '../../../../harness-fixtures/generated/certyfikat_scena_magazyn.json';
import macierzScenyMigawka from '../../../../harness-fixtures/generated/macierz_scena_migawka.json';
import biegSceny from '../../../../harness-fixtures/generated/ncrfg_bieg_scena_macierz.json';
import zadanieBieguSceny from '../../../../harness-fixtures/generated/ncrfg_bieg_scena_macierz_zadanie.json';
import katalogNcRfg from '../../../../harness-fixtures/generated/ncrfg_katalog.json';
import wejsciaSceny from '../../../../harness-fixtures/generated/ncrfg_wejscia_scena_macierz.json';
import zgodnoscSceny from '../../../../harness-fixtures/generated/ncrfg_zgodnosc_przekrojowa_scena_macierz.json';
import type { EnergyNetworkModel } from '../../../../types/enm';
import type {
  BiegNcRfg,
  BrakiCertyfikatu,
  KatalogNcRfg,
  WejsciaPrzypadkuNcRfg,
  WejscieModuluNcRfg,
  WidokCertyfikatu,
  ZadanieBieguNcRfg,
  ZgodnoscPrzypadkuNcRfg,
} from '../../ncrfg/typy';
import {
  deryZModelu,
  EMPTY_DER_CATALOGS,
  EMPTY_DER_PROFILES,
  EMPTY_DER_READINESS,
  type DerCatalogSelections,
  type DerKindUnified,
  type DerProfileSelections,
  type StationDerConnection,
} from '../../../../ui/network-build/station-der';

// `catalogs`/`profiles` sa CZESCIOWYMI nadpisaniami (cialo funkcji nizej scala
// je z EMPTY_DER_CATALOGS/EMPTY_DER_PROFILES) — `Partial<StationDerConnection>`
// tego nie wyraza (spłaszcza tylko pola najwyzszego poziomu, nie zagniezdzone),
// wiec wywolujacy musialby podawac KOMPLETNE obiekty katalogowe. Nadpisanie
// tych dwoch pol na `Partial<...>` naprawia sygnature u zrodla zamiast
// dopisywac brakujace pola w kazdym z wywolan w plikach testowych.
type DerFixtureOverrides = Omit<Partial<StationDerConnection>, 'catalogs' | 'profiles'> & {
  id: string;
  catalogs?: Partial<DerCatalogSelections>;
  profiles?: Partial<DerProfileSelections>;
};

export function derFixture(over: DerFixtureOverrides): StationDerConnection {
  const der_kind: DerKindUnified = over.der_kind ?? 'PV';
  return {
    id: over.id,
    project_id: over.project_id ?? 'proj-1',
    station_id: over.station_id ?? 'st-1',
    der_kind,
    name: over.name ?? over.id,
    connection_side: over.connection_side ?? 'nN',
    bus_przylaczenia_ref: over.bus_przylaczenia_ref ?? 'pcc_st-1_szyna-1',
    bay_ref: over.bay_ref ?? null,
    transformer_ref: over.transformer_ref ?? null,
    lv_busbar_ref: over.lv_busbar_ref ?? null,
    sn_connection_bus_ref: over.sn_connection_bus_ref ?? null,
    sn_connection_point_kind: over.sn_connection_point_kind ?? null,
    // Uwaga: rozróżniamy jawny `null` (brak danej) od „nie podano" (undefined → domyślna).
    // Karta FAB-K: JEDYNE źródło napięcia przyłączenia od tej karty —
    // `connection_voltage_kv`, liczba WPROST z modelu (szyna wytwórcy), nie
    // dawna referencja tekstowa `voltage_level_ref` (usunięta jako fantom —
    // backend nigdy jej nie przyjmował).
    connection_voltage_kv: 'connection_voltage_kv' in over ? over.connection_voltage_kv! : 0.4,
    catalogs: { ...EMPTY_DER_CATALOGS, ...(over.catalogs ?? {}) },
    profiles: { ...EMPTY_DER_PROFILES, ...(over.profiles ?? {}) },
    nominal_power_kw: 'nominal_power_kw' in over ? over.nominal_power_kw! : 500,
    unit_count: over.unit_count ?? null,
    completeness: over.completeness ?? 'complete',
    readiness: over.readiness ?? { ...EMPTY_DER_READINESS },
    created_at: over.created_at ?? '1970-01-01T00:00:00Z',
    updated_at: over.updated_at ?? '1970-01-01T00:00:00Z',
  };
}

/** Katalog NC RfG (`GET /api/ncrfg-tests/catalog`) policzony trasą backendu. */
export function katalogFixture(): KatalogNcRfg {
  return katalogNcRfg as unknown as KatalogNcRfg;
}

/** Moduły sceny `macierz` (BESS + PV) wyprowadzone z modelu odwzorowaniem produkcyjnym. */
export function deryScenyMacierz(): readonly StationDerConnection[] {
  return deryZModelu(macierzScenyMigawka as unknown as EnergyNetworkModel, 'proj-demo');
}

/**
 * Wejścia modułów sceny z modelu (`GET /api/ncrfg-tests/cases/{id}/wejscia`) — formularz
 * wstępny biegu „co-jeśli" złożony mostem modelu backendu, z pochodzeniem pól.
 */
export function wejsciaFixture(): WejsciaPrzypadkuNcRfg {
  return wejsciaSceny as unknown as WejsciaPrzypadkuNcRfg;
}

/**
 * Wejścia z modelu dla rekordów syntetycznych (`derFixture`): moduł = wejście modułu BESS
 * sceny (policzone mostem) z podmienioną tożsamością i nadpisaniami pól; `pominiete` — DER
 * pominięte przez most z powodem. Pochodzenie „z modelu" podaje wołający.
 */
export function wejsciaZ(params: {
  readonly moduly?: readonly {
    readonly derRef: string;
    readonly pola?: Partial<WejscieModuluNcRfg>;
    readonly zModelu?: readonly (keyof WejscieModuluNcRfg)[];
  }[];
  readonly pominiete?: readonly { readonly derRef: string; readonly powod: 'brak_mocy' | 'brak_napiecia' }[];
}): WejsciaPrzypadkuNcRfg {
  const wzor = wejsciaFixture();
  const bazowy = wzor.modules.find((m) => m.der_kind === 'BESS')!;
  const moduly = params.moduly ?? [];
  return {
    ...wzor,
    modules: moduly.map((m) => ({ ...bazowy, der_ref: m.derRef, der_name: m.derRef, ...(m.pola ?? {}) })),
    pola_z_modelu: Object.fromEntries(
      moduly.map((m) => [m.derRef, m.zModelu ?? ['der_ref', 'der_name', 'der_kind', 'p_max_kw', 'voltage_kv']]),
    ),
    pominiete: (params.pominiete ?? []).map((p) => ({
      der_ref: p.derRef,
      der_name: p.derRef,
      powod: p.powod,
      powod_pl: `powód pominięcia: ${p.powod}`,
    })),
  };
}

/** Ciało biegu „co-jeśli", które ekran wysyła dla modułów sceny z formularzem wstępnym. */
export function zadanieBieguFixture(): ZadanieBieguNcRfg {
  return zadanieBieguSceny as unknown as ZadanieBieguNcRfg;
}

/** Odpowiedź `POST /api/ncrfg-tests/run` dla `zadanieBieguFixture()` (źródło `ZADANIE_KLIENTA`). */
export function biegFixture(): BiegNcRfg {
  return biegSceny as unknown as BiegNcRfg;
}

/** Odpowiedź `GET /api/ncrfg-tests/cases/{id}/compliance` modelu sceny (dowód PV z wykazu). */
export function zgodnoscFixture(): ZgodnoscPrzypadkuNcRfg {
  return zgodnoscSceny as unknown as ZgodnoscPrzypadkuNcRfg;
}

/** Widok certyfikatu zgodności (200) — model magazynu (wymagania `NIE_DOTYCZY`). */
export function certyfikatWidokFixture(): WidokCertyfikatu {
  return certyfikatWidok as unknown as WidokCertyfikatu;
}

/** Treść 422 certyfikatu modelu sceny `macierz` — rekordy W bez `SPELNIA`. */
export function certyfikatBrakiFixture(): BrakiCertyfikatu {
  return certyfikatBraki as unknown as BrakiCertyfikatu;
}

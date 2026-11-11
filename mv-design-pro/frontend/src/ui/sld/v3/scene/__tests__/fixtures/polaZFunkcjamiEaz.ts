/**
 * Fikstury pól z funkcjami EAZ — JEDNO źródło rodzajów pola dla kontraktów bloku zabezpieczeń
 * i kolumny opisów pola (`blokZabezpieczenNotacja.contract.test.tsx`,
 * `kolumnaOpisowPolaKlasa.contract.test.ts`).
 *
 * Każdy przypadek to realny model ENM (migawka → adapter → kompozycja → scena v3):
 *  - pola GPZ: fikstura wzorca ENEA Z.10 (symbole QET, powiązania obwodów wtórnych szablonu),
 *    ścieżka danych zabezpieczeń (symbole kanoniczne, bez powiązań), pole źródła OZE w GPZ
 *    (`macierz_scena_migawka`) i pole toru transformatora GPZ (pole TR modelu z aparatami
 *    pola Z.10 i transformatorem GPZ — wieża: pole WN TR → TR2W → pole TR → szyna SN);
 *  - pola stacji: celki katalogu konfiguracji (`fieldConfigurationsCatalog.json`) wstrzyknięte
 *    do pierwszego pola SN pierwszej stacji sieci `sldSubstrate52s` (wzorzec macierzy W1c),
 *    z przypisaniem zabezpieczenia wskazującym wyłącznik i przekładnik celki.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Bay, BayPrimaryDevice, EnergyNetworkModel } from '../../../../../../types/enm';
import { polaSnStacji } from '../../../../../shared/polaStacji';
import { buildW1cCases } from './w1cMatrixCatalog';

const here = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(here, '../../../../../../..');

export function modelFikstury(sciezka: string): EnergyNetworkModel {
  const raw = JSON.parse(readFileSync(resolve(FRONTEND, sciezka), 'utf8')) as Record<string, unknown>;
  for (const kandydat of [raw, raw.enm, raw.snapshot]) {
    const enm = kandydat as Partial<EnergyNetworkModel> | undefined;
    if (enm && Array.isArray(enm.buses) && Array.isArray(enm.branches)) return enm as EnergyNetworkModel;
  }
  throw new Error(`brak modelu ENM w ${sciezka}`);
}

export const Z10 = modelFikstury('src/harness-fixtures/generated/pole_liniowe_z10_gpz_staly_w_sekcji_1.json');
export const SCIEZKA_DANYCH = modelFikstury('src/ui/sld/v3/scene/__tests__/fixtures/gpzProtectionDataPath.enm.json');
export const BAZA_STACJI = modelFikstury('src/ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json');
export const MACIERZ_OZE = modelFikstury('src/harness-fixtures/generated/macierz_scena_migawka.json');

export interface PrzypadekPola {
  readonly enm: EnergyNetworkModel;
  readonly bayRef: string;
}

const kopia = (enm: EnergyNetworkModel): EnergyNetworkModel => structuredClone(enm);

/** Pole ma aparat zasilający funkcję EAZ (powiązanie obwodów wtórnych w modelu). */
export const zasilane = (b: Bay): boolean => (b.primary_devices ?? []).some((d) => (d.funkcje_eaz_zasilane ?? []).length > 0);

/** Pole GPZ fikstury: kody pola podmienione na `kody`; pozostałe pola bez zmian. */
export function poleGpz(baza: EnergyNetworkModel, wybor: (b: Bay) => boolean, kody: readonly string[]): PrzypadekPola {
  const enm = kopia(baza);
  const bay = (enm.bays ?? []).find((b) => b.gpz_section_id && (b.primary_devices ?? []).length > 0 && wybor(b))!;
  bay.protection_codes = [...kody];
  return { enm, bayRef: bay.ref_id };
}

/** Pole źródła OZE w GPZ (`macierz_scena_migawka`: pole źródła z wyłącznikiem, przekładnikami
 *  i symbolem źródła) — kody pola podmienione na `kody`. */
export function poleOzeGpz(kody: readonly string[]): PrzypadekPola {
  const enm = kopia(MACIERZ_OZE);
  const bay = [...(enm.bays ?? [])]
    .filter((b) => b.ref_id.endsWith('/der/source_field') && (b.primary_devices ?? []).length > 0)
    .sort((a, b) => a.ref_id.localeCompare(b.ref_id))[0];
  bay.protection_codes = [...kody];
  return { enm, bayRef: bay.ref_id };
}

/** Pole toru transformatora GPZ: pole TR modelu (`bay_role` TR) z aparatami pola Z.10 (porty,
 *  oznaczenia, przekładniki), wskazujące pierwszy transformator GPZ (`equipment_refs`) — adapter
 *  rysuje je w wieży transformatora (`przypiszPolaTr`), nie w sekcji. */
export function poleTorTransformatoraGpz(kody: readonly string[]): PrzypadekPola {
  const enm = kopia(Z10);
  const gpz = enm.substations.find((s) => s.station_type === 'gpz')!;
  const trRef = gpz.transformer_refs[0];
  const wzor = (enm.bays ?? []).find((b) => b.gpz_section_id && (b.primary_devices ?? []).length > 0)!;
  const ref = `${wzor.gpz_section_id}/pole-tr-wiezy`;
  const pole: Bay = {
    ...structuredClone(wzor),
    id: ref,
    ref_id: ref,
    name: 'Pole TR',
    bay_role: 'TR',
    bay_number: '9',
    equipment_refs: [trRef],
    protection_codes: [...kody],
    protection_ref: null,
    primary_devices: (wzor.primary_devices ?? []).map((d, i) => ({
      ...structuredClone(d),
      device_ref: `${ref}::dev::${i}`,
      linked_ref: null,
    })),
  };
  enm.bays = [...(enm.bays ?? []), pole];
  return { enm, bayRef: ref };
}

/** Celka katalogu wstrzyknięta do pierwszego pola SN pierwszej stacji sieci `sldSubstrate52s`
 *  (wzorzec W1c), z przypisaniem zabezpieczenia wskazującym wyłącznik i przekładnik celki. */
export function poleStacji(configRef: string, kody: readonly string[]): PrzypadekPola {
  const przypadek = buildW1cCases().find((c) => c.configId === `${configRef}::zamkniety`)!;
  const enm = kopia(BAZA_STACJI);
  const stacja = [...(enm.substations as unknown as { ref_id: string; station_type?: string }[])]
    .filter((s) => ['branch', 'inline', 'terminal'].includes(s.station_type ?? ''))
    .sort((a, b) => a.ref_id.localeCompare(b.ref_id))[0];
  const host = [...polaSnStacji(enm, stacja.ref_id)].sort((a, b) => a.ref_id.localeCompare(b.ref_id))[0] as Bay;
  host.primary_devices = przypadek.devices.map((d) => ({ ...d })) as BayPrimaryDevice[];
  host.config_id = przypadek.configId;
  host.protection_codes = [...kody];
  const wylacznik = przypadek.devices.find((d) => d.kind === 'CB' || d.kind === 'LOAD_SWITCH');
  const przekladnik = przypadek.devices.find((d) => d.kind === 'CT');
  if (kody.length > 0 && wylacznik) {
    const wzor = (SCIEZKA_DANYCH.protection_assignments ?? [])[0];
    const ref = `${host.ref_id}/prot`;
    enm.protection_assignments = [
      ...(enm.protection_assignments ?? []),
      { ...structuredClone(wzor), id: `${ref}-id`, ref_id: ref, breaker_ref: wylacznik.device_ref, ct_ref: przekladnik?.device_ref ?? null },
    ];
    host.protection_ref = ref;
  }
  return { enm, bayRef: host.ref_id };
}

/** Rodzaje aparatów pola będące przekładnikami (prądowy, napięciowy, Ferrantiego). */
export const RODZAJE_PRZEKLADNIKOW: ReadonlySet<string> = new Set(['CT', 'VT', 'CORE_BALANCE_CT']);

/**
 * Pole `bayRef` modelu bez przekładników: aparaty rodzaju z `RODZAJE_PRZEKLADNIKOW` zdjęte,
 * a tor zszyty — węzeł wyjścia zdjętego aparatu toru (`wy`) zastąpiony w portach pozostałych
 * aparatów węzłem jego wejścia (`we`), więc tor pola zostaje ciągły od szyny do odejścia.
 * Przypisania zabezpieczeń pola tracą wskazanie przekładnika (`ct_ref`). Zmienia model w miejscu.
 */
export function bezPrzekladnikow(enm: EnergyNetworkModel, bayRef: string): void {
  const bay = (enm.bays ?? []).find((b) => b.ref_id === bayRef)!;
  let aparaty = [...(bay.primary_devices ?? [])];
  for (;;) {
    const i = aparaty.findIndex((d) => RODZAJE_PRZEKLADNIKOW.has(d.kind));
    if (i < 0) break;
    const [zdjety] = aparaty.splice(i, 1);
    const we = zdjety.ports?.find((p) => p.port_id === 'we')?.wezel;
    const wy = zdjety.ports?.find((p) => p.port_id === 'wy')?.wezel;
    if (we && wy) {
      aparaty = aparaty.map((d) => ({
        ...d,
        ports: d.ports?.map((p) => (p.wezel === wy ? { ...p, wezel: we } : p)),
      }));
    }
  }
  bay.primary_devices = aparaty;
  enm.protection_assignments = (enm.protection_assignments ?? []).map((a) => (a.ref_id === bay.protection_ref ? { ...a, ct_ref: null } : a));
}

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
 *    ze sterownikiem pola, którego macierz wyzwoleń wskazuje wyłącznik celki, a wejście prądowe
 *    — przekładnik celki.
 *
 * Funkcje pola niesie WYŁĄCZNIE sterownik pola (`ProtectionAssignment` z `bay_ref`, karta
 * OCHRONA-JEDNO-ZRODLO, ADR-022): kody funkcji, wejścia przekładników i macierz wyzwoleń.
 * Powiązanie obwodów wtórnych pola = przekładnik pola na wejściu sterownika albo aparat pola
 * w macierzy wyzwoleń.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Bay, BayPrimaryDevice, EnergyNetworkModel, ProtectionAssignment } from '../../../../../../types/enm';
import { polaSnStacji } from '../../../../../shared/polaStacji';
import {
  funkcjeWylaczajaceAparat,
  funkcjeZasilaneZAparatu,
  refAparatuWyzwalanego,
  sterownikPola,
} from '../../../../../shared/sterownikZabezpieczen';
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

/** Kody funkcji pola z SUROWEGO rekordu sterownika (`bay_ref` pola): funkcje `wlaczona !== false`
 *  w kolejności zapisu, kod raz — wyrocznia niezależna od akcesorów produktu. */
export function kodyPola(enm: EnergyNetworkModel, bayRef: string): string[] {
  const sterownik = (enm.protection_assignments ?? []).find((pa) => pa.bay_ref === bayRef);
  const kody: string[] = [];
  for (const f of sterownik?.funkcje ?? []) if (f.wlaczona !== false && !kody.includes(f.kod)) kody.push(f.kod);
  return kody;
}

/** Pole ma powiązanie obwodów wtórnych w modelu: aparat pola zasila wejście funkcji sterownika
 *  pola albo funkcja sterownika go wyłącza. */
export const zasilane =
  (enm: EnergyNetworkModel) =>
  (b: Bay): boolean => {
    const sterownik = sterownikPola(enm, b.ref_id);
    return (b.primary_devices ?? []).some(
      (d) =>
        funkcjeZasilaneZAparatu(sterownik, d.device_ref).length > 0 ||
        funkcjeWylaczajaceAparat(sterownik, refAparatuWyzwalanego(d)).length > 0,
    );
  };

export interface OpcjeFunkcjiPola {
  /** Sterownik bez powiązań obwodów wtórnych: wejścia bez przekładników, macierz pusta. */
  readonly bezPowiazan?: boolean;
}

/**
 * Funkcje sterownika pola `bayRef` podmienione na `kody` (model zmieniany w miejscu). Funkcja
 * o kodzie już obecnym zachowuje swój rekord (identyfikator i wiersz macierzy wyzwoleń); nowa —
 * rekord `<sterownik>-funkcja-<kod>` bez wyzwoleń. Pole bez sterownika dostaje sterownik bez
 * wejść i bez macierzy (kody pola bez wskazania łącznika wyłączanego).
 */
export function ustawFunkcjePola(
  enm: EnergyNetworkModel,
  bayRef: string,
  kody: readonly string[],
  opcje: OpcjeFunkcjiPola = {},
): ProtectionAssignment {
  let sterownik = (enm.protection_assignments ?? []).find((pa) => pa.bay_ref === bayRef);
  if (!sterownik) {
    const ref = `${bayRef}/sterownik`;
    sterownik = {
      id: `${ref}-id`,
      ref_id: ref,
      name: `Sterownik pola ${bayRef}`,
      tags: [],
      meta: {},
      bay_ref: bayRef,
      wejscia: {},
      funkcje: [],
      grupy_nastaw: [],
      aktywna_grupa: 1,
      macierz_wyzwolen: [],
      is_enabled: true,
    };
    enm.protection_assignments = [...(enm.protection_assignments ?? []), sterownik];
  }
  const wlasny = sterownik;
  const istniejace = new Map(wlasny.funkcje.filter((f) => f.wlaczona !== false).map((f) => [f.kod, f] as const));
  wlasny.funkcje = kody.map((kod) => istniejace.get(kod) ?? { ref: `${wlasny.ref_id}-funkcja-${kod}`, kod });
  const refy = new Set(wlasny.funkcje.map((f) => f.ref));
  wlasny.macierz_wyzwolen = (wlasny.macierz_wyzwolen ?? []).filter((w) => refy.has(w.funkcja_ref));
  if (opcje.bezPowiazan) {
    wlasny.wejscia = {};
    wlasny.macierz_wyzwolen = [];
  }
  return wlasny;
}

/** Pole GPZ fikstury: funkcje sterownika pola podmienione na `kody`; pozostałe pola bez zmian. */
export function poleGpz(
  baza: EnergyNetworkModel,
  wybor: (b: Bay) => boolean,
  kody: readonly string[],
  opcje: OpcjeFunkcjiPola = {},
): PrzypadekPola {
  const enm = kopia(baza);
  const bay = (enm.bays ?? []).find((b) => b.gpz_section_id && (b.primary_devices ?? []).length > 0 && wybor(b))!;
  ustawFunkcjePola(enm, bay.ref_id, kody, opcje);
  return { enm, bayRef: bay.ref_id };
}

/** Pole źródła OZE w GPZ (`macierz_scena_migawka`: pole źródła z wyłącznikiem, przekładnikami
 *  i symbolem źródła) — funkcje sterownika pola podmienione na `kody`. */
export function poleOzeGpz(kody: readonly string[]): PrzypadekPola {
  const enm = kopia(MACIERZ_OZE);
  const bay = [...(enm.bays ?? [])]
    .filter((b) => b.ref_id.endsWith('/der/source_field') && (b.primary_devices ?? []).length > 0)
    .sort((a, b) => a.ref_id.localeCompare(b.ref_id))[0];
  ustawFunkcjePola(enm, bay.ref_id, kody);
  return { enm, bayRef: bay.ref_id };
}

/** Pole toru transformatora GPZ: pole TR modelu (`bay_role` TR) z aparatami pola Z.10 (porty,
 *  oznaczenia, przekładniki), wskazujące pierwszy transformator GPZ (`equipment_refs`) — adapter
 *  rysuje je w wieży transformatora (`przypiszPolaTr`), nie w sekcji. Sterownik pola niesie
 *  `kody` bez wejść i bez macierzy wyzwoleń (aparaty pola mają nowe identyfikatory). */
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
    primary_devices: (wzor.primary_devices ?? []).map((d, i) => ({
      ...structuredClone(d),
      device_ref: `${ref}::dev::${i}`,
      linked_ref: null,
    })),
  };
  enm.bays = [...(enm.bays ?? []), pole];
  ustawFunkcjePola(enm, ref, kody);
  return { enm, bayRef: ref };
}

/** Celka katalogu wstrzyknięta do pierwszego pola SN pierwszej stacji sieci `sldSubstrate52s`
 *  (wzorzec W1c). Sterownik pola niesie `kody`; przy niepustych kodach i łączniku celki każda
 *  funkcja wyłącza ten łącznik (macierz wyzwoleń), a przekładnik celki jest wejściem prądowym. */
export function poleStacji(configRef: string, kody: readonly string[]): PrzypadekPola {
  const przypadek = buildW1cCases().find((c) => c.configId === `${configRef}::zamkniety`)!;
  const enm = kopia(BAZA_STACJI);
  const stacja = [...(enm.substations as unknown as { ref_id: string; station_type?: string }[])]
    .filter((s) => ['branch', 'inline', 'terminal'].includes(s.station_type ?? ''))
    .sort((a, b) => a.ref_id.localeCompare(b.ref_id))[0];
  const host = [...polaSnStacji(enm, stacja.ref_id)].sort((a, b) => a.ref_id.localeCompare(b.ref_id))[0] as Bay;
  host.primary_devices = przypadek.devices.map((d) => ({ ...d })) as BayPrimaryDevice[];
  host.config_id = przypadek.configId;
  const sterownik = ustawFunkcjePola(enm, host.ref_id, kody, { bezPowiazan: true });
  const wylacznik = host.primary_devices.find((d) => d.kind === 'CB' || d.kind === 'LOAD_SWITCH');
  const przekladnik = host.primary_devices.find((d) => d.kind === 'CT');
  if (kody.length > 0 && wylacznik) {
    sterownik.macierz_wyzwolen = sterownik.funkcje.map((f) => ({
      funkcja_ref: f.ref,
      aparat_refs: [refAparatuWyzwalanego(wylacznik)],
    }));
    sterownik.wejscia = { ct_ref: przekladnik?.device_ref ?? null };
  }
  return { enm, bayRef: host.ref_id };
}

/** Rodzaje aparatów pola będące przekładnikami (prądowy, napięciowy, Ferrantiego). */
export const RODZAJE_PRZEKLADNIKOW: ReadonlySet<string> = new Set(['CT', 'VT', 'CORE_BALANCE_CT']);

/**
 * Pole `bayRef` modelu bez przekładników: aparaty rodzaju z `RODZAJE_PRZEKLADNIKOW` zdjęte,
 * a tor zszyty — węzeł wyjścia zdjętego aparatu toru (`wy`) zastąpiony w portach pozostałych
 * aparatów węzłem jego wejścia (`we`), więc tor pola zostaje ciągły od szyny do odejścia.
 * Sterownik pola traci wejścia ze zdjętych przekładników. Zmienia model w miejscu.
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
  const zostaly = new Set(aparaty.map((d) => d.device_ref));
  const ref = (r: string | null | undefined): string | null => (r && zostaly.has(r) ? r : null);
  enm.protection_assignments = (enm.protection_assignments ?? []).map((a) =>
    a.bay_ref === bayRef
      ? {
          ...a,
          wejscia: {
            ...a.wejscia,
            ct_ref: ref(a.wejscia.ct_ref),
            vt_ref: ref(a.wejscia.vt_ref),
            i0_ct_ref: ref(a.wejscia.i0_ct_ref),
            u0_vt_ref: ref(a.wejscia.u0_vt_ref),
            ct_strony_2_refs: (a.wejscia.ct_strony_2_refs ?? []).filter((r) => zostaly.has(r)),
          },
        }
      : a,
  );
}

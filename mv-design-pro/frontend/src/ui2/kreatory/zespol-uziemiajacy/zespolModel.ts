/**
 * Model kreatora „Zespół uziemiający SN" (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA).
 *
 * Zapis = operacja domenowa `add_zespol_uziemiajacy_sn`; ładunek niesie WYŁĄCZNIE pola
 * czytane przez handler (`backend/src/enm/domain_operations_v2.py`): pozycje trzech
 * przestrzeni katalogu (Catalog Binding Rule), stany odłączników, nastawę dławika i opis
 * automatyki AWSC (dane projektu, nie tabliczki), SPZ i wyłączenie od transformatorów.
 * Reguły dopuszczalności (napięcie typu wobec sieci, zakres nastawy, uziemienie bezpośrednie
 * razem z elementem) rozstrzyga operacja próbą `dry_run` — ZERO fizyki i ZERO reguł w UI;
 * walidacja frontu sprawdza tylko kompletność formularza.
 */

import { normalizeCatalogBinding } from '../../../ui/network-build/forms/catalogPayload';
import { pasmoNapieciowe } from '../../model/pasmaNapieciowe';
import type { BladPola } from '../rama';

export type WariantZespolu = 'dlawik' | 'dlawik_rezystor' | 'rezystor' | 'bezposrednie';
export type StanOdlacznika = 'zamkniety' | 'otwarty';
export type StronaAwsc = 'pierwotna' | 'wtorna';

export interface ZespolFormData {
  readonly name: string;
  readonly wariant: WariantZespolu;
  readonly catalog_ref: string | null;
  readonly dlawik_catalog_ref: string | null;
  readonly dlawik_stan_odlacznika: StanOdlacznika;
  readonly dlawik_i_nastawy_a: number | null;
  readonly awsc: boolean;
  readonly awsc_i_wymuszany_a: number | null;
  readonly awsc_czas_zalaczenia_s: number | null;
  readonly awsc_czas_zwloki_s: number | null;
  readonly awsc_strona: StronaAwsc | null;
  readonly rezystor_catalog_ref: string | null;
  readonly rezystor_stan_odlacznika: StanOdlacznika;
  readonly spz: boolean;
  readonly wylaczenie_od_transformatorow_refs: readonly string[];
}

export const DANE_DOMYSLNE: ZespolFormData = {
  name: '',
  wariant: 'dlawik',
  catalog_ref: null,
  dlawik_catalog_ref: null,
  dlawik_stan_odlacznika: 'zamkniety',
  dlawik_i_nastawy_a: null,
  awsc: false,
  awsc_i_wymuszany_a: null,
  awsc_czas_zalaczenia_s: null,
  awsc_czas_zwloki_s: null,
  awsc_strona: null,
  rezystor_catalog_ref: null,
  rezystor_stan_odlacznika: 'zamkniety',
  spz: false,
  wylaczenie_od_transformatorow_refs: [],
};

export function maDlawik(wariant: WariantZespolu): boolean {
  return wariant === 'dlawik' || wariant === 'dlawik_rezystor';
}

export function maRezystor(wariant: WariantZespolu): boolean {
  return wariant === 'rezystor' || wariant === 'dlawik_rezystor';
}

/** Kompletność formularza (pozycje katalogu wymagane dla wybranego układu). */
export function walidujFormularz(data: ZespolFormData): BladPola[] {
  const bledy: BladPola[] = [];
  if (!data.catalog_ref?.trim()) {
    bledy.push({ pole: 'catalog_ref', komunikat: 'Wybierz typ transformatora uziemiającego z katalogu.' });
  }
  if (maDlawik(data.wariant) && !data.dlawik_catalog_ref?.trim()) {
    bledy.push({ pole: 'dlawik.catalog_ref', komunikat: 'Wybierz typ dławika gaszącego z katalogu.' });
  }
  if (maRezystor(data.wariant) && !data.rezystor_catalog_ref?.trim()) {
    bledy.push({ pole: 'rezystor.catalog_ref', komunikat: 'Wybierz typ rezystora uziemiającego z katalogu.' });
  }
  return bledy;
}

/** Miejsce zespołu: pole o roli ZU albo szyna SN (z kontekstu operacji albo selekcji). */
export interface KontekstZespolu {
  readonly bay_ref?: string;
  readonly bay_name?: string;
  readonly bus_ref?: string;
  readonly bus_name?: string;
}

export function maMiejsce(kontekst: KontekstZespolu): boolean {
  return Boolean(kontekst.bay_ref?.trim() || kontekst.bus_ref?.trim());
}

function liczba(v: number | null): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export function zbudujPayload(
  data: ZespolFormData,
  kontekst: KontekstZespolu,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    catalog_binding: normalizeCatalogBinding(data.catalog_ref, 'TRANSFORMATOR_UZIEMIAJACY'),
    uziemienie_bezposrednie: data.wariant === 'bezposrednie',
    spz: data.spz,
    wylaczenie_od_transformatorow_refs: [...data.wylaczenie_od_transformatorow_refs].sort(),
  };
  if (kontekst.bay_ref?.trim()) payload.bay_ref = kontekst.bay_ref.trim();
  else if (kontekst.bus_ref?.trim()) payload.bus_ref = kontekst.bus_ref.trim();
  if (data.name.trim()) payload.name = data.name.trim();
  if (maDlawik(data.wariant)) {
    const dlawik: Record<string, unknown> = {
      catalog_binding: normalizeCatalogBinding(data.dlawik_catalog_ref, 'DLAWIK_GASZACY'),
      stan_odlacznika: data.dlawik_stan_odlacznika,
    };
    const nastawa = liczba(data.dlawik_i_nastawy_a);
    if (nastawa !== undefined) dlawik.i_nastawy_a = nastawa;
    if (data.wariant === 'dlawik' && data.awsc) {
      const awsc: Record<string, unknown> = {};
      const prad = liczba(data.awsc_i_wymuszany_a);
      const czas = liczba(data.awsc_czas_zalaczenia_s);
      const zwloka = liczba(data.awsc_czas_zwloki_s);
      if (prad !== undefined) awsc.i_wymuszany_a = prad;
      if (czas !== undefined) awsc.czas_zalaczenia_s = czas;
      if (zwloka !== undefined) awsc.czas_zwloki_s = zwloka;
      if (data.awsc_strona) awsc.strona = data.awsc_strona;
      dlawik.awsc = awsc;
    }
    payload.dlawik = dlawik;
  }
  if (maRezystor(data.wariant)) {
    payload.rezystor = {
      catalog_binding: normalizeCatalogBinding(data.rezystor_catalog_ref, 'REZYSTOR_UZIEMIAJACY'),
      stan_odlacznika: data.rezystor_stan_odlacznika,
    };
  }
  return payload;
}

/** Transformator modelu do listy „wyłączenie od transformatorów WN/SN”. */
export interface TransformatorModelu {
  readonly ref_id: string;
  readonly name?: string | null;
  readonly hv_bus_ref: string;
  readonly lv_bus_ref: string;
}

export interface SzynaModelu {
  readonly ref_id: string;
  readonly voltage_kv?: number | null;
}

/** Transformatory WN/SN modelu (strona górna w paśmie WN, dolna w paśmie SN), po nazwie. */
export function transformatoryWnSn(
  transformatory: readonly TransformatorModelu[],
  szyny: readonly SzynaModelu[],
): readonly TransformatorModelu[] {
  const napiecia = new Map(szyny.map((s) => [s.ref_id, s.voltage_kv ?? null] as const));
  return transformatory
    .filter(
      (t) =>
        pasmoNapieciowe(napiecia.get(t.hv_bus_ref)) === 'WN'
        && pasmoNapieciowe(napiecia.get(t.lv_bus_ref)) === 'SN',
    )
    .slice()
    .sort((a, b) => (a.name ?? a.ref_id).localeCompare(b.name ?? b.ref_id, 'pl'));
}

export function fmtLiczba(v: number | null | undefined, jednostka: string, cyfry = 1): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(cyfry)} ${jednostka}` : '—';
}

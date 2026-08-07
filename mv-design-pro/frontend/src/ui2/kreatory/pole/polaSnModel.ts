/**
 * Model kreatora „Dodaj pole SN" (V12K-057, G-POLE).
 *
 * Pole rozdzielni SN = miejsce przyłączenia (linia/transformator/sprzęgło/pomiar/OZE)
 * z aparatem łączeniowym. Katalog-first (APARAT_SN). Zapis = operacja domenowa
 * `add_sn_bay` (kontrakt payloadu 1:1 z retirowanym AddSnBayForm).
 */

import { normalizeCatalogBinding } from '../../../ui/network-build/forms/catalogPayload';

export type RolaPola = 'IN' | 'OUT' | 'FEEDER' | 'TR' | 'COUPLER' | 'MEASUREMENT' | 'OZE';
export type RodzajAparatu = 'BREAKER' | 'DISCONNECTOR' | 'LOAD_SWITCH' | 'MEASUREMENT';

/**
 * Pomiar pola pomiarowego (kontrakt `docs/domain/POMIAR_ROZLICZENIOWY_SN_V1.md`
 * §5, V12K-335 pkt 2 + korekta właściciela V12K-336) — jeden wybór kreatora
 * mapowany na dwa realne pola payloadu `add_sn_bay`:
 *
 * - `NAPIECIA_SZYN` → `funkcja_pomiaru='NAPIECIA_SZYN'` — pole pomiaru
 *   napięcia szyn rozdzielni (przekładniki napięciowe sekcji); to NIE jest
 *   układ pomiarowy energii — wolne na każdej drodze;
 * - `PODSTAWOWY` / `REZERWOWY` / `ROWNOWAZNY` / `KONTROLNY` →
 *   `funkcja_pomiaru='UKLAD_ENERGII'` + `rodzaj_pomiaru=<wartość>` — układ
 *   pomiarowy energii elektrycznej (lista zamknięta ze standardu [E-UP] pkt 3,
 *   zgodna z IRiESD); każdy rodzaj podlega bramie pomiaru w torze tranzytu.
 *
 * Backend bez deklaracji przyjmuje pomiar napięcia szyn — kreator deklaruje
 * wybór ZAWSZE jawnie.
 */
export type WyborPomiaru =
  | 'NAPIECIA_SZYN'
  | 'PODSTAWOWY'
  | 'REZERWOWY'
  | 'ROWNOWAZNY'
  | 'KONTROLNY';

/** Rodzaj pola szablonu producenta (BayKind) — filtruje szablony pól. */
export type RodzajPolaSzablonu =
  | 'liniowe_doplywowe'
  | 'liniowe_odplywowe'
  | 'transformatorowe'
  | 'pomiarowe'
  | 'sprzeglowe_podluzne';

/** Rola pola → BayKind szablonu producenta (Reference Engine). */
export function bayKindZRoli(role: RolaPola): RodzajPolaSzablonu {
  switch (role) {
    case 'IN':
      return 'liniowe_doplywowe';
    case 'TR':
      return 'transformatorowe';
    case 'MEASUREMENT':
      return 'pomiarowe';
    case 'COUPLER':
      return 'sprzeglowe_podluzne';
    default:
      return 'liniowe_odplywowe'; // OUT / FEEDER / OZE
  }
}

export interface PolaSnFormData {
  bay_role: RolaPola;
  apparatus_kind: RodzajAparatu;
  /** Wybór pomiaru — znaczący wyłącznie dla roli MEASUREMENT (POMIAR-RODZAJ). */
  wybor_pomiaru: WyborPomiaru;
  catalog_ref: string | null;
  field_name: string;
  // V12K-058 (G-POLE-R): powiązanie z szablonem pola producenta (Reference Engine).
  switchgear_family_ref: string | null;
  bay_template_ref: string | null;
  manufacturer_ref: string | null;
}

export interface BladPola {
  field: string;
  message: string;
}

export interface KontekstPola {
  bus_ref?: string;
  station_ref?: string;
  station_label?: string;
  existing_field_ref?: string;
  gpz_section_id?: string;
}

export const DANE_DOMYSLNE: PolaSnFormData = {
  bay_role: 'OUT',
  apparatus_kind: 'BREAKER',
  // Spójnie z regułą domyślną backendu dla dokładanego pola (kontrakt §5):
  // status układu pomiarowego ENERGII wymaga świadomego wyboru projektanta,
  // nigdy domysłu — domyślnie pole pomiaru napięcia szyn rozdzielni.
  wybor_pomiaru: 'NAPIECIA_SZYN',
  catalog_ref: null,
  field_name: '',
  switchgear_family_ref: null,
  bay_template_ref: null,
  manufacturer_ref: null,
};

/**
 * Opcje roli/aparatu = KONTRAKT DANYCH (warstwa modelu): `value` to kanoniczny kod
 * operacji domenowej `add_sn_bay` (backend), `label` to polskie nazewnictwo UI.
 * Kody backendu (np. odpływowe/dopływowe/transformatorowe) NIE są terminologią UI —
 * do prezentacji służy wyłącznie `label`. (V12K-057 popr.: zakaz surowych kodów w UI.)
 */
export const ROLE_OPCJE: ReadonlyArray<{ value: RolaPola; label: string }> = [
  { value: 'OUT', label: 'Pole liniowe odpływowe' },
  { value: 'IN', label: 'Pole liniowe dopływowe' },
  { value: 'FEEDER', label: 'Pole liniowe / odgałęźne' },
  { value: 'TR', label: 'Pole transformatorowe' },
  { value: 'COUPLER', label: 'Pole sprzęgła sekcji' },
  { value: 'MEASUREMENT', label: 'Pole pomiarowe' },
  { value: 'OZE', label: 'Pole źródłowe (OZE/DER)' },
];

export const APARAT_OPCJE: ReadonlyArray<{ value: RodzajAparatu; label: string }> = [
  { value: 'BREAKER', label: 'Wyłącznik mocy' },
  { value: 'DISCONNECTOR', label: 'Odłącznik bezpiecznikowy' },
  { value: 'LOAD_SWITCH', label: 'Rozłącznik (LBS)' },
  { value: 'MEASUREMENT', label: 'Tor pomiarowy' },
];

export const WYBOR_POMIARU_OPCJE: ReadonlyArray<{ value: WyborPomiaru; label: string }> = [
  { value: 'NAPIECIA_SZYN', label: 'Pomiar napięcia szyn (przekładniki napięciowe sekcji)' },
  { value: 'PODSTAWOWY', label: 'Układ pomiarowy energii — rozliczeniowy podstawowy' },
  { value: 'REZERWOWY', label: 'Układ pomiarowy energii — rozliczeniowy rezerwowy' },
  { value: 'ROWNOWAZNY', label: 'Układ pomiarowy energii — rozliczeniowy równoważny' },
  { value: 'KONTROLNY', label: 'Układ pomiarowy energii — pomiarowo-kontrolny' },
];

const ROLE_LABEL = new Map<RolaPola, string>(ROLE_OPCJE.map((o) => [o.value, o.label]));
const APARAT_LABEL = new Map<RodzajAparatu, string>(APARAT_OPCJE.map((o) => [o.value, o.label]));
const WYBOR_POMIARU_LABEL = new Map<WyborPomiaru, string>(
  WYBOR_POMIARU_OPCJE.map((o) => [o.value, o.label]),
);

/** Polska nazwa roli pola (mapowanie totalne — nigdy nie pokazuje surowego kodu). */
export function rolaLabel(role: RolaPola): string {
  return ROLE_LABEL.get(role) ?? '';
}

/** Polska nazwa rodzaju aparatu (mapowanie totalne). */
export function aparatLabel(kind: RodzajAparatu): string {
  return APARAT_LABEL.get(kind) ?? '';
}

/** Polska nazwa wyboru pomiaru (mapowanie totalne). */
export function wyborPomiaruLabel(wybor: WyborPomiaru): string {
  return WYBOR_POMIARU_LABEL.get(wybor) ?? '';
}

export function maSzyne(kontekst: KontekstPola): boolean {
  return Boolean(kontekst.bus_ref?.trim() && kontekst.station_ref?.trim());
}

export function walidujFormularz(data: PolaSnFormData): BladPola[] {
  const errors: BladPola[] = [];
  if (!data.catalog_ref?.trim()) {
    errors.push({ field: 'catalog_ref', message: 'Wybierz aparat pola z katalogu SN.' });
  }
  return errors;
}

export function zbudujPayload(
  data: PolaSnFormData,
  kontekst: KontekstPola,
): Record<string, unknown> {
  return {
    bus_ref: kontekst.bus_ref?.trim(),
    station_ref: kontekst.station_ref?.trim(),
    existing_field_ref: kontekst.existing_field_ref?.trim() || undefined,
    bay_role: data.bay_role,
    // Pomiar WYŁĄCZNIE dla pola pomiarowego — na innej roli backend odrzuca
    // deklarację (`sn.pomiar_poza_polem_pomiarowym`). Kreator deklaruje jawnie
    // (zero fantomów — mapa na realne pola `add_sn_bay.funkcja_pomiaru` /
    // `add_sn_bay.rodzaj_pomiaru`; rodzaj układu wyłącznie dla układu energii).
    funkcja_pomiaru:
      data.bay_role === 'MEASUREMENT'
        ? data.wybor_pomiaru === 'NAPIECIA_SZYN'
          ? 'NAPIECIA_SZYN'
          : 'UKLAD_ENERGII'
        : undefined,
    rodzaj_pomiaru:
      data.bay_role === 'MEASUREMENT' && data.wybor_pomiaru !== 'NAPIECIA_SZYN'
        ? data.wybor_pomiaru
        : undefined,
    field_name: data.field_name.trim() || undefined,
    apparatus_kind: data.apparatus_kind,
    gpz_section_id: kontekst.gpz_section_id?.trim() || undefined,
    catalog_binding: normalizeCatalogBinding(data.catalog_ref, 'APARAT_SN') ?? undefined,
    // Powiązanie z szablonem producenta (Reference Engine) — addytywnie (exclude_none).
    switchgear_family_ref: data.switchgear_family_ref?.trim() || undefined,
    bay_template_ref: data.bay_template_ref?.trim() || undefined,
    manufacturer_ref: data.manufacturer_ref?.trim() || undefined,
  };
}

/** Kompletność powiązania producenckiego (szablon pola). */
export function maSzablonProducenta(data: PolaSnFormData): boolean {
  return Boolean(data.bay_template_ref?.trim());
}

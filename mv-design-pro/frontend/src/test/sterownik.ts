/**
 * Karta OCHRONA-JEDNO-ZRODLO — JEDEN helper testowy budujący sterownik zabezpieczeń pola
 * (`ProtectionAssignment`, jedyna struktura zabezpieczeń modelu) w kształcie, jaki serializuje
 * backend (`enm.models.ProtectionAssignment`): funkcje z rejestru (`ref` = kod; drugi stopień tego
 * samego kodu `<kod>-2`), nastawy w grupie 1, macierz wyzwoleń funkcji zabezpieczeniowych na
 * podany wyłącznik. Testy podają wyłącznie cechy istotne dla przypadku.
 */
import type { NastawaFunkcji, ProtectionAssignment, WejsciaZabezpieczenia } from '../types/enm';
import { funkcjaEaz } from '../ui/shared/funkcjeEaz';

export interface SterownikTestowy {
  readonly ref?: string;
  readonly bayRef?: string | null;
  readonly kody?: readonly string[];
  readonly wylaczone?: readonly string[];
  readonly wylacznik?: string | null;
  readonly wejscia?: WejsciaZabezpieczenia;
  readonly nastawy?: Readonly<Record<string, Readonly<Record<string, number | string | boolean>>>>;
  readonly grupa?: number;
  readonly aktywnaGrupa?: number;
  readonly catalogRef?: string | null;
  readonly nazwa?: string;
  readonly isEnabled?: boolean;
}

function refyFunkcji(kody: readonly string[]): string[] {
  const licznik = new Map<string, number>();
  return kody.map((kod) => {
    const n = (licznik.get(kod) ?? 0) + 1;
    licznik.set(kod, n);
    return n === 1 ? kod : `${kod}-${n}`;
  });
}

export function sterownikTestowy(dane: SterownikTestowy = {}): ProtectionAssignment {
  const kody = dane.kody ?? [];
  const refy = refyFunkcji(kody);
  const ref = dane.ref ?? (dane.bayRef ? `${dane.bayRef}/sterownik` : 'prot/01');
  const wylaczone = new Set(dane.wylaczone ?? []);
  const grupa = dane.grupa ?? 1;
  const wpisy = refy
    .filter((r) => dane.nastawy?.[r])
    .map((r) => ({
      funkcja_ref: r,
      nastawy: Object.entries(dane.nastawy?.[r] ?? {})
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([klucz, wartosc]): NastawaFunkcji => ({ klucz, wartosc, pochodzenie: 'PROJEKTANT' })),
    }));
  return {
    id: ref,
    ref_id: ref,
    name: dane.nazwa ?? 'Zabezpieczenie pola',
    tags: [],
    meta: {},
    bay_ref: dane.bayRef ?? null,
    catalog_ref: dane.catalogRef ?? null,
    wejscia: { ...(dane.wejscia ?? {}) },
    funkcje: refy.map((r, i) => ({ ref: r, kod: kody[i], wlaczona: !wylaczone.has(r) })),
    grupy_nastaw: wpisy.length > 0 ? [{ numer: grupa, funkcje: wpisy }] : [],
    aktywna_grupa: dane.aktywnaGrupa ?? grupa,
    macierz_wyzwolen: dane.wylacznik
      ? refy
          .filter((_, i) => funkcjaEaz(kody[i])?.rodzaj === 'ZABEZPIECZENIE')
          .map((r) => ({ funkcja_ref: r, aparat_refs: [dane.wylacznik as string], pobudza_spz: false }))
      : [],
    is_enabled: dane.isEnabled ?? true,
  };
}

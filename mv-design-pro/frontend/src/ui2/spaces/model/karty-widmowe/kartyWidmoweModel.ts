/**
 * Karty widmowe urządzeń w modelu — model panelu „Karty widmowe" przestrzeni Model sieci.
 *
 * Moduł CZYSTY (zero DOM, zero fizyki). Łańcuch danych karty AB-H0 §0.7:
 * karta widmowa (rekord `KartaWidmowa`, widmo prądowe/admitancja urządzenia) żyje w katalogu
 * statycznym (z dokumentem producenta, `GET /api/catalog/karty-widmowe`) albo w katalogu
 * PROJEKTU modelu (`katalog_projektu.karty_widmowe` — dane inżyniera, operacja
 * `dodaj_karte_widmowa_projektu`). Generator wiąże karty TYPU, który wskazuje (`urzadzenie_ref
 * == catalog_ref`), operacją `set_der_catalog_bindings` z kluczem `karty_widmowe_ref`; backend
 * materializuje modele z proweniencją w `Generator.modele_widmowe`.
 *
 * Panel nie ocenia kart: kontrakt rekordu, status danych inżyniera, istnienie typu, kolizje
 * identyfikatorów i zgodność typu sprawdza backend i zwraca zdanie odmowy. Front rozstrzyga
 * wyłącznie, KTÓRE karty pokazać przy generatorze (ten sam predykat co backend:
 * `urzadzenie_ref == catalog_ref`), żeby lista wyboru nie podsuwała kart, których backend
 * i tak nie przyjmie.
 */
import type { EnergyNetworkModel, Generator, KartaWidmowa } from '../../../../types/enm';

export type PrzestrzenKarty = 'STATYCZNA' | 'PROJEKT';

export interface KartaWModelu {
  readonly karta: KartaWidmowa;
  readonly przestrzen: PrzestrzenKarty;
}

/** Karty widoczne w katalogu modelu: statyczne + projektu, deterministycznie po `id`. */
export function kartyKataloguModelu(
  statyczne: readonly KartaWidmowa[],
  snapshot: EnergyNetworkModel | null,
): KartaWModelu[] {
  const projektu = snapshot?.katalog_projektu?.karty_widmowe ?? [];
  return [
    ...statyczne.map((karta) => ({ karta, przestrzen: 'STATYCZNA' as const })),
    ...projektu.map((karta) => ({ karta, przestrzen: 'PROJEKT' as const })),
  ].sort((a, b) => a.karta.id.localeCompare(b.karta.id));
}

export interface GeneratorKart {
  readonly generator: Generator;
  /** Karty typu generatora z katalogu modelu (jedyne, które backend przyjmie). */
  readonly dostepne: readonly KartaWModelu[];
  /** Id kart zmaterializowanych dziś w generatorze (proweniencja `modele_widmowe.zrodla`). */
  readonly przypisane: readonly string[];
}

/**
 * Generatory z typem katalogowym (`catalog_ref`) — tylko one mogą nieść karty widmowe
 * (karta należy do typu urządzenia). Generator bez typu nie ma czego wiązać.
 */
export function generatoryKart(
  snapshot: EnergyNetworkModel | null,
  karty: readonly KartaWModelu[],
): GeneratorKart[] {
  return (snapshot?.generators ?? [])
    .filter((g) => Boolean(g.catalog_ref))
    .map((generator) => ({
      generator,
      dostepne: karty.filter((k) => k.karta.urzadzenie_ref === generator.catalog_ref),
      przypisane: [...(generator.modele_widmowe?.zrodla ?? []).map((z) => z.karta_id)].sort(),
    }))
    .sort((a, b) => a.generator.ref_id.localeCompare(b.generator.ref_id));
}

/** Ładunek `set_der_catalog_bindings` — pusta lista = jawne odwiązanie (`null`). */
export function payloadPrzypisaniaKart(
  generatorRef: string,
  wybrane: readonly string[],
): Record<string, unknown> {
  return {
    generator_ref: generatorRef,
    karty_widmowe_ref: wybrane.length > 0 ? [...wybrane].sort() : null,
  };
}

export type OdczytKarty =
  | { readonly ok: true; readonly karta: Record<string, unknown> }
  | { readonly ok: false; readonly powodPl: string };

/**
 * Plik karty (JSON rekordu `KartaWidmowa`) → ładunek operacji. Front sprawdza wyłącznie,
 * że plik jest obiektem JSON; treść karty ocenia backend (kontrakt rekordu i reguły katalogu).
 */
export function odczytajKarteZPliku(tekst: string): OdczytKarty {
  let dane: unknown;
  try {
    dane = JSON.parse(tekst);
  } catch {
    return { ok: false, powodPl: 'Plik nie jest poprawnym dokumentem JSON karty widmowej.' };
  }
  if (!dane || typeof dane !== 'object' || Array.isArray(dane)) {
    return {
      ok: false,
      powodPl: 'Plik musi zawierać JEDEN rekord karty widmowej (obiekt JSON), nie listę ani wartość prostą.',
    };
  }
  return { ok: true, karta: dane as Record<string, unknown> };
}

export const PRZESTRZEN_KARTY_PL: Readonly<Record<PrzestrzenKarty, string>> = {
  STATYCZNA: 'katalog producentów',
  PROJEKT: 'karta projektu',
};

/** Statusy weryfikacji karty słowami (zbiór zamknięty kontraktu `KartaWidmowa`). */
export const STATUS_WERYFIKACJI_KARTY_PL: Readonly<Record<KartaWidmowa['verification_status'], string>> = {
  ZWERYFIKOWANY: 'zweryfikowana',
  NIEWERYFIKOWANY: 'niezweryfikowana (dane inżyniera)',
  CZESCIOWO_ZWERYFIKOWANY: 'częściowo zweryfikowana',
  REFERENCYJNY: 'referencyjna',
};

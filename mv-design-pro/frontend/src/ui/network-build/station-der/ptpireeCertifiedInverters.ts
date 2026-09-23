/**
 * Rejestr certyfikowanych urządzeń PTPiREE (wykaz WiPWC) — WYŁĄCZNIE z backendu.
 *
 * JEDNA PRAWDA WYKAZU. Wykaz żyje w backendzie jeden raz
 * (`network_model/catalog/ptpiree_wykaz_snapshot.json`, `mv_ptpiree_catalog.py`) i jest
 * wystawiany końcówkami `GET /api/catalog/ptpiree/manifest` (źródła: wersje WiPWC, daty
 * publikacji, liczności) oraz `GET /api/catalog/ptpiree/generator-certificates` (rekordy).
 * Dawna druga kopia we froncie (artefakt generowany z PDF-ów, ~5 MB, druga projekcja
 * generatora wykazu), trzecia — ręczna lista czternastu rekordów o identyfikatorach niezgodnych
 * z backendem — i stałe źródeł z liczbami wpisanymi z ręki (suma „9077 pozycji źródłowych",
 * nieodpowiadająca artefaktowi) zostały USUNIĘTE (karta AB-1a Pakiet D1, plan AB O-17).
 *
 * To nie jest karta katalogowa urządzenia. Wykaz PTPiREE potwierdza wpis certyfikatu
 * NC RfG/WOS w procesie przyłączeniowym, ale nie zastępuje danych wykonawczych: Un, Sn, Ik,
 * modelu dynamicznego, przekładników ani nastaw. Status certyfikatu urządzenia w modelu
 * wyprowadza backend (`annotate_with_ptpiree_status`, relacja równości na znormalizowanych
 * kluczach) — ten moduł niczego nie dopasowuje, tylko pokazuje wykaz.
 *
 * Kształt rekordów = odpowiedź API (`snake_case`), bez przepisywania nazw pól. Stan zapytania
 * jest JAWNY (`ladowanie` / `blad` / `gotowy`): brak odpowiedzi backendu to „rejestr
 * niedostępny", NIGDY pusta lista udająca „brak certyfikatów".
 */

import { useMemo } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

// =============================================================================
// Kontrakt API (lustro `backend/src/api/catalog.py` + `mv_ptpiree_catalog.py`)
// =============================================================================

export const PTPIREE_MANIFEST_URL = '/api/catalog/ptpiree/manifest';
export const PTPIREE_CERTYFIKATY_URL = '/api/catalog/ptpiree/generator-certificates';

/**
 * Rekord wykazu — 1:1 `network_model/catalog/types.py::PtpireeGeneratorCertificate.to_dict()`.
 * `ppm_scope` to typy modułów po przecinku (np. „A,B"); `wos_version` bywa puste (wykaz 1.2 nie
 * podaje wersji WOS — backend jej nie zgaduje); `verification_note` (warunek ważności
 * certyfikatu z wiersza wykazu) występuje tylko wtedy, gdy wiersz go niesie.
 */
export interface PtpireeCertifiedInverterItem {
  readonly id: string;
  readonly name: string;
  readonly manufacturer: string;
  readonly model: string;
  readonly device_type: string;
  readonly document_number: string;
  readonly document_acceptance_date: string;
  readonly wos_version: string;
  readonly wipwc_version: string;
  readonly ppm_scope: string;
  readonly firmware_version: string | null;
  readonly source_url: string;
  readonly publication_date: string | null;
  readonly accepted_from: string | null;
  readonly manufacturer_key: string;
  readonly model_key: string;
  readonly verification_status: string;
  readonly source_reference: string;
  readonly catalog_status: string;
  readonly contract_version: string;
  readonly verification_note?: string;
}

/** Źródło wykazu — 1:1 `get_ptpiree_catalog_manifest()["sources"][i]`. */
export interface PtpireeManifestSource {
  readonly source_id: string;
  readonly wipwc_version: string;
  readonly source_url: string;
  readonly publication_date: string;
  readonly record_count: number;
}

/** Manifest wykazu — 1:1 `mv_ptpiree_catalog.get_ptpiree_catalog_manifest()`. */
export interface PtpireeManifest {
  readonly source: string;
  readonly source_page_url: string;
  readonly current_wipwc_version: string;
  readonly publication_date: string;
  readonly accepted_from: string;
  readonly record_count: number;
  readonly sources: readonly PtpireeManifestSource[];
  readonly update_policy: string;
  readonly integration_policy: string;
}

/** Wykaz gotowy do użycia: manifest źródeł i pełna lista rekordów. */
export interface RejestrPtpiree {
  readonly manifest: PtpireeManifest;
  readonly rejestr: readonly PtpireeCertifiedInverterItem[];
}

/** Jawny stan zapytania — konsument MUSI obsłużyć ładowanie i błąd (brak cichej pustej listy). */
export type StanRejestruPtpiree<T> =
  | { readonly stan: 'ladowanie' }
  | { readonly stan: 'blad'; readonly komunikat: string }
  | { readonly stan: 'gotowy'; readonly dane: T };

async function pobierzJson(url: string): Promise<unknown> {
  const odpowiedz = await fetch(url);
  if (!odpowiedz.ok) {
    throw new Error(
      `Rejestr PTPiREE niedostępny: ${url} → HTTP ${odpowiedz.status} ${odpowiedz.statusText}`.trim(),
    );
  }
  return odpowiedz.json();
}

function jestObiektem(wartosc: unknown): wartosc is Record<string, unknown> {
  return typeof wartosc === 'object' && wartosc !== null && !Array.isArray(wartosc);
}

/**
 * Manifest wykazu. Odpowiedź spoza kontraktu (brak liczności albo listy źródeł) jest BŁĘDEM —
 * nie „pustym wykazem".
 */
export async function fetchPtpireeManifest(): Promise<PtpireeManifest> {
  const dane = await pobierzJson(PTPIREE_MANIFEST_URL);
  if (!jestObiektem(dane) || typeof dane.record_count !== 'number' || !Array.isArray(dane.sources)) {
    throw new Error('Rejestr PTPiREE niedostępny: manifest wykazu ma kształt spoza kontraktu API.');
  }
  return dane as unknown as PtpireeManifest;
}

/**
 * Pełna lista rekordów wykazu. Odpowiedź niebędąca listą rekordów jest BŁĘDEM, nie pustym
 * wykazem. Front zawęża listę lokalnie (`filterPtpireeCertifiedInverters`) — parametr `?search=`
 * końcówki backendu służy klientom API, interfejs go nie używa.
 */
export async function fetchPtpireeCertifiedInverters(): Promise<
  readonly PtpireeCertifiedInverterItem[]
> {
  const dane = await pobierzJson(PTPIREE_CERTYFIKATY_URL);
  if (!Array.isArray(dane) || !dane.every((rekord) => jestObiektem(rekord) && typeof rekord.id === 'string')) {
    throw new Error('Rejestr PTPiREE niedostępny: lista certyfikatów ma kształt spoza kontraktu API.');
  }
  return dane as unknown as readonly PtpireeCertifiedInverterItem[];
}

// =============================================================================
// Hooki (React Query — ten sam wzorzec co `derRemoteCatalogs.ts`)
// =============================================================================

/** JEDNA definicja zapytania o manifest — wspólna dla obu hooków (ten sam klucz pamięci). */
const ZAPYTANIE_MANIFESTU = {
  queryKey: ['catalog', 'ptpiree', 'manifest'],
  queryFn: fetchPtpireeManifest,
  staleTime: Infinity,
  gcTime: 60 * 60_000,
} as const;

function stanZapytania<T>(zapytanie: UseQueryResult<T, Error>): StanRejestruPtpiree<T> {
  if (zapytanie.isError) return { stan: 'blad', komunikat: zapytanie.error.message };
  if (zapytanie.data === undefined) return { stan: 'ladowanie' };
  return { stan: 'gotowy', dane: zapytanie.data };
}

/** Manifest wykazu (źródła, daty, liczności) — bez pobierania rekordów. */
export function usePtpireeManifest(): StanRejestruPtpiree<PtpireeManifest> {
  return stanZapytania(useQuery(ZAPYTANIE_MANIFESTU));
}

/**
 * Wykaz certyfikowanych urządzeń PTPiREE: manifest + pełna lista rekordów (potrzebna do odczytu
 * pozycji po identyfikatorze `ptpiree_certificate_ref` z modelu i do filtra lokalnego). Wynik
 * jest stabilny między renderami, dopóki odpowiedzi się nie zmienią.
 */
export function usePtpireeCertifiedInverters(): StanRejestruPtpiree<RejestrPtpiree> {
  const manifest = useQuery(ZAPYTANIE_MANIFESTU);
  const rekordy = useQuery({
    queryKey: ['catalog', 'ptpiree', 'generator-certificates'],
    queryFn: fetchPtpireeCertifiedInverters,
    staleTime: Infinity,
    gcTime: 60 * 60_000,
  });
  const stanManifestu = stanZapytania(manifest);
  const stanRekordow = stanZapytania(rekordy);
  const dane = useMemo<RejestrPtpiree | null>(
    () =>
      manifest.data !== undefined && rekordy.data !== undefined
        ? { manifest: manifest.data, rejestr: rekordy.data }
        : null,
    [manifest.data, rekordy.data],
  );
  if (stanManifestu.stan === 'blad') return stanManifestu;
  if (stanRekordow.stan === 'blad') return stanRekordow;
  if (dane === null) return { stan: 'ladowanie' };
  return { stan: 'gotowy', dane };
}

// =============================================================================
// Funkcje czyste na rejestrze podanym przez wołającego (z hooka)
// =============================================================================

export function getPtpireeCertifiedInverter(
  id: string | null | undefined,
  registry: readonly PtpireeCertifiedInverterItem[],
): PtpireeCertifiedInverterItem | null {
  if (!id) return null;
  return registry.find((item) => item.id === id) ?? null;
}

/**
 * Etykieta pozycji wykazu. `null` = urządzenie w modelu nie ma powiązania z wykazem — tekst
 * mówi to wprost (dawny tekst „certyfikat PTPiREE z pakietu katalogowego" sugerował
 * certyfikat, którego model nie niesie).
 */
export function formatPtpireeCertificateLabel(
  item: PtpireeCertifiedInverterItem | null,
): string {
  if (!item) return 'brak powiązania z wykazem PTPiREE';
  return `${item.manufacturer} ${item.model} (${item.document_number})`;
}

export function filterPtpireeCertifiedInverters(
  query: string,
  registry: readonly PtpireeCertifiedInverterItem[],
): readonly PtpireeCertifiedInverterItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return registry;
  const compactQuery = normalized.replace(/[^a-z0-9]+/g, '');
  return registry.filter((item) => {
    const haystack = [
      item.manufacturer,
      item.model,
      item.document_number,
      item.device_type,
      item.wipwc_version,
      item.wos_version,
      item.ppm_scope,
      item.verification_note ?? '',
    ].join(' ').toLowerCase();
    const compactHaystack = haystack.replace(/[^a-z0-9]+/g, '');
    return haystack.includes(normalized) || compactHaystack.includes(compactQuery);
  });
}

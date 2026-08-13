/**
 * K5-B (H-2) — wykonawca nastaw E-28: persystencja urządzeń koordynacji
 * na POZIOMIE PRZYPADKU (Case = parametry obliczeń, Core Rule #4).
 *
 * Kanał zapisu: PUT /api/study-cases/{id}/protection-config →
 * `ProtectionConfig.overrides` (łańcuch: api/study_cases.py →
 * application/study_case/service.py → domain/study_case.py). Zapis do ENM
 * `protection_assignments` pozostaje ZABLOKOWANY (kanon V11:
 * relay.legacy_write_disabled) — dlatego nastawy żyją w konfiguracji przypadku.
 *
 * KSZTAŁT: `overrides` kluczowane per urządzenie — klucz
 * `coordination_device:<id urządzenia>`, wartość = pełny ProtectionDevice.
 * Prefiks izoluje wpisy koordynacji od nadpisań pól szablonu (P14c), które
 * czyta `ProtectionAnalysisService` po NAZWACH pól szablonu („I>", „TMS", …)
 * — klucz z prefiksem nigdy nie koliduje z nazwą pola, więc oba konsumenci
 * współdzielą jeden słownik bez wzajemnego psucia danych.
 */

import type {
  ProtectionConfig,
  UpdateProtectionConfigRequest,
} from '../study-cases/api';
import { getProtectionConfig, updateProtectionConfig } from '../study-cases/api';
import type { DeviceType, ProtectionDevice } from './types';

export const PREFIKS_URZADZENIA_KOORDYNACJI = 'coordination_device:';

const RODZAJE_URZADZEN: ReadonlySet<string> = new Set([
  'RELAY',
  'FUSE',
  'RECLOSER',
  'CIRCUIT_BREAKER',
]);

function jestRekordem(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Walidacja kształtu wpisu — wpis uszkodzony (ręczna edycja, rozjazd wersji)
 * jest POMIJANY zamiast wywracać stronę; strata jest jawna po stronie listy
 * (urządzenia po prostu nie ma), nigdy cicha podmiana na wartość zastępczą.
 */
function jestUrzadzeniem(value: unknown): value is ProtectionDevice {
  if (!jestRekordem(value)) return false;
  return (
    typeof value.id === 'string'
    && value.id.length > 0
    && typeof value.name === 'string'
    && typeof value.device_type === 'string'
    && RODZAJE_URZADZEN.has(value.device_type as DeviceType)
    && typeof value.location_element_id === 'string'
    && jestRekordem(value.settings)
    && jestRekordem((value.settings as Record<string, unknown>).stage_51)
  );
}

/** Odczyt: wpisy `coordination_device:*` → lista urządzeń (deterministycznie po kluczu). */
export function urzadzeniaZOverrides(
  overrides: Record<string, unknown> | null | undefined,
): ProtectionDevice[] {
  if (!jestRekordem(overrides)) return [];
  return Object.keys(overrides)
    .filter((klucz) => klucz.startsWith(PREFIKS_URZADZENIA_KOORDYNACJI))
    .sort()
    .map((klucz) => overrides[klucz])
    .filter(jestUrzadzeniem);
}

/**
 * Zapis: podmienia WYŁĄCZNIE wpisy koordynacji, zachowując obce klucze
 * (nadpisania pól szablonu P14c) — PUT wysyła pełny słownik, więc bez scalenia
 * jeden ekran kasowałby dane drugiego.
 */
export function overridesZUrzadzeniami(
  biezaceOverrides: Record<string, unknown> | null | undefined,
  urzadzenia: readonly ProtectionDevice[],
): Record<string, unknown> {
  const scalone: Record<string, unknown> = {};
  if (jestRekordem(biezaceOverrides)) {
    for (const [klucz, wartosc] of Object.entries(biezaceOverrides)) {
      if (!klucz.startsWith(PREFIKS_URZADZENIA_KOORDYNACJI)) {
        scalone[klucz] = wartosc;
      }
    }
  }
  for (const urzadzenie of urzadzenia) {
    scalone[`${PREFIKS_URZADZENIA_KOORDYNACJI}${urzadzenie.id}`] = urzadzenie;
  }
  return scalone;
}

/** Hydratacja przy wejściu na stronę: GET konfiguracji + rozpakowanie urządzeń. */
export async function wczytajUrzadzeniaKoordynacji(caseId: string): Promise<{
  konfiguracja: ProtectionConfig;
  urzadzenia: ProtectionDevice[];
}> {
  const konfiguracja = await getProtectionConfig(caseId);
  return { konfiguracja, urzadzenia: urzadzeniaZOverrides(konfiguracja.overrides) };
}

/**
 * Zapis pełnego zestawu urządzeń do konfiguracji przypadku. Pola szablonu
 * (template_ref/fingerprint/manifest) idą 1:1 z ostatniej znanej konfiguracji
 * — PUT nadpisuje cały ProtectionConfig, więc ich pominięcie by je skasowało.
 */
export async function zapiszUrzadzeniaKoordynacji(
  caseId: string,
  urzadzenia: readonly ProtectionDevice[],
  ostatniaKonfiguracja: ProtectionConfig | null,
): Promise<ProtectionConfig> {
  const zadanie: UpdateProtectionConfigRequest = {
    template_ref: ostatniaKonfiguracja?.template_ref ?? null,
    template_fingerprint: ostatniaKonfiguracja?.template_fingerprint ?? null,
    library_manifest_ref: ostatniaKonfiguracja?.library_manifest_ref ?? null,
    overrides: overridesZUrzadzeniami(ostatniaKonfiguracja?.overrides, urzadzenia),
  };
  return updateProtectionConfig(caseId, zadanie);
}

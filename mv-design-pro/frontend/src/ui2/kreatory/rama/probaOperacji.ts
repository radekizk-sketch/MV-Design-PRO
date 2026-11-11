/**
 * Kontrola przed zapisem — PRÓBA tej samej operacji domenowej (`dry_run`), którą wykona zapis.
 *
 * Po co: kreatory liczyły we froncie własną kopię reguł backendu (zgodność napięcia tabliczki
 * z szyną: generator |U_r − U_n| > 1,0 kV, bateria > 0,5 kV, ogranicznik U_m < U_n). Dwa
 * niezależne predykaty „dziś zgodne” to defekt oczekujący na dane brzegowe, a próg liczony
 * w UI to ocena bez wyjaśnienia (kontrakt werdyktu). Teraz regułę ma WYŁĄCZNIE operacja;
 * kreator pyta ją próbą i pokazuje JEJ werdykt i JEJ komunikat — zero progów w UI.
 *
 * Stany (uczciwe, rozłączne):
 * - `sprawdzanie` — próba w toku (≠ przyjęta),
 * - `przyjeta` — operacja przeszła całą walidację backendu, model bez zmian,
 * - `odrzucona` — operacja odmówiła (odmowa w odpowiedzi albo odrzucenie 4xx bramy) —
 *   komunikat backendu bez tłumaczenia,
 * - `nieustalona` — nie udało się zapytać (sieć, 5xx) — brak werdyktu ≠ przyjęta.
 */

import { useEffect, useState } from 'react';

import { executeDomainOpPreview } from '../../../ui/topology/domainApi';

export type StanProbyOperacji =
  | { readonly stan: 'sprawdzanie' }
  | { readonly stan: 'przyjeta' }
  | { readonly stan: 'odrzucona'; readonly komunikat: string; readonly kod: string | null }
  | { readonly stan: 'nieustalona'; readonly komunikat: string };

/** Opóźnienie próby po ostatniej zmianie ładunku (ms) — pisanie nie wysyła próby na znak. */
export const ZWLOKA_PROBY_MS = 300;

function statusBledu(blad: unknown): number | null {
  if (blad && typeof blad === 'object' && 'status' in blad) {
    const status = (blad as { status: unknown }).status;
    return typeof status === 'number' ? status : null;
  }
  return null;
}

function kodBledu(blad: unknown): string | null {
  if (blad && typeof blad === 'object' && 'code' in blad) {
    const kod = (blad as { code: unknown }).code;
    return typeof kod === 'string' && kod ? kod : null;
  }
  return null;
}

/**
 * Werdykt próby operacji dla bieżącego ładunku; `null` = nie sprawdzano (brak przypadku albo
 * ładunku — formularz jeszcze nie jest kompletny lokalnie). Ładunek porównywany jako TEKST:
 * nowy obiekt o tej samej treści nie wysyła nowej próby.
 */
export function useProbaOperacji(
  caseId: string | null,
  operacja: string,
  ladunek: Record<string, unknown> | null,
): StanProbyOperacji | null {
  const tekst = ladunek ? JSON.stringify(ladunek) : null;
  const [stan, setStan] = useState<StanProbyOperacji | null>(null);

  useEffect(() => {
    if (!caseId || tekst === null) {
      setStan(null);
      return undefined;
    }
    const kontroler = new AbortController();
    setStan({ stan: 'sprawdzanie' });
    const zwloka = setTimeout(() => {
      executeDomainOpPreview(caseId, operacja, JSON.parse(tekst) as Record<string, unknown>, {
        signal: kontroler.signal,
      })
        .then((odpowiedz) => {
          if (kontroler.signal.aborted) return;
          setStan(
            odpowiedz.error
              ? { stan: 'odrzucona', komunikat: odpowiedz.error, kod: odpowiedz.error_code ?? null }
              : { stan: 'przyjeta' },
          );
        })
        .catch((blad: unknown) => {
          if (kontroler.signal.aborted) return;
          const status = statusBledu(blad);
          const komunikat = blad instanceof Error ? blad.message : String(blad);
          setStan(
            status !== null && status >= 400 && status < 500
              ? { stan: 'odrzucona', komunikat, kod: kodBledu(blad) }
              : { stan: 'nieustalona', komunikat },
          );
        });
    }, ZWLOKA_PROBY_MS);
    return () => {
      clearTimeout(zwloka);
      kontroler.abort();
    };
  }, [caseId, operacja, tekst]);

  return stan;
}

/*
 * Klient API okna „Zgodność powykonawcza" (karta U4 P45 / scalenie #20). Typy TS
 * odwzorowują 1:1 kształt żądania i odpowiedzi końcówki:
 *
 *   POST /api/quality/as-built-compliance
 *     `backend/src/api/quality_analysis_runs.py` (model `ZgodnoscZadanie`,
 *     `post_as_built_compliance`) →
 *     `application/analyses/zgodnosc_powykonawcza.py::build_zgodnosc_powykonawcza_view`.
 *
 * Jedyna końcówka rodziny „jakość" z ciałem żądania (POST) — uzasadnione
 * rozmiarem danych pomiarowych (lista pomiarów lub tekst CSV). Warstwa
 * PREZENTACJI: klient tylko wysyła pomiary i odbiera gotowy raport; niczego nie
 * liczy (ZERO fizyki). Pola pozostają w snake_case, bo to kontrakt API.
 * Klient błędów: `getJsonZDetalem` (wzór `ui2/oze/api.ts`), tu wariant POST.
 */

// ---------------------------------------------------------------------------
// Żądanie (body POST) — model `ZgodnoscZadanie`
// ---------------------------------------------------------------------------

/** Dozwolone wielkości pomiarowe (symbole zgodne z backendem). */
export type WielkoscPomiaru = 'U' | 'P' | 'Q';

/** Pojedynczy pomiar z obiektu (model `PomiarWejscie`). */
export interface PomiarWejscie {
  readonly element_ref: string;
  readonly wielkosc: WielkoscPomiaru;
  readonly wartosc: number;
  readonly jednostka: string;
}

/** Jawne tolerancje odbioru [%] (model `TolerancjeWejscie`; No-Heuristics). */
export interface TolerancjeWejscie {
  readonly napiecie_pct?: number | null;
  readonly moc_pct?: number | null;
}

/** Żądanie raportu zgodności powykonawczej (model `ZgodnoscZadanie`). */
export interface ZgodnoscZadanie {
  readonly run_id: string;
  readonly pomiary?: readonly PomiarWejscie[];
  readonly csv?: string;
  readonly tolerancje?: TolerancjeWejscie;
}

// ---------------------------------------------------------------------------
// Odpowiedź — `build_zgodnosc_powykonawcza_view`
// ---------------------------------------------------------------------------

/** Pojedynczy wiersz raportu (porównanie pomiar–model). */
export interface WierszZgodnosci {
  readonly element_ref: string;
  readonly wielkosc: WielkoscPomiaru;
  readonly jednostka: string;
  readonly wartosc_pomiar: number | null;
  readonly wartosc_model: number | null;
  readonly odchylka_bezwzgledna: number | null;
  readonly odchylka_pct: number | null;
  readonly tolerancja_pct: number | null;
  /** Gotowa etykieta polska werdyktu (patrz `WERDYKT_ZGODNOSCI`). */
  readonly werdykt: string;
  /** Ślad WHITE BOX per wiersz (model → pomiar → odchyłka → tolerancja → werdykt). */
  readonly slad_pl: readonly string[];
}

/** Podsumowanie liczbowe raportu. */
export interface PodsumowanieZgodnosci {
  readonly liczba_punktow: number;
  readonly w_tolerancji: number;
  readonly poza_tolerancja: number;
  readonly brak_odpowiednika: number;
  readonly brak_wyniku: number;
  readonly najwieksza_odchylka_pct: number | null;
  readonly najwieksza_odchylka_element_ref: string | null;
  readonly najwieksza_odchylka_wielkosc: WielkoscPomiaru | null;
}

/** Tolerancje odczytane z raportu (echo wejścia, zaokrąglone). */
export interface TolerancjeZgodnosci {
  readonly napiecie_pct: number | null;
  readonly moc_pct: number | null;
}

/** Pełna odpowiedź `POST /api/quality/as-built-compliance`. */
export interface WidokZgodnosci {
  readonly analysis_id: string;
  readonly input_hash: string;
  readonly tolerancje: TolerancjeZgodnosci;
  readonly zrodlo_tolerancji: Readonly<Record<string, string>>;
  readonly zalozenia_pl: readonly string[];
  readonly podsumowanie: PodsumowanieZgodnosci;
  readonly wiersze: readonly WierszZgodnosci[];
}

// ---------------------------------------------------------------------------
// Wysyłanie (POST) — wariant `getJsonZDetalem` z ciałem JSON
// ---------------------------------------------------------------------------

/** Wysyła żądanie POST i zwraca JSON; błąd → komunikat PL z pola `detail`. */
async function postJsonZDetalem<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let komunikat = `Zapytanie ${url} nie powiodło się: ${response.status} ${response.statusText}`;
    try {
      const tresc = (await response.json()) as { detail?: unknown };
      if (typeof tresc?.detail === 'string' && tresc.detail.trim()) komunikat = tresc.detail;
    } catch {
      // Brak treści JSON — pozostaje komunikat ze statusem HTTP.
    }
    throw new Error(komunikat);
  }
  return response.json() as Promise<T>;
}

/** Buduje raport zgodności powykonawczej dla przebiegu rozpływu (jawny bieg). */
export function postZgodnoscPowykonawcza(zadanie: ZgodnoscZadanie): Promise<WidokZgodnosci> {
  return postJsonZDetalem<WidokZgodnosci>('/api/quality/as-built-compliance', zadanie);
}

/**
 * Klient NAKŁADKI RÓŻNIC A/B na schemacie.
 *
 * `POST /api/short-circuit-comparisons/sld-overlay`
 *   → `backend/src/api/zwarcia_porownania.py`
 *   → `application/result_mapping/zwarcia_delta_overlay_v1.py`
 *   → `domain/zwarcia_porownanie.py`
 *
 * DŁUG, KTÓRY TO ZAMYKA (klasa „klient bez dostawcy", V12K-326). Poprzedni
 * klient wołał `/api/execution/comparisons/{id}/sld-delta-overlay` — trasę,
 * której ŻADEN router nie serwuje. Kod dostawcy istniał (`api/batch_execution.py`),
 * ale nie był wpięty w `api/main.py`, a stojąca za nim usługa trzymała przebiegi
 * we WŁASNEJ pamięci, do której produkcyjna ścieżka biegów nic nie zapisuje —
 * samo wpięcie routera dałoby więc trasę odpowiadającą „nie znaleziono przebiegu"
 * na każdy realny identyfikator. Dostawca stoi teraz tam, gdzie żyje porównanie
 * zwarciowe ekranu porównań, i liczy różnice tym samym kodem domeny co tabela.
 *
 * DLACZEGO KLIENT MIESZKA TUTAJ, a nie obok klienta tabeli porównań
 * (`ui2/wyniki/porownanie/zwarciaPorownanieApi.ts`): konsumentem nakładki jest
 * warstwa wynikowa SCHEMATU (`ui/sld/v3/canvas`), a nie ekran porównań. Kierunek
 * zależności `ui2 → ui` jest w repozytorium ustalony (tak działa np. akcja
 * „Pokaż na schemacie" ekranu zwarć); odwrotny byłby nowy.
 *
 * GRANICA: zero fizyki i zero arytmetyki. Różnice, jednostki, podpowiedzi
 * formatu i wagę elementu liczy backend — tu jest wyłącznie pobranie i
 * sprawdzenie kształtu odpowiedzi.
 */

import type { RawOverlayElement } from './rawResultOverlayStore';

/** Wpis legendy nakładki — treść POLSKA, autorytatywna po stronie backendu. */
export interface WpisLegendyRoznic {
  readonly severity: string;
  readonly label: string;
  readonly description: string;
}

/** Legenda nakładki różnic (tytuł + wpisy) — bez wymyślania po stronie UI. */
export interface LegendaRoznic {
  readonly title: string;
  readonly entries: readonly WpisLegendyRoznic[];
}

/**
 * Nakładka różnic A/B gotowa do naniesienia na schemat.
 *
 * `elements` ma DOKŁADNIE ten kształt, którym warstwa wynikowa schematu karmi
 * się dla pojedynczego przebiegu (`elements[ref].metrics[kod]` + `severity`) —
 * dzięki temu różnice rysuje ta sama warstwa etykiet, bez drugiego kanału.
 *
 * Liczniki dzielą WSZYSTKIE punkty porównania na cztery rozłączne grupy;
 * punkty bez odpowiednika i bez porównywalnych wielkości nie są elementami
 * nakładki (różnica dla nich nie istnieje), ale ich liczba jest jawna.
 */
export interface NakladkaRoznic {
  readonly run_id_a: string;
  readonly run_id_b: string;
  /** Prefiks „DELTA_" — konsument wie, że wartości są RÓŻNICAMI. */
  readonly analysis_type: string;
  readonly report_version: string;
  readonly elements: Readonly<Record<string, RawOverlayElement>>;
  readonly legend: LegendaRoznic;
  readonly content_hash: string;
  readonly liczba_punktow_zmienionych: number;
  readonly liczba_punktow_bez_zmian: number;
  readonly liczba_punktow_bez_odpowiednika: number;
  readonly liczba_punktow_bez_danych: number;
}

function maKsztaltNakladki(dane: unknown): dane is NakladkaRoznic {
  if (typeof dane !== 'object' || dane === null || Array.isArray(dane)) return false;
  const d = dane as Record<string, unknown>;
  if (typeof d.run_id_a !== 'string' || typeof d.run_id_b !== 'string') return false;
  if (typeof d.analysis_type !== 'string' || typeof d.content_hash !== 'string') return false;
  if (typeof d.elements !== 'object' || d.elements === null || Array.isArray(d.elements)) return false;
  const legenda = d.legend;
  if (typeof legenda !== 'object' || legenda === null) return false;
  if (!Array.isArray((legenda as Record<string, unknown>).entries)) return false;
  return true;
}

/**
 * Pobierz nakładkę różnic dla pary przebiegów zwarciowych (A = odniesienie).
 * Różnice liczy backend; ta funkcja niczego nie przelicza.
 */
export async function pobierzNakladkeRoznic(
  runIdA: string,
  runIdB: string,
  signal?: AbortSignal,
): Promise<NakladkaRoznic> {
  const odpowiedz = await fetch('/api/short-circuit-comparisons/sld-overlay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ run_id_a: runIdA, run_id_b: runIdB }),
    signal,
  });
  if (!odpowiedz.ok) {
    throw new Error(`Nie udało się pobrać różnic dla schematu (HTTP ${odpowiedz.status}).`);
  }
  const dane: unknown = await odpowiedz.json();
  if (!maKsztaltNakladki(dane)) {
    throw new Error('Nakładka różnic ma nieoczekiwany kształt — sprawdź wersję API.');
  }
  return dane;
}

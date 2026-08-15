/**
 * Klient porównania A/B wyników zwarciowych per punkt (karta KD-3, pozycja 11).
 *
 * `POST /api/short-circuit-comparisons` → `backend/src/api/zwarcia_porownania.py`
 * → `domain/zwarcia_porownanie.py`.
 *
 * DŁUG, KTÓRY TO ZAMYKA (V12K-290): ekran liczył różnice sam — odejmował dwie
 * wartości z dwóch przebiegów i dzielił je przez siebie, żeby pokazać procent.
 * To arytmetyka na wynikach solvera w warstwie prezentacji, ta sama klasa, którą
 * dla porównań ROZPŁYWU zamknęła luka L-13 (karta KD-2).
 *
 * Pola `delta_*` i `delta_*_percent` są ADDYTYWNE i OPCJONALNE: backend pomija
 * je, gdy wartość nie istnieje (punkt bez odpowiednika, A = 0, starszy wynik bez
 * pola). Konsument pokazuje wtedy kreskę — nigdy zera.
 */

/** Znacznik obecności punktu: „AB" = w obu przebiegach, „A"/„B" = tylko w jednym. */
export type ObecnoscPunktu = 'AB' | 'A' | 'B';

export interface PunktPorownaniaZwarciowego {
  readonly target_id: string;
  readonly target_name: string;
  readonly obecny_w: ObecnoscPunktu;
  readonly ikss_ka_a?: number;
  readonly ikss_ka_b?: number;
  readonly delta_ikss_ka?: number;
  readonly delta_ikss_percent?: number;
  readonly ip_ka_a?: number;
  readonly ip_ka_b?: number;
  readonly delta_ip_ka?: number;
  readonly delta_ip_percent?: number;
  readonly ith_ka_a?: number;
  readonly ith_ka_b?: number;
  readonly delta_ith_ka?: number;
  readonly delta_ith_percent?: number;
  readonly sk_mva_a?: number;
  readonly sk_mva_b?: number;
  readonly delta_sk_mva?: number;
  readonly delta_sk_percent?: number;
  readonly rk_ohm_a?: number;
  readonly rk_ohm_b?: number;
  readonly delta_rk_ohm?: number;
  readonly delta_rk_percent?: number;
  readonly xk_ohm_a?: number;
  readonly xk_ohm_b?: number;
  readonly delta_xk_ohm?: number;
  readonly delta_xk_percent?: number;
  readonly zk_ohm_a?: number;
  readonly zk_ohm_b?: number;
  readonly delta_zk_ohm?: number;
  readonly delta_zk_percent?: number;
  readonly xr_ratio_a?: number;
  readonly xr_ratio_b?: number;
  readonly delta_xr_ratio?: number;
  readonly delta_xr_percent?: number;
  readonly i2t_ka2s_a?: number;
  readonly i2t_ka2s_b?: number;
  readonly delta_i2t_ka2s?: number;
  readonly delta_i2t_percent?: number;
}

export interface PorownanieZwarciowe {
  readonly run_id_a: string;
  readonly run_id_b: string;
  readonly report_version: string;
  readonly punkty: readonly PunktPorownaniaZwarciowego[];
  readonly liczba_punktow_wspolnych: number;
  readonly liczba_punktow_tylko_a: number;
  readonly liczba_punktow_tylko_b: number;
}

function maKsztaltPorownania(dane: unknown): dane is PorownanieZwarciowe {
  if (typeof dane !== 'object' || dane === null || Array.isArray(dane)) return false;
  const d = dane as Record<string, unknown>;
  return (
    typeof d.run_id_a === 'string'
    && typeof d.run_id_b === 'string'
    && Array.isArray(d.punkty)
    && d.punkty.every(
      (p) =>
        typeof p === 'object'
        && p !== null
        && typeof (p as Record<string, unknown>).target_id === 'string'
        && typeof (p as Record<string, unknown>).obecny_w === 'string',
    )
  );
}

/** Porównanie dwóch przebiegów zwarciowych — delty liczy backend. */
export async function pobierzPorownanieZwarciowe(
  runIdA: string,
  runIdB: string,
  signal?: AbortSignal,
): Promise<PorownanieZwarciowe> {
  const odpowiedz = await fetch('/api/short-circuit-comparisons', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ run_id_a: runIdA, run_id_b: runIdB }),
    signal,
  });
  if (!odpowiedz.ok) {
    throw new Error(`Nie udało się porównać przebiegów zwarciowych (HTTP ${odpowiedz.status}).`);
  }
  const dane: unknown = await odpowiedz.json();
  if (!maKsztaltPorownania(dane)) {
    throw new Error('Porównanie zwarciowe ma nieoczekiwany kształt — sprawdź wersję API.');
  }
  return dane;
}

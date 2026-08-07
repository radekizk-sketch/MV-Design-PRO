/*
 * Dostawca PAKIETU DOWODOWEGO przebiegu (karta PACK-DOWODY).
 *
 * CZEGO BRAKOWAŁO. Okno „Dowód obliczeń" pokazywało ślad WHITE BOX i pozwalało
 * pobrać źródło `.tex` przebiegu. Dedykowane PAKIETY dowodowe backendu —
 * zamknięty artefakt z dowodem, źródłem, wykazem plików i odciskiem integralności
 * — nie miały we froncie ani jednego konsumenta, bo ich kontrakty HTTP żądały od
 * klienta wielkości fizycznych (Z1/Z2/Z0, U_f, operator Fortescue). Fizyka w UI
 * jest zakazana, więc końcówki stały puste.
 *
 * REUŻYCIE, NIE DUPLIKACJA: dostawcą jest brama pakietu przebiegu
 * (`GET /api/analysis-runs/{run}/pakiet-dowodowy[/dostepnosc]`,
 * `backend/src/application/proof_engine/pakiet_biegu.py`). Ten plik NIE liczy
 * niczego i NIE decyduje, jaki pakiet się należy — rodzaj wynika z DANYCH biegu
 * po stronie serwera. Tu jest wyłącznie pobranie i przekazanie odpowiedzi.
 */

const BAZA_PRZEBIEGOW = '/api/analysis-runs';

/** Punkt zwarcia, dla którego serwer potrafi złożyć pakiet. */
export interface PunktPakietu {
  readonly target_id: string;
  readonly nazwa: string;
}

/** Kształt 1:1 odpowiedzi `.../pakiet-dowodowy/dostepnosc` (pola konsumowane). */
export interface DostepnoscPakietu {
  readonly run_id: string;
  readonly dostepny: boolean;
  /** Rodzaj pakietu (klucz techniczny) — do rozróżnienia, nie do pokazania. */
  readonly rodzaj: string | null;
  /** Nazwa rodzaju po polsku — pierwszy plan. */
  readonly rodzaj_pl: string | null;
  /** Powód braku pakietu po polsku; `null` gdy pakiet jest. */
  readonly powod_pl: string | null;
  readonly punkty: readonly PunktPakietu[];
  /** Co użytkownik dostaje w pobranym pliku (opis zawartości z serwera). */
  readonly zawartosc_pl: readonly string[];
}

/** Pobrany pakiet: bajty archiwum + nazwa pliku zaproponowana przez serwer. */
export interface PobranyPakiet {
  readonly blob: Blob;
  readonly nazwaPliku: string;
}

async function odczytajBlad(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    if (typeof payload?.detail === 'string' && payload.detail.trim().length > 0) {
      return payload.detail;
    }
  } catch {
    // Odpowiedź bywa zwykłym tekstem albo pustym ciałem.
  }
  return `HTTP ${response.status}`;
}

export function adresDostepnosci(runId: string): string {
  return `${BAZA_PRZEBIEGOW}/${encodeURIComponent(runId)}/pakiet-dowodowy/dostepnosc`;
}

export function adresPakietu(runId: string, punkt?: string | null): string {
  const baza = `${BAZA_PRZEBIEGOW}/${encodeURIComponent(runId)}/pakiet-dowodowy`;
  return punkt ? `${baza}?punkt=${encodeURIComponent(punkt)}` : baza;
}

/** Czy TEN przebieg ma pakiet dowodowy — pytanie do serwera, nie zgadywanie z ekranu. */
export async function pobierzDostepnoscPakietu(
  runId: string,
  signal?: AbortSignal,
): Promise<DostepnoscPakietu> {
  const response = await fetch(adresDostepnosci(runId), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) {
    throw new Error(await odczytajBlad(response));
  }
  return (await response.json()) as DostepnoscPakietu;
}

/**
 * Nazwa pliku z nagłówka `Content-Disposition` odpowiedzi.
 *
 * Nazwę nadaje SERWER (składa ją razem z pakietem) — przeglądarka jej nie
 * wymyśla. Brak nagłówka → uczciwy zapas z identyfikatorem przebiegu.
 */
export function nazwaPlikuZOdpowiedzi(response: Response, runId: string): string {
  const naglowek = response.headers.get('content-disposition') ?? '';
  const dopasowanie = /filename="?([^";]+)"?/i.exec(naglowek);
  if (dopasowanie?.[1]) return dopasowanie[1];
  return `pakiet_dowodowy__${runId.trim().slice(0, 8) || 'przebieg'}.zip`;
}

/** Pobiera pakiet dowodowy przebiegu (opcjonalnie dla wskazanego punktu zwarcia). */
export async function pobierzPakiet(
  runId: string,
  punkt?: string | null,
  signal?: AbortSignal,
): Promise<PobranyPakiet> {
  const response = await fetch(adresPakietu(runId, punkt), {
    method: 'GET',
    headers: { Accept: 'application/zip,*/*' },
    signal,
  });
  if (!response.ok) {
    throw new Error(await odczytajBlad(response));
  }
  return {
    blob: await response.blob(),
    nazwaPliku: nazwaPlikuZOdpowiedzi(response, runId),
  };
}

/** Zapisuje pobrany pakiet na dysk użytkownika (ta sama mechanika co źródło `.tex`). */
export function zapiszPakiet(pakiet: PobranyPakiet): void {
  const url = URL.createObjectURL(pakiet.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = pakiet.nazwaPliku;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

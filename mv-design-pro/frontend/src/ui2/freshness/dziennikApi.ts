/**
 * Dziennik zmian modelu — klient końcówki „co unieważniło mój wynik" (V12K-264).
 *
 * `GET /api/cases/{case_id}/enm/dziennik-zmian?od_rewizji=N`
 * → `backend/src/api/enm.py::get_dziennik_zmian` → `enm/dziennik_zmian.py`.
 *
 * DŁUG, KTÓRY TO ZAMYKA. Model niósł FAKT zmiany (rewizja rośnie, przypadek dostaje
 * `OUTDATED`), nigdy PRZYCZYNY — a `useSwiezoscWynikow` wstawiał `przyczyna:
 * 'model-zmieniony'`, czyli STAŁĄ, nie daną. Projektant widział „nieaktualne"
 * i musiał sam odtworzyć z pamięci, co zrobił między biegiem a chwilą obecną.
 *
 * ZERO FIZYKI I ZERO INTERPRETACJI: ten moduł niczego nie liczy i nie tłumaczy —
 * opisy operacji przychodzą z kanonu backendu, listy elementów wprost z odpowiedzi
 * operacji domenowej. Kształt jest SPRAWDZANY, nie zakładany (ta sama dyscyplina co
 * V12K-262: rzutowanie `as` przepuszczało każdą odpowiedź, a pierwszy odczyt pola
 * wywracał ekran).
 */

export interface WpisDziennika {
  readonly rewizja: number;
  readonly znacznik_czasu: string;
  /** Kanoniczna nazwa operacji; `null` = rewizja bez zarejestrowanej operacji. */
  readonly operacja: string | null;
  readonly opis_pl: string;
  readonly utworzone: readonly string[];
  readonly zmienione: readonly string[];
  readonly usuniete: readonly string[];
  readonly liczba_elementow: number;
}

export interface DziennikZmian {
  readonly case_id: string;
  readonly rewizja_biezaca: number;
  readonly od_rewizji: number;
  /** `true` gdy nic nie zmieniło się od rewizji wyniku. */
  readonly aktualny: boolean;
  readonly wpisy: readonly WpisDziennika[];
}

function maKsztaltWpisu(dane: unknown): dane is WpisDziennika {
  if (typeof dane !== 'object' || dane === null) return false;
  const w = dane as Record<string, unknown>;
  return (
    typeof w.rewizja === 'number'
    && typeof w.opis_pl === 'string'
    && (w.operacja === null || typeof w.operacja === 'string')
    && Array.isArray(w.utworzone)
    && Array.isArray(w.zmienione)
    && Array.isArray(w.usuniete)
  );
}

function maKsztaltDziennika(dane: unknown): dane is DziennikZmian {
  if (typeof dane !== 'object' || dane === null || Array.isArray(dane)) return false;
  const d = dane as Record<string, unknown>;
  return (
    typeof d.rewizja_biezaca === 'number'
    && typeof d.aktualny === 'boolean'
    && Array.isArray(d.wpisy)
    && d.wpisy.every(maKsztaltWpisu)
  );
}

/** Zmiany modelu PO rewizji, na której policzono wynik. */
export async function pobierzDziennikZmian(
  caseId: string,
  odRewizji: number,
  options: { signal?: AbortSignal } = {},
): Promise<DziennikZmian> {
  const odpowiedz = await fetch(
    `/api/cases/${encodeURIComponent(caseId)}/enm/dziennik-zmian`
      + `?od_rewizji=${encodeURIComponent(String(odRewizji))}`,
    { signal: options.signal },
  );
  if (!odpowiedz.ok) {
    throw new Error(
      `Nie udało się pobrać dziennika zmian modelu (HTTP ${odpowiedz.status}).`,
    );
  }
  const dane: unknown = await odpowiedz.json();
  if (!maKsztaltDziennika(dane)) {
    throw new Error(
      'Dziennik zmian ma nieoczekiwany kształt — sprawdź wersję API modelu.',
    );
  }
  return dane;
}

/**
 * Podsumowanie jednym zdaniem: ile zmian i ilu elementów dotknęły.
 *
 * Czysta funkcja liczenia POZYCJI (nie wielkości elektrycznych) — zliczanie
 * wierszy listy nie jest fizyką i nie łamie zakazu obliczeń w prezentacji.
 */
export function podsumowaniePl(dziennik: DziennikZmian): string {
  const zmian = dziennik.wpisy.length;
  if (zmian === 0) {
    return 'Model nie zmienił się od czasu tego wyniku.';
  }
  const elementow = dziennik.wpisy.reduce((suma, w) => suma + w.liczba_elementow, 0);
  const slowoZmiana = zmian === 1 ? 'zmiana' : zmian < 5 ? 'zmiany' : 'zmian';
  const slowoElement =
    elementow === 1 ? 'element' : elementow < 5 ? 'elementy' : 'elementów';
  return (
    `Od tego wyniku model zmienił się ${zmian} ${slowoZmiana} `
    + `(${elementow} ${slowoElement}). Wynik trzeba przeliczyć.`
  );
}

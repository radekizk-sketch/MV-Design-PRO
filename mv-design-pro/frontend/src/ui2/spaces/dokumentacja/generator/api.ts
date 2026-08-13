/*
 * Dostawca listy tabel wynikowych przebiegu (karta KD-4, luka L-15).
 *
 * „Tabela wiodaca" raportu (`focus_table`) to zamknieta lista kontraktu
 * backendu, ale KTORE tabele realnie istnieja zalezy od przebiegu. Zamiast
 * zgadywac mapowanie rodzaj analizy -> tabele, generator pyta o to backend:
 * `GET /api/analysis-runs/{run_id}/results/index` zwraca tabele TEGO przebiegu
 * wraz z polska etykieta i liczba wierszy. Brak odpowiedzi = brak listy
 * (uczciwy stan), a nie wymyslona lista.
 */

import { useEffect, useState } from 'react';

export interface TabelaWyniku {
  readonly table_id: string;
  readonly label_pl: string;
  readonly row_count: number;
}

interface OdpowiedzIndeksu {
  readonly tables?: readonly TabelaWyniku[];
}

export async function fetchTabeleWyniku(runId: string): Promise<readonly TabelaWyniku[]> {
  const response = await fetch(`/api/analysis-runs/${encodeURIComponent(runId)}/results/index`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = (await response.json()) as OdpowiedzIndeksu;
  return data.tables ?? [];
}

export interface DaneTabel {
  readonly stan: 'laduje' | 'blad' | 'gotowe';
  readonly tabele: readonly TabelaWyniku[];
}

const PUSTE: DaneTabel = { stan: 'gotowe', tabele: [] };

/** Pobiera tabele przebiegu (cache per runId na zycie ekranu). */
export function useTabeleWyniku(runId: string | null): DaneTabel {
  const [cache, setCache] = useState<Record<string, DaneTabel>>({});

  useEffect(() => {
    if (!runId || cache[runId]) return;
    let anulowane = false;
    void (async () => {
      try {
        const tabele = await fetchTabeleWyniku(runId);
        if (anulowane) return;
        setCache((c) => ({ ...c, [runId]: { stan: 'gotowe', tabele } }));
      } catch {
        if (anulowane) return;
        setCache((c) => ({ ...c, [runId]: { stan: 'blad', tabele: [] } }));
      }
    })();
    return () => {
      anulowane = true;
    };
  }, [runId, cache]);

  if (!runId) return PUSTE;
  return cache[runId] ?? { stan: 'laduje', tabele: [] };
}

/* ---------------------------------------------------------------------------
 * Brama dokumentacji wykonawczej (karta KOMPLETNOSC-POLA-TR §0 pkt 2)
 * ------------------------------------------------------------------------ */

/** Jeden powód, dla którego z tego przebiegu nie wolno wydać projektu wykonawczego. */
export interface BlokadaDokumentacji {
  readonly code: string;
  readonly message_pl: string;
  readonly element_refs: readonly string[];
}

export interface GotowoscDokumentacji {
  readonly gotowy: boolean;
  readonly blokady: readonly BlokadaDokumentacji[];
}

/**
 * Werdykt bramy dla przebiegu — ten SAM, którym backend odmawia eksportu
 * (`GET /api/analysis-runs/{id}/gotowosc-dokumentacji-wykonawczej`). Ekran pyta
 * o niego ZANIM projektant kliknie eksport: inaczej jedyną drogą do informacji
 * byłby błąd 409 po kliknięciu, czyli martwy klik z komunikatem po fakcie.
 */
export async function fetchGotowoscDokumentacji(runId: string): Promise<GotowoscDokumentacji> {
  const response = await fetch(
    `/api/analysis-runs/${encodeURIComponent(runId)}/gotowosc-dokumentacji-wykonawczej`,
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = (await response.json()) as Partial<GotowoscDokumentacji>;
  return { gotowy: data.gotowy !== false, blokady: data.blokady ?? [] };
}

export interface DaneGotowosci {
  readonly stan: 'laduje' | 'blad' | 'gotowe';
  readonly werdykt: GotowoscDokumentacji;
}

/**
 * Werdykt bramy per przebieg (cache na życie ekranu).
 *
 * Błąd pobrania = stan `blad` z werdyktem PRZEPUSZCZAJĄCYM: ekran nie może
 * zablokować dokumentacji dlatego, że nie udało mu się zapytać — właściwą bramą
 * jest backend, który i tak odmówi (409) i wtedy komunikat trafi do paska stanu.
 * Blokada „na wszelki wypadek" byłaby zgadywaniem stanu modelu w UI.
 */
export function useGotowoscDokumentacji(runId: string | null): DaneGotowosci {
  const [cache, setCache] = useState<Record<string, DaneGotowosci>>({});

  useEffect(() => {
    if (!runId || cache[runId]) return;
    let anulowane = false;
    void (async () => {
      try {
        const werdykt = await fetchGotowoscDokumentacji(runId);
        if (anulowane) return;
        setCache((c) => ({ ...c, [runId]: { stan: 'gotowe', werdykt } }));
      } catch {
        if (anulowane) return;
        setCache((c) => ({
          ...c,
          [runId]: { stan: 'blad', werdykt: { gotowy: true, blokady: [] } },
        }));
      }
    })();
    return () => {
      anulowane = true;
    };
  }, [runId, cache]);

  if (!runId) return { stan: 'gotowe', werdykt: { gotowy: true, blokady: [] } };
  return cache[runId] ?? { stan: 'laduje', werdykt: { gotowy: true, blokady: [] } };
}

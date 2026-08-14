/**
 * Eksport CSV arkusza obliczeń obwodów nN (karta ARKUSZ-NN, §0 pkt 3) —
 * DETERMINISTYCZNY: separator średnik, przecinek dziesiętny (formatery
 * `arkuszFormat.ts`), nagłówki PL, kolejność wierszy = kolejność ekranu
 * (bez ponownego sortowania). Treść budowana Z TYCH SAMYCH kolumn
 * (`KolumnaEdytowalna.odczyt`), które renderują tabelę na ekranie — jedno
 * źródło formatowania, więc CSV == ekran bit w bit (zero drugiej ścieżki
 * tekstu). Kolumna akcji („Szczegóły") pominięta — nie niesie danych.
 */

import type { KolumnaEdytowalna } from '../../../shared';
import type { ArkuszWiersz } from './nnSiteApi';

function escapeCsvPole(pole: string): string {
  if (pole.includes(';') || pole.includes('\n') || pole.includes('"')) {
    return `"${pole.replace(/"/g, '""')}"`;
  }
  return pole;
}

export function kolumnyEksportowalne(
  kolumny: readonly KolumnaEdytowalna<ArkuszWiersz>[],
): readonly KolumnaEdytowalna<ArkuszWiersz>[] {
  return kolumny.filter((k) => k.edytor?.rodzaj !== 'akcja');
}

export function budujCsvArkusza(
  kolumny: readonly KolumnaEdytowalna<ArkuszWiersz>[],
  wiersze: readonly ArkuszWiersz[],
): string {
  const widoczne = kolumnyEksportowalne(kolumny);
  const naglowek = widoczne
    .map((k) => escapeCsvPole(k.jednostka ? `${k.etykieta} [${k.jednostka}]` : k.etykieta))
    .join(';');
  const linie = wiersze.map((w) => widoczne.map((k) => escapeCsvPole(k.odczyt(w))).join(';'));
  return [naglowek, ...linie].join('\r\n');
}

/** Pobranie realnego pliku (Blob + link tymczasowy) — wzorzec
 *  `ui/results-inspector/ResultsExport.tsx::downloadCSV` (BOM UTF-8 dla
 *  Excela, ta sama mechanika w całym repozytorium). */
export function pobierzCsv(tresc: string, nazwaPliku: string): void {
  const blob = new Blob(['﻿', tresc], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nazwaPliku;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

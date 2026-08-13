/*
 * KANONICZNY REJESTR ETAPÓW PRACY PROJEKTANTA (oś E1–E8) — JEDNO źródło prawdy
 * dla całej powłoki ui2.
 *
 * DLACZEGO TEN PLIK POWSTAŁ (pomiar, nie założenie). Oś E1–E8 była do tej pory
 * opisana WYŁĄCZNIE w dokumencie `docs/uiux/FLOW_PROJEKTANTA_2026-07.md` §1
 * („Etapy pracy inżyniera (globalna mapa)"). Pomiar w kodzie (grep `EtapId`,
 * `etapy`, `E1..E8` w `frontend/src/ui2/**`) nie znalazł ANI JEDNEJ
 * reprezentacji tej osi — jedyny pasek procesu w powłoce
 * (`ui2/spaces/dokumentacja/HubDokumentacji.tsx`, tablica `procesEtapy`) był
 * ręcznie wypisaną, pięcioelementową listą o innej granulacji i innej
 * kolejności niż oś projektanta. Ten moduł zastępuje tamtą listę; obowiązuje
 * zakaz zakładania drugiego rejestru etapów — każdy nowy widok procesu
 * konsumuje `ETAPY` stąd.
 *
 * ZAWARTOŚĆ ETAPU: nazwa PL, cel jednym zdaniem (kontrakt ekranu prowadzącego
 * z `FLOW_PROJEKTANTA_2026-07.md` §0) oraz przestrzeń powłoki, w której ten
 * etap się wykonuje. Przestrzeń NIE jest zgadywana — każda pochodzi z realnego
 * wpięcia w `ui2/legacy/LegacyWarsztat.tsx` (siedem przestrzeni `SpaceId`):
 *   E1 -> 'projekt'      (pulpit projektu, warunki przyłączenia)
 *   E2 -> 'model'        (warsztat modelu sieci)
 *   E3 -> 'gotowosc'     (panel gotowości wg celów)
 *   E4 -> 'obliczenia'   (przypadki obliczeniowe + przebiegi)
 *   E5 -> 'wyniki'       (warsztat wyników i dowodów)
 *   E6 -> 'schemat'      (poprawki w modelu na kanwie — cel akcji „Popraw
 *                         w modelu", `ui2/wyniki/wzorzec/usePoprawWModelu.ts`)
 *   E7 -> 'wyniki'       (macierz zgodności źródeł jest zakładką warsztatu
 *                         wyników — `ui2/spaces/wyniki/WynikiWarsztat.tsx`)
 *   E8 -> 'dokumentacja' (hub dokumentacji)
 * Dwa etapy (E5, E7) wskazują tę samą przestrzeń, bo tak wygląda realne
 * wpięcie — wskazanie osobnej, nieistniejącej przestrzeni byłoby fabrykacją.
 *
 * ZERO FIZYKI, ZERO STANU: to statyczny rejestr. Stan postępu NIE jest tu
 * przechowywany ani liczony — bieżący etap wyznacza wyłącznie reguła następnej
 * akcji (`nastepnaAkcja.ts`), która czyta kontrakt gotowości backendu.
 */

import type { SpaceId } from '../shell/spaces';
import { PROCES_STRINGS } from './strings';

/** Identyfikator etapu osi projektanta (E1–E8). */
export type EtapId = 'E1' | 'E2' | 'E3' | 'E4' | 'E5' | 'E6' | 'E7' | 'E8';

/** Definicja pojedynczego etapu — nazwa, cel jednym zdaniem, przestrzeń docelowa. */
export interface EtapProcesu {
  id: EtapId;
  /** Nazwa etapu (polska, pierwszoplanowa). */
  nazwa: string;
  /** Cel etapu jednym zdaniem — język inżynierski („po co"). */
  cel: string;
  /** Przestrzeń powłoki, w której etap się wykonuje (głęboki link mapy procesu). */
  przestrzen: SpaceId;
}

/**
 * Etapy w KOLEJNOŚCI pracy projektanta. Kolejność jest częścią kanonu — mapa
 * procesu renderuje dokładnie tę sekwencję, bez sortowania po stronie widoku.
 */
export const ETAPY: readonly EtapProcesu[] = [
  { id: 'E1', nazwa: PROCES_STRINGS.e1Nazwa, cel: PROCES_STRINGS.e1Cel, przestrzen: 'projekt' },
  { id: 'E2', nazwa: PROCES_STRINGS.e2Nazwa, cel: PROCES_STRINGS.e2Cel, przestrzen: 'model' },
  { id: 'E3', nazwa: PROCES_STRINGS.e3Nazwa, cel: PROCES_STRINGS.e3Cel, przestrzen: 'gotowosc' },
  { id: 'E4', nazwa: PROCES_STRINGS.e4Nazwa, cel: PROCES_STRINGS.e4Cel, przestrzen: 'obliczenia' },
  { id: 'E5', nazwa: PROCES_STRINGS.e5Nazwa, cel: PROCES_STRINGS.e5Cel, przestrzen: 'wyniki' },
  { id: 'E6', nazwa: PROCES_STRINGS.e6Nazwa, cel: PROCES_STRINGS.e6Cel, przestrzen: 'schemat' },
  { id: 'E7', nazwa: PROCES_STRINGS.e7Nazwa, cel: PROCES_STRINGS.e7Cel, przestrzen: 'wyniki' },
  { id: 'E8', nazwa: PROCES_STRINGS.e8Nazwa, cel: PROCES_STRINGS.e8Cel, przestrzen: 'dokumentacja' },
] as const;

/** Identyfikatory etapów w kolejności kanonu. */
export const ETAPY_IDS: readonly EtapId[] = ETAPY.map((etap) => etap.id);

/**
 * Definicja etapu po identyfikatorze. Rzuca dla identyfikatora spoza kanonu —
 * cicha wartość zastępcza ukryłaby rozjazd rejestru z konsumentem.
 */
export function etapPoId(id: EtapId): EtapProcesu {
  const etap = ETAPY.find((kandydat) => kandydat.id === id);
  if (!etap) throw new Error(`Etap spoza kanonu: ${id}`);
  return etap;
}

/** Pozycja etapu w kolejności kanonu (0-based); −1 dla identyfikatora spoza kanonu. */
export function pozycjaEtapu(id: EtapId): number {
  return ETAPY_IDS.indexOf(id);
}

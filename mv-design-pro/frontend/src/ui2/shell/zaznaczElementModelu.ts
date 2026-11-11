/*
 * JEDNA droga „pokaż element na schemacie" (karta SLD-SKALA-I-NAWIGACJA, część W —
 * wejścia na schemat spoza kanwy; wcześniej K1 POWLOKA i K2 W5-UI-14).
 *
 * Każde miejsce aplikacji, które pokazuje odwołanie do elementu sieci (wiersz
 * wyników, pozycja gotowości, węzeł drzewa, link inspektora, krok dowodu, przegląd
 * zbiorczy, wyszukiwarka, kreator po zapisie), przechodzi przez JEDNĄ z dwóch
 * funkcji tego modułu. Drugiego mechanizmu nie ma: zdarzenie DOM
 * DOM „wyśrodkuj schemat na elemencie” (nikt go nie słuchał), gołe `centerSldOnElement` w
 * komponentach i własne `navigateToSld()` są skasowane i pilnowane regułą G
 * strażnika `scripts/nawigacja_jeden_kanon_guard.py`.
 *
 * - `zaznaczElementModelu` — PRZEGLĄDANIE (drzewo topologii, powiązania inspektora,
 *   klik wiersza przeglądu, panel kontekstu schematu, kreator po zapisie):
 *   zaznacza element w store selekcji, a gdy kanwa schematu jest NA EKRANIE —
 *   przesuwa kadr do elementu BEZ zmiany skali (tryb „kotwicz"). Z innej
 *   przestrzeni nic nie skacze: wejście na schemat jest jawną akcją.
 * - `pokazElementNaSchemacie` — JAWNE WEJŚCIE („Pokaż na schemacie"): zaznaczenie
 *   + wskazanie kamery (domyślnie „kadruj") + przejście do przestrzeni „Schemat",
 *   gdy wołający jest poza kanwą, z zapisem POWROTU (`powrotZeSchematu.ts`) —
 *   schemat pokazuje wtedy „Wróć do: <ekran>".
 *
 * Predykat obecności (`elementNaSchemacie`) jest JEDEN dla przycisku i dla akcji:
 * ref nieobecny w migawce modelu nie ma przycisku (`PrzyciskPokazNaSchemacie`)
 * i nie zmienia stanu (zostaje wyłącznie zdarzenie `selekcja` — inspektor pokazuje
 * uczciwy brak obiektu). Reguła doboru skali przy wskazaniu należy do kamery
 * schematu (konsument `sldWskazanie`); tutaj wybieramy wyłącznie tryb.
 */

import { emituj } from '../events';
import { useNetworkBuildStore } from '../../ui/network-build/networkBuildStore';
import { useSelectionStore, type TrybWskazaniaSld } from '../../ui/selection/store';
import { useSnapshotStore } from '../../ui/topology/snapshotStore';
import { resolveSelectedElementFromSnapshot } from '../../ui/shared/selectionResolution';
import type { SelectedElement } from '../../ui/types';
import { przejdzDoPrzestrzeni } from './przejsciaPrzestrzeni';
import { zapiszPowrot, type EkranPowrotu } from './powrotZeSchematu';
import { kanwaSchematuWidoczna, powierzchniaRozwinieta } from './widokKanwySchematu';
import { useShellStore } from './useShellStore';

/** Etykieta akcji — JEDNA w całej aplikacji (karta, pkt 5); źródło w module liściowym. */
export { ETYKIETA_POKAZ_NA_SCHEMACIE } from './etykietaPokazNaSchemacie';

/**
 * Element migawki modelu dla refu albo `null` (brak na schemacie). Bez migawki
 * schemat nie ma czego pokazać — `null` (rozwiązywacz zwracałby wtedy wpis
 * zastępczy z typem domyślnym, czyli fikcję elementu).
 */
export function elementNaSchemacie(ref: string | null | undefined): SelectedElement | null {
  const snapshot = useSnapshotStore.getState().snapshot;
  if (!snapshot || typeof ref !== 'string' || ref.trim() === '') return null;
  return resolveSelectedElementFromSnapshot(snapshot, ref);
}

export interface OpcjeZaznaczenia {
  /**
   * Tryb wskazania kamery, gdy kanwa jest widoczna (domyślnie „kotwicz");
   * „bez-kamery" — samo zaznaczenie (np. zapis z `selection_hint.zoom_to = false`).
   */
  readonly tryb?: TrybWskazaniaSld | 'bez-kamery';
  /**
   * Element opisowy na wypadek refu jeszcze nieobecnego w migawce sklepu (kreator
   * tuż po zapisie: ref pochodzi z migawki ODPOWIEDZI operacji). Zaznaczenie
   * idzie wtedy z tym opisem; kamera — tylko dla elementu z migawki sklepu.
   */
  readonly zastepczy?: SelectedElement;
}

/**
 * Przeglądanie: zaznacza element; przy widocznej kanwie — wskazanie kamery.
 * Zwraca `true`, gdy ref istnieje w migawce modelu.
 */
export function zaznaczElementModelu(ref: string, zrodlo: string, opcje: OpcjeZaznaczenia = {}): boolean {
  const element = elementNaSchemacie(ref);
  const selekcja = useSelectionStore.getState();
  if (element) {
    selekcja.selectElement(element);
    const tryb = opcje.tryb ?? 'kotwicz';
    if (tryb !== 'bez-kamery' && kanwaSchematuWidoczna()) selekcja.centerSldOnElement(element.id, tryb);
  } else if (opcje.zastepczy) {
    selekcja.selectElement(opcje.zastepczy);
  }
  emituj({ typ: 'selekcja', obiektId: ref, zrodlo });
  return element !== null;
}

export interface OpcjePokazania {
  /** Tryb wskazania kamery (domyślnie „kadruj" — polecenie projektanta). */
  readonly tryb?: TrybWskazaniaSld;
  /**
   * Ekran źródłowy nakładki (np. okno przeglądu zbiorczego otwarte nad kanwą):
   * powrót zapisuje się także wtedy, gdy przestrzeń się nie zmienia. Ekrany
   * przestrzeni rejestrują się same (`useEkranZrodlowy`), więc zwykły wołający
   * tego pola nie podaje.
   */
  readonly powrot?: EkranPowrotu;
}

/**
 * Czy wołający stoi w ROZWINIĘTEJ powierzchni (konfigurator stacji, przegląd
 * techniczny układu): warsztat pokazuje wtedy powierzchnię, nie kanwę, nawet po
 * przejściu do przestrzeni „Schemat".
 */
function wRozwinietejPowierzchni(): boolean {
  const openMode = useNetworkBuildStore.getState().activeSurface?.openMode;
  return powierzchniaRozwinieta(openMode, useShellStore.getState().activeSpace);
}

/**
 * Jawne wejście na schemat. Zwraca `true`, gdy element jest na schemacie;
 * ref nieobecny w migawce nie przełącza przestrzeni i nie zapisuje powrotu.
 *
 * Wołający w rozwiniętej powierzchni dostaje kanwę jako KOLEJNĄ powierzchnię
 * stosu (E-01, ten sam `KanwaSchematu`) — powrót niesie wtedy okruszek stosu
 * powierzchni (`SurfaceBreadcrumbs`), więc wpis „Wróć do" nie powstaje (dwie
 * drogi powrotu do tego samego ekranu byłyby drugą historią).
 */
export function pokazElementNaSchemacie(ref: string, zrodlo: string, opcje: OpcjePokazania = {}): boolean {
  const element = elementNaSchemacie(ref);
  if (!element) {
    emituj({ typ: 'selekcja', obiektId: ref, zrodlo });
    return false;
  }
  const naKanwie = kanwaSchematuWidoczna();
  const wPowierzchni = !naKanwie && wRozwinietejPowierzchni();
  if (!wPowierzchni && (!naKanwie || opcje.powrot)) zapiszPowrot(opcje.powrot ?? null);
  const selekcja = useSelectionStore.getState();
  selekcja.selectElement(element);
  selekcja.centerSldOnElement(element.id, opcje.tryb ?? 'kadruj');
  emituj({ typ: 'selekcja', obiektId: ref, zrodlo });
  if (wPowierzchni) {
    useNetworkBuildStore.getState().openRouteSurface('E-01', {
      titlePl: 'Schemat i topologia',
      entityRef: element.id,
      subjectKind: 'entity',
      subjectRef: element.id,
      route: 'sld',
      supportsMiniSld: true,
    });
  } else if (!naKanwie) {
    przejdzDoPrzestrzeni('schemat');
  }
  return true;
}

/**
 * Jawne wejście na schemat BEZ elementu (nakładka całej sieci, np. „Pokaż różnice
 * na schemacie" porównania): przejście do przestrzeni „Schemat" z zapisem powrotu,
 * gdy wołający jest poza kanwą. Ta sama droga co `pokazElementNaSchemacie`.
 */
export function wejdzNaSchemat(): void {
  if (kanwaSchematuWidoczna()) return;
  zapiszPowrot(null);
  przejdzDoPrzestrzeni('schemat');
}

/*
 * PrzylaczZrodloPrzycisk — wspólna akcja wyjściowa strumienia OZE (K5-B, H-3):
 * „Przyłącz źródło w tym węźle" na ekranach Zdolność / Ranking / Studium.
 *
 * Wzorzec K5-A (EkranKompensacji → „Dobierz kompensator na tej szynie"):
 * otwiera formularz operacji domenowej `add_converter_source` z preselekcją
 * węzła (`bus_ref` — REALNY ref z odpowiedzi backendu, zero fabrykacji) i
 * przechodzi do przestrzeni „Schemat", bo formularze operacji żyją na kanwie.
 * Kontekst bus→stacja rozwiązuje formularz (enmResolvers.resolveStationRef →
 * findStationRefByBus) — węzeł spoza stacji dostaje w formularzu uczciwy stan
 * „brak stacji", nie cichą blokadę tutaj.
 */

import './przylaczZrodlo.css';
import { useNetworkBuildStore } from '../../ui/network-build/networkBuildStore';
import { przejdzDoPrzestrzeni } from '../shell/przejsciaPrzestrzeni';

export const PRZYLACZ_ZRODLO_ETYKIETA = 'Przyłącz źródło w tym węźle';
export const PRZYLACZ_ZRODLO_OPIS =
  'Otwiera formularz źródła OZE na kanwie schematu z preselekcją tego węzła.';

export interface PrzylaczZrodloPrzyciskProps {
  /** Kanoniczny ref węzła przyłączenia (z odpowiedzi analizy). */
  readonly busRef: string;
  /** Nazwa węzła do kontekstu formularza (opcjonalna — tylko gdy znana). */
  readonly busName?: string | null;
  /** Pochodzenie akcji (np. 'zdolnosc_wezel') — audyt kontekstu formularza. */
  readonly zrodloAkcji: string;
  readonly testid: string;
  readonly className?: string;
}

export function PrzylaczZrodloPrzycisk({
  busRef,
  busName = null,
  zrodloAkcji,
  testid,
  className,
}: PrzylaczZrodloPrzyciskProps) {
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);

  const otworzFormularz = () => {
    openOperationForm('add_converter_source', {
      bus_ref: busRef,
      ...(busName ? { bus_name: busName } : {}),
      source: zrodloAkcji,
    });
    przejdzDoPrzestrzeni('schemat');
  };

  return (
    <button
      type="button"
      className={className ?? 'mvd-oze-przylacz-zrodlo'}
      title={PRZYLACZ_ZRODLO_OPIS}
      onClick={otworzFormularz}
      data-testid={testid}
    >
      {PRZYLACZ_ZRODLO_ETYKIETA}
    </button>
  );
}

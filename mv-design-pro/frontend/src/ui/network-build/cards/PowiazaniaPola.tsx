/**
 * Karta pola E-11 — „Powiązania pola”: odejście, aparat główny i zabezpieczenie pola z modelu
 * (`pozycjeOpisuPola`, te same zdania co wiersz tabeli pól GPZ). Brak jest akcją naprawczą
 * wykonywaną TU, istniejącymi operacjami:
 *  - „Bez odejścia” → kreator magistrali `continue_trunk_segment_sn` ze startem w polu
 *    (`field_ref`) — ten sam start co akcja głowicy odpływowej w inspektorze;
 *  - „Aparat nieprzypisany” / aparat bez pozycji katalogowej → edytor wyposażenia pola tej
 *    karty (`set_bay_equipment`, `EdytorWyposazeniaPola`) — przewinięcie do niego;
 *  - „Brak sterownika” / sterownik bez nastaw → kreator zabezpieczenia `add_relay` przypięty
 *    do pola (`bay_ref`; backend wiąże `Bay.protection_ref`).
 *
 * Wejście z tabeli pól GPZ niesie fokus (`payload.fokus` powierzchni): wskazana pozycja jest
 * wyróżniona i przewinięta do widoku.
 */
import { useEffect, useRef } from 'react';

import type { Bay, EnergyNetworkModel } from '../../../types/enm';
import { useNetworkBuildStore } from '../networkBuildStore';
import { OpisPolaSnWiersze } from './OpisPolaSnWiersze';
import type { BayPrimaryDevice } from '../../../types/enm';
import { FOKUSY_POLA, pozycjeOpisuPola, type FokusPola } from './opisPolaSn';

/** Karta pola nie pyta katalogu o nazwy (katalog aparatów karty ładuje edytor wyposażenia
 *  dopiero przy zmianie, karta W5-C): aparat z katalogu jest tu nazwany rodzajem, a pełną
 *  pozycję pokazuje edytor wyposażenia tuż pod spodem. */
const BEZ_NAZW_KATALOGU: ReadonlyMap<string, string> = new Map();

/** Fokus z ładunku powierzchni E-11 (`routeState.payload.fokus`); nieznany — brak fokusu. */
export function fokusZLadunku(payload: unknown): FokusPola | null {
  const fokus = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).fokus : null;
  return typeof fokus === 'string' && (FOKUSY_POLA as readonly string[]).includes(fokus)
    ? (fokus as FokusPola)
    : null;
}

export interface PowiazaniaPolaProps {
  readonly bay: Bay;
  readonly snapshot: EnergyNetworkModel | null;
  /** Aparaty pierwotne z modelu pola (`field-view`); `null` — model pola nieodczytany. */
  readonly urzadzenia: readonly BayPrimaryDevice[] | null;
  readonly fokus: FokusPola | null;
  /** Przewija kartę do edytora wyposażenia pola (miejsce naprawy aparatu). */
  readonly onPrzejdzDoWyposazenia: () => void;
}

export function PowiazaniaPola({ bay, snapshot, urzadzenia, fokus, onPrzejdzDoWyposazenia }: PowiazaniaPolaProps): JSX.Element {
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);
  const sekcja = useRef<HTMLElement | null>(null);
  // Fokus przy otwarciu karty działa raz na pole i wskazanie — nie przy każdym renderze rodzica.
  const przejdzDoWyposazenia = useRef(onPrzejdzDoWyposazenia);
  przejdzDoWyposazenia.current = onPrzejdzDoWyposazenia;

  useEffect(() => {
    if (!fokus) return;
    if (fokus === 'aparat') przejdzDoWyposazenia.current();
    else sekcja.current?.scrollIntoView?.({ block: 'center' });
  }, [bay.ref_id, fokus]);

  const napraw = (f: FokusPola) => {
    if (f === 'odejscie') {
      openOperationForm('continue_trunk_segment_sn', { field_ref: bay.ref_id, terminal_name: bay.name });
    } else if (f === 'aparat') {
      onPrzejdzDoWyposazenia();
    } else {
      openOperationForm('add_relay', { bay_ref: bay.ref_id });
    }
  };

  return (
    <section
      ref={sekcja}
      data-testid="karta-pola-powiazania"
      className="space-y-1 border-b border-scada-border p-3 text-[length:var(--mvd-font-size-data)]"
    >
      <h4 className="font-semibold text-scada-muted">Powiązania pola</h4>
      <OpisPolaSnWiersze
        pozycje={pozycjeOpisuPola(snapshot, bay, urzadzenia, BEZ_NAZW_KATALOGU)}
        prefiks="karta-pola"
        poleRef={bay.ref_id}
        onNapraw={napraw}
        wyroznij={fokus}
      />
    </section>
  );
}

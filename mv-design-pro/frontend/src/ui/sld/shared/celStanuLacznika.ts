/**
 * Cel akcji stanu łącznika z menu kanwy (otwórz / zamknij / uziem / punkt normalnie otwarty) —
 * JEDEN resolver dla dostępności pozycji menu (`akcjeElementu.ts::stanLacznikaMenu`) i dla
 * wykonawcy akcji (`sldActionExecutor.ts`, gałąź `stan-lacznika`): predykaty parami.
 *
 * PO CO (rozszerzenie 5 karty UX-04/POLE-LINIOWE-WZORZEC). Menu aparatu pola rozwiązywało
 * temat do refu POLA i stamtąd do JEDYNEGO łącznika pola (`lacznikTematu`) — „Otwórz łącznik"
 * na symbolu odłącznika szynowego Q1 albo uziemnika Q8 otwierało WYŁĄCZNIK pola (jedyną gałąź
 * łączeniową pola), czyli inny aparat niż wskazany. Łącznik pola bez własnej gałęzi nie miał
 * w ogóle pisarza położenia, więc „uziemiony" łącznika trójpołożeniowego był nieosiągalny.
 *
 * ROZSTRZYGNIĘCIE. Gdy klik niesie ref POJEDYNCZEGO aparatu (`deviceRef`, ścieżka danych
 * symbolu `PreviewElementMeta.deviceRef`):
 *  - aparat opisujący gałąź łączeniową modelu (`linked_ref`) → ta gałąź (`open_switch` /
 *    `close_switch`; jedna prawda położenia w `Branch.status`, którą czyta fizyka);
 *  - łącznik pola bez gałęzi → sam aparat (`set_bay_apparatus_position`); położenie z TEJ
 *    SAMEJ funkcji co kafel stanu na kanwie (`stanAparatuZModelu`);
 *  - aparat, który nie jest łącznikiem (przekładnik, głowica, wskaźnik napięcia) → powód.
 * Bez `deviceRef` (menu pola, gałąź łączeniowa wprost) — dotychczasowy `lacznikTematu`.
 */
import type { BayPrimaryDevice, EnergyNetworkModel, FuseBranch, SwitchBranch } from '../../../types/enm';
import { czyLacznik, lacznikTematu } from '../../shared/stanLacznika';
import { stanAparatuZModelu } from '../v2/model/stanAparatowPola';
import { RODZAJE_LACZNIKOW_POLA } from '../v3/compose/rodzajeAparatuPola';

/** Położenie nadawane projektowo łącznikowi pola bez gałęzi (lustro
 *  `POLOZENIA_APARATU_POLA`, `backend/src/enm/polozenie_aparatu_pola.py`). */
export type PolozenieAparatuPola = 'zamkniety' | 'otwarty' | 'uziemiony';

export type CelStanuLacznika =
  | { readonly rodzaj: 'galaz'; readonly lacznik: SwitchBranch | FuseBranch }
  | {
      readonly rodzaj: 'aparat';
      readonly bayRef: string;
      readonly deviceRef: string;
      readonly trojpolozeniowy: boolean;
      /** Położenie z modelu; `null` — brak rekordu albo stan nieustalony / awaria. */
      readonly polozenie: PolozenieAparatuPola | null;
    }
  | { readonly rodzaj: 'brak'; readonly powodPl: string };

export const POWOD_APARAT_NIE_LACZNIK_PL =
  'Aparat nie jest łącznikiem — położenie łączeniowe mają wyłącznie wyłącznik, rozłącznik, odłącznik, uziemnik, rozłącznik bezpiecznikowy i łącznik trójpołożeniowy.';

const POLOZENIE_Z_RYSUNKU: Readonly<Record<string, PolozenieAparatuPola | null>> = {
  closed: 'zamkniety',
  open: 'otwarty',
  earthed: 'uziemiony',
  unknown: null,
  bad: null,
};

export function celStanuLacznika(
  snapshot: Pick<EnergyNetworkModel, 'branches' | 'bays'> | null | undefined,
  ref: string | null | undefined,
  deviceRef?: string | null,
): CelStanuLacznika {
  if (!deviceRef) {
    const wynik = lacznikTematu(snapshot, ref);
    return wynik.lacznik ? { rodzaj: 'galaz', lacznik: wynik.lacznik } : { rodzaj: 'brak', powodPl: wynik.powodPl };
  }
  const pole = (snapshot?.bays ?? []).find((b) => (b.primary_devices ?? []).some((d) => d.device_ref === deviceRef));
  const aparat: BayPrimaryDevice | undefined = pole?.primary_devices?.find((d) => d.device_ref === deviceRef);
  if (!pole || !aparat) {
    return { rodzaj: 'brak', powodPl: 'Wskazany aparat nie należy do wyposażenia pola w modelu sieci.' };
  }
  if (!RODZAJE_LACZNIKOW_POLA.has(aparat.kind)) return { rodzaj: 'brak', powodPl: POWOD_APARAT_NIE_LACZNIK_PL };
  const galezieWgRef = new Map((snapshot?.branches ?? []).map((g) => [g.ref_id, g] as const));
  if (aparat.linked_ref) {
    const galaz = galezieWgRef.get(aparat.linked_ref);
    return czyLacznik(galaz)
      ? { rodzaj: 'galaz', lacznik: galaz }
      : { rodzaj: 'brak', powodPl: 'Aparat wskazuje gałąź, która nie jest łącznikiem modelu sieci.' };
  }
  const stan = stanAparatuZModelu(aparat, pole.primary_devices ?? [], galezieWgRef);
  return {
    rodzaj: 'aparat',
    bayRef: pole.ref_id,
    deviceRef,
    trojpolozeniowy: aparat.kind === 'THREE_POSITION_SWITCH',
    polozenie: stan === undefined ? null : POLOZENIE_Z_RYSUNKU[stan] ?? null,
  };
}

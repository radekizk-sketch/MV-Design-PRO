/**
 * Schemat nN stacji — TEMAT menu kontekstowego i operacje bez okna (scal / kopiuj odpływ).
 *
 * Moduł CZYSTY (zero DOM, zero Reacta, zero fizyki). Jedynym źródłem topologii jest graf
 * projekcji domeny nN (`LvDomainProjectionV1.graph`, ten sam, z którego rysuje
 * `LvDomainView`) — moduł nie odtwarza topologii z surowego modelu ENM (reguła R4
 * `scripts/lv_domain_projection_guard.py`). Dwie odpowiedzialności:
 *
 * 1. `resolveTematMenuNn` — obiekt rysunku nN (węzeł albo krawędź `LvDomainView`) → temat
 *    menu: rodzaj menu (`nn_cable` / `nn_apparatus` / `nn_terminal` / `nn_load`) i ref
 *    obiektu. Ref, którego nie ma w grafie projekcji, NIE jest tematem — menu się nie
 *    otwiera (uczciwa odmowa zamiast operacji na refie rysunkowym; ta sama zasada co
 *    `canvasMenuSubject.ts` kanwy SN).
 *
 * 2. `operacjaBezposredniaNn` — ładunek operacji wykonywanej WPROST z menu (bez okna, bo
 *    operacja nie ma parametrów poza wskazanym obiektem) ALBO powód, dla którego ładunku
 *    nie da się zbudować. Z tej JEDNEJ funkcji czytają: menu (blokada pozycji z powodem,
 *    `powodyBlokadyNn`) i wykonawca akcji (`shared/sldActionExecutor.ts` dostaje gotowy
 *    wynik od portalu nN) — predykaty parami. Rola aparatu (`graph.devices[].device_role`)
 *    pochodzi z tego samego grafu co gałęzie. Warunki, których front nie potrafi rozstrzygnąć
 *    bez powielania reguł backendu (ta sama pozycja katalogowa scalanych odcinków, brak
 *    przyłączy na zacisku, poddrzewo odpływu), rozstrzyga operacja domenowa i jej komunikat
 *    trafia do projektanta.
 */
import type { SldElementKindForMenu } from '../../v2/command/SldCommandService';
import type { LvDomainGraphView } from './types';

/** Część grafu projekcji nN, z której czyta menu (gałęzie, szyny, odbiory, role aparatów). */
export type GrafMenuNn = Pick<LvDomainGraphView, 'buses' | 'branches' | 'loads' | 'devices'>;

/** Trafiony obiekt rysunku nN — atrybuty `data-node-kind` / `data-edge-kind` i ref. */
export interface TrafienieNn {
  readonly rodzajWezla?: string;
  readonly rodzajKrawedzi?: string;
  readonly ref: string;
}

export interface TematMenuNn {
  readonly kind: Extract<SldElementKindForMenu, 'nn_cable' | 'nn_apparatus' | 'nn_terminal' | 'nn_load'>;
  readonly ref: string;
  readonly nazwa: string | null;
}

/** Typy gałęzi aparatów łączeniowych — ten sam zbiór, od którego `copy_nn_feeder` zaczyna kopię. */
const TYPY_APARATU = new Set(['switch', 'breaker', 'fuse', 'disconnector', 'bus_coupler']);

function galaz(graf: GrafMenuNn, ref: string): GrafMenuNn['branches'][number] | undefined {
  return graf.branches.find((b) => b.ref_id === ref);
}

export function resolveTematMenuNn(
  trafienie: TrafienieNn,
  graf: GrafMenuNn | null,
): TematMenuNn | null {
  if (!graf || !trafienie.ref) return null;
  const { ref } = trafienie;
  if (trafienie.rodzajKrawedzi === 'cable') {
    const kabel = galaz(graf, ref);
    return kabel && kabel.type === 'cable' ? { kind: 'nn_cable', ref, nazwa: kabel.name || null } : null;
  }
  switch (trafienie.rodzajWezla) {
    case 'apparatus': {
      const aparat = galaz(graf, ref);
      return aparat && TYPY_APARATU.has(String(aparat.type))
        ? { kind: 'nn_apparatus', ref, nazwa: aparat.name || null }
        : null;
    }
    case 'terminal': {
      const szyna = graf.buses.find((b) => b.ref_id === ref);
      return szyna ? { kind: 'nn_terminal', ref, nazwa: szyna.name || null } : null;
    }
    case 'load': {
      const odbior = graf.loads.find((l) => l.ref_id === ref);
      return odbior ? { kind: 'nn_load', ref, nazwa: odbior.name || null } : null;
    }
    default:
      return null;
  }
}

export type OperacjaNn =
  | {
      readonly ok: true;
      readonly op: 'merge_nn_segments' | 'copy_nn_feeder';
      readonly payload: Record<string, unknown>;
      readonly komunikatSukcesuPl: string;
    }
  | { readonly ok: false; readonly powodPl: string };

export const POWOD_SCALENIA_PL =
  'Scalić można dokładnie dwa odcinki kabla spotykające się w tym zacisku — do zacisku nie może dochodzić nic więcej.';
export const POWOD_KOPII_ROLI_PL =
  'Kopiować można odpływ — ten aparat jest zasilaniem rozdzielnicy albo sprzęgłem sekcji, nie aparatem odpływowym.';
export const POWOD_KOPII_TYPU_PL = 'Odpływ kopiuje się od aparatu łączeniowego (wyłącznik, rozłącznik, bezpiecznik).';
const POWOD_BRAKU_OBIEKTU_PL = 'Wskazanego obiektu nie ma w modelu sieci — odśwież schemat.';

/**
 * Ładunek operacji bezpośredniej nN albo powód odmowy.
 *
 * Rola aparatu pochodzi z TEGO SAMEGO grafu (`graph.devices[].device_role`); aparat bez
 * wpisu w `devices` nie ma roli — wtedy rozstrzyga operacja domenowa.
 */
export function operacjaBezposredniaNn(actionId: string, elementId: string | null, graf: GrafMenuNn | null): OperacjaNn {
  if (!graf || !elementId) return { ok: false, powodPl: POWOD_BRAKU_OBIEKTU_PL };
  if (actionId === 'merge-nn-segments') {
    if (!graf.buses.some((b) => b.ref_id === elementId)) {
      return { ok: false, powodPl: POWOD_BRAKU_OBIEKTU_PL };
    }
    const przyZacisku = graf.branches
      .filter((b) => b.from_bus_ref === elementId || b.to_bus_ref === elementId)
      .sort((a, b) => a.ref_id.localeCompare(b.ref_id));
    if (przyZacisku.length !== 2 || przyZacisku.some((b) => b.type !== 'cable')) {
      return { ok: false, powodPl: POWOD_SCALENIA_PL };
    }
    return {
      ok: true,
      op: 'merge_nn_segments',
      payload: { segment_a_ref: przyZacisku[0].ref_id, segment_b_ref: przyZacisku[1].ref_id },
      komunikatSukcesuPl: 'Scalono dwa odcinki kabla nN w jeden.',
    };
  }
  if (actionId === 'copy-nn-feeder') {
    const aparat = galaz(graf, elementId);
    if (!aparat) return { ok: false, powodPl: POWOD_BRAKU_OBIEKTU_PL };
    const rola = graf.devices.find((d) => d.ref_id === elementId)?.device_role ?? null;
    if (!TYPY_APARATU.has(String(aparat.type))) return { ok: false, powodPl: POWOD_KOPII_TYPU_PL };
    // Sprzęgło sekcji jest sprzęgłem z samego typu gałęzi — ta sama reguła co operacja
    // `copy_nn_feeder` (odmowa `nn.copy_feeder_wrong_root`); rola z projekcji nN dokłada
    // zasilanie rozdzielnicy i granicę domeny, których typ gałęzi nie rozróżnia.
    if (aparat.type === 'bus_coupler' || rola === 'incomer' || rola === 'coupler' || rola === 'boundary') {
      return { ok: false, powodPl: POWOD_KOPII_ROLI_PL };
    }
    return {
      ok: true,
      op: 'copy_nn_feeder',
      payload: { feeder_apparatus_ref: elementId },
      komunikatSukcesuPl: 'Skopiowano odpływ nN razem z jego odcinkami i odbiorami.',
    };
  }
  return { ok: false, powodPl: POWOD_BRAKU_OBIEKTU_PL };
}

/** Powody blokady pozycji bezpośrednich menu danego rodzaju (`null` = pozycja dostępna). */
export function powodyBlokadyNn(
  kind: SldElementKindForMenu,
  elementId: string | null,
  graf: GrafMenuNn | null,
): Readonly<Partial<Record<string, string | null>>> {
  const wynik: Record<string, string | null> = {};
  const akcje = kind === 'nn_terminal' ? ['merge-nn-segments'] : kind === 'nn_apparatus' ? ['copy-nn-feeder'] : [];
  for (const akcja of akcje) {
    const operacja = operacjaBezposredniaNn(akcja, elementId, graf);
    wynik[akcja] = operacja.ok ? null : operacja.powodPl;
  }
  return wynik;
}

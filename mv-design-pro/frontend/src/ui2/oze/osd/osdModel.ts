/*
 * Model i adaptery okna „Odpowiedź na polecenia OSD" (karta P40, D7). Czyste,
 * read-only odwzorowanie stanu modelu (źródła ze snapshotu) oraz odpowiedzi
 * końcówki osd-response (`../api`) na struktury prezentacji (opcje doboru / karty
 * porównania / tabela wzorcowa / ślad WHITE BOX). Zero fizyki, zero ocen lokalnych.
 * Zero mutacji, zero wołań API stąd.
 *
 * GRANICA DOBORU ŹRÓDŁA (recon D7): backend `build_osd_response_view` dopasowuje
 * `source_ref` do `snapshot["generators"][].ref_id` (potwierdza to test
 * `tests/api/test_osd_response_api.py`, SOURCE="gen_sync", oraz `_find_source`).
 * Dlatego opcje źródła pochodzą ZE SNAPSHOTU (`generators`), analogicznie do doboru
 * węzła w oknie „Obszar P–Q" (`selectBusOptions`) — a NIE ze store'a kreatora DER,
 * którego identyfikator połączenia nie jest referencją generatora ENM.
 *
 * Delty nastawu źródła (P/Q) to ARYTMETYKA PREZENTACJI (po − przed) z jawnym
 * komentarzem; delty strat pochodzą WPROST z backendu (`_losses`). Tabela napięć
 * NIE stawia tagów — odpowiedź D7 nie niesie flagi naruszenia pasma (zero oceny
 * lokalnej, karta P40 §1.2).
 *
 * Ślad WHITE BOX dopasowany ADAPTEREM (nie kopią) do kontraktu `SladAnalizy`
 * z pulpitu (`KrokSladuSily`: symbol → formula_latex → substitution_pl → result_pl),
 * wzór P41 (`krzyweModel.ts::krokiSladuPQ`).
 */

import type { EnergyNetworkModel } from '../../../types/enm';
import type { DefinicjaKolumny, WierszTabeli } from '../../wyniki/wzorzec/wzorzecModel';
import type {
  BiegOsd,
  KrokSladuSily,
  RodzajPoleceniaOsd,
  WezelOsd,
  WidokOdpowiedziOsd,
} from '../api';
import {
  OSD_STRINGS,
  etykietaPoleceniaOsd,
  fmtDeltaOsd,
  fmtMWOsd,
  fmtMvarOsd,
  fmtPuOsd,
} from './strings';

// ---------------------------------------------------------------------------
// Dobór źródła — źródła (generatory) ze snapshotu bieżącego przebiegu
// ---------------------------------------------------------------------------

/** Opcja doboru źródła (nazwa PL na pierwszym planie; `ref_id` = parametr biegu). */
export interface OpcjaZrodlaOsd {
  readonly refId: string;
  readonly etykieta: string;
}

/**
 * Adapter: źródła ze snapshotu → opcje doboru. Klucz/wartość = `ref_id` generatora
 * (dopasowywany przez backend); etykieta = nazwa PL (rezerwa: `ref_id`). Kolejność
 * deterministyczna po `ref_id` (spójnie z `selectBusOptions`).
 */
export function opcjeZrodel(snapshot: EnergyNetworkModel | null): OpcjaZrodlaOsd[] {
  const generatory = snapshot?.generators ?? [];
  return generatory
    .map((gen) => ({ refId: gen.ref_id, etykieta: gen.name ?? gen.ref_id }))
    .sort((a, b) => a.refId.localeCompare(b.refId));
}

// ---------------------------------------------------------------------------
// Parametry polecenia — które pola wysyła jawny bieg dla danego rodzaju
// ---------------------------------------------------------------------------

/** Zbiór pól parametrów wymaganych/wysyłanych przez dane polecenie OSD. */
export type PoleParametruOsd =
  | 'limitP'
  | 'q'
  | 'cosfi'
  | 'charakter'
  | 'czestotliwosc'
  | 'droop'
  | 'strefaMartwa';

/** Które pola parametrów należą do danego polecenia (1:1 z `_resolve_setpoint`). */
export function poleParametrowOsd(command: RodzajPoleceniaOsd): readonly PoleParametruOsd[] {
  switch (command) {
    case 'ograniczenie_p':
      return ['limitP'];
    case 'moc_bierna':
      return ['q'];
    case 'cosfi':
      return ['cosfi', 'charakter'];
    case 'lfsm_o':
    case 'lfsm_u':
      return ['czestotliwosc', 'droop', 'strefaMartwa'];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Karty porównania przed / po (P/Q źródła + straty sieci)
// ---------------------------------------------------------------------------

/** Jedna karta porównania: etykieta + wartości przed/po + delta + jednostka. */
export interface KartaPorownaniaOsd {
  readonly klucz: string;
  readonly etykieta: string;
  readonly przed: string;
  readonly po: string;
  readonly delta: string;
  readonly jednostka: string;
}

/** Delta prezentacji (po − przed); brak którejkolwiek wartości → null. */
function deltaPrezentacji(po: number | null, przed: number | null): number | null {
  if (po === null || przed === null) return null;
  return po - przed;
}

/**
 * Adapter: widok odpowiedzi → karty porównania. Nastaw P/Q źródła z deltą liczoną
 * jako ARYTMETYKA PREZENTACJI (po − przed); straty sieci z deltą WPROST z backendu.
 */
export function kartyPorownaniaOsd(widok: WidokOdpowiedziOsd): KartaPorownaniaOsd[] {
  const { source: src, losses: str } = widok;
  return [
    {
      klucz: 'p_zrodla',
      etykieta: OSD_STRINGS.kartaPZrodla,
      przed: fmtMWOsd(src.p_setpoint_before_mw),
      po: fmtMWOsd(src.p_setpoint_after_mw),
      delta: fmtDeltaOsd(deltaPrezentacji(src.p_setpoint_after_mw, src.p_setpoint_before_mw), 3),
      jednostka: OSD_STRINGS.jednMW,
    },
    {
      klucz: 'q_zrodla',
      etykieta: OSD_STRINGS.kartaQZrodla,
      przed: fmtMvarOsd(src.q_setpoint_before_mvar),
      po: fmtMvarOsd(src.q_setpoint_after_mvar),
      delta: fmtDeltaOsd(
        deltaPrezentacji(src.q_setpoint_after_mvar, src.q_setpoint_before_mvar),
        3,
      ),
      jednostka: OSD_STRINGS.jednMvar,
    },
    {
      klucz: 'straty_p',
      etykieta: OSD_STRINGS.kartaStratyP,
      przed: fmtMWOsd(str.p_before_mw),
      po: fmtMWOsd(str.p_after_mw),
      delta: fmtDeltaOsd(str.p_delta_mw, 3),
      jednostka: OSD_STRINGS.jednMW,
    },
    {
      klucz: 'straty_q',
      etykieta: OSD_STRINGS.kartaStratyQ,
      przed: fmtMvarOsd(str.q_before_mvar),
      po: fmtMvarOsd(str.q_after_mvar),
      delta: fmtDeltaOsd(str.q_delta_mvar, 3),
      jednostka: OSD_STRINGS.jednMvar,
    },
  ];
}

// ---------------------------------------------------------------------------
// Tabela napięć węzłów — wzorzec `TabelaWynikow` (ui2/wyniki/wzorzec)
// ---------------------------------------------------------------------------

/** Deklaratywne kolumny tabeli napięć (etykiety PL, jednostki zawsze). */
export function kolumnyTabeliOsd(): DefinicjaKolumny[] {
  return [
    { klucz: 'wezel', etykieta: OSD_STRINGS.kolWezel, sortowalna: false },
    {
      klucz: 'u_przed',
      etykieta: OSD_STRINGS.kolUPrzed,
      jednostka: OSD_STRINGS.jednPu,
      mono: true,
    },
    {
      klucz: 'u_po',
      etykieta: OSD_STRINGS.kolUPo,
      jednostka: OSD_STRINGS.jednPu,
      mono: true,
    },
    {
      klucz: 'delta_u',
      etykieta: OSD_STRINGS.kolDeltaU,
      jednostka: OSD_STRINGS.jednPu,
      mono: true,
    },
  ];
}

/**
 * Adapter jednego węzła → wiersz wzorca tabeli (semantyka `ValueRow`). BEZ tagów:
 * odpowiedź D7 nie niesie flagi naruszenia pasma napięciowego (zero oceny lokalnej).
 */
function wierszWezlaOsd(wezel: WezelOsd): WierszTabeli {
  return {
    wezel: { wartosc: wezel.bus_name ?? wezel.bus_ref },
    u_przed: {
      wartosc: fmtPuOsd(wezel.v_before_pu),
      sortKey: wezel.v_before_pu ?? undefined,
    },
    u_po: {
      wartosc: fmtPuOsd(wezel.v_after_pu),
      sortKey: wezel.v_after_pu ?? undefined,
    },
    delta_u: {
      wartosc: fmtDeltaOsd(wezel.v_delta_pu, 4),
      sortKey: wezel.v_delta_pu ?? undefined,
    },
  };
}

/** Adapter: węzły widoku → wiersze tabeli napięć (kolejność źródłowa). */
export function wierszeTabeliOsd(widok: WidokOdpowiedziOsd): WierszTabeli[] {
  return widok.nodes.map(wierszWezlaOsd);
}

// ---------------------------------------------------------------------------
// Ślad WHITE BOX — adapter do kontraktu `SladAnalizy` (KrokSladuSily)
// ---------------------------------------------------------------------------

/** Podsumowanie biegu → czytelny opis WHITE BOX (zbieżność, iteracje, straty, U, slack). */
function opisBiegu(bieg: BiegOsd): string {
  const zbieznosc = bieg.converged ? OSD_STRINGS.sladZbieznyTak : OSD_STRINGS.sladZbieznyNie;
  const iter = bieg.iterations_count === null ? OSD_STRINGS.kreska : String(bieg.iterations_count);
  return (
    `${zbieznosc}; iteracje = ${iter}; `
    + `straty P = ${fmtMWOsd(bieg.total_losses_p_mw)} MW; `
    + `U ∈ [${fmtPuOsd(bieg.min_voltage_pu)} … ${fmtPuOsd(bieg.max_voltage_pu)}] p.u.; `
    + `slack = ${fmtMWOsd(bieg.slack_p_mw)} MW / ${fmtMvarOsd(bieg.slack_q_mvar)} Mvar`
  );
}

/**
 * Adapter śladu symulacji → kroki `SladAnalizy` (KrokSladuSily). Trzy kroki:
 * (1) nadpisanie nastawu źródła (co i jak zmieniono), (2) podsumowanie biegu
 * bazowego, (3) podsumowanie biegu z poleceniem. Wzory jako zapis symboliczny
 * (ASCII), spójnie ze śladem pulpitu OZE. Zero ocen — treści wprost z backendu.
 */
export function krokiSladuOsd(widok: WidokOdpowiedziOsd): KrokSladuSily[] {
  const { whitebox: wb, parameters: par } = widok;
  const nadp = wb.overridden;
  const parametryPolecenia = Object.entries(nadp.command)
    .map(([klucz, wartosc]) => `${klucz} = ${wartosc}`)
    .join('; ');
  return [
    {
      symbol: OSD_STRINGS.sladSymbolNastaw,
      formula_latex: OSD_STRINGS.sladWzorNastaw,
      substitution_pl:
        `polecenie = ${etykietaPoleceniaOsd(par.command)}`
        + (parametryPolecenia ? `; ${parametryPolecenia}` : ''),
      result_pl:
        `P: ${fmtMWOsd(nadp.p_before_mw)} → ${fmtMWOsd(nadp.p_after_mw)} MW; `
        + `Q: ${fmtMvarOsd(nadp.q_before_mvar)} → ${fmtMvarOsd(nadp.q_after_mvar)} Mvar`,
    },
    {
      symbol: OSD_STRINGS.sladSymbolBazowy,
      formula_latex: OSD_STRINGS.sladWzorBieg,
      substitution_pl: OSD_STRINGS.sladSymbolBazowy,
      result_pl: opisBiegu(wb.baseline_run),
    },
    {
      symbol: OSD_STRINGS.sladSymbolPolecenie,
      formula_latex: OSD_STRINGS.sladWzorBieg,
      substitution_pl: OSD_STRINGS.sladSymbolPolecenie,
      result_pl: opisBiegu(wb.commanded_run),
    },
  ];
}

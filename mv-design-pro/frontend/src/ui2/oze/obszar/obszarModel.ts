/*
 * Model i adaptery okna „Obszar bezpiecznej pracy P–Q" (karta P30). Czyste,
 * read-only odwzorowanie odpowiedzi końcówki pq-area (`../api`) na struktury
 * prezentacji (wykres / tabela wzorcowa / ślad WHITE BOX). Zero fizyki, zero ocen
 * lokalnych — pasma pracy, kryteria wiążące i liczby biegów pochodzą WYŁĄCZNIE
 * z backendu. Zero mutacji, zero wołań API stąd.
 *
 * Słownik PL rodzajów kontroli reużyty importem bezpośrednim `rodzajKontroliPL`
 * z okna „Jakość wyników" (`ui2/wyniki/jakosc/strings`). Ślad WHITE BOX dopasowany
 * ADAPTEREM do kontraktu `SladAnalizy` z pulpitu (`KrokSladuSily`), wzór P41
 * (`krzyweModel.ts::krokiSladuPQ`).
 */

import { rodzajKontroliPL } from '../../wyniki/jakosc/strings';
import type { RodzajKontroli } from '../../wyniki/jakosc/api';
import type { DefinicjaKolumny, WierszTabeli } from '../../wyniki/wzorzec/wzorzecModel';
import type {
  KrokSladuSily,
  KryteriumWiazaceZdolnosci,
  WierzcholekObszaruPQ,
  WidokObszaruPQ,
} from '../api';
import {
  OBSZAR_STRINGS,
  fmtMWObszar,
  fmtMvarObszar,
  fmtWartoscObszar,
} from './strings';

// ---------------------------------------------------------------------------
// Kryterium wiążące — opis PL (rodzaj + element + wartość + próg)
// ---------------------------------------------------------------------------

/** Polska nazwa rodzaju kryterium wiążącego (rodzaj kontroli lub stan biegu). */
export function rodzajGranicyPL(binding: KryteriumWiazaceZdolnosci): string {
  switch (binding.kind) {
    case 'none':
      return OBSZAR_STRINGS.granicaBrak;
    case 'non_convergence':
      return OBSZAR_STRINGS.granicaNiezbieznosc;
    case 'voltage':
    case 'loading':
      if (binding.check_type) {
        return rodzajKontroliPL(binding.check_type as RodzajKontroli);
      }
      return binding.kind === 'voltage'
        ? OBSZAR_STRINGS.granicaNapiecie
        : OBSZAR_STRINGS.granicaObciazenie;
    default:
      return OBSZAR_STRINGS.kreska;
  }
}

/** Element wiążący (nazwa na pierwszym planie, ref jako rezerwa); brak → null. */
export function elementGranicy(binding: KryteriumWiazaceZdolnosci): string | null {
  if (binding.kind !== 'voltage' && binding.kind !== 'loading') return null;
  return binding.element_name ?? binding.element_id ?? null;
}

/** Wartość obserwowana kryterium z jednostką z backendu; brak danych → null. */
export function wartoscGranicy(binding: KryteriumWiazaceZdolnosci): string | null {
  if (binding.observed_value === undefined || binding.observed_value === null) return null;
  const jedn = binding.unit ? ` ${binding.unit}` : '';
  return `${fmtWartoscObszar(binding.observed_value)}${jedn}`;
}

/** Próg naruszenia (limit_fail) z jednostką z backendu; brak danych → null. */
export function progGranicy(binding: KryteriumWiazaceZdolnosci): string | null {
  if (binding.limit_fail === undefined || binding.limit_fail === null) return null;
  const jedn = binding.unit ? ` ${binding.unit}` : '';
  return `${fmtWartoscObszar(binding.limit_fail)}${jedn}`;
}

/**
 * Zwięzły opis granicy: rodzaj PL · element · wartość / próg. Brak granicy
 * (`kind: none`) → kreska; niezbieżność / brak elementu → sam rodzaj.
 */
export function opisGranicy(binding: KryteriumWiazaceZdolnosci): string {
  if (binding.kind === 'none') return OBSZAR_STRINGS.kreska;
  const czesci: string[] = [rodzajGranicyPL(binding)];
  const element = elementGranicy(binding);
  if (element) czesci.push(element);
  const wartosc = wartoscGranicy(binding);
  const prog = progGranicy(binding);
  if (wartosc && prog) {
    czesci.push(`${wartosc} / ${OBSZAR_STRINGS.prog} ${prog}`);
  } else if (wartosc) {
    czesci.push(wartosc);
  }
  return czesci.join(OBSZAR_STRINGS.rozdzielaczGranicy);
}

// ---------------------------------------------------------------------------
// Brak pasma pracy — feasible=false lub pasmo zerowe (q_min = q_max)
// ---------------------------------------------------------------------------

/** Czy wierzchołek nie ma pasma pracy (Q = 0 niedopuszczalne lub pasmo zerowe). */
export function brakPasma(wierzcholek: WierzcholekObszaruPQ): boolean {
  if (!wierzcholek.feasible) return true;
  if (wierzcholek.q_min_dop_mvar === null || wierzcholek.q_max_dop_mvar === null) return true;
  return wierzcholek.q_min_dop_mvar === wierzcholek.q_max_dop_mvar;
}

// ---------------------------------------------------------------------------
// Wykres obszaru — pasmo dopuszczalne Q(P) + opcjonalna krzywa producenta
// ---------------------------------------------------------------------------

/**
 * Punkt wykresu obszaru: pasmo sieci (q_min/q_max) i/lub pasmo producenta
 * (prodMin/prodMax) przy danej mocy czynnej P. Pola opcjonalne, bo obie krzywe
 * mają własne siatki P — łączone po unii wartości P (linie z `connectNulls`).
 */
export interface PunktObszaru {
  readonly p: number;
  readonly qMin?: number;
  readonly qMax?: number;
  readonly prodMin?: number;
  readonly prodMax?: number;
}

/**
 * Adapter: wierzchołki obszaru (tylko dopuszczalne z niezerowym pasmem) +
 * opcjonalna krzywa producenta → punkty wykresu (unia P, rosnąco). Zero ocen —
 * krzywa producenta 1:1 z `pq_curve` katalogu; wierzchołki 1:1 z odpowiedzi.
 */
export function punktyObszaru(
  vertices: readonly WierzcholekObszaruPQ[],
  krzywaProducenta?: readonly (readonly [number, number, number])[],
): PunktObszaru[] {
  const mapa = new Map<number, { p: number; qMin?: number; qMax?: number; prodMin?: number; prodMax?: number }>();
  const wpis = (p: number) => {
    const biezacy = mapa.get(p) ?? { p };
    mapa.set(p, biezacy);
    return biezacy;
  };
  for (const v of vertices) {
    if (v.feasible && v.q_min_dop_mvar !== null && v.q_max_dop_mvar !== null) {
      const rekord = wpis(v.p_mw);
      rekord.qMin = v.q_min_dop_mvar;
      rekord.qMax = v.q_max_dop_mvar;
    }
  }
  for (const [p, qmin, qmax] of krzywaProducenta ?? []) {
    const rekord = wpis(p);
    rekord.prodMin = qmin;
    rekord.prodMax = qmax;
  }
  return Array.from(mapa.values()).sort((a, b) => a.p - b.p);
}

// ---------------------------------------------------------------------------
// Tabela wierzchołków — wzorzec `TabelaWynikow` (ui2/wyniki/wzorzec)
// ---------------------------------------------------------------------------

/** Deklaratywne kolumny tabeli wierzchołków obszaru (etykiety PL, jednostki zawsze). */
export function kolumnyTabeliObszaru(): DefinicjaKolumny[] {
  return [
    { klucz: 'moc', etykieta: OBSZAR_STRINGS.kolMoc, jednostka: OBSZAR_STRINGS.jednMW, mono: true },
    {
      klucz: 'qMin',
      etykieta: OBSZAR_STRINGS.kolQMin,
      jednostka: OBSZAR_STRINGS.jednMvar,
      mono: true,
    },
    {
      klucz: 'qMax',
      etykieta: OBSZAR_STRINGS.kolQMax,
      jednostka: OBSZAR_STRINGS.jednMvar,
      mono: true,
    },
    { klucz: 'granicaDol', etykieta: OBSZAR_STRINGS.kolGranicaDol, sortowalna: false },
    { klucz: 'granicaGor', etykieta: OBSZAR_STRINGS.kolGranicaGor, sortowalna: false },
    { klucz: 'status', etykieta: OBSZAR_STRINGS.kolStatus },
  ];
}

/** Sformatowana wartość Q [Mvar] lub kreska, gdy brak danych. */
function komorkaQ(q: number | null): WierszTabeli[string] {
  if (q === null) return { wartosc: OBSZAR_STRINGS.kreska };
  return { wartosc: fmtMvarObszar(q), sortKey: q };
}

/** Adapter jednego wierzchołka → wiersz wzorca tabeli (semantyka `ValueRow`). */
function wierszWierzcholka(v: WierzcholekObszaruPQ): WierszTabeli {
  const bezPasma = brakPasma(v);
  // Kryterium dolne/górne: dla dopuszczalnego wierzchołka krańce skanu Q; przy
  // braku pasma pracy — kryterium środkowe (Q = 0) w kolumnie granicy dolnej.
  const granicaDol = v.feasible ? v.binding_low : v.binding_center;
  return {
    moc: { wartosc: fmtMWObszar(v.p_mw), sortKey: v.p_mw },
    qMin: komorkaQ(v.q_min_dop_mvar),
    qMax: komorkaQ(v.q_max_dop_mvar),
    granicaDol: { wartosc: opisGranicy(granicaDol) },
    granicaGor: { wartosc: v.feasible ? opisGranicy(v.binding_high) : OBSZAR_STRINGS.kreska },
    // Tag czyta WYŁĄCZNIE flagi z backendu (feasible / równość krańców) — bez oceny fizycznej.
    status: {
      wartosc: bezPasma ? OBSZAR_STRINGS.tagBrakPasma : OBSZAR_STRINGS.tagPasmo,
      ostrzezenie: bezPasma,
    },
  };
}

/** Adapter: widok obszaru → wiersze tabeli wierzchołków (kolejność źródłowa). */
export function wierszeTabeliObszaru(widok: WidokObszaruPQ): WierszTabeli[] {
  return widok.vertices.map(wierszWierzcholka);
}

// ---------------------------------------------------------------------------
// Ślad WHITE BOX (zredukowany) — adapter do kontraktu `SladAnalizy`
// ---------------------------------------------------------------------------

/**
 * Adapter zredukowanego śladu siatki → kroki `SladAnalizy` (KrokSladuSily).
 * Krok 1: podsumowanie siatki (liczba biegów wykonanych / górny limit). Kolejne:
 * po jednym na wierzchołek (moc P → pasmo Q + liczba biegów + granice / brak
 * pasma). Zero ocen — treści wprost z odpowiedzi. Symbol kroku unikalny (P różne).
 */
export function krokiSladuObszar(widok: WidokObszaruPQ): KrokSladuSily[] {
  const { parameters: par } = widok;
  const krokSiatki: KrokSladuSily = {
    symbol: OBSZAR_STRINGS.sladSymbolSiatka,
    formula_latex: OBSZAR_STRINGS.sladWzorSiatka,
    substitution_pl:
      `step_p = ${fmtMWObszar(par.step_p_mw)} MW; step_q = ${fmtMvarObszar(par.step_q_mvar)} Mvar; `
      + `max_steps_p = ${par.max_steps_p}; max_steps_q = ${par.max_steps_q}`,
    result_pl: `${widok.total_runs} / ${par.max_total_runs}`,
  };
  const krokiWierzcholkow: KrokSladuSily[] = widok.vertices.map((v) => {
    if (brakPasma(v)) {
      return {
        symbol: `P = ${fmtMWObszar(v.p_mw)} MW`,
        formula_latex: OBSZAR_STRINGS.sladWzorWiersz,
        substitution_pl: `${OBSZAR_STRINGS.sladBiegi} = ${v.runs}`,
        result_pl: `${OBSZAR_STRINGS.sladBrakPasma}${v.feasible ? '' : ` — ${opisGranicy(v.binding_center)}`}`,
      };
    }
    const qMin = fmtMvarObszar(v.q_min_dop_mvar ?? 0);
    const qMax = fmtMvarObszar(v.q_max_dop_mvar ?? 0);
    return {
      symbol: `P = ${fmtMWObszar(v.p_mw)} MW`,
      formula_latex: OBSZAR_STRINGS.sladWzorWiersz,
      substitution_pl: `${OBSZAR_STRINGS.sladBiegi} = ${v.runs}`,
      result_pl:
        `${OBSZAR_STRINGS.sladPasmo} ∈ [${qMin}${OBSZAR_STRINGS.rozdzielaczPasma}${qMax}] Mvar; `
        + `dół: ${opisGranicy(v.binding_low)}; góra: ${opisGranicy(v.binding_high)}`,
    };
  });
  return [krokSiatki, ...krokiWierzcholkow];
}

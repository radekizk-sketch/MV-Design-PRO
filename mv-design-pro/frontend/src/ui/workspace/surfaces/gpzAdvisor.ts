/**
 * gpzAdvisor.ts — Engineer Assistant logic dla GPZ Configurator (R38).
 *
 * Profesjonalny system doradczy: analizuje stan GPZ z ENM i generuje
 * smart suggestions co inżynier powinien zrobić jako następne kroki.
 *
 * Dla każdego stanu GPZ generuje listę sugestii rangowanych po priorytecie:
 *   - 🔴 BLOCKER: blokuje obliczenia (brak S''k, brak transformatora)
 *   - 🟡 WARNING: niezgodność z best practice (zbyt niski Sk dla mocy zainstalowanej)
 *   - 🔵 SUGGESTION: optymalizacja inżynierska (zastosuj preset, dodaj sprzęgło)
 *   - ✅ INFO: stan OK
 *
 * Live validators:
 *   - S''k vs total Sn ratio (Sk powinien być ≥ 50× Sn dla pełnej kontroli zwarcia)
 *   - R/X w normalnym zakresie (0.05-0.20)
 *   - Voltage match między HV bus a transformer.uhv_kv
 *   - Liczba sekcji vs liczba transformatorów (zwykle 1:1)
 *   - Bilans pól: minimum 4 liniowe per sekcja
 */

import type { Substation, Transformer, Bus, Bay } from '../../../types/enm';

/* =============================================================================
   Suggestion / Validation types
   ============================================================================= */

export type SuggestionLevel = 'blocker' | 'warning' | 'suggestion' | 'info';

export interface GpzSuggestion {
  readonly level: SuggestionLevel;
  readonly title: string;
  readonly description: string;
  /** Karta w której inżynier może zaadresować problem. */
  readonly tab: 'identification' | 'hv-side' | 'transformer' | 'sections' | 'bays-balance' | 'calc-summary' | 'live-results';
  /** Quick action — jeśli istnieje, kliknięcie wykonuje od razu. */
  readonly quickAction?: {
    readonly label: string;
    readonly actionId: string;
    readonly payload?: Record<string, unknown>;
  };
}

export interface GpzAdvisorContext {
  readonly substation: Substation | null;
  readonly transformers: readonly Transformer[];
  readonly hvBuses: readonly Bus[];
  readonly lvBuses: readonly Bus[];
  readonly bays: readonly Bay[];
  readonly hvShortCircuitMva: number | null;
  readonly hvRX: number | null;
}

/* =============================================================================
   Main analysis function
   ============================================================================= */

/**
 * Analizuje stan GPZ i generuje listę sugestii rangowanych po priorytecie.
 *
 * Output: array sugestii sortowanych: BLOCKER → WARNING → SUGGESTION → INFO.
 * Limit 12 wpisów (top priorities).
 */
export function analyzeGpz(ctx: GpzAdvisorContext): readonly GpzSuggestion[] {
  const out: GpzSuggestion[] = [];

  /* === BLOCKERS === */

  if (!ctx.substation) {
    out.push({
      level: 'blocker',
      title: 'Brak substacji w ENM',
      description: 'GPZ nie istnieje w modelu. Wybierz prawdziwy ref lub utwórz nowy GPZ.',
      tab: 'identification',
    });
    return out;
  }

  if ((ctx.substation.name ?? '').trim().length === 0) {
    out.push({
      level: 'blocker',
      title: 'Brak nazwy GPZ',
      description: 'Wpisz nazwę GPZ (np. "GPZ-5 PST"). Bez nazwy obliczenia mają etykietę "—".',
      tab: 'identification',
    });
  }

  if (ctx.transformers.length === 0) {
    out.push({
      level: 'blocker',
      title: 'Brak transformatorów',
      description: 'GPZ wymaga minimum 1 transformatora 110/SN. Wybierz katalog z karty Transformator.',
      tab: 'transformer',
      quickAction: {
        label: 'Otwórz katalog HV',
        actionId: 'switch-tab',
        payload: { tab: 'transformer' },
      },
    });
  }

  if (!ctx.hvShortCircuitMva || ctx.hvShortCircuitMva <= 0) {
    out.push({
      level: 'blocker',
      title: "Brak mocy zwarciowej S''k",
      description: "IEC 60909 wymaga S''k 110 kV dla obliczenia Ik. Bez niego load flow + SC zablokowane.",
      tab: 'hv-side',
      quickAction: {
        label: "Wpisz S''k",
        actionId: 'switch-tab',
        payload: { tab: 'hv-side' },
      },
    });
  }

  /* === WARNINGS === */

  /* HV bus voltage mismatch z transformer.uhv_kv */
  if (ctx.hvBuses.length > 0 && ctx.transformers.length > 0) {
    const hvBus = ctx.hvBuses[0];
    for (const t of ctx.transformers) {
      if (Math.abs(t.uhv_kv - hvBus.voltage_kv) > 1) {
        out.push({
          level: 'warning',
          title: `Niezgodność napięcia HV: bus=${hvBus.voltage_kv} kV, trafo ${t.name}=${t.uhv_kv} kV`,
          description: 'Bus HV i transformator mają różne napięcia znamionowe. Sprawdź konfigurację.',
          tab: 'transformer',
        });
      }
    }
  }

  /* S''k vs total Sn ratio */
  if (ctx.hvShortCircuitMva && ctx.transformers.length > 0) {
    const totalSn = ctx.transformers.reduce((s, t) => s + t.sn_mva, 0);
    const ratio = ctx.hvShortCircuitMva / totalSn;
    if (ratio < 30) {
      out.push({
        level: 'warning',
        title: `Niski ratio S''k/Sn = ${ratio.toFixed(1)} (zalecane ≥ 50)`,
        description:
          `S''k 110 kV ${ctx.hvShortCircuitMva} MVA dla zainstalowanej mocy ${totalSn} MVA daje słabe pole. `
          + 'Może wpłynąć na regulację napięcia, kontrolę zwarcia i selektywność zabezpieczeń.',
        tab: 'hv-side',
      });
    } else if (ratio > 200) {
      out.push({
        level: 'warning',
        title: `Wysoki ratio S''k/Sn = ${ratio.toFixed(1)} (sugeruje wysokie Ik)`,
        description:
          `S''k 110 kV ${ctx.hvShortCircuitMva} MVA generuje duże prądy zwarciowe — `
          + 'sprawdź czy dobranie aparatury (CB, kable) jest adekwatne.',
        tab: 'hv-side',
      });
    }
  }

  /* R/X poza normalnym zakresem 0.05-0.20 */
  if (ctx.hvRX !== null) {
    if (ctx.hvRX < 0.03 || ctx.hvRX > 0.30) {
      out.push({
        level: 'warning',
        title: `R/X = ${ctx.hvRX.toFixed(3)} poza typowym zakresem 0.05-0.20`,
        description:
          'Stosunek R/X poza zakresem może wpłynąć na wyniki obliczeń SC IEC 60909. '
          + 'Sprawdź dane od OSD czy wartość jest poprawna.',
        tab: 'hv-side',
      });
    }
  }

  /* Sekcje vs transformatory mismatch */
  const sectionsCount = ctx.substation.gpz_sections?.length ?? 0;
  if (ctx.transformers.length === 2 && sectionsCount === 1) {
    out.push({
      level: 'warning',
      title: '2 transformatory ale tylko 1 sekcja',
      description:
        'Typowo każdy transformator zasila osobną sekcję dla rezerwy N-1. '
        + 'Rozważ dodanie drugiej sekcji.',
      tab: 'sections',
    });
  }

  /* Brak sprzęgła przy wielu sekcjach */
  if (sectionsCount >= 2 && !ctx.bays.find((b) => b.bay_role === 'COUPLER')) {
    out.push({
      level: 'warning',
      title: 'Brak sprzęgła przy wielu sekcjach',
      description:
        'Sprzęgło międzysekcyjne pozwala automatyczne załączenie rezerwy (SZR) przy awarii transformatora. '
        + 'Bez niego N-1 wymaga ręcznej manipulacji.',
      tab: 'sections',
      quickAction: {
        label: 'Dodaj sprzęgło',
        actionId: 'add-bay-coupler',
      },
    });
  }

  /* Mało pól liniowych */
  const lineBays = ctx.bays.filter((b) => b.bay_role === 'OUT' || b.bay_role === 'FEEDER').length;
  const recommendedLineBays = sectionsCount * 4; // 4 per sekcja minimum
  if (lineBays < recommendedLineBays) {
    out.push({
      level: 'warning',
      title: `Tylko ${lineBays} pól liniowych (zalecane min ${recommendedLineBays})`,
      description:
        `Dla ${sectionsCount} sekcji typowo zalecanych jest ≥ 4 pól liniowych per sekcja. `
        + 'Dodaj pola SN aby umożliwić rozbudowę sieci promieniowej.',
      tab: 'bays-balance',
    });
  }

  /* === SUGGESTIONS === */

  /* Brak adresu/radio */
  const meta = (ctx.substation.meta ?? {}) as Record<string, unknown>;
  if (!meta.address_line || !meta.radio_id) {
    out.push({
      level: 'suggestion',
      title: 'Uzupełnij dane operatora (adres + radio)',
      description: 'Dane lokalizacji + radio pomagają w eksporcie raportów i komunikacji z dyspozytorem.',
      tab: 'identification',
    });
  }

  /* Brak operatora */
  if (!meta.operator) {
    out.push({
      level: 'suggestion',
      title: 'Wskaż OSD',
      description: 'Operator (PSE/Energa/Tauron/Enea/PGE) wpływa na wybor katalogu transformatora i wymagań NC RfG.',
      tab: 'identification',
    });
  }

  /* Quick preset suggestion gdy brak transformatora i sekcji */
  if (ctx.transformers.length === 0 && sectionsCount === 0) {
    out.push({
      level: 'suggestion',
      title: 'Wczytaj typowy preset GPZ',
      description: 'Szybki start: wybierz preset (wiejski/miejski/przemysłowy) który atomicznie wypełni transformator + sekcje + system szyn.',
      tab: 'transformer',
      quickAction: {
        label: 'Otwórz presety',
        actionId: 'switch-tab',
        payload: { tab: 'transformer' },
      },
    });
  }

  /* === INFO === */

  if (ctx.transformers.length > 0 && sectionsCount >= 2 && lineBays >= recommendedLineBays && ctx.hvShortCircuitMva && ctx.hvShortCircuitMva > 0) {
    out.push({
      level: 'info',
      title: 'GPZ jest kompletny inżyniersko',
      description: `${ctx.transformers.length} trafo, ${sectionsCount} sekcji, ${lineBays} pól liniowych. Możesz uruchomić obliczenia z E-23/E-24.`,
      tab: 'live-results',
    });
  }

  /* Sortowanie po priorytecie */
  const priority: Record<SuggestionLevel, number> = { blocker: 0, warning: 1, suggestion: 2, info: 3 };
  out.sort((a, b) => priority[a.level] - priority[b.level]);

  return out.slice(0, 12);
}

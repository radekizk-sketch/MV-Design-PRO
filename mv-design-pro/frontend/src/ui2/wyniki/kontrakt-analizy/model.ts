/**
 * Model ekranu „Kontrakt analizy" — konfiguracja sześciu ekranów kanonicznych
 * E-29/E-30/E-31/E-32/E-33/E-34 (dostawca ui2, karta F-E5a).
 *
 * ZERO fizyki, ZERO pobrań: buduje wyłącznie wiersze klucz→wartość z gotowego
 * kontraktu przebiegu (`AnalysisRunContract`). Wiersze fokusowe i flagi sekcji
 * warunkowych są przeniesione 1:1 z dawnej konfiguracji `THIN_CONTRACT_SURFACES`
 * (`ui/workspace/WorkspaceSurfaceRouter.tsx`, konsolidacja W5b-4) — parytet
 * ZDOLNOŚCI. Formatery kontraktu (`formatContractValue`, `formatCompletenessStatus`)
 * są reużyte read-only, jak fale W1–W3. Dochodzi warstwa prowadzenia: jedno
 * zdanie celu inżynierskiego per obszar (wzorzec opisów kart huba `GRUPY_ANALIZ`).
 */

import {
  formatCompletenessStatus,
  formatContractValue,
  type AnalysisRunContract,
  type LabeledValueRow,
} from '../../../ui/workspace/analysisRunContract';
import { resolveSurfaceObjectLabel } from '../../../ui/workspace/routerLabelHelpers';
import type { WorkspaceSurfaceDescriptor } from '../../../ui/workspace/types';
import type { EnergyNetworkModel } from '../../../types/enm';

/**
 * Kody ekranów obsługiwanych przez dostawcę kontraktu analizy.
 * E-29…E-34 z karty F-E5a. E-27 („Zabezpieczenia i automatyka") był tu tymczasowo
 * (F-E5b) po usunięciu wspólnej atrapy koordynacji; karta E-27 dostarczyła mu
 * realny ekran (`EkranZabezpieczenAutomatyki`), więc wpis został stąd usunięty.
 */
export type KodEkranuKontraktu = 'E-29' | 'E-30' | 'E-31' | 'E-32' | 'E-33' | 'E-34';

/** Kontekst potrzebny do zbudowania wiersza „Obiekt" (tylko E-29). */
export interface KontekstWierszy {
  readonly surface: WorkspaceSurfaceDescriptor;
  readonly selectedElement: Parameters<typeof resolveSurfaceObjectLabel>[2];
  readonly snapshot: EnergyNetworkModel | null;
}

export interface KonfiguracjaEkranu {
  /** Krótka etykieta obszaru (eyebrow). */
  readonly eyebrow: string;
  /** Tytuł obszaru (PL). */
  readonly tytul: string;
  /** JEDNO zdanie celu inżynierskiego: po co ta analiza i z czego czyta. */
  readonly cel: string;
  /** Nagłówek sekcji wierszy fokusowych. */
  readonly tytulWierszy: string;
  /** Wiersze fokusowe kontraktu (parytet 1:1 z THIN_CONTRACT_SURFACES). */
  readonly buildWiersze: (contract: AnalysisRunContract, ctx: KontekstWierszy) => LabeledValueRow[];
  /** Sekcja warunkowa: jawne założenia. */
  readonly pokazZalozenia?: boolean;
  /** Sekcja warunkowa: pochodzenie danych. */
  readonly pokazPochodzenie?: boolean;
  /** Sekcja warunkowa: reprodukowalność. */
  readonly pokazReprodukowalnosc?: boolean;
}

/** Etykiety PL dla założeń (parytet z ASSUMPTION_LABELS mostu). */
export const ETYKIETY_ZALOZEN: Record<string, string> = {
  source_assumptions_ref: 'Założenia źródeł',
  load_assumptions_ref: 'Założenia obciążeń',
  switching_state_ref: 'Stan łączników',
  grounding_assumptions_ref: 'Uziemienie',
  temperature_assumptions_ref: 'Temperatura',
  transformer_tap_assumptions_ref: 'Założenia regulacji zaczepowej',
  ibg_assumptions_ref: 'Model IBG / OZE',
};

/** Etykiety PL dla pochodzenia danych (parytet z LINEAGE_LABELS mostu). */
export const ETYKIETY_POCHODZENIA: Record<string, string> = {
  project_ref: 'Projekt',
  run_ref: 'Obliczenie',
  analysis_type: 'Typ analizy',
  snapshot_ref: 'Wersja układu',
};

/**
 * Konfiguracja sześciu ekranów. Wiersze fokusowe i flagi sekcji przeniesione
 * 1:1 z `THIN_CONTRACT_SURFACES` (W5b-4); zdania celu dopisane per obszar.
 */
export const KONTRAKTY_EKRANOW: Record<KodEkranuKontraktu, KonfiguracjaEkranu> = {
  'E-29': {
    eyebrow: 'Składowe',
    tytul: 'Składowe symetryczne i sieć zerowa',
    cel: 'Sprawdź, jak sposób uziemienia punktu neutralnego i stan łączników kształtują '
      + 'sieć zerową dla zwarć doziemnych — na podstawie założeń zamrożonego przebiegu zwarciowego.',
    tytulWierszy: 'Kontekst Z0',
    buildWiersze: (contract, { surface, selectedElement, snapshot }) => [
      { label: 'Obiekt', value: resolveSurfaceObjectLabel(surface, snapshot, selectedElement) },
      { label: 'Wersja układu', value: formatContractValue(contract.analysisCaseContext?.snapshotRef) },
      { label: 'Uziemienie', value: formatContractValue(contract.analysisCaseContext?.assumptions['grounding_assumptions_ref']) },
      { label: 'Stan łączników', value: formatContractValue(contract.analysisCaseContext?.assumptions['switching_state_ref']) },
      { label: 'Zakres stosowalności', value: formatContractValue(contract.analysisCaseContext?.applicabilityScope) },
    ],
  },
  'E-30': {
    eyebrow: 'Rozpływ mocy',
    tytul: 'Zbieżność rozpływu i sterowanie zaczepami',
    cel: 'Oceń zbieżność solvera rozpływu (NR/GS/FD) i założenia regulacji zaczepowej '
      + 'transformatorów — na podstawie kontraktu zakończonego przebiegu rozpływu mocy.',
    tytulWierszy: 'Kontrakt solvera',
    buildWiersze: (contract) => [
      { label: 'Typ analizy', value: formatContractValue(contract.analysisType) },
      { label: 'Ważność wyniku', value: formatContractValue(contract.resultsValid) },
      { label: 'Założenia OLTC', value: formatContractValue(contract.analysisCaseContext?.assumptions['transformer_tap_assumptions_ref']) },
      { label: 'Wersja układu', value: formatContractValue(contract.analysisCaseContext?.snapshotRef) },
      { label: 'Zakres stosowalności', value: formatContractValue(contract.analysisCaseContext?.applicabilityScope) },
    ],
  },
  'E-31': {
    eyebrow: 'Analiza fazowa',
    tytul: 'Stan fazowy SN',
    cel: 'Zweryfikuj kontrakt analizy stanu fazowego sieci SN: rodzaj przypadku, bramę '
      + 'jakości i kompletność danych wejściowych — na podstawie kontekstu obliczeniowego przebiegu.',
    tytulWierszy: 'Kontrakt stanu fazowego',
    buildWiersze: (contract) => [
      { label: 'Identyfikator przypadku', value: formatContractValue(contract.analysisCaseContext?.caseRef) },
      { label: 'Rodzaj przypadku', value: formatContractValue(contract.analysisCaseContext?.caseKind) },
      { label: 'Wersja układu', value: formatContractValue(contract.analysisCaseContext?.snapshotRef) },
      { label: 'Brama jakości', value: formatContractValue(contract.analysisCaseContext?.qualityGate) },
      { label: 'Kompletność zgodności przejściowej', value: formatContractValue(contract.analysisCaseContext?.completenessLegacy) },
    ],
    pokazZalozenia: true,
    pokazPochodzenie: true,
    pokazReprodukowalnosc: true,
  },
  'E-32': {
    eyebrow: 'Dynamika',
    tytul: 'Stabilność dynamiczna',
    cel: 'Oceń warunki analizy stabilności dynamicznej: scenariusz zakłócenia, stan '
      + 'łączników i założenia źródeł — na podstawie kontraktu zakończonego przebiegu.',
    tytulWierszy: 'Kontrakt stabilności',
    buildWiersze: (contract) => [
      { label: 'Scenariusz zakłócenia', value: formatContractValue(contract.analysisCaseContext?.assumptions['fault_scenario_ref']) },
      { label: 'Stan łączników', value: formatContractValue(contract.analysisCaseContext?.assumptions['switching_state_ref']) },
      { label: 'Założenia źródeł', value: formatContractValue(contract.analysisCaseContext?.assumptions['source_assumptions_ref']) },
      { label: 'Zakres stosowalności', value: formatContractValue(contract.analysisCaseContext?.applicabilityScope) },
      { label: 'Wersja układu', value: formatContractValue(contract.analysisCaseContext?.snapshotRef) },
    ],
  },
  'E-33': {
    eyebrow: 'Wkłady źródeł',
    tytul: 'Wkłady źródeł rozszerzone',
    cel: 'Prześledź, jakie założenia źródeł i obciążeń wchodzą do rozszerzonej analizy '
      + 'wkładów źródeł w prąd zwarciowy — na podstawie kontraktu zakończonego przebiegu zwarciowego.',
    tytulWierszy: 'Kontrakt źródeł',
    buildWiersze: (contract) => [
      { label: 'Rodzaj przypadku', value: formatContractValue(contract.analysisCaseContext?.caseKind) },
      { label: 'Założenia źródeł', value: formatContractValue(contract.analysisCaseContext?.assumptions['source_assumptions_ref']) },
      { label: 'Założenia obciążeń', value: formatContractValue(contract.analysisCaseContext?.assumptions['load_assumptions_ref']) },
      { label: 'Zakres stosowalności', value: formatContractValue(contract.analysisCaseContext?.applicabilityScope) },
      { label: 'Projekt', value: formatContractValue(contract.analysisCaseContext?.lineage['project_ref']) },
    ],
  },
  'E-34': {
    eyebrow: 'Ocena toru',
    tytul: 'Weryfikacja cieplna i dynamiczna toru',
    cel: 'Sprawdź warunki weryfikacji cieplnej (I_th) i dynamicznej (I_dyn) toru prądowego: '
      + 'temperatura, obciążenia i źródła — na podstawie kontraktu zakończonego przebiegu zwarciowego.',
    tytulWierszy: 'Kontrakt toru',
    buildWiersze: (contract) => [
      { label: 'Temperatura', value: formatContractValue(contract.analysisCaseContext?.assumptions['temperature_assumptions_ref']) },
      { label: 'Założenia obciążeń', value: formatContractValue(contract.analysisCaseContext?.assumptions['load_assumptions_ref']) },
      { label: 'Założenia źródeł', value: formatContractValue(contract.analysisCaseContext?.assumptions['source_assumptions_ref']) },
      { label: 'Wersja układu', value: formatContractValue(contract.analysisCaseContext?.snapshotRef) },
      { label: 'Kompletność', value: formatCompletenessStatus(contract.analysisCaseContext?.completeness ?? null) },
    ],
  },
};

/** Czy dany kod ekranu jest obsługiwany przez dostawcę kontraktu analizy. */
export function jestKodemKontraktu(kod: string): kod is KodEkranuKontraktu {
  return kod in KONTRAKTY_EKRANOW;
}

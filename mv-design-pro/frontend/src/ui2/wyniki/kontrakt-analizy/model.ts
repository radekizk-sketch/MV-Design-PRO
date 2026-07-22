/**
 * Model ekranu „Kontrakt analizy” — konfiguracja dwoch pozostalych ekranow
 * kanonicznych E-29/E-32 (dostawca ui2, karta F-E5a; E-30/E-31 maja realne
 * ekrany od karty P-2, E-33/E-34 prowadza do realnych dostawcow od karty P-1).
 *
 * ZERO fizyki, ZERO pobrań: buduje wyłącznie wiersze klucz→wartość z gotowego
 * kontraktu przebiegu (`AnalysisRunContract`). Wiersze fokusowe i flagi sekcji
 * warunkowych są przeniesione 1:1 z dawnej konfiguracji `THIN_CONTRACT_SURFACES`
 * (`ui/workspace/WorkspaceSurfaceRouter.tsx`, konsolidacja W5b-4) — parytet
 * ZDOLNOŚCI. Formater kontraktu (`formatContractValue`)
 * jest reużyty read-only, jak fale W1–W3. Dochodzi warstwa prowadzenia: jedno
 * zdanie celu inżynierskiego per obszar (wzorzec opisów kart huba `GRUPY_ANALIZ`).
 */

import {
  formatContractValue,
  type AnalysisRunContract,
  type LabeledValueRow,
} from '../../../ui/workspace/analysisRunContract';
import { resolveSurfaceObjectLabel } from '../../../ui/workspace/routerLabelHelpers';
import type { WorkspaceSurfaceDescriptor } from '../../../ui/workspace/types';
import type { EnergyNetworkModel } from '../../../types/enm';

/**
 * Kody ekranów obsługiwanych przez dostawcę kontraktu analizy.
 * E-29…E-32 z karty F-E5a. E-27 („Zabezpieczenia i automatyka") był tu tymczasowo
 * (F-E5b) po usunięciu wspólnej atrapy koordynacji; karta E-27 dostarczyła mu
 * realny ekran (`EkranZabezpieczenAutomatyki`), więc wpis został stąd usunięty.
 * E-33 („Wkłady źródeł rozszerzone") i E-34 („Weryfikacja cieplna i dynamiczna
 * toru") mają REALNYCH dostawców w warsztacie Wyników — zakładka zwarć
 * (sekcja „Wkłady do zwarcia" + panel „Bilans IEC 60909"); karta P-1 usunęła
 * ich wpisy kontraktowe (zdolności zostają w rejestrze kanonu, prowadzą tam
 * deep-linki `setWynikiTab('zwarcia')`).
 * E-30 („Zbieżność rozpływu i zaczepy") i E-31 („Stan fazowy SN") dostały
 * realne ekrany kartą P-2 (`wyniki/zbieznosc/EkranZbieznosci`,
 * `wyniki/stan-fazowy/EkranStanuFazowego`) — wpisy usunięte.
 */
export type KodEkranuKontraktu = 'E-29' | 'E-32';

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
 * Konfiguracja ekranów kontraktu. Wiersze fokusowe i flagi sekcji przeniesione
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
};

/** Czy dany kod ekranu jest obsługiwany przez dostawcę kontraktu analizy. */
export function jestKodemKontraktu(kod: string): kod is KodEkranuKontraktu {
  return kod in KONTRAKTY_EKRANOW;
}

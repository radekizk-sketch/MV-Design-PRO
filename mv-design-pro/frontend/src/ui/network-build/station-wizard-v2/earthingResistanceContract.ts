/**
 * Earthing Resistance Contract — dobór rezystancji uziemienia stacji.
 *
 * Źródło: Excel MT880 v3, sekcja "Dobór rezystancji uziemienia"
 * + ENEA Standard "Dobór środków ochrony przed porażeniem prądem
 * elektrycznym w sieci SN. Zeszyt 1." (zatwierdzony 2021-06-30).
 *
 * Wymagania:
 *   1. RB ≤ UF / IK1
 *      gdzie:
 *        UF — dopuszczalne napięcie zakłóceniowe (V) odczytane z krzywej
 *             dla czasu trwania doziemienia tF (PN-EN 50522)
 *        IK1 — prąd doziemienia w punkcie zwarcia (A)
 *
 *   2. RB ≤ U0 × RE / (Un − U0)  — wariant z włączeniem RE
 *
 * Prąd doziemienia IK1:
 *   IK1 = Σ(IcsX × kSekcja) + IAWSCz × nAWSCz
 *   gdzie:
 *     IcsX — pojemnościowy prąd zwarcia doziemnego sekcji X (A)
 *     IAWSCz — prąd czynny wmuszany przez Automatykę Wymuszania Składowej Czynnej
 *     nAWSCz — liczba układów AWSCz (standardowo 2 dla najgorszego przypadku)
 *
 * Czas trwania doziemienia tF:
 *   tF = t_oczekiwania_AWSCz + t_zabezpieczenia + t_własny_wyłącznika
 *   Typowo: 1.0 + 1.0 + 0.05 = 2.05 s — dla linii bez SPZ
 *           1.0 + 1.0 + 0.05 + Tprz_SPZ = 3.10 s — dla linii z SPZ
 */

export interface EarthingFaultCurrentInput {
  /** Pojemnościowy prąd zwarcia doziemnego sekcji 1 IcsA (A). */
  readonly icsSectionA_A: number;
  /** Pojemnościowy prąd zwarcia doziemnego sekcji 2 IcsB (A). */
  readonly icsSectionB_A: number;
  /** Prąd czynny AWSCz per układ (A, typ. 20 A). */
  readonly awsczCurrentA: number;
  /** Liczba układów AWSCz (typ. 2 dla najgorszego przypadku). */
  readonly awsczCount: number;
}

export interface EarthingFaultCurrentResult {
  readonly icsTotal_A: number;
  readonly awsczTotal_A: number;
  readonly ik1_A: number;
}

export function computeEarthingFaultCurrent(
  input: EarthingFaultCurrentInput,
): EarthingFaultCurrentResult {
  const ics = input.icsSectionA_A + input.icsSectionB_A;
  const awscz = input.awsczCurrentA * input.awsczCount;
  return {
    icsTotal_A: ics,
    awsczTotal_A: awscz,
    ik1_A: ics + awscz,
  };
}

export interface FaultDurationInput {
  /** Czas oczekiwania AWSCz (s). */
  readonly awsczDelaySec: number;
  /** Nastawa czasu zabezpieczenia ziemnozwarciowego (s). */
  readonly protectionTimeSec: number;
  /** Czas własny wyłącznika (s). */
  readonly cbOpenTimeSec: number;
  /** Liczba cykli SPZ (0 dla linii bez SPZ). */
  readonly spzCycles: number;
  /** Czas przerwy bezprądowej w SPZ (s, typ. 0.05-3 s). */
  readonly spzDeadTimeSec: number;
}

export function computeFaultDuration(input: FaultDurationInput): number {
  const baseTime = input.awsczDelaySec + input.protectionTimeSec + input.cbOpenTimeSec;
  return baseTime + input.spzCycles * (input.spzDeadTimeSec + baseTime);
}

/**
 * Dopuszczalne napięcie zakłóceniowe UF per PN-EN 50522 Figure 4.
 * Wartości tabelaryczne (wraz z interpolacją liniową).
 *
 * Dla tF=3.1s → UF=87V (per Excel MT880 v3).
 */
export function permittedFaultVoltageVfromDurationS(tF: number): number {
  // Tabela z PN-EN 50522 Annex B Figure 4 (touch voltage curve).
  // Wartości typowe interpolowane:
  const tablePoints: ReadonlyArray<[number, number]> = [
    [0.05, 700], [0.1, 500], [0.2, 250], [0.5, 200],
    [1.0, 130], [2.0, 100], [3.0, 89], [5.0, 80], [10.0, 75],
  ];
  if (tF <= tablePoints[0][0]) return tablePoints[0][1];
  if (tF >= tablePoints[tablePoints.length - 1][0]) {
    return tablePoints[tablePoints.length - 1][1];
  }
  for (let i = 0; i < tablePoints.length - 1; i++) {
    const [t0, u0] = tablePoints[i];
    const [t1, u1] = tablePoints[i + 1];
    if (tF >= t0 && tF <= t1) {
      // Interpolacja liniowa.
      return u0 + (u1 - u0) * ((tF - t0) / (t1 - t0));
    }
  }
  return tablePoints[tablePoints.length - 1][1];
}

/**
 * Wymagana maksymalna rezystancja uziomu stacji.
 */
export interface EarthingRequirementInput {
  /** Dopuszczalne napięcie zakłóceniowe UF (V). */
  readonly uF_V: number;
  /** Prąd doziemienia IK1 (A). */
  readonly ik1_A: number;
  /** Wariant z RE — minimalna rezystancja styku z ziemią (Ω). 0 = ignoruj. */
  readonly reMinOhm?: number;
  /** Napięcie U0 (V) — nominalne napięcie przemienne względem ziemi. Typ. 230 V. */
  readonly u0_V?: number;
  /** Napięcie sieci Un (V) — typ. 400 V dla nN. */
  readonly un_V?: number;
}

export interface EarthingRequirementResult {
  /** RB ≤ UF / IK1. */
  readonly rb_max_uf_method_ohm: number;
  /** RB ≤ U0 × RE / (Un − U0). Tylko gdy RE i Un podane. */
  readonly rb_max_re_method_ohm: number | null;
  /** Wynikowa max RB — minimum z dwóch metod. */
  readonly rb_max_resulting_ohm: number;
}

export function computeEarthingRequirement(
  input: EarthingRequirementInput,
): EarthingRequirementResult {
  const rbUf = input.uF_V / input.ik1_A;
  let rbRe: number | null = null;
  if (input.reMinOhm && input.reMinOhm > 0 && input.u0_V && input.un_V) {
    rbRe = (input.u0_V * input.reMinOhm) / (input.un_V - input.u0_V);
  }
  const resulting = rbRe !== null ? Math.min(rbUf, rbRe) : rbUf;
  return {
    rb_max_uf_method_ohm: rbUf,
    rb_max_re_method_ohm: rbRe,
    rb_max_resulting_ohm: resulting,
  };
}

/**
 * Rezystancja uziomu otokowego (pętla wokół stacji), per PN-EN 50522.
 * R_otok = ρ_grunt × (kE × π / 4×D)
 * gdzie D = promień zastępczy uziomu otokowego (m).
 * Dla otoku w kształcie prostokąta R = √(L×W)/2.
 */
export function computeRingEarthingResistance(
  groundResistivityOhmM: number,
  ringRadiusM: number,
): number {
  // Uproszczone: R ≈ ρ × ln(d/r) / (2π × d) dla pierścienia w gruncie.
  // Excel używa wartości tabelarycznych po f-cji rEobl = kE × ρ.
  // Tutaj wzór bezpośredni dla pierścienia z PN-EN 50522 Annex A.
  if (ringRadiusM <= 0) return Infinity;
  return groundResistivityOhmM / (2 * Math.PI * ringRadiusM);
}

export function computeVerticalRodResistance(
  groundResistivityOhmM: number,
  rodLengthM: number,
  rodDiameterM: number,
): number {
  // R = ρ / (2π × l) × ln(4l/d) — uziom pionowy (rod).
  if (rodLengthM <= 0 || rodDiameterM <= 0) return Infinity;
  return (
    (groundResistivityOhmM / (2 * Math.PI * rodLengthM)) *
    Math.log((4 * rodLengthM) / rodDiameterM)
  );
}

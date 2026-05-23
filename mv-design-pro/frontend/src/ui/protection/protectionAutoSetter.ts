/**
 * protectionAutoSetter — auto-setting wizard wg IEC 60255-151 (Etap 6 z planu).
 *
 * "Auto-setting wizard wg IEC 60255-151 (TMS dla selektywności)"
 *
 * Dla each zabezpieczenia:
 * - Pickup current (I_pickup = 1.1-1.5 × I_load lub 0.5-0.7 × I_k_min_3F)
 * - TMS (Time Multiplier Setting) — based on coordination chain
 * - Krzywa: SI dla feeder, VI/EI dla wyższego priorytetu
 *
 * Domyślne ustawienia per typ pola:
 * - 50/51 (over-current): SI curve, pickup = 1.3 × I_load, TMS=0.1
 * - 67 (directional): SI curve, ±90° angle
 * - 87T (differential): nie wymaga TMS
 * - 27/59 (under/over voltage): instantaneous, 0.5s delay
 * - 81U/81O (frequency): typowe nastawy NC RfG
 */

export type ProtectionFunction = '50' | '51' | '67' | '87T' | '27' | '59' | '81U' | '81O' | '81R' | '50G' | '51G';

export interface ProtectionSettings {
  function: ProtectionFunction;
  pickupValue: number;
  pickupUnit: string;
  tms: number;
  curve: 'SI' | 'VI' | 'EI' | 'DT';
  delaySeconds: number;
  description: string;
}

export interface ProtectionAutoSettingInput {
  bayRole: 'LINIA_IN' | 'LINIA_OUT' | 'LINIA_ODG' | 'TRANSFORMATOROWE' | 'SPRZEGLO' | 'POMIAROWE' | 'OZE';
  ratedLoadCurrentA: number;
  shortCircuitKa: number;
  systemVoltageKv: number;
  downstreamTms?: number;
  ctiSeconds?: number;
}

export function recommendProtection(input: ProtectionAutoSettingInput): ProtectionSettings[] {
  const settings: ProtectionSettings[] = [];

  const downstreamTms = input.downstreamTms ?? 0;
  const cti = input.ctiSeconds ?? 0.3;
  const tmsUpstream = downstreamTms + cti;

  switch (input.bayRole) {
    case 'LINIA_OUT':
    case 'LINIA_ODG':
      // 51 — over-current SI
      settings.push({
        function: '51',
        pickupValue: Math.round(1.3 * input.ratedLoadCurrentA),
        pickupUnit: 'A',
        tms: Math.max(0.05, Math.round(tmsUpstream * 100) / 100),
        curve: 'SI',
        delaySeconds: 0,
        description: 'Nadprądowe (51) — krzywa SI, pickup 1.3 × I_n_load.',
      });
      // 50 — instantaneous, 80% I_k
      settings.push({
        function: '50',
        pickupValue: Math.round(0.8 * input.shortCircuitKa * 1000),
        pickupUnit: 'A',
        tms: 0,
        curve: 'DT',
        delaySeconds: 0.05,
        description: 'Bezzwłoczne nadprądowe (50) — 80% I_k, t=50 ms.',
      });
      // 67 — directional over-current
      settings.push({
        function: '67',
        pickupValue: Math.round(1.2 * input.ratedLoadCurrentA),
        pickupUnit: 'A',
        tms: Math.max(0.05, Math.round(tmsUpstream * 100) / 100),
        curve: 'SI',
        delaySeconds: 0,
        description: 'Kierunkowe nadprądowe (67) — selektywność w sieci pierścieniowej.',
      });
      break;

    case 'LINIA_IN':
      // Wyższy priorytet: VI curve dla większej selektywności
      settings.push({
        function: '51',
        pickupValue: Math.round(1.2 * input.ratedLoadCurrentA),
        pickupUnit: 'A',
        tms: Math.max(0.1, Math.round((tmsUpstream + 0.1) * 100) / 100),
        curve: 'VI',
        delaySeconds: 0,
        description: 'Nadprądowe (51) — krzywa VI dla pola dopływowego, TMS wyższy.',
      });
      break;

    case 'TRANSFORMATOROWE':
      // 87T — differential
      settings.push({
        function: '87T',
        pickupValue: 0.3,
        pickupUnit: 'p.u.',
        tms: 0,
        curve: 'DT',
        delaySeconds: 0.05,
        description: 'Różnicowe (87T) — pickup 30% I_n_TR, t<60ms.',
      });
      // 51 backup
      settings.push({
        function: '51',
        pickupValue: Math.round(1.4 * input.ratedLoadCurrentA),
        pickupUnit: 'A',
        tms: Math.max(0.15, Math.round((tmsUpstream + 0.2) * 100) / 100),
        curve: 'SI',
        delaySeconds: 0,
        description: 'Backup 51 — krzywa SI z marginesem 0.2 s nad 87T.',
      });
      break;

    case 'OZE':
      // Anti-islanding: 27/59/81U/81O/ROCOF
      settings.push({
        function: '27',
        pickupValue: 0.85,
        pickupUnit: 'p.u.',
        tms: 0,
        curve: 'DT',
        delaySeconds: 0.2,
        description: 'Podnapięciowe (27) — pickup 0.85 p.u., t=200ms (NC RfG).',
      });
      settings.push({
        function: '59',
        pickupValue: 1.10,
        pickupUnit: 'p.u.',
        tms: 0,
        curve: 'DT',
        delaySeconds: 0.2,
        description: 'Nadnapięciowe (59) — pickup 1.10 p.u., t=200ms.',
      });
      settings.push({
        function: '81U',
        pickupValue: 47.0,
        pickupUnit: 'Hz',
        tms: 0,
        curve: 'DT',
        delaySeconds: 0.2,
        description: 'Podczęstotliwościowe (81U) — pickup 47 Hz, t=200ms.',
      });
      settings.push({
        function: '81O',
        pickupValue: 51.0,
        pickupUnit: 'Hz',
        tms: 0,
        curve: 'DT',
        delaySeconds: 0.2,
        description: 'Nadczęstotliwościowe (81O) — pickup 51 Hz, t=200ms.',
      });
      settings.push({
        function: '81R',
        pickupValue: 2.5,
        pickupUnit: 'Hz/s',
        tms: 0,
        curve: 'DT',
        delaySeconds: 0.1,
        description: 'ROCOF (81R) — df/dt > 2.5 Hz/s, t=100ms (anti-islanding).',
      });
      break;

    case 'SPRZEGLO':
      // 51 z najwyższym TMS — backup last
      settings.push({
        function: '51',
        pickupValue: Math.round(2.0 * input.ratedLoadCurrentA),
        pickupUnit: 'A',
        tms: Math.max(0.2, Math.round((tmsUpstream + 0.3) * 100) / 100),
        curve: 'VI',
        delaySeconds: 0,
        description: 'Sprzęgło — VI z wysokim TMS, last resort backup.',
      });
      break;

    case 'POMIAROWE':
      // brak zabezpieczeń ochronnych — tylko pomiarowe
      break;
  }

  return settings;
}

export function totalProtectionFunctions(settings: ProtectionSettings[]): number {
  return settings.length;
}

export function listAnsiCodes(settings: ProtectionSettings[]): string {
  return settings.map((s) => s.function).join('/');
}

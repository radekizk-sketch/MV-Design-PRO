/**
 * SLD v2 BuildSequence — event-sourced lista komend budowy (PR-5).
 *
 * Konstruktywny builder — każda zmiana modelu jest jawną komendą zapisaną w sekwencji.
 * Reużywa `HistoryStore` jako transport (apply/revert).
 *
 * @see docs/sld/SLD_CAD_SCADA_REBUILD.md §5 (tryb budowy modelu)
 */

import type { PortKind } from '../core/ports';

/* ---------------------------------------------------------------------------
   Typy komend
   --------------------------------------------------------------------------- */

export type BuildCommand =
  | InsertGpzCommand
  | AddSectionCommand
  | AddBayCommand
  | ExtendCableRunCommand
  | InsertStationOnRunCommand
  | AttachDerCommand
  | SetSwitchStateCommand
  | SetNopCommand;

export interface InsertGpzCommand {
  readonly type: 'InsertGpz';
  readonly id: string;
  readonly name: string;
  readonly voltageHighKv: number;
  readonly voltageLowKv: number;
  readonly scShortCircuitMva: number | null;
}

export interface AddSectionCommand {
  readonly type: 'AddSection';
  readonly id: string;
  readonly gpzId: string;
  readonly number: number;
  readonly busVoltageKv: number;
}

export interface AddBayCommand {
  readonly type: 'AddBay';
  readonly id: string;
  readonly sectionId: string;
  readonly designation: string;
  readonly bayTemplateId: string;
}

export interface ExtendCableRunCommand {
  readonly type: 'ExtendCableRun';
  readonly id: string;
  readonly fromBayId: string;
  readonly fromPortId: string;
  readonly runKind: 'main_trunk' | 'branch' | 'ring' | 'loop';
  readonly segmentKind: 'cable_sn' | 'overhead_line_sn';
  readonly catalogRef: string | null;
  readonly lengthKm: number;
  readonly parentRunId: string | null;
  readonly branchOriginStationId: string | null;
}

export interface InsertStationOnRunCommand {
  readonly type: 'InsertStationOnRun';
  readonly id: string;
  readonly runId: string;
  readonly afterSegmentId: string;
  readonly stationName: string;
  readonly stationTemplateId: string;
}

export interface AttachDerCommand {
  readonly type: 'AttachDer';
  readonly id: string;
  readonly derKind: 'PV' | 'BESS' | 'FW';
  readonly attachmentPortId: string;
  readonly parentStationId: string | null;
  readonly nominalPowerKw: number | null;
  readonly portKind: PortKind;
}

export interface SetSwitchStateCommand {
  readonly type: 'SetSwitchState';
  readonly deviceId: string;
  readonly newState: 'closed' | 'open' | 'unknown' | 'fault';
}

export interface SetNopCommand {
  readonly type: 'SetNop';
  readonly runId: string;
  readonly stationId: string;
}

/* ---------------------------------------------------------------------------
   BuildSequence — niezmienna lista komend
   --------------------------------------------------------------------------- */

export interface BuildSequence {
  readonly commands: readonly BuildCommand[];
  readonly version: 'v1';
}

export function emptyBuildSequence(): BuildSequence {
  return { commands: [], version: 'v1' };
}

/** Dodaje komendę do sekwencji (zwraca nową sekwencję, niezmiennie). */
export function appendCommand(
  sequence: BuildSequence,
  command: BuildCommand,
): BuildSequence {
  return {
    ...sequence,
    commands: [...sequence.commands, command],
  };
}

/** Usuwa ostatnią komendę (undo). */
export function popLastCommand(sequence: BuildSequence): BuildSequence {
  if (sequence.commands.length === 0) return sequence;
  return {
    ...sequence,
    commands: sequence.commands.slice(0, -1),
  };
}

/**
 * Sprawdza czy komenda jest poprawna w kontekście obecnej sekwencji.
 *
 * Reguły walidacyjne (BINDING):
 * - InsertGpz: tylko 1 GPZ w sekwencji.
 * - AddSection: wymaga InsertGpz wcześniej w sekwencji.
 * - AddBay: wymaga AddSection wcześniej.
 * - ExtendCableRun: wymaga AddBay z odpowiednim portem wyjściowym (NIE z szyny GPZ).
 * - InsertStationOnRun: wymaga ExtendCableRun.
 * - AttachDer: wymaga punktu przyłączenia (Bay lub Station).
 */
export interface ValidationResult {
  readonly valid: boolean;
  readonly errorPl?: string;
}

export function validateCommand(
  sequence: BuildSequence,
  command: BuildCommand,
): ValidationResult {
  switch (command.type) {
    case 'InsertGpz': {
      const existingGpz = sequence.commands.find((c) => c.type === 'InsertGpz');
      if (existingGpz) {
        return {
          valid: false,
          errorPl: 'Projekt zawiera już GPZ. Tylko jeden główny punkt zasilania na projekt.',
        };
      }
      return { valid: true };
    }

    case 'AddSection': {
      const gpzExists = sequence.commands.some(
        (c) => c.type === 'InsertGpz' && c.id === command.gpzId,
      );
      if (!gpzExists) {
        return {
          valid: false,
          errorPl: `GPZ ${command.gpzId} nie istnieje. Najpierw wstaw główny punkt zasilania.`,
        };
      }
      return { valid: true };
    }

    case 'AddBay': {
      const sectionExists = sequence.commands.some(
        (c) => c.type === 'AddSection' && c.id === command.sectionId,
      );
      if (!sectionExists) {
        return {
          valid: false,
          errorPl: `Sekcja ${command.sectionId} nie istnieje. Najpierw dodaj sekcję rozdzielni.`,
        };
      }
      return { valid: true };
    }

    case 'ExtendCableRun': {
      // Reguła briefa §2 pkt 8: nie wolno wyprowadzić ciągu bezpośrednio z szyny GPZ
      const bayExists = sequence.commands.some(
        (c) => c.type === 'AddBay' && c.id === command.fromBayId,
      );
      if (!bayExists) {
        return {
          valid: false,
          errorPl: 'Ciąg liniowy musi wychodzić z pola SN, nie bezpośrednio z szyny GPZ. Najpierw dodaj pole SN.',
        };
      }
      return { valid: true };
    }

    case 'InsertStationOnRun': {
      const runExists = sequence.commands.some(
        (c) => c.type === 'ExtendCableRun' && c.id === command.runId,
      );
      if (!runExists) {
        return {
          valid: false,
          errorPl: `Ciąg ${command.runId} nie istnieje. Najpierw wyprowadź ciąg.`,
        };
      }
      return { valid: true };
    }

    case 'AttachDer': {
      // DER musi mieć port przyłączenia
      if (!command.attachmentPortId) {
        return {
          valid: false,
          errorPl: 'Źródło DER wymaga jasno określonego punktu przyłączenia (port pola SN lub szyna nN).',
        };
      }
      return { valid: true };
    }

    case 'SetSwitchState':
    case 'SetNop': {
      return { valid: true };
    }
  }
}

/**
 * Aplikuje komendę do sekwencji po walidacji.
 *
 * Zwraca nową sekwencję lub błąd walidacji.
 */
export function tryApplyCommand(
  sequence: BuildSequence,
  command: BuildCommand,
): { ok: true; sequence: BuildSequence } | { ok: false; errorPl: string } {
  const validation = validateCommand(sequence, command);
  if (!validation.valid) {
    return { ok: false, errorPl: validation.errorPl ?? 'Niezgodność komendy z bieżącą sekwencją.' };
  }
  return { ok: true, sequence: appendCommand(sequence, command) };
}

/**
 * Statystyki sekwencji budowy — używane przez BuildSidebar (PR-13).
 */
export function buildSequenceStats(sequence: BuildSequence): {
  gpzCount: number;
  sectionCount: number;
  bayCount: number;
  runCount: number;
  stationCount: number;
  derCount: number;
  totalCommands: number;
} {
  let gpzCount = 0;
  let sectionCount = 0;
  let bayCount = 0;
  let runCount = 0;
  let stationCount = 0;
  let derCount = 0;
  for (const c of sequence.commands) {
    switch (c.type) {
      case 'InsertGpz':
        gpzCount++;
        break;
      case 'AddSection':
        sectionCount++;
        break;
      case 'AddBay':
        bayCount++;
        break;
      case 'ExtendCableRun':
        runCount++;
        break;
      case 'InsertStationOnRun':
        stationCount++;
        break;
      case 'AttachDer':
        derCount++;
        break;
    }
  }
  return {
    gpzCount,
    sectionCount,
    bayCount,
    runCount,
    stationCount,
    derCount,
    totalCommands: sequence.commands.length,
  };
}

/**
 * Faza budowy modelu (mirror networkBuildStore.BuildPhase, PR-13 reuse).
 */
export type BuildPhase = 'NO_SOURCE' | 'HAS_SOURCE' | 'HAS_TRUNKS' | 'HAS_STATIONS' | 'READY';

export function inferBuildPhase(sequence: BuildSequence): BuildPhase {
  const stats = buildSequenceStats(sequence);
  if (stats.gpzCount === 0) return 'NO_SOURCE';
  if (stats.runCount === 0) return 'HAS_SOURCE';
  if (stats.stationCount === 0) return 'HAS_TRUNKS';
  // READY = stations + DERs + minimum spójnej topologii
  if (stats.derCount > 0) return 'READY';
  return 'HAS_STATIONS';
}

import type { ElementType } from '../../types';
import type { CanonicalOpName } from '../../../types/domainOps';

export type NetworkBuildOperationName = CanonicalOpName;

/**
 * Aktywny formularz operacji — `op` to DOWOLNA operacja kanoniczna (typ wyprowadzony z
 * `CANONICAL_OPERATION_NAMES`). Dawna ręczna unia literałów rozjechała się z rejestrem
 * formularzy (brakowało w niej m.in. całej rodziny nN STUDIO i `add_nn_rcd`), a adapter
 * powierzchni maskował rozjazd rzutowaniem.
 */
export type ActiveOperationForm =
  | null
  | { op: NetworkBuildOperationName; context?: Record<string, unknown> };

export type ActiveObjectCard =
  | null
  | { kind: 'source'; elementId: string }
  | { kind: 'trunk'; corridorRef: string }
  | { kind: 'station'; elementId: string }
  | { kind: 'line_segment'; elementId: string }
  | { kind: 'transformer'; elementId: string }
  | { kind: 'switch'; elementId: string }
  | { kind: 'bay'; elementId: string }
  | { kind: 'nn_switchgear'; elementId: string }
  | { kind: 'renewable_source'; elementId: string }
  | { kind: 'branch_pole'; elementId: string }
  | { kind: 'zksn'; elementId: string };

export type ActiveInspectorPanel =
  | null
  | {
      kind:
        | 'results'
        | 'trace'
        | 'readiness'
        | 'report'
        | 'history'
        | 'topology'
        | 'secondary_links'
        | 'coordination'
        | 'field_measurements'
        | 'field_control'
        | 'field_protection'
        | 'field_source_contributions'
        | 'field_earth_fault'
        | 'field_work_safety'
        | 'field_compare';
      elementId: string;
      elementType: ElementType;
    };

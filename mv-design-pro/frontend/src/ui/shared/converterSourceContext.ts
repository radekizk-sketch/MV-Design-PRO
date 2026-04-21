import type { CreatorTool } from '../topology/editorPalette';

export type ConverterSourceTechnology = 'PV' | 'BESS' | 'FW';

export type ConverterSourceOperationContext = Record<string, unknown> & {
  source_technology: ConverterSourceTechnology;
  connection_variant: 'nn_side';
};

export function buildConverterSourceOperationContext(
  sourceTechnology: ConverterSourceTechnology,
): ConverterSourceOperationContext {
  return {
    source_technology: sourceTechnology,
    connection_variant: 'nn_side',
  };
}

export function resolveConverterSourceTechnologyFromTool(
  tool: CreatorTool,
): ConverterSourceTechnology | null {
  if (tool === 'add_converter_source_pv') return 'PV';
  if (tool === 'add_converter_source_bess') return 'BESS';
  return null;
}

export function resolveConverterSourceTechnologyFromActionId(
  actionId: string,
): ConverterSourceTechnology | null {
  if (actionId === 'add_converter_source_pv') return 'PV';
  if (actionId === 'add_converter_source_bess' || actionId === 'add_converter_source_bess_energy') return 'BESS';
  if (actionId === 'add_converter_source_fw') return 'FW';
  return null;
}

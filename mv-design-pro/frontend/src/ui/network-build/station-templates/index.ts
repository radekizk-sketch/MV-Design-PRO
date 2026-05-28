/**
 * Station Templates Wizard — K30-16 entry point.
 *
 * Wizard CREATES new stations from 57 PTPiRE-aligned templates across
 * 10 categories. All parameters editable per user demand.
 */

export {
  fetchStationTemplates,
  fetchStationTemplateCategories,
  fetchStationTemplate,
  applyStationTemplate,
  previewStationTemplate,
} from './api';
export type {
  StationTemplateSummary,
  StationTemplateFull,
  CategoryEntry,
  CategoriesResponse,
  TemplateSchema,
  CatalogChoice,
  TemplateParamInt,
  TemplateParamFloat,
  BayRoleSpec,
  DerKindSpec,
  ProtectionRelaySpec,
  ApplyTemplateRequest,
  ApplyTemplateResult,
  PreviewTemplateRequest,
  PreviewTemplateResult,
} from './api';
export { StationTemplateWizard } from './StationTemplateWizard';
export { StationBatchPlanner, buildStationBatchPlan } from './StationBatchPlanner';
export type {
  StationTemplateWizardProps,
  WizardStep,
  WizardState,
} from './StationTemplateWizard';
export type { StationBatchPlanRow, StationBatchPlannerProps } from './StationBatchPlanner';

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
} from './api';
export { StationTemplateWizard } from './StationTemplateWizard';
export type {
  StationTemplateWizardProps,
  WizardStep,
  WizardState,
} from './StationTemplateWizard';

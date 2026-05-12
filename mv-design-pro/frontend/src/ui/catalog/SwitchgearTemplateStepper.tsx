/**
 * SwitchgearTemplateStepper — flow wyboru szablonu pola SN (goal §11A.4).
 *
 * 3-krokowy stepper łączący `ManufacturerPicker`, `SwitchgearFamilyPicker`
 * i `BayTemplatePicker` w jeden operatorski workflow:
 *
 *   1. Producent  → ManufacturerPicker
 *   2. Rodzina    → SwitchgearFamilyPicker (lub fallback komunikat gdy producent
 *                   ma requires_catalog → przejście do canonical templates)
 *   3. Szablon    → BayTemplatePicker (canonical fallback gdy brak verified)
 *
 * Komponent prezentacyjny — przyjmuje dane przez props (parent fetchuje przez
 * `fetchManufacturers()` + `GET /api/catalog/complete-bay-templates`).
 * Stan kroków zarządzany lokalnie (useState).
 */

import { useState } from 'react';
import { clsx } from 'clsx';

import { BayTemplatePicker, type BayKind, type CompleteMvBayTemplateSummary } from './BayTemplatePicker';
import type { Manufacturer } from './manufacturer';
import { ManufacturerPicker } from './ManufacturerPicker';
import { SwitchgearFamilyPicker, type SwitchgearFamily } from './SwitchgearFamilyPicker';

export interface SwitchgearTemplateStepperProps {
  readonly manufacturers: readonly Manufacturer[];
  readonly familiesByManufacturer: Readonly<Record<string, readonly SwitchgearFamily[]>>;
  readonly templatesByContext: (
    manufacturerRef: string | null,
    familyRef: string | null,
  ) => readonly CompleteMvBayTemplateSummary[];
  readonly bayKindFilter?: BayKind | null;
  readonly onApply: (templateRef: string, context: StepperContext) => void;
  readonly className?: string;
}

export interface StepperContext {
  readonly manufacturerRef: string;
  readonly switchgearFamilyRef: string | null;
  readonly templateRef: string;
}

type StepId = 'manufacturer' | 'family' | 'template' | 'preview';

const STEP_LABELS_PL: Record<StepId, string> = {
  manufacturer: '1. Producent',
  family: '2. Rodzina rozdzielnicy',
  template: '3. Szablon pola',
  preview: '4. Podgląd',
};

const STEP_ORDER: readonly StepId[] = ['manufacturer', 'family', 'template', 'preview'];

export function SwitchgearTemplateStepper({
  manufacturers,
  familiesByManufacturer,
  templatesByContext,
  bayKindFilter,
  onApply,
  className,
}: SwitchgearTemplateStepperProps): JSX.Element {
  const [activeStep, setActiveStep] = useState<StepId>('manufacturer');
  const [manufacturerRef, setManufacturerRef] = useState<string | null>(null);
  const [familyRef, setFamilyRef] = useState<string | null>(null);
  const [templateRef, setTemplateRef] = useState<string | null>(null);

  const selectedManufacturer =
    manufacturerRef !== null
      ? manufacturers.find((m) => m.manufacturer_ref === manufacturerRef) ?? null
      : null;
  const manufacturerRequiresCatalog =
    selectedManufacturer !== null
    && (selectedManufacturer.status === 'requires_catalog'
      || selectedManufacturer.status === 'deprecated');

  const families = manufacturerRef ? familiesByManufacturer[manufacturerRef] ?? [] : [];
  const templates = templatesByContext(manufacturerRef, familyRef);

  const stepIndex = STEP_ORDER.indexOf(activeStep);

  const handleManufacturerSelect = (ref: string): void => {
    setManufacturerRef(ref);
    setFamilyRef(null);
    setTemplateRef(null);
    setActiveStep('family');
  };

  const handleFamilySelect = (ref: string | null): void => {
    setFamilyRef(ref);
    setTemplateRef(null);
    setActiveStep('template');
  };

  const handleTemplateSelect = (ref: string): void => {
    setTemplateRef(ref);
    setActiveStep('preview');
  };

  const canApply = manufacturerRef !== null && templateRef !== null;

  const handleApply = (): void => {
    if (!canApply || templateRef === null || manufacturerRef === null) {
      return;
    }
    onApply(templateRef, {
      manufacturerRef,
      switchgearFamilyRef: familyRef,
      templateRef,
    });
  };

  return (
    <div
      data-testid="switchgear-template-stepper"
      data-active-step={activeStep}
      className={clsx('flex h-full flex-col gap-3 rounded border border-gray-200 bg-white p-3', className)}
    >
      {/* Step header */}
      <nav className="flex shrink-0 items-center gap-2" data-testid="switchgear-template-stepper-nav">
        {STEP_ORDER.map((step, idx) => {
          const isActive = step === activeStep;
          const isDone = idx < stepIndex;
          return (
            <button
              key={step}
              type="button"
              data-testid={`switchgear-template-stepper-step-${step}`}
              data-active={isActive ? 'true' : 'false'}
              data-done={isDone ? 'true' : 'false'}
              onClick={() => {
                if (idx <= stepIndex || isDone) {
                  setActiveStep(step);
                }
              }}
              disabled={idx > stepIndex}
              className={clsx(
                'rounded px-2 py-1 text-[11px] font-medium transition-colors',
                isActive && 'bg-blue-100 text-blue-800',
                isDone && !isActive && 'bg-green-50 text-green-800',
                !isActive && !isDone && 'bg-gray-100 text-gray-500',
                idx > stepIndex && 'cursor-not-allowed',
              )}
            >
              {STEP_LABELS_PL[step]}
              {isDone && <span className="ml-1 text-green-600">✓</span>}
            </button>
          );
        })}
      </nav>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto" data-testid={`switchgear-template-stepper-content-${activeStep}`}>
        {activeStep === 'manufacturer' && (
          <ManufacturerPicker
            manufacturers={manufacturers}
            selectedRef={manufacturerRef}
            onSelect={handleManufacturerSelect}
          />
        )}
        {activeStep === 'family' && (
          <SwitchgearFamilyPicker
            families={families}
            manufacturerRef={manufacturerRef}
            manufacturerRequiresCatalog={manufacturerRequiresCatalog}
            selectedRef={familyRef}
            onSelect={handleFamilySelect}
          />
        )}
        {activeStep === 'family' && manufacturerRequiresCatalog && (
          <button
            type="button"
            onClick={() => setActiveStep('template')}
            data-testid="switchgear-template-stepper-skip-family"
            className="mt-2 w-full rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
          >
            Pomiń wybór rodziny — użyj szablonu kanonicznego ogólnego →
          </button>
        )}
        {activeStep === 'template' && (
          <BayTemplatePicker
            templates={templates}
            bayKindFilter={bayKindFilter}
            selectedRef={templateRef}
            onSelect={handleTemplateSelect}
          />
        )}
        {activeStep === 'preview' && templateRef !== null && (
          <div
            data-testid="switchgear-template-stepper-preview"
            className="flex flex-col gap-2 rounded border border-gray-200 bg-gray-50 p-3 text-[12px]"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold">Wybrany szablon:</span>
              <span className="font-mono text-blue-700">{templateRef}</span>
            </div>
            {manufacturerRef && (
              <div className="flex items-center justify-between">
                <span>Producent:</span>
                <span className="font-mono">{manufacturerRef}</span>
              </div>
            )}
            {familyRef && (
              <div className="flex items-center justify-between">
                <span>Rodzina:</span>
                <span className="font-mono">{familyRef}</span>
              </div>
            )}
            <button
              type="button"
              onClick={handleApply}
              data-testid="switchgear-template-stepper-apply"
              className="mt-2 rounded bg-blue-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-blue-700"
            >
              Zastosuj szablon do pola
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

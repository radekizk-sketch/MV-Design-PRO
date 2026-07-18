import { useCallback } from 'react';

import { useActiveOperationContext, useNetworkBuildStore } from '../networkBuildStore';

type SegmentFamily = 'KABEL_SN' | 'LINIA_NAPOWIETRZNA';

const SEGMENT_FAMILY_OPTIONS: Array<{
  value: SegmentFamily;
  label: string;
  description: string;
  tabId: 'kabel-sn' | 'linia-napowietrzna-sn';
}> = [
  {
    value: 'KABEL_SN',
    label: 'Kabel SN',
    description:
      'Dalszy krok otworzy parametry odcinka kablowego wraz z katalogiem i geometria.',
    tabId: 'kabel-sn',
  },
  {
    value: 'LINIA_NAPOWIETRZNA',
    label: 'Linia napowietrzna SN',
    description:
      'Dalszy krok otworzy parametry odcinka napowietrznego wraz z katalogiem i geometria.',
    tabId: 'linia-napowietrzna-sn',
  },
];

export function ChooseSnSegmentFamilyForm() {
  const context = useActiveOperationContext();
  const activeSurface = useNetworkBuildStore((state) => state.activeSurface);
  const openRouteSurface = useNetworkBuildStore((state) => state.openRouteSurface);
  const closeOperationForm = useNetworkBuildStore((state) => state.closeOperationForm);

  const handleChooseFamily = useCallback(
    (family: SegmentFamily, tabId: 'kabel-sn' | 'linia-napowietrzna-sn') => {
      openRouteSurface('E-11', {
        screenCode: 'E-11',
        titlePl: 'Nowy odcinek ciagu glownego',
        parentSurfaceId: activeSurface?.surfaceId ?? null,
        route: 'sld',
        tabId,
        payload: {
          delegate: 'operation_form',
          operation: 'continue_trunk_segment_sn',
          context: {
            ...(context ?? {}),
            segment_kind: family,
          },
        },
      });
    },
    [activeSurface?.surfaceId, context, openRouteSurface],
  );

  return (
    <div
      className="h-full overflow-y-auto bg-white text-slate-900"
      data-testid="choose-sn-segment-family-form"
    >
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-700">
          E-06
        </div>
        <h3 className="mt-1 text-sm font-semibold text-slate-900">Wybierz rodzine odcinka SN</h3>
        <p className="mt-1 text-xs text-slate-600">
          Ten krok jest obowiazkowy. Bez wyboru rodziny odcinka nie powstaje segment.
        </p>
      </div>

      <div className="space-y-4 p-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
          Start odcinka wychodzi z aktywnego pola SN. Po wyborze rodziny system otworzy
          jedyny aktywny formularz techniczny tworzenia odcinka.
        </div>

        <div className="grid gap-3">
          {SEGMENT_FAMILY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleChooseFamily(option.value, option.tabId)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left transition hover:border-cyan-500/60 hover:bg-cyan-50"
            >
              <div className="text-sm font-semibold text-cyan-800">{option.label}</div>
              <div className="mt-1 text-xs text-slate-600">{option.description}</div>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-slate-200 pt-3">
          <button
            type="button"
            onClick={closeOperationForm}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 transition hover:border-cyan-400 hover:text-cyan-700"
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChooseSnSegmentFamilyForm;

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
      className="h-full overflow-y-auto bg-[#07141f] text-slate-100"
      data-testid="choose-sn-segment-family-form"
    >
      <div className="border-b border-cyan-950/80 bg-[#081b2c] px-4 py-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-400/80">
          E-06
        </div>
        <h3 className="mt-1 text-sm font-semibold text-white">Wybierz rodzine odcinka SN</h3>
        <p className="mt-1 text-xs text-slate-300">
          Ten krok jest obowiazkowy. Bez wyboru rodziny odcinka nie powstaje segment.
        </p>
      </div>

      <div className="space-y-4 p-4">
        <div className="rounded-2xl border border-cyan-950/80 bg-[#0b1b29] p-4 text-xs text-slate-300">
          Start odcinka wychodzi z aktywnego pola SN. Po wyborze rodziny system otworzy
          jedyny aktywny formularz techniczny tworzenia odcinka.
        </div>

        <div className="grid gap-3">
          {SEGMENT_FAMILY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleChooseFamily(option.value, option.tabId)}
              className="rounded-2xl border border-cyan-950/80 bg-[#0b1b29] px-4 py-4 text-left transition hover:border-cyan-500/60 hover:bg-cyan-500/10"
            >
              <div className="text-sm font-semibold text-cyan-50">{option.label}</div>
              <div className="mt-1 text-xs text-slate-300">{option.description}</div>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-cyan-950/80 pt-3">
          <button
            type="button"
            onClick={closeOperationForm}
            className="rounded-xl border border-cyan-950/80 bg-[#07141f] px-4 py-2 text-sm text-slate-300 transition hover:border-cyan-800 hover:text-white"
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChooseSnSegmentFamilyForm;

import { useCallback, useMemo } from 'react';
import { clsx } from 'clsx';

import {
  useNetworkBuildDerived,
  useNetworkBuildStore,
  type BuildPhase,
} from './networkBuildStore';

interface NextBuildAction {
  title: string;
  detail: string;
  buttonLabel: string;
  enabled: boolean;
  blockedReason?: string;
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={clsx(
        'mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full',
        ok ? 'bg-[#00f0a8]' : 'bg-[#ffb020]',
      )}
      aria-hidden="true"
    />
  );
}

function portRoleLabel(portId?: string | null): string {
  const normalized = (portId ?? '').toLowerCase();
  if (normalized.includes('branch')) return 'zacisk odgałęźny';
  if (normalized.includes('start') || normalized.includes('in') || normalized.includes('upstream')) {
    return 'zacisk wejściowy';
  }
  if (normalized.includes('end') || normalized.includes('out') || normalized.includes('downstream')) {
    return 'zacisk wyjściowy';
  }
  return 'zacisk techniczny';
}

function buildNextAction(
  phase: BuildPhase,
  sourceCount: number,
  configuredGpzSnFieldCount: number,
  trunkSegmentCount: number,
  stationCount: number,
  hasTrunkStart: boolean,
  hasSegment: boolean,
): NextBuildAction {
  if (sourceCount === 0) {
    return {
      title: 'Utwórz źródło zasilania GPZ',
      detail: 'Najpierw definiujesz szyny GPZ, liczbę sekcji i pola odpływowe SN.',
      buttonLabel: 'Dodaj GPZ',
      enabled: true,
    };
  }

  if (configuredGpzSnFieldCount === 0) {
    return {
      title: 'Skonfiguruj pole SN GPZ',
      detail: 'Najpierw dobierasz pole odpływowe SN i aparaturę. Magistrala musi wyjść z zacisku pola, nie bezpośrednio z GPZ.',
      buttonLabel: 'Skonfiguruj pole SN',
      enabled: true,
    };
  }

  if (trunkSegmentCount === 0 || phase === 'HAS_SOURCE') {
    return {
      title: 'Połącz zacisk pola SN',
      detail: 'Pole odpływowe SN jest przygotowane. Teraz łączysz jego zacisk wyjściowy z zaciskiem wejściowym pierwszego obiektu sieciowego.',
      buttonLabel: hasTrunkStart ? 'Połącz zacisk pola SN' : 'Brak wolnego zacisku pola',
      enabled: hasTrunkStart,
      blockedReason: hasTrunkStart ? undefined : 'Pole SN nie udostępnia wolnego zacisku wyjściowego.',
    };
  }

  if (stationCount === 0 || phase === 'HAS_TRUNKS') {
    return {
      title: 'Wstaw pierwszą stację SN/nN',
      detail: 'Stację osadzasz na istniejącym odcinku magistrali, nie jako luźny rysunek na kanwie.',
      buttonLabel: hasSegment ? 'Wstaw stację SN/nN' : 'Najpierw utwórz odcinek magistrali',
      enabled: hasSegment,
      blockedReason: hasSegment ? undefined : 'Brak odcinka SN, na którym można osadzić stację.',
    };
  }

  return {
    title: 'Uzupełnij dane techniczne modelu',
    detail: 'Dopiero kompletny model przechodzi do obliczeń i nakładek wynikowych.',
    buttonLabel: 'Wybierz element na schemacie',
    enabled: false,
    blockedReason: 'Wskaż obiekt na SLD, aby otworzyć jego kartę techniczną.',
  };
}

export function GuidedBuildActionPanel() {
  const {
    buildPhase,
    buildPhaseLabel,
    sourceCount,
    configuredGpzSnFieldCount,
    configuredGpzSnFields,
    unconfiguredGpzSnFields,
    trunkSegmentCount,
    stationCount,
    transformerCount,
    openTerminals,
    logicalViews,
    isReady,
    gridSourceStationRef,
  } = useNetworkBuildDerived();
  const openOperationForm = useNetworkBuildStore((state) => state.openOperationForm);

  const firstOpenTerminal = openTerminals[0] ?? null;
  const firstConfiguredField = configuredGpzSnFields[0] ?? null;
  const firstUnconfiguredField = unconfiguredGpzSnFields[0] ?? null;
  const firstOpenTerminalField = firstOpenTerminal
    ? configuredGpzSnFields.find((field) => field.ref_id === firstOpenTerminal.element_id) ?? null
    : null;
  const firstSegmentId = useMemo(
    () => (logicalViews?.trunks ?? []).flatMap((trunk) => trunk.segments)[0] ?? null,
    [logicalViews?.trunks],
  );
  const nextAction = useMemo(
    () =>
      buildNextAction(
        buildPhase,
        sourceCount,
        configuredGpzSnFieldCount,
        trunkSegmentCount,
        stationCount,
        firstOpenTerminal !== null || firstConfiguredField !== null,
        firstSegmentId !== null,
      ),
    [
      buildPhase,
      configuredGpzSnFieldCount,
      firstConfiguredField,
      firstOpenTerminal,
      firstSegmentId,
      sourceCount,
      stationCount,
      trunkSegmentCount,
    ],
  );

  const handlePrimaryAction = useCallback(() => {
    if (sourceCount === 0) {
      openOperationForm('add_grid_source_sn');
      return;
    }

    if (configuredGpzSnFieldCount === 0) {
      openOperationForm('add_sn_bay', {
        station_ref: gridSourceStationRef ?? undefined,
        bus_ref: firstUnconfiguredField?.bus_ref,
        existing_field_ref: firstUnconfiguredField?.ref_id,
        field_name: firstUnconfiguredField?.name,
        gpz_section_id: firstUnconfiguredField?.gpz_section_id ?? undefined,
        bay_role: 'OUT',
      });
      return;
    }

    if (trunkSegmentCount === 0 && (firstOpenTerminal || firstConfiguredField)) {
      const terminalName = firstOpenTerminal
        ? `${firstOpenTerminalField?.name ?? 'pole SN GPZ'} · ${portRoleLabel(firstOpenTerminal.port_id)} · SN`
        : firstConfiguredField?.name;
      openOperationForm('continue_trunk_segment_sn', {
        ...(firstOpenTerminal
          ? {
              terminal_id: firstOpenTerminal.element_id,
              port_id: firstOpenTerminal.port_id,
              trunk_id: firstOpenTerminal.trunk_id,
              field_ref: firstOpenTerminalField?.ref_id,
              terminal_name: terminalName,
            }
          : {
              field_ref: firstConfiguredField?.ref_id,
              terminal_id: firstConfiguredField?.ref_id,
              terminal_name: terminalName,
            }),
        terminal_voltage_label: 'SN',
      });
      return;
    }

    if (stationCount === 0 && firstSegmentId) {
      openOperationForm('insert_station_on_segment_sn', {
        segment_id: firstSegmentId,
        position_on_segment: 0.5,
      });
    }
  }, [
    configuredGpzSnFieldCount,
    firstConfiguredField,
    firstUnconfiguredField,
    firstOpenTerminal,
    firstOpenTerminalField,
    firstSegmentId,
    gridSourceStationRef,
    openOperationForm,
    sourceCount,
    stationCount,
    trunkSegmentCount,
  ]);

  return (
    <div className="flex h-full flex-col bg-[#07111c] text-[#d7ecff]" data-testid="guided-build-action-panel">
      <div className="border-b border-[#17314c] px-5 py-4">
        <p className="font-mono-eng text-[10px] font-semibold uppercase tracking-[0.24em] text-[#58d8ff]">
          Budowa modelu
        </p>
        <h2 className="mt-2 text-sm font-semibold text-white">{buildPhaseLabel}</h2>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <section className="border border-[#1f3d5c] bg-[#0b1726]">
          <div className="border-b border-[#1f3d5c] px-4 py-3">
            <p className="font-mono-eng text-[11px] font-semibold uppercase tracking-[0.18em] text-[#00e7ff]">
              Następna akcja
            </p>
            <h3 className="mt-2 text-base font-semibold text-white">{nextAction.title}</h3>
            <p className="mt-2 text-xs leading-5 text-[#95b8d8]">{nextAction.detail}</p>
          </div>
          <div className="space-y-3 px-4 py-4">
            <button
              type="button"
              className={clsx(
                'w-full border px-4 py-3 text-left text-sm font-semibold transition-colors',
                nextAction.enabled
                  ? 'border-[#04d6ff] bg-[#063855] text-white hover:bg-[#074b70]'
                  : 'cursor-not-allowed border-[#263d55] bg-[#09131f] text-[#69849f]',
              )}
              onClick={handlePrimaryAction}
              disabled={!nextAction.enabled}
              data-testid="guided-build-primary-action"
            >
              {nextAction.buttonLabel}
            </button>
            {nextAction.blockedReason && (
              <p className="text-[11px] leading-5 text-[#ffbf5a]">{nextAction.blockedReason}</p>
            )}
          </div>
        </section>

        <section className="space-y-3 border border-[#1f3d5c] bg-[#081522] px-4 py-4">
          <p className="font-mono-eng text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7db6e8]">
            Stan topologii
          </p>
          <div className="space-y-3 text-xs">
            <div className="flex gap-3">
              <StatusDot ok={sourceCount > 0} />
              <div>
                <p className="font-semibold text-white">Źródło zasilania GPZ</p>
                <p className="text-[#88a9c9]">{sourceCount > 0 ? 'Gotowe' : 'Wymagane jako pierwszy krok'}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <StatusDot ok={configuredGpzSnFieldCount > 0} />
              <div>
                <p className="font-semibold text-white">Pole SN GPZ</p>
                <p className="text-[#88a9c9]">
                  {configuredGpzSnFieldCount > 0 ? `${configuredGpzSnFieldCount} pole odpływowe` : 'Wymagane przed magistralą'}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <StatusDot ok={trunkSegmentCount > 0} />
              <div>
                <p className="font-semibold text-white">Magistrala SN</p>
                <p className="text-[#88a9c9]">{trunkSegmentCount > 0 ? `${trunkSegmentCount} odc. SN` : 'Po skonfigurowaniu pola SN'}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <StatusDot ok={stationCount > 0} />
              <div>
                <p className="font-semibold text-white">Stacje SN/nN</p>
                <p className="text-[#88a9c9]">{stationCount > 0 ? `${stationCount} stacji` : 'Po wyprowadzeniu magistrali'}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <StatusDot ok={transformerCount > 0} />
              <div>
                <p className="font-semibold text-white">Transformatory i odbiory</p>
                <p className="text-[#88a9c9]">{transformerCount > 0 ? `${transformerCount} transformatorów` : 'Uzupełniane w kartach stacji'}</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="border-t border-[#17314c] px-5 py-3 text-[11px] text-[#88a9c9]">
        {isReady ? 'Model może zostać przekazany do obliczeń.' : 'Obliczenia pozostają zablokowane do czasu kompletnego modelu.'}
      </div>
    </div>
  );
}

export default GuidedBuildActionPanel;

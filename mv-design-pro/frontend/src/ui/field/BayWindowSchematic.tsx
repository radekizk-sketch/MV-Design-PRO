import type { FieldReadModelItem } from './useFieldReadModel';
import type { BayPrimaryDevice, BayPrimaryDeviceKind } from '../../types/enm';

interface BayWindowSchematicProps {
  item: FieldReadModelItem;
}

const DEVICE_LABELS: Record<BayPrimaryDeviceKind, string> = {
  CB: 'Wyłącznik',
  LOAD_SWITCH: 'Rozłącznik',
  DS: 'Odłącznik',
  ES: 'Uziemnik',
  CT: 'Przekładnik prądowy',
  VT: 'Przekładnik napięciowy',
  CABLE_HEAD: 'Głowica kablowa',
  TRANSFORMER_DEVICE: 'Transformator',
  FUSE: 'Bezpiecznik',
  GENERATOR_PV: 'PV',
  GENERATOR_BESS: 'BESS',
  GENERATOR_FW: 'FW',
  PCS: 'PCS',
  BATTERY: 'Bateria',
};

function deviceLabel(device: BayPrimaryDevice): string {
  return DEVICE_LABELS[device.kind] ?? device.kind;
}

function deviceY(device: BayPrimaryDevice, index: number): number {
  if (device.placement === 'UPSTREAM') {
    return 58 + index * 10;
  }
  if (device.placement === 'DOWNSTREAM') {
    return 142 + index * 10;
  }
  if (device.placement === 'GROUND_BRANCH') {
    return 116 + index * 8;
  }
  if (device.placement === 'OFF_PATH') {
    return 104 + index * 8;
  }
  return 94 + index * 10;
}

function DeviceSymbol({ device, index }: { device: BayPrimaryDevice; index: number }) {
  const y = deviceY(device, index);
  const actualState = device.switch_state?.actual_state;
  const color = actualState === 'otwarty' || actualState === 'otwarty_naped_rozbrojony' || actualState === 'awaria'
    ? '#ef4444'
    : '#22c55e';
  const commonProps = {
    role: 'button',
    tabIndex: 0,
    'aria-label': deviceLabel(device),
    'data-testid': `bay-device-${device.kind.toLowerCase()}`,
    'data-device-ref': device.device_ref,
  };

  if (device.kind === 'CB') {
    return (
      <g {...commonProps}>
        <rect x={86} y={y - 8} width={16} height={16} fill={color} stroke="#d8e7f7" strokeWidth={1.5} />
        <rect x={74} y={y - 14} width={40} height={28} fill="transparent" />
      </g>
    );
  }

  if (device.kind === 'LOAD_SWITCH') {
    return (
      <g {...commonProps}>
        <rect
          x={83}
          y={y - 11}
          width={22}
          height={22}
          fill={color}
          stroke="#d8e7f7"
          strokeWidth={1}
          transform={`rotate(45 94 ${y})`}
        />
        <rect x={74} y={y - 18} width={40} height={36} fill="transparent" />
      </g>
    );
  }

  if (device.kind === 'DS') {
    return (
      <g {...commonProps}>
        <circle cx={94} cy={y} r={8} fill={color} stroke="#d8e7f7" strokeWidth={1.5} />
        <rect x={74} y={y - 16} width={40} height={32} fill="transparent" />
      </g>
    );
  }

  if (device.kind === 'ES') {
    return (
      <g {...commonProps}>
        <path d={`M94 ${y} H126 V${y + 20}`} stroke="#d8e7f7" strokeWidth={2} fill="none" />
        <path d={`M118 ${y + 20} h16 M121 ${y + 24} h10 M124 ${y + 28} h4`} stroke="#d8e7f7" strokeWidth={1.5} />
        <rect x={110} y={y - 16} width={38} height={52} fill="transparent" />
      </g>
    );
  }

  if (device.kind === 'CT' || device.kind === 'VT') {
    const stroke = device.kind === 'CT' ? '#f59e0b' : '#38bdf8';
    return (
      <g {...commonProps}>
        <circle cx={94} cy={y} r={9} fill="none" stroke={stroke} strokeWidth={2.5} />
        {device.kind === 'VT' && <circle cx={105} cy={y} r={9} fill="none" stroke={stroke} strokeWidth={2} />}
        <rect x={72} y={y - 16} width={52} height={32} fill="transparent" />
      </g>
    );
  }

  if (device.kind === 'FUSE') {
    return (
      <g {...commonProps}>
        <rect x={87} y={y - 13} width={6} height={26} fill="#e5e7eb" stroke="#d8e7f7" strokeWidth={1} />
        <rect x={96} y={y - 13} width={6} height={26} fill="#e5e7eb" stroke="#d8e7f7" strokeWidth={1} />
        <rect x={78} y={y - 18} width={34} height={36} fill="transparent" />
      </g>
    );
  }

  return (
    <g {...commonProps}>
      <circle cx={94} cy={y} r={6} fill={color} />
      <rect x={78} y={y - 14} width={32} height={28} fill="transparent" />
    </g>
  );
}

export function BayWindowSchematic({ item }: BayWindowSchematicProps) {
  const baseModel = item.canonical_model.base_model;
  const devices = baseModel.primary_devices;
  const role = baseModel.bay_role;
  const hasDevices = devices.length > 0;

  return (
    <section
      aria-label="Schemat kanoniczny pola SN"
      className="mx-4 mb-4 rounded-lg border border-slate-700 bg-slate-950/70 p-3 text-slate-100"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-200">
            Schemat Kanoniczny
          </h4>
          <p className="mt-1 text-xs text-slate-300">{item.bay_name}</p>
        </div>
        <span className="rounded border border-slate-600 px-2 py-1 text-[11px] text-slate-300">
          {role}
        </span>
      </div>

      <svg
        data-testid="bay-svg-renderer"
        viewBox="0 0 188 220"
        className="h-64 w-full rounded border border-slate-800 bg-[#05080d]"
        role="img"
        aria-label={`Schemat pola ${item.bay_name}`}
      >
        <rect x={50} y={16} width={88} height={188} fill="#1f2933" stroke="#334155" strokeWidth={1} />
        <line x1={24} y1={34} x2={164} y2={34} stroke="#22c55e" strokeWidth={5} />
        <line x1={94} y1={34} x2={94} y2={190} stroke="#d8e7f7" strokeWidth={2.5} />
        <text x={58} y={26} fill="#f8fafc" fontSize={11} fontWeight={700}>
          {item.bay_name}
        </text>
        {hasDevices
          ? devices.map((device, index) => (
            <DeviceSymbol key={device.device_ref} device={device} index={index} />
          ))
          : (
            <text x={94} y={112} fill="#f59e0b" fontSize={10} textAnchor="middle">
              Brak aparatów w kanonie pola
            </text>
          )}
        <path d="M84 190 h20 l-10 14 z" fill="none" stroke="#d8e7f7" strokeWidth={1.5} />
      </svg>
    </section>
  );
}

/**
 * EarthingSystemSelector — UI dla typu uziemienia neutralnego (Etap 7 dostawy).
 *
 * MV (SN, B.1 audit2):
 *   - isolated: izolowana neutralna (capacitive)
 *   - petersen_coil: cewka Petersena (kompensacja Ic)
 *   - resistor_grounded: uziemienie rezystorowe (R0)
 *   - directly_grounded: bezpośrednio uziemiona
 *
 * LV (nN, IEC 60364):
 *   - TN-S: ochronny + neutralny rozdzielone (5 przewodów)
 *   - TN-C-S: zasilanie TN-C, instalacja TN-S (rozdział PEN→PE+N)
 *   - TN-C: ochronny + neutralny połączone (PEN, 4 przewody)
 *   - TT: lokalne uziemienie u odbiorcy
 *   - IT: izolowana neutralna (przemysł, szpitale)
 *
 * Każdy typ ma opis PL + odniesienie do normy + tooltip inżynierski.
 */

export type MvEarthingType = 'isolated' | 'petersen_coil' | 'resistor_grounded' | 'directly_grounded';
export type LvEarthingType = 'TN-S' | 'TN-C-S' | 'TN-C' | 'TT' | 'IT';

interface EarthingDescriptor {
  readonly value: string;
  readonly label: string;
  readonly description: string;
  readonly normative: string;
}

const MV_DESCRIPTORS: Readonly<Record<MvEarthingType, EarthingDescriptor>> = {
  isolated: {
    value: 'isolated',
    label: 'Izolowana neutralna',
    description:
      'Neutralna bez bezpośredniego połączenia z ziemią; prąd zwarcia jednofazowego ograniczony przez pojemność doziemną sieci.',
    normative: 'PN-EN 50522 § 4.3.1; IEEE 142 § 1.5',
  },
  petersen_coil: {
    value: 'petersen_coil',
    label: 'Cewka Petersena (kompensacja)',
    description:
      'Reaktor regulowalny w neutralnej; kompensacja prądu pojemnościowego; prąd resztkowy < 5 A pożądany.',
    normative: 'PN-EN 50522 § 4.3.3; IEC 60909-3 § 5',
  },
  resistor_grounded: {
    value: 'resistor_grounded',
    label: 'Uziemienie rezystorowe',
    description:
      'Neutralna przez rezystor ograniczający prąd zwarcia (typ. 100-1000 A); szybkie wykrycie zwarcia 1F.',
    normative: 'PN-EN 50522 § 4.3.2',
  },
  directly_grounded: {
    value: 'directly_grounded',
    label: 'Bezpośrednio uziemiona',
    description:
      'Neutralna połączona bezpośrednio z ziemią; duży prąd zwarcia 1F; wymaga szybkich zabezpieczeń ziemnozwarciowych.',
    normative: 'PN-EN 50522 § 4.3.4',
  },
};

const LV_DESCRIPTORS: Readonly<Record<LvEarthingType, EarthingDescriptor>> = {
  'TN-S': {
    value: 'TN-S',
    label: 'TN-S (PE + N rozdzielone)',
    description:
      'Najbezpieczniejszy system nN; PE i N to osobne przewody w całej instalacji. Stosowany w nowoczesnych obiektach.',
    normative: 'IEC 60364-3 § 312.2.1; PN-EN 61140',
  },
  'TN-C-S': {
    value: 'TN-C-S',
    label: 'TN-C-S (PEN→PE+N)',
    description:
      'Zasilanie PEN; rozdział na PE+N przy wejściu do obiektu. Najczęstszy w polskich sieciach OSD (przyłącze nN).',
    normative: 'IEC 60364-3 § 312.2.2',
  },
  'TN-C': {
    value: 'TN-C',
    label: 'TN-C (PEN łączony)',
    description:
      'PE i N połączone w jeden przewód PEN. NIE stosować w obwodach z urządzeniami mającymi własne uziemienie elektroniczne.',
    normative: 'IEC 60364-3 § 312.2.3',
  },
  'TT': {
    value: 'TT',
    label: 'TT (lokalne uziemienie)',
    description:
      'Odbiorca ma własną instalację uziemiającą niezależną od źródła. Wymaga RCD ze względu na wysoką rezystancję pętli zwarcia.',
    normative: 'IEC 60364-3 § 312.2.4',
  },
  'IT': {
    value: 'IT',
    label: 'IT (izolowana neutralna)',
    description:
      'Brak bezpośredniego połączenia neutralnej z ziemią. Pierwsze zwarcie 1F nie wyłącza obwodu (alarm). Szpitale, przemysł chemiczny.',
    normative: 'IEC 60364-3 § 312.2.5',
  },
};

interface EarthingSystemSelectorProps<T extends string> {
  readonly mode: 'mv' | 'lv';
  readonly value: T;
  readonly onChange: (next: T) => void;
  readonly disabled?: boolean;
}

export function EarthingSystemSelector<T extends MvEarthingType | LvEarthingType>({
  mode,
  value,
  onChange,
  disabled,
}: EarthingSystemSelectorProps<T>): JSX.Element {
  const descriptors = mode === 'mv' ? MV_DESCRIPTORS : LV_DESCRIPTORS;
  const current = (descriptors as Record<string, EarthingDescriptor>)[value];

  return (
    <fieldset
      className="rounded border border-scada-border p-2"
      data-testid={`earthing-selector-${mode}`}
    >
      <legend className="px-1 text-[10px] font-semibold uppercase tracking-wider text-scada-muted">
        {mode === 'mv' ? 'Typ uziemienia SN' : 'Typ uziemienia nN (IEC 60364)'}
      </legend>
      <div className="space-y-1">
        {Object.values(descriptors).map((d) => (
          <label
            key={d.value}
            className={`block cursor-pointer rounded border p-2 ${
              value === d.value
                ? 'border-amber-500 bg-amber-500/10'
                : 'border-scada-border hover:bg-scada-hover-nav'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            data-testid={`earthing-option-${d.value}`}
            title={`${d.description} (${d.normative})`}
          >
            <div className="flex items-start gap-2">
              <input
                type="radio"
                name={`earthing-${mode}`}
                value={d.value}
                checked={value === d.value}
                disabled={disabled}
                onChange={() => onChange(d.value as T)}
                className="mt-0.5"
                title={d.label}
              />
              <div className="flex-1 text-[11px]">
                <div className="font-semibold text-scada-text">{d.label}</div>
                <p className="mt-0.5 text-[10px] text-scada-muted">{d.description}</p>
                <p className="mt-0.5 text-[10px] text-amber-300/80">{d.normative}</p>
              </div>
            </div>
          </label>
        ))}
      </div>
      {current ? (
        <div
          className="mt-2 rounded bg-scada-bg/50 p-2 text-[10px] text-scada-muted"
          data-testid={`earthing-active-${mode}`}
        >
          Aktywne: <span className="font-semibold text-scada-text">{current.label}</span>
        </div>
      ) : null}
    </fieldset>
  );
}

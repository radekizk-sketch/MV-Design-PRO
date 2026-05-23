/**
 * HelpPanel — globalny panel pomocy (F1).
 *
 * 3 zakładki:
 *  1. Dokumentacja - skrót opisu architektury + linki do specyfikacji
 *  2. Glosariusz - terminy inżynierskie PL/IEC/PSE z normami
 *  3. Skróty klawiszowe - lista wszystkich 30+ shortcuts z kategorią
 *
 * Otwierany przez F1 lub Ctrl+? lub button w nav rail.
 *
 * BINDING: 100% PL etykiety.
 */

import { useMemo, useState } from 'react';
import { KEYBOARD_SHORTCUTS, type KeyboardCategory } from '../sld/core/keyboardShortcuts';

type HelpTab = 'docs' | 'glossary' | 'shortcuts';

const TAB_LABELS: Record<HelpTab, string> = {
  docs: 'Dokumentacja',
  glossary: 'Glosariusz inżynierski',
  shortcuts: 'Skróty klawiszowe',
};

const CATEGORY_LABELS: Record<KeyboardCategory, string> = {
  NAWIGACJA: 'Nawigacja',
  EDYCJA_MODELU: 'Edycja modelu',
  WIDOKI: 'Widoki',
  ANALIZA: 'Analiza',
  NARZEDZIA: 'Narzędzia',
};

interface GlossaryEntry {
  readonly term: string;
  readonly definition: string;
  readonly normative?: string;
}

const GLOSSARY_ENTRIES: readonly GlossaryEntry[] = [
  {
    term: 'GPZ',
    definition: 'Główny Punkt Zasilający - stacja WN/SN (np. 110/15 kV) zasilająca sieć dystrybucyjną SN.',
    normative: 'PN-EN 50522 § 4',
  },
  {
    term: 'PCC',
    definition: 'Point of Common Coupling - punkt przyłączenia odbiorcy/źródła do sieci OSD.',
    normative: 'IEEE 519, IEC 61000-2-4',
  },
  {
    term: 'NC RfG',
    definition: 'Network Code Requirements for Generators - kodeks UE dla przyłączania źródeł wytwórczych.',
    normative: 'Rozporządzenie Komisji UE 2016/631',
  },
  {
    term: 'FRT / LVRT / HVRT',
    definition: 'Fault Ride-Through - zdolność źródła do utrzymania połączenia podczas chwilowych zakłóceń napięcia (Low/High Voltage Ride-Through).',
    normative: 'NC RfG Art. 13-18, PN-EN 50438',
  },
  {
    term: 'ROCOF / dRoCoF',
    definition: 'Rate of Change of Frequency - szybkość zmiany częstotliwości (Hz/s). Wymagana wartość dla DER w PL: ±2 Hz/s.',
    normative: 'NC RfG Art. 13, PTPIREE WiPWC',
  },
  {
    term: 'Sk"',
    definition: 'Symetryczna moc zwarciowa początkowa 3-faz [MVA]. Wartość maksymalna z dokumentacji OSD dla węzła sieciowego.',
    normative: 'IEC 60909-0',
  },
  {
    term: 'I_dyn',
    definition: 'Prąd zwarciowy dynamiczny (udarowy ip) - maksymalna wartość chwilowa prądu zwarcia. Wymagana wytrzymałość aparatury.',
    normative: 'IEC 60909-0, PN-EN 62271-1',
  },
  {
    term: 'I_th',
    definition: 'Prąd zwarciowy termiczny (Ith) - wartość RMS równoważna cieplnie. Wytrzymałość 1s/3s aparatury.',
    normative: 'IEC 60909-0, PN-EN 60865',
  },
  {
    term: 'TMS',
    definition: 'Time Multiplier Setting - mnożnik czasu krzywej zabezpieczenia IDMT. Steruje selektywnością czasową.',
    normative: 'IEC 60255-151',
  },
  {
    term: 'IDMT',
    definition: 'Inverse Definite Minimum Time - krzywa zabezpieczenia odwrotnie zależna od prądu (SI/VI/EI/LTI).',
    normative: 'IEC 60255-151',
  },
  {
    term: 'SEP D / SEP E',
    definition: 'Uprawnienia Stowarzyszenia Elektryków Polskich: D = dozór (projektant), E = eksploatacja (uruchomienie).',
    normative: 'Ustawa o dozorze technicznym',
  },
  {
    term: 'ZKSN',
    definition: 'Złączka Kablowa Sieci Nadziemnej - mufa kablowa SN do łączenia kabli (3-żyłowych, najczęściej XLPE).',
    normative: 'PN-HD 620 S2',
  },
  {
    term: 'PB / PW / PR / PK',
    definition: 'Fazy projektu: PB (budowlany), PW (wykonawczy), PR (rozbudowy), PK (koncepcyjny).',
    normative: 'Ustawa Prawo budowlane',
  },
  {
    term: 'OSD',
    definition: 'Operator Systemu Dystrybucyjnego - PSE (przesył), Energa/Tauron/Enea/PGE (dystrybucja).',
    normative: 'IRiESD per operator',
  },
  {
    term: 'PTPIREE',
    definition: 'Polskie Towarzystwo Przesyłu i Rozdziału Energii Elektrycznej - certyfikuje falowniki dla rynku PL.',
    normative: 'WiPWC 1.3',
  },
  {
    term: 'Anti-islanding',
    definition: 'Zabezpieczenie wyspowe DER - wykrywa pracę na "wyspie" (odcięcie od sieci) i wyłącza źródło w max 2s.',
    normative: 'IEEE 1547, PN-EN 50438, NC RfG',
  },
];

export interface HelpPanelProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly initialTab?: HelpTab;
}

export function HelpPanel({ isOpen, onClose, initialTab = 'docs' }: HelpPanelProps): JSX.Element | null {
  const [activeTab, setActiveTab] = useState<HelpTab>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');

  const groupedShortcuts = useMemo(() => {
    const groups: Record<KeyboardCategory, Array<typeof KEYBOARD_SHORTCUTS[number]>> = {
      NAWIGACJA: [],
      EDYCJA_MODELU: [],
      WIDOKI: [],
      ANALIZA: [],
      NARZEDZIA: [],
    };
    for (const shortcut of KEYBOARD_SHORTCUTS) {
      groups[shortcut.category].push(shortcut);
    }
    return groups;
  }, []);

  const filteredGlossary = useMemo(() => {
    if (!searchQuery.trim()) return GLOSSARY_ENTRIES;
    const q = searchQuery.trim().toLowerCase();
    return GLOSSARY_ENTRIES.filter(
      (e) =>
        e.term.toLowerCase().includes(q) ||
        e.definition.toLowerCase().includes(q) ||
        e.normative?.toLowerCase().includes(q),
    );
  }, [searchQuery]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
      data-testid="help-panel"
    >
      <div
        className="bg-white rounded-lg shadow-2xl w-[800px] max-w-[95vw] h-[600px] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Pomoc"
      >
        <header className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Pomoc</h3>
            <p className="text-[10px] text-gray-500">F1 lub Ctrl+? aby otworzyć</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 text-gray-400"
            aria-label="Zamknij pomoc"
          >
            ✕
          </button>
        </header>

        <nav className="flex border-b border-gray-200 px-3" role="tablist">
          {(Object.entries(TAB_LABELS) as [HelpTab, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeTab === key}
              onClick={() => setActiveTab(key)}
              className={`px-4 py-2 text-xs font-medium border-b-2 ${
                activeTab === key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              data-testid={`help-tab-${key}`}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto p-5" data-testid={`help-content-${activeTab}`}>
          {activeTab === 'docs' && (
            <div className="space-y-3 text-sm text-gray-700">
              <h4 className="font-semibold text-gray-800">MV-DESIGN-PRO - przewodnik szybki</h4>
              <p>
                MV-DESIGN-PRO to środowisko projektowania sieci średniego napięcia (SN) zgodne z
                DIgSILENT PowerFactory, ETAP i ABB MicroSCADA. Każdy projekt zawiera model sieci ENM
                (Energy Network Model), warianty pracy (Study Cases), wyniki obliczeń i dowody.
              </p>
              <h5 className="mt-3 font-semibold text-gray-800">Typowy przepływ pracy:</h5>
              <ol className="ml-5 list-decimal space-y-1 text-xs">
                <li>Pulpit E-00 → "Nowy projekt" (lub otwórz istniejący)</li>
                <li>SLD E-01 → "Wstaw GPZ" (1. element sieci)</li>
                <li>GPZ → "Dodaj pole SN" (per kierunek wyjściowy)</li>
                <li>Pole → "Wyprowadź odcinek" (kabel/linia)</li>
                <li>Wstaw stację SN/nN na ciągu</li>
                <li>Dodaj transformator + odbiory nN</li>
                <li>Dodaj OZE/DER (PV/BESS/FW)</li>
                <li>Definiuj wariant pracy (zakres obliczeń)</li>
                <li>Uruchom Power Flow / Short Circuit</li>
                <li>Wygeneruj raport OSD lub techniczny</li>
              </ol>
              <h5 className="mt-3 font-semibold text-gray-800">Stosowane normy:</h5>
              <ul className="ml-5 list-disc space-y-1 text-xs">
                <li>PN-EN 60909 / IEC 60909 - obliczenia zwarciowe</li>
                <li>PN-EN 50522 - uziemianie sieci SN/WN</li>
                <li>PN-EN 60255 / IEC 60255 - zabezpieczenia</li>
                <li>NC RfG (Rozp. UE 2016/631) - przyłączanie OZE</li>
                <li>PTPIREE WiPWC 1.3 - certyfikat falowników PL</li>
                <li>IRiESD - kodeks operatora dystrybucyjnego</li>
              </ul>
            </div>
          )}

          {activeTab === 'glossary' && (
            <div>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Szukaj terminu inżynierskiego..."
                className="mb-3 w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
                data-testid="help-glossary-search"
              />
              <dl className="space-y-3">
                {filteredGlossary.map((entry) => (
                  <div key={entry.term} className="rounded border border-gray-200 p-3" data-testid={`glossary-entry-${entry.term}`}>
                    <dt className="text-xs font-semibold text-blue-700">{entry.term}</dt>
                    <dd className="mt-1 text-xs text-gray-700">{entry.definition}</dd>
                    {entry.normative && (
                      <div className="mt-1 text-[10px] italic text-gray-500">Norma: {entry.normative}</div>
                    )}
                  </div>
                ))}
              </dl>
              {filteredGlossary.length === 0 && (
                <div className="text-center text-xs text-gray-500">
                  Brak wyników dla "{searchQuery}".
                </div>
              )}
            </div>
          )}

          {activeTab === 'shortcuts' && (
            <div className="space-y-4">
              {(Object.entries(groupedShortcuts) as [KeyboardCategory, typeof KEYBOARD_SHORTCUTS[number][]][]).map(
                ([cat, items]) => (
                  <section key={cat}>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-600">
                      {CATEGORY_LABELS[cat]} ({items.length})
                    </h4>
                    <table className="w-full text-xs">
                      <tbody>
                        {items.map((s) => (
                          <tr
                            key={s.action_id}
                            className="border-b border-gray-100"
                            data-testid={`shortcut-${s.action_id}`}
                          >
                            <td className="py-1 pr-3">
                              <kbd className="rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 font-mono text-[10px]">
                                {s.keys}
                              </kbd>
                            </td>
                            <td className="py-1 text-gray-700">{s.description_pl}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                ),
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * PickerRodzinyReferencyjnej — wybór rodziny rozdzielnicy w kreatorze stacji/pola,
 * zasilany silnikiem referencji (HANDOFF pkt 2.4, kontrakt
 * `docs/sld/REFERENCE_ENGINE_UI_HANDOFF_2026-07.md`, spec `REFERENCE_ENGINE_SPEC_V1.md`
 * §7, ruling V12K-060).
 *
 * Reguła twarda (HANDOFF §3.1, zakaz drugiej definicji): skład celek, kody i etykiety
 * pochodzą WYŁĄCZNIE z API/pakietów referencji — zero stałych w komponencie.
 *
 * pkt 2.4.1: lista rodzin = pakiety `manufacturer` (`fetchReferencePacks('manufacturer')`)
 *   ZŁĄCZONE z istniejącym źródłem rodzin katalogowych (`fetchSwitchgearFamilies`) po
 *   `switchgear_family_ref`; etykieta = `name_pl` pakietu + wersja; wybór idzie przez
 *   ISTNIEJĄCY mechanizm wyboru rodziny (callback `onSelectFamily(family_ref)` — ta sama
 *   sygnatura co `SwitchgearFamilyPicker.onSelect`; ZERO nowej ścieżki zapisu).
 * pkt 2.4.2: po związaniu pola (`bay_template_ref` z prefiksem `<FAMILY_REF>__`) —
 *   wynik `family.cell_match` z raportu zgodności (nazwa dopasowanej celki z `message_pl`).
 * pkt 2.4.3: podpowiedzi składu — `cell_configurations` wybranego pakietu (standard/opcja).
 *
 * Odczyt `cell_match` z raportu: kontrakt §1.1 niesie sprawdzenia w `checks[]`
 * (element_ref, rule_code, status, message_pl) — bez wyodrębnionego pola cell_match;
 * per spec §7 `family.cell_match` to sprawdzenie producenckie, którego nazwa celki
 * jest w `message_pl`. Wyszukujemy je po `rule_code` zawierającym „cell_match" (termin
 * z nazwy pola spec, nie kod projektu). Brak takiego sprawdzenia = bramka danych (nie
 * pokazujemy nic). Pytanie o dokładny literał `rule_code` — patrz raport / kanał §5.
 */
import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';

import {
  fetchReferencePacks,
  fetchReferencePack,
  type ReferencePackSummary,
  type ReferenceCellConfiguration,
  type ReferenceComplianceReport,
  type ReferenceComplianceCheck,
} from '../../../ui2/referencje/api';
import { fetchSwitchgearFamilies } from '../../catalog/api';
import type { SwitchgearFamily } from '../../catalog/SwitchgearFamilyPicker';
import { isUsableSwitchgearFamily } from '../forms/InsertStationFormHelpers';

export interface PickerRodzinyReferencyjnejProps {
  /** Aktualnie wybrana rodzina (kontrolowana z istniejącego pola rodziny). */
  readonly selectedFamilyRef?: string | null;
  /** Istniejący mechanizm wyboru rodziny (ta sama sygnatura co SwitchgearFamilyPicker). */
  readonly onSelectFamily?: (familyRef: string | null) => void;
  /**
   * Raport zgodności aktywnego przypadku — źródło `family.cell_match`
   * (opcjonalny; bez związanego pola brak danych = bramka danych).
   */
  readonly complianceReport?: ReferenceComplianceReport | null;
  /** `element_ref` związanego pola (do wyszukania cell_match w raporcie). */
  readonly boundElementRef?: string | null;
  /** Związany `bay_template_ref` z prefiksem `<FAMILY_REF>__` (pkt 2.4.2). */
  readonly boundBayTemplateRef?: string | null;
}

interface WpisRodziny {
  readonly family: SwitchgearFamily;
  readonly pack: ReferencePackSummary;
}

const T = {
  naglowek: 'Rodzina rozdzielnicy (referencja producenta)',
  ladowanie: 'Ładowanie rodzin rozdzielnic…',
  blad: 'Nie udało się pobrać pakietów referencyjnych producentów.',
  brak: 'Brak rodzin rozdzielnic z pakietem referencyjnym producenta.',
  wersja: 'wersja',
  cellMatchNaglowek: 'Dopasowanie celki',
  skladNaglowek: 'Podpowiedzi składu celek',
  standard: 'standard',
  opcja: 'opcja',
  zwiazanePole: 'Związane pole',
} as const;

/** Wyszukaj sprawdzenie `family.cell_match` dla związanego pola (spec §7). */
function znajdzCellMatch(
  report: ReferenceComplianceReport | null | undefined,
  packId: string,
  elementRef: string | null | undefined,
): ReferenceComplianceCheck | null {
  if (!report || !elementRef) return null;
  const pack = report.packs.find((p) => p.pack_id === packId);
  if (!pack) return null;
  return (
    pack.checks.find(
      (c) => c.element_ref === elementRef && /cell_match/i.test(c.rule_code),
    ) ?? null
  );
}

export function PickerRodzinyReferencyjnej({
  selectedFamilyRef = null,
  onSelectFamily,
  complianceReport = null,
  boundElementRef = null,
  boundBayTemplateRef = null,
}: PickerRodzinyReferencyjnejProps): JSX.Element {
  const [wpisy, setWpisy] = useState<WpisRodziny[]>([]);
  const [celki, setCelki] = useState<ReferenceCellConfiguration[]>([]);
  const [ladowanie, setLadowanie] = useState(true);
  const [blad, setBlad] = useState(false);

  // pkt 2.4.1 — join pakietów producenckich z rodzinami katalogu po switchgear_family_ref.
  useEffect(() => {
    let anulowano = false;
    setLadowanie(true);
    setBlad(false);
    void Promise.all([fetchReferencePacks('manufacturer'), fetchSwitchgearFamilies()])
      .then(([packs, families]) => {
        if (anulowano) return;
        const usable = families.filter(isUsableSwitchgearFamily);
        const packByFamily = new Map<string, ReferencePackSummary>();
        for (const p of packs) {
          if (p.switchgear_family_ref) packByFamily.set(p.switchgear_family_ref, p);
        }
        const zlaczone: WpisRodziny[] = [];
        for (const family of usable) {
          const pack = packByFamily.get(family.switchgear_family_ref);
          if (pack) zlaczone.push({ family, pack });
        }
        setWpisy(zlaczone);
      })
      .catch(() => {
        if (!anulowano) setBlad(true);
      })
      .finally(() => {
        if (!anulowano) setLadowanie(false);
      });
    return () => {
      anulowano = true;
    };
  }, []);

  const wybranyWpis = useMemo(
    () => wpisy.find((w) => w.family.switchgear_family_ref === selectedFamilyRef) ?? null,
    [wpisy, selectedFamilyRef],
  );

  // pkt 2.4.3 — konfiguracje celek wybranego pakietu (podpowiedzi standard/opcja).
  useEffect(() => {
    if (!wybranyWpis) {
      setCelki([]);
      return;
    }
    let anulowano = false;
    void fetchReferencePack(wybranyWpis.pack.pack_id)
      .then((pack) => {
        if (!anulowano) setCelki(pack.cell_configurations ?? []);
      })
      .catch(() => {
        if (!anulowano) setCelki([]);
      });
    return () => {
      anulowano = true;
    };
  }, [wybranyWpis]);

  const cellMatch = wybranyWpis
    ? znajdzCellMatch(complianceReport, wybranyWpis.pack.pack_id, boundElementRef)
    : null;
  const zwiazanieAktywne =
    !!wybranyWpis &&
    !!boundBayTemplateRef &&
    boundBayTemplateRef.startsWith(`${wybranyWpis.family.switchgear_family_ref}__`);

  return (
    <section className="flex flex-col gap-2" data-testid="picker-rodziny-referencyjnej">
      <div className="text-[11px] font-bold uppercase tracking-wider text-[#4a6a8a]">
        {T.naglowek}
      </div>

      {ladowanie ? (
        <p className="text-[11px] text-[#8a9aaa]" data-testid="picker-rodziny-ladowanie">
          {T.ladowanie}
        </p>
      ) : blad ? (
        <p className="text-[11px] text-amber-300" data-testid="picker-rodziny-blad">
          {T.blad}
        </p>
      ) : wpisy.length === 0 ? (
        <p className="text-[11px] text-[#8a9aaa]" data-testid="picker-rodziny-brak">
          {T.brak}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5" data-testid="picker-rodziny-lista">
          {wpisy.map(({ family, pack }) => {
            const wybrana = family.switchgear_family_ref === selectedFamilyRef;
            return (
              <li key={family.switchgear_family_ref}>
                <button
                  type="button"
                  data-testid={`picker-rodziny-opcja-${family.switchgear_family_ref}`}
                  data-selected={wybrana ? 'true' : 'false'}
                  onClick={() => onSelectFamily?.(family.switchgear_family_ref)}
                  className={clsx(
                    'flex w-full flex-col items-start rounded border p-2 text-left transition-colors',
                    wybrana
                      ? 'border-[#00d4ff] bg-[#00d4ff10]'
                      : 'border-[#1a2a3a] bg-[#0a1420] hover:bg-[#0b1725]',
                  )}
                >
                  <span className="text-[12px] font-semibold text-scada-text">
                    {pack.name_pl}
                  </span>
                  <span className="text-[10px] text-[#8a9aaa]">
                    {T.wersja} {pack.version}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {zwiazanieAktywne && (
        <div
          className="rounded border border-[#1a2a3a] bg-[#0a1420] p-2"
          data-testid="picker-rodziny-cell-match"
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[#4a6a8a]">
            {T.cellMatchNaglowek}
          </div>
          <div className="mt-0.5 text-[10px] text-[#8a9aaa]" data-testid="picker-rodziny-bay-ref">
            {T.zwiazanePole}: <span className="font-mono">{boundBayTemplateRef}</span>
          </div>
          {cellMatch ? (
            <div
              className="mt-1 flex items-start gap-1.5 text-[11px]"
              data-status={cellMatch.status}
              data-testid="picker-rodziny-cell-match-wynik"
            >
              <span
                className={cellMatch.status === 'pass' ? 'text-emerald-400' : 'text-red-400'}
                aria-hidden="true"
              >
                {cellMatch.status === 'pass' ? '✓' : '✗'}
              </span>
              <span className="text-scada-text">{cellMatch.message_pl}</span>
            </div>
          ) : (
            <div className="mt-1 text-[10px] text-[#8a9aaa]" data-testid="picker-rodziny-cell-match-brak">
              Brak danych dopasowania celki dla związanego pola.
            </div>
          )}
        </div>
      )}

      {wybranyWpis && celki.length > 0 && (
        <div
          className="rounded border border-[#1a2a3a] bg-[#0a1420] p-2"
          data-testid="picker-rodziny-sklad"
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[#4a6a8a]">
            {T.skladNaglowek}
          </div>
          <ul className="mt-1 flex flex-col gap-1">
            {celki.map((celka) => (
              <li
                key={celka.cell_code}
                className="flex items-baseline gap-1.5 text-[11px]"
                data-testid={`picker-rodziny-celka-${celka.cell_code}`}
                data-standard={celka.standard ? 'true' : 'false'}
              >
                <span className="font-mono text-scada-text">{celka.cell_code}</span>
                <span className="text-scada-text">{celka.name_pl}</span>
                <span
                  className={clsx(
                    'rounded px-1 text-[9px]',
                    celka.standard
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-amber-500/15 text-amber-300',
                  )}
                >
                  {celka.standard ? T.standard : T.opcja}
                </span>
                <span className="text-[10px] text-[#8a9aaa]">{celka.apparatus.join(' · ')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

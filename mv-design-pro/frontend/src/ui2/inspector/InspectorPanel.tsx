/*
 * InspectorPanel — inspektor kontekstowy prawego panelu (okno W-110/W-602, karta E1.3).
 *
 * Serce codziennej pracy inżyniera: zawsze ten sam układ dla KAŻDEGO obiektu i wyniku.
 * Zakładki stałe (Właściwości · Wyniki · Dowód · Powiązania), sekcje akordeonowe,
 * pinezka z podziałem (przypięty ↑ / bieżąca selekcja ↓) do porównywania.
 *
 * KONTRAKT (karta §3): W PEŁNI STEROWANY PROPSAMI. Zero wołań API, zero czytania
 * store'ów danych. Jedyny stan lokalny to pinezka + akordeony (pinStore, localStorage)
 * oraz ulotny snapshot przypiętego obiektu (projekcja propa do porównania).
 *
 * DEKLARACJA POWIĄZAŃ (SPEC_POWIAZANIA §5): inspektor jest PROJEKCJĄ; subskrypcje
 * magistrali i adaptery danych realizuje karta integracyjna (nie ten komponent).
 * Determinizm: brak niedeterministycznych źródeł (zegar/losowość).
 */

import { useCallback, useRef, useState, type KeyboardEvent } from 'react';
import '../theme/tokens.css';
import './inspector.css';

import type {
  CelNawigacji,
  InspectorPanelProps,
  ObiektInspektora,
  ZakladkaInspektora,
} from './inspectorModel';
import type { AdvancementMode } from '../shell/modeModel';
import { czyNieaktualne } from './inspectorModel';
import { INSPECTOR_STRINGS } from './strings';
import { usePinStore } from './pinStore';
import { InspectorTabs } from './InspectorTabs';
import { PropertySection } from './PropertySection';
import { LinksTab } from './LinksTab';
import { FreshnessBadge } from './FreshnessBadge';
import { SekcjaPetlaZwarcia } from './SekcjaPetlaZwarcia';

export function InspectorPanel({
  obiekt,
  rewizjaModelu,
  onOtworzDowod,
  onNawiguj,
  onPrzelicz,
  trybZaawansowania,
}: InspectorPanelProps) {
  // Snapshot przypiętego obiektu — projekcja propa uchwycona w chwili przypięcia
  // (nie dane modelu; identyfikator intencji trzyma pinStore w localStorage).
  const [pinnedObiekt, setPinnedObiekt] = useState<ObiektInspektora | null>(null);
  const pinStorePin = usePinStore((s) => s.pin);
  const pinStoreUnpin = usePinStore((s) => s.unpin);

  const przypnij = useCallback(
    (cel: ObiektInspektora) => {
      setPinnedObiekt(cel);
      pinStorePin(cel.id);
    },
    [pinStorePin],
  );

  const odepnij = useCallback(() => {
    setPinnedObiekt(null);
    pinStoreUnpin();
  }, [pinStoreUnpin]);

  const przelaczPin = useCallback(() => {
    if (pinnedObiekt) odepnij();
    else if (obiekt) przypnij(obiekt);
  }, [pinnedObiekt, obiekt, odepnij, przypnij]);

  // Skrót „P" — przełącza pinezkę bieżącej selekcji (poza polami tekstowymi).
  const onRootKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key.toLowerCase() !== 'p' || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    e.preventDefault();
    przelaczPin();
  };

  const pusto = obiekt === null && pinnedObiekt === null;

  return (
    <div
      className="mvd-insp"
      data-testid="mvd-inspector-panel"
      role="region"
      aria-label={INSPECTOR_STRINGS.zakladkiInspektora}
      onKeyDown={onRootKeyDown}
    >
      {pusto ? (
        <p className="mvd-insp-empty" data-testid="mvd-inspector-empty">
          {INSPECTOR_STRINGS.brakSelekcji}
        </p>
      ) : pinnedObiekt ? (
        <div className="mvd-insp-split" data-testid="mvd-inspector-split">
          <div className="mvd-insp-split-part" data-mvd-part="przypiety">
            <div className="mvd-insp-split-label">{INSPECTOR_STRINGS.sekcjaPrzypiety}</div>
            <InspectorView
              obiekt={pinnedObiekt}
              rewizjaModelu={rewizjaModelu}
              trybZaawansowania={trybZaawansowania}
              onOtworzDowod={onOtworzDowod}
              onNawiguj={onNawiguj}
              onPrzelicz={onPrzelicz}
              przypiety
              onTogglePin={odepnij}
              idPrefix="mvd-insp-pinned"
            />
          </div>
          <div className="mvd-insp-split-part" data-mvd-part="biezacy">
            <div className="mvd-insp-split-label">{INSPECTOR_STRINGS.sekcjaBiezacy}</div>
            {obiekt ? (
              <InspectorView
                obiekt={obiekt}
                rewizjaModelu={rewizjaModelu}
                trybZaawansowania={trybZaawansowania}
                onOtworzDowod={onOtworzDowod}
                onNawiguj={onNawiguj}
                onPrzelicz={onPrzelicz}
                przypiety={false}
                onTogglePin={() => przypnij(obiekt)}
                idPrefix="mvd-insp-current"
              />
            ) : (
              <p className="mvd-insp-empty">{INSPECTOR_STRINGS.brakSelekcji}</p>
            )}
          </div>
        </div>
      ) : obiekt ? (
        <InspectorView
          obiekt={obiekt}
          rewizjaModelu={rewizjaModelu}
          trybZaawansowania={trybZaawansowania}
          onOtworzDowod={onOtworzDowod}
          onNawiguj={onNawiguj}
          onPrzelicz={onPrzelicz}
          przypiety={false}
          onTogglePin={() => przypnij(obiekt)}
          idPrefix="mvd-insp-single"
        />
      ) : null}
    </div>
  );
}

interface InspectorViewProps {
  obiekt: ObiektInspektora;
  rewizjaModelu: number;
  trybZaawansowania: AdvancementMode;
  onOtworzDowod: (ref: string) => void;
  onNawiguj: (cel: CelNawigacji) => void;
  onPrzelicz: () => void;
  przypiety: boolean;
  onTogglePin: () => void;
  idPrefix: string;
}

/** Pojedyncza projekcja obiektu: nagłówek + zakładki + treść aktywnej zakładki. */
function InspectorView({
  obiekt,
  rewizjaModelu,
  trybZaawansowania,
  onOtworzDowod,
  onNawiguj,
  onPrzelicz,
  przypiety,
  onTogglePin,
  idPrefix,
}: InspectorViewProps) {
  const [aktywna, setAktywna] = useState<ZakladkaInspektora>('wlasciwosci');
  // Reset zakładki, gdy zmienia się prezentowany obiekt (nowa selekcja).
  const prevId = useRef(obiekt.id);
  if (prevId.current !== obiekt.id) {
    prevId.current = obiekt.id;
    if (aktywna !== 'wlasciwosci') setAktywna('wlasciwosci');
  }

  const ekspercki = trybZaawansowania === 'expert';

  return (
    <div className="mvd-insp-view" data-mvd-obiekt-typ={obiekt.typ}>
      <header className="mvd-insp-header">
        <div className="mvd-insp-title">
          <span className="mvd-insp-obj-name">{obiekt.nazwa}</span>
          <span className="mvd-insp-obj-type">{obiekt.typEtykieta}</span>
        </div>
        <button
          type="button"
          className={przypiety ? 'mvd-btn mvd-btn-primary' : 'mvd-btn'}
          aria-pressed={przypiety}
          data-mvd-action="pinezka"
          data-testid={`${idPrefix}-pin`}
          onClick={onTogglePin}
        >
          {przypiety ? INSPECTOR_STRINGS.odepnij : INSPECTOR_STRINGS.przypnij}
        </button>
      </header>

      <InspectorTabs
        aktywna={aktywna}
        onZmiana={setAktywna}
        idPrefix={idPrefix}
        ariaLabel={INSPECTOR_STRINGS.zakladkiInspektora}
      />

      <div
        role="tabpanel"
        id={`${idPrefix}-panel-${aktywna}`}
        aria-labelledby={`${idPrefix}-tab-${aktywna}`}
        className="mvd-insp-panel"
        tabIndex={0}
      >
        {aktywna === 'wlasciwosci' && (
          <TabWlasciwosci
            obiekt={obiekt}
            rewizjaModelu={rewizjaModelu}
            ekspercki={ekspercki}
            onOtworzDowod={onOtworzDowod}
            onPrzelicz={onPrzelicz}
          />
        )}
        {aktywna === 'wyniki' && (
          <TabWyniki
            obiekt={obiekt}
            rewizjaModelu={rewizjaModelu}
            onOtworzDowod={onOtworzDowod}
            onPrzelicz={onPrzelicz}
          />
        )}
        {aktywna === 'dowod' && (
          <TabDowod obiekt={obiekt} rewizjaModelu={rewizjaModelu} onOtworzDowod={onOtworzDowod} onPrzelicz={onPrzelicz} />
        )}
        {aktywna === 'powiazania' && (
          <LinksTab powiazania={obiekt.powiazania} onNawiguj={onNawiguj} />
        )}
      </div>
    </div>
  );
}

function TabWlasciwosci({
  obiekt,
  rewizjaModelu,
  ekspercki,
  onOtworzDowod,
  onPrzelicz,
}: {
  obiekt: ObiektInspektora;
  rewizjaModelu: number;
  ekspercki: boolean;
  onOtworzDowod: (ref: string) => void;
  onPrzelicz: () => void;
}) {
  return (
    <>
      {obiekt.wlasciwosci.map((sekcja) => (
        <PropertySection
          key={sekcja.id}
          typObiektu={obiekt.typ}
          sekcja={sekcja}
          rewizjaModelu={rewizjaModelu}
          onOtworzDowod={onOtworzDowod}
          onPrzelicz={onPrzelicz}
        />
      ))}
      {ekspercki && <SzczegolyTechniczne obiekt={obiekt} />}
    </>
  );
}

/** Identyfikatory techniczne — WYŁĄCZNIE w trybie Eksperckim (karta §5). */
function SzczegolyTechniczne({ obiekt }: { obiekt: ObiektInspektora }) {
  return (
    <section className="mvd-insp-section" data-mvd-section="szczegoly-techniczne">
      <h4 className="mvd-insp-section-head mvd-insp-tech-head">
        {INSPECTOR_STRINGS.szczegolyTechniczne}
      </h4>
      <div className="mvd-insp-kv-grid">
        <div className="mvd-insp-kv-row">
          <span className="mvd-insp-kv-label">Id</span>
          <span className="mvd-insp-kv-value">
            <span className="mvd-insp-num">{obiekt.id}</span>
          </span>
        </div>
        {(obiekt.szczegolyTechniczne ?? []).map((para) => (
          <div className="mvd-insp-kv-row" key={para.klucz}>
            <span className="mvd-insp-kv-label">{para.klucz}</span>
            <span className="mvd-insp-kv-value">
              <span className="mvd-insp-num">{para.wartosc}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function TabWyniki({
  obiekt,
  rewizjaModelu,
  onOtworzDowod,
  onPrzelicz,
}: {
  obiekt: ObiektInspektora;
  rewizjaModelu: number;
  onOtworzDowod: (ref: string) => void;
  onPrzelicz: () => void;
}) {
  const jestStacja = obiekt.typ === 'stacja';
  if (obiekt.wyniki.length === 0 && !jestStacja) {
    return (
      <p className="mvd-insp-empty" data-testid="mvd-inspector-wyniki-empty">
        {INSPECTOR_STRINGS.brakWynikow}
      </p>
    );
  }

  const rewWynikow = obiekt.rewizjaWynikow;
  const nieaktualne = rewWynikow !== undefined && czyNieaktualne(rewWynikow, rewizjaModelu);

  return (
    <>
      {jestStacja ? <SekcjaPetlaZwarcia stationRef={obiekt.id} /> : null}
      {nieaktualne && (
        <div className="mvd-insp-results-freshness" data-testid="mvd-inspector-wyniki-freshness">
          <FreshnessBadge
            rewizjaDanej={rewWynikow!}
            rewizjaModelu={rewizjaModelu}
            onPrzelicz={onPrzelicz}
          />
        </div>
      )}
      {obiekt.wyniki.map((sekcja) => (
        <PropertySection
          key={sekcja.id}
          typObiektu={obiekt.typ}
          sekcja={sekcja}
          rewizjaModelu={rewizjaModelu}
          onOtworzDowod={onOtworzDowod}
          onPrzelicz={onPrzelicz}
        />
      ))}
    </>
  );
}

function TabDowod({
  obiekt,
  rewizjaModelu,
  onOtworzDowod,
  onPrzelicz,
}: {
  obiekt: ObiektInspektora;
  rewizjaModelu: number;
  onOtworzDowod: (ref: string) => void;
  onPrzelicz: () => void;
}) {
  if (obiekt.dowody.length === 0) {
    return <p className="mvd-insp-empty">{INSPECTOR_STRINGS.brakDowodow}</p>;
  }

  return (
    <ul className="mvd-insp-proofs">
      {obiekt.dowody.map((dowod) => (
        <li key={dowod.ref} className="mvd-insp-proof">
          <span className="mvd-insp-proof-label">{dowod.etykieta}</span>
          <span className="mvd-insp-proof-tail">
            {dowod.rewizja !== undefined && (
              <FreshnessBadge
                rewizjaDanej={dowod.rewizja}
                rewizjaModelu={rewizjaModelu}
                onPrzelicz={onPrzelicz}
                pokazAktualne={false}
              />
            )}
            <button
              type="button"
              className="mvd-btn"
              data-mvd-action="dowod"
              onClick={() => onOtworzDowod(dowod.ref)}
            >
              {INSPECTOR_STRINGS.pokazDowod}
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}

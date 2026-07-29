/*
 * Kafel „Warunki przyłączenia i bilans mocy" (W-101, E1 — B1/B2 + K2). Pierwsze
 * ogniwo FLOW projektanta: warunki od strony sieci (Sk″/Ik″/U punktu
 * przyłączenia), warunki OSD z nagłówka modelu (moc przyłączeniowa / cosφ /
 * tryb pracy — operacja `set_connection_conditions`) oraz bilans mocy
 * ZNAMIONOWEJ (generacja vs obciążenie) z werdyktem względem limitu OSD.
 *
 * Dane z `mapujPrzylaczenie` (pulpitAdapter, rollup read-only). Zero fizyki
 * (sumy znamionowe i porównanie z limitem = projekcja danych WEJŚCIOWYCH, nie
 * wynik solvera). Formularz warunków woła REALNĄ operację domenową przez
 * `useSnapshotStore.executeDomainOperation` (ta sama ścieżka co kreatory) —
 * po sukcesie store podmienia snapshot i kafel odświeża się sam.
 *
 * Kafel jest statycznym kontenerem (bez `onKlik`) — wewnątrz żyje przycisk
 * formularza; zagnieżdżanie button-w-button jest niedozwolone w HTML.
 */

import { useState } from 'react';
import { Kafel, KafelWiersz, Tag } from './Kafel';
import { PULPIT_STRINGS, fmtLiczbaPL } from './strings';
import type { PrzylaczenieKafel } from './pulpitAdapter';
import { useAppStateStore } from '../../../ui/app-state';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';

/** Parsuje liczbę z pola formularza (przecinek PL dozwolony); '' → null. */
function parsujLiczbe(tekst: string): number | null {
  const t = tekst.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
}

function FormularzWarunkowOsd({ onZamknij }: { onZamknij: () => void }) {
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const [moc, setMoc] = useState('');
  const [cosPhi, setCosPhi] = useState('');
  const [tryb, setTryb] = useState('');
  const [blad, setBlad] = useState<string | null>(null);

  const onZapisz = async () => {
    if (!activeCaseId) {
      setBlad(PULPIT_STRINGS.osdFormBrakZakresu);
      return;
    }
    const mocN = parsujLiczbe(moc);
    const cosN = parsujLiczbe(cosPhi);
    const trybT = tryb.trim();
    if (mocN !== null && (Number.isNaN(mocN) || mocN <= 0)) {
      setBlad(PULPIT_STRINGS.osdFormBladMoc);
      return;
    }
    if (cosN !== null && (Number.isNaN(cosN) || cosN <= 0 || cosN > 1)) {
      setBlad(PULPIT_STRINGS.osdFormBladCosPhi);
      return;
    }
    if (mocN === null && cosN === null && trybT === '') {
      setBlad(PULPIT_STRINGS.osdFormBladPuste);
      return;
    }
    setBlad(null);
    const payload: Record<string, unknown> = {};
    if (mocN !== null) payload.moc_przylaczeniowa_mw = mocN;
    if (cosN !== null) payload.wymagany_cos_phi = cosN;
    if (trybT !== '') payload.tryb_pracy = trybT;
    const response = await executeDomainOperation(
      activeCaseId,
      'set_connection_conditions',
      payload,
    );
    if (!response) {
      setBlad(useSnapshotStore.getState().error ?? PULPIT_STRINGS.osdFormBladPuste);
      return;
    }
    if (response.error) {
      setBlad(String(response.error));
      return;
    }
    onZamknij();
  };

  return (
    <div className="mvd-kafel-form" data-testid="pulpit-osd-form">
      <label className="mvd-kafel-form-pole">
        <span>{PULPIT_STRINGS.osdFormMoc}</span>
        <input
          type="text"
          inputMode="decimal"
          value={moc}
          onChange={(e) => setMoc(e.target.value)}
          data-testid="pulpit-osd-moc"
        />
      </label>
      <label className="mvd-kafel-form-pole">
        <span>{PULPIT_STRINGS.osdFormCosPhi}</span>
        <input
          type="text"
          inputMode="decimal"
          value={cosPhi}
          onChange={(e) => setCosPhi(e.target.value)}
          data-testid="pulpit-osd-cosphi"
        />
      </label>
      <label className="mvd-kafel-form-pole">
        <span>{PULPIT_STRINGS.osdFormTryb}</span>
        <input
          type="text"
          value={tryb}
          onChange={(e) => setTryb(e.target.value)}
          data-testid="pulpit-osd-tryb"
        />
      </label>
      {blad && (
        <p className="mvd-kafel-form-blad" role="alert" data-testid="pulpit-osd-blad">
          {blad}
        </p>
      )}
      <div className="mvd-kafel-form-akcje">
        <button
          type="button"
          className="mvd-btn mvd-btn-primary"
          onClick={() => void onZapisz()}
          data-testid="pulpit-osd-zapisz"
        >
          {PULPIT_STRINGS.osdFormZapisz}
        </button>
        <button type="button" className="mvd-btn" onClick={onZamknij}>
          {PULPIT_STRINGS.osdFormAnuluj}
        </button>
      </div>
    </div>
  );
}

export function KafelPrzylaczenia({ dane }: { dane: PrzylaczenieKafel }) {
  const glowne = dane.zrodlaSieciowe[0] ?? null;
  const [formOtwarty, setFormOtwarty] = useState(false);
  const maWarunkiOsd =
    dane.mocPrzylaczeniowaMw !== null || dane.wymaganyCosPhi !== null || dane.trybPracy !== null;

  return (
    <Kafel tytul={PULPIT_STRINGS.przylaczenieTytul} ariaLabel={PULPIT_STRINGS.przylaczenieTytul}>
      {glowne === null ? (
        <div className="mvd-kafel-pusty" data-testid="pulpit-przylaczenie-brak">
          <p className="mvd-kafel-pusty-glowny">{PULPIT_STRINGS.przylaczenieBrakZrodla}</p>
          <p className="mvd-kafel-pusty-opis">{PULPIT_STRINGS.przylaczenieBrakZrodlaOpis}</p>
        </div>
      ) : (
        <>
          <div className="mvd-kafel-kv">
            <KafelWiersz etykieta={PULPIT_STRINGS.przylaczenieNapiecie}>
              <span className="mvd-num" data-testid="pulpit-przylaczenie-napiecie">
                {fmtLiczbaPL(glowne.napiecieKv, 1)} {PULPIT_STRINGS.jednKv}
              </span>
            </KafelWiersz>
            <KafelWiersz etykieta={PULPIT_STRINGS.przylaczenieSk}>
              <span className="mvd-num" data-testid="pulpit-przylaczenie-sk">
                {fmtLiczbaPL(glowne.sk3Mva, 0)} {PULPIT_STRINGS.jednMva}
              </span>
            </KafelWiersz>
            <KafelWiersz etykieta={PULPIT_STRINGS.przylaczenieIk}>
              <span className="mvd-num">
                {fmtLiczbaPL(glowne.ik3Ka, 2)} {PULPIT_STRINGS.jednKa}
              </span>
            </KafelWiersz>
          </div>
          {dane.zrodlaSieciowe.length > 1 && (
            <p className="mvd-kafel-uwaga" data-testid="pulpit-przylaczenie-wiele">
              {PULPIT_STRINGS.przylaczenieWieleZrodel(dane.zrodlaSieciowe.length)}
            </p>
          )}
        </>
      )}

      {/* Warunki OSD z nagłówka modelu (K2) — niezależne od obecności źródła. */}
      <div className="mvd-kafel-kv mvd-kafel-kv-sep" data-testid="pulpit-osd-warunki">
        {maWarunkiOsd ? (
          <>
            {dane.mocPrzylaczeniowaMw !== null && (
              <KafelWiersz etykieta={PULPIT_STRINGS.osdLimit}>
                <span className="mvd-num" data-testid="pulpit-osd-limit">
                  {fmtLiczbaPL(dane.mocPrzylaczeniowaMw, 2)} {PULPIT_STRINGS.jednMw}
                </span>
              </KafelWiersz>
            )}
            {dane.wymaganyCosPhi !== null && (
              <KafelWiersz etykieta={PULPIT_STRINGS.osdCosPhi}>
                <span className="mvd-num">{fmtLiczbaPL(dane.wymaganyCosPhi, 2)}</span>
              </KafelWiersz>
            )}
            {dane.trybPracy !== null && (
              <KafelWiersz etykieta={PULPIT_STRINGS.osdTrybPracy}>
                <span>{dane.trybPracy}</span>
              </KafelWiersz>
            )}
          </>
        ) : (
          <p className="mvd-kafel-uwaga" data-testid="pulpit-osd-nie-podano">
            {PULPIT_STRINGS.osdBrak}
          </p>
        )}
      </div>

      <div className="mvd-kafel-kv mvd-kafel-kv-sep">
        <KafelWiersz etykieta={PULPIT_STRINGS.przylaczenieGeneracja}>
          <span className="mvd-num" data-testid="pulpit-przylaczenie-generacja">
            {fmtLiczbaPL(dane.generacjaMw, 2)} {PULPIT_STRINGS.jednMw}
          </span>
        </KafelWiersz>
        <KafelWiersz etykieta={PULPIT_STRINGS.przylaczenieOdbiory}>
          <span className="mvd-num" data-testid="pulpit-przylaczenie-odbiory">
            {fmtLiczbaPL(dane.odbioryMw, 2)} {PULPIT_STRINGS.jednMw}
          </span>
        </KafelWiersz>
        <KafelWiersz etykieta={PULPIT_STRINGS.przylaczenieNetto}>
          <span className="mvd-num" data-testid="pulpit-przylaczenie-netto">
            {fmtLiczbaPL(dane.nettoMw, 2)} {PULPIT_STRINGS.jednMw}
          </span>
        </KafelWiersz>
        {dane.przekroczonoLimit !== null && (
          <div className="mvd-kafel-werdykt" data-testid="pulpit-osd-werdykt">
            <Tag wariant={dane.przekroczonoLimit ? 'warn' : 'ok'}>
              {dane.przekroczonoLimit
                ? PULPIT_STRINGS.osdWerdyktPrzekroczono
                : PULPIT_STRINGS.osdWerdyktOk}
            </Tag>
          </div>
        )}
      </div>

      {formOtwarty ? (
        <FormularzWarunkowOsd onZamknij={() => setFormOtwarty(false)} />
      ) : (
        <button
          type="button"
          className="mvd-btn mvd-kafel-form-otworz"
          onClick={() => setFormOtwarty(true)}
          data-testid="pulpit-osd-uzupelnij"
        >
          {PULPIT_STRINGS.osdUzupelnij}
        </button>
      )}
    </Kafel>
  );
}

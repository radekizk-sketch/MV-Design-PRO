/*
 * Kafel „Warunki przyłączenia i bilans mocy" (W-101, E1 — B1/B2 + K2). Pierwsze
 * ogniwo FLOW projektanta: warunki od strony sieci (Sk″/Ik″/U punktu
 * przyłączenia), warunki OSD z nagłówka modelu (moc przyłączeniowa / cosφ /
 * tryb pracy — operacja `set_connection_conditions`) oraz bilans mocy
 * ZNAMIONOWEJ (generacja vs obciążenie) z werdyktem względem limitu OSD.
 * Operator sieci (dodatek karty GPZ-DANE-ANALIZ) — jedna dana modelu wybierana z katalogu
 * profili NC RfG; źródła bez własnego profilu dziedziczą go (backend `enm.operator_sieci`).
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

import { useEffect, useState } from 'react';
import { Kafel, KafelWiersz, Tag } from './Kafel';
import { PULPIT_STRINGS, fmtLiczbaPL } from './strings';
import type { PrzylaczenieKafel } from './pulpitAdapter';
import { useAppStateStore } from '../../../ui/app-state';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { useNcRfgStore } from '../../oze/ncRfgStore';

/** Parsuje liczbę z pola formularza (przecinek PL dozwolony); '' → null. */
function parsujLiczbe(tekst: string): number | null {
  const t = tekst.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
}

function FormularzWarunkowOsd({
  operatorSieci,
  onZamknij,
}: {
  /** Operator sieci zapisany w modelu (`null` — nie wskazano); punkt startowy listy. */
  operatorSieci: string | null;
  onZamknij: () => void;
}) {
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  // Lista operatorów = katalog profili NC RfG backendu (ta sama lista, którą waliduje
  // `set_connection_conditions`) — zero listy zaszytej we froncie.
  const katalog = useNcRfgStore((s) => s.katalog);
  const zaladujKatalog = useNcRfgStore((s) => s.zaladujKatalog);
  const [moc, setMoc] = useState('');
  const [cosPhi, setCosPhi] = useState('');
  const [tryb, setTryb] = useState('');
  const [operator, setOperator] = useState(operatorSieci ?? '');
  const [blad, setBlad] = useState<string | null>(null);

  useEffect(() => {
    void zaladujKatalog();
  }, [zaladujKatalog]);

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
    const operatorZmieniony = operator !== (operatorSieci ?? '');
    if (mocN === null && cosN === null && trybT === '' && !operatorZmieniony) {
      setBlad(PULPIT_STRINGS.osdFormBladPuste);
      return;
    }
    setBlad(null);
    const payload: Record<string, unknown> = {};
    if (mocN !== null) payload.moc_przylaczeniowa_mw = mocN;
    if (cosN !== null) payload.wymagany_cos_phi = cosN;
    if (trybT !== '') payload.tryb_pracy = trybT;
    // `null` czyści operatora sieci w modelu (źródła bez własnego profilu tracą profil).
    if (operatorZmieniony) payload.operator_sieci = operator === '' ? null : operator;
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
      <label className="mvd-kafel-form-pole">
        <span>{PULPIT_STRINGS.osdOperatorSieci}</span>
        <select
          value={operator}
          onChange={(e) => setOperator(e.target.value)}
          disabled={katalog === null}
          aria-busy={katalog === null}
          data-testid="pulpit-osd-operator"
          title={PULPIT_STRINGS.osdFormOperatorOpis}
        >
          <option value="">
            {katalog === null ? PULPIT_STRINGS.osdFormOperatorKatalog : PULPIT_STRINGS.osdFormOperatorBrak}
          </option>
          {(katalog?.operators ?? []).map((op) => (
            <option key={op.operator_id} value={op.operator_id}>
              {op.operator_name_pl}
            </option>
          ))}
        </select>
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
  const katalogNcRfg = useNcRfgStore((s) => s.katalog);
  const zaladujKatalogNcRfg = useNcRfgStore((s) => s.zaladujKatalog);
  // Nazwa operatora sieci pochodzi z katalogu profili (identyfikator nie jest tekstem dla
  // projektanta) — katalog wczytywany, gdy model wskazuje operatora.
  useEffect(() => {
    if (dane.operatorSieci !== null) void zaladujKatalogNcRfg();
  }, [dane.operatorSieci, zaladujKatalogNcRfg]);
  const maWarunkiOsd =
    dane.mocPrzylaczeniowaMw !== null ||
    dane.wymaganyCosPhi !== null ||
    dane.trybPracy !== null ||
    dane.operatorSieci !== null;
  const nazwaOperatoraSieci =
    dane.operatorSieci === null
      ? null
      : (katalogNcRfg?.operators.find((op) => op.operator_id === dane.operatorSieci)
          ?.operator_name_pl ?? dane.operatorSieci);

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
            {/* CV-4.3 K7: „Sk″maks / Sk″min" gdy scenariusz MIN podany, samo „Sk″"
                gdy nie (bez fabrykacji) — ta sama reguła dla Ik″. */}
            <KafelWiersz etykieta={glowne.sk3MinMva !== null ? PULPIT_STRINGS.przylaczenieSkMaks : PULPIT_STRINGS.przylaczenieSk}>
              <span className="mvd-num" data-testid="pulpit-przylaczenie-sk">
                {fmtLiczbaPL(glowne.sk3Mva, 0)} {PULPIT_STRINGS.jednMva}
              </span>
            </KafelWiersz>
            {glowne.sk3MinMva !== null && (
              <KafelWiersz etykieta={PULPIT_STRINGS.przylaczenieSkMin}>
                <span className="mvd-num" data-testid="pulpit-przylaczenie-sk-min">
                  {fmtLiczbaPL(glowne.sk3MinMva, 0)} {PULPIT_STRINGS.jednMva}
                </span>
              </KafelWiersz>
            )}
            <KafelWiersz etykieta={glowne.ik3MinKa !== null ? PULPIT_STRINGS.przylaczenieIkMaks : PULPIT_STRINGS.przylaczenieIk}>
              <span className="mvd-num">
                {fmtLiczbaPL(glowne.ik3Ka, 2)} {PULPIT_STRINGS.jednKa}
              </span>
            </KafelWiersz>
            {glowne.ik3MinKa !== null && (
              <KafelWiersz etykieta={PULPIT_STRINGS.przylaczenieIkMin}>
                <span className="mvd-num" data-testid="pulpit-przylaczenie-ik-min">
                  {fmtLiczbaPL(glowne.ik3MinKa, 2)} {PULPIT_STRINGS.jednKa}
                </span>
              </KafelWiersz>
            )}
            {/* CV-4.3 K7c: napięcie zadane szyny bilansującej — wiersz WYŁĄCZNIE
                gdy źródło je niesie (zero fabrykacji), ta sama reguła co MIN wyżej. */}
            {glowne.uSetPu !== null && (
              <KafelWiersz etykieta={PULPIT_STRINGS.przylaczenieUZadane}>
                <span className="mvd-num" data-testid="pulpit-przylaczenie-u-zadane">
                  {fmtLiczbaPL(glowne.uSetPu, 3)} {PULPIT_STRINGS.jednPu}
                </span>
              </KafelWiersz>
            )}
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
            {nazwaOperatoraSieci !== null && (
              <KafelWiersz etykieta={PULPIT_STRINGS.osdOperatorSieci}>
                <span data-testid="pulpit-osd-operator-sieci">{nazwaOperatoraSieci}</span>
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
        <FormularzWarunkowOsd
          operatorSieci={dane.operatorSieci}
          onZamknij={() => setFormOtwarty(false)}
        />
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

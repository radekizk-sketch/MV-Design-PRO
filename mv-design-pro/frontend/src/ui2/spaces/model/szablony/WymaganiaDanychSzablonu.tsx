/*
 * Panel „Wymagania danych" szablonu — pozycja menu kontekstowego (karta §3
 * przeglądarki: „prawy klik = menu (Porównaj / Pokaż wymagania danych)").
 * Zamknięcie luki KARTA-UI2 §1 p. 12: pozycja menu miała `onPokazWymaganiaDanych`
 * jako opcjonalny callback z rodzica (zawsze `undefined` — żaden wołający
 * `<PrzegladarkaSzablonow>` go nie dostarczał, więc pozycja była trwale
 * wyszarzona). Wymagania danych czyta się WYŁĄCZNIE z kontraktu szablonu
 * (`StationTemplateFull.schema`, już wczytanego przez przeglądarkę — zero
 * nowego zapytania sieciowego), więc dostawcą jest sama przeglądarka, nie
 * rodzic — stąd panel żyje lokalnie w `PrzegladarkaSzablonow.tsx`, bez propsa.
 *
 * Rama inna niż `SzczegolySzablonu.tsx`: tamten panel pokazuje „co można
 * wybrać/edytować" (opcje + parametry edytowalne kreatora); ten panel pokazuje
 * te same listy jako WYMAGANIA — jaki typ katalogowy (namespace) musi
 * dostarczyć katalog, ile ma opcji, która jest domyślna. Obejmuje też
 * `schema.sn_bay_apparatus_options` (aparatura pól SN, B-12) — wymiar bez
 * ŻADNEJ dotychczasowej reprezentacji w UI (nie duplikat, realne domknięcie
 * luki pokrycia).
 */

import type {
  CatalogChoice,
  ProtectionRelaySpec,
  StationTemplateFull,
} from './szablonyClient';
import { SZABLONY_STRINGS } from './strings';

function domyslnaOpcja(opcje: readonly CatalogChoice[]): CatalogChoice | undefined {
  return opcje.find((o) => o.default) ?? opcje[0];
}

function SekcjaKatalogowa({ etykieta, opcje }: { etykieta: string; opcje: readonly CatalogChoice[] }) {
  if (opcje.length === 0) return null;
  const domyslna = domyslnaOpcja(opcje);
  return (
    <section className="mvd-szablony-wymagania-sekcja">
      <h4>{etykieta}</h4>
      <div className="mvd-kafel-kv-row">
        <span className="mvd-kafel-kv-label">{SZABLONY_STRINGS.wymaganiaNamespace}</span>
        <span className="mvd-kafel-kv-value">{opcje[0].namespace}</span>
      </div>
      <div className="mvd-kafel-kv-row">
        <span className="mvd-kafel-kv-label">{SZABLONY_STRINGS.wymaganiaLiczbaOpcji}</span>
        <span className="mvd-kafel-kv-value mvd-num">{opcje.length}</span>
      </div>
      {domyslna && (
        <div className="mvd-kafel-kv-row">
          <span className="mvd-kafel-kv-label">{SZABLONY_STRINGS.wymaganiaDomyslna}</span>
          <span className="mvd-kafel-kv-value">{domyslna.label_pl}</span>
        </div>
      )}
    </section>
  );
}

function SekcjaZabezpieczenia({ pozycje }: { pozycje: readonly ProtectionRelaySpec[] }) {
  if (pozycje.length === 0) return null;
  return (
    <section className="mvd-szablony-wymagania-sekcja">
      <h4>{SZABLONY_STRINGS.szczegolyZabezpieczenia}</h4>
      <div className="mvd-kafel-kv-row">
        <span className="mvd-kafel-kv-label">{SZABLONY_STRINGS.wymaganiaLiczbaOpcji}</span>
        <span className="mvd-kafel-kv-value mvd-num">{pozycje.length}</span>
      </div>
      <ul className="mvd-szablony-lista">
        {pozycje.map((p) => (
          <li key={p.device_catalog_ref}>
            {p.label_pl} · {p.vendor}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SekcjaRozdzielnica({
  producenci,
  domyslny,
}: {
  producenci: readonly string[];
  domyslny: string;
}) {
  if (producenci.length === 0) return null;
  return (
    <section className="mvd-szablony-wymagania-sekcja">
      <h4>{SZABLONY_STRINGS.wymaganiaRozdzielnicaSn}</h4>
      <div className="mvd-kafel-kv-row">
        <span className="mvd-kafel-kv-label">{SZABLONY_STRINGS.wymaganiaDomyslna}</span>
        <span className="mvd-kafel-kv-value">{domyslny}</span>
      </div>
      <div className="mvd-kafel-kv-row">
        <span className="mvd-kafel-kv-label">{SZABLONY_STRINGS.wymaganiaLiczbaOpcji}</span>
        <span className="mvd-kafel-kv-value mvd-num">{producenci.length}</span>
      </div>
    </section>
  );
}

export interface WymaganiaDanychSzablonuProps {
  szablon: StationTemplateFull;
  onZamknij: () => void;
}

export function WymaganiaDanychSzablonu({ szablon, onZamknij }: WymaganiaDanychSzablonuProps) {
  const { schema } = szablon;

  return (
    <div
      className="mvd-szablony-wymagania-scrim"
      data-testid="mvd-szablony-wymagania-scrim"
      onClick={onZamknij}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={SZABLONY_STRINGS.wymaganiaTytul}
        className="mvd-szablony-wymagania"
        data-testid="mvd-szablony-wymagania"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mvd-szablony-szczegoly-head">
          <h3>{SZABLONY_STRINGS.wymaganiaTytul}</h3>
          <p>{szablon.name_pl}</p>
        </header>

        <SekcjaKatalogowa etykieta={SZABLONY_STRINGS.szczegolyTransformator} opcje={schema.transformer_options} />
        <SekcjaKatalogowa etykieta={SZABLONY_STRINGS.wymaganiaAparaturaPol} opcje={schema.sn_bay_apparatus_options} />
        <SekcjaZabezpieczenia pozycje={schema.sn_bay_protection_options} />
        <SekcjaRozdzielnica
          producenci={schema.sn_switchgear_manufacturers}
          domyslny={schema.sn_switchgear_default}
        />
        <SekcjaKatalogowa etykieta={SZABLONY_STRINGS.szczegolyOdplywyNn} opcje={schema.nn_feeder_cb_options} />
        {schema.der_options.map((der) => (
          <SekcjaKatalogowa key={der.kind} etykieta={der.label_pl} opcje={der.catalog_options} />
        ))}
        <SekcjaKatalogowa etykieta={SZABLONY_STRINGS.wymaganiaPrzekladnikiPradowe} opcje={schema.ct_options} />
        <SekcjaKatalogowa etykieta={SZABLONY_STRINGS.wymaganiaPrzekladnikiNapieciowe} opcje={schema.vt_options} />
        <SekcjaKatalogowa etykieta={SZABLONY_STRINGS.wymaganiaLicznikiEnergii} opcje={schema.energy_meter_options} />

        <footer className="mvd-szablony-szczegoly-stopka">
          <button
            type="button"
            className="mvd-btn"
            data-testid="mvd-szablony-wymagania-zamknij"
            onClick={onZamknij}
          >
            {SZABLONY_STRINGS.wymaganiaZamknij}
          </button>
        </footer>
      </div>
    </div>
  );
}

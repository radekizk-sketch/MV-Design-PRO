/*
 * Panel szczegółów wybranego szablonu (karta §2: „pola/aparaty/transformator +
 * parametry edytowalne"). Renderuje pełny `StationTemplateFull.schema`
 * (kształt 1:1 z `backend/src/application/station_templates/schema.py:104-269`)
 * — transformator, pola SN + role + zabezpieczenia, odpływy nn, źródła/magazyny
 * (DER), pomiary (CT/VT/liczniki), parametry edytowalne (zakresy min/max/krok).
 * Akcja główna „Zastosuj i edytuj" woła WYŁĄCZNIE callback `onZastosuj` —
 * realne wywołanie endpointu apply jest poza zakresem karty (karta §3).
 */

import type {
  CatalogChoice,
  DerKindSpec,
  ProtectionRelaySpec,
  StationTemplateFull,
  TemplateParamFloat,
  TemplateParamInt,
} from './api/szablonyClient';
import { SZABLONY_STRINGS } from './strings';

function Opcje({ opcje }: { opcje: readonly CatalogChoice[] }) {
  if (opcje.length === 0) return <p className="mvd-szablony-brak">—</p>;
  return (
    <ul className="mvd-szablony-lista">
      {opcje.map((opcja) => (
        <li key={opcja.catalog_ref}>
          {opcja.label_pl}
          {opcja.default && <span className="mvd-tag mvd-tag-ok">domyślny</span>}
          {opcja.badge_pl && <span className="mvd-tag mvd-tag-mut">{opcja.badge_pl}</span>}
        </li>
      ))}
    </ul>
  );
}

function Zabezpieczenia({ pozycje }: { pozycje: readonly ProtectionRelaySpec[] }) {
  if (pozycje.length === 0) return <p className="mvd-szablony-brak">—</p>;
  return (
    <ul className="mvd-szablony-lista">
      {pozycje.map((p) => (
        <li key={p.device_catalog_ref}>
          {p.label_pl}
          {p.badge_pl && <span className="mvd-tag mvd-tag-mut">{p.badge_pl}</span>}
        </li>
      ))}
    </ul>
  );
}

function ParametrInt({ parametr }: { parametr: TemplateParamInt }) {
  return (
    <div className="mvd-kafel-kv-row">
      <span className="mvd-kafel-kv-label">{parametr.label_pl}</span>
      <span className="mvd-kafel-kv-value mvd-num">
        {parametr.default} ({parametr.min_value}–{parametr.max_value})
      </span>
    </div>
  );
}

function ParametrFloat({ parametr }: { parametr: TemplateParamFloat }) {
  return (
    <div className="mvd-kafel-kv-row">
      <span className="mvd-kafel-kv-label">{parametr.label_pl}</span>
      <span className="mvd-kafel-kv-value mvd-num">
        {parametr.default} {parametr.unit} ({parametr.min_value}–{parametr.max_value})
      </span>
    </div>
  );
}

function Der({ der }: { der: DerKindSpec }) {
  return (
    <li>
      <strong>{der.label_pl}</strong>
      <span className="mvd-szablony-der-info">
        {der.default_count} × {der.default_p_mw_each} MW · {der.connection_variant_options.join(', ')}
      </span>
      <Opcje opcje={der.catalog_options} />
    </li>
  );
}

export interface SzczegolySzablonuProps {
  szablon: StationTemplateFull | null;
  onZastosuj: (idSzablonu: string) => void;
}

export function SzczegolySzablonu({ szablon, onZastosuj }: SzczegolySzablonuProps) {
  if (!szablon) {
    return (
      <div className="mvd-szablony-szczegoly mvd-szablony-szczegoly-puste" data-testid="mvd-szczegoly-puste">
        <p>{SZABLONY_STRINGS.szczegolyBrakWyboru}</p>
      </div>
    );
  }

  const { schema } = szablon;

  return (
    <div className="mvd-szablony-szczegoly" data-testid="mvd-szczegoly" aria-label={SZABLONY_STRINGS.szczegolyTytul}>
      <header className="mvd-szablony-szczegoly-head">
        <h3>{szablon.name_pl}</h3>
        <p>{szablon.description_pl}</p>
        <p className="mvd-szablony-kafel-opis">
          <strong>{SZABLONY_STRINGS.opisZastosowania}: </strong>
          {szablon.use_case_pl}
        </p>
      </header>

      <section>
        <h4>{SZABLONY_STRINGS.szczegolyTransformator}</h4>
        <ParametrInt parametr={schema.transformer_count} />
        <Opcje opcje={schema.transformer_options} />
      </section>

      <section>
        <h4>{SZABLONY_STRINGS.szczegolyPolaSn}</h4>
        <ParametrInt parametr={schema.sn_bays_count} />
        <ul className="mvd-szablony-lista">
          {schema.sn_bay_roles.map((rola, indeks) => (
            <li key={`${rola.role}-${indeks}`}>{rola.label_pl}</li>
          ))}
        </ul>
        <h5>{SZABLONY_STRINGS.szczegolyZabezpieczenia}</h5>
        <Zabezpieczenia pozycje={schema.sn_bay_protection_options} />
      </section>

      <section>
        <h4>{SZABLONY_STRINGS.szczegolyOdplywyNn}</h4>
        <ParametrInt parametr={schema.nn_feeders_count} />
        <ParametrFloat parametr={schema.nn_load_default_kw} />
        <Opcje opcje={schema.nn_feeder_cb_options} />
      </section>

      <section>
        <h4>{SZABLONY_STRINGS.szczegolyZrodla}</h4>
        {schema.der_options.length === 0 ? (
          <p className="mvd-szablony-brak">{SZABLONY_STRINGS.szczegolyBrakDer}</p>
        ) : (
          <>
            <ParametrInt parametr={schema.der_total_count} />
            <ul className="mvd-szablony-lista">
              {schema.der_options.map((der, indeks) => (
                <Der key={`${der.kind}-${indeks}`} der={der} />
              ))}
            </ul>
          </>
        )}
      </section>

      <section>
        <h4>{SZABLONY_STRINGS.szczegolyPomiary}</h4>
        <Opcje opcje={schema.ct_options} />
        <Opcje opcje={schema.vt_options} />
        <Opcje opcje={schema.energy_meter_options} />
      </section>

      <footer className="mvd-szablony-szczegoly-stopka">
        <button type="button" className="mvd-btn mvd-btn-primary" onClick={() => onZastosuj(szablon.id)}>
          {SZABLONY_STRINGS.zastosujIEdytuj}
        </button>
      </footer>
    </div>
  );
}

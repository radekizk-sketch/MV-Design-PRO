"""Station Templates API — K30-16 user-requested 57+ templates.

REST endpoints:
- GET /api/station-templates — list all 57 templates
- GET /api/station-templates?category=<cat> — filter by category
- GET /api/station-templates/{template_id} — full schema + editable params
- GET /api/station-templates/categories — list 10 categories with counts
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from application.station_templates import (
    StationTemplate,
    TemplateCategory,
    get_template,
    list_templates,
    list_templates_by_category,
)
from application.station_templates.apply import (
    TemplateApplyError,
    apply_template_to_case,
)
from application.station_templates.service import count_by_category
from application.station_templates.user_store import (
    lista_szablonow_uzytkownika as list_user_templates,
)
from application.station_templates.user_store import (
    usun_szablon_uzytkownika as delete_user_template,
)
from application.station_templates.user_store import (
    zapisz_szablon_uzytkownika as save_user_template,
)
from fastapi import APIRouter, Body, HTTPException, Query
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/station-templates", tags=["station-templates"])


def klucz_przypadku(case_id: str) -> str:
    """JEDYNE źródło prawdy o kluczu magazynu ENM dla końcówek szablonów.

    ROZSTRZYGNIĘCIE (dług 2 z V12K-315, rozjazd normalizacji klucza przypadku).
    Wygrywa **surowy łańcuch z adresu**, bo TAK klucz wyprowadza magazyn ENM
    (`enm.store._case_path` liczy SHA-256 z tekstu identyfikatora, a blokada
    `blokada_przypadku` indeksuje słownik tym samym tekstem) i tak samo robią
    WSZYSTKIE pozostałe końcówki (`/api/cases/{case_id}/enm/**` przekazuje
    `case_id` wprost). Normalizacja mogła zostać tylko wtedy, gdyby objęła też
    magazyn — a magazynu ta karta nie zmienia, więc normalizacja znika.

    Ta końcówka normalizowała klucz przez `str(UUID(...))`, czyli sprowadzała
    identyfikator do postaci kanonicznej (małe litery, myślniki, bez klamer i
    prefiksu `urn:uuid:`). Dopóki identyfikatory pochodzą z backendu, obie
    postacie są identyczne — ale dla postaci NIEKANONICZNEJ zastosowanie
    szablonu operowałoby na INNYM wpisie magazynu niż operacje domenowe: praca
    lądowałaby pod kluczem `str(UUID(x))`, a `GET /api/cases/{x}/enm` czytałby
    pusty model spod `x`. Blokada współbieżności też brałaby wtedy inny zamek,
    więc szablon i operacje domenowe biegłyby równolegle po jednym modelu.

    Funkcja jest ZWRACAJĄCĄ TOŻSAMOŚĆ z jawną walidacją formatu: identyfikator
    musi być poprawnym UUID (kontrakt `case_id` całego API), ale wynik nigdy nie
    jest przekształceniem wejścia. Postać niekanoniczna jest ODRZUCANA, a nie
    po cichu tłumaczona — inaczej wróciłby ten sam rozjazd, tylko w innym
    miejscu.

    Podnosi ``ValueError`` dla identyfikatora spoza kontraktu.
    """
    # ŻADNEGO `strip()` ani innego oczyszczenia: każde przekształcenie wejścia jest
    # tym samym defektem co normalizacja UUID, tylko o jeden znak mniej widocznym.
    kanoniczny = str(UUID(case_id))
    if kanoniczny != case_id:
        raise ValueError(
            f"identyfikator przypadku '{case_id}' nie jest w postaci kanonicznej "
            f"('{kanoniczny}'). Klucz magazynu modelu to DOKŁADNIE tekst z adresu, "
            "więc postać niekanoniczna wskazywałaby inny wpis niż operacje domenowe."
        )
    return case_id


class ApplyTemplateRequest(BaseModel):
    """K30-20: Apply template payload."""

    case_id: str = Field(..., description="Target case UUID")
    target_segment_id: str = Field(..., description="Trunk segment_ref where station gets inserted")
    insert_at_ratio: float = Field(default=0.5, ge=0.0, le=1.0, description="Position on segment")
    params_override: dict[str, Any] = Field(default_factory=dict, description="User-edited params")
    catalog_profile: str | None = Field(default=None, description="Manufacturer profile cascade")


class PreviewTemplateRequest(BaseModel):
    """K30-27: Preview template config dry-run (no ENM mutation)."""

    params_override: dict[str, Any] = Field(default_factory=dict)
    catalog_profile: str | None = Field(default=None)


@router.post("/{template_id}/preview")
def preview_station_template(
    template_id: str,
    request: PreviewTemplateRequest = Body(...),
) -> dict[str, Any]:
    """K30-27: dry-run preview — returns resolved config bez touching ENM.

    Generates summary z effective parameters po manufacturer cascade,
    transformer/cable/CB choices resolved, DER mix summarized. Used by
    wizard live preview step.
    """
    template = get_template(template_id)
    if template is None:
        raise HTTPException(status_code=404, detail=f"Template '{template_id}' not found")

    from application.station_templates.apply import (
        TemplateApplyError,
        _cascade_manufacturer_choice,
        _first_default_choice,
        _resolve_sn_bay_roles,
        _resolve_sn_field_specs,
        _resolve_station_type,
        _resolve_transformer_ref_for_template,
    )

    overrides = request.params_override
    profile = request.catalog_profile

    # Resolve effective config
    sn_bays_count = int(overrides.get("sn_bays_count", template.schema.sn_bays_count.default))
    nn_feeders_count = int(
        overrides.get("nn_feeders_count", template.schema.nn_feeders_count.default)
    )
    der_count = int(overrides.get("der_total_count", template.schema.der_total_count.default))
    transformer_count = int(
        overrides.get("transformer_count", template.schema.transformer_count.default)
    )

    transformer_ref = _resolve_transformer_ref_for_template(
        template,
        overrides=overrides,
        catalog_profile=profile,
    )
    cb_catalog = overrides.get("nn_feeder_cb_ref") or _cascade_manufacturer_choice(
        template.schema.nn_feeder_cb_options, profile
    )
    sn_manufacturer = overrides.get("sn_manufacturer", template.schema.sn_switchgear_default)
    protection_ref = overrides.get("protection_ref")
    if not protection_ref and template.schema.sn_bay_protection_options:
        # Cascade protection too
        for p in template.schema.sn_bay_protection_options:
            if profile and profile.lower().replace(" ", "") in p.vendor.lower().replace(" ", ""):
                protection_ref = p.device_catalog_ref
                break
        if not protection_ref:
            protection_ref = template.schema.sn_bay_protection_options[0].device_catalog_ref

    der_summary = []
    for der_spec in template.schema.der_options:
        der_ref = overrides.get(f"der_{der_spec.kind}_ref") or _first_default_choice(
            der_spec.catalog_options
        )
        der_summary.append(
            {
                "kind": der_spec.kind,
                "catalog_ref": der_ref,
                "connection_variant": der_spec.connection_variant_options[0],
                "expected_count_per_kind": max(
                    1, der_count // max(1, len(template.schema.der_options))
                ),
            }
        )

    # B-12: podgląd pokazuje JAWNIE dobrany aparat per pole (albo błąd szablonu).
    # Rozstrzygnięcie liczby pól jest W TYM SAMYM bloku: od karty
    # POMIAR-ODGAŁĘZIENIE `_resolve_sn_bay_roles` odmawia (zamiast po cichu ciąć
    # pole pomiarowe), więc poza `try` dawałoby projektantowi błąd 500 zamiast
    # komunikatu z minimalną liczbą pól.
    try:
        bay_roles = _resolve_sn_bay_roles(template, sn_bays_count)
        sn_field_specs = _resolve_sn_field_specs(
            template,
            bay_roles=bay_roles,
            overrides=dict(overrides),
            catalog_profile=profile,
        )
    except TemplateApplyError as exc:
        raise HTTPException(
            status_code=422, detail={"code": exc.code, "message_pl": exc.message_pl}
        ) from exc

    return {
        "template_id": template.id,
        "template_name_pl": template.name_pl,
        "category": template.category.value,
        "nc_rfg_type": template.nc_rfg_type,
        "station_type": _resolve_station_type(template),
        "catalog_profile_applied": profile,
        "effective_config": {
            "transformer_ref": transformer_ref,
            "transformer_count": transformer_count,
            "sn_bays_count": sn_bays_count,
            "sn_bay_roles": bay_roles,
            "sn_fields": sn_field_specs,
            "sn_manufacturer": sn_manufacturer,
            "nn_feeders_count": nn_feeders_count,
            "nn_feeder_cb_ref": cb_catalog,
            "protection_relay_ref": protection_ref,
            "der_total_count": der_count,
            "der_mix": der_summary,
        },
        "estimated_elements_count": (
            1 + sn_bays_count + transformer_count + nn_feeders_count + der_count  # station
        ),
    }


@router.post("/{template_id}/apply")
def apply_station_template(
    template_id: str,
    request: ApplyTemplateRequest = Body(...),
) -> dict[str, Any]:
    """K30-20: apply station template do live case ENM.

    Orchestrates sequence:
    1. Lookup template z library
    2. Merge user params_override z template defaults
    3. Build insert_station_on_segment_sn payload
    4. Execute domain operation
    5. Optionally chain DER additions
    6. Return created element refs + readiness report

    Koncowka celowo pozostaje SYNCHRONICZNA (`def`): zastosowanie szablonu to
    kilkaset milisekund pracy procesora, wiec w petli zdarzen zablokowaloby cala
    aplikacje. Rownolegle zadania na TYM SAMYM przypadku serializuje blokada
    przypadku zalozona w `apply_template_to_case` (defekt D4 audytu 2026-08-01) —
    zamiana na `async def` NIE jest naprawa wyscigu, tylko schowaniem go za petla
    zdarzen.
    """
    template = get_template(template_id)
    if template is None:
        raise HTTPException(status_code=404, detail=f"Template '{template_id}' not found")

    try:
        # JEDNO ŹRÓDŁO PRAWDY o kluczu magazynu — patrz `klucz_przypadku`.
        # `UUID(...)` niżej jest bezskutkowe co do treści klucza: funkcja gwarantuje
        # `str(UUID(klucz)) == klucz`, więc `apply_template_to_case` trafia w TEN SAM
        # wpis magazynu, w który trafiają operacje domenowe pod tym samym adresem.
        klucz = klucz_przypadku(request.case_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid case_id: {exc}") from exc

    try:
        result = apply_template_to_case(
            template=template,
            case_id=UUID(klucz),
            target_segment_id=request.target_segment_id,
            insert_at_ratio=request.insert_at_ratio,
            params_override=request.params_override,
            catalog_profile=request.catalog_profile,
        )
    except TemplateApplyError as exc:
        raise HTTPException(
            status_code=422, detail={"code": exc.code, "message_pl": exc.message_pl}
        ) from exc

    return result


class SaveUserTemplateRequest(BaseModel):
    """B-8: zapis biezacej konfiguracji kreatora jako szablonu uzytkownika."""

    name_pl: str = Field(..., min_length=1, description="Nazwa szablonu (widoczna na liscie)")
    description_pl: str | None = Field(default=None, description="Opis do czego szablon sluzy")
    configuration: dict[str, Any] = Field(
        ...,
        description=(
            "Stan formularza kreatora — przechowywany BEZ ZMIAN; backend go NIE "
            "interpretuje (odtworzeniem zajmuje sie wylacznie kreator)"
        ),
    )


@router.post("/user")
def save_user_station_template(request: SaveUserTemplateRequest = Body(...)) -> dict[str, Any]:
    """B-8 (karta KD-3): zapisz konfiguracje kreatora jako szablon uzytkownika.

    Szablony WBUDOWANE pozostaja nietkniete — zapis idzie do OSOBNEGO zbioru z
    wlasna przestrzenia identyfikatorow. Identyfikator jest wyprowadzony z TRESCI
    (SHA-256), wiec powtorny zapis tej samej konfiguracji nadpisuje wpis zamiast
    mnozyc duplikaty (determinizm).
    """
    return save_user_template(
        nazwa=request.name_pl.strip(),
        opis=request.description_pl,
        konfiguracja=request.configuration,
    )


@router.get("/user")
def list_user_station_templates() -> dict[str, Any]:
    """Szablony zapisane przez uzytkownika (kolejnosc deterministyczna)."""
    szablony = list_user_templates()
    return {"templates": szablony, "total": len(szablony)}


@router.delete("/user/{template_id}")
def delete_user_station_template(template_id: str) -> dict[str, Any]:
    """Usun szablon uzytkownika. Szablonu wbudowanego usunac sie NIE DA."""
    if not delete_user_template(template_id):
        raise HTTPException(
            status_code=404, detail=f"Szablon użytkownika '{template_id}' nie istnieje"
        )
    return {"deleted": template_id}


@router.get("")
def list_station_templates(
    category: str | None = Query(default=None, description="Filter by TemplateCategory value"),
) -> dict[str, Any]:
    """Return list of templates (optionally filtered by category)."""
    if category is not None:
        try:
            cat_enum = TemplateCategory(category)
        except ValueError as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown category '{category}'. Valid: {[c.value for c in TemplateCategory]}",
            ) from exc
        templates = list_templates_by_category(cat_enum)
    else:
        templates = list_templates()

    return {
        "templates": [_to_summary(t) for t in templates],
        "total": len(templates),
    }


@router.get("/categories")
def list_categories() -> dict[str, Any]:
    """Return 10 categories z counts dla wizard step 1 (Kategoria)."""
    counts = count_by_category()
    return {
        "categories": [
            {
                "id": cat.value,
                "label_pl": _CATEGORY_LABELS[cat],
                "icon": _CATEGORY_ICONS[cat],
                "description_pl": _CATEGORY_DESCRIPTIONS[cat],
                "template_count": counts.get(cat.value, 0),
            }
            for cat in TemplateCategory
        ],
        "total_templates": sum(counts.values()),
    }


@router.get("/{template_id}")
def get_station_template(template_id: str) -> dict[str, Any]:
    """Full template definition z editable schema."""
    template = get_template(template_id)
    if template is None:
        raise HTTPException(status_code=404, detail=f"Template '{template_id}' not found")
    return template.to_dict()


def _to_summary(t: StationTemplate) -> dict[str, Any]:
    """Lightweight summary dla list endpoint (no schema details)."""
    return {
        "id": t.id,
        "name_pl": t.name_pl,
        "category": t.category.value,
        "description_pl": t.description_pl,
        "use_case_pl": t.use_case_pl,
        "nc_rfg_type": t.nc_rfg_type,
        "tags": list(t.tags),
        "icon": t.icon,
    }


_CATEGORY_LABELS: dict[TemplateCategory, str] = {
    TemplateCategory.TYPOWA_SN_NN: "Typowe stacje SN/nN",
    TemplateCategory.SLUPOWA: "Stacje słupowe ZSP",
    TemplateCategory.ZKSN_WNETRZOWA: "Stacje ZKSN wnętrzowe",
    TemplateCategory.PROSUMENT_PV: "Mikroinstalacje PV prosument",
    TemplateCategory.FARMA_PV: "Farmy PV SN",
    TemplateCategory.BESS: "Magazyny BESS",
    TemplateCategory.HYBRYDOWA: "Hybrydy PV + BESS",
    TemplateCategory.PRZEMYSLOWA: "Przemysłowe odbiorcze",
    TemplateCategory.WIATROWA: "Stacje OZE wiatrowe",
    TemplateCategory.SEKCYJNA: "Stacje sekcyjne / pętlowe",
}

_CATEGORY_ICONS: dict[TemplateCategory, str] = {
    TemplateCategory.TYPOWA_SN_NN: "station-distribution",
    TemplateCategory.SLUPOWA: "station-pole",
    TemplateCategory.ZKSN_WNETRZOWA: "station-indoor",
    TemplateCategory.PROSUMENT_PV: "station-pv-prosument",
    TemplateCategory.FARMA_PV: "station-pv-farm",
    TemplateCategory.BESS: "station-bess",
    TemplateCategory.HYBRYDOWA: "station-hybrid",
    TemplateCategory.PRZEMYSLOWA: "station-industrial",
    TemplateCategory.WIATROWA: "station-wind",
    TemplateCategory.SEKCYJNA: "station-sectional",
}

_CATEGORY_DESCRIPTIONS: dict[TemplateCategory, str] = {
    TemplateCategory.TYPOWA_SN_NN: "Standardowe stacje dystrybucyjne 100-2500 kVA",
    TemplateCategory.SLUPOWA: "Stacje słupowe ZSP (50-400 kVA, wieś)",
    TemplateCategory.ZKSN_WNETRZOWA: "Stacje wnętrzowe z RMU (630-2500 kVA, miasto)",
    TemplateCategory.PROSUMENT_PV: "Mikroinstalacje PV 5-250 kW (NC RfG typ A-C)",
    TemplateCategory.FARMA_PV: "Farmy PV SN 0.5-5 MW z block transformer",
    TemplateCategory.BESS: "Magazyny BESS 0.5-5 MW z usługami systemowymi",
    TemplateCategory.HYBRYDOWA: "Farmy hybrydowe PV + BESS",
    TemplateCategory.PRZEMYSLOWA: "Stacje przemysłowe odbiorcze (zakłady, silniki)",
    TemplateCategory.WIATROWA: "Stacje OZE wiatrowe (Vestas V90/V112)",
    TemplateCategory.SEKCYJNA: "Stacje sekcyjne/pętlowe z NOP/SZR",
}

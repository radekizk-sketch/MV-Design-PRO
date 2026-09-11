"""Każdy szablon stacji buduje transformator, który MA gdzie wisieć (rola TR).

DEFEKT, ZMIERZONY NA ŻYWYM BACKENDZIE (2026-09-11, apply WSZYSTKICH 57 szablonów
przez API + `engineering-readiness`): 15 szablonów w trzech kategoriach —
``prosument_pv`` (6), ``slupowa`` (6), ``sekcyjna`` (3) — materializowało stację,
w której transformator wisi wprost na szynie SN, bez pola roli ``TR``. Domena
melduje to jako ``W041`` (`enm/pole_transformatorowe.py`), a bramka dokumentacji
wykonawczej odrzuca taki model. Odejście od szyny rozdzielni realizuje się POLEM:
bez aparatu w polu nie da się ani odłączyć transformatora do prac, ani zbudować
selektywności między nim a szyną.

DLACZEGO TEST, A NIE TYLKO POPRAWKA DANYCH. Reguła „deklaracja bez testu =
fałszywa pewność": biblioteka szablonów rośnie, a nowy szablon dopisany bez roli
``TR`` odtworzyłby defekt w milczeniu — ``W041`` jest ostrzeżeniem (IMPORTANT),
więc nic by się nie wywróciło aż do bramki dokumentacji. Ten test jest
PREDYKATEM WEJŚCIA biblioteki, liczonym z TEGO SAMEGO źródła prawdy co
ostrzeżenie domeny.

ZMIERZONA GRANICA REGUŁY (nie cichy wyjątek). Transformator BLOKOWY toru DER
(`Generator.blocking_transformer_ref`) jest z reguły wyłączony — patrz docstring
`enm/pole_transformatorowe.py`. Szablon generacyjny, który buduje wyłącznie blok
falownikowy, nie musi więc deklarować pola ``TR``. Dlatego test nie pyta
„czy szablon deklaruje TR", tylko sprawdza SKUTEK na zmaterializowanym modelu:
czy predykat domeny znajduje transformator bez pola. To jedyny sposób, żeby obie
drogi (pole TR i blok DER) były mierzone jednym warunkiem.

DROGA TESTU = DROGA UŻYTKOWNIKA. Szablon aplikuje się przez ENDPOINT
(`/api/station-templates/{id}/apply`), nie przez wewnętrzną funkcję: to samo
przejście, którym idzie kreator, więc test nie może przejść „obok" bramek API.
"""

from __future__ import annotations

import math
import uuid
from typing import Any

import pytest
from application.station_templates.templates import ALL_TEMPLATES
from enm.models import EnergyNetworkModel
from enm.pole_transformatorowe import transformatory_bez_pola_sn

pytest.importorskip("fastapi")

CATALOG_VERSION = "2024.1"
CABLE_ID = "cable-tfk-yakxs-3x120"
SOURCE_ID = "src-gpz-15kv-250mva-rx010"

#: Górna granica rodziny „Wyłącznik główny nN" w katalogu APARAT_NN (pomiar 2026-09-11).
MAKS_WYLACZNIK_GLOWNY_NN_A = 1600.0
#: Liczba szablonów, których strona nN przekracza tę granicę (pomiar 2026-09-11).
MIN_SZABLONOW_POZA_KATALOGIEM = 20


def _binding(namespace: str, item_id: str) -> dict[str, str]:
    return {
        "catalog_namespace": namespace,
        "catalog_item_id": item_id,
        "catalog_item_version": CATALOG_VERSION,
    }


def _magistrala(app_client: Any) -> tuple[str, str]:
    """Projekt + przypadek + GPZ + jeden odcinek. Zwraca ``(case_id, segment_ref)``."""
    from enm.store import reset_enm_store

    reset_enm_store()
    suffix = uuid.uuid4().hex[:8]
    projekt = app_client.post(
        "/api/projects",
        json={
            "name": f"Szablony TR {suffix}",
            "description": "",
            "mode": "TO-BE",
            "voltage_level_kv": 15.0,
            "frequency_hz": 50.0,
        },
    )
    assert projekt.status_code == 201, projekt.text
    przypadek = app_client.post(
        "/api/study-cases",
        json={
            "project_id": projekt.json()["id"],
            "name": f"Przypadek {suffix}",
            "description": "",
            "config": {},
            "set_active": True,
        },
    )
    assert przypadek.status_code == 201, przypadek.text
    case_id = przypadek.json()["id"]

    for nazwa, payload in (
        (
            "add_grid_source_sn",
            {
                "voltage_kv": 15.0,
                "sk3_mva": 250.0,
                "rx_ratio": 0.1,
                "catalog_binding": _binding("ZRODLO_SN", SOURCE_ID),
            },
        ),
        (
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": 300.0,
                    "catalog_binding": _binding("KABEL_SN", CABLE_ID),
                }
            },
        ),
    ):
        odpowiedz = app_client.post(
            f"/api/cases/{case_id}/enm/domain-ops",
            json={
                "project_id": "",
                "snapshot_base_hash": "",
                "operation": {
                    "name": nazwa,
                    "idempotency_key": f"tr-{nazwa}-{uuid.uuid4().hex[:8]}",
                    "payload": payload,
                },
            },
        )
        assert odpowiedz.status_code == 200, odpowiedz.text
        body = odpowiedz.json()
        assert not body.get("error"), body.get("error")

    korytarze = body["snapshot"].get("corridors") or [{}]
    segmenty = korytarze[0].get("ordered_segment_refs") or []
    assert segmenty, "Magistrala nie powstała — fikstura nietrafiona."
    return case_id, segmenty[-1]


def _zastosuj(app_client: Any, template_id: str) -> EnergyNetworkModel:
    case_id, segment_ref = _magistrala(app_client)
    odpowiedz = app_client.post(
        f"/api/station-templates/{template_id}/apply",
        json={
            "case_id": case_id,
            "target_segment_id": segment_ref,
            "insert_at_ratio": 0.5,
            "params_override": {},
            "catalog_profile": None,
        },
    )
    assert odpowiedz.status_code in (200, 201), f"{template_id}: {odpowiedz.text}"
    migawka = app_client.get(f"/api/cases/{case_id}/enm")
    assert migawka.status_code == 200, migawka.text
    dane = migawka.json()
    return EnergyNetworkModel.model_validate(dane.get("snapshot") or dane)


@pytest.mark.parametrize("template_id", [t.id for t in ALL_TEMPLATES])
def test_szablon_nie_zostawia_transformatora_bez_pola_sn(app_client: Any, template_id: str) -> None:
    """Iloczyn cech = CAŁA biblioteka × predykat domeny, nie wybrany przykład."""
    model = _zastosuj(app_client, template_id)
    znaleziska = list(transformatory_bez_pola_sn(model))
    assert not znaleziska, (
        f"Szablon '{template_id}' buduje transformator bez pola SN roli TR: "
        f"{[z.transformer_ref for z in znaleziska]}. Dodaj BayRoleSpec(role='TR') "
        "do `sn_bay_roles` szablonu albo zwiąż transformator jako blokowy DER."
    )


def test_biblioteka_szablonow_ma_zmierzony_rozmiar() -> None:
    """Bramka na kurczenie zbioru: 57 szablonów mierzonych, nie „ile akurat jest".

    Bez tego parametryzacja powyżej przeszłaby także dla biblioteki obciętej do
    jednego szablonu — zielono i bez pokrycia.
    """
    assert len(ALL_TEMPLATES) >= 57, f"Biblioteka skurczyła się do {len(ALL_TEMPLATES)} szablonów."


def test_kazdy_szablon_deklaruje_transformator() -> None:
    """Przesłanka reguły: bez transformatora ``W041`` byłby bezprzedmiotowy.

    Pomiar 2026-09-11: WSZYSTKIE 57 szablonów deklarują `transformer_options`,
    więc reguła „transformator ⇒ pole TR albo blok DER" obejmuje całą bibliotekę.
    Ten test pilnuje, żeby przesłanka pozostała prawdziwa — inaczej test wyżej
    zacząłby milcząco zwalniać część biblioteki.
    """
    bez_trafo = [t.id for t in ALL_TEMPLATES if not t.schema.transformer_options]
    assert not bez_trafo, f"Szablony bez transformatora: {bez_trafo}"


def test_rodzina_wylacznikow_glownych_nn_konczy_sie_na_1600A() -> None:
    """DŁUG NAZWANY, przypięty pomiarem — nie obietnica w dokumencie.

    Wyłącznik główny nN dobiera się do prądu znamionowego strony dolnej
    transformatora ``I_n = S_n / (√3·U_nN)``. Rodzina „Wyłącznik główny nN"
    (APARAT_NN) kończy się na 1600 A. Szablony sięgają 3608 A (blok 2,5 MVA /
    0,4 kV), więc dla nich NIE ISTNIEJE pozycja katalogu, którą wolno związać:
    dobranie mniejszej byłoby fabrykacją aparatu niezdolnego do przewodzenia
    prądu roboczego. Dlatego droga wiązania wyłącznika głównego nN dla szablonów
    pozostaje długiem do decyzji właściciela (audyt RUNDA_3, sekcja 4.7), a nie
    cichym „dobierz największy, jaki jest".

    Test jest POMIAREM przypiętym do liczby: gdy katalog urośnie, wywali się i
    zmusi do aktualizacji dokumentu razem z kodem.
    """
    from network_model.catalog.repository import get_default_mv_catalog

    glowne = [
        a
        for a in get_default_mv_catalog().list_lv_apparatus_types()
        if a.id.startswith("cb_nn_") and not a.id.endswith("_odp")
    ]
    assert glowne, "Rodzina wyłączników głównych nN zniknęła z katalogu."
    maks_a = max(float(a.id.removeprefix("cb_nn_").removesuffix("a")) for a in glowne)
    assert (
        maks_a == MAKS_WYLACZNIK_GLOWNY_NN_A
    ), f"Zakres rodziny zmienił się na {maks_a} A — zaktualizuj sekcję 4.6 audytu RUNDA_3."


def test_ponad_dwadziescia_szablonow_wykracza_poza_zakres_katalogu(app_client: Any) -> None:
    """Skala długu z sekcji 4.7, liczona z modelu — nie przepisana z dokumentu."""
    poza = []
    for template in ALL_TEMPLATES:
        model = _zastosuj(app_client, template.id)
        for tr in model.transformers:
            if tr.ref_id.startswith("gpz/"):
                continue
            params = tr.materialized_params or {}
            # Tabliczka bywa w `materialized_params` (materializacja katalogu)
            # ALBO wprost na rekordzie — czytamy OBA kanały, bo predykat długu
            # nie może zależeć od tego, którym z nich szablon ją zapisał.
            s_mva = params.get("sn_mva") or getattr(tr, "sn_mva", None)
            u_lv = params.get("ulv_kv") or getattr(tr, "ulv_kv", None)
            if not s_mva or not u_lv:
                continue
            if float(s_mva) * 1e6 / (math.sqrt(3) * float(u_lv) * 1e3) > MAKS_WYLACZNIK_GLOWNY_NN_A:
                poza.append(template.id)
                break
    assert len(poza) >= MIN_SZABLONOW_POZA_KATALOGIEM, (
        f"Zmierzono {len(poza)} szablonów poza zakresem katalogu (było ≥"
        f"{MIN_SZABLONOW_POZA_KATALOGIEM}) — zaktualizuj sekcję 4.6 audytu RUNDA_3."
    )

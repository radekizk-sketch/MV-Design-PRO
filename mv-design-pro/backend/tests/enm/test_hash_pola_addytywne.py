"""Pola addytywne poza haszem, gdy `None` (`enm/hash.py::_POLA_ADDYTYWNE_POZA_HASHEM_GDY_NONE`).

CV-4.3 K7 dodała `Source.sk3_min_mva/ik3_min_ka/rx_ratio_min`. Zrzut pydantic niesie
`null` dla każdego niepodanego pola, więc bez tej reguły KAŻDY istniejący model ze
źródłem dostałby nowy odcisk (input_hash, hash_sha256, hash migawki) — a odcisk
migawki jest kluczem świeżości wyników (`result_freshness`): wszystkie biegi w
każdej bazie byłyby oznaczone jako nieaktualne po samym podniesieniu wersji.
Kontrakt (dyrektywa 2026-07-19 pkt 11: nowe pola addytywne, `exclude_none`):
dana zadeklarowana jako NIEZNANA nie jest treścią modelu; dana PODANA zmienia
wynik biegu, więc zmienia odcisk. Trzy funkcje hasza wołają jedną regułę.
"""

from __future__ import annotations

from enm.hash import (
    _POLA_ADDYTYWNE_POZA_HASHEM_GDY_NONE,
    compute_enm_hash,
    compute_input_hash,
    compute_semantic_hash,
    hash_migawki_enm,
)
from enm.models import Bus, EnergyNetworkModel, ENMHeader, Source


def _enm(**pola: float) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="hash-addytywne"),
        buses=[Bus(ref_id="b1", name="B1", voltage_kv=15.0)],
        sources=[
            Source(
                ref_id="s1",
                name="Grid",
                bus_ref="b1",
                model="short_circuit_power",
                sk3_mva=250.0,
                rx_ratio=0.1,
                **pola,
            )
        ],
    )


def _migawka_sprzed_karty(enm: EnergyNetworkModel) -> dict:
    """Postać zrzutu sprzed K7: bez kluczy dodanych kartą (tak wyglądały zapisane migawki)."""
    dane = enm.model_dump(mode="json")
    for zrodlo in dane["sources"]:
        for pole in _POLA_ADDYTYWNE_POZA_HASHEM_GDY_NONE["sources"]:
            zrodlo.pop(pole, None)
    return dane


def test_rejestr_pol_addytywnych_nazywa_pola_k7() -> None:
    # K7: trzy pola MIN; + `u_set_pu` (napięcie zadane szyny bilansującej, bliźniaki
    # literatury ze slackiem ≠ 1,0 p.u.) — to samo prawo: brak (None) poza odciskiem.
    # W5-D: `Load.phases` (brak = odbior trojfazowy symetryczny) — ta sama regula
    # (test pisarzy i odcisku: `tests/enm/test_load_phases_w5d.py`).
    # W5-A: opis punktu neutralnego źródła, układ nN transformatora i układ ekranu
    # kabla — to samo prawo (migawki bez tych danych haszują jak przed kartą).
    # W6-1: `Generator.dynamika` (kontrakt czasu RMS/DAE) — solver W6-2 nie istnieje,
    # więc brak wartości nie jest jeszcze treścią żadnego biegu; migawki generatorów
    # bez tego pola haszują jak przed kartą (zmierzone: golden-registry PRZED/PO,
    # 55/56 sieci bez zmiany odcisku po tej poprawce, jedyna różnica ma inne
    # udokumentowane źródło — kasacja referencji profilu obciążenia odbioru,
    # W6-1 K-E (`enm/domain_ops_models.py::AddNNLoadPayload`).
    # AB-H0 §0.7.6: `Generator.modele_widmowe` (modele z kart widmowych) — to samo prawo;
    # test odcisku: `tests/enm/test_karty_widmowe_modelu.py`.
    # AB-1a Pakiet C: `Generator.modul_istniejacy`, `data_umowy_przylaczeniowej`
    # i `nastawy_zabezpieczen` (O-31, O-32) — to samo prawo (brak = dana nieustalona,
    # poza odciskiem); test pisarzy i odcisku: `test_pola_art4_i_nastawy_poza_haszem_gdy_none`.
    # Odbiór Pakietu C (O-50): `Generator.deklaracje_modulu` — to samo prawo; test odcisku:
    # `tests/enm/test_deklaracje_modulu.py::test_deklaracje_poza_odciskiem_gdy_none`.
    assert _POLA_ADDYTYWNE_POZA_HASHEM_GDY_NONE == {
        "sources": ("sk3_min_mva", "ik3_min_ka", "rx_ratio_min", "u_set_pu", "neutral_grounding"),
        "loads": ("phases",),
        "transformers": ("lv_earthing_system",),
        "branches": ("screen_bonding",),
        "generators": (
            "dynamika",
            "modele_widmowe",
            "modul_istniejacy",
            "data_umowy_przylaczeniowej",
            "nastawy_zabezpieczen",
            "deklaracje_modulu",
        ),
    }


def test_odcisk_bez_danych_min_rowny_odciskowi_sprzed_karty() -> None:
    enm = _enm()
    assert hash_migawki_enm(enm.model_dump(mode="json")) == hash_migawki_enm(
        _migawka_sprzed_karty(enm)
    )
    assert compute_enm_hash(enm) == hash_migawki_enm(_migawka_sprzed_karty(enm))


def test_dane_min_zmieniaja_odcisk_wejscia_nie_semantyczny() -> None:
    bez, z_danymi = _enm(), _enm(sk3_min_mva=150.0)
    assert compute_input_hash(bez) != compute_input_hash(z_danymi)
    assert compute_enm_hash(bez) != compute_enm_hash(z_danymi)
    assert hash_migawki_enm(bez.model_dump(mode="json")) != hash_migawki_enm(
        z_danymi.model_dump(mode="json")
    )
    # semantic_hash: topologia + role + katalog — dana liczbowa źródła go nie dotyczy.
    assert compute_semantic_hash(bez) == compute_semantic_hash(z_danymi)


def test_trzy_funkcje_hasza_zgodne_dla_obu_postaci() -> None:
    for enm in (_enm(), _enm(ik3_min_ka=5.0, rx_ratio_min=0.2)):
        migawka = enm.model_dump(mode="json")
        assert compute_enm_hash(enm) == hash_migawki_enm(migawka)
        # `hash_migawki_enm` pracuje na kopii — migawka wołającego nietknięta.
        assert "sk3_min_mva" in migawka["sources"][0]


def test_input_hash_nie_zalezy_od_pol_none() -> None:
    enm = _enm()
    a = compute_input_hash(enm)
    b = compute_input_hash(EnergyNetworkModel.model_validate(_migawka_sprzed_karty(enm)))
    assert a == b

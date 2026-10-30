"""Udokumentowane rodziny przekładników obecnych na polskim rynku (nie karty SKU).

Kryterium wpisu: identyfikowalna rodzina/model, prawdziwy producent, źródło
producenta lub polskiego dostawcy. Rodziny mają ZAKRESY konfiguracji, a nie
rzekomą kompletną tabliczkę. Nie wolno ich przypisywać do CTType/VTType,
które wymagają dokładnej przekładni, klasy, mocy, Ith itd.
"""
from __future__ import annotations

from typing import Any

KPB_CTS_17_SOURCE = (
    "KPB Intra Polska, CTS 17.SW, karta rodziny, 17,5/38/95 kV, "
    "5-3200 A, 1/5 A, do 3 rdzeni, Ith 2-80 kA: "
    "https://intrapolska.pl/uploads/produkt_files/k_kat_cts_17.sw_%2822_03%29.pdf"
)
KPB_CTS_12_SOURCE = (
    "KPB Intra Polska, CTS 12.L, 12/28/75 kV, 5-3200 A, 1/5 A: "
    "https://intrapolska.pl/produkt/28/23/przekladniki%20pradowe%20wnetrzowe/cts%2012_l.htm"
)
KPB_VTS25_SOURCE = (
    "KPB Intra Polska, VTS 25, 25/50/125 kV, 1-4 wtórne, 100/sqrt3, "
    "110/sqrt3, 120/sqrt3 V i opcjonalne 100/3 V: "
    "https://intrapolska.pl/produkt/27/49/"
    "przekladniki%20napieciowe%20wnetrzowe/vts%2025.htm"
)
KPB_CTS25_2022_SOURCE = (
    "KPB Intra Polska, CTS 25, karta k_kat_cts_25_(22_03), s. 1, "
    "5–3200 A, 1/5 A, 1–4 rdzenie, 2–80 kA/1s: "
    "https://intrapolska.pl/uploads/produkt_files/k_kat_cts_25_%2822_03%29.pdf"
    " || źródło uzupełniające konstrukcji dwóch łączników: "
    "https://kpbintra.cz/en/produkty/pristrojovy-transformator-proudu-podperny-7/"
)
KPB_CTT25_SOURCE = (
    "KPB Intra Polska, CTT 25, karta producenta, "
    "100–2500 A, 1/5 A, 1–3 rdzenie, zaczepy wtórne: "
    "https://intrapolska.pl/produkt/28/39/przekladniki%20pradowe%20wnetrzowe/ctt%2025.htm"
)
ABB_TPU6_FAMILY_SOURCE = (
    "ABB, TPU 6x.xx Indoor supporting current transformers, "
    "1VLC000502 Rev.11, 24/25 kV, 10–3200 A, 1/5 A: "
    "https://library.e.abb.com/public/"
    "ad0a0539e0c94a4dbbaa84a103c58006/TPU%206x.xx_1VLC000502%20Rev.11%2C%20en.pdf"
)
KPB_CTB25_SOURCE = (
    "KPB Intra Polska, CTB 25, karta k_kat_ctb_25_(22_03), "
    "5–1000 A, 1/5 A, 1–3 rdzenie, 2–80 kA/1s: "
    "https://intrapolska.pl/uploads/produkt_files/k_kat_ctb_25_%2822_03%29.pdf"
)
KPB_VTS25_DTR_SOURCE = (
    "KPB Intra Polska, VTS 25, karta k_kat_vts_25, "
    "25/50/125 kV, 1–4 uzwojenia, opcjonalny obwód resztkowy: "
    "https://intrapolska.pl/uploads/produkt_files/k_kat_vts_25.pdf"
)
KPB_VTS25_SCH_SOURCE = (
    "KPB Intra Polska, VTS 25 Sch, wykonanie do rozdzielnic SM6: "
    "https://intrapolska.pl/produkt/27/50/"
    "przekladniki%20napieciowe%20wnetrzowe/vts%2025%20sch.htm"
)
KPB_HOME = "KPB Intra Polska, baza wiedzy / wyroby: https://intrapolska.pl/"
RITZ_SOURCE = (
    "ZELAP-PROAT, polski dostawca RITZ: GS, GIS, GE, GSES; "
    "https://zelap-proat.pl/przekladniki.html"
)
ARTECHE_SOURCE = (
    "ELMOR S.A., lista aparatów WEGA str.14: ARTECHE ACI, UCI, UCIF; "
    "https://www.elmor.com.pl/files/WEGA_2S.pdf"
)
ALCE_SOURCE = (
    "ALCE Elektrik, oficjalny katalog rodzin MV Indoor Type Transformers, "
    "AB24/AK24/AD24, VB24/VBF24: "
    "https://www.alce-elektrik.com/our-products/indoor-instrument-transformers/"
)
ESITAS_SOURCE = (
    "ASTAT, wyroby producenta ESITAS SN (polski rynek), ATB/ATH/VTB/VTH: "
    "https://astat.pl/produkty/energetyka-i-miernictwo/"
    "przekladniki-sredniego-napiecia/"
)
ESITAS_VT_SOURCE = (
    "ASTAT, ESITAS VTB20-K, 0,2 0-10VA, konkretne VTB20KM150000/200000: "
    "https://astat.pl/produkty/przekladniki-sredniego-napiecia-esi-vtb20km150000/"
)
PFIFFNER_SOURCE = (
    "PFIFFNER Polska, Energetab 2021, katalog grup produktów, przekładniki SN, "
    "pierścieniowe i GIS: "
    "https://swisschamber.pl/wp-content/uploads/2021/09/energetab_2021_WEB_pfiffner.pdf"
)
PLESSE_SOURCE = (
    "PLESSE Instruments, polski producent, CTB wykonania 1-4 i CTG: "
    "https://plesse.pl/"
)
ZWARPOL_SOURCE = (
    "ZWARPOL, producent polski, przekładniki JSGO-2a/-2b, "
    "https://www.zwarpol.com/ oraz kategorie sensorów "
    "https://www.zwarpol.com/oferta/przekladniki-i-sensory/"
)
ITR_CT_SOURCE = (
    "Łukasiewicz-ITR, małomocowe sensory prądowe CR/CRR, technologia "
    "cewki Rogowskiego, bez wtórnego CT 1/5 A: "
    "https://energetyka.itr.org.pl/przekladniki-pradowe"
)
ITR_CR_SOURCE = (
    "Łukasiewicz-ITR, rodzina CR z nierozłączalnym rdzeniem: "
    "https://energetyka.itr.org.pl/przekladniki-pradowe-cr"
)
ITR_CRR_SOURCE = (
    "Łukasiewicz-ITR, rodzina CRR z dzielonym rdzeniem: "
    "https://energetyka.itr.org.pl/przekladniki-pradowe-crr"
)
ITR_UR_SOURCE = (
    "Łukasiewicz-ITR, sensory napięciowe UR56/UR66/UR90, "
    "różne interfejsy głowic SN i dzielnik rezystancyjny: "
    "https://energetyka.itr.org.pl/przekladniki-napieciowe-ur"
)
ITR_URW_SOURCE = (
    "Łukasiewicz-ITR, sensory napięciowe wnętrzowe URW: "
    "https://energetyka.itr.org.pl/przekladniki-napieciowe-ur-w"
)
ENERGOTEST_SOURCE = (
    "SPIE Energotest, produkowany przekładnik ziemnozwarciowy I0, "
    "deklaracja i instrukcja użytkowania: "
    "https://spie-energotest.pl/do-pobrania"
)
ZELISKO_SOURCE = (
    "ZOE, polski dostawca układów pomiarowych z sensorami napięciowymi ZELISKO: "
    "https://zoen.pl/oferta/uklady-pomiarowo-rozliczeniowe-sensory-napieciowe"
)
MBS_SOURCE = (
    "ASTAT, MBS przekładniki rozliczeniowe nN ASR/ASK, "
    "https://astat.pl/produkty/energetyka-i-miernictwo/"
    "przekladniki-pradowe-niskiego-napiecia/"
    "przekladniki-pradowe-do-rozliczen-z-energetyka/242/"
)



# Dodatkowe serie potwierdzone bezpośrednio kartą producenta lub dystrybutora PL.
TESAR_SOURCE = (
    "TESAR Polska, DIN AD11 FD11, CT 24kV 5-2500A, VT L-N do 24kV; "
    "https://nowa.stb.com.pl/katalogi/TESARKATALOG.pdf"
)
KPB_CTSO25_SOURCE = (
    "KPB Intra Polska, CTSO 25 napowietrzny, karta producenta: "
    "https://intrapolska.pl/uploads/produkt_files/k_kat_ctso_25.pdf"
)
RITZ_STANDARD_SOURCE = (
    "RITZ, Medium Voltage Instrument Transformers, standard ASS24/VES24, "
    "strony 18 i 27: https://ritz-international.com/wp-content/uploads/"
    "RITZ-medium_voltage_instrument_transformers_standard_EN-1-1.pdf"
)
KONCAR_MV_SOURCE = (
    "KONČAR, instrument transformers MV 3.6–52kV: "
    "https://koncar.hr/en/koncar-instrument-transformers"
)
POLCONTACT_JK24_SOURCE = (
    "POLCONTACT WARSZAWA, JK24 na kabel SN, dane 30–1000A, 5A, "
    "klasa 0.5/10P10, strony 67–71: "
    "https://www.polcontact-warszawa.pl/files/"
    "Przekladniki%20pradowe%20JK%2024/1283697870/lib/1.pdf"
)

def _family(
    manufacturer: str,
    family: str,
    kind: str,
    source: str,
    *,
    mounting: str,
    domain: str = "SN",
    um_kv: float | None = None,
    primary_a_min: float | None = None,
    primary_a_max: float | None = None,
    secondary_current_options_a: tuple[int, ...] | None = None,
    core_count_max: int | None = None,
    accuracy_options: tuple[str, ...] | None = None,
    burden_options_va: tuple[float, ...] | None = None,
    ith_range_ka: tuple[float, float] | None = None,
    residual_capability: bool | None = None,
    note: str = "",
) -> dict[str, Any]:
    slug = "".join(ch if ch.isalnum() else "-" for ch in (manufacturer + "-" + family).lower())
    slug = "-".join(filter(None, slug.split("-")))
    rec: dict[str, Any] = {
        "id": f"instrument-family-pl-{slug}",
        "name": f"{manufacturer} {family} — rodzina {kind}",
        "manufacturer": manufacturer,
        "model_family": family,
        "transformer_kind": kind,
        "mounting": mounting,
        "voltage_domain": domain,
        "catalog_status": "REFERENCYJNY_V1",
        "verification_status": "CZESCIOWO_ZWERYFIKOWANY",
        "record_kind": "MANUFACTURER_FAMILY_NOT_SKU",
        "contract_version": "2.0",
        "source_reference": source,
        "verification_note": (
            "Zidentyfikowana rodzina producenta w polskim obrocie; "
            "nie jest potwierdzonym egzemplarzem, numerem zamówieniowym "
            "ani dowodem dostępności wybranej kombinacji przekładni, rdzeni, "
            "mocy, klas, FS/ALF i prądów zwarciowych. "
            "Brakujących cech NIE wolno wypełnić zerem ani kombinatorycznie "
            "tworzyć typu produkcyjnego. " + note
        ).strip(),
    }
    optional: dict[str, Any] = {
        "um_kv": um_kv,
        "primary_a_min": primary_a_min,
        "primary_a_max": primary_a_max,
        "secondary_current_options_a": list(secondary_current_options_a) if secondary_current_options_a else None,
        "core_count_max": core_count_max,
        "accuracy_options": list(accuracy_options) if accuracy_options else None,
        "burden_options_va": list(burden_options_va) if burden_options_va else None,
        "ith_range_ka": list(ith_range_ka) if ith_range_ka else None,
        "residual_capability": residual_capability,
    }
    rec.update({k: v for k, v in optional.items() if v is not None})
    return rec


def get_all_instrument_transformer_manufacturer_families_pl() -> list[dict[str, Any]]:
    families: list[dict[str, Any]] = []
    # Polska spółka i fabryka w Czechach — nie przypisywać producenta Czech do PL.
    families.extend([
        _family("KPB Intra", "CTS 12.L", "CT", KPB_CTS_12_SOURCE,
                mounting="INDOOR", um_kv=12.0,
                primary_a_min=5, primary_a_max=3200,
                secondary_current_options_a=(1, 5), core_count_max=3,
                accuracy_options=("0.2", "0.2S", "0.5", "0.5S", "1", "3", "5P", "10P"),
                burden_options_va=(2.5, 5, 7.5, 10, 15, 20, 30, 40, 50, 60),
                ith_range_ka=(2, 80)),
        _family("KPB Intra", "CTS 17.SW", "CT", KPB_CTS_17_SOURCE,
                mounting="INDOOR", um_kv=17.5,
                primary_a_min=5, primary_a_max=3200,
                secondary_current_options_a=(1, 5), core_count_max=3,
                accuracy_options=("0.2", "0.2S", "0.5", "0.5S", "1", "3", "5P", "10P"),
                burden_options_va=(2.5, 5, 7.5, 10, 15, 20, 30, 40, 50, 60),
                ith_range_ka=(2, 80)),
        _family("KPB Intra", "CTS 25", "CT", KPB_CTS25_2022_SOURCE,
                mounting="INDOOR", um_kv=25,
                primary_a_min=5, primary_a_max=3200,
                secondary_current_options_a=(1, 5), core_count_max=4,
                accuracy_options=("0.2", "0.2S", "0.5", "0.5S", "1", "3", "5P", "10P"),
                burden_options_va=(2.5, 5, 7.5, 10, 15, 20, 30, 40, 50, 60),
                ith_range_ka=(2, 80),
                note="Karta 22_03: wykonania 1–4 rdzenie, przełączenie "
                     "pierwotne lub odczepy wtórne. FS 5/10 i ALF 5/10/15/20 "
                     "to DOSTĘPNE OPCJE rodziny, nie jednocześnie potwierdzone "
                     "parametry jednego wykonania. Dokładną parę zaczepów, "
                     "Ith, FS/ALF każdego rdzenia i Rct sprawdzić w DTR. "
                     "Nie zakładać automatycznie 200–400/5 A." ),
        _family("KPB Intra", "CTT 25", "CT", KPB_CTT25_SOURCE,
                mounting="INDOOR_BUSHING", um_kv=25,
                primary_a_min=100, primary_a_max=2500,
                secondary_current_options_a=(1, 5), core_count_max=3,
                accuracy_options=("0.2", "0.2S", "0.5", "0.5S", "1", "3", "5P", "10P"),
                burden_options_va=(5, 7.5, 10, 15, 20, 30, 40, 50, 60),
                note="Przepustowy CT, odczepy tylko po stronie wtórnej "
                     "według strony producenta. FS 5/10, ALF 5/10/15/20 "
                     "to możliwości rodziny, nie parametry dowolnej kombinacji. "
                     "Ith konkretnego egzemplarza niepotwierdzone."),
        _family("KPB Intra", "CTB 25", "CT", KPB_CTB25_SOURCE,
                mounting="INDOOR_BUSHING", um_kv=25,
                primary_a_min=5, primary_a_max=1000,
                secondary_current_options_a=(1, 5), core_count_max=3,
                accuracy_options=("0.2", "0.2S", "0.5", "0.5S", "1", "3", "5P", "10P"),
                burden_options_va=(2.5, 5, 7.5, 10, 15, 20, 30, 40, 50, 60),
                ith_range_ka=(2, 80),
                note="Przepustowy CT z odczepami wtórnymi. FS 5/10 i "
                     "ALF 5/10/15/20 to zakresy rodziny, "
                     "nie potwierdzona tabliczka jednego egzemplarza."),
        _family("KPB Intra", "CTSO 17", "CT", KPB_HOME, mounting="OUTDOOR"),
        _family("KPB Intra", "VTS 25", "VT", KPB_VTS25_DTR_SOURCE,
                mounting="INDOOR", um_kv=25, core_count_max=4,
                accuracy_options=("0.2", "0.5", "1", "3", "3P", "6P"),
                burden_options_va=(2.5, 5, 7.5, 10, 15, 20, 30, 50, 100, 150),
                residual_capability=True,
                note="Uzwojenie resztkowe i odczepy wtórne są OPCJĄ. "
                     "DTR VTS25 podaje 100/3, 110/3, 120/3 V jako opcje "
                     "napięcia resztkowego; nie utożsamiać 3P z 3U0."),
        _family("KPB Intra", "VTS 25 Sch", "VT", KPB_VTS25_SCH_SOURCE,
                mounting="INDOOR_SM6", um_kv=25, core_count_max=4,
                accuracy_options=("0.2", "0.5", "1", "3", "3P", "6P"),
                burden_options_va=(2.5, 5, 7.5, 10, 15, 20, 30, 50, 100, 150),
                residual_capability=True,
                note="Wykonanie do rozdzielnicy SM6; uzwojenia resztkowe "
                     "i odczepy wtórne są opcjami, nie stałą konfiguracją."),
        _family("KPB Intra", "VTS 38", "VT", KPB_HOME, mounting="INDOOR"),
        _family("KPB Intra", "VTO 38", "VT", KPB_HOME, mounting="OUTDOOR"),
    ])
    # ABB TPU 6x.xx: katalog producenta (Rev.11). Nie mylić wariantów
    # transformatora z kartą konkretnego wyrobu i numerem zamówieniowym.
    families.append(_family(
        "ABB", "TPU 6x.xx", "CT", ABB_TPU6_FAMILY_SOURCE,
        mounting="INDOOR_SUPPORT", um_kv=25,
        primary_a_min=10, primary_a_max=3200,
        secondary_current_options_a=(1, 5), core_count_max=6,
        accuracy_options=("0.2", "0.2S", "0.5", "0.5S", "1", "3", "5",
                          "5P10", "5P15", "5P20", "10P10", "10P15", "10P20"),
        ith_range_ka=(2, 100),
        note="Dostępne warianty Um 24 i 25 kV, 1–6 uzwojeń "
             "wtórnych (maksimum zależne od rozmiaru i parametrów). "
             "Przełączalność pierwotna w określonych zakresach do "
             "400–800 A; wtórna jako osobny wariant. Nie przypisywać "
             "automatycznie maksimum Ith, liczby rdzeni i klasy do "
             "jednego aparatu.",
    ))
    # RITZ: dostawca polski wymienia dokładnie rodziny, bez tabliczki katalogowej.
    for model, kind, mounting in (
        ("GS", "CT", "INDOOR"), ("GIS", "CT", "INDOOR"),
        ("GE", "VT", "INDOOR"), ("GSES", "VT", "INDOOR"),
    ):
        families.append(_family("RITZ", model, kind, RITZ_SOURCE, mounting=mounting))
    for model, kind in (
        ("ACI", "CT"), ("UCI", "VT"), ("UCIF", "VT"),
    ):
        families.append(_family("Arteche", model, kind, ARTECHE_SOURCE, mounting="INDOOR"))
    for model, kind, um in (
        ("AB12", "CT", 17.5), ("AB24", "CT", 24),
        ("AK24", "CT", 24), ("AD24", "CT", 24),
        ("VB12", "VT", 17.5), ("VB24", "VT", 24),
        ("2VB24", "VT", 24), ("VBF24-FE", "VT", 24),
        ("VBF24-FS", "VT", 24),
    ):
        families.append(_family("ALCE Elektrik", model, kind, ALCE_SOURCE,
                                mounting="INDOOR", um_kv=um))
    for model, kind, mounting, um in (
        ("ATB 20-10", "CT", "INDOOR", 24.0),
        ("ATB 20-15", "CT", "INDOOR", 17.5),
        ("ATH 21", "CT", "OUTDOOR", 24.0),
        ("VTB 20-K", "VT", "INDOOR", 24.0),
        ("VTH 20-N", "VT", "OUTDOOR", 24.0),
        ("2VTH 20-N", "VT", "OUTDOOR", 24.0),
    ):
        families.append(_family("ESITAS", model, kind, ESITAS_SOURCE,
                                mounting=mounting, um_kv=um))
    for model in ("CTB w.1", "CTB w.2", "CTB w.3", "CTB w.4", "CTG"):
        families.append(_family("PLESSE", model, "CT", PLESSE_SOURCE, mounting="INDOOR",
                                note="Polski producent z Pszczyny; dane konkretnego wyrobu wymagają oferty/DTR."))
    for model in ("JSGO-2a", "JSGO-2b"):
        families.append(_family("ZWARPOL", model, "CT", ZWARPOL_SOURCE,
                                mounting="SPECIAL", note="Polski producent; konfiguracje specjalne wymagają DTR."))
    # Sensory niskomocowe wymagają wejść LPCT/LPVT i oddzielnego
    # przeliczenia sygnału; nie są przekładnikami klasycznymi 1/5A, 100V.
    for model, kind, mounting, source in (
        ("CR", "CT_SENSOR", "CLOSED_RING", ITR_CR_SOURCE),
        ("CRR", "CT_SENSOR", "SPLIT_RING", ITR_CRR_SOURCE),
        ("UR56", "VT_SENSOR", "CABLE_CONNECTOR", ITR_UR_SOURCE),
        ("UR66", "VT_SENSOR", "CABLE_CONNECTOR", ITR_UR_SOURCE),
        ("UR90", "VT_SENSOR", "CABLE_CONNECTOR", ITR_UR_SOURCE),
        ("URW", "VT_SENSOR", "INDOOR", ITR_URW_SOURCE),
    ):
        families.append(_family(
            "Łukasiewicz-ITR", model, kind,
            source + (" || " + ITR_CT_SOURCE if kind == "CT_SENSOR" else ""),
            mounting=mounting,
            note="Sensor małej mocy: wymaga kompatybilnego wejścia pomiarowego "
                 "i znanej charakterystyki przetwarzania. NIE zamieniać na 1A/5A ani 100V.",
        ))
    families.append(_family(
        "SPIE Energotest", "I0", "ZERO_SEQUENCE", ENERGOTEST_SOURCE,
        mounting="RING",
        note="Przekładnik Ferrantiego do 3I0. Przekładnia/okno/obciążenie "
             "są zależne od wariantu i wymagają instrukcji danego modelu.",
    ))
    families.append(_family(
        "ZELISKO", "sensory napięciowe", "VT_SENSOR", ZELISKO_SOURCE,
        mounting="MV_MEASUREMENT",
        note="Portfolio sensorów; konkretny model i tor pomiarowy wymagają "
             "karty wykonania. Nie utożsamiać z klasycznym VT 100V.",
    ))
    families.extend([
        _family("PFIFFNER", "CT pierścieniowy", "CT", PFIFFNER_SOURCE,
                mounting="RING", note="Producent obecny w Polsce przez PFIFFNER Polska."),
        _family("PFIFFNER", "GIS CT", "CT", PFIFFNER_SOURCE,
                mounting="GIS"),
        _family("PFIFFNER", "GIS VT", "VT", PFIFFNER_SOURCE,
                mounting="GIS"),
        _family("MBS", "ASK", "CT", MBS_SOURCE, mounting="INDOOR", domain="nN"),
        _family("MBS", "ASR", "CT", MBS_SOURCE, mounting="INDOOR", domain="nN"),
    ])
    # Dodatkowi producenci i serie (Polska + rzeczywista dystrybucja w PL).
    families.extend([
        _family("TESAR Polska", "AD11", "CT", TESAR_SOURCE,
                mounting="INDOOR_DIN", um_kv=24,
                primary_a_min=5, primary_a_max=2500,
                secondary_current_options_a=(1, 5), core_count_max=3,
                accuracy_options=("0.2", "0.2S", "0.5", "0.5S", "5P10", "5P20", "5P30"),
                note="Ith do 40kA/1s dotyczy rodziny, NIE każdego wyrobu."),
        _family("TESAR Polska", "FD11", "VT", TESAR_SOURCE,
                mounting="INDOOR_DIN", um_kv=24,
                core_count_max=2, accuracy_options=("0.2", "0.5", "3P", "6P"),
                residual_capability=True,
                note="Pomiar 100/√3V, uzwojenie 100/3V jest konfigurowalne."),
        _family("KPB Intra", "CTSO 25", "CT", KPB_CTSO25_SOURCE,
                mounting="OUTDOOR", um_kv=25,
                primary_a_min=5, primary_a_max=600,
                secondary_current_options_a=(1, 5), core_count_max=2,
                accuracy_options=("0.2", "0.2S", "0.5", "0.5S", "5P", "10P"),
                burden_options_va=(2.5, 5, 7.5, 10, 15, 20, 30),
                ith_range_ka=(2, 80),
                note="Praca pionowa. Nie wolno bez DTR połączyć maksimum Ith "
                     "z dowolną przekładnią 5–600 A."),
        _family("RITZ", "ASS 24", "CT", RITZ_STANDARD_SOURCE,
                mounting="INDOOR_SUPPORT", um_kv=24,
                primary_a_max=2500, secondary_current_options_a=(1, 5),
                note="RITZ podaje Ith do 1000×In, max 100kA — GRANICA RODZINY."),
        _family("RITZ", "VES 24", "VT", RITZ_STANDARD_SOURCE,
                mounting="INDOOR", um_kv=24,
                accuracy_options=("0.2", "0.5", "1.0"),
                burden_options_va=(20, 50, 100),
                residual_capability=True,
                note="Uzwojenie 100/3V jest opcją; 6 indywidualnych "
                     "konfiguracji pomiarowych są w katalogu VT."),
        _family("KONČAR", "MV resin CT", "CT", KONCAR_MV_SOURCE,
                mounting="INDOOR_OR_OUTDOOR",
                note="Zakres producenta MV 3,6–52kV, brak wariantu zamówieniowego."),
        _family("KONČAR", "MV resin VT", "VT", KONCAR_MV_SOURCE,
                mounting="INDOOR_OR_OUTDOOR",
                note="Zakres producenta MV 3,6–52kV, brak danych o indywidualnych uzwojeniach."),
        _family("POLCONTACT WARSZAWA", "JK24 D60", "CT",
                POLCONTACT_JK24_SOURCE, mounting="CABLE_RING_PHASE_CT",
                um_kv=24, primary_a_min=30, primary_a_max=1000,
                secondary_current_options_a=(5,), core_count_max=2,
                accuracy_options=("0.5", "10P10"),
                note="Izolację SN stanowi kabel; FS10 z archiwalnego źródła "
                     "NIE spełnia automatycznie wymogów nowych CT rozliczeniowych ENEA."),
    ])
    # Capability rodziny, nie katalog gotowego aparatu do projektu.
    for rodzina in families:
        if rodzina["manufacturer"] == "KPB Intra" and rodzina["model_family"] == "CTS 25":
            rodzina["fs_options"] = [5, 10]
            rodzina["alf_options"] = [5, 10, 15, 20]
            rodzina["rated_frequency_hz"] = 50
            rodzina["power_frequency_withstand_kv"] = 50
            rodzina["lightning_impulse_withstand_kv"] = 125
            rodzina["mass_kg"] = 28
            rodzina["primary_reconnection_supported"] = True
            rodzina["secondary_reconnection_supported"] = True
            rodzina["primary_reconnection_method"] = "TWO_M8_BRIDGES"
            rodzina["specific_primary_tap_values_verified"] = False
    for rodzina in families:
        if rodzina["manufacturer"] == "KPB Intra" and rodzina["model_family"] == "CTT 25":
            rodzina["secondary_reconnection_supported"] = True
            rodzina["primary_reconnection_supported"] = False
            rodzina["fs_options"] = [5, 10]
            rodzina["alf_options"] = [5, 10, 15, 20]
            rodzina["rated_frequency_hz"] = 50
            rodzina["power_frequency_withstand_kv"] = 50
            rodzina["lightning_impulse_withstand_kv"] = 125
            rodzina["mass_kg"] = 17
        elif rodzina["manufacturer"] == "ABB" and rodzina["model_family"] == "TPU 6x.xx":
            rodzina["primary_reconnection_supported"] = True
            rodzina["secondary_reconnection_supported"] = True
            rodzina["um_options_kv"] = [24, 25]
            rodzina["power_frequency_withstand_options_kv"] = [50, 55]
            rodzina["lightning_impulse_withstand_kv_max"] = 125
            rodzina["rated_frequency_options_hz"] = [50, 60]
            rodzina["number_of_secondaries_max_depends_on_design"] = True
    for rodzina in families:
        if rodzina["manufacturer"] != "KPB Intra":
            continue
        if rodzina["model_family"] == "CTB 25":
            rodzina["secondary_reconnection_supported"] = True
            rodzina["primary_reconnection_supported"] = False
            rodzina["fs_options"] = [5, 10]
            rodzina["alf_options"] = [5, 10, 15, 20]
            rodzina["rated_frequency_hz"] = 50
            rodzina["power_frequency_withstand_kv"] = 50
            rodzina["lightning_impulse_withstand_kv"] = 125
            rodzina["mass_kg"] = 22
        if rodzina["model_family"] in ("VTS 25", "VTS 25 Sch"):
            rodzina["primary_voltage_range_v"] = ["3000/√3", "22000/√3"]
            rodzina["secondary_voltage_options_v"] = ["100/√3", "110/√3", "120/√3"]
            rodzina["residual_voltage_options_v"] = ["100/3", "110/3", "120/3"]
            if rodzina["model_family"] == "VTS 25":
                # Osobna opcja 400/√3 V występuje w nowszej karcie VTS25.
                rodzina["secondary_voltage_options_v"].append("400/√3")
            rodzina["secondary_taps_supported"] = True
            rodzina["rated_frequency_hz"] = 50
            rodzina["power_frequency_withstand_kv"] = 50
            rodzina["lightning_impulse_withstand_kv"] = 125
            rodzina["limiting_output_va_range"] = [200, 500]
    if len({f["id"] for f in families}) != len(families):
        raise ValueError("Duplikat ID w rodzinach CT/VT producentów")
    return families

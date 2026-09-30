"""Station template registry — K30-16/V12T-016, 73 templates across 15 categories."""

from application.station_templates.schema import StationTemplate
from application.station_templates.templates.bess import BESS_TEMPLATES
from application.station_templates.templates.farmy_pv import FARMY_PV_TEMPLATES
from application.station_templates.templates.gpz_110_sn import GPZ_110_SN_TEMPLATES
from application.station_templates.templates.hybrydowe import HYBRYDOWE_TEMPLATES
from application.station_templates.templates.kompensacja import KOMPENSACJA_TEMPLATES
from application.station_templates.templates.prosument_pv import PROSUMENT_PV_TEMPLATES
from application.station_templates.templates.przemyslowe import PRZEMYSLOWE_TEMPLATES
from application.station_templates.templates.rezerwa_zasilania import (
    REZERWA_ZASILANIA_TEMPLATES,
)
from application.station_templates.templates.rozdzielnia_sieciowa import (
    ROZDZIELNIA_SIECIOWA_TEMPLATES,
)
from application.station_templates.templates.sekcyjne import SEKCYJNE_TEMPLATES
from application.station_templates.templates.slupowe import SLUPOWE_TEMPLATES
from application.station_templates.templates.stacja_abonencka import (
    STACJA_ABONENCKA_TEMPLATES,
)
from application.station_templates.templates.typowe_sn_nn import TYPOWE_SN_NN_TEMPLATES
from application.station_templates.templates.wiatrowe import WIATROWE_TEMPLATES
from application.station_templates.templates.zksn_wnetrzowe import ZKSN_WNETRZOWE_TEMPLATES

ALL_TEMPLATES: tuple[StationTemplate, ...] = (
    *TYPOWE_SN_NN_TEMPLATES,  # 10
    *SLUPOWE_TEMPLATES,  # 6
    *ZKSN_WNETRZOWE_TEMPLATES,  # 8
    *PROSUMENT_PV_TEMPLATES,  # 6
    *FARMY_PV_TEMPLATES,  # 5
    *BESS_TEMPLATES,  # 5
    *HYBRYDOWE_TEMPLATES,  # 5
    *PRZEMYSLOWE_TEMPLATES,  # 5
    *WIATROWE_TEMPLATES,  # 4
    *SEKCYJNE_TEMPLATES,  # 3
    # V12T-016 — delta rola A/C/E (rejestr długu, przegląd 2026-09):
    *GPZ_110_SN_TEMPLATES,  # 3 (rola A)
    *ROZDZIELNIA_SIECIOWA_TEMPLATES,  # 3 (rola A)
    *STACJA_ABONENCKA_TEMPLATES,  # 4 (rola C)
    *KOMPENSACJA_TEMPLATES,  # 3 (rola E)
    *REZERWA_ZASILANIA_TEMPLATES,  # 3 (rola E)
)
# Total: 73 templates (57 + 16 V12T-016 delta: 3 GPZ + 3 RS/RSM + 4 abonencka
# + 3 kompensacja + 3 rezerwa zasilania)

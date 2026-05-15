"""Station template registry — K30-16 57+ templates across 10 categories."""

from application.station_templates.schema import StationTemplate
from application.station_templates.templates.bess import BESS_TEMPLATES
from application.station_templates.templates.farmy_pv import FARMY_PV_TEMPLATES
from application.station_templates.templates.hybrydowe import HYBRYDOWE_TEMPLATES
from application.station_templates.templates.prosument_pv import PROSUMENT_PV_TEMPLATES
from application.station_templates.templates.przemyslowe import PRZEMYSLOWE_TEMPLATES
from application.station_templates.templates.sekcyjne import SEKCYJNE_TEMPLATES
from application.station_templates.templates.slupowe import SLUPOWE_TEMPLATES
from application.station_templates.templates.typowe_sn_nn import TYPOWE_SN_NN_TEMPLATES
from application.station_templates.templates.wiatrowe import WIATROWE_TEMPLATES
from application.station_templates.templates.zksn_wnetrzowe import ZKSN_WNETRZOWE_TEMPLATES

ALL_TEMPLATES: tuple[StationTemplate, ...] = (
    *TYPOWE_SN_NN_TEMPLATES,         # 10
    *SLUPOWE_TEMPLATES,              # 6
    *ZKSN_WNETRZOWE_TEMPLATES,       # 8
    *PROSUMENT_PV_TEMPLATES,         # 6
    *FARMY_PV_TEMPLATES,             # 5
    *BESS_TEMPLATES,                 # 5
    *HYBRYDOWE_TEMPLATES,            # 5
    *PRZEMYSLOWE_TEMPLATES,          # 5
    *WIATROWE_TEMPLATES,             # 4
    *SEKCYJNE_TEMPLATES,             # 3
)
# Total: 57 templates

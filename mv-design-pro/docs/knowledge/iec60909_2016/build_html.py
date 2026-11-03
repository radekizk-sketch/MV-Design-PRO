#!/usr/bin/env python3
"""Regenerate embedded offline dataset after editing records/sources/rules."""
import json
import pathlib
import re
ROOT=pathlib.Path(__file__).resolve().parent
from kb import load
records=load("knowledge.json")
sources=load("sources.json")
rules=load("rules.json")
html=(ROOT/"index.html").read_text(encoding="utf-8")
payload=json.dumps({"records":records,"sources":sources},ensure_ascii=False,separators=(",",":")).replace("<","\\u003c")
html,count=re.subn(r'(<script id="dataset" type="application/json">)[\s\S]*?(</script>)',lambda m:m.group(1)+payload+m.group(2),html,count=1)
assert count==1,"missing embedded data marker"
for metric,num in [("m_records",len(records)),("m_norm",sum(x["source_id"] in ("IEC60909_2016", "IEC60909_3_2010", "EN50160_A1_2025", "IEC62271_1_2018") for x in records)),("m_rules",len(rules))]:
    html,changes=re.subn(fr'(<strong id="{metric}">)\d+(</strong>)',fr'\g<1>{num}\g<2>',html,count=1)
    assert changes==1
(ROOT/"index.html").write_text(html,encoding="utf-8")
print(f"{len(records)} records, {len(sources)} sources, {len(rules)} rules, offline viewer refreshed")

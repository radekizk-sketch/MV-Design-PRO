#!/usr/bin/env python3
"""Regenerate embedded offline dataset after editing records/sources/rules."""
import json
import pathlib
import re
ROOT=pathlib.Path(__file__).resolve().parent
records=json.loads((ROOT/"knowledge.json").read_text(encoding="utf-8"))
sources=json.loads((ROOT/"sources.json").read_text(encoding="utf-8"))
rules=json.loads((ROOT/"rules.json").read_text(encoding="utf-8"))
html=(ROOT/"index.html").read_text(encoding="utf-8")
payload=json.dumps({"records":records,"sources":sources},ensure_ascii=False,separators=(",",":")).replace("<","\\u003c")
html,count=re.subn(r'(<script id="dataset" type="application/json">)[\s\S]*?(</script>)',lambda m:m.group(1)+payload+m.group(2),html,count=1)
assert count==1,"missing embedded data marker"
for metric,num in [("m_records",len(records)),("m_norm",sum(x["source_id"]=="IEC60909_2016" for x in records))]:
    html,changes=re.subn(fr'(<strong id="{metric}">)\d+(</strong>)',fr'\g<1>{num}\g<2>',html,count=1)
    assert changes==1
(ROOT/"index.html").write_text(html,encoding="utf-8")
print(f"{len(records)} records, {len(rules)} rules, offline viewer refreshed")

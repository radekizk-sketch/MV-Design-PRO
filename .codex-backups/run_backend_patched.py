import os
import platform
import sys

platform._wmi_query = lambda *args: (_ for _ in ()).throw(OSError("disabled for local dev server"))
sys.path.insert(0, r"C:\Users\radek\Documents\GitHub\MV-Design-PRO\mv-design-pro\backend\src")
import uvicorn

uvicorn.run("api.main:app", host="127.0.0.1", port=8000, log_level="info")

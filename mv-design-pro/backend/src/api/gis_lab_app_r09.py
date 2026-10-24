"""Samodzielna aplikacja badawcza GIS R09 — nie jest importowana przez api.main.

Uruchomienie lokalne:
  cd mv-design-pro/backend
  PYTHONPATH=src uvicorn api.gis_lab_app_r09:app --host 127.0.0.1 --port 18009
Wyłącznie dane syntetyczne. Bez ENM, WMS, danych ENEA i zdalnego sterowania.
"""
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse

from api.gis_workspace_r09 import router
from api.gis_layers_r10 import router as layers_router

app = FastAPI(title="MV-DESIGN PRO — laboratorium GIS R09")
app.include_router(router)
app.include_router(layers_router)


@app.get("/", include_in_schema=False)
def frontend() -> FileResponse:
    return FileResponse(
        Path(__file__).resolve().parent / "static" / "gis_r09.html",
        media_type="text/html",
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )

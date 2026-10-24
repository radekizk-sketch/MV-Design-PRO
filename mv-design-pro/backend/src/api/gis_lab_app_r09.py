"""Samodzielna aplikacja badawcza GIS R09, NIE importowana przez produkcyjne api.main.

Uruchomienie wyłącznie lokalne:
  cd backend
  PYTHONPATH=src uvicorn api.gis_lab_app_r09:app --host 127.0.0.1 --port 18009
Nie używać do danych operatora. Nie wystawiać do sieci.
"""
from fastapi import FastAPI
from api.gis_workspace_r09 import router

app = FastAPI(title="MV-DESIGN PRO — laboratorium GIS R09",
              description="Wyłącznie syntetyki, bez ENM i połączeń mapowych")
app.include_router(router)

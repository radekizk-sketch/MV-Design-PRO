"""Main FastAPI application entry point."""

import logging
import os
from contextlib import asynccontextmanager

from api.analysis_runs import router as analysis_runs_router
from api.audit2_catalogs import router as audit2_catalogs_router
from api.audit2_station_config import router as audit2_station_config_router
from api.catalog import production_router as catalog_router
from api.comparison import router as comparison_router
from api.der_sn_documents import router as der_sn_documents_router
from api.diagnostics import router as diagnostics_router
from api.document_store import router as document_store_router
from api.enm import production_router as enm_router
from api.equipment_proof_pack import router as equipment_proof_pack_router
from api.exception_handlers import register_exception_handlers
from api.execution_runs import router as execution_runs_router
from api.fault_loop import router as fault_loop_router
from api.fault_scenarios import router as fault_scenarios_router
from api.generators import router as generators_router
from api.grid_source_preview import router as grid_source_preview_router
from api.health import router as health_router
from api.middleware import RequestIdMiddleware
from api.ncrfg_ptpiree_tests import router as ncrfg_ptpiree_tests_router
from api.oze_analysis_runs import router as oze_analysis_runs_router
from api.power_flow_comparisons import router as power_flow_comparisons_router
from api.power_flow_runs import router as power_flow_runs_router
from api.project_archive import router as project_archive_router
from api.projects import router as projects_router
from api.proof_pack import router as proof_pack_router
from api.protection_analysis_runs import router as protection_analysis_runs_router
from api.protection_comparisons import router as protection_comparisons_router
from api.protection_overcurrent_settings import (
    router as protection_overcurrent_settings_router,
)
from api.quality_analysis_runs import router as quality_analysis_runs_router
from api.reference_engine import router as reference_engine_router
from api.reference_networks import router as reference_networks_router
from api.reference_patterns import router as reference_patterns_router
from api.result_contract_v1 import router as result_contract_v1_router
from api.sld import router as sld_router
from api.sld_overrides import router as sld_overrides_router
from api.solver_capabilities import router as solver_capabilities_router
from api.solver_input import router as solver_input_router
from api.station_templates import router as station_templates_router
from api.study_cases import router as study_cases_router
from api.switchgear_config import router as switchgear_config_router
from api.unified_runs import router as unified_runs_router
from api.v126_academic import router as v126_academic_router
from api.xlsx_import import router as xlsx_import_router
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from infrastructure.persistence.db import (
    create_engine_from_url,
    create_session_factory,
    init_db,
)
from infrastructure.persistence.unit_of_work import build_uow_factory

# Structured logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("mv_design_pro")


@asynccontextmanager
async def lifespan(app: FastAPI):
    database_url = os.getenv("DATABASE_URL", "sqlite+pysqlite:///./mv_design_pro.db")
    engine = create_engine_from_url(database_url)
    session_factory = create_session_factory(engine)
    app.state.engine = engine
    app.state.uow_factory = build_uow_factory(session_factory)
    init_db(engine)
    logger.info("MV-DESIGN PRO API started, DB initialized")
    yield
    logger.info("MV-DESIGN PRO API shutting down")


app = FastAPI(
    title="MV-DESIGN PRO API",
    description="Professional Medium Voltage Network Design System API",
    version="4.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Middleware (order matters: RequestId first so it's available for error handlers)
app.add_middleware(RequestIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:18000",
        "http://127.0.0.1:18000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global exception handlers
register_exception_handlers(app)

# Routers
app.include_router(analysis_runs_router, prefix="/api")
app.include_router(audit2_catalogs_router)
app.include_router(audit2_station_config_router)
app.include_router(catalog_router)
app.include_router(comparison_router)
app.include_router(der_sn_documents_router)
app.include_router(diagnostics_router)
app.include_router(document_store_router)
app.include_router(equipment_proof_pack_router)
app.include_router(health_router)
app.include_router(ncrfg_ptpiree_tests_router)
app.include_router(oze_analysis_runs_router)
app.include_router(power_flow_comparisons_router)
app.include_router(power_flow_runs_router)
app.include_router(quality_analysis_runs_router)
app.include_router(reference_engine_router)
app.include_router(reference_networks_router)
app.include_router(project_archive_router)
app.include_router(projects_router)
app.include_router(proof_pack_router)
app.include_router(protection_comparisons_router)
app.include_router(protection_analysis_runs_router, prefix="/api")
# Karta F-K5 (dlug V12K-189): prezentacja nastaw, w tym NIEDOSTEPNYCH, z akcja naprawcza.
app.include_router(protection_overcurrent_settings_router)
app.include_router(reference_patterns_router)
app.include_router(sld_router)
app.include_router(station_templates_router)
app.include_router(study_cases_router)
app.include_router(xlsx_import_router)
app.include_router(enm_router)
app.include_router(execution_runs_router)
app.include_router(unified_runs_router, prefix="/api")
app.include_router(v126_academic_router)
app.include_router(result_contract_v1_router)
app.include_router(fault_loop_router)
app.include_router(fault_scenarios_router)
app.include_router(generators_router)
app.include_router(grid_source_preview_router)
app.include_router(sld_overrides_router)
app.include_router(switchgear_config_router)
app.include_router(solver_capabilities_router, prefix="/api")
app.include_router(solver_input_router)


@app.get("/")
async def root() -> dict[str, str]:
    """Root endpoint."""
    return {"message": "MV-DESIGN PRO API", "version": "4.0.0"}


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "healthy"}


@app.get("/ready")
async def readiness_check() -> dict[str, str]:
    """Readiness check — confirms DB is initialized."""
    return {"status": "ready"}

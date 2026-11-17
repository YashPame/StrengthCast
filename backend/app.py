"""FastAPI app: JSON API under /api and the built React frontend (frontend/dist) at /.

Run from this backend folder (with the venv active):
    uvicorn app:app --reload
"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from model_service import DEFAULT_MODEL, ModelService, load_services

DIST_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"

app = FastAPI(
    title="StrengthCast API",
    description="StrengthCast: Machine Learning-Based Concrete Compressive Strength Prediction. "
                "Know the strength before you pour.",
    version="1.0.0",
)
services = load_services()   # {"constrained": ModelService, "unconstrained": ModelService}

# Every POST route takes ?model=<key> to pick the model; it defaults to the physics-constrained one.
ModelKey = Query(DEFAULT_MODEL, description=f"Which model to use: {', '.join(services)}")


def pick(model: str) -> ModelService:
    if model not in services:
        raise HTTPException(status_code=422, detail=f"Unknown model '{model}'. Available: {', '.join(services)}")
    return services[model]

# The Vite dev server (npm run dev, :5173) proxies /api, but allow direct calls too.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class Mix(BaseModel):
    """One cubic metre of concrete. Ingredients in kg/m³, age in days."""
    cement: float = Field(gt=0, le=2000)
    blast_furnace_slag: float = Field(ge=0, le=2000)
    fly_ash: float = Field(ge=0, le=2000)
    water: float = Field(gt=0, le=1000)
    superplasticizer: float = Field(ge=0, le=200)
    coarse_aggregate: float = Field(ge=0, le=3000)
    fine_aggregate: float = Field(ge=0, le=3000)
    age: float = Field(ge=1, le=3650)


@app.get("/api/meta")
def meta() -> dict:
    out = services[DEFAULT_MODEL].meta()
    out["models"] = [s.summary(key) for key, s in services.items()]
    out["default_model"] = DEFAULT_MODEL
    return out


@app.post("/api/predict")
def predict(mix: Mix, model: str = ModelKey) -> dict:
    return pick(model).predict(mix.model_dump())


@app.post("/api/age-curve")
def age_curve(mix: Mix, model: str = ModelKey) -> list[dict]:
    return pick(model).age_curve(mix.model_dump())


@app.post("/api/sensitivity")
def sensitivity(mix: Mix, model: str = ModelKey) -> dict:
    return pick(model).sensitivity(mix.model_dump())


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "models": {key: s.model_name for key, s in services.items()}}


# Mounted last so /api routes take precedence
if DIST_DIR.is_dir():
    app.mount("/", StaticFiles(directory=DIST_DIR, html=True), name="frontend")
else:
    @app.get("/", include_in_schema=False, response_class=HTMLResponse)
    def frontend_not_built() -> str:
        return (
            "<!doctype html><title>StrengthCast</title>"
            "<p>The React frontend is not built yet. In <code>frontend</code> run "
            "<code>npm install</code> then <code>npm run build</code>, or use <code>npm run dev</code> "
            "and open http://localhost:5173.</p>"
        )

# ML pipeline

Run the notebooks in order, from inside this folder (`backend/ML/`).

| Notebook | What it does | Writes |
|---|---|---|
| `01_Data_Loading.ipynb` | Loads and inspects the raw data | (unchanged) |
| `02_EDA.ipynb` | Exploratory analysis ([findings](../../docs/EDA_and_Outlier_Insights.md)) | nothing |
| `03_OutlierDetection.ipynb` | IQR / z-score checks; decides to **keep all rows** | nothing |
| `04_DataSplit.ipynb` | Dedupe → one 80/20 test split + 5 CV folds, **stratified by curing age** → engineered features | `data/splits.csv` |
| `05_Model.ipynb` | Default-param baselines (raw vs engineered) → Optuna on top 3 → physics check → constrained baselines → Optuna on top 3 constrained → test set → new-mix (grouped) CV → save **both** models (refit on all rows) | `models/concrete_strength_model_v3.joblib`, `models/concrete_strength_model_v3_unconstrained.joblib` |

`features.py` holds the feature engineering (log age, water/binder, ...). Each saved pipeline starts with
`ConcreteFeatures`, so the models take the 8 raw app inputs. Import it as `ML.features` (with
`backend/` on `sys.path`) so the pickled pipelines also load from the app, which runs inside `backend/`.

## Results (`05_Model`)

Two models are kept, and the app lets the user switch between them:

| | CV R² | CV RMSE | Test R² | Test RMSE | Test MAE | New-mix R² / RMSE | Physics check |
|---|---|---|---|---|---|---|---|
| **Physics-constrained: LightGBM tuned + constrained** | 0.928 | 4.35 | 0.944 | 3.73 | 2.53 | 0.900 / 5.07 | **passes** |
| **Unconstrained: XGBoost tuned** | 0.927 | 4.36 | 0.953 | 3.40 | 2.28 | **0.909 / 4.84** | fails (43 falling age curves) |
| LightGBM tuned (not saved) | 0.931 | 4.21 | 0.953 | 3.41 | 2.36 | 0.903 / 5.02 | fails |

- **Why two models.** The constrained model always behaves physically (strength never falls with age or cement,
  never rises with water), which makes its sensitivity and age curves trustworthy for what-if analysis. The
  unconstrained model is about 0.2–0.3 MPa more accurate on single predictions but can show bumps that break the
  physics. Each has a real advantage, so both are served.
- **Why XGBoost for the unconstrained model.** LightGBM leads on CV (4.21 vs 4.36) and the test set is a tie
  (3.41 vs 3.40), but on brand-new mixes (grouped CV) XGBoost is clearly better (4.84 vs 5.02 MPa). New mixes are
  what the app is for.
- Engineered features beat raw features for every model; boosting models (LightGBM, XGBoost, HistGB) lead.
- Optuna improved CV RMSE by 0.25–0.59 MPa over the defaults.
- Constraints cost ~0.14 MPa CV RMSE for the boosting models, but wreck Random Forest / Extra Trees / Decision
  Tree (CV R² 0.68–0.76).
- The top test scores are within ~0.3 MPa of each other (201 rows is noisy), so selection within each family uses CV.
- Per-fold new-mix RMSE spreads about ±0.5 MPa, so the gaps between the models are real but small.

## Key decisions
- **Split by curing age.** Rows are split at random (80/20), stratified by age so every age has the same share
  in train and test; the 5 CV folds (also in `04_DataSplit`) are stratified the same way. Rare ages are merged
  into the nearest common one (1→3, 120→100, 360→365). A mix can be in train at one age and in test at another,
  so the test score means "known mix, new age". For completely new designs, `05_Model` section 6.2 (and 7.1 for
  the unconstrained model) runs grouped-by-mix CV.
- **No outlier removal.** The flagged rows are real high-performance or edge-of-range mixes.
- **Physics monotonic constraints (constrained model).** Every model column containing age, cement or water is
  constrained, so strength is *guaranteed* to rise with age and cement and fall with water. That is why only
  water/binder, water/cement and total binder are used as ratios: SCM fraction, SP/binder and
  aggregate/binder contain cement but have no safe direction, and with them adding cement lowered strength
  in about 7 of 10 mixes. The constraints fix only the direction of an effect, not its size, so interactions
  (e.g. cement × age) are still learned.
- **Workability is not modelled.** Neither model knows when a mix is too dry to compact; the constrained model
  always predicts more strength for less water. The data has no slump column. Every mix below
  w/b 0.28 uses superplasticizer, and only 15 of the 378 mixes without SP go below w/b 0.35. The app
  (`model_service.py`, `frontend/src/lib/mix.js`) therefore warns on w/b < 0.35 with no SP, and on w/b outside 0.235–0.90.
- **√strength target.** Both models learn √strength and the output is clipped at 0 and squared, so strength
  can't be negative (with a plain target, low-cement mixes only tested at 28 days got about −10 MPa at 3 days).
- **Final models are refit on all rows** after evaluation; the reported metrics come from the held-out test
  set and CV.

## Models used by the app
`MODELS` in `backend/model_service.py` maps each key to a file in `models/`:
`constrained` → `concrete_strength_model_v3.joblib` (the default) and
`unconstrained` → `concrete_strength_model_v3_unconstrained.joblib`. If the unconstrained file is missing, the app
runs with the constrained model only. The older bundles (`concrete_strength_model.joblib`, `_v2`) are kept; point
an entry in `MODELS` at one to switch back.

`archive/` keeps the earlier notebooks: the old row-split modelling notebook (`04_Modeling`), the first versions
of 03-05, and `05_Model_v2` (which produced the v2 model). It also holds the two legacy CSVs that the first
versions wrote and read, `concrete_data_zscore_cleaned.csv` (from `03_OutlierDetection_v1`) and
`concrete_data_folds.csv` (from `04_DataSplit_v1`, read by `05_Model_v1`). Those notebooks read them from
`archive/` and the dataset from `../../Data/`.

## Data files
- `../Data/Concrete_Data.xls`: the original UCI file.
- `../Data/concrete_data.csv`: written by `01_Data_Loading` (short columns: `slag`, `strength`); read by `02`–`04`.
- `data/splits.csv`: written by `04_DataSplit`, with the columns renamed to `blast_furnace_slag` and
  `compressive_strength`, plus split, fold, `mix_id` and the engineered features; read by `05_Model`.

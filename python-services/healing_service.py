from fastapi import FastAPI
from pydantic import BaseModel
import joblib
import numpy as np

app = FastAPI()

# Load trained model
model = joblib.load("healing_model.pkl")


class FeatureVector(BaseModel):
   # tagMatch: float
   # idMatch: float
    classOverlap: float
    attributeOverlap: float
    textMatch: float
    textSimilarity: float
    semanticSimilarity: float
    parentMatch: float
    depthDiff: float
    siblingDensity: float


@app.post("/predict")
def predict(features: FeatureVector):

    X = np.array([[ 
        #features.tagMatch,
        #features.idMatch,
        features.classOverlap,
        features.attributeOverlap,
        features.textMatch,
        features.textSimilarity,
        features.semanticSimilarity,
        features.parentMatch,
        features.depthDiff,
        features.siblingDensity
    ]])

    probability = model.predict_proba(X)[0][1]

    return {
        "probability": float(probability)
    }
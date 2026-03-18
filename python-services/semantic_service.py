from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

app = FastAPI()

model = SentenceTransformer("all-MiniLM-L6-v2")

class SimilarityRequest(BaseModel):
    text1: str
    text2: str

@app.post("/similarity")
def semantic_similarity(req: SimilarityRequest):

    emb1 = model.encode([req.text1])
    emb2 = model.encode([req.text2])

    score = cosine_similarity(emb1, emb2)[0][0]

    return {"similarity": float(score)}
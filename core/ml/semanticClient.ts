import fetch from "node-fetch";

export async function getSemanticSimilarity(
  text1: string,
  text2: string
): Promise<number> {
  try {

    const response = await fetch("http://127.0.0.1:8000/similarity", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text1,
        text2
      })
    });

    const data = await response.json() as { similarity: number };

    return data.similarity ?? 0;

  } catch (err) {

    console.warn("Semantic similarity service unavailable");

    return 0;
  }
}
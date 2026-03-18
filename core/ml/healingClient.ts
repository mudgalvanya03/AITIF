import fetch from "node-fetch";

export async function predictHealing(features: any): Promise<number> {

  try {

    const response = await fetch("http://127.0.0.1:8001/predict", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(features),
      signal: AbortSignal.timeout(3000)
    });

    const data = await response.json() as { probability: number };

    return data.probability ?? 0;

  } catch (err) {

    console.warn("ML healing service unavailable");

    return 0;
  }
}
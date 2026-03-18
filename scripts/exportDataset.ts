import fs from "fs/promises";
import path from "path";

/**
 * exportDataset.ts  (updated for ndjson format)
 *
 * Reads healing-data.ndjson (newline-delimited JSON — one record per line)
 * and exports to dataset.csv for train_model.py
 *
 * If you kept the original featureLogger.ts (json format) and just use
 * workers=1, change the inputPath extension back to .json and
 * parse with JSON.parse(raw) instead of the ndjson line-by-line read.
 */
async function exportDataset() {

  const ndjsonPath = path.join(process.cwd(), "data", "ml-dataset", "healing-data.ndjson");
  const jsonPath   = path.join(process.cwd(), "data", "ml-dataset", "healing-data.json");

  const outputPath = path.join(process.cwd(), "data", "ml-dataset", "dataset.csv");

  let data: any[] = [];

  // Try ndjson first (new safe format), fall back to json (old format)
  try {
    const raw = await fs.readFile(ndjsonPath, "utf-8");
    data = raw
      .split("\n")
      .filter(line => line.trim().length > 0)
      .map(line => JSON.parse(line));
    console.log(`Read ${data.length} records from healing-data.ndjson`);
  } catch {
    try {
      const raw = await fs.readFile(jsonPath, "utf-8");
      const parsed = JSON.parse(raw);
      data = Array.isArray(parsed) ? parsed : [parsed];
      console.log(`Read ${data.length} records from healing-data.json`);
    } catch {
      console.error("No dataset file found. Run diverseDataset.spec.ts first.");
      process.exit(1);
    }
  }

  if (data.length === 0) {
    console.error("Dataset is empty.");
    process.exit(1);
  }

  const headers = [
    "tagMatch",
    "idMatch",
    "classOverlap",
    "attributeOverlap",
    "textMatch",
    "textSimilarity",
    "semanticSimilarity",
    "parentMatch",
    "depthDiff",
    "siblingDensity",
    "chosen"
  ];

  const rows = data.map((row: any) => {
    const f = row.features;
    return [
      f.tagMatch,
      f.idMatch,
      f.classOverlap,
      f.attributeOverlap,
      f.textMatch,
      f.textSimilarity,
      f.semanticSimilarity,
      f.parentMatch,
      f.depthDiff,
      f.siblingDensity,
      row.chosen ? 1 : 0
    ].join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");

  await fs.writeFile(outputPath, csv);

  // Summary
  const chosen1 = data.filter((r: any) => r.chosen).length;
  const chosen0 = data.length - chosen1;

  console.log(`\nDataset exported to dataset.csv`);
  console.log(`Total rows:  ${data.length}`);
  console.log(`chosen=1:    ${chosen1} (${((chosen1/data.length)*100).toFixed(1)}%)`);
  console.log(`chosen=0:    ${chosen0} (${((chosen0/data.length)*100).toFixed(1)}%)`);
}

exportDataset();
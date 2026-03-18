import fs from "fs/promises";
import path from "path";
import { LocatorMetadata } from "../../../core/types/LocatorMetadata";

export async function loadMetadata(stepName: string): Promise<LocatorMetadata | null> {
  try {
    const filePath = path.join(
      process.cwd(),
      "data",
      "locator-store",
      `${stepName}.json`
    );

    const file = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(file);

    if (Array.isArray(parsed)) {
      return parsed[parsed.length - 1]; // latest snapshot
    }

    return parsed;

  } catch (err) {
    return null;
  }
}

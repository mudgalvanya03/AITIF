import { Locator } from "@playwright/test";
import fs from "fs/promises";
import path from "path";
import { LocatorMetadata } from "../../../core/types/LocatorMetadata";
import { logger } from "../../../core/logger/logger";

export async function collectLocatorMetadata(
  locator: Locator,
  stepName: string
): Promise<LocatorMetadata> {

  const elementInfo = await locator.evaluate((el) => {

    const attrs: Record<string, string> = {};

    // Convert NamedNodeMap to array for TypeScript safety
    Array.from(el.attributes).forEach(attr => {
      attrs[attr.name] = attr.value;
    });

    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      classes: el.className ? el.className.split(" ") : [],
      text: el.textContent?.trim() || null,
      attributes: attrs
    };
  });

  const metadata: LocatorMetadata = {
    stepName,
    tag: elementInfo.tag,
    id: elementInfo.id,
    classes: elementInfo.classes,
    text: elementInfo.text,
    attributes: elementInfo.attributes,
    timestamp: new Date().toISOString()
  };

  await saveMetadata(metadata);

  logger.info(`Metadata captured for step: ${stepName}`);

  return metadata;
}

async function saveMetadata(metadata: LocatorMetadata) {

  const filePath = path.join(
    process.cwd(),
    "data",
    "locator-store",
    `${metadata.stepName}.json`
  );

  let existing: LocatorMetadata[] = [];

  try {
    const file = await fs.readFile(filePath, "utf-8");
    existing = JSON.parse(file);
  } catch {
    existing = [];
  }

  // If file previously stored single object, convert to array
  if (!Array.isArray(existing)) {
    existing = [existing];
  }

  existing.push(metadata);

  await fs.writeFile(filePath, JSON.stringify(existing, null, 2));
}



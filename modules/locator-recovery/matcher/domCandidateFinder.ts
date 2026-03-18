import { Page } from "@playwright/test";

export async function findCandidateElements(page: Page, tag: string) {

  const elements = await page.locator(tag).all();

  const candidates = [];

  for (const el of elements) {
    const info = await el.evaluate((node) => {

      const attrs: Record<string, string> = {};
      Array.from(node.attributes).forEach(attr => {
        attrs[attr.name] = attr.value;
      });
      function getDepth(el: Element) {
        let depth = 0;
        let current: Element | null = el;

        while (current?.parentElement) {
          depth++;
          current = current.parentElement;
        }

        return depth;
      }
      return {
        tag: node.tagName.toLowerCase(),
        id: node.id || null,
        classes: node.className ? node.className.split(" ") : [],
        text: node.textContent?.trim() || null,
        attributes: attrs,

        // DOM structure signals
        parentTag: node.parentElement?.tagName.toLowerCase() || null,
        depth: getDepth(node),
        siblingCount: node.parentElement?.children.length || 0
      };
    });

    candidates.push({
      locator: el,
      metadata: info
    });
  }

  return candidates;
}

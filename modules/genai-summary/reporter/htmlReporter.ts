/**
 * htmlReporter.ts
 *
 * Generates a self-contained HTML report with:
 *   - Executive summary (non-technical, from Gemini)
 *   - Technical analysis (dev-focused, from Gemini)
 *   - Full locator table with colour-coded risk levels
 *   - Stats cards for quick overview
 *
 * Output: data/genai-reports/aitif-report.html
 */

import fs from "fs/promises";
import path from "path";
import { SummaryContext } from "../data/dataLoader";

const REPORT_DIR  = path.join(process.cwd(), "data", "genai-reports");
const REPORT_PATH = path.join(REPORT_DIR, "aitif-report.html");

// ─── Risk colours ─────────────────────────────────────────────────────────────

const RISK_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  CRITICAL: { bg: "#fef2f2", text: "#991b1b", border: "#fca5a5" },
  FRAGILE:  { bg: "#fff7ed", text: "#9a3412", border: "#fdba74" },
  WATCH:    { bg: "#fefce8", text: "#854d0e", border: "#fde047" },
  STABLE:   { bg: "#f0fdf4", text: "#166534", border: "#86efac" },
};

const RISK_ICONS: Record<string, string> = {
  CRITICAL: "✕",
  FRAGILE:  "!",
  WATCH:    "~",
  STABLE:   "✓",
};

// ─── Stats card HTML ──────────────────────────────────────────────────────────

function statsCard(label: string, value: number, color: string): string {
  return `
    <div style="background:${color};border-radius:12px;padding:20px 24px;min-width:120px;text-align:center">
      <div style="font-size:32px;font-weight:700;color:#1f2937">${value}</div>
      <div style="font-size:13px;color:#6b7280;margin-top:4px">${label}</div>
    </div>`;
}

// ─── Locator row HTML ─────────────────────────────────────────────────────────

function locatorRow(score: any, index: number): string {
  const c = RISK_COLORS[score.riskLevel] ?? RISK_COLORS.STABLE;
  const icon = RISK_ICONS[score.riskLevel] ?? "✓";
  const bg = index % 2 === 0 ? "#ffffff" : "#f9fafb";

  const p = score.proactiveSignals ?? {};
  const r = score.reactiveSignals ?? {};

  const badges: string[] = [];
  if (p.hasDataTest) badges.push(`<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:99px;font-size:11px">data-test ✓</span>`);
  if (p.hasId)       badges.push(`<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:99px;font-size:11px">ID ✓</span>`);
  if (!p.hasDataTest) badges.push(`<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:99px;font-size:11px">no data-test</span>`);

  return `
    <tr style="background:${bg}">
      <td style="padding:10px 16px">
        <span style="background:${c.bg};color:${c.text};border:1px solid ${c.border};
          padding:3px 10px;border-radius:99px;font-size:12px;font-weight:600">
          ${icon} ${score.riskLevel}
        </span>
      </td>
      <td style="padding:10px 16px;font-family:monospace;font-size:13px;color:#374151">
        ${score.stepName}
      </td>
      <td style="padding:10px 16px;text-align:center">
        <span style="font-weight:700;font-size:15px;color:${c.text}">${score.totalScore}</span>
        <span style="color:#9ca3af;font-size:12px">/100</span>
      </td>
      <td style="padding:10px 16px;text-align:center;color:#6b7280;font-size:13px">
        ${r.healCount ?? 0}
      </td>
      <td style="padding:10px 16px;text-align:center;color:#6b7280;font-size:13px">
        ${r.recoveryCount ?? 0}
      </td>
      <td style="padding:10px 16px">
        ${badges.join(" ")}
      </td>
      <td style="padding:10px 16px;font-size:12px;color:#6b7280;max-width:280px">
        ${score.recommendation ?? ""}
      </td>
    </tr>`;
}

// ─── Full HTML ────────────────────────────────────────────────────────────────

export async function generateHtmlReport(
  ctx: SummaryContext,
  nonTechSummary: string,
  techSummary: string
): Promise<void> {
  await fs.mkdir(REPORT_DIR, { recursive: true });

  const scores: any[] = ctx.stabilityReport?.scores ?? [];
  const generatedAt = new Date().toLocaleString();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>AITIF Test Health Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #f3f4f6; color: #111827; line-height: 1.6; }
    .container { max-width: 1200px; margin: 0 auto; padding: 32px 24px; }
    h1 { font-size: 28px; font-weight: 700; color: #111827; }
    h2 { font-size: 20px; font-weight: 600; color: #1f2937; margin-bottom: 16px; }
    .card { background: #fff; border-radius: 16px; padding: 28px 32px;
            margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .badge { display:inline-block; padding:4px 12px; border-radius:99px;
             font-size:12px; font-weight:600; }
    table { width:100%; border-collapse:collapse; font-size:14px; }
    th { background:#f9fafb; padding:10px 16px; text-align:left;
         font-size:12px; font-weight:600; color:#6b7280;
         text-transform:uppercase; letter-spacing:0.05em;
         border-bottom:1px solid #e5e7eb; }
    .summary-text { font-size:15px; line-height:1.8; color:#374151; }
    .summary-text p { margin-bottom:12px; }
    .filter-btn { padding:8px 16px; border:1px solid #e5e7eb; border-radius:8px;
                  background:#fff; cursor:pointer; font-size:13px; margin-right:8px;
                  transition:all 0.15s; }
    .filter-btn:hover { background:#f3f4f6; }
    .filter-btn.active { background:#111827; color:#fff; border-color:#111827; }
  </style>
</head>
<body>
<div class="container">

  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:28px">
    <div>
      <h1>AITIF Test Health Report</h1>
      <p style="color:#6b7280;margin-top:4px;font-size:14px">Generated ${generatedAt}</p>
    </div>
    <div style="background:#111827;color:#fff;padding:8px 18px;border-radius:10px;font-size:13px">
      AI-powered · ${scores.length} locators analysed
    </div>
  </div>

  <!-- Stats cards -->
  <div class="card">
    <h2>Overview</h2>
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:24px">
      ${statsCard("Critical",  ctx.criticalCount, "#fef2f2")}
      ${statsCard("Fragile",   ctx.fragileCount,  "#fff7ed")}
      ${statsCard("Watch",     ctx.watchCount,    "#fefce8")}
      ${statsCard("Stable",    ctx.stableCount,   "#f0fdf4")}
      ${statsCard("Healed",    ctx.totalHeals,    "#eff6ff")}
      ${statsCard("Recovered", ctx.recoveredSuccessfully, "#f5f3ff")}
      ${statsCard("Failed",    ctx.failedRecoveries, "#fef2f2")}
    </div>
  </div>

  <!-- Non-technical summary -->
  <div class="card">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
      <div style="background:#dbeafe;color:#1e40af;padding:4px 12px;border-radius:99px;font-size:12px;font-weight:600">
        For Everyone
      </div>
      <h2 style="margin:0">What's happening with our tests?</h2>
    </div>
    <div class="summary-text">
      ${nonTechSummary.split("\n").filter(l => l.trim()).map(p => `<p>${p}</p>`).join("")}
    </div>
  </div>

  <!-- Technical summary -->
  <div class="card">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
      <div style="background:#f3e8ff;color:#6b21a8;padding:4px 12px;border-radius:99px;font-size:12px;font-weight:600">
        For Developers
      </div>
      <h2 style="margin:0">Technical Analysis</h2>
    </div>
    <div class="summary-text">
      ${techSummary.split("\n").filter(l => l.trim()).map(p => `<p>${p}</p>`).join("")}
    </div>
  </div>

  <!-- Full locator table -->
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2 style="margin:0">All Locators</h2>
      <div>
        <button class="filter-btn active" onclick="filterTable('ALL')">All</button>
        <button class="filter-btn" onclick="filterTable('CRITICAL')" style="color:#991b1b">Critical</button>
        <button class="filter-btn" onclick="filterTable('FRAGILE')"  style="color:#9a3412">Fragile</button>
        <button class="filter-btn" onclick="filterTable('WATCH')"    style="color:#854d0e">Watch</button>
        <button class="filter-btn" onclick="filterTable('STABLE')"   style="color:#166534">Stable</button>
      </div>
    </div>
    <div style="overflow-x:auto">
      <table id="locator-table">
        <thead>
          <tr>
            <th>Risk</th>
            <th>Locator</th>
            <th style="text-align:center">Score</th>
            <th style="text-align:center">Heals</th>
            <th style="text-align:center">Recoveries</th>
            <th>Signals</th>
            <th>Recommendation</th>
          </tr>
        </thead>
        <tbody id="table-body">
          ${scores.map((s, i) => locatorRow(s, i)).join("")}
        </tbody>
      </table>
    </div>
  </div>

</div>
<script>
  function filterTable(risk) {
    const rows = document.querySelectorAll('#table-body tr');
    rows.forEach(row => {
      const cell = row.querySelector('td span');
      const show = risk === 'ALL' || (cell && cell.textContent.includes(risk));
      row.style.display = show ? '' : 'none';
    });
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.textContent.trim() === risk ||
        (risk === 'ALL' && btn.textContent.trim() === 'All'));
    });
  }
</script>
</body>
</html>`;

  await fs.writeFile(REPORT_PATH, html);
  console.log(`\n✓ HTML report saved → ${REPORT_PATH}`);
}
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveEffectiveImputationEndTs,
  runUniversalGapImputation,
  buildCompleteGapNodePayloads,
  getWibTimeComponents,
} from "../lib/meteorologicalImputationEngine";

describe("Gap Imputation End-Boundary Clamping (Today vs Historical)", () => {
  const wibMs = (isoWib: string) => new Date(`${isoWib}+07:00`).getTime();

  it("should clamp today (00:00-23:59 WIB) imputation end boundary to the last observation timestamp", () => {
    const startTs = wibMs("2026-11-25T00:00:00");
    const endTs = wibMs("2026-11-25T23:59:59");
    const nowMs = wibMs("2026-11-25T18:46:10");

    // Observasi dari 00:00 sampai 18:45 WIB dengan celah internal 10:01..10:05
    const records: Array<{ timestamp: number; temperature: number; humidity: number; pressure: number }> = [];
    for (let m = 0; m <= 18 * 60 + 45; m++) {
      if (m >= 10 * 60 + 1 && m <= 10 * 60 + 5) continue; // 5-minute internal gap
      records.push({
        timestamp: startTs + m * 60000,
        temperature: 27 + Math.sin(m / 200),
        humidity: 80,
        pressure: 1010,
      });
    }

    const boundary = resolveEffectiveImputationEndTs(startTs, endTs, records, nowMs, true);
    assert.equal(boundary.wasClampedToLastData, true);
    assert.equal(boundary.effectiveEndTs, wibMs("2026-11-25T18:45:00"));

    const result = runUniversalGapImputation(records, startTs, boundary.effectiveEndTs, "temperature");
    // 00:00..18:45 inclusive = 1126 minutes (NOT 1440)
    assert.equal(result.summary.totalExpectedMinutes, 1126);
    assert.equal(result.summary.originalMissingCount, 5);
    assert.equal(result.summary.segments.length, 1);
    assert.equal(result.summary.segments[0].valBefore !== null, true);
    assert.equal(result.summary.segments[0].valAfter !== null, true);

    const lastGridPt = result.grid[result.grid.length - 1];
    assert.equal(lastGridPt.timestamp, wibMs("2026-11-25T18:45:00"));
    assert.equal(lastGridPt.isOriginal, true);

    const payloads = buildCompleteGapNodePayloads(
      result.grid,
      records,
      startTs,
      boundary.effectiveEndTs,
      "temperature"
    );
    assert.equal(payloads.length, 5);
    assert.ok(payloads.every((p) => p.timestampInSeconds <= Math.floor(wibMs("2026-11-25T18:45:00") / 1000)));
  });

  it("should NOT clamp past completed days (e.g. Kemarin) even if last observation ended before 23:59", () => {
    const startTs = wibMs("2026-11-24T00:00:00");
    const endTs = wibMs("2026-11-24T23:59:59");
    const nowMs = wibMs("2026-11-25T18:46:10");

    const records = [
      { timestamp: wibMs("2026-11-24T00:00:00"), temperature: 25.0 },
      { timestamp: wibMs("2026-11-24T20:00:00"), temperature: 26.5 },
    ];

    const boundary = resolveEffectiveImputationEndTs(startTs, endTs, records, nowMs, false);
    assert.equal(boundary.wasClampedToLastData, false);
    assert.equal(boundary.effectiveEndTs, endTs);

    const result = runUniversalGapImputation(records, startTs, boundary.effectiveEndTs, "temperature");
    assert.equal(result.summary.totalExpectedMinutes, 1440);
    assert.equal(result.grid[result.grid.length - 1].timeFormatted, "23:59:00");
  });

  it("should include last record rounded to nearest minute when seconds >= 30", () => {
    const startTs = wibMs("2026-11-25T00:00:00");
    const endTs = wibMs("2026-11-25T23:59:59");
    const nowMs = wibMs("2026-11-25T18:46:10");

    const records = [
      { timestamp: wibMs("2026-11-25T00:00:00"), temperature: 25.0 },
      { timestamp: wibMs("2026-11-25T18:45:40"), temperature: 28.0 }, // snaps to 18:46:00
    ];

    const boundary = resolveEffectiveImputationEndTs(startTs, endTs, records, nowMs, true);
    assert.equal(boundary.effectiveEndTs, wibMs("2026-11-25T18:46:00"));

    const result = runUniversalGapImputation(records, startTs, boundary.effectiveEndTs, "temperature");
    const lastPt = result.grid[result.grid.length - 1];
    assert.equal(getWibTimeComponents(lastPt.timestamp).timeFormatted, "18:46:00");
    assert.equal(lastPt.isOriginal, true);
  });

  it("should clamp to nowMs rather than 23:59 when today has zero observations", () => {
    const startTs = wibMs("2026-11-25T00:00:00");
    const endTs = wibMs("2026-11-25T23:59:59");
    const nowMs = wibMs("2026-11-25T10:15:30");

    const boundary = resolveEffectiveImputationEndTs(startTs, endTs, [], nowMs, true);
    assert.equal(boundary.wasClampedToLastData, false);
    assert.equal(boundary.wasClampedToNow, true);
    assert.equal(boundary.effectiveEndTs, wibMs("2026-11-25T10:15:00"));
  });
});

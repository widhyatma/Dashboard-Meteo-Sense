import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeDeltaReadings, computePollingBackoffMs } from "../lib/smartPollingUtils";
import type { SensorDate } from "../lib/FetchingSensorData";

function makePoint(tsMs: number, temperature: number): SensorDate {
  return {
    timestamp: tsMs,
    temperature,
    humidity: 80,
    pressure: 1010,
    dew: 23,
    rainfall: 0,
    rainrate: 0,
    volt: 4.0,
    lux: 100,
    soil_temp: 26,
    dateFormatted: "",
    timeFormatted: "",
  };
}

describe("Smart 15s RTDB Polling & Free-Tier Delta Guard", () => {
  it("should append delta readings without duplicate timestamps and trim out-of-window points", () => {
    const base = 1795700000000;
    const existing = [
      makePoint(base - 120_000, 26.0),
      makePoint(base - 60_000, 26.1),
      makePoint(base, 26.2),
    ];
    const incoming = [
      makePoint(base, 26.25), // duplikat timestamp -> diperbarui tanpa menggandakan baris
      makePoint(base + 60_000, 26.4),
    ];

    const merged = mergeDeltaReadings(existing, incoming, base - 60_000);
    assert.equal(merged.length, 3);
    assert.equal(merged[0].timestamp, base - 60_000);
    assert.equal(merged[1].temperature, 26.25);
    assert.equal(merged[2].timestamp, base + 60_000);
  });

  it("should compute exponential polling backoff capped at maxBackoffMs", () => {
    assert.equal(computePollingBackoffMs(15_000, 0), 15_000);
    assert.equal(computePollingBackoffMs(15_000, 1), 30_000);
    assert.equal(computePollingBackoffMs(15_000, 2), 60_000);
    assert.equal(computePollingBackoffMs(15_000, 5, 60_000), 60_000);
  });
});

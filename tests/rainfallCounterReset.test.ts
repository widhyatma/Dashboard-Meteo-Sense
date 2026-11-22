// tests/rainfallCounterReset.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeRainDeltas } from "../lib/climatology/aggregateHourly";
import { aggregateDaily } from "../lib/climatology/aggregateDaily";
import { aggregateHourly, aggregateDailyUTC } from "../lib/weatherUtils";
import { SensorDate } from "../lib/FetchingSensorData";

describe("Rainfall Counter Reset & Sensor Jitter Protection", () => {
  const baseTimestamp = 1756339200000; // 2025-08-28 00:00:00 UTC

  function createReading(offsetSeconds: number, rainfall: number, rainrate: number = 0): SensorDate {
    return {
      timestamp: baseTimestamp + offsetSeconds * 1000,
      temperature: 25.0,
      humidity: 80,
      pressure: 1010,
      dew: 21.0,
      rainfall,
      rainrate,
      timeFormatted: "00:00",
      dateFormatted: "28/08/2025",
    };
  }

  describe("computeRainDeltas (Climatology Engine)", () => {
    it("accumulates normal continuous rainfall correctly", () => {
      const records: SensorDate[] = [
        createReading(0, 10.0),
        createReading(60, 10.2),
        createReading(120, 10.8),
        createReading(180, 11.4),
      ];

      const withDeltas = computeRainDeltas(records);
      const totalRain = withDeltas.reduce((acc, r) => acc + r.rainDelta, 0);

      // (10.2 - 10.0) + (10.8 - 10.2) + (11.4 - 10.8) = 1.4 mm
      assert.equal(Math.round(totalRain * 100) / 100, 1.4);
    });

    it("rejects small micro-jitter drops and does not add the full cumulative total", () => {
      // Station id-05 bug scenario: reading drops by 0.28 mm from 45.5422 to 45.2628
      const records: SensorDate[] = [
        createReading(0, 45.5422),
        createReading(60, 45.2628), // micro-drop (-0.2794 mm)
        createReading(120, 45.2628),
      ];

      const withDeltas = computeRainDeltas(records);
      const totalRain = withDeltas.reduce((acc, r) => acc + r.rainDelta, 0);

      // Must be 0 mm, NOT 45.26 mm!
      assert.equal(totalRain, 0);
      assert.equal(withDeltas[1].rainDelta, 0);
    });

    it("prevents jitter bounce-back from repeatedly adding fake rain", () => {
      // Fluctuates: 45.54 -> 45.26 -> 45.54 -> 45.26 -> 45.54 (noise around 1 tip)
      const records: SensorDate[] = [
        createReading(0, 45.54),
        createReading(60, 45.26), // noise drop
        createReading(120, 45.54), // bounce back to original
        createReading(180, 45.26), // noise drop
        createReading(240, 45.54), // bounce back to original
      ];

      const withDeltas = computeRainDeltas(records);
      const totalRain = withDeltas.reduce((acc, r) => acc + r.rainDelta, 0);

      // Without protection, this would add 45.26 twice or 0.28 twice.
      // With protection, total rain should be 0 mm!
      assert.equal(totalRain, 0);
    });

    it("correctly identifies a legitimate daily counter reset to zero or near-zero", () => {
      // Synoptic day reset: counter at 45.5 mm drops to 0.0 mm, then receives 0.5 mm new rain
      const records: SensorDate[] = [
        createReading(0, 45.5),
        createReading(60, 0.0), // daily reset to 0
        createReading(120, 0.5), // new day rain
      ];

      const withDeltas = computeRainDeltas(records);
      const totalRain = withDeltas.reduce((acc, r) => acc + r.rainDelta, 0);

      assert.equal(withDeltas[1].rainDelta, 0); // reset to 0
      assert.equal(withDeltas[2].rainDelta, 0.5); // 0.5 mm new rain
      assert.equal(totalRain, 0.5);
    });

    it("rejects large anomalous negative drops without treating them as resets", () => {
      // Sensor glitch: drops from 80 mm to 40 mm (diff = -40 mm, still > 5 mm)
      const records: SensorDate[] = [
        createReading(0, 80.0),
        createReading(60, 40.0), // glitch drop
        createReading(120, 40.5), // 0.5 mm real rain after glitch
      ];

      const withDeltas = computeRainDeltas(records);
      assert.equal(withDeltas[1].rainDelta, 0); // must NOT add 40 mm!
      assert.equal(withDeltas[2].rainDelta, 0.5);
    });

    it("filters out spurious spikes (> 50 mm in single reading)", () => {
      const records: SensorDate[] = [
        createReading(0, 10.0),
        createReading(60, 85.0), // +75 mm glitch in 1 minute
        createReading(120, 85.2),
      ];

      const withDeltas = computeRainDeltas(records);
      assert.equal(withDeltas[1].rainDelta, 0); // spike ignored
    });
  });

  describe("aggregateDaily (Climatology Daily Accumulation)", () => {
    it("accumulates realistic daily rainfall even when frequent sensor jitter occurs", () => {
      // Generate 60 readings with slight jitter oscillating around 45 mm
      const records: SensorDate[] = [];
      for (let i = 0; i < 60; i++) {
        // oscillates between 45.26 and 45.54 every minute
        const rf = i % 2 === 0 ? 45.54 : 45.26;
        records.push(createReading(i * 60, rf));
      }

      const daily = aggregateDaily(records);
      assert.equal(daily.length, 1);
      // Under buggy logic, this accumulated 45.26 * 30 = ~1,357 mm!
      // Under fixed logic, total accumulation must be 0 mm.
      assert.equal(daily[0].rainfallAccumulation, 0);
    });
  });

  describe("weatherUtils aggregateHourly & aggregateDailyUTC (Reporting Module)", () => {
    it("prevents false rain accumulation during micro-jitter in weather reporting", () => {
      const records: SensorDate[] = [
        createReading(0, 45.54),
        createReading(60, 45.26), // jitter drop
        createReading(120, 45.26),
      ];

      const hourly = aggregateHourly(records);
      assert.equal(hourly.length, 1);
      assert.equal(hourly[0].rainfallTot, 0);

      const dailyUTC = aggregateDailyUTC(records);
      assert.equal(dailyUTC.length, 1);
      assert.equal(dailyUTC[0].rainfallTot, 0);
    });
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateHourly,
  aggregateHourlyUTC,
  aggregateDaily,
  aggregateDailyUTC,
} from "../lib/weatherUtils";
import type { SensorDate } from "../lib/FetchingSensorData";

describe("Laporan Meteorologi & WeatherUtils Rainfall Aggregation Tests", () => {
  describe("Pre-Aggregated Hourly Records (tempMax != null)", () => {
    it("should correctly sum multi-hour rain events without double-delta loss (Nov 2, 2025 actual case)", () => {
      // 2025-11-02: Hour 06:00 UTC = 13.97 mm, Hour 13:00 UTC = 30.38 mm
      const t06 = Date.UTC(2025, 10, 2, 6, 0, 0, 0); // Nov 2, 2025 06:00:00Z
      const t13 = Date.UTC(2025, 10, 2, 13, 0, 0, 0); // Nov 2, 2025 13:00:00Z

      const hourlyRecords: SensorDate[] = [
        {
          timestamp: t06,
          temperature: 26.5,
          tempMax: 28.0,
          tempMin: 25.0,
          humidity: 85,
          pressure: 1010.5,
          rainfall: 13.97,
        },
        {
          timestamp: t13,
          temperature: 25.0,
          tempMax: 26.5,
          tempMin: 24.0,
          humidity: 92,
          pressure: 1009.0,
          rainfall: 30.38,
        },
      ];

      // Test aggregateHourlyUTC
      const hourlyUTC = aggregateHourlyUTC(hourlyRecords);
      assert.equal(hourlyUTC.length, 2);
      assert.equal(hourlyUTC[0].rainfallTot, 13.97);
      assert.equal(hourlyUTC[1].rainfallTot, 30.38);

      // Test aggregateDailyUTC
      const dailyUTC = aggregateDailyUTC(hourlyRecords);
      assert.equal(dailyUTC.length, 1);
      assert.equal(dailyUTC[0].date, "2025-11-02");
      // Physical sum: 13.97 + 30.38 = 44.35 mm
      assert.equal(dailyUTC[0].rainfallTot, 44.35);

      // Test aggregateDaily (Local WIB: 06:00Z = 13:00 WIB, 13:00Z = 20:00 WIB - same calendar day 2025-11-02)
      const dailyWIB = aggregateDaily(hourlyRecords);
      assert.equal(dailyWIB.length, 1);
      assert.equal(dailyWIB[0].date, "2025-11-02");
      assert.equal(dailyWIB[0].rainfallTot, 44.35);
    });

    it("should preserve first-hour heavy rainfall > 5.0 mm without discarding as invalid reset", () => {
      const t = Date.UTC(2025, 10, 3, 4, 0, 0, 0);
      const records: SensorDate[] = [
        {
          timestamp: t,
          temperature: 24.2,
          tempMax: 25.5,
          tempMin: 23.0,
          humidity: 95,
          pressure: 1011.0,
          rainfall: 22.4, // > 5.0 mm
        },
      ];

      const daily = aggregateDaily(records);
      assert.equal(daily.length, 1);
      assert.equal(daily[0].rainfallTot, 22.4);
    });

    it("should sum decreasing rainfall across consecutive hours (e.g. 25 mm then 10 mm then 5 mm)", () => {
      const records: SensorDate[] = [
        {
          timestamp: Date.UTC(2025, 10, 4, 1, 0, 0, 0),
          temperature: 25,
          tempMax: 26,
          rainfall: 25.0,
        },
        {
          timestamp: Date.UTC(2025, 10, 4, 2, 0, 0, 0),
          temperature: 24,
          tempMax: 25,
          rainfall: 10.0,
        },
        {
          timestamp: Date.UTC(2025, 10, 4, 3, 0, 0, 0),
          temperature: 23,
          tempMax: 24,
          rainfall: 5.0,
        },
      ];

      const daily = aggregateDaily(records);
      assert.equal(daily.length, 1);
      // Expected total: 25 + 10 + 5 = 40.0 mm
      assert.equal(daily[0].rainfallTot, 40.0);
    });
  });

  describe("Raw Telemetry Continuous Counter Readings (tempMax == null)", () => {
    it("should calculate positive delta from continuous cumulative counter", () => {
      const baseTime = Date.UTC(2025, 10, 5, 2, 0, 0, 0);
      const rawRecords: SensorDate[] = [
        { timestamp: baseTime, temperature: 27, rainfall: 10.0 },
        { timestamp: baseTime + 300_000, temperature: 27, rainfall: 12.5 },
        { timestamp: baseTime + 600_000, temperature: 26, rainfall: 15.0 },
      ];

      const daily = aggregateDaily(rawRecords);
      assert.equal(daily.length, 1);
      // Delta: (12.5 - 10.0) + (15.0 - 12.5) = 2.5 + 2.5 = 5.0 mm
      assert.equal(daily[0].rainfallTot, 5.0);
    });

    it("should ignore sensor micro-jitter drops <= 1.0 mm", () => {
      const baseTime = Date.UTC(2025, 10, 5, 3, 0, 0, 0);
      const rawRecords: SensorDate[] = [
        { timestamp: baseTime, temperature: 27, rainfall: 15.0 },
        { timestamp: baseTime + 300_000, temperature: 27, rainfall: 14.8 }, // -0.2 mm jitter
        { timestamp: baseTime + 600_000, temperature: 27, rainfall: 16.0 }, // +1.0 from 15.0
      ];

      const daily = aggregateDaily(rawRecords);
      assert.equal(daily.length, 1);
      // 14.8 is ignored, prev stays 15.0. 16.0 - 15.0 = 1.0 mm
      assert.equal(daily[0].rainfallTot, 1.0);
    });

    it("should accept valid daily counter reset returning near zero (<= 5.0 mm)", () => {
      const baseTime = Date.UTC(2025, 10, 5, 0, 0, 0, 0);
      const rawRecords: SensorDate[] = [
        { timestamp: baseTime - 60_000, temperature: 24, rainfall: 45.0 },
        { timestamp: baseTime, temperature: 24, rainfall: 0.4 }, // reset at 00:00 UTC
      ];

      const daily = aggregateDailyUTC(rawRecords);
      // On the new day (baseTime), 0.4 mm is added as valid reset
      const newDay = daily.find(d => d.date === "2025-11-05");
      assert.ok(newDay);
      assert.equal(newDay.rainfallTot, 0.4);
    });

    it("should discard anomalous negative drops where counter remains high > 5.0 mm", () => {
      const baseTime = Date.UTC(2025, 10, 5, 5, 0, 0, 0);
      const rawRecords: SensorDate[] = [
        { timestamp: baseTime, temperature: 27, rainfall: 35.0 },
        { timestamp: baseTime + 300_000, temperature: 27, rainfall: 18.0 }, // drop of 17 mm, but remains 18 > 5 mm
      ];

      const daily = aggregateDaily(rawRecords);
      assert.equal(daily.length, 1);
      // Anomalous drop: rainDelta = 0
      assert.equal(daily[0].rainfallTot, 0);
    });
  });
});

import { NextResponse } from "next/server";
import {
  fetchSensorData,
  fetchSensorDataByDateRange,
  fetchSensorDataByValue,
  fetchSensorMetadata,
  fetchLatestSensorSnapshot,
  fetchSensorDataDelta,
  type LatestSensorSnapshot,
} from "@/lib/FetchingSensorData";
import { aggregateSensorToHourly } from "@/lib/bias-correction/preprocessing/hourlyAggregation";
import { compressTimeSeries } from "@/lib/compression/adaptiveTimeSeries";

type CacheEntry = {
  data: any;
  cachedAt: number;
};
const rangeCache = new Map<string, CacheEntry>();
const MAX_CACHE_ENTRIES = 50;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 menit TTL
const COALESCED_LATEST_TTL_MS = 12 * 1000; // 12 detik coalesced cache untuk polling 15 detik multi-user

const dashboardLatestCache = new Map<
  string,
  { fetchedAt: number; items: LatestSensorSnapshot[] }
>();
const inFlightDashboardLatest = new Map<string, Promise<LatestSensorSnapshot[]>>();

export const revalidate = 60; // Cache for 1 minute

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const sensorId = searchParams.get("sensorId");
  const calibrationStr = searchParams.get("calibration");
  const applyCalibration = calibrationStr !== "false"; // Default to true unless explicitly false

  if (!action || (!sensorId && action !== "dashboard-latest")) {
    return NextResponse.json({ error: "sensorId and action are required" }, { status: 400 });
  }

  const isRefresh = searchParams.get("refresh") === "true" || searchParams.has("_t") || searchParams.has("force");
  const responseOptions = {
    headers: {
      "Cache-Control": isRefresh
        ? "no-store, no-cache, must-revalidate, proxy-revalidate"
        : "public, s-maxage=60, stale-while-revalidate=120",
    },
  };

  const isCompact = searchParams.get("compact") === "true";
  const maxPoints = parseInt(searchParams.get("maxPoints") || "300", 10);

  try {
    switch (action) {
      case "dashboard-latest": {
        const idsParam = searchParams.get("ids") || "";
        const ids = Array.from(
          new Set(
            idsParam
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          )
        ).sort();
        if (ids.length === 0) {
          return NextResponse.json({ error: "ids query parameter is required" }, { status: 400 });
        }
        const cacheKey = `${ids.join(",")}:${applyCalibration}`;
        const now = Date.now();
        const cached = dashboardLatestCache.get(cacheKey);
        if (!isRefresh && cached && now - cached.fetchedAt < COALESCED_LATEST_TTL_MS) {
          return NextResponse.json(
            { fetchedAt: cached.fetchedAt, cacheHit: true, items: cached.items },
            { headers: { "Cache-Control": "no-store", "X-Cache": "COALESCED-HIT" } }
          );
        }

        let promise = inFlightDashboardLatest.get(cacheKey);
        if (!promise) {
          promise = Promise.all(ids.map((id) => fetchLatestSensorSnapshot(id, applyCalibration)))
            .then((items) => {
              dashboardLatestCache.set(cacheKey, { fetchedAt: Date.now(), items });
              return items;
            })
            .finally(() => {
              inFlightDashboardLatest.delete(cacheKey);
            });
          inFlightDashboardLatest.set(cacheKey, promise);
        }

        const items = await promise;
        return NextResponse.json(
          { fetchedAt: Date.now(), cacheHit: false, items },
          { headers: { "Cache-Control": "no-store" } }
        );
      }
      case "delta": {
        const sinceStr = searchParams.get("since");
        const sinceMs = sinceStr ? parseInt(sinceStr, 10) : 0;
        if (!Number.isFinite(sinceMs) || sinceMs <= 0) {
          return NextResponse.json({ error: "Valid since timestamp (ms) is required" }, { status: 400 });
        }
        const data = await fetchSensorDataDelta(sensorId!, sinceMs, applyCalibration);
        return NextResponse.json(data, {
          headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
        });
      }
      case "metadata": {
        const data = await fetchSensorMetadata(sensorId!);
        return NextResponse.json(data, responseOptions);
      }
      case "latest": {
        const limitStr = searchParams.get("limit");
        const limit = limitStr ? parseInt(limitStr, 10) : 1;
        const data = await fetchSensorData(sensorId!, limit, applyCalibration);
        if (isCompact && Array.isArray(data) && data.length > 0) {
          return NextResponse.json(compressTimeSeries(data, maxPoints), responseOptions);
        }
        return NextResponse.json(data, responseOptions);
      }
      case "range": {
        const startStr = searchParams.get("start");
        const endStr = searchParams.get("end");
        if (!startStr || !endStr) {
          return NextResponse.json({ error: "start and end timestamps are required for range action" }, { status: 400 });
        }
        const startTimestamp = parseInt(startStr, 10);
        const endTimestamp = parseInt(endStr, 10);
        const resolution = searchParams.get("resolution") || searchParams.get("aggregate");
        const cacheKey = `${sensorId}:${startTimestamp}:${endTimestamp}:${applyCalibration}:${resolution}:${isCompact ? `compact:${maxPoints}` : "raw"}`;

        if (!isRefresh) {
          const cached = rangeCache.get(cacheKey);
          if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
            return NextResponse.json(cached.data, {
              headers: {
                "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
                "X-Cache": "HIT",
              },
            });
          }
        }

        const data = await fetchSensorDataByDateRange(
          sensorId!,
          startTimestamp,
          endTimestamp,
          applyCalibration,
          resolution === "hourly" ? "hourly" : "raw"
        );

        const responsePayload = isCompact && Array.isArray(data) && data.length > 0
          ? compressTimeSeries(data, maxPoints)
          : data;

        if (rangeCache.size >= MAX_CACHE_ENTRIES) {
          const oldestKey = rangeCache.keys().next().value;
          if (oldestKey) rangeCache.delete(oldestKey);
        }
        rangeCache.set(cacheKey, { data: responsePayload, cachedAt: Date.now() });

        return NextResponse.json(responsePayload, responseOptions);
      }
      case "value": {
        const field = searchParams.get("field");
        const valueStr = searchParams.get("value");
        if (!field || !valueStr) {
          return NextResponse.json({ error: "field and value are required for value action" }, { status: 400 });
        }
        const value = parseFloat(valueStr);
        const data = await fetchSensorDataByValue(sensorId!, field, value, applyCalibration);
        if (isCompact && Array.isArray(data) && data.length > 0) {
          return NextResponse.json(compressTimeSeries(data, maxPoints), responseOptions);
        }
        return NextResponse.json(data, responseOptions);
      }
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error: any) {
    console.error(`API Error in /api/sensors for action ${action}:`, error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      sensorId?: string;
    };
    if (body.action !== "invalidate") {
      return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }

    let cleared = 0;
    if (body.sensorId) {
      const prefix = `${body.sensorId}:`;
      for (const key of Array.from(rangeCache.keys())) {
        if (key.startsWith(prefix)) {
          rangeCache.delete(key);
          cleared++;
        }
      }
    } else {
      cleared = rangeCache.size;
      rangeCache.clear();
    }

    return NextResponse.json({ invalidated: true, cleared, sensorId: body.sensorId ?? "*" });
  } catch (error: any) {
    console.error("API Error in POST /api/sensors:", error);
    return NextResponse.json({ error: error.message || "Failed to invalidate cache" }, { status: 500 });
  }
}

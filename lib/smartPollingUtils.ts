// lib/smartPollingUtils.ts
// Utilitas murni penggabungan incremental delta & backoff untuk polling 15 detik aman Firebase Spark Tier

import type { SensorDate } from "./FetchingSensorData";

/**
 * Menggabungkan titik pembacaan delta terbaru ke deret historis aktif tanpa duplikasi timestamp,
 * mengurutkan secara kronologis, dan memangkas titik yang lebih lama dari `windowStartMs`.
 */
export function mergeDeltaReadings(
  existing: SensorDate[],
  incoming: SensorDate[],
  windowStartMs: number
): SensorDate[] {
  const byTs = new Map<number, SensorDate>();

  for (let i = 0; i < existing.length; i++) {
    const item = existing[i];
    if (Number.isFinite(item.timestamp) && item.timestamp >= windowStartMs) {
      byTs.set(item.timestamp, item);
    }
  }

  for (let i = 0; i < incoming.length; i++) {
    const item = incoming[i];
    if (Number.isFinite(item.timestamp) && item.timestamp >= windowStartMs) {
      byTs.set(item.timestamp, item);
    }
  }

  return Array.from(byTs.values()).sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Menghitung jeda backoff eksponensial bila polling menemui gangguan jaringan/rate limit,
 * dibatasi maksimal `maxBackoffMs` (default 60 detik).
 */
export function computePollingBackoffMs(
  baseIntervalMs: number,
  consecutiveErrors: number,
  maxBackoffMs: number = 60_000
): number {
  if (consecutiveErrors <= 0) return baseIntervalMs;
  const mult = Math.pow(2, Math.min(4, consecutiveErrors));
  return Math.min(maxBackoffMs, baseIntervalMs * mult);
}

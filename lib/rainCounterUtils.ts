// lib/rainCounterUtils.ts
// Utilitas deteksi & akumulasi curah hujan kumulatif harian UTC tahan glitch/drop ke 0.0

export interface RainStepInput {
  tsMs: number;
  rainfall: number | null | undefined;
  rainrate?: number | null | undefined;
}

const MAX_RESET_BASE_MM = 5.0;
const SENSOR_JITTER_MM = 1.0;
const MAX_DELTA_PER_INTERVAL_MM = 50.0;
const MAX_RAINRATE_MM_HR = 300.0;
const UTC_RESET_GUARD_SEC = 900; // ±15 menit sekitar 00:00 UTC (07:00 WIB)
const TRANSIENT_RECOVERY_WINDOW_MS = 30 * 60 * 1000;

/**
 * Menghitung delta hujan per langkah waktu dengan proteksi transient zero-drop:
 * apabila `rainfall` tiba-tiba turun ke <= 5 mm di luar jendela reset 00:00 UTC lalu
 * kembali ke nilai plateau semula dalam <= 30 menit di hari UTC yang sama, drop diabaikan
 * sehingga pemulihan tidak terhitung sebagai hujan baru.
 */
export function computeCumulativeRainDeltaStep(
  items: RainStepInput[],
  index: number,
  prevValidRainfall: number | null,
  deltaSeconds: number,
  maxIntervalSec: number = 1800
): { delta: number; nextPrevValidRainfall: number | null } {
  const cur = items[index];
  const curRfRaw = cur.rainfall;

  if (index === 0) {
    if (curRfRaw != null && Number.isFinite(Number(curRfRaw))) {
      const r0 = Number(curRfRaw);
      if (r0 >= 0 && r0 <= MAX_DELTA_PER_INTERVAL_MM) {
        return {
          delta: r0 <= MAX_RESET_BASE_MM ? r0 : 0,
          nextPrevValidRainfall: r0,
        };
      }
    }
    return { delta: 0, nextPrevValidRainfall: prevValidRainfall };
  }

  if (curRfRaw != null && Number.isFinite(Number(curRfRaw)) && prevValidRainfall !== null) {
    const curRf = Number(curRfRaw);
    const prevRf = prevValidRainfall;
    const diff = curRf - prevRf;

    if (diff >= 0 && diff <= MAX_DELTA_PER_INTERVAL_MM) {
      return { delta: diff, nextPrevValidRainfall: curRf };
    }

    if (diff < 0) {
      if (Math.abs(diff) <= SENSOR_JITTER_MM) {
        return { delta: 0, nextPrevValidRainfall: prevRf };
      }

      if (curRf >= 0 && curRf <= MAX_RESET_BASE_MM) {
        const curSec = Math.floor(cur.tsMs / 1000);
        const secOfDay = ((curSec % 86400) + 86400) % 86400;
        const nearUtcReset = secOfDay <= UTC_RESET_GUARD_SEC || secOfDay >= 86400 - UTC_RESET_GUARD_SEC;

        if (!nearUtcReset && prevRf > 0.1) {
          const curDay = Math.floor(cur.tsMs / 86400000);
          for (let j = index + 1; j < items.length; j++) {
            const nxt = items[j];
            if (nxt.tsMs - cur.tsMs > TRANSIENT_RECOVERY_WINDOW_MS) break;
            if (Math.floor(nxt.tsMs / 86400000) !== curDay) break;
            if (nxt.rainfall != null && Number.isFinite(Number(nxt.rainfall))) {
              if (Number(nxt.rainfall) >= prevRf - 0.1) {
                return { delta: 0, nextPrevValidRainfall: prevRf };
              }
            }
          }
        }

        return { delta: curRf, nextPrevValidRainfall: curRf };
      }

      return { delta: 0, nextPrevValidRainfall: curRf };
    }

    return { delta: 0, nextPrevValidRainfall: prevRf };
  }

  if (curRfRaw != null && Number.isFinite(Number(curRfRaw))) {
    return { delta: 0, nextPrevValidRainfall: Number(curRfRaw) };
  }

  if (deltaSeconds > 0 && deltaSeconds <= maxIntervalSec && cur.rainrate != null) {
    const rr = Number(cur.rainrate);
    const validRR = Number.isFinite(rr) && rr >= 0 ? Math.min(rr, MAX_RAINRATE_MM_HR) : 0;
    return { delta: validRR * (deltaSeconds / 3600), nextPrevValidRainfall: prevValidRainfall };
  }

  return { delta: 0, nextPrevValidRainfall: prevValidRainfall };
}

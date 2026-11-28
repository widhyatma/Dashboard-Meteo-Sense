// hooks/useSmartRtdbPolling.ts
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { computePollingBackoffMs } from "@/lib/smartPollingUtils";

export interface UseSmartRtdbPollingOptions {
  enabled?: boolean;
  defaultLive?: boolean;
  intervalMs?: number;
  idleTimeoutMs?: number;
  visibilityCatchupThresholdMs?: number;
  onPoll: () => Promise<void>;
}

export interface UseSmartRtdbPollingResult {
  isLive: boolean;
  setIsLive: (next: boolean) => void;
  toggleLive: () => void;
  isPausedVisibility: boolean;
  isPausedIdle: boolean;
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  consecutiveErrors: number;
  resumeNow: () => void;
}

/**
 * Hook polling 15 detik aman kuota Firebase Spark Free Tier:
 * - Otomatis jeda saat tab disembunyikan (`document.visibilityState !== "visible"`) atau browser offline.
 * - Otomatis jeda bila pengguna tidak berinteraksi melebihi `idleTimeoutMs` (default 30 menit).
 * - Deduplikasi request in-flight + backoff eksponensial saat error.
 */
export function useSmartRtdbPolling({
  enabled = true,
  defaultLive = true,
  intervalMs = 15_000,
  idleTimeoutMs = 30 * 60 * 1000,
  visibilityCatchupThresholdMs = 10_000,
  onPoll,
}: UseSmartRtdbPollingOptions): UseSmartRtdbPollingResult {
  const [isLive, setIsLive] = useState<boolean>(defaultLive);
  const [isPausedVisibility, setIsPausedVisibility] = useState<boolean>(false);
  const [isPausedIdle, setIsPausedIdle] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [consecutiveErrors, setConsecutiveErrors] = useState<number>(0);

  const onPollRef = useRef(onPoll);
  onPollRef.current = onPoll;

  const inFlightRef = useRef<boolean>(false);
  const lastActivityRef = useRef<number>(Date.now());
  const hiddenSinceRef = useRef<number | null>(null);
  const errorCountRef = useRef<number>(0);

  const runTick = useCallback(async () => {
    if (!enabled || !isLive || inFlightRef.current) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;

    const now = Date.now();
    if (idleTimeoutMs > 0 && now - lastActivityRef.current > idleTimeoutMs) {
      setIsPausedIdle(true);
      return;
    }

    inFlightRef.current = true;
    setIsSyncing(true);
    try {
      await onPollRef.current();
      errorCountRef.current = 0;
      setConsecutiveErrors(0);
      setLastSyncedAt(new Date());
    } catch {
      errorCountRef.current += 1;
      setConsecutiveErrors(errorCountRef.current);
    } finally {
      inFlightRef.current = false;
      setIsSyncing(false);
    }
  }, [enabled, isLive, idleTimeoutMs]);

  const resumeNow = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIsPausedIdle(false);
    setIsLive(true);
    void runTick();
  }, [runTick]);

  const toggleLive = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIsPausedIdle(false);
    setIsLive((prev) => !prev);
  }, []);

  // Pantau aktivitas pasif pengguna untuk reset timer idle
  useEffect(() => {
    if (typeof window === "undefined") return;
    const markActive = () => {
      lastActivityRef.current = Date.now();
      setIsPausedIdle((prev) => (prev ? false : prev));
    };
    window.addEventListener("pointerdown", markActive, { passive: true });
    window.addEventListener("keydown", markActive, { passive: true });
    window.addEventListener("scroll", markActive, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", markActive);
      window.removeEventListener("keydown", markActive);
      window.removeEventListener("scroll", markActive);
    };
  }, []);

  // Page Visibility API Guard
  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenSinceRef.current = Date.now();
        setIsPausedVisibility(true);
      } else {
        setIsPausedVisibility(false);
        const hiddenMs = hiddenSinceRef.current ? Date.now() - hiddenSinceRef.current : 0;
        hiddenSinceRef.current = null;
        lastActivityRef.current = Date.now();
        setIsPausedIdle(false);
        if (enabled && isLive && hiddenMs >= visibilityCatchupThresholdMs) {
          void runTick();
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [enabled, isLive, visibilityCatchupThresholdMs, runTick]);

  // Timer adaptif dengan backoff saat terjadi error
  useEffect(() => {
    if (!enabled || !isLive || isPausedIdle || isPausedVisibility) return;

    let timerId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const scheduleNext = () => {
      const delay = computePollingBackoffMs(intervalMs, errorCountRef.current);
      timerId = setTimeout(async () => {
        if (cancelled) return;
        await runTick();
        if (!cancelled) {
          scheduleNext();
        }
      }, delay);
    };

    scheduleNext();
    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [enabled, isLive, isPausedIdle, isPausedVisibility, intervalMs, runTick]);

  return {
    isLive,
    setIsLive,
    toggleLive,
    isPausedVisibility,
    isPausedIdle,
    isSyncing,
    lastSyncedAt,
    consecutiveErrors,
    resumeNow,
  };
}

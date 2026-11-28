// lib/firebaseDeviceCache.ts
// Shared server-side in-memory cache untuk koleksi Firestore `devices`
// Menghindari pembacaan Firestore berulang pada endpoint node-health & API perangkat (Spark Free Tier safe)

import { collection, getDocs, query, Timestamp } from "firebase/firestore";
import { db } from "@/lib/ConfigFirebase";

export interface CachedDeviceRecord {
  id: string;
  name: string;
  location: string;
  registrationDate: string;
  coordinates: { lat: number; lng: number };
  userId: string;
  authToken?: string;
}

const DEVICES_CACHE_TTL_MS = 15 * 60 * 1000; // 15 menit
let cachedDevices: CachedDeviceRecord[] | null = null;
let cachedAt = 0;
let inFlightFetch: Promise<CachedDeviceRecord[]> | null = null;

function formatRegDate(raw: unknown): string {
  const d = raw instanceof Timestamp ? raw.toDate() : new Date();
  return d.toLocaleString("id-ID", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function invalidateDevicesServerCache(): void {
  cachedDevices = null;
  cachedAt = 0;
}

export async function getCachedDevicesFromFirestore(forceRefresh = false): Promise<CachedDeviceRecord[]> {
  const now = Date.now();
  if (!forceRefresh && cachedDevices && now - cachedAt < DEVICES_CACHE_TTL_MS) {
    return cachedDevices;
  }
  if (!forceRefresh && inFlightFetch) {
    return inFlightFetch;
  }

  inFlightFetch = (async () => {
    try {
      const devicesRef = collection(db, "devices");
      const snap = await getDocs(query(devicesRef));
      const list: CachedDeviceRecord[] = snap.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          name: data.name || docSnap.id,
          location: data.location || "Lokasi AWS",
          registrationDate: formatRegDate(data.registrationDate || data.createdAt),
          coordinates: data.coordinates || { lat: 0.0, lng: 0.0 },
          userId: data.userId,
          authToken: data.authToken,
        };
      });
      cachedDevices = list;
      cachedAt = Date.now();
      return list;
    } finally {
      inFlightFetch = null;
    }
  })();

  return inFlightFetch;
}

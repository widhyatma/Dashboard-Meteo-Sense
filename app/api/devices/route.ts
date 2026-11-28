import { NextResponse } from 'next/server';
import { getCachedDevicesFromFirestore } from '@/lib/firebaseDeviceCache';

export const revalidate = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const forceRefresh = searchParams.get('refresh') === 'true';

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  try {
    const devices = await getCachedDevicesFromFirestore(forceRefresh);
    return NextResponse.json(devices);
  } catch (error: any) {
    console.error("Error in GET /api/devices:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

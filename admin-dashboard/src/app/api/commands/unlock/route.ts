import { NextResponse } from 'next/server';
import { createRemoteUnlockCommand } from '../../../../lib/api';

export async function POST(req: Request) {
  try {
    // Optionally, get deviceId from body or session
    const { deviceId } = await req.json();
    if (!deviceId) {
      return NextResponse.json({ error: 'Missing deviceId' }, { status: 400 });
    }
    const result = await createRemoteUnlockCommand(deviceId);
    return NextResponse.json({ success: true, result });
  } catch (e) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}

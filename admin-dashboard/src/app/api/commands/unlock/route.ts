import { NextResponse } from 'next/server';
import { sendRemoteUnlock } from '../../../../lib/api';

  try {
    // Optionally, get deviceId from body or session
    const { deviceId } = await req.json();
    if (!deviceId) {
      return NextResponse.json({ error: 'Missing deviceId' }, { status: 400 });
    }
    const result = await sendRemoteUnlock(deviceId);
    return NextResponse.json({ success: true, result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}

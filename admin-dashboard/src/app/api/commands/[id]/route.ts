import { NextRequest, NextResponse } from 'next/server'
import { fetchCommandStatus } from '@/lib/api'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const command = await fetchCommandStatus(params.id)
    if (!command) {
      return NextResponse.json({ error: 'Command not found' }, { status: 404 })
    }
    return NextResponse.json(command)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch command' },
      { status: 500 }
    )
  }
}

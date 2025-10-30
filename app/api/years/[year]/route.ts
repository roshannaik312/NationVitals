import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET(
  request: Request,
  context: { params: Promise<{ year: string }> }
) {
  try {
    const { year } = await context.params
    const filePath = path.join(process.cwd(), 'public', 'data', 'years', `${year}.json`)

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: `Year ${year} not found` },
        { status: 404 }
      )
    }

    const fileContents = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(fileContents)

    return NextResponse.json(data, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (error) {
    console.error(`Error loading year data:`, error)
    return NextResponse.json(
      { error: 'Failed to load year data' },
      { status: 500 }
    )
  }
}

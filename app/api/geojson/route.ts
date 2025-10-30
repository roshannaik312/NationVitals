import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'public', 'data', 'us_counties.geojson')
    console.log('Attempting to load GeoJSON from:', filePath)
    console.log('File exists:', fs.existsSync(filePath))

    if (!fs.existsSync(filePath)) {
      console.error('GeoJSON file not found at:', filePath)
      console.log('Current working directory:', process.cwd())
      console.log('Directory contents:', fs.readdirSync(path.join(process.cwd(), 'public', 'data')).slice(0, 10))
      return NextResponse.json(
        { error: 'GeoJSON file not found', path: filePath },
        { status: 404 }
      )
    }

    const fileContents = fs.readFileSync(filePath, 'utf8')
    const geojson = JSON.parse(fileContents)
    console.log('✓ Successfully loaded GeoJSON with', geojson.features?.length, 'features')

    return NextResponse.json(geojson, {
      headers: {
        'Content-Type': 'application/geo+json',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (error) {
    console.error('Error loading GeoJSON:', error)
    return NextResponse.json(
      { error: 'Failed to load GeoJSON', details: String(error) },
      { status: 500 }
    )
  }
}

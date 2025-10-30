import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const execAsync = promisify(exec)

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const countyA = searchParams.get('countyA')
    const countyB = searchParams.get('countyB')
    const year = searchParams.get('year') || '2023'
    const controlPoverty = searchParams.get('controlPoverty') === 'true'
    const controlIncome = searchParams.get('controlIncome') === 'true'
    const controlUrbanRural = searchParams.get('controlUrbanRural') === 'true'

    if (!countyA || !countyB) {
      return NextResponse.json(
        { error: 'Missing required parameters: countyA, countyB' },
        { status: 400 }
      )
    }

    // Call Python script to compute adjusted values
    // Convert JavaScript boolean to Python boolean
    const pyControlPoverty = controlPoverty ? 'True' : 'False'
    const pyControlIncome = controlIncome ? 'True' : 'False'
    const pyControlUrbanRural = controlUrbanRural ? 'True' : 'False'

    const scriptPath = path.join(process.cwd(), 'statistical_controls.py')
    const command = `python3 -c "
import sys
sys.path.insert(0, '${process.cwd()}')
from statistical_controls import adjust_for_confounders
import json
result = adjust_for_confounders(
    '${countyA}',
    '${countyB}',
    ${year},
    ${pyControlPoverty},
    ${pyControlIncome},
    ${pyControlUrbanRural}
)
print(json.dumps(result))
"`

    const { stdout, stderr } = await execAsync(command, {
      cwd: process.cwd(),
      timeout: 10000 // 10 second timeout
    })

    if (stderr && !stderr.includes('FutureWarning')) {
      console.error('Python stderr:', stderr)
    }

    const result = JSON.parse(stdout.trim())

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    })
  } catch (error) {
    console.error('Error in compare API:', error)
    return NextResponse.json(
      {
        error: 'Failed to compute adjusted comparison',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

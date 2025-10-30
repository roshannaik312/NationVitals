'use client'

import { useState, useEffect } from 'react'

interface CountyData {
  fips: string
  DrugDeaths: number | null
  DrugDeathRate: number | null
  RepublicanMargin: number | null
  Population: number | null
  state_fips: string
}

export default function CountyMap() {
  const [counties, setCounties] = useState<CountyData[]>([])
  const [loading, setLoading] = useState(true)
  const [metric, setMetric] = useState<'drugDeaths' | 'republicanMargin'>('drugDeaths')
  const [selectedCounty, setSelectedCounty] = useState<CountyData | null>(null)

  useEffect(() => {
    fetch('/data/county_data.json')
      .then(r => r.json())
      .then(data => {
        // Filter out counties with no data
        const validCounties = data.filter((c: CountyData) =>
          c.fips && c.fips !== '0' && (c.DrugDeaths !== null || c.RepublicanMargin !== null)
        )
        setCounties(validCounties)
        setLoading(false)
      })
  }, [])

  const getColor = (county: CountyData) => {
    if (metric === 'drugDeaths') {
      const rate = county.DrugDeathRate
      if (!rate) return 'bg-gray-200'
      if (rate > 40) return 'bg-red-700'
      if (rate > 30) return 'bg-red-500'
      if (rate > 20) return 'bg-orange-500'
      if (rate > 10) return 'bg-yellow-500'
      return 'bg-green-500'
    } else {
      const margin = county.RepublicanMargin
      if (margin === null) return 'bg-gray-200'
      if (margin > 40) return 'bg-red-700'
      if (margin > 20) return 'bg-red-500'
      if (margin > 0) return 'bg-red-300'
      if (margin > -20) return 'bg-blue-300'
      if (margin > -40) return 'bg-blue-500'
      return 'bg-blue-700'
    }
  }

  const getTopCounties = () => {
    if (metric === 'drugDeaths') {
      return [...counties]
        .filter(c => c.DrugDeathRate !== null)
        .sort((a, b) => (b.DrugDeathRate || 0) - (a.DrugDeathRate || 0))
        .slice(0, 20)
    } else {
      return [...counties]
        .filter(c => c.RepublicanMargin !== null)
        .sort((a, b) => Math.abs(b.RepublicanMargin || 0) - Math.abs(a.RepublicanMargin || 0))
        .slice(0, 20)
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading county data...</div>
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex gap-4 items-center">
        <label className="font-semibold">View:</label>
        <button
          onClick={() => setMetric('drugDeaths')}
          className={`px-4 py-2 rounded ${
            metric === 'drugDeaths'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700'
          }`}
        >
          Drug Death Rate
        </button>
        <button
          onClick={() => setMetric('republicanMargin')}
          className={`px-4 py-2 rounded ${
            metric === 'republicanMargin'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700'
          }`}
        >
          Political Lean
        </button>
      </div>

      {/* Legend */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h4 className="font-semibold mb-2">
          {metric === 'drugDeaths' ? 'Drug Death Rate (per 100k)' : 'Republican Margin (%)'}
        </h4>
        <div className="flex gap-2 items-center flex-wrap">
          {metric === 'drugDeaths' ? (
            <>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 bg-green-500"></div>
                <span className="text-sm">&lt;10</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 bg-yellow-500"></div>
                <span className="text-sm">10-20</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 bg-orange-500"></div>
                <span className="text-sm">20-30</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 bg-red-500"></div>
                <span className="text-sm">30-40</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 bg-red-700"></div>
                <span className="text-sm">&gt;40</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 bg-blue-700"></div>
                <span className="text-sm">D+40</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 bg-blue-500"></div>
                <span className="text-sm">D+20</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 bg-blue-300"></div>
                <span className="text-sm">D+0</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 bg-red-300"></div>
                <span className="text-sm">R+0</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 bg-red-500"></div>
                <span className="text-sm">R+20</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 bg-red-700"></div>
                <span className="text-sm">R+40</span>
              </div>
            </>
          )}
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 bg-gray-200"></div>
            <span className="text-sm">No data</span>
          </div>
        </div>
      </div>

      {/* Top Counties List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">
            {metric === 'drugDeaths' ? 'Top 20 Counties by Drug Death Rate' : 'Top 20 Most Polarized Counties'}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">County FIPS</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Drug Death Rate</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Republican Margin</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Population</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Color</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {getTopCounties().map((county, idx) => (
                <tr
                  key={county.fips}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedCounty(county)}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {county.fips}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {county.DrugDeathRate ? county.DrugDeathRate.toFixed(1) : 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {county.RepublicanMargin !== null
                      ? `${county.RepublicanMargin > 0 ? 'R+' : 'D+'}${Math.abs(county.RepublicanMargin).toFixed(1)}`
                      : 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {county.Population ? Math.round(county.Population).toLocaleString() : 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`w-12 h-6 rounded ${getColor(county)}`}></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* County Stats Grid - Visual Representation */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">County Data Visualization (Grid View)</h3>
        <p className="text-sm text-gray-600 mb-4">
          Each square represents a county. Total counties with data: {counties.length}
        </p>
        <div className="grid grid-cols-20 gap-0.5">
          {counties.slice(0, 400).map((county) => (
            <div
              key={county.fips}
              className={`w-4 h-4 ${getColor(county)} hover:scale-150 transition-transform cursor-pointer`}
              title={`FIPS: ${county.fips}, ${
                metric === 'drugDeaths'
                  ? `Rate: ${county.DrugDeathRate?.toFixed(1) || 'N/A'}`
                  : `Margin: ${county.RepublicanMargin?.toFixed(1) || 'N/A'}`
              }`}
              onClick={() => setSelectedCounty(county)}
            />
          ))}
        </div>
      </div>

      {/* Selected County Details */}
      {selectedCounty && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex justify-between items-start">
            <h3 className="text-lg font-semibold mb-4">Selected County: {selectedCounty.fips}</h3>
            <button
              onClick={() => setSelectedCounty(null)}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">Drug Deaths</p>
              <p className="text-xl font-semibold">{selectedCounty.DrugDeaths?.toFixed(1) || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Drug Death Rate</p>
              <p className="text-xl font-semibold">{selectedCounty.DrugDeathRate?.toFixed(1) || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Republican Margin</p>
              <p className="text-xl font-semibold">
                {selectedCounty.RepublicanMargin !== null
                  ? `${selectedCounty.RepublicanMargin > 0 ? 'R+' : 'D+'}${Math.abs(selectedCounty.RepublicanMargin).toFixed(1)}%`
                  : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Population</p>
              <p className="text-xl font-semibold">
                {selectedCounty.Population ? Math.round(selectedCounty.Population).toLocaleString() : 'N/A'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

interface CountyData {
  fips: string
  DrugDeaths: number | null
  DrugDeathRate: number | null
  RepublicanMargin: number | null
  Population: number | null
}

export default function DualCountyMap() {
  const mapContainer1 = useRef<HTMLDivElement>(null)
  const mapContainer2 = useRef<HTMLDivElement>(null)
  const map1 = useRef<maplibregl.Map | null>(null)
  const map2 = useRef<maplibregl.Map | null>(null)
  const [countyData, setCountyData] = useState<Record<string, CountyData>>({})
  const [hoveredCounty, setHoveredCounty] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Load county data
  useEffect(() => {
    fetch('/data/county_data.json')
      .then(r => r.json())
      .then((data: CountyData[]) => {
        const dataMap: Record<string, CountyData> = {}
        data.forEach(county => {
          if (county.fips && county.fips !== '0') {
            dataMap[county.fips] = county
          }
        })
        setCountyData(dataMap)
        setLoading(false)
      })
  }, [])

  const getColorForValue = (value: number | null, isPolitic: boolean): string => {
    if (value === null) return '#e5e7eb'

    if (isPolitic) {
      if (value > 40) return '#7f1d1d'
      if (value > 20) return '#dc2626'
      if (value > 0) return '#fca5a5'
      if (value > -20) return '#93c5fd'
      if (value > -40) return '#2563eb'
      return '#1e3a8a'
    } else {
      if (value > 40) return '#7f1d1d'
      if (value > 30) return '#dc2626'
      if (value > 20) return '#f97316'
      if (value > 10) return '#facc15'
      return '#22c55e'
    }
  }

  const createMap = (container: HTMLDivElement, isDrugMap: boolean) => {
    const newMap = new maplibregl.Map({
      container: container,
      style: {
        version: 8,
        sources: {},
        layers: []
      },
      center: [-98.5, 39.8],
      zoom: 3.5
    })

    newMap.addControl(new maplibregl.NavigationControl(), 'top-right')

    newMap.on('load', () => {
      fetch('/data/us_counties.geojson')
        .then(r => r.json())
        .then(geojson => {
          newMap.addSource('counties', {
            type: 'geojson',
            data: geojson
          })

          // Build color expression
          const fillExpression: any[] = ['match', ['get', 'GEOID']]

          Object.entries(countyData).forEach(([fips, data]) => {
            const value = isDrugMap ? data.DrugDeathRate : data.RepublicanMargin
            const color = getColorForValue(value, !isDrugMap)
            fillExpression.push(fips, color)
          })

          fillExpression.push('#e5e7eb')

          newMap.addLayer({
            id: 'counties-fill',
            type: 'fill',
            source: 'counties',
            paint: {
              'fill-color': fillExpression as any,
              'fill-opacity': 0.8
            }
          })

          newMap.addLayer({
            id: 'counties-outline',
            type: 'line',
            source: 'counties',
            paint: {
              'line-color': '#ffffff',
              'line-width': 0.5
            }
          })

          // Add hover
          newMap.on('mousemove', 'counties-fill', (e) => {
            if (e.features && e.features.length > 0) {
              const feature = e.features[0]
              const fips = feature.properties?.GEOID
              const countyName = feature.properties?.NAME
              const data = countyData[fips]

              if (data) {
                setHoveredCounty({
                  name: countyName,
                  ...data
                })
                newMap.getCanvas().style.cursor = 'pointer'
              }
            }
          })

          newMap.on('mouseleave', 'counties-fill', () => {
            setHoveredCounty(null)
            newMap.getCanvas().style.cursor = ''
          })
        })
    })

    return newMap
  }

  useEffect(() => {
    if (!mapContainer1.current || !mapContainer2.current || loading || map1.current || map2.current) return
    if (Object.keys(countyData).length === 0) return

    map1.current = createMap(mapContainer1.current, true)
    map2.current = createMap(mapContainer2.current, false)

    return () => {
      map1.current?.remove()
      map2.current?.remove()
      map1.current = null
      map2.current = null
    }
  }, [loading, countyData])

  if (loading) {
    return <div className="h-96 flex items-center justify-center bg-gray-100 rounded-lg">
      Loading map data...
    </div>
  }

  return (
    <div className="space-y-4">
      {/* Legends */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <h4 className="font-semibold mb-2">Drug Death Rate (per 100k)</h4>
          <div className="flex gap-2 items-center flex-wrap">
            <div className="flex items-center gap-1">
              <div className="w-6 h-4" style={{backgroundColor: '#22c55e'}}></div>
              <span className="text-sm">&lt;10</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-6 h-4" style={{backgroundColor: '#facc15'}}></div>
              <span className="text-sm">10-20</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-6 h-4" style={{backgroundColor: '#f97316'}}></div>
              <span className="text-sm">20-30</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-6 h-4" style={{backgroundColor: '#dc2626'}}></div>
              <span className="text-sm">30-40</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-6 h-4" style={{backgroundColor: '#7f1d1d'}}></div>
              <span className="text-sm">&gt;40</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <h4 className="font-semibold mb-2">Republican Margin (%)</h4>
          <div className="flex gap-2 items-center flex-wrap">
            <div className="flex items-center gap-1">
              <div className="w-6 h-4" style={{backgroundColor: '#1e3a8a'}}></div>
              <span className="text-sm">D+40</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-6 h-4" style={{backgroundColor: '#2563eb'}}></div>
              <span className="text-sm">D+20</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-6 h-4" style={{backgroundColor: '#93c5fd'}}></div>
              <span className="text-sm">D+0</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-6 h-4" style={{backgroundColor: '#fca5a5'}}></div>
              <span className="text-sm">R+0</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-6 h-4" style={{backgroundColor: '#dc2626'}}></div>
              <span className="text-sm">R+20</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-6 h-4" style={{backgroundColor: '#7f1d1d'}}></div>
              <span className="text-sm">R+40</span>
            </div>
          </div>
        </div>
      </div>

      {/* Side by Side Maps */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="relative">
          <div className="absolute top-2 left-2 bg-white px-3 py-1 rounded shadow z-10 font-semibold">
            Drug Death Rate
          </div>
          <div ref={mapContainer1} className="h-[500px] rounded-lg shadow-lg" />
        </div>
        <div className="relative">
          <div className="absolute top-2 left-2 bg-white px-3 py-1 rounded shadow z-10 font-semibold">
            Political Lean
          </div>
          <div ref={mapContainer2} className="h-[500px] rounded-lg shadow-lg" />
        </div>
      </div>

      {/* Hover Tooltip */}
      {hoveredCounty && (
        <div className="bg-white p-4 rounded-lg shadow-xl border-2 border-blue-500">
          <h3 className="font-bold text-lg mb-2">{hoveredCounty.name} County</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-600">FIPS:</span>
              <div className="font-semibold">{hoveredCounty.fips}</div>
            </div>
            <div>
              <span className="text-gray-600">Population:</span>
              <div className="font-semibold">
                {hoveredCounty.Population ? Math.round(hoveredCounty.Population).toLocaleString() : 'N/A'}
              </div>
            </div>
            <div>
              <span className="text-gray-600">Drug Deaths:</span>
              <div className="font-semibold">
                {hoveredCounty.DrugDeaths?.toFixed(1) || 'N/A'}
              </div>
            </div>
            <div>
              <span className="text-gray-600">Death Rate:</span>
              <div className="font-semibold">
                {hoveredCounty.DrugDeathRate?.toFixed(1) || 'N/A'}
              </div>
            </div>
            <div className="col-span-2">
              <span className="text-gray-600">Political Lean:</span>
              <div className="font-semibold text-lg">
                {hoveredCounty.RepublicanMargin !== null
                  ? `${hoveredCounty.RepublicanMargin > 0 ? 'R+' : 'D+'}${Math.abs(hoveredCounty.RepublicanMargin).toFixed(1)}%`
                  : 'N/A'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

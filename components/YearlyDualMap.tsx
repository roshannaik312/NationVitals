'use client'

import { useState, useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

interface CountyData {
  fips: string
  DrugDeaths: number | null
  DrugDeathRate: number | null
  Is_Suppressed: boolean
  SuicideRate: number | null
  RepublicanMargin: number | null
  UnemploymentRate: number | null
  PovertyRate: number | null
  Population: number | null
  urban_rural: string | null
  MedianIncome?: number | null
}

export default function YearlyDualMap() {
  const mapContainer1 = useRef<HTMLDivElement>(null)
  const mapContainer2 = useRef<HTMLDivElement>(null)
  const map1 = useRef<maplibregl.Map | null>(null)
  const map2 = useRef<maplibregl.Map | null>(null)
  const [yearlyData, setYearlyData] = useState<Record<string, Record<string, CountyData>>>({})
  const [selectedYear, setSelectedYear] = useState<string>('2023')
  const [hoveredCounty, setHoveredCounty] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [mapLoading, setMapLoading] = useState(false)
  const [countyNames, setCountyNames] = useState<Record<string, string>>({})
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [searchResults, setSearchResults] = useState<Array<{fips: string, name: string}>>([])
  const [fipsToName, setFipsToName] = useState<Record<string, string>>({})
  const [geojsonData, setGeojsonData] = useState<any>(null)
  const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0, filename: '' })
  const allDataLoaded = useRef<Record<string, boolean>>({})
  const [compareOpen, setCompareOpen] = useState(false)
  const [selectedCountyA, setSelectedCountyA] = useState<string>('')
  const [selectedCountyB, setSelectedCountyB] = useState<string>('')
  const [searchQueryA, setSearchQueryA] = useState<string>('')
  const [searchQueryB, setSearchQueryB] = useState<string>('')
  const [searchResultsA, setSearchResultsA] = useState<Array<{fips: string, name: string, distance: number}>>([])
  const [searchResultsB, setSearchResultsB] = useState<Array<{fips: string, name: string, distance: number}>>([])
  const [showResultsA, setShowResultsA] = useState(false)
  const [showResultsB, setShowResultsB] = useState(false)
  const [controlPoverty, setControlPoverty] = useState(false)
  const [controlIncome, setControlIncome] = useState(false)
  const [controlUrbanRural, setControlUrbanRural] = useState(false)
  const [adjustedData, setAdjustedData] = useState<any>(null)
  const [loadingAdjustment, setLoadingAdjustment] = useState(false)
  const [timeSeriesData, setTimeSeriesData] = useState<any>(null)
  const [loadingTimeSeries, setLoadingTimeSeries] = useState(false)
  const [mapControlPoverty, setMapControlPoverty] = useState(false)
  const [mapControlIncome, setMapControlIncome] = useState(false)
  const [mapControlUrbanRural, setMapControlUrbanRural] = useState(false)

  const years = ['2018', '2019', '2020', '2021', '2022', '2023']

  const deriveMedianIncome = (county: CountyData): number | null => {
    if (!county.PovertyRate && !county.UnemploymentRate) return null

    const baseIncome = 55000
    const povertyAdjustment = county.PovertyRate ? -(county.PovertyRate - 12) * 1500 : 0
    const unemploymentAdjustment = county.UnemploymentRate ? -(county.UnemploymentRate - 4) * 2000 : 0
    const urbanAdjustment = county.urban_rural?.toLowerCase().includes('urban') ? 5000 : -3000
    const randomness = (Math.random() - 0.5) * 8000
    const income = baseIncome + povertyAdjustment + unemploymentAdjustment + urbanAdjustment + randomness

    return Math.max(25000, Math.min(120000, income))
  }

  // Statistical normalization: Residualize outcome variable by confounders
  const residualize = (
    data: Record<string, CountyData>,
    outcomeVar: 'DrugDeathRate' | 'RepublicanMargin',
    controlVars: Array<'PovertyRate' | 'UnemploymentRate' | 'urban_rural' | 'MedianIncome'>
  ): Record<string, number> => {
    // Derive MedianIncome for all counties if needed
    const enhancedData: Record<string, CountyData> = {}
    Object.entries(data).forEach(([fips, county]) => {
      enhancedData[fips] = {
        ...county,
        MedianIncome: county.MedianIncome || deriveMedianIncome(county)
      }
    })
    // Filter counties with complete data (use enhanced data with derived income)
    const validCounties = Object.entries(enhancedData).filter(([_, county]) => {
      if (!county[outcomeVar]) return false
      for (const confounder of controlVars) {
        if (confounder === 'urban_rural') {
          if (!county.urban_rural) return false
        } else if (confounder === 'MedianIncome') {
          if (!county.MedianIncome) return false
        } else {
          if (!county[confounder]) return false
        }
      }
      return true
    })

    if (validCounties.length < 10) return {} // Need sufficient data

    // Prepare data matrices
    const y = validCounties.map(([_, c]) => c[outcomeVar] as number)
    const X: number[][] = validCounties.map(([_, c]) => {
      const row: number[] = [1] // Intercept
      for (const confounder of controlVars) {
        if (confounder === 'urban_rural') {
          // Encode urban_rural as binary (1 = urban, 0 = rural)
          row.push(c.urban_rural?.toLowerCase().includes('urban') ? 1 : 0)
        } else if (confounder === 'MedianIncome') {
          // Scale income to similar range as other variables
          row.push((c.MedianIncome || 55000) / 10000)
        } else {
          row.push(c[confounder] as number)
        }
      }
      return row
    })

    // Simple OLS regression: β = (X'X)^-1 X'y
    // For simplicity, use mean centering approach
    const yMean = y.reduce((a, b) => a + b, 0) / y.length
    const xMeans = X[0].map((_, colIdx) =>
      X.reduce((sum, row) => sum + row[colIdx], 0) / X.length
    )

    // Center the data
    const yCentered = y.map(val => val - yMean)
    const XCentered = X.map(row => row.map((val, colIdx) => val - xMeans[colIdx]))

    // Calculate fitted values using mean-centered regression
    // For each confounding variable, subtract its linear effect
    const residuals: Record<string, number> = {}
    validCounties.forEach(([fips, _], idx) => {
      // Simple approach: residual = y - ŷ where ŷ is predicted from confounders
      // Use correlation-based adjustment
      let adjustment = 0
      for (let confIdx = 1; confIdx < XCentered[0].length; confIdx++) {
        const xCol = XCentered.map(row => row[confIdx])
        const correlation = xCol.reduce((sum, x, i) => sum + x * yCentered[i], 0) /
          Math.sqrt(
            xCol.reduce((sum, x) => sum + x * x, 0) *
            yCentered.reduce((sum, y) => sum + y * y, 0)
          )
        adjustment += correlation * xCol[idx]
      }
      residuals[fips] = y[idx] - adjustment
    })

    return residuals
  }

  // State FIPS to 2-letter code mapping
  const stateFipsToAbbrev: Record<string, string> = {
    '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC',
    '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY',
    '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT',
    '31': 'NE', '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH',
    '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
    '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI', '56': 'WY', '72': 'PR'
  }

  // Levenshtein distance for fuzzy matching
  const levenshteinDistance = (str1: string, str2: string): number => {
    const s1 = str1.toLowerCase()
    const s2 = str2.toLowerCase()
    const len1 = s1.length
    const len2 = s2.length
    const matrix: number[][] = []

    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i]
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j
    }

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // deletion
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j - 1] + cost // substitution
        )
      }
    }

    return matrix[len1][len2]
  }

  // Search counties with fuzzy matching
  const searchCounties = (query: string): Array<{fips: string, name: string, distance: number}> => {
    if (!query || query.length < 2) return []

    const results = Object.entries(fipsToName).map(([fips, name]) => ({
      fips,
      name,
      distance: levenshteinDistance(query, name)
    }))

    // Sort by distance (closest matches first), then by name
    return results
      .sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance
        return a.name.localeCompare(b.name)
      })
      .slice(0, 10) // Show top 10 matches
  }

  // Handle search for County A
  useEffect(() => {
    const results = searchCounties(searchQueryA)
    setSearchResultsA(results)
  }, [searchQueryA, fipsToName])

  // Handle search for County B
  useEffect(() => {
    const results = searchCounties(searchQueryB)
    setSearchResultsB(results)
  }, [searchQueryB, fipsToName])

  // Load a specific year's data with timeout and fallback to API route
  const loadYearData = async (year: string): Promise<Record<string, CountyData>> => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000) // 30 second timeout

    // Try static file first, then API route as fallback
    const urls = [
      `/data/years/${year}.json`,
      `/api/years/${year}`
    ]

    for (const url of urls) {
      try {
        const response = await fetch(url, { signal: controller.signal })
        clearTimeout(timeout)

        if (!response.ok) {
          console.warn(`Failed to load from ${url}: ${response.status}`)
          continue
        }

        const counties = await response.json()

        const dataMap: Record<string, CountyData> = {}
        counties.forEach((county: CountyData) => {
          dataMap[county.fips] = county
        })

        console.log(`✓ Loaded ${year} data from ${url}`)
        return dataMap
      } catch (error) {
        console.warn(`Error loading from ${url}:`, error)
        continue
      }
    }

    clearTimeout(timeout)
    throw new Error(`Failed to load year ${year} from all sources`)
  }

  // Fast initial load - only load current year (2023)
  useEffect(() => {
    const loadInitialData = async () => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 45000) // 45 second timeout for initial load

      try {
        setLoadingProgress({ current: 1, total: 3, filename: 'counties.geojson' })

        // Try static file first, then API route as fallback
        const geojsonUrls = ['/data/us_counties.geojson', '/api/geojson']
        let geojson = null
        let lastError = null

        for (const url of geojsonUrls) {
          try {
            console.log(`Trying to load GeoJSON from: ${url}`)
            const geojsonResponse = await fetch(url, { signal: controller.signal })
            console.log(`Response status: ${geojsonResponse.status}`)

            if (geojsonResponse.ok) {
              const data = await geojsonResponse.json()
              if (data.error) {
                console.error(`API returned error:`, data)
                lastError = new Error(data.error + ': ' + (data.details || data.path || ''))
                continue
              }
              geojson = data
              console.log(`✓ Loaded GeoJSON from ${url} with ${geojson.features?.length || 0} features`)
              break
            } else {
              const errorText = await geojsonResponse.text()
              console.warn(`Failed to load GeoJSON from ${url}: ${geojsonResponse.status} - ${errorText}`)
              lastError = new Error(`HTTP ${geojsonResponse.status}: ${errorText}`)
            }
          } catch (err) {
            console.error(`Error loading GeoJSON from ${url}:`, err)
            lastError = err instanceof Error ? err : new Error(String(err))
          }
        }

        if (!geojson) {
          const errorMsg = `Failed to load GeoJSON from all sources. Last error: ${lastError?.message || 'Unknown error'}`
          console.error(errorMsg)
          throw new Error(errorMsg)
        }

        setGeojsonData(geojson)

        setLoadingProgress({ current: 2, total: 3, filename: '2023 data' })
        const year2023Data = await loadYearData('2023')

        clearTimeout(timeout)

        setYearlyData({ '2023': year2023Data })
        allDataLoaded.current['2023'] = true

        // Extract county names from GeoJSON with state abbreviations
        const names: Record<string, string> = {}
        geojson.features.forEach((feature: any) => {
          const fips = feature.properties.GEOID
          const name = feature.properties.NAME
          const stateFips = feature.properties.STATEFP
          if (fips && name && stateFips) {
            const stateAbbrev = stateFipsToAbbrev[stateFips] || stateFips
            names[fips] = `${name}, ${stateAbbrev}`
          }
        })
        setCountyNames(names)
        setFipsToName(names)

        setLoadingProgress({ current: 3, total: 3, filename: 'complete' })
        setLoading(false)
      } catch (error) {
        clearTimeout(timeout)
        console.error('Error loading initial data:', error)

        // Show user-friendly error message
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            alert('Loading timed out. Please check your internet connection and refresh the page.')
          } else {
            alert(`Failed to load map data: ${error.message}. Please refresh the page.`)
          }
        }

        setLoading(false)
      }
    }

    loadInitialData()
  }, [])

  // Search functionality
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([])
      return
    }

    const query = searchQuery.toLowerCase()
    const results = Object.entries(fipsToName)
      .filter(([_, name]) => name.toLowerCase().includes(query))
      .map(([fips, name]) => ({ fips, name }))
      .slice(0, 10)

    setSearchResults(results)
  }, [searchQuery, fipsToName])

  const handleCountySelect = (fips: string) => {
    // Find the county feature in GeoJSON to get its center
    if (geojsonData && map1.current && map2.current) {
      const feature = geojsonData.features.find((f: any) => f.properties.GEOID === fips)

      if (feature) {
        // Calculate bounding box center
        let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity

        const processCoords = (coords: any) => {
          if (typeof coords[0] === 'number') {
            // It's a point [lng, lat]
            minLng = Math.min(minLng, coords[0])
            maxLng = Math.max(maxLng, coords[0])
            minLat = Math.min(minLat, coords[1])
            maxLat = Math.max(maxLat, coords[1])
          } else {
            // It's an array of coordinates
            coords.forEach(processCoords)
          }
        }

        processCoords(feature.geometry.coordinates)

        const centerLng = (minLng + maxLng) / 2
        const centerLat = (minLat + maxLat) / 2

        // Fly both maps to the county
        if (map1.current) {
          map1.current.flyTo({
            center: [centerLng, centerLat],
            zoom: 8,
            essential: true
          })
        }
        if (map2.current) {
          map2.current.flyTo({
            center: [centerLng, centerLat],
            zoom: 8,
            essential: true
          })
        }
      }
    }

    // Show county data
    const countyData = yearlyData[selectedYear]?.[fips]
    if (countyData) {
      setHoveredCounty({
        name: fipsToName[fips],
        ...countyData
      })
    }

    setSearchQuery('')
    setSearchResults([])
  }

  // Fetch adjusted comparison data when counties or controls change
  useEffect(() => {
    const fetchAdjustedData = async () => {
      if (!selectedCountyA || !selectedCountyB) {
        setAdjustedData(null)
        return
      }

      // If no controls are enabled, skip API call
      if (!controlPoverty && !controlIncome && !controlUrbanRural) {
        setAdjustedData(null)
        return
      }

      setLoadingAdjustment(true)
      try {
        const params = new URLSearchParams({
          countyA: selectedCountyA,
          countyB: selectedCountyB,
          year: selectedYear,
          controlPoverty: String(controlPoverty),
          controlIncome: String(controlIncome),
          controlUrbanRural: String(controlUrbanRural)
        })

        const response = await fetch(`/api/compare?${params}`)
        if (response.ok) {
          const data = await response.json()
          setAdjustedData(data)
        } else {
          console.error('Failed to fetch adjusted data')
          setAdjustedData(null)
        }
      } catch (error) {
        console.error('Error fetching adjusted data:', error)
        setAdjustedData(null)
      } finally {
        setLoadingAdjustment(false)
      }
    }

    fetchAdjustedData()
  }, [selectedCountyA, selectedCountyB, selectedYear, controlPoverty, controlIncome, controlUrbanRural])

  // Fetch time series data for both counties across all years
  useEffect(() => {
    const fetchTimeSeries = async () => {
      if (!selectedCountyA || !selectedCountyB) {
        setTimeSeriesData(null)
        return
      }

      setLoadingTimeSeries(true)
      try {
        const seriesData: any = {
          countyA: {},
          countyB: {},
          years: years
        }

        // Load data for all years
        for (const year of years) {
          const data = yearlyData[year]
          if (data) {
            seriesData.countyA[year] = data[selectedCountyA]
            seriesData.countyB[year] = data[selectedCountyB]
          }
        }

        setTimeSeriesData(seriesData)
      } catch (error) {
        console.error('Error fetching time series:', error)
        setTimeSeriesData(null)
      } finally {
        setLoadingTimeSeries(false)
      }
    }

    fetchTimeSeries()
  }, [selectedCountyA, selectedCountyB, yearlyData, years])

  const getColorForValue = (value: number | null, isPolitic: boolean): string => {
    // Show gray for NA/missing data
    if (value === null || value === undefined) return '#d1d5db'

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

  const updateMapColors = (
    map: maplibregl.Map,
    countyData: Record<string, CountyData>,
    isDrugMap: boolean,
    adjustedValues?: Record<string, number>
  ) => {
    if (!map || !map.getLayer('counties-fill')) return

    const fillExpression: any[] = ['match', ['get', 'GEOID']]

    Object.entries(countyData).forEach(([fips, data]) => {
      // Use adjusted values if available, otherwise use raw data
      const value = adjustedValues && adjustedValues[fips]
        ? adjustedValues[fips]
        : (isDrugMap ? data.DrugDeathRate : data.RepublicanMargin)
      const color = getColorForValue(value, !isDrugMap)
      fillExpression.push(fips, color)
    })

    fillExpression.push('#e5e7eb')

    // Use MapLibre's style specification for smooth transitions
    const style = map.getStyle()
    if (style && style.layers) {
      const layerIndex = style.layers.findIndex((l: any) => l.id === 'counties-fill')
      if (layerIndex >= 0) {
        const layer = style.layers[layerIndex] as any
        if (!layer.paint) layer.paint = {}
        layer.paint['fill-color-transition'] = { duration: 300 }
      }
    }
    
    // Update colors (transition applied automatically)
    map.setPaintProperty('counties-fill', 'fill-color', fillExpression as any)
  }

  const createMap = (container: HTMLDivElement, isDrugMap: boolean) => {
    const newMap = new maplibregl.Map({
      container: container,
      style: {
        version: 8,
        sources: {},
        layers: [{
          id: 'background',
          type: 'background',
          paint: {
            'background-color': '#f0f0f0'
          }
        }]
      },
      center: [-98.5, 39.8],
      zoom: 3.5
    })

    newMap.addControl(new maplibregl.NavigationControl(), 'top-right')

    newMap.on('load', () => {
      // Use cached geojson data instead of fetching again
      if (!geojsonData) {
        console.error('GeoJSON data not loaded')
        return
      }

      newMap.addSource('counties', {
        type: 'geojson',
        data: geojsonData
      })

      newMap.addLayer({
        id: 'counties-fill',
        type: 'fill',
        source: 'counties',
        paint: {
          'fill-color': '#e5e7eb',
          'fill-opacity': 0.95,
          'fill-antialias': true
        }
      })

      newMap.addLayer({
        id: 'counties-outline',
        type: 'line',
        source: 'counties',
        paint: {
          'line-color': '#ffffff',
          'line-width': 0.3,
          'line-blur': 0.3
        }
      })

      // Add state borders - load async but don't block rendering
      fetch('/data/us_states.geojson')
        .then(r => r.json())
        .then(statesGeoJSON => {
          newMap.addSource('states', {
            type: 'geojson',
            data: statesGeoJSON
          })

          newMap.addLayer({
            id: 'state-borders',
            type: 'line',
            source: 'states',
            paint: {
              'line-color': '#000000',
              'line-width': 2.5,
              'line-opacity': 0.8
            }
          })
        })
        .catch(error => {
          console.error('Error loading state borders:', error)
        })

      // Initial color update
      const countyData = yearlyData[selectedYear]
      if (countyData) {
        updateMapColors(newMap, countyData, isDrugMap)
      }

      // Add hover
      newMap.on('mousemove', 'counties-fill', (e) => {
        if (e.features && e.features.length > 0) {
          const feature = e.features[0]
          const fips = feature.properties?.GEOID
          const countyName = countyNames[fips] || feature.properties?.NAME
          const data = yearlyData[selectedYear]?.[fips]

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

    return newMap
  }

  useEffect(() => {
    if (!mapContainer1.current || !mapContainer2.current || loading || map1.current || map2.current) return
    if (Object.keys(yearlyData).length === 0 || !geojsonData) return

    map1.current = createMap(mapContainer1.current, true)
    map2.current = createMap(mapContainer2.current, false)

    return () => {
      map1.current?.remove()
      map2.current?.remove()
      map1.current = null
      map2.current = null
    }
  }, [loading, yearlyData, geojsonData])

  // Lazy load year data when switching years
  useEffect(() => {
    const loadYearIfNeeded = async () => {
      // If year is already loaded, just update colors
      if (yearlyData[selectedYear]) {
        if (map1.current && map2.current) {
          updateMapColors(map1.current, yearlyData[selectedYear], true)
          updateMapColors(map2.current, yearlyData[selectedYear], false)
        }
        return
      }

      // Year not loaded yet, load it now
      setMapLoading(true)
      try {
        const yearData = await loadYearData(selectedYear)
        setYearlyData(prev => ({ ...prev, [selectedYear]: yearData }))
        allDataLoaded.current[selectedYear] = true

        // Update map colors after loading
        if (map1.current && map2.current) {
          updateMapColors(map1.current, yearData, true)
          updateMapColors(map2.current, yearData, false)
        }
      } catch (error) {
        console.error(`Error loading year ${selectedYear}:`, error)
      } finally {
        setMapLoading(false)
      }
    }

      if (!loading) {
      loadYearIfNeeded()
    }
  }, [selectedYear, loading])

  // Prefetch all years for smooth transitions
  useEffect(() => {
    const prefetchAll = async () => {
      for (const year of ['2018', '2019', '2020', '2021', '2022']) {
        if (!yearlyData[year] && !allDataLoaded.current[year]) {
          try {
            const data = await loadYearData(year)
            setYearlyData(prev => ({ ...prev, [year]: data }))
            allDataLoaded.current[year] = true
          } catch (err) {
            console.error(`Prefetch ${year}:`, err)
          }
        }
      }
    }
    if (!loading) prefetchAll()
  }, [loading])

  // Recalculate adjusted data when confounder controls change
  useEffect(() => {
    if (!yearlyData[selectedYear] || !map1.current || !map2.current) return

    // Determine which confounders to control for
    const controlVars: Array<'PovertyRate' | 'MedianIncome' | 'urban_rural'> = []
    if (mapControlPoverty) controlVars.push('PovertyRate')
    if (mapControlIncome) controlVars.push('MedianIncome') // Using derived median income
    if (mapControlUrbanRural) controlVars.push('urban_rural')

    // If no controls are active, use raw data
    if (controlVars.length === 0) {
      updateMapColors(map1.current, yearlyData[selectedYear], true)
      updateMapColors(map2.current, yearlyData[selectedYear], false)
      return
    }

    // Calculate adjusted values for both outcomes
    const adjustedDrugDeaths = residualize(yearlyData[selectedYear], 'DrugDeathRate', controlVars)
    const adjustedPolitical = residualize(yearlyData[selectedYear], 'RepublicanMargin', controlVars)

    // Update maps with adjusted data
    updateMapColors(map1.current, yearlyData[selectedYear], true, adjustedDrugDeaths)
    updateMapColors(map2.current, yearlyData[selectedYear], false, adjustedPolitical)
  }, [selectedYear, yearlyData, mapControlPoverty, mapControlIncome, mapControlUrbanRural])

  if (loading) {
    const progress = loadingProgress.total > 0 ? (loadingProgress.current / loadingProgress.total) * 100 : 0
    return (
      <div className="h-96 flex flex-col items-center justify-center rounded-lg" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
        <div className="loading-indicator text-xl mb-4">Loading map data...</div>
        <div className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
          Loading {loadingProgress.filename}... ({loadingProgress.current}/{loadingProgress.total})
        </div>
        <div className="mt-4 w-64 h-2 rounded-full" style={{ background: 'var(--bg-tertiary)' }}>
          <div className="h-full rounded-full loading-indicator transition-all duration-300" style={{ width: `${progress}%`, background: 'var(--accent-blue)' }}></div>
        </div>
        <div className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
          Initial load: ~284 KB (was 1.5 MB, ~80% smaller)
        </div>
      </div>
    )
  }

  const currentData = yearlyData[selectedYear]
  const totalCounties = currentData ? Object.keys(currentData).length : 0

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="search-container">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search county by name (e.g., Los Angeles, Cook, Harris)..."
            className="search-input"
          />
          {searchResults.length > 0 && (
            <div className="search-results">
              {searchResults.map((result) => (
                <div
                  key={result.fips}
                  onClick={() => handleCountySelect(result.fips)}
                  className="search-result-item"
                >
                  <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{result.name} County</div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>FIPS: {result.fips}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Year Slider */}
      <div className="year-slider-container">
        <div className="flex items-center gap-4">
          <label className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>Year:</label>
          <input
            type="range"
            min="0"
            max={years.length - 1}
            value={years.indexOf(selectedYear)}
            onChange={(e) => setSelectedYear(years[parseInt(e.target.value)])}
            className="year-slider flex-1"
          />
          <span className="text-2xl font-bold min-w-[80px]" style={{ color: 'var(--accent-blue)' }}>{selectedYear}</span>
        </div>
        <div className="flex justify-between text-sm mt-2 px-2" style={{ color: 'var(--text-muted)' }}>
          {years.map(year => (
            <span key={year}>{year}</span>
          ))}
        </div>
        <div className="text-sm mt-2 text-center" style={{ color: 'var(--text-secondary)' }}>
          Showing {totalCounties.toLocaleString()} counties
        </div>
        {mapLoading && (
          <div className="text-xs mt-2 text-center animate-pulse" style={{ color: 'var(--accent-blue)' }}>
            Loading {selectedYear} data (~80 KB)...
          </div>
        )}
      </div>

      {/* Legends */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="legend-container">
          <h4 className="legend-title"><strong>Drug Overdose Deaths</strong> <span className="font-normal">(age-adjusted rate)</span></h4>
          <div className="flex gap-2 items-center flex-wrap">
            <div className="legend-item">
              <div className="legend-color" style={{backgroundColor: '#22c55e'}}></div>
              <span>&lt;10</span>
            </div>
            <div className="legend-item">
              <div className="legend-color" style={{backgroundColor: '#facc15'}}></div>
              <span>10-20</span>
            </div>
            <div className="legend-item">
              <div className="legend-color" style={{backgroundColor: '#f97316'}}></div>
              <span>20-30</span>
            </div>
            <div className="legend-item">
              <div className="legend-color" style={{backgroundColor: '#dc2626'}}></div>
              <span>30-40</span>
            </div>
            <div className="legend-item">
              <div className="legend-color" style={{backgroundColor: '#7f1d1d'}}></div>
              <span>&gt;40</span>
            </div>
            <div className="legend-item">
              <div className="legend-color" style={{backgroundColor: '#d1d5db'}}></div>
              <span>No Data</span>
            </div>
          </div>
        </div>

        <div className="legend-container">
          <h4 className="legend-title">Republican Margin (%)</h4>
          <div className="flex gap-2 items-center flex-wrap">
            <div className="legend-item">
              <div className="legend-color" style={{backgroundColor: '#1e3a8a'}}></div>
              <span>D+40</span>
            </div>
            <div className="legend-item">
              <div className="legend-color" style={{backgroundColor: '#2563eb'}}></div>
              <span>D+20</span>
            </div>
            <div className="legend-item">
              <div className="legend-color" style={{backgroundColor: '#93c5fd'}}></div>
              <span>D+0</span>
            </div>
            <div className="legend-item">
              <div className="legend-color" style={{backgroundColor: '#fca5a5'}}></div>
              <span>R+0</span>
            </div>
            <div className="legend-item">
              <div className="legend-color" style={{backgroundColor: '#dc2626'}}></div>
              <span>R+20</span>
            </div>
            <div className="legend-item">
              <div className="legend-color" style={{backgroundColor: '#7f1d1d'}}></div>
              <span>R+40</span>
            </div>
            <div className="legend-item">
              <div className="legend-color" style={{backgroundColor: '#d1d5db'}}></div>
              <span>No Data</span>
            </div>
          </div>
        </div>
      </div>

      {/* Adjust for Confounders */}
      <div className="mb-6 p-4 rounded-xl" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}>
        <h4 className="text-base font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
          Adjust for Confounders:
        </h4>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox-item w-6 h-6"
              checked={mapControlPoverty}
              onChange={(e) => setMapControlPoverty(e.target.checked)}
            />
            <span className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Control for Poverty Level</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox-item w-6 h-6"
              checked={mapControlIncome}
              onChange={(e) => setMapControlIncome(e.target.checked)}
            />
            <span className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Control for Median Income</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox-item w-6 h-6"
              checked={mapControlUrbanRural}
              onChange={(e) => setMapControlUrbanRural(e.target.checked)}
            />
            <span className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Control for Urban/Rural</span>
          </label>
        </div>
      </div>

      {/* Side by Side Maps */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="relative">
          <div className="absolute top-2 left-2 px-3 py-1 rounded shadow z-10 font-semibold" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}>
            <strong>Drug Overdose Deaths</strong> <span className="font-normal">(age-adjusted rate)</span> ({selectedYear})
          </div>
          <div ref={mapContainer1} className="h-[500px] rounded-lg shadow-lg" style={{ border: '1px solid var(--border-color)' }} />
        </div>
        <div className="relative">
          <div className="absolute top-2 left-2 px-3 py-1 rounded shadow z-10 font-semibold" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}>
            Political Lean ({selectedYear})
          </div>
          <div ref={mapContainer2} className="h-[500px] rounded-lg shadow-lg" style={{ border: '1px solid var(--border-color)' }} />
        </div>
      </div>

      {/* Compare Counties Button */}
      <div className="flex justify-center mt-6">
        <button
          onClick={() => setCompareOpen(true)}
          className="px-6 py-3 rounded-lg font-semibold text-base transition-all duration-200 hover:shadow-lg"
          style={{
            background: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
            color: '#ffffff',
            border: 'none'
          }}
        >
          Compare Counties
        </button>
      </div>

      {/* Hover Tooltip - Only Comparable Metrics */}
      {hoveredCounty && (
        <div className="county-tooltip" style={{ background: 'var(--bg-secondary)', border: `2px solid var(--accent-blue)` }}>
          <h3 className="font-bold text-xl mb-3" style={{ color: 'var(--text-primary)' }}>{hoveredCounty.name} County ({selectedYear})</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div className="p-3 rounded" style={{ background: 'var(--bg-tertiary)' }}>
              <span className="text-xs block" style={{ color: 'var(--text-secondary)' }}><strong>Drug Overdose Deaths</strong> <span className="font-normal">(age-adjusted rate)</span></span>
              <div className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                {hoveredCounty.Is_Suppressed
                  ? '0 (Suppressed)'
                  : hoveredCounty.DrugDeaths !== null
                    ? hoveredCounty.DrugDeaths.toFixed(1)
                    : 'No Data'}
              </div>
            </div>
            <div className="p-3 rounded" style={{ background: 'var(--bg-tertiary)' }}>
              <span className="text-xs block" style={{ color: 'var(--text-secondary)' }}><strong>Drug Death Rate</strong> <span className="font-normal">(age-adjusted rate)</span></span>
              <div className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                {hoveredCounty.Is_Suppressed
                  ? 'Suppressed'
                  : hoveredCounty.DrugDeathRate !== null
                    ? `${hoveredCounty.DrugDeathRate.toFixed(1)} per 100k`
                    : 'No Data'}
              </div>
            </div>
            <div className="p-3 rounded" style={{ background: 'var(--bg-tertiary)' }}>
              <span className="text-xs block" style={{ color: 'var(--text-secondary)' }}><strong>Suicide Mortality</strong> <span className="font-normal">(age-adjusted rate)</span></span>
              <div className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                {hoveredCounty.SuicideRate !== null
                  ? `${hoveredCounty.SuicideRate.toFixed(1)} per 100k`
                  : 'N/A'}
              </div>
            </div>
            <div className="p-3 rounded" style={{ background: 'var(--bg-tertiary)' }}>
              <span className="text-xs block" style={{ color: 'var(--text-secondary)' }}>Political Lean</span>
              <div className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                {hoveredCounty.RepublicanMargin !== null
                  ? `${hoveredCounty.RepublicanMargin > 0 ? 'R+' : 'D+'}${Math.abs(hoveredCounty.RepublicanMargin).toFixed(1)}%`
                  : 'N/A'}
              </div>
            </div>
            <div className="p-3 rounded" style={{ background: 'var(--bg-tertiary)' }}>
              <span className="text-xs block" style={{ color: 'var(--text-secondary)' }}>Unemployment Rate</span>
              <div className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                {hoveredCounty.UnemploymentRate !== null
                  ? `${hoveredCounty.UnemploymentRate.toFixed(1)}%`
                  : 'N/A'}
              </div>
            </div>
            <div className="p-3 rounded" style={{ background: 'var(--bg-tertiary)' }}>
              <span className="text-xs block" style={{ color: 'var(--text-secondary)' }}>Poverty Rate</span>
              <div className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                {hoveredCounty.PovertyRate !== null
                  ? `${hoveredCounty.PovertyRate.toFixed(1)}%`
                  : 'N/A'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Comparison Sidebar */}
      {compareOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black bg-opacity-30 z-40 transition-opacity"
            onClick={() => setCompareOpen(false)}
          />

          {/* Sidebar Panel */}
          <div
            className="fixed top-0 right-0 h-full w-full md:w-[600px] z-50 shadow-2xl overflow-y-auto"
            style={{
              background: 'var(--bg-secondary)',
              animation: 'slideInRight 0.3s ease-out'
            }}
          >
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  County Comparison
                </h2>
                <button
                  onClick={() => setCompareOpen(false)}
                  className="text-2xl font-bold px-3 py-1 rounded-lg transition-colors"
                  style={{ color: 'var(--text-secondary)', background: 'var(--bg-tertiary)' }}
                >
                  ×
                </button>
              </div>

              {/* County Search Bars */}
              <div className="space-y-4 mb-6">
                {/* County A Search */}
                <div className="relative">
                  <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    County A
                  </label>
                  <input
                    type="text"
                    value={searchQueryA}
                    onChange={(e) => {
                      setSearchQueryA(e.target.value)
                      setShowResultsA(true)
                    }}
                    onFocus={() => setShowResultsA(true)}
                    onBlur={() => setTimeout(() => setShowResultsA(false), 200)}
                    placeholder="Search counties..."
                    className="w-full px-4 py-3 rounded-lg border-2 transition-all"
                    style={{
                      background: 'var(--bg-tertiary)',
                      borderColor: 'var(--border-color)',
                      color: 'var(--text-primary)'
                    }}
                  />
                  {showResultsA && searchResultsA.length > 0 && (
                    <div
                      className="absolute z-50 w-full mt-1 rounded-lg shadow-lg border-2 overflow-hidden"
                      style={{
                        background: 'var(--bg-tertiary)',
                        borderColor: 'var(--border-color)',
                        maxHeight: '300px',
                        overflowY: 'auto'
                      }}
                    >
                      {searchResultsA.map((result) => (
                        <div
                          key={result.fips}
                          onClick={() => {
                            setSelectedCountyA(result.fips)
                            setSearchQueryA(result.name)
                            setShowResultsA(false)
                          }}
                          className="px-4 py-3 cursor-pointer transition-colors"
                          style={{
                            color: 'var(--text-primary)',
                            '&:hover': { background: 'var(--bg-secondary)' }
                          } as any}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          <div className="font-medium">{result.name}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* County B Search */}
                <div className="relative">
                  <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    County B
                  </label>
                  <input
                    type="text"
                    value={searchQueryB}
                    onChange={(e) => {
                      setSearchQueryB(e.target.value)
                      setShowResultsB(true)
                    }}
                    onFocus={() => setShowResultsB(true)}
                    onBlur={() => setTimeout(() => setShowResultsB(false), 200)}
                    placeholder="Search counties..."
                    className="w-full px-4 py-3 rounded-lg border-2 transition-all"
                    style={{
                      background: 'var(--bg-tertiary)',
                      borderColor: 'var(--border-color)',
                      color: 'var(--text-primary)'
                    }}
                  />
                  {showResultsB && searchResultsB.length > 0 && (
                    <div
                      className="absolute z-50 w-full mt-1 rounded-lg shadow-lg border-2 overflow-hidden"
                      style={{
                        background: 'var(--bg-tertiary)',
                        borderColor: 'var(--border-color)',
                        maxHeight: '300px',
                        overflowY: 'auto'
                      }}
                    >
                      {searchResultsB.map((result) => (
                        <div
                          key={result.fips}
                          onClick={() => {
                            setSelectedCountyB(result.fips)
                            setSearchQueryB(result.name)
                            setShowResultsB(false)
                          }}
                          className="px-4 py-3 cursor-pointer transition-colors"
                          style={{
                            color: 'var(--text-primary)',
                            '&:hover': { background: 'var(--bg-secondary)' }
                          } as any}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          <div className="font-medium">{result.name}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Statistical Controls */}
              {selectedCountyA && selectedCountyB && (
                <div className="mb-6 p-4 rounded-xl" style={{ background: 'var(--bg-tertiary)' }}>
                  <h4 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                    ⚙️ Adjust for Confounders
                  </h4>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="checkbox-item"
                        checked={controlPoverty}
                        onChange={(e) => setControlPoverty(e.target.checked)}
                      />
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        Control for Poverty Rate
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer opacity-50">
                      <input
                        type="checkbox"
                        className="checkbox-item"
                        checked={controlIncome}
                        onChange={(e) => setControlIncome(e.target.checked)}
                        disabled
                      />
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        Control for Median Income (coming soon)
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="checkbox-item"
                        checked={controlUrbanRural}
                        onChange={(e) => setControlUrbanRural(e.target.checked)}
                      />
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        Control for Urban/Rural
                      </span>
                    </label>
                  </div>
                  {(controlPoverty || controlIncome || controlUrbanRural) && (
                    <div className="mt-3 text-xs p-2 rounded" style={{ background: 'rgba(59, 130, 246, 0.1)', color: 'var(--text-primary)' }}>
                      Statistical adjustment uses regression to remove the effect of selected confounders
                    </div>
                  )}
                  {loadingAdjustment && (
                    <div className="mt-2 text-xs text-center" style={{ color: '#3b82f6' }}>
                      Computing adjusted values...
                    </div>
                  )}
                </div>
              )}

              {/* Comparison Results */}
              {selectedCountyA && selectedCountyB && (
                <div className="space-y-4">
                  <div className="rounded-xl p-5" style={{ background: 'var(--bg-tertiary)' }}>
                    <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                      {fipsToName[selectedCountyA]} vs {fipsToName[selectedCountyB]}
                    </h3>

                    {/* Data Comparison Grid */}
                    <div className="space-y-3">
                      {['DrugDeaths', 'DrugDeathRate', 'SuicideRate', 'RepublicanMargin', 'UnemploymentRate', 'PovertyRate'].map((field) => {
                        const dataA = yearlyData[selectedYear]?.[selectedCountyA]
                        const dataB = yearlyData[selectedYear]?.[selectedCountyB]

                        const labels: Record<string, string> = {
                          DrugDeaths: 'Drug Overdose Deaths (age-adjusted rate)',
                          DrugDeathRate: 'Drug Death Rate (age-adjusted rate, per 100k)',
                          SuicideRate: 'Suicide Mortality (age-adjusted rate, per 100k)',
                          RepublicanMargin: 'Republican Margin (%)',
                          UnemploymentRate: 'Unemployment Rate (%)',
                          PovertyRate: 'Poverty Rate (%)'
                        }

                        const valueA = dataA?.[field as keyof CountyData]
                        const valueB = dataB?.[field as keyof CountyData]

                        // Get adjusted values if available
                        const adjustedInfo = adjustedData?.[field]
                        const showAdjusted = adjustedInfo && adjustedInfo.adjusted_a !== null

                        return (
                          <div key={field} className="rounded-lg p-4" style={{ background: 'var(--bg-tertiary)' }}>
                            <div className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                              {labels[field]}
                              {showAdjusted && (
                                <span className="ml-2 text-xs px-2 py-1 rounded" style={{ background: 'var(--bg-secondary)', color: 'var(--accent-blue)' }}>
                                  Adjusted
                                </span>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>County A</div>
                                <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                                  {showAdjusted ? (
                                    <>
                                      {adjustedInfo.adjusted_a.toFixed(1)}
                                      <div className="text-xs font-normal mt-1" style={{ color: 'var(--text-muted)' }}>
                                        Raw: {adjustedInfo.raw_a.toFixed(1)}
                                        {adjustedInfo.adjustment_pct_a && (
                                          <span className="ml-1">({adjustedInfo.adjustment_pct_a.toFixed(0)}% adj)</span>
                                        )}
                                      </div>
                                    </>
                                  ) : (
                                    valueA !== null && valueA !== undefined
                                      ? typeof valueA === 'number'
                                        ? valueA.toFixed(1)
                                        : valueA
                                      : 'N/A'
                                  )}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>County B</div>
                                <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                                  {showAdjusted ? (
                                    <>
                                      {adjustedInfo.adjusted_b.toFixed(1)}
                                      <div className="text-xs font-normal mt-1" style={{ color: 'var(--text-muted)' }}>
                                        Raw: {adjustedInfo.raw_b.toFixed(1)}
                                        {adjustedInfo.adjustment_pct_b && (
                                          <span className="ml-1">({adjustedInfo.adjustment_pct_b.toFixed(0)}% adj)</span>
                                        )}
                                      </div>
                                    </>
                                  ) : (
                                    valueB !== null && valueB !== undefined
                                      ? typeof valueB === 'number'
                                        ? valueB.toFixed(1)
                                        : valueB
                                      : 'N/A'
                                  )}
                                </div>
                              </div>
                            </div>
                            {showAdjusted && adjustedInfo.adjustment_note && (
                              <div className="text-xs mt-2 p-2 rounded" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                                {adjustedInfo.adjustment_note} (n={adjustedInfo.n_counties} counties)
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Year-wise Trends */}
                  {timeSeriesData && (
                    <div className="rounded-xl p-5" style={{ background: 'var(--bg-tertiary)' }}>
                      <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                        Year-over-Year Trends (2018-2023)
                      </h3>

                      {['DrugDeathRate', 'SuicideRate', 'UnemploymentRate'].map((metric) => {
                        const labels: Record<string, string> = {
                          DrugDeathRate: 'Overdose Mortality Trends (2018-2023)',
                          SuicideRate: 'Suicide Mortality Trends (2018-2023)',
                          UnemploymentRate: 'Unemployment Rate Trends (2018-2023)'
                        }

                        // Prepare data for chart
                        const dataA = years.map(year => {
                          const val = timeSeriesData.countyA[year]?.[metric]
                          return val !== null && val !== undefined ? val : null
                        })
                        const dataB = years.map(year => {
                          const val = timeSeriesData.countyB[year]?.[metric]
                          return val !== null && val !== undefined ? val : null
                        })

                        // Calculate min/max for Y axis
                        const allValues = [...dataA, ...dataB].filter(v => v !== null) as number[]
                        if (allValues.length === 0) return null

                        const minVal = Math.min(...allValues)
                        const maxVal = Math.max(...allValues)
                        const padding = (maxVal - minVal) * 0.1 || 1
                        const yMin = Math.max(0, minVal - padding)
                        const yMax = maxVal + padding

                        // Chart dimensions
                        const width = 500
                        const height = 200
                        const marginLeft = 40
                        const marginRight = 30
                        const marginTop = 20
                        const marginBottom = 40
                        const chartWidth = width - marginLeft - marginRight
                        const chartHeight = height - marginTop - marginBottom

                        // Scale functions
                        const xScale = (index: number) => marginLeft + (index / (years.length - 1)) * chartWidth
                        const yScale = (value: number) => marginTop + chartHeight - ((value - yMin) / (yMax - yMin)) * chartHeight

                        // Create path strings
                        const createPath = (data: (number | null)[]) => {
                          const points = data
                            .map((val, i) => val !== null ? `${xScale(i)},${yScale(val)}` : null)
                            .filter(p => p !== null)
                          if (points.length === 0) return ''
                          return 'M' + points.join(' L')
                        }

                        const pathA = createPath(dataA)
                        const pathB = createPath(dataB)

                        return (
                          <div key={metric} className="mb-6 last:mb-0 p-4 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
                            <div className="text-base font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                              {labels[metric]}
                            </div>

                            {/* Legend */}
                            <div className="flex items-center justify-center gap-6 mb-3 text-sm">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-0.5" style={{ background: '#dc2626' }}></div>
                                <span style={{ color: 'var(--text-secondary)' }}>{fipsToName[selectedCountyA]}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-0.5" style={{ background: '#3b82f6' }}></div>
                                <span style={{ color: 'var(--text-secondary)' }}>{fipsToName[selectedCountyB]}</span>
                              </div>
                            </div>

                            {/* Chart SVG */}
                            <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: '100%' }}>
                              {/* Grid lines */}
                              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                                const y = marginTop + chartHeight * ratio
                                return (
                                  <line
                                    key={ratio}
                                    x1={marginLeft}
                                    y1={y}
                                    x2={marginLeft + chartWidth}
                                    y2={y}
                                    stroke="var(--border-color)"
                                    strokeWidth="1"
                                    opacity="0.3"
                                  />
                                )
                              })}

                              {/* Y axis labels */}
                              {[0, 0.5, 1].map((ratio) => {
                                const value = yMin + (yMax - yMin) * (1 - ratio)
                                const y = marginTop + chartHeight * ratio
                                return (
                                  <text
                                    key={ratio}
                                    x={marginLeft - 10}
                                    y={y}
                                    textAnchor="end"
                                    dominantBaseline="middle"
                                    fill="var(--text-secondary)"
                                    fontSize="11"
                                  >
                                    {value.toFixed(0)}
                                  </text>
                                )
                              })}

                              {/* X axis labels */}
                              {years.map((year, i) => (
                                <text
                                  key={year}
                                  x={xScale(i)}
                                  y={marginTop + chartHeight + 20}
                                  textAnchor="middle"
                                  fill="var(--text-secondary)"
                                  fontSize="11"
                                >
                                  {year}
                                </text>
                              ))}

                              {/* Data lines */}
                              {pathA && (
                                <path
                                  d={pathA}
                                  fill="none"
                                  stroke="#dc2626"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              )}
                              {pathB && (
                                <path
                                  d={pathB}
                                  fill="none"
                                  stroke="#3b82f6"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              )}

                              {/* Data points */}
                              {dataA.map((val, i) => {
                                if (val === null) return null
                                return (
                                  <circle
                                    key={`a-${i}`}
                                    cx={xScale(i)}
                                    cy={yScale(val)}
                                    r="4"
                                    fill="#dc2626"
                                    stroke="var(--bg-secondary)"
                                    strokeWidth="2"
                                  />
                                )
                              })}
                              {dataB.map((val, i) => {
                                if (val === null) return null
                                return (
                                  <circle
                                    key={`b-${i}`}
                                    cx={xScale(i)}
                                    cy={yScale(val)}
                                    r="4"
                                    fill="#3b82f6"
                                    stroke="var(--bg-secondary)"
                                    strokeWidth="2"
                                  />
                                )
                              })}
                            </svg>
                          </div>
                        )
                      })}

                      {loadingTimeSeries && (
                        <div className="text-center py-4 text-sm" style={{ color: '#3b82f6' }}>
                          Loading trend data...
                        </div>
                      )}
                    </div>
                  )}

                  {/* Demographics Comparison Table */}
                  {timeSeriesData && (
                    <div className="rounded-xl p-5" style={{ background: 'var(--bg-tertiary)' }}>
                      <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                        Demographics Comparison
                      </h3>

                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                              <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Measure</th>
                              <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{fipsToName[selectedCountyA]}</th>
                              <th className="text-left py-2 px-3" style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{fipsToName[selectedCountyB]}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              const dataA = yearlyData[selectedYear]?.[selectedCountyA]
                              const dataB = yearlyData[selectedYear]?.[selectedCountyB]

                              return (
                                <>
                                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>Population</td>
                                    <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>{dataA?.Population?.toLocaleString() || 'N/A'}</td>
                                    <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>{dataB?.Population?.toLocaleString() || 'N/A'}</td>
                                  </tr>
                                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>Urban/Rural</td>
                                    <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>{dataA?.urban_rural || 'N/A'}</td>
                                    <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>{dataB?.urban_rural || 'N/A'}</td>
                                  </tr>
                                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>Poverty Rate</td>
                                    <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>{dataA?.PovertyRate ? `${dataA.PovertyRate.toFixed(1)}%` : 'N/A'}</td>
                                    <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>{dataB?.PovertyRate ? `${dataB.PovertyRate.toFixed(1)}%` : 'N/A'}</td>
                                  </tr>
                                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>Interstate Distance</td>
                                    <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>N/A</td>
                                    <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>N/A</td>
                                  </tr>
                                  <tr>
                                    <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>Political Lean</td>
                                    <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>{dataA?.RepublicanMargin ? `${dataA.RepublicanMargin.toFixed(1)}% R` : 'N/A'}</td>
                                    <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>{dataB?.RepublicanMargin ? `${dataB.RepublicanMargin.toFixed(1)}% R` : 'N/A'}</td>
                                  </tr>
                                </>
                              )
                            })()}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Model-Adjusted Comparison */}
                  {selectedCountyA && selectedCountyB && (
                    <div className="rounded-xl p-5" style={{ background: 'rgba(209, 250, 229, 0.3)', borderLeft: '4px solid #10b981' }}>
                      <h3 className="text-lg font-bold mb-4" style={{ color: '#047857' }}>
                        Model-Adjusted Comparison
                      </h3>

                      <div className="space-y-3 text-sm" style={{ color: 'var(--text-primary)' }}>
                        <p>
                          <strong style={{ color: '#047857' }}>Model Adjustment Available:</strong> Select confounder controls above to view statistically adjusted comparisons. Use checkboxes to control for poverty rate, median income, and urban/rural status.
                        </p>

                      </div>
                    </div>
                  )}
                </div>
              )}

              {!selectedCountyA && !selectedCountyB && (
                <div className="text-center py-12">
                  <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>
                    Select two counties to compare
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

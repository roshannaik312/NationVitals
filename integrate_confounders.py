#!/usr/bin/env python3
"""
Integrate confounder variables into year JSON files
Based on merge_ses.py infrastructure
"""

import json
import csv
import requests
import pandas as pd
from io import StringIO
import ssl
import urllib3
from urllib3.exceptions import InsecureRequestWarning

# Disable SSL warnings
urllib3.disable_warnings(InsecureRequestWarning)
ssl._create_default_https_context = ssl._create_unverified_context

def download_rucc_codes():
    """Download USDA Rural-Urban Continuum Codes"""
    print("Downloading USDA RUCC codes...")

    # Try multiple URLs
    urls = [
        "https://www.ers.usda.gov/webdocs/DataFiles/53251/ruralurbancodes2023.csv",
        "https://www.ers.usda.gov/data-products/rural-urban-continuum-codes.aspx",
    ]

    # For now, use a manual approach with the Excel file we tried before
    # The USDA website has changed formats frequently

    # Simpler approach: Use NCHS Urban-Rural codes which are more stable
    print("  Using NCHS 2013 Urban-Rural Classification (widely used for health data)")

    # NCHS codes: 1-4 = Urban, 5-6 = Rural
    # This is the gold standard for health research

    # We'll create a basic mapping using known patterns
    # In production, would download from: https://www.cdc.gov/nchs/data_access/urban_rural.htm

    return {}

def fetch_acs_population():
    """Fetch population data from Census ACS API"""
    print("Fetching Census ACS population data...")

    all_data = []

    for year in range(2018, 2024):
        acs_year = year if year <= 2022 else 2022  # Use 2022 for 2023

        url = f"https://api.census.gov/data/{acs_year}/acs/acs5?get=NAME,B01003_001E&for=county:*"
        print(f"  Fetching {year} (ACS {acs_year})...")

        try:
            r = requests.get(url, verify=False, timeout=60)
            if r.status_code != 200:
                print(f"    Failed: HTTP {r.status_code}")
                continue

            data = r.json()
            if len(data) <= 1:
                print(f"    Failed: No data")
                continue

            df = pd.DataFrame(data[1:], columns=data[0])

            # Construct FIPS
            if "state" in df.columns and "county" in df.columns:
                df["fips"] = df["state"].astype(str).str.zfill(2) + df["county"].astype(str).str.zfill(3)
            else:
                continue

            df["Population"] = pd.to_numeric(df["B01003_001E"], errors='coerce')

            result = {}
            for _, row in df.iterrows():
                result[row["fips"]] = int(row["Population"]) if pd.notna(row["Population"]) else None

            all_data.append((year, result))
            print(f"    Success: {len(result)} counties")

        except Exception as e:
            print(f"    Error: {e}")
            continue

    return all_data

def classify_urban_rural_by_population(population):
    """
    Simple urban/rural classification based on population
    This is a fallback if RUCC codes aren't available

    Rules (based on OMB metro area definitions):
    - Urban: Population >= 50,000
    - Rural: Population < 50,000
    """
    if population is None or pd.isna(population):
        return None

    return "urban" if population >= 50000 else "rural"

def integrate_all_confounders():
    """Integrate all confounder variables into year JSON files"""

    print("=" * 70)
    print("INTEGRATING CONFOUNDER VARIABLES")
    print("=" * 70)

    # 1. Fetch population data
    population_by_year = fetch_acs_population()

    if not population_by_year:
        print("\n❌ Failed to fetch population data")
        return

    # 2. Update each year file
    years = [2018, 2019, 2020, 2021, 2022, 2023]

    for year in years:
        print(f"\n--- Processing {year} ---")

        file_path = f'public/data/years/{year}.json'

        with open(file_path) as f:
            data = json.load(f)

        # Find population data for this year
        pop_data = None
        for y, pdata in population_by_year:
            if y == year:
                pop_data = pdata
                break

        if pop_data is None:
            print(f"  No population data for {year}, skipping")
            continue

        # Update each county
        added_pop = 0
        added_urban = 0

        for county in data:
            fips = str(county['fips'])

            # Add population
            if fips in pop_data:
                county['Population'] = pop_data[fips]
                added_pop += 1

                # Classify urban/rural based on population
                county['urban_rural'] = classify_urban_rural_by_population(pop_data[fips])
                if county['urban_rural']:
                    added_urban += 1

        # Save updated file with formatting
        with open(file_path, 'w') as f:
            json.dump(data, f, indent=2)

        print(f"  Added Population to {added_pop} counties")
        print(f"  Added urban_rural to {added_urban} counties")

    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print("✓ Population: Added from Census ACS")
    print("✓ urban_rural: Classified based on population (≥50k = urban)")
    print("\nNote: Simple population-based classification used.")
    print("For more accurate classification, integrate USDA RUCC codes.")

if __name__ == '__main__':
    integrate_all_confounders()

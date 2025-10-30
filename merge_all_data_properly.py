import pandas as pd
import geopandas as gpd
import json

print("=" * 80)
print("COMPREHENSIVE DATA MERGE - Including All Drug Deaths Data")
print("=" * 80)

# Step 1: Load shapefile to get all valid counties
print("\n1. Loading county boundaries...")
gdf = gpd.read_file('data/tl_2025_us_county.shp')
all_fips = set(gdf['GEOID'].astype(str).str.zfill(5).unique())
print(f"   ✓ {len(all_fips)} counties in shapefile")

# Step 2: Load drug deaths data
print("\n2. Loading drug deaths data...")
drug_df = pd.read_csv('data/drug_deaths_2018_2023.csv')
print(f"   ✓ {len(drug_df)} rows loaded")

# Clean up the data
drug_df = drug_df[drug_df['County Code'].notna()]  # Remove NaN counties
drug_df['County Code'] = drug_df['County Code'].astype(int).astype(str).str.zfill(5)
drug_df = drug_df[drug_df['Year'].notna()]  # Remove NaN years
drug_df['Year'] = drug_df['Year'].astype(int).astype(str)

# Handle Deaths column - convert Suppressed to 0, keep numeric values
def parse_deaths(val):
    if pd.isna(val):
        return None, False
    if isinstance(val, str):
        if val.lower() == 'suppressed':
            return 0, True  # 0 deaths, is_suppressed=True
        try:
            return float(val), False
        except:
            return None, False
    return float(val), False

drug_df[['Deaths_Value', 'Is_Suppressed']] = drug_df['Deaths'].apply(
    lambda x: pd.Series(parse_deaths(x))
)

# Handle Crude Rate similarly
def parse_rate(val):
    if pd.isna(val):
        return None
    if isinstance(val, str):
        if val.lower() in ['suppressed', 'unreliable']:
            return None
        try:
            return float(val)
        except:
            return None
    return float(val)

drug_df['Crude_Rate_Value'] = drug_df['Crude Rate'].apply(parse_rate)

print(f"   ✓ Parsed deaths: {drug_df['Deaths_Value'].notna().sum()} valid values")
print(f"   ✓ Suppressed records: {drug_df['Is_Suppressed'].sum()}")

# Step 3: Load other data sources
print("\n3. Loading other data sources...")
existing_df = pd.read_csv('county_year_merged.csv')
existing_df['fips'] = existing_df['fips'].astype(str).str.zfill(5)
print(f"   ✓ Existing merged data: {len(existing_df)} rows")

# Step 4: Create complete dataset
print("\n4. Creating complete dataset with all counties and years...")
years = ['2018', '2019', '2020', '2021', '2022', '2023']
complete_rows = []

for fips in sorted(all_fips):
    for year in years:
        # Get drug death data
        drug_record = drug_df[
            (drug_df['County Code'] == fips) &
            (drug_df['Year'] == year)
        ]

        # Get other data
        existing_record = existing_df[
            (existing_df['fips'] == fips) &
            (existing_df['Year'] == int(year))
        ]

        # Build row
        row = {
            'fips': fips,
            'Year': year,
        }

        # Add drug death information
        if len(drug_record) > 0:
            rec = drug_record.iloc[0]
            row['DrugDeaths'] = rec['Deaths_Value']
            row['DrugDeathRate'] = rec['Crude_Rate_Value']
            row['Is_Suppressed'] = rec['Is_Suppressed']
        else:
            row['DrugDeaths'] = None
            row['DrugDeathRate'] = None
            row['Is_Suppressed'] = False

        # Add other data
        if len(existing_record) > 0:
            rec = existing_record.iloc[0]
            for col in ['UnemploymentRate', 'PovertyRate', 'MedianIncome', 'RepublicanMargin',
                       'SuicideDeaths', 'SuicideRate', 'Population']:
                row[col] = rec[col] if col in rec else None
        else:
            row['UnemploymentRate'] = None
            row['PovertyRate'] = None
            row['MedianIncome'] = None
            row['RepublicanMargin'] = None
            row['SuicideDeaths'] = None
            row['SuicideRate'] = None
            row['Population'] = None

        complete_rows.append(row)

complete_df = pd.DataFrame(complete_rows)

print(f"\n5. Complete dataset created:")
print(f"   ✓ Total rows: {len(complete_df)}")
print(f"   ✓ Unique counties: {complete_df['fips'].nunique()}")
print(f"   ✓ Years: {sorted(complete_df['Year'].unique())}")

# Calculate data completeness
print(f"\n6. Data completeness:")
drug_deaths_with_data = complete_df['DrugDeaths'].notna().sum()
drug_deaths_suppressed = complete_df['Is_Suppressed'].sum()
print(f"   DrugDeaths: {(drug_deaths_with_data/len(complete_df)*100):.1f}% have data")
print(f"   - With values: {drug_deaths_with_data - drug_deaths_suppressed} ({((drug_deaths_with_data - drug_deaths_suppressed)/len(complete_df)*100):.1f}%)")
print(f"   - Suppressed (shown as 0): {drug_deaths_suppressed} ({(drug_deaths_suppressed/len(complete_df)*100):.1f}%)")

for col in ['RepublicanMargin', 'UnemploymentRate', 'PovertyRate']:
    non_null = complete_df[col].notna().sum()
    pct = (non_null / len(complete_df)) * 100
    print(f"   {col}: {pct:.1f}%")

# Save complete CSV
complete_df.to_csv('county_year_complete_with_suppressed.csv', index=False)
print(f"\n✓ Saved: county_year_complete_with_suppressed.csv")

# Step 7: Create JSON for maps
print(f"\n7. Creating yearly JSON files for visualization...")
yearly_data = {}

for year in years:
    year_df = complete_df[complete_df['Year'] == year].copy()

    counties = []
    for _, row in year_df.iterrows():
        county = {
            'fips': row['fips'],
            'DrugDeaths': float(row['DrugDeaths']) if pd.notna(row['DrugDeaths']) else None,
            'DrugDeathRate': float(row['DrugDeathRate']) if pd.notna(row['DrugDeathRate']) else None,
            'Is_Suppressed': bool(row['Is_Suppressed']),
            'SuicideRate': float(row['SuicideRate']) if pd.notna(row['SuicideRate']) else None,
            'RepublicanMargin': float(row['RepublicanMargin']) if pd.notna(row['RepublicanMargin']) else None,
            'UnemploymentRate': float(row['UnemploymentRate']) if pd.notna(row['UnemploymentRate']) else None,
            'PovertyRate': float(row['PovertyRate']) if pd.notna(row['PovertyRate']) else None,
        }
        counties.append(county)

    yearly_data[year] = counties

    # Count statistics
    with_data = sum(1 for c in counties if c['DrugDeaths'] is not None)
    suppressed = sum(1 for c in counties if c['Is_Suppressed'])
    print(f"   Year {year}: {len(counties)} counties, {with_data} with drug data, {suppressed} suppressed")

# Save yearly JSON
with open('public/data/yearly_county_data_complete.json', 'w') as f:
    json.dump(yearly_data, f)

print(f"\n✓ Saved: public/data/yearly_county_data_complete.json")
print(f"\n" + "=" * 80)
print("✓ COMPLETE! All data merged with proper suppression handling")
print("=" * 80)

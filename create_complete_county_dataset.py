import pandas as pd
import geopandas as gpd
import json

print("Creating complete county dataset with ALL counties...")

# Read the shapefile to get ALL valid US counties
print("\n1. Loading county boundaries from shapefile...")
gdf = gpd.read_file('data/tl_2025_us_county.shp')
all_fips = set(gdf['GEOID'].astype(str).str.zfill(5).unique())
print(f"   Counties in shapefile: {len(all_fips)}")

# Read existing merged data
print("\n2. Loading existing merged data...")
df = pd.read_csv('county_year_merged.csv')
data_fips = set(df['fips'].unique())
print(f"   Counties in data: {len(data_fips)}")

# Find differences
in_shapefile_not_data = all_fips - data_fips
in_data_not_shapefile = data_fips - all_fips

print(f"\n3. Analysis:")
print(f"   Counties in shapefile but not in data: {len(in_shapefile_not_data)}")
if len(in_shapefile_not_data) > 0:
    print(f"      Examples: {list(in_shapefile_not_data)[:5]}")
print(f"   Counties in data but not in shapefile: {len(in_data_not_shapefile)}")
if len(in_data_not_shapefile) > 0:
    print(f"      Examples: {list(in_data_not_shapefile)[:5]}")

# Create complete dataset with ALL counties from shapefile
print("\n4. Creating complete dataset...")
years = [2018, 2019, 2020, 2021, 2022, 2023]
complete_rows = []

for fips in sorted(all_fips):
    for year in years:
        # Check if this county-year exists in data
        existing = df[(df['fips'] == fips) & (df['Year'] == year)]

        if len(existing) > 0:
            # Use existing data
            row = existing.iloc[0].to_dict()
        else:
            # Create row with NA values
            row = {
                'fips': fips,
                'Year': year,
                'PerCapitaIncome': None,
                'UnemploymentRate': None,
                'PovertyRate': None,
                'MedianIncome': None,
                'Rent': None,
                'BachelorsOrHigher': None,
                'WhiteAlone': None,
                'BlackAlone': None,
                'HispanicLatino': None,
                'Population': None,
                'RepublicanVoteShare': None,
                'DemocratVoteShare': None,
                'RepublicanMargin': None,
                'DrugDeaths': None,
                'DrugDeathRate': None,
                'SuicideDeaths': None,
                'SuicideRate': None,
                'MentalHealthScore': None
            }

        complete_rows.append(row)

complete_df = pd.DataFrame(complete_rows)

print(f"\n5. Complete dataset created:")
print(f"   Total rows: {len(complete_df)}")
print(f"   Unique counties: {complete_df['fips'].nunique()}")
print(f"   Years: {sorted(complete_df['Year'].unique())}")
print(f"   Expected rows: {len(all_fips) * 6}")

# Calculate data completeness
print(f"\n6. Data completeness:")
for col in complete_df.columns:
    if col not in ['fips', 'Year']:
        non_null = complete_df[col].notna().sum()
        pct = (non_null / len(complete_df)) * 100
        print(f"   {col}: {pct:.1f}% ({non_null}/{len(complete_df)})")

# Save complete dataset
complete_df.to_csv('county_year_merged_complete.csv', index=False)
print(f"\n✓ Saved: county_year_merged_complete.csv")

# Create yearly JSON files for the map
print(f"\n7. Creating yearly JSON files...")
yearly_data = {}

for year in years:
    year_df = complete_df[complete_df['Year'] == year].copy()

    counties = []
    for _, row in year_df.iterrows():
        county = {
            'fips': row['fips'],
            'DrugDeathRate': float(row['DrugDeathRate']) if pd.notna(row['DrugDeathRate']) else None,
            'SuicideRate': float(row['SuicideRate']) if pd.notna(row['SuicideRate']) else None,
            'RepublicanMargin': float(row['RepublicanMargin']) if pd.notna(row['RepublicanMargin']) else None,
            'UnemploymentRate': float(row['UnemploymentRate']) if pd.notna(row['UnemploymentRate']) else None,
            'PovertyRate': float(row['PovertyRate']) if pd.notna(row['PovertyRate']) else None,
        }
        counties.append(county)

    yearly_data[str(year)] = counties
    print(f"   Year {year}: {len(counties)} counties")

# Save yearly data
with open('public/data/yearly_county_data_complete.json', 'w') as f:
    json.dump(yearly_data, f)

print(f"\n✓ Saved: public/data/yearly_county_data_complete.json")
print(f"\n✓ Complete! All {len(all_fips)} counties from shapefile are now included.")

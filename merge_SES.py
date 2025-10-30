import pandas as pd

def merge_socioeconomic_data():
    print("Merging socioeconomic and health data...")
    df = pd.read_csv('data/acs_county_5y.csv')
    drug_df = pd.read_csv('data/drug_deaths_2018_2023.csv')
    merged = pd.merge(df, drug_df, on='fips', how='outer')
    merged.to_csv('county_year_merged.csv', index=False)
    print("Merged data saved to county_year_merged.csv")

if __name__ == '__main__':
    merge_socioeconomic_data()

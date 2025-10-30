# NationVitals - County Health and Political Analysis Dashboard

Hi, I am Roshan Naik and this is my submission for the Congressional App Challenge 2025 . This is an interactive map visualization showing county-level correlations between political leanings and drug overdose deaths across the United States (2018-2023). 

You can test it at the link to the right - https://nation-vitals.vercel.app/

## Key features in my app

- Side-by-side county maps comparing drug overdose deaths and political lean
- Year slider to view trends from 2018-2023
- County comparison tool with statistical adjustments
- Search functionality to find specific counties
- Interactive hover tooltips with detailed county statistics

## what I used
- Next.js 14
- MapLibre GL
- TypeScript
- Tailwind CSS
- Wolfram Language (geospatial analytics)
- Python (data processing)

## Data processing

This project uses a combination of Wolfram Language for geospatial analytics (interstate proximity calculations) and Python for data merging and statistical processing. The main  scripts for research purposes are - 

- `merge_SES.py`: Merges socioeconomic data with health outcomes
- `wolfram/`: Wolfram scripts for geospatial calculations

## Data Sources

- CDC Wonder (drug overdose mortality)
- MIT Election Data Science Lab (county voting)
- U.S. Census Bureau (demographics)

## Installation

```bash
npm install
npm run dev
```

Visit http://localhost:3000


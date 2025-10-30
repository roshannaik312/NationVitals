'use client'

import ThemeToggle from '@/components/ThemeToggle'

export default function AboutPage() {
  return (
    <div className="min-h-screen p-4 md:p-8" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <div className="max-w-5xl mx-auto space-y-6 md:space-y-8">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div className="flex-1">
            <a
              href="/"
              className="text-sm md:text-base inline-block mb-4 transition-all duration-200 hover:opacity-80"
              style={{ color: 'var(--accent-blue)', textDecoration: 'none' }}
            >
              ← Back to Dashboard
            </a>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2">Methods & Data Sources</h1>
          </div>
          <ThemeToggle />
        </div>

        <div className="panel">
          <h2 className="text-lg md:text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Study Design</h2>
          <p className="text-sm md:text-base" style={{ color: 'var(--text-secondary)' }}>
            Ecological longitudinal panel study (county × year, 2010-2024) examining associations between geographic, political, and socioeconomic factors with overdose mortality, suicide, and mental health outcomes.
          </p>
        </div>

        <div className="panel">
          <h2 className="text-lg md:text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Data Sources</h2>
          <ul className="space-y-3 text-sm md:text-base list-disc pl-5" style={{ color: 'var(--text-secondary)' }}>
            <li>
              <strong style={{ color: 'var(--text-primary)' }}>CDC WONDER Multiple Cause of Death Files:</strong> County-level overdose and suicide mortality counts and age-adjusted rates
            </li>
            <li>
              <strong style={{ color: 'var(--text-primary)' }}>CDC PLACES:</strong> Local health data including poor mental health days at county level
            </li>
            <li>
              <strong style={{ color: 'var(--text-primary)' }}>MIT Election Data & Science Lab:</strong> County presidential election returns (2000-2024)
            </li>
            <li>
              <strong style={{ color: 'var(--text-primary)' }}>American Community Survey (ACS) 5-Year:</strong> Poverty rates, median household income, race/ethnicity, education
            </li>
            <li>
              <strong style={{ color: 'var(--text-primary)' }}>County Health Rankings:</strong> Violent crime proxy measures
            </li>
            <li>
              <strong style={{ color: 'var(--text-primary)' }}>Census TIGER/Line Shapefiles:</strong> Primary roads (MTFCC S1100) for interstate proximity calculations
            </li>
          </ul>
        </div>

        <div className="panel">
          <h2 className="text-lg md:text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Statistical Analysis</h2>
          <div className="space-y-3 text-sm md:text-base" style={{ color: 'var(--text-secondary)' }}>
            <p>
              <strong style={{ color: 'var(--text-primary)' }}>Primary Model:</strong> Negative binomial generalized linear mixed model (GLMM) with county and state random intercepts, year fixed effects. Outcomes modeled as counts with population offset; age-adjusted rates used for visualization.
            </p>
            <p>
              <strong style={{ color: 'var(--text-primary)' }}>Interstate Proximity:</strong> Calculated as minimum distance from population-weighted county centroid to nearest S1100 (interstate) segment.
            </p>
            <p>
              <strong style={{ color: 'var(--text-primary)' }}>Adjustment:</strong> Models control for poverty rate, median income, racial/ethnic composition, education, urban/rural classification, and violent crime proxy.
            </p>
          </div>
        </div>

        <div className="panel">
          <h2 className="text-lg md:text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Limitations & Ethical Considerations</h2>
          <div className="space-y-3 text-sm md:text-base" style={{ color: 'var(--text-secondary)' }}>
            <p>
              <strong style={{ color: 'var(--warning)' }}>Ecological Inference Caveat:</strong> All analyses use county-level aggregate data. Associations observed at the county level do not necessarily apply to individuals (ecological fallacy).
            </p>
            <p>
              <strong style={{ color: 'var(--text-primary)' }}>Data Suppression:</strong> Counties with &lt;10 deaths in a year are suppressed to protect privacy, following CDC guidelines.
            </p>
            <p>
              <strong style={{ color: 'var(--text-primary)' }}>Reporting Variation:</strong> Overdose and suicide reporting quality varies by state and has improved over time, potentially affecting trend interpretation.
            </p>
            <p>
              <strong style={{ color: 'var(--text-primary)' }}>Confounding:</strong> Despite extensive adjustment, unmeasured confounders (treatment access, substance availability, social capital) may bias estimates.
            </p>
          </div>
        </div>

        <div className="panel">
          <h2 className="text-lg md:text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Key Citations</h2>
          <ul className="space-y-2 text-xs md:text-sm list-disc pl-5" style={{ color: 'var(--text-secondary)' }}>
            <li>
              Haffajee, R. L., et al. (2019). Characteristics of US counties with high opioid overdose mortality and low OUD treatment capacity. <em>JAMA Network Open</em>, 2(6), e196373.
            </li>
            <li>
              Kariisa, M., et al. (2022). Vital signs: Drug overdose deaths by selected sociodemographics, 2019–2020. <em>MMWR</em>, 71(29), 940–947.
            </li>
            <li>
              Goodwin, J. S., et al. (2018). Association of chronic opioid use with presidential voting patterns. <em>JAMA Network Open</em>, 1(2), e180450.
            </li>
            <li>
              MIT Election Data and Science Lab. (2018). County Presidential Election Returns 2000–2024. Harvard Dataverse.
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}

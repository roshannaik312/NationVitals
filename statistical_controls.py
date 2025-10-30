#!/usr/bin/env python3
"""
Statistical Controls for County Comparison
Implements regression-based adjustment for confounding variables
"""

import json
import numpy as np
from scipy import stats
from typing import Dict, List, Optional, Tuple

def load_year_data(year: int = 2023) -> List[Dict]:
    """Load county data for a specific year"""
    import os
    base_path = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(base_path, 'public', 'data', 'years', f'{year}.json')
    with open(file_path, 'r') as f:
        return json.load(f)

def adjust_for_confounders(
    county_a_fips: str,
    county_b_fips: str,
    year: int,
    control_poverty: bool = False,
    control_income: bool = False,
    control_urban_rural: bool = False
) -> Dict:
    """
    Adjust comparison metrics for confounding variables using residualization.

    Returns both raw and adjusted values for comparison.
    """
    data = load_year_data(year)

    # Convert to arrays for regression
    counties = []
    for c in data:
        if c.get('DrugDeathRate') is not None:
            counties.append(c)

    if len(counties) < 50:
        return {
            'error': 'Insufficient data for statistical adjustment',
            'counties_available': len(counties)
        }

    # Find target counties
    county_a = next((c for c in data if str(c['fips']) == str(county_a_fips)), None)
    county_b = next((c for c in data if str(c['fips']) == str(county_b_fips)), None)

    if not county_a or not county_b:
        return {'error': 'County not found'}

    # Prepare data for regression
    outcome_fields = ['DrugDeathRate', 'SuicideRate', 'UnemploymentRate']
    confounder_fields = []

    if control_poverty:
        confounder_fields.append('PovertyRate')
    if control_income:
        confounder_fields.append('MedianIncome')
    if control_urban_rural:
        confounder_fields.append('urban_rural')  # Will need to encode this

    results = {}

    # For each outcome, compute adjusted values
    for outcome in outcome_fields:
        raw_a = county_a.get(outcome)
        raw_b = county_b.get(outcome)

        if raw_a is None or raw_b is None:
            results[outcome] = {
                'raw_a': raw_a,
                'raw_b': raw_b,
                'adjusted_a': None,
                'adjusted_b': None,
                'adjustment_note': 'Missing data'
            }
            continue

        # If no controls selected, return raw values
        if not confounder_fields:
            results[outcome] = {
                'raw_a': raw_a,
                'raw_b': raw_b,
                'adjusted_a': raw_a,
                'adjusted_b': raw_b,
                'adjustment_note': 'No controls applied'
            }
            continue

        # Build regression dataset
        Y = []
        X = []
        for c in counties:
            y_val = c.get(outcome)
            if y_val is None:
                continue

            x_vals = []
            skip = False
            for conf in confounder_fields:
                conf_val = c.get(conf)
                if conf_val is None:
                    skip = True
                    break

                # Encode categorical variables
                if conf == 'urban_rural':
                    # Binary encoding: urban=1, rural=0
                    x_vals.append(1 if conf_val == 'urban' else 0)
                else:
                    # Continuous variable
                    x_vals.append(conf_val)

            if not skip:
                Y.append(y_val)
                X.append(x_vals)

        if len(Y) < 30:
            results[outcome] = {
                'raw_a': raw_a,
                'raw_b': raw_b,
                'adjusted_a': None,
                'adjusted_b': None,
                'adjustment_note': f'Insufficient data (n={len(Y)})'
            }
            continue

        # Convert to numpy arrays
        Y = np.array(Y)
        X = np.array(X)

        # Add intercept
        X = np.column_stack([np.ones(len(X)), X])

        # Fit linear regression
        try:
            # Use least squares: beta = (X'X)^-1 X'Y
            beta = np.linalg.lstsq(X, Y, rcond=None)[0]

            # Compute residuals (adjusted values)
            # For county A and B, compute predicted value based on their confounders
            # Then adjusted value = raw - (predicted - mean(predicted))

            # Get confounder values for counties A and B
            conf_a = []
            conf_b = []
            for conf in confounder_fields:
                val_a = county_a.get(conf)
                val_b = county_b.get(conf)

                # Encode categorical variables
                if conf == 'urban_rural':
                    # Calculate mode (most common) for categorical
                    conf_values = [c.get(conf) for c in counties if c.get(conf) is not None]
                    mode_val = max(set(conf_values), key=conf_values.count) if conf_values else 'rural'

                    # Binary encoding: urban=1, rural=0
                    val_a_encoded = 1 if (val_a if val_a is not None else mode_val) == 'urban' else 0
                    val_b_encoded = 1 if (val_b if val_b is not None else mode_val) == 'urban' else 0

                    conf_a.append(val_a_encoded)
                    conf_b.append(val_b_encoded)
                else:
                    # Calculate mean for continuous variables
                    conf_values = [c.get(conf) for c in counties if c.get(conf) is not None]
                    mean_val = np.mean(conf_values) if conf_values else 0

                    # Use county value if available, otherwise use mean
                    conf_a.append(val_a if val_a is not None else mean_val)
                    conf_b.append(val_b if val_b is not None else mean_val)

            # Add intercept
            X_a = np.array([1] + conf_a)
            X_b = np.array([1] + conf_b)

            # Predicted values
            pred_a = np.dot(X_a, beta)
            pred_b = np.dot(X_b, beta)

            # Mean predicted value across all counties
            pred_all = np.dot(X, beta)
            mean_pred = np.mean(pred_all)

            # Adjusted values: observed - (predicted - mean_predicted)
            # This removes the effect of confounders while preserving the outcome scale
            adjusted_a = raw_a - (pred_a - mean_pred)
            adjusted_b = raw_b - (pred_b - mean_pred)

            # Calculate adjustment magnitude
            adj_pct_a = abs((adjusted_a - raw_a) / raw_a * 100) if raw_a != 0 else 0
            adj_pct_b = abs((adjusted_b - raw_b) / raw_b * 100) if raw_b != 0 else 0

            results[outcome] = {
                'raw_a': round(raw_a, 2),
                'raw_b': round(raw_b, 2),
                'adjusted_a': round(adjusted_a, 2),
                'adjusted_b': round(adjusted_b, 2),
                'adjustment_pct_a': round(adj_pct_a, 1),
                'adjustment_pct_b': round(adj_pct_b, 1),
                'n_counties': len(Y),
                'confounders': confounder_fields,
                'adjustment_note': f'Adjusted for: {", ".join(confounder_fields)}'
            }

        except np.linalg.LinAlgError:
            results[outcome] = {
                'raw_a': raw_a,
                'raw_b': raw_b,
                'adjusted_a': None,
                'adjusted_b': None,
                'adjustment_note': 'Regression failed (multicollinearity?)'
            }

    return results


if __name__ == '__main__':
    # Test with example counties - first find some valid FIPS codes
    data = load_year_data(2023)

    # Find two DIFFERENT counties with complete data
    test_counties = []
    seen_fips = set()
    for c in data:
        fips = str(c.get('fips', 0))
        if (c.get('DrugDeathRate') is not None and
            c.get('PovertyRate') is not None and
            c.get('fips', 0) > 1000 and
            fips not in seen_fips):
            test_counties.append(fips)
            seen_fips.add(fips)
            if len(test_counties) >= 2:
                break

    if len(test_counties) < 2:
        print("Not enough test counties with complete data")
        exit(1)

    fips_a, fips_b = test_counties[0], test_counties[1]
    print(f"Testing with counties: {fips_a} vs {fips_b}")

    print("\n1. No controls:")
    result = adjust_for_confounders(fips_a, fips_b, 2023, False, False, False)
    print(json.dumps(result, indent=2))

    print("\n2. Controlling for poverty:")
    result = adjust_for_confounders(fips_a, fips_b, 2023, True, False, False)
    if 'DrugDeathRate' in result:
        dr = result['DrugDeathRate']
        print(f"  Drug Death Rate:")
        print(f"    County A: {dr['raw_a']} (raw) → {dr.get('adjusted_a', 'N/A')} (adjusted)")
        print(f"    County B: {dr['raw_b']} (raw) → {dr.get('adjusted_b', 'N/A')} (adjusted)")
        if dr.get('adjustment_note'):
            print(f"    Note: {dr['adjustment_note']}")

    print("\n3. Full results with poverty control:")
    print(json.dumps(result, indent=2))

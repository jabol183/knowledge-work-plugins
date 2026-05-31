# HA Solar Plugin

Home Assistant solar and battery monitoring skills for Claude. Diagnoses power flow sensor misconfigurations, generates corrected template sensor YAML, and validates energy balance equations.

## The Problem This Solves

A common Home Assistant misconfiguration causes the grid power sensor to display **total home consumption** instead of actual grid import. When a battery is discharging, the grid reading appears far higher than reality:

```
Screenshot example:
  Battery: −2427 W (discharging)
  Grid:     2453 W (should be ≈ 26 W — only the shortfall from the battery)

Correct equation:
  Grid Import = Home Load − Solar − Battery Discharge
             = 2453 − 0 − 2427
             = 26 W
```

## Skills

| Skill | When to use |
|-------|-------------|
| `/power-flow-diagnosis` | Values look inconsistent — diagnose which sensor is wrong |
| `/sensor-fix` | Generate corrected HA template sensor YAML |
| `/energy-dashboard` | Daily kWh totals are wrong or dashboard setup needs review |

## Quick Start

1. Run `/power-flow-diagnosis` with a description of the anomaly
2. Run `/sensor-fix <your inverter brand>` to get corrected YAML
3. Add the template sensors to `configuration.yaml` or a package file
4. Restart HA and verify readings satisfy the balance equation
5. Update the Energy Dashboard to use the corrected sensors

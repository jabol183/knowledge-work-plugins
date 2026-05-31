---
name: energy-dashboard
description: Set up or audit the Home Assistant Energy Dashboard for solar and battery systems. Use when daily kWh totals don't match expectations, when setting up the energy dashboard for the first time with a battery system, or when exported/imported energy figures seem off.
argument-hint: "<describe your setup, e.g. 'GivEnergy 5kW battery, 6kWp solar, SolarEdge inverter'>"
---

# /energy-dashboard

Audit and configure the Home Assistant Energy Dashboard for accurate solar + battery reporting.

## Usage

```
/energy-dashboard $ARGUMENTS
```

## How the Energy Dashboard Works

The Energy Dashboard integrates power (W) sensors over time to produce energy (kWh) totals. It requires **monotonically increasing** `total_increasing` sensors — not instantaneous power sensors — for grid import, export, solar yield, and battery charge/discharge.

```
┌─────────────────────────────────────────────────────────────────┐
│              ENERGY DASHBOARD SENSOR REQUIREMENTS                │
├─────────────────────────────────────────────────────────────────┤
│  Solar production  → kWh counter, total_increasing              │
│  Grid consumed     → kWh counter, total_increasing (import only)│
│  Grid returned     → kWh counter, total_increasing (export only)│
│  Battery in        → kWh counter, total_increasing (charge)     │
│  Battery out       → kWh counter, total_increasing (discharge)  │
│  Home consumption  → derived or metered, total_increasing       │
└─────────────────────────────────────────────────────────────────┘
```

## Common Dashboard Errors

### "Grid import too high" (matches your screenshot issue)
The grid import kWh sensor is accumulating from a consumption CT, not a grid meter. By end of day the import total includes all battery discharge too.

**Fix:** Use the corrected `sensor.grid_import_power` from `/sensor-fix` as the source for your Riemann sum, or use the inverter's own `grid_import_ct` entity if it exists.

### "Exported today shows 0 even though solar was generating"
The grid export sensor may not go negative (it's clipped to 0 on the raw reading). Check that your export sensor uses the corrected template from `/sensor-fix`.

### "Self-consumption % looks wrong"
Self-consumption = (Solar − Grid_Export) / Solar × 100. If grid export is overcounted (from bug above), self-consumption appears artificially low.

## Audit Checklist

```markdown
## Energy Dashboard Audit

### Sensor Inventory
- [ ] Solar yield sensor: entity_id, state_class = total_increasing
- [ ] Grid import sensor: entity_id, reads METER not consumption CT
- [ ] Grid export sensor: entity_id, reads METER not solar output
- [ ] Battery charge sensor: entity_id, state_class = total_increasing
- [ ] Battery discharge sensor: entity_id, state_class = total_increasing

### Daily Balance Check (end of day)
Solar_Generated = Home_Used + Grid_Exported − Grid_Imported + (Battery_End − Battery_Start)
If this doesn't balance within ~5%, a sensor is wrong.

### Sign Convention Confirmed
- [ ] Battery power: negative = discharging
- [ ] Grid power: positive = importing, negative = exporting
- [ ] All template sensors recalculated after confirming above
```

## Output Format

```markdown
## Energy Dashboard Report: [Date]

### Sensor Status
| Role | Entity | Value | Status |
|------|--------|-------|--------|
| Solar | sensor.X | X kWh | ✓/✗ |
| Grid Import | sensor.X | X kWh | ✓/✗ |
| Grid Export | sensor.X | X kWh | ✓/✗ |
| Battery In | sensor.X | X kWh | ✓/✗ |
| Battery Out | sensor.X | X kWh | ✓/✗ |

### Balance Equation
Solar (X) + Grid Import (X) = Home Load (X) + Grid Export (X) + Net Battery Δ (X)
Result: [BALANCED ✓ / DISCREPANCY: X kWh ✗]

### Issues Found
1. [Issue and fix]

### Recommended Changes
[YAML or configuration steps]
```

---
name: power-flow-diagnosis
description: Diagnose Home Assistant power flow sensor accuracy. Trigger when grid, battery, or solar readings look inconsistent — e.g. grid shows high import while battery is discharging, values don't balance, or the power flow card shows implausible numbers.
argument-hint: "<describe what looks wrong, e.g. 'grid shows 2453W import but battery is discharging 2427W'>"
---

# /power-flow-diagnosis

Diagnose and explain Home Assistant power flow sensor misconfigurations.

## Usage

```
/power-flow-diagnosis $ARGUMENTS
```

## The Core Equation

Energy in a home system must always balance:

```
Solar + Battery_Discharge + Grid_Import = Home_Load + Battery_Charge + Grid_Export
```

At any moment in time, every watt is accounted for. If your readings violate this equation, a sensor is misconfigured.

**Sign conventions used by most inverters:**
| Value | Positive means | Negative means |
|-------|---------------|----------------|
| Battery flow | Charging | Discharging |
| Grid flow | Importing | Exporting |
| Solar | Generating | — (never negative) |

## Common Misconfigurations

### 1. Grid sensor reads total home consumption
**Symptom:** Grid import ≈ Battery discharge + small offset when solar = 0 at night.  
**Example (your screenshot):** Grid = 2453 W, Battery = −2427 W → real grid draw ≈ 26 W.  
**Cause:** The integration maps a "total consumption" CT clamp to the grid entity instead of a dedicated grid meter.  
**Fix:** See `/sensor-fix` for the corrected template sensor YAML.

### 2. Battery sign convention inverted
**Symptom:** Battery shows positive when clearly discharging (LEDs, app, drop in SOC).  
**Fix:** Negate the raw sensor value in a template sensor.

### 3. Grid sensor is bidirectional but HA treats it as import-only
**Symptom:** Export shows 0 even when solar > load. Grid value bounces around zero but never goes negative.  
**Fix:** Use `sensor.grid_power` with both positive (import) and negative (export) values; split into two template sensors for the energy dashboard.

### 4. Double-counting via CT clamp placement
**Symptom:** When battery charges from grid, grid reads 2×charge rate.  
**Cause:** CT clamp is on the battery cable rather than the utility feed.  
**Fix:** Move the CT to the main incomer (between meter and consumer unit).

## How to Diagnose

```
┌─────────────────────────────────────────────────────────────────┐
│                  POWER FLOW DIAGNOSIS                            │
├─────────────────────────────────────────────────────────────────┤
│  Step 1: COLLECT current sensor values                           │
│  ✓ Solar W  ✓ Battery W (with sign)  ✓ Grid W (with sign)      │
│  ✓ Home load W (if available)  ✓ Battery SOC %                  │
│                                                                   │
│  Step 2: APPLY the balance equation                              │
│  calculated_load = solar + battery_discharge + grid_import       │
│  If calculated_load < 0 or > 20000 W → sensor error             │
│                                                                   │
│  Step 3: CROSS-CHECK with a known truth                          │
│  ✓ Does battery SOC match the discharge rate over time?          │
│  ✓ Does the smart meter reading match HA grid value?             │
│  ✓ Does inverter app show same values as HA sensors?             │
│                                                                   │
│  Step 4: IDENTIFY which sensor diverges                          │
│  Fix that sensor — see /sensor-fix                               │
└─────────────────────────────────────────────────────────────────┘
```

## Output Format

```markdown
## Power Flow Diagnosis

### Current Readings
| Sensor | Value | Sign OK? |
|--------|-------|----------|
| Solar | X W | ✓/✗ |
| Battery | X W | ✓/✗ |
| Grid | X W | ✓/✗ |
| Home Load | X W | derived |

### Balance Check
Expected home load: Solar + |Battery discharge| + Grid import = X W
Reported home load: X W
Discrepancy: X W → [OK / SENSOR ERROR]

### Root Cause
[Which sensor is wrong and why]

### Fix
[Link to corrected YAML or configuration steps]
```

## Tips

1. **At night with no solar** — the equation simplifies to `Battery_Discharge + Grid_Import = Home_Load`. This is the easiest time to spot misconfigurations.
2. **Grab values simultaneously** — use the HA Developer Tools → States and note all values within the same second to avoid race conditions.
3. **Compare to your inverter's own app** — manufacturer apps (SolarEdge, GivEnergy, Solis, Huawei, etc.) are the ground truth. HA sensors should match them.

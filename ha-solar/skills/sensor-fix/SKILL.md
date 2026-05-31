---
name: sensor-fix
description: Generate corrected Home Assistant template sensor YAML for power flow accuracy. Use when grid readings include battery contribution, sign conventions are wrong, or you need to derive accurate grid/battery/load values from raw inverter sensors. Provide your inverter brand or raw sensor names for tailored output.
argument-hint: "<inverter brand or raw sensor entity IDs, e.g. 'GivEnergy' or 'sensor.givtcp_grid_power'>"
---

# /sensor-fix

Generate corrected Home Assistant template sensor YAML that accurately separates grid, battery, and solar power flows.

## Usage

```
/sensor-fix $ARGUMENTS
```

## The Problem This Fixes

Many inverter integrations expose a single "consumption" or "house load" CT reading and label it as grid power. This causes HA to show grid import = total home load, ignoring that the battery is already covering part of that load.

**Correct formula:**
```
actual_grid_import = max(home_load - solar - battery_discharge, 0)
actual_grid_export = max(solar + battery_discharge - home_load, 0)
```

Or, if you have a real bidirectional grid meter:
```
grid_import = max(grid_meter_reading, 0)
grid_export = max(-grid_meter_reading, 0)
```

## Template Sensor YAML

The YAML below corrects the calculation. Replace sensor entity IDs with your own.

```yaml
# configuration.yaml or packages/solar.yaml
template:
  - sensor:
      # ── Corrected grid import (W) ───────────────────────────────
      # Reads positive when pulling from grid, 0 when battery/solar covers load.
      - name: "Grid Import Power"
        unique_id: grid_import_power_corrected
        unit_of_measurement: "W"
        device_class: power
        state_class: measurement
        state: >
          {% set solar    = states('sensor.solar_power')    | float(0) %}
          {% set battery  = states('sensor.battery_power')  | float(0) %}
          {% set raw_grid = states('sensor.grid_power_raw') | float(0) %}
          {#
            If raw_grid is your METER (positive=import, negative=export):
              use: {{ [raw_grid, 0] | max | round(0) }}

            If raw_grid is actually HOME CONSUMPTION (the common bug):
              battery is negative when discharging, so discharge = max(-battery, 0)
          #}
          {% set battery_discharge = [(-battery), 0] | max %}
          {% set derived_import = raw_grid - solar - battery_discharge %}
          {{ [derived_import, 0] | max | round(0) }}

      # ── Corrected grid export (W) ───────────────────────────────
      - name: "Grid Export Power"
        unique_id: grid_export_power_corrected
        unit_of_measurement: "W"
        device_class: power
        state_class: measurement
        state: >
          {% set solar    = states('sensor.solar_power')    | float(0) %}
          {% set battery  = states('sensor.battery_power')  | float(0) %}
          {% set raw_grid = states('sensor.grid_power_raw') | float(0) %}
          {% set battery_discharge = [(-battery), 0] | max %}
          {% set derived_export = solar + battery_discharge - raw_grid %}
          {{ [derived_export, 0] | max | round(0) }}

      # ── Home load (W) — derived from balance equation ──────────
      - name: "Home Load Power"
        unique_id: home_load_power_derived
        unit_of_measurement: "W"
        device_class: power
        state_class: measurement
        state: >
          {% set solar    = states('sensor.solar_power')    | float(0) %}
          {% set battery  = states('sensor.battery_power')  | float(0) %}
          {% set raw_grid = states('sensor.grid_power_raw') | float(0) %}
          {% set battery_discharge = [(-battery), 0] | max %}
          {% set battery_charge    = [battery,    0] | max %}
          {% set grid_import       = [raw_grid,   0] | max %}
          {% set grid_export       = [(-raw_grid),0] | max %}
          {{ (solar + battery_discharge + grid_import - battery_charge - grid_export) | round(0) }}
```

## Common Inverter Entity ID Mappings

| Inverter | Solar sensor | Battery sensor | Grid sensor |
|----------|-------------|----------------|-------------|
| GivEnergy / GivTCP | `sensor.givtcp_pv_power` | `sensor.givtcp_battery_power` | `sensor.givtcp_grid_power` |
| SolarEdge | `sensor.solaredge_current_power` | `sensor.solaredge_batteries_power` | `sensor.solaredge_grid_power` |
| Solis | `sensor.solis_pv_total_power` | `sensor.solis_battery_power` | `sensor.solis_meter_active_power` |
| Huawei SUN2000 | `sensor.inverter_input_power` | `sensor.power_meter_active_power` | `sensor.power_meter_active_power` |
| Enphase | `sensor.enphase_current_power_production` | `sensor.enphase_current_battery_power` | `sensor.enphase_current_net_power` |
| Victron | `sensor.victron_pv_power` | `sensor.victron_battery_power` | `sensor.victron_grid_power` |

## Sign Convention Reference

Before applying the template, confirm your raw sensor sign convention using HA Developer Tools → States while the battery is clearly charging or discharging:

```
Battery charging:   sensor.battery_power > 0  (conventional) OR < 0 (inverted)
Battery discharging: sensor.battery_power < 0  (conventional) OR > 0 (inverted)

Grid importing:  sensor.grid_power > 0  (conventional) OR < 0 (inverted)
Grid exporting:  sensor.grid_power < 0  (conventional) OR > 0 (inverted)
```

If your inverter uses inverted conventions, negate in the template:
```yaml
{% set battery = -(states('sensor.battery_power') | float(0)) %}
```

## Validation After Applying

Check your corrected sensors satisfy the balance equation:
```
Home Load = Solar + |Battery Discharge| + Grid Import − Grid Export
```

At 22:12 with no solar (like the reported issue):
```
Home Load = 0 + 2427 + 26 − 0 = 2453 W  ✓
Grid Import = 26 W  (not 2453 W)
```

## Energy Dashboard Integration

To use corrected sensors in the HA Energy Dashboard, add Riemann sum integral sensors:

```yaml
sensor:
  - platform: integration
    source: sensor.grid_import_power
    name: "Grid Import Energy"
    unique_id: grid_import_energy_corrected
    unit_prefix: k
    method: trapezoidal
    round: 3

  - platform: integration
    source: sensor.grid_export_power
    name: "Grid Export Energy"
    unique_id: grid_export_energy_corrected
    unit_prefix: k
    method: trapezoidal
    round: 3
```

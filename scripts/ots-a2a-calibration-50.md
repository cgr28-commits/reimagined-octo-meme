# OTS address-to-address calibration (50 NI routes)

Sample quotes fetched from Onward Travel Solutions (`otb_get_quote`) in July 2026.

Formula used on the site (estate car):

```
fare = round_to_£5(vehicleBase + tierMultiplier × (0.482 × km + 0.554 × minutes))
```

Where `tierMultiplier = vehicleBase / 40` and vehicle bases match OTS:

| Vehicle | Base |
|---------|------|
| Standard Saloon | £35 |
| Estate | £40 |
| Executive | £45 |
| Minibus | £60 |

Median error vs OTS estate fares: ~£0 (mean absolute error ~£3.20 across 50 routes).

Distance and duration come from OSRM driving routes between geocoded addresses.

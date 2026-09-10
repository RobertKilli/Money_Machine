# Asset Eligibility Policies

M5 versions are `asset-discovery/v1`, `asset-identity/v1`, `asset-quarantine/v1`,
`asset-evidence/v1`, and `asset-eligibility-policy/v1`. The deterministic test
profile is `mm-synthetic-eligibility-profile/v1`; it is an engineering fixture,
not investment advice or a safety guarantee.

Discovery uses only pinned M3 asset mappings and requires `availableAt <= asOf`.
Every discovered identity is `QUARANTINED`; eligibility never admits a tradable
asset. Contract identity is `chain + contract`; symbols alone never identify an
asset. Required evidence is integer, unit-bearing and time-stamped.

The profile requires age >=30 days, history >=14 days, venues >=2, liquidity
>=1,000,000, volume >=500,000, market cap >=10,000,000 minor units, top-10
concentration <=8,000 bps, single-holder <=3,000 bps, volatility <=20,000 bps,
verified contracts, and no suspicious flags. Missing or incomparable evidence is
`INCOMPLETE`; explicit violations are `INELIGIBLE`; all applicable checks passing
is `ELIGIBLE`. Monetary values must already be normalized to the profile currency.

M4 trend/context is retained as watch context only and cannot grant eligibility.

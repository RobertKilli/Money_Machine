# SEC recent-array limit review

The SEC submissions API contract documented in this repository says the
company response contains at least one year or the latest 1,000 submissions,
whichever is greater, and points to historical files for older filings. That
defines minimum coverage; it does not say a recent array has a maximum length
of 1,000. Therefore the adapter's former `> 1000` rejection was an
application-imposed ceiling that could reject a contract-valid response.

The local smoke scope separately limits each response body to 2 MiB. This
change raises the recent-array parser bound to 40,000 entries, which is well
above the documented 1,000-entry floor while keeping row validation bounded;
the transport byte cap remains the primary bound on actual response data. At
the exact row limit, the synthetic regression produces a body within 2 MiB
and verifies the selected filing. At 40,001 entries it expects the fixed,
value-free `ARRAY_LIMIT_EXCEEDED` diagnostic. Wrong field types continue to
produce `FIELD_INVALID`, and invalid element types produce
`ARRAY_ELEMENT_INVALID`.

The 40,000-entry ceiling is an explicit local parser safety limit, not an SEC
contract guarantee. A response that exceeds it is rejected even if its bytes
fit the transport limit. The regression proves only deterministic parser
behavior on synthetic data; it does not establish the cause of any previous
live response failure. No SEC request or other provider call was made.

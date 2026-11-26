export const paperDecisionReasonLabel = (reason: string) => ({
  SELL_STOP_LOSS: "Stop-loss utløst", SELL_TAKE_PROFIT: "Take-profit utløst", SELL_MAX_HOLD: "Maksimal holdetid nådd",
  SELL_ORDER_LIMIT_REJECTED: "Salg avvist av ordregrense", HOLD_NO_EXIT_TRIGGER: "Ingen exit-regel utløst",
  POLICY_NOT_ACTIVE: "Policyen var ikke aktiv", PRICE_MISSING: "Syntetisk pris manglet", PRICE_STALE: "Prisen var for gammel",
  INSTRUMENT_NOT_ALLOWED: "Instrumentet var utenfor mandatet", ORDER_LIMIT_EXCEEDED: "Ordregrensen var overskredet",
  POSITION_LIMIT_EXCEEDED: "Posisjonsgrensen var overskredet", EXPOSURE_LIMIT_EXCEEDED: "Samlet eksponeringsgrense var overskredet",
  CAPITAL_BUDGET_EXCEEDED: "Kapitalbudsjettet var overskredet", LOSS_LIMIT_EXCEEDED: "Beregnet eller forventet tap overskred tapsgrensen",
  BUY_RISK_REJECTED: "Kjøp avvist av risikokontrollen", M1_RISK_REJECTED: "Ordre avvist av risikokontrollen",
  BUY_FILLED: "Simulert kjøp gjennomført", APPROVED: "Godkjent innenfor mandatet",
} as Record<string, string>)[reason] ?? reason;

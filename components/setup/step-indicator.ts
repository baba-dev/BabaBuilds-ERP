export function getSetupStepNameKey(step: number): string {
  switch (step) {
    case 1:
      return "step_geo";
    case 2:
      return "step_finance";
    case 3:
      return "step_compliance";
    case 4:
      return "step_identity";
    case 5:
      return "step_integrations";
    case 6:
      return "step_shop";
    default:
      return "step_modules";
  }
}

import type { AppIntegrationKey } from "@scheduling/dto";

import { LoggerSettingsPanel } from "./panels/logger-settings-panel";
import type { IntegrationSettingsPanelComponent } from "./types";

const panelRegistry: Record<
  AppIntegrationKey,
  IntegrationSettingsPanelComponent
> = {
  logger: LoggerSettingsPanel,
};

export function getIntegrationSettingsPanel(
  key: AppIntegrationKey,
): IntegrationSettingsPanelComponent {
  return panelRegistry[key];
}

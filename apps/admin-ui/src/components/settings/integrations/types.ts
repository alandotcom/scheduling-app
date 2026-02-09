import type { IntegrationSettings } from "@scheduling/dto";
import type { ReactElement } from "react";

export interface IntegrationSettingsPanelProps {
  settings: IntegrationSettings;
}

export type IntegrationSettingsPanelComponent = (
  props: IntegrationSettingsPanelProps,
) => ReactElement;

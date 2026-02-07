// Backwards-compatible exports while routes migrate to workbench naming.

export {
  WorkbenchLayout as SplitPaneLayout,
  WorkbenchLayout,
  ListPanel,
  DetailPanel,
  DetailTabs,
  DetailTab,
  useDetailMode,
} from "@/components/workbench";
export type { DetailMode } from "@/components/workbench";

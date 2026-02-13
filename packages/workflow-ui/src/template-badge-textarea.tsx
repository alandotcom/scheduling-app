// oxlint-disable eslint-plugin-react/react-in-jsx-scope
import type {
  WorkflowActionCatalogItem,
  WorkflowGraphEdge,
  WorkflowGraphNode,
} from "@scheduling/dto";
import { TemplateBadgeInput } from "./template-badge-input";

type TemplateBadgeTextareaProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
  currentNodeId: string;
  actionCatalog: readonly WorkflowActionCatalogItem[];
  rows?: number | undefined;
};

export function TemplateBadgeTextarea({
  rows = 5,
  ...props
}: TemplateBadgeTextareaProps) {
  return <TemplateBadgeInput {...props} multiline rows={rows} />;
}

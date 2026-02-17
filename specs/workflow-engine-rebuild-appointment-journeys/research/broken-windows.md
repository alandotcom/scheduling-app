# Broken Windows

### [apps/admin-ui/src/features/workflows/workflow-editor-sidebar.tsx:323] Hardcoded legacy appointment fallback
**Type**: magic-values
**Risk**: Low
**Fix**: Replace hardcoded `"appointment.created"` fallback with a taxonomy-derived default from `domainEventTypesByDomain` to avoid silent drift on event rename.
**Code**:
```ts
function toScopedDomainEventType(
  domain: DomainEventDomain,
  branch: SwitchBranch,
): DomainEventType {
  const eventType = `${domain}.${branch}`;
  return isDomainEventType(eventType) ? eventType : "appointment.created";
}
```

### [apps/admin-ui/src/routes/_authenticated/workflows/$workflowId.tsx:267] Stale callback dependency in `saveWorkflow`
**Type**: dead-code
**Risk**: Low
**Fix**: Remove `setSelectedExecutionId` from the `useCallback` dependency list since it is not referenced in the callback body.
**Code**:
```ts
  const saveWorkflow = useCallback(async () => {
    if (!isLoaded || !canManageWorkflow) return;
    setIsSaving(true);
    try {
      await updateMutation.mutateAsync({
        id: workflowId,
        data: { graph },
      });
      setHasUnsavedChanges(false);
    } finally {
      setIsSaving(false);
    }
  }, [
    canManageWorkflow,
    graph,
    isLoaded,
    setHasUnsavedChanges,
    setIsSaving,
    setSelectedExecutionId,
    updateMutation,
    workflowId,
  ]);
```

### [apps/api/src/services/workflows.ts:279] Manual dedupe loop instead of collection helper
**Type**: complexity
**Risk**: Low
**Fix**: Replace manual `Set` + loop dedupe with `uniq(...)` from `es-toolkit` for consistency with repo collection helper guidance.
**Code**:
```ts
function dedupeEventTypes(values: DomainEventType[]): DomainEventType[] {
  const deduped: DomainEventType[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    deduped.push(value);
  }

  return deduped;
}
```

### [packages/db/package.json:15] Typo in test script log-level variable
**Type**: naming
**Risk**: Low
**Fix**: Correct `LOG_LEVE` to `LOG_LEVEL` so the intended quiet test logging env var is applied.
**Code**:
```json
"test": "LOG_LEVE=fatal bun test --concurrent"
```

export const workflowExecutionEventType = {
  runStarted: "run.started",
  runCompleted: "run.completed",
  runFailed: "run.failed",
  runLog: "run.log",
  runWaiting: "run.waiting",
  runResumed: "run.resumed",
  runCancelRequested: "run.cancel.requested",
  runCancelled: "run.cancelled",
} as const;

export type WorkflowExecutionEventType =
  (typeof workflowExecutionEventType)[keyof typeof workflowExecutionEventType];

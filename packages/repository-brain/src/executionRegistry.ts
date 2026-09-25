type ExecutionState = { cancelled: boolean; };

const executions = new Map<string, ExecutionState>();

export function createExecution(executionId: string): void {
  executions.set(executionId, { cancelled: false });
}

export function cancelExecution(executionId: string): boolean {
  const execution = executions.get(executionId);
  if (!execution) return false;
  execution.cancelled = true;
  return true;
}

export function isExecutionCancelled(executionId: string): boolean {
  return executions.get(executionId)?.cancelled === true;
}

export function removeExecution(executionId: string): void {
  executions.delete(executionId);
}
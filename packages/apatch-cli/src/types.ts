export type JsonObject = Record<string, unknown>;

export type RedactionCategory =
  | 'SECRET'
  | 'EMAIL'
  | 'PHONE'
  | 'PAYMENT_CARD'
  | 'IP_ADDRESS'
  | 'WALLET';

export type RedactionResult = {
  value: unknown;
  counts: Partial<Record<RedactionCategory, number>>;
  total: number;
};

export type FailureFinding = {
  type: 'tool_loop' | 'missing_purchase_constraints' | 'unsupported_citation';
  severity: 'medium' | 'high';
  title: string;
  description: string;
  event_index?: number;
  metadata: JsonObject;
};

export type PatchSpec = {
  schema: 'apatch/v0.1';
  id: string;
  name: string;
  version: string;
  description: string;
  runtimes: string[];
  trigger: {
    type: string;
    tool?: string;
  };
  intervention: {
    type: 'require_tool_arguments';
    tool: string;
    required: string[];
    on_failure: 'block';
  } | {
    type: 'limit_repeated_tool_calls';
    threshold: number;
    on_failure: 'replan' | 'hand_back';
  };
  verification: {
    fixture: string;
    minimum_pass_rate: number;
  };
  privacy: {
    redaction: 'local_required' | 'local_recommended';
  };
};

export type ToolArgumentFixtureCase = {
  name: string;
  input: {
    tool: string;
    arguments: JsonObject;
  };
  expect: {
    allow: boolean;
    missing?: string[];
  };
};

export type ToolLoopFixtureCase = {
  name: string;
  input: {
    history: Array<{ tool: string; arguments: JsonObject }>;
    current: { tool: string; arguments: JsonObject };
  };
  expect: {
    allow: boolean;
    action?: 'replan' | 'hand_back';
    repetitions?: number;
  };
};

export type PatchFixtureCase = ToolArgumentFixtureCase | ToolLoopFixtureCase;

export type PatchTestResult = {
  passed: boolean;
  passRate: number;
  minimumPassRate: number;
  passedCases: number;
  totalCases: number;
  cases: Array<{
    name: string;
    passed: boolean;
    expected: unknown;
    actual: unknown;
  }>;
};

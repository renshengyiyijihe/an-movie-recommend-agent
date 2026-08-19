export const AGENT_TYPES = ["search", "relation"] as const;

export type AgentType = (typeof AGENT_TYPES)[number];


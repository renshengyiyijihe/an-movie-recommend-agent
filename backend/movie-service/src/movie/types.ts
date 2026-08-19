export const AGENT_TYPES = ["search", "relation"] as const;

export type AgentType = (typeof AGENT_TYPES)[number];

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = [ChatRole, string];

export type CompatibleModel = {
	invoke(messages: ChatMessage[]): Promise<{ content: unknown }>;
};

export type IntentType = "in_scope" | "out_of_scope" | "unknown";

export interface IntentClassification {
	type: IntentType;
	confidence: number;
	reason?: string;
}

export interface AgentExecutionResult {
	agent: AgentType;
	success: boolean;
	result: string;
}

export interface OrchestratorResult {
	success: boolean;
	intent_type: IntentType;
	result: string;
	agents_used: AgentType[];
	agent_results?: AgentExecutionResult[];
	error?: string;
}

export interface SearchAgentResult {
	success: boolean;
	result: string;
	tool_calls: Array<{
		tool_name: string;
		input: Record<string, any>;
		output: any;
	}>;
	reasoning?: string;
	error?: string;
}

export type RelationshipType =
	| "collaboration"
	| "acted_in"
	| "directed"
	| "ranking"
	| "unknown";

export interface RelationAgentResult {
	success: boolean;
	result: string;
	entities_involved: string[];
	relationship_type: RelationshipType;
	error?: string;
}

export type MessageRole = "user" | "assistant";
export type MessageType = "user_query" | "agent_execution" | "final_response";
export type MessageStage =
	| "start"
	| "intent_classification"
	| "workflow_complete"
	| "final"
	| "parsePreferences_start"
	| "parsePreferences_completed"
	| "search_start"
	| "search_completed"
	| "supervisor_start"
	| "supervisor_completed";

export interface MoviePreference {
	genre?: string;
	mood?: string;
	actors?: string;
	length?: string;
	rating?: string;
	language?: string;
	scene?: string;
	theme?: string;
}

export interface ConversationHistoryItem {
	role: MessageRole;
	content: string;
	message_type: MessageType;
	stage: MessageStage;
}


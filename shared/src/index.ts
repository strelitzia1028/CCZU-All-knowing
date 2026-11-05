export type Role = 'user' | 'admin';

export interface SessionUser {
  id: string;
  username?: string;
  display_name: string;
  role: Role;
  token?: string;
}

export interface Tag {
  id: string;
  name: string;
  description: string | null;
  status: 'active' | 'disabled';
  created_at: string;
}

export interface KnowledgeTag {
  tag_id: string;
  tags: {
    id: string;
    name: string;
    description?: string | null;
  };
}

export interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  source_type: string | null;
  source_level: string;
  review_status: string;
  created_at: string;
  updated_at: string;
  source_id?: string | null;
  knowledge_item_tags: KnowledgeTag[];
}

export interface SourcePublicationPeriod {
  value: 'today' | 'week' | 'month' | 'year' | 'all';
  label: string;
}

export interface SourceItem {
  id: string;
  title: string;
  content: string;
  type: string;
  contact_mode: string;
  contact_value: string | null;
  valid_until: string | null;
  is_expired?: boolean;
  location: string | null;
  allow_discussion: boolean;
  status: string;
  reject_reason: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  profiles: { display_name: string } | null;
  source_tags: KnowledgeTag[];
  knowledge_item_id?: string | null;
}

export interface RetrievalSource {
  id: string;
  title: string;
  content?: string;
  source_level: string;
  updated_at: string;
  tag_match: number;
  overall_match: number;
  tags: Array<{ id: string; name: string; description?: string | null }>;
}

export interface CommunitySourceResult {
  id: string;
  title: string;
  content: string;
  excerpt: string;
  type: string;
  type_label: string;
  location: string | null;
  valid_until: string | null;
  is_expired: boolean;
  overall_match?: number;
  tag_match?: number;
  created_at: string;
  author: string;
  created_by: string;
  allow_discussion: boolean;
  tags: Array<{ id: string; name: string; description?: string | null }>;
}

export interface SourceComment {
  id: string;
  content: string;
  author_id: string;
  author_name: string;
  author_role?: Role;
  created_at: string;
}

export interface DirectMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  sender_name?: string;
  sender_role?: Role;
  created_at: string;
}

export interface InteractionNotification {
  id: string;
  kind: 'comment' | 'private_message';
  source_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
  actor_id: string;
  actor_name: string;
  actor_role: Role;
  source_title: string;
  source_excerpt: string;
  source_type_label: string;
  source_status: string;
  source_owner_id: string;
  source_owner_name: string;
  source_owner_role: Role;
  allow_discussion: boolean;
}

export interface MonitoredUser {
  id: string;
  username: string | null;
  display_name: string;
  role: 'user' | 'admin';
  created_at: string;
  source_count: number;
  approved_source_count: number;
  comment_count: number;
  message_count: number;
}

export interface AgentTraceStep {
  id: string;
  tool: string;
  label: string;
  status: 'running' | 'completed' | 'warning';
  summary: string;
  duration_ms: number;
}

export interface AgentDraft {
  title: string;
  content: string;
  type: string;
  type_label: string;
  location: string | null;
  contact_mode: 'platform';
  tag_ids: string[];
  tag_names: string[];
  new_tag_names?: string[];
  new_type_suggestion?: {
    label: string;
    code: string;
    description?: string | null;
  } | null;
  source_id?: string | null;
  revision_of_message_id?: string | null;
}

export interface CreatedCatalogRequest {
  id: string;
  request_type: 'tag' | 'source_type';
  name: string;
  code: string | null;
  description: string | null;
}

export type ChatStreamMetadata = {
  type: 'metadata';
  category: string;
  session_id: string;
  database_available: boolean;
  need_summary: string;
  extracted_tags: string[];
  sources: RetrievalSource[];
  community_sources: CommunitySourceResult[];
  agent_trace: AgentTraceStep[];
  draft: AgentDraft | null;
  resolved_request: string;
  context_reason: string | null;
  catalog_requests: CreatedCatalogRequest[];
  requires_fallback: boolean;
  search_attempts: {
    knowledge: Array<{
      attempt: number;
      count: number;
      bestScore: number;
      candidateCount?: number;
      threshold?: number;
      strategy?: string;
    }>;
    sources: Array<{
      attempt: number;
      count: number;
      bestScore: number;
      candidateCount?: number;
      threshold?: number;
      strategy?: string;
    }>;
  };
};

export type ChatStreamEvent =
  | { type: 'started'; session_id: string }
  | { type: 'agent_trace'; step: AgentTraceStep }
  | ChatStreamMetadata
  | { type: 'chunk'; content: string }
  | { type: 'done' }
  | { type: 'error'; error: string };

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

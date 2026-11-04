export type Role = 'user' | 'admin';

export interface SessionUser {
  id: string;
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
  };
}

export interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  source_level: string;
  review_status: string;
  created_at: string;
  updated_at: string;
  knowledge_item_tags: KnowledgeTag[];
}

export interface SourceItem {
  id: string;
  title: string;
  content: string;
  type: string;
  contact_mode: string;
  contact_value: string | null;
  valid_until: string | null;
  location: string | null;
  status: string;
  reject_reason: string | null;
  created_at: string;
  updated_at: string;
  profiles: { display_name: string } | null;
  source_tags: KnowledgeTag[];
}

export interface RetrievalSource {
  id: string;
  title: string;
  source_level: string;
  updated_at: string;
  tag_match: number;
  overall_match: number;
  tags: Array<{ id: string; name: string }>;
}

export type ChatStreamMetadata = {
  type: 'metadata';
  category: string;
  session_id: string;
  database_available: boolean;
  extracted_tags: string[];
  sources: RetrievalSource[];
};

export type ChatStreamEvent =
  | ChatStreamMetadata
  | { type: 'chunk'; content: string }
  | { type: 'done' }
  | { type: 'error'; error: string };

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

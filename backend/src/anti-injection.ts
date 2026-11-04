/**
 * Sanitize knowledge content to prevent prompt injection.
 * Strips instruction-like text that could manipulate LLM behavior.
 */
export function sanitizeKnowledgeContent(content: string): string {
  // Remove common injection patterns
  const patterns = [
    /忽略上述规则/gi,
    /忽略以上指令/gi,
    /忽略.*指令/gi,
    /系统提示[：:]/gi,
    /你是一个/gi,
    /请忽略/gi,
    /你现在是/gi,
    /新的指令[：:]/gi,
    /override previous/gi,
    /ignore (all )?previous/gi,
    /ignore (all )?above/gi,
    /disregard (all )?previous/gi,
    /forget (all )?instructions/gi,
    /你现在的角色是/gi,
    /请按照以下/gi,
    /重要[：:]\s*请/gi,
  ];

  let sanitized = content;
  for (const pattern of patterns) {
    sanitized = sanitized.replace(pattern, '[内容已过滤]');
  }

  return sanitized;
}

/**
 * Strip the "【示例数据，需替换】" marker from content for display in LLM context.
 */
export function stripDemoMarker(content: string): string {
  return content.replace(/^【示例数据，需替换】\n?/, '');
}

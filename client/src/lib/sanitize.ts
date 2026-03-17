export function sanitizeJson(jsonStr: string): string {
  let sanitized = jsonStr;

  // Fix missing closing brace before comma
  sanitized = sanitized.replace(/("(?:[^"\\]|\\.)*")\s*\n\s*,\s*\n/g, '$1\n},\n');
  sanitized = sanitized.replace(/(null|true|false)\s*\n\s*,\s*\n/g, '$1\n},\n');
  sanitized = sanitized.replace(/(\d+(?:\.\d+)?)\s*\n\s*,\s*\n/g, '$1\n},\n');

  // Remove stray words after valid JSON values
  sanitized = sanitized.replace(/("(?:[^"\\]|\\.)*")\s*\n\s*[a-zA-Z][a-zA-Z0-9-_]*\s*\n(\s*[,}\]])/g, '$1\n$2');
  sanitized = sanitized.replace(/(null|true|false)\s*\n\s*[a-zA-Z][a-zA-Z0-9-_]*\s*\n(\s*[,}\]])/g, '$1\n$2');
  sanitized = sanitized.replace(/(\d+(?:\.\d+)?)\s*\n\s*[a-zA-Z][a-zA-Z0-9-_]*\s*\n(\s*[,}\]])/g, '$1\n$2');

  // Inline random words after values
  sanitized = sanitized.replace(/("(?:[^"\\]|\\.)*")\s+[a-zA-Z][a-zA-Z0-9-_]*\s*([,}\]])/g, '$1$2');
  sanitized = sanitized.replace(/(null|true|false)\s+[a-zA-Z][a-zA-Z0-9-_]*\s*([,}\]])/g, '$1$2');
  sanitized = sanitized.replace(/(\d+(?:\.\d+)?)\s+[a-zA-Z][a-zA-Z0-9-_]*\s*([,}\]])/g, '$1$2');

  return sanitized;
}

export function explainError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/not found|ENOENT/i.test(text))
    return "Codex not found. Install the Codex CLI, then restart Koodex.";
  if (/sign in|not logged|unauthoriz|authentication|401/i.test(text))
    return "Sign in to Codex first. Run codex login in your terminal.";
  return "Unable to read Codex usage. Retrying automatically.";
}

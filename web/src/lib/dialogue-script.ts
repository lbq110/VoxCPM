export type DialogueLine = { speaker: string; line: string };

/**
 * Parse a 「speaker：line」 transcript into structured rows for two-voice
 * narration. Tolerates ASCII/full-width colons; skips headings, stage
 * directions and narration (a real speaker label is short).
 */
export function parseDialogueScript(transcript: string): DialogueLine[] {
  const rows: DialogueLine[] = [];
  for (const raw of transcript.split("\n")) {
    const text = raw.trim();
    if (!text) continue;
    const match = text.match(/^([^：:]{1,12})[：:]\s*(.+)$/);
    if (!match) continue;
    const speaker = match[1].trim();
    const line = match[2].trim();
    if (!speaker || !line) continue;
    // headings/markdown/stage directions are not dialogue
    if (/^[#（(【\[]/.test(speaker)) continue;
    rows.push({ speaker, line });
  }
  return rows;
}

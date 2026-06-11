import { describe, expect, it } from "vitest";
import { parseDialogueScript } from "./dialogue-script";

describe("parseDialogueScript", () => {
  it("parses speaker-labelled lines", () => {
    const script = [
      "许知远式：你注意到没有，小说一开场就是一次来访。",
      "研究者：对，这个开场把交易和身份确认放在了一起。",
    ].join("\n");
    expect(parseDialogueScript(script)).toEqual([
      { speaker: "许知远式", line: "你注意到没有，小说一开场就是一次来访。" },
      { speaker: "研究者", line: "对，这个开场把交易和身份确认放在了一起。" },
    ]);
  });

  it("accepts both full-width and ASCII colons", () => {
    const rows = parseDialogueScript("甲: 第一句。\n乙：第二句。");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ speaker: "甲", line: "第一句。" });
  });

  it("skips blank lines and non-dialogue noise", () => {
    const rows = parseDialogueScript("\n# 标题\n甲：台词。\n\n（舞台说明）\n乙：第二句。\n");
    expect(rows.map((r) => r.speaker)).toEqual(["甲", "乙"]);
  });

  it("keeps colons inside the line content", () => {
    const rows = parseDialogueScript("甲：我说：这就是答案。");
    expect(rows[0].line).toBe("我说：这就是答案。");
  });

  it("ignores lines with implausibly long speaker names (not dialogue)", () => {
    const rows = parseDialogueScript("这是一句普通的叙述文字，里面恰好有：一个冒号。\n甲：真台词。");
    expect(rows).toHaveLength(1);
    expect(rows[0].speaker).toBe("甲");
  });

  it("returns empty for empty input", () => {
    expect(parseDialogueScript("")).toEqual([]);
  });
});

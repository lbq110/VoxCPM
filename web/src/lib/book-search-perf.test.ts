import { describe, expect, it } from "vitest";
import type { BookBlock } from "./book-parser";
import { searchReadBlocks } from "./book-search";

describe("whole-book search performance (500k chars)", () => {
  it("searches ~8000 blocks in acceptable time", () => {
    const blocks: BookBlock[] = Array.from({ length: 8000 }, (_, i) => ({
      id: `b${i}`,
      text: `第${i}段：其实我对已知历史也没有特别强烈个人看法，凡广为流传的过往都确曾发生过，差别只在叙事策略或史家个人局限上。`,
      kind: "paragraph",
    }));
    blocks[7500] = { id: "b7500", text: "呼衍朵尼驮着紫貂皮和河磨玉来访，自上谷入境。", kind: "paragraph" };

    const t0 = performance.now();
    const hits = searchReadBlocks(blocks, null, "呼衍朵尼带了什么礼物", 10);
    const ms = performance.now() - t0;
    console.log(`[perf] 8000 blocks (~500k chars) searched in ${ms.toFixed(0)}ms`);

    expect(hits[0]?.text).toContain("紫貂皮");
    expect(ms).toBeLessThan(1000);
  });
});

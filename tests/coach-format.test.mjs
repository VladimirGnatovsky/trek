import test from "node:test";
import assert from "node:assert/strict";
import { parseCoachAnswer } from "../src/coach-format.js";

test("formats the plain sections returned by Trek Coach", () => {
  const blocks = parseCoachAnswer(`Insight\nYou are inside plan.\n\nNext steps\n1. Keep daily spending below 49 EUR.\n2. Review the Fun budget.\n\nReflection question\nWhat small change can you make?`);
  assert.deepEqual(blocks, [
    { type: "heading", text: "Insight" },
    { type: "paragraph", text: "You are inside plan." },
    { type: "heading", text: "Next steps" },
    { type: "ordered-list", items: ["Keep daily spending below 49 EUR.", "Review the Fun budget."] },
    { type: "heading", text: "Reflection question" },
    { type: "paragraph", text: "What small change can you make?" },
  ]);
});

test("also accepts markdown headings and bullet lists", () => {
  assert.deepEqual(parseCoachAnswer("## Summary\n\n- First point\n- Second point"), [
    { type: "heading", text: "Summary" },
    { type: "list", items: ["First point", "Second point"] },
  ]);
});

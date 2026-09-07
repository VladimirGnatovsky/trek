const PLAIN_HEADINGS = /^(?:\*\*)?(insight|next steps?|reflection question|summary|recommendation|recommendations|action plan|why it matters|watch next|wniosek|następne kroki|pytanie do refleksji|podsumowanie|rekomendacje?|plan działania|dlaczego to ważne|висновок|наступні кроки|питання для роздумів|підсумок|рекомендації|план дій|чому це важливо)(?:\*\*)?\s*:?\s*$/i;

const cleanHeading = (value) => String(value)
  .replace(/^#{1,4}\s*/, "")
  .replace(/^\*\*|\*\*$/g, "")
  .replace(/:\s*$/, "")
  .trim();

export function parseCoachAnswer(value) {
  const lines = String(value || "").replace(/\r/g, "").split("\n");
  const blocks = [];
  let paragraph = [];
  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: "paragraph", text: paragraph.join(" ").trim() });
    paragraph = [];
  };

  for (const source of lines) {
    const line = source.trim();
    if (!line) {
      flushParagraph();
      continue;
    }

    const markdownHeading = line.match(/^#{1,4}\s+(.+)$/);
    if (markdownHeading || PLAIN_HEADINGS.test(line)) {
      flushParagraph();
      blocks.push({ type: "heading", text: cleanHeading(markdownHeading?.[1] || line) });
      continue;
    }

    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    const bullet = line.match(/^[-*•]\s+(.+)$/);
    if (ordered || bullet) {
      flushParagraph();
      const type = ordered ? "ordered-list" : "list";
      const text = (ordered || bullet)[1].trim();
      const previous = blocks[blocks.length - 1];
      if (previous?.type === type) previous.items.push(text);
      else blocks.push({ type, items: [text] });
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  return blocks;
}

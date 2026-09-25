// Token accounting shared by offline (daemon) and live (record-live) results.
// Text: ~3.5 characters per token for snapshot/JSON-like text (both what the driver sends and what the
// tool returns land in the driver's context). Images: Anthropic's documented w*h/750, after the API's
// downscale to <=1568 px on the long edge and <=~1.15 MP.
export function imageTokens([w, h]) {
  let s = Math.min(1, 1568 / Math.max(w, h));
  if (w * h * s * s > 1_150_000) s = Math.sqrt(1_150_000 / (w * h));
  return Math.ceil((w * s) * (h * s) / 750);
}

export function tokensFor(calls) {
  let chars_in = 0; let chars_out = 0; let images = 0; let img_tokens = 0; let tool_ms = 0; let harness_chars = 0;
  for (const c of calls) {
    if (c.role === 'harness') { harness_chars += (c.args_chars || 0) + (c.out_chars || 0); continue; }
    chars_in += c.args_chars || 0;
    chars_out += c.out_chars || 0;
    if (c.image) { images += 1; img_tokens += imageTokens(c.image); }
    tool_ms += c.ms || 0;
  }
  return {
    brain_calls: calls.filter((c) => c.role !== 'harness').length,
    chars_in, chars_out, images, img_tokens, tool_ms, harness_chars,
    token_est: Math.ceil((chars_in + chars_out) / 3.5) + img_tokens,
  };
}

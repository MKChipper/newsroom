import { query } from "@anthropic-ai/claude-agent-sdk";
import { claudeModel, claudeSdkEnv } from "./env.mjs";

try {
  let result = "";
  const model = claudeModel();
  const session = query({
    prompt: "Return exactly OK.",
    options: {
      allowedTools: [],
      permissionMode: "bypassPermissions",
      maxTurns: 1,
      ...(model ? { model } : {}),
      env: claudeSdkEnv(),
    },
  });

  for await (const message of session) {
    if (message.type === "result") {
      result = String(message.result ?? "").trim();
      if (message.is_error) throw new Error(result);
    }
  }

  console.log(/^OK\.?$/i.test(result) ? "Claude SDK auth OK" : `Claude SDK responded: ${result}`);
} catch (err) {
  console.error(`Claude SDK auth failed: ${err.message}`);
  process.exit(1);
}

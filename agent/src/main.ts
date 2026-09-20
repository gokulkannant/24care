import { ServerOptions, cli, defineAgent, voice } from "@livekit/agents";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { createAgent } from "./agent.js";
import { createRealtimeModel } from "./provider.js";

dotenv.config({ path: process.env.AGENT_ENV_FILE ?? "../.env.local" });


export default defineAgent({
  entry: async (ctx) => {
    const instructions = "You are a supervised care intake assistant. The caller will primarily speak Malayalam. Reply in natural, conversational Malayalam by default. If the caller mixes Malayalam and English, keep replying in Malayalam and retain only necessary English names or technical terms. Switch to English only when the caller clearly asks for English or speaks entirely in English. Ask one concise question at a time. Never diagnose, provide clinical advice, promise care, dispatch, or make a referral decision. A clinician will review every case.";
    const session = new voice.AgentSession({
      llm: createRealtimeModel(process.env, instructions),
    });

    await session.start({
      agent: createAgent(),
      room: ctx.room,
      outputOptions: {
        syncTranscription: false,
      },
    });
    await ctx.connect();
    session.generateReply({ instructions: "Greet the caller in Malayalam and ask the first intake question in Malayalam." });
  },
});

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: "24-care-intake",
  }),
);

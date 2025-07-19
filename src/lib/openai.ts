import { OpenAI } from "openai";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";

const getApiKey = (): string => {
  return process.env.OPENAI_API_KEY || "placeholder";
};

let client: OpenAI;

export const getOpenAIClient = (): OpenAI => {
    if (!client) {
        const apiKey = getApiKey();
        client = new OpenAI({ apiKey });
    }
    return client;
};

export const generateItinerary = async (destination: string, duration: number) => {
    const client = getOpenAIClient();
    const model = "gpt-4o";
    const messages: ChatCompletionMessageParam[] = [
        { role: "system", content: "You are a helpful travel assistant." },
        { role: "user", content: `Generate a ${duration}-day itinerary for a trip to ${destination}.` },
    ];

    try {
        const result = await client.chat.completions.create({
            model: model,
            messages: messages,
        });
        return result.choices[0].message?.content;
    } catch (error) {
        console.error("Error generating itinerary:", error);
        return null;
    }
};

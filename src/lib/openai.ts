import { AzureOpenAI } from "openai";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";

const endpoint = process.env.AZURE_OPENAI_ENDPOINT || "https://placeholder.openai.azure.com/";
const azureApiKey = process.env.AZURE_OPENAI_KEY || "placeholder";

let client: AzureOpenAI;

export const getOpenAIClient = () => {
    if (!client) {
        client = new AzureOpenAI({ endpoint, apiKey: azureApiKey, apiVersion: "2024-05-01-preview" });
    }
    return client;
}

export const generateItinerary = async (destination: string, duration: number) => {
    const client = getOpenAIClient();
    const deployment = "gpt-4";
    const messages: ChatCompletionMessageParam[] = [
        { role: "system", content: "You are a helpful travel assistant." },
        { role: "user", content: `Generate a ${duration}-day itinerary for a trip to ${destination}.` },
    ];

    try {
        const result = await client.chat.completions.create({
            model: deployment,
            messages: messages,
        });
        return result.choices[0].message?.content;
    } catch (error) {
        console.error("Error generating itinerary:", error);
        return null;
    }
};

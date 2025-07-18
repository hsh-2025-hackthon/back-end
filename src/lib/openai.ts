import { OpenAIClient, AzureKeyCredential } from "@azure/openai";

const endpoint = process.env.AZURE_OPENAI_ENDPOINT || "https://placeholder.openai.azure.com/";
const azureApiKey = process.env.AZURE_OPENAI_KEY || "placeholder";

let client: OpenAIClient;

export const getOpenAIClient = () => {
    if (!client) {
        client = new OpenAIClient(endpoint, new AzureKeyCredential(azureApiKey));
    }
    return client;
}

export const generateItinerary = async (destination: string, duration: number) => {
    const client = getOpenAIClient();
    const deploymentId = "gpt-4";
    const messages = [
        { role: "system", content: "You are a helpful travel assistant." },
        { role: "user", content: `Generate a ${duration}-day itinerary for a trip to ${destination}.` },
    ];

    try {
        const result = await client.getChatCompletions(deploymentId, messages);
        return result.choices[0].message?.content;
    } catch (error) {
        console.error("Error generating itinerary:", error);
        return null;
    }
};

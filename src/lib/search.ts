import { SearchClient, AzureKeyCredential } from "@azure/search-documents";

const endpoint = process.env.AZURE_SEARCH_ENDPOINT || "https://placeholder.search.windows.net";
const apiKey = process.env.AZURE_SEARCH_KEY || "placeholder";
const indexName = "travel-destinations";

let client: SearchClient<any>;

export const getSearchClient = () => {
    if (!client) {
        client = new SearchClient<any>(endpoint, indexName, new AzureKeyCredential(apiKey));
    }
    return client;
}

export const searchDestinations = async (searchText: string, embedding: number[]) => {
    const client = getSearchClient();

    const results = await client.search(searchText, {
        vectorQueries: [{
            vector: embedding,
            k: 10,
            fields: ['embedding']
        }]
    });

    return results;
};

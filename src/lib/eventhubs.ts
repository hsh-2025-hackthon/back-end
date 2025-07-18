import { EventHubProducerClient } from "@azure/event-hubs";

const connectionString = process.env.AZURE_EVENTHUBS_CONNECTION_STRING || "Endpoint=sb://placeholder.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=placeholder";
const eventHubName = "travel-events";

let producerClient: EventHubProducerClient;

export const getEventHubProducerClient = () => {
    if (!producerClient) {
        producerClient = new EventHubProducerClient(connectionString, eventHubName);
    }
    return producerClient;
}

export const sendAnalyticsEvent = async (event: any) => {
    const producer = getEventHubProducerClient();
    const batch = await producer.createBatch();
    batch.tryAdd({ body: event });
    await producer.sendBatch(batch);
};

import { ServiceBusClient } from "@azure/service-bus";

const connectionString = process.env.AZURE_SERVICEBUS_CONNECTION_STRING || "Endpoint=sb://placeholder.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=placeholder";
const queueName = "trip-updates";

let sbClient: ServiceBusClient;

export const getServiceBusClient = () => {
    if (!sbClient) {
        sbClient = new ServiceBusClient(connectionString);
    }
    return sbClient;
}

export const sendTripUpdateMessage = async (message: any) => {
    const client = getServiceBusClient();
    const sender = client.createSender(queueName);

    try {
        await sender.sendMessages({ body: message });
    } finally {
        await sender.close();
    }
};

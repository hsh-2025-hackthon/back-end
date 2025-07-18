import { WebPubSubServiceClient } from '@azure/web-pubsub';

const connectionString = process.env.WEPUBSUB_CONNECTION_STRING || 'Endpoint=https://placeholder.webpubsub.azure.com;AccessKey=placeholder;Version=1.0;';
const hubName = 'collaborationHub';

let serviceClient: WebPubSubServiceClient;

export const getWebPubSubServiceClient = () => {
  if (!serviceClient) {
    serviceClient = new WebPubSubServiceClient(connectionString, hubName);
  }
  return serviceClient;
};

export const getWebPubSubAccessToken = async (tripId: string, userId: string) => {
  const client = getWebPubSubServiceClient();
  const token = await client.getClientAccessToken({
    userId,
    roles: [`webpubsub.sendToGroup.${tripId}`],
  });
  return token;
};

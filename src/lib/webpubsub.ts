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
    roles: [`webpubsub.sendToGroup.${tripId}`, `webpubsub.sendToGroup.chat_${tripId}`],
  });
  return token;
};

// Chat-specific WebSocket functions
export const broadcastToChatRoom = async (roomId: string, message: any) => {
  const client = getWebPubSubServiceClient();
  await client.group(`chat_${roomId}`).sendToAll(message);
};

export const broadcastToTrip = async (tripId: string, message: any) => {
  const client = getWebPubSubServiceClient();
  await client.group(tripId).sendToAll(message);
};

export const addUserToGroup = async (userId: string, groupName: string) => {
  const client = getWebPubSubServiceClient();
  await client.group(groupName).addUser(userId);
};

export const removeUserFromGroup = async (userId: string, groupName: string) => {
  const client = getWebPubSubServiceClient();
  await client.group(groupName).removeUser(userId);
};

export const notifyUserTyping = async (roomId: string, userId: string, isTyping: boolean) => {
  const client = getWebPubSubServiceClient();
  await client.group(`chat_${roomId}`).sendToAll({
    type: 'user_typing',
    data: {
      userId,
      isTyping,
      timestamp: new Date().toISOString()
    }
  });
};

export const notifyUserPresence = async (roomId: string, userId: string, isOnline: boolean) => {
  const client = getWebPubSubServiceClient();
  await client.group(`chat_${roomId}`).sendToAll({
    type: 'user_presence',
    data: {
      userId,
      isOnline,
      timestamp: new Date().toISOString()
    }
  });
};

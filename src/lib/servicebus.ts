import { ServiceBusClient, ServiceBusMessage, ServiceBusReceiver } from "@azure/service-bus";
import { getServiceBusConnectionString } from './keyvault';

interface CommandMessage {
  id: string;
  type: string;
  aggregateId: string;
  data: any;
  timestamp: Date;
  userId: string;
}

interface EventMessage {
  id: string;
  type: string;
  aggregateId: string;
  data: any;
  timestamp: Date;
  version: number;
}

let sbClient: ServiceBusClient;

export const getServiceBusClient = (): ServiceBusClient => {
  if (!sbClient) {
    const connectionString = getServiceBusConnectionString();
    sbClient = new ServiceBusClient(connectionString);
  }
  return sbClient;
};

// Command handling for CQRS pattern
export const sendCommand = async (command: CommandMessage): Promise<void> => {
  const client = getServiceBusClient();
  const sender = client.createSender('trip-commands');

  try {
    const message: ServiceBusMessage = {
      body: command,
      messageId: command.id,
      contentType: 'application/json',
      correlationId: command.aggregateId
    };

    await sender.sendMessages(message);
    console.log(`Command ${command.type} sent for aggregate ${command.aggregateId}`);
  } catch (error) {
    console.error('Failed to send command:', error);
    throw error;
  } finally {
    await sender.close();
  }
};

// Event publishing for event sourcing
export const publishEvent = async (event: EventMessage): Promise<void> => {
  const client = getServiceBusClient();
  const sender = client.createSender('trip-events');

  try {
    const message: ServiceBusMessage = {
      body: event,
      messageId: event.id,
      contentType: 'application/json',
      correlationId: event.aggregateId,
      applicationProperties: {
        eventType: event.type,
        aggregateId: event.aggregateId,
        version: event.version
      }
    };

    await sender.sendMessages(message);
    console.log(`Event ${event.type} published for aggregate ${event.aggregateId}`);
  } catch (error) {
    console.error('Failed to publish event:', error);
    throw error;
  } finally {
    await sender.close();
  }
};

// Trip-specific command handlers
export const sendTripCommand = async (
  type: 'CREATE_TRIP' | 'UPDATE_TRIP' | 'DELETE_TRIP' | 'ADD_COLLABORATOR' | 'REMOVE_COLLABORATOR',
  aggregateId: string,
  data: any,
  userId: string
): Promise<void> => {
  const command: CommandMessage = {
    id: generateId(),
    type,
    aggregateId,
    data,
    timestamp: new Date(),
    userId
  };

  await sendCommand(command);
};

// Trip-specific event publishers
export const publishTripEvent = async (
  type: 'TRIP_CREATED' | 'TRIP_UPDATED' | 'TRIP_DELETED' | 'COLLABORATOR_ADDED' | 'COLLABORATOR_REMOVED',
  aggregateId: string,
  data: any,
  version: number
): Promise<void> => {
  const event: EventMessage = {
    id: generateId(),
    type,
    aggregateId,
    data,
    timestamp: new Date(),
    version
  };

  await publishEvent(event);
};

// Command processor for handling incoming commands
export const processCommands = async (processor: (command: CommandMessage) => Promise<void>): Promise<void> => {
  const client = getServiceBusClient();
  const receiver = client.createReceiver('trip-commands');

  receiver.subscribe({
    processMessage: async (brokeredMessage) => {
      try {
        const command = brokeredMessage.body as CommandMessage;
        console.log(`Processing command ${command.type} for aggregate ${command.aggregateId}`);
        
        await processor(command);
        
        // Complete the message to remove it from the queue
        await receiver.completeMessage(brokeredMessage);
      } catch (error) {
        console.error('Error processing command:', error);
        // Dead letter the message if processing fails
        await receiver.deadLetterMessage(brokeredMessage, {
          deadLetterReason: 'ProcessingError',
          deadLetterErrorDescription: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    },
    processError: async (args) => {
      console.error('Error in command processor:', args.error);
    }
  });
};

// Event processor for handling published events
export const processEvents = async (processor: (event: EventMessage) => Promise<void>): Promise<void> => {
  const client = getServiceBusClient();
  const receiver = client.createReceiver('trip-events');

  receiver.subscribe({
    processMessage: async (brokeredMessage) => {
      try {
        const event = brokeredMessage.body as EventMessage;
        console.log(`Processing event ${event.type} for aggregate ${event.aggregateId}`);
        
        await processor(event);
        
        // Complete the message to remove it from the queue
        await receiver.completeMessage(brokeredMessage);
      } catch (error) {
        console.error('Error processing event:', error);
        // Dead letter the message if processing fails
        await receiver.deadLetterMessage(brokeredMessage, {
          deadLetterReason: 'ProcessingError',
          deadLetterErrorDescription: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    },
    processError: async (args) => {
      console.error('Error in event processor:', args.error);
    }
  });
};


// Utility function to generate unique IDs
export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Graceful shutdown
export const closeServiceBusClient = async (): Promise<void> => {
  if (sbClient) {
    await sbClient.close();
  }
};

import { getRedisClient } from './redis';
import { randomBytes } from 'crypto';

const streamName = "travel-analytics";

export const sendAnalyticsEvent = async (event: any) => {
    const redis = getRedisClient();
    
    try {
        // Add event to Redis Stream with automatic ID generation
        const eventId = await redis.xadd(
            streamName,
            '*', // Auto-generate ID
            'id', randomBytes(8).toString('hex'),
            'type', event.type || 'analytics',
            'data', JSON.stringify(event),
            'timestamp', new Date().toISOString(),
            'source', event.source || 'travel-app'
        );
        
        console.log(`Analytics event sent to stream ${streamName} with ID: ${eventId}`);
    } catch (error) {
        console.error('Failed to send analytics event:', error);
        throw error;
    }
};

// Function to create consumer group for analytics processing
export const createAnalyticsConsumerGroup = async (groupName: string = 'analytics-processors') => {
    const redis = getRedisClient();
    
    try {
        await redis.xgroup('CREATE', streamName, groupName, '0', 'MKSTREAM');
        console.log(`Created consumer group ${groupName} for stream ${streamName}`);
    } catch (error: any) {
        if (error.message.includes('BUSYGROUP')) {
            console.log(`Consumer group ${groupName} already exists`);
        } else {
            console.error('Failed to create consumer group:', error);
            throw error;
        }
    }
};

// Function to process analytics events from stream
export const processAnalyticsEvents = async (
    consumerName: string,
    groupName: string = 'analytics-processors',
    processor: (events: any[]) => Promise<void>
) => {
    const redis = getRedisClient();
    
    // Ensure consumer group exists
    await createAnalyticsConsumerGroup(groupName);
    
    while (true) {
        try {
            // Read from stream using consumer group
            const results = await redis.xreadgroup(
                'GROUP',
                groupName,
                consumerName,
                'COUNT',
                10, // Process up to 10 events at a time
                'BLOCK',
                5000, // Block for 5 seconds if no events
                'STREAMS',
                streamName,
                '>' // Only read new messages
            );
            
            if (results && results.length > 0) {
                const [streamResult] = results as any;
                const [, messages] = streamResult;
                
                if (messages && messages.length > 0) {
                    // Parse messages
                    const events = messages.map(([id, fields]: [string, string[]]) => {
                        const eventData: any = { id };
                        for (let i = 0; i < fields.length; i += 2) {
                            eventData[fields[i]] = fields[i + 1];
                        }
                        // Parse JSON data
                        if (eventData.data) {
                            try {
                                eventData.data = JSON.parse(eventData.data);
                            } catch (e) {
                                console.warn('Failed to parse event data:', eventData.data);
                            }
                        }
                        return eventData;
                    });
                    
                    // Process events
                    await processor(events);
                    
                    // Acknowledge processed messages
                    const messageIds = messages.map(([id]: [string, string[]]) => id);
                    await redis.xack(streamName, groupName, ...messageIds);
                    
                    console.log(`Processed ${events.length} analytics events`);
                }
            }
        } catch (error) {
            console.error('Error processing analytics events:', error);
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
};

// Function to get stream information
export const getStreamInfo = async () => {
    const redis = getRedisClient();
    
    try {
        const info = await redis.xinfo('STREAM', streamName);
        return info;
    } catch (error) {
        console.error('Error getting stream info:', error);
        return null;
    }
};

// Function to trim old events from stream (keep last N events)
export const trimAnalyticsStream = async (maxLength: number = 10000) => {
    const redis = getRedisClient();
    
    try {
        await redis.xtrim(streamName, 'MAXLEN', '~', maxLength);
        console.log(`Trimmed analytics stream to approximately ${maxLength} events`);
    } catch (error) {
        console.error('Error trimming analytics stream:', error);
    }
};

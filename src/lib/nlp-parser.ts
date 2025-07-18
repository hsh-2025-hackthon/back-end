import { getOpenAIClient } from './openai';
import { ChatMessage } from '../models/chat';

export interface ExtractedInfo {
  destinations: string[];
  dates: Date[];
  budget: number | null;
  interests: string[];
  preferences: {
    accommodation: string[];
    transportation: string[];
    activities: string[];
  };
  mentions: {
    restaurants: string[];
    attractions: string[];
    hotels: string[];
  };
  intent: 'question' | 'suggestion' | 'complaint' | 'booking' | 'vote_request' | 'general';
  confidence: number;
}

export interface TravelIntent {
  type: 'add_destination' | 'set_budget' | 'suggest_activity' | 'vote_request' | 'book_accommodation' | 'general';
  entities: Record<string, any>;
  confidence: number;
  suggestedActions: string[];
}

export interface AISuggestion {
  type: string;
  title: string;
  description: string;
  action: {
    type: string;
    data: Record<string, any>;
  };
  priority: 'low' | 'medium' | 'high';
}

export class NLPParserService {
  private openaiClient = getOpenAIClient();

  /**
   * Parse a chat message to extract travel-related information
   */
  async parseMessage(content: string): Promise<ExtractedInfo> {
    try {
      const prompt = `
        Analyze the following travel discussion message and extract relevant information in JSON format:
        
        Message: "${content}"
        
        Extract the following information:
        - destinations: mentioned place names
        - dates: mentioned dates (ISO format)
        - budget: mentioned budget amounts (numbers only)
        - interests: hobbies or interests mentioned
        - preferences: preferences for accommodation, transportation, activities
        - mentions: specific mentions of restaurants, attractions, hotels
        - intent: message intent type (question, suggestion, complaint, booking, vote_request, general)
        - confidence: parsing confidence (0-1)
        
        Return only valid JSON. Example:
        {
          "destinations": ["Tokyo", "Kyoto"],
          "dates": ["2024-03-15"],
          "budget": 50000,
          "interests": ["culture", "food"],
          "preferences": {
            "accommodation": ["hotel"],
            "transportation": ["train"],
            "activities": ["temple visits"]
          },
          "mentions": {
            "restaurants": ["Tsukiji Market"],
            "attractions": ["Kiyomizu Temple"],
            "hotels": []
          },
          "intent": "suggestion",
          "confidence": 0.85
        }
      `;

      const response = await this.openaiClient.chat.completions.create({
        model: "gpt-4",
        messages: [
          { 
            role: "system", 
            content: "You are a travel planning assistant specialized in parsing travel discussions. Return only valid JSON with no additional text." 
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 1000
      });

      const result = response.choices[0].message?.content;
      if (!result) {
        throw new Error('No response from NLP service');
      }

      // Clean up the response to ensure it's valid JSON
      const cleanedResult = result.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleanedResult);
      
      // Validate and transform dates
      if (parsed.dates) {
        parsed.dates = parsed.dates.map((dateStr: string) => {
          try {
            return new Date(dateStr);
          } catch {
            return null;
          }
        }).filter(Boolean);
      }

      return parsed;
    } catch (error) {
      console.error('Error parsing message:', error);
      
      // Return default values on error
      return {
        destinations: [],
        dates: [],
        budget: null,
        interests: [],
        preferences: {
          accommodation: [],
          transportation: [],
          activities: []
        },
        mentions: {
          restaurants: [],
          attractions: [],
          hotels: []
        },
        intent: 'general',
        confidence: 0
      };
    }
  }

  /**
   * Extract travel intents from multiple messages
   */
  async extractIntentions(messages: ChatMessage[]): Promise<TravelIntent[]> {
    try {
      if (messages.length === 0) {
        return [];
      }
      
      const recentMessages = messages.slice(-10); // Analyze last 10 messages
      const messageTexts = recentMessages.map(m => `${m.user?.name || 'User'}: ${m.content}`).join('\n');

      const prompt = `
        Analyze the following travel discussion to identify user travel planning intents:
        
        Conversation:
        ${messageTexts}
        
        Identify the following intent types:
        - add_destination: wants to add new places
        - set_budget: discussing or setting budget
        - suggest_activity: suggesting activities
        - vote_request: needs group voting
        - book_accommodation: wants to book hotels/stays
        - general: general discussion
        
        Return JSON array with type, entities, confidence, and suggestedActions:
        [
          {
            "type": "add_destination",
            "entities": {"destinations": ["Tokyo"], "dates": ["2024-03-15"]},
            "confidence": 0.9,
            "suggestedActions": ["Add Tokyo to itinerary", "Check travel dates"]
          }
        ]
      `;

      const response = await this.openaiClient.chat.completions.create({
        model: "gpt-4",
        messages: [
          { 
            role: "system", 
            content: "You are a travel intent analysis expert. Return only valid JSON array with no additional text." 
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 800
      });

      const result = response.choices[0].message?.content;
      if (!result) {
        return [];
      }

      const cleanedResult = result.replace(/```json\n?|\n?```/g, '').trim();
      return JSON.parse(cleanedResult);
    } catch (error) {
      console.error('Error extracting intentions:', error);
      return [];
    }
  }

  /**
   * Generate AI suggestions based on extracted information
   */
  async generateSuggestions(context: ExtractedInfo): Promise<AISuggestion[]> {
    if (context.confidence < 0.5) {
      return []; // Low confidence, no suggestions
    }

    const suggestions: AISuggestion[] = [];

    // Destination-based suggestions
    if (context.destinations.length > 0) {
      suggestions.push({
        type: 'destination_info',
        title: `Information about ${context.destinations.join(', ')}`,
        description: 'Get detailed information, weather, and recommendations for these destinations',
        action: {
          type: 'get_destination_info',
          data: { destinations: context.destinations }
        },
        priority: 'high'
      });
    }

    // Budget-based suggestions
    if (context.budget && context.budget > 0) {
      suggestions.push({
        type: 'budget_planning',
        title: 'Budget Planning Assistance',
        description: `Create a budget breakdown for your ${context.budget} budget`,
        action: {
          type: 'create_budget_plan',
          data: { budget: context.budget, destinations: context.destinations }
        },
        priority: 'high'
      });
    }

    // Booking suggestions
    if (context.intent === 'booking') {
      suggestions.push({
        type: 'booking_assistance',
        title: 'Booking Search',
        description: 'Search and compare accommodation and transportation options',
        action: {
          type: 'start_booking_search',
          data: { destinations: context.destinations, dates: context.dates }
        },
        priority: 'high'
      });
    }

    // Vote request suggestions
    if (context.intent === 'vote_request') {
      suggestions.push({
        type: 'create_vote',
        title: 'Create Group Vote',
        description: 'Set up a vote for the group to decide on options',
        action: {
          type: 'create_vote',
          data: { 
            suggestions: context.mentions.restaurants.concat(context.mentions.attractions),
            type: 'general'
          }
        },
        priority: 'medium'
      });
    }

    // Activity suggestions
    if (context.interests.length > 0) {
      suggestions.push({
        type: 'activity_recommendations',
        title: 'Activity Recommendations',
        description: `Find activities matching your interests: ${context.interests.join(', ')}`,
        action: {
          type: 'get_activity_recommendations',
          data: { 
            interests: context.interests,
            destinations: context.destinations
          }
        },
        priority: 'medium'
      });
    }

    // Weather suggestions for future dates
    if (context.dates.length > 0) {
      const futureDates = context.dates.filter(date => date > new Date());
      if (futureDates.length > 0) {
        suggestions.push({
          type: 'weather_forecast',
          title: 'Weather Forecast',
          description: 'Check weather forecasts for your travel dates',
          action: {
            type: 'get_weather_forecast',
            data: { 
              destinations: context.destinations,
              dates: futureDates
            }
          },
          priority: 'low'
        });
      }
    }

    return suggestions;
  }

  /**
   * Generate quick responses for common queries
   */
  async generateQuickResponse(message: string, context: ExtractedInfo): Promise<string | null> {
    if (context.confidence < 0.6) {
      return null; // Not confident enough for quick response
    }

    try {
      const prompt = `
        Generate a helpful quick response to this travel planning message:
        
        Message: "${message}"
        
        Context:
        - Intent: ${context.intent}
        - Destinations: ${context.destinations.join(', ')}
        - Budget: ${context.budget || 'not specified'}
        - Interests: ${context.interests.join(', ')}
        
        Provide a concise, helpful response (max 100 words) that:
        - Acknowledges their request
        - Provides useful information or next steps
        - Encourages group collaboration
        
        Return only the response text, no additional formatting.
      `;

      const response = await this.openaiClient.chat.completions.create({
        model: "gpt-4",
        messages: [
          { 
            role: "system", 
            content: "You are a helpful travel planning assistant. Provide concise, actionable responses." 
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 150
      });

      return response.choices[0].message?.content?.trim() || null;
    } catch (error) {
      console.error('Error generating quick response:', error);
      return null;
    }
  }

  /**
   * Analyze conversation sentiment and engagement
   */
  async analyzeConversationSentiment(messages: ChatMessage[]): Promise<{
    sentiment: 'positive' | 'neutral' | 'negative';
    engagement: 'high' | 'medium' | 'low';
    topics: string[];
    recommendations: string[];
  }> {
    try {
      const recentMessages = messages.slice(-20); // Analyze last 20 messages
      const messageTexts = recentMessages.map(m => m.content).join('\n');

      const prompt = `
        Analyze the sentiment and engagement of this travel planning conversation:
        
        Messages:
        ${messageTexts}
        
        Provide analysis in JSON format:
        {
          "sentiment": "positive|neutral|negative",
          "engagement": "high|medium|low",
          "topics": ["array of main topics discussed"],
          "recommendations": ["array of suggestions to improve discussion"]
        }
      `;

      const response = await this.openaiClient.chat.completions.create({
        model: "gpt-4",
        messages: [
          { 
            role: "system", 
            content: "You are a conversation analyst. Return only valid JSON." 
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 300
      });

      const result = response.choices[0].message?.content;
      if (!result) {
        throw new Error('No response from sentiment analysis');
      }

      const cleanedResult = result.replace(/```json\n?|\n?```/g, '').trim();
      return JSON.parse(cleanedResult);
    } catch (error) {
      console.error('Error analyzing conversation sentiment:', error);
      return {
        sentiment: 'neutral',
        engagement: 'medium',
        topics: [],
        recommendations: []
      };
    }
  }
}

// Export singleton instance
export const nlpParser = new NLPParserService();
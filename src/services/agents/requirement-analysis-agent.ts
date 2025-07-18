import { BaseAgent, AgentContext, AgentResponse, AgentCapability } from './base-agent';
import { ChatMessage } from '../../models/chat';
import { nlpParser } from '../../lib/nlp-parser';

export interface RequirementAnalysisInput {
  chatMessages: ChatMessage[];
  existingPreferences?: any;
  tripContext?: {
    budget?: number;
    duration?: number;
    groupSize?: number;
    existingDestinations?: string[];
  };
}

export interface TravelRequirements {
  destinations: string[];
  budget: {
    total?: number;
    currency?: string;
    categories: {
      accommodation?: number;
      transportation?: number;
      activities?: number;
      food?: number;
      shopping?: number;
    };
  };
  dates: {
    startDate?: Date;
    endDate?: Date;
    duration?: number;
    flexibility?: 'rigid' | 'flexible' | 'very_flexible';
  };
  preferences: {
    accommodationType?: string[];
    transportationMode?: string[];
    activityTypes?: string[];
    diningStyle?: string[];
    pace?: 'relaxed' | 'moderate' | 'packed';
  };
  groupDynamics: {
    size: number;
    ageGroups?: string[];
    interests?: string[];
    specialNeeds?: string[];
  };
  priorities: {
    primary: string[];
    secondary: string[];
    dealbreakers?: string[];
  };
  sentiment: {
    overall: 'positive' | 'neutral' | 'negative';
    excitement: number; // 0-1
    consensus: number; // 0-1
  };
  confidence: number;
}

export class RequirementAnalysisAgent extends BaseAgent {
  constructor() {
    super('RequirementAnalysisAgent', '1.0.0');
  }

  getCapabilities(): AgentCapability[] {
    return [
      {
        name: 'analyzeRequirements',
        description: 'Analyze chat messages and extract comprehensive travel requirements',
        inputSchema: {
          chatMessages: 'ChatMessage[]',
          existingPreferences: 'object',
          tripContext: 'object'
        },
        outputSchema: {
          requirements: 'TravelRequirements'
        }
      },
      {
        name: 'extractPreferences',
        description: 'Extract user preferences from historical data and conversations',
        inputSchema: {
          userHistory: 'UserActivity[]'
        },
        outputSchema: {
          preferences: 'UserPreferences'
        }
      }
    ];
  }

  async execute(
    context: AgentContext,
    input: RequirementAnalysisInput
  ): Promise<AgentResponse<TravelRequirements>> {
    const startTime = Date.now();
    this.logActivity(context, 'Starting requirement analysis', {
      messageCount: input.chatMessages.length
    });

    try {
      // Step 1: Use existing NLP parser for basic extraction
      const nlpResults = await Promise.all(
        input.chatMessages.map(msg => nlpParser.parseMessage(msg.content))
      );

      // Step 2: Analyze conversation sentiment
      const sentimentAnalysis = await nlpParser.analyzeConversationSentiment(input.chatMessages);

      // Step 3: Advanced requirement synthesis using AI
      const requirements = await this.synthesizeRequirements(
        input.chatMessages,
        nlpResults,
        sentimentAnalysis,
        input.tripContext
      );

      const processingTime = Date.now() - startTime;
      this.logActivity(context, 'Requirement analysis completed', {
        processingTime,
        confidence: requirements.confidence
      });

      return this.createResponse(
        true,
        requirements,
        undefined,
        requirements.confidence,
        processingTime,
        context.sessionId
      );

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.logActivity(context, 'Requirement analysis failed', {
        error: errorMessage,
        processingTime
      });

      return this.createResponse<TravelRequirements>(
        false,
        undefined,
        errorMessage,
        0,
        processingTime,
        context.sessionId
      );
    }
  }

  private async synthesizeRequirements(
    messages: ChatMessage[],
    nlpResults: any[],
    sentiment: any,
    tripContext?: any
  ): Promise<TravelRequirements> {
    const messageTexts = messages.map(m => m.content).join('\n');
    const aggregatedNLP = this.aggregateNLPResults(nlpResults);

    const systemPrompt = `
      You are an expert travel requirement analyst. Analyze conversations and extract comprehensive travel requirements.
      
      Your task is to synthesize scattered information into structured requirements that can guide trip planning.
      
      Focus on:
      1. Explicit requirements (clearly stated)
      2. Implicit preferences (inferred from context)
      3. Group consensus and conflicts
      4. Practical constraints
      5. Emotional priorities
      
      Return valid JSON only.
    `;

    const userPrompt = `
      Analyze this travel planning conversation and extract comprehensive requirements:
      
      CONVERSATION:
      ${messageTexts}
      
      NLP ANALYSIS SUMMARY:
      - Destinations mentioned: ${aggregatedNLP.destinations.join(', ')}
      - Budget discussions: ${aggregatedNLP.budgetMentions}
      - Activity interests: ${aggregatedNLP.interests.join(', ')}
      - Dates mentioned: ${aggregatedNLP.dates.join(', ')}
      
      SENTIMENT ANALYSIS:
      - Overall sentiment: ${sentiment.sentiment}
      - Engagement level: ${sentiment.engagement}
      - Key topics: ${sentiment.topics.join(', ')}
      
      TRIP CONTEXT:
      ${tripContext ? JSON.stringify(tripContext, null, 2) : 'None provided'}
      
      Extract and structure the requirements in this format:
      {
        "destinations": ["array of mentioned destinations"],
        "budget": {
          "total": number or null,
          "currency": "string or null",
          "categories": {
            "accommodation": estimated_percentage,
            "transportation": estimated_percentage,
            "activities": estimated_percentage,
            "food": estimated_percentage,
            "shopping": estimated_percentage
          }
        },
        "dates": {
          "startDate": "ISO date or null",
          "endDate": "ISO date or null", 
          "duration": number_of_days,
          "flexibility": "rigid|flexible|very_flexible"
        },
        "preferences": {
          "accommodationType": ["hotels", "hostels", "airbnb", etc],
          "transportationMode": ["flight", "train", "car", etc],
          "activityTypes": ["cultural", "adventure", "relaxation", etc],
          "diningStyle": ["local", "upscale", "casual", etc],
          "pace": "relaxed|moderate|packed"
        },
        "groupDynamics": {
          "size": estimated_group_size,
          "ageGroups": ["young_adult", "adult", "senior"],
          "interests": ["shared interests from conversation"],
          "specialNeeds": ["any mentioned accessibility or dietary needs"]
        },
        "priorities": {
          "primary": ["most important aspects"],
          "secondary": ["nice to have aspects"],
          "dealbreakers": ["things to avoid"]
        },
        "sentiment": {
          "overall": "${sentiment.sentiment}",
          "excitement": ${this.calculateExcitement(sentiment)},
          "consensus": ${this.calculateConsensus(sentiment, nlpResults)}
        },
        "confidence": confidence_score_0_to_1
      }
    `;

    const result = await this.generateAIResponse(systemPrompt, userPrompt, true);
    return result as TravelRequirements;
  }

  private aggregateNLPResults(nlpResults: any[]) {
    const aggregated = {
      destinations: new Set<string>(),
      budgetMentions: [] as number[],
      interests: new Set<string>(),
      dates: new Set<string>()
    };

    nlpResults.forEach(result => {
      result.destinations?.forEach((dest: string) => aggregated.destinations.add(dest));
      if (result.budget) aggregated.budgetMentions.push(result.budget);
      result.interests?.forEach((interest: string) => aggregated.interests.add(interest));
      result.dates?.forEach((date: string) => aggregated.dates.add(date));
    });

    return {
      destinations: Array.from(aggregated.destinations),
      budgetMentions: aggregated.budgetMentions,
      interests: Array.from(aggregated.interests),
      dates: Array.from(aggregated.dates)
    };
  }

  private calculateExcitement(sentiment: any): number {
    // Calculate excitement level based on sentiment analysis
    const baseExcitement = sentiment.sentiment === 'positive' ? 0.7 : 
                          sentiment.sentiment === 'neutral' ? 0.5 : 0.3;
    
    const engagementBoost = sentiment.engagement === 'high' ? 0.2 : 
                           sentiment.engagement === 'medium' ? 0.1 : 0;
    
    return Math.min(1.0, baseExcitement + engagementBoost);
  }

  private calculateConsensus(sentiment: any, nlpResults: any[]): number {
    // Calculate group consensus based on agreement patterns
    const consistentIntents = this.analyzeIntentConsistency(nlpResults);
    const baseConsensus = sentiment.engagement === 'high' ? 0.8 : 0.6;
    
    return Math.min(1.0, baseConsensus * consistentIntents);
  }

  private analyzeIntentConsistency(nlpResults: any[]): number {
    if (nlpResults.length === 0) return 1.0;
    
    const intents = nlpResults.map(r => r.intent);
    const uniqueIntents = new Set(intents);
    
    // More diverse intents suggest less consensus
    return 1.0 - (uniqueIntents.size - 1) / Math.max(1, intents.length);
  }
}

export interface CommandContext {
  tripId: string;
  userId: string;
  trip?: any;
}

export interface ParsedCommand {
  action: string;
  intent: CommandIntent;
  entities: CommandEntity[];
  confidence: number;
  parameters: Record<string, any>;
  suggestions?: string[];
}

export enum CommandIntent {
  SUGGEST_ITINERARY = 'suggest_itinerary',
  ADD_DESTINATION = 'add_destination',
  GET_WEATHER = 'get_weather',
  SPLIT_EXPENSE = 'split_expense',
  CREATE_VOTE = 'create_vote',
  BOOK_FLIGHT = 'book_flight',
  BOOK_HOTEL = 'book_hotel',
  GET_RECOMMENDATIONS = 'get_recommendations',
  UNKNOWN = 'unknown'
}

export interface CommandEntity {
  type: EntityType;
  value: string;
  confidence: number;
  start?: number;
  end?: number;
}

export enum EntityType {
  DESTINATION = 'destination',
  DATE = 'date',
  AMOUNT = 'amount',
  CURRENCY = 'currency',
  PERSON = 'person',
  ACTIVITY = 'activity',
  DURATION = 'duration',
  NUMBER = 'number',
  OPTION = 'option'
}

export class CommandParser {
  constructor() {
    // No pattern initialization needed since pattern detection is disabled
  }
  
  parse(input: string, context: CommandContext): ParsedCommand {
    // Pattern detection disabled - always return unknown intent with low confidence
    const intent = CommandIntent.UNKNOWN;
    const entities: CommandEntity[] = [];
    const confidence = 0.1;
    const parameters = { rawInput: input.trim() };
    const suggestions = this.generateSuggestions();
    
    return {
      action: this.mapIntentToAction(intent),
      intent,
      entities,
      confidence,
      parameters,
      suggestions
    };
  }

  private generateSuggestions(): string[] {
    // Since automatic pattern detection is disabled, provide generic suggestions
    // for users to issue explicit commands
    return [
      'Use explicit commands like: /suggest-itinerary, /add-destination, /split-expense',
      'Or wait for manual processing of your request',
      'Pattern-based detection is currently disabled'
    ];
  }  private mapIntentToAction(intent: CommandIntent): string {
    const actionMap: Record<CommandIntent, string> = {
      [CommandIntent.SUGGEST_ITINERARY]: 'suggest-itinerary',
      [CommandIntent.ADD_DESTINATION]: 'add-destination',
      [CommandIntent.GET_WEATHER]: 'get-weather',
      [CommandIntent.SPLIT_EXPENSE]: 'split-expense',
      [CommandIntent.CREATE_VOTE]: 'create-vote',
      [CommandIntent.BOOK_FLIGHT]: 'book-flight',
      [CommandIntent.BOOK_HOTEL]: 'book-hotel',
      [CommandIntent.GET_RECOMMENDATIONS]: 'get-recommendations',
      [CommandIntent.UNKNOWN]: 'unknown'
    };
    
    return actionMap[intent];
  }
}

// Singleton instance
export const commandParser = new CommandParser();
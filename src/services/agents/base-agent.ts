import { getOpenAIClient } from '../../lib/openai';
import { AzureOpenAI } from 'openai';

export interface AgentContext {
  tripId: string;
  userId: string;
  sessionId: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface AgentResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  confidence: number;
  processingTime: number;
  agentName: string;
  sessionId: string;
}

export interface AgentCapability {
  name: string;
  description: string;
  inputSchema: any;
  outputSchema: any;
}

export abstract class BaseAgent {
  protected openaiClient: AzureOpenAI;
  protected agentName: string;
  protected version: string;
  protected capabilities: AgentCapability[];

  constructor(agentName: string, version: string = '1.0.0') {
    this.openaiClient = getOpenAIClient();
    this.agentName = agentName;
    this.version = version;
    this.capabilities = [];
  }

  abstract getCapabilities(): AgentCapability[];
  
  abstract execute(context: AgentContext, input: any): Promise<AgentResponse>;

  /**
   * Validate input against the agent's schema
   */
  protected validateInput(input: any, schema: any): boolean {
    // Simple validation - could be enhanced with Zod or similar
    return true;
  }

  /**
   * Create a standardized response
   */
  protected createResponse<T>(
    success: boolean,
    data?: T,
    error?: string,
    confidence: number = 1.0,
    processingTime: number = 0,
    sessionId: string = ''
  ): AgentResponse<T> {
    return {
      success,
      data,
      error,
      confidence,
      processingTime,
      agentName: this.agentName,
      sessionId
    };
  }

  /**
   * Generate structured AI response using OpenAI
   */
  protected async generateAIResponse(
    systemPrompt: string,
    userPrompt: string,
    schema?: any,
    temperature: number = 0.3
  ): Promise<any> {
    try {
      const response = await this.openaiClient.chat.completions.create({
        model: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature,
        max_tokens: 2000
      });

      const content = response.choices[0].message?.content;
      if (!content) {
        throw new Error('No response from AI service');
      }

      // Try to parse as JSON if schema is provided
      if (schema) {
        try {
          const cleanedContent = content.replace(/```json\n?|\n?```/g, '').trim();
          return JSON.parse(cleanedContent);
        } catch (parseError) {
          console.warn(`Failed to parse AI response as JSON: ${parseError}`);
          return { content };
        }
      }

      return { content };
    } catch (error) {
      console.error(`AI generation error in ${this.agentName}:`, error);
      throw error;
    }
  }

  /**
   * Log agent activity for monitoring and debugging
   */
  protected async logActivity(
    context: AgentContext,
    action: string,
    details?: any,
    level: 'debug' | 'info' | 'warn' | 'error' = 'info'
  ): Promise<void> {
    // Console logging for development
    console.log(`[${this.agentName}] ${action}`, {
      tripId: context.tripId,
      userId: context.userId,
      sessionId: context.sessionId,
      timestamp: context.timestamp,
      details
    });

    // Persistent logging if sessionId is available
    if (context.sessionId) {
      try {
        const { agentSessionService } = await import('./agent-session-service');
        await agentSessionService.addLog(
          context.sessionId,
          level,
          action,
          this.agentName,
          this.getCurrentStep(),
          details
        );
      } catch (error) {
        console.warn(`Failed to log activity for session ${context.sessionId}:`, error);
      }
    }
  }

  /**
   * Log error with structured error details
   */
  protected async logError(
    context: AgentContext,
    error: Error | string,
    details?: any
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : error;
    const errorDetails = error instanceof Error ? {
      code: 'AGENT_ERROR',
      stack: error.stack,
      details: details || {}
    } : { details: details || {} };

    await this.logActivity(context, `Error: ${errorMessage}`, details, 'error');

    if (context.sessionId) {
      try {
        const { agentSessionService } = await import('./agent-session-service');
        await agentSessionService.addLog(
          context.sessionId,
          'error',
          errorMessage,
          this.agentName,
          this.getCurrentStep(),
          details,
          errorDetails
        );
      } catch (logError) {
        console.warn(`Failed to log error for session ${context.sessionId}:`, logError);
      }
    }
  }

  /**
   * Get current processing step (override in subclasses for specific steps)
   */
  protected getCurrentStep(): string {
    return 'processing';
  }

  /**
   * Get agent metadata
   */
  getMetadata() {
    return {
      name: this.agentName,
      version: this.version,
      capabilities: this.getCapabilities()
    };
  }
}

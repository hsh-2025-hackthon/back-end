import { BaseAgent, AgentContext, AgentResponse } from './base-agent';
import { RequirementAnalysisAgent, TravelRequirements } from './requirement-analysis-agent';
import { 
  ItineraryOptimizationAgent, 
  OptimizedItinerary, 
  ItineraryOptimizationInput,
  TravelConstraints,
  Destination
} from './itinerary-optimization-agent';
import { ChatMessage } from '../../models/chat';
import { TripRepository } from '../../models/trip';
import { agentSessionService, AgentSessionLogEntry, AgentSessionLogFilter } from './agent-session-service';

export interface AgentSession {
  id: string;
  tripId: string;
  userId: string;
  status: 'active' | 'completed' | 'failed' | 'cancelled';
  startTime: Date;
  endTime?: Date;
  currentStep: string;
  progress: number; // 0-100
  results: Record<string, any>;
  errors: string[];
}

export interface AgentWorkflowInput {
  tripId: string;
  userId: string;
  chatMessages: ChatMessage[];
  workflowType: 'full_optimization' | 'requirement_analysis' | 'itinerary_update' | 'adaptive_adjustment';
  options?: {
    prioritizeTime?: boolean;
    prioritizeCost?: boolean;
    prioritizeExperience?: boolean;
    generateAlternatives?: boolean;
  };
}

export interface DisruptionEvent {
  type: 'weather' | 'transportation' | 'accommodation' | 'activity_closure' | 'emergency';
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedDestination?: string;
  affectedDate?: Date;
  description: string;
  suggestedActions?: string[];
}

export interface OptimizationResult {
  sessionId: string;
  success: boolean;
  requirements?: TravelRequirements;
  optimizedItinerary?: OptimizedItinerary;
  alternatives?: OptimizedItinerary[];
  processingTime: number;
  confidence: number;
  recommendations: string[];
  warnings: string[];
}

export interface AdjustmentPlan {
  sessionId: string;
  disruption: DisruptionEvent;
  originalItinerary: OptimizedItinerary;
  adjustedItinerary: OptimizedItinerary;
  impactAnalysis: {
    affectedDays: number;
    costImpact: number;
    experienceImpact: number;
  };
  alternatives: OptimizedItinerary[];
  recommendations: string[];
}

export class AgentCoordinator {
  private static instance: AgentCoordinator;
  private agents: Map<string, BaseAgent>;
  private activeSessions: Map<string, AgentSession>;
  private requirementAgent: RequirementAnalysisAgent;
  private optimizationAgent: ItineraryOptimizationAgent;

  private constructor() {
    this.agents = new Map();
    this.activeSessions = new Map();
    this.requirementAgent = new RequirementAnalysisAgent();
    this.optimizationAgent = new ItineraryOptimizationAgent();
    
    // Register agents
    this.agents.set('requirement-analysis', this.requirementAgent);
    this.agents.set('itinerary-optimization', this.optimizationAgent);
  }

  public static getInstance(): AgentCoordinator {
    if (!AgentCoordinator.instance) {
      AgentCoordinator.instance = new AgentCoordinator();
    }
    return AgentCoordinator.instance;
  }

  /**
   * Orchestrate complete itinerary optimization workflow
   */
  async orchestrateItineraryOptimization(
    input: AgentWorkflowInput
  ): Promise<OptimizationResult> {
    const sessionId = this.generateSessionId();
    const startTime = Date.now();

    const session: AgentSession = {
      id: sessionId,
      tripId: input.tripId,
      userId: input.userId,
      status: 'active',
      startTime: new Date(),
      currentStep: 'initialization',
      progress: 0,
      results: {},
      errors: []
    };

    this.activeSessions.set(sessionId, session);

    try {
      // Create persistent session record
      await agentSessionService.createSession(session, input.workflowType || 'full_optimization', input);
      await this.logSessionActivity(sessionId, 'info', 'Starting optimization workflow', 'AgentCoordinator', 'initialization', {
        tripId: input.tripId,
        workflowType: input.workflowType,
        options: input.options
      });

      console.log(`[AgentCoordinator] Starting optimization workflow for trip ${input.tripId}`);

      // Step 1: Requirement Analysis (25% progress)
      session.currentStep = 'requirement_analysis';
      session.progress = 25;
      this.activeSessions.set(sessionId, session);
      await agentSessionService.updateSession(session);

      await this.logSessionActivity(sessionId, 'info', 'Starting requirement analysis', 'AgentCoordinator', 'requirement_analysis');

      const context: AgentContext = {
        tripId: input.tripId,
        userId: input.userId,
        sessionId,
        timestamp: new Date()
      };

      const requirementResult = await this.requirementAgent.execute(context, {
        chatMessages: input.chatMessages,
        tripContext: await this.getTripContext(input.tripId)
      });

      if (!requirementResult.success || !requirementResult.data) {
        throw new Error('Requirement analysis failed: ' + requirementResult.error);
      }

      session.results.requirements = requirementResult.data;
      session.progress = 50;
      this.activeSessions.set(sessionId, session);
      await agentSessionService.updateSession(session);

      await this.logSessionActivity(sessionId, 'info', 'Requirement analysis completed', 'RequirementAnalysisAgent', 'requirement_analysis', {
        extractedRequirements: requirementResult.data
      });

      // Step 2: Get trip destinations and create constraints (60% progress)
      session.currentStep = 'constraint_preparation';
      const trip = await TripRepository.findById(input.tripId);
      if (!trip) {
        throw new Error('Trip not found');
      }

      const destinations = await this.prepareDestinations(trip, requirementResult.data);
      const constraints = this.createTravelConstraints(requirementResult.data, trip);

      session.progress = 75;
      this.activeSessions.set(sessionId, session);
      await agentSessionService.updateSession(session);

      // Step 3: Itinerary Optimization (75-95% progress)
      session.currentStep = 'itinerary_optimization';
      await this.logSessionActivity(sessionId, 'info', 'Starting itinerary optimization', 'AgentCoordinator', 'itinerary_optimization', {
        destinationCount: destinations.length,
        constraints
      });
      
      const optimizationInput: ItineraryOptimizationInput = {
        requirements: requirementResult.data,
        destinations,
        constraints,
        preferences: input.options ? {
          prioritizeTime: input.options.prioritizeTime || false,
          prioritizeCost: input.options.prioritizeCost || false,
          prioritizeExperience: input.options.prioritizeExperience || false
        } : undefined
      };

      const optimizationResult = await this.optimizationAgent.execute(context, optimizationInput);

      if (!optimizationResult.success || !optimizationResult.data) {
        throw new Error('Itinerary optimization failed: ' + optimizationResult.error);
      }

      session.results.optimizedItinerary = optimizationResult.data;
      session.progress = 95;
      this.activeSessions.set(sessionId, session);
      await agentSessionService.updateSession(session);

      await this.logSessionActivity(sessionId, 'info', 'Itinerary optimization completed', 'ItineraryOptimizationAgent', 'itinerary_optimization', {
        optimizedItinerary: optimizationResult.data
      });

      // Step 4: Generate recommendations and finalize (100% progress)
      session.currentStep = 'finalization';
      const recommendations = this.generateRecommendations(
        requirementResult.data,
        optimizationResult.data
      );

      const warnings = this.generateWarnings(
        requirementResult.data,
        optimizationResult.data
      );

      session.status = 'completed';
      session.endTime = new Date();
      session.progress = 100;
      this.activeSessions.set(sessionId, session);
      await agentSessionService.updateSession(session);

      await this.logSessionActivity(sessionId, 'info', 'Workflow completed successfully', 'AgentCoordinator', 'finalization', {
        recommendationCount: recommendations.length,
        warningCount: warnings.length
      });

      const processingTime = Date.now() - startTime;
      const confidence = Math.min(requirementResult.confidence, optimizationResult.confidence);

      console.log(`[AgentCoordinator] Optimization completed for trip ${input.tripId} in ${processingTime}ms`);

      return {
        sessionId,
        success: true,
        requirements: requirementResult.data,
        optimizedItinerary: optimizationResult.data,
        alternatives: optimizationResult.data.alternatives,
        processingTime,
        confidence,
        recommendations,
        warnings
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      session.status = 'failed';
      session.endTime = new Date();
      session.errors.push(errorMessage);
      this.activeSessions.set(sessionId, session);
      await agentSessionService.updateSession(session);

      await this.logSessionActivity(sessionId, 'error', `Workflow failed: ${errorMessage}`, 'AgentCoordinator', session.currentStep, undefined, {
        code: 'WORKFLOW_FAILED',
        stack: error instanceof Error ? error.stack : undefined,
        details: { error: errorMessage }
      });

      console.error(`[AgentCoordinator] Optimization failed for trip ${input.tripId}:`, error);

      return {
        sessionId,
        success: false,
        processingTime: Date.now() - startTime,
        confidence: 0,
        recommendations: ['Please try again with more specific requirements'],
        warnings: [errorMessage]
      };
    }
  }

  /**
   * Handle adaptive adjustments when disruptions occur
   */
  async handleAdaptiveAdjustments(
    tripId: string,
    disruption: DisruptionEvent,
    userId: string
  ): Promise<AdjustmentPlan> {
    const sessionId = this.generateSessionId();
    console.log(`[AgentCoordinator] Handling adaptive adjustment for disruption: ${disruption.type}`);

    try {
      // Get current itinerary
      const trip = await TripRepository.findById(tripId);
      if (!trip) {
        throw new Error('Trip not found');
      }

      // For now, return a basic adjustment plan
      // This could be enhanced with more sophisticated adaptation logic
      const adjustmentPlan: AdjustmentPlan = {
        sessionId,
        disruption,
        originalItinerary: {} as OptimizedItinerary, // Would get from database
        adjustedItinerary: {} as OptimizedItinerary, // Would generate new itinerary
        impactAnalysis: {
          affectedDays: this.calculateAffectedDays(disruption),
          costImpact: this.calculateCostImpact(disruption),
          experienceImpact: this.calculateExperienceImpact(disruption)
        },
        alternatives: [],
        recommendations: this.generateDisruptionRecommendations(disruption)
      };

      return adjustmentPlan;

    } catch (error) {
      console.error(`[AgentCoordinator] Adaptive adjustment failed:`, error);
      throw error;
    }
  }

  /**
   * Get active session status
   */
  getSessionStatus(sessionId: string): AgentSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * Get all agent metadata
   */
  getAvailableAgents() {
    return Array.from(this.agents.entries()).map(([name, agent]) => ({
      name,
      metadata: agent.getMetadata()
    }));
  }

  /**
   * Get all active sessions for a user
   */
  getAllUserSessions(userId: string): AgentSession[] {
    return Array.from(this.activeSessions.values())
      .filter(session => session.userId === userId);
  }

  /**
   * Cancel an active session
   */
  async cancelSession(sessionId: string): Promise<boolean> {
    const session = this.activeSessions.get(sessionId);
    if (session && session.status === 'active') {
      session.status = 'cancelled';
      session.endTime = new Date();
      this.activeSessions.set(sessionId, session);
      
      try {
        await agentSessionService.updateSession(session);
        await this.logSessionActivity(sessionId, 'info', 'Session cancelled by user', 'AgentCoordinator', session.currentStep);
      } catch (error) {
        console.error('Failed to update cancelled session in database:', error);
      }
      
      return true;
    }
    return false;
  }

  /**
   * Get all active sessions across all users (admin functionality)
   */
  getAllActiveSessions(): AgentSession[] {
    return Array.from(this.activeSessions.values())
      .filter(session => session.status === 'active');
  }

  /**
   * Get session logs for debugging
   */
  async getSessionLogs(sessionId: string, filter?: AgentSessionLogFilter): Promise<{
    logs: AgentSessionLogEntry[];
    totalCount: number;
    hasMore: boolean;
  }> {
    return await agentSessionService.getSessionLogs(sessionId, filter);
  }

  /**
   * Log session activity
   */
  private async logSessionActivity(
    sessionId: string,
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    component?: string,
    step?: string,
    metadata?: Record<string, any>,
    errorDetails?: any
  ): Promise<void> {
    try {
      await agentSessionService.addLog(sessionId, level, message, component, step, metadata, errorDetails);
    } catch (error) {
      console.error('Failed to log session activity:', error);
    }
  }

  /**
   * Get session results if completed
   */
  getSessionResults(sessionId: string): any {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return null;
    }
    
    if (session.status !== 'completed') {
      return null;
    }
    
    return session.results;
  }

  /**
   * Force cleanup of old sessions
   */
  async cleanupOldSessions(maxAgeHours: number = 24): Promise<number> {
    // Clean up in-memory sessions
    const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    let cleanedMemoryCount = 0;
    
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (session.startTime < cutoffTime && 
          (session.status === 'completed' || session.status === 'failed' || session.status === 'cancelled')) {
        this.activeSessions.delete(sessionId);
        cleanedMemoryCount++;
      }
    }
    
    // Clean up persistent sessions
    let cleanedDbCount = 0;
    try {
      cleanedDbCount = await agentSessionService.cleanupOldSessions(maxAgeHours);
    } catch (error) {
      console.error('Failed to cleanup database sessions:', error);
    }
    
    return cleanedMemoryCount + cleanedDbCount;
  }

  // Private helper methods

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async getTripContext(tripId: string) {
    try {
      const trip = await TripRepository.findById(tripId);
      return trip ? {
        budget: trip.budget,
        duration: trip.endDate ? 
          Math.ceil((trip.endDate.getTime() - trip.startDate.getTime()) / (1000 * 60 * 60 * 24)) : 
          undefined,
        groupSize: 1, // Would need to get from collaborators
        existingDestinations: [] // Would need to get from trip destinations
      } : undefined;
    } catch (error) {
      console.warn('Failed to get trip context:', error);
      return undefined;
    }
  }

  private async prepareDestinations(trip: any, requirements: TravelRequirements): Promise<Destination[]> {
    const destinations: Destination[] = [];
    
    // Convert requirement destinations to Destination objects
    requirements.destinations.forEach((destName, index) => {
      destinations.push({
        id: `dest_${index}`,
        name: destName,
        country: 'Unknown', // Would need geocoding
        city: destName,
        latitude: 0, // Would need geocoding
        longitude: 0, // Would need geocoding
        priority: 10 - index, // Higher priority for earlier mentioned
        estimatedCost: 0,
        estimatedDuration: 24 * 3 // 3 days default
      });
    });

    return destinations;
  }

  private createTravelConstraints(requirements: TravelRequirements, trip: any): TravelConstraints {
    return {
      maxBudget: requirements.budget.total,
      timeConstraints: {
        startDate: requirements.dates.startDate || trip.startDate || new Date(),
        endDate: requirements.dates.endDate || trip.endDate || new Date(),
        flexibleDays: requirements.dates.flexibility === 'very_flexible' ? 3 : 
                     requirements.dates.flexibility === 'flexible' ? 1 : 0
      },
      transportationLimits: {
        preferredModes: requirements.preferences.transportationMode || ['flight', 'driving']
      },
      groupLimitations: {
        maxGroupSize: requirements.groupDynamics.size
      }
    };
  }

  private generateRecommendations(requirements: TravelRequirements, itinerary: OptimizedItinerary): string[] {
    const recommendations: string[] = [];

    if (itinerary.optimizationScore < 0.7) {
      recommendations.push('Consider adjusting your budget or time constraints for a better itinerary');
    }

    if (requirements.sentiment.excitement < 0.6) {
      recommendations.push('The group seems less excited - consider adding more engaging activities');
    }

    if (requirements.sentiment.consensus < 0.7) {
      recommendations.push('There may be disagreements in the group - consider creating a vote for key decisions');
    }

    if (itinerary.dailyPlans.some(plan => plan.activities.length > 5)) {
      recommendations.push('Some days are quite packed - consider spreading activities across more days');
    }

    return recommendations;
  }

  private generateWarnings(requirements: TravelRequirements, itinerary: OptimizedItinerary): string[] {
    const warnings: string[] = [];

    if (requirements.confidence < 0.6) {
      warnings.push('Low confidence in requirements analysis - consider providing more specific details');
    }

    if (requirements.budget.total && itinerary.totalCost > requirements.budget.total * 1.1) {
      warnings.push('Itinerary cost exceeds budget by more than 10%');
    }

    if (itinerary.destinations.length > 5) {
      warnings.push('Many destinations in a short time - consider reducing for a more relaxed pace');
    }

    return warnings;
  }

  private calculateAffectedDays(disruption: DisruptionEvent): number {
    switch (disruption.severity) {
      case 'critical': return 3;
      case 'high': return 2;
      case 'medium': return 1;
      default: return 0;
    }
  }

  private calculateCostImpact(disruption: DisruptionEvent): number {
    switch (disruption.severity) {
      case 'critical': return 500;
      case 'high': return 200;
      case 'medium': return 100;
      default: return 50;
    }
  }

  private calculateExperienceImpact(disruption: DisruptionEvent): number {
    switch (disruption.severity) {
      case 'critical': return -0.5;
      case 'high': return -0.3;
      case 'medium': return -0.1;
      default: return 0;
    }
  }

  private generateDisruptionRecommendations(disruption: DisruptionEvent): string[] {
    const recommendations: string[] = [];

    switch (disruption.type) {
      case 'weather':
        recommendations.push('Consider indoor alternatives');
        recommendations.push('Check weather forecasts for the next few days');
        break;
      case 'transportation':
        recommendations.push('Look for alternative transportation options');
        recommendations.push('Consider extending your stay if needed');
        break;
      case 'accommodation':
        recommendations.push('Search for nearby alternative accommodations');
        recommendations.push('Contact your travel insurance if applicable');
        break;
      case 'activity_closure':
        recommendations.push('Find similar activities in the area');
        recommendations.push('Consider this an opportunity to explore something new');
        break;
      case 'emergency':
        recommendations.push('Follow local emergency procedures');
        recommendations.push('Contact your embassy if traveling internationally');
        break;
    }

    return recommendations;
  }
}

// Export singleton instance
export const agentCoordinator = AgentCoordinator.getInstance();

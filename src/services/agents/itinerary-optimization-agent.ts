import { BaseAgent, AgentContext, AgentResponse, AgentCapability } from './base-agent';
import { TravelRequirements } from './requirement-analysis-agent';
import { mcpManager } from '../../features/mcp/mcp-manager';

export interface Destination {
  id: string;
  name: string;
  country: string;
  city: string;
  latitude: number;
  longitude: number;
  arrivalDate?: Date;
  departureDate?: Date;
  priority: number; // 1-10
  estimatedCost?: number;
  estimatedDuration?: number; // hours
}

export interface Activity {
  id: string;
  name: string;
  description: string;
  type: string;
  location: {
    latitude: number;
    longitude: number;
    address: string;
  };
  cost: number;
  currency: string;
  duration: number; // hours
  operatingHours?: {
    open: string;
    close: string;
    daysOfWeek: number[]; // 0-6, Sunday=0
  };
  priority: number;
  prerequisites?: string[];
  seasonality?: string[];
}

export interface TravelConstraints {
  maxBudget?: number;
  timeConstraints: {
    startDate: Date;
    endDate: Date;
    flexibleDays?: number;
  };
  transportationLimits?: {
    maxFlightTime?: number;
    maxDrivingTime?: number;
    preferredModes: string[];
  };
  groupLimitations?: {
    maxGroupSize?: number;
    accessibility?: string[];
    ageRestrictions?: string[];
  };
}

export interface OptimizedItinerary {
  id: string;
  name: string;
  totalCost: number;
  currency: string;
  duration: number; // days
  destinations: Destination[];
  dailyPlans: DailyPlan[];
  transportation: TransportationPlan[];
  budgetBreakdown: {
    accommodation: number;
    transportation: number;
    activities: number;
    food: number;
    miscellaneous: number;
  };
  optimizationScore: number; // 0-1
  alternatives?: OptimizedItinerary[];
}

export interface DailyPlan {
  date: Date;
  destination: string;
  activities: Activity[];
  meals: {
    breakfast?: Activity;
    lunch?: Activity;
    dinner?: Activity;
  };
  accommodation?: {
    name: string;
    type: string;
    cost: number;
    location: { latitude: number; longitude: number };
  };
  estimatedCost: number;
  travelTime: number; // minutes between activities
}

export interface TransportationPlan {
  from: string;
  to: string;
  mode: string;
  departure: Date;
  arrival: Date;
  cost: number;
  duration: number; // minutes
  provider?: string;
  details?: any;
}

export interface ItineraryOptimizationInput {
  requirements: TravelRequirements;
  destinations: Destination[];
  constraints: TravelConstraints;
  existingItinerary?: OptimizedItinerary;
  preferences?: {
    prioritizeTime: boolean;
    prioritizeCost: boolean;
    prioritizeExperience: boolean;
  };
}

export class ItineraryOptimizationAgent extends BaseAgent {
  constructor() {
    super('ItineraryOptimizationAgent', '1.0.0');
  }

  getCapabilities(): AgentCapability[] {
    return [
      {
        name: 'optimizeRoute',
        description: 'Optimize travel route between destinations considering constraints',
        inputSchema: {
          destinations: 'Destination[]',
          constraints: 'TravelConstraints'
        },
        outputSchema: {
          optimizedItinerary: 'OptimizedItinerary'
        }
      },
      {
        name: 'balanceTimeAndBudget',
        description: 'Balance itinerary for optimal time and budget allocation',
        inputSchema: {
          itinerary: 'Itinerary',
          budget: 'Budget'
        },
        outputSchema: {
          balancedItinerary: 'BalancedItinerary'
        }
      },
      {
        name: 'generateAlternatives',
        description: 'Generate alternative itinerary options',
        inputSchema: {
          baseItinerary: 'OptimizedItinerary',
          variations: 'string[]'
        },
        outputSchema: {
          alternatives: 'OptimizedItinerary[]'
        }
      }
    ];
  }

  async execute(
    context: AgentContext,
    input: ItineraryOptimizationInput
  ): Promise<AgentResponse<OptimizedItinerary>> {
    const startTime = Date.now();
    this.logActivity(context, 'Starting itinerary optimization', {
      destinationCount: input.destinations.length,
      hasBudgetConstraint: !!input.constraints.maxBudget
    });

    try {
      // Step 1: Optimize destination order and routing
      const optimizedRoute = await this.optimizeDestinationRoute(
        input.destinations,
        input.constraints,
        input.requirements
      );

      // Step 2: Generate daily plans with activities
      const dailyPlans = await this.generateDailyPlans(
        optimizedRoute,
        input.requirements,
        input.constraints
      );

      // Step 3: Plan transportation between destinations
      const transportation = await this.planTransportation(
        optimizedRoute,
        input.constraints
      );

      // Step 4: Calculate costs and create budget breakdown
      const budgetBreakdown = await this.calculateBudgetBreakdown(
        dailyPlans,
        transportation,
        input.requirements
      );

      // Step 5: Calculate optimization score
      const optimizationScore = this.calculateOptimizationScore(
        dailyPlans,
        transportation,
        budgetBreakdown,
        input.requirements,
        input.constraints
      );

      // Step 6: Generate alternatives if requested
      const alternatives = input.preferences?.prioritizeExperience 
        ? await this.generateAlternativeItineraries(dailyPlans, transportation, input)
        : undefined;

      const optimizedItinerary: OptimizedItinerary = {
        id: `itinerary_${Date.now()}`,
        name: `Optimized Trip to ${optimizedRoute.map(d => d.name).join(', ')}`,
        totalCost: Object.values(budgetBreakdown).reduce((sum, cost) => sum + cost, 0),
        currency: input.requirements.budget.currency || 'USD',
        duration: Math.ceil((input.constraints.timeConstraints.endDate.getTime() - 
                            input.constraints.timeConstraints.startDate.getTime()) / (1000 * 60 * 60 * 24)),
        destinations: optimizedRoute,
        dailyPlans,
        transportation,
        budgetBreakdown,
        optimizationScore,
        alternatives
      };

      const processingTime = Date.now() - startTime;
      this.logActivity(context, 'Itinerary optimization completed', {
        processingTime,
        optimizationScore,
        totalCost: optimizedItinerary.totalCost
      });

      return this.createResponse(
        true,
        optimizedItinerary,
        undefined,
        optimizationScore,
        processingTime,
        context.sessionId
      );

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.logActivity(context, 'Itinerary optimization failed', {
        error: errorMessage,
        processingTime
      });

      return this.createResponse<OptimizedItinerary>(
        false,
        undefined,
        errorMessage,
        0,
        processingTime,
        context.sessionId
      );
    }
  }

  private async optimizeDestinationRoute(
    destinations: Destination[],
    constraints: TravelConstraints,
    requirements: TravelRequirements
  ): Promise<Destination[]> {
    if (destinations.length <= 1) return destinations;

    const systemPrompt = `
      You are an expert travel route optimizer. Optimize the order of destinations to minimize travel time and cost while maximizing experience quality.
      
      Consider:
      1. Geographical proximity and logical travel flow
      2. Seasonal factors and weather
      3. Transportation connections
      4. Activity availability and operating hours
      5. Budget constraints
      6. Time constraints
      
      Return optimized destination order with reasoning.
    `;

    const userPrompt = `
      Optimize the route for these destinations:
      ${JSON.stringify(destinations, null, 2)}
      
      Constraints:
      ${JSON.stringify(constraints, null, 2)}
      
      Requirements:
      ${JSON.stringify(requirements, null, 2)}
      
      Return JSON format:
      {
        "optimizedDestinations": [
          {
            "id": "dest_id",
            "name": "destination_name",
            "order": 1,
            "recommendedDuration": 3,
            "arrivalDate": "2024-03-15",
            "departureDate": "2024-03-18",
            "reasoning": "why this order and timing"
          }
        ],
        "totalTravelTime": "estimated_hours",
        "optimizationReasoning": "explanation"
      }
    `;

    const result = await this.generateAIResponse(systemPrompt, userPrompt, true);
    
    // Process AI response and enrich with real-world data
    const optimizedDests = result.optimizedDestinations.map((dest: any) => {
      const original = destinations.find(d => d.id === dest.id) || destinations.find(d => d.name === dest.name);
      return {
        ...original,
        arrivalDate: new Date(dest.arrivalDate),
        departureDate: new Date(dest.departureDate),
        priority: dest.order
      };
    });

    return optimizedDests;
  }

  private async generateDailyPlans(
    destinations: Destination[],
    requirements: TravelRequirements,
    constraints: TravelConstraints
  ): Promise<DailyPlan[]> {
    const dailyPlans: DailyPlan[] = [];

    for (const destination of destinations) {
      if (!destination.arrivalDate || !destination.departureDate) continue;

      const days = Math.ceil(
        (destination.departureDate.getTime() - destination.arrivalDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      for (let dayIndex = 0; dayIndex < days; dayIndex++) {
        const currentDate = new Date(destination.arrivalDate);
        currentDate.setDate(currentDate.getDate() + dayIndex);

        // Get activities for this destination
        const activities = await this.getActivitiesForDestination(
          destination,
          requirements,
          currentDate
        );

        // Optimize daily schedule
        const optimizedSchedule = await this.optimizeDailySchedule(
          activities,
          currentDate,
          requirements
        );

        dailyPlans.push({
          date: currentDate,
          destination: destination.name,
          activities: optimizedSchedule.activities,
          meals: optimizedSchedule.meals,
          accommodation: optimizedSchedule.accommodation,
          estimatedCost: optimizedSchedule.estimatedCost,
          travelTime: optimizedSchedule.travelTime
        });
      }
    }

    return dailyPlans;
  }

  private async getActivitiesForDestination(
    destination: Destination,
    requirements: TravelRequirements,
    date: Date
  ): Promise<Activity[]> {
    try {
      // Use MCP services to get real activity data
      const activities: Activity[] = [];

      // Get activity recommendations from travel info MCP
      const travelInfoService = mcpManager.getService('travelInfo');
      if (travelInfoService) {
        try {
          const travelActivities = await travelInfoService.getRecommendations({
            location: {
              lat: destination.latitude,
              lon: destination.longitude
            },
            category: 'activities',
            limit: 10,
            minRating: 3.0
          });

          if (travelActivities.success && travelActivities.data) {
            activities.push(...travelActivities.data.map((activity: any) => ({
              id: `activity_${Date.now()}_${Math.random()}`,
              name: activity.name,
              description: activity.description,
              type: activity.category || 'general',
              location: {
                latitude: activity.location.lat,
                longitude: activity.location.lon,
                address: activity.location.address || destination.name
              },
              cost: activity.priceLevel ? activity.priceLevel * 25 : 0, // Estimate cost from price level
              currency: requirements.budget.currency || 'USD',
              duration: 2, // Default 2 hours
              priority: activity.rating || 5,
              operatingHours: activity.openingHours
            })));
          }
        } catch (error) {
          console.warn(`Failed to get travel recommendations for ${destination.name}:`, error);
        }
      }

      // If no activities from MCP, generate with AI
      if (activities.length === 0) {
        const aiActivities = await this.generateActivitiesWithAI(destination, requirements, date);
        activities.push(...aiActivities);
      }

      return activities;
    } catch (error) {
      console.warn(`Failed to get activities for ${destination.name}:`, error);
      return this.generateActivitiesWithAI(destination, requirements, date);
    }
  }

  private async generateActivitiesWithAI(
    destination: Destination,
    requirements: TravelRequirements,
    date: Date
  ): Promise<Activity[]> {
    const systemPrompt = `
      You are a local travel expert. Generate a list of activities for a specific destination and date.
      Consider local culture, seasonal factors, operating hours, and traveler preferences.
    `;

    const userPrompt = `
      Generate activities for:
      Destination: ${destination.name}
      Date: ${date.toISOString().split('T')[0]}
      Traveler preferences: ${JSON.stringify(requirements.preferences)}
      Group size: ${requirements.groupDynamics.size}
      
      Return JSON array of activities:
      [
        {
          "name": "activity name",
          "description": "detailed description",
          "type": "cultural|adventure|relaxation|food|shopping|entertainment",
          "cost": estimated_cost_per_person,
          "currency": "USD",
          "duration": hours,
          "operatingHours": {"open": "09:00", "close": "17:00"},
          "priority": 1-10,
          "address": "specific location"
        }
      ]
    `;

    const result = await this.generateAIResponse(systemPrompt, userPrompt, true);
    
    return result.map((activity: any, index: number) => ({
      id: `ai_activity_${Date.now()}_${index}`,
      name: activity.name,
      description: activity.description,
      type: activity.type,
      location: {
        latitude: destination.latitude,
        longitude: destination.longitude,
        address: activity.address
      },
      cost: activity.cost,
      currency: activity.currency,
      duration: activity.duration,
      priority: activity.priority,
      operatingHours: activity.operatingHours
    }));
  }

  private async optimizeDailySchedule(
    activities: Activity[],
    date: Date,
    requirements: TravelRequirements
  ): Promise<{
    activities: Activity[];
    meals: any;
    accommodation: any;
    estimatedCost: number;
    travelTime: number;
  }> {
    // Sort activities by priority and feasibility
    const sortedActivities = activities
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 6); // Limit to 6 activities per day

    const estimatedCost = sortedActivities.reduce((sum, activity) => sum + activity.cost, 0);
    const travelTime = sortedActivities.length * 15; // 15 minutes between activities

    return {
      activities: sortedActivities,
      meals: {
        breakfast: null, // Could be enhanced with restaurant recommendations
        lunch: null,
        dinner: null
      },
      accommodation: null, // Could be enhanced with hotel recommendations
      estimatedCost,
      travelTime
    };
  }

  private async planTransportation(
    destinations: Destination[],
    constraints: TravelConstraints
  ): Promise<TransportationPlan[]> {
    const transportationPlans: TransportationPlan[] = [];

    for (let i = 0; i < destinations.length - 1; i++) {
      const from = destinations[i];
      const to = destinations[i + 1];

      if (!from.departureDate || !to.arrivalDate) continue;

      try {
        // Use MCP Maps service for route planning
        const mapsService = mcpManager.getService('maps');
        if (mapsService) {
          const travelMode = (['driving', 'walking', 'transit', 'cycling'] as const)
            .find(mode => constraints.transportationLimits?.preferredModes.includes(mode)) || 'driving';
            
          const routeplan = await mapsService.planRoute({
            waypoints: [
              { lat: from.latitude, lon: from.longitude },
              { lat: to.latitude, lon: to.longitude }
            ],
            travelMode,
            optimizeOrder: false
          });

          if (routeplan.success && routeplan.data) {
            transportationPlans.push({
              from: from.name,
              to: to.name,
              mode: travelMode,
              departure: from.departureDate,
              arrival: to.arrivalDate,
              cost: 100, // Estimate cost based on distance
              duration: routeplan.data.totalDuration || 120,
              provider: 'Azure Maps',
              details: routeplan.data
            });
          } else {
            throw new Error('Route planning failed');
          }
        } else {
          throw new Error('Maps service not available');
        }
      } catch (error) {
        console.warn(`Failed to plan route from ${from.name} to ${to.name}:`, error);
        
        // Fallback: basic transportation plan
        transportationPlans.push({
          from: from.name,
          to: to.name,
          mode: 'flight',
          departure: from.departureDate,
          arrival: to.arrivalDate,
          cost: 200, // Default estimate
          duration: 180, // Default 3 hours
          details: { type: 'estimated' }
        });
      }
    }

    return transportationPlans;
  }

  private async calculateBudgetBreakdown(
    dailyPlans: DailyPlan[],
    transportation: TransportationPlan[],
    requirements: TravelRequirements
  ) {
    const activities = dailyPlans.reduce((sum, plan) => sum + plan.estimatedCost, 0);
    const transportationCost = transportation.reduce((sum, plan) => sum + plan.cost, 0);
    
    // Estimate other costs
    const accommodation = dailyPlans.length * 100; // $100 per night estimate
    const food = dailyPlans.length * 50; // $50 per day estimate
    const miscellaneous = (activities + transportationCost + accommodation + food) * 0.15; // 15% buffer

    return {
      accommodation,
      transportation: transportationCost,
      activities,
      food,
      miscellaneous
    };
  }

  private calculateOptimizationScore(
    dailyPlans: DailyPlan[],
    transportation: TransportationPlan[],
    budgetBreakdown: any,
    requirements: TravelRequirements,
    constraints: TravelConstraints
  ): number {
    let score = 1.0;

    // Budget adherence (30% weight)
    if (requirements.budget.total && constraints.maxBudget) {
      const totalCost = Object.values(budgetBreakdown).reduce((sum: number, cost: any) => sum + cost, 0);
      const budgetEfficiency = Math.min(1.0, constraints.maxBudget / totalCost);
      score *= 0.7 + (budgetEfficiency * 0.3);
    }

    // Activity alignment with preferences (40% weight)
    const activityTypes = dailyPlans.flatMap(plan => plan.activities.map(a => a.type));
    const preferredTypes = requirements.preferences.activityTypes || [];
    const alignmentScore = preferredTypes.length > 0 
      ? activityTypes.filter(type => preferredTypes.includes(type)).length / activityTypes.length 
      : 1.0;
    score *= 0.6 + (alignmentScore * 0.4);

    // Time efficiency (30% weight)
    const totalTravelTime = transportation.reduce((sum, plan) => sum + plan.duration, 0);
    const totalTripTime = dailyPlans.length * 24 * 60; // Total minutes in trip
    const travelRatio = totalTravelTime / totalTripTime;
    const timeEfficiency = Math.max(0, 1.0 - travelRatio); // Less travel time is better
    score *= 0.7 + (timeEfficiency * 0.3);

    return Math.max(0, Math.min(1.0, score));
  }

  private async generateAlternativeItineraries(
    dailyPlans: DailyPlan[],
    transportation: TransportationPlan[],
    input: ItineraryOptimizationInput
  ): Promise<OptimizedItinerary[]> {
    // For now, return empty array - could be enhanced with actual alternative generation
    return [];
  }
}

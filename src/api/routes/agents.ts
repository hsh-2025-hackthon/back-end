import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { agentCoordinator, AgentWorkflowInput, DisruptionEvent } from '../../services/agents/agent-coordinator';
import { ChatMessage } from '../../models/chat';
import { TripRepository } from '../../models/trip';

const router = Router();

/**
 * Trigger AI agents to optimize itinerary for a trip
 */
router.post('/trips/:tripId/agents/optimize-itinerary', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const userId = req.user!.id;
    const { messages, options } = req.body;

    // Verify user has access to this trip
    const trip = await TripRepository.findById(tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    // TODO: Check if user is collaborator on this trip

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ 
        message: 'Messages array is required' 
      });
    }

    const input: AgentWorkflowInput = {
      tripId,
      userId,
      chatMessages: messages as ChatMessage[],
      workflowType: 'full_optimization',
      options: options || {}
    };

    const result = await agentCoordinator.orchestrateItineraryOptimization(input);

    res.json({
      success: result.success,
      sessionId: result.sessionId,
      requirements: result.requirements,
      itinerary: result.optimizedItinerary,
      alternatives: result.alternatives,
      confidence: result.confidence,
      processingTime: result.processingTime,
      recommendations: result.recommendations,
      warnings: result.warnings,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in itinerary optimization:', error);
    res.status(500).json({ 
      message: 'Failed to optimize itinerary',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Analyze requirements from chat messages
 */
router.post('/trips/:tripId/agents/analyze-requirements', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const userId = req.user!.id;
    const { messages } = req.body;

    // Verify user has access to this trip
    const trip = await TripRepository.findById(tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ 
        message: 'Messages array is required' 
      });
    }

    const input: AgentWorkflowInput = {
      tripId,
      userId,
      chatMessages: messages as ChatMessage[],
      workflowType: 'requirement_analysis'
    };

    const result = await agentCoordinator.orchestrateItineraryOptimization(input);

    res.json({
      success: result.success,
      sessionId: result.sessionId,
      requirements: result.requirements,
      confidence: result.confidence,
      processingTime: result.processingTime,
      recommendations: result.recommendations,
      warnings: result.warnings,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in requirement analysis:', error);
    res.status(500).json({ 
      message: 'Failed to analyze requirements',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Handle adaptive adjustments for disruptions
 */
router.post('/trips/:tripId/agents/adjust-plan', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const userId = req.user!.id;
    const { disruption } = req.body;

    // Verify user has access to this trip
    const trip = await TripRepository.findById(tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    if (!disruption) {
      return res.status(400).json({ 
        message: 'Disruption information is required' 
      });
    }

    const disruptionEvent: DisruptionEvent = {
      type: disruption.type || 'emergency',
      severity: disruption.severity || 'medium',
      affectedDestination: disruption.affectedDestination,
      affectedDate: disruption.affectedDate ? new Date(disruption.affectedDate) : undefined,
      description: disruption.description || 'No description provided',
      suggestedActions: disruption.suggestedActions || []
    };

    const adjustmentPlan = await agentCoordinator.handleAdaptiveAdjustments(
      tripId,
      disruptionEvent,
      userId
    );

    res.json({
      success: true,
      sessionId: adjustmentPlan.sessionId,
      disruption: adjustmentPlan.disruption,
      originalItinerary: adjustmentPlan.originalItinerary,
      adjustedItinerary: adjustmentPlan.adjustedItinerary,
      impactAnalysis: adjustmentPlan.impactAnalysis,
      alternatives: adjustmentPlan.alternatives,
      recommendations: adjustmentPlan.recommendations,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in adaptive adjustment:', error);
    res.status(500).json({ 
      message: 'Failed to create adjustment plan',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get agent session status
 */
router.get('/trips/:tripId/agents/status/:sessionId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId, sessionId } = req.params;
    const userId = req.user!.id;

    // Verify user has access to this trip
    const trip = await TripRepository.findById(tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    const session = agentCoordinator.getSessionStatus(sessionId);
    
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    // Verify user owns this session
    if (session.userId !== userId) {
      return res.status(403).json({ message: 'Access denied to this session' });
    }

    res.json({
      sessionId: session.id,
      tripId: session.tripId,
      status: session.status,
      currentStep: session.currentStep,
      progress: session.progress,
      startTime: session.startTime,
      endTime: session.endTime,
      errors: session.errors,
      hasResults: Object.keys(session.results).length > 0
    });

  } catch (error) {
    console.error('Error getting session status:', error);
    res.status(500).json({ 
      message: 'Failed to get session status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Cancel an active agent session
 */
router.delete('/trips/:tripId/agents/sessions/:sessionId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId, sessionId } = req.params;
    const userId = req.user!.id;

    // Verify user has access to this trip
    const trip = await TripRepository.findById(tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    const session = agentCoordinator.getSessionStatus(sessionId);
    
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    // Verify user owns this session
    if (session.userId !== userId) {
      return res.status(403).json({ message: 'Access denied to this session' });
    }

    const cancelled = agentCoordinator.cancelSession(sessionId);
    
    if (cancelled) {
      res.json({ 
        success: true,
        message: 'Session cancelled successfully',
        sessionId 
      });
    } else {
      res.status(400).json({ 
        success: false,
        message: 'Session could not be cancelled (may already be completed)'
      });
    }

  } catch (error) {
    console.error('Error cancelling session:', error);
    res.status(500).json({ 
      message: 'Failed to cancel session',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get available AI agents and their capabilities
 */
router.get('/agents/available', requireAuth, async (req: Request, res: Response) => {
  try {
    const agents = agentCoordinator.getAvailableAgents();
    
    res.json({
      agents,
      totalAgents: agents.length,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error getting available agents:', error);
    res.status(500).json({ 
      message: 'Failed to get available agents',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get all AI agent sessions for the user
 */
router.get('/agents/sessions', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const sessions = agentCoordinator.getAllUserSessions(userId);
    
    res.json({
      sessions: sessions.map(session => ({
        id: session.id,
        tripId: session.tripId,
        status: session.status,
        currentStep: session.currentStep,
        progress: session.progress,
        startTime: session.startTime,
        endTime: session.endTime,
        hasResults: Object.keys(session.results).length > 0,
        errorCount: session.errors.length
      })),
      totalSessions: sessions.length,
      activeSessions: sessions.filter(s => s.status === 'active').length,
      completedSessions: sessions.filter(s => s.status === 'completed').length,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error getting user agent sessions:', error);
    res.status(500).json({ 
      message: 'Failed to get agent sessions',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get detailed session information
 */
router.get('/agents/sessions/:sessionId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user!.id;

    const session = agentCoordinator.getSessionStatus(sessionId);
    
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    // Verify user owns this session
    if (session.userId !== userId) {
      return res.status(403).json({ message: 'Access denied to this session' });
    }

    res.json({
      session: {
        id: session.id,
        tripId: session.tripId,
        userId: session.userId,
        status: session.status,
        currentStep: session.currentStep,
        progress: session.progress,
        startTime: session.startTime,
        endTime: session.endTime,
        results: session.results,
        errors: session.errors,
        hasResults: Object.keys(session.results).length > 0
      },
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error getting session details:', error);
    res.status(500).json({ 
      message: 'Failed to get session details',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Cancel an active AI agent session
 */
router.post('/agents/sessions/:sessionId/cancel', requireAuth, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user!.id;

    const session = agentCoordinator.getSessionStatus(sessionId);
    
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    // Verify user owns this session
    if (session.userId !== userId) {
      return res.status(403).json({ message: 'Access denied to this session' });
    }

    const cancelled = agentCoordinator.cancelSession(sessionId);
    
    if (cancelled) {
      res.json({ 
        success: true,
        message: 'Session cancelled successfully',
        sessionId 
      });
    } else {
      res.status(400).json({ 
        success: false,
        message: 'Session could not be cancelled (may already be completed)'
      });
    }

  } catch (error) {
    console.error('Error cancelling session:', error);
    res.status(500).json({ 
      message: 'Failed to cancel session',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get logs for an AI agent session
 */
router.get('/agents/sessions/:sessionId/logs', requireAuth, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user!.id;

    const session = agentCoordinator.getSessionStatus(sessionId);
    
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    // Verify user owns this session
    if (session.userId !== userId) {
      return res.status(403).json({ message: 'Access denied to this session' });
    }

    const logs = agentCoordinator.getSessionLogs(sessionId);

    res.json({
      sessionId,
      logs,
      totalLogs: logs.length,
      sessionInfo: {
        status: session.status,
        currentStep: session.currentStep,
        progress: session.progress
      },
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error getting session logs:', error);
    res.status(500).json({ 
      message: 'Failed to get session logs',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get session results
 */
router.get('/agents/sessions/:sessionId/results', requireAuth, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user!.id;

    const session = agentCoordinator.getSessionStatus(sessionId);
    
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    // Verify user owns this session
    if (session.userId !== userId) {
      return res.status(403).json({ message: 'Access denied to this session' });
    }

    if (session.status !== 'completed') {
      return res.status(409).json({ 
        message: 'Session still in progress',
        status: session.status,
        progress: session.progress
      });
    }

    const results = agentCoordinator.getSessionResults(sessionId);

    if (!results || Object.keys(results).length === 0) {
      return res.status(404).json({ message: 'No results available for this session' });
    }

    res.json({
      sessionId,
      results,
      sessionInfo: {
        status: session.status,
        completedAt: session.endTime,
        totalProcessingTime: session.endTime && session.startTime ? 
          session.endTime.getTime() - session.startTime.getTime() : undefined
      },
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error getting session results:', error);
    res.status(500).json({ 
      message: 'Failed to get session results',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;

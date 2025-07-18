import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { VoteRepository } from '../../models/vote';
import { TripRepository } from '../../models/trip';
import { z } from 'zod';

const router = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const CreateVoteSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  voteType: z.enum(['destination', 'restaurant', 'activity', 'budget', 'accommodation', 'transportation']),
  options: z.array(z.object({
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    metadata: z.record(z.any()).optional()
  })).min(2).max(10),
  settings: z.object({
    multipleChoice: z.boolean().optional(),
    anonymous: z.boolean().optional(),
    changeVote: z.boolean().optional(),
    requireComment: z.boolean().optional(),
    showResults: z.enum(['never', 'after_vote', 'always']).optional()
  }).optional(),
  deadline: z.string().datetime().optional(),
  chatMessageId: z.string().uuid().optional()
});

const UpdateVoteSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  deadline: z.string().datetime().optional(),
  status: z.enum(['active', 'closed', 'cancelled']).optional()
});

const SubmitVoteSchema = z.object({
  selectedOptions: z.array(z.string().uuid()).min(1),
  ranking: z.record(z.number()).optional(),
  comment: z.string().optional(),
  isAnonymous: z.boolean().optional()
});

// ============================================================================
// Helper Functions
// ============================================================================

async function checkTripAccess(tripId: string, userId: string): Promise<boolean> {
  const trip = await TripRepository.findById(tripId);
  if (!trip) return false;
  
  // Check if user is trip owner
  if (trip.createdBy === userId) return true;
  
  // Check if user is a collaborator
  const collaborators = await TripRepository.getCollaborators(tripId);
  return collaborators.some(collab => collab.userId === userId);
}

async function broadcastVoteUpdate(tripId: string, vote: any, eventType: string): Promise<void> {
  try {
    const { broadcastToTrip } = await import('../../lib/webpubsub');
    
    await broadcastToTrip(tripId, {
      type: eventType,
      data: vote
    });
  } catch (error) {
    console.error('Error broadcasting vote update:', error);
  }
}

// ============================================================================
// Vote Management
// ============================================================================

/**
 * GET /api/trips/:tripId/votes
 * Get all votes for a trip
 */
router.get('/trips/:tripId/votes', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const { status, type, include_results } = req.query;
    
    // Check access
    const hasAccess = await checkTripAccess(tripId, req.user!.id);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const filters = {
      status: status as any,
      voteType: type as any,
      includeResults: include_results === 'true'
    };
    
    const votes = await VoteRepository.findVotesByTripId(tripId, filters);
    
    // Filter results based on vote settings and user permissions
    const filteredVotes = votes.map(vote => {
      const userResponse = vote.responses?.find(r => r.userId === req.user!.id);
      const canSeeResults = vote.settings.showResults === 'always' || 
                           (vote.settings.showResults === 'after_vote' && userResponse) ||
                           vote.status === 'closed';
      
      return {
        ...vote,
        responses: canSeeResults ? vote.responses : undefined,
        resultSummary: canSeeResults ? vote.resultSummary : undefined
      };
    });
    
    res.json(filteredVotes);
  } catch (error) {
    console.error('Error fetching votes:', error);
    res.status(500).json({ message: 'Failed to fetch votes' });
  }
});

/**
 * POST /api/trips/:tripId/votes
 * Create a new vote
 */
router.post('/trips/:tripId/votes', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const voteData = CreateVoteSchema.parse(req.body);
    
    // Check access
    const hasAccess = await checkTripAccess(tripId, req.user!.id);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const vote = await VoteRepository.createVote({
      ...voteData,
      tripId,
      creatorId: req.user!.id,
      deadline: voteData.deadline ? new Date(voteData.deadline) : undefined
    });
    
    // Broadcast new vote to trip members
    await broadcastVoteUpdate(tripId, vote, 'vote_created');
    
    res.status(201).json(vote);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid vote data', errors: error.issues });
    }
    console.error('Error creating vote:', error);
    res.status(500).json({ message: 'Failed to create vote' });
  }
});

/**
 * GET /api/votes/:voteId
 * Get a specific vote with details
 */
router.get('/votes/:voteId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { voteId } = req.params;
    const { include_responses } = req.query;
    
    const vote = await VoteRepository.findVoteById(voteId, include_responses === 'true');
    if (!vote) {
      return res.status(404).json({ message: 'Vote not found' });
    }
    
    // Check access
    const hasAccess = await checkTripAccess(vote.tripId, req.user!.id);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Check if user can see results
    const userResponse = vote.responses?.find(r => r.userId === req.user!.id);
    const canSeeResults = vote.settings.showResults === 'always' || 
                         (vote.settings.showResults === 'after_vote' && userResponse) ||
                         vote.status === 'closed';
    
    const filteredVote = {
      ...vote,
      responses: canSeeResults ? vote.responses : undefined,
      resultSummary: canSeeResults ? vote.resultSummary : undefined
    };
    
    res.json(filteredVote);
  } catch (error) {
    console.error('Error fetching vote:', error);
    res.status(500).json({ message: 'Failed to fetch vote' });
  }
});

/**
 * PUT /api/votes/:voteId
 * Update a vote
 */
router.put('/votes/:voteId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { voteId } = req.params;
    const updates = UpdateVoteSchema.parse(req.body);
    
    const vote = await VoteRepository.findVoteById(voteId);
    if (!vote) {
      return res.status(404).json({ message: 'Vote not found' });
    }
    
    // Check if user is vote creator
    if (vote.creatorId !== req.user!.id) {
      return res.status(403).json({ message: 'Only vote creator can update vote' });
    }
    
    // Prepare update data
    const updateData: any = {};
    if (updates.title) updateData.title = updates.title;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.deadline) updateData.deadline = new Date(updates.deadline);
    if (updates.status) updateData.status = updates.status;
    
    const updatedVote = await VoteRepository.updateVote(voteId, updateData);
    
    // Broadcast update
    await broadcastVoteUpdate(vote.tripId, updatedVote, 'vote_updated');
    
    res.json(updatedVote);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid vote data', errors: error.issues });
    }
    console.error('Error updating vote:', error);
    res.status(500).json({ message: 'Failed to update vote' });
  }
});

/**
 * DELETE /api/votes/:voteId
 * Delete a vote
 */
router.delete('/votes/:voteId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { voteId } = req.params;
    
    const vote = await VoteRepository.findVoteById(voteId);
    if (!vote) {
      return res.status(404).json({ message: 'Vote not found' });
    }
    
    // Check if user is vote creator or trip owner
    const trip = await TripRepository.findById(vote.tripId);
    const isCreator = vote.creatorId === req.user!.id;
    const isTripOwner = trip?.createdBy === req.user!.id;
    
    if (!isCreator && !isTripOwner) {
      return res.status(403).json({ message: 'Only vote creator or trip owner can delete vote' });
    }
    
    await VoteRepository.deleteVote(voteId);
    
    // Broadcast deletion
    await broadcastVoteUpdate(vote.tripId, { id: voteId }, 'vote_deleted');
    
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting vote:', error);
    res.status(500).json({ message: 'Failed to delete vote' });
  }
});

// ============================================================================
// Vote Responses
// ============================================================================

/**
 * POST /api/votes/:voteId/responses
 * Submit a vote response
 */
router.post('/votes/:voteId/responses', requireAuth, async (req: Request, res: Response) => {
  try {
    const { voteId } = req.params;
    const responseData = SubmitVoteSchema.parse(req.body);
    
    // Check if user can vote
    const canVote = await VoteRepository.canUserVote(voteId, req.user!.id);
    if (!canVote) {
      return res.status(403).json({ message: 'You cannot vote on this poll' });
    }
    
    const vote = await VoteRepository.findVoteById(voteId);
    if (!vote) {
      return res.status(404).json({ message: 'Vote not found' });
    }
    
    // Validate selected options
    const validOptionIds = vote.options.map(opt => opt.id);
    const invalidOptions = responseData.selectedOptions.filter(opt => !validOptionIds.includes(opt));
    if (invalidOptions.length > 0) {
      return res.status(400).json({ message: 'Invalid option IDs', invalid: invalidOptions });
    }
    
    // Check if multiple choice is allowed
    if (!vote.settings.multipleChoice && responseData.selectedOptions.length > 1) {
      return res.status(400).json({ message: 'This vote does not allow multiple selections' });
    }
    
    // Check if comment is required
    if (vote.settings.requireComment && !responseData.comment) {
      return res.status(400).json({ message: 'Comment is required for this vote' });
    }
    
    const response = await VoteRepository.submitResponse({
      voteId,
      userId: req.user!.id,
      ...responseData
    });
    
    // Update vote results
    await VoteRepository.updateResultSummary(voteId);
    
    // Broadcast response update
    const updatedVote = await VoteRepository.findVoteById(voteId, true);
    await broadcastVoteUpdate(vote.tripId, updatedVote, 'vote_response_updated');
    
    res.status(201).json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid response data', errors: error.issues });
    }
    console.error('Error submitting vote response:', error);
    res.status(500).json({ message: 'Failed to submit vote response' });
  }
});

/**
 * PUT /api/votes/:voteId/responses
 * Update a vote response
 */
router.put('/votes/:voteId/responses', requireAuth, async (req: Request, res: Response) => {
  try {
    const { voteId } = req.params;
    const responseData = SubmitVoteSchema.parse(req.body);
    
    const vote = await VoteRepository.findVoteById(voteId);
    if (!vote) {
      return res.status(404).json({ message: 'Vote not found' });
    }
    
    // Check if user has already voted
    const existingResponse = await VoteRepository.getUserResponse(voteId, req.user!.id);
    if (!existingResponse) {
      return res.status(404).json({ message: 'No existing response found' });
    }
    
    // Check if vote allows changing responses
    if (!vote.settings.changeVote) {
      return res.status(403).json({ message: 'This vote does not allow changing responses' });
    }
    
    // Check if vote is still active
    if (vote.status !== 'active') {
      return res.status(400).json({ message: 'Vote is not active' });
    }
    
    // Check deadline
    if (vote.deadline && new Date() > vote.deadline) {
      return res.status(400).json({ message: 'Vote deadline has passed' });
    }
    
    // Validate selected options
    const validOptionIds = vote.options.map(opt => opt.id);
    const invalidOptions = responseData.selectedOptions.filter(opt => !validOptionIds.includes(opt));
    if (invalidOptions.length > 0) {
      return res.status(400).json({ message: 'Invalid option IDs', invalid: invalidOptions });
    }
    
    const response = await VoteRepository.updateResponse(voteId, req.user!.id, responseData);
    
    // Update vote results
    await VoteRepository.updateResultSummary(voteId);
    
    // Broadcast response update
    const updatedVote = await VoteRepository.findVoteById(voteId, true);
    await broadcastVoteUpdate(vote.tripId, updatedVote, 'vote_response_updated');
    
    res.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid response data', errors: error.issues });
    }
    console.error('Error updating vote response:', error);
    res.status(500).json({ message: 'Failed to update vote response' });
  }
});

/**
 * DELETE /api/votes/:voteId/responses
 * Delete a vote response
 */
router.delete('/votes/:voteId/responses', requireAuth, async (req: Request, res: Response) => {
  try {
    const { voteId } = req.params;
    
    const vote = await VoteRepository.findVoteById(voteId);
    if (!vote) {
      return res.status(404).json({ message: 'Vote not found' });
    }
    
    // Check if user has a response to delete
    const existingResponse = await VoteRepository.getUserResponse(voteId, req.user!.id);
    if (!existingResponse) {
      return res.status(404).json({ message: 'No response found to delete' });
    }
    
    // Check if vote allows changing responses
    if (!vote.settings.changeVote) {
      return res.status(403).json({ message: 'This vote does not allow changing responses' });
    }
    
    await VoteRepository.deleteResponse(voteId, req.user!.id);
    
    // Update vote results
    await VoteRepository.updateResultSummary(voteId);
    
    // Broadcast response update
    const updatedVote = await VoteRepository.findVoteById(voteId, true);
    await broadcastVoteUpdate(vote.tripId, updatedVote, 'vote_response_updated');
    
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting vote response:', error);
    res.status(500).json({ message: 'Failed to delete vote response' });
  }
});

/**
 * GET /api/votes/:voteId/results
 * Get vote results
 */
router.get('/votes/:voteId/results', requireAuth, async (req: Request, res: Response) => {
  try {
    const { voteId } = req.params;
    
    const vote = await VoteRepository.findVoteById(voteId);
    if (!vote) {
      return res.status(404).json({ message: 'Vote not found' });
    }
    
    // Check access
    const hasAccess = await checkTripAccess(vote.tripId, req.user!.id);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Check if user can see results
    const userResponse = await VoteRepository.getUserResponse(voteId, req.user!.id);
    const canSeeResults = vote.settings.showResults === 'always' || 
                         (vote.settings.showResults === 'after_vote' && userResponse) ||
                         vote.status === 'closed';
    
    if (!canSeeResults) {
      return res.status(403).json({ message: 'Results not available yet' });
    }
    
    const results = await VoteRepository.calculateResults(voteId);
    res.json(results);
  } catch (error) {
    console.error('Error fetching vote results:', error);
    res.status(500).json({ message: 'Failed to fetch vote results' });
  }
});

// ============================================================================
// Vote Management Actions
// ============================================================================

/**
 * POST /api/votes/:voteId/close
 * Close a vote
 */
router.post('/votes/:voteId/close', requireAuth, async (req: Request, res: Response) => {
  try {
    const { voteId } = req.params;
    
    const vote = await VoteRepository.findVoteById(voteId);
    if (!vote) {
      return res.status(404).json({ message: 'Vote not found' });
    }
    
    // Check if user is vote creator
    if (vote.creatorId !== req.user!.id) {
      return res.status(403).json({ message: 'Only vote creator can close vote' });
    }
    
    const closedVote = await VoteRepository.closeVote(voteId);
    
    // Broadcast closure
    await broadcastVoteUpdate(vote.tripId, closedVote, 'vote_closed');
    
    res.json(closedVote);
  } catch (error) {
    console.error('Error closing vote:', error);
    res.status(500).json({ message: 'Failed to close vote' });
  }
});

export default router;
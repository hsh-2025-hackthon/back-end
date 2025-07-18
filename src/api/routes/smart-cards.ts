import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { TripRepository } from '../../models/trip';
import { itineraryCardGenerator } from '../../features/smart-cards/itinerary-card-generator';

const router = Router();

/**
 * GET /api/trips/{tripId}/smart-cards
 * Get enriched itinerary cards for a trip
 */
router.get('/:tripId/smart-cards', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const userId = (req as any).user.id;
    
    // Check if user has access to this trip
    const hasAccess = await TripRepository.checkTripAccess(tripId, userId);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Trip not found or access denied' });
    }
    
    // Generate smart cards for the trip
    const cards = await itineraryCardGenerator.generateTripCards(tripId);
    
    res.json({
      success: true,
      tripId,
      totalCards: cards.length,
      cards,
      generatedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error generating smart cards:', error);
    res.status(500).json({
      error: 'Failed to generate smart cards',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/trips/{tripId}/smart-cards/{cardId}/refresh
 * Refresh enriched data for a specific card
 */
router.post('/:tripId/smart-cards/:cardId/refresh', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId, cardId } = req.params;
    const userId = (req as any).user.id;
    
    // Check if user has access to this trip
    const hasAccess = await TripRepository.checkTripAccess(tripId, userId);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Trip not found or access denied' });
    }
    
    // For now, regenerate all cards and find the requested one
    // In a future enhancement, we could cache individual cards and refresh specific ones
    const cards = await itineraryCardGenerator.generateTripCards(tripId);
    const card = cards.find(c => c.id === cardId);
    
    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }
    
    res.json({
      success: true,
      cardId,
      card,
      refreshedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error refreshing smart card:', error);
    res.status(500).json({
      error: 'Failed to refresh smart card',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/trips/{tripId}/smart-cards/summary
 * Get a summary of all smart cards for a trip
 */
router.get('/:tripId/smart-cards/summary', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const userId = (req as any).user.id;
    
    // Check if user has access to this trip
    const hasAccess = await TripRepository.checkTripAccess(tripId, userId);
    if (!hasAccess) {
      return res.status(404).json({ error: 'Trip not found or access denied' });
    }
    
    // Generate cards and create summary
    const cards = await itineraryCardGenerator.generateTripCards(tripId);
    
    const summary = {
      totalCards: cards.length,
      cardsByType: cards.reduce((acc, card) => {
        acc[card.type] = (acc[card.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      cardsByStatus: cards.reduce((acc, card) => {
        acc[card.basicInfo.status] = (acc[card.basicInfo.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      upcomingCards: cards
        .filter(card => card.basicInfo.date >= new Date())
        .slice(0, 3)
        .map(card => ({
          id: card.id,
          title: card.title,
          date: card.basicInfo.date,
          startTime: card.basicInfo.startTime,
          type: card.type
        })),
      alertsCount: cards.reduce((count, card) => {
        return count + (card.enrichedData.weather?.alerts?.length || 0);
      }, 0),
      dataFreshness: {
        oldest: Math.min(...cards.map(c => c.enrichedData.lastUpdated.getTime())),
        newest: Math.max(...cards.map(c => c.enrichedData.lastUpdated.getTime())),
        averageAge: cards.reduce((sum, card) => {
          return sum + (Date.now() - card.enrichedData.lastUpdated.getTime());
        }, 0) / cards.length
      }
    };
    
    res.json({
      success: true,
      tripId,
      summary,
      generatedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error generating smart cards summary:', error);
    res.status(500).json({
      error: 'Failed to generate smart cards summary',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;

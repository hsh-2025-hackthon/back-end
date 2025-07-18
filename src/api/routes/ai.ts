import { Router, Request, Response } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth';
import { generateItinerary, getOpenAIClient } from '../../lib/openai';
import { TripRepository } from '../../models/trip';

const router = Router();

interface ItineraryRequest {
  destination: string;
  duration: number;
  budget?: number;
  interests?: string[];
  travelStyle?: 'budget' | 'mid-range' | 'luxury';
  groupSize?: number;
}

interface RecommendationRequest {
  destination: string;
  category: 'restaurants' | 'activities' | 'accommodations' | 'transportation';
  budget?: number;
  preferences?: string[];
}

// Generate AI-powered itinerary
router.post('/itinerary', requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      destination,
      duration,
      budget,
      interests = [],
      travelStyle = 'mid-range',
      groupSize = 1
    }: ItineraryRequest = req.body;

    if (!destination || !duration) {
      return res.status(400).json({ 
        message: 'destination and duration are required' 
      });
    }

    if (duration < 1 || duration > 30) {
      return res.status(400).json({ 
        message: 'duration must be between 1 and 30 days' 
      });
    }

    const client = getOpenAIClient();
    
    const prompt = `Generate a detailed ${duration}-day itinerary for ${destination}.
    
    Requirements:
    - Travel style: ${travelStyle}
    - Group size: ${groupSize}
    - Budget: ${budget ? `$${budget}` : 'flexible'}
    - Interests: ${interests.length > 0 ? interests.join(', ') : 'general tourism'}
    
    Format the response as a JSON object with the following structure:
    {
      "title": "Trip title",
      "summary": "Brief overview",
      "totalEstimatedCost": number,
      "days": [
        {
          "day": 1,
          "date": "YYYY-MM-DD",
          "theme": "day theme",
          "activities": [
            {
              "time": "HH:MM",
              "activity": "activity name",
              "description": "detailed description",
              "location": "specific location",
              "estimatedCost": number,
              "duration": "duration in hours"
            }
          ]
        }
      ],
      "tips": ["helpful travel tips"],
      "packingList": ["essential items to pack"]
    }`;

    const result = await client.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: "You are a professional travel planner. Always respond with valid JSON only." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 4000
    });

    const content = result.choices[0].message?.content;
    if (!content) {
      throw new Error('No response from AI service');
    }

    try {
      const itinerary = JSON.parse(content);
      res.json({ 
        success: true,
        itinerary,
        generatedAt: new Date().toISOString()
      });
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      res.status(500).json({ 
        message: 'Failed to parse itinerary response',
        rawResponse: content
      });
    }

  } catch (error) {
    console.error('Error generating itinerary:', error);
    res.status(500).json({ message: 'Failed to generate itinerary' });
  }
});

// Get AI recommendations for specific categories
router.post('/recommendations', requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      destination,
      category,
      budget,
      preferences = []
    }: RecommendationRequest = req.body;

    if (!destination || !category) {
      return res.status(400).json({ 
        message: 'destination and category are required' 
      });
    }

    const validCategories = ['restaurants', 'activities', 'accommodations', 'transportation'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ 
        message: 'category must be one of: ' + validCategories.join(', ')
      });
    }

    const client = getOpenAIClient();
    
    const prompt = `Recommend the best ${category} in ${destination}.
    
    Requirements:
    - Budget: ${budget ? `$${budget} total` : 'flexible'}
    - Preferences: ${preferences.length > 0 ? preferences.join(', ') : 'none specified'}
    
    Provide 5-10 recommendations in JSON format:
    {
      "recommendations": [
        {
          "name": "recommendation name",
          "description": "detailed description",
          "location": "specific address or area",
          "priceRange": "$ | $$ | $$$",
          "rating": number,
          "highlights": ["key features"],
          "tips": "helpful tips"
        }
      ]
    }`;

    const result = await client.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: "You are a knowledgeable local travel expert. Always respond with valid JSON only." },
        { role: "user", content: prompt }
      ],
      temperature: 0.6,
      max_tokens: 2000
    });

    const content = result.choices[0].message?.content;
    if (!content) {
      throw new Error('No response from AI service');
    }

    try {
      const recommendations = JSON.parse(content);
      res.json({ 
        success: true,
        category,
        destination,
        ...recommendations,
        generatedAt: new Date().toISOString()
      });
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      res.status(500).json({ 
        message: 'Failed to parse recommendations response',
        rawResponse: content
      });
    }

  } catch (error) {
    console.error('Error generating recommendations:', error);
    res.status(500).json({ message: 'Failed to generate recommendations' });
  }
});

// Enhance existing trip with AI suggestions
router.post('/enhance-trip/:tripId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const userId = req.user!.id;

    // Verify user has access to this trip
    const trip = await TripRepository.findById(tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    const collaborators = await TripRepository.getCollaborators(tripId);
    const hasAccess = trip.createdBy === userId || 
                     collaborators.some(collab => collab.userId === userId);

    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this trip' });
    }

    const client = getOpenAIClient();
    
    const prompt = `Enhance this existing trip with additional suggestions:
    
    Trip Details:
    - Title: ${trip.title}
    - Destinations: ${trip.destinations?.map(d => d.name).join(', ') || 'Not specified'}
    - Duration: ${Math.ceil((new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) / (1000 * 60 * 60 * 24))} days
    - Budget: ${trip.budget ? `$${trip.budget}` : 'Not specified'}
    - Description: ${trip.description || 'No description'}
    
    Provide enhancement suggestions in JSON format:
    {
      "enhancements": {
        "hiddenGems": ["lesser-known places to visit"],
        "localExperiences": ["authentic local activities"],
        "foodRecommendations": ["must-try local dishes"],
        "budgetTips": ["ways to save money"],
        "seasonalAdvice": ["time-specific recommendations"],
        "packingTips": ["destination-specific packing advice"]
      }
    }`;

    const result = await client.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: "You are a travel enhancement specialist. Always respond with valid JSON only." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });

    const content = result.choices[0].message?.content;
    if (!content) {
      throw new Error('No response from AI service');
    }

    try {
      const enhancements = JSON.parse(content);
      res.json({ 
        success: true,
        tripId,
        ...enhancements,
        generatedAt: new Date().toISOString()
      });
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      res.status(500).json({ 
        message: 'Failed to parse enhancement response',
        rawResponse: content
      });
    }

  } catch (error) {
    console.error('Error enhancing trip:', error);
    res.status(500).json({ message: 'Failed to enhance trip' });
  }
});


export default router;

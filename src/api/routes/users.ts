import { Router, Request, Response } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth';
import { UserRepository, CreateUserData, UpdateUserData } from '../../models/user';

const router = Router();

// Get current user profile
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const user = await UserRepository.findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    console.error('Error getting user profile:', error);
    res.status(500).json({ message: 'Failed to get user profile' });
  }
});

// Update current user profile
router.put('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const updateData: UpdateUserData = req.body;
    
    // Validate update data
    if (updateData.email && !isValidEmail(updateData.email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }
    
    const updatedUser = await UserRepository.update(userId, updateData);
    
    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ message: 'Failed to update user profile' });
  }
});

// Get a user by ID (public profile)
router.get('/:id', optionalAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = await UserRepository.findById(id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Return limited public profile
    const publicProfile = {
      id: user.id,
      name: user.name,
      // Only include email if requesting user is authenticated and it's their own profile
      ...(req.user && req.user.id === user.id && { email: user.email }),
      createdAt: user.createdAt
    };
    
    res.json(publicProfile);
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({ message: 'Failed to get user' });
  }
});

// Search users (for collaboration features)
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { 
      search, 
      limit = '20', 
      offset = '0' 
    } = req.query;
    
    const limitNum = Math.min(parseInt(limit as string) || 20, 50);
    const offsetNum = parseInt(offset as string) || 0;
    
    if (search && typeof search === 'string') {
      // Search by email or name
      const users = await UserRepository.findAll(limitNum, offsetNum);
      const filteredUsers = users.filter(user => 
        user.name.toLowerCase().includes(search.toLowerCase()) ||
        user.email.toLowerCase().includes(search.toLowerCase())
      );
      
      // Return limited public profiles
      const publicProfiles = filteredUsers.map(user => ({
        id: user.id,
        name: user.name,
        email: user.email, // Include email for search results (for collaboration)
        createdAt: user.createdAt
      }));
      
      return res.json(publicProfiles);
    }
    
    // Get all users with pagination
    const users = await UserRepository.findAll(limitNum, offsetNum);
    
    // Return limited public profiles
    const publicProfiles = users.map(user => ({
      id: user.id,
      name: user.name,
      createdAt: user.createdAt
    }));
    
    res.json(publicProfiles);
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ message: 'Failed to search users' });
  }
});

// Create a new user (typically called by auth middleware)
router.post('/', async (req: Request, res: Response) => {
  try {
    const userData: CreateUserData = req.body;
    
    // Validate required fields
    if (!userData.name || !userData.email) {
      return res.status(400).json({ message: 'Name and email are required' });
    }
    
    if (!isValidEmail(userData.email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }
    
    // Check if user already exists
    const existingUser = await UserRepository.findByEmail(userData.email);
    if (existingUser) {
      return res.status(409).json({ message: 'User with this email already exists' });
    }
    
    const newUser = await UserRepository.create(userData);
    res.status(201).json(newUser);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Failed to create user' });
  }
});

// Delete current user account
router.delete('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const deleted = await UserRepository.delete(userId);
    
    if (!deleted) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting user account:', error);
    res.status(500).json({ message: 'Failed to delete user account' });
  }
});

// Admin route: Delete any user (would need admin middleware in production)
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // In a real app, you'd check if the requesting user is an admin
    // For now, only allow users to delete their own account
    if (req.user!.id !== id) {
      return res.status(403).json({ message: 'You can only delete your own account' });
    }
    
    const deleted = await UserRepository.delete(id);
    
    if (!deleted) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Failed to delete user' });
  }
});

// Utility function to validate email format
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export default router;

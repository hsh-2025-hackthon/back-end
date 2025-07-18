import { Router, Request, Response } from 'express';

const router = Router();

interface User {
  id: string;
  name: string;
  email: string;
}

// Mock database
const users: User[] = [];

// Get all users
router.get('/', (req: Request, res: Response) => {
  res.json(users);
});

// Get a user by ID
router.get('/:id', (req: Request, res: Response) => {
  const user = users.find(u => u.id === req.params.id);
  if (user) {
    res.json(user);
  } else {
    res.status(404).json({ message: 'User not found' });
  }
});

// Create a new user
router.post('/', (req: Request, res: Response) => {
  const newUser: User = { id: Date.now().toString(), ...req.body };
  users.push(newUser);
  res.status(201).json(newUser);
});

// Update a user
router.put('/:id', (req: Request, res: Response) => {
  const userIndex = users.findIndex(u => u.id === req.params.id);
  if (userIndex > -1) {
    users[userIndex] = { ...users[userIndex], ...req.body };
    res.json(users[userIndex]);
  } else {
    res.status(404).json({ message: 'User not found' });
  }
});

// Delete a user
router.delete('/:id', (req: Request, res: Response) => {
  const userIndex = users.findIndex(u => u.id === req.params.id);
  if (userIndex > -1) {
    users.splice(userIndex, 1);
    res.status(204).send();
  } else {
    res.status(404).json({ message: 'User not found' });
  }
});

export default router;

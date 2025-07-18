import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { ChatRepository } from '../../models/chat';
import { TripRepository } from '../../models/trip';
import { z } from 'zod';

const router = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const CreateRoomSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  isDefault: z.boolean().optional()
});

const SendMessageSchema = z.object({
  content: z.string().min(1).max(10000),
  messageType: z.enum(['text', 'system', 'ai_suggestion', 'vote', 'command_result', 'expense_notification']).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  repliedTo: z.string().uuid().optional()
});

const AddMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['admin', 'member', 'viewer']).optional()
});

const UpdateMemberSchema = z.object({
  role: z.enum(['admin', 'member', 'viewer']).optional(),
  permissions: z.array(z.string()).optional()
});

const MarkReadSchema = z.object({
  messageId: z.string().uuid()
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

async function checkRoomAccess(roomId: string, userId: string): Promise<boolean> {
  const room = await ChatRepository.findRoomById(roomId);
  if (!room) return false;
  
  // Check if user has access to the trip
  const hasTripAccess = await checkTripAccess(room.tripId, userId);
  if (!hasTripAccess) return false;
  
  // Check if user is a room member
  return await ChatRepository.userHasAccess(roomId, userId);
}

async function broadcastMessage(roomId: string, message: any): Promise<void> {
  try {
    const { broadcastToChatRoom } = await import('../../lib/webpubsub');
    
    await broadcastToChatRoom(roomId, {
      type: 'new_message',
      data: message
    });
  } catch (error) {
    console.error('Error broadcasting message:', error);
  }
}

// ============================================================================
// Chat Room Management
// ============================================================================

/**
 * GET /api/trips/:tripId/chat/rooms
 * Get all chat rooms for a trip
 */
router.get('/trips/:tripId/chat/rooms', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const { include_members, include_last_message } = req.query;
    
    // Check access
    const hasAccess = await checkTripAccess(tripId, req.user!.id);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const rooms = await ChatRepository.findRoomsByTripId(tripId);
    
    // Include members if requested
    if (include_members === 'true') {
      for (const room of rooms) {
        room.members = await ChatRepository.getRoomMembers(room.id);
      }
    }
    
    // Include last message if requested
    if (include_last_message === 'true') {
      for (const room of rooms) {
        const messages = await ChatRepository.getMessages(room.id, { limit: 1 });
        room.lastMessage = messages[0] || undefined;
      }
    }
    
    res.json(rooms);
  } catch (error) {
    console.error('Error fetching chat rooms:', error);
    res.status(500).json({ message: 'Failed to fetch chat rooms' });
  }
});

/**
 * POST /api/trips/:tripId/chat/rooms
 * Create a new chat room
 */
router.post('/trips/:tripId/chat/rooms', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const roomData = CreateRoomSchema.parse(req.body);
    
    // Check access
    const hasAccess = await checkTripAccess(tripId, req.user!.id);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const newRoom = await ChatRepository.createRoom({
      ...roomData,
      tripId,
      createdBy: req.user!.id
    });
    
    // Automatically add creator as admin
    await ChatRepository.addMember(newRoom.id, req.user!.id, 'admin');
    
    // Add all trip members to the room
    const trip = await TripRepository.findById(tripId);
    if (trip) {
      const collaborators = await TripRepository.getCollaborators(tripId);
      for (const collaborator of collaborators) {
        await ChatRepository.addMember(newRoom.id, collaborator.userId, 'member');
      }
    }
    
    res.status(201).json(newRoom);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid room data', errors: error.issues });
    }
    console.error('Error creating chat room:', error);
    res.status(500).json({ message: 'Failed to create chat room' });
  }
});

/**
 * PUT /api/chat/rooms/:roomId
 * Update chat room information
 */
router.put('/chat/rooms/:roomId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const updates = CreateRoomSchema.partial().parse(req.body);
    
    // Check if user is room admin
    const members = await ChatRepository.getRoomMembers(roomId);
    const userMembership = members.find(m => m.userId === req.user!.id);
    
    if (!userMembership || userMembership.role !== 'admin') {
      return res.status(403).json({ message: 'Only room admins can update room settings' });
    }
    
    const updatedRoom = await ChatRepository.updateRoom(roomId, updates);
    res.json(updatedRoom);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid update data', errors: error.issues });
    }
    console.error('Error updating chat room:', error);
    res.status(500).json({ message: 'Failed to update chat room' });
  }
});

/**
 * DELETE /api/chat/rooms/:roomId
 * Delete a chat room
 */
router.delete('/chat/rooms/:roomId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    
    const room = await ChatRepository.findRoomById(roomId);
    if (!room) {
      return res.status(404).json({ message: 'Chat room not found' });
    }
    
    // Check if user is room creator or trip owner
    const trip = await TripRepository.findById(room.tripId);
    const isCreator = room.createdBy === req.user!.id;
    const isTripOwner = trip?.createdBy === req.user!.id;
    
    if (!isCreator && !isTripOwner) {
      return res.status(403).json({ message: 'Only room creator or trip owner can delete room' });
    }
    
    await ChatRepository.deleteRoom(roomId);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting chat room:', error);
    res.status(500).json({ message: 'Failed to delete chat room' });
  }
});

// ============================================================================
// Message Management
// ============================================================================

/**
 * GET /api/chat/rooms/:roomId/messages
 * Get messages from a chat room
 */
router.get('/chat/rooms/:roomId/messages', requireAuth, async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const { limit = '50', before, after, types, search } = req.query;
    
    // Check access
    const hasAccess = await checkRoomAccess(roomId, req.user!.id);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this chat room' });
    }
    
    const options = {
      limit: Math.min(parseInt(limit as string), 100),
      before: before as string,
      after: after as string,
      types: types ? (types as string).split(',') : undefined
    };
    
    let messages;
    if (search) {
      messages = await ChatRepository.searchMessages(roomId, search as string);
    } else {
      messages = await ChatRepository.getMessages(roomId, options);
    }
    
    const hasMore = messages.length === options.limit;
    const nextCursor = hasMore ? messages[messages.length - 1].id : undefined;
    
    res.json({
      messages,
      has_more: hasMore,
      next_cursor: nextCursor
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ message: 'Failed to fetch messages' });
  }
});

/**
 * POST /api/chat/rooms/:roomId/messages
 * Send a message to a chat room
 */
router.post('/chat/rooms/:roomId/messages', requireAuth, async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const messageData = SendMessageSchema.parse(req.body);
    
    // Check access and permissions
    const hasAccess = await checkRoomAccess(roomId, req.user!.id);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this chat room' });
    }
    
    const permissions = await ChatRepository.getUserPermissions(roomId, req.user!.id);
    if (!permissions.includes('write')) {
      return res.status(403).json({ message: 'You do not have permission to send messages' });
    }
    
    const message = await ChatRepository.createMessage({
      ...messageData,
      roomId,
      userId: req.user!.id
    });
    
    // Broadcast message to room members
    await broadcastMessage(roomId, message);
    
    res.status(201).json(message);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid message data', errors: error.issues });
    }
    console.error('Error sending message:', error);
    res.status(500).json({ message: 'Failed to send message' });
  }
});

/**
 * PUT /api/chat/messages/:messageId
 * Edit a message
 */
router.put('/chat/messages/:messageId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    const { content } = SendMessageSchema.pick({ content: true }).parse(req.body);
    
    // Get message and check ownership
    const message = await ChatRepository.getMessageById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Check if user is the message sender
    if (message.userId !== req.user!.id) {
      return res.status(403).json({ message: 'You can only edit your own messages' });
    }
    
    const updatedMessage = await ChatRepository.updateMessage(messageId, { content });
    
    // Broadcast update
    const { broadcastToChatRoom } = await import('../../lib/webpubsub');
    await broadcastToChatRoom(updatedMessage.roomId, {
      type: 'message_updated',
      data: updatedMessage
    });
    
    res.json(updatedMessage);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid message data', errors: error.issues });
    }
    console.error('Error updating message:', error);
    res.status(500).json({ message: 'Failed to update message' });
  }
});

/**
 * DELETE /api/chat/messages/:messageId
 * Delete a message
 */
router.delete('/chat/messages/:messageId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    
    // TODO: Add proper message ownership check
    
    await ChatRepository.deleteMessage(messageId);
    
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ message: 'Failed to delete message' });
  }
});

/**
 * POST /api/chat/rooms/:roomId/read
 * Mark messages as read
 */
router.post('/chat/rooms/:roomId/read', requireAuth, async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const { messageId } = MarkReadSchema.parse(req.body);
    
    // Check access
    const hasAccess = await checkRoomAccess(roomId, req.user!.id);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this chat room' });
    }
    
    await ChatRepository.markAsRead(roomId, req.user!.id, messageId);
    
    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid request data', errors: error.issues });
    }
    console.error('Error marking messages as read:', error);
    res.status(500).json({ message: 'Failed to mark messages as read' });
  }
});

// ============================================================================
// Member Management
// ============================================================================

/**
 * GET /api/chat/rooms/:roomId/members
 * Get chat room members
 */
router.get('/chat/rooms/:roomId/members', requireAuth, async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    
    // Check access
    const hasAccess = await checkRoomAccess(roomId, req.user!.id);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this chat room' });
    }
    
    const members = await ChatRepository.getRoomMembers(roomId);
    res.json(members);
  } catch (error) {
    console.error('Error fetching room members:', error);
    res.status(500).json({ message: 'Failed to fetch room members' });
  }
});

/**
 * POST /api/chat/rooms/:roomId/members
 * Add a member to a chat room
 */
router.post('/chat/rooms/:roomId/members', requireAuth, async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const { userId, role } = AddMemberSchema.parse(req.body);
    
    // Check if user is room admin
    const members = await ChatRepository.getRoomMembers(roomId);
    const userMembership = members.find(m => m.userId === req.user!.id);
    
    if (!userMembership || userMembership.role !== 'admin') {
      return res.status(403).json({ message: 'Only room admins can add members' });
    }
    
    await ChatRepository.addMember(roomId, userId, role || 'member');
    
    res.status(201).json({ message: 'Member added successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid member data', errors: error.issues });
    }
    console.error('Error adding member:', error);
    res.status(500).json({ message: 'Failed to add member' });
  }
});

/**
 * PUT /api/chat/rooms/:roomId/members/:userId
 * Update member permissions
 */
router.put('/chat/rooms/:roomId/members/:userId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { roomId, userId } = req.params;
    const { role } = UpdateMemberSchema.parse(req.body);
    
    // Check if user is room admin
    const members = await ChatRepository.getRoomMembers(roomId);
    const userMembership = members.find(m => m.userId === req.user!.id);
    
    if (!userMembership || userMembership.role !== 'admin') {
      return res.status(403).json({ message: 'Only room admins can update member permissions' });
    }
    
    if (role) {
      await ChatRepository.updateMemberRole(roomId, userId, role);
    }
    
    res.json({ message: 'Member permissions updated' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid member data', errors: error.issues });
    }
    console.error('Error updating member permissions:', error);
    res.status(500).json({ message: 'Failed to update member permissions' });
  }
});

/**
 * DELETE /api/chat/rooms/:roomId/members/:userId
 * Remove a member from a chat room
 */
router.delete('/chat/rooms/:roomId/members/:userId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { roomId, userId } = req.params;
    
    // Check if user is room admin or removing themselves
    const members = await ChatRepository.getRoomMembers(roomId);
    const userMembership = members.find(m => m.userId === req.user!.id);
    
    if (userId !== req.user!.id && (!userMembership || userMembership.role !== 'admin')) {
      return res.status(403).json({ message: 'Only room admins can remove members' });
    }
    
    await ChatRepository.removeMember(roomId, userId);
    
    res.status(204).send();
  } catch (error) {
    console.error('Error removing member:', error);
    res.status(500).json({ message: 'Failed to remove member' });
  }
});

export default router;
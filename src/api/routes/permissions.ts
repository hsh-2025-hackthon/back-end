import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { TripRepository } from '../../models/trip';
import { PermissionService } from '../../services/permission-service';
import { CollaborationRole } from '../../models/trip';
import { z } from 'zod';

const router = Router();

// Request validation schemas
const UpdatePermissionSchema = z.object({
  role: z.enum(['owner', 'editor', 'viewer'])
});

const BulkUpdatePermissionsSchema = z.object({
  updates: z.array(z.object({
    userId: z.string().uuid(),
    role: z.enum(['owner', 'editor', 'viewer'])
  }))
});

/**
 * Get all user permissions for a trip
 */
router.get('/trips/:tripId/permissions', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const userId = req.user!.id;

    // Verify user has access to this trip
    const hasAccess = await TripRepository.checkTripAccess(tripId, userId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this trip' });
    }

    // Get trip owner information
    const trip = await TripRepository.findById(tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    // Get all collaborator permissions
    const permissions = await PermissionService.getTripPermissions(tripId);

    // Add trip owner to the permissions list
    const ownerQuery = await TripRepository.findById(tripId);
    const ownerPermissions = [{
      userId: trip.createdBy,
      name: 'Trip Owner', // Would need to get actual user name
      email: '', // Would need to get actual user email
      role: 'owner' as CollaborationRole,
      invitedAt: trip.createdAt,
      acceptedAt: trip.createdAt,
      isActive: true
    }];

    const allPermissions = [...ownerPermissions, ...permissions];

    res.json({
      permissions: allPermissions,
      totalUsers: allPermissions.length,
      tripOwner: trip.createdBy,
      requestedBy: userId
    });

  } catch (error) {
    console.error('Error getting trip permissions:', error);
    res.status(500).json({ 
      message: 'Failed to get trip permissions',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get a specific user's permissions for a trip
 */
router.get('/trips/:tripId/permissions/:userId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId, userId: targetUserId } = req.params;
    const userId = req.user!.id;

    // Verify user has access to this trip
    const hasAccess = await TripRepository.checkTripAccess(tripId, userId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this trip' });
    }

    // Check if target user is the trip owner
    const trip = await TripRepository.findById(tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    if (trip.createdBy === targetUserId) {
      return res.json({
        permission: {
          userId: targetUserId,
          name: 'Trip Owner',
          email: '',
          role: 'owner',
          invitedAt: trip.createdAt,
          acceptedAt: trip.createdAt,
          isActive: true
        },
        effectivePermissions: {
          role: 'owner',
          canEdit: true,
          canDelete: true,
          canManageCollaborators: true,
          canView: true
        }
      });
    }

    // Get collaborator permission
    const permission = await PermissionService.getUserPermission(tripId, targetUserId);
    
    if (!permission) {
      return res.status(404).json({ message: 'User permission not found' });
    }

    const effectivePermissions = await PermissionService.getEffectivePermissions(tripId, targetUserId);

    res.json({
      permission,
      effectivePermissions
    });

  } catch (error) {
    console.error('Error getting user permission:', error);
    res.status(500).json({ 
      message: 'Failed to get user permission',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Update a user's permissions for a trip
 */
router.put('/trips/:tripId/permissions/:userId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId, userId: targetUserId } = req.params;
    const userId = req.user!.id;

    // Verify user has management permissions
    const trip = await TripRepository.findById(tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    // Only trip owner can update permissions
    if (trip.createdBy !== userId) {
      return res.status(403).json({ message: 'Only trip owner can update permissions' });
    }

    // Cannot update owner's own permissions
    if (trip.createdBy === targetUserId) {
      return res.status(400).json({ message: 'Cannot update trip owner permissions' });
    }

    const validatedData = UpdatePermissionSchema.parse(req.body);
    
    // Don't allow setting role to 'owner' via this endpoint
    if (validatedData.role === 'owner') {
      return res.status(400).json({ message: 'Cannot set role to owner via this endpoint' });
    }

    const updatedPermission = await PermissionService.updateUserPermission(
      tripId, 
      targetUserId, 
      { role: validatedData.role as CollaborationRole }
    );

    if (!updatedPermission) {
      return res.status(404).json({ message: 'User permission not found' });
    }

    res.json({
      success: true,
      permission: updatedPermission,
      message: `User role updated to ${validatedData.role}`
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: 'Invalid request data', 
        errors: error.issues 
      });
    }
    
    console.error('Error updating user permission:', error);
    res.status(500).json({ 
      message: 'Failed to update user permission',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Remove a user's permissions for a trip
 */
router.delete('/trips/:tripId/permissions/:userId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId, userId: targetUserId } = req.params;
    const userId = req.user!.id;

    // Verify user has management permissions
    const trip = await TripRepository.findById(tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    // Only trip owner can remove permissions
    if (trip.createdBy !== userId) {
      return res.status(403).json({ message: 'Only trip owner can remove permissions' });
    }

    // Cannot remove owner's own permissions
    if (trip.createdBy === targetUserId) {
      return res.status(400).json({ message: 'Cannot remove trip owner permissions' });
    }

    const removed = await PermissionService.removeUserPermission(tripId, targetUserId);

    if (!removed) {
      return res.status(404).json({ message: 'User permission not found' });
    }

    res.json({
      success: true,
      message: 'User permissions removed successfully',
      removedUser: targetUserId
    });

  } catch (error) {
    console.error('Error removing user permission:', error);
    res.status(500).json({ 
      message: 'Failed to remove user permission',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Bulk update permissions for multiple users
 */
router.patch('/trips/:tripId/permissions', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const userId = req.user!.id;

    // Verify user has management permissions
    const trip = await TripRepository.findById(tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    // Only trip owner can bulk update permissions
    if (trip.createdBy !== userId) {
      return res.status(403).json({ message: 'Only trip owner can bulk update permissions' });
    }

    const validatedData = BulkUpdatePermissionsSchema.parse(req.body);

    // Filter out owner updates and role='owner' assignments
    const validUpdates = validatedData.updates.filter(update => {
      if (update.userId === trip.createdBy) {
        return false; // Skip owner updates
      }
      if (update.role === 'owner') {
        return false; // Skip owner role assignments
      }
      return true;
    });

    const result = await PermissionService.bulkUpdatePermissions(tripId, validUpdates);

    res.json({
      success: result.success,
      updated: result.updated,
      requested: validatedData.updates.length,
      skipped: validatedData.updates.length - validUpdates.length,
      errors: result.errors,
      message: `Successfully updated ${result.updated} permissions`
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: 'Invalid request data', 
        errors: error.issues 
      });
    }
    
    console.error('Error bulk updating permissions:', error);
    res.status(500).json({ 
      message: 'Failed to bulk update permissions',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get permission history for audit trail
 */
router.get('/trips/:tripId/permissions/history', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const userId = req.user!.id;
    const targetUserId = req.query.userId as string;

    // Verify user has access to this trip
    const hasAccess = await TripRepository.checkTripAccess(tripId, userId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied to this trip' });
    }

    // Only trip owner can view permission history
    const trip = await TripRepository.findById(tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    if (trip.createdBy !== userId) {
      return res.status(403).json({ message: 'Only trip owner can view permission history' });
    }

    const history = await PermissionService.getPermissionHistory(tripId, targetUserId);

    res.json({
      history,
      totalChanges: history.length,
      tripId,
      filteredByUser: targetUserId || null
    });

  } catch (error) {
    console.error('Error getting permission history:', error);
    res.status(500).json({ 
      message: 'Failed to get permission history',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Check effective permissions for current user
 */
router.get('/trips/:tripId/permissions/effective', requireAuth, async (req: Request, res: Response) => {
  try {
    const { tripId } = req.params;
    const userId = req.user!.id;

    // Verify trip exists
    const trip = await TripRepository.findById(tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    const effectivePermissions = await PermissionService.getEffectivePermissions(tripId, userId);

    res.json({
      userId,
      tripId,
      effectivePermissions,
      isOwner: trip.createdBy === userId
    });

  } catch (error) {
    console.error('Error getting effective permissions:', error);
    res.status(500).json({ 
      message: 'Failed to get effective permissions',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;

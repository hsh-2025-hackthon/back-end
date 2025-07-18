import { getDatabase } from '../config/database';
import { CollaborationRole } from '../models/trip';

export interface TripPermission {
  userId: string;
  name: string;
  email: string;
  role: CollaborationRole;
  invitedAt: Date;
  acceptedAt?: Date;
  isActive: boolean;
}

export interface UpdatePermissionData {
  role: CollaborationRole;
}

export class PermissionService {
  /**
   * Get all user permissions for a trip
   */
  static async getTripPermissions(tripId: string): Promise<TripPermission[]> {
    const db = getDatabase();
    const query = `
      SELECT 
        tc.user_id as "userId",
        u.name,
        u.email,
        tc.role,
        tc.invited_at as "invitedAt",
        tc.accepted_at as "acceptedAt",
        (tc.accepted_at IS NOT NULL) as "isActive"
      FROM trip_collaborators tc
      JOIN users u ON tc.user_id = u.id
      WHERE tc.trip_id = $1
      ORDER BY tc.invited_at ASC
    `;
    
    const result = await db.query(query, [tripId]);
    return result.rows;
  }

  /**
   * Get a specific user's permissions for a trip
   */
  static async getUserPermission(tripId: string, userId: string): Promise<TripPermission | null> {
    const db = getDatabase();
    const query = `
      SELECT 
        tc.user_id as "userId",
        u.name,
        u.email,
        tc.role,
        tc.invited_at as "invitedAt",
        tc.accepted_at as "acceptedAt",
        (tc.accepted_at IS NOT NULL) as "isActive"
      FROM trip_collaborators tc
      JOIN users u ON tc.user_id = u.id
      WHERE tc.trip_id = $1 AND tc.user_id = $2
    `;
    
    const result = await db.query(query, [tripId, userId]);
    return result.rows[0] || null;
  }

  /**
   * Update a user's permissions for a trip
   */
  static async updateUserPermission(
    tripId: string, 
    userId: string, 
    data: UpdatePermissionData
  ): Promise<TripPermission | null> {
    const db = getDatabase();
    
    try {
      const updateQuery = `
        UPDATE trip_collaborators 
        SET role = $1
        WHERE trip_id = $2 AND user_id = $3
        RETURNING user_id as "userId", role, invited_at as "invitedAt", accepted_at as "acceptedAt"
      `;
      
      const result = await db.query(updateQuery, [data.role, tripId, userId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      // Get complete user information
      const userQuery = `
        SELECT u.name, u.email
        FROM users u
        WHERE u.id = $1
      `;
      
      const userResult = await db.query(userQuery, [userId]);
      const user = userResult.rows[0];
      
      return {
        userId,
        name: user.name,
        email: user.email,
        role: result.rows[0].role,
        invitedAt: result.rows[0].invitedAt,
        acceptedAt: result.rows[0].acceptedAt,
        isActive: !!result.rows[0].acceptedAt
      };
      
    } catch (error) {
      console.error('Error updating user permission:', error);
      return null;
    }
  }

  /**
   * Remove a user's permissions for a trip
   */
  static async removeUserPermission(tripId: string, userId: string): Promise<boolean> {
    const db = getDatabase();
    
    try {
      const deleteQuery = `
        DELETE FROM trip_collaborators 
        WHERE trip_id = $1 AND user_id = $2
      `;
      
      const result = await db.query(deleteQuery, [tripId, userId]);
      return (result.rowCount ?? 0) > 0;
      
    } catch (error) {
      console.error('Error removing user permission:', error);
      return false;
    }
  }

  /**
   * Check if a user has a specific permission level for a trip
   */
  static async hasPermission(
    tripId: string, 
    userId: string, 
    requiredRole: CollaborationRole
  ): Promise<boolean> {
    const db = getDatabase();
    
    // Check if user is the trip owner
    const ownerQuery = `
      SELECT 1 FROM trips WHERE id = $1 AND created_by = $2
    `;
    const ownerResult = await db.query(ownerQuery, [tripId, userId]);
    
    if (ownerResult.rows.length > 0) {
      return true; // Trip owner has all permissions
    }
    
    // Check collaborator role
    const roleQuery = `
      SELECT role FROM trip_collaborators 
      WHERE trip_id = $1 AND user_id = $2 AND accepted_at IS NOT NULL
    `;
    const roleResult = await db.query(roleQuery, [tripId, userId]);
    
    if (roleResult.rows.length === 0) {
      return false;
    }
    
    const userRole = roleResult.rows[0].role as CollaborationRole;
    
    // Role hierarchy: owner > editor > viewer
    const roleHierarchy: Record<CollaborationRole, number> = {
      'owner': 3,
      'editor': 2,
      'viewer': 1
    };
    
    return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
  }

  /**
   * Get effective permissions for a user on a trip
   */
  static async getEffectivePermissions(tripId: string, userId: string): Promise<{
    role: CollaborationRole | 'owner' | null;
    canEdit: boolean;
    canDelete: boolean;
    canManageCollaborators: boolean;
    canView: boolean;
  }> {
    const db = getDatabase();
    
    // Check if user is the trip owner
    const ownerQuery = `
      SELECT 1 FROM trips WHERE id = $1 AND created_by = $2
    `;
    const ownerResult = await db.query(ownerQuery, [tripId, userId]);
    
    if (ownerResult.rows.length > 0) {
      return {
        role: 'owner',
        canEdit: true,
        canDelete: true,
        canManageCollaborators: true,
        canView: true
      };
    }
    
    // Check collaborator role
    const roleQuery = `
      SELECT role FROM trip_collaborators 
      WHERE trip_id = $1 AND user_id = $2 AND accepted_at IS NOT NULL
    `;
    const roleResult = await db.query(roleQuery, [tripId, userId]);
    
    if (roleResult.rows.length === 0) {
      return {
        role: null,
        canEdit: false,
        canDelete: false,
        canManageCollaborators: false,
        canView: false
      };
    }
    
    const userRole = roleResult.rows[0].role as CollaborationRole;
    
    const permissions = {
      role: userRole,
      canView: true, // All collaborators can view
      canEdit: userRole === 'editor',
      canDelete: false, // Only owners can delete trips
      canManageCollaborators: false // Only owners can manage collaborators
    };
    
    return permissions;
  }

  /**
   * Bulk update permissions for multiple users
   */
  static async bulkUpdatePermissions(
    tripId: string,
    updates: { userId: string; role: CollaborationRole }[]
  ): Promise<{ success: boolean; updated: number; errors: string[] }> {
    const db = getDatabase();
    const errors: string[] = [];
    let updated = 0;
    
    try {
      await db.query('BEGIN');
      
      for (const update of updates) {
        try {
          const updateQuery = `
            UPDATE trip_collaborators 
            SET role = $1
            WHERE trip_id = $2 AND user_id = $3
          `;
          
          const result = await db.query(updateQuery, [update.role, tripId, update.userId]);
          
          if ((result.rowCount ?? 0) > 0) {
            updated++;
          } else {
            errors.push(`User ${update.userId} not found in trip collaborators`);
          }
          
        } catch (error) {
          errors.push(`Failed to update user ${update.userId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      await db.query('COMMIT');
      
      return {
        success: errors.length === 0,
        updated,
        errors
      };
      
    } catch (error) {
      await db.query('ROLLBACK');
      console.error('Error in bulk permission update:', error);
      
      return {
        success: false,
        updated: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Get permission history for audit trail
   */
  static async getPermissionHistory(tripId: string, userId?: string): Promise<any[]> {
    const db = getDatabase();
    
    // For now, return trip changes related to collaborators
    // In a more complete implementation, you might have a dedicated audit table
    let query = `
      SELECT 
        tc.change_type as "changeType",
        tc.entity_type as "entityType",
        tc.entity_id as "entityId",
        tc.old_value as "oldValue",
        tc.new_value as "newValue",
        tc.change_description as "changeDescription",
        tc.created_by as "createdBy",
        tc.created_at as "createdAt",
        u.name as "createdByName"
      FROM trip_changes tc
      JOIN users u ON tc.created_by = u.id
      WHERE tc.trip_id = $1 
        AND tc.entity_type IN ('collaborator', 'permission', 'role')
    `;
    
    const params: any[] = [tripId];
    
    if (userId) {
      query += ` AND tc.entity_id = $2`;
      params.push(userId);
    }
    
    query += ` ORDER BY tc.created_at DESC`;
    
    const result = await db.query(query, params);
    return result.rows;
  }
}

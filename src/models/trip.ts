import { getDatabase } from '../config/database';

export type TripStatus = 'planning' | 'in-progress' | 'completed';
export type CollaborationRole = 'owner' | 'editor' | 'viewer';

export interface Destination {
  id?: string;
  name: string;
  country?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  description?: string;
  orderIndex?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CreateDestinationData {
  name: string;
  country?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  description?: string;
  orderIndex?: number;
}

export interface UpdateDestinationData {
  name?: string;
  country?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  description?: string;
  orderIndex?: number;
}

export interface Trip {
  id: string;
  title: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  destinations?: Destination[];
  budget?: number;
  currency: string;
  status: TripStatus;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTripData {
  title: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  destination?: Destination;
  budget?: number;
  currency?: string;
  createdBy: string;
}

export interface UpdateTripData {
  title?: string;
  description?: string;
  startDate?: Date;
  endDate?: Date;
  destination?: Destination;
  budget?: number;
  currency?: string;
  status?: TripStatus;
}

export interface TripCollaborator {
  id: string;
  tripId: string;
  userId: string;
  role: CollaborationRole;
  invitedAt: Date;
  acceptedAt?: Date;
  user?: {
    id: string;
    name: string;
    email: string;
  };
}

export class TripRepository {
  static async create(tripData: CreateTripData): Promise<Trip> {
    const db = getDatabase();
    const query = `
      INSERT INTO trips (title, description, start_date, end_date, destination, budget, currency, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, title, description, start_date as "startDate", end_date as "endDate", 
                destination, budget, currency, status, created_by as "createdBy", 
                created_at as "createdAt", updated_at as "updatedAt"
    `;
    
    const result = await db.query(query, [
      tripData.title,
      tripData.description,
      tripData.startDate,
      tripData.endDate,
      tripData.destination ? JSON.stringify(tripData.destination) : null,
      tripData.budget,
      tripData.currency || 'USD',
      tripData.createdBy
    ]);
    
    return result.rows[0];
  }

  static async findById(id: string): Promise<Trip | null> {
    const db = getDatabase();
    const query = `
      SELECT id, title, description, start_date as "startDate", end_date as "endDate", 
             destination, budget, currency, status, created_by as "createdBy", 
             created_at as "createdAt", updated_at as "updatedAt"
      FROM trips WHERE id = $1
    `;
    
    const result = await db.query(query, [id]);
    return result.rows[0] || null;
  }

  static async findByUserId(userId: string, limit: number = 50, offset: number = 0): Promise<Trip[]> {
    const db = getDatabase();
    const query = `
      SELECT DISTINCT t.id, t.title, t.description, t.start_date as "startDate", t.end_date as "endDate", 
             t.destination, t.budget, t.currency, t.status, t.created_by as "createdBy", 
             t.created_at as "createdAt", t.updated_at as "updatedAt"
      FROM trips t
      LEFT JOIN trip_collaborators tc ON t.id = tc.trip_id
      WHERE t.created_by = $1 OR tc.user_id = $1
      ORDER BY t.created_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    const result = await db.query(query, [userId, limit, offset]);
    return result.rows;
  }

  static async update(id: string, tripData: UpdateTripData): Promise<Trip | null> {
    const db = getDatabase();
    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (tripData.title !== undefined) {
      fields.push(`title = $${paramIndex++}`);
      values.push(tripData.title);
    }
    if (tripData.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(tripData.description);
    }
    if (tripData.startDate !== undefined) {
      fields.push(`start_date = $${paramIndex++}`);
      values.push(tripData.startDate);
    }
    if (tripData.endDate !== undefined) {
      fields.push(`end_date = $${paramIndex++}`);
      values.push(tripData.endDate);
    }
    if (tripData.destination !== undefined) {
      fields.push(`destination = $${paramIndex++}`);
      values.push(tripData.destination ? JSON.stringify(tripData.destination) : null);
    }
    if (tripData.budget !== undefined) {
      fields.push(`budget = $${paramIndex++}`);
      values.push(tripData.budget);
    }
    if (tripData.currency !== undefined) {
      fields.push(`currency = $${paramIndex++}`);
      values.push(tripData.currency);
    }
    if (tripData.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(tripData.status);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE trips SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, title, description, start_date as "startDate", end_date as "endDate", 
                destination, budget, currency, status, created_by as "createdBy", 
                created_at as "createdAt", updated_at as "updatedAt"
    `;
    
    const result = await db.query(query, values);
    return result.rows[0] || null;
  }

  static async delete(id: string): Promise<boolean> {
    const db = getDatabase();
    const query = 'DELETE FROM trips WHERE id = $1';
    const result = await db.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  static async addCollaborator(tripId: string, userId: string, role: CollaborationRole = 'viewer'): Promise<TripCollaborator> {
    const db = getDatabase();
    const query = `
      INSERT INTO trip_collaborators (trip_id, user_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (trip_id, user_id) DO UPDATE SET role = $3
      RETURNING id, trip_id as "tripId", user_id as "userId", role, 
                invited_at as "invitedAt", accepted_at as "acceptedAt"
    `;
    
    const result = await db.query(query, [tripId, userId, role]);
    return result.rows[0];
  }

  static async getCollaborators(tripId: string): Promise<TripCollaborator[]> {
    const db = getDatabase();
    const query = `
      SELECT tc.id, tc.trip_id as "tripId", tc.user_id as "userId", tc.role, 
             tc.invited_at as "invitedAt", tc.accepted_at as "acceptedAt",
             u.name, u.email
      FROM trip_collaborators tc
      JOIN users u ON tc.user_id = u.id
      WHERE tc.trip_id = $1
      ORDER BY tc.invited_at ASC
    `;
    
    const result = await db.query(query, [tripId]);
    return result.rows.map(row => ({
      id: row.id,
      tripId: row.tripId,
      userId: row.userId,
      role: row.role,
      invitedAt: row.invitedAt,
      acceptedAt: row.acceptedAt,
      user: {
        id: row.userId,
        name: row.name,
        email: row.email
      }
    }));
  }

  static async removeCollaborator(tripId: string, userId: string): Promise<boolean> {
    const db = getDatabase();
    const query = 'DELETE FROM trip_collaborators WHERE trip_id = $1 AND user_id = $2';
    const result = await db.query(query, [tripId, userId]);
    return (result.rowCount ?? 0) > 0;
  }

  // Destination CRUD methods
  static async addDestination(tripId: string, destinationData: CreateDestinationData): Promise<Destination> {
    const db = getDatabase();
    const query = `
      INSERT INTO destinations (trip_id, name, country, city, latitude, longitude, description, order_index)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, trip_id as "tripId", name, country, city, latitude, longitude, description, 
                order_index as "orderIndex", created_at as "createdAt", updated_at as "updatedAt"
    `;
    
    const result = await db.query(query, [
      tripId,
      destinationData.name,
      destinationData.country,
      destinationData.city,
      destinationData.latitude,
      destinationData.longitude,
      destinationData.description,
      destinationData.orderIndex || 0
    ]);
    
    return result.rows[0];
  }

  static async getDestinations(tripId: string): Promise<Destination[]> {
    const db = getDatabase();
    const query = `
      SELECT id, name, country, city, latitude, longitude, description, 
             order_index as "orderIndex", created_at as "createdAt", updated_at as "updatedAt"
      FROM destinations 
      WHERE trip_id = $1 
      ORDER BY order_index ASC, created_at ASC
    `;
    
    const result = await db.query(query, [tripId]);
    return result.rows;
  }

  static async updateDestination(tripId: string, destinationId: string, destinationData: UpdateDestinationData): Promise<Destination | null> {
    const db = getDatabase();
    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (destinationData.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(destinationData.name);
    }
    if (destinationData.country !== undefined) {
      fields.push(`country = $${paramIndex++}`);
      values.push(destinationData.country);
    }
    if (destinationData.city !== undefined) {
      fields.push(`city = $${paramIndex++}`);
      values.push(destinationData.city);
    }
    if (destinationData.latitude !== undefined) {
      fields.push(`latitude = $${paramIndex++}`);
      values.push(destinationData.latitude);
    }
    if (destinationData.longitude !== undefined) {
      fields.push(`longitude = $${paramIndex++}`);
      values.push(destinationData.longitude);
    }
    if (destinationData.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(destinationData.description);
    }
    if (destinationData.orderIndex !== undefined) {
      fields.push(`order_index = $${paramIndex++}`);
      values.push(destinationData.orderIndex);
    }

    if (fields.length === 0) {
      return null;
    }

    fields.push(`updated_at = NOW()`);
    values.push(tripId, destinationId);

    const query = `
      UPDATE destinations SET ${fields.join(', ')}
      WHERE trip_id = $${paramIndex} AND id = $${paramIndex + 1}
      RETURNING id, name, country, city, latitude, longitude, description, 
                order_index as "orderIndex", created_at as "createdAt", updated_at as "updatedAt"
    `;
    
    const result = await db.query(query, values);
    return result.rows[0] || null;
  }

  static async removeDestination(tripId: string, destinationId: string): Promise<boolean> {
    const db = getDatabase();
    const query = 'DELETE FROM destinations WHERE trip_id = $1 AND id = $2';
    const result = await db.query(query, [tripId, destinationId]);
    return (result.rowCount ?? 0) > 0;
  }

  // Helper method to get trip with destinations
  static async findByIdWithDestinations(id: string): Promise<Trip | null> {
    const trip = await this.findById(id);
    if (!trip) return null;

    const destinations = await this.getDestinations(id);
    return {
      ...trip,
      destinations
    };
  }
}

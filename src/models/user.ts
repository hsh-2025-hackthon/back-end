import { getDatabase } from '../config/database';

export interface User {
  id: string;
  name: string;
  email: string;
  googleId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserData {
  name: string;
  email: string;
  googleId?: string;
}

export interface UpdateUserData {
  name?: string;
  email?: string;
}

export class UserRepository {
  static async create(userData: CreateUserData): Promise<User> {
    const db = getDatabase();
    const query = `
      INSERT INTO users (name, email, google_id)
      VALUES ($1, $2, $3)
      RETURNING id, name, email, google_id as "googleId", created_at as "createdAt", updated_at as "updatedAt"
    `;
    
    const result = await db.query(query, [userData.name, userData.email, userData.googleId]);
    return result.rows[0];
  }

  static async findById(id: string): Promise<User | null> {
    const db = getDatabase();
    const query = `
      SELECT id, name, email, google_id as "googleId", created_at as "createdAt", updated_at as "updatedAt"
      FROM users WHERE id = $1
    `;
    
    const result = await db.query(query, [id]);
    return result.rows[0] || null;
  }

  static async findByEmail(email: string): Promise<User | null> {
    const db = getDatabase();
    const query = `
      SELECT id, name, email, google_id as "googleId", created_at as "createdAt", updated_at as "updatedAt"
      FROM users WHERE email = $1
    `;
    
    const result = await db.query(query, [email]);
    return result.rows[0] || null;
  }

  static async findByGoogleId(googleId: string): Promise<User | null> {
    const db = getDatabase();
    const query = `
      SELECT id, name, email, google_id as "googleId", created_at as "createdAt", updated_at as "updatedAt"
      FROM users WHERE google_id = $1
    `;
    
    const result = await db.query(query, [googleId]);
    return result.rows[0] || null;
  }

  static async update(id: string, userData: UpdateUserData): Promise<User | null> {
    const db = getDatabase();
    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (userData.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(userData.name);
    }
    if (userData.email !== undefined) {
      fields.push(`email = $${paramIndex++}`);
      values.push(userData.email);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE users SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, name, email, google_id as "googleId", created_at as "createdAt", updated_at as "updatedAt"
    `;
    
    const result = await db.query(query, values);
    return result.rows[0] || null;
  }

  static async delete(id: string): Promise<boolean> {
    const db = getDatabase();
    const query = 'DELETE FROM users WHERE id = $1';
    const result = await db.query(query, [id]);
    return (result.rowCount || 0) > 0;
  }

  static async findAll(limit: number = 50, offset: number = 0): Promise<User[]> {
    const db = getDatabase();
    const query = `
      SELECT id, name, email, google_id as "googleId", created_at as "createdAt", updated_at as "updatedAt"
      FROM users 
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `;
    
    const result = await db.query(query, [limit, offset]);
    return result.rows;
  }
}

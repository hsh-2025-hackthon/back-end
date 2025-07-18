import { Pool } from 'pg';
import pgvector from 'pgvector';

const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'travel_planning',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'password',
});

// Initialize pgvector for the pool
pool.on('connect', async (client) => {
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');
});

// Destination interface for search results
interface Destination {
    id: string;
    name: string;
    description: string;
    location: string;
    country: string;
    category: string;
    rating?: number;
    price_range?: string;
    embedding?: number[];
    similarity_score?: number;
}

// Initialize search tables and indexes
export const initializeSearchTables = async () => {
    const client = await pool.connect();
    
    try {
        // Create destinations table with vector column
        await client.query(`
            CREATE TABLE IF NOT EXISTS search_destinations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) NOT NULL,
                description TEXT,
                location VARCHAR(255),
                country VARCHAR(100),
                category VARCHAR(100),
                rating DECIMAL(3,2),
                price_range VARCHAR(50),
                embedding vector(1536),  -- OpenAI embedding dimension
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create indexes for better performance
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_destinations_embedding 
            ON search_destinations USING ivfflat (embedding vector_cosine_ops)
            WITH (lists = 100)
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_destinations_name 
            ON search_destinations USING gin(to_tsvector('english', name))
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_destinations_description 
            ON search_destinations USING gin(to_tsvector('english', description))
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_destinations_category 
            ON search_destinations (category)
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_destinations_country 
            ON search_destinations (country)
        `);

        console.log('Search tables and indexes initialized successfully');
    } catch (error) {
        console.error('Error initializing search tables:', error);
        throw error;
    } finally {
        client.release();
    }
};

// Vector similarity search
export const searchDestinations = async (
    searchText: string, 
    embedding: number[], 
    limit: number = 10,
    similarityThreshold: number = 0.7
): Promise<Destination[]> => {
    const client = await pool.connect();
    
    try {
        const query = `
            SELECT 
                id,
                name,
                description,
                location,
                country,
                category,
                rating,
                price_range,
                1 - (embedding <=> $1::vector) AS similarity_score
            FROM search_destinations
            WHERE 1 - (embedding <=> $1::vector) > $2
            ORDER BY embedding <=> $1::vector
            LIMIT $3
        `;
        
        const result = await client.query(query, [
            pgvector.toSql(embedding),
            similarityThreshold,
            limit
        ]);
        
        return result.rows;
    } catch (error) {
        console.error('Error in vector search:', error);
        throw error;
    } finally {
        client.release();
    }
};

// Full-text search with optional vector filtering
export const searchDestinationsFullText = async (
    searchText: string,
    limit: number = 10,
    category?: string,
    country?: string
): Promise<Destination[]> => {
    const client = await pool.connect();
    
    try {
        let query = `
            SELECT 
                id,
                name,
                description,
                location,
                country,
                category,
                rating,
                price_range,
                ts_rank_cd(to_tsvector('english', name || ' ' || COALESCE(description, '')), plainto_tsquery('english', $1)) AS text_score
            FROM search_destinations
            WHERE to_tsvector('english', name || ' ' || COALESCE(description, '')) @@ plainto_tsquery('english', $1)
        `;
        
        const params: any[] = [searchText];
        let paramCount = 1;
        
        if (category) {
            paramCount++;
            query += ` AND category = $${paramCount}`;
            params.push(category);
        }
        
        if (country) {
            paramCount++;
            query += ` AND country = $${paramCount}`;
            params.push(country);
        }
        
        query += ` ORDER BY text_score DESC LIMIT $${paramCount + 1}`;
        params.push(limit);
        
        const result = await client.query(query, params);
        return result.rows;
    } catch (error) {
        console.error('Error in full-text search:', error);
        throw error;
    } finally {
        client.release();
    }
};

// Hybrid search combining vector and text search
export const searchDestinationsHybrid = async (
    searchText: string,
    embedding: number[],
    limit: number = 10,
    vectorWeight: number = 0.6,
    textWeight: number = 0.4
): Promise<Destination[]> => {
    const client = await pool.connect();
    
    try {
        const query = `
            SELECT 
                id,
                name,
                description,
                location,
                country,
                category,
                rating,
                price_range,
                (
                    $4 * (1 - (embedding <=> $2::vector)) + 
                    $5 * ts_rank_cd(to_tsvector('english', name || ' ' || COALESCE(description, '')), plainto_tsquery('english', $1))
                ) AS hybrid_score
            FROM search_destinations
            WHERE 
                to_tsvector('english', name || ' ' || COALESCE(description, '')) @@ plainto_tsquery('english', $1)
                OR (1 - (embedding <=> $2::vector)) > 0.5
            ORDER BY hybrid_score DESC
            LIMIT $3
        `;
        
        const result = await client.query(query, [
            searchText,
            pgvector.toSql(embedding),
            limit,
            vectorWeight,
            textWeight
        ]);
        
        return result.rows;
    } catch (error) {
        console.error('Error in hybrid search:', error);
        throw error;
    } finally {
        client.release();
    }
};

// Add destination to search index
export const addDestinationToIndex = async (destination: Omit<Destination, 'id' | 'similarity_score'>) => {
    const client = await pool.connect();
    
    try {
        const query = `
            INSERT INTO search_destinations (name, description, location, country, category, rating, price_range, embedding)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id
        `;
        
        const result = await client.query(query, [
            destination.name,
            destination.description,
            destination.location,
            destination.country,
            destination.category,
            destination.rating,
            destination.price_range,
            destination.embedding ? pgvector.toSql(destination.embedding) : null
        ]);
        
        return result.rows[0].id;
    } catch (error) {
        console.error('Error adding destination to index:', error);
        throw error;
    } finally {
        client.release();
    }
};

// Update destination embedding
export const updateDestinationEmbedding = async (id: string, embedding: number[]) => {
    const client = await pool.connect();
    
    try {
        const query = `
            UPDATE search_destinations 
            SET embedding = $2, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
        `;
        
        await client.query(query, [id, pgvector.toSql(embedding)]);
    } catch (error) {
        console.error('Error updating destination embedding:', error);
        throw error;
    } finally {
        client.release();
    }
};

// Get destinations by category
export const getDestinationsByCategory = async (category: string, limit: number = 20): Promise<Destination[]> => {
    const client = await pool.connect();
    
    try {
        const query = `
            SELECT id, name, description, location, country, category, rating, price_range
            FROM search_destinations
            WHERE category = $1
            ORDER BY rating DESC NULLS LAST, name
            LIMIT $2
        `;
        
        const result = await client.query(query, [category, limit]);
        return result.rows;
    } catch (error) {
        console.error('Error getting destinations by category:', error);
        throw error;
    } finally {
        client.release();
    }
};

// Close pool connection
export const closeSearchPool = async () => {
    await pool.end();
};

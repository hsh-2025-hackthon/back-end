-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Create a function to check if pgvector is available
CREATE OR REPLACE FUNCTION check_pgvector_available()
RETURNS boolean AS $$
BEGIN
    -- Try to create a test vector column
    BEGIN
        EXECUTE 'CREATE TEMP TABLE test_vector_table (test_embedding vector(1))';
        DROP TABLE test_vector_table;
        RETURN TRUE;
    EXCEPTION
        WHEN OTHERS THEN
            RETURN FALSE;
    END;
END;
$$ LANGUAGE plpgsql;
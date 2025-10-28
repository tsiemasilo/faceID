import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.NETLIFY_DATABASE_URL,
  ssl: {
    rejectUnauthorized: true
  }
});

async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS face_users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        descriptor JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_face_users_name ON face_users(name)
    `);
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

initializeDatabase();

export async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const path = event.path.replace('/.netlify/functions/api', '');

  try {
    if (path === '/health' && event.httpMethod === 'GET') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ status: 'ok', message: 'Face ID API is running' })
      };
    }

    if (path === '/users' && event.httpMethod === 'GET') {
      const result = await pool.query('SELECT name, descriptor FROM face_users ORDER BY created_at ASC');
      const users = result.rows.map(row => ({
        name: row.name,
        descriptor: row.descriptor
      }));
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(users)
      };
    }

    if (path === '/users' && event.httpMethod === 'POST') {
      const { name, descriptor } = JSON.parse(event.body);
      
      if (!name || !descriptor) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Name and descriptor are required' })
        };
      }

      const existingUser = await pool.query('SELECT id FROM face_users WHERE name = $1', [name]);
      
      if (existingUser.rows.length > 0) {
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({ error: 'User with this name already exists' })
        };
      }

      const result = await pool.query(
        'INSERT INTO face_users (name, descriptor) VALUES ($1, $2) RETURNING id, name, descriptor',
        [name, JSON.stringify(descriptor)]
      );

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({
          name: result.rows[0].name,
          descriptor: result.rows[0].descriptor
        })
      };
    }

    if (path === '/users' && event.httpMethod === 'DELETE') {
      const { password } = JSON.parse(event.body);
      
      const CLEAR_PASSWORD = process.env.CLEAR_USERS_PASSWORD;
      
      if (!CLEAR_PASSWORD || password !== CLEAR_PASSWORD) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Invalid password' })
        };
      }

      await pool.query('DELETE FROM face_users');
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: 'All users cleared successfully' })
      };
    }

    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: 'Not found' })
    };
  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error', details: error.message })
    };
  }
}

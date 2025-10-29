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
    
    const result = await pool.query(`
      SELECT COUNT(*) as count FROM face_users 
      WHERE jsonb_typeof(descriptor) != 'array'
    `);
    
    if (parseInt(result.rows[0].count) > 0) {
      console.log('Migrating single descriptors to arrays...');
      await pool.query(`
        UPDATE face_users 
        SET descriptor = jsonb_build_array(descriptor),
            updated_at = CURRENT_TIMESTAMP
        WHERE jsonb_typeof(descriptor) != 'array'
      `);
      console.log('Migration completed');
    }
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

  const path = event.path.replace('/.netlify/functions/api', '').replace('/api', '');

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

    if (path === '/admin/users' && event.httpMethod === 'POST') {
      const { password } = JSON.parse(event.body);
      
      const ADMIN_PASSWORD = process.env.CLEAR_USERS_PASSWORD;
      
      if (!ADMIN_PASSWORD || password !== ADMIN_PASSWORD) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Invalid password' })
        };
      }

      const result = await pool.query(`
        SELECT 
          name, 
          created_at,
          jsonb_array_length(descriptor) as sample_count
        FROM face_users 
        ORDER BY created_at DESC
      `);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(result.rows)
      };
    }

    if (path.startsWith('/users/') && event.httpMethod === 'PUT') {
      const name = decodeURIComponent(path.replace('/users/', ''));
      const { descriptor } = JSON.parse(event.body);
      
      if (!descriptor) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Descriptor is required' })
        };
      }

      const MAX_DESCRIPTORS = 25;
      
      const userResult = await pool.query(
        'SELECT descriptor FROM face_users WHERE name = $1',
        [name]
      );
      
      if (userResult.rows.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'User not found' })
        };
      }
      
      let descriptors = userResult.rows[0].descriptor;
      
      if (!Array.isArray(descriptors)) {
        descriptors = [descriptors];
      }
      
      descriptors.push(descriptor);
      
      if (descriptors.length > MAX_DESCRIPTORS) {
        descriptors = descriptors.slice(-MAX_DESCRIPTORS);
      }
      
      await pool.query(
        'UPDATE face_users SET descriptor = $1, updated_at = CURRENT_TIMESTAMP WHERE name = $2',
        [JSON.stringify(descriptors), name]
      );
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: 'User updated successfully', descriptorCount: descriptors.length })
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

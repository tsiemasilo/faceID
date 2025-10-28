import express from 'express';
import pg from 'pg';
import cors from 'cors';

const { Pool } = pg;
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const pool = new Pool({
  connectionString: process.env.NETLIFY_DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: true
  } : {
    rejectUnauthorized: false
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
      console.log('🔄 Migrating single descriptors to arrays...');
      await pool.query(`
        UPDATE face_users 
        SET descriptor = jsonb_build_array(descriptor),
            updated_at = CURRENT_TIMESTAMP
        WHERE jsonb_typeof(descriptor) != 'array'
      `);
      console.log('✅ Migration completed');
    }
    
    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  }
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Face ID API is running' });
});

app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT name, descriptor FROM face_users ORDER BY created_at ASC');
    const users = result.rows.map(row => ({
      name: row.name,
      descriptor: row.descriptor
    }));
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.post('/api/admin/users', async (req, res) => {
  try {
    const { password } = req.body;
    
    const ADMIN_PASSWORD = process.env.CLEAR_USERS_PASSWORD;
    
    if (!ADMIN_PASSWORD) {
      return res.status(500).json({ error: 'Server configuration error' });
    }
    
    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const result = await pool.query(`
      SELECT 
        name, 
        created_at,
        jsonb_array_length(descriptor) as sample_count
      FROM face_users 
      ORDER BY created_at DESC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching admin users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { name, descriptor } = req.body;
    
    if (!name || !descriptor) {
      return res.status(400).json({ error: 'Name and descriptor are required' });
    }

    const existingUser = await pool.query('SELECT id FROM face_users WHERE name = $1', [name]);
    
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'User with this name already exists' });
    }

    const result = await pool.query(
      'INSERT INTO face_users (name, descriptor) VALUES ($1, $2) RETURNING id, name, descriptor',
      [name, JSON.stringify(descriptor)]
    );

    res.status(201).json({
      name: result.rows[0].name,
      descriptor: result.rows[0].descriptor
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.put('/api/users/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const { descriptor } = req.body;
    
    if (!descriptor) {
      return res.status(400).json({ error: 'Descriptor is required' });
    }

    const MAX_DESCRIPTORS = 25;
    
    const userResult = await pool.query(
      'SELECT descriptor FROM face_users WHERE name = $1',
      [name]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
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
    
    res.json({ message: 'User updated successfully', descriptorCount: descriptors.length });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.delete('/api/users', async (req, res) => {
  try {
    const { password } = req.body;
    
    const CLEAR_PASSWORD = process.env.CLEAR_USERS_PASSWORD;
    
    if (!CLEAR_PASSWORD) {
      console.error('CLEAR_USERS_PASSWORD environment variable is not set');
      return res.status(500).json({ error: 'Server configuration error' });
    }
    
    if (password !== CLEAR_PASSWORD) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    await pool.query('DELETE FROM face_users');
    res.json({ message: 'All users cleared successfully' });
  } catch (error) {
    console.error('Error clearing users:', error);
    res.status(500).json({ error: 'Failed to clear users' });
  }
});

pool.connect()
  .then(() => {
    console.log('✅ Connected to PostgreSQL database');
    return initializeDatabase();
  })
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  });

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  pool.end(() => {
    console.log('Database pool closed');
    process.exit(0);
  });
});

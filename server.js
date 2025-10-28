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
  ssl: {
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

app.delete('/api/users', async (req, res) => {
  try {
    const { password } = req.body;
    
    const CLEAR_PASSWORD = '0852Tsie';
    
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

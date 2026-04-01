const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Pool } = require('pg');

const app = express();

app.use(cors());
app.use(bodyParser.json());

// ✅ PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// ✅ Create tables (runs on startup)
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bills (
        id SERIAL PRIMARY KEY,
        client_id INTEGER,
        clientName TEXT,
        total NUMERIC,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS bill_items (
        id SERIAL PRIMARY KEY,
        bill_id INTEGER REFERENCES bills(id),
        service_name TEXT,
        staff TEXT,
        price NUMERIC,
        discount NUMERIC,
        final_price NUMERIC
      )
    `);

    console.log("✅ Tables ready");
  } catch (err) {
    console.error("❌ DB Init Error:", err);
  }
}

initDB();

// ✅ Health check
app.get('/', (req, res) => {
  res.send("Backend is running");
});

// 🚀 POST BILL
app.post('/api/bills', async (req, res) => {
  try {
    const { client_id, clientName, items, total } = req.body;

    const billResult = await pool.query(
      `INSERT INTO bills (client_id, clientName, total)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [client_id || null, clientName, total]
    );

    const billId = billResult.rows[0].id;

    for (const item of items) {
      await pool.query(
        `INSERT INTO bill_items 
         (bill_id, service_name, staff, price, discount, final_price)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          billId,
          item.service_name,
          item.staff,
          item.price,
          item.discount,
          item.final_price
        ]
      );
    }

    res.json({ success: true, billId });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 🚀 GET BILLS
app.get('/api/bills', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        b.id,
        b.clientName,
        b.total,
        b.date,
        b.client_id,
        COALESCE(STRING_AGG(bi.service_name, ', '), '') AS services,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'service_name', bi.service_name,
              'staff', bi.staff,
              'price', bi.price,
              'discount', bi.discount,
              'final_price', bi.final_price
            )
          ) FILTER (WHERE bi.id IS NOT NULL),
          '[]'
        ) AS items
      FROM bills b
      LEFT JOIN bill_items bi ON b.id = bi.bill_id
      GROUP BY b.id
      ORDER BY b.date DESC
    `);

    res.json(result.rows);

  } catch (err) {
    console.error("🔥 ERROR:", err.message);
    res.status(500).json({
      error: err.message || "No message",
      stack: err.stack || "No stack"
    });
  }
}); // <--- Added missing closing parenthesis here

// ✅ PORT FIX (MANDATORY FOR RENDER)
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

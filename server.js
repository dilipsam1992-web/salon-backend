const express = require('express');
//const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const { Pool } = require('pg');
app.use(cors());
app.use(bodyParser.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

//const db = new sqlite3.Database('./salon.db');

// Create tables
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clientName TEXT,
      date TEXT,
      total REAL,
      payment TEXT,
      status TEXT
    )
  `);
  db.run(`
  CREATE TABLE IF NOT EXISTS bill_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_id INTEGER,
    item_name TEXT,
    type TEXT,
    staff TEXT,
    price REAL,
    discount REAL,
    net REAL
  )
`);
});

app.get('/', (req, res) => {
  res.send("Backend is running");
});

app.listen(3002, () => {
  console.log("Server running on http://localhost:3002");
});
app.post('/api/bills', async (req, res) => {
  try {
    const { client_id, clientName, items, total } = req.body;

    // 1. Insert into bills
    const billResult = await pool.query(
      `INSERT INTO bills (client_id, clientName, total)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [client_id || null, clientName, total]
    );

    const billId = billResult.rows[0].id;

    // 2. Insert bill items
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
app.get('/api/bills', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        b.id,
        b.clientname,
        b.total,
        b.date,
        b.client_id,
        STRING_AGG(bi.service_name, ', ') AS services,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'service_name', bi.service_name,
            'staff', bi.staff,
            'price', bi.price,
            'discount', bi.discount,
            'final_price', bi.final_price
          )
        ) AS items
      FROM bills b
      LEFT JOIN bill_items bi ON b.id = bi.bill_id
      GROUP BY b.id
      ORDER BY b.date DESC
    `);

    res.json(result.rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
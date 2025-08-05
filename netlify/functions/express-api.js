const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');

const app = express();
const router = express.Router();

app.use(express.json());
app.use(cors());

// Simple test route
router.post('/create-preference', (req, res) => {
  console.log('[Express Function] Test route hit!');
  res.status(200).json({ success: true, message: 'Test preference created successfully!' });
});

app.use('/', router);

module.exports.handler = serverless(app);

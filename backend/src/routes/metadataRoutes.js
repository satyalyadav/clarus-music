const router = require('express').Router();
const auth = require('../middleware/auth');
const { searchMetadata } = require('../controllers/metadataController');

// All metadata routes require authentication
router.use(auth);

router.get('/search', searchMetadata);

module.exports = router;


const express = require('express');
const router = express.Router();
const {
  createNews, getAllNews, getAdminAllNews, getSingleNews,
  publishNews, updateNews, deleteNews,
} = require('../controllers/newsController');
const { protect, authorize } = require('../middleware/auth');
const { upload } = require('../config/cloudinary');

// Public
router.get('/', getAllNews);
router.get('/:id', getSingleNews);

// Admin / Gov / NGO can create news
router.post('/', protect, authorize('admin', 'government', 'ngo'), upload.single('featuredImage'), createNews);
router.get('/admin/all', protect, authorize('admin', 'government', 'ngo'), getAdminAllNews);
router.put('/:id/publish', protect, authorize('admin'), publishNews);
router.put('/:id', protect, authorize('admin', 'government', 'ngo'), upload.single('featuredImage'), updateNews);
router.delete('/:id', protect, authorize('admin'), deleteNews);

module.exports = router;

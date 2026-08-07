const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const imageStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'zda/images',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 1200, height: 900, crop: 'limit' }],
  },
});

const videoStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'zda/videos',
    allowed_formats: ['mp4', 'mov', 'avi', 'webm'],
    resource_type: 'video',
    transformation: [{ width: 1280, height: 720, crop: 'limit', quality: 'auto' }],
  },
});

const imageUpload = multer({
  storage: imageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'), false);
  },
});

const videoUpload = multer({
  storage: videoStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('Only video files are allowed'), false);
  },
});

const upload = multer({
  storage: new CloudinaryStorage({
    cloudinary,
    params: (req, file) => {
      const isVideo = file.mimetype.startsWith('video/');
      return {
        folder: isVideo ? 'zda/videos' : 'zda/images',
        resource_type: isVideo ? 'video' : 'image',
        allowed_formats: isVideo
          ? ['mp4', 'mov', 'avi', 'webm']
          : ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        transformation: isVideo
          ? [{ width: 1280, height: 720, crop: 'limit', quality: 'auto' }]
          : [{ width: 1200, height: 900, crop: 'limit' }],
      };
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('Only image and video files are allowed'), false);
  },
});

// Governance complaint evidence: photos, PDFs, audio, and video. Images/videos
// go to their usual folders; PDFs + audio are stored as raw resources so they
// stay downloadable as-is.
const governanceStorage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => {
    const mime = file.mimetype || '';
    if (mime.startsWith('video/')) {
      return {
        folder: 'zda/governance',
        resource_type: 'video',
        allowed_formats: ['mp4', 'mov', 'avi', 'webm'],
        transformation: [{ width: 1280, height: 720, crop: 'limit', quality: 'auto' }],
      };
    }
    if (mime === 'application/pdf' || mime.startsWith('audio/')) {
      return { folder: 'zda/governance', resource_type: 'raw', allowed_formats: ['pdf', 'mp3', 'wav', 'm4a', 'ogg'] };
    }
    return {
      folder: 'zda/governance',
      resource_type: 'image',
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      transformation: [{ width: 1200, height: 900, crop: 'limit' }],
    };
  },
});

const governanceUpload = multer({
  storage: governanceStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const mime = file.mimetype || '';
    const ok =
      mime.startsWith('image/') ||
      mime.startsWith('video/') ||
      mime.startsWith('audio/') ||
      mime === 'application/pdf';
    if (ok) cb(null, true);
    else cb(new Error('Only image, PDF, audio and video files are allowed'), false);
  },
});

// Public alert attachments: images (jpg/jpeg/png) and PDFs, up to 3 files of
// 5MB each. PDFs are stored as raw resources so they stay downloadable as-is.
const alertStorage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => {
    const mime = file.mimetype || '';
    if (mime === 'application/pdf') {
      return { folder: 'zda/alerts', resource_type: 'raw', allowed_formats: ['pdf'] };
    }
    return {
      folder: 'zda/alerts',
      resource_type: 'image',
      allowed_formats: ['jpg', 'jpeg', 'png'],
      transformation: [{ width: 1600, crop: 'limit', quality: 'auto' }],
    };
  },
});

const alertUpload = multer({
  storage: alertStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const mime = file.mimetype || '';
    const ok = mime === 'application/pdf' || mime.startsWith('image/');
    if (ok) cb(null, true);
    else cb(new Error('Only PDF and image (jpg/jpeg/png) files are allowed'), false);
  },
});

module.exports = { cloudinary, upload, imageUpload, videoUpload, governanceUpload, alertUpload };

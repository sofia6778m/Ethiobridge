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

module.exports = { cloudinary, upload, imageUpload, videoUpload };

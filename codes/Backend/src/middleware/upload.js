const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

// Ensure upload directory exists
const ensureUploadDir = async (dir) => {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
};

// Generate unique filename
const generateUniqueFilename = (originalname) => {
  const ext = path.extname(originalname);
  const name = path.basename(originalname, ext);
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString('hex');
  return `${name}_${timestamp}_${random}${ext}`;
};

// File filter function
const fileFilter = (allowedTypes) => {
  return (req, file, cb) => {
    if (allowedTypes.includes('*')) {
      cb(null, true);
      return;
    }

    const ext = path.extname(file.originalname).toLowerCase().substring(1);
    
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type .${ext} is not allowed. Allowed types: ${allowedTypes.join(', ')}`), false);
    }
  };
};

// Storage configuration
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_DIR || './src/uploads';
    const patientDir = path.join(uploadDir, 'patients');
    
    // Create patient-specific directory if patient_id is available
    if (req.params.patientId) {
      const patientSpecificDir = path.join(patientDir, req.params.patientId);
      await ensureUploadDir(patientSpecificDir);
      cb(null, patientSpecificDir);
    } else {
      await ensureUploadDir(patientDir);
      cb(null, patientDir);
    }
  },
  filename: (req, file, cb) => {
    const uniqueName = generateUniqueFilename(file.originalname);
    cb(null, uniqueName);
  }
});

// Parse allowed file types from environment
const getAllowedFileTypes = () => {
  const envTypes = process.env.ALLOWED_FILE_TYPES || '*';
  return envTypes.split(',').map(type => type.trim().toLowerCase());
};

// Get max file size from environment
const getMaxFileSize = () => {
  return parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024; // 10MB default
};

// Multer limit includes multipart overhead; keep a small buffer so exact-size files pass.
const getMulterFileSizeLimit = () => {
  const overheadBuffer = 2 * 1024 * 1024; // 2MB multipart boundary/header buffer
  return getMaxFileSize() + overheadBuffer;
};

// Base upload middleware
const upload = multer({
  storage,
  fileFilter: fileFilter(getAllowedFileTypes()),
  limits: {
    fileSize: getMulterFileSizeLimit(),
    files: 5 // Maximum 5 files per request
  }
});

// Single file upload middleware
const uploadSingle = (fieldName) => {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'File size too large'
          });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            success: false,
            message: 'Too many files uploaded'
          });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({
            success: false,
            message: 'Unexpected file field'
          });
        }
        return res.status(400).json({
          success: false,
          message: 'File upload error'
        });
      }
      
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      
      next();
    });
  };
};

// Multiple files upload middleware
const uploadMultiple = (fieldName, maxCount = 5) => {
  return (req, res, next) => {
    upload.array(fieldName, maxCount)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'File size too large'
          });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            success: false,
            message: `Too many files. Maximum ${maxCount} files allowed`
          });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({
            success: false,
            message: 'Unexpected file field'
          });
        }
        return res.status(400).json({
          success: false,
          message: 'File upload error'
        });
      }
      
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      
      next();
    });
  };
};

// File validation middleware
const validateFile = (req, res, next) => {
  if (!req.file && !req.files) {
    return res.status(400).json({
      success: false,
      message: 'No file uploaded'
    });
  }
  
  const files = req.files || [req.file];
  const maxFileSize = getMaxFileSize();
  for (const file of files) {
    if (!file || !file.originalname) {
      return res.status(400).json({
        success: false,
        message: 'Invalid uploaded file'
      });
    }
    if (file.size > maxFileSize) {
      return res.status(400).json({
        success: false,
        message: `File size too large. Maximum allowed is ${Math.floor(maxFileSize / (1024 * 1024))} MB`
      });
    }
  }

  next();
};

// Clean up uploaded files on error
const cleanupFiles = async (files) => {
  for (const file of files) {
    try {
      await fs.unlink(file.path);
    } catch (error) {
      console.error('Failed to cleanup file:', file.path, error);
    }
  }
};

// Helper function to get file info
const getFileInfo = (file) => {
  return {
    originalname: file.originalname,
    filename: file.filename,
    path: file.path,
    size: file.size,
    mimetype: file.mimetype,
    uploadDate: new Date()
  };
};

module.exports = {
  uploadSingle,
  uploadMultiple,
  validateFile,
  cleanupFiles,
  getFileInfo,
  ensureUploadDir,
  generateUniqueFilename
};
